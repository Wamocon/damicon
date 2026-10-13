import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "@/lib/rbac";
import { erlaubteRollen, istBereich, type UploadMetadaten } from "@/lib/wissen/hochladen";
import { waehleEinfuegestelle, type NachtragBasis, type NachtragSpeicher } from "@/lib/wissen/nachtrag";
import { istCluster, istQuellenart, istTextgrundlage } from "@/lib/wissen/quellenart";
import type { SeitenAngabe } from "@/lib/wissen/seitenverlauf";
import { bereichSchluessel } from "@/lib/wissen/upload-konstanten";

// Der Speicher des Nachtrags auf dem service_role-Client (die Logik steht in nachtrag.ts). Wie speicher-supabase.ts getrennt, damit er einzeln gegen eine echte
// Datenbank geprüft werden kann (supabase/tests/wissen-nachtrag-db.ts).

const SEITE = 1000;

const FEHLER = (was: string, e: { message: string } | null) => {
  if (e) throw new Error(`${was}: ${e.message}`);
};

interface ErsteZeile {
  titel: string | null;
  bereich: string | null;
  rollen: string[] | null;
  quellenart: string | null;
  cluster: string | null;
  textgrundlage: string | null;
  url: string | null;
  extra: Record<string, unknown> | null;
}

const zahl = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : typeof x === "string" && /^\d+$/.test(x) ? Number(x) : null);
const text = (x: unknown): string | null => (typeof x === "string" && x ? x : null);

/** Liest die Angabe zum Seitenverlauf aus extra.seiten_pruefung zurück in die Form, in der sie beim Hochladen ankam. */
function seitenAngabeAus(roh: unknown): SeitenAngabe | undefined {
  if (!roh || typeof roh !== "object") return undefined;
  const r = roh as Record<string, unknown>;
  const seiten = zahl(r.seiten);
  const fehlend = zahl(r.fehlend);
  if (seiten === null || fehlend === null) return undefined;
  const orte = text(r.orte);
  const artikelFehlend = zahl(r.artikel_fehlend);
  return {
    seiten,
    fehlend,
    stellen: text(r.stellen) ?? "",
    abdeckung: zahl(r.abdeckung) ?? 0,
    ...(orte ? { orte } : {}),
    ...(artikelFehlend !== null ? { artikelFehlend, artikelStellen: text(r.artikel_stellen) ?? "" } : {}),
  };
}

export function supabaseNachtrag(db: SupabaseClient): NachtragSpeicher {
  return {
    async ladeBasis(quelleId): Promise<NachtragBasis | null> {
      const { data, error } = await db
        .from("wissen_chunks")
        .select("titel, bereich, rollen, quellenart, cluster, textgrundlage, url, extra")
        .eq("quelle_id", quelleId)
        .order("pfad")
        .order("teil")
        .limit(1);
      FEHLER("Nachtrag (lesen)", error);
      const z = ((data ?? []) as unknown as ErsteZeile[])[0];
      if (!z || !z.extra) return null;
      const bereich = bereichSchluessel(z.bereich ?? "");
      const hash = text(z.extra.inhalts_hash);
      const dateiname = text(z.extra.dateiname)?.replace(/#\d{4}$/, "");
      const vonId = text(z.extra.hochgeladen_von);
      if (!istBereich(bereich) || !hash || !dateiname || !vonId || !istQuellenart(z.quellenart ?? "") || !istCluster(z.cluster ?? "") || !istTextgrundlage(z.textgrundlage ?? "")) return null;
      const seiten = seitenAngabeAus(z.extra.seiten_pruefung);
      const meta: UploadMetadaten = {
        titel: z.titel ?? dateiname,
        bereich,
        dateiname,
        typ: "txt",
        hash,
        rollen: erlaubteRollen(z.rollen ?? []) as Role[],
        hochgeladenVon: { id: vonId, name: text(z.extra.hochgeladen_von_name) },
        quellenart: z.quellenart as UploadMetadaten["quellenart"],
        cluster: z.cluster as UploadMetadaten["cluster"],
        textgrundlage: z.textgrundlage as UploadMetadaten["textgrundlage"],
        url: z.url,
        zeitpunkt: new Date().toISOString(),
        ...(seiten ? { seiten } : {}),
      };
      const { data: letzte, error: nrFehler } = await db.from("wissen_seiten_nachtrag").select("nr").eq("quelle_id", quelleId).order("nr", { ascending: false }).limit(1);
      FEHLER("Nachtrag (Nummer)", nrFehler);
      const nr = zahl(((letzte ?? []) as unknown as { nr: number }[])[0]?.nr) ?? 0;
      return { meta, paketeGesamt: zahl(z.extra.pakete_gesamt) ?? 1, naechsteNr: nr + 1 };
    },

    async findeStelle(quelleId, paket, promille) {
      const laengen: number[] = [];
      let pfad: string | null = null;
      for (let von = 0; ; von += SEITE) {
        const { data, error } = await db
          .from("wissen_chunks")
          .select("pfad, text")
          .eq("quelle_id", quelleId)
          .eq("extra->>paket", String(paket))
          .order("teil", { nullsFirst: false })
          .order("id")
          .range(von, von + SEITE - 1);
        FEHLER("Nachtrag (Paket lesen)", error);
        const zeilen = (data ?? []) as unknown as { pfad: string; text: string }[];
        for (const z of zeilen) {
          pfad ??= z.pfad;
          laengen.push(z.text.length);
        }
        if (zeilen.length < SEITE) break;
      }
      return pfad === null ? null : { pfad, davor: waehleEinfuegestelle(laengen, promille) };
    },

    async reiheEin(quelleId, pfad, ids, davor) {
      const { error } = await db.rpc("wissen_nachtrag_einreihen", { p_quelle_id: quelleId, p_pfad: pfad, p_neue: ids, p_nach: davor });
      FEHLER("Nachtrag (einreihen)", error);
    },

    async merke(quelleId, a) {
      // insert statt upsert: Haben zwei Personen gleichzeitig nachgeladen und dieselbe Nummer gezogen, scheitert die zweite (Primaerschluessel), statt den Nachtrag der ersten zu ueberschreiben.
      const { error } = await db
        .from("wissen_seiten_nachtrag")
        .insert({ quelle_id: quelleId, nr: a.nr, seiten: a.seiten, abschnitte: a.abschnitte, nachgeladen_von: a.von, nachgeladen_am: a.zeitpunkt });
      FEHLER("Nachtrag (merken)", error);
    },
  };
}
