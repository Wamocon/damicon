import { offeneZonenLesen, offeneZonenSetzen } from "@/components/dashboard/sidebar-zustand";
import type { BereichKey } from "@/lib/administration";
import { zones } from "@/lib/modules";

// Die Seitenleiste während der Vorführung: Himbi klappt den Bereich zu, den er verlässt, damit die Leiste
// kurz bleibt (Rückmeldung vom 06.11.2026). Zu Beginn wird gemerkt, was die Person offen hatte, am Ende
// stellt seitenleisteZurueck() das wieder her, die Vorführung ändert die Einstellung also nicht dauerhaft.

let vorher: readonly BereichKey[] | null = null;

/** Merkt sich die offenen Bereiche einmal zu Beginn der Vorführung. */
export function seitenleisteMerken(): void {
  vorher ??= offeneZonenLesen();
}

/** Nur der Bereich des Schritts bleibt offen. Bei der Startseite ("start") sind alle zu. */
export function seitenleisteZeige(zone: string): void {
  const treffer = zones.find((z) => z.key === zone);
  offeneZonenSetzen(treffer ? [treffer.key] : []);
}

/** Stellt die offenen Bereiche von vor der Vorführung wieder her. */
export function seitenleisteZurueck(): void {
  if (!vorher) return;
  offeneZonenSetzen(vorher);
  vorher = null;
}
