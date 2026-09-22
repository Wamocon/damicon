"use client";

import { PruefungBericht } from "@/components/pruefung/pruefung-bericht";
import "@/components/pruefung/pruefung.css";
import "@/components/pruefung/pruefung-ablauf.css";
import type { Bericht } from "@/lib/pruefung/typen";

// Duenne Client-Huelle um PruefungBericht fuer /dashboard/compliance: die Seite ist eine
// Server Component und kann die Stylesheets der Pruefung nicht selbst einbinden, und
// PruefungBericht haelt seinen Bereichsfilter im State.
//
// Die .pa-Flaeche kommt aus pruefung-ablauf.css und macht den Container auf, auf den sich die
// @container-Regeln in pruefung.css beziehen (Kopfkarte, Massnahmenplan). Ohne sie blieben sie
// auf breiter Darstellung stehen, egal wie schmal das Fenster ist.
export function ComplianceBerichtAnsicht({ bericht }: { bericht: Bericht }) {
  return (
    <div className="pa">
      <PruefungBericht bericht={bericht} />
    </div>
  );
}
