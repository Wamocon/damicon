import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

// Die Einzelwerte hinter zwei Kennzahlen, fuer Rangliste und Punktstreifen
// auf den Bereichsseiten Feld und Hof.
//
// Die Kennzahlkachel zeigt je Kennzahl eine Zahl. Rangliste und Streifen
// brauchen dagegen die Werte DAHINTER: die Pflueckleistung je Person, die
// Vorkuehlzeit je Charge. Nur diese beiden - was keine Form auf einer Seite
// zeigt, wird auch nicht geladen.
//
// Bewusst kein neuer RPC fuer die Vorkuehlung: was hier gerechnet wird,
// gehoert nicht in kpi_aktuell() - dort stehen die Baseline-Kennzahlen, und
// die bleiben unberuehrt, bis der Katalog steht.

export interface Person {
  name: string;
  kgProStunde: number;
}

export interface Messpunkt {
  code: string;
  minuten: number;
}

export interface Verteilungen {
  /** Pflueckleistung je Person, absteigend. Grundlage fuer die Rangliste. */
  personen: Person[];
  /** Zeit vom Pfluecken bis zur Vorkuehlung je Charge, aufsteigend. */
  vorkuehlung: Messpunkt[];
}

// Ohne Datenbank dieselben Werte, die der Seed erzeugt - im Demo-Modus zeigt
// die Seite sonst eine leere Grafik unter einer Kennzahl, die eine Zahl hat.
const demo: Verteilungen = {
  personen: [
    { name: "D. Sarsenbaj", kgProStunde: 6.64 },
    { name: "A. Tulegenowa", kgProStunde: 6.52 },
    { name: "M. Qojschybaj", kgProStunde: 3.78 },
  ],
  vorkuehlung: [
    { code: "CH-0829-04", minuten: 39 },
    { code: "CH-0902-14", minuten: 41 },
    { code: "CH-0829-05", minuten: 42 },
    { code: "CH-0828-03", minuten: 42 },
    { code: "CH-0826-01", minuten: 42 },
    { code: "CH-0831-06", minuten: 44 },
    { code: "CH-0901-07", minuten: 44 },
    { code: "CH-0825-02", minuten: 48 },
    { code: "CH-0902-15", minuten: 58 },
    { code: "CH-0902-12", minuten: 72 },
  ],
};

export const ladeVerteilungen = cache(ladeVerteilungenRoh);

async function ladeVerteilungenRoh(): Promise<Verteilungen> {
  if (!isSupabaseConfigured()) return demo;

  const supabase = await createClient();

  const [leistung, chargen] = await Promise.all([
    // Die Leistung je Person rechnet die Datenbank, mit demselben Weg wie
    // kpi_aktuell() (Migration 20261106000000). Vorher summierte diese
    // Datei steigen und arbeitszeiten selbst - und kam auf andere Werte als
    // die Kennzahl darueber, weil sie Arbeitszeiten ohne zugehoerige
    // Steigen mitzaehlte. Dazu brach die REST-Abfrage bei 1000 Zeilen ab.
    supabase.rpc("pflueckleistung_je_person"),
    supabase.from("chargen").select("code, pflueck_zeitpunkt, vorkuehlung_zeitpunkt"),
  ]);

  // Faellt eine der beiden Quellen aus - etwa weil die Migration auf dieser
  // Instanz noch nicht angewendet ist -, bleibt die Liste leer. Die Kachel
  // zeigt dann das Meter statt Rangliste oder Streifen. Demo-Namen an dieser
  // Stelle waeren schlimmer als keine Liste: sie stuenden unter einer echten
  // Kopfzahl und saehen aus, als gehoerten sie dazu.
  const personen: Person[] = (leistung.data ?? []).map((zeile) => ({
    name: zeile.name,
    kgProStunde: Number(zeile.kg_h),
  }));

  const vorkuehlung: Messpunkt[] = [];
  for (const charge of chargen.data ?? []) {
    if (!charge.pflueck_zeitpunkt || !charge.vorkuehlung_zeitpunkt) continue;
    const minuten = Math.round(
      (new Date(charge.vorkuehlung_zeitpunkt).getTime() -
        new Date(charge.pflueck_zeitpunkt).getTime()) /
        60000,
    );
    if (minuten < 0) continue;
    vorkuehlung.push({ code: charge.code, minuten });
  }
  vorkuehlung.sort((a, b) => a.minuten - b.minuten);

  return { personen, vorkuehlung };
}
