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
  // Namen der Anwendung
  "Damicon", "DamiAI", "Himbi",
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
export const GESPRAECH_ENDPUNKT = { endpoint_sensitivity: 0.3, endpoint_latency_adjustment_level: 2 } as const;

export function liveKonfiguration(oberflaeche: string | undefined, zweck: LiveZweck = "diktat"): LiveKonfiguration {
  return {
    ...(zweck === "gespraech" ? GESPRAECH_ENDPUNKT : {}),
    model: LIVE_MODELL,
    // Der Browser schickt, was MediaRecorder liefert (webm/opus, auf dem
    // iPhone mp4) - genau so macht es das offizielle Web-SDK.
    audio_format: "auto",
    language_hints: sprachHinweise(oberflaeche),
    // Ohne dieses Feld traegt kein Token eine Sprache - und die gehoerte
    // Sprache entscheidet ueber die Sprache der Antwort (antwortsprache.ts).
    enable_language_identification: true,
    enable_endpoint_detection: true,
    max_endpoint_delay_ms: ENDPUNKT_VERZOEGERUNG_MS,
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
  /** Das Modell hat ein Ende der Aeusserung erkannt. */
  endpunkt: boolean;
  /** Die Sitzung ist abgeschlossen. */
  fertig: boolean;
  /** Fehlermeldung des Dienstes, falls eine kam. */
  fehler: string | null;
}

export interface TokenSammler {
  nimm(paket: SonioxPaket): SammelStand;
  stand(): SammelStand;
  /** Sprachen der endgueltigen Token, in der Reihenfolge des Auftretens -
   *  derselbe Vertrag wie beim Datei-Weg (SonioxAntwort.sprachen). */
  sprachen(): string[];
  /** Hat das Modell ueberhaupt irgendetwas gehoert (auch vorlaeufig)? */
  hatGehoert(): boolean;
}

const STEUERZEICHEN = new Set(["<end>", "<fin>"]);

/** Soniox trennt Woerter durch fuehrende Leerzeichen IM Token. Der erste Token
 *  der Aufnahme kann trotzdem mit einem Leerzeichen beginnen - das faellt hier
 *  weg, sonst stuende im Feld " Hallo". */
function saeubere(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function erzeugeTokenSammler(): TokenSammler {
  let endgueltig = "";
  let vorlaeufig = "";
  let endpunkt = false;
  let fertig = false;
  let fehler: string | null = null;
  let gehoert = false;
  const sprachen: string[] = [];

  const stand = (): SammelStand => {
    const e = saeubere(endgueltig);
    const v = saeubere(vorlaeufig);
    // Das Leerzeichen zwischen beiden steckt schon im vorlaeufigen Token,
    // wenn es eines braucht - deshalb roh verbunden und erst dann gesaeubert.
    return { endgueltig: e, vorlaeufig: v, anzeige: saeubere(endgueltig + vorlaeufig), endpunkt, fertig, fehler };
  };

  return {
    stand,
    sprachen: () => [...sprachen],
    hatGehoert: () => gehoert,
    nimm(paket) {
      if (typeof paket.error_message === "string" || typeof paket.error_code === "number") {
        fehler = `soniox-${typeof paket.error_code === "number" ? paket.error_code : "fehler"}: ${String(paket.error_message ?? "ohne Angabe").slice(0, 160)}`;
        fertig = true;
        return stand();
      }
      vorlaeufig = "";
      const tokens = Array.isArray(paket.tokens) ? (paket.tokens as SonioxToken[]) : [];
      for (const t of tokens) {
        const text = typeof t?.text === "string" ? t.text : "";
        if (STEUERZEICHEN.has(text)) {
          if (text === "<end>") endpunkt = true;
          continue;
        }
        if (!text) continue;
        if (text.trim()) gehoert = true;
        if (t.is_final === true) {
          endgueltig += text;
          if (typeof t.language === "string" && t.language) sprachen.push(t.language);
        } else {
          vorlaeufig += text;
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
