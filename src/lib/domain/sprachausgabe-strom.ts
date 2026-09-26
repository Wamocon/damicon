// Vorlesen als Strom: Soniox TTS ueber den WebSocket, direkt aus dem Browser.
// Reine Logik ohne Netz und ohne Audio - damit supabase/tests/ki-assistent.mjs
// sie direkt pruefen kann. Die Verbindung selbst: components/ki/
// sprachausgabe-strom.ts, der Schluessel: app/api/ki-sprachausgabe/schluessel.
//
// Warum ein Strom: Soniox erzeugt Sprache etwa in Echtzeit (Leitfaden zu
// temporaeren Schluesseln, soniox.com/docs/guides/temporary-api-keys, abgerufen
// 24.09.2026: "TTS streams audio at roughly real-time pace"). Bis zum
// 24.09.2026 holte der Browser jeden Abschnitt als ganze Datei - er wartete also
// je Abschnitt ungefaehr so lange, wie der Abschnitt klingt. Gemessen in den
// Protokollen der Vorschau: 5,5 s bis zum ersten Ton, danach Luecken zwischen
// den Abschnitten, weil der naechste nie rechtzeitig fertig war.
//
// Das Protokoll (github.com/soniox/soniox-js, packages/core/src/realtime/tts.ts
// und soniox.com/docs/api-reference/tts/websocket-api, abgerufen 24.09.2026):
//
//   - wss://tts-rt.<region>.soniox.com/tts-websocket, nur JSON-Textframes.
//   - Je Strom eine Startnachricht mit api_key, stream_id und Konfiguration.
//   - Text beliebig oft als {text, text_end: false, stream_id}; der Server
//     haengt die Stuecke unveraendert aneinander - deshalb endet jedes Stueck
//     mit einem Leerzeichen, sonst liest die Stimme "Satz.Naechster".
//   - Ende {text: "", text_end: true}, Abbruch {stream_id, cancel: true}.
//   - Antworten {audio: base64, audio_end, stream_id}, dann {terminated: true}.
//   - Grenzen: hoechstens 2 Minuten Audio je Strom, ein Strom ohne neuen Text
//     wird nach "einigen Sekunden" mit 408 beendet, 3 gleichzeitige Stroeme je
//     Organisation, Keepalive {keep_alive: true} fuer die Verbindung.

/** PCM, 16 Bit, little endian: ohne Dateikopf und ohne MP3-Vorlauf, und
 *  jedes Stueck laesst sich sofort abspielen. */
export const STROM_AUDIOFORMAT = "pcm_s16le" as const;
/** Standard bei Soniox; der Browser rechnet selbst auf seine Rate um. */
export const STROM_ABTASTRATE = 24_000;

/** Hoechstens so viele Zeichen je Strom bei Tempo 1,1. Soniox liefert je Strom
 *  hoechstens 2 Minuten Audio (danach 413 und Schluss); bei rund 14 Zeichen je
 *  Sekunde und Tempo 1,0 sind 1300 Zeichen bei Tempo 1,1 etwa 85 Sekunden.
 *  Langsameres Tempo heisst weniger Zeichen, siehe zeichenGrenze(). */
export const STROM_HOECHSTENS_ZEICHEN = 1_300;
/** Grobe Sprechgeschwindigkeit bei Tempo 1,0 (gemessen in den Protokollen der
 *  Vorschau am 24.09.2026: 61 bis 72 ms je Zeichen). */
export const ZEICHEN_JE_SEKUNDE = 14;

/** Zeichengrenze je Strom fuer ein Tempo: bei 0,7 etwa 830 Zeichen, damit
 *  auch dort der Strom unter den 2 Minuten bleibt. */
export function zeichenGrenze(tempo: number | undefined): number {
  const t = tempo && Number.isFinite(tempo) && tempo > 0 ? tempo : 1.1;
  return Math.floor((STROM_HOECHSTENS_ZEICHEN * t) / 1.1);
}

/** So lange ohne neuen Text, dann wird der Strom selbst beendet (text_end).
 *  Soniox beendet ihn sonst nach "einigen Sekunden" mit 408 (LiveKit hat 8 bis
 *  18 s beobachtet und schliesst nach 5 s). Der naechste Text oeffnet einen
 *  neuen Strom - das passiert, waehrend ein Werkzeug laeuft. */
export const STROM_RUHE_MS = 4_000;

/** Keepalive der Verbindung, wie das offizielle SDK. */
export const STROM_KEEPALIVE_MS = 5_000;

/** Wie lange ein Schluessel einen Strom oeffnen darf. Laufende Stroeme endet
 *  der Ablauf nicht. Einmalig: ein Schluessel, ein Strom - der Browser holt
 *  fuer den naechsten Strom einen neuen (und haelt einen auf Vorrat). So kann
 *  ein Schluessel hoechstens einen Strom von STROM_SITZUNG_S sprechen. */
export const STROM_SCHLUESSEL_GUELTIG_S = 60;
/** Feste Obergrenze der Schluesselausgabe je Person und Minute - greift auch
 *  ohne Einstellung im Admin-Bereich. Eine Antwort braucht meist einen oder
 *  zwei Stroeme; zwoelf je Minute reichen fuer jedes Gespraech. */
export const STROM_SCHLUESSEL_JE_MINUTE = 12;

/** Womit der Browser belegt, dass es etwas vorzulesen gibt: die laufende
 *  Antwort (Zug-Nachweis, vom Chat-Stream signiert, Nummer 0 und leerer Text -
 *  nie mit einem echten Abschnitt zu verwechseln, der Abschnitts-Weg lehnt
 *  leeren Text ab) oder eine gespeicherte eigene Antwort (Nachrichten-ID, per
 *  RLS geprueft). Ohne Nachweis gibt es keinen Schluessel. */
export type StromNachweis =
  | { art: "zug"; zug: string; ablauf: number; sig: string }
  | { art: "nachricht"; nachrichtId: string };
/** Hoechstdauer eines einzelnen Stroms - knapp ueber den 2 Minuten Audio. */
export const STROM_SITZUNG_S = 150;
/** Laeuft der Schluessel in weniger als dieser Zeit ab, wird ein neuer geholt,
 *  bevor der naechste Strom beginnt. Der Schluessel muss nur das Oeffnen des
 *  Stroms decken (Soniox prueft ihn bei der Startnachricht), also genuegen
 *  wenige Sekunden - bei 60 s Gueltigkeit bleibt ein Vorrat so 50 s brauchbar. */
export const STROM_SCHLUESSEL_RESERVE_MS = 10_000;

/** Vorlauf vor dem ersten Stueck: faengt kleine Schwankungen im Netz ab, ohne
 *  dass man ihn hoert. Soniox liefert etwa in Echtzeit - der Vorsprung waechst
 *  also nicht von selbst. Nach jedem Aussetzer (das Netz war langsamer als die
 *  Stimme) wird er verdoppelt, bis STROM_VORLAUF_MAX_S (naechsterVorlauf). */
export const STROM_VORLAUF_S = 0.25;
export const STROM_VORLAUF_MAX_S = 1.0;

export function naechsterVorlauf(vorlauf: number): number {
  return Math.min(STROM_VORLAUF_MAX_S, vorlauf * 2);
}

/** Adresse des TTS-WebSockets - wie sonioxLiveAdresse() in domain/
 *  diktat-live.ts aus SONIOX_API_URL abgeleitet (api.eu.soniox.com ->
 *  tts-rt.eu.soniox.com), oder ausdruecklich ueber SONIOX_TTS_WS_URL. Keine
 *  Region im Code. */
export function sonioxTtsWsAdresse(apiBasis: string | null | undefined, ausdruecklich?: string | null): string | null {
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
  return `wss://tts-rt.${host.slice("api.".length)}/tts-websocket`;
}

/** Was der Server dem Browser fuer einen Strom vorgibt - der Browser setzt
 *  nichts davon selbst. */
export interface StromKonfiguration {
  model: string;
  language: string;
  voice: string;
  audio_format: typeof STROM_AUDIOFORMAT;
  sample_rate: number;
  speed?: number;
  reduce_silence?: boolean;
}

export function startNachricht(apiKey: string, streamId: string, k: StromKonfiguration): Record<string, unknown> {
  return { api_key: apiKey, stream_id: streamId, ...k };
}

/** Jedes Stueck endet mit genau einem Leerzeichen (siehe oben). */
export function textNachricht(streamId: string, text: string): Record<string, unknown> {
  const t = text.replace(/\s+$/, "");
  return { text: t ? `${t} ` : "", text_end: false, stream_id: streamId };
}

export function endeNachricht(streamId: string): Record<string, unknown> {
  return { text: "", text_end: true, stream_id: streamId };
}

export function abbruchNachricht(streamId: string): Record<string, unknown> {
  return { stream_id: streamId, cancel: true };
}

export const KEEPALIVE_NACHRICHT = { keep_alive: true } as const;

export type StromEreignis =
  | { art: "audio"; stream: string; audio: string; ende: boolean }
  | { art: "audio-ende"; stream: string }
  | { art: "beendet"; stream: string }
  | { art: "fehler"; stream: string | null; code: number; typ: string; text: string }
  | { art: "unbekannt" };

/** Eine Nachricht des Servers, schon als JSON gelesen. Mehrere Felder koennen
 *  gemeinsam kommen (letztes Audio mit audio_end); terminated steht allein. */
export function leseStromNachricht(roh: unknown): StromEreignis {
  if (!roh || typeof roh !== "object") return { art: "unbekannt" };
  const n = roh as Record<string, unknown>;
  const stream = typeof n.stream_id === "string" ? n.stream_id : null;
  if (n.error_code !== undefined || n.error_type !== undefined || n.error_message !== undefined) {
    const code = typeof n.error_code === "number" ? n.error_code : Number(n.error_code) || 0;
    return {
      art: "fehler",
      stream,
      code,
      typ: typeof n.error_type === "string" ? n.error_type : "",
      text: typeof n.error_message === "string" ? n.error_message.slice(0, 200) : "",
    };
  }
  if (!stream) return { art: "unbekannt" };
  if (n.terminated === true) return { art: "beendet", stream };
  if (typeof n.audio === "string" && n.audio) return { art: "audio", stream, audio: n.audio, ende: n.audio_end === true };
  if (n.audio_end === true) return { art: "audio-ende", stream };
  return { art: "unbekannt" };
}

/** Was nach einem Fehler geschieht.
 *
 *    - "ohne-stillekuerzung": das Modell kennt reduce_silence nicht (400,
 *      "Model does not support silence reduction") - derselbe Text noch
 *      einmal ohne, und kuenftig ganz ohne.
 *    - "neuer-schluessel": Schluessel abgelaufen oder Sitzung zu lang (401,
 *      403) - neuen holen, weiter.
 *    - "neuer-strom": der Strom ist regulaer zu Ende (408: zu lange kein Text,
 *      413: 2 Minuten Audio erreicht). Kein Fehler - der naechste Text oeffnet
 *      einen neuen.
 *    - "aufgeben": alles andere (402/429 Kontingent, 5xx, unbekannt) - dann
 *      uebernimmt der bisherige Weg ueber einzelne Abschnitte. */
export type FehlerFolge = "ohne-stillekuerzung" | "neuer-schluessel" | "neuer-strom" | "aufgeben";

export function folgeAufFehler(f: { code: number; typ: string; text: string }): FehlerFolge {
  if (f.code === 400 && /silence/i.test(`${f.typ} ${f.text}`)) return "ohne-stillekuerzung";
  if (f.code === 401 || f.code === 403) return "neuer-schluessel";
  if (f.code === 408 || f.code === 413 || /request_timeout|max_audio_duration/i.test(f.typ)) return "neuer-strom";
  return "aufgeben";
}

/** Braucht der naechste Text einen neuen Strom, damit dieser unter der
 *  2-Minuten-Grenze bleibt? Ein leerer Strom nimmt jeden Text. */
export function brauchtNeuenStrom(bisherZeichen: number, neueZeichen: number, tempo?: number): boolean {
  return bisherZeichen > 0 && bisherZeichen + neueZeichen > zeichenGrenze(tempo);
}

/** Wie viele der Texte eines Stroms (vom Ende her) haben noch nicht geklungen?
 *  Geschaetzt aus der empfangenen Tondauer: Soniox meldet nicht, bis wohin
 *  gesprochen ist. Ein Text, der schon angefangen hat, zaehlt als ungesprochen
 *  - lieber einen Satz doppelt als einen verlieren. */
export function ungesprocheneTexte(texte: readonly string[], audioSekunden: number, tempo?: number): number {
  const t = tempo && Number.isFinite(tempo) && tempo > 0 ? tempo : 1;
  const gesprochen = audioSekunden * ZEICHEN_JE_SEKUNDE * t;
  let summe = 0;
  for (let i = 0; i < texte.length; i++) {
    summe += texte[i]!.length;
    if (summe > gesprochen) return texte.length - i;
  }
  return 0;
}

/** Reicht der Schluessel noch fuer einen neuen Strom? */
export function schluesselNochGut(gueltigBisMs: number, jetztMs: number): boolean {
  return gueltigBisMs - jetztMs > STROM_SCHLUESSEL_RESERVE_MS;
}

/** base64 -> Bytes. atob gibt es im Browser und in Node. */
export function base64ZuBytes(b64: string): Uint8Array {
  const binaer = atob(b64);
  const bytes = new Uint8Array(binaer.length);
  for (let i = 0; i < binaer.length; i++) bytes[i] = binaer.charCodeAt(i);
  return bytes;
}

/** PCM s16le -> Float32 (-1..1) fuer die Web-Audio-API. Ein Stueck kann auf
 *  einem halben Sample enden - das uebrige Byte wird dem naechsten Stueck
 *  vorangestellt (`rest`), sonst verrutschte ab dort jedes Sample um ein Byte
 *  und es knackte. */
export function pcmZuFloat(bytes: Uint8Array, rest: number | null): { werte: Float32Array; rest: number | null } {
  const alle = rest === null ? bytes : (() => {
    const v = new Uint8Array(bytes.length + 1);
    v[0] = rest;
    v.set(bytes, 1);
    return v;
  })();
  const anzahl = Math.floor(alle.length / 2);
  const werte = new Float32Array(anzahl);
  for (let i = 0; i < anzahl; i++) {
    let s = alle[2 * i]! | (alle[2 * i + 1]! << 8);
    if (s >= 0x8000) s -= 0x10000;
    werte[i] = s / 0x8000;
  }
  return { werte, rest: alle.length % 2 === 1 ? alle[alle.length - 1]! : null };
}

/** Wann das naechste Stueck beginnt: direkt hinter dem vorigen, ohne Luecke.
 *  Ist die Zeitachse schon abgelaufen (erstes Stueck, oder das Netz war
 *  langsamer als die Stimme), beginnt es mit einem kleinen Vorlauf ab jetzt. */
export function naechsterStart(ende: number, jetzt: number, vorlauf = STROM_VORLAUF_S): number {
  return ende > jetzt + 0.005 ? ende : jetzt + vorlauf;
}
