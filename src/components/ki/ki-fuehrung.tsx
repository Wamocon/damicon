"use client";

import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { Himbeere } from "@/components/ki/himbeere";
import { useKiPane } from "@/components/ki/ki-pane-kontext";
import { cn } from "@/lib/utils";

// Sichtbares Zeichen im HAUPTFENSTER, dass gerade der Agent (oder ein Klick
// auf einen Quellenverweis) die Ansicht bewegt: ein pulsierender Rahmen um
// die Arbeitsflaeche plus eine Pille "Agent zeigt dir: ...". Sitzt als
// erstes Kind der Hauptspalte im Layout - sticky mit negativem unteren Rand,
// damit es die Sichthoehe ueberdeckt, aber selbst keinen Platz im Fluss
// belegt (siehe .ki-fuehrung in globals.css). Die Pille ist die einzige
// klickbare Flaeche: "Stopp" gibt dem Nutzer die Kontrolle sofort zurueck.
export function KiFuehrungsAnzeige() {
  const t = useTranslations("kiAssistentAnsicht");
  const { fuehrung, fuehrungBeenden } = useKiPane();

  return (
    <div className={cn("ki-fuehrung print:hidden", fuehrung && "ki-fuehrung--aktiv")} aria-live="polite">
      <div className="ki-fuehrung__rahmen" aria-hidden />
      {fuehrung ? (
        <div key={fuehrung.ziel} className="ki-fuehrung__pille">
          <Himbeere groesse={17} denkt />
          <span>{t("fuehrung.zeigt", { ziel: fuehrung.label })}</span>
          <button type="button" onClick={fuehrungBeenden} aria-label={t("fuehrung.beenden")}>
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
