import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, type Datenquelle } from "@/lib/supabase/config";
import type { Locale } from "@/i18n/routing";

// Mehrsprachige Kurzeinarbeitung als bebilderte Checkliste (Anforderung
// 2.12). Der Katalog (einarbeitung_schritte) ist fuer alle mit Zugriff auf
// das Modul "schulungen" sichtbar, das Abhaken (einarbeitung_fortschritt)
// ist personalisiert - nur fuer eine Picker-Anmeldung mit eigenem
// Pfluecker-Stammsatz aussagekraeftig, andere Rollen sehen den Katalog ohne
// Haekchen als Referenzmaterial.

export interface EinarbeitungSchritt {
  id: string;
  reihenfolge: number;
  icon: string;
  titel: string;
  beschreibung: string;
  erledigt: boolean;
  erledigtAm: string | null;
}

export interface EinarbeitungUebersicht {
  quelle: Datenquelle;
  schritte: EinarbeitungSchritt[];
  /** Nur eine Picker-Anmeldung mit verknuepftem Pfluecker-Stammsatz darf abhaken. */
  darfAbhaken: boolean;
}

type Mehrsprachig = Partial<Record<Locale, string>>;

function text(wert: Mehrsprachig | null, locale: Locale): string {
  if (!wert) return "";
  return wert[locale] ?? wert.de ?? Object.values(wert)[0] ?? "";
}

const demoSchritte: EinarbeitungSchritt[] = [
  {
    id: "demo-1",
    reihenfolge: 1,
    icon: "qr-code",
    titel: "Ausweis am Sammelpunkt zeigen",
    beschreibung:
      "Der Pflückerausweis wird bei jeder Steige gescannt, so bleibt jede Menge einer Person zuordenbar.",
    erledigt: false,
    erledigtAm: null,
  },
  {
    id: "demo-2",
    reihenfolge: 2,
    icon: "package",
    titel: "Steige richtig füllen",
    beschreibung:
      "Nicht über den Rand füllen. Eine überfüllte Schale drückt auf die untere Lage, die dann Saft verliert.",
    erledigt: false,
    erledigtAm: null,
  },
  {
    id: "demo-3",
    reihenfolge: 3,
    icon: "snowflake",
    titel: "Kühlkette: 60 Minuten bis zur Vorkühlung",
    beschreibung:
      "Ab dem Pflücken zählt die Uhr. Nach 60 Minuten ohne Vorkühlung gilt die Charge als Verstoß.",
    erledigt: false,
    erledigtAm: null,
  },
];

function demoUebersicht(quelle: EinarbeitungUebersicht["quelle"] = "demo"): EinarbeitungUebersicht {
  return { quelle, schritte: demoSchritte, darfAbhaken: false };
}

export async function ladeEinarbeitung(
  locale: Locale,
  pflueckerId: string | null,
): Promise<EinarbeitungUebersicht> {
  if (!isSupabaseConfigured()) return demoUebersicht();

  const supabase = await createClient();
  const { data: schritte, error } = await supabase
    .from("einarbeitung_schritte")
    .select("id, reihenfolge, icon, titel, beschreibung")
    .order("reihenfolge");

  if (error || !schritte) return demoUebersicht("fehler");

  const erledigtSet = new Set<string>();
  const erledigtAmMap = new Map<string, string>();
  if (pflueckerId) {
    const { data: fortschritt } = await supabase
      .from("einarbeitung_fortschritt")
      .select("schritt_id, erledigt_am")
      .eq("pfluecker_id", pflueckerId);
    for (const f of fortschritt ?? []) {
      erledigtSet.add(f.schritt_id);
      erledigtAmMap.set(f.schritt_id, f.erledigt_am);
    }
  }

  return {
    quelle: "db",
    darfAbhaken: pflueckerId !== null,
    schritte: schritte.map((s) => ({
      id: s.id,
      reihenfolge: s.reihenfolge,
      icon: s.icon,
      titel: text(s.titel as Mehrsprachig, locale),
      beschreibung: text(s.beschreibung as Mehrsprachig, locale),
      erledigt: erledigtSet.has(s.id),
      erledigtAm: erledigtAmMap.get(s.id) ?? null,
    })),
  };
}
