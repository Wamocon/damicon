import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, type Datenquelle } from "@/lib/supabase/config";
import {
  demoLohnAbrechnungen,
  demoLohnPositionen,
  demoLohnSatz,
  type LohnAbrechnung,
  type LohnPosition,
  type LohnSatz,
} from "@/lib/domain/lohn";
import { einsAus } from "@/lib/data/util";

// Lohnabrechnung mit Qualitaetsfaktor (WMCNL-1444). Wie bei reklamationen.ts:
// die eigentliche Rechenarbeit steht in der Datenbank (public.lohn_periode_
// berechnen()), diese Datei liest nur das Ergebnis. Wer schreiben darf,
// entscheidet rbac.ts + RLS - diese Datei filtert nicht zusaetzlich.

export interface LohnUebersicht {
  quelle: Datenquelle;
  satz: LohnSatz | null;
  abrechnungen: LohnAbrechnung[];
  positionen: LohnPosition[];
}

function demoUebersicht(quelle: LohnUebersicht["quelle"] = "demo"): LohnUebersicht {
  return {
    quelle,
    satz: demoLohnSatz,
    abrechnungen: demoLohnAbrechnungen,
    positionen: demoLohnPositionen,
  };
}

export async function ladeLohnUebersicht(): Promise<LohnUebersicht> {
  if (!isSupabaseConfigured()) return demoUebersicht();

  const supabase = await createClient();

  const [
    { data: satzRows, error: satzFehler },
    { data: abrechnungRows, error: abrechnungFehler },
    { data: positionRows, error: positionFehler },
  ] = await Promise.all([
    supabase.from("lohn_saetze").select("*").order("gueltig_ab", { ascending: false }).limit(1),
    supabase
      .from("lohn_abrechnungen")
      .select(
        `id, periode_start, periode_ende, stunden, menge_kg, ausschussquote,
         grundlohn_tenge, mengen_komponente_tenge, qualitaetsfaktor, gesamt_tenge, status,
         pfluecker ( name, ausweis )`,
      )
      .order("periode_start", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("lohn_positionen")
      .select(
        `id, menge_kg, qualitaetsfaktor, ausschuss_anteilig_kg, betrag_tenge,
         pflueckaufgaben ( code ),
         lohn_abrechnungen ( periode_start, periode_ende, pfluecker ( name ) )`,
      )
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (satzFehler || abrechnungFehler || positionFehler) return demoUebersicht("fehler");

  const satz: LohnSatz | null = satzRows?.[0]
    ? {
        id: satzRows[0].id,
        gueltigAb: satzRows[0].gueltig_ab,
        gueltigBis: satzRows[0].gueltig_bis,
        stundenlohnTenge: Number(satzRows[0].stundenlohn_tenge),
        kgSatzTenge: Number(satzRows[0].kg_satz_tenge),
        qualitaetsZielAusschussquote: Number(satzRows[0].qualitaets_ziel_ausschussquote),
        qualitaetsfaktorMin: Number(satzRows[0].qualitaetsfaktor_min),
        qualitaetsfaktorMax: Number(satzRows[0].qualitaetsfaktor_max),
        notiz: satzRows[0].notiz,
      }
    : null;

  const abrechnungen: LohnAbrechnung[] = (abrechnungRows ?? []).map((a) => {
    const pfluecker = einsAus(a.pfluecker);
    return {
      id: a.id,
      pfluecker: pfluecker?.name ?? "-",
      pfleuckerAusweis: pfluecker?.ausweis ?? "-",
      periodeStart: a.periode_start,
      periodeEnde: a.periode_ende,
      stunden: Number(a.stunden),
      mengeKg: Number(a.menge_kg),
      ausschussquote: a.ausschussquote === null ? null : Number(a.ausschussquote),
      grundlohnTenge: Number(a.grundlohn_tenge),
      mengenKomponenteTenge: Number(a.mengen_komponente_tenge),
      qualitaetsfaktor: Number(a.qualitaetsfaktor),
      gesamtTenge: Number(a.gesamt_tenge),
      status: a.status,
    };
  });

  const positionen: LohnPosition[] = (positionRows ?? []).map((p) => {
    const aufgabe = einsAus(p.pflueckaufgaben);
    const abrechnung = einsAus(p.lohn_abrechnungen);
    const pfluecker = abrechnung ? einsAus(abrechnung.pfluecker) : null;
    return {
      id: p.id,
      pfluecker: pfluecker?.name ?? "-",
      periodeStart: abrechnung?.periode_start ?? "-",
      periodeEnde: abrechnung?.periode_ende ?? "-",
      aufgabeCode: aufgabe?.code ?? null,
      mengeKg: Number(p.menge_kg),
      ausschussAnteiligKg: Number(p.ausschuss_anteilig_kg),
      qualitaetsfaktor: Number(p.qualitaetsfaktor),
      betragTenge: Number(p.betrag_tenge),
    };
  });

  return { quelle: "db", satz, abrechnungen, positionen };
}
