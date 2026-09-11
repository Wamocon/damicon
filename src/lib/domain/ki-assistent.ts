// KI-Assistent (Anforderung 5.4/5.5): reine Typen/Konstanten ohne Server-
// Import, wie domain/vorbestellungen.ts - Client-Formulare importieren aus
// dieser Datei, nicht aus data/ki-assistent.ts.

export const kiAnbieterTypen = ["openai_kompatibel", "anthropic"] as const;
export type KiAnbieterTyp = (typeof kiAnbieterTypen)[number];

export function istGueltigerAnbieterTyp(wert: string): wert is KiAnbieterTyp {
  return (kiAnbieterTypen as readonly string[]).includes(wert);
}

// Admin-Uebersicht - bewusst ohne api_key_chiffrat: das Chiffrat verlaesst die
// Datenbank nie in Richtung Client, auch nicht fuer einen Admin (siehe
// data/ki-assistent.ts).
export interface KiAnbieterZeile {
  id: string;
  name: string;
  anzeigeName: string;
  typ: KiAnbieterTyp;
  basisUrl: string;
  modell: string;
  aktiv: boolean;
  istStandard: boolean;
  erstelltAm: string;
}

export const kiChatRollen = ["nutzer", "assistent", "system"] as const;
export type KiChatRolle = (typeof kiChatRollen)[number];

export interface KiChatNachrichtZeile {
  id: string;
  rolle: KiChatRolle;
  inhalt: string;
  anbieterName: string | null;
  fallback: boolean;
  eskaliert: boolean;
  erstelltAm: string;
}

// Fuer die Wissensgrundlage des Chats (Masterplan: "auf freigegebenem
// Produkt-, Preis- und Verfuegbarkeitsbestand") - dieselben Preisliste-Zeilen,
// die b2b-portal-ansicht.tsx ohnehin schon anzeigt (ladePreislisten(),
// data/vorbestellungen.ts), hier nur zu einem Textblock fuer den
// System-Prompt zusammengefasst. Reine Funktion, dadurch ohne Modellaufruf
// testbar (siehe supabase/tests/ki-assistent.mjs). Nur die Felder, die diese
// Funktion tatsaechlich braucht - kein Import aus domain/vorbestellungen.ts,
// um die beiden Domains nicht querzuverdrahten.
export interface WissensPreisliste {
  name: string;
  gueltigAb: string;
  gueltigBis: string | null;
  positionen: { sorte: string; preisTengeKg: number; minMengeKg: number }[];
}

const MAX_PREISLISTEN_IM_KONTEXT = 3;

// Bewusst offen (adversarischer Review): Namen/Sortenbezeichnungen fliessen
// ungefiltert in den System-Prompt ein. Vertrauensgrenze ist dieselbe wie bei
// den Preislisten selbst - nur admin/betriebsleitung/buchhaltung duerfen sie
// anlegen (crud("sortenkatalog")/crud("b2b_portal") in rbac.ts), kein
// Kunden-Eingabefeld. Eine Prompt-Injection ueber diesen Weg braeuchte einen
// bereits kompromittierten oder unachtsam befuellten Bueroaccount - dasselbe
// Vertrauensniveau, das das Projekt an anderer Stelle (z. B. Foerdermittel-
// Notizen) ebenfalls voraussetzt, hier nicht eigens neu abgesichert.
export function baueWissensKontext(preislisten: WissensPreisliste[]): string {
  if (preislisten.length === 0) {
    return "Es liegt aktuell keine freigegebene Preisliste vor. Weise auf Nachfrage darauf hin, statt Preise zu schaetzen.";
  }

  const zeilen = preislisten.slice(0, MAX_PREISLISTEN_IM_KONTEXT).flatMap((liste) => {
    const kopf = `Preisliste "${liste.name}" (gueltig ab ${liste.gueltigAb}${
      liste.gueltigBis ? `, bis ${liste.gueltigBis}` : ""
    }):`;
    const positionen = liste.positionen.map(
      (p) => `- ${p.sorte}: ${p.preisTengeKg} Tenge/kg, Mindestmenge ${p.minMengeKg} kg`,
    );
    return [kopf, ...positionen];
  });

  return zeilen.join("\n");
}

// Systemanweisung, die den Chat auf die freigegebenen Daten beschraenkt
// (Masterplan-Formulierung woertlich uebernommen: "auf freigegebenem Produkt-,
// Preis- und Verfuegbarkeitsbestand"). Zentral an einer Stelle, damit sie
// unabhaengig vom gewaehlten Anbieter identisch bleibt.
export function baueSystemPrompt(wissenKontext: string): string {
  return [
    "Du bist der Kunden-Assistent von Damicon, einem Himbeerenbetrieb in Kasachstan.",
    "Beantworte ausschliesslich Fragen zu Sorten, Preisen und Bestellungen, gestuetzt auf die folgenden freigegebenen Daten. Erfinde keine Preise, Mengen oder Termine.",
    "Wenn eine Frage sich nicht aus den folgenden Daten beantworten laesst, sage das offen und verweise auf das Buero.",
    "Antworte kurz, sachlich und in der Sprache der Frage.",
    "",
    "Freigegebene Daten:",
    wissenKontext,
  ].join("\n");
}

// Deterministische Ausweichantwort (Masterplan: "kein 5xx bei Ausfall") - kein
// Modellaufruf, kein Netzwerk, immer verfuegbar. Der Aufrufer waehlt per
// Uebersetzungsschluessel die passende Sprachversion; dieser Schluessel selbst
// ist reine Logik und deshalb hier statt in der Server Action.
export const KI_FALLBACK_SCHLUESSEL = "kiAssistentAnsicht.fallback.antwort" as const;

// Anforderung 5.5: nach wiederholtem Fallback in Folge automatisch eskalieren,
// statt den Nutzer beliebig oft an einer nicht antwortenden KI abprallen zu
// lassen. Reine Zaehlfunktion auf dem bereits geladenen Verlauf.
export function sollteAutomatischEskalieren(
  letzteNachrichten: Pick<KiChatNachrichtZeile, "rolle" | "fallback">[],
  schwelle = 2,
): boolean {
  const assistentenantworten = letzteNachrichten.filter((n) => n.rolle === "assistent");
  const letzte = assistentenantworten.slice(-schwelle);
  return letzte.length >= schwelle && letzte.every((n) => n.fallback);
}
