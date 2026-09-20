"use client";

import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

// Zeigt das KI-Innovator-Abzeichen (public/abzeichen/ki-innovator.png), wenn jemand
// einen der drei Sterne auf DamiAI anklickt (himbi.tsx, haustier-dashboard.tsx). Rein
// zum Anschauen - Escape, Klick daneben oder der Knopf schliessen es wieder.
//
// Eigenes, kleines Portal statt der groesseren Pruefung-Dialog-Vorlage
// (pruefung/pruefung-dialog.tsx): hier gibt es nur ein Bild zu zeigen, kein Ablauf.

export function AbzeichenModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("haustier.abzeichen");
  const wurzel = useRef<HTMLDivElement>(null);

  const schliessen = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    const beiTaste = (e: KeyboardEvent) => e.key === "Escape" && schliessen();
    window.addEventListener("keydown", beiTaste);
    const vorher = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    wurzel.current?.focus();
    return () => {
      window.removeEventListener("keydown", beiTaste);
      document.body.style.overflow = vorher;
    };
  }, [schliessen]);

  return createPortal(
    <div className="hb-abzeichen-blende" onMouseDown={(e) => e.target === e.currentTarget && schliessen()}>
      <div ref={wurzel} className="hb-abzeichen-fenster" role="dialog" aria-modal="true" aria-label={t("titel")} tabIndex={-1}>
        <button type="button" className="hb-abzeichen-schliessen" onClick={schliessen} aria-label={t("schliessen")}>
          <X className="h-4 w-4" />
        </button>
        <div className="hb-abzeichen-bild">
          <Image
            src="/abzeichen/ki-innovator.png"
            alt={t("alt")}
            fill
            sizes="(min-width: 640px) 24rem, 88vw"
            priority
            className="object-contain"
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
