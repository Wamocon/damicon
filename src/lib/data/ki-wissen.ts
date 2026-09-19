import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, type Datenquelle } from "@/lib/supabase/config";
import { alsVektorLiteral, erzeugeEinbettung } from "@/lib/ai/einbettung-client";
import type { KiWissenChunkTreffer, KiWissenDokumentZeile } from "@/lib/domain/ki-assistent";
import type { Database } from "@/lib/database.types";

/** Rollentyp der Datenbank - p_rolle der RPC ist public.app_role, nicht text. */
type AppRolle = Database["public"]["Enums"]["app_role"];

// RAG-Ergaenzung zum KI-Assistenten (Anforderung 5.4/5.5). Eigene Datei statt
// in data/ki-assistent.ts, weil hier zusaetzlich ein Netzwerkaufruf
// (Einbettungsmodell auf Sokrates-2) dazukommt - dieselbe Trennung wie
// zwischen actions/ki-assistent.ts und ai/transkription-client.ts.

export interface KiWissenUebersicht {
  quelle: Datenquelle;
  dokumente: KiWissenDokumentZeile[];
}

export async function ladeKiWissenDokumente(): Promise<KiWissenUebersicht> {
  if (!isSupabaseConfigured()) return { quelle: "demo", dokumente: [] };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ki_wissen_dokumente")
    .select("id, titel, dateiname, kategorie, erlaubte_rollen, status, fehlermeldung, hochgeladen_am")
    .order("hochgeladen_am", { ascending: false });

  if (error || !data) return { quelle: "fehler", dokumente: [] };

  return {
    quelle: "db",
    dokumente: data.map((d) => ({
      id: d.id,
      titel: d.titel,
      dateiname: d.dateiname,
      kategorie: d.kategorie,
      erlaubteRollen: d.erlaubte_rollen,
      status: d.status,
      fehlermeldung: d.fehlermeldung,
      hochgeladenAm: d.hochgeladen_am,
    })),
  };
}

// Findet die zur Frage passendsten Dokumentabschnitte, bereits auf die Rolle
// der fragenden Person gefiltert - die Filterung passiert IN der
// Postgres-Funktion ki_wissen_aehnliche_chunks (Migration
// 20261031000000_ki_wissen_dokumente.sql), nicht hier, damit
// ki_wissen_chunks den Prozess nie ungefiltert verlaesst. p_rolle kommt
// deshalb ausschliesslich aus dem eigenen SessionProfile des Aufrufers
// (actions/ki-assistent.ts), nie aus Nutzereingabe.
//
// Wirft nie: eine nicht erreichbare Einbettung oder eine leere Wissensbasis
// bedeutet schlicht keine Treffer, kein Ausfall des ganzen Chats - dieselbe
// "kein 5xx bei Ausfall"-Regel wie bei sendeChatAnfrage().
//
// Zur p_embedding-Uebergabe: supabase-js reicht ein number[] NICHT in eine
// vector(768)-RPC durch, pgvector erwartet ueber PostgREST seine Textform.
// Deshalb alsVektorLiteral() - gegen eine lokale Supabase-Instanz und das
// Modell auf Sokrates-2 geprueft (19.09.2026): als admin wird der Testsatz
// gefunden, als kunde nicht.
export async function sucheRelevanteWissenChunks(
  frage: string,
  rolle: AppRolle,
  anzahl = 4,
): Promise<KiWissenChunkTreffer[]> {
  if (!isSupabaseConfigured()) return [];

  const einbettung = await erzeugeEinbettung(frage);
  if (!einbettung.ok) {
    console.error("[damicon] Einbettung der Frage fehlgeschlagen:", einbettung.grund);
    return [];
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ki_wissen_aehnliche_chunks", {
    p_embedding: alsVektorLiteral(einbettung.vektor),
    p_rolle: rolle,
    p_anzahl: anzahl,
  });

  if (error || !data) {
    if (error) console.error("[damicon] Aehnlichkeitssuche fehlgeschlagen:", error.message);
    return [];
  }

  return (data as { dokument_titel: string; inhalt: string; aehnlichkeit: number }[]).map((z) => ({
    dokumentTitel: z.dokument_titel,
    inhalt: z.inhalt,
    aehnlichkeit: z.aehnlichkeit,
  }));
}
