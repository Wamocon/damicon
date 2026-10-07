// Ein React-Hook im Test, ohne React und ohne Browser (seit 29.09.2026, Cleanup-Funde 30/31).
//
// Die Sprachwege halten ihren Zustand in Refs und Rueckrufen (components/ki/
// sprachausgabe-live.ts). Was dort bei einer Aufgabe des Stroms oder beim Abbau passiert,
// liess sich bis dahin nur am Quelltext pruefen. Diese Attrappe fuehrt einen Hook EINMAL
// aus: Refs und Rueckrufe bleiben stabil, weil es nur diesen einen Render gibt; setState
// merkt sich den Wert, loest aber keinen neuen Render aus. Effekte laufen nach dem Render,
// ihre Aufraeumfunktionen bei abbauen() - so laesst sich pruefen, was ein Hook beim
// Unmount freigibt.
//
// Eingehaengt ueber hilfen/alias-lader.mjs: ein Modul, das mit "?react=attrappe" geladen
// wird, bekommt fuer "react" diese Datei statt der echten Bibliothek.

let effekte = null;

export function useRef(anfang) {
  return { current: anfang };
}

export function useState(anfang) {
  const zustand = { wert: typeof anfang === "function" ? anfang() : anfang };
  const setze = (neu) => {
    zustand.wert = typeof neu === "function" ? neu(zustand.wert) : neu;
  };
  return [zustand.wert, setze];
}

export function useCallback(rueckruf) {
  return rueckruf;
}

export function useMemo(fabrik) {
  return fabrik();
}

export function useEffect(effekt) {
  if (!effekte) throw new Error("useEffect ausserhalb von rendere()");
  effekte.push(effekt);
}

/** Fuehrt `hook` einmal aus, dann seine Effekte. `abbauen()` ruft die Aufraeumfunktionen
 *  in umgekehrter Reihenfolge, wie React beim Unmount. */
export function rendere(hook) {
  effekte = [];
  let wert;
  let liste;
  try {
    wert = hook();
  } finally {
    liste = effekte;
    effekte = null;
  }
  const aufraeumen = liste.map((effekt) => effekt()).filter((f) => typeof f === "function");
  return {
    wert,
    abbauen() {
      for (const f of aufraeumen.reverse()) f();
    },
  };
}
