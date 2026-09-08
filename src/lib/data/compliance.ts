import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, type Datenquelle } from "@/lib/supabase/config";
import { einsAus } from "@/lib/data/util";

// Compliance-Cockpit (WMCNL-1446): liest die fuenf granularen Datenschutz-
// Tabellen (verarbeitungszwecke, einwilligungen, personenbezogene_zugriffe,
// datenschutzvorfaelle, drittweitergaben) statt der frueheren einzelnen
// public.consent_records. "Ueberfaellig" wird hier berechnet, nicht in einer
// SQL-View - wie es diesem Projekt entspricht (siehe kpi_aktuell()).

export type Rechtsgrundlage = "einwilligung" | "vertrag" | "gesetzliche_pflicht";
export type EinwilligungKanal = "papier" | "app" | "web" | "sms";
export type VorfallArt = "unbefugter_zugriff" | "verlust" | "offenlegung" | "sonstiges";
export type Zugriffsaktion = "lesen" | "export" | "druck" | "uebermittlung";

export interface VerarbeitungszweckZeile {
  id: string;
  code: string;
  bezeichnung: string;
  rechtsgrundlage: Rechtsgrundlage;
  aufbewahrungMonate: number;
  automatisierteEntscheidung: boolean;
  /** Anforderung 4.8: benannte verantwortliche Person, sofern gesetzt. */
  verantwortlichProfilId: string | null;
  verantwortlicher: string | null;
}

export interface EinwilligungZeile {
  id: string;
  betroffener: string;
  zweck: string;
  kanal: EinwilligungKanal;
  erteiltAm: string;
  widerrufenAm: string | null;
  widerrufGrund: string | null;
}

export interface VorfallZeile {
  id: string;
  festgestelltAm: string;
  art: VorfallArt;
  beschreibung: string;
  betroffeneAnzahl: number | null;
  meldefristAm: string | null;
  gemeldetAm: string | null;
  meldereferenz: string | null;
  behobenAm: string | null;
  ueberfaellig: boolean;
  /** Anforderung 4.8: wer diesen Vorfall bearbeitet, sofern gesetzt. */
  verantwortlichProfilId: string | null;
  verantwortlicher: string | null;
}

export interface DrittweitergabeZeile {
  id: string;
  betroffener: string;
  empfaenger: string;
  zweck: string | null;
  weitergegebenAm: string;
  benachrichtigungsfristAm: string | null;
  benachrichtigtAm: string | null;
  ueberfaellig: boolean;
}

export interface ComplianceKennzahlen {
  einwilligungenAktiv: number;
  einwilligungenWiderrufen: number;
  vorfaelleUeberfaellig: number;
  drittweitergabenUeberfaellig: number;
}

export interface ComplianceCockpit {
  quelle: Datenquelle;
  kennzahlen: ComplianceKennzahlen;
  zwecke: VerarbeitungszweckZeile[];
  einwilligungen: EinwilligungZeile[];
  vorfaelle: VorfallZeile[];
  drittweitergaben: DrittweitergabeZeile[];
}

// Wenige, aber echte Beispieldaten fuer den Demo-Modus (ohne Supabase-Umgebung).
// Anders als bei Dokumenten gab es fuer Compliance noch keinen strukturierten
// Demo-Datensatz in src/lib/domain/ - nur die frueheren, rein statischen Texte
// aus ComplianceDemo. Diese Werte spiegeln die Seed-Daten aus supabase/seed.sql.
function demoCockpit(quelle: ComplianceCockpit["quelle"] = "demo"): ComplianceCockpit {
  const zwecke: VerarbeitungszweckZeile[] = [
    {
      id: "demo-personaleinsatz",
      code: "personaleinsatz",
      bezeichnung: "Personaleinsatz und Lohnabrechnung",
      rechtsgrundlage: "vertrag",
      aufbewahrungMonate: 36,
      automatisierteEntscheidung: true,
      verantwortlichProfilId: "demo-leitung",
      verantwortlicher: "N. Amanschajewa (Betriebsleitung)",
    },
    {
      id: "demo-auftragsabwicklung",
      code: "auftragsabwicklung",
      bezeichnung: "Auftragsabwicklung und Lieferung",
      rechtsgrundlage: "vertrag",
      aufbewahrungMonate: 60,
      automatisierteEntscheidung: false,
      verantwortlichProfilId: "demo-leitung",
      verantwortlicher: "N. Amanschajewa (Betriebsleitung)",
    },
    {
      id: "demo-esutd",
      code: "esutd_meldung",
      bezeichnung: "Meldung an ESUTD (enbek.kz)",
      rechtsgrundlage: "gesetzliche_pflicht",
      aufbewahrungMonate: 60,
      automatisierteEntscheidung: false,
      verantwortlichProfilId: null,
      verantwortlicher: null,
    },
  ];

  const einwilligungen: EinwilligungZeile[] = [
    {
      id: "demo-e1",
      betroffener: "D. Sarsenbaj",
      zweck: "Personaleinsatz und Lohnabrechnung",
      kanal: "papier",
      erteiltAm: "2026-08-20T08:00:00+06:00",
      widerrufenAm: null,
      widerrufGrund: null,
    },
    {
      id: "demo-e2",
      betroffener: "A. Tulegenowa",
      zweck: "Personaleinsatz und Lohnabrechnung",
      kanal: "papier",
      erteiltAm: "2026-07-01T08:00:00+06:00",
      widerrufenAm: "2026-08-10T09:00:00+06:00",
      widerrufGrund: "Beschaeftigungsverhaeltnis beendet",
    },
    {
      id: "demo-e3",
      betroffener: "Handelskette A",
      zweck: "Auftragsabwicklung und Lieferung",
      kanal: "web",
      erteiltAm: "2026-08-15T08:00:00+06:00",
      widerrufenAm: null,
      widerrufGrund: null,
    },
  ];

  const vorfaelle: VorfallZeile[] = [
    {
      id: "demo-v1",
      festgestelltAm: "2026-08-25T14:00:00+06:00",
      art: "unbefugter_zugriff",
      beschreibung: "Unpersoenliches Konto im Buero blieb nach Personalwechsel eine Woche aktiv.",
      betroffeneAnzahl: 1,
      meldefristAm: "2026-08-26T14:00:00+06:00",
      gemeldetAm: null,
      meldereferenz: null,
      behobenAm: null,
      ueberfaellig: true,
      verantwortlichProfilId: null,
      verantwortlicher: null,
    },
    {
      id: "demo-v2",
      festgestelltAm: "2026-07-10T09:00:00+06:00",
      art: "verlust",
      beschreibung: "USB-Stick mit ESUTD-Sammelnachweis verlegt, am Folgetag wiedergefunden.",
      betroffeneAnzahl: 42,
      meldefristAm: "2026-07-11T09:00:00+06:00",
      gemeldetAm: "2026-07-11T08:00:00+06:00",
      meldereferenz: "Meldung enbek.kz Nr. 2026-0710",
      behobenAm: "2026-07-11T16:00:00+06:00",
      ueberfaellig: false,
      verantwortlichProfilId: "demo-leitung",
      verantwortlicher: "N. Amanschajewa (Betriebsleitung)",
    },
  ];

  const drittweitergaben: DrittweitergabeZeile[] = [
    {
      id: "demo-d1",
      betroffener: "M. Qojschybaj",
      empfaenger: "ESUTD (enbek.kz)",
      zweck: "Meldung an ESUTD (enbek.kz)",
      weitergegebenAm: "2026-08-05T08:00:00+06:00",
      benachrichtigungsfristAm: "2026-08-19T08:00:00+06:00",
      benachrichtigtAm: null,
      ueberfaellig: true,
    },
    {
      id: "demo-d2",
      betroffener: "Handelskette A",
      empfaenger: "ISESF - elektronische Rechnungsstellung",
      zweck: "Auftragsabwicklung und Lieferung",
      weitergegebenAm: "2026-08-15T08:00:00+06:00",
      benachrichtigungsfristAm: "2026-08-29T08:00:00+06:00",
      benachrichtigtAm: "2026-08-16T09:00:00+06:00",
      ueberfaellig: false,
    },
  ];

  return {
    quelle,
    kennzahlen: kennzahlenAus(einwilligungen, vorfaelle, drittweitergaben),
    zwecke,
    einwilligungen,
    vorfaelle,
    drittweitergaben,
  };
}

function kennzahlenAus(
  einwilligungen: EinwilligungZeile[],
  vorfaelle: VorfallZeile[],
  drittweitergaben: DrittweitergabeZeile[],
): ComplianceKennzahlen {
  return {
    einwilligungenAktiv: einwilligungen.filter((e) => !e.widerrufenAm).length,
    einwilligungenWiderrufen: einwilligungen.filter((e) => e.widerrufenAm).length,
    vorfaelleUeberfaellig: vorfaelle.filter((v) => v.ueberfaellig).length,
    drittweitergabenUeberfaellig: drittweitergaben.filter((d) => d.ueberfaellig).length,
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
