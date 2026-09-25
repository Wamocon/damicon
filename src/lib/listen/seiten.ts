// Blaettern in Listen (WMCNL-2488). Reine Rechnung ohne Datenbank, damit
// Datenschicht, Demo-Modus und Tests dieselben Grenzen benutzen.

export interface SeitenModell {
  /** Die angezeigte Seite, auf den gueltigen Bereich geklemmt. */
  seite: number;
  /** Anzahl der Seiten, mindestens 1 - auch eine leere Liste hat eine Seite. */
  seiten: number;
  /** Erster Index der Seite (0-basiert), fuer .range(). */
  von: number;
  /** Letzter Index der Seite (einschliesslich), fuer .range(). */
  bis: number;
}

export function seitenModell(gesamt: number, seite: number, proSeite: number): SeitenModell {
  const seiten = Math.max(1, Math.ceil(Math.max(0, gesamt) / proSeite));
  // Wer Seite 7 aufruft, nachdem ein Filter die Liste auf drei Seiten
  // geschrumpft hat, landet auf der letzten statt auf einer leeren.
  const aktuell = Math.min(Math.max(1, Math.trunc(seite) || 1), seiten);
  const von = (aktuell - 1) * proSeite;
  return { seite: aktuell, seiten, von, bis: von + proSeite - 1 };
}

/** Vorheriger und naechster Eintrag der aktuellen Seite, fuer die Pfeile der Detailansicht. */
export function nachbarn<T>(
  ids: readonly T[],
  id: T | undefined,
): { vorher?: T; nachher?: T } {
  const index = id === undefined ? -1 : ids.indexOf(id);
  if (index < 0) return {};
  return {
    vorher: index > 0 ? ids[index - 1] : undefined,
    nachher: index < ids.length - 1 ? ids[index + 1] : undefined,
  };
}
