// Ratenbegrenzung fuer kostenpflichtige KI-Aufrufe (Chat-Nachricht,
// Agentenzug, Sprachausgabe). Vibecode-Cleanup-Fund (Phase 2, kritische
// Stabilisierung): jede Rolle mit "ki_assistent:create" - auch "kunde"
// (externe Kundschaft, siehe rbac.ts) - konnte bisher beliebig oft einen
// echten, kostenpflichtigen Modell- bzw. Sprachdienstaufruf ausloesen, im
// Agent-Modus mit bis zu 28 Modellschritten je Zug (api/ki-assistent/
// route.ts). Kein Zugriff auf fremde Daten, aber ein klares
// Kostenmissbrauchsrisiko. Eingesetzt in actions/ki-assistent.ts
// (kiNachrichtSenden), api/ki-assistent/route.ts und api/ki-sprachausgabe/
// route.ts.
//
// Zwei getrennte Verantwortlichkeiten in dieser Datei:
//   1. ladeRatenlimitGrenze() - liest den admin-konfigurierten GRENZWERT aus
//      der Datenbank (Tabelle ki_ratenlimit_einstellungen, Migration
//      20261110010000, Verwaltungsoberflaeche in den KI-Einstellungen,
//      KiRatenlimitVerwaltung in components/db/ki-assistent-formulare.tsx).
//      Auf ausdruecklichen Wunsch admin-konfigurierbar statt einer fest
//      codierten Konstante: OHNE jede Admin-Einstellung gilt ausdruecklich
//      KEIN Limit, kein stiller Rueckfall auf einen Code-Standardwert.
//   2. ratenlimitUeberschritten() - zaehlt tatsaechliche Aufrufe gegen diesen
//      Grenzwert, ein einfacher In-Memory-Zaehler auf Modulebene. Bewusst
//      KEINE neue Tabelle fuer den Zaehlerstand selbst: Migrationen gegen die
//      gemeinsam genutzte Cloud-Datenbank duerfen in diesem Projekt nur nach
//      ausdruecklicher Anweisung gepusht werden (Projektregel), und ein
//      Zaehlerstand, der bei jedem Aufruf geschrieben wuerde, waere ohnehin
//      die falsche Art von Last fuer eine Tabelle. Dieser Zaehler ist die
//      sofort wirksame erste Absicherung, kein Ersatz fuer eine robustere
//      spaetere Loesung.
//
// Bekannte Einschraenkung des Zaehlers, ehrlich benannt: bei mehreren
// gleichzeitigen Serverless-Instanzen (Vercel) hat jede Instanz ihren eigenen
// Modulzustand - der Zaehler ist deshalb NICHT global ueber alle Instanzen
// hinweg konsistent. Eine Person koennte eine gesetzte Grenze bei mehreren
// parallel kalten Instanzen theoretisch mehrfach ausschoepfen. Ein
// instanzuebergreifender Zaehler (Datenbank oder Redis) waere die robustere,
// spaetere Loesung - hier bewusst nicht gebaut, um keine neue
// Migration/Infrastruktur einzufuehren, nur um den Zaehlerstand selbst
// abzulegen.

import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/rbac";

// --- 1. Admin-konfigurierter Grenzwert (Datenbank) ---------------------------

/**
 * Loest die fuer eine Rolle geltende Grenze auf: eigene Rollenzeile zuerst
 * (auch wenn ihr grenze_pro_minute NULL ist - das ist ein bewusster
 * Sonderfall "kein Limit fuer GENAU DIESE Rolle", etwas anderes als gar keine
 * Zeile), sonst die globale Zeile (rolle IS NULL), sonst KEIN Limit.
 *
 * service_role, weil JEDE anfragende Rolle (auch "kunde") ihre eigene Grenze
 * lesen koennen muss - RLS auf ki_ratenlimit_einstellungen ist admin-only
 * (nur die Verwaltungsoberflaeche liest ueber die eigene Sitzung). Derselbe
 * Aufbau wie ladeAktivenStandardAnbieter() (lib/ai/lade-anbieter.ts): dieser
 * Aufruf laeuft erst NACH requirePermission()/der Sitzungspruefung im
 * jeweiligen Aufrufer.
 *
 * Bei einem Datenbankfehler (z. B. voruebergehend nicht erreichbar): kein
 * Limit statt eines blockierten KI-Assistenten fuer alle - dieselbe
 * Abwaegung wie ueberall sonst in diesem Projekt (sendeChatAnfrage() etc.,
 * "kein 5xx bei Ausfall"). Das Kostenrisiko eines seltenen, kurzen
 * Infrastrukturfehlers wiegt hier weniger schwer als ein komplett
 * ausfallender Assistent.
 */
export async function ladeRatenlimitGrenze(rolle: Role): Promise<number | null> {
  const dienst = createServiceRoleClient();
  // .in() kann NULL nicht als Treffer behandeln (SQL: "spalte = ANY(...)" ist
  // fuer NULL nie wahr) - .or() mit "rolle.is.null" holt die eigene Zeile UND
  // die globale Zeile in einer Anfrage.
  const { data, error } = await dienst
    .from("ki_ratenlimit_einstellungen")
    .select("rolle, grenze_pro_minute")
    .or(`rolle.eq.${rolle},rolle.is.null`);

  if (error) {
    console.error("[damicon] Ratenlimit-Einstellungen nicht lesbar, es gilt kein Limit:", error.message);
    return null;
  }
  if (!data || data.length === 0) return null;

  const eigene = data.find((z) => z.rolle === rolle);
  const global = data.find((z) => z.rolle === null);
  const treffer = eigene ?? global;
  return treffer?.grenze_pro_minute ?? null;
}

// Sprachausgabe-Abschnitte (api/ki-sprachausgabe/route.ts, Weg 2) feuern
// mehrfach pro einzelner Chat-Antwort - eine lange, im Fachbericht-Format
// formatierte Antwort kann leicht mehrere Dutzend Saetze/Abschnitte haben
// (siehe domain/sprachausgabe.ts, erzeugeSatzZerleger). Ein gemeinsamer
// Zaehler mit dem Chat wuerde das Chat-Budget allein durch Sprachausgabe
// aufbrauchen. Die admin-konfigurierte Grenze bleibt EINE Einstellung (siehe
// KiRatenlimitVerwaltung) - dieser Faktor skaliert sie nur fuer den
// strukturell haeufigeren Sprachausgabe-Aufruf, in einem eigenen
// Zaehler-Namensraum (siehe ratenlimitUeberschritten-Aufrufstelle in
// api/ki-sprachausgabe/route.ts).
const SPRACHAUSGABE_FAKTOR = 3;

/** Skaliert eine Grenze fuer den Sprachausgabe-Zaehler - null (kein Limit) bleibt null. */
export function skaliereFuerSprachausgabe(grenzeProMinute: number | null): number | null {
  return grenzeProMinute === null ? null : grenzeProMinute * SPRACHAUSGABE_FAKTOR;
}

// --- 2. Zaehler (In-Memory) ---------------------------------------------------

const FENSTER_MS = 60_000;

const zeitstempelJeSchluessel = new Map<string, number[]>();

// Verhindert unbegrenztes Wachstum der Map ueber die Lebensdauer einer
// Instanz (z. B. viele verschiedene Nutzer-IDs auf einer lange laufenden
// Instanz): alle 200 Aufrufe abgelaufene Eintraege entfernen, statt bei jedem
// einzelnen Aufruf die gesamte Map zu durchlaufen.
let aufrufeSeitAufraeumen = 0;

function entferneVeralteteEintraege(jetzt: number): void {
  for (const [schluessel, zeitstempel] of zeitstempelJeSchluessel) {
    const uebrig = zeitstempel.filter((t) => jetzt - t < FENSTER_MS);
    if (uebrig.length === 0) zeitstempelJeSchluessel.delete(schluessel);
    else zeitstempelJeSchluessel.set(schluessel, uebrig);
  }
}

/**
 * True, wenn fuer diesen Schluessel im aktuellen Zeitfenster (60 s) die
 * uebergebene Grenze bereits erreicht ist - der Aufruf zaehlt dann NICHT
 * zusaetzlich mit. False heisst erlaubt, der Aufruf ist damit sofort
 * mitgezaehlt (kein getrennter Zaehl-Schritt noetig).
 *
 * @param schluessel Typischerweise die Nutzer-ID (profil.id). Ein
 *   Namensraum-Praefix (z. B. "tts:" + Nutzer-ID) haelt strukturell
 *   unterschiedliche Aufrufarten unabhaengig voneinander.
 * @param grenzeProMinute Der fuer DIESE Anfrage geltende, admin-konfigurierte
 *   Wert (siehe ladeRatenlimitGrenze). Bewusst OHNE Standardwert hier: null
 *   bedeutet "kein Limit" und liefert immer false, ohne jede Buchfuehrung -
 *   ein vergessener Aufrufer wuerde sonst still einen falschen Wert
 *   erhalten, statt dass der Typ ihn zur ausdruecklichen Entscheidung zwingt.
 */
export function ratenlimitUeberschritten(schluessel: string, grenzeProMinute: number | null): boolean {
  if (grenzeProMinute === null) return false;

  const jetzt = Date.now();

  aufrufeSeitAufraeumen += 1;
  if (aufrufeSeitAufraeumen >= 200) {
    aufrufeSeitAufraeumen = 0;
    entferneVeralteteEintraege(jetzt);
  }

  const bisherige = (zeitstempelJeSchluessel.get(schluessel) ?? []).filter((t) => jetzt - t < FENSTER_MS);
  if (bisherige.length >= grenzeProMinute) {
    zeitstempelJeSchluessel.set(schluessel, bisherige);
    return true;
  }
  bisherige.push(jetzt);
  zeitstempelJeSchluessel.set(schluessel, bisherige);
  return false;
}
