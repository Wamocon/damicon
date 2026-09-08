"use client";

import { useEffect } from "react";
import { aufgabenSpiegeln, ketteSpiegeln, pflueckerSpiegeln } from "@/lib/offline/referenzcache";

// Anforderung 2.5, Phase 1: spiegelt die ohnehin serverseitig geladenen
// Referenzdaten in die lokale IndexedDB, damit die Feld-Formulare spaeter
// (ab Phase 2) auch ohne Netz noch wissen, welche Aufgaben/Pfluecker es gibt
// und zu welcher Charge eine Aufgabe gehoert - kein zusaetzlicher
// Netzwerk-Pfad, reiner Seiteneffekt auf bereits vorhandenen Props. Rendert
// nichts sichtbares.
export function ReferenzCacheSync({
  aufgaben,
  pfluecker,
  kette,
}: {
  aufgaben: {
    id: string;
    code: string;
    reihenblock: string;
    reihenblockId: string;
    sorte: string;
    status: string;
    zielmengeKg: number;
    istMengeKg: number;
    ausschussKg: number;
    pflueckerAnzahl: number;
  }[];
  pfluecker: { id: string; name: string; ausweis: string }[];
  kette: { aufgabeId: string; chargeId: string; chargeCode: string } | null;
}) {
  useEffect(() => {
    void aufgabenSpiegeln(aufgaben);
    // aufgaben ist bei jedem Server-Render eine neue Array-Referenz - der
    // Vergleich laeuft ueber die serialisierte Form, damit der Effekt nicht
    // bei jedem Rendern neu schreibt, obwohl sich inhaltlich nichts geaendert
    // hat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(aufgaben)]);

  useEffect(() => {
    if (pfluecker.length > 0) void pflueckerSpiegeln(pfluecker);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(pfluecker)]);

  useEffect(() => {
    if (kette) void ketteSpiegeln(kette);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kette?.aufgabeId, kette?.chargeId, kette?.chargeCode]);

  return null;
}
