"use client";

import type { CSSProperties } from "react";
import { Himbi } from "@/components/haustier/himbi";
import "@/components/haustier/haustier.css";

// Himbi ist weggeschickt: nur die Blattkrone und die Augen schauen am unteren Bildrand
// heraus - wie jemand, der sich hinter der Kante versteckt und wartet. Ein Klick holt sie
// zurueck. So ist "wegschicken" nie eine Sackgasse, ohne dass Himbi im Weg steht.

export function HimbiVersteck({
  label,
  onClick,
  paneOffen = false,
  hoch = false,
}: {
  label: string;
  onClick: () => void;
  paneOffen?: boolean;
  /** Startseite: weiter links ansetzen, damit der Tonschalter unten rechts frei bleibt. */
  hoch?: boolean;
}) {
  return (
    <button
      type="button"
      className="hb-versteck"
      data-hoch={hoch}
      data-pane-offen={paneOffen}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <span className="hb-versteck__innen" style={{ "--bx": -1.8, "--by": -2.4 } as CSSProperties}>
        <Himbi zustand="ruhe" groesse={64} />
      </span>
    </button>
  );
}
