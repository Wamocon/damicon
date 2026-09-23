// Die Startseite des Portals: Begruessung mit einer Zahl, der Compliance-Report und darunter
// die vier Bereiche.
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
// Bildschirme. Was zuletzt im Strang stand, ging unter - und das waren ausgerechnet die
// sechsundzwanzig Modulknoepfe aus Runde 2. Die Massnahme gegen "zu weit weg" hatte "zu viel
// auf einmal" hergestellt.
//
// Gekuerzt wurde deshalb an drei Stellen, nicht durch Verstecken:
//   - Die sechsundzwanzig Modulknoepfe sind ersatzlos entfallen. Dafuer ist das Menue da.
//   - Die Kennzahlen stehen nur noch, soweit sie auffallen: vier je Bereich, Auffaelliges
//     zuerst, aufgefuellt mit dem, was im Ziel liegt.
//   - Die Begruessungskarte trug vier Informationseinheiten und keine Zahl. Jetzt steht in
//     ihrer rechten Haelfte die eine Zahl, mit der diese Rolle den Tag beginnt.
//
// Reiter gab es dazwischen kurzzeitig auch. Sie sind wieder entfallen: nach den drei
// Kuerzungen ist die Seite kurz genug, und ein Reiter versteckt, was man nicht suchen kann.
//
// Entwuerfe und Messwerte: docs/design/uebersicht-entwuerfe-2026-09-21/, -runde2-, -runde3-
// und -reiter-2026-09-23.
//
// Server Component: usePersona() wird hier nicht mehr gebraucht. Das Nachfiltern der
// Kennzahlen fuer die Admin-Vorschau sitzt in bereiche-box.tsx.
import type { ReactNode } from "react";
import { BegruessungsBox } from "@/components/dashboard/begruessung";
import type { Tageszeit } from "@/lib/domain/tageszeit";

export function DashboardHome({
  tageszeit,
  datum,
  spruch,
  startkarte,
  compliance,
  bereiche,
}: {
  /** Serverseitig bestimmt - siehe lib/domain/tageszeit.ts. */
  tageszeit: Tageszeit;
  datum: string;
  spruch: number;
  /** Die rechte Haelfte der Begruessungskarte - je Rolle eine andere Zahl. */
  startkarte?: ReactNode;
  /**
   * Der Compliance-Report fuer ceo und admin. Serverseitig an der ECHTEN Profilrolle
   * festgemacht, nicht an der clientseitig umschaltbaren Vorschau-Rolle - eine Admin-Vorschau
   * "als ceo" soll nicht den echten automatischen Lauf einer fremden Person ausloesen.
   */
  compliance?: ReactNode;
  /** Die vier Bereiche mit ihren Kennzahlen. Steht unter dem Report, fuer jede Rolle. */
  bereiche: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <BegruessungsBox tageszeit={tageszeit} datum={datum} spruch={spruch} rechts={startkarte} />
      {compliance}
      {bereiche}
    </div>
  );
}
