// Nachgebaute Browser-Bausteine fuer die Durchlauf-Tests der Sprachwege (Vorlese-Strom,
// Live-Diktat): WebSocket, AudioContext und PCM-Stuecke. Bis zum 29.09.2026 standen sie
// fast wortgleich in ki-assistent.mjs und stimme-sprache.mjs (Cleanup-Fund 93) - eine
// Aenderung am Sprecher musste in beiden Kopien nachgezogen werden.

/** Kurz warten, bis Mikrotasks und die 1-ms-Timer der Attrappen durch sind. */
export const warte = (ms = 15) => new Promise((r) => setTimeout(r, ms));

/**
 * Eine WebSocket-Klasse mit eigenem Zustand je Aufruf. Oeffnet nach 1 ms (oder scheitert,
 * wenn `oeffnet` false ist, oder bleibt im Aufbau haengen, wenn `haengt` true ist).
 * Gesendetes landet in `gesendet`: JSON-Texte gelesen, alles andere (Audiostuecke, das
 * leere Ende-Zeichen des Diktats) unveraendert.
 */
export function erzeugeFakeWS() {
  return class FakeWS {
    static OPEN = 1;
    static alle = [];
    static oeffnet = true;
    static haengt = false;
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.gesendet = [];
      FakeWS.alle.push(this);
      setTimeout(() => {
        if (this.readyState === 3 || FakeWS.haengt) return;
        if (!FakeWS.oeffnet) {
          this.onerror?.();
          this.onclose?.();
          return;
        }
        this.readyState = 1;
        this.onopen?.();
      }, 1);
    }
    send(d) {
      if (typeof d === "string" && d !== "") {
        try {
          this.gesendet.push(JSON.parse(d));
          return;
        } catch {
          // kein JSON: roh ablegen
        }
      }
      this.gesendet.push(d);
    }
    close() {
      this.readyState = 3;
      this.geschlossen = true;
    }
    /** Eine Nachricht des Dienstes. */
    empfange(obj) {
      this.onmessage?.({ data: JSON.stringify(obj) });
    }
    /** Der Dienst schliesst die Verbindung. */
    schliesseVonDrueben() {
      this.readyState = 3;
      this.onclose?.();
    }
    starts() {
      return this.gesendet.filter((n) => n && typeof n === "object" && n.api_key);
    }
  };
}

/** Ein AudioContext, der eingeplante Quellen mitschreibt (`quellen`, je mit `gestartet` und
 *  startZeit). decodeAudioData liefert einen Puffer mit `dekodiert: true` - so unterscheidet
 *  ein Test den Ton des Abschnitts-Wegs (ganze Datei) vom Strom (PCM-Stuecke). */
export function erzeugeAudioKontext() {
  const quellen = [];
  const ctx = {
    currentTime: 0,
    state: "running",
    destination: {},
    geschlossen: false,
    resume: async () => {},
    suspend: async () => {},
    close: async () => {
      ctx.geschlossen = true;
      ctx.state = "closed";
    },
    createGain: () => ({ connect() {} }),
    createAnalyser: () => ({ connect() {}, getByteTimeDomainData() {} }),
    createBuffer: (_k, n, rate) => {
      const d = new Float32Array(n);
      return { duration: n / rate, getChannelData: () => d };
    },
    decodeAudioData: async (daten) => ({ duration: 1, dekodiert: true, bytes: daten.byteLength }),
    createBufferSource: () => {
      const q = {
        connect() {},
        start(t) {
          q.gestartet = true;
          q.startZeit = t;
        },
        stop() {
          q.gestoppt = true;
        },
      };
      quellen.push(q);
      return q;
    },
  };
  return { ctx, quellen };
}

/** n Samples Stille als PCM s16le, base64 - so schickt Soniox den Ton. */
export const pcm = (n) => btoa(String.fromCharCode(...new Uint8Array(n * 2)));

/** Fuettert den Satz-Zerleger Wort fuer Wort, wie der Chat-Stream es tut, und gibt die
 *  Texte der Abschnitte zurueck. Ohne `stil` gilt die Vorgabe des Zerlegers. */
export function wortweise(erzeugeSatzZerleger, text, stil) {
  const z = erzeugeSatzZerleger(stil);
  const raus = [];
  for (const stueck of text.match(/\S+\s*/g) ?? []) raus.push(...z.fuettere(stueck));
  raus.push(...z.abschliessen());
  return raus.map((a) => a.text);
}

/**
 * Merkt sich laufende Intervalle und Zeitgeber, damit ein Test pruefen kann, was ein
 * Baustein nach seinem Ende noch am Laufen haelt. `stoppe()` stellt die Originale wieder her.
 */
export function beobachteZeitgeber() {
  const echt = { setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  const intervalle = new Set();
  const zeitgeber = new Map();
  globalThis.setInterval = (fn, ms, ...rest) => {
    const h = echt.setInterval(fn, ms, ...rest);
    intervalle.add(h);
    return h;
  };
  globalThis.clearInterval = (h) => {
    intervalle.delete(h);
    return echt.clearInterval(h);
  };
  globalThis.setTimeout = (fn, ms, ...rest) => {
    const h = echt.setTimeout((...a) => {
      zeitgeber.delete(h);
      fn(...a);
    }, ms, ...rest);
    zeitgeber.set(h, ms ?? 0);
    return h;
  };
  globalThis.clearTimeout = (h) => {
    zeitgeber.delete(h);
    return echt.clearTimeout(h);
  };
  return {
    intervalle: () => intervalle.size,
    /** Offene Zeitgeber mit mindestens `abMs` Verzoegerung. */
    zeitgeber: (abMs = 0) => [...zeitgeber.values()].filter((ms) => ms >= abMs).length,
    raeumeAuf() {
      for (const h of intervalle) echt.clearInterval(h);
      for (const h of zeitgeber.keys()) echt.clearTimeout(h);
      intervalle.clear();
      zeitgeber.clear();
    },
    stoppe() {
      Object.assign(globalThis, echt);
    },
  };
}
