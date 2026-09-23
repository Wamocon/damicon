// Die Startseite des Portals: Begruessung, "Das Wichtigste heute" und darunter drei Reiter
// - Lage, Kennzahlen, Bereiche.
//
// Der Weg hierher, damit niemand ihn zweimal geht:
//
// Vor dem 21.09.2026 standen zwoelf Kennzahlkacheln in einem eigenen Block, zwei weitere in
// einem zweiten, darunter die vier Zonen ohne Zahlen. Runde 1 hat die Kennzahlen in die
// Zonenkarten geholt, weil niemand sah, woher eine Zahl kam. Runde 2 hat die Modulnamen zu
// Knoepfen gemacht, um einen Klick zu sparen. Danach kamen die Finanz-Vorschau und die
// CEO-Tagesuebersicht dazu, die in keiner der drei Runden vorkamen.
//
// Ergebnis am 23.09.2026, gemessen: 2421 px am Schirm und 5185 px am Handy, also gut sechs
// Bildschirme in einem einzigen Strang. Was zuletzt im Strang stand, ging unter - und das
// waren ausgerechnet die sechsundzwanzig Modulknoepfe aus Runde 2. Die Massnahme gegen
// "zu weit weg" hatte "zu viel auf einmal" hergestellt.
//
// Jetzt: Begruessung und Zusammenfassung stehen immer sichtbar oben, alles andere liegt
// hinter einem Reiter. Die Modulknoepfe sind ersatzlos entfallen, dafuer ist das Menue da.
//
// Entwuerfe und Messwerte: docs/design/uebersicht-entwuerfe-2026-09-21/, -runde2-, -runde3-
// und -reiter-2026-09-23.
//
// Seit dem Reiter-Umbau eine Server Component: usePersona() wird hier nicht mehr gebraucht.
// Das Nachfiltern der Kennzahlen fuer die Admin-Vorschau sitzt jetzt in kennzahlen-reiter.tsx,
// und die Zonenkarten kennen keine Rolle mehr, seit die Modulknoepfe weg sind.
import type { ReactNode } from "react";
import { BegruessungsBox } from "@/components/dashboard/begruessung";
import type { Tageszeit } from "@/lib/domain/tageszeit";

export function DashboardHome({
  tageszeit,
  datum,
  spruch,
  kopf,
  reiter,
  inhalt,
}: {
  /** Serverseitig bestimmt - siehe lib/domain/tageszeit.ts. */
  tageszeit: Tageszeit;
  datum: string;
  spruch: number;
  /**
   * "Das Wichtigste heute" fuer ceo und admin, oberhalb der Reiterleiste und damit in jedem
   * Reiter sichtbar. Serverseitig an der ECHTEN Profilrolle festgemacht, nicht an der
   * clientseitig umschaltbaren Vorschau-Rolle - eine Admin-Vorschau "als ceo" soll nicht den
   * echten automatischen Lauf einer fremden Person ausloesen.
   */
  kopf?: ReactNode;
  /** Die Reiterleiste. Fehlt, wenn die Rolle nur einen Reiter hat - ein Reiter allein ist keiner. */
  reiter?: ReactNode;
  /** Der Inhalt des aktiven Reiters. Nur dieser wird ueberhaupt gerendert. */
  inhalt: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <BegruessungsBox tageszeit={tageszeit} datum={datum} spruch={spruch} />
      {kopf}
      {reiter}
      {inhalt}
    </div>
  );
}
