import type { SupabaseClient } from "@supabase/supabase-js";
import { SCHREIB_BATCH, type FreigabeInfo, type WissenSpeicher } from "@/lib/wissen/hochladen";
import { istUploadZeile, UPLOAD_QUELLE, UPLOAD_QUELLE_MUSTER } from "@/lib/wissen/upload-quelle";

// Der Speicher des Wissens-Uploads auf dem service_role-Client. Die Logik steht in hochladen.ts und loeschen.ts und
// kennt nur die Schnittstelle WissenSpeicher; hier steht allein, wie sie mit PostgREST gesprochen wird. Getrennt von
// hochladen.ts, damit diese Datei einzeln gegen eine echte Datenbank geprueft werden kann
// (supabase/tests/wissen-upload-db.ts) und die Logik ohne Supabase-Abhaengigkeit testbar bleibt.

const SCHREIB_FEHLER = (was: string, e: { message: string } | null) => {
  if (e) throw new Error(`${was}: ${e.message}`);
};

// PostgREST liefert je Abfrage hoechstens 1.000 Zeilen. Ein Buch hat leicht mehr Abschnitte: Zahlen kommen deshalb aus
// Zaehlabfragen (count), nicht aus der Laenge einer Antwort, und alles, was ein ganzes Dokument betrifft, laeuft in Seiten.
const SEITE = 1000;
const LOESCH_STAPEL = 300;

/** Speicher auf dem service_role-Client. Schreiben darf in wissen_chunks/wissen_begriffe nur der Dienst (RLS). */
export function supabaseSpeicher(db: SupabaseClient): WissenSpeicher {
  return {
    async findeQuelle(quelleId) {
      const { data, error } = await db.from("wissen_chunks").select("titel").eq("quelle_id", quelleId).limit(1);
      SCHREIB_FEHLER("Dublettenpruefung", error);
      const zeile = data?.[0] as { titel: string | null } | undefined;
      return zeile ? { titel: zeile.titel } : null;
    },
    async schreibeChunks(zeilen) {
      for (let i = 0; i < zeilen.length; i += SCHREIB_BATCH) {
        const { error } = await db.from("wissen_chunks").upsert(zeilen.slice(i, i + SCHREIB_BATCH), { onConflict: "id" });
        SCHREIB_FEHLER("wissen_chunks", error);
      }
    },
    async loescheQuelle(quelleId) {
      const { error } = await db.from("wissen_chunks").delete().eq("quelle_id", quelleId);
      SCHREIB_FEHLER("Aufraeumen", error);
    },
    async leseDokumenthaeufigkeit(indizes) {
      const aus = new Map<number, number>();
      for (let i = 0; i < indizes.length; i += 500) {
        const { data, error } = await db.from("wissen_begriffe").select("hash, df").in("hash", indizes.slice(i, i + 500));
        SCHREIB_FEHLER("wissen_begriffe (lesen)", error);
        for (const r of (data ?? []) as { hash: number; df: number }[]) aus.set(r.hash, r.df);
      }
      return aus;
    },
    async schreibeBegriffe(zeilen) {
      for (let i = 0; i < zeilen.length; i += 2000) {
        const { error } = await db.from("wissen_begriffe").upsert(zeilen.slice(i, i + 2000), { onConflict: "hash" });
        SCHREIB_FEHLER("wissen_begriffe", error);
      }
    },
    async zaehleChunks() {
      const { count, error } = await db.from("wissen_chunks").select("id", { count: "exact", head: true });
      SCHREIB_FEHLER("Zaehlung", error);
      return count ?? 0;
    },
    async ladeQuellenInfo(quelleId) {
      const zaehle = async (bedingung: boolean) => {
        let q = db.from("wissen_chunks").select("id", { count: "exact", head: true }).eq("quelle_id", quelleId);
        if (bedingung) q = q.like("quelle_id", UPLOAD_QUELLE_MUSTER).eq("extra->>quelle", UPLOAD_QUELLE);
        const { count, error } = await q;
        SCHREIB_FEHLER("Loeschen (zaehlen)", error);
        return count ?? 0;
      };
      const [anzahl, upload] = await Promise.all([zaehle(false), zaehle(true)]);
      const { data, error } = await db.from("wissen_chunks").select("titel, bereich").eq("quelle_id", quelleId).limit(1);
      SCHREIB_FEHLER("Loeschen (lesen)", error);
      const erste = (data ?? [])[0] as { titel: string | null; bereich: string | null } | undefined;
      return { anzahl, fremd: anzahl - upload, titel: erste?.titel ?? null, bereich: erste?.bereich ?? null };
    },
    async loescheUpload(quelleId) {
      // In Stapeln: Ein Buch hat tausende Zeilen, und die Antwort einer einzigen DELETE-Anweisung waere auf 1.000 Zeilen gekappt
      // und riesig (jede Zeile bringt ihren Vektor mit). Beide Bedingungen (Upload-Marker, quelle_id) stehen in jeder Anweisung.
      // RETURNING liefert nur, was dieser Aufruf wirklich geloescht hat: wer zweimal loescht, bekommt beim zweiten Mal nichts.
      const sparse: string[] = [];
      for (;;) {
        const { data: ids, error: leseFehler } = await db
          .from("wissen_chunks")
          .select("id")
          .eq("quelle_id", quelleId)
          .like("quelle_id", UPLOAD_QUELLE_MUSTER)
          .eq("extra->>quelle", UPLOAD_QUELLE)
          .limit(LOESCH_STAPEL);
        SCHREIB_FEHLER("Loeschen (Stapel lesen)", leseFehler);
        const liste = ((ids ?? []) as unknown as { id: string }[]).map((z) => z.id);
        if (liste.length === 0) break;
        const { data, error } = await db
          .from("wissen_chunks")
          .delete()
          .in("id", liste)
          .eq("quelle_id", quelleId)
          .like("quelle_id", UPLOAD_QUELLE_MUSTER)
          .eq("extra->>quelle", UPLOAD_QUELLE)
          .select("sparse");
        SCHREIB_FEHLER("Loeschen", error);
        const geloescht = (data ?? []) as unknown as { sparse: unknown }[];
        sparse.push(...geloescht.map((z) => String(z.sparse)));
        if (geloescht.length === 0) break;
      }
      return sparse;
    },
    async loescheBegriffe(indizes) {
      for (let i = 0; i < indizes.length; i += 500) {
        const { error } = await db.from("wissen_begriffe").delete().in("hash", indizes.slice(i, i + 500));
        SCHREIB_FEHLER("wissen_begriffe (loeschen)", error);
      }
    },

    // ---- Freigabe (Vier-Augen-Prinzip, siehe freigabe.ts) ----
    async ladeFreigabeInfo(quelleId) {
      const zaehle = async (bedingung: (q: ReturnType<typeof basis>) => ReturnType<typeof basis>) => {
        const { count, error } = await bedingung(basis());
        SCHREIB_FEHLER("Freigabe (zaehlen)", error);
        return count ?? 0;
      };
      const basis = () => db.from("wissen_chunks").select("id", { count: "exact", head: true }).eq("quelle_id", quelleId);
      const [anzahl, upload, ungeprueft, freigegeben, abgelehnt] = await Promise.all([
        zaehle((q) => q),
        zaehle((q) => q.like("quelle_id", UPLOAD_QUELLE_MUSTER).eq("extra->>quelle", UPLOAD_QUELLE)),
        zaehle((q) => q.eq("pruefstatus", "ungeprueft")),
        zaehle((q) => q.eq("pruefstatus", "freigegeben")),
        zaehle((q) => q.eq("pruefstatus", "abgelehnt")),
      ]);
      const status: FreigabeInfo["pruefstatus"] =
        anzahl === 0 ? null : ungeprueft === anzahl ? "ungeprueft" : freigegeben === anzahl ? "freigegeben" : abgelehnt === anzahl ? "abgelehnt" : "gemischt";
      const { data, error } = await db
        .from("wissen_chunks")
        .select("titel, bereich, quellenart, pruefen_bis, hochgeladen_von:extra->>hochgeladen_von")
        .eq("quelle_id", quelleId)
        .limit(1);
      SCHREIB_FEHLER("Freigabe (lesen)", error);
      const erste = ((data ?? []) as unknown as Array<{ titel: string | null; bereich: string | null; quellenart: string | null; pruefen_bis: string | null; hochgeladen_von: string | null }>)[0];

      // Vollstaendigkeit eines Buchs: Welche Paketnummern gibt es, und wie viele sollten es sein? In Seiten gelesen, nur die zwei kleinen Felder.
      const nummern = new Set<number>();
      let gesamt = 0;
      for (let von = 0; von < anzahl; von += SEITE) {
        const { data: seite, error: seitenFehler } = await db
          .from("wissen_chunks")
          .select("paket:extra->>paket, gesamt:extra->>pakete_gesamt")
          .eq("quelle_id", quelleId)
          .order("id")
          .range(von, von + SEITE - 1);
        SCHREIB_FEHLER("Freigabe (Pakete)", seitenFehler);
        for (const z of (seite ?? []) as unknown as { paket: string | null; gesamt: string | null }[]) {
          if (z.paket !== null && z.paket !== undefined) nummern.add(Number(z.paket));
          if (z.gesamt) gesamt = Math.max(gesamt, Number(z.gesamt));
        }
      }
      return {
        anzahl,
        fremd: anzahl - upload,
        titel: erste?.titel ?? null,
        bereich: erste?.bereich ?? null,
        quellenart: erste?.quellenart ?? null,
        pruefstatus: status,
        hochgeladenVon: erste?.hochgeladen_von ?? null,
        pruefenBis: erste?.pruefen_bis ?? null,
        unvollstaendig: gesamt > 0 && nummern.size < gesamt,
      };
    },
    async entscheide(quelleId, a) {
      // Eine Anweisung: alle Zeilen des Dokuments oder keine. Marker und Status stehen noch einmal im Filter; der Waechter
      // der Datenbank lehnt die Freigabe durch die hochladende Person selbst dann ab, wenn hier ein Fehler stuende.
      const { count, error } = await db
        .from("wissen_chunks")
        .update({ pruefstatus: a.status, geprueft_von: a.pruefer, geprueft_am: a.zeitpunkt, pruefen_bis: a.pruefenBis }, { count: "exact" })
        .eq("quelle_id", quelleId)
        .like("quelle_id", UPLOAD_QUELLE_MUSTER)
        .eq("extra->>quelle", UPLOAD_QUELLE)
        .eq("pruefstatus", "ungeprueft");
      SCHREIB_FEHLER("Freigabe", error);
      return count ?? 0;
    },
    async verlaengere(quelleId, a) {
      const { count, error } = await db
        .from("wissen_chunks")
        .update({ geprueft_von: a.pruefer, geprueft_am: a.zeitpunkt, pruefen_bis: a.pruefenBis }, { count: "exact" })
        .eq("quelle_id", quelleId)
        .like("quelle_id", UPLOAD_QUELLE_MUSTER)
        .eq("extra->>quelle", UPLOAD_QUELLE)
        .eq("pruefstatus", "freigegeben")
        .not("pruefen_bis", "is", null);
      SCHREIB_FEHLER("Verlaengerung", error);
      return count ?? 0;
    },
    async ladeVorschau(quelleId, maxZeichen) {
      // Drei Stichproben statt nur des Anfangs: Bei einem Buch sagt das Titelblatt nichts ueber die Qualitaet der Mitte oder des Endes.
      // Geordnet nach Pfad (enthaelt die Paketnummer) und Abschnitt, also in Lesereihenfolge.
      const { count, error: zaehlFehler } = await db.from("wissen_chunks").select("id", { count: "exact", head: true }).eq("quelle_id", quelleId);
      SCHREIB_FEHLER("Vorschau (zaehlen)", zaehlFehler);
      const n = count ?? 0;
      if (n === 0) return "";
      const stellen = n <= 4 ? Array.from({ length: n }, (_, i) => i) : [0, 1, Math.floor(n / 2), n - 1];
      const stuecke: string[] = [];
      for (const i of stellen) {
        const { data, error } = await db.from("wissen_chunks").select("text").eq("quelle_id", quelleId).order("pfad").order("teil").range(i, i);
        SCHREIB_FEHLER("Vorschau", error);
        const text = String(((data ?? []) as unknown as { text: string }[])[0]?.text ?? "");
        if (text) stuecke.push(text);
      }
      const je = Math.max(200, Math.floor(maxZeichen / Math.max(1, stuecke.length)));
      const gekuerzt = stuecke.map((t) => (t.length > je ? `${t.slice(0, je).trimEnd()} ...` : t));
      return n <= 4 ? gekuerzt.join("\n\n") : gekuerzt.join("\n\n[...]\n\n");
    },
  };
}
