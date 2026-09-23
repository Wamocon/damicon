"use client";

import { useTranslations } from "next-intl";
import { MessageSquareText, Sparkles } from "lucide-react";
import { useComplianceTourSteuerung } from "@/components/dashboard/compliance-tour-kontext";

// Zwei read-only Aktionen zum Bericht, der schon auf der Seite steht - anders als
// "Jetzt neu pruefen" (ceo-aktualisieren-knopf.tsx) loesen sie nie einen neuen Pruefungslauf
// aus, deshalb duerfen sie (anders als jener Knopf) auch in einer Admin-Vorschau "als ceo"
// erscheinen: useComplianceTourSteuerung() haengt an verfuegbar (Himbi sichtbar + Stationen
// vorhanden), nicht an der echten Profilrolle. Stehen in der Kopfzeile der CEO-Uebersicht
// (ceo-compliance-uebersicht.tsx), nicht mehr neben "Befunde" - beide sollen sofort ins Auge
// fallen, nicht erst beim Herunterscrollen zu den Kacheln.
export function CeoTourAktionen() {
  const tc = useTranslations("ceoUebersicht");
  const { verfuegbar, aktiv, starten, zusammenfassen } = useComplianceTourSteuerung();
  if (!verfuegbar) return null;
  return (
    <>
      <button type="button" className="pr-tour-neustart" onClick={zusammenfassen} disabled={aktiv}>
        <MessageSquareText className="h-3.5 w-3.5" aria-hidden /> {tc("tour.zusammenfassung")}
      </button>
      <button type="button" className="pr-tour-neustart" onClick={starten} disabled={aktiv}>
        <Sparkles className="h-3.5 w-3.5" aria-hidden /> {tc("tour.neustart")}
      </button>
    </>
  );
}
