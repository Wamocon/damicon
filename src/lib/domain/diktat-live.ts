// Live-Diktat: Sprache wird schon WAEHREND des Sprechens erkannt.
//
// Bis zum 24.09.2026 lief das Diktat nur als Datei: aufnehmen, bis es still
// ist, dann hochladen, dann bei Soniox einen Auftrag anlegen, abfragen, Text
// holen, aufraeumen. Waehrend des Sprechens stand nichts im Feld, und nach
// dem Sprechen kamen noch einmal 2-5 s (mit Whisper 7-9 s) Wartezeit dazu.
//
// Jetzt spricht der Browser direkt mit Soniox (stt-rt-v5, WebSocket). Der
// Server gibt dafuer nur einen kurzlebigen Schluessel aus
// (api/ki-spracherkennung) - der echte Schluessel verlaesst den Server nie.
// Der Text erscheint Wort fuer Wort im Eingabefeld, und das Ende der
// Aeusserung erkennt das Modell selbst (Endpunkterkennung), statt einer
// Lautstaerkeschwelle, die leise Sprechende verwirft und Denkpausen abschneidet.
//
// Hier steht nur die reine Logik, ohne Browser und ohne Netz - damit
// supabase/tests/ki-assistent.mjs sie mit erfundenen Antworten pruefen kann.
// Das Protokoll ist aus dem offiziellen SDK abgelesen
// (github.com/soniox/soniox-js, packages/core/src/realtime/stt.ts, 2.3.0).

/** Echtzeitmodell. stt-rt-v4 leitet seit 30.06.2026 hierauf um. */
export const LIVE_MODELL = "stt-rt-v5";

/** So lange darf die Aeusserung nach dem letzten Wort noch dauern, bis das
 *  Modell ein Ende meldet. Soniox erlaubt 500-3000 ms (Standard 2000). Die
 *  Erkennung ist semantisch: ein Satz, der erkennbar noch nicht fertig ist,
 *  bekommt mehr Zeit als einer, der mit einem Punkt endet. 1500 ms liegen
 *  ueber den 1200 ms der alten Lautstaerkeregel - die schnitt Denkpausen ab.
 *
 *  Das Feld kam mit v4 ("v4 model only", soniox-python CHANGELOG 2.2.0); dass
 *  v5 es annimmt, zeigt Soniox' eigenes Beispiel "Update stt to v5"
 *  (github.com/soniox/soniox_examples, 16.06.2026: stt-rt-v5 mit
 *  max_endpoint_delay_ms). Lehnte der Dienst es doch einmal ab, meldet er
 *  einen Fehler, und das Diktat geht als Datei (components/ki/diktat-live.ts). */
export const ENDPUNKT_VERZOEGERUNG_MS = 1500;

/** Wie lange ein ausgegebener Schluessel zum Verbindungsaufbau taugt. Er wird
 *  unmittelbar nach dem Klick geholt und sofort benutzt. */
export const SCHLUESSEL_GUELTIG_S = 60;

/** Hoechstdauer einer Verbindung - eine Aufnahme endet spaetestens nach
 *  60 s (DIKTAT_STANDARD.hoechstdauerMs), der Rest ist Luft fuer das
 *  Abschliessen. */
export const SITZUNG_HOECHSTENS_S = 120;

/** Im Gespraech hoert EINE Verbindung durchgehend zu (sprachmodus.tsx), auch waehrend
 *  Himbi denkt und spricht: so geht kein Wort zwischen zwei Aeusserungen verloren, und
 *  es gibt keinen Verbindungsaufbau vor jeder Frage. Nach dieser Zeit wird neu verbunden;
 *  wer so lange schweigt, wird vorher schon stumm geschaltet. */
export const GESPRAECH_SITZUNG_S = 1_800;

const OBERFLAECHEN = ["de", "en", "ru", "kk"] as const;

/** Sprachhinweise fuer Soniox. Sie GEWICHTEN nur, sie beschraenken nicht
 *  ("Language hints do not restrict recognition", soniox.com/docs/stt/
 *  concepts/language-hints) - wer auf einer deutschen Seite russisch spricht,
 *  bekommt trotzdem Russisch.
 *
 *  Bei kasachischer oder russischer Oberflaeche gehen BEIDE Sprachen mit: in
 *  Kasachstan wird zwischen den beiden gewechselt, oft mitten im Satz, und die
 *  beiden teilen sich die kyrillische Schrift. Mit nur einem Hinweis war das
 *  der Fall, in dem russisch Gesprochenes als Kasachisch gelesen wurde. */
export function sprachHinweise(oberflaeche: string | undefined): string[] {
  const wert = oberflaeche?.trim().toLowerCase();
  if (wert === "kk") return ["kk", "ru"];
  if (wert === "ru") return ["ru", "kk"];
  return wert && (OBERFLAECHEN as readonly string[]).includes(wert) ? [wert] : [];
}

/** Fachwoerter der Anwendung. Ohne sie verhoert jedes Modell Eigennamen und
 *  Fachbegriffe - "Himbi", "Reihenblock", "ЕСУТД" sind keine Alltagswoerter.
 *  Soniox nutzt sie als Gewichtung (context.terms), nicht als Liste erlaubter
 *  Woerter. Bewusst kurz: jeder Eintrag verschiebt die Erkennung ein wenig,
 *  und eine lange Liste wuerde auch da gewichten, wo es nicht passt. */
export const FACHWOERTER: readonly string[] = [
  // Namen der Anwendung (die KI heisst Himbi)
  "Damicon", "Himbi", "Химби",
  // Deutsch
  "Himbeere", "Himbeeren", "Reihenblock", "Reihenblöcke", "Feldparzelle", "Pflückaufgabe",
  "Pflückaufgaben", "Pflücker", "Brigade", "Steige", "Steigen", "Kühlkette", "Sortenkatalog",
  "Zukauf", "Pflanzenschutz", "Wartezeit", "Q-Faktor", "Reklamation", "Lieferschein",
  "Tourenplanung", "Fördermittel", "Compliance", "Mehrwertsteuer",
  // Russisch
  "малина", "бригада", "бригадир", "сборщик", "сборщики", "холодовая цепь", "ящик",
  "НДС", "НК РК", "МРП", "ЭСФ", "ЕСУТД", "тенге",
  // Kasachisch
  "таңқурай", "бригада", "жинаушы", "ҚҚС", "теңге",
];

export interface DiktatKontext {
  general: Array<{ key: string; value: string }>;
  terms: string[];
}

/** Worum es geht - hilft dem Modell bei allem, was mehrdeutig klingt. Englisch,
 *  weil Soniox die Beispiele so fuehrt; die Werte beschreiben nur, sie werden
 *  nie Teil des erkannten Textes. */
export function diktatKontext(): DiktatKontext {
  return {
    general: [
      { key: "domain", value: "Agriculture: raspberry farm operations in Kazakhstan" },
      { key: "topic", value: "Questions to the AI assistant of the farm management software Damicon (harvest, picking crews, cold chain, payroll, taxes, compliance)" },
    ],
    terms: [...new Set(FACHWOERTER)],
  };
}

/** Was der Browser beim Verbindungsaufbau an Soniox schickt - ohne den
 *  Schluessel, den setzt erst der Client davor. Der Server legt das fest und
 *  nicht der Browser: Modell, Hinweise und Kontext sind Betriebsentscheidung. */
export interface LiveKonfiguration {
  model: string;
  audio_format: "auto";
  language_hints: string[];
  enable_language_identification: true;
  enable_endpoint_detection: true;
  max_endpoint_delay_ms: number;
  /** Nur im Gespraech (Sprachmodus), siehe GESPRAECH_ENDPUNKT. */
  endpoint_sensitivity?: number;
  endpoint_latency_adjustment_level?: number;
  /** Nur im Gespraech und nur mit Schalter (KI_SPRECHERTRENNUNG, siehe liveKonfiguration). */
  enable_speaker_diarization?: true;
  context: DiktatKontext;
}

/** Wofuer zugehoert wird. "diktat" schreibt ins Eingabefeld und darf sich Zeit lassen;
 *  "gespraech" ist der Sprachmodus, dort wartet jemand auf eine Antwort. */
export type LiveZweck = "diktat" | "gespraech";

/** Endpunkterkennung im Gespraech. Soniox nennt diese Werte selbst als Startpunkt fuer
 *  reaktives Turn-Taking (soniox.com/docs/stt/rt/endpoint-detection, abgerufen 24.09.2026):
 *  das Ende einer Aeusserung wird frueher erkannt, bleibt aber semantisch - ein erkennbar
 *  unfertiger Satz bekommt weiter mehr Zeit. Beim Diktat bleibt es bei der Voreinstellung,
 *  dort ist ein zu frueher Schnitt aergerlicher als eine Sekunde Warten. Je Sprache nicht
 *  gemessen; nachziehen, sobald echte Gespraeche vorliegen. */
//
// Seit dem 25.09.2026 ruhiger: mit 0,3 und Stufe 2 schnitt die Erkennung "sehr selten,
// aber immer wieder" mitten in einer Aeusserung ab, bevor der Nutzer fertig war
// (Rueckmeldung vom 25.09.2026).
//
// Seit dem 28.09.2026 wieder schneller, weil ein zu frueher Schnitt nichts mehr kostet:
// die Verbindung hoert durchgehend weiter, und wer nach einem Endpunkt weiterspricht,
// waehrend Himbi noch nachdenkt ("Ja." ... "und zeig mir die Lieferungen"), bekommt
// seine Frage zusammengefuegt statt abgeschnitten (sprachmodus.tsx, Nachsatz). Gemessen
// mit der Voreinstellung (Empfindlichkeit 0, Stufe 1, 1500 ms): 2,2 s vom letzten Wort
// bis zum Endpunkt - der groesste Einzelposten bis zur Antwort.
export const GESPRAECH_ENDPUNKT = { endpoint_sensitivity: 0.2, endpoint_latency_adjustment_level: 2 } as const;
/** Laengste Wartezeit nach dem letzten Wort im Gespraech (Diktat: ENDPUNKT_VERZOEGERUNG_MS). */
export const GESPRAECH_ENDPUNKT_VERZOEGERUNG_MS = 1_000;

/** Sprechertrennung im Gespraech (Rueckmeldung vom 05.10.2026: "er spricht, bekommt von anderen
 *  Ton und bricht ab"). Jedes Wort traegt dann eine Sprechernummer, und der Sprachmodus nimmt nur
 *  den Hauptsprecher der Sitzung als Frage oder Unterbrechung (domain/sprachmodus.ts,
 *  nurHauptsprecher). Soniox selbst warnt: in Echtzeit ungenauer als nachtraeglich, Nummern
 *  koennen anfangs springen, und die Endpunkterkennung verschlechtert die Zuordnung
 *  (soniox.com/docs/stt/concepts/speaker-diarization, abgerufen 03.10.2026). Deshalb nur mit
 *  Schalter, bis eine Messung zeigt, dass sie im Gespraech traegt. */
export interface LiveOptionen {
  sprechertrennung?: boolean;
}

export function liveKonfiguration(oberflaeche: string | undefined, zweck: LiveZweck = "diktat", optionen: LiveOptionen = {}): LiveKonfiguration {
  return {
    ...(zweck === "gespraech" ? GESPRAECH_ENDPUNKT : {}),
    ...(zweck === "gespraech" && optionen.sprechertrennung ? { enable_speaker_diarization: true as const } : {}),
    model: LIVE_MODELL,
    // Der Browser schickt, was MediaRecorder liefert (webm/opus, auf dem
    // iPhone mp4) - genau so macht es das offizielle Web-SDK.
    audio_format: "auto",
    language_hints: sprachHinweise(oberflaeche),
    // Ohne dieses Feld traegt kein Token eine Sprache - und die gehoerte
    // Sprache entscheidet ueber die Sprache der Antwort (antwortsprache.ts).
    enable_language_identification: true,
    enable_endpoint_detection: true,
    max_endpoint_delay_ms: zweck === "gespraech" ? GESPRAECH_ENDPUNKT_VERZOEGERUNG_MS : ENDPUNKT_VERZOEGERUNG_MS,
    context: diktatKontext(),
  };
}

/** WebSocket-Adresse aus der REST-Adresse. Soniox benennt die Hosts je Region
 *  gleich: api.eu.soniox.com -> stt-rt.eu.soniox.com, api.soniox.com ->
 *  stt-rt.soniox.com. Wer davon abweicht (eigene Region, Sovereign Cloud),
 *  setzt SONIOX_STT_WS_URL. Ohne beides: null - dann gibt es kein Live-Diktat,
 *  und im Code steht bewusst keine Region (docs/infra/spracherkennung-anbieter.md). */
export function sonioxLiveAdresse(apiBasis: string | null | undefined, ausdruecklich?: string | null): string | null {
  const direkt = ausdruecklich?.trim();
  if (direkt) return /^wss:\/\//.test(direkt) ? direkt : null;
  const wert = apiBasis?.trim();
  if (!wert) return null;
  let host: string;
  try {
    host = new URL(wert).host;
  } catch {
    return null;
  }
  if (!host.startsWith("api.")) return null;
  return `wss://stt-rt.${host.slice("api.".length)}/transcribe-websocket`;
}

// --- Token sammeln ------------------------------------------------------------
//
// Soniox schickt je Antwort zweierlei: neue ENDGUELTIGE Token (die kommen genau
// einmal und aendern sich nie mehr) und die aktuell VORLAEUFIGEN (die ersetzen
// jedes Mal die vorigen vorlaeufigen). Dazu zwei Steuerzeichen als Token:
// "<end>" (Endpunkt: die Aeusserung ist zu Ende) und "<fin>" (eine angeforderte
// Finalisierung ist durch). Das letzte Paket traegt finished: true.

export interface SonioxToken {
  text?: unknown;
  is_final?: unknown;
  language?: unknown;
  /** Lage im Audio, in ms ab dem ersten gesendeten Stueck der Sitzung. */
  start_ms?: unknown;
  end_ms?: unknown;
  /** Sprechernummer ("1", "2" ...), nur mit enable_speaker_diarization. */
  speaker?: unknown;
}

export interface SonioxPaket {
  tokens?: unknown;
  finished?: unknown;
  error_code?: unknown;
  error_message?: unknown;
}

export interface SammelStand {
  /** Was sicher ist - aendert sich nicht mehr. */
  endgueltig: string;
  /** Was das Modell gerade hoert und noch korrigieren kann. */
  vorlaeufig: string;
  /** Beides zusammen: das, was im Eingabefeld stehen soll. */
  anzeige: string;
  /** Wie viele Endpunkte ("<end>", Ende einer Aeusserung) bisher kamen - im Gespraech
   *  laeuft eine Sitzung ueber viele Aeusserungen, deshalb eine Zahl und kein Merker. */
  endpunkte: number;
  /** Die Sitzung ist abgeschlossen. */
  fertig: boolean;
  /** Fehlermeldung des Dienstes, falls eine kam. */
  fehler: string | null;
}

/** Text, der ab einer Stelle im Audio gehoert wurde (Gespraech: alles davor war eine
 *  fruehere Aeusserung oder Himbis eigene Stimme). */
export interface TextAb {
  endgueltig: string;
  vorlaeufig: string;
  anzeige: string;
  /** Sprachen der endgueltigen Token dieses Abschnitts. */
  sprachen: string[];
  /** Ende des letzten Wortes (ms im Audio), null ohne Wort. */
  endeMs: number | null;
  /** Die Woerter mit ihrer Lage im Audio (Soniox liefert Teilstuecke wie "W", "ie"; ein
   *  neues Wort beginnt mit einem Leerzeichen). Endgueltige zuerst, dann vorlaeufige.
   *  `sprecher`: die Sprechernummer seines ersten Teilstuecks, null ohne Sprechertrennung. */
  woerter: Array<{ text: string; startMs: number | null; endeMs: number | null; sprecher: string | null }>;
}

export interface TokenSammler {
  nimm(paket: SonioxPaket): SammelStand;
  stand(): SammelStand;
  /** Sprachen der endgueltigen Token, in der Reihenfolge des Auftretens -
   *  derselbe Vertrag wie beim Datei-Weg (SonioxAntwort.sprachen). */
  sprachen(): string[];
  /** Hat das Modell ueberhaupt irgendetwas gehoert (auch vorlaeufig)? */
  hatGehoert(): boolean;
  /** Alles, was ab abMs gesprochen wurde (Token, die dort oder spaeter beginnen). */
  textAb(abMs: number): TextAb;
}

interface Wort {
  text: string;
  startMs: number | null;
  endeMs: number | null;
  sprache: string | null;
  sprecher: string | null;
  /** Beginnt hier ein neues Wort? Ja bei fuehrendem Leerzeichen, beim ersten Token der
   *  Sitzung und beim ersten nach einem Endpunkt - sonst ist es ein Teilstueck ("ferungen"). */
  anfang: boolean;
}

const zahl = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);

const STEUERZEICHEN = new Set(["<end>", "<fin>"]);

// Soniox trennt Woerter durch fuehrende Leerzeichen IM Token. Der erste Token der
// Aufnahme kann trotzdem mit einem Leerzeichen beginnen - das faellt beim Trimmen weg,
// sonst stuende im Feld " Hallo".
//
// Seit 29.09.2026 Stueck fuer Stueck (Cleanup-Fund 17): der endgueltige Text wird beim
// Eintreffen zusammengezogen (jeder Leerraum ein Leerzeichen, NICHT getrimmt) und nur
// noch angehaengt. Vorher lief die Saeuberung bei jedem Paket ueber den ganzen Text der
// Sitzung - im Gespraech bis zu 30 Minuten, gemessen 2,2 ms je Paket bei 30.000 Token.
const kompakt = (text: string): string => text.replace(/\s+/g, " ");
const saeubere = (text: string): string => kompakt(text).trim();
/** kompakt(a + b) aus kompakt(a) und kompakt(b): ein Leerraum ueber die Naht bleibt EIN Leerzeichen. */
const haengeAn = (a: string, b: string): string => (a.endsWith(" ") && b.startsWith(" ") ? a + b.slice(1) : a + b);

export function erzeugeTokenSammler(): TokenSammler {
  // Schon zusammengezogen (kompakt), nur noch getrimmt wird beim Ablesen.
  let endgueltig = "";
  let vorlaeufig = "";
  let endpunkte = 0;
  let fertig = false;
  let fehler: string | null = null;
  let gehoert = false;
  // Das naechste Token beginnt ein neues Wort (Anfang der Sitzung, nach einem Endpunkt).
  let neueAeusserung = true;
  const sprachen: string[] = [];
  // Dieselben Token noch einmal mit ihrer Lage im Audio - fuers Gespraech (textAb).
  const endgueltigeWoerter: Wort[] = [];
  let vorlaeufigeWoerter: Wort[] = [];

  const stand = (): SammelStand => {
    const v = kompakt(vorlaeufig);
    // Das Leerzeichen zwischen beiden steckt schon im vorlaeufigen Token,
    // wenn es eines braucht - deshalb roh verbunden und erst dann getrimmt.
    return { endgueltig: endgueltig.trim(), vorlaeufig: v.trim(), anzeige: haengeAn(endgueltig, v).trim(), endpunkte, fertig, fehler };
  };

  return {
    stand,
    sprachen: () => [...sprachen],
    hatGehoert: () => gehoert,
    textAb(abMs) {
      // Ein Wort gehoert ganz auf die Seite, auf der es beginnt (Cleanup-Fund 22,
      // 29.09.2026): Soniox liefert Teilstuecke ("Lie", "ferungen"), und die Grenze
      // aus dem Einsatz der Stimme kann zwischen zwei davon liegen. Vorher blieb
      // "ferungen" als eigenes Wort stehen und ging als Frageanfang ans Modell. Ein
      // Teilstueck faellt deshalb mit weg, wenn sein Vorgaenger vor der Grenze lag.
      // Endgueltige und vorlaeufige Token bilden dabei eine Folge - das erste
      // vorlaeufige setzt das letzte endgueltige fort.
      //
      // Gesucht wird vom Ende her bis zum letzten Token, das vor der Grenze beginnt
      // (Cleanup-Fund 17): Soniox liefert die Token in der Reihenfolge des Audios, und
      // gebraucht wird nur der Teil dahinter, nicht die ganze Sitzung. Ein Token ohne
      // Zeitangabe hinter dieser Stelle zaehlt mit - lieber ein Wort zu viel als eines
      // verloren.
      let erstes = endgueltigeWoerter.length;
      while (erstes > 0) {
        const w = endgueltigeWoerter[erstes - 1]!;
        if (w.startMs !== null && w.startMs < abMs) break;
        erstes -= 1;
      }
      let vorgaengerWeg = erstes > 0;
      const ab = (w: Wort) => {
        const drin = (w.startMs === null || w.startMs >= abMs) && (w.anfang || !vorgaengerWeg);
        vorgaengerWeg = !drin;
        return drin;
      };
      const e = endgueltigeWoerter.slice(erstes).filter(ab);
      const v = vorlaeufigeWoerter.filter(ab);
      const roh = (liste: Wort[]) => liste.map((w) => w.text).join("");
      const letztes = [...e, ...v].reverse().find((w) => w.endeMs !== null && w.text.trim());
      const woerter: TextAb["woerter"] = [];
      for (const w of [...e, ...v]) {
        const neu = woerter.length === 0 || w.anfang;
        const text = w.text.trim();
        if (!text) continue;
        if (neu) woerter.push({ text, startMs: w.startMs, endeMs: w.endeMs, sprecher: w.sprecher });
        else {
          const letzt = woerter[woerter.length - 1]!;
          letzt.text += text;
          letzt.endeMs = w.endeMs ?? letzt.endeMs;
        }
      }
      return {
        endgueltig: saeubere(roh(e)),
        vorlaeufig: saeubere(roh(v)),
        anzeige: saeubere(roh(e) + roh(v)),
        sprachen: e.map((w) => w.sprache).filter((s): s is string => Boolean(s)),
        endeMs: letztes?.endeMs ?? null,
        woerter,
      };
    },
    nimm(paket) {
      if (typeof paket.error_message === "string" || typeof paket.error_code === "number") {
        fehler = `soniox-${typeof paket.error_code === "number" ? paket.error_code : "fehler"}: ${String(paket.error_message ?? "ohne Angabe").slice(0, 160)}`;
        fertig = true;
        return stand();
      }
      vorlaeufig = "";
      vorlaeufigeWoerter = [];
      const tokens = Array.isArray(paket.tokens) ? (paket.tokens as SonioxToken[]) : [];
      let anfang = neueAeusserung;
      for (const t of tokens) {
        const text = typeof t?.text === "string" ? t.text : "";
        if (STEUERZEICHEN.has(text)) {
          if (text === "<end>") {
            endpunkte += 1;
            neueAeusserung = true;
            anfang = true;
          }
          continue;
        }
        if (!text) continue;
        if (text.trim()) gehoert = true;
        const wort: Wort = {
          text,
          startMs: zahl(t.start_ms),
          endeMs: zahl(t.end_ms),
          sprache: typeof t.language === "string" && t.language ? t.language : null,
          sprecher: typeof t.speaker === "string" && t.speaker ? t.speaker : typeof t.speaker === "number" ? String(t.speaker) : null,
          anfang: anfang || /^\s/.test(text),
        };
        anfang = false;
        if (t.is_final === true) {
          endgueltig = haengeAn(endgueltig, kompakt(text));
          endgueltigeWoerter.push(wort);
          neueAeusserung = false;
          if (wort.sprache) sprachen.push(wort.sprache);
        } else {
          vorlaeufig += text;
          vorlaeufigeWoerter.push(wort);
        }
      }
      if (paket.finished === true) fertig = true;
      return stand();
    },
  };
}

// --- Diktat ins Eingabefeld ---------------------------------------------------

/** Haengt diktierten Text an das an, was schon im Feld stand.
 *
 *  Bis zum 24.09.2026 ERSETZTE das Diktat den Inhalt: wer nach einer
 *  Denkpause weiterdiktierte, verlor den ersten Teil - und alles, was vorher
 *  getippt war. Gelesen wurde das als "die Erkennung vergisst die Haelfte". */
export function haengeDiktatAn(basis: string, diktat: string): string {
  const neu = diktat.trim();
  if (!neu) return basis;
  if (!basis.trim()) return neu;
  return /\s$/.test(basis) ? basis + neu : `${basis} ${neu}`;
}
