// Kundenzugang ueber Einladung (Anforderung E.20). [NEU-BAUEN]
//
// Ein B2B-Kundenkonto entsteht ausschliesslich ueber eine Einladung, die das
// Buero ausstellt. Der Klartext-Code wird nie gespeichert - die Datenbank haelt
// nur seinen SHA-256-Digest (siehe Migration 20261002000000). Deshalb gibt es
// in diesem Modul keinen Typ, der einen Code traegt: er existiert genau einmal,
// im Rueckgabewert von einladungErstellen(), und danach nur noch beim Kunden.

// Reihenfolge wie im Datenbank-Enum public.einladung_status.
export const einladungStatus = ["offen", "eingeloest", "zurueckgezogen"] as const;

export type EinladungStatus = (typeof einladungStatus)[number];

// "abgelaufen" ist bewusst kein Datenbankstatus, sondern wird aus gueltig_bis
// berechnet (siehe Migration). Fuer die Anzeige braucht es den Fall trotzdem,
// weil eine abgelaufene Einladung anders aussehen muss als eine offene.
export type EinladungAnzeigeStatus = EinladungStatus | "abgelaufen";

export const einladungStatusMeta: Record<
  EinladungAnzeigeStatus,
  { tone: "neutral" | "info" | "warning" | "success" | "danger" }
> = {
  offen: { tone: "info" },
  eingeloest: { tone: "success" },
  zurueckgezogen: { tone: "neutral" },
  abgelaufen: { tone: "warning" },
};

export interface Einladung {
  id: string;
  kunde: string;
  kundeId: string;
  email: string;
  fullName: string;
  status: EinladungStatus;
  gueltigBis: string;
  erstelltVon: string | null;
  erstelltAm: string;
  eingeloestAm: string | null;
}

/**
 * Anzeigestatus einer Einladung. Eine offene Einladung, deren Frist verstrichen
 * ist, gilt als abgelaufen - eingeloeste und zurueckgezogene bleiben, was sie
 * sind, auch nach dem Datum.
 */
export function anzeigeStatus(
  einladung: Pick<Einladung, "status" | "gueltigBis">,
  jetzt: Date = new Date(),
): EinladungAnzeigeStatus {
  if (einladung.status !== "offen") return einladung.status;

  const frist = new Date(einladung.gueltigBis).getTime();
  // Ein unlesbares Datum gilt als abgelaufen, nicht als offen: bei einer
  // Frist ist "unklar" die schaerfere Auslegung. NaN-Vergleiche sind immer
  // falsch, ohne diese Zeile faellt der Fall stillschweigend nach "offen".
  if (Number.isNaN(frist)) return "abgelaufen";

  // <= statt <: das Einloesen verlangt gueltig_bis > now() (siehe
  // public.einladung_abschliessen). Mit < zeigte die Liste genau auf der
  // Grenzmillisekunde "Offen" samt Zurueckziehen-Knopf, waehrend das
  // Einloesen bereits ablehnt.
  return frist <= jetzt.getTime() ? "abgelaufen" : "offen";
}

// Standard-Gueltigkeit einer neuen Einladung. Vierzehn Tage sind lang genug,
// dass ein Kunde sie ueber ein Wochenende einloest, und kurz genug, dass ein
// vergessener Code nicht monatelang scharf bleibt.
export const einladungGueltigkeitTage = 14;

// Zeichenvorrat des Codes: Crockford-Base32 ohne I, L, O und U. Damit sind die
// klassischen Verwechslungen (1/I/l, 0/O) ausgeschlossen - der Code wird am
// Telefon durchgegeben oder abgetippt, nicht kopiert.
export const einladungAlphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

// Vier Gruppen zu fuenf Zeichen, getrennt durch Bindestriche: 20 Zeichen aus
// einem 32er-Alphabet sind 100 Bit Entropie. Selbst bei einer Million Versuche
// pro Sekunde bleibt Raten aussichtslos.
export const einladungGruppen = 4;
export const einladungGruppenLaenge = 5;

/**
 * Bringt eine Nutzereingabe auf die Form, in der der Code erzeugt wurde:
 * Grossbuchstaben, keine Leerzeichen, Bindestriche zwischen den Gruppen. So
 * scheitert eine Einloesung nicht daran, dass jemand klein schreibt oder die
 * Bindestriche weglaesst.
 */
export function codeNormalisieren(eingabe: string): string {
  // Vor allem anderen kappen. Ein Code hat 20 Zeichen; alles darueber ist
  // Unsinn oder Absicht und muss nicht erst zeichenweise umgeschrieben und
  // dann gehasht werden. Grosszuegig gewaehlt, damit Bindestriche,
  // Leerzeichen und ein versehentlich mitkopierter Satz nicht schon eine
  // gueltige Eingabe abschneiden.
  const gekappt = eingabe.slice(0, 200);

  const roh = gekappt
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    // Die vier Zeichen, die das Alphabet nicht kennt, auf ihre optische
    // Entsprechung abbilden - wer "IO" statt "10" abtippt, soll trotzdem
    // hineinkommen.
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0")
    .replace(/U/g, "V");

  const gruppen: string[] = [];
  for (let i = 0; i < roh.length; i += einladungGruppenLaenge) {
    gruppen.push(roh.slice(i, i + einladungGruppenLaenge));
  }
  return gruppen.join("-");
}

export const demoEinladungen: Einladung[] = [
  {
    id: "demo-einl-1",
    kunde: "Almaty Fresh Market",
    kundeId: "demo-kunde-1",
    email: "einkauf@almaty-fresh.demo",
    fullName: "Aiganym Tulegenova",
    status: "eingeloest",
    gueltigBis: "2026-09-20T18:00:00+06:00",
    erstelltVon: "Aigerim Serikbaj",
    erstelltAm: "2026-09-06T10:15:00+06:00",
    eingeloestAm: "2026-09-07T08:42:00+06:00",
  },
  {
    id: "demo-einl-2",
    kunde: "Handelskette A",
    kundeId: "demo-kunde-2",
    email: "beschaffung@handelskette-a.demo",
    fullName: "Marat Zhunusov",
    status: "offen",
    gueltigBis: "2026-09-27T18:00:00+06:00",
    erstelltVon: "Aigerim Serikbaj",
    erstelltAm: "2026-09-13T09:00:00+06:00",
    eingeloestAm: null,
  },
  {
    id: "demo-einl-3",
    kunde: "Restaurant Astana Grill",
    kundeId: "demo-kunde-3",
    email: "kueche@astana-grill.demo",
    fullName: "Dinara Abenova",
    status: "zurueckgezogen",
    gueltigBis: "2026-09-15T18:00:00+06:00",
    erstelltVon: "Daniyar Omarov",
    erstelltAm: "2026-09-01T14:30:00+06:00",
    eingeloestAm: null,
  },
];
