// Namen der Werkzeuge, die im BROWSER des Nutzers laufen (ui-werkzeuge.ts
// definiert ihr Schema, ki/ui-steuerung.ts fuehrt sie aus). Clientsicher: der
// Chat braucht die Namen, um zu wissen, welche Werkzeugaufrufe er selbst
// bearbeiten muss, statt auf ein Ergebnis vom Server zu warten.
export const CLIENT_WERKZEUG_NAMEN = ["seiteLesen", "klicke", "fuelleFeld", "scrolleZu", "zeigeAuf"] as const;

export type ClientWerkzeugName = (typeof CLIENT_WERKZEUG_NAMEN)[number];

/** Nur im Agent-Modus erlaubt - seiteLesen (rein lesend) gibt es in beiden Modi. */
export const CLIENT_STEUERUNG_NAMEN: readonly ClientWerkzeugName[] = ["klicke", "fuelleFeld", "scrolleZu", "zeigeAuf"];

export function istClientWerkzeug(name: string): name is ClientWerkzeugName {
  return (CLIENT_WERKZEUG_NAMEN as readonly string[]).includes(name);
}
