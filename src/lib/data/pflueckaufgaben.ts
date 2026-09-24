import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, type Datenquelle } from "@/lib/supabase/config";
import {
  pflueckaufgaben as demoPflueckaufgaben,
  type AufgabenStatus,
} from "@/lib/domain/pflueckaufgaben";
import { einsAus } from "@/lib/data/util";

// Pflueckaufgaben mit Fotobeleg aus der Datenbank (Meilenstein B), seit
// WMCNL-2488 in drei Zuschnitten:
//
//   - die Liste (lib/data/pflueckaufgaben-liste.ts): gefiltert, geblaettert,
//     ohne Fotos, nur mit deren Anzahl;
//   - die Detailansicht einer Aufgabe (ladeAufgabe): mit Fotos, und nur deren
//     Dateien werden signiert. Vorher signierte jeder Seitenaufruf alle Fotos
//     aller Aufgaben, obwohl nur die einer einzigen zu sehen waren;
//   - der Offline-Spiegel (ladeAufgabenSpiegel): alle offenen Aufgaben, egal
//     was die Liste gerade filtert.
//
// Die Bilddateien liegen im privaten Storage-Bucket "belege" und werden hier
// serverseitig in kurzlebige signierte URLs uebersetzt.

const SIGNATUR_SEKUNDEN = 60 * 60;

// Datenbank-IDs sind UUIDs. Eine andere Kennung aus der Adresse faende nichts
// und liesse Postgres mit 22P02 (ungueltige uuid) abbrechen - sie wird vorher
// abgewiesen.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function istUuid(wert: string): boolean {
  return UUID.test(wert);
}

export interface BelegAnsicht {
  id: string;
  art: "schale" | "reihenblock" | "steige";
  aufgenommen: string;
  hinweis: string;
  /** Signierte URL oder Platzhalterbild, wenn kein Upload hinterlegt ist. */
  bildUrl: string;
  /** true, wenn eine echte Datei im Bucket liegt. */
  hochgeladen: boolean;
}

/** Eine Zeile der Liste. Ohne Belege, nur mit deren Anzahl. */
export interface AufgabeZeile {
  id: string;
  code: string;
  reihenblock: string;
  reihenblockId: string;
  sorte: string;
  brigade: string;
  brigadeId: string | null;
  pflueckerAnzahl: number;
  status: AufgabenStatus;
  faelligkeit: string | null;
  /** Anlagezeitpunkt, zweites Sortierkriterium. null im Demo-Modus. */
  angelegt: string | null;
  zielmengeKg: number;
  istMengeKg: number;
  ausschussKg: number;
  qualitaetsfaktor: number | null;
  belegAnzahl: number;
}

/** Eine Aufgabe in der Detailansicht, mit ihren Belegen. */
export interface AufgabeDetail extends AufgabeZeile {
  belege: BelegAnsicht[];
}

// Platzhalterbilder je Belegart - greifen, solange kein Foto hochgeladen wurde.
// Bewusst eigene Grafiken statt Stockfotos: sie sind als Platzhalter erkennbar,
// treffen die Fachsprache und funktionieren ohne Netzzugriff.
const platzhalter: Record<BelegAnsicht["art"], string> = {
  schale: "/belege/schale.svg",
  reihenblock: "/belege/reihenblock.svg",
  steige: "/belege/steige.svg",
};

/** Spalten einer Listenzeile; die Detailansicht haengt die Belege an. */
export const ZEILEN_SPALTEN = `id, code, status, faelligkeit, created_at, zielmenge_kg, ist_menge_kg,
  ausschuss_kg, pfluecker_anzahl, qualitaetsfaktor, brigade_id,
  reihenbloecke ( id, code ),
  sorten ( name ),
  brigaden ( name )`;

interface DbZeile {
  id: string;
  code: string;
  status: AufgabenStatus;
  faelligkeit: string | null;
  created_at: string;
  zielmenge_kg: number;
  ist_menge_kg: number;
  ausschuss_kg: number;
  pfluecker_anzahl: number;
  qualitaetsfaktor: number | null;
  brigade_id: string | null;
  reihenbloecke: { id: string; code: string } | { id: string; code: string }[] | null;
  sorten: { name: string } | { name: string }[] | null;
  brigaden: { name: string } | { name: string }[] | null;
}

export function zeileAusDb(zeile: DbZeile, belegAnzahl: number): AufgabeZeile {
  const block = einsAus(zeile.reihenbloecke);
  return {
    id: zeile.id,
    code: zeile.code,
    reihenblock: block?.code ?? "",
    reihenblockId: block?.id ?? "",
    sorte: einsAus(zeile.sorten)?.name ?? "",
    // Leer, wo die Rolle die Brigaden nicht lesen darf (erzeuger, siehe
    // Migration 20261023000000_lesezugriff_nach_rolle.sql).
    brigade: einsAus(zeile.brigaden)?.name ?? "",
    brigadeId: zeile.brigade_id,
    pflueckerAnzahl: zeile.pfluecker_anzahl,
    status: zeile.status,
    faelligkeit: zeile.faelligkeit,
    angelegt: zeile.created_at,
    zielmengeKg: Number(zeile.zielmenge_kg),
    istMengeKg: Number(zeile.ist_menge_kg),
    ausschussKg: Number(zeile.ausschuss_kg),
    qualitaetsfaktor: zeile.qualitaetsfaktor === null ? null : Number(zeile.qualitaetsfaktor),
    belegAnzahl,
  };
}

/**
 * Kennung einer Demo-Brigade. Die Beispieldaten tragen nur den Namen; fuer den
 * Brigadefilter im Demo-Modus reicht der Name in Kleinbuchstaben.
 */
export function demoBrigadeId(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Die fuenf Beispielaufgaben, wie die Datenbank sie liefern wuerde. */
export function demoAufgaben(): AufgabeDetail[] {
  return demoPflueckaufgaben.map((aufgabe) => ({
    id: aufgabe.id,
    code: aufgabe.id,
    reihenblock: aufgabe.reihenblock,
    reihenblockId: aufgabe.reihenblock,
    sorte: aufgabe.sorte,
    brigade: aufgabe.brigade,
    brigadeId: demoBrigadeId(aufgabe.brigade),
    pflueckerAnzahl: aufgabe.pflueckerAnzahl,
    status: aufgabe.status,
    faelligkeit: aufgabe.faelligkeit,
    angelegt: null,
    zielmengeKg: aufgabe.zielmengeKg,
    istMengeKg: aufgabe.istMengeKg,
    ausschussKg: 0,
    qualitaetsfaktor: aufgabe.qualitaetsfaktor,
    belegAnzahl: aufgabe.belege.length,
    belege: aufgabe.belege.map((beleg) => ({
      id: beleg.id,
      art: beleg.art,
      aufgenommen: beleg.aufgenommen,
      hinweis: beleg.hinweis,
      bildUrl: beleg.bildUrl,
      hochgeladen: false,
    })),
  }));
}

export interface AufgabeLaden {
  quelle: Datenquelle;
  /** null: nicht vorhanden oder fuer diese Rolle nicht lesbar. */
  aufgabe: AufgabeDetail | null;
}

/**
 * Eine Aufgabe fuer die Detailansicht, unabhaengig von Filter und Seite der
 * Liste: ein Link auf eine Aufgabe funktioniert auch dann, wenn sie in der
 * aktuellen Auswahl gar nicht vorkommt.
 */
export async function ladeAufgabe(id: string): Promise<AufgabeLaden> {
  const demo = () => demoAufgaben().find((aufgabe) => aufgabe.id === id) ?? null;
  if (!isSupabaseConfigured()) return { quelle: "demo", aufgabe: demo() };
  if (!istUuid(id)) return { quelle: "db", aufgabe: null };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pflueckaufgaben")
    .select(
      `${ZEILEN_SPALTEN},
       media_belege ( id, art, aufgenommen_am, hinweis, storage_path )`,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[damicon] Pflueckaufgabe nicht ladbar:", error.message);
    return { quelle: "fehler", aufgabe: demo() };
  }
  if (!data) return { quelle: "db", aufgabe: null };

  const belegZeilen = data.media_belege ?? [];
  const pfade = belegZeilen
    .map((beleg) => beleg.storage_path)
    .filter((pfad): pfad is string => Boolean(pfad));

  const signiert = new Map<string, string>();
  if (pfade.length > 0) {
    const { data: urls, error: signaturFehler } = await supabase.storage
      .from("belege")
      .createSignedUrls(pfade, SIGNATUR_SEKUNDEN);
    if (signaturFehler) {
      console.error("[damicon] Belege nicht signierbar:", signaturFehler.message);
    }
    for (const eintrag of urls ?? []) {
      if (eintrag.path && eintrag.signedUrl) signiert.set(eintrag.path, eintrag.signedUrl);
    }
  }

  const belege: BelegAnsicht[] = belegZeilen
    .map((beleg) => {
      const url = beleg.storage_path ? signiert.get(beleg.storage_path) : null;
      return {
        id: beleg.id,
        art: beleg.art,
        aufgenommen: beleg.aufgenommen_am,
        hinweis: beleg.hinweis ?? "",
        bildUrl: url ?? platzhalter[beleg.art],
        hochgeladen: Boolean(url),
      };
    })
    .sort((a, b) => (a.aufgenommen > b.aufgenommen ? -1 : 1));

  return {
    quelle: "db",
    aufgabe: { ...zeileAusDb(data, belege.length), belege },
  };
}

/** Was der Offline-Spiegel je Aufgabe braucht (ReferenzCacheSync). */
export interface SpiegelAufgabe {
  id: string;
  code: string;
  reihenblock: string;
  reihenblockId: string;
  sorte: string;
  status: AufgabenStatus;
  zielmengeKg: number;
  istMengeKg: number;
  ausschussKg: number;
  pflueckerAnzahl: number;
}

/**
 * Quelle des Offline-Spiegels (Anforderung 2.5): alle offenen Aufgaben, fuer
 * die Brigade ihre eigenen und die ohne Zuordnung. Bewusst nicht die gerade
 * angezeigte Seite - wer die Liste auf "Abgeschlossen" filtert und danach ohne
 * Netz aufs Feld geht, braucht trotzdem die offenen Aufgaben.
 */
export async function ladeAufgabenSpiegel(nurBrigade: {
  brigadeId: string | null;
} | null): Promise<SpiegelAufgabe[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  let abfrage = supabase
    .from("pflueckaufgaben")
    .select(
      `id, code, status, zielmenge_kg, ist_menge_kg, ausschuss_kg, pfluecker_anzahl,
       reihenbloecke ( id, code ),
       sorten ( name )`,
    )
    .neq("status", "abgeschlossen");
  if (nurBrigade) {
    abfrage = nurBrigade.brigadeId
      ? abfrage.or(`brigade_id.eq.${nurBrigade.brigadeId},brigade_id.is.null`)
      : abfrage.is("brigade_id", null);
  }
  const { data, error } = await abfrage
    .order("faelligkeit", { ascending: false, nullsFirst: false })
    .limit(500);

  if (error || !data) {
    if (error) console.error("[damicon] Offline-Spiegel nicht ladbar:", error.message);
    return [];
  }

  return data.map((zeile) => {
    const block = einsAus(zeile.reihenbloecke);
    return {
      id: zeile.id,
      code: zeile.code,
      reihenblock: block?.code ?? "",
      reihenblockId: block?.id ?? "",
      sorte: einsAus(zeile.sorten)?.name ?? "",
      status: zeile.status,
      zielmengeKg: Number(zeile.zielmenge_kg),
      istMengeKg: Number(zeile.ist_menge_kg),
      ausschussKg: Number(zeile.ausschuss_kg),
      pflueckerAnzahl: zeile.pfluecker_anzahl,
    };
  });
}

export interface BrigadeOption {
  id: string;
  name: string;
}

export async function ladeBrigaden(): Promise<BrigadeOption[]> {
  if (!isSupabaseConfigured()) {
    // Im Demo-Modus die Brigaden der Beispielaufgaben, damit sich der
    // Brigadefilter auch ohne Datenbank vorfuehren laesst.
    const namen = [...new Set(demoPflueckaufgaben.map((aufgabe) => aufgabe.brigade))].sort();
    return namen.map((name) => ({ id: demoBrigadeId(name), name }));
  }
  const supabase = await createClient();
  const { data } = await supabase.from("brigaden").select("id, name").order("name");
  return data ?? [];
}
