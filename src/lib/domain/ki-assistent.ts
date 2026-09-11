// KI-Assistent (Anforderung 5.4/5.5): reine Typen/Konstanten ohne Server-
// Import, wie domain/vorbestellungen.ts - Client-Formulare importieren aus
// dieser Datei, nicht aus data/ki-assistent.ts. Bewusst OHNE Import aus
// rbac.ts (auch nicht relativ): ein "@/..."-Alias loest unter dem einfachen
// Node, mit dem supabase/tests/ki-assistent.mjs diese Datei ausfuehrt, nicht
// auf, ein expliziter ".ts"-Pfad wiederum scheitert an tsc
// ("allowImportingTsExtensions" ist nicht aktiviert). Deshalb nimmt
// wissensQuellenFuerRolle() unten bereits fertig ausgewertete Faehigkeiten
// entgegen - die eigentliche rbac.ts-Abfrage (hasPermission) macht der
// Aufrufer (actions/ki-assistent.ts), wo der "@/..."-Alias unter Next.js
// ganz normal funktioniert.

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
// unabhaengig vom gewaehlten Anbieter identisch bleibt. Bewusst rollenneutral
// formuliert (nicht mehr "Sorten, Preisen und Bestellungen"): welche Themen
// tatsaechlich beantwortbar sind, ergibt sich allein daraus, was im
// uebergebenen Kontext steht - siehe wissensQuellenFuerRolle() unten.
export function baueSystemPrompt(wissenKontext: string): string {
  return [
    "Du bist der Assistent von Damicon, einem Himbeerenbetrieb in Kasachstan.",
    "Beantworte ausschliesslich Fragen, die sich aus den folgenden freigegebenen Daten und Regeln beantworten lassen. Erfinde keine Preise, Mengen, Termine oder Regeln, die dort nicht stehen.",
    "Wenn eine Frage sich nicht daraus beantworten laesst - auch wenn du die Antwort aus anderem Wissen zu kennen glaubst - sage das offen und verweise auf das Buero.",
    "Antworte kurz, sachlich und in der Sprache der Frage.",
    "",
    "Freigegebene Daten und Regeln:",
    wissenKontext,
  ].join("\n");
}

// --- Rollenbasierte Wissensgrundlage -----------------------------------------
// Nutzer-Anforderung, ergaenzend zum Masterplan-Text: ein Feldarbeiter darf
// den Chat nutzen, darf aber keine Finanz-, Lohn- oder Admin-Daten im
// Antwortkontext bekommen, selbst wenn danach gefragt wird. Die uebliche,
// sichere Umsetzung (siehe Erlaeuterung an den Nutzer) ist NICHT, dem Modell
// per Prompt zu verbieten, ueber bestimmte Themen zu reden - ein Prompt ist
// keine Zugriffsgrenze, ein hartnaeckig oder geschickt formulierter Nutzer
// kann ihn umgehen. Stattdessen bekommt das Modell die sensiblen Daten
// schlicht NIE in seinen Kontext, wenn die anfragende Rolle dafuer keine
// Berechtigung hat - dieselbe Instanz von hasPermission()/rbac.ts, die auch
// jedes andere Modul verwendet, keine zweite, separat zu pflegende
// Zugriffsliste fuer den Chat.
export type WissensQuelle = "preisliste" | "feldregeln";

/** Reine Umsetzung fertig ausgewerteter Faehigkeiten in Wissensquellen - die
 *  eigentliche rbac.ts-Abfrage steht beim Aufrufer, siehe Kommentar oben. */
export function wissensQuellenFuerFaehigkeiten(faehigkeiten: {
  /** Dieselbe Berechtigung, die auch das B2B-Portal bzw. den Sortenkatalog
   *  freischaltet (betriebsleitung/buchhaltung/admin/erzeuger/kunde - nicht
   *  brigade/picker). */
  siehtProdukteUndPreise: boolean;
  /** Dieselbe Berechtigung, die auch Zugriff auf Pflueckaufgaben/Kuehlkette
   *  gibt (brigade/admin - nicht kunde/buchhaltung). */
  siehtFeldbetrieb: boolean;
}): WissensQuelle[] {
  const quellen: WissensQuelle[] = [];
  if (faehigkeiten.siehtProdukteUndPreise) quellen.push("preisliste");
  if (faehigkeiten.siehtFeldbetrieb) quellen.push("feldregeln");
  return quellen;
}

// Bewusst statischer Text, keine Live-Datenbankabfrage: allgemeine,
// nicht-personenbezogene Verfahrensregeln aus dem Feld-Betrieb, dieselben
// Regeln, die an anderer Stelle im Code als Kommentar/Constraint stehen
// (20260905140000_pflueckaufgabe_sperre.sql, transport_kuehlkette_bewerten()).
// Kein Risiko, versehentlich echte Kunden-, Preis- oder Personendaten
// preiszugeben, weil hier schlicht keine aus der Datenbank gelesen werden -
// bewusst der risikoaermste erste Ausbauschritt fuer die Feld-Rollen, ein
// Anschluss an die eigenen, aktuellen Aufgaben/den Rotationsplan waere der
// naechste, hier noch nicht gebaute Schritt.
export function baueFeldregelnKontext(): string {
  return [
    "Allgemeine Verfahrensregeln im Feld (keine Kunden-, Preis- oder Personendaten):",
    "- Zwischen dem Pfluecken einer Steige und der Vorkuehlung duerfen hoechstens 60 Minuten liegen.",
    "- Nach einer Pflanzenschutzbehandlung ist der betroffene Reihenblock bis zum Ablauf der angegebenen Wartezeit gesperrt, keine Pflueckaufgabe moeglich.",
    "- Fotobeleg der Verkaufsschale ist bei jeder Pflueckaufgabe Pflicht.",
    "- Bei Fragen zu Lohn, Personal oder Finanzen: nicht beantworten, an das Buero verweisen.",
  ].join("\n");
}

/** Kombiniert die fuer eine Rolle zulaessigen Wissensquellen zu einem
 *  Kontext-Text. Leere quellen[] (z. B. picker) ergibt einen expliziten
 *  Hinweistext statt eines leeren Strings - baueSystemPrompt() soll nie mit
 *  einem inhaltsleeren "Freigegebene Daten und Regeln:"-Abschnitt enden. */
export function baueGesamtWissenskontext(
  quellen: WissensQuelle[],
  preislisten: WissensPreisliste[],
): string {
  const teile = quellen.map((quelle) =>
    quelle === "preisliste" ? baueWissensKontext(preislisten) : baueFeldregelnKontext(),
  );
  if (teile.length === 0) {
    return "Fuer diese Rolle liegt keine Wissensgrundlage vor. Beantworte keine fachliche Frage, verweise auf das Buero.";
  }
  return teile.join("\n\n");
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
