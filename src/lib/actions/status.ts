import type { PostgrestError } from "@supabase/supabase-js";

// Einheitlicher Rueckgabewert aller Server Actions. `meldung` ist ein
// Uebersetzungsschluessel unterhalb des Namespaces "aktionen", damit die
// Oberflaeche in allen vier Sprachen antwortet.
export interface AktionsStatus {
  stand: "leer" | "ok" | "fehler";
  meldung?: string;
  /** Zusatzangabe fuer Meldungen mit Platzhalter, z. B. der Blockcode. */
  wert?: string;
  /** Nur beim Diktat: die Sprachen, die der Dienst gehoert hat. Sie
   *  entscheiden ueber die Antwortsprache (domain/antwortsprache.ts) und
   *  muessen deshalb bis in den Browser und von dort zurueck. */
  sprachen?: string[];
}

export const leer: AktionsStatus = { stand: "leer" };

export function ok(meldung: string, wert?: string, sprachen?: string[]): AktionsStatus {
  return { stand: "ok", meldung, wert, ...(sprachen?.length ? { sprachen } : {}) };
}

export function fehler(meldung: string, wert?: string): AktionsStatus {
  return { stand: "fehler", meldung, wert };
}

// Datenbankfehler auf sprechende Schluessel abbilden. Der Rohtext bleibt im
// Server-Log; die Oberflaeche zeigt eine uebersetzte Meldung.
export function dbFehler(error: PostgrestError | { code?: string; message: string }): AktionsStatus {
  console.error("[damicon] Schreibvorgang fehlgeschlagen:", error.message);

  switch (error.code) {
    case "42501":
      // Keine passende RLS-Policy - die Rolle darf hier nicht schreiben.
      return fehler("fehler.berechtigung");
    case "23505":
      return fehler("fehler.doppelt");
    case "23503":
      return fehler("fehler.bezug");
    case "23514":
    case "P0001":
      // Eigene raise-Bedingungen, u. a. die Wartezeitsperre.
      return fehler("fehler.regel");
    case "DA001":
      // geraet_zeitpunkt_pruefen() (Anforderung 2.6): Geraete-Zeitstempel
      // unplausibel (Zukunft oder > 24h Abweichung vom Servereingang).
      return fehler("fehler.geraetezeit");
    case "DA002":
      // transport_kuehlkette_bewerten() (Anforderung 3.2): Transportmessung
      // auf einer stornierten Lieferung - eigener Code statt der
      // ueberladenen 23514/P0001-Sammelklasse (adversarischer Review-Fund,
      // dieselbe Ueberlegung wie bei DA001).
      return fehler("fehler.lieferungStorniert");
    case "DA004":
      // transport_kuehlkette_bewerten() (WMCNL-2372): Transportmessung auf
      // einer bereits zugestellten Lieferung - eigener Code statt DA002,
      // sonst behauptete die Meldung faelschlich, die Lieferung sei
      // storniert.
      return fehler("fehler.lieferungZugestellt");
    case "DA003":
      // steige_kontrolle_pruefen() (Anforderung 2.10, QA-Ultra-Fund
      // 17.09.2026): Vier-Augen-Regel. Eigener Code statt 42501/
      // insufficient_privilege, sonst zeigt die Oberflaeche "Ihre Rolle darf
      // diesen Vorgang nicht ausfuehren" - irrefuehrend, denn die Rolle darf
      // den Vorgang durchaus, nur nicht an der selbst erfassten Steige.
      return fehler("fehler.selbstkontrolle");
    case "DA005":
      // pflueckaufgabe_sperre_pruefen() (WMCNL-2472): der Reihenblock ist
      // wartezeitgesperrt und muss zusaetzlich zur je Behandlung bereits
      // abgelaufenen Wartezeit ueber Reihenbloecke manuell freigegeben
      // werden. Eigener Code statt der ueberladenen 23514-Sammelklasse
      // (fehler.regel), sonst zeigt die Oberflaeche faelschlich "Wartezeit
      // ist noch nicht abgelaufen", obwohl genau das nicht die Ursache ist.
      return fehler("fehler.reihenblockGesperrt");
    default:
      return fehler("fehler.unbekannt");
  }
}

// Fehler aus requirePermission() bzw. fehlender Session.
export function zugriffsFehler(error: unknown): AktionsStatus {
  const nachricht = error instanceof Error ? error.message : String(error);
  if (nachricht === "nicht-angemeldet") return fehler("fehler.angemeldet");
  if (nachricht === "keine-berechtigung") return fehler("fehler.berechtigung");
  console.error("[damicon] Aktion fehlgeschlagen:", nachricht);
  return fehler("fehler.unbekannt");
}
