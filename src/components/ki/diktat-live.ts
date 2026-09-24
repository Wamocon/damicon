"use client";

// Live-Diktat im Browser: Audio geht Stueck fuer Stueck direkt an Soniox
// (stt-rt-v5), der Text kommt Wort fuer Wort zurueck. Die reine Logik
// (Konfiguration, Token sammeln) steht in domain/diktat-live.ts, der
// Schluessel kommt aus api/ki-spracherkennung.
//
// Die Regel, von der alles andere abhaengt: das Live-Diktat darf das Diktat
// nie kosten. Jedes Audiostueck bleibt beim Mikrofonknopf liegen; scheitert
// hier irgendetwas (Route sagt ab, WebSocket kommt nicht zustande, bricht
// ab, Dienst meldet einen Fehler), geht dieselbe Aufnahme als Datei ueber den
// bisherigen Weg (transkribiereSprachnachricht). Wer diktiert, merkt davon
// hoechstens, dass der Text erst am Ende erscheint.
import { erzeugeTokenSammler, type LiveKonfiguration, type SammelStand } from "@/lib/domain/diktat-live";

export type LiveErgebnis =
  /** `text` kann leer sein: dann hat das Modell zugehoert und nichts gehoert. */
  | { ok: true; text: string; sprachen: string[] }
  | { ok: false; grund: string };

export interface LiveSitzung {
  /** Ein Audiostueck von MediaRecorder. Vor dem Verbindungsaufbau wird
   *  gepuffert - die Aufnahme beginnt sofort beim Klick, nicht erst, wenn
   *  der Schluessel da ist. */
  sende(stueck: Blob): void;
  /** Aufnahme zu Ende: Rest senden, auf das letzte Paket warten. */
  beende(): Promise<LiveErgebnis>;
  /** Sofort schliessen, ohne Ergebnis. */
  abbrechen(): void;
  /** Laeuft die Verbindung (oder wird sie noch aufgebaut) und ist nichts
   *  gescheitert? Solange ja, entscheidet das Modell ueber das Ende der
   *  Aeusserung, nicht die Lautstaerkeregel. */
  traegt(): boolean;
  /** Hat das Modell irgendetwas gehoert, auch vorlaeufig? */
  hatGehoert(): boolean;
}

/** Wie lange der Aufbau (Schluessel + WebSocket) dauern darf. */
const AUFBAU_MS = 6_000;
/** Wie lange nach dem Aufnahme-Ende auf das letzte Paket gewartet wird. Soniox
 *  liefert es in Bruchteilen einer Sekunde; mehr als das ist ein Problem,
 *  und dann uebernimmt der Datei-Weg. */
const ABSCHLUSS_MS = 5_000;

// Sagt die Route "nicht aktiv" (Schalter aus, Soniox nicht eingerichtet),
// fragt dieser Tab nicht bei jedem Diktat erneut. Ein Neuladen fragt wieder.
let abgesagt = false;

export function liveDiktatMoeglich(): boolean {
  return !abgesagt && typeof WebSocket !== "undefined";
}

export function starteLiveSitzung({
  sprache,
  beiStand,
  beiEndpunkt,
}: {
  sprache: string;
  /** Neuer Zwischenstand - fuer die Anzeige im Eingabefeld. */
  beiStand: (stand: SammelStand) => void;
  /** Das Modell hat das Ende der Aeusserung erkannt. */
  beiEndpunkt: () => void;
}): LiveSitzung {
  const sammler = erzeugeTokenSammler();
  let ws: WebSocket | null = null;
  let gescheitert: string | null = null;
  let beendet = false;
  let endpunktGemeldet = false;
  let fertigMelden: (() => void) | null = null;
  const fertig = new Promise<void>((r) => {
    fertigMelden = r;
  });

  // Offen, sobald die Konfiguration gesendet ist. Alle Stuecke laufen durch
  // EINE Kette, damit die Reihenfolge stimmt - das erste Stueck traegt den
  // Dateikopf (webm/mp4), ohne ihn versteht Soniox den Rest nicht.
  let offenMelden: (() => void) | null = null;
  let offenAbsagen: ((grund: string) => void) | null = null;
  const offen = new Promise<void>((ja, nein) => {
    offenMelden = ja;
    offenAbsagen = nein;
  });
  // Ein Scheitern vor dem ersten Stueck ist kein unbehandelter Fehler.
  offen.catch(() => {});
  let kette: Promise<void> = offen;

  const scheitere = (grund: string) => {
    if (gescheitert) return;
    gescheitert = grund;
    offenAbsagen?.(grund);
    fertigMelden?.();
    try {
      ws?.close();
    } catch {
      // schon zu
    }
  };

  const aufbau = setTimeout(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) scheitere("aufbau-zeitueberschreitung");
  }, AUFBAU_MS);

  void (async () => {
    let zugang: { schluessel?: unknown; adresse?: unknown; konfiguration?: unknown };
    try {
      const antwort = await fetch("/api/ki-spracherkennung", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sprache }),
      });
      if (antwort.status === 404) abgesagt = true;
      if (!antwort.ok) return scheitere(`schluessel-http-${antwort.status}`);
      zugang = await antwort.json();
    } catch {
      return scheitere("schluessel-nicht-erreichbar");
    }
    // Nur ein Scheitern bricht hier ab, nicht das Ende der Aufnahme: wer
    // kurz spricht, ist womoeglich fertig, bevor der Schluessel da ist - die
    // gepufferten Stuecke sollen trotzdem live erkannt werden.
    if (gescheitert) return;
    const { schluessel, adresse, konfiguration } = zugang;
    if (typeof schluessel !== "string" || typeof adresse !== "string" || !konfiguration) {
      return scheitere("schluessel-unerwartete-form");
    }

    try {
      ws = new WebSocket(adresse);
    } catch {
      return scheitere("websocket-nicht-moeglich");
    }
    ws.binaryType = "arraybuffer";
    ws.onopen = () => {
      clearTimeout(aufbau);
      try {
        ws?.send(JSON.stringify({ api_key: schluessel, ...(konfiguration as LiveKonfiguration) }));
        offenMelden?.();
      } catch {
        scheitere("konfiguration-nicht-gesendet");
      }
    };
    ws.onmessage = (ereignis) => {
      if (typeof ereignis.data !== "string") return;
      let paket: unknown;
      try {
        paket = JSON.parse(ereignis.data);
      } catch {
        return;
      }
      const stand = sammler.nimm(paket as Parameters<typeof sammler.nimm>[0]);
      if (stand.fehler) {
        console.warn("[damicon] Live-Diktat: Dienst meldet", stand.fehler);
        return scheitere("dienst-fehler");
      }
      beiStand(stand);
      if (stand.endpunkt && !endpunktGemeldet) {
        endpunktGemeldet = true;
        beiEndpunkt();
      }
      if (stand.fertig) fertigMelden?.();
    };
    ws.onerror = () => scheitere("websocket-fehler");
    ws.onclose = () => {
      // Ein Schliessen VOR dem letzten Paket ist ein Abbruch - der Rest der
      // Aeusserung waere verloren. Also Datei-Weg.
      if (!sammler.stand().fertig) scheitere("websocket-geschlossen");
    };
  })();

  return {
    sende(stueck) {
      if (gescheitert || beendet) return;
      kette = kette.then(async () => {
        const daten = await stueck.arrayBuffer();
        if (!gescheitert && ws?.readyState === WebSocket.OPEN) ws.send(daten);
      });
      kette.catch(() => {});
    },

    async beende() {
      beendet = true;
      if (gescheitert) return { ok: false, grund: gescheitert };
      try {
        // Erst alles Gepufferte, dann das Ende-Zeichen: ein leerer Text
        // heisst fuer Soniox "keine Audiodaten mehr".
        await kette;
        if (gescheitert) return { ok: false, grund: gescheitert };
        ws?.send("");
      } catch {
        return { ok: false, grund: gescheitert ?? "nicht-verbunden" };
      }
      const zeit = new Promise<"zeit">((r) => setTimeout(() => r("zeit"), ABSCHLUSS_MS));
      const ergebnis = await Promise.race([fertig.then(() => "fertig" as const), zeit]);
      try {
        ws?.close();
      } catch {
        // schon zu
      }
      if (gescheitert) return { ok: false, grund: gescheitert };
      if (ergebnis === "zeit") return { ok: false, grund: "abschluss-zeitueberschreitung" };
      const stand = sammler.stand();
      // Nach dem Ende-Zeichen ist alles endgueltig; das Vorlaeufige ist nur
      // der Gurt, falls das letzte Paket es doch nicht umgewandelt hat.
      return { ok: true, text: stand.endgueltig || stand.anzeige, sprachen: sammler.sprachen() };
    },

    abbrechen() {
      beendet = true;
      clearTimeout(aufbau);
      scheitere("abgebrochen");
    },

    traegt: () => !gescheitert,
    hatGehoert: () => sammler.hatGehoert(),
  };
}
