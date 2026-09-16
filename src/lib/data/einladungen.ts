import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, type Datenquelle } from "@/lib/supabase/config";
import { demoEinladungen, type Einladung, type EinladungStatus } from "@/lib/domain/einladungen";
import { einsAus } from "@/lib/data/util";

// Kundenzugang ueber Einladung (Anforderung E.20). Welche Zeilen zurueckkommen,
// entscheidet allein RLS: die Policies der Migration 20261002000000 geben die
// Tabelle nur an admin und betriebsleitung frei. Diese Datei filtert deshalb
// nicht selbst nach Rolle - sie liest, was die Datenbank herausgibt.
//
// Der code_digest wird bewusst nicht selektiert. Er ist zwar ein Hash und damit
// nicht zurueckrechenbar, hat in einem RSC-Payload aber nichts verloren: die
// Oberflaeche braucht ihn nie.

export interface EinladungenListe {
  quelle: Datenquelle;
  einladungen: Einladung[];
  /** B2B-Kunden fuer das Auswahlfeld im Einladungsformular. */
  kunden: { id: string; name: string }[];
  /** Gesamtzahl in der Datenbank - kann groesser sein als die geladene Liste. */
  gesamt: number;
}

// Eingeloeste und zurueckgezogene Einladungen werden nie aufgeraeumt, der
// Bestand waechst also nur. Ohne Obergrenze wuerde die Seite irgendwann
// tausende Zeilen laden; mit reiner Sortierung nach Datum verdraengten die
// alten Karteileichen genau die offenen, die noch Handlung brauchen - und der
// Zurueckziehen-Knopf haengt allein an dieser Liste. Deshalb: offene zuerst
// (die Enum-Reihenfolge ist offen, eingeloest, zurueckgezogen), innerhalb
// dessen die neuesten, und die Gesamtzahl daneben, damit eine Kuerzung
// sichtbar ist statt still.
const LISTEN_GRENZE = 100;

interface EinladungZeile {
  id: string;
  email: string;
  full_name: string;
  status: EinladungStatus;
  gueltig_bis: string;
  created_at: string;
  eingeloest_am: string | null;
  b2b_kunde_id: string;
  b2b_kunden: { name: string } | { name: string }[] | null;
  erstellt_von: { full_name: string } | { full_name: string }[] | null;
}

function demoListe(quelle: Datenquelle): EinladungenListe {
  return {
    quelle,
    einladungen: demoEinladungen,
    kunden: demoEinladungen.map((e) => ({ id: e.kundeId, name: e.kunde })),
    gesamt: demoEinladungen.length,
  };
}

export async function ladeEinladungen(): Promise<EinladungenListe> {
  if (!isSupabaseConfigured()) return demoListe("demo");

  const supabase = await createClient();

  const [einladungenAntwort, kundenAntwort] = await Promise.all([
    supabase
      .from("kundeneinladungen")
      .select(
        `id, email, full_name, status, gueltig_bis, created_at, eingeloest_am,
         b2b_kunde_id,
         b2b_kunden ( name ),
         erstellt_von:profiles!kundeneinladungen_erstellt_von_profil_id_fkey ( full_name )`,
        { count: "exact" },
      )
      .order("status", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(LISTEN_GRENZE),
    supabase.from("b2b_kunden").select("id, name").order("name"),
  ]);

  // Fehler heisst hier nicht "keine Daten": das Modul liegt hinter einer
  // Rollenpruefung, ein Fehler waere ein echter Ausfall. Der Badge muss ihn
  // sichtbar machen, statt still auf Beispieldaten zu wechseln.
  if (einladungenAntwort.error) {
    console.error("[damicon] Einladungen konnten nicht geladen werden:", einladungenAntwort.error.message);
    return { quelle: "fehler", einladungen: [], kunden: [], gesamt: 0 };
  }

  const zeilen = (einladungenAntwort.data ?? []) as unknown as EinladungZeile[];

  // Auch die Kundenliste muss geladen sein: ohne sie ist das Auswahlfeld im
  // Ausstellungsformular leer und "required", das Buero kann also nichts
  // ausstellen - und der Badge behauptete weiter "Live-Daten". Derselbe
  // Gedanke wie oben, nur fuer die zweite Abfrage.
  if (kundenAntwort.error) {
    console.error("[damicon] B2B-Kunden konnten nicht geladen werden:", kundenAntwort.error.message);
    return { quelle: "fehler", einladungen: [], kunden: [], gesamt: 0 };
  }

  return {
    quelle: "db",
    einladungen: zeilen.map((zeile) => ({
      id: zeile.id,
      kunde: einsAus(zeile.b2b_kunden)?.name ?? "-",
      kundeId: zeile.b2b_kunde_id,
      email: zeile.email,
      fullName: zeile.full_name,
      status: zeile.status,
      gueltigBis: zeile.gueltig_bis,
      erstelltVon: einsAus(zeile.erstellt_von)?.full_name ?? null,
      erstelltAm: zeile.created_at,
      eingeloestAm: zeile.eingeloest_am,
    })),
    kunden: kundenAntwort.data ?? [],
    gesamt: einladungenAntwort.count ?? zeilen.length,
  };
}
