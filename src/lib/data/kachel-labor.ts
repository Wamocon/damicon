import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, type Datenquelle } from "@/lib/supabase/config";

// Daten fuer das Kachel-Labor (/dashboard/kachel-labor).
//
// Die Kennzahlkachel zeigt je Kennzahl eine Zahl. Mehrere der vorgeschlagenen
// Formen brauchen dagegen die Werte DAHINTER: die Pflueckleistung je Person,
// die Vorkuehlzeit je Charge, die Grundgesamtheit hinter einer Quote. Ohne die
// waere das Labor eine Zeichnung statt einer Probe.
//
// Bewusst kein neuer RPC: das Labor ist eine Vergleichsseite, keine Kennzahl.
// Was hier gerechnet wird, gehoert nicht in kpi_aktuell() - dort stehen die
// Baseline-Kennzahlen, und die bleiben unberuehrt, bis der Katalog steht.

export interface Person {
  name: string;
  kgProStunde: number;
}

export interface Messpunkt {
  code: string;
  minuten: number;
}

export interface Anteil {
  erfuellt: number;
  gesamt: number;
}

export interface Verlaufspunkt {
  tag: string;
  wert: number;
}

export interface Verlustpunkt {
  code: string;
  /** Ausschuss gegen Gesamtmenge, in Prozent. */
  quote: number;
}

export interface LaborDaten {
  quelle: Datenquelle;
  /** Pflueckleistung je Person, absteigend. Grundlage fuer Streuung. */
  personen: Person[];
  /** Zeit vom Pfluecken bis zur Vorkuehlung je Charge, aufsteigend. */
  vorkuehlung: Messpunkt[];
  /** Verlustquote je Charge, absteigend - die schlechteste zuerst. */
  verlust: Verlustpunkt[];
  /** Saisonkraefte mit ESUTD-Vertrag gegen alle. */
  esutd: Anteil;
  /** Behandlungen mit eingehaltener Wartezeit gegen alle. */
  wartezeit: Anteil;
  /** Messpunkte einer Kennzahl aus kpi_verlauf, aeltester zuerst. */
  verlauf: Verlaufspunkt[];
}

// Ohne Datenbank dieselben Werte, die der Seed erzeugt - damit das Labor auch
// im Demo-Modus zeigt, was es zeigen soll, und nicht leer bleibt.
const demo: LaborDaten = {
  quelle: "demo",
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
  verlust: [
    { code: "CH-0902-12", quote: 11.4 },
    { code: "CH-0825-02", quote: 9.8 },
    { code: "CH-0831-06", quote: 8.1 },
    { code: "CH-0826-01", quote: 6.9 },
    { code: "CH-0829-04", quote: 5.2 },
  ],
  esutd: { erfuellt: 3, gesamt: 5 },
  wartezeit: { erfuellt: 3, gesamt: 3 },
  verlauf: [],
};

export const ladeLaborDaten = cache(ladeLaborDatenRoh);

async function ladeLaborDatenRoh(): Promise<LaborDaten> {
  if (!isSupabaseConfigured()) return demo;

  const supabase = await createClient();

  const [leistung, chargen, pfluecker, behandlungen, verlauf] =
    await Promise.all([
      // Die Leistung je Person rechnet die Datenbank, mit demselben Weg wie
      // kpi_aktuell() (Migration 20261106000000). Vorher summierte diese
      // Datei steigen und arbeitszeiten selbst - und kam auf andere Werte als
      // die Kennzahl darueber, weil sie Arbeitszeiten ohne zugehoerige
      // Steigen mitzaehlte. Dazu brach die REST-Abfrage bei 1000 Zeilen ab.
      supabase.rpc("pflueckleistung_je_person"),
      supabase
        .from("chargen")
        .select(
          "code, pflueck_zeitpunkt, vorkuehlung_zeitpunkt, menge_kg, ausschuss_kg",
        ),
      supabase.from("pfluecker").select("id, name, esutd"),
      supabase
        .from("pflanzenschutz_behandlungen")
        .select("id, freigegeben"),
      supabase
        .from("kpi_verlauf")
        .select("schluessel, gemessen_am, wert")
        .eq("schluessel", "verlustquote")
        .order("gemessen_am", { ascending: true })
        .limit(12),
    ]);

  if (chargen.error || pfluecker.error) {
    return { ...demo, quelle: "fehler" };
  }

  // Faellt die Funktion aus - etwa weil die Migration auf dieser Instanz noch
  // nicht angewendet ist -, bleibt die Liste leer. Die Kachel zeigt dann das
  // Meter statt einer Rangliste. Demo-Namen an dieser Stelle waeren schlimmer
  // als keine Liste: sie stuenden unter einer echten Kopfzahl und saehen aus,
  // als gehoerten sie dazu.
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

  // Chargen ohne Menge bleiben draussen: eine Quote mit Nenner null ist keine
  // Quote. Genau daran ist die erste Fassung dieser Abfrage gescheitert.
  const verlust: Verlustpunkt[] = [];
  for (const charge of chargen.data ?? []) {
    const menge = Number(charge.menge_kg ?? 0);
    const ausschuss = Number(charge.ausschuss_kg ?? 0);
    const gesamt = menge + ausschuss;
    if (gesamt <= 0) continue;
    verlust.push({
      code: charge.code,
      quote: Number(((ausschuss / gesamt) * 100).toFixed(1)),
    });
  }
  verlust.sort((a, b) => b.quote - a.quote);

  const alle = pfluecker.data ?? [];
  const behandelt = behandlungen.data ?? [];

  return {
    quelle: "db",
    personen,
    vorkuehlung: vorkuehlung.length > 0 ? vorkuehlung : demo.vorkuehlung,
    verlust: verlust.length > 0 ? verlust : demo.verlust,
    esutd: {
      erfuellt: alle.filter((p) => p.esutd === "erfasst").length,
      gesamt: alle.length,
    },
    // "Eingehalten" heisst hier: die Sperre ist abgelaufen und wurde
    // freigegeben, ohne dass dazwischen geerntet wurde. Die vollstaendige
    // Pruefung steht in kpi_aktuell(); fuers Labor genuegt die Freigabe.
    wartezeit: {
      erfuellt: behandelt.filter((b) => b.freigegeben).length,
      gesamt: behandelt.length,
    },
    verlauf: (verlauf.data ?? []).map((zeile) => ({
      tag: zeile.gemessen_am,
      wert: Number(zeile.wert),
    })),
  };
}
