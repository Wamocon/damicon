import { ClipboardCheck, Landmark, Scale, ShieldAlert, type LucideIcon } from "lucide-react";
import type { Pruefbereich } from "@/lib/pruefung/rollen";

/** Ein Symbol je Bereich: die Bereiche unterscheiden sich durch Symbol und Name, nicht durch Farbe. */
export const BEREICH_SYMBOL: Record<Pruefbereich, LucideIcon> = { audit: ClipboardCheck, steuer: Landmark, recht: Scale, risiko: ShieldAlert };
