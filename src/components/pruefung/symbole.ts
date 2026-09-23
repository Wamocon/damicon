import { ClipboardCheck, Landmark, Scale, ShieldAlert, type LucideIcon } from "lucide-react";
import type { Pruefbereich } from "@/lib/pruefung/rollen";

/** Ein Symbol je Bereich: die Bereiche unterscheiden sich durch Symbol und Name, nicht durch Farbe. */
export const BEREICH_SYMBOL: Record<Pruefbereich, LucideIcon> = { audit: ClipboardCheck, steuer: Landmark, recht: Scale, risiko: ShieldAlert };

/** Anker der CEO-Uebersicht (ceo-bereichs-kacheln.tsx), eine Kachel je Bereich plus Massnahmen
 *  und Einschraenkungen als eigene, zugeklappte Abschnitte. Eine Quelle fuer beide Seiten, die
 *  sie brauchen: das Werkzeug oeffnePruefBereich (api/ki-assistent/route.ts, serverseitig) UND
 *  die immer sichtbare Link-Reihe im Pruefgespraech (ki-chat.tsx, clientseitig) - beide sollen
 *  auf dieselben Ziele zeigen, ohne zwei gepflegte Kopien dieser Zuordnung. */
export const PRUEF_BEREICH_ANKER: Record<Pruefbereich | "massnahmen" | "einschraenkungen", string> = {
  audit: "compliance-kachel-audit",
  steuer: "compliance-kachel-steuer",
  recht: "compliance-kachel-recht",
  risiko: "compliance-kachel-risiko",
  massnahmen: "compliance-massnahmen",
  einschraenkungen: "compliance-einschraenkungen",
};
