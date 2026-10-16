import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, type Datenquelle } from "@/lib/supabase/config";
import { dokumente as demoDokumente } from "@/lib/domain/betrieb-data";
import {
  istNachweisStatus,
  nachweisFristen,
  tageBisAblauf,
  WARNUNG_TAGE_STANDARD,
  nachweisStatus,
  type NachweisFrist,
  type PartnerArt,
  type NachweisStatus,
} from "@/lib/domain/nachweise";
import { tagInZone } from "@/lib/domain/tageszeit";
import { tagePlus } from "@/lib/listen/zeitraum";
import { einsAus } from "@/lib/data/util";
import { liesI18n, uebersetzt, type I18nSpalte } from "@/lib/i18n-daten";
import { signiereDokumentPfade } from "@/lib/data/signierte-urls";

// Nachweisregister (Meilenstein B, WMCNL-1469): Spritzprotokolle, ESUTD-
// Nachweise, Vertraege, Foerderdossiers, Zertifikate und Genehmigungen, jeweils
// mit Bezug auf Reihenblock, Charge oder einen Partner und mit einem
// Gueltigkeitszeitraum, aus dem der Ablaufstatus folgt (public.v_dokumente).

export type DokumentKategorie =
  | "spritzmittelprotokoll"
  | "esutd_nachweis"
  | "liefervertrag"
  | "foerderdossier"
  | "zertifikat"
  | "sonstiges";

export interface DokumentZeile {
  id: string;
  name: string;
  kategorie: DokumentKategorie;
  /** Anzeigewert: der gespeicherte Bezug, sonst der Code des Blocks oder der Charge. */
  bezug: string;
  /** Der tatsaechlich gespeicherte Bezug. Nur dieser gehoert in ein Bearbeiten-Formular,
   *  sonst wuerde der Anzeige-Fallback beim Speichern als Text in die Spalte geschrieben. */
  bezugRoh: string | null;
  stand: string | null;
  gueltigVon: string | null;
  gueltigBis: string | null;
  unbefristet: boolean;
  /** So viele Tage vor dem Ende beginnt die Vorwarnung. */
  warnungTage: number;
  /** Aus dem Zeitraum berechnet, nicht von Hand gesetzt. */
  nachweisStatus: NachweisStatus;
  /** Tage bis zum Ende, negativ nach Ablauf, null ohne Enddatum oder bei unbefristeten Dokumenten. */
  tageBisAblauf: number | null;
  verantwortlichId: string | null;
  verantwortlich: string | null;
  rechtsgrundlage: string | null;
  partnerArt: PartnerArt | null;
  partnerId: string | null;
  partner: string | null;
  /** Signierte URL, falls eine Datei hinterlegt ist und der Link erzeugt werden konnte. */
  dateiUrl: string | null;
  /** Es gibt eine Datei im Speicher, unabhaengig davon, ob ein Link erzeugt werden konnte. */
  hatDatei: boolean;
  /** Die Version, die dieses Dokument ersetzt (Migration 20261208120000), und die, die es ersetzt hat. */
  ersetztId: string | null;
  ersetztDurchId: string | null;
  /** Uebersetzungen von name, bezug und rechtsgrundlage (Spalte i18n). Die Felder oben tragen das Original: das Bearbeiten-Formular zeigt es, die Anzeige uebersetzt. */
  i18n: I18nSpalte;
}

export interface DokumentListe {
  quelle: Datenquelle;
  dokumente: DokumentZeile[];
}

// Die Beispieldaten fuehren die Kategorie als freien Text - fuer die
// Demo-Ansicht auf den Enum-Wert abbilden.
const kategorieAusText: Record<string, DokumentKategorie> = {
  Spritzmittelprotokoll: "spritzmittelprotokoll",
  "ESUTD-Nachweis": "esutd_nachweis",
  Liefervertrag: "liefervertrag",
  Foerderdossier: "foerderdossier",
  Zertifikat: "zertifikat",
};

// Die Beispieldaten kennen nur den alten, von Hand gesetzten Status. Fuer die
// Demo wird daraus ein Gueltigkeitsende relativ zu heute abgeleitet, damit die
// Ansicht alle Stufen zeigt, egal wann sie geoeffnet wird.
const demoTageBisEnde: Record<string, number> = { gueltig: 200, prueflauf: 25, abgelaufen: -30 };

function demoListe(quelle: DokumentListe["quelle"] = "demo"): DokumentListe {
  const heute = tagInZone(new Date());
  return {
    quelle,
    dokumente: demoDokumente.map((doc) => {
      const zeitraum = {
        gueltigVon: null,
        gueltigBis: tagePlus(heute, demoTageBisEnde[doc.status] ?? 200),
        unbefristet: false,
        warnungTage: WARNUNG_TAGE_STANDARD,
      };
      return {
        id: doc.id,
        name: doc.name,
        kategorie: kategorieAusText[doc.kategorie] ?? "sonstiges",
        bezug: doc.bezug,
        bezugRoh: doc.bezug,
        stand: doc.stand,
        ...zeitraum,
        nachweisStatus: nachweisStatus(zeitraum, heute),
        tageBisAblauf: tageBisAblauf(zeitraum, heute),
        verantwortlichId: null,
        verantwortlich: null,
        rechtsgrundlage: null,
        partnerArt: null,
        partnerId: null,
        partner: null,
        dateiUrl: null,
        hatDatei: false,
        ersetztId: null,
        ersetztDurchId: null,
        i18n: {},
      };
    }),
  };
}

const SPALTEN = `id, name, kategorie, bezug, stand, storage_path, gueltig_von, gueltig_bis, unbefristet, warnung_tage,
  nachweis_status, tage_bis_ablauf, verantwortlich_id, rechtsgrundlage, b2b_kunde_id, nachbarbetrieb_id, ersetzt_id, ersetzt_durch_id, i18n,
  reihenbloecke ( code ), chargen ( code ), profiles ( full_name ), b2b_kunden ( name ), nachbarbetriebe ( name )`;

type DokumentRohzeile = NonNullable<Awaited<ReturnType<typeof ladeRohzeilen>>["data"]>[number];

async function ladeRohzeilen() {
  const supabase = await createClient();
  const antwort = await supabase
    .from("v_dokumente")
    .select(SPALTEN)
    // Wer bald ablaeuft, steht oben: erst nach Enddatum, Dokumente ohne Enddatum danach.
    .order("gueltig_bis", { ascending: true, nullsFirst: false })
    .order("name");
  return { supabase, ...antwort };
}

function partnerAus(doc: DokumentRohzeile): Pick<DokumentZeile, "partnerArt" | "partnerId" | "partner"> {
  if (doc.b2b_kunde_id) {
    return { partnerArt: "kunde", partnerId: doc.b2b_kunde_id, partner: einsAus(doc.b2b_kunden)?.name ?? null };
  }
  if (doc.nachbarbetrieb_id) {
    return { partnerArt: "nachbar", partnerId: doc.nachbarbetrieb_id, partner: einsAus(doc.nachbarbetriebe)?.name ?? null };
  }
  return { partnerArt: null, partnerId: null, partner: null };
}

function zeileAusDb(doc: DokumentRohzeile, signiert: ReadonlyMap<string, string>): DokumentZeile {
  const block = einsAus(doc.reihenbloecke);
  const charge = einsAus(doc.chargen);
  return {
    id: doc.id ?? "",
    name: doc.name ?? "",
    kategorie: doc.kategorie ?? "sonstiges",
    bezug: doc.bezug ?? block?.code ?? charge?.code ?? "",
    bezugRoh: doc.bezug,
    stand: doc.stand,
    gueltigVon: doc.gueltig_von,
    gueltigBis: doc.gueltig_bis,
    unbefristet: doc.unbefristet ?? false,
    warnungTage: doc.warnung_tage ?? WARNUNG_TAGE_STANDARD,
    nachweisStatus: istNachweisStatus(doc.nachweis_status) ? doc.nachweis_status : "offen",
    tageBisAblauf: doc.tage_bis_ablauf,
    verantwortlichId: doc.verantwortlich_id,
    verantwortlich: einsAus(doc.profiles)?.full_name ?? null,
    rechtsgrundlage: doc.rechtsgrundlage,
    ...partnerAus(doc),
    dateiUrl: doc.storage_path ? (signiert.get(doc.storage_path) ?? null) : null,
    hatDatei: Boolean(doc.storage_path),
    ersetztId: doc.ersetzt_id,
    ersetztDurchId: doc.ersetzt_durch_id,
    i18n: liesI18n(doc.i18n),
  };
}

export async function ladeDokumente(): Promise<DokumentListe> {
  if (!isSupabaseConfigured()) return demoListe();

  const { supabase, data, error } = await ladeRohzeilen();
  if (error || !data) return demoListe("fehler");

  const pfade = data.map((doc) => doc.storage_path).filter((pfad): pfad is string => Boolean(pfad));
  const signiert = await signiereDokumentPfade(supabase, pfade);

  return { quelle: "db", dokumente: data.map((doc) => zeileAusDb(doc, signiert)) };
}

/**
 * Nachweise, die abgelaufen sind oder bald ablaufen, fuer das Risiko-Radar.
 * Ohne Datenbank oder bei einem Fehler: leer und ein Ausfallvermerk, nie
 * erfundene Fristen (die Demo-Liste zaehlt hier nicht).
 */
export async function ladeNachweisFristen(): Promise<{ fristen: NachweisFrist[]; ausgefallen: boolean }> {
  if (!isSupabaseConfigured()) return { fristen: [], ausgefallen: false };

  const supabase = await createClient();
  const sprache = await getLocale();
  const { data, error } = await supabase
    .from("v_dokumente")
    .select("id, name, i18n, gueltig_bis, nachweis_status")
    .in("nachweis_status", ["laeuft_ab", "abgelaufen"])
    // Eine ersetzte Version schlaegt nicht mehr Alarm: der Nachweis gilt durch die neue.
    .is("ersetzt_durch_id", null)
    .not("gueltig_bis", "is", null)
    .order("gueltig_bis", { ascending: true });

  if (error || !data) return { fristen: [], ausgefallen: true };

  return {
    ausgefallen: false,
    fristen: nachweisFristen(
      data.map((z) => ({
        id: z.id ?? "",
        name: uebersetzt(liesI18n(z.i18n), "name", sprache, z.name ?? ""),
        gueltigBis: z.gueltig_bis,
        status: istNachweisStatus(z.nachweis_status) ? z.nachweis_status : "offen",
      })),
    ),
  };
}

export interface NachweisOptionen {
  verantwortliche: { id: string; label: string }[];
  /** Wert "kunde:<id>" oder "nachbar:<id>", wie ihn das Formular zurueckgibt. */
  partner: { wert: string; text: string }[];
}

/** Auswahllisten fuer das Register: wer verantwortlich sein kann und welche Partner es gibt. Leer ohne Datenbank. */
export async function ladeNachweisOptionen(): Promise<NachweisOptionen> {
  if (!isSupabaseConfigured()) return { verantwortliche: [], partner: [] };

  const supabase = await createClient();
  const [profile, kunden, nachbarn] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, role")
      .in("role", ["admin", "ceo", "betriebsleitung", "buchhaltung", "brigade"])
      .order("full_name"),
    supabase.from("b2b_kunden").select("id, name").order("name"),
    supabase.from("nachbarbetriebe").select("id, name").order("name"),
  ]);

  return {
    verantwortliche: (profile.data ?? []).map((p) => ({ id: p.id, label: p.full_name })),
    partner: [
      ...(kunden.data ?? []).map((k) => ({ wert: `kunde:${k.id}`, text: k.name })),
      ...(nachbarn.data ?? []).map((n) => ({ wert: `nachbar:${n.id}`, text: n.name })),
    ],
  };
}
