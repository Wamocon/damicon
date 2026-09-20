// Diktat: wann hoert eine Aufnahme von selbst auf?
//
// Reine Logik, kein Browser - damit supabase/tests/ki-assistent.mjs sie mit
// erfundenen Pegelverlaeufen durchspielen kann. Den Pegel liefert im Betrieb
// ein AnalyserNode (components/ki/mikrofon.tsx), hier ist er einfach eine
// Zahl zwischen 0 und 1.
//
// Die Aufgabe ist heikler, als sie klingt: zu frueh abschalten schneidet
// jemandem das Wort ab, zu spaet haelt das Mikrofon offen und schickt
// Umgebungsgeraeusch zur Erkennung. Auf einem Hof ist es nie still -
// Traktor, Kuehlaggregat, Stimmen in der Halle. Deshalb zwei Vorkehrungen:
//
//   1. Der Schwellwert ist nicht fest, sondern richtet sich nach dem
//      Grundrauschen DIESER Aufnahme (siehe rauschFaktor). In einer lauten
//      Halle liegt er hoeher als in einem stillen Buero.
//   2. Im Zweifel laeuft die Aufnahme WEITER. Ein zu hoher Schwellwert
//      kostet ein paar Sekunden und den Griff zum Stopp-Knopf; ein zu
//      niedriger schneidet mitten im Satz ab und die Nachricht ist halb.

export interface DiktatEinstellungen {
  /** Grundschwelle des Lautstaerkepegels (RMS, 0..1), unterhalb derer es als
   *  still gilt. Der tatsaechlich verwendete Wert kann hoeher liegen, wenn es
   *  in der Umgebung ohnehin lauter ist. */
  stillePegel: number;
  /** So lange muss es still sein, bis die Aufnahme endet. Kuerzer wirkt
   *  flink, schneidet aber Denkpausen ab. */
  stilleMs: number;
  /** Vielfaches des gemessenen Grundrauschens, ab dem etwas als Sprache
   *  zaehlt. 1 hiesse: jedes Geraeusch ist Sprache. */
  rauschFaktor: number;
  /** Obergrenze dafuer, was ueberhaupt als Grundrauschen durchgeht. Wer
   *  sofort nach dem Klick losspricht, liefert als ersten Messwert einen
   *  lauten - ohne diese Grenze wuerde die eigene Stimme zum Grundrauschen
   *  erklaert, die Schwelle schoesse darueber hinaus und die Aufnahme
   *  endete als "leer". Alles ueber diesem Wert ist im Zweifel Sprache. */
  rauschDeckel: number;
  /** So lange wird auf den ersten Ton gewartet. Kommt keiner, endet die
   *  Aufnahme als leer - niemand soll eine Minute lang Stille aufnehmen,
   *  weil das Mikrofon versehentlich an ist. */
  anlaufMs: number;
  /** Frueher als das endet die Aufnahme nicht durch Stille - schuetzt gegen
   *  ein Abschalten im ersten Atemholen. */
  mindestdauerMs: number;
  /** Harte Obergrenze. Greift, wenn die Stilleerkennung in sehr lauter
   *  Umgebung gar nicht anschlaegt. */
  hoechstdauerMs: number;
}

// Ausgangswerte, im Buero gemessen und bewusst vorsichtig gewaehlt.
// Erfahrungswerte, keine Wahrheit: sie gehoeren am echten Arbeitsplatz
// nachgezogen, siehe diktatEinstellungen().
export const DIKTAT_STANDARD: DiktatEinstellungen = {
  stillePegel: 0.02,
  stilleMs: 1200,
  rauschFaktor: 2.5,
  rauschDeckel: 0.1,
  anlaufMs: 4000,
  mindestdauerMs: 700,
  hoechstdauerMs: 60_000,
};

/** Die beiden Werte, die am ehesten nachgezogen werden muessen, lassen sich
 *  ohne Codeaenderung setzen (NEXT_PUBLIC_*, damit sie im Browser ankommen):
 *  NEXT_PUBLIC_DIKTAT_STILLE_PEGEL und NEXT_PUBLIC_DIKTAT_STILLE_MS.
 *  Unsinnige Werte werden verworfen, nicht uebernommen - ein Tippfehler in
 *  der Umgebung darf das Diktat nicht unbrauchbar machen. */
export function diktatEinstellungen(umgebung: Record<string, string | undefined> = {}): DiktatEinstellungen {
  const zahl = (wert: string | undefined, min: number, max: number): number | null => {
    const n = Number(wert);
    return Number.isFinite(n) && n >= min && n <= max ? n : null;
  };
  return {
    ...DIKTAT_STANDARD,
    stillePegel: zahl(umgebung.NEXT_PUBLIC_DIKTAT_STILLE_PEGEL, 0.001, 0.5) ?? DIKTAT_STANDARD.stillePegel,
    stilleMs: zahl(umgebung.NEXT_PUBLIC_DIKTAT_STILLE_MS, 300, 10_000) ?? DIKTAT_STANDARD.stilleMs,
  };
}

/** Lautstaerke eines Zeitbereichsfensters, wie es AnalyserNode
 *  .getByteTimeDomainData() liefert: 8 Bit, Ruhelage bei 128. Ergebnis ist
 *  der quadratische Mittelwert (RMS) in 0..1 - ein Mass fuer die Energie im
 *  Fenster, unempfindlicher gegen einzelne Ausreisser als der Spitzenwert. */
export function pegelAusZeitbereich(daten: Uint8Array | number[]): number {
  if (daten.length === 0) return 0;
  let summe = 0;
  for (let i = 0; i < daten.length; i++) {
    const abweichung = (daten[i] - 128) / 128;
    summe += abweichung * abweichung;
  }
  return Math.sqrt(summe / daten.length);
}

export type StilleErgebnis = "weiter" | "stopp-stille" | "stopp-leer" | "stopp-hoechstdauer";

export interface StilleWaechter {
  /** Einen gemessenen Pegel melden. jetztMs ist eine monoton steigende Zeit
   *  in Millisekunden (im Browser performance.now()). */
  melde(pegel: number, jetztMs: number): StilleErgebnis;
  /** Wurde ueberhaupt jemals etwas gesprochen? */
  hatGesprochen(): boolean;
  /** Aktuell geltende Schwelle - fuer Anzeige und Fehlersuche. */
  schwelle(): number;
}

/** Beobachtet den Pegelverlauf einer laufenden Aufnahme und sagt, wann sie
 *  enden soll. Haelt selbst den Zustand; je Aufnahme ein neuer Waechter. */
export function erzeugeStilleWaechter(einstellungen: DiktatEinstellungen = DIKTAT_STANDARD): StilleWaechter {
  let beginnMs: number | null = null;
  let letzterLautMs = 0;
  let gesprochen = false;
  // Das leiseste bisher Gehoerte gilt als Grundrauschen - aber nur, was
  // unter rauschDeckel liegt (siehe dort). Monoton fallend: wird es
  // waehrend der Aufnahme kurz stiller, sinkt die Schwelle mit; wird es
  // lauter, bleibt sie, wo sie war. Sonst machte eine einzelne laute Stelle
  // den Rest der Aufnahme taub.
  let grundrauschen = Number.POSITIVE_INFINITY;

  const schwelle = () =>
    Math.max(
      einstellungen.stillePegel,
      Number.isFinite(grundrauschen) ? grundrauschen * einstellungen.rauschFaktor : 0,
    );

  return {
    schwelle,
    hatGesprochen: () => gesprochen,
    melde(pegel, jetztMs) {
      if (beginnMs === null) {
        beginnMs = jetztMs;
        letzterLautMs = jetztMs;
      }
      const seitBeginn = jetztMs - beginnMs;
      if (seitBeginn >= einstellungen.hoechstdauerMs) return "stopp-hoechstdauer";

      if (pegel <= einstellungen.rauschDeckel) grundrauschen = Math.min(grundrauschen, pegel);

      if (pegel > schwelle()) {
        gesprochen = true;
        letzterLautMs = jetztMs;
        return "weiter";
      }

      // Nie etwas gehoert: nach der Anlaufzeit aufgeben. Die Aufnahme ist
      // leer, die Oberflaeche sagt das und schickt nichts zur Erkennung.
      if (!gesprochen) return seitBeginn >= einstellungen.anlaufMs ? "stopp-leer" : "weiter";

      const stillSeit = jetztMs - letzterLautMs;
      const langGenug = seitBeginn >= einstellungen.mindestdauerMs;
      return stillSeit >= einstellungen.stilleMs && langGenug ? "stopp-stille" : "weiter";
    },
  };
}
