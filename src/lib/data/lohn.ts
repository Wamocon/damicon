import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, type Datenquelle } from "@/lib/supabase/config";
import {
  demoLohnAbrechnungen,
  demoLohnMonatsabzuege,
  demoLohnPositionen,
  demoLohnSatz,
  demoLohnSteuersatzKz,
  type LohnAbrechnung,
  type LohnAbschlussLuecke,
  type LohnMonatsabzug,
  type LohnPosition,
  type LohnSatz,
  type LohnSteuersatzKz,
} from "@/lib/domain/lohn";
import { einsAus } from "@/lib/data/util";

// Lohnabrechnung mit Qualitaetsfaktor (WMCNL-1444). Wie bei reklamationen.ts:
// die eigentliche Rechenarbeit steht in der Datenbank (public.lohn_periode_
// berechnen()), diese Datei liest nur das Ergebnis. Wer schreiben darf,
// entscheidet rbac.ts + RLS - diese Datei filtert nicht zusaetzlich.
//
// steuersatzKz/monatsabzuege (Migration 20261024000000): gesetzliche
// Lohnabzuege Kasachstan, dieselbe Lese-schreib-Trennung wie oben - die
// Rechenarbeit steht in public.lohn_kz_abzuege_berechnen()/lohn_monat_
// abzuege_berechnen(), hier wird nur gelesen.

export interface LohnUebersicht {
  quelle: Datenquelle;
  /** Der heute gueltige Satz (gueltig_ab <= heute < gueltig_bis) - nicht
   *  zwingend der juengst angelegte, siehe historie. */
  satz: LohnSatz | null;
  /** Alle Saetze, juengster Gueltigkeitsbeginn zuerst (WMCNL-2380: bislang
   *  gab es dafuer gar keine Ansicht, nur den - faelschlich als "aktuell"
   *  gezeigten - juengsten Satz). */
  historie: LohnSatz[];
  abrechnungen: LohnAbrechnung[];
  positionen: LohnPosition[];
  steuersatzKz: LohnSteuersatzKz | null;
  monatsabzuege: LohnMonatsabzug[];
  /** WMCNL-2375: abgeschlossene Aufgaben mit gemeldeter Menge, aber ohne
   *  jede Steige - fallen sonst kommentarlos aus der Lohnabrechnung. */
  abschlussLuecken: LohnAbschlussLuecke[];
}

function demoUebersicht(quelle: LohnUebersicht["quelle"] = "demo"): LohnUebersicht {
  return {
    quelle,
    satz: demoLohnSatz,
    historie: [demoLohnSatz],
    abrechnungen: demoLohnAbrechnungen,
    positionen: demoLohnPositionen,
    steuersatzKz: demoLohnSteuersatzKz,
    monatsabzuege: demoLohnMonatsabzuege,
    abschlussLuecken: [],
  };
}

export async function ladeLohnUebersicht(): Promise<LohnUebersicht> {
  if (!isSupabaseConfigured()) return demoUebersicht();

  const supabase = await createClient();

  const [
    { data: satzRows, error: satzFehler },
    { data: abrechnungRows, error: abrechnungFehler },
    { data: positionRows, error: positionFehler },
    { data: steuersatzRows, error: steuersatzFehler },
    { data: monatsabzugRows, error: monatsabzugFehler },
    { data: lueckenRows, error: lueckenFehler },
  ] = await Promise.all([
    // WMCNL-2380: alle Saetze laden, nicht nur den juengsten - die Karte
    // "Grundlage der Berechnung" braucht den HEUTE gueltigen Satz (siehe
    // Filter unten, derselbe wie in lohn_periode_berechnen()), und die
    // Historie zeigt den Rest.
    supabase.from("lohn_saetze").select("*").order("gueltig_ab", { ascending: false }),
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
    supabase.from("lohn_steuersaetze_kz").select("*").order("gueltig_ab", { ascending: false }).limit(1),
    supabase
      .from("lohn_monatsabzuege")
      .select(
        `id, jahr, monat, brutto_gesamt_tenge, opv_tenge, vosms_tenge,
         ipn_bemessungsgrundlage_tenge, ipn_tenge, netto_tenge,
         opvr_tenge, so_tenge, sn_tenge, osms_tenge, arbeitgeberkosten_gesamt_tenge,
         pfluecker ( name, ausweis )`,
      )
      .order("jahr", { ascending: false })
      .order("monat", { ascending: false })
      .limit(100),
    // WMCNL-2375: abgeschlossene Aufgaben mit gemeldeter Menge, deren
    // Mengenkomponente lohn_periode_berechnen() mangels Steigen niemals
    // erfassen wird (siehe Kommentar an LohnAbschlussLuecke). Das
    // eingebettete steigen(id) liefert je Aufgabe ein (ggf. leeres) Array -
    // kein separater Join noetig.
    supabase
      .from("pflueckaufgaben")
      .select("id, code, ist_menge_kg, steigen ( id )")
      .eq("status", "abgeschlossen")
      .gt("ist_menge_kg", 0)
      .limit(200),
  ]);

  if (
    satzFehler ||
    abrechnungFehler ||
    positionFehler ||
    steuersatzFehler ||
    monatsabzugFehler ||
    lueckenFehler
  ) {
    return demoUebersicht("fehler");
  }

  const historie: LohnSatz[] = (satzRows ?? []).map((s) => ({
    id: s.id,
    gueltigAb: s.gueltig_ab,
    gueltigBis: s.gueltig_bis,
    stundenlohnTenge: Number(s.stundenlohn_tenge),
    kgSatzTenge: Number(s.kg_satz_tenge),
    qualitaetsZielAusschussquote: Number(s.qualitaets_ziel_ausschussquote),
    qualitaetsfaktorMin: Number(s.qualitaetsfaktor_min),
    qualitaetsfaktorMax: Number(s.qualitaetsfaktor_max),
    notiz: s.notiz,
  }));

  // Derselbe Filter wie in lohn_periode_berechnen() (Migration
  // 20260908130000): gueltig_ab <= heute < gueltig_bis (bzw. offenes Ende).
  // Vorher zeigte die Karte schlicht den juengsten Satz nach gueltig_ab -
  // ein zukuenftig gueltiger Satz verdraengte damit den tatsaechlich
  // rechnungsrelevanten (WMCNL-2380).
  const heuteIso = new Date().toISOString().slice(0, 10);
  const satz: LohnSatz | null =
    historie.find((s) => s.gueltigAb <= heuteIso && (s.gueltigBis === null || s.gueltigBis > heuteIso)) ??
    null;

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

  const steuersatzKz: LohnSteuersatzKz | null = steuersatzRows?.[0]
    ? {
        id: steuersatzRows[0].id,
        gueltigAb: steuersatzRows[0].gueltig_ab,
        gueltigBis: steuersatzRows[0].gueltig_bis,
        opvProzent: Number(steuersatzRows[0].opv_prozent),
        opvBemessungsgrenzeTenge: Number(steuersatzRows[0].opv_bemessungsgrenze_tenge),
        vosmsProzent: Number(steuersatzRows[0].vosms_prozent),
        vosmsBemessungsgrenzeTenge: Number(steuersatzRows[0].vosms_bemessungsgrenze_tenge),
        ipnProzent: Number(steuersatzRows[0].ipn_prozent),
        ipnFreibetragTenge: Number(steuersatzRows[0].ipn_freibetrag_tenge),
        opvrProzent: Number(steuersatzRows[0].opvr_prozent),
        soProzent: Number(steuersatzRows[0].so_prozent),
        snProzent: Number(steuersatzRows[0].sn_prozent),
        osmsProzent: Number(steuersatzRows[0].osms_prozent),
        quelle: steuersatzRows[0].quelle,
        notiz: steuersatzRows[0].notiz,
      }
    : null;

  const monatsabzuege: LohnMonatsabzug[] = (monatsabzugRows ?? []).map((m) => {
    const pfluecker = einsAus(m.pfluecker);
    return {
      id: m.id,
      pfluecker: pfluecker?.name ?? "-",
      pfleuckerAusweis: pfluecker?.ausweis ?? "-",
      jahr: m.jahr,
      monat: m.monat,
      bruttoGesamtTenge: Number(m.brutto_gesamt_tenge),
      opvTenge: Number(m.opv_tenge),
      vosmsTenge: Number(m.vosms_tenge),
      ipnBemessungsgrundlageTenge: Number(m.ipn_bemessungsgrundlage_tenge),
      ipnTenge: Number(m.ipn_tenge),
      nettoTenge: Number(m.netto_tenge),
      opvrTenge: Number(m.opvr_tenge),
      soTenge: Number(m.so_tenge),
      snTenge: Number(m.sn_tenge),
      osmsTenge: Number(m.osms_tenge),
      arbeitgeberkostenGesamtTenge: Number(m.arbeitgeberkosten_gesamt_tenge),
    };
  });

  const abschlussLuecken: LohnAbschlussLuecke[] = (lueckenRows ?? [])
    .filter((a) => (a.steigen ?? []).length === 0)
    .map((a) => ({ id: a.id, code: a.code, istMengeKg: Number(a.ist_menge_kg) }));

  return {
    quelle: "db",
    satz,
    historie,
    abrechnungen,
    positionen,
    steuersatzKz,
    monatsabzuege,
    abschlussLuecken,
  };
}
