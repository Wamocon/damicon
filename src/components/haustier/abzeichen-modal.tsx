"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// Kleines Anzeige-Portal fuer DamiAI: zeigt, worauf man gerade getippt hat - das
// KI-Innovator-Abzeichen (Sterne auf dem Chapan) oder das Damicon-Siegel (Anstecknadel
// auf der Kappe), beide in haustier-dashboard.tsx. Rein zum Anschauen - Escape, Klick
// daneben oder der Knopf schliessen es wieder.
//
// Eigenes, kleines Portal statt der groesseren Pruefung-Dialog-Vorlage
// (pruefung/pruefung-dialog.tsx): hier gibt es nur etwas zu zeigen, kein Ablauf. Der
// Inhalt (Bild oder Logo) kommt von aussen, damit dieses Geruest fuer beides reicht.
export function AbzeichenModal({
  titel,
  schliessenText,
  bildKlasse,
  children,
  onClose,
}: {
  titel: string;
  schliessenText: string;
  /** Zusatzklasse fuer .hb-abzeichen-bild, z. B. ein anderes Seitenverhaeltnis. */
  bildKlasse?: string;
  children: ReactNode;
  onClose: () => void;
}) {
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
      <div ref={wurzel} className="hb-abzeichen-fenster" role="dialog" aria-modal="true" aria-label={titel} tabIndex={-1}>
        <button type="button" className="hb-abzeichen-schliessen" onClick={schliessen} aria-label={schliessenText}>
          <X className="h-4 w-4" />
        </button>
        <div className={cn("hb-abzeichen-bild", bildKlasse)}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
