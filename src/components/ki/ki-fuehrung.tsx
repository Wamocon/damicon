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
  const { fuehrung, fuehrungBeenden, zeiger } = useKiPane();

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
      {zeiger ? (
        <div className="ki-zeiger" style={{ transform: `translate(${zeiger.x}px, ${zeiger.y}px)` }} aria-hidden>
          <svg viewBox="0 0 24 24" width="26" height="26" className="ki-zeiger__pfeil">
            <path d="M4 2.5 20 11l-7.2 2.1L9.6 20 4 2.5Z" fill="#e5195e" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
          {zeiger.klicks > 0 ? <span key={zeiger.klicks} className="ki-zeiger__welle" /> : null}
        </div>
      ) : null}
    </div>
  );
}
