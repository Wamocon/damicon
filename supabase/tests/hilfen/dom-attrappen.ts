// Schlanke Attrappen der Browser-Schnittstellen für DOM-Tests (seit 14.10.2026).
//
// Die Haustier- und KI-Komponenten sprechen mit Mikrofon, Web Audio, WebSocket, fetch, <audio> und den Beobachtern des Browsers.
// jsdom kennt davon nur einen Teil. Hier steht je Schnittstelle nur so viel, wie zum Rendern und zum Auslösen der Ereignisse nötig
// ist. Jede Attrappe schreibt ihre Aufrufe in `protokoll` (eine Zeile je Aufruf, etwa "audio#1 quelle#2 start(0.25)"), damit ein
// Test Aufruffolgen vergleichen kann, und hat Steuerknöpfe für das, was im Browser von außen kommt: Ton, Nachricht vom Dienst,
// Größenänderung, Medienabfrage, Antwort des Servers.
//
// Dazu die steuerbare Uhr: setTimeout, setInterval, requestAnimationFrame, performance.now und auf Wunsch Date laufen nur, wenn der
// Test sie vorstellt, und die Zeitachse der AudioContext-Attrappen läuft mit.
//
// Überblick (global und am Fenster eingehängt; Lesen | Steuern):
//   AudioContext, webkitAudioContext  AudioContextAttrappe.alle, .quellen, .analyser, currentTime, state | statisch anfangsZustand,
//                                     pegel, dekodierDauer; je Kontext pegel, vergeht(ms); Quellen enden über die Zeitachse.
//   navigator.mediaDevices            mikrofon.anfragen, .stroeme | mikrofon.verweigerung, .verzoegerungMs
//   MediaStream, MediaStreamTrack     getTracks(), readyState | stop()
//   MediaRecorder                     MediaRecorderAttrappe.alle, state, timeslice | liefere(), puffere(); statisch unterstuetzt,
//                                     scheitertBeimErzeugen
//   WebSocket                         WebSocketAttrappe.alle, gesendet, json(), geschlossen | oeffne(), empfange(), scheitere(),
//                                     schliesseVonDrueben(); statisch automatischOeffnen
//   fetch                             netz.aufrufe, .unbeantwortet | netz.antworte(muster, antwort), netz.halte(muster), erzeugeStrom()
//   ResizeObserver                    ResizeObserverAttrappe.alle, beobachtet, getrennt | melde(), meldeAlle()
//   IntersectionObserver              IntersectionObserverAttrappe.alle | melde(ziel, sichtbar)
//   matchMedia                        medienAbfragen.listen | medienAbfragen.setze(abfrage, passt)
//   <audio>, <video>                  medienElemente.gespielt, paused, ended | playFehler, beende(el), scheitere(el)
//   <canvas> getContext("2d")         leinwand.aufrufe(el) (Zähler je Methode)
//   getBoundingClientRect             | setzeRechteck(el, { left, top, width, height })
//   scrollIntoView, scrollTo, Zeigerfang  Protokoll "dom", "fenster"; hasPointerCapture
//   URL.createObjectURL               objektUrls.erzeugt, .widerrufen
// speechSynthesis fehlt: die Komponenten unter ki und haustier benutzen es nicht.
//
// Eingehängt werden die Attrappen von dom-globale.ts (installiereAttrappen). Dieses Modul lädt weder React noch jsdom; die Klassen
// des Fensters (Event, Blob) kommen erst beim Einhängen herein. Benutzt wird es über dom-umgebung.tsx.

type Fenster = Window & typeof globalThis;

let fensterRef: Fenster | null = null;
function fenster(): Fenster {
  if (!fensterRef) throw new Error("Attrappen sind noch nicht eingehängt (dom-globale.ts zuerst importieren).");
  return fensterRef;
}

// ---- Protokoll ------------------------------------------------------------------------------------------------------------------
const eintraege: string[] = [];

/** Alle Aufrufe der Attrappen in Reihenfolge, je Zeile "<quelle> <aufruf>". */
export const protokoll = {
  eintraege,
  notiere(quelle: string, text: string): void {
    eintraege.push(`${quelle} ${text}`);
  },
  /** Die Zeilen, deren Quelle mit `praefix` beginnt, etwa "audio", "ws#2", "fetch" oder "medien". */
  von(praefix: string): string[] {
    return eintraege.filter((e) => e.startsWith(praefix));
  },
  leere(): void {
    eintraege.length = 0;
  },
};
const notiere = protokoll.notiere;
const zahl = (wert: number | undefined): string => (wert === undefined ? "" : Number(wert.toFixed(3)).toString());

// ---- Ereignisse der Attrappen ---------------------------------------------------------------------------------------------------
/** Was die Attrappen an ihre Hörer geben: ein schlichtes Objekt mit type, target und den Feldern des Ereignisses (data, code ...). */
export interface AttrappenEreignis {
  type: string;
  target: unknown;
  [feld: string]: unknown;
}
type Hoerer = ((ereignis: AttrappenEreignis) => void) | { handleEvent(ereignis: AttrappenEreignis): void };

/** Kleine Ereignisquelle: on<typ>-Eigenschaft und addEventListener, wie im Browser. */
class Ereignisquelle {
  private readonly hoerer = new Map<string, Set<Hoerer>>();
  addEventListener(typ: string, hoerer: Hoerer | null): void {
    if (!hoerer) return;
    const liste = this.hoerer.get(typ) ?? new Set<Hoerer>();
    liste.add(hoerer);
    this.hoerer.set(typ, liste);
  }
  removeEventListener(typ: string, hoerer: Hoerer | null): void {
    if (hoerer) this.hoerer.get(typ)?.delete(hoerer);
  }
  dispatchEvent(ereignis: { type: string }): boolean {
    this.feuere(ereignis.type, ereignis);
    return true;
  }
  /** Ruft on<typ> und alle Hörer mit einem Ereignis aus `felder`. */
  feuere(typ: string, felder: object = {}): void {
    const ereignis: AttrappenEreignis = { ...felder, type: typ, target: this, currentTarget: this };
    const eigen = (this as unknown as Record<string, unknown>)[`on${typ}`];
    if (typeof eigen === "function") eigen.call(this, ereignis);
    for (const h of [...(this.hoerer.get(typ) ?? [])]) {
      if (typeof h === "function") h.call(this, ereignis);
      else h.handleEvent(ereignis);
    }
  }
}

// ---- Uhr ------------------------------------------------------------------------------------------------------------------------
type Huelle = (schritt: () => Promise<void>) => Promise<void>;
let huelle: Huelle = (schritt) => schritt();
/** dom-umgebung.tsx setzt hier act() ein: jeder Schritt der Uhr läuft dann in act(), React rendert zwischen zwei Zeitgebern. */
export function setzeAktHuelle(neu: Huelle): void {
  huelle = neu;
}

// Die echten Zeitgeber, gemerkt beim Laden (vor jeder Uhr). setImmediate fasst die Uhr nie an.
const echt = { setImmediate: globalThis.setImmediate, performance: globalThis.performance, Date: globalThis.Date };

/** Lässt alle anstehenden Mikrotasks (Promise-Ketten) durchlaufen, über das echte setImmediate. */
export async function leereMikrotasks(runden = 3): Promise<void> {
  for (let i = 0; i < runden; i++) await new Promise<void>((fertig) => echt.setImmediate(fertig));
}

/** Etwas, dessen Zeit mit der Uhr läuft (die AudioContext-Attrappen). */
export interface Zeitquelle {
  /** In wie vielen Millisekunden das nächste eigene Ereignis fällig ist, oder null. */
  naechstesEreignisMs(): number | null;
  /** Die Zeit läuft um `ms` weiter; was dabei fällig wird, feuert. */
  vergeht(ms: number): void;
}
export const zeitquellen = new Set<Zeitquelle>();

export interface UhrOptionen {
  /** Auch Date.now() und new Date() folgen der Uhr, beginnend bei diesem Zeitpunkt. Ohne Angabe bleibt Date echt. */
  datum?: string | number | Date;
  /** Abstand der Bilder für requestAnimationFrame in ms (Vorgabe 16). */
  bildMs?: number;
  /** Wert von performance.now() beim Einschalten (Vorgabe 1000). */
  performanceStart?: number;
}

export interface Uhr {
  /** Millisekunden seit dem Einschalten. */
  jetzt(): number;
  /** Stellt die Uhr um `ms` vor: Zeitgeber, Intervalle, Bilder und Tonenden laufen in zeitlicher Reihenfolge, jeder Schritt in act()
   *  und mit anschließend geleerten Mikrotasks. Gleichzeitig fällig: erst Tonenden, dann Zeitgeber (nach Nummer), dann das Bild. */
  vor(ms: number): Promise<void>;
  /** Bis zum nächsten Bild (requestAnimationFrame-Runde). */
  bild(): Promise<void>;
  /** Stellt vor, bis kein einmaliger Zeitgeber mehr offen ist (Intervalle und Bilder laufen dabei mit). */
  laufeAlle(grenze?: number): Promise<void>;
  /** Wie viel noch offen ist. */
  offen(): { zeitgeber: number; intervalle: number; bilder: number };
  /** Die offenen Zeitgeber: in wie vielen ms fällig, mit welcher Verzögerung angelegt, ob Intervall. */
  zeitgeber(): { inMs: number; ms: number; intervall: boolean }[];
  /** Stellt die echten Zeitgeber, performance und Date wieder her. */
  deinstalliere(): void;
}

interface Zeitgeber {
  id: number;
  faellig: number;
  ms: number;
  rueckruf: (...argumente: unknown[]) => void;
  argumente: unknown[];
  intervall: boolean;
}

let aktiveUhr: Uhr | null = null;
/** Die gerade eingeschaltete Uhr, oder null. */
export const aktuelleUhr = (): Uhr | null => aktiveUhr;
const SCHRITT_GRENZE = 100_000;

/**
 * Schaltet die steuerbare Uhr ein: setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame,
 * cancelAnimationFrame und performance (global und am Fenster), auf Wunsch auch Date. React selbst bleibt auf den echten
 * Zeitgebern (es hat sie beim Laden gemerkt). waitFor und findBy* der Testing Library warten über setTimeout und hängen
 * deshalb, solange die Uhr läuft; statt dessen vor() und danach prüfen, oder warteBis() aus dom-umgebung.tsx.
 */
export function installiereUhr(optionen: UhrOptionen = {}): Uhr {
  if (aktiveUhr) throw new Error("Es läuft schon eine Uhr: erst deinstallieren.");
  const bildMs = optionen.bildMs ?? 16;
  const perfStart = optionen.performanceStart ?? 1000;
  const datumStart = optionen.datum === undefined ? null : new echt.Date(optionen.datum).getTime();
  let jetzt = 0;
  let naechsteId = 1;
  const zeitgeber = new Map<number, Zeitgeber>();
  const bilder = new Map<number, FrameRequestCallback>();
  const gesichert: [object, string, PropertyDescriptor | undefined][] = [];

  const ersetze = (ziel: object, name: string, wert: unknown) => {
    gesichert.push([ziel, name, Object.getOwnPropertyDescriptor(ziel, name)]);
    Object.defineProperty(ziel, name, { value: wert, configurable: true, writable: true, enumerable: true });
  };
  const plane = (rueckruf: unknown, ms: unknown, argumente: unknown[], intervall: boolean): number => {
    const id = naechsteId++;
    if (typeof rueckruf !== "function") throw new Error("Uhr: setTimeout mit Text statt Funktion wird nicht unterstützt.");
    const dauer = Math.max(0, Number(ms) || 0);
    zeitgeber.set(id, { id, faellig: jetzt + dauer, ms: dauer, rueckruf: rueckruf as Zeitgeber["rueckruf"], argumente, intervall });
    return id;
  };
  const loesche = (id: unknown) => {
    zeitgeber.delete(Number(id));
  };
  const leistung = {
    now: () => perfStart + jetzt,
    timeOrigin: echt.performance.timeOrigin,
    mark: () => undefined,
    measure: () => undefined,
    clearMarks: () => undefined,
    clearMeasures: () => undefined,
    getEntries: () => [],
    getEntriesByName: () => [],
    getEntriesByType: () => [],
    toJSON: () => ({ now: perfStart + jetzt }),
  };
  for (const ziel of [globalThis, fenster()]) {
    ersetze(ziel, "setTimeout", (f: unknown, ms?: unknown, ...a: unknown[]) => plane(f, ms, a, false));
    ersetze(ziel, "setInterval", (f: unknown, ms?: unknown, ...a: unknown[]) => plane(f, ms, a, true));
    ersetze(ziel, "clearTimeout", loesche);
    ersetze(ziel, "clearInterval", loesche);
    ersetze(ziel, "requestAnimationFrame", (f: FrameRequestCallback) => {
      const id = naechsteId++;
      bilder.set(id, f);
      return id;
    });
    ersetze(ziel, "cancelAnimationFrame", (id: number) => {
      bilder.delete(id);
    });
    ersetze(ziel, "performance", leistung);
  }
  if (datumStart !== null) {
    class UhrDatum extends echt.Date {
      constructor(...argumente: unknown[]) {
        if (argumente.length === 0) super(datumStart! + jetzt);
        else super(...(argumente as unknown as [number]));
      }
      static now(): number {
        return datumStart! + jetzt;
      }
    }
    ersetze(globalThis, "Date", UhrDatum);
  }

  const naechsterZeitgeber = (): Zeitgeber | null => {
    let wahl: Zeitgeber | null = null;
    for (const z of zeitgeber.values()) if (!wahl || z.faellig < wahl.faellig || (z.faellig === wahl.faellig && z.id < wahl.id)) wahl = z;
    return wahl;
  };
  const naechstesBild = () => (Math.floor(jetzt / bildMs) + 1) * bildMs;
  const naechsterTon = (): number | null => {
    let wahl: number | null = null;
    for (const q of zeitquellen) {
      const ms = q.naechstesEreignisMs();
      if (ms !== null && (wahl === null || ms < wahl)) wahl = ms;
    }
    return wahl === null ? null : jetzt + wahl;
  };
  const springe = (zeit: number) => {
    const dauer = zeit - jetzt;
    if (dauer <= 0) return;
    jetzt = zeit;
    for (const q of [...zeitquellen]) q.vergeht(dauer);
  };
  const fuehreAus = (z: Zeitgeber) => {
    if (z.intervall) z.faellig += Math.max(1, z.ms);
    else zeitgeber.delete(z.id);
    z.rueckruf(...z.argumente);
  };
  const zeichneBild = () => {
    const faellig = [...bilder.values()];
    bilder.clear();
    for (const f of faellig) f(perfStart + jetzt);
  };

  const uhr: Uhr = {
    jetzt: () => jetzt,
    async vor(ms) {
      const ziel = jetzt + Math.max(0, ms);
      for (let schritt = 0; ; schritt++) {
        if (schritt > SCHRITT_GRENZE) throw new Error(`Uhr: mehr als ${SCHRITT_GRENZE} Schritte bis ${ziel} ms (Intervall ohne Ende?)`);
        const zg = naechsterZeitgeber();
        const bild = bilder.size > 0 ? naechstesBild() : null;
        const kandidaten = [zg?.faellig ?? null, bild, naechsterTon()].filter((z): z is number => z !== null);
        if (kandidaten.length === 0) break;
        const zeit = Math.min(...kandidaten);
        if (zeit > ziel) break;
        await huelle(async () => {
          springe(zeit);
          if (zg && zg.faellig === zeit) fuehreAus(zg);
          else if (bild === zeit) zeichneBild();
          await leereMikrotasks();
        });
      }
      await huelle(async () => {
        springe(ziel);
        await leereMikrotasks();
      });
    },
    async bild() {
      await uhr.vor(naechstesBild() - jetzt);
    },
    async laufeAlle(grenze = 1000) {
      for (let runde = 0; runde < grenze; runde++) {
        const einmalig = [...zeitgeber.values()].filter((z) => !z.intervall);
        if (einmalig.length === 0) return;
        await uhr.vor(Math.min(...einmalig.map((z) => z.faellig)) - jetzt);
      }
      throw new Error(`Uhr.laufeAlle: nach ${grenze} Runden sind noch Zeitgeber offen.`);
    },
    offen: () => {
      const alle = [...zeitgeber.values()];
      return { zeitgeber: alle.filter((z) => !z.intervall).length, intervalle: alle.filter((z) => z.intervall).length, bilder: bilder.size };
    },
    zeitgeber: () =>
      [...zeitgeber.values()]
        .sort((a, b) => a.faellig - b.faellig || a.id - b.id)
        .map((z) => ({ inMs: z.faellig - jetzt, ms: z.ms, intervall: z.intervall })),
    deinstalliere() {
      for (const [ziel, name, beschreibung] of gesichert.reverse()) {
        if (beschreibung) Object.defineProperty(ziel, name, beschreibung);
        else delete (ziel as Record<string, unknown>)[name];
      }
      gesichert.length = 0;
      aktiveUhr = null;
    },
  };
  aktiveUhr = uhr;
  return uhr;
}

// ---- Web Audio ------------------------------------------------------------------------------------------------------------------
/** Was die Analyser eines Kontexts liefern: `zeit` ist die Amplitude 0..1 im Zeitbereich, `frequenz` der Wert 0..255 je Bin
 *  (als Zahl für alle Bins oder als Funktion des Bins). */
export interface Pegel {
  zeit: number;
  frequenz: number | ((bin: number) => number);
}

class AudioParamAttrappe {
  constructor(
    private readonly wo: string,
    public value: number,
  ) {}
  private plane(art: string, wert: number, zeit: number, zusatz?: number): this {
    this.value = wert;
    notiere(this.wo, `${art}(${zahl(wert)}, ${zahl(zeit)}${zusatz === undefined ? "" : `, ${zahl(zusatz)}`})`);
    return this;
  }
  setValueAtTime(wert: number, zeit: number) {
    return this.plane("setValueAtTime", wert, zeit);
  }
  linearRampToValueAtTime(wert: number, zeit: number) {
    return this.plane("linearRampToValueAtTime", wert, zeit);
  }
  exponentialRampToValueAtTime(wert: number, zeit: number) {
    return this.plane("exponentialRampToValueAtTime", wert, zeit);
  }
  setTargetAtTime(wert: number, zeit: number, konstante: number) {
    return this.plane("setTargetAtTime", wert, zeit, konstante);
  }
  cancelScheduledValues(zeit: number): this {
    notiere(this.wo, `cancelScheduledValues(${zahl(zeit)})`);
    return this;
  }
  cancelAndHoldAtTime(zeit: number): this {
    notiere(this.wo, `cancelAndHoldAtTime(${zahl(zeit)})`);
    return this;
  }
}

/** Ein Knoten des Audiographen. `name` erscheint im Protokoll, `verbunden` nennt die Ziele von connect(). */
export class AudioKnotenAttrappe extends Ereignisquelle {
  readonly verbunden: AudioKnotenAttrappe[] = [];
  constructor(
    readonly context: AudioContextAttrappe,
    readonly name: string,
  ) {
    super();
  }
  connect<T>(ziel: T): T {
    if (ziel instanceof AudioKnotenAttrappe) this.verbunden.push(ziel);
    notiere(`${this.context.name} ${this.name}`, `connect ${ziel instanceof AudioKnotenAttrappe ? ziel.name : "param"}`);
    return ziel;
  }
  disconnect(): void {
    this.verbunden.length = 0;
    notiere(`${this.context.name} ${this.name}`, "disconnect");
  }
}

export class GainAttrappe extends AudioKnotenAttrappe {
  readonly gain = new AudioParamAttrappe(`${this.context.name} ${this.name}.gain`, 1);
}

export class AnalyserAttrappe extends AudioKnotenAttrappe {
  private groesse = 2048;
  smoothingTimeConstant = 0.8;
  minDecibels = -100;
  maxDecibels = -30;
  get fftSize(): number {
    return this.groesse;
  }
  set fftSize(wert: number) {
    this.groesse = wert;
  }
  get frequencyBinCount(): number {
    return this.groesse / 2;
  }
  private amplitude(): number {
    return Math.min(1, Math.max(0, this.context.pegel.zeit));
  }
  private bin(i: number): number {
    const f = this.context.pegel.frequenz;
    return Math.min(255, Math.max(0, Math.round(typeof f === "function" ? f(i) : f)));
  }
  /** Rechteckwelle um 128 mit der Amplitude aus dem Pegel: der RMS-Wert ist genau `pegel.zeit`. */
  getByteTimeDomainData(ziel: Uint8Array): void {
    const a = Math.round(this.amplitude() * 127);
    for (let i = 0; i < ziel.length; i++) ziel[i] = 128 + (i % 2 === 0 ? a : -a);
  }
  getFloatTimeDomainData(ziel: Float32Array): void {
    const a = this.amplitude();
    for (let i = 0; i < ziel.length; i++) ziel[i] = i % 2 === 0 ? a : -a;
  }
  getByteFrequencyData(ziel: Uint8Array): void {
    for (let i = 0; i < ziel.length; i++) ziel[i] = this.bin(i);
  }
  getFloatFrequencyData(ziel: Float32Array): void {
    for (let i = 0; i < ziel.length; i++) ziel[i] = this.minDecibels + (this.bin(i) / 255) * (this.maxDecibels - this.minDecibels);
  }
}

/** Ein Tonpuffer. `dekodiert` und `bytes` setzt decodeAudioData: so unterscheidet ein Test eine ganze Datei von PCM-Stücken. */
export class PufferAttrappe {
  private readonly kanaele: Float32Array[];
  dekodiert = false;
  bytes = 0;
  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
    dauer?: number,
  ) {
    this.kanaele = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
    this.duration = dauer ?? length / sampleRate;
  }
  readonly duration: number;
  getChannelData(kanal: number): Float32Array {
    return this.kanaele[kanal]!;
  }
  copyToChannel(quelle: Float32Array, kanal: number, start = 0): void {
    this.kanaele[kanal]!.set(quelle, start);
  }
}

/** AudioBufferSourceNode: start/stop werden mitgeschrieben, `ende` ist die Kontextzeit, zu der onended feuert. */
export class QuelleAttrappe extends AudioKnotenAttrappe {
  buffer: PufferAttrappe | null = null;
  loop = false;
  readonly playbackRate = new AudioParamAttrappe(`${this.context.name} ${this.name}.playbackRate`, 1);
  onended: ((ereignis: AttrappenEreignis) => void) | null = null;
  gestartet = false;
  gestoppt = false;
  beendet = false;
  /** Das `when` aus start(). */
  startZeit: number | undefined;
  /** Kontextzeit des Endes (Infinity ohne Puffer oder mit loop). */
  ende = Infinity;
  start(wann = 0, versatz = 0, dauer?: number): void {
    if (this.gestartet) throw new DOMException("start() zweimal aufgerufen", "InvalidStateError");
    this.gestartet = true;
    this.startZeit = wann;
    const anfang = Math.max(wann, this.context.currentTime);
    const laenge = this.buffer && !this.loop ? (dauer ?? this.buffer.duration - versatz) / (this.playbackRate.value || 1) : Infinity;
    this.ende = anfang + laenge;
    notiere(`${this.context.name} ${this.name}`, `start(${zahl(wann)})`);
  }
  stop(wann = 0): void {
    if (!this.gestartet) throw new DOMException("stop() vor start()", "InvalidStateError");
    this.gestoppt = true;
    this.ende = Math.min(this.ende, Math.max(wann, this.context.currentTime));
    notiere(`${this.context.name} ${this.name}`, `stop(${zahl(wann)})`);
    if (this.ende <= this.context.currentTime) queueMicrotask(() => this.beende());
  }
  /** Feuert ended (einmal). Ruft sonst die Zeitachse des Kontexts. */
  beende(): void {
    if (this.beendet) return;
    this.beendet = true;
    notiere(`${this.context.name} ${this.name}`, "ended");
    this.feuere("ended");
  }
}

export class MedienQuelleAttrappe extends AudioKnotenAttrappe {
  constructor(
    context: AudioContextAttrappe,
    name: string,
    readonly mediaStream: unknown,
  ) {
    super(context, name);
  }
}

/**
 * AudioContext mit Zeitachse. currentTime läuft nur, wenn der Kontext läuft: über vergeht(ms) direkt oder über die Uhr, die alle
 * Kontexte mitnimmt. Eine gestartete Quelle feuert ended, sobald die Zeitachse ihr Ende erreicht. Die Analyser liefern `pegel`.
 * Statisch einstellbar, bevor eine Komponente ihren Kontext anlegt: anfangsZustand, pegel, dekodierDauer.
 */
export class AudioContextAttrappe extends Ereignisquelle implements Zeitquelle {
  static alle: AudioContextAttrappe[] = [];
  /** Zustand neuer Kontexte; "suspended" spielt Safari nach, wo ein Kontext ohne Geste angehalten beginnt. */
  static anfangsZustand: "running" | "suspended" = "running";
  /** Pegel aller Kontexte ohne eigenen Pegel. */
  static pegel: Pegel = { zeit: 0, frequenz: 0 };
  /** Dauer in Sekunden, die decodeAudioData für jede Datei meldet. */
  static dekodierDauer = 1;
  /** Laufende Nummer für Namen im Protokoll; zuruecksetzenAttrappen() setzt sie auf 0. */
  static zaehler = 0;
  private knotenZaehler = 0;
  readonly nr: number;
  readonly name: string;
  state: "running" | "suspended" | "closed";
  currentTime = 0;
  readonly sampleRate: number;
  baseLatency = 0.01;
  outputLatency = 0.02;
  readonly destination: AudioKnotenAttrappe;
  onstatechange: ((ereignis: AttrappenEreignis) => void) | null = null;
  readonly quellen: QuelleAttrappe[] = [];
  readonly analyser: AnalyserAttrappe[] = [];
  eigenerPegel: Pegel | null = null;

  constructor(optionen: { sampleRate?: number } = {}) {
    super();
    this.nr = ++AudioContextAttrappe.zaehler;
    this.name = `audio#${this.nr}`;
    this.state = AudioContextAttrappe.anfangsZustand;
    this.sampleRate = optionen.sampleRate ?? 48000;
    this.destination = new AudioKnotenAttrappe(this, "destination");
    AudioContextAttrappe.alle.push(this);
    zeitquellen.add(this);
    notiere(this.name, `new (${this.state})`);
  }
  get pegel(): Pegel {
    return this.eigenerPegel ?? AudioContextAttrappe.pegel;
  }
  set pegel(wert: Pegel) {
    this.eigenerPegel = wert;
  }
  private neuerName(art: string): string {
    return `${art}#${++this.knotenZaehler}`;
  }
  private knoten<T extends AudioKnotenAttrappe>(art: string, k: T): T {
    notiere(this.name, `create${art} -> ${k.name}`);
    return k;
  }
  createGain(): GainAttrappe {
    return this.knoten("Gain", new GainAttrappe(this, this.neuerName("gain")));
  }
  createAnalyser(): AnalyserAttrappe {
    const a = this.knoten("Analyser", new AnalyserAttrappe(this, this.neuerName("analyser")));
    this.analyser.push(a);
    return a;
  }
  createMediaStreamSource(strom: unknown): MedienQuelleAttrappe {
    return this.knoten("MediaStreamSource", new MedienQuelleAttrappe(this, this.neuerName("mikrofon"), strom));
  }
  createBufferSource(): QuelleAttrappe {
    const q = this.knoten("BufferSource", new QuelleAttrappe(this, this.neuerName("quelle")));
    this.quellen.push(q);
    return q;
  }
  createBuffer(kanaele: number, laenge: number, rate: number): PufferAttrappe {
    notiere(this.name, `createBuffer(${kanaele}, ${laenge}, ${rate})`);
    return new PufferAttrappe(kanaele, laenge, rate);
  }
  async decodeAudioData(daten: ArrayBuffer, ok?: (p: PufferAttrappe) => void): Promise<PufferAttrappe> {
    notiere(this.name, `decodeAudioData(${daten.byteLength} Bytes)`);
    const p = new PufferAttrappe(1, Math.round(AudioContextAttrappe.dekodierDauer * this.sampleRate), this.sampleRate, AudioContextAttrappe.dekodierDauer);
    p.dekodiert = true;
    p.bytes = daten.byteLength;
    ok?.(p);
    return p;
  }
  private wechsle(zustand: AudioContextAttrappe["state"]): void {
    if (this.state === zustand) return;
    this.state = zustand;
    this.feuere("statechange");
  }
  async resume(): Promise<void> {
    notiere(this.name, "resume");
    if (this.state === "closed") throw new DOMException("Kontext ist geschlossen", "InvalidStateError");
    this.wechsle("running");
  }
  async suspend(): Promise<void> {
    notiere(this.name, "suspend");
    if (this.state === "closed") throw new DOMException("Kontext ist geschlossen", "InvalidStateError");
    this.wechsle("suspended");
  }
  async close(): Promise<void> {
    notiere(this.name, "close");
    if (this.state === "closed") throw new DOMException("Kontext ist schon geschlossen", "InvalidStateError");
    this.wechsle("closed");
  }
  /** Zeitachse: wie viele ms bis zum nächsten Tonende, solange der Kontext läuft. */
  naechstesEreignisMs(): number | null {
    if (this.state !== "running") return null;
    let wahl: number | null = null;
    for (const q of this.quellen) {
      if (!q.gestartet || q.beendet || !Number.isFinite(q.ende)) continue;
      const ms = Math.max(0, (q.ende - this.currentTime) * 1000);
      if (wahl === null || ms < wahl) wahl = ms;
    }
    return wahl;
  }
  /** Die Kontextzeit läuft um `ms` weiter (nur im Zustand running); fällige Quellen feuern ended, nach Ende geordnet. */
  vergeht(ms: number): void {
    if (this.state !== "running") return;
    this.currentTime += ms / 1000;
    const faellig = this.quellen
      .filter((q) => q.gestartet && !q.beendet && q.ende <= this.currentTime + 1e-9)
      .sort((a, b) => a.ende - b.ende);
    for (const q of faellig) q.beende();
  }
}

// ---- Mikrofon: MediaStream, getUserMedia, MediaRecorder ------------------------------------------------------------------------
export class MediaStreamTrackAttrappe extends Ereignisquelle {
  /** Laufende Nummer für Namen im Protokoll; zuruecksetzenAttrappen() setzt sie auf 0. */
  static zaehler = 0;
  readonly id: string;
  readonly name: string;
  enabled = true;
  muted = false;
  readyState: "live" | "ended" = "live";
  label: string;
  constructor(readonly kind: "audio" | "video" = "audio") {
    super();
    const nr = ++MediaStreamTrackAttrappe.zaehler;
    this.id = `spur-${nr}`;
    this.name = `spur#${nr}`;
    this.label = `Attrappe ${kind}`;
  }
  stop(): void {
    if (this.readyState === "ended") return;
    this.readyState = "ended";
    notiere("mikrofon", `${this.name} stop`);
  }
  getSettings(): Record<string, unknown> {
    return { deviceId: "attrappe", sampleRate: 48000, channelCount: 1 };
  }
  getConstraints(): Record<string, unknown> {
    return {};
  }
  async applyConstraints(): Promise<void> {}
  clone(): MediaStreamTrackAttrappe {
    return new MediaStreamTrackAttrappe(this.kind);
  }
}

export class MediaStreamAttrappe extends Ereignisquelle {
  /** Laufende Nummer für Namen im Protokoll; zuruecksetzenAttrappen() setzt sie auf 0. */
  static zaehler = 0;
  readonly id: string;
  private readonly spuren: MediaStreamTrackAttrappe[];
  constructor(spuren: MediaStreamTrackAttrappe[] | MediaStreamAttrappe = []) {
    super();
    this.id = `strom-${++MediaStreamAttrappe.zaehler}`;
    this.spuren = spuren instanceof MediaStreamAttrappe ? spuren.getTracks() : [...spuren];
  }
  get active(): boolean {
    return this.spuren.some((s) => s.readyState === "live");
  }
  getTracks(): MediaStreamTrackAttrappe[] {
    return [...this.spuren];
  }
  getAudioTracks(): MediaStreamTrackAttrappe[] {
    return this.spuren.filter((s) => s.kind === "audio");
  }
  getVideoTracks(): MediaStreamTrackAttrappe[] {
    return this.spuren.filter((s) => s.kind === "video");
  }
  addTrack(spur: MediaStreamTrackAttrappe): void {
    this.spuren.push(spur);
  }
  removeTrack(spur: MediaStreamTrackAttrappe): void {
    const i = this.spuren.indexOf(spur);
    if (i >= 0) this.spuren.splice(i, 1);
  }
  clone(): MediaStreamAttrappe {
    return new MediaStreamAttrappe(this.spuren.map((s) => s.clone()));
  }
}

/** navigator.mediaDevices. `verweigerung` (etwa "NotAllowedError") lässt getUserMedia scheitern; `verzoegerungMs` folgt der Uhr. */
export const mikrofon = {
  anfragen: [] as unknown[],
  stroeme: [] as MediaStreamAttrappe[],
  verweigerung: null as string | null,
  verzoegerungMs: 0,
  async getUserMedia(vorgaben: { audio?: unknown; video?: unknown } = {}): Promise<MediaStreamAttrappe> {
    mikrofon.anfragen.push(vorgaben);
    notiere("mikrofon", `getUserMedia ${JSON.stringify(vorgaben)}`);
    if (mikrofon.verzoegerungMs > 0) await new Promise((fertig) => globalThis.setTimeout(fertig, mikrofon.verzoegerungMs));
    if (mikrofon.verweigerung) throw new DOMException("Attrappe: Mikrofon verweigert", mikrofon.verweigerung);
    const spuren = [new MediaStreamTrackAttrappe("audio")];
    if (vorgaben.video) spuren.push(new MediaStreamTrackAttrappe("video"));
    const strom = new MediaStreamAttrappe(spuren);
    mikrofon.stroeme.push(strom);
    return strom;
  },
  geraete: {
    getUserMedia: (vorgaben?: { audio?: unknown; video?: unknown }) => mikrofon.getUserMedia(vorgaben),
    enumerateDevices: async () => [],
    getSupportedConstraints: () => ({}),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  },
};

/**
 * MediaRecorder. start() und stop() werden mitgeschrieben; liefere() gibt während der Aufnahme ein Stück (dataavailable), stop()
 * liefert den Rest (ein leeres Stück, wenn nichts mit puffere() angelegt ist) und danach stop, beides als Mikrotask.
 * Statisch: unterstuetzt (für isTypeSupported) und scheitertBeimErzeugen (DOMException-Name für den Konstruktor).
 */
export class MediaRecorderAttrappe extends Ereignisquelle {
  static alle: MediaRecorderAttrappe[] = [];
  static unterstuetzt: (typ: string) => boolean = () => true;
  static scheitertBeimErzeugen: string | null = null;
  static isTypeSupported(typ: string): boolean {
    return MediaRecorderAttrappe.unterstuetzt(typ);
  }
  /** Laufende Nummer für Namen im Protokoll; zuruecksetzenAttrappen() setzt sie auf 0. */
  static zaehler = 0;
  readonly name: string;
  readonly mimeType: string;
  state: "inactive" | "recording" | "paused" = "inactive";
  timeslice: number | undefined;
  ondataavailable: ((ereignis: AttrappenEreignis) => void) | null = null;
  onstop: ((ereignis: AttrappenEreignis) => void) | null = null;
  onstart: ((ereignis: AttrappenEreignis) => void) | null = null;
  onerror: ((ereignis: AttrappenEreignis) => void) | null = null;
  private rest: BlobPart[] = [];
  constructor(
    readonly stream: MediaStreamAttrappe,
    optionen: { mimeType?: string } = {},
  ) {
    super();
    if (MediaRecorderAttrappe.scheitertBeimErzeugen) throw new DOMException("Attrappe: keine Aufnahme", MediaRecorderAttrappe.scheitertBeimErzeugen);
    this.name = `aufnahme#${++MediaRecorderAttrappe.zaehler}`;
    this.mimeType = optionen.mimeType ?? "audio/webm;codecs=opus";
    MediaRecorderAttrappe.alle.push(this);
    notiere(this.name, `new ${this.mimeType}`);
  }
  start(timeslice?: number): void {
    if (this.state !== "inactive") throw new DOMException("Aufnahme läuft schon", "InvalidStateError");
    this.state = "recording";
    this.timeslice = timeslice;
    notiere(this.name, `start(${timeslice ?? ""})`);
    queueMicrotask(() => this.feuere("start"));
  }
  stop(): void {
    if (this.state === "inactive") return;
    this.state = "inactive";
    notiere(this.name, "stop");
    const teile = this.rest;
    this.rest = [];
    queueMicrotask(() => {
      this.feuere("dataavailable", { data: new Blob(teile, { type: this.mimeType }) });
      this.feuere("stop");
    });
  }
  pause(): void {
    if (this.state === "recording") this.state = "paused";
    notiere(this.name, "pause");
  }
  resume(): void {
    if (this.state === "paused") this.state = "recording";
    notiere(this.name, "resume");
  }
  requestData(): void {
    notiere(this.name, "requestData");
  }
  /** Ein Stück Aufnahme kommt an (sofort, im Aufruf). */
  liefere(inhalt: BlobPart = "ton"): void {
    notiere(this.name, "dataavailable");
    this.feuere("dataavailable", { data: new Blob([inhalt], { type: this.mimeType }) });
  }
  /** Legt ein Stück für die Lieferung beim stop() zurecht. */
  puffere(inhalt: BlobPart): void {
    this.rest.push(inhalt);
  }
}

// ---- WebSocket ------------------------------------------------------------------------------------------------------------------
/**
 * WebSocket. Öffnet von selbst über setTimeout(0) (folgt also der Uhr), solange automatischOeffnen gilt; sonst mit oeffne().
 * `gesendet` hält JSON-Texte gelesen, alles andere roh. close() schließt wie der Browser: erst CLOSING, das close-Ereignis kommt
 * im nächsten Zeitgeber. Vom Dienst: empfange(), scheitere(), schliesseVonDrueben().
 */
export class WebSocketAttrappe extends Ereignisquelle {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;
  static alle: WebSocketAttrappe[] = [];
  static automatischOeffnen = true;
  /** Laufende Nummer für Namen im Protokoll; zuruecksetzenAttrappen() setzt sie auf 0. */
  static zaehler = 0;
  readonly name: string;
  readyState = 0;
  binaryType: "blob" | "arraybuffer" = "blob";
  bufferedAmount = 0;
  protocol = "";
  extensions = "";
  readonly gesendet: unknown[] = [];
  geschlossen: { code?: number; grund?: string } | null = null;
  onopen: ((ereignis: AttrappenEreignis) => void) | null = null;
  onmessage: ((ereignis: AttrappenEreignis) => void) | null = null;
  onerror: ((ereignis: AttrappenEreignis) => void) | null = null;
  onclose: ((ereignis: AttrappenEreignis) => void) | null = null;
  constructor(
    readonly url: string,
    readonly protokolle?: string | string[],
  ) {
    super();
    this.name = `ws#${++WebSocketAttrappe.zaehler}`;
    WebSocketAttrappe.alle.push(this);
    notiere(this.name, `new ${url}`);
    if (WebSocketAttrappe.automatischOeffnen)
      globalThis.setTimeout(() => {
        if (this.readyState === 0) this.oeffne();
      }, 0);
  }
  send(daten: unknown): void {
    if (this.readyState === 0) throw new DOMException("WebSocket noch im Aufbau", "InvalidStateError");
    if (this.readyState !== 1) return;
    let wert = daten;
    if (typeof daten === "string" && daten !== "") {
      try {
        wert = JSON.parse(daten);
      } catch {
        // kein JSON: roh ablegen
      }
    }
    this.gesendet.push(wert);
    const kurz = typeof daten === "string" ? daten.slice(0, 80) : `<${(daten as { byteLength?: number; size?: number })?.byteLength ?? (daten as { size?: number })?.size ?? "?"} Bytes>`;
    notiere(this.name, `send ${kurz}`);
  }
  close(code?: number, grund?: string): void {
    if (this.readyState >= 2) return;
    this.readyState = 2;
    this.geschlossen = { code, grund };
    notiere(this.name, `close(${code ?? ""})`);
    globalThis.setTimeout(() => {
      this.readyState = 3;
      this.feuere("close", { code: code ?? 1005, reason: grund ?? "", wasClean: true });
    }, 0);
  }
  /** Die Verbindung steht. */
  oeffne(): void {
    this.readyState = 1;
    notiere(this.name, "open");
    this.feuere("open");
  }
  /** Eine Nachricht des Dienstes: Text, Binärdaten oder ein Objekt (wird als JSON-Text geschickt). */
  empfange(nachricht: string | ArrayBuffer | ArrayBufferView | object): void {
    let data: unknown;
    if (typeof nachricht === "string") data = nachricht;
    else if (nachricht instanceof ArrayBuffer || ArrayBuffer.isView(nachricht)) {
      const roh = nachricht instanceof ArrayBuffer ? nachricht : nachricht.buffer.slice(nachricht.byteOffset, nachricht.byteOffset + nachricht.byteLength);
      data = this.binaryType === "arraybuffer" ? roh : new Blob([roh as ArrayBuffer]);
    } else data = JSON.stringify(nachricht);
    notiere(this.name, `message ${typeof data === "string" ? data.slice(0, 80) : "<binär>"}`);
    this.feuere("message", { data });
  }
  /** Fehler der Verbindung: error, danach close mit 1006. */
  scheitere(): void {
    notiere(this.name, "error");
    this.feuere("error");
    this.readyState = 3;
    this.feuere("close", { code: 1006, reason: "", wasClean: false });
  }
  /** Der Dienst schließt die Verbindung. */
  schliesseVonDrueben(code = 1000, grund = ""): void {
    notiere(this.name, `geschlossen von drüben (${code})`);
    this.readyState = 3;
    this.feuere("close", { code, reason: grund, wasClean: code === 1000 });
  }
  /** Die gesendeten JSON-Nachrichten. */
  json(): Record<string, unknown>[] {
    return this.gesendet.filter((n): n is Record<string, unknown> => typeof n === "object" && n !== null && !ArrayBuffer.isView(n) && !(n instanceof ArrayBuffer));
  }
}

// ---- fetch ----------------------------------------------------------------------------------------------------------------------
export interface FetchAufruf {
  nr: number;
  /** Wie übergeben, etwa "/api/ki-sprachausgabe?nachricht=...". */
  url: string;
  methode: string;
  pfad: string;
  suche: URLSearchParams;
  kopf: Record<string, string>;
  koerper: unknown;
  /** Der Körper als JSON gelesen, oder undefined. */
  json: unknown;
  signal: AbortSignal | null;
}

/** Ein Strom für Antworten, die stückweise kommen (Chat, Server-Sent Events). */
export interface StromAttrappe {
  readonly lesbar: ReadableStream<Uint8Array>;
  readonly geschrieben: string[];
  readonly abgebrochen: boolean;
  schreibe(teil: string | Uint8Array): void;
  /** Ein Ereignis im SSE-Format: "data: <json>\n\n". */
  sse(daten: unknown): void;
  ende(): void;
  scheitere(fehler: unknown): void;
}

export function erzeugeStrom(): StromAttrappe {
  let steuerung: ReadableStreamDefaultController<Uint8Array> | null = null;
  let abgebrochen = false;
  const kodierer = new TextEncoder();
  const geschrieben: string[] = [];
  const lesbar = new ReadableStream<Uint8Array>({
    start(s) {
      steuerung = s;
    },
    cancel() {
      abgebrochen = true;
    },
  });
  const schreibe = (teil: string | Uint8Array) => {
    geschrieben.push(typeof teil === "string" ? teil : `<${teil.byteLength} Bytes>`);
    steuerung!.enqueue(typeof teil === "string" ? kodierer.encode(teil) : teil);
  };
  return {
    lesbar,
    geschrieben,
    get abgebrochen() {
      return abgebrochen;
    },
    schreibe,
    sse(daten) {
      schreibe(`data: ${typeof daten === "string" ? daten : JSON.stringify(daten)}\n\n`);
    },
    ende() {
      steuerung!.close();
    },
    scheitere(fehler) {
      steuerung!.error(fehler);
    },
  };
}

/** Was eine Regel antwortet. `fehler` lässt fetch scheitern (wie ein Netzfehler), `verzoegerungMs` folgt der Uhr. */
export type AntwortVorgabe =
  | Response
  | {
      status?: number;
      kopf?: Record<string, string>;
      json?: unknown;
      text?: string;
      bytes?: Uint8Array | ArrayBuffer;
      strom?: StromAttrappe;
      verzoegerungMs?: number;
      fehler?: unknown;
    };
type Antwortgeber = AntwortVorgabe | ((aufruf: FetchAufruf) => AntwortVorgabe | Promise<AntwortVorgabe>);
type Muster = string | RegExp | ((aufruf: FetchAufruf) => boolean);
interface Regel {
  muster: Muster;
  antwort: Antwortgeber;
  einmal: boolean;
}

function passt(muster: Muster, a: FetchAufruf): boolean {
  if (typeof muster === "function") return muster(a);
  if (muster instanceof RegExp) return muster.test(`${a.methode} ${a.url}`);
  const [erstes, zweites] = muster.split(" ");
  return zweites === undefined ? a.pfad === erstes : a.methode === erstes && a.pfad === zweites;
}

function baueAntwort(v: Exclude<AntwortVorgabe, Response>): Response {
  const status = v.status ?? 200;
  const kopf: Record<string, string> = { ...v.kopf };
  let koerper: BodyInit | null = null;
  if (v.strom) koerper = v.strom.lesbar;
  else if (v.json !== undefined) {
    koerper = JSON.stringify(v.json);
    kopf["content-type"] ??= "application/json";
  } else if (v.text !== undefined) koerper = v.text;
  else if (v.bytes !== undefined) koerper = v.bytes as BodyInit;
  return new Response(koerper, { status, headers: kopf });
}

const regeln: Regel[] = [];
const aufrufe: FetchAufruf[] = [];
const unbeantwortet: FetchAufruf[] = [];

/**
 * fetch. Jeder Aufruf landet in `aufrufe`; geantwortet wird nach der zuletzt angelegten passenden Regel. Muster: "/pfad" (jede
 * Methode, Pfad ohne Abfrage), "POST /pfad", ein RegExp gegen "METHODE url" oder eine Funktion des Aufrufs. Ohne passende Regel
 * scheitert fetch mit TypeError und der Aufruf steht in `unbeantwortet`. Ein AbortSignal bricht wie im Browser mit AbortError ab.
 */
export const netz = {
  aufrufe,
  unbeantwortet,
  antworte(muster: Muster, antwort: Antwortgeber, optionen: { einmal?: boolean } = {}): void {
    regeln.push({ muster, antwort, einmal: optionen.einmal ?? false });
  },
  /** Hält die Antwort für den nächsten passenden Aufruf zurück, bis der Test gib() oder scheitere() ruft. */
  halte(muster: Muster): { gib(antwort: AntwortVorgabe): void; scheitere(fehler: unknown): void; readonly aufruf: FetchAufruf | null } {
    let freigabe: ((v: AntwortVorgabe) => void) | null = null;
    let absage: ((f: unknown) => void) | null = null;
    let gehalten: FetchAufruf | null = null;
    netz.antworte(
      muster,
      (a) =>
        new Promise<AntwortVorgabe>((ja, nein) => {
          gehalten = a;
          freigabe = ja;
          absage = nein;
        }),
      { einmal: true },
    );
    return {
      gib: (v) => freigabe?.(v),
      scheitere: (f) => absage?.(f),
      get aufruf() {
        return gehalten;
      },
    };
  },
  async fetch(eingabe: unknown, init: RequestInit = {}): Promise<Response> {
    const anfrage = eingabe instanceof Request ? eingabe : null;
    const url = anfrage ? anfrage.url : String(eingabe);
    const methode = (init.method ?? anfrage?.method ?? "GET").toUpperCase();
    const adresse = new URL(url, fenster().location.href);
    const kopf: Record<string, string> = {};
    new Headers(init.headers ?? anfrage?.headers).forEach((wert, name) => (kopf[name] = wert));
    let json: unknown;
    if (typeof init.body === "string") {
      try {
        json = JSON.parse(init.body);
      } catch {
        json = undefined;
      }
    }
    const signal = init.signal ?? anfrage?.signal ?? null;
    const a: FetchAufruf = { nr: aufrufe.length + 1, url, methode, pfad: adresse.pathname, suche: adresse.searchParams, kopf, koerper: init.body, json, signal };
    aufrufe.push(a);
    notiere("fetch", `${methode} ${url}`);
    const abbruch = () => new DOMException("Die Anfrage wurde abgebrochen.", "AbortError");
    if (signal?.aborted) throw abbruch();
    const i = regeln.findLastIndex((r) => passt(r.muster, a));
    if (i < 0) {
      unbeantwortet.push(a);
      throw new TypeError(`fetch-Attrappe: keine Regel für ${methode} ${url}`);
    }
    const regel = regeln[i]!;
    if (regel.einmal) regeln.splice(i, 1);
    const antwort = (async () => {
      const v = typeof regel.antwort === "function" ? await regel.antwort(a) : regel.antwort;
      if (v instanceof Response) return v;
      if (v.verzoegerungMs) await new Promise((fertig) => globalThis.setTimeout(fertig, v.verzoegerungMs));
      if (v.fehler !== undefined) throw v.fehler;
      if (signal?.aborted) throw abbruch();
      signal?.addEventListener("abort", () => v.strom?.scheitere(abbruch()), { once: true });
      return baueAntwort(v);
    })();
    if (!signal) return antwort;
    return Promise.race([antwort, new Promise<never>((_, nein) => signal.addEventListener("abort", () => nein(abbruch()), { once: true }))]);
  },
};

// ---- Beobachter -----------------------------------------------------------------------------------------------------------------
const beschreibe = (el: Element): string =>
  `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${el.classList?.[0] ? `.${el.classList[0]}` : ""}`;

/** ResizeObserver. Meldet nichts von selbst (der Browser meldet einmal nach observe); melde() oder meldeAlle() rufen den Beobachter
 *  mit den Rechtecken aus setzeRechteck(). */
export class ResizeObserverAttrappe {
  static alle: ResizeObserverAttrappe[] = [];
  readonly beobachtet = new Set<Element>();
  getrennt = false;
  constructor(private readonly rueckruf: (eintraege: unknown[], beobachter: ResizeObserverAttrappe) => void) {
    ResizeObserverAttrappe.alle.push(this);
  }
  observe(el: Element): void {
    this.getrennt = false;
    this.beobachtet.add(el);
    notiere("beobachter", `resize observe ${beschreibe(el)}`);
  }
  unobserve(el: Element): void {
    this.beobachtet.delete(el);
  }
  disconnect(): void {
    this.getrennt = true;
    this.beobachtet.clear();
    notiere("beobachter", "resize disconnect");
  }
  melde(ziele: Element[] = [...this.beobachtet]): void {
    this.rueckruf(
      ziele.map((target) => {
        const r = target.getBoundingClientRect();
        const box = [{ inlineSize: r.width, blockSize: r.height }];
        return { target, contentRect: r, borderBoxSize: box, contentBoxSize: box, devicePixelContentBoxSize: box };
      }),
      this,
    );
  }
  static meldeAlle(): void {
    for (const b of ResizeObserverAttrappe.alle) if (!b.getrennt && b.beobachtet.size > 0) b.melde();
  }
}

/** IntersectionObserver. melde(ziel, sichtbar) ruft den Beobachter mit isIntersecting und intersectionRatio. */
export class IntersectionObserverAttrappe {
  static alle: IntersectionObserverAttrappe[] = [];
  readonly beobachtet = new Set<Element>();
  getrennt = false;
  readonly root: Element | null;
  readonly rootMargin: string;
  readonly thresholds: number[];
  constructor(
    private readonly rueckruf: (eintraege: unknown[], beobachter: IntersectionObserverAttrappe) => void,
    optionen: { root?: Element | null; rootMargin?: string; threshold?: number | number[] } = {},
  ) {
    this.root = optionen.root ?? null;
    this.rootMargin = optionen.rootMargin ?? "0px";
    this.thresholds = Array.isArray(optionen.threshold) ? optionen.threshold : [optionen.threshold ?? 0];
    IntersectionObserverAttrappe.alle.push(this);
  }
  observe(el: Element): void {
    this.beobachtet.add(el);
    notiere("beobachter", `intersection observe ${beschreibe(el)}`);
  }
  unobserve(el: Element): void {
    this.beobachtet.delete(el);
  }
  disconnect(): void {
    this.getrennt = true;
    this.beobachtet.clear();
  }
  takeRecords(): unknown[] {
    return [];
  }
  melde(ziel: Element, sichtbar: boolean | number = true): void {
    const anteil = typeof sichtbar === "number" ? sichtbar : sichtbar ? 1 : 0;
    const r = ziel.getBoundingClientRect();
    this.rueckruf([{ target: ziel, isIntersecting: anteil > 0, intersectionRatio: anteil, boundingClientRect: r, intersectionRect: r, rootBounds: null, time: performance.now() }], this);
  }
}

// ---- matchMedia -----------------------------------------------------------------------------------------------------------------
const abfrageSchluessel = (abfrage: string) => abfrage.replace(/\s+/g, "").toLowerCase();

class MediaQueryListAttrappe extends Ereignisquelle {
  onchange: ((ereignis: AttrappenEreignis) => void) | null = null;
  constructor(readonly media: string) {
    super();
  }
  get matches(): boolean {
    return medienAbfragen.werte.get(abfrageSchluessel(this.media)) ?? false;
  }
  addListener(hoerer: (ereignis: AttrappenEreignis) => void): void {
    this.addEventListener("change", hoerer);
  }
  removeListener(hoerer: (ereignis: AttrappenEreignis) => void): void {
    this.removeEventListener("change", hoerer);
  }
}

/** window.matchMedia. Jede Abfrage passt nicht, bis setze() sie einschaltet (Leerzeichen und Groß/Klein zählen nicht). */
export const medienAbfragen = {
  werte: new Map<string, boolean>(),
  listen: [] as MediaQueryListAttrappe[],
  matchMedia(abfrage: string): MediaQueryListAttrappe {
    const liste = new MediaQueryListAttrappe(abfrage);
    medienAbfragen.listen.push(liste);
    return liste;
  },
  /** Ändert eine Abfrage und meldet change an alle Listen dieser Abfrage. */
  setze(abfrage: string, passt: boolean): void {
    const schluessel = abfrageSchluessel(abfrage);
    if ((medienAbfragen.werte.get(schluessel) ?? false) === passt) {
      medienAbfragen.werte.set(schluessel, passt);
      return;
    }
    medienAbfragen.werte.set(schluessel, passt);
    notiere("medienabfrage", `${abfrage} = ${passt}`);
    for (const l of medienAbfragen.listen) if (abfrageSchluessel(l.media) === schluessel) l.feuere("change", { matches: passt, media: l.media });
  },
};

// ---- <audio> und <video> --------------------------------------------------------------------------------------------------------
const medienZustand = new WeakMap<HTMLMediaElement, { pausiert: boolean; beendet: boolean }>();
function zustandVon(el: HTMLMediaElement) {
  let z = medienZustand.get(el);
  if (!z) {
    z = { pausiert: true, beendet: false };
    medienZustand.set(el, z);
  }
  return z;
}

/** Medienelemente: play() gelingt sofort, außer `playFehler` hält einen DOMException-Namen bereit (je Aufruf einer). beende() spielt
 *  das Ende nach (pause, dann ended), scheitere() einen Ladefehler. Gespielt wird nichts. */
export const medienElemente = {
  gespielt: [] as HTMLMediaElement[],
  playFehler: [] as string[],
  beende(el: HTMLMediaElement): void {
    const z = zustandVon(el);
    z.beendet = true;
    z.pausiert = true;
    notiere("medien", `ended ${el.getAttribute("src") ?? ""}`);
    el.dispatchEvent(new (fenster().Event)("pause"));
    el.dispatchEvent(new (fenster().Event)("ended"));
  },
  scheitere(el: HTMLMediaElement): void {
    notiere("medien", `error ${el.getAttribute("src") ?? ""}`);
    el.dispatchEvent(new (fenster().Event)("error"));
  },
};

function patchMedienElemente(f: Fenster): void {
  const proto = f.HTMLMediaElement.prototype;
  Object.defineProperty(proto, "paused", { configurable: true, get: function (this: HTMLMediaElement) { return zustandVon(this).pausiert; } });
  Object.defineProperty(proto, "ended", { configurable: true, get: function (this: HTMLMediaElement) { return zustandVon(this).beendet; } });
  proto.play = function (this: HTMLMediaElement) {
    notiere("medien", `play ${this.getAttribute("src") ?? ""}`);
    const fehlerName = medienElemente.playFehler.shift();
    if (fehlerName) return Promise.reject(new DOMException("Attrappe: play() verweigert", fehlerName));
    const z = zustandVon(this);
    z.pausiert = false;
    z.beendet = false;
    medienElemente.gespielt.push(this);
    queueMicrotask(() => this.dispatchEvent(new f.Event("play")));
    return Promise.resolve();
  };
  proto.pause = function (this: HTMLMediaElement) {
    notiere("medien", "pause");
    const z = zustandVon(this);
    if (z.pausiert) return;
    z.pausiert = true;
    queueMicrotask(() => this.dispatchEvent(new f.Event("pause")));
  };
  proto.load = function () {
    notiere("medien", "load");
  };
}

// ---- Leinwand -------------------------------------------------------------------------------------------------------------------
const leinwandZaehler = new WeakMap<object, Map<string, number>>();
const leinwandKontexte = new WeakMap<object, object>();

/** Canvas: getContext("2d") gibt einen Kontext, der jede Methode annimmt und nur zählt, wie oft sie lief (Bildschleifen bleiben so
 *  klein im Speicher). Gezeichnet wird nichts. */
export const leinwand = {
  aufrufe(el: HTMLCanvasElement): Record<string, number> {
    return Object.fromEntries(leinwandZaehler.get(el) ?? []);
  },
};

function erzeugeKontext2d(el: HTMLCanvasElement): object {
  const zaehler = new Map<string, number>();
  leinwandZaehler.set(el, zaehler);
  const werte: Record<string | symbol, unknown> = {
    canvas: el,
    fillStyle: "#000000",
    strokeStyle: "#000000",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    font: "10px sans-serif",
    textAlign: "start",
    textBaseline: "alphabetic",
    shadowBlur: 0,
    shadowColor: "rgba(0, 0, 0, 0)",
    imageSmoothingEnabled: true,
  };
  const bild = (b: unknown, h: unknown) => ({ width: Number(b), height: Number(h), data: new Uint8ClampedArray(Math.max(0, Number(b) * Number(h) * 4)) });
  const verlauf = () => ({ addColorStop: () => undefined });
  const besondere: Record<string, (...a: unknown[]) => unknown> = {
    measureText: (text) => ({ width: String(text).length * 6, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }),
    getImageData: (_x, _y, b, h) => bild(b, h),
    createImageData: (b, h) => bild(b, h),
    createLinearGradient: verlauf,
    createRadialGradient: verlauf,
    createConicGradient: verlauf,
    createPattern: () => null,
    isPointInPath: () => false,
    isPointInStroke: () => false,
    getLineDash: () => [],
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
  };
  const funktionen = new Map<string, (...a: unknown[]) => unknown>();
  return new Proxy(werte, {
    get(ziel, name) {
      if (typeof name !== "string" || name in ziel) return ziel[name];
      let fn = funktionen.get(name);
      if (!fn) {
        const eigen = besondere[name];
        fn = (...a: unknown[]) => {
          zaehler.set(name, (zaehler.get(name) ?? 0) + 1);
          return eigen ? eigen(...a) : undefined;
        };
        funktionen.set(name, fn);
      }
      return fn;
    },
    set(ziel, name, wert) {
      ziel[name] = wert;
      return true;
    },
  });
}

function patchLeinwand(f: Fenster): void {
  const proto = f.HTMLCanvasElement.prototype as unknown as Record<string, unknown>;
  proto.getContext = function (this: HTMLCanvasElement, art: string) {
    if (art !== "2d") return null;
    let k = leinwandKontexte.get(this);
    if (!k) {
      k = erzeugeKontext2d(this);
      leinwandKontexte.set(this, k);
    }
    return k;
  };
  proto.toDataURL = () => "data:image/png;base64,";
}

// ---- Elemente und Fenster: Rechtecke, Scrollen, Zeigerfang ----------------------------------------------------------------------
export interface Rechteck {
  x: number;
  y: number;
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
  toJSON(): unknown;
}
const rechtecke = new WeakMap<Element, Rechteck>();
function baueRechteck(r: { left?: number; top?: number; width?: number; height?: number }): Rechteck {
  const left = r.left ?? 0;
  const top = r.top ?? 0;
  const width = r.width ?? 0;
  const height = r.height ?? 0;
  const rechteck = { x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: () => ({ left, top, width, height }) };
  return rechteck;
}

/** Was getBoundingClientRect() dieses Elements liefert. jsdom hat kein Layout: ohne Angabe ist alles 0. */
export function setzeRechteck(el: Element, r: { left?: number; top?: number; width?: number; height?: number }): void {
  rechtecke.set(el, baueRechteck(r));
}

const zeigerFang = new WeakMap<Element, Set<number>>();

function patchElemente(f: Fenster): void {
  const proto = f.Element.prototype;
  proto.getBoundingClientRect = function (this: Element) {
    return (rechtecke.get(this) ?? baueRechteck({})) as unknown as DOMRect;
  };
  proto.scrollIntoView = function (this: Element) {
    notiere("dom", `scrollIntoView ${beschreibe(this)}`);
  };
  proto.setPointerCapture = function (this: Element, id: number) {
    const ids = zeigerFang.get(this) ?? new Set<number>();
    ids.add(id);
    zeigerFang.set(this, ids);
    notiere("dom", `setPointerCapture(${id}) ${beschreibe(this)}`);
  };
  proto.releasePointerCapture = function (this: Element, id: number) {
    zeigerFang.get(this)?.delete(id);
    notiere("dom", `releasePointerCapture(${id}) ${beschreibe(this)}`);
  };
  proto.hasPointerCapture = function (this: Element, id: number) {
    return zeigerFang.get(this)?.has(id) ?? false;
  };
  const scrolle = (art: string) => (...a: unknown[]) => notiere("fenster", `${art} ${JSON.stringify(a)}`);
  Object.assign(f, { scrollTo: scrolle("scrollTo"), scrollBy: scrolle("scrollBy"), scroll: scrolle("scroll") });
}

// ---- Objekt-URLs ----------------------------------------------------------------------------------------------------------------
/** URL.createObjectURL und revokeObjectURL: die URLs heißen blob:attrappe/1, /2 ... je Testfall. */
export const objektUrls = {
  erzeugt: [] as { url: string; objekt: unknown }[],
  widerrufen: [] as string[],
};

function patchObjektUrls(klassen: object[]): void {
  for (const k of klassen) {
    Object.defineProperty(k, "createObjectURL", {
      configurable: true,
      writable: true,
      value: (objekt: unknown) => {
        const url = `blob:attrappe/${objektUrls.erzeugt.length + 1}`;
        objektUrls.erzeugt.push({ url, objekt });
        notiere("url", `createObjectURL ${url}`);
        return url;
      },
    });
    Object.defineProperty(k, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: (url: string) => {
        objektUrls.widerrufen.push(url);
        notiere("url", `revokeObjectURL ${url}`);
      },
    });
  }
}

// ---- Einhängen und Zurücksetzen -------------------------------------------------------------------------------------------------
/** Hängt alle Attrappen global und am Fenster ein. Ruft dom-globale.ts einmal beim Laden. */
export function installiereAttrappen(f: Fenster): void {
  fensterRef = f;
  const setze = (name: string, wert: unknown) => {
    for (const ziel of [globalThis, f]) Object.defineProperty(ziel, name, { value: wert, configurable: true, writable: true });
  };
  setze("AudioContext", AudioContextAttrappe);
  setze("webkitAudioContext", AudioContextAttrappe);
  setze("MediaStream", MediaStreamAttrappe);
  setze("MediaStreamTrack", MediaStreamTrackAttrappe);
  setze("MediaRecorder", MediaRecorderAttrappe);
  setze("WebSocket", WebSocketAttrappe);
  setze("fetch", netz.fetch);
  setze("ResizeObserver", ResizeObserverAttrappe);
  setze("IntersectionObserver", IntersectionObserverAttrappe);
  setze("matchMedia", medienAbfragen.matchMedia);
  for (const name of ["Response", "Request", "Headers", "ReadableStream"]) {
    if (!(name in f)) Object.defineProperty(f, name, { value: (globalThis as unknown as Record<string, unknown>)[name], configurable: true, writable: true });
  }
  Object.defineProperty(f.navigator, "mediaDevices", { value: mikrofon.geraete, configurable: true });
  patchMedienElemente(f);
  patchLeinwand(f);
  patchElemente(f);
  patchObjektUrls([globalThis.URL, f.URL]);
}

/** Leert Protokoll und Aufzeichnungen und stellt die Vorgaben aller Attrappen wieder her (zwischen zwei Testfällen). */
export function zuruecksetzenAttrappen(): void {
  protokoll.leere();
  zeitquellen.clear();
  for (const k of [AudioContextAttrappe, MediaStreamTrackAttrappe, MediaStreamAttrappe, MediaRecorderAttrappe, WebSocketAttrappe]) k.zaehler = 0;
  AudioContextAttrappe.alle.length = 0;
  AudioContextAttrappe.anfangsZustand = "running";
  AudioContextAttrappe.pegel = { zeit: 0, frequenz: 0 };
  AudioContextAttrappe.dekodierDauer = 1;
  mikrofon.anfragen.length = 0;
  mikrofon.stroeme.length = 0;
  mikrofon.verweigerung = null;
  mikrofon.verzoegerungMs = 0;
  MediaRecorderAttrappe.alle.length = 0;
  MediaRecorderAttrappe.unterstuetzt = () => true;
  MediaRecorderAttrappe.scheitertBeimErzeugen = null;
  WebSocketAttrappe.alle.length = 0;
  WebSocketAttrappe.automatischOeffnen = true;
  regeln.length = 0;
  aufrufe.length = 0;
  unbeantwortet.length = 0;
  ResizeObserverAttrappe.alle.length = 0;
  IntersectionObserverAttrappe.alle.length = 0;
  medienAbfragen.werte.clear();
  medienAbfragen.listen.length = 0;
  medienElemente.gespielt.length = 0;
  medienElemente.playFehler.length = 0;
  objektUrls.erzeugt.length = 0;
  objektUrls.widerrufen.length = 0;
}
