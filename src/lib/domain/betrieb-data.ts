// Weitere Stammdaten fuer die Demo-Oberflaechen (Personal, Sorten, Dokumente).
// Bewusst schlank - der Prototyp zeigt Struktur, keine Tiefe.

export interface Pfluecker {
  id: string;
  name: string;
  brigade: string;
  ausweis: string;
  esutd: "erfasst" | "offen";
  schnitt7dKg: number;
  qualitaetsfaktor: number;
}

export const brigaden = [
  { id: "b-nord", name: "Brigade Nord", vorarbeiter: "A. Iskakow", staerke: 6, plantage: "Talgar" },
  { id: "b-ost", name: "Brigade Ost", vorarbeiter: "G. Nurlanowa", staerke: 4, plantage: "Talgar" },
  { id: "b-sued", name: "Brigade Sued", vorarbeiter: "S. Achmetow", staerke: 5, plantage: "Issyk" },
  { id: "b-nachbar", name: "Brigade Nachbarbetrieb", vorarbeiter: "R. Baitulin", staerke: 5, plantage: "Kaskelen" },
];

export const pfluecker: Pfluecker[] = [
  { id: "p-01", name: "D. Sarsenbaj", brigade: "Brigade Nord", ausweis: "MAL-0417", esutd: "erfasst", schnitt7dKg: 214, qualitaetsfaktor: 1.06 },
  { id: "p-02", name: "A. Tulegenowa", brigade: "Brigade Nord", ausweis: "MAL-0418", esutd: "erfasst", schnitt7dKg: 231, qualitaetsfaktor: 1.11 },
  { id: "p-03", name: "M. Qojschybaj", brigade: "Brigade Ost", ausweis: "MAL-0421", esutd: "offen", schnitt7dKg: 188, qualitaetsfaktor: 0.98 },
  { id: "p-04", name: "N. Erbolat", brigade: "Brigade Sued", ausweis: "MAL-0430", esutd: "erfasst", schnitt7dKg: 176, qualitaetsfaktor: 1.02 },
  { id: "p-05", name: "L. Achmet", brigade: "Brigade Nachbarbetrieb", ausweis: "MAL-0441", esutd: "offen", schnitt7dKg: 202, qualitaetsfaktor: 1.04 },
];

export interface Sorte {
  id: string;
  name: string;
  typ: "remontierend" | "sommertragend";
  /** Deutsche Notiz fuer die Codeseite - angezeigt wird
   *  sortenkatalogDemo.fenster.<id>, sonst stuende das Erntefenster in
   *  jeder Sprache auf Deutsch. */
  fenster: string;
  schaleG: number;
  kontingentKg: number;
  reserviertKg: number;
  /** Preis je Kilogramm in Tenge - die Oberflaeche formatiert nach Locale. */
  preisTengeKg: number;
}

export const sorten: Sorte[] = [
  { id: "s-polka", name: "Polka", typ: "remontierend", fenster: "Aug - erster Frost", schaleG: 125, kontingentKg: 4200, reserviertKg: 3100, preisTengeKg: 2100 },
  { id: "s-polana", name: "Polana", typ: "remontierend", fenster: "Aug - Okt", schaleG: 125, kontingentKg: 2600, reserviertKg: 1450, preisTengeKg: 2050 },
  { id: "s-tulameen", name: "Tulameen", typ: "sommertragend", fenster: "Jun - Jul", schaleG: 170, kontingentKg: 0, reserviertKg: 0, preisTengeKg: 1850 },
  { id: "s-kweli", name: "Kweli", typ: "remontierend", fenster: "Aug - Sep", schaleG: 125, kontingentKg: 1400, reserviertKg: 900, preisTengeKg: 2000 },
];

export interface Dokument {
  id: string;
  name: string;
  kategorie: "Spritzmittelprotokoll" | "ESUTD-Nachweis" | "Liefervertrag" | "Foerderdossier" | "Zertifikat";
  bezug: string;
  stand: string;
  status: "gueltig" | "prueflauf" | "abgelaufen";
}

export const dokumente: Dokument[] = [
  { id: "d-01", name: "Spritzprotokoll KW 36 - Parzelle Nord", kategorie: "Spritzmittelprotokoll", bezug: "T-N-A-04, T-N-B-01", stand: "2026-09-01", status: "gueltig" },
  { id: "d-02", name: "ESUTD-Sammelnachweis Saisonkraefte", kategorie: "ESUTD-Nachweis", bezug: "42 Vertraege", stand: "2026-08-28", status: "prueflauf" },
  { id: "d-03", name: "Rahmenliefervertrag Handelskette A", kategorie: "Liefervertrag", bezug: "Kontingent Polka 3 100 kg", stand: "2026-08-15", status: "gueltig" },
  { id: "d-04", name: "Foerderdossier gosagro.kz - Kuehlhaus", kategorie: "Foerderdossier", bezug: "Antrag 2026-114", stand: "2026-08-30", status: "prueflauf" },
  { id: "d-05", name: "GlobalG.A.P.-Zertifikat", kategorie: "Zertifikat", bezug: "Betrieb", stand: "2025-11-02", status: "gueltig" },
  { id: "d-06", name: "Spritzprotokoll KW 30 - Parzelle Sued", kategorie: "Spritzmittelprotokoll", bezug: "I-S-B-01", stand: "2026-07-20", status: "abgelaufen" },
];

export interface Schulungsvideo {
  id: string;
  /** Deutsche Notiz fuer die Codeseite - angezeigt wird
   *  schulungenDemo.video.<id>. */
  titel: string;
  dauer: string;
  sprachen: string[];
  /** Schluessel, kein Anzeigetext - uebersetzt ueber schulungenDemo.thema.<wert>. */
  thema: string;
}

export const schulungsvideos: Schulungsvideo[] = [
  { id: "v-01", titel: "Richtig pfluecken - reife Frucht erkennen", dauer: "4:12", sprachen: ["kk", "ru", "tr"], thema: "ernte" },
  { id: "v-02", titel: "Steige befuellen und QR-Etikett scannen", dauer: "3:05", sprachen: ["kk", "ru"], thema: "feld" },
  { id: "v-03", titel: "Die Stunde nach dem Pfluecken - Kuehlkette", dauer: "5:40", sprachen: ["kk", "ru", "tr", "de", "en"], thema: "hof" },
  { id: "v-04", titel: "Hygiene und Handschuhe", dauer: "2:48", sprachen: ["kk", "ru"], thema: "qualitaet" },
];

export interface Integration {
  id: string;
  name: string;
  system: string;
  richtung: "outbox";
  status: "verbunden" | "sandbox" | "geplant";
  wartend: number;
}

export const integrationen: Integration[] = [
  { id: "esf", name: "Elektronische Rechnung / Warenbegleitschein", system: "ЭСФ / ИС ЭСФ", richtung: "outbox", status: "sandbox", wartend: 3 },
  { id: "esutd", name: "Arbeitsvertragserfassung", system: "ЕСУТД (enbek.kz)", richtung: "outbox", status: "sandbox", wartend: 12 },
  { id: "virt-lager", name: "Virtueller Lagerbestand", system: "Госдоходы / Virtуальный склад", richtung: "outbox", status: "geplant", wartend: 0 },
  { id: "gosagro", name: "Foerdermittelportal", system: "gosagro.kz", richtung: "outbox", status: "geplant", wartend: 0 },
  { id: "qoldau", name: "Subventionsportal", system: "qoldau.kz", richtung: "outbox", status: "geplant", wartend: 0 },
];
