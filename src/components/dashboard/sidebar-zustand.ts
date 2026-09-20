// Breite der Seitenleiste: volle Spalte oder schmale Symbolleiste.
//
// Eigenes Modul, weil zwei Bausteine daran haengen, die einander nicht
// kennen: die Seitenleiste selbst und der Umschalter in der Kopfzeile. Ein
// Kontext waere hier schwerer als noetig - der Zustand ist ein einzelnes
// Ja/Nein und muss den Server-Render ueberstehen.
const SPEICHER = "damicon-sidebar-schmal";
const listener = new Set<() => void>();
let cache: boolean | null = null;

export function schmalAbonnieren(callback: () => void) {
  listener.add(callback);
  return () => {
    listener.delete(callback);
  };
}

export function istSchmal(): boolean {
  if (cache !== null) return cache;
  let gelesen = false;
  try {
    gelesen = localStorage.getItem(SPEICHER) === "1";
  } catch {
    // ignore
  }
  cache = gelesen;
  return gelesen;
}

/** Server kennt den Speicher nicht und rendert immer die volle Spalte. */
export function schmalServer(): boolean {
  return false;
}

export function schmalSetzen(wert: boolean) {
  cache = wert;
  try {
    localStorage.setItem(SPEICHER, wert ? "1" : "0");
  } catch {
    // ignore
  }
  listener.forEach((eintrag) => eintrag());
}
