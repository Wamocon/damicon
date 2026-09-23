"use client";

import "@/components/pruefung/pruefung.css";
import "@/components/dashboard/tages.css";
import { TagesKacheln } from "@/components/dashboard/tages-kacheln";
import { useAktuellerBericht } from "@/components/dashboard/use-aktueller-bericht";
import type { BefundAenderung, Bericht } from "@/lib/pruefung/typen";

// Duenne Huelle um TagesKacheln, die den geteilten Live-Stand einbezieht.
//
// Der Reiter "Lage" ist eine Server Component und kennt nur den gespeicherten Bericht. Laeuft
// gerade ein Check oder hat der manuelle Knopf soeben einen neuen erzeugt, ist der frischere
// Stand im Kontext (ceo-pruefung-kontext.tsx) - useAktuellerBericht() waehlt zwischen beiden
// nach erstelltAm, dieselbe Auswahl wie im Kopf oberhalb der Reiterleiste.
//
// Waehrend ein Lauf laeuft, steht der Live-Ablauf oben im Kopf. Hier bleiben so lange die
// Kacheln des vorigen Berichts stehen, statt zu verschwinden: ein leerer Reiter waehrend
// eines Laufs saehe aus, als sei etwas kaputt.
export function TagesKachelnLive({
  initialBericht,
  initialAenderungen,
}: {
  initialBericht: Bericht | null;
  initialAenderungen: BefundAenderung[];
}) {
  const { bericht } = useAktuellerBericht(initialBericht, initialAenderungen);
  return <TagesKacheln bericht={bericht} />;
}
