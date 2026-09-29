"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, Ear, Loader2, Mic, MicOff, Subtitles, Volume2, X } from "lucide-react";
import { useKiPane } from "@/components/ki/ki-pane-kontext";
import { useScrollSperre } from "@/components/ui/scroll-sperre";
import { SprachHimbi, type SprachZustand } from "@/components/ki/sprach-himbi";
import { RAHMEN_ABSTAND, SprachSpotlight, useHervorhebungsRechteck } from "@/components/ki/sprach-spotlight";
import { loeseSprechZiel, ueberschriftImSatz, zeigeSprechStelle } from "@/components/ki/sprach-mitlesen";
import {
  abonniereSprachBus,
  chatStandServer,
  entscheideFreigabe,
  entsperreTon,
  freigabeAnfrageServer,
  leseChatStand,
  leseFreigabeAnfrage,
  leseGerade,
  stelleSprachFrage,
  unterbrichChat,
} from "@/components/ki/sprachmodus-bus";
import { leseAusgabePegel } from "@/lib/ausgabe-pegel";
import { leseLautstaerke, starteHoeren, stoppeHoeren } from "@/lib/hoeren";
import {
  antwortFertig,
  assistentIstDran,
  ausweichPlatz,
  befehlGeprueftBis,
  befehlOhneEcho,
  befehlsBeginn,
  befehlsWortIn,
  beginntMitBefehl,
  EINSATZ_VORLAUF_MS,
  UNTERTITEL_SCHLUESSEL,
  untertitelAusSpeicher,
  erzeugeEinsatzMerker,
  erzeugeUnterbrechungsWaechter,
  frageNachUnterbrechung,
  freigabeAntwortMitEcho,
  fuegeZusammen,
  istBeendenBefehl,
  istGesprochen,
  istNachsatz,
  istNurAnhalten,
  meldungNachEreignis,
  nachSitzungsAbbruch,
  naechstePhase,
  NEUVERSUCH_MS,
  ohrOffen,
  RUHE_VOR_ZUHOEREN_MS,
  STILLE_BIS_STUMM_MS,
  tagesbeginnAktion,
  type Ereignis,
  type Phase,
  type SprachMeldung,
  type UnterbrechungsArt,
} from "@/lib/domain/sprachmodus";
import { AUFNAHME_STUECK_MS, AUFNAHME_VORGABEN } from "@/lib/domain/diktat";
import { tageszeitBestimmen } from "@/lib/domain/tageszeit";
import { merkeTagesbeginn, tagesbeginnFaellig } from "@/lib/himbi-tagesbeginn";
import { browserAblage } from "@/lib/suche/zuletzt";
import { useHaustierStatus } from "@/components/haustier/haustier-kontext";
import type { TextAb } from "@/lib/domain/diktat-live";
import { Markdown } from "@/components/ki/ki-chat";
import { starteLiveSitzung, type LiveSitzung } from "@/components/ki/diktat-live";
import { cn } from "@/lib/utils";

// Der Sprachmodus: ein Live-Gespraech mit Himbi ohne sichtbaren Chat.
//
// Vollflaechiges Overlay ueber der Seite (dieselbe Grundidee wie die "Buehne"
// des Panels, ki-pane.css: unscharfer Hintergrund, .ki-buehne-*), in der Mitte
// Himbi (sprach-himbi.tsx; bis zum 25.09.2026 eine Kugel). Solange nichts
// hervorgehoben ist und Himbi zuhoert, steht er dort. Denkt oder spricht er oder
// springt der Assistent zu einem Bereich (oeffneBereich/zeigeAuf, ueber
// ki-pane-kontext.tsx und components/ki/hervorhebung.ts gemeldet), rueckt er
// klein nach links ueber die Navigationsleiste und das Ziel bekommt einen Rahmen
// (sprach-spotlight.tsx) - er zeigt weiter den Zustand des Gespraechs, verdeckt
// aber nicht, wovon er spricht.
//
// Die Frage geht ueber sprachmodus-bus.ts an den ganz normalen Chat im
// Seitenpanel (der bleibt dabei UNSICHTBAR, aber gemountet und aktiv - er
// fuehrt Werkzeuge aus, navigiert, speichert den Verlauf). Nach dem Gespraech
// steht alles dort zum Nachlesen, es gibt keinen zweiten, eigenen Weg.
export function Sprachmodus() {
  const { sprachmodus } = useKiPane();
  if (!sprachmodus) return null;
  return <SprachmodusInhalt />;
}

/** So lange muss ein vorlaeufig erkanntes Befehlswort ("Stopp") stehen bleiben, bevor es
 *  Himbi anhaelt (kurz genug, um sofort zu wirken, lang genug, dass ein vorlaeufiges Wort,
 *  das die Erkennung gleich korrigiert, nichts ausloest). Bis zum 28.09.2026 galt das fuer
 *  einen eigenen Stoppwort-Waechter, heute fuer die Befehlssuche im durchgehenden Ohr. */
const STOPP_STABIL_MS = 350;
/** So weit vor Himbis Verstummen wird noch nach einem Befehlswort gesucht. */
const BEFEHL_RUECKBLICK_MS = 3_000;
/** Spielraum zwischen dem Erscheinen einer Freigabekarte und dem Zeitstempel der Erkennung
 *  (Uhr des Browsers und Audiozeit von Soniox laufen um einige Dutzend ms versetzt). */
const FREIGABE_VORLAUF_MS = 200;

/** Ein Symbol je Zustand, neben dem Zustandstext - der Ton haengt nie an
 *  der Farbe des Scheins hinter Himbi allein (Rueckmeldung vom 25.09.2026: die vier Farben
 *  liessen sich nicht sicher als "hoert zu / denkt nach / spricht / Fehler"
 *  lesen). "denkt" dreht sich (Loader2), das macht "arbeitet gerade" auch
 *  ohne jedes Lesen der Beschriftung sofort klar. */
const STATUS_SYMBOL: Record<SprachZustand, typeof Ear> = {
  hoert: Ear,
  denkt: Loader2,
  spricht: Volume2,
  pausiert: MicOff,
  fehler: AlertTriangle,
};

function leseUntertitelWunsch(): boolean {
  try {
    return untertitelAusSpeicher(window.localStorage.getItem(UNTERTITEL_SCHLUESSEL));
  } catch {
    return false;
  }
}

/** Handy-Breite wie in sprachmodus.css (unter md, wo es keine Navigationsleiste zum
 *  Andocken gibt). */
const HANDY = "(max-width: 767.98px)";
function abonniereHandy(bescheid: () => void): () => void {
  const m = window.matchMedia(HANDY);
  m.addEventListener("change", bescheid);
  return () => m.removeEventListener("change", bescheid);
}
const leseHandy = () => window.matchMedia(HANDY).matches;

/** Wie das Mikrofon im Gespraech geoeffnet wird: wie beim Diktat, aber MIT
 *  Echounterdrueckung. Beim Diktat verstummt jede Wiedergabe, solange das
 *  Mikrofon offen ist; hier spricht Himbi, waehrend das Mikrofon offen bleibt
 *  (Dazwischenreden, siehe erzeugeUnterbrechungsWaechter). Ohne Filter hoerte
 *  das Mikrofon die Stimme aus dem Lautsprecher mit. */
const GESPRAECH_AUFNAHME: MediaTrackConstraints = { ...AUFNAHME_VORGABEN, echoCancellation: true };

/** Das Ohr: EINE Aufnahme und EINE Live-Sitzung fuer das ganze Gespraech (seit dem
 *  28.09.2026, siehe ohrOffen in domain/sprachmodus.ts). startPerf ist der Nullpunkt der
 *  Zeitangaben, die Soniox je Wort liefert (ms ab dem ersten Audiostueck). */
type Ohr = { recorder: MediaRecorder; sitzung: LiveSitzung; startPerf: number };

function SprachmodusInhalt() {
  const t = useTranslations("kiAssistentAnsicht.sprachmodus");
  const tAktion = useTranslations("aktionen");
  const sprache = useLocale();
  const { beendeSprachmodus, nutzerId } = useKiPane();
  const { tagesbeginnAn } = useHaustierStatus();

  const [phase, setPhase] = useState<Phase>("startet");
  const [zwischentext, setZwischentext] = useState("");
  // Wie lange eine Meldung steht, entscheidet meldungNachEreignis (domain/sprachmodus.ts) bei
  // jedem Ereignis des Ablaufs, siehe dispatch. Der Ref haelt sie sofort (wie phaseRef), damit
  // dispatch nur dann neu setzt, wenn sich etwas aendert.
  const [meldung, setMeldung] = useState<SprachMeldung | null>(null);
  const meldungRef = useRef<SprachMeldung | null>(null);
  const zeigeMeldung = useCallback((m: SprachMeldung | null) => {
    meldungRef.current = m;
    setMeldung(m);
  }, []);
  // Mitlaufender Text: standardmaessig aus, die Wahl merkt sich der Browser
  // (domain/sprachmodus.ts, untertitelAusSpeicher). Der Sprachmodus wird nur im Browser
  // eingehaengt, der Speicher ist beim ersten Rendern also lesbar.
  const [untertitelAn, setUntertitelAn] = useState(leseUntertitelWunsch);
  const schalteUntertitel = () => {
    const neu = !untertitelAn;
    setUntertitelAn(neu);
    try {
      window.localStorage.setItem(UNTERTITEL_SCHLUESSEL, neu ? "an" : "aus");
    } catch {
      // Speicher gesperrt: gilt dann nur fuer diese Sitzung.
    }
  };

  const ohrRef = useRef<Ohr | null>(null);
  const stromRef = useRef<MediaStream | null>(null);
  const ruheTimer = useRef<number | undefined>(undefined);
  const neuTimer = useRef<number | undefined>(undefined);
  const kandidatTimer = useRef<number | undefined>(undefined);
  const fehlversuche = useRef(0);
  // Grenzen im Audio (ms ab startPerf). Vor grenzeMs liegt sicher nichts fuer die naechste
  // Frage (eine fruehere Frage, ein erledigter Befehl). Bis echoBisMs war vermutlich Himbis
  // eigene Stimme - gesetzt, wenn er verstummt oder sein Echo endet. Die Frage beginnt hinter
  // beiden; Befehle werden aber auch kurz vor echoBisMs gesucht: wer "Stopp, zeig mir ..." genau
  // in eine Sprechpause von Himbi sagt (Seitenwechsel), hat vor dem Verstummen angefangen
  // (Messung vom 28.09.2026: aus der Frage wurde "mir lieber die Reklamationen").
  const grenzeMs = useRef(0);
  const echoBisMs = useRef(0);
  // Waehrend Himbi spricht: bis hierher (Audio-ms) ist die Befehlssuche gegen den damals
  // klingenden Satz abgeschlossen (befehlGeprueftBis). Spaeter gegen einen anderen Satz geprueft,
  // galt Himbis eigenes "Nein," sonst als Befehl (Befund der Gegenpruefung vom 28.09.2026).
  const befehlGeprueftMs = useRef(0);
  const frageAb = useCallback(() => Math.max(grenzeMs.current, echoBisMs.current), []);
  const befehlAb = useCallback(
    () => Math.max(grenzeMs.current, echoBisMs.current - BEFEHL_RUECKBLICK_MS, befehlGeprueftMs.current),
    [],
  );
  // Die zuletzt gestellte Frage - kommt waehrend des Nachdenkens noch etwas nach, wird
  // daraus EINE Frage (Nachsatz, Rueckmeldung vom 28.09.2026: "nach Ja hoert sie auf
  // zuzuhoeren und schaut nach").
  const offeneFrage = useRef<{ text: string; sprachen: string[] } | null>(null);
  const vorsatz = useRef<{ text: string; sprachen: string[] } | null>(null);
  // Nach einem Unterbrechen per Wort oder Stimme kann die naechste Aeusserung mit dem Befehl
  // beginnen ("Stopp, zeig mir lieber ..."); er wird dort abgeschnitten (frageNachUnterbrechung),
  // davor nur ein Rest von Himbis Echo. Nach einem Tipp nicht (beginntMitBefehl).
  const nachUnterbrechung = useRef(false);
  // Was Himbi beim Unterbrechen sagte (klingender und voriger Satz): nur diese Woerter duerfen
  // vor dem Befehl stehen.
  const echoBeimUnterbrechen = useRef("");
  // Der Satz, den Himbi sprach, als er unterbrochen wurde - geht mit der naechsten Frage
  // ans Modell, damit es weiss, was angekommen ist (Kontext bleibt erhalten).
  const unterbrochenBei = useRef<string | null>(null);
  // Nach einem Unterbrechen per Stimme spricht der Nutzer schon weiter, wenn Himbi verstummt;
  // die Grenze steht dann am Einsatz seiner Stimme und darf bis zur naechsten Frage nicht nach
  // "jetzt" ruecken (auch nicht bei einer zweiten Meldung des Chats), sonst fiele "zeig mir
  // lieber ..." aus der naechsten Frage.
  const grenzeSteht = useRef(false);
  // Seit wann (Audio-ms) die offene Freigabekarte steht, und welche es ist: nur was danach
  // gesagt wurde, zaehlt als Antwort auf genau diese Karte.
  const freigabeAbMs = useRef<number | null>(null);
  const freigabeNr = useRef<number | null>(null);
  const zuletztGehoert = useRef(0);
  const phaseRef = useRef(phase);

  const chatStand = useSyncExternalStore(abonniereSprachBus, leseChatStand, chatStandServer);
  const freigabeAnfrage = useSyncExternalStore(abonniereSprachBus, leseFreigabeAnfrage, freigabeAnfrageServer);

  // Die Phase steht sofort im Ref, nicht erst nach dem naechsten Rendern: die Erkennung
  // meldet Text und Endpunkt oft im selben Durchlauf, und der zweite Aufruf muss schon
  // die Phase sehen, die der erste gesetzt hat.
  const dispatch = useCallback((ereignis: Ereignis) => {
    const bleibt = meldungNachEreignis(meldungRef.current, ereignis);
    if (bleibt !== meldungRef.current) zeigeMeldung(bleibt);
    const neu = naechstePhase(phaseRef.current, ereignis);
    if (neu === phaseRef.current) return;
    phaseRef.current = neu;
    setPhase(neu);
  }, [zeigeMeldung]);

  // --- Mikrofon: einmal geoeffnet, bleibt fuer die ganze Sitzung offen -----------------
  //
  // Anders als beim Diktatknopf (mikrofon.tsx) wird der Mikrofonstrom hier NICHT je
  // Aeusserung neu geoeffnet: staendiges Oeffnen/Schliessen laesst auf iOS die
  // Audiosession zwischen "nur Wiedergabe" und "Aufnahme und Wiedergabe" wechseln, und die
  // erste Antwort nach dem Wiederoeffnen kommt dann stumm ueber den Hoerer statt den
  // Lautsprecher. Die Aufnahme darauf (MediaRecorder) laeuft seit dem 28.09.2026 ebenfalls
  // durchgehend, EINE fuers ganze Gespraech (siehe starteOhr).
  // Ist der Strom schon offen (Neustart nach einem Fehler), fuehrt erneutVersuchen() selbst
  // weiter - hier wird nur geoeffnet, was noch nicht offen ist.
  useEffect(() => {
    if (phase !== "startet" || stromRef.current) return;
    let abgebrochen = false;
    void (async () => {
      try {
        const strom = await navigator.mediaDevices.getUserMedia({ audio: GESPRAECH_AUFNAHME });
        if (abgebrochen) {
          strom.getTracks().forEach((s) => s.stop());
          return;
        }
        stromRef.current = strom;
        // Der Schein hinter Himbi reagiert auf die eigene Stimme (lib/hoeren.ts), und das Dazwischenreden
        // misst dort die Lautstaerke.
        starteHoeren(strom);
        dispatch({ art: "mikrofon-bereit" });
      } catch {
        if (abgebrochen) return;
        zeigeMeldung({ text: t("keinZugriff"), fehlerzustand: true });
        dispatch({ art: "fehler" });
      }
    })();
    return () => {
      abgebrochen = true;
    };
  }, [phase, dispatch, t, zeigeMeldung]);

  // --- Das Ohr: eine Aufnahme, eine Live-Sitzung fuer das ganze Gespraech ------------------
  //
  // Bis zum 28.09.2026 begann jede Aeusserung eine eigene Aufnahme und Verbindung, die am
  // Endpunkt schloss; waehrend Himbi dachte und sprach, lief nur ein Stoppwort-Waechter mit
  // einer zweiten Verbindung. Das kostete vor jeder Frage das Warten auf den Abschluss der
  // Sitzung, und was zwischen zwei Aufnahmen gesagt wurde, ging verloren: aus "Ja." ...
  // "und zeig mir bitte die Lieferungen" wurde "Ja." (Rueckmeldung und Messung vom
  // 28.09.2026). Jetzt hoert EINE Verbindung durchgehend zu, und eine Grenze im Audio
  // (grenzeMs) trennt, was zur naechsten Frage gehoert:
  //   - Zuhoeren: am Endpunkt ist alles ab der Grenze die Frage, sofort - die Woerter vor
  //     dem Endpunkt sind schon endgueltig, auf das Ende der Sitzung wird nicht gewartet.
  //   - Nachdenken: spricht der Nutzer weiter, bricht die Anfrage ab, und seine Worte
  //     werden an die Frage angehaengt (Nachsatz).
  //   - Sprechen: Befehlswoerter ("Stopp", "Moment", "Himbi" ...) unterbrechen, Himbis
  //     eigene Worte (Echo) nicht. Was nach dem Befehl kommt, ist die naechste Frage.
  const audioJetzt = useCallback(() => {
    const ohr = ohrRef.current;
    return ohr ? performance.now() - ohr.startPerf : 0;
  }, []);

  const schliesseOhr = useCallback(() => {
    window.clearTimeout(kandidatTimer.current);
    const ohr = ohrRef.current;
    ohrRef.current = null;
    if (!ohr) return;
    ohr.sitzung.abbrechen();
    try {
      if (ohr.recorder.state !== "inactive") ohr.recorder.stop();
    } catch {
      // schon gestoppt
    }
  }, []);

  // beenden() und starteOhr() stehen weiter unten bzw. brauchen die Rueckrufe, die sie
  // selbst setzen - Ref-Umweg wie zuvor beim Wortbefehl.
  const beendenRef = useRef<() => void>(() => {});
  const starteOhrRef = useRef<() => void>(() => {});

  /** Himbi verstummt, das Gespraech bleibt offen und der Verlauf erhalten. Der Satz, den er
   *  gerade sprach, geht mit der naechsten Frage ans Modell (sprachmodus-bus.ts). */
  const unterbrecheHimbi = useCallback(
    (art: UnterbrechungsArt) => {
      const gerade = leseGerade();
      unterbrochenBei.current = gerade?.satz ?? gerade?.vorher ?? null;
      echoBeimUnterbrechen.current = `${gerade?.satz ?? ""} ${gerade?.vorher ?? ""}`;
      grenzeSteht.current = art !== "tipp";
      // Auch nach dem Lautstaerke-Waechter kann die naechste Aeusserung mit "Stopp" beginnen,
      // nach einem Tipp nicht.
      nachUnterbrechung.current = beginntMitBefehl(art);
      unterbrichChat();
      dispatch({ art: "unterbrechen" });
    },
    [dispatch],
  );

  /** Stellt eine Frage an den Chat (sprachmodus-bus.ts): sie ist ab jetzt die offene Frage
   *  (ein Nachsatz haengt sich an sie), und Himbi denkt. */
  const stelleFrage = useCallback(
    (frage: string, sprachen: string[], optionen: { ersetztLetzte?: boolean; unterbrochen?: string | null } = {}) => {
      offeneFrage.current = { text: frage, sprachen };
      stelleSprachFrage(frage, sprachen, optionen);
      dispatch({ art: "frage-gestellt" });
    },
    [dispatch],
  );

  /** Die Aeusserung ab der Grenze ist zu Ende (Endpunkt): Frage, Befehl oder Freigabe. */
  const nimmAeusserung = useCallback(
    (t: TextAb) => {
      grenzeMs.current = Math.max(grenzeMs.current, (t.endeMs ?? audioJetzt()) + 1);
      grenzeSteht.current = false;
      setZwischentext("");
      let text = t.endgueltig || t.anzeige;
      if (nachUnterbrechung.current) {
        // "Stopp, zeig mir lieber die Reklamationen": das Befehlswort hat schon gewirkt. Bei
        // offener Freigabe bleibt "Nein" eine Absage.
        nachUnterbrechung.current = false;
        const rest = leseFreigabeAnfrage() ? null : frageNachUnterbrechung(t.woerter.map((w) => w.text), echoBeimUnterbrechen.current);
        if (rest !== null) text = rest;
      }
      if (!istGesprochen(text) && !vorsatz.current) return;
      // Ja/Nein zu einer offenen Freigabekarte wertet beiEndpunkt vorher aus, in jeder Phase.
      // Was hier ankommt, ist keine Antwort darauf: eine neue Frage, die die Karte ablehnt.
      if (istBeendenBefehl(text)) {
        beendenRef.current();
        return;
      }
      // "Stopp" beim Zuhoeren: es gibt nichts anzuhalten, und als Frage waere es sinnlos.
      if (istNurAnhalten(text) && !vorsatz.current) return;
      const frage = vorsatz.current ? fuegeZusammen(vorsatz.current.text, text) : text;
      const sprachen = vorsatz.current ? [...vorsatz.current.sprachen, ...t.sprachen] : t.sprachen;
      const ersetzt = vorsatz.current !== null;
      vorsatz.current = null;
      fehlversuche.current = 0;
      stelleFrage(frage, sprachen, { ersetztLetzte: ersetzt, unterbrochen: unterbrochenBei.current });
      unterbrochenBei.current = null;
    },
    [audioJetzt, stelleFrage],
  );

  /** Neuer Text von der Erkennung, in jeder Phase. */
  const beiText = useCallback(
    (sitzung: LiveSitzung) => {
      if (ohrRef.current?.sitzung !== sitzung) return;
      const phase = phaseRef.current;
      const t = sitzung.textAb(frageAb());
      if (t.anzeige) zuletztGehoert.current = performance.now();
      if (phase === "hoert") {
        window.clearTimeout(kandidatTimer.current);
        setZwischentext(vorsatz.current ? fuegeZusammen(vorsatz.current.text, t.anzeige) : t.anzeige);
        return;
      }
      if (phase !== "denkt" && phase !== "spricht") return;
      // Befehle auch kurz vor Himbis Verstummen (befehlAb), der Nachsatz erst dahinter.
      const suche = sitzung.textAb(befehlAb());
      if (!istGesprochen(suche.anzeige)) return;
      // Waehrend Himbi spricht, hoert die Erkennung sein Echo mit: ein Befehlswort zaehlt nur,
      // wenn er es nicht gerade selbst sagt (klingender oder voriger Satz, nicht die ganze
      // Antwort - ein "halt" irgendwo darin sperrte sonst jedes "Halt"). Beim Nachdenken ist er still.
      const gerade = leseGerade();
      const gesagt = phase === "spricht" ? (gerade ? `${gerade.satz ?? ""} ${gerade.vorher ?? ""}` : leseChatStand().antwort) : "";
      const istEcho = (wort: string) => phase === "spricht" && befehlsWortIn(gesagt, wort) !== null;
      const beginn = befehlsBeginn(suche.woerter.map((w) => w.text), istEcho);
      const endgueltigeWoerter = suche.endgueltig.split(/\s+/).filter(Boolean).length;
      // Was jetzt gegen den klingenden Satz geprueft und kein Befehl war, wird spaeter nicht
      // gegen einen anderen Satz noch einmal geprueft (befehlGeprueftBis).
      if (beginn === null && phase === "spricht") {
        befehlGeprueftMs.current = befehlGeprueftBis(suche.woerter, endgueltigeWoerter, befehlGeprueftMs.current);
      }
      // Beim Nachdenken zaehlt ein Befehl nur am Anfang; alles andere ist ein Nachsatz.
      if (beginn === null || (phase === "denkt" && beginn > 0)) {
        window.clearTimeout(kandidatTimer.current);
        if (phase === "denkt" && !leseFreigabeAnfrage() && offeneFrage.current && istNachsatz(t.anzeige)) {
          // Nachsatz: weitergesprochen, bevor Himbi antwortet. Die Anfrage bricht ab, und am
          // naechsten Endpunkt geht die zusammengefuegte Frage an Stelle der alten hinaus.
          vorsatz.current = offeneFrage.current;
          offeneFrage.current = null;
          unterbrichChat();
          dispatch({ art: "unterbrechen" });
          setZwischentext(fuegeZusammen(vorsatz.current.text, t.anzeige));
        }
        return;
      }
      const loeseAus = () => {
        const jetzt = sitzung.textAb(befehlAb());
        const b = befehlsBeginn(jetzt.woerter.map((w) => w.text), istEcho);
        if (b === null || ohrRef.current?.sitzung !== sitzung || !assistentIstDran(phaseRef.current)) return;
        // Himbis Echo hinter dem Befehl zaehlt nicht mit ("Tschuess Himbi" mitten in die Antwort).
        if (istBeendenBefehl(befehlOhneEcho(jetzt.woerter.map((w) => w.text), b, istEcho))) return beendenRef.current();
        const karte = leseFreigabeAnfrage();
        if (karte) {
          // Bei offener Freigabekarte lehnt "Stopp" nur die Karte ab, wie beim Zuhoeren.
          entscheideFreigabe(false, karte.nr);
          grenzeMs.current = Math.max(grenzeMs.current, (jetzt.endeMs ?? audioJetzt()) + 1);
          return;
        }
        // Die naechste Aeusserung beginnt mit dem Befehlswort; das Echo davor faellt weg, und
        // die Frage beginnt dort, auch wenn Himbi erst danach verstummt ist.
        grenzeMs.current = Math.max(grenzeMs.current, jetzt.woerter[b]!.startMs ?? grenzeMs.current);
        echoBisMs.current = grenzeMs.current;
        offeneFrage.current = null;
        unterbrecheHimbi("wort");
      };
      // Endgueltig erkannt: sofort. Nur vorlaeufig: erst, wenn es STOPP_STABIL_MS so bleibt -
      // ein vorlaeufiges Wort, das die Erkennung gleich korrigiert, loest nichts aus.
      window.clearTimeout(kandidatTimer.current);
      if (beginn < endgueltigeWoerter) loeseAus();
      else kandidatTimer.current = window.setTimeout(loeseAus, STOPP_STABIL_MS);
    },
    [audioJetzt, befehlAb, dispatch, frageAb, unterbrecheHimbi],
  );

  /** Die Erkennung meldet das Ende einer Aeusserung. */
  const beiEndpunkt = useCallback(
    (sitzung: LiveSitzung) => {
      if (ohrRef.current?.sitzung !== sitzung) return;
      const phase = phaseRef.current;
      const t = sitzung.textAb(frageAb());
      // Eine offene Freigabekarte wartet auf "Ja" oder "Nein", in JEDER Phase. Bis zum
      // 28.09.2026 nur beim Zuhoeren: waehrend eine Klickkarte offen ist, gilt der Chat aber als
      // beschaeftigt (die Ausfuehrung wartet ja auf die Entscheidung), die Phase blieb "spricht",
      // und ein "Ja" fiel hier als Echo weg (Rueckmeldung: "wenn ich Ja sage, passiert nichts").
      // Es zaehlt nur, was nach dem Erscheinen der Karte gesagt wurde, und nur fuer genau diese.
      const karte = leseFreigabeAnfrage();
      if (karte && karte.nr === freigabeNr.current && freigabeAbMs.current !== null) {
        // Ab der harten Grenze, NICHT ab frageAb(): die Karte erscheint oft, bevor Himbi den Satz
        // vor dem Klick gesprochen hat, man antwortet mitten hinein, und sein Verstummen danach
        // rueckte die weiche Echo-Grenze hinter das "Ja" (gemessen am 28.09.2026: "Ja, bitte."
        // bei 1,6 s, Himbi still bei 4,2 s, das Ja war weg). Seine eigenen Worte filtert
        // freigabeAntwortMitEcho heraus.
        const antwort = sitzung.textAb(Math.max(grenzeMs.current, freigabeAbMs.current - FREIGABE_VORLAUF_MS));
        const gerade = leseGerade();
        const gesagt = gerade ? `${gerade.satz ?? ""} ${gerade.vorher ?? ""}` : leseChatStand().antwort.slice(-200);
        const art = freigabeAntwortMitEcho(antwort.woerter.map((w) => w.text), gesagt);
        if (art) {
          grenzeMs.current = Math.max(grenzeMs.current, (antwort.endeMs ?? audioJetzt()) + 1);
          grenzeSteht.current = false;
          nachUnterbrechung.current = false;
          setZwischentext("");
          entscheideFreigabe(art === "zusage", karte.nr);
          // "Sprachmodus beenden" bei offener Karte: ablehnen UND beenden.
          if (art === "beenden") return beendenRef.current();
          // Beim Zuhoeren arbeitet der Chat nach der Entscheidung weiter: Himbi denkt.
          if (phase === "hoert") dispatch({ art: "frage-gestellt" });
          return;
        }
      }
      if (phase === "spricht") {
        const stand = leseChatStand();
        if (!stand.spricht && !stand.laedt && !stand.beschaeftigt) {
          // Die Antwort ist schon verklungen, nur die kurze Gnadenfrist lief noch: das war der
          // Nutzer (die Grenze steht seit dem Verstummen hinter Himbis letztem Wort).
          window.clearTimeout(ruheTimer.current);
          dispatch({ art: "antwort-fertig" });
          nimmAeusserung(t);
          return;
        }
        // Sonst Himbis Echo oder ein Nebengeraeusch - ein Befehl darin hat beiText schon
        // ausgeloest. Nur die weiche Grenze: die Befehlssuche schaut noch kurz davor.
        echoBisMs.current = Math.max(echoBisMs.current, (t.endeMs ?? 0) + 1);
        return;
      }
      if (phase === "hoert") nimmAeusserung(t);
    },
    [audioJetzt, dispatch, frageAb, nimmAeusserung],
  );

  const beiScheitern = useCallback(
    (sitzung: LiveSitzung, grund: string, startPerf: number) => {
      if (ohrRef.current?.sitzung !== sitzung) return;
      schliesseOhr();
      setZwischentext("");
      const { weiter, fehlversuche: neu } = nachSitzungsAbbruch({
        grund,
        dauerMs: performance.now() - startPerf,
        gehoert: sitzung.hatGehoert(),
        fehlversucheBisher: fehlversuche.current,
      });
      fehlversuche.current = neu;
      if (weiter === "nicht-eingerichtet") {
        zeigeMeldung({ text: t("liveFehlt"), fehlerzustand: true });
        dispatch({ art: "fehler" });
      } else if (weiter === "aufgeben") {
        zeigeMeldung({ text: t("verbindungFehlt"), fehlerzustand: true });
        dispatch({ art: "fehler" });
      } else if (weiter === "stumm" && !assistentIstDran(phaseRef.current)) {
        // Lange nichts gehoert: stumm schalten, statt weiter Stille an die Erkennung zu
        // schicken. Ein Tipp auf den Mikrofonknopf setzt fort.
        dispatch({ art: "pausieren" });
      } else {
        window.clearTimeout(neuTimer.current);
        neuTimer.current = window.setTimeout(() => {
          if (ohrOffen(phaseRef.current)) starteOhrRef.current();
        }, NEUVERSUCH_MS);
      }
    },
    [dispatch, schliesseOhr, t, zeigeMeldung],
  );

  // Die Rueckrufe der Sitzung lesen immer die neueste Fassung (die Sitzung lebt laenger als
  // ein Rendern).
  const rueckrufe = useRef({ beiText, beiEndpunkt, beiScheitern });
  useEffect(() => {
    rueckrufe.current = { beiText, beiEndpunkt, beiScheitern };
  }, [beiText, beiEndpunkt, beiScheitern]);

  const starteOhr = useCallback(() => {
    if (ohrRef.current) return;
    const strom = stromRef.current;
    if (!strom) return;
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(strom);
    } catch {
      // Nicht mitten im Effekt, der das Ohr startet, den Zustand umwerfen.
      queueMicrotask(() => {
        zeigeMeldung({ text: t("keinZugriff"), fehlerzustand: true });
        dispatch({ art: "fehler" });
      });
      return;
    }
    const startPerf = performance.now();
    let sitzung: LiveSitzung | null = null;
    sitzung = starteLiveSitzung({
      sprache,
      zweck: "gespraech",
      beiStand: () => {
        if (sitzung) rueckrufe.current.beiText(sitzung);
      },
      beiEndpunkt: () => {
        if (sitzung) rueckrufe.current.beiEndpunkt(sitzung);
      },
      // Scheitert die Sitzung (Schluessel, Verbindung, Dienst), wird neu verbunden - ohne
      // diesen Weg hoerte der Sprachmodus endlos zu, ohne je etwas zu verstehen.
      beiScheitern: (grund) => {
        if (sitzung) rueckrufe.current.beiScheitern(sitzung, grund, startPerf);
      },
    });
    const diese = sitzung;
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0 && ohrRef.current?.sitzung === diese) diese.sende(e.data);
    };
    recorder.start(AUFNAHME_STUECK_MS);
    ohrRef.current = { recorder, sitzung: diese, startPerf };
    grenzeMs.current = 0;
    echoBisMs.current = 0;
    befehlGeprueftMs.current = 0;
    grenzeSteht.current = false;
    // Neue Sitzung, neue Audiozeit ab 0: eine offene Karte stand schon vorher.
    if (freigabeAbMs.current !== null) freigabeAbMs.current = 0;
    zuletztGehoert.current = performance.now();
  }, [sprache, dispatch, t, zeigeMeldung]);
  useEffect(() => {
    starteOhrRef.current = starteOhr;
  }, [starteOhr]);

  // Offen, solange das Gespraech laeuft (auch waehrend Himbi denkt und spricht); zu im
  // Stumm- und Fehlerzustand.
  useEffect(() => {
    if (ohrOffen(phase)) starteOhr();
    else if (phase === "pausiert" || phase === "fehler") schliesseOhr();
  }, [phase, starteOhr, schliesseOhr]);

  // Beim Zuhoeren nach langer Stille stumm schalten (vorher erledigte das die 2-Minuten-Grenze
  // jeder Sitzung, die es im Gespraech nicht mehr gibt).
  useEffect(() => {
    if (phase !== "hoert") return;
    zuletztGehoert.current = performance.now();
    const uhr = window.setInterval(() => {
      if (phaseRef.current === "hoert" && performance.now() - zuletztGehoert.current > STILLE_BIS_STUMM_MS) {
        schliesseOhr();
        dispatch({ art: "pausieren" });
      }
    }, 5_000);
    return () => window.clearInterval(uhr);
  }, [phase, dispatch, schliesseOhr]);

  // --- Dazwischenreden, waehrend Himbi spricht --------------------------------------------
  //
  // Neben den Befehlswoertern bleibt der Lautstaerke-Waechter: wer deutlich lauter als das
  // Echo und laenger als einen Moment spricht, unterbricht (domain/sprachmodus.ts). Was ab
  // dem Einsatz der Stimme gesagt wurde, gehoert zur naechsten Frage. Der Tipp auf Himbi
  // bleibt der sichere Weg (laute Halle).
  useEffect(() => {
    if (phase !== "spricht") return;
    const waechter = erzeugeUnterbrechungsWaechter();
    let bild = 0;
    // Wo die Stimme eingesetzt hat (domain/sprachmodus.ts, erzeugeEinsatzMerker): ueberdauert
    // die Kommapause in "Stopp, zeig mir ...", aber keine einzelne Geraeuschspitze.
    let einsatz = erzeugeEinsatzMerker();
    const schritt = () => {
      // Hat ein Befehlswort schon unterbrochen, laeuft dieser Takt bis zum Aufraeumen des
      // Effekts noch einmal: kein zweites Unterbrechen, das die Grenze hinter die ersten Worte
      // der neuen Frage schoebe (Messung vom 28.09.2026: aus "Stopp, zeig mir ..." wurde "mir ...").
      if (phaseRef.current !== "spricht") return;
      // Waehrend eine Freigabekarte wartet, ist lautes Sprechen die Antwort darauf ("Ja, bitte,
      // mach das"), kein Dazwischenreden: Unterbrechen wuerde die Karte ablehnen.
      if (leseFreigabeAnfrage()) {
        einsatz = erzeugeEinsatzMerker();
        bild = window.requestAnimationFrame(schritt);
        return;
      }
      const urteil = waechter.melde(leseLautstaerke(), leseAusgabePegel(), performance.now());
      const beginn = einsatz.melde(urteil, audioJetzt());
      if (urteil === "unterbrechen") {
        grenzeMs.current = Math.max(grenzeMs.current, (beginn ?? audioJetzt()) - EINSATZ_VORLAUF_MS);
        echoBisMs.current = grenzeMs.current;
        offeneFrage.current = null;
        unterbrecheHimbi("stimme");
        return;
      }
      bild = window.requestAnimationFrame(schritt);
    };
    bild = window.requestAnimationFrame(schritt);
    return () => window.cancelAnimationFrame(bild);
  }, [phase, audioJetzt, unterbrecheHimbi]);

  // --- An den Chat-Zustand gekoppelt: denkt -> spricht -> wieder zuhoeren ---------------
  // Direkt am Bus statt in einem Effekt auf chatStand: der Chat meldet seinen Stand aus
  // einem eigenen Effekt (ki-chat.tsx), und hier wird im Rueckruf darauf reagiert.
  const sprachZuletzt = useRef(false);
  useEffect(() => {
    const reagiere = () => {
      // Eine neue Freigabekarte: ab jetzt zaehlt, was der Nutzer sagt, als Antwort darauf.
      const karte = leseFreigabeAnfrage();
      if ((karte?.nr ?? null) !== freigabeNr.current) {
        freigabeNr.current = karte?.nr ?? null;
        freigabeAbMs.current = karte ? audioJetzt() : null;
      }
      const stand = leseChatStand();
      const sprichtJetzt = stand.spricht || stand.laedt;
      // Himbi ist gerade verstummt: was die Erkennung ab jetzt hoert, ist nicht mehr sein Echo.
      // Ausser er wurde per Stimme unterbrochen: dann steht die Grenze schon am Einsatz des Nutzers.
      if (sprachZuletzt.current && !sprichtJetzt && !grenzeSteht.current) echoBisMs.current = Math.max(echoBisMs.current, audioJetzt() + 50);
      sprachZuletzt.current = sprichtJetzt;
      window.clearTimeout(ruheTimer.current);
      if (phaseRef.current !== "denkt" && phaseRef.current !== "spricht") return;
      if (stand.einwilligungFehlt) {
        // Der Chat hat die Frage verworfen, weil dem Hinweis zur KI-Nutzung noch
        // nicht zugestimmt ist. Eine Zustimmung darf hier nicht ungesehen gesetzt
        // werden (bis zum 24.09.2026 tat der Sprachmodus genau das) - der Start
        // prueft sie deshalb schon vorher (ki-pane-kontext.tsx, starteSprachmodus).
        zeigeMeldung({ text: t("einwilligungZuerst"), fehlerzustand: true });
        dispatch({ art: "fehler" });
        return;
      }
      if (stand.fehler) {
        // Das Gespraech bleibt offen: die Meldung gilt bis zur naechsten Frage oder Antwort.
        zeigeMeldung({ text: tAktion("fehler.unbekannt"), fehlerzustand: false });
        dispatch({ art: "unterbrechen" });
        return;
      }
      if (sprichtJetzt && phaseRef.current === "denkt") dispatch({ art: "antwort-spricht" });
      if (!sprichtJetzt && antwortFertig(stand)) {
        // Kurze Gnadenfrist: zwischen Streamende und dem Anstoss des Vorlesens liegt ein
        // Renderdurchlauf, ohne sie sprang die Anzeige mitten in diese Luecke auf "hoert".
        ruheTimer.current = window.setTimeout(() => {
          offeneFrage.current = null;
          dispatch({ art: "antwort-fertig" });
        }, RUHE_VOR_ZUHOEREN_MS);
      }
    };
    return abonniereSprachBus(reagiere);
  }, [audioJetzt, dispatch, t, tAktion, zeigeMeldung]);

  // --- Himbi beginnt den Tag (lib/himbi-tagesbeginn.ts) -----------------------------------
  //
  // Rueckmeldung vom 28.09.2026: "Himbi soll mit mir interagieren, zum Beispiel mir
  // vorschlagen, was ich heute machen kann, was dringende Themen sind ... Er soll mir Fragen
  // stellen!" Einmal am Tag je Nutzer stellt Himbi beim ERSTEN Zuhoeren dieser Sitzung selbst
  // die Frage nach der Tageslage; die Antwort (TAGESBEGLEITER im Prompt) nennt hoechstens drei
  // Punkte und endet mit einer Rueckfrage, auf die der Nutzer einfach antwortet.
  //   - Die Frage geht wie jede andere an den Chat und steht danach im Verlauf. Das ist gewollt:
  //     sichtbar, was gefragt wurde, und kein Sonderweg im Server.
  //   - Nur beim ersten Uebergang nach "hoert": das Ref haelt, auch wenn "hoert" nach Pause,
  //     Fehler oder Neuversuch wiederkommt, und auch beim probeweisen zweiten Einhaengen der
  //     Effekte im Entwicklungsmodus (die Refs bleiben dabei erhalten).
  //   - Die Einwilligung hat starteSprachmodus (ki-pane-kontext.tsx) schon geprueft. Ist der Chat
  //     nicht bereit, beschaeftigt oder wartet eine Freigabe, entfaellt die Begruessung, ohne den
  //     Tag zu verbrauchen: der Merker wird erst gesetzt, wenn die Frage wirklich gestellt ist.
  //   - Danach wie in nimmAeusserung (stelleFrage): offeneFrage gesetzt (spricht der Nutzer gleich
  //     hinein, wird es ein Nachsatz zu dieser Frage) und die Phase "denkt". Bliebe sie auf
  //     "hoert", naehme das Ohr Himbis eigene Antwort am naechsten Endpunkt als Frage.
  // Die Entscheidung selbst steht als reine Funktion in domain/sprachmodus.ts
  // (tagesbeginnAktion) und wird dort Fall fuer Fall geprueft (himbi-tagesbegleiter.mjs).
  const tagesbeginnEntschieden = useRef(false);
  useEffect(() => {
    const ablage = browserAblage();
    const jetzt = new Date();
    const stand = leseChatStand();
    const aktion = tagesbeginnAktion({
      phase,
      schonEntschieden: tagesbeginnEntschieden.current,
      einstellungAn: tagesbeginnAn,
      faellig: tagesbeginnFaellig(ablage, nutzerId, "gespraech", jetzt),
      chat: stand,
      freigabeOffen: leseFreigabeAnfrage() !== null,
    });
    if (aktion === "nichts") return;
    tagesbeginnEntschieden.current = true;
    if (aktion !== "fragen") return;
    stelleFrage(t(`tagesbeginn.${tageszeitBestimmen(jetzt)}`), [sprache]);
    merkeTagesbeginn(ablage, nutzerId, "gespraech", jetzt);
  }, [phase, tagesbeginnAn, nutzerId, sprache, stelleFrage, t]);

  // Alles schliessen, wenn der Sprachmodus endet.
  useEffect(
    () => () => {
      window.clearTimeout(ruheTimer.current);
      window.clearTimeout(neuTimer.current);
      schliesseOhr();
      stromRef.current?.getTracks().forEach((s) => s.stop());
      stromRef.current = null;
      stoppeHoeren();
    },
    [schliesseOhr],
  );

  // --- Bedienung --------------------------------------------------------------------------
  const erneutVersuchen = useCallback(() => {
    fehlversuche.current = 0;
    // fehler -> startet (die Meldung verschwindet dabei, meldungNachEreignis); ist das Mikrofon
    // noch offen, gleich weiter zum Zuhoeren, sonst oeffnet der Effekt fuer "startet" es neu.
    dispatch({ art: "fortsetzen" });
    if (stromRef.current) dispatch({ art: "mikrofon-bereit" });
  }, [dispatch]);

  const beiFigurKlick = useCallback(() => {
    entsperreTon();
    if (phaseRef.current === "fehler") {
      erneutVersuchen();
      return;
    }
    if (assistentIstDran(phaseRef.current)) {
      offeneFrage.current = null;
      unterbrecheHimbi("tipp");
      // Per Tipp: der Nutzer hat nichts gesagt, alles bis jetzt war Himbis Echo.
      grenzeMs.current = Math.max(grenzeMs.current, audioJetzt());
    }
  }, [audioJetzt, erneutVersuchen, unterbrecheHimbi]);

  const beenden = useCallback(() => {
    if (assistentIstDran(phaseRef.current)) unterbrichChat();
    schliesseOhr();
    beendeSprachmodus();
  }, [beendeSprachmodus, schliesseOhr]);
  useEffect(() => {
    beendenRef.current = beenden;
  }, [beenden]);

  const pausieren = useCallback(() => {
    if (phaseRef.current === "fehler") {
      erneutVersuchen();
    } else if (phaseRef.current === "pausiert") {
      dispatch({ art: "fortsetzen" });
    } else {
      if (assistentIstDran(phaseRef.current)) unterbrichChat();
      window.clearTimeout(neuTimer.current);
      schliesseOhr();
      vorsatz.current = null;
      offeneFrage.current = null;
      setZwischentext("");
      dispatch({ art: "pausieren" });
    }
  }, [dispatch, erneutVersuchen, schliesseOhr]);

  // Escape beendet, wie bei der Buehne des Panels (ki-pane-kontext.tsx).
  useEffect(() => {
    const beiTaste = (e: KeyboardEvent) => {
      if (e.key === "Escape") beenden();
      else if (e.key === " " && assistentIstDran(phaseRef.current)) {
        e.preventDefault();
        beiFigurKlick();
      }
    };
    window.addEventListener("keydown", beiTaste);
    return () => window.removeEventListener("keydown", beiTaste);
  }, [beenden, beiFigurKlick]);
  // Die Seite scrollt nur noch, wenn Himbi sie scrollt. Ueber die gemeinsame Sperre am
  // <html> (ui/scroll-sperre.ts): eine eigene Sperre am <body> machte ihn zum
  // Scrollcontainer, und Kopfzeile und Seitenleiste scrollten mit.
  useScrollSperre(true);

  // Der Dialog nimmt beim Oeffnen den Fokus auf: auf den Himbi-Knopf, die wichtigste
  // Bedienung (unterbrechen, erneut versuchen). Vorher blieb der Fokus auf der Seite
  // dahinter, und mit der Tabulatortaste erreichte man den Sprachmodus erst nach allen
  // Elementen der Seite (Gegenpruefung vom 25.09.2026). Weil der Knopf beim Andocken im
  // selben Baum bleibt, bleibt auch der Fokus. Beim Schliessen bekommt das Element den
  // Fokus zurueck, das ihn vorher hatte (meist der Knopf "Gespraech"), sonst fiele er auf
  // <body> (wie glocke.tsx). Gemerkt wird es vor dem Verschieben (Layout-Effekt) und nur,
  // wenn es ausserhalb des Sprachmodus liegt: im Entwicklungsmodus haengt React die Effekte
  // einmal probehalber aus und wieder ein, beim zweiten Mal laege der Fokus schon auf Himbi.
  // Zurueckgegeben wird nach dem Aushaengen und nur, wenn der Sprachmodus wirklich weg ist;
  // das Chat-Panel ist erst danach wieder bedienbar (inert).
  const figurKnopfRef = useRef<HTMLButtonElement | null>(null);
  const vorherFokusRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const aktiv = document.activeElement;
    if (aktiv instanceof HTMLElement && aktiv !== document.body && !aktiv.closest(".ki-sprachmodus")) vorherFokusRef.current = aktiv;
  }, []);
  useEffect(() => {
    figurKnopfRef.current?.focus({ preventScroll: true });
    return () => {
      const vorher = vorherFokusRef.current;
      window.setTimeout(() => {
        if (document.querySelector(".ki-sprachmodus")) return;
        if (vorher && vorher.isConnected && !vorher.closest("[inert]")) vorher.focus({ preventScroll: true });
      }, 0);
    };
  }, []);

  // --- Platz von Himbi: Mitte oder links ueber der Menueleiste ---------------------------
  //
  // Zwei Faelle (Rueckmeldung vom 25.09.2026: "sobald er anfaengt, mir den
  // Inhalt der UI zu erzaehlen, soll er nach links ueber die Menueleiste, links
  // vertikal mittig, der gesprochene Text darunter, die Mitte muss frei und gut
  // lesbar bleiben"):
  //   1. angedockt: der Assistent denkt oder spricht ODER ein Element ist
  //      hervorgehoben (zeigeAuf) - Himbi, Zustand und Text sitzen links, ueber
  //      der Navigationsleiste. Ein hervorgehobenes Ziel bekommt nur den
  //      Rahmen (SprachSpotlight), Himbi rueckt NICHT daneben: dort
  //      fehlte das Schriftbild des Gesprochenen, und die Menueleiste blieb
  //      scharf (Screenshot vom 25.09.2026).
  //   2. sonst (Zuhoeren, Fehler, Pause): Himbi gross in der Mitte.
  const zielRechteck = useHervorhebungsRechteck();
  const zielSichtbar = zielRechteck !== null && zielRechteck.breite > 0 && zielRechteck.hoehe > 0;
  const angedockt = zielSichtbar || assistentIstDran(phase);

  // Handy: Himbi weicht dem gerahmten Bereich aus (domain/sprachmodus.ts, ausweichPlatz),
  // statt mittig darueber zu stehen. Gemessen wird die Einheit aus Himbi und Zustandszeile
  // (samt einer offenen Freigabekarte), die Kopfzeile und die Bedienleiste; das Ergebnis
  // geht als --sprach-y an die Spalte (sprachmodus.css). Laeuft bei jeder Aenderung des
  // Rahmens (Scrollen, Groesse) neu, weil das Rechteck dann neu gesetzt wird.
  const istHandy = useSyncExternalStore(abonniereHandy, leseHandy, () => false);
  const spalteRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const spalte = spalteRef.current;
    if (!spalte) return;
    if (!istHandy || !zielSichtbar || !zielRechteck) {
      spalte.removeAttribute("data-ausweichen");
      spalte.style.removeProperty("--sprach-y");
      spalte.style.removeProperty("--sprach-max");
      return;
    }
    const kopf = document.querySelector("[data-kopfzeile]")?.getBoundingClientRect();
    const leiste = document.querySelector(".ki-sprachmodus__leiste")?.getBoundingClientRect();
    const rahmen = {
      x: zielRechteck.x - RAHMEN_ABSTAND,
      y: zielRechteck.y - RAHMEN_ABSTAND,
      breite: zielRechteck.breite + 2 * RAHMEN_ABSTAND,
      hoehe: zielRechteck.hoehe + 2 * RAHMEN_ABSTAND,
    };
    // Gemessen wird fixiert und ohne Hoechsthoehe: erst dann hat die Einheit ihre echte
    // Breite und damit ihre echte Hoehe (eine Freigabekarte bricht im Fluss anders um).
    // Das Messen passiert im selben Bild, gezeichnet wird erst das Ergebnis.
    const bisher = spalte.getAttribute("data-ausweichen");
    const erstes = bisher === null;
    if (erstes) {
      spalte.style.transition = "none";
      spalte.setAttribute("data-ausweichen", "messen");
    }
    spalte.style.removeProperty("--sprach-max");
    const platz = ausweichPlatz(rahmen, spalte.offsetHeight, {
      oben: (kopf && kopf.height > 0 ? kopf.bottom : 0) + 8,
      unten: (leiste ? leiste.top : window.innerHeight) - 8,
      rand: 8,
    });
    // Beim ersten Setzen und wenn Himbi die Seite wechselt (ueber/unter dem Rahmen),
    // springt er ohne Gleiten: sonst glitte er aus der Mitte oder einmal quer durch den
    // Rahmen. Innerhalb derselben Seite gleitet er im Gleichschritt mit dem Rahmen
    // (sprachmodus.css).
    const springt = erstes || bisher !== platz.lage;
    if (springt) spalte.style.transition = "none";
    spalte.setAttribute("data-ausweichen", platz.lage);
    spalte.style.setProperty("--sprach-y", `${Math.round(platz.y)}px`);
    spalte.style.setProperty("--sprach-max", `${Math.max(0, Math.floor(platz.hoeheFrei))}px`);
    if (springt) {
      void spalte.offsetHeight;
      requestAnimationFrame(() => spalte.style.removeProperty("transition"));
    }
  }, [istHandy, zielSichtbar, zielRechteck, phase, freigabeAnfrage]);

  // Mitlesen: der Rahmen in der Mitte folgt dem Satz, den die Stimme gerade
  // spricht (Rückmeldung vom 25.09.2026: "ich kann nicht nachvollziehen, bei
  // welchem Punkt er gerade ist"). Welcher Satz klingt, weiß der Vorlese-Strom
  // (sprachmodus-bus.ts, leseGerade); welche Stelle er meint, sagt seine
  // Sprechmarke (domain/sprechmarken.ts, sprach-mitlesen.ts). Ein Satz ohne Marke
  // lässt den Rahmen stehen. Nur wenn in der ganzen Antwort noch keine Marke kam,
  // zeigt eine wörtlich genannte Überschrift die Stelle - nie Wortähnlichkeit.
  //
  // Nebenbei steht der klingende Satz als data-satz-jetzt am Sprachmodus selbst (seit dem
  // 26.09.2026 nicht mehr am Untertitel, der ist standardmaessig aus): der
  // Führungstest liest dort mit, was gerade gesprochen wird.
  const wurzelRef = useRef<HTMLDivElement | null>(null);
  const himbiDran = assistentIstDran(phase);
  useEffect(() => {
    if (!himbiDran) return;
    let letzter = "";
    let markeGesehen = false;
    const uhr = window.setInterval(() => {
      const jetzt = leseGerade();
      // Satz und ob er klingt: nach einer Sprechpause steht derselbe Index erst
      // still (noch nicht gesprochen) und klingt dann - erst dann gilt seine Marke.
      const schluessel = jetzt ? `${jetzt.index}:${jetzt.satz === null ? 0 : 1}` : "";
      if (!jetzt || schluessel === letzter) return;
      letzter = schluessel;
      if (jetzt.satz === null) return;
      wurzelRef.current?.setAttribute("data-satz-jetzt", jetzt.satz ?? "");
      wurzelRef.current?.setAttribute("data-satz-index", String(jetzt.index));
      if (jetzt.ziel) {
        markeGesehen = true;
        const stelle = loeseSprechZiel(jetzt.ziel);
        if (stelle) zeigeSprechStelle(stelle);
        return;
      }
      if (markeGesehen || !jetzt.satz) return;
      const stelle = ueberschriftImSatz(jetzt.satz);
      if (stelle) zeigeSprechStelle(stelle);
    }, 150);
    return () => window.clearInterval(uhr);
  }, [himbiDran]);

  // Die Navigationsleiste wird unscharf, solange Himbi und Text links stehen
  // (Filter direkt auf der Leiste, siehe sprachmodus.css).
  useEffect(() => {
    if (!angedockt) return;
    const wurzel = document.documentElement;
    wurzel.setAttribute("data-sprach-links", "");
    return () => wurzel.removeAttribute("data-sprach-links");
  }, [angedockt]);

  // Wartet eine Freigabekarte und Himbi spricht gerade nicht, hoert er auf "Ja" oder "Nein" -
  // bis zum 28.09.2026 stand hier weiter "Himbi spricht", obwohl er auf den Nutzer wartete.
  const wartetAufFreigabe = freigabeAnfrage !== null && !chatStand.spricht && (phase === "denkt" || phase === "spricht" || phase === "hoert");
  const sprachZustand: SprachZustand = wartetAufFreigabe
    ? "hoert"
    : phase === "fehler" ? "fehler" : phase === "pausiert" ? "pausiert" : phase === "spricht" ? "spricht" : phase === "denkt" ? "denkt" : "hoert";
  // Der Zustand haengt nie an der Farbe allein (Rueckmeldung vom 25.09.2026:
  // "weiss anhand der Farbe nicht, ob die KI zuhoert, denkt oder spricht") -
  // dasselbe Symbol wie der Zustandstext daneben, unabhaengig vom Farbsehen.
  const StatusSymbol = STATUS_SYMBOL[sprachZustand];

  const statusText =
    wartetAufFreigabe ? t("status.freigabe")
    : phase === "startet" ? t("status.startet")
    : phase === "hoert" ? t("status.hoert")
    : phase === "denkt" ? t("status.denkt")
    : phase === "spricht" ? t("status.spricht")
    : phase === "pausiert" ? t("status.pausiert")
    : t("status.fehler");
  const figurBeschriftung = phase === "fehler" ? t("erneut") : assistentIstDran(phase) ? t("unterbrechen") : statusText;

  // Himbi + Knopf: identischer Inhalt in beiden Lagen (Mitte, links) - nur die
  // Groesse unterscheidet sich (sprachmodus.css, --himbi-b). Bis zum 25.09.2026 stand
  // hier eine Kugel; jetzt fuehrt Himbi das Gespraech, mit Lippen, die der Stimme folgen
  // (sprach-himbi.tsx). Ist ein Bereich hervorgehoben, sieht Himbi zu ihm hin.
  const blickziel = zielSichtbar && zielRechteck ? { x: zielRechteck.x + zielRechteck.breite / 2, y: zielRechteck.y + zielRechteck.hoehe / 2 } : null;
  const figurKnopf = (
    <button
      ref={figurKnopfRef}
      type="button"
      onClick={beiFigurKlick}
      className="ki-sprachmodus__figur-knopf"
      aria-label={figurBeschriftung}
      title={figurBeschriftung}
    >
      <SprachHimbi zustand={sprachZustand} groesse={angedockt ? "klein" : "mitte"} blickziel={blickziel} links={angedockt} />
    </button>
  );
  const statusZeile = (
    <p className="ki-sprachmodus__status">
      <StatusSymbol className={cn("ki-sprachmodus__status-symbol", sprachZustand === "denkt" && "ki-sprachmodus__status-symbol--dreht")} aria-hidden />
      {statusText}
    </p>
  );
  // Eine offene Freigabe (Klick- oder Aktionskarte, sprachmodus-bus.ts) geht
  // ÜBER allem anderen: sichtbar, auch wenn die Untertitel ausgeschaltet sind -
  // eine Sicherheitsfrage darf nie unsichtbar bleiben. "Ja"/"Nein" loest sie
  // auf, in jeder Phase (siehe beiEndpunkt oben, freigabeAntwortMitEcho).
  const untertitel = freigabeAnfrage ? (
    <div className="ki-sprachmodus__untertitel ki-sprachmodus__untertitel--freigabe" role="alertdialog" aria-live="assertive">
      <p className="ki-sprachmodus__untertitel-zeile">{freigabeAnfrage.text}</p>
      <p className="ki-sprachmodus__untertitel-zeile ki-sprachmodus__untertitel-zeile--nutzer">{t("freigabeHinweis")}</p>
    </div>
  ) : untertitelAn ? (
    <div className="ki-sprachmodus__untertitel" aria-hidden={phase !== "hoert"}>
      {phase === "hoert" ? (
        <p className="ki-sprachmodus__untertitel-zeile ki-sprachmodus__untertitel-zeile--nutzer">
          {zwischentext || (phase === "hoert" ? t("hoertZu") : "")}
        </p>
      ) : (chatStand.antwort || phase === "spricht" || phase === "denkt") ? (
        // Nie das rohe Markdown der Antwort ("**fett**", "1. ...") - das
        // stand bis zum 25.09.2026 unbereinigt im Untertitel, bei
        // laengeren Antworten kaum lesbar. Dieselbe Markdown-Darstellung
        // wie im sichtbaren Chat (Absaetze, Fettdruck, Listen).
        <div className="ki-sprachmodus__untertitel-zeile">
          <Markdown text={chatStand.antwort} />
        </div>
      ) : null}
    </div>
  ) : null;

  return (
    <div
      ref={wurzelRef}
      role="dialog"
      aria-modal="true"
      aria-label={t("titel")}
      data-untertitel={untertitelAn ? "an" : "aus"}
      className={cn("ki-sprachmodus", angedockt && "ki-sprachmodus--angedockt")}
    >
      <SprachSpotlight rechteck={zielRechteck} />

      {/* Statusansage fuer Screenreader - ohne den Fokus zu verschieben, ein zweiter Kanal
          neben Himbi und dem Zustandstext (siehe Recherche, Abschnitt Barrierefreiheit). */}
      <p className="sr-only" role="status" aria-live="polite">
        {statusText}
      </p>

      {/* EIN Baum fuer beide Lagen, nur die Klassen wechseln: vorher hingen Knopf und
          Untertitel je Lage an einer anderen Stelle, React baute sie beim Andocken neu,
          und der Tastaturfokus fiel auf <body> (Gegenpruefung vom 25.09.2026).
          Angedockt: links, vertikal mittig ueber der Navigationsleiste (nur diese wird
          unscharf, siehe data-sprach-links in sprachmodus.css - die Mitte bleibt frei
          und scharf). EIN Flex-Block fuer Himbi und Text: waechst der Text nach unten,
          ruecken beide zusammen als Einheit wieder mittig - Himbi wandert dabei von
          selbst nach oben (Rueckmeldung vom 25.09.2026). max-height haelt die Einheit
          dabei immer im Rahmen der Navigationsleiste. In der Mitte ist die Spalte
          display: contents, Himbi und Text stehen wie bisher untereinander. */}
      <div ref={spalteRef} className={angedockt ? "ki-sprachmodus__links-spalte" : "ki-sprachmodus__mitte"}>
        <div className={cn("ki-sprachmodus__figur-huelle", angedockt && "ki-sprachmodus__figur-huelle--links")}>
          {figurKnopf}
          {statusZeile}
        </div>
        {untertitel}
      </div>

      {meldung ? <p className="ki-sprachmodus__meldung">{meldung.text}</p> : null}

      <div className="ki-sprachmodus__leiste">
        <button
          type="button"
          onClick={pausieren}
          aria-pressed={phase === "pausiert"}
          aria-label={phase === "fehler" ? t("erneut") : phase === "pausiert" ? t("fortsetzen") : t("stumm")}
          title={phase === "fehler" ? t("erneut") : phase === "pausiert" ? t("fortsetzen") : t("stumm")}
          className="ki-sprachmodus__knopf"
        >
          {phase === "pausiert" ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </button>
        <button
          type="button"
          onClick={schalteUntertitel}
          aria-pressed={untertitelAn}
          aria-label={t("untertitel")}
          title={t("untertitel")}
          className={cn("ki-sprachmodus__knopf ki-sprachmodus__knopf--untertitel", untertitelAn && "ki-sprachmodus__knopf--aktiv")}
        >
          <Subtitles className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={beenden}
          aria-label={t("beenden")}
          title={t("beenden")}
          className="ki-sprachmodus__knopf ki-sprachmodus__knopf--beenden"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
