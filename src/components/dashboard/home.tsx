"use client";

// Die Startseite des Portals: Begruessung und die vier Zonen mit ihren
// Kennzahlen. Zwei Boxen untereinander.
//
// Vorher standen hier zwoelf Kennzahlkacheln in einem eigenen Block, zwei
// weitere in einem zweiten, darunter die vier Zonen ohne Zahlen. Wer wissen
// wollte, woher "8,4 % Verlustquote" kommt, musste selbst darauf kommen,
// dass das die Zone Hof ist. Die Zuordnung stand im Datenmodell (Kpi.zone),
// sichtbar war sie nicht. Jetzt traegt jede Zonenkarte ihre eigenen
// Kennzahlen, der obere Block entfaellt.
//
// Die Entwuerfe dazu und ihre Messwerte stehen unter
// docs/design/uebersicht-entwuerfe-2026-09-21/, -runde2- und -runde3-.
import type { ReactNode } from "react";
import { usePersona } from "@/components/dashboard/persona";
import { BegruessungsBox } from "@/components/dashboard/begruessung";
import { ZonenBox } from "@/components/dashboard/zonen-box";
import { kpisFuerRolle, type Kpi } from "@/lib/domain/kpis";
import type { Tageszeit } from "@/lib/domain/tageszeit";
import type { Datenquelle } from "@/lib/supabase/config";

export function DashboardHome({
  kpis,
  quelle,
  tageszeit,
  datum,
  spruch,
  tagesUebersicht,
  finanzVorschau,
}: {
  kpis: Kpi[];
  quelle: Datenquelle;
  /** Serverseitig bestimmt - siehe lib/domain/tageszeit.ts. */
  tageszeit: Tageszeit;
  datum: string;
  spruch: number;
  /**
   * "Das Wichtigste heute" fuer ceo und admin. Serverseitig vorgerendert
   * (async Server Component) und von der Seite durchgereicht, nicht hier
   * importiert: DashboardHome ist "use client" (usePersona()), eine Server
   * Component laesst sich dort nicht direkt einbinden. Server-seitig an der
   * ECHTEN Profilrolle festgemacht, nicht an der hier umschaltbaren
   * Vorschau-Rolle - eine Admin-Vorschau "als ceo" soll nicht den echten
   * automatischen Lauf einer fremden Person ausloesen.
   */
  tagesUebersicht?: ReactNode;
  /**
   * Nur fuer Rollen, die Finanzen sehen duerfen, aber keine Tages-Uebersicht
   * bekommen (buchhaltung, betriebsleitung). Wer beides haette, saehe dieselbe
   * Zahl zweimal - dort traegt die fuenfte Kachel sie.
   */
  finanzVorschau?: ReactNode;
}) {
  const { role } = usePersona();

  // kpisFuerRolle() laeuft hier ein zweites Mal, obwohl der Server schon
  // gefiltert hat: ein Admin in der "Ansicht als"-Vorschau bekommt alle
  // Kennzahlen vom Server und filtert hier nach der Vorschaurolle weiter,
  // siehe usePersona(). Kern und erweitert landen zusammen in ihren Zonen -
  // die Trennung aus Anforderung 4.11 ist in der Zonenansicht nicht mehr
  // sichtbar, die zwoelf Kern-Kennzahlen stehen also nicht mehr fuer sich.
  const { kern, erweitert } = kpisFuerRolle(role, kpis);
  const sichtbar = [...kern, ...erweitert];

  return (
    <div className="space-y-6">
      <BegruessungsBox tageszeit={tageszeit} datum={datum} spruch={spruch} />
      {tagesUebersicht}
      {finanzVorschau}
      <ZonenBox role={role} kpis={sichtbar} quelle={quelle} />
    </div>
  );
}
