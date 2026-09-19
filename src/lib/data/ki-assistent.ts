import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, type Datenquelle } from "@/lib/supabase/config";
import { ladePreislisten } from "@/lib/data/vorbestellungen";
import { getSessionProfile } from "@/lib/auth";
import type {
  KiAnbieterZeile,
  KiChatNachrichtZeile,
  WissensPreisliste,
} from "@/lib/domain/ki-assistent";

// KI-Assistent (Anforderung 5.4/5.5). Wie ueberall im Projekt: ohne
// Supabase-Umgebung liefert diese Schicht Beispieldaten statt eines Fehlers
// (server-module-views.tsx gilt "in beiden Betriebsarten").

const MAX_VERLAUF = 30;

// --- Anbieterliste (nur Admin - RLS filtert alles andere ohnehin auf leer) --

export interface KiAnbieterUebersicht {
  quelle: Datenquelle;
  anbieter: KiAnbieterZeile[];
}

export async function ladeKiAnbieterListe(): Promise<KiAnbieterUebersicht> {
  if (!isSupabaseConfigured()) return { quelle: "demo", anbieter: [] };

  const supabase = await createClient();
  // api_key_chiffrat bewusst nicht selektiert - das Chiffrat verlaesst die
  // Datenbank nie in Richtung Client, auch nicht fuer einen Admin.
  const { data, error } = await supabase
    .from("ki_anbieter")
    .select("id, name, anzeige_name, typ, basis_url, modell, aktiv, ist_standard, erstellt_am")
    .order("erstellt_am", { ascending: false });

  if (error || !data) return { quelle: "fehler", anbieter: [] };

  return {
    quelle: "db",
    anbieter: data.map((a) => ({
      id: a.id,
      name: a.name,
      anzeigeName: a.anzeige_name,
      typ: a.typ,
      basisUrl: a.basis_url,
      modell: a.modell,
      aktiv: a.aktiv,
      istStandard: a.ist_standard,
      erstelltAm: a.erstellt_am,
    })),
  };
}

// --- Chatverlauf -------------------------------------------------------------

const demoVerlauf: KiChatNachrichtZeile[] = [
  {
    id: "demo-1",
    rolle: "nutzer",
    inhalt: "Welche Sorten sind diese Woche verfuegbar?",
    anbieterName: null,
    fallback: false,
    eskaliert: false,
    erstelltAm: new Date(0).toISOString(),
    werkzeugaufrufe: null,
  },
  {
    id: "demo-2",
    rolle: "assistent",
    inhalt:
      "Aktuell gefuehrt sind Polka und Tulameen, jeweils gemaess der freigegebenen Preisliste. Fuer eine verbindliche Menge zum Wunschtermin wenden Sie sich am besten zusaetzlich ans Buero.",
    anbieterName: "Demo",
    fallback: false,
    eskaliert: false,
    erstelltAm: new Date(0).toISOString(),
    werkzeugaufrufe: null,
  },
];

export interface KiChatVerlauf {
  quelle: Datenquelle;
  nachrichten: KiChatNachrichtZeile[];
}

export async function ladeKiChatVerlauf(): Promise<KiChatVerlauf> {
  if (!isSupabaseConfigured()) return { quelle: "demo", nachrichten: demoVerlauf };

  // Explizit auf die eigene profil_id filtern, NICHT nur auf RLS verlassen
  // (Live-Test-Fund): ki_chat_nachrichten_select_buero erlaubt einem
  // Buero-Profil zusaetzlich ALLE Zeilen zu sehen, RLS-Policies wirken
  // additiv (ODER-verknuepft) - ein ungefilterter Select haette einer
  // Betriebsleitung in ihrem EIGENEN Chatfenster faelschlich die Gespraeche
  // sämtlicher Kunden vermischt angezeigt, ununterscheidbar vom eigenen
  // Verlauf. Diese Funktion bleibt bewusst die persoenliche
  // "Ich chatte mit der KI"-Ansicht fuer jede Rolle; eine separate
  // Buero-Einsichtnahme über mehrere Kunden hinweg (aus demselben
  // RLS-Zugriff heraus technisch moeglich) ist eine eigene, hier noch nicht
  // gebaute Ansicht.
  const profil = await getSessionProfile();
  if (!profil) return { quelle: "fehler", nachrichten: [] };

  const supabase = await createClient();
  //
  // Absteigend sortiert + limitiert, danach in JS wieder aufsteigend gedreht:
  // aufsteigend sortieren UND limitieren haette (adversarischer Review-Fund)
  // dauerhaft die AELTESTEN MAX_VERLAUF Zeilen geliefert statt der letzten -
  // sowohl die Chat-Anzeige als auch der an das Modell uebergebene Kontext
  // (actions/ki-assistent.ts) waeren ab dem Ueberschreiten des Limits auf
  // einem eingefrorenen Alt-Verlauf haengengeblieben, ebenso die automatische
  // Eskalationspruefung (sollteAutomatischEskalieren).
  const { data, error } = await supabase
    .from("ki_chat_nachrichten")
    .select("id, rolle, inhalt, anbieter_name, fallback, eskaliert, erstellt_am, werkzeugaufrufe")
    .eq("profil_id", profil.id)
    .order("erstellt_am", { ascending: false })
    .limit(MAX_VERLAUF);

  if (error || !data) return { quelle: "fehler", nachrichten: [] };

  return {
    quelle: "db",
    nachrichten: data
      .map((n) => ({
        id: n.id,
        rolle: n.rolle as KiChatNachrichtZeile["rolle"],
        inhalt: n.inhalt,
        anbieterName: n.anbieter_name,
        fallback: n.fallback,
        eskaliert: n.eskaliert,
        erstelltAm: n.erstellt_am,
        werkzeugaufrufe: (n.werkzeugaufrufe as string[] | null) ?? null,
      }))
      .reverse(),
  };
}

// --- Wissensgrundlage (freigegebene Preisliste) ------------------------------
// Wiederverwendet ladePreislisten() (data/vorbestellungen.ts) statt eines
// eigenen Selects auf dieselben Tabellen - genau die Zeilen, die
// b2b-portal-ansicht.tsx ohnehin schon anzeigt, nur auf die drei Felder
// reduziert, die baueWissensKontext() (domain/ki-assistent.ts) braucht.

export async function ladeWissensPreislisten(): Promise<WissensPreisliste[]> {
  const preislisten = await ladePreislisten();
  return preislisten.map((p) => ({
    name: p.name,
    gueltigAb: p.gueltigAb,
    gueltigBis: p.gueltigBis,
    positionen: p.positionen.map((pos) => ({
      sorte: pos.sorte,
      preisTengeKg: pos.preisTengeKg,
      minMengeKg: pos.minMengeKg,
    })),
  }));
}
