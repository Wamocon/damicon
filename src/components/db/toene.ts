import type { Tone } from "@/components/ui/kit";

// Farbtöne der Statusanzeigen, die mehrere Ansichten teilen. Vorher stand die Tabelle der Kühlmessung fünfmal im Code (Kühlkette,
// Nachweiskette, Reklamationen, Logistik, B2B-Portal) und die des Lieferstatus zweimal (WMC-Cleanup 13.10.2026): Kommt ein Wert dazu,
// soll ihn jede Ansicht gleich zeigen.

/** Ergebnis einer Kühlmessung (Datenbank: ok, warnung, verstoss). */
export const kuehlErgebnisTon: Record<string, Tone> = {
  ok: "success",
  warnung: "warning",
  verstoss: "danger",
};

/** Status einer Lieferung (geplant, zugestellt, storniert). */
export const lieferStatusTon: Record<string, Tone> = {
  geplant: "neutral",
  zugestellt: "success",
  storniert: "danger",
};
