import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, type Datenquelle } from "@/lib/supabase/config";
import { einsAus } from "@/lib/data/util";
import {
  demoDrittweitergaben,
  demoEinwilligungen,
  demoVerarbeitungszwecke,
  demoVorfaelle,
  kennzahlenAus,
  type ComplianceKennzahlen,
  type DrittweitergabeZeile,
  type EinwilligungZeile,
  type VerarbeitungszweckZeile,
  type VorfallZeile,
} from "@/lib/domain/compliance";

// Compliance-Cockpit (WMCNL-1446): liest die fuenf granularen Datenschutz-
// Tabellen (verarbeitungszwecke, einwilligungen, personenbezogene_zugriffe,
// datenschutzvorfaelle, drittweitergaben) statt der frueheren einzelnen
// public.consent_records. "Ueberfaellig" wird hier berechnet, nicht in einer
// SQL-View - wie es diesem Projekt entspricht (siehe kpi_aktuell()).
// Typen, Kennzahlenrechnung und Demo-Daten stehen in domain/compliance.ts.

export interface ComplianceCockpit {
  quelle: Datenquelle;
  kennzahlen: ComplianceKennzahlen;
  zwecke: VerarbeitungszweckZeile[];
  einwilligungen: EinwilligungZeile[];
  vorfaelle: VorfallZeile[];
  drittweitergaben: DrittweitergabeZeile[];
}

function demoCockpit(quelle: ComplianceCockpit["quelle"] = "demo"): ComplianceCockpit {
  return {
    quelle,
    kennzahlen: kennzahlenAus(demoEinwilligungen, demoVorfaelle, demoDrittweitergaben),
    zwecke: demoVerarbeitungszwecke,
    einwilligungen: demoEinwilligungen,
    vorfaelle: demoVorfaelle,
    drittweitergaben: demoDrittweitergaben,
  };
}

export interface BetroffenerOption {
  id: string;
  label: string;
}

export interface BetroffenenOptionen {
  pfluecker: BetroffenerOption[];
  profile: BetroffenerOption[];
  b2bKunden: BetroffenerOption[];
}

// Fuer die Formulare: die drei moeglichen Betroffenen-Tabellen als Optionen.
// Nur im DB-Modus interessant - im Demo-Modus gibt es keine Schreibformulare.
export async function ladeBetroffenenOptionen(): Promise<BetroffenenOptionen> {
  if (!isSupabaseConfigured()) return { pfluecker: [], profile: [], b2bKunden: [] };

  const supabase = await createClient();
  const [pflueckerErg, profileErg, b2bErg] = await Promise.all([
    supabase.from("pfluecker").select("id, name").order("name"),
    supabase.from("profiles").select("id, full_name").order("full_name"),
    supabase.from("b2b_kunden").select("id, name").order("name"),
  ]);

  return {
    pfluecker: (pflueckerErg.data ?? []).map((p) => ({ id: p.id, label: p.name })),
    profile: (profileErg.data ?? []).map((p) => ({ id: p.id, label: p.full_name })),
    b2bKunden: (b2bErg.data ?? []).map((k) => ({ id: k.id, label: k.name })),
  };
}

export async function ladeCompliance(): Promise<ComplianceCockpit> {
  if (!isSupabaseConfigured()) return demoCockpit();

  const supabase = await createClient();
  const jetzt = new Date().toISOString();

  const [zweckeErg, einwilligungenErg, vorfaelleErg, drittweitergabenErg] = await Promise.all([
    supabase
      .from("verarbeitungszwecke")
      .select(
        `id, code, bezeichnung, rechtsgrundlage, aufbewahrung_monate, automatisierte_entscheidung,
         verantwortlich_profil_id, profiles ( full_name )`,
      )
      .order("bezeichnung"),
    supabase
      .from("einwilligungen")
      .select(
        `id, kanal, erteilt_am, widerrufen_am, widerruf_grund,
         verarbeitungszwecke ( bezeichnung ),
         pfluecker ( name ),
         profiles ( full_name ),
         b2b_kunden ( name )`,
      )
      .order("erteilt_am", { ascending: false }),
    supabase
      .from("datenschutzvorfaelle")
      .select(
        `id, festgestellt_am, art, beschreibung, betroffene_anzahl, meldefrist_am, gemeldet_am,
         meldereferenz, behoben_am, verantwortlich_profil_id, profiles ( full_name )`,
      )
      .order("festgestellt_am", { ascending: false }),
    supabase
      .from("drittweitergaben")
      .select(
        `id, empfaenger, weitergegeben_am, benachrichtigungsfrist_am, benachrichtigt_am,
         verarbeitungszwecke ( bezeichnung ),
         pfluecker ( name ),
         profiles ( full_name ),
         b2b_kunden ( name )`,
      )
      .order("weitergegeben_am", { ascending: false }),
  ]);

  if (zweckeErg.error || einwilligungenErg.error || vorfaelleErg.error || drittweitergabenErg.error) {
    console.error(
      "[damicon] Compliance-Daten konnten nicht geladen werden:",
      zweckeErg.error?.message ?? einwilligungenErg.error?.message ??
        vorfaelleErg.error?.message ?? drittweitergabenErg.error?.message,
    );
    return demoCockpit("fehler");
  }

  const zwecke: VerarbeitungszweckZeile[] = (zweckeErg.data ?? []).map((z) => ({
    id: z.id,
    code: z.code,
    bezeichnung: z.bezeichnung,
    rechtsgrundlage: z.rechtsgrundlage,
    aufbewahrungMonate: z.aufbewahrung_monate,
    automatisierteEntscheidung: z.automatisierte_entscheidung,
    verantwortlichProfilId: z.verantwortlich_profil_id,
    verantwortlicher: einsAus(z.profiles)?.full_name ?? null,
  }));

  const einwilligungen: EinwilligungZeile[] = (einwilligungenErg.data ?? []).map((e) => {
    const pfluecker = einsAus(e.pfluecker);
    const profil = einsAus(e.profiles);
    const b2bKunde = einsAus(e.b2b_kunden);
    const zweck = einsAus(e.verarbeitungszwecke);
    return {
      id: e.id,
      betroffener: pfluecker?.name ?? profil?.full_name ?? b2bKunde?.name ?? "-",
      zweck: zweck?.bezeichnung ?? "-",
      kanal: e.kanal,
      erteiltAm: e.erteilt_am,
      widerrufenAm: e.widerrufen_am,
      widerrufGrund: e.widerruf_grund,
    };
  });

  const vorfaelle: VorfallZeile[] = (vorfaelleErg.data ?? []).map((v) => ({
    id: v.id,
    festgestelltAm: v.festgestellt_am,
    art: v.art,
    beschreibung: v.beschreibung,
    betroffeneAnzahl: v.betroffene_anzahl,
    meldefristAm: v.meldefrist_am,
    gemeldetAm: v.gemeldet_am,
    meldereferenz: v.meldereferenz,
    behobenAm: v.behoben_am,
    ueberfaellig: !v.gemeldet_am && !!v.meldefrist_am && v.meldefrist_am < jetzt,
    verantwortlichProfilId: v.verantwortlich_profil_id,
    verantwortlicher: einsAus(v.profiles)?.full_name ?? null,
  }));

  const drittweitergaben: DrittweitergabeZeile[] = (drittweitergabenErg.data ?? []).map((d) => {
    const pfluecker = einsAus(d.pfluecker);
    const profil = einsAus(d.profiles);
    const b2bKunde = einsAus(d.b2b_kunden);
    const zweck = einsAus(d.verarbeitungszwecke);
    return {
      id: d.id,
      betroffener: pfluecker?.name ?? profil?.full_name ?? b2bKunde?.name ?? "-",
      empfaenger: d.empfaenger,
      zweck: zweck?.bezeichnung ?? null,
      weitergegebenAm: d.weitergegeben_am,
      benachrichtigungsfristAm: d.benachrichtigungsfrist_am,
      benachrichtigtAm: d.benachrichtigt_am,
      ueberfaellig:
        !d.benachrichtigt_am && !!d.benachrichtigungsfrist_am && d.benachrichtigungsfrist_am < jetzt,
    };
  });

  return {
    quelle: "db",
    kennzahlen: kennzahlenAus(einwilligungen, vorfaelle, drittweitergaben),
    zwecke,
    einwilligungen,
    vorfaelle,
    drittweitergaben,
  };
}
