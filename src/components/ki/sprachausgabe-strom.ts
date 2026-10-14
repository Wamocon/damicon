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
//      beendet), wartet, bis dieser Strom fertig ist. Das gilt je Sprecher,
//      also je Chat und Tab - die Grenze von 3 gleichzeitigen Stroemen gilt
//      dagegen fuer die ganze Soniox-Organisation, und die haelt diese Regel
//      NICHT ein (bis zum 29.09.2026 stand hier das Gegenteil, Cleanup-Fund 28).
//      Lassen mehr als drei Personen oder Tabs zugleich vorlesen, lehnt Soniox
//      den vierten Strom ab, und dessen Rest geht an den Abschnitts-Weg (Regel 4).
//      Eine bekannte Kapazitaetsgrenze, kein stiller Fehler.
//   2. EIN SCHLUESSEL JE STROM, nur gegen Nachweis (api/ki-sprachausgabe/
//      schluessel). Einer liegt auf Vorrat, damit kein Strom auf seinen
//      Schluessel warten muss.
//   3. SOFORT STILL: stopp() bricht den Strom ab (cancel) und stoppt jedes
//      eingeplante Stueck. Die Verbindung bleibt offen - die naechste Frage
//      kommt oft gleich und spart sich den Verbindungsaufbau. Erst schliesse()
//      (beim Abbau des Chats) gibt auch sie frei.
//   4. FEHLER: was noch nicht geklungen hat (geschaetzt aus der Tondauer),
//      geht in einen neuen Strom (Schluessel abgelaufen, Pausenkuerzung
//      abgelehnt, 408/413) oder an den bisherigen Weg ueber Abschnitte
//      (alles andere).
import { ausgangFuer } from "@/lib/ausgabe-pegel";
import {
  AUSSETZER_BIS_SPARSAM,
  KEEPALIVE_NACHRICHT,
  STROM_KEEPALIVE_MS,
  STROM_RUHE_MS,
  STROM_VORLAUF_S,
  ZEICHEN_JE_SEKUNDE,
  abbruchNachricht,
  abtastrateFuer,
  aussetzerHoerbar,
  base64ZuBytes,
  brauchtNeuenStrom,
  endeNachricht,
  folgeAufFehler,
  langsameVerbindung,
  leseStromNachricht,
  naechsterStart,
  naechsterVorlauf,
  pcmZuFloat,
  schluesselNochGut,
  startNachricht,
  textNachricht,
  ungesprocheneTexte,
  nochNichtBegonnen,
  type StromKonfiguration,
  type StromNachweis,
  type VerbindungsInfo,
} from "@/lib/domain/sprachausgabe-strom";
import { satzBeiPosition } from "@/lib/domain/sprachmodus-mitlesen";
import type { GebundenesZiel } from "@/components/ki/sprach-mitlesen";

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
// Aussetzer in diesem Tab: ab AUSSETZER_BIS_SPARSAM spricht Himbi mit 16 kHz (langsames Netz).
let aussetzerImTab = 0;

function sparsamSprechen(): boolean {
  const verbindung = typeof navigator === "undefined" ? null : (navigator as Navigator & { connection?: VerbindungsInfo }).connection;
  return aussetzerImTab >= AUSSETZER_BIS_SPARSAM || langsameVerbindung(verbindung);
}

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
  /** Haelt der Sprachmodus die Stimme gerade an (Seitenwechsel)? Dann setzt ein
   *  neues Stueck den angehaltenen AudioContext nicht von selbst fort. */
  gehalten?(): boolean;
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
  /** Die Stelle, auf die seine Sprechmarke zeigt (domain/sprechmarken.ts). */
  ziel?: GebundenesZiel | null;
  /** Der Satz davor: der Sprachmodus prueft Himbis Echo gegen beide (Befehle, Freigabe). */
  vorher?: string | null;
}

export interface StromSprecher {
  /** Womit der Schluessel geholt wird. Holt gleich einen auf Vorrat. */
  setzeNachweis(nachweis: StromNachweis): void;
  /** `anzeige`: der Satz, wie ihn der Nutzer liest (ohne Sprechfassung) - fuer
   *  das Mitlesen im Sprachmodus. */
  sprich(text: string, sprache: string, anzeige?: string, ziel?: GebundenesZiel | null): void;
  /** Wo die Stimme ist. Null ohne Ton oder ohne Saetze. */
  stand(): SprechStand | null;
  /** Kein Text mehr fuer diese Antwort: der laufende Strom wird beendet. */
  ende(): void;
  /** Sofort still, alles verwerfen. Die Verbindung bleibt fuer die naechste Frage offen. */
  stopp(): void;
  /** Wie stopp(), dazu Verbindung, Keepalive, Aufsicht und Vorrat sofort freigeben -
   *  fuer den Abbau des Chats. Danach baut der naechste Satz neu auf. */
  schliesse(): void;
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
  /** So viele Texte gingen an diesen Strom, seit zuletzt Ton von ihm kam: die haben sicher
   *  noch nicht geklungen (siehe saetzeBeiStille). */
  texteOhneTon: number;
  pcmRest: number | null;
  zuletzt: number;
  /** Abtastrate dieses Stroms (24 kHz, bei langsamem Netz 16 kHz). */
  abtastrate: number;
};

type Wartend = { text: string; sprache: string };

// Gemessene Sprechgeschwindigkeit (Zeichen je Sekunde bei Tempo 1), aus jedem
// fertigen Strom nachgefuehrt und je Tab geteilt: die feste Schaetzung
// (ZEICHEN_JE_SEKUNDE) trifft je Stimme und Sprache nur grob. Seit 29.09.2026 je
// Sprache (Cleanup-Fund 29) - vorher ein Wert fuer alle, und die bedaechtige
// deutsche Stimme zog das Mitlesen einer russischen Antwort einen Satz zurueck.
//
// Nur fuer stand() (was hat der Hoerer GEHOERT, aus dem gespielten Ton). Die
// Uebergabe an einen Ersatzstrom oder den Rueckfall (ungesprocheneTexte) fragt
// etwas anderes - wofuer kam schon Ton AN - und bleibt bewusst bei der festen,
// vorsichtigen Rate: lieber einen Satz doppelt als einen verlieren.
const gemesseneRaten = new Map<string, number>();

const VERBINDEN_MS = 4_000;
/** So lange still nach dem letzten Ton: dann gilt alles Uebergebene als gesagt.
 *  Kuerzer als eine echte Satzpause des Stroms, laenger als ein Aussetzer. */
const STILL_FERTIG_MS = 350;
/** So lange still: dann gilt auch ein Satz als gesagt, dessen Ton laut Schaetzung noch nicht
 *  begonnen hat (nochNichtBegonnen irrt dort nur bei sehr kurzen Saetzen, und dann soll eine
 *  Handlung nicht bis zum Strom-Ende warten). Laenger als eine Soniox-Pause zwischen zwei Saetzen. */
const STILL_SICHER_MS = 1_500;
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

/** Das Tempo eines Stroms als Faktor; ohne (gueltige) Angabe 1. */
function tempoFaktor(tempo: number | undefined): number {
  return tempo && tempo > 0 ? tempo : 1;
}

/** Ein Satz der Runde, wie stand() ihn braucht. */
type Satz = { anzeige: string; zeichen: number; ziel: GebundenesZiel | null };

// Ein Sprecher besteht aus drei Teilen mit eigenem Zustand - Schluessel-Vorrat, Verbindung,
// Tonspur - und dem Ablauf (laufender Strom, Warteschlange, Runde). Die Schritte des Ablaufs
// (pumpe, gebeAuf, beiNachricht ...) stehen weiter unten als eigene Funktionen und bekommen
// den Sprecher ausdruecklich; erzeugeStromSprecher ganz unten setzt alles zusammen.

/** Was ein Sprecher gerade tut. */
type Ablauf = {
  /** Zaehlt jedes stopp(): Rueckrufe eines alten Durchgangs tun danach nichts mehr. */
  durchgang: number;
  aktiv: Strom | null;
  ausstehend: Wartend[];
  rundeOffen: boolean;
  /** pumpe() laeuft (nie doppelt). */
  arbeitet: boolean;
  hatAufgegeben: boolean;
  /** So oft wurde in diesem Durchgang ein Strom ersetzt (HOECHSTENS_ERSATZ). */
  ersetzt: number;
  /** Beendet einen Strom, der eine Weile keinen Text bekommt (planeRuhe). */
  ruhe: ReturnType<typeof setTimeout> | undefined;
  /** Prueft alle 2 s, ob ein beendeter Strom haengt (beaufsichtige). */
  aufsicht: ReturnType<typeof setInterval> | undefined;
  /** Der zuletzt an beiZustand gemeldete Zustand. */
  gemeldet: StromZustand;
};

function neuerAblauf(): Ablauf {
  return {
    durchgang: 0,
    aktiv: null,
    ausstehend: [],
    rundeOffen: false,
    arbeitet: false,
    hatAufgegeben: false,
    ersetzt: 0,
    ruhe: undefined,
    aufsicht: undefined,
    gemeldet: { laedt: false, spricht: false },
  };
}

/** Ein Sprecher: sein Ablauf und die Teile, mit denen er arbeitet. */
type Sprecher = {
  ablauf: Ablauf;
  rueck: StromRueckmeldung;
  vorrat: SchluesselVorrat;
  verbindung: Verbindung;
  ton: Tonspur;
};

// --- Schluessel ------------------------------------------------------------------

/** Die Schluessel eines Sprechers (Regel 2): einer liegt auf Vorrat. */
interface SchluesselVorrat {
  /** Womit der Schluessel geholt wird. Holt gleich einen auf Vorrat. */
  setzeNachweis(nachweis: StromNachweis): void;
  /** Einen Schluessel nehmen; `nachfuellen` sagt danach, ob diese Antwort noch Stroeme brauchen koennte. */
  nimm(nachfuellen: () => boolean): Promise<Zugang | null>;
  /** Der Vorrat taugt nicht mehr (Soniox: Schluessel abgelaufen). */
  verwerfe(): void;
  /** Nachweis und Vorrat freigeben (Abbau des Chats). */
  leere(): void;
}

function erzeugeSchluesselVorrat(): SchluesselVorrat {
  let nachweis: StromNachweis | null = null;
  let vorrat: Zugang | null = null;
  let vorratUnterwegs: Promise<Zugang | null> | null = null;

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
  async function nimmSchluessel(nachfuellen: () => boolean): Promise<Zugang | null> {
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
    if (z && nachfuellen()) fuelleVorrat();
    return z;
  }

  return {
    setzeNachweis(n) {
      nachweis = n;
      fuelleVorrat();
    },
    nimm: nimmSchluessel,
    verwerfe() {
      vorrat = null;
    },
    leere() {
      nachweis = null;
      vorrat = null;
      vorratUnterwegs = null;
    },
  };
}

// --- Verbindung ------------------------------------------------------------------

/** Was die Verbindung vom Sprecher braucht. */
interface VerbindungsRueckrufe {
  beiNachricht(ereignis: MessageEvent): void;
  /** Laeuft noch etwas (Strom, Warteschlange, Runde, pumpe)? Dann bleibt die Verbindung offen. */
  beschaeftigt(): boolean;
  /** Die offene Verbindung ging unerwartet zu. */
  beiUnerwartetZu(): void;
}

/** Die Verbindung zum Soniox-TTS-WebSocket: Aufbau mit Frist, Keepalive und Leerlauf. */
interface Verbindung {
  verbinde(adresse: string): Promise<WebSocket>;
  sende(nachricht: Record<string, unknown>): boolean;
  /** Ohne Arbeit nach VERBINDUNG_LEERLAUF_MS schliessen. */
  planeLeerlauf(): void;
  /** Ein Strom beginnt: kein Leerlauf. */
  halteOffen(): void;
  /** Sofort zu, auch ein laufender Aufbau. */
  schliesse(): void;
}

function erzeugeVerbindung(rueckrufe: VerbindungsRueckrufe): Verbindung {
  let ws: WebSocket | null = null;
  let wsAdresse = "";
  let wsOeffnet: Promise<WebSocket> | null = null;
  let keepalive: ReturnType<typeof setInterval> | undefined;
  let leerlauf: ReturnType<typeof setTimeout> | undefined;
  // Bricht einen laufenden Verbindungsaufbau ab (verbinde), ohne ihn als Fehler zu zaehlen.
  let aufbauAbbrechen: (() => void) | null = null;

  function schliesseVerbindung(): void {
    clearInterval(keepalive);
    clearTimeout(leerlauf);
    keepalive = undefined;
    // Ein Aufbau, der noch laeuft, endet jetzt - sonst lief seine Frist weiter und
    // zaehlte nach 4 s einen Verbindungsfehler, obwohl hier absichtlich geschlossen wurde.
    aufbauAbbrechen?.();
    aufbauAbbrechen = null;
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
    // Ohne Verbindung gibt es nichts zu schliessen.
    if (!ws && !wsOeffnet) return;
    if (rueckrufe.beschaeftigt()) return;
    leerlauf = setTimeout(() => {
      if (!rueckrufe.beschaeftigt()) schliesseVerbindung();
    }, VERBINDUNG_LEERLAUF_MS);
  }

  /** Der Aufbau einer Verbindung, als Rumpf des Versprechens in verbinde(). */
  function baueAuf(adresse: string, ja: (socket: WebSocket) => void, nein: (grund: unknown) => void): void {
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
    const abbrechen = () => {
      if (offen || gescheitert) return;
      gescheitert = true;
      clearTimeout(frist);
      nein(new Error("verbindung-geschlossen"));
    };
    aufbauAbbrechen = abbrechen;
    socket.onopen = () => {
      offen = true;
      if (aufbauAbbrechen === abbrechen) aufbauAbbrechen = null;
      clearTimeout(frist);
      verbindungsFehler = 0;
      clearInterval(keepalive);
      keepalive = setInterval(() => sende({ ...KEEPALIVE_NACHRICHT }), STROM_KEEPALIVE_MS);
      ja(socket);
    };
    socket.onmessage = (ereignis) => rueckrufe.beiNachricht(ereignis);
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
      rueckrufe.beiUnerwartetZu();
    };
  }

  function verbinde(adresse: string): Promise<WebSocket> {
    if (ws && ws.readyState === WebSocket.OPEN && wsAdresse === adresse) return Promise.resolve(ws);
    if (wsOeffnet && wsAdresse === adresse) return wsOeffnet;
    schliesseVerbindung();
    wsAdresse = adresse;
    wsOeffnet = new Promise<WebSocket>((ja, nein) => baueAuf(adresse, ja, nein));
    wsOeffnet.catch(() => {});
    return wsOeffnet;
  }

  return {
    verbinde,
    sende,
    planeLeerlauf,
    halteOffen() {
      clearTimeout(leerlauf);
    },
    schliesse: schliesseVerbindung,
  };
}

// --- Ton ----------------------------------------------------------------------------

/** Die Zeitachse eines Sprechers: plant die PCM-Stuecke lueckenlos auf dem AudioContext
 *  ein und schaetzt aus dem gespielten Ton, wo die Stimme gerade ist (stand). */
interface Tonspur {
  spiele(werte: Float32Array, strom: string, abtastrate: number, nochText?: boolean): void;
  stand(): SprechStand | null;
  /** Ein neuer Satz der Runde. */
  merke(satz: Satz): void;
  /** Tempo und Sprache des Stroms, der gerade beginnt. */
  setzeStimme(tempo: number, sprache: string): void;
  /** Ist Ton eingeplant, der noch nicht verklungen ist? */
  klingt(): boolean;
  /** Jedes eingeplante Stueck stoppen und die Runde vergessen. */
  verstumme(): void;
}

function erzeugeTonspur(kontext: () => AudioContext | null, rueck: StromRueckmeldung, ablauf: Ablauf, melde: () => void): Tonspur {
  const geplant = new Set<AudioBufferSourceNode>();
  // Fuer stand(): wann jedes eingeplante Stueck beginnt, wie viel Ton schon ganz
  // gespielt ist, und was die Runde bisher gesprochen haben soll.
  const startZeiten = new Map<AudioBufferSourceNode, number>();
  let fertigSekunden = 0;
  let verlauf: Satz[] = [];
  let letztesTempo = 1;
  let letzteSprache = "";
  // Seit wann nichts mehr klingt (null: es klingt, oder es hat noch nichts
  // geklungen). Bleibt die Stimme so lange still, ist alles Uebergebene gesagt -
  // auch wenn der Strom fuer den naechsten Satz noch offen ist. Ohne das meldete
  // stand() nie "fertig", solange der Strom offen war (bis zu 4 s), und ein
  // Seitenwechsel kam erst mit dem naechsten Satz.
  let stillSeit: number | null = null;
  // Wie viele Saetze uebergeben waren, als die Stimme verstummte: nur DIESE sind
  // dann gesagt. Ein Satz, der erst waehrend der Stille kommt, ist es noch nicht -
  // und einer, dessen Text zwar an Soniox ging, von dem aber noch kein Ton kam, auch
  // nicht (texteOhneTon). Bis zum 29.09.2026 zaehlte er mit: "Ich klicke jetzt auf
  // Anlegen" galt als gesagt, sobald der Satz davor verklungen war, und die
  // Freigabekarte stand da, bevor Himbi ihn sprach (Messung an der Preview vom
  // 28.09.2026: Karte bei 0 ms, Himbi spricht ab 1,5 bis 2,4 s).
  let saetzeBeiStille = 0;
  // Dasselbe, aber vorsichtig: auch ohne die Saetze, deren Ton nach dem empfangenen Ton noch nicht
  // begonnen haben kann (nochNichtBegonnen). Gegenpruefung vom 29.09.2026: gingen beide Saetze an
  // Soniox, bevor der erste Ton kam, stand texteOhneTon nach dem ersten Ton wieder auf 0, und in der
  // Pause nach dem ersten Satz erschien die Karte doch vor "Ich klicke jetzt auf Anlegen".
  let saetzeBeiStilleSicher = 0;
  // Fester Punkt der Schaetzung: bis zu diesem Satz ist alles gesagt, und so viel
  // Ton war da schon gespielt. An jeder Sprechpause neu gesetzt - sonst summierte
  // sich der Fehler der Zeichenrate ueber viele Saetze, und das Mitlesen zeigte
  // einen Satz zu spaet (Fuehrungstest vom 25.09.2026).
  let anker = { index: 0, sekunden: 0 };
  let letzterStrom: string | null = null;
  let zeitEnde = 0;
  // Der Vorlauf gilt ueber eine Antwort hinaus: wer ein langsames Netz hat, hat es auch bei
  // der naechsten Antwort (bis zum 28.09.2026 begann jede Antwort wieder bei 0,25 s und
  // stockte erneut). Nach einer Antwort ohne Aussetzer halbiert er sich wieder.
  let vorlauf = STROM_VORLAUF_S;
  let aussetzerInRunde = false;

  function spiele(werte: Float32Array, strom: string, abtastrate: number, nochText = false): void {
    const ctx = kontext();
    if (!ctx || werte.length === 0) return;
    if (ctx.state === "suspended" && !rueck.gehalten?.()) void ctx.resume().catch(() => {});
    const puffer = ctx.createBuffer(1, werte.length, abtastrate);
    puffer.getChannelData(0).set(werte);
    const quelle = ctx.createBufferSource();
    quelle.buffer = puffer;
    quelle.connect(ausgangFuer(ctx));
    // Aussetzer: die Zeitachse ist abgelaufen, bevor das naechste Stueck kam.
    // Dann mehr Vorlauf, damit es nicht bei jeder kleinen Schwankung stockt.
    // Nur innerhalb desselben Stroms: eine Pause fuer ein Werkzeug oder ein neuer Strom
    // ist kein Aussetzer (bis zum 25.09.2026 wuchs der Vorlauf nach jeder Werkzeugpause,
    // jeder Satz kam spaeter). Bis zum 28.09.2026 zaehlte dazu nur eine Luecke unter
    // 0,8 s - gemessen mit gedrosseltem Netz waren die Aussetzer aber bis zu 1,1 s lang
    // und liessen den Vorlauf unveraendert. Jetzt zaehlt auch eine laengere Luecke, wenn
    // Soniox noch ungesprochenen Text hatte (dann war es das Netz, keine Pause).
    const luecke = ctx.currentTime - zeitEnde;
    if (zeitEnde > 0 && luecke > 0 && strom === letzterStrom && (luecke < 0.8 || nochText)) {
      vorlauf = naechsterVorlauf(vorlauf);
      aussetzerInRunde = true;
      // Der naechste Strom spricht dann sparsamer (16 kHz), siehe sparsamSprechen() - aber
      // nur nach hoerbaren Luecken, nicht nach Wacklern, die der Vorlauf auffaengt.
      if (aussetzerHoerbar(luecke, nochText)) aussetzerImTab += 1;
    }
    letzterStrom = strom;
    stillSeit = null;
    const start = naechsterStart(zeitEnde, ctx.currentTime, vorlauf);
    quelle.start(start);
    zeitEnde = start + puffer.duration;
    geplant.add(quelle);
    startZeiten.set(quelle, start);
    quelle.onended = () => beiEnde(quelle, puffer);
    melde();
  }

  function beiEnde(quelle: AudioBufferSourceNode, puffer: AudioBuffer): void {
    geplant.delete(quelle);
    startZeiten.delete(quelle);
    fertigSekunden += puffer.duration;
    if (geplant.size === 0) merkeStille();
    melde();
  }

  /** Das letzte eingeplante Stueck ist verklungen: festhalten, was bis hierher gesagt ist. */
  function merkeStille(): void {
    const { aktiv, ausstehend } = ablauf;
    stillSeit = performance.now();
    // Nur, was schon an Soniox ging UND schon Ton hatte: ein Satz, der noch in der
    // Warteschlange liegt, hat nicht geklungen, und einer, der nach dem letzten Ton
    // des Stroms hinausging, auch nicht.
    saetzeBeiStille = verlauf.length - ausstehend.length - (aktiv?.texteOhneTon ?? 0);
    const rate = aktiv ? (gemesseneRaten.get(aktiv.sprache) ?? ZEICHEN_JE_SEKUNDE) * tempoFaktor(aktiv.tempo) : 0;
    const nichtBegonnen = aktiv ? nochNichtBegonnen(aktiv.texte, aktiv.audioSekunden, rate) : 0;
    saetzeBeiStilleSicher = Math.min(saetzeBeiStille, verlauf.length - ausstehend.length - nichtBegonnen);
  }

  function stand(): SprechStand | null {
    const ctx = kontext();
    if (!ctx || verlauf.length === 0) return null;
    const anzahl = verlauf.length;
    const { aktiv, ausstehend, arbeitet } = ablauf;
    const nichtsOffen = geplant.size === 0 && !aktiv && ausstehend.length === 0 && !arbeitet;
    if (nichtsOffen && fertigSekunden > 0) return { index: anzahl, anzahl, satz: null };
    // Seit einem Moment still, obwohl schon etwas klang: alles, was VOR der Stille
    // uebergeben war, ist gesagt. Der naechste Satz (index) klingt noch nicht.
    if (geplant.size === 0 && stillSeit !== null && performance.now() - stillSeit >= STILL_FERTIG_MS) {
      const fertig = Math.min(saetzeBeiStille, anzahl);
      // Der Anker (Mitlesen) bleibt bei der alten Zaehlung; nur, was als GESAGT gemeldet wird,
      // ist in der ersten Zeit der Stille vorsichtig.
      anker = { index: fertig, sekunden: fertigSekunden };
      const sicher = performance.now() - stillSeit >= STILL_SICHER_MS ? fertig : Math.max(0, Math.min(saetzeBeiStilleSicher, anzahl));
      return { index: sicher, anzahl, satz: null };
    }
    return schaetze(ctx, anzahl);
  }

  /** Der klingende Satz, geschaetzt aus der gespielten Tondauer. */
  function schaetze(ctx: AudioContext, anzahl: number): SprechStand {
    let gespielt = fertigSekunden;
    const erstes = geplant.values().next().value;
    if (erstes) gespielt += Math.max(0, ctx.currentTime - (startZeiten.get(erstes) ?? ctx.currentTime));
    // Ab dem letzten festen Punkt schaetzen, nicht vom Anfang der Runde.
    const laengen = verlauf.map((v) => v.zeichen);
    const vorAnker = laengen.slice(0, anker.index).reduce((summe, n) => summe + n, 0);
    const rate = gemesseneRaten.get(letzteSprache) ?? ZEICHEN_JE_SEKUNDE;
    const position = vorAnker + Math.max(0, gespielt - anker.sekunden) * rate * letztesTempo;
    const index = Math.max(Math.min(anker.index, anzahl - 1), satzBeiPosition(laengen, position));
    return { index, anzahl, satz: verlauf[index]?.anzeige ?? null, ziel: verlauf[index]?.ziel ?? null, vorher: verlauf[index - 1]?.anzeige ?? null };
  }

  function verstumme(): void {
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
    stillSeit = null;
    saetzeBeiStille = 0;
    saetzeBeiStilleSicher = 0;
    anker = { index: 0, sekunden: 0 };
    letzterStrom = null;
    zeitEnde = 0;
    vorlauf = aussetzerInRunde ? vorlauf : Math.max(STROM_VORLAUF_S, vorlauf / 2);
    aussetzerInRunde = false;
  }

  return {
    spiele,
    stand,
    merke(satz) {
      verlauf.push(satz);
    },
    setzeStimme(tempo, sprache) {
      letztesTempo = tempo;
      letzteSprache = sprache;
    },
    klingt: () => geplant.size > 0,
    verstumme,
  };
}

// --- Ablauf ---------------------------------------------------------------------------

function melde(s: Sprecher): void {
  const a = s.ablauf;
  const spricht = s.ton.klingt();
  const laedt = !spricht && (a.ausstehend.length > 0 || a.aktiv !== null || a.arbeitet);
  if (spricht === a.gemeldet.spricht && laedt === a.gemeldet.laedt) return;
  a.gemeldet = { laedt, spricht };
  s.rueck.beiZustand(a.gemeldet);
}

/** Wie viele Texte eines Stroms (vom Ende her) noch nicht geklungen haben (geschaetzt);
 *  ohne jeden Ton alle. */
function ungesprochenImStrom(strom: Strom): number {
  return strom.hatAudio ? ungesprocheneTexte(strom.texte, strom.audioSekunden, strom.tempo) : strom.texte.length;
}

/** Was insgesamt noch nicht geklungen hat: der Rest des laufenden Stroms
 *  (geschaetzt) und alles, was noch wartet. */
function ungesprochenGesamt(a: Ablauf): number {
  return (a.aktiv ? ungesprochenImStrom(a.aktiv) : 0) + a.ausstehend.length;
}

function gebeAuf(s: Sprecher, grund: string, ungesprochen: number): void {
  const a = s.ablauf;
  if (a.hatAufgegeben) return;
  a.hatAufgegeben = true;
  clearTimeout(a.ruhe);
  if (a.aktiv) s.verbindung.sende(abbruchNachricht(a.aktiv.id));
  a.aktiv = null;
  a.ausstehend = [];
  // Die Runde ist fuer diesen Sprecher zu Ende: nach der Aufgabe ruft niemand mehr
  // ende() (live liest der Abschnitts-Weg weiter). Bis zum 29.09.2026 blieb sie offen,
  // und Verbindung, Keepalive und Aufsicht liefen bis zur naechsten Frage (Cleanup-Fund 31).
  a.rundeOffen = false;
  melde(s);
  s.rueck.beiAufgabe(grund, ungesprochen);
  s.verbindung.planeLeerlauf();
}

/** Den laufenden Strom ersetzen: was von ihm noch nicht geklungen hat, kommt
 *  vorn in die Warteschlange, und ein neuer Strom uebernimmt. */
function ersetzeAktiv(s: Sprecher, grund: string): void {
  const a = s.ablauf;
  const alt = a.aktiv;
  if (!alt) return;
  const rest = ungesprochenImStrom(alt);
  const zurueck = alt.texte.slice(alt.texte.length - rest).map((text) => ({ text, sprache: alt.sprache }));
  a.aktiv = null;
  a.ersetzt += 1;
  a.ausstehend = [...zurueck, ...a.ausstehend];
  if (a.ersetzt > HOECHSTENS_ERSATZ) {
    gebeAuf(s, `zu-oft-ersetzt:${grund}`, a.ausstehend.length);
    return;
  }
  void pumpe(s, a.durchgang);
}

function beendeAktiv(s: Sprecher): void {
  const { aktiv } = s.ablauf;
  if (!aktiv || aktiv.endeGesendet) return;
  aktiv.endeGesendet = true;
  aktiv.zuletzt = Date.now();
  s.verbindung.sende(endeNachricht(aktiv.id));
}

function planeRuhe(s: Sprecher): void {
  const a = s.ablauf;
  clearTimeout(a.ruhe);
  a.ruhe = setTimeout(() => {
    // Eine Weile kein Text (Werkzeug laeuft): Strom ordentlich beenden, bevor
    // Soniox ihn mit 408 abbricht. Der naechste Satz oeffnet einen neuen.
    if (a.ausstehend.length === 0) beendeAktiv(s);
  }, STROM_RUHE_MS);
}

function neuerStrom(id: string, sprache: string, konfiguration: StromKonfiguration): Strom {
  return {
    id,
    sprache,
    tempo: konfiguration.speed,
    texte: [],
    zeichen: 0,
    endeGesendet: false,
    hatAudio: false,
    audioSekunden: 0,
    texteOhneTon: 0,
    pcmRest: null,
    zuletzt: Date.now(),
    abtastrate: konfiguration.sample_rate,
  };
}

/** Neuen Strom oeffnen (ohne Text). false, wenn es nicht ging. */
async function oeffneStrom(s: Sprecher, sprache: string, meinDurchgang: number): Promise<boolean> {
  const a = s.ablauf;
  const z = await s.vorrat.nimm(() => a.rundeOffen);
  if (meinDurchgang !== a.durchgang) return true;
  const vorgabe = z?.konfigurationen[sprache];
  if (!z || !vorgabe) return false;
  try {
    await s.verbindung.verbinde(z.adresse);
  } catch {
    return false;
  }
  if (meinDurchgang !== a.durchgang) return true;
  const konfiguration: StromKonfiguration = { ...vorgabe, sample_rate: abtastrateFuer(vorgabe.sample_rate, sparsamSprechen()) };
  if (ohneStilleKuerzen) delete konfiguration.reduce_silence;
  const id = neueStromId();
  if (!s.verbindung.sende(startNachricht(z.schluessel, id, konfiguration))) return false;
  s.verbindung.halteOffen();
  s.ton.setzeStimme(tempoFaktor(konfiguration.speed), sprache);
  a.aktiv = neuerStrom(id, sprache, konfiguration);
  beaufsichtige(s);
  return true;
}

/** Gibt den naechsten Text an den laufenden Strom. false, wenn der ihn nicht nimmt. */
function gibAnLaufenden(s: Sprecher, aktiv: Strom, naechster: Wartend): boolean {
  const nimmt = !aktiv.endeGesendet && aktiv.sprache === naechster.sprache && !brauchtNeuenStrom(aktiv.zeichen, naechster.text.length, aktiv.tempo);
  if (nimmt && s.verbindung.sende(textNachricht(aktiv.id, naechster.text))) {
    aktiv.texte.push(naechster.text);
    aktiv.texteOhneTon += 1;
    aktiv.zeichen += naechster.text.length;
    aktiv.zuletzt = Date.now();
    s.ablauf.ausstehend.shift();
    return true;
  }
  // Der laufende Strom ist voll oder spricht eine andere Sprache: er
  // wird beendet, und der Rest wartet, bis er fertig ist (Regel 1). Ging
  // das Senden nicht, ist die Verbindung weg - onclose raeumt auf.
  if (!nimmt) beendeAktiv(s);
  return false;
}

/** Arbeitet die Warteschlange ab: Text in den laufenden Strom, oder - wenn der
 *  ihn nicht nimmt - den laufenden beenden und warten, bis er fertig ist.
 *  Laeuft nie doppelt (arbeitet). */
async function pumpe(s: Sprecher, meinDurchgang: number): Promise<void> {
  const a = s.ablauf;
  if (a.arbeitet) return;
  a.arbeitet = true;
  try {
    while (meinDurchgang === a.durchgang && !a.hatAufgegeben && a.ausstehend.length > 0) {
      const naechster = a.ausstehend[0]!;
      if (a.aktiv) {
        if (gibAnLaufenden(s, a.aktiv, naechster)) continue;
        break;
      }
      const ok = await oeffneStrom(s, naechster.sprache, meinDurchgang);
      if (meinDurchgang !== a.durchgang || a.hatAufgegeben) return;
      if (!ok) {
        gebeAuf(s, "oeffnen-gescheitert", ungesprochenGesamt(a));
        return;
      }
    }
    if (meinDurchgang !== a.durchgang || a.hatAufgegeben) return;
    if (a.aktiv && !a.aktiv.endeGesendet && a.ausstehend.length === 0) {
      if (!a.rundeOffen) beendeAktiv(s);
      else planeRuhe(s);
    }
  } finally {
    if (meinDurchgang === a.durchgang) a.arbeitet = false;
    melde(s);
    s.verbindung.planeLeerlauf();
  }
}

function beaufsichtige(s: Sprecher): void {
  const a = s.ablauf;
  if (a.aufsicht) return;
  a.aufsicht = setInterval(() => {
    if (a.aktiv && a.aktiv.endeGesendet && Date.now() - a.aktiv.zuletzt > STROM_NACHLAUF_MS) {
      a.aktiv = null;
      melde(s);
      void pumpe(s, a.durchgang);
    }
    if (!a.aktiv && a.ausstehend.length === 0 && !a.rundeOffen && !s.ton.klingt()) {
      clearInterval(a.aufsicht);
      a.aufsicht = undefined;
      s.verbindung.planeLeerlauf();
    }
  }, 2_000);
}

function beiNachricht(s: Sprecher, ereignis: MessageEvent): void {
  if (typeof ereignis.data !== "string") return;
  let roh: unknown;
  try {
    roh = JSON.parse(ereignis.data);
  } catch {
    return;
  }
  const e = leseStromNachricht(roh);
  if (e.art === "unbekannt") return;
  if (e.art === "fehler") return beiFehler(s, e);
  // Nur der laufende Strom zaehlt. Nachrichten abgebrochener oder ersetzter
  // Stroeme (auch ihr terminated) kommen hier nicht durch - wie im offiziellen SDK.
  const { aktiv } = s.ablauf;
  if (!aktiv || e.stream !== aktiv.id) return;
  aktiv.zuletzt = Date.now();
  if (e.art === "audio") beiTon(s, aktiv, e.audio);
  else if (e.art === "beendet") beiStromEnde(s, aktiv);
}

/** Ton des laufenden Stroms: auf die Zeitachse damit. */
function beiTon(s: Sprecher, aktiv: Strom, audio: string): void {
  const { werte, rest } = pcmZuFloat(base64ZuBytes(audio), aktiv.pcmRest);
  aktiv.pcmRest = rest;
  aktiv.hatAudio = true;
  // Hatte Soniox vor diesem Stueck noch Text offen, den es nicht zu Ende gesprochen hatte?
  // Dann ist eine Luecke davor ein Aussetzer (Netz zu langsam), keine Werkzeugpause.
  const nochText = ungesprocheneTexte(aktiv.texte, aktiv.audioSekunden, aktiv.tempo) > 0;
  aktiv.audioSekunden += werte.length / aktiv.abtastrate;
  // Ton nach einem Text: ob er schon zu diesem Text gehoert, sagt Soniox nicht. Er kann
  // es aber, deshalb gilt ab hier wieder die alte Annahme (gesendet heisst gesprochen).
  if (werte.length > 0) aktiv.texteOhneTon = 0;
  s.ton.spiele(werte, aktiv.id, aktiv.abtastrate, nochText);
}

/** Der laufende Strom ist fertig (terminated): der naechste darf. */
function beiStromEnde(s: Sprecher, aktiv: Strom): void {
  // Ganzer Strom gehoert: daraus die tatsaechliche Sprechgeschwindigkeit.
  if (aktiv.zeichen >= 60 && aktiv.audioSekunden >= 3) {
    const messwert = aktiv.zeichen / aktiv.audioSekunden / tempoFaktor(aktiv.tempo);
    const bisher = gemesseneRaten.get(aktiv.sprache);
    gemesseneRaten.set(aktiv.sprache, bisher === undefined ? messwert : (bisher + messwert) / 2);
  }
  s.ablauf.aktiv = null;
  melde(s);
  void pumpe(s, s.ablauf.durchgang);
}

function beiFehler(s: Sprecher, e: { stream: string | null; code: number; typ: string; text: string }): void {
  const folge = folgeAufFehler(e);
  console.warn("[damicon] Vorlese-Strom: Soniox meldet", e.code, e.typ);
  // Fehler ohne Strom oder zu einem Strom, der nicht mehr laeuft (etwa "Stream
  // not found" fuer den Text eines gerade abgelehnten Starts): nicht auf den
  // laufenden Strom beziehen. Ein Verbindungsfehler zeigt sich in onclose.
  const { aktiv } = s.ablauf;
  if (!aktiv || e.stream !== aktiv.id) {
    if (folge === "neuer-schluessel") s.vorrat.verwerfe();
    return;
  }
  if (folge === "aufgeben") return gebeAuf(s, `dienst-${e.code || e.typ}`, ungesprochenGesamt(s.ablauf));
  if (folge === "ohne-stillekuerzung") ohneStilleKuerzen = true;
  if (folge === "neuer-schluessel") s.vorrat.verwerfe();
  // Neuer Strom fuer den Rest: Schluessel abgelaufen, Pausenkuerzung
  // abgelehnt, zu lange kein Text (408) oder 2 Minuten erreicht (413).
  ersetzeAktiv(s, folge);
}

function stopp(s: Sprecher): void {
  const a = s.ablauf;
  a.durchgang += 1;
  clearTimeout(a.ruhe);
  if (a.aktiv) s.verbindung.sende(abbruchNachricht(a.aktiv.id));
  a.aktiv = null;
  a.ausstehend = [];
  a.rundeOffen = false;
  a.arbeitet = false;
  a.hatAufgegeben = false;
  a.ersetzt = 0;
  s.ton.verstumme();
  melde(s);
  s.verbindung.planeLeerlauf();
}

// --- Zusammenbau ------------------------------------------------------------------------

export function erzeugeStromSprecher(kontext: () => AudioContext | null, rueck: StromRueckmeldung): StromSprecher {
  const ablauf = neuerAblauf();
  const s: Sprecher = {
    ablauf,
    rueck,
    vorrat: erzeugeSchluesselVorrat(),
    verbindung: erzeugeVerbindung({
      beiNachricht: (ereignis) => beiNachricht(s, ereignis),
      beschaeftigt: () => ablauf.aktiv !== null || ablauf.ausstehend.length > 0 || ablauf.rundeOffen || ablauf.arbeitet,
      beiUnerwartetZu: () => {
        if (ablauf.aktiv || ablauf.ausstehend.length > 0 || ablauf.rundeOffen) {
          gebeAuf(s, "verbindung-geschlossen", ungesprochenGesamt(ablauf));
        }
      },
    }),
    ton: erzeugeTonspur(kontext, rueck, ablauf, () => melde(s)),
  };

  return {
    setzeNachweis(n) {
      s.vorrat.setzeNachweis(n);
    },

    sprich(text, sprache, anzeige, ziel) {
      const t = text.trim();
      if (!t || ablauf.hatAufgegeben) return;
      ablauf.rundeOffen = true;
      clearTimeout(ablauf.ruhe);
      s.ton.merke({ anzeige: (anzeige ?? t).trim(), zeichen: t.length, ziel: ziel ?? null });
      ablauf.ausstehend.push({ text: t, sprache });
      melde(s);
      void pumpe(s, ablauf.durchgang);
    },

    ende() {
      ablauf.rundeOffen = false;
      clearTimeout(ablauf.ruhe);
      if (!ablauf.arbeitet && ablauf.aktiv && ablauf.ausstehend.length === 0) beendeAktiv(s);
      melde(s);
      s.verbindung.planeLeerlauf();
    },

    stopp() {
      stopp(s);
    },

    // Seit 29.09.2026 (Cleanup-Fund 31): vorher gab es nur stopp(), und nach dem Abbau
    // des Chats liefen Verbindung und Keepalive bis zum Leerlauf (20 s), die Aufsicht
    // alle 2 s weiter.
    schliesse() {
      stopp(s);
      clearInterval(ablauf.aufsicht);
      ablauf.aufsicht = undefined;
      s.verbindung.schliesse();
      s.vorrat.leere();
    },

    stand: () => s.ton.stand(),

    aufgegeben: () => ablauf.hatAufgegeben,
  };
}
