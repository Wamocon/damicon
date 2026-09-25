"use client";

// Vorlesen als Strom: der Browser spricht direkt mit dem Soniox-TTS-WebSocket.
// Protokoll, Grenzen und die Gruende dafuer: domain/sprachausgabe-strom.ts.
//
// Kurz: Text geht satzweise in einen Strom, das Audio kommt als PCM zurueck,
// waehrend es entsteht, und wird ohne Luecke auf einer Zeitachse eingeplant.
// Kein Abschnitt wartet mehr auf seine ganze Datei, und die Stimme spricht
// ueber Satzgrenzen hinweg mit einer Satzmelodie.
//
// Regeln, die dieser Sprecher selbst einhaelt:
//
//   1. IMMER NUR EIN STROM. Soniox erzeugt mehrere Stroeme einer Verbindung
//      gleichzeitig; ihr Ton kaeme verschraenkt an und klaenge als Satzsalat
//      (Pruefung vom 24.09.2026). Text, den der laufende Strom nicht mehr nimmt
//      (2-Minuten-Grenze, andere Sprache, Strom nach einer Werkzeugpause
//      beendet), wartet, bis dieser Strom fertig ist. Das haelt auch die
//      Grenze von 3 gleichzeitigen Stroemen der ganzen Organisation ein.
//   2. EIN SCHLUESSEL JE STROM, nur gegen Nachweis (api/ki-sprachausgabe/
//      schluessel). Einer liegt auf Vorrat, damit kein Strom auf seinen
//      Schluessel warten muss.
//   3. SOFORT STILL: stopp() bricht den Strom ab (cancel) und stoppt jedes
//      eingeplante Stueck. Die Verbindung bleibt offen - die naechste Frage
//      kommt oft gleich und spart sich den Verbindungsaufbau.
//   4. FEHLER: was noch nicht geklungen hat (geschaetzt aus der Tondauer),
//      geht in einen neuen Strom (Schluessel abgelaufen, Pausenkuerzung
//      abgelehnt, 408/413) oder an den bisherigen Weg ueber Abschnitte
//      (alles andere).
import { ausgangFuer } from "@/lib/ausgabe-pegel";
import {
  KEEPALIVE_NACHRICHT,
  STROM_ABTASTRATE,
  STROM_KEEPALIVE_MS,
  STROM_RUHE_MS,
  STROM_VORLAUF_S,
  ZEICHEN_JE_SEKUNDE,
  abbruchNachricht,
  base64ZuBytes,
  brauchtNeuenStrom,
  endeNachricht,
  folgeAufFehler,
  leseStromNachricht,
  naechsterStart,
  naechsterVorlauf,
  pcmZuFloat,
  schluesselNochGut,
  startNachricht,
  textNachricht,
  ungesprocheneTexte,
  type StromKonfiguration,
  type StromNachweis,
} from "@/lib/domain/sprachausgabe-strom";
import { satzBeiPosition } from "@/lib/domain/sprachmodus-mitlesen";

/** Ein Schluessel fuer einen Strom; Stimme und Tempo stehen je Sprache in
 *  `konfigurationen`. */
type Zugang = { schluessel: string; adresse: string; konfigurationen: Record<string, StromKonfiguration>; gueltigBis: number };

// --- Je Tab geteilt ----------------------------------------------------------------

// Sagt die Route "nicht aktiv" (kein Soniox, Strom aus), fragt dieser Tab nicht
// wieder - dann spricht immer der Abschnitts-Weg. Ein Neuladen fragt neu.
let abgesagt = false;
// Kommt die Verbindung zweimal hintereinander nicht zustande (Proxy blockt
// WebSockets), nimmt dieser Tab den Abschnitts-Weg - sonst wartete jede Frage
// erneut bis zur Frist, bevor sie vorgelesen wird.
let verbindungsFehler = 0;
const VERBINDUNGSFEHLER_GRENZE = 2;
// Soniox hat reduce_silence abgelehnt: fuer diesen Tab ohne.
let ohneStilleKuerzen = false;

/** Kommt der Strom ueberhaupt in Frage? */
export function stromMoeglich(): boolean {
  return !abgesagt && verbindungsFehler < VERBINDUNGSFEHLER_GRENZE && typeof WebSocket !== "undefined";
}

function nachweisKoerper(n: StromNachweis): string {
  return JSON.stringify(n.art === "zug" ? { zug: n.zug, ablauf: n.ablauf, sig: n.sig } : { nachrichtId: n.nachrichtId });
}

async function frageSchluessel(nachweis: StromNachweis): Promise<Zugang | null> {
  try {
    const antwort = await fetch("/api/ki-sprachausgabe/schluessel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: nachweisKoerper(nachweis),
    });
    if (antwort.status === 404) {
      abgesagt = true;
      return null;
    }
    if (!antwort.ok) return null;
    const j = (await antwort.json()) as { schluessel?: unknown; adresse?: unknown; konfigurationen?: unknown; gueltigMs?: unknown };
    if (typeof j.schluessel !== "string" || typeof j.adresse !== "string" || !j.konfigurationen || typeof j.gueltigMs !== "number") return null;
    return {
      schluessel: j.schluessel,
      adresse: j.adresse,
      konfigurationen: j.konfigurationen as Record<string, StromKonfiguration>,
      gueltigBis: Date.now() + j.gueltigMs,
    };
  } catch {
    return null;
  }
}

// --- Ein Sprecher je Chat --------------------------------------------------------------

export interface StromZustand {
  /** Text ist unterwegs, aber gerade klingt nichts. */
  laedt: boolean;
  /** Ton klingt. */
  spricht: boolean;
}

export interface StromRueckmeldung {
  beiZustand(zustand: StromZustand): void;
  /** Der Strom gibt auf. `ungesprochen`: so viele der zuletzt uebergebenen
   *  Texte haben (geschaetzt) noch nicht geklungen - die uebernimmt der
   *  Abschnitts-Weg. Danach nimmt dieser Durchgang keinen Text mehr an. */
  beiAufgabe(grund: string, ungesprochen: number): void;
}

/** Wo die Stimme in dieser Runde gerade ist (geschaetzt, siehe stand()). */
export interface SprechStand {
  /** Der Satz, der gerade klingt. `anzahl`: alles ist gesprochen (Ende der Runde
   *  bis jetzt) - dann ist es genau `anzahl`. */
  index: number;
  /** So viele Saetze hat diese Runde bis jetzt an den Sprecher gegeben. */
  anzahl: number;
  /** Der Satz, wie er auf der Seite steht (nicht die Sprechfassung). */
  satz: string | null;
}

export interface StromSprecher {
  /** Womit der Schluessel geholt wird. Holt gleich einen auf Vorrat. */
  setzeNachweis(nachweis: StromNachweis): void;
  /** `anzeige`: der Satz, wie ihn der Nutzer liest (ohne Sprechfassung) - fuer
   *  das Mitlesen im Sprachmodus. */
  sprich(text: string, sprache: string, anzeige?: string): void;
  /** Wo die Stimme ist. Null ohne Ton oder ohne Saetze. */
  stand(): SprechStand | null;
  /** Kein Text mehr fuer diese Antwort: der laufende Strom wird beendet. */
  ende(): void;
  /** Sofort still, alles verwerfen. */
  stopp(): void;
  /** Hat dieser Durchgang aufgegeben? */
  aufgegeben(): boolean;
}

type Strom = {
  id: string;
  sprache: string;
  tempo: number | undefined;
  texte: string[];
  zeichen: number;
  endeGesendet: boolean;
  hatAudio: boolean;
  audioSekunden: number;
  pcmRest: number | null;
  zuletzt: number;
};

type Wartend = { text: string; sprache: string };

// Gemessene Sprechgeschwindigkeit (Zeichen je Sekunde bei Tempo 1), aus jedem
// fertigen Strom nachgefuehrt und je Tab geteilt: die feste Schaetzung
// (ZEICHEN_JE_SEKUNDE) trifft je Stimme und Sprache nur grob.
let gemesseneRate: number | null = null;

const VERBINDEN_MS = 4_000;
/** Kommt nach dem Ende eines Stroms so lange nichts mehr, gilt er als beendet -
 *  sonst hinge die Anzeige "laedt" an einem Strom, dessen Abschluss verloren ging. */
const STROM_NACHLAUF_MS = 12_000;
/** Ohne Strom so lange offen bleiben (die naechste Frage kommt oft gleich).
 *  Soniox schliesst eine Verbindung ohne Strom nach etwa 40 s trotz Keepalive. */
const VERBINDUNG_LEERLAUF_MS = 20_000;
/** So oft je Durchgang wird ein Strom ersetzt (Schluessel, Pausenkuerzung,
 *  408/413), bevor der Sprecher aufgibt - gegen eine Endlosschleife. */
const HOECHSTENS_ERSATZ = 3;

let stromZaehler = 0;
function neueStromId(): string {
  stromZaehler += 1;
  return `d${stromZaehler}-${Math.random().toString(36).slice(2, 10)}`;
}

export function erzeugeStromSprecher(kontext: () => AudioContext | null, rueck: StromRueckmeldung): StromSprecher {
  let durchgang = 0;
  let ws: WebSocket | null = null;
  let wsAdresse = "";
  let wsOeffnet: Promise<WebSocket> | null = null;
  let keepalive: ReturnType<typeof setInterval> | undefined;
  let leerlauf: ReturnType<typeof setTimeout> | undefined;
  let ruhe: ReturnType<typeof setTimeout> | undefined;
  let aufsicht: ReturnType<typeof setInterval> | undefined;

  let nachweis: StromNachweis | null = null;
  let vorrat: Zugang | null = null;
  let vorratUnterwegs: Promise<Zugang | null> | null = null;

  let aktiv: Strom | null = null;
  let ausstehend: Wartend[] = [];
  let rundeOffen = false;
  let arbeitet = false;
  let hatAufgegeben = false;
  let ersetzt = 0;

  const geplant = new Set<AudioBufferSourceNode>();
  // Fuer stand(): wann jedes eingeplante Stueck beginnt, wie viel Ton schon ganz
  // gespielt ist, und was die Runde bisher gesprochen haben soll.
  const startZeiten = new Map<AudioBufferSourceNode, number>();
  let fertigSekunden = 0;
  let verlauf: Array<{ anzeige: string; zeichen: number }> = [];
  let letztesTempo = 1;
  let zeitEnde = 0;
  let vorlauf = STROM_VORLAUF_S;
  let gemeldet: StromZustand = { laedt: false, spricht: false };

  function melde(): void {
    const spricht = geplant.size > 0;
    const laedt = !spricht && (ausstehend.length > 0 || aktiv !== null || arbeitet);
    if (spricht === gemeldet.spricht && laedt === gemeldet.laedt) return;
    gemeldet = { laedt, spricht };
    rueck.beiZustand(gemeldet);
  }

  // --- Schluessel ------------------------------------------------------------------

  function fuelleVorrat(): void {
    if (vorrat && schluesselNochGut(vorrat.gueltigBis, Date.now())) return;
    if (vorratUnterwegs || !nachweis || !stromMoeglich()) return;
    const anfrage = frageSchluessel(nachweis);
    vorratUnterwegs = anfrage;
    void anfrage.then((z) => {
      if (vorratUnterwegs === anfrage) vorratUnterwegs = null;
      if (z) vorrat = z;
    });
  }

  /** Einen Schluessel nehmen - den Vorrat, sonst einen frischen. Danach wird
   *  nachgefuellt, solange diese Antwort noch Stroeme brauchen koennte. */
  async function nimmSchluessel(): Promise<Zugang | null> {
    const gut = (k: Zugang | null | undefined): k is Zugang => !!k && schluesselNochGut(k.gueltigBis, Date.now());
    let z: Zugang | null = gut(vorrat) ? vorrat : null;
    if (!z && vorratUnterwegs) {
      const erwartet = await vorratUnterwegs;
      z = gut(erwartet) ? erwartet : null;
    }
    if (!z && nachweis) {
      const frisch = await frageSchluessel(nachweis);
      z = gut(frisch) ? frisch : null;
    }
    // Genommen (oder abgelaufen): der Vorrat ist leer.
    vorrat = null;
    if (z && rundeOffen) fuelleVorrat();
    return z;
  }

  // --- Verbindung ------------------------------------------------------------------

  function schliesseVerbindung(): void {
    clearInterval(keepalive);
    clearTimeout(leerlauf);
    keepalive = undefined;
    const alt = ws;
    ws = null;
    wsOeffnet = null;
    wsAdresse = "";
    if (alt) {
      alt.onmessage = null;
      alt.onclose = null;
      alt.onerror = null;
      try {
        alt.close();
      } catch {
        // schon zu
      }
    }
  }

  function sende(nachricht: Record<string, unknown>): boolean {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    try {
      ws.send(JSON.stringify(nachricht));
      return true;
    } catch {
      return false;
    }
  }

  function planeLeerlauf(): void {
    clearTimeout(leerlauf);
    if (aktiv || ausstehend.length > 0 || rundeOffen || arbeitet) return;
    leerlauf = setTimeout(() => {
      if (!aktiv && ausstehend.length === 0 && !rundeOffen && !arbeitet) schliesseVerbindung();
    }, VERBINDUNG_LEERLAUF_MS);
  }

  function verbinde(adresse: string): Promise<WebSocket> {
    if (ws && ws.readyState === WebSocket.OPEN && wsAdresse === adresse) return Promise.resolve(ws);
    if (wsOeffnet && wsAdresse === adresse) return wsOeffnet;
    schliesseVerbindung();
    wsAdresse = adresse;
    wsOeffnet = new Promise<WebSocket>((ja, nein) => {
      let socket: WebSocket;
      try {
        socket = new WebSocket(adresse);
      } catch (f) {
        verbindungsFehler += 1;
        nein(f);
        return;
      }
      ws = socket;
      let offen = false;
      let gescheitert = false;
      // Ein gescheiterter Aufbau darf nicht zwischengespeichert bleiben - sonst
      // bekaeme jeder weitere Versuch sofort dieselbe Absage, ohne neu zu verbinden.
      const scheitere = (grund: string) => {
        if (offen || gescheitert) return;
        gescheitert = true;
        clearTimeout(frist);
        verbindungsFehler += 1;
        if (ws === socket) {
          ws = null;
          wsOeffnet = null;
          wsAdresse = "";
          try {
            socket.close();
          } catch {
            // schon zu
          }
        }
        nein(new Error(grund));
      };
      const frist = setTimeout(() => scheitere("verbinden-zeitueberschreitung"), VERBINDEN_MS);
      socket.onopen = () => {
        offen = true;
        clearTimeout(frist);
        verbindungsFehler = 0;
        clearInterval(keepalive);
        keepalive = setInterval(() => sende({ ...KEEPALIVE_NACHRICHT }), STROM_KEEPALIVE_MS);
        ja(socket);
      };
      socket.onmessage = (ereignis) => beiNachricht(ereignis);
      socket.onerror = () => scheitere("websocket-fehler");
      socket.onclose = () => {
        if (!offen) {
          scheitere("websocket-geschlossen");
          return;
        }
        if (ws !== socket) return;
        ws = null;
        wsOeffnet = null;
        clearInterval(keepalive);
        // Unerwartet zu (Netzwechsel, Dienst): was noch nicht geklungen hat,
        // uebernimmt der Abschnitts-Weg; was schon eingeplant ist, spielt zu Ende.
        if (aktiv || ausstehend.length > 0 || rundeOffen) {
          gebeAuf("verbindung-geschlossen", ungesprochenGesamt());
        }
      };
    });
    wsOeffnet.catch(() => {});
    return wsOeffnet;
  }

  // --- Stroeme ----------------------------------------------------------------------

  /** Was insgesamt noch nicht geklungen hat: der Rest des laufenden Stroms
   *  (geschaetzt) und alles, was noch wartet. */
  function ungesprochenGesamt(): number {
    const imStrom = aktiv ? (aktiv.hatAudio ? ungesprocheneTexte(aktiv.texte, aktiv.audioSekunden, aktiv.tempo) : aktiv.texte.length) : 0;
    return imStrom + ausstehend.length;
  }

  function gebeAuf(grund: string, ungesprochen: number): void {
    if (hatAufgegeben) return;
    hatAufgegeben = true;
    clearTimeout(ruhe);
    if (aktiv) sende(abbruchNachricht(aktiv.id));
    aktiv = null;
    ausstehend = [];
    melde();
    rueck.beiAufgabe(grund, ungesprochen);
  }

  /** Den laufenden Strom ersetzen: was von ihm noch nicht geklungen hat, kommt
   *  vorn in die Warteschlange, und ein neuer Strom uebernimmt. */
  function ersetzeAktiv(grund: string): void {
    const alt = aktiv;
    if (!alt) return;
    const rest = alt.hatAudio ? ungesprocheneTexte(alt.texte, alt.audioSekunden, alt.tempo) : alt.texte.length;
    const zurueck = alt.texte.slice(alt.texte.length - rest).map((text) => ({ text, sprache: alt.sprache }));
    aktiv = null;
    ersetzt += 1;
    ausstehend = [...zurueck, ...ausstehend];
    if (ersetzt > HOECHSTENS_ERSATZ) {
      gebeAuf(`zu-oft-ersetzt:${grund}`, ausstehend.length);
      return;
    }
    void pumpe(durchgang);
  }

  function beendeAktiv(): void {
    if (!aktiv || aktiv.endeGesendet) return;
    aktiv.endeGesendet = true;
    aktiv.zuletzt = Date.now();
    sende(endeNachricht(aktiv.id));
  }

  function planeRuhe(): void {
    clearTimeout(ruhe);
    ruhe = setTimeout(() => {
      // Eine Weile kein Text (Werkzeug laeuft): Strom ordentlich beenden, bevor
      // Soniox ihn mit 408 abbricht. Der naechste Satz oeffnet einen neuen.
      if (ausstehend.length === 0) beendeAktiv();
    }, STROM_RUHE_MS);
  }

  /** Neuen Strom oeffnen (ohne Text). false, wenn es nicht ging. */
  async function oeffneStrom(sprache: string, meinDurchgang: number): Promise<boolean> {
    const z = await nimmSchluessel();
    if (meinDurchgang !== durchgang) return true;
    const vorgabe = z?.konfigurationen[sprache];
    if (!z || !vorgabe) return false;
    try {
      await verbinde(z.adresse);
    } catch {
      return false;
    }
    if (meinDurchgang !== durchgang) return true;
    const konfiguration: StromKonfiguration = { ...vorgabe };
    if (ohneStilleKuerzen) delete konfiguration.reduce_silence;
    const id = neueStromId();
    if (!sende(startNachricht(z.schluessel, id, konfiguration))) return false;
    clearTimeout(leerlauf);
    letztesTempo = konfiguration.speed && konfiguration.speed > 0 ? konfiguration.speed : 1;
    aktiv = {
      id,
      sprache,
      tempo: konfiguration.speed,
      texte: [],
      zeichen: 0,
      endeGesendet: false,
      hatAudio: false,
      audioSekunden: 0,
      pcmRest: null,
      zuletzt: Date.now(),
    };
    beaufsichtige();
    return true;
  }

  /** Arbeitet die Warteschlange ab: Text in den laufenden Strom, oder - wenn der
   *  ihn nicht nimmt - den laufenden beenden und warten, bis er fertig ist.
   *  Laeuft nie doppelt (arbeitet). */
  async function pumpe(meinDurchgang: number): Promise<void> {
    if (arbeitet) return;
    arbeitet = true;
    try {
      while (meinDurchgang === durchgang && !hatAufgegeben && ausstehend.length > 0) {
        const naechster = ausstehend[0]!;
        if (aktiv) {
          const nimmt =
            !aktiv.endeGesendet &&
            aktiv.sprache === naechster.sprache &&
            !brauchtNeuenStrom(aktiv.zeichen, naechster.text.length, aktiv.tempo);
          if (nimmt && sende(textNachricht(aktiv.id, naechster.text))) {
            aktiv.texte.push(naechster.text);
            aktiv.zeichen += naechster.text.length;
            aktiv.zuletzt = Date.now();
            ausstehend.shift();
            continue;
          }
          // Der laufende Strom ist voll oder spricht eine andere Sprache: er
          // wird beendet, und der Rest wartet, bis er fertig ist (Regel 1). Ging
          // das Senden nicht, ist die Verbindung weg - onclose raeumt auf.
          if (!nimmt) beendeAktiv();
          break;
        }
        const ok = await oeffneStrom(naechster.sprache, meinDurchgang);
        if (meinDurchgang !== durchgang || hatAufgegeben) return;
        if (!ok) {
          gebeAuf("oeffnen-gescheitert", ungesprochenGesamt());
          return;
        }
      }
      if (meinDurchgang !== durchgang || hatAufgegeben) return;
      if (aktiv && !aktiv.endeGesendet && ausstehend.length === 0) {
        if (!rundeOffen) beendeAktiv();
        else planeRuhe();
      }
    } finally {
      if (meinDurchgang === durchgang) arbeitet = false;
      melde();
      planeLeerlauf();
    }
  }

  function beaufsichtige(): void {
    if (aufsicht) return;
    aufsicht = setInterval(() => {
      if (aktiv && aktiv.endeGesendet && Date.now() - aktiv.zuletzt > STROM_NACHLAUF_MS) {
        aktiv = null;
        melde();
        void pumpe(durchgang);
      }
      if (!aktiv && ausstehend.length === 0 && !rundeOffen && geplant.size === 0) {
        clearInterval(aufsicht);
        aufsicht = undefined;
        planeLeerlauf();
      }
    }, 2_000);
  }

  // --- Ton ----------------------------------------------------------------------------

  function spiele(werte: Float32Array): void {
    const ctx = kontext();
    if (!ctx || werte.length === 0) return;
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    const puffer = ctx.createBuffer(1, werte.length, STROM_ABTASTRATE);
    puffer.getChannelData(0).set(werte);
    const quelle = ctx.createBufferSource();
    quelle.buffer = puffer;
    quelle.connect(ausgangFuer(ctx));
    // Aussetzer: die Zeitachse ist abgelaufen, bevor das naechste Stueck kam.
    // Dann mehr Vorlauf, damit es nicht bei jeder kleinen Schwankung stockt.
    if (zeitEnde > 0 && zeitEnde < ctx.currentTime) vorlauf = naechsterVorlauf(vorlauf);
    const start = naechsterStart(zeitEnde, ctx.currentTime, vorlauf);
    quelle.start(start);
    zeitEnde = start + puffer.duration;
    geplant.add(quelle);
    startZeiten.set(quelle, start);
    quelle.onended = () => {
      geplant.delete(quelle);
      startZeiten.delete(quelle);
      fertigSekunden += puffer.duration;
      melde();
    };
    melde();
  }

  function beiNachricht(ereignis: MessageEvent): void {
    if (typeof ereignis.data !== "string") return;
    let roh: unknown;
    try {
      roh = JSON.parse(ereignis.data);
    } catch {
      return;
    }
    const e = leseStromNachricht(roh);
    if (e.art === "unbekannt") return;
    if (e.art === "fehler") return beiFehler(e);
    // Nur der laufende Strom zaehlt. Nachrichten abgebrochener oder ersetzter
    // Stroeme (auch ihr terminated) kommen hier nicht durch - wie im offiziellen SDK.
    if (!aktiv || e.stream !== aktiv.id) return;
    aktiv.zuletzt = Date.now();
    if (e.art === "audio") {
      const { werte, rest } = pcmZuFloat(base64ZuBytes(e.audio), aktiv.pcmRest);
      aktiv.pcmRest = rest;
      aktiv.hatAudio = true;
      aktiv.audioSekunden += werte.length / STROM_ABTASTRATE;
      spiele(werte);
    } else if (e.art === "beendet") {
      // Ganzer Strom gehoert: daraus die tatsaechliche Sprechgeschwindigkeit.
      if (aktiv.zeichen >= 60 && aktiv.audioSekunden >= 3) {
        const messwert = aktiv.zeichen / aktiv.audioSekunden / (aktiv.tempo && aktiv.tempo > 0 ? aktiv.tempo : 1);
        gemesseneRate = gemesseneRate === null ? messwert : (gemesseneRate + messwert) / 2;
      }
      aktiv = null;
      melde();
      void pumpe(durchgang);
    }
  }

  function beiFehler(e: { stream: string | null; code: number; typ: string; text: string }): void {
    const folge = folgeAufFehler(e);
    console.warn("[damicon] Vorlese-Strom: Soniox meldet", e.code, e.typ);
    // Fehler ohne Strom oder zu einem Strom, der nicht mehr laeuft (etwa "Stream
    // not found" fuer den Text eines gerade abgelehnten Starts): nicht auf den
    // laufenden Strom beziehen. Ein Verbindungsfehler zeigt sich in onclose.
    if (!aktiv || e.stream !== aktiv.id) {
      if (folge === "neuer-schluessel") vorrat = null;
      return;
    }
    if (folge === "aufgeben") return gebeAuf(`dienst-${e.code || e.typ}`, ungesprochenGesamt());
    if (folge === "ohne-stillekuerzung") ohneStilleKuerzen = true;
    if (folge === "neuer-schluessel") vorrat = null;
    // Neuer Strom fuer den Rest: Schluessel abgelaufen, Pausenkuerzung
    // abgelehnt, zu lange kein Text (408) oder 2 Minuten erreicht (413).
    ersetzeAktiv(folge);
  }

  return {
    setzeNachweis(n) {
      nachweis = n;
      fuelleVorrat();
    },

    sprich(text, sprache, anzeige) {
      const t = text.trim();
      if (!t || hatAufgegeben) return;
      rundeOffen = true;
      clearTimeout(ruhe);
      verlauf.push({ anzeige: (anzeige ?? t).trim(), zeichen: t.length });
      ausstehend.push({ text: t, sprache });
      melde();
      void pumpe(durchgang);
    },

    ende() {
      rundeOffen = false;
      clearTimeout(ruhe);
      if (!arbeitet && aktiv && ausstehend.length === 0) beendeAktiv();
      melde();
      planeLeerlauf();
    },

    stopp() {
      durchgang += 1;
      clearTimeout(ruhe);
      if (aktiv) sende(abbruchNachricht(aktiv.id));
      aktiv = null;
      ausstehend = [];
      rundeOffen = false;
      arbeitet = false;
      hatAufgegeben = false;
      ersetzt = 0;
      for (const q of geplant) {
        q.onended = null;
        try {
          q.stop();
        } catch {
          // schon gestoppt
        }
      }
      geplant.clear();
      startZeiten.clear();
      fertigSekunden = 0;
      verlauf = [];
      zeitEnde = 0;
      vorlauf = STROM_VORLAUF_S;
      melde();
      planeLeerlauf();
    },

    stand() {
      const ctx = kontext();
      if (!ctx || verlauf.length === 0) return null;
      const anzahl = verlauf.length;
      const nichtsOffen = geplant.size === 0 && !aktiv && ausstehend.length === 0 && !arbeitet;
      if (nichtsOffen) return { index: anzahl, anzahl, satz: null };
      let gespielt = fertigSekunden;
      const erstes = geplant.values().next().value;
      if (erstes) gespielt += Math.max(0, ctx.currentTime - (startZeiten.get(erstes) ?? ctx.currentTime));
      const position = gespielt * (gemesseneRate ?? ZEICHEN_JE_SEKUNDE) * letztesTempo;
      const index = satzBeiPosition(
        verlauf.map((v) => v.zeichen),
        position,
      );
      return { index, anzahl, satz: verlauf[index]?.anzeige ?? null };
    },

    aufgegeben: () => hatAufgegeben,
  };
}
