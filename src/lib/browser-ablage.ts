// Zugang zum Browser-Speicher fuer Module, die ihn hereingereicht bekommen (Tagesmerker,
// Zuletzt-Liste der Suche, Tipp-Merker von Himbi). Bis zum 28.09.2026 lag das in
// lib/suche/zuletzt.ts, und Himbi hing fuer einen allgemeinen Speicherzugriff am
// Such-Modul (Fund 66). lib/suche/zuletzt.ts reicht beides weiter, damit die
// bisherigen Aufrufer unveraendert bleiben.
//
// Hereingereicht statt window.localStorage direkt zu lesen: der Test rechnet mit einer
// nachgebauten Ablage, und im privaten Fenster kann schon der Zugriff werfen.

export interface Ablage {
  getItem(schluessel: string): string | null;
  setItem(schluessel: string, wert: string): void;
  removeItem(schluessel: string): void;
}

/** localStorage, oder null, wo schon der Zugriff wirft (privates Fenster). */
export function browserAblage(): Ablage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** sessionStorage, oder null, wo schon der Zugriff wirft. Fuer Merker, die nur eine Sitzung gelten. */
export function sitzungsAblage(): Ablage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
