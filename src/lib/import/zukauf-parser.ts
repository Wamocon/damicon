// Import-Parser fuer den Zukauf von Nachbarbetrieben (WMCNL-1453).
//
// Fachliche Idee uebernommen aus dem Schwesterprojekt
// Digitalisierung-Himbeerenbetrieb (apps/web/lib/import-field-structure.ts):
// erst eine Vorpruefung mit Befunden statt eines blinden Schreibvorgangs, die
// Form der Datei (Trennzeichen, Spaltenreihenfolge, Sprache der Kopfzeile)
// darf variieren, jede fachliche Unstimmigkeit wird gemeldet statt stumm
// uebernommen oder stumm verworfen. Der Code selbst ist eigenstaendig auf
// Damicons vier Pflichtspalten geschrieben, nicht uebersetzt.
//
// Bewusst eine reine Funktion ohne Datenbankzugriff: Sorten und
// Nachbarbetriebe werden vom Aufrufer als Referenzliste mitgegeben (siehe
// src/lib/data/zukauf.ts), aufgeloest wird nur der Name gegen diese Liste.
// Ein unbekannter Name legt NICHT automatisch einen neuen Nachbarbetrieb oder
// eine neue Sorte an - dieselbe Begruendung wie beim Sortenkatalog im
// Vorbild: Fachdaten (wer ist ein Nachbarbetrieb, welche Sorten gibt es)
// gehoeren der Betriebsleitung, nicht einer hochgeladenen Datei.
//
// Die Reinheit ist zugleich die Testbarkeit: supabase/tests/zukauf-parser.mjs
// ruft diese Funktion ohne jede Datenbank oder Serverumgebung auf.

export type ZukaufBefundStufe = "fehler" | "warnung" | "hinweis";

export type ZukaufSpalte = "menge" | "sorte" | "datum" | "nachbarbetrieb";

export interface ZukaufBefund {
  zeile: number | null;
  spalte: ZukaufSpalte | null;
  stufe: ZukaufBefundStufe;
  code: string;
  /** Deutscher Klartext fuer Server-Log und Tests. Die Oberflaeche uebersetzt
   *  ueber `code` (siehe zukaufAnsicht.import.befund.<code> in den messages),
   *  damit dieselbe Pruefung in allen fuenf Sprachen anzeigbar bleibt. */
  meldung: string;
  wert: string | null;
}

export interface ZukaufZeile {
  zeile: number;
  mengeKg: number;
  sorteName: string;
  sorteId: string;
  datumIso: string;
  nachbarbetriebName: string;
  nachbarbetriebId: string;
}

export interface ZukaufReferenzListe {
  id: string;
  name: string;
}

export interface ZukaufReferenzen {
  sorten: ZukaufReferenzListe[];
  nachbarbetriebe: ZukaufReferenzListe[];
}

export interface ZukaufParseErgebnis {
  zeilen: ZukaufZeile[];
  befunde: ZukaufBefund[];
  trennzeichen: string;
}

// Kopfzeilen-Alias je Sprache. Muss nicht linguistisch perfekt sein - reicht,
// dass eine in de/en/ru/kk/tr abgetippte Kopfzeile eine Spalte trifft, ohne
// dass der Nachbarbetrieb seine Datei umbauen muss (gleicher Anspruch wie im
// Vorbild).
const SPALTEN: Record<ZukaufSpalte, string[]> = {
  menge: [
    "menge", "menge_kg", "menge kg", "kg", "gewicht", "gewicht_kg",
    "quantity", "amount", "qty", "weight",
    "количество", "кол-во", "вес", "кг",
    "мөлшері", "салмағы", "саны", "кг ",
    "miktar", "kilogram", "kg miktar", "agirlik", "ağırlık",
  ],
  sorte: [
    "sorte", "sorte_name", "sortenname", "variety", "variant",
    "сорт", "сорта",
    "сұрып", "сурып", "сұрыпы",
    "çeşit", "cesit", "tur", "tür",
  ],
  datum: [
    "datum", "date", "erfassungsdatum", "kaufdatum", "lieferdatum",
    "дата", "дата закупки",
    "күні", "куни", "мерзімі", "жеткізу күні",
    "tarih", "teslim tarihi",
  ],
  nachbarbetrieb: [
    "nachbarbetrieb", "betrieb", "lieferant", "farm", "farmname",
    "supplier", "vendor", "farm name",
    "поставщик", "хозяйство", "ферма", "соседнее хозяйство",
    "жеткізуші", "шаруашылық", "фермер", "көрші шаруашылық",
    "tedarikci", "tedarikçi", "ciftlik", "çiftlik",
  ],
};

const PFLICHTSPALTEN: ZukaufSpalte[] = ["menge", "sorte", "datum", "nachbarbetrieb"];

// Ab dieser Menge in einer einzelnen Zeile nur noch eine Warnung, keine
// Ablehnung - eine grosse Anlieferung ist unueblich, aber nicht ausgeschlossen.
const MENGE_WARNSCHWELLE_KG = 2000;

// Ein Datum vor diesem Abstand zu "heute" ist noch zulaessig, aber auffaellig
// (z. B. nachgetragener Altbestand). In die Zukunft geht dagegen niemals, das
// bleibt ein Fehler - ein Zukauf kann nicht vor der Anlieferung erfasst werden.
const ALTDATUM_WARN_JAHRE = 2;

const BOM_ZEICHENCODE = 0xfeff;

function ohneBom(text: string): string {
  // Ueber charCodeAt geprueft statt ueber ein Byte-Order-Mark-Zeichen (oder
  // dessen \u-Escape) direkt im Quelltext: beides waere im Editor und im
  // Diff unsichtbar, und ein Werkzeug, das Zeichensaetze normalisiert, koennte
  // es stillschweigend entfernen und den Ausdruck damit wirkungslos machen.
  return text.charCodeAt(0) === BOM_ZEICHENCODE ? text.slice(1) : text;
}

function normalisiere(s: string): string {
  return s.toLowerCase().replace(/[\s_.-]+/g, " ").replace(/["']/g, "").trim();
}

/** Zerlegt eine Zeile unter Beachtung von Anfuehrungszeichen (RFC-4180-artig,
 *  von Hand statt per Bibliothek - das Format ist klein und wohldefiniert). */
function zeileSplitten(zeile: string, trennzeichen: string): string[] {
  const teile: string[] = [];
  let feld = "";
  let inAnfuehrung = false;
  for (let i = 0; i < zeile.length; i++) {
    const zeichen = zeile[i];
    if (inAnfuehrung) {
      if (zeichen === '"') {
        if (zeile[i + 1] === '"') {
          feld += '"';
          i++;
        } else {
          inAnfuehrung = false;
        }
      } else {
        feld += zeichen;
      }
    } else if (zeichen === '"') {
      inAnfuehrung = true;
    } else if (zeichen === trennzeichen) {
      teile.push(feld);
      feld = "";
    } else {
      feld += zeichen;
    }
  }
  teile.push(feld);
  return teile.map((t) => t.trim());
}

/** Raet das Trennzeichen aus der Kopfzeile - deutsches/russisches Excel
 *  schreibt beim CSV-Export ueblicherweise Semikolon, nicht Komma. */
function trennzeichenRaten(kopfzeile: string): string {
  const kandidaten = [";", ",", "\t", "|"];
  let bestes = ";";
  let meisteSpalten = 0;
  for (const kandidat of kandidaten) {
    const anzahl = zeileSplitten(kopfzeile, kandidat).length;
    if (anzahl > meisteSpalten) {
      meisteSpalten = anzahl;
      bestes = kandidat;
    }
  }
  return bestes;
}

/** Menge als Zahl - Komma als Dezimaltrennzeichen (deutsches/russisches/
 *  kasachisches Excel), kein Umgang mit Tausendertrennzeichen (fuer den
 *  erwarteten Groessenbereich einzelner Anlieferungen nicht noetig). */
function mengeParsen(roh: string): number | null {
  if (!roh) return null;
  const zahl = Number(roh.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(zahl) ? zahl : null;
}

/** Datum als ISO-String (YYYY-MM-DD) - akzeptiert ISO selbst sowie
 *  TT.MM.JJJJ und TT/MM/JJJJ (in dieser Reihenfolge, europaeisch/kasachisch/
 *  tuerkisch ueblich, nicht US-amerikanisch MM/TT/JJJJ). */
function datumParsen(roh: string): string | null {
  const wert = roh.trim();

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(wert);
  const punktMatch = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(wert);
  const schraegMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(wert);

  let jahr: number, monat: number, tag: number;
  if (isoMatch) {
    jahr = Number(isoMatch[1]);
    monat = Number(isoMatch[2]);
    tag = Number(isoMatch[3]);
  } else if (punktMatch) {
    tag = Number(punktMatch[1]);
    monat = Number(punktMatch[2]);
    jahr = Number(punktMatch[3]);
  } else if (schraegMatch) {
    tag = Number(schraegMatch[1]);
    monat = Number(schraegMatch[2]);
    jahr = Number(schraegMatch[3]);
  } else {
    return null;
  }

  if (monat < 1 || monat > 12 || tag < 1 || tag > 31) return null;

  // new Date validiert Kalendertage aktiv: ein Konstruktor-Rollover (z. B.
  // 31.02.) wird unten gegen die eingegebenen Werte erkannt statt still auf
  // den naechsten gueltigen Tag verschoben.
  const datum = new Date(Date.UTC(jahr, monat - 1, tag));
  if (
    datum.getUTCFullYear() !== jahr ||
    datum.getUTCMonth() !== monat - 1 ||
    datum.getUTCDate() !== tag
  ) {
    return null;
  }

  return `${String(jahr).padStart(4, "0")}-${String(monat).padStart(2, "0")}-${String(tag).padStart(2, "0")}`;
}

function referenzAufloesen(
  liste: ZukaufReferenzListe[],
  name: string,
): ZukaufReferenzListe | null {
  const gesucht = normalisiere(name);
  return liste.find((eintrag) => normalisiere(eintrag.name) === gesucht) ?? null;
}

/**
 * Prueft eine CSV-aehnliche Zukauf-Eingabe und loest Sorte/Nachbarbetrieb
 * gegen die mitgegebenen Referenzlisten auf. Schreibt nichts in die
 * Datenbank - das uebernimmt src/lib/actions/zukauf.ts erst, wenn kein
 * Fehlerbefund vorliegt.
 *
 * @param text      Rohtext, z. B. aus einem Textfeld oder Datei-Upload.
 * @param referenzen Bekannte Sorten/Nachbarbetriebe, gegen die Namen aufgeloest
 *                   werden. Unbekannte Namen sind ein Fehlerbefund, kein
 *                   Auto-Anlegen.
 * @param heuteIso  Heutiges Datum als YYYY-MM-DD, fuer die Plausibilitaets-
 *                  pruefung des Datums. Bewusst als Parameter statt intern
 *                  `new Date()` - haelt die Funktion deterministisch testbar.
 */
export function parseZukauf(
  text: string,
  referenzen: ZukaufReferenzen,
  heuteIso: string,
): ZukaufParseErgebnis {
  const befunde: ZukaufBefund[] = [];
  const befundHinzufuegen = (
    b: Omit<ZukaufBefund, "zeile" | "spalte"> & Partial<Pick<ZukaufBefund, "zeile" | "spalte">>,
  ) => befunde.push({ zeile: null, spalte: null, ...b });

  const zeilenRoh = ohneBom(text)
    .split(/\r?\n/)
    .filter((z) => z.trim().length > 0);

  if (zeilenRoh.length === 0) {
    befundHinzufuegen({
      stufe: "fehler",
      code: "empty",
      meldung: "Die Eingabe enthält keine Zeilen.",
      wert: null,
    });
    return { zeilen: [], befunde, trennzeichen: ";" };
  }

  const trennzeichen = trennzeichenRaten(zeilenRoh[0]);
  const kopf = zeileSplitten(zeilenRoh[0], trennzeichen).map(normalisiere);

  const index: Partial<Record<ZukaufSpalte, number>> = {};
  for (const spalte of PFLICHTSPALTEN) {
    const gefunden = kopf.findIndex((k) => SPALTEN[spalte].includes(k));
    if (gefunden >= 0) index[spalte] = gefunden;
  }

  for (const spalte of PFLICHTSPALTEN) {
    if (index[spalte] === undefined) {
      befundHinzufuegen({
        spalte,
        stufe: "fehler",
        code: "column_missing",
        meldung: `Die Spalte für "${spalte}" wurde nicht erkannt.`,
        wert: zeilenRoh[0].slice(0, 120),
      });
    }
  }
  if (befunde.some((b) => b.stufe === "fehler")) {
    return { zeilen: [], befunde, trennzeichen };
  }

  const zeilen: ZukaufZeile[] = [];
  // Duplikatpruefung: gleicher Nachbarbetrieb, gleiche Sorte, gleiches Datum
  // UND gleiche Menge. Anders als beim Vorbild (dort ein struktureller
  // Schluessel, der per Definition nicht doppelt vorkommen kann) ist das hier
  // nur ein Verdacht, kein Beweis - zwei echte Lieferungen koennten zufaellig
  // uebereinstimmen. Deshalb Warnung, nicht Fehler: die Zeile bleibt drin.
  const gesehen = new Map<string, number>();

  for (let i = 1; i < zeilenRoh.length; i++) {
    const teile = zeileSplitten(zeilenRoh[i], trennzeichen);
    const zeile = i + 1; // 1-basiert, Kopfzeile ist Zeile 1
    const hol = (spalte: ZukaufSpalte) =>
      index[spalte] === undefined ? "" : (teile[index[spalte]!] ?? "").trim();

    const mengeRoh = hol("menge");
    const sorteRoh = hol("sorte");
    const datumRoh = hol("datum");
    const nachbarbetriebRoh = hol("nachbarbetrieb");

    const fehlend = (["menge", "sorte", "datum", "nachbarbetrieb"] as const).find(
      (spalte) => !hol(spalte),
    );
    if (fehlend) {
      befundHinzufuegen({
        zeile,
        spalte: fehlend,
        stufe: "fehler",
        code: "required_missing",
        meldung: `Pflichtangabe "${fehlend}" fehlt.`,
        wert: zeilenRoh[i].slice(0, 100),
      });
      continue;
    }

    const mengeKg = mengeParsen(mengeRoh);
    if (mengeKg === null) {
      befundHinzufuegen({
        zeile,
        spalte: "menge",
        stufe: "fehler",
        code: "value_format",
        meldung: `Menge "${mengeRoh}" ist keine Zahl.`,
        wert: mengeRoh,
      });
      continue;
    }
    if (mengeKg <= 0) {
      befundHinzufuegen({
        zeile,
        spalte: "menge",
        stufe: "fehler",
        code: "value_range",
        meldung: "Die Menge muss größer als null sein.",
        wert: mengeRoh,
      });
      continue;
    }
    if (mengeKg > MENGE_WARNSCHWELLE_KG) {
      befundHinzufuegen({
        zeile,
        spalte: "menge",
        stufe: "warnung",
        code: "value_suspicious",
        meldung: `Ungewöhnlich hohe Menge (${mengeKg} kg) - wird trotzdem übernommen.`,
        wert: mengeRoh,
      });
    }

    const datumIso = datumParsen(datumRoh);
    if (datumIso === null) {
      befundHinzufuegen({
        zeile,
        spalte: "datum",
        stufe: "fehler",
        code: "value_format",
        meldung: `Datum "${datumRoh}" wird nicht erkannt. Erwartet: JJJJ-MM-TT oder TT.MM.JJJJ.`,
        wert: datumRoh,
      });
      continue;
    }
    if (datumIso > heuteIso) {
      befundHinzufuegen({
        zeile,
        spalte: "datum",
        stufe: "fehler",
        code: "value_range",
        meldung: `Datum ${datumIso} liegt in der Zukunft.`,
        wert: datumRoh,
      });
      continue;
    }
    const altGrenze = `${Number(heuteIso.slice(0, 4)) - ALTDATUM_WARN_JAHRE}${heuteIso.slice(4)}`;
    if (datumIso < altGrenze) {
      befundHinzufuegen({
        zeile,
        spalte: "datum",
        stufe: "warnung",
        code: "value_suspicious",
        meldung: `Datum ${datumIso} liegt mehr als ${ALTDATUM_WARN_JAHRE} Jahre zurück - wird trotzdem übernommen.`,
        wert: datumRoh,
      });
    }

    const sorte = referenzAufloesen(referenzen.sorten, sorteRoh);
    if (!sorte) {
      befundHinzufuegen({
        zeile,
        spalte: "sorte",
        stufe: "fehler",
        code: "unknown_reference",
        meldung: `Sorte "${sorteRoh}" ist nicht im Sortenkatalog. Neue Sorten legt die Betriebsleitung im Sortenkatalog an, nicht der Import.`,
        wert: sorteRoh,
      });
      continue;
    }

    const nachbarbetrieb = referenzAufloesen(referenzen.nachbarbetriebe, nachbarbetriebRoh);
    if (!nachbarbetrieb) {
      befundHinzufuegen({
        zeile,
        spalte: "nachbarbetrieb",
        stufe: "fehler",
        code: "unknown_reference",
        meldung: `Nachbarbetrieb "${nachbarbetriebRoh}" ist nicht angebunden. Neue Nachbarbetriebe legt die Betriebsleitung an, nicht der Import.`,
        wert: nachbarbetriebRoh,
      });
      continue;
    }

    const schluessel = `${nachbarbetrieb.id}|${sorte.id}|${datumIso}|${mengeKg}`;
    if (gesehen.has(schluessel)) {
      befundHinzufuegen({
        zeile,
        spalte: null,
        stufe: "warnung",
        code: "duplicate_verdacht",
        meldung: `Gleicht Zeile ${gesehen.get(schluessel)} (gleicher Nachbarbetrieb, Sorte, Datum und Menge) - möglicherweise doppelt erfasst, wird trotzdem übernommen.`,
        wert: String(gesehen.get(schluessel)),
      });
    } else {
      gesehen.set(schluessel, zeile);
    }

    zeilen.push({
      zeile,
      mengeKg,
      sorteName: sorte.name,
      sorteId: sorte.id,
      datumIso,
      nachbarbetriebName: nachbarbetrieb.name,
      nachbarbetriebId: nachbarbetrieb.id,
    });
  }

  if (zeilen.length === 0 && !befunde.some((b) => b.stufe === "fehler")) {
    befundHinzufuegen({
      stufe: "fehler",
      code: "no_rows",
      meldung: "Keine verwertbare Datenzeile gefunden.",
      wert: null,
    });
  }

  if (zeilen.length > 0) {
    const summeKg = zeilen.reduce((s, z) => s + z.mengeKg, 0);
    const sortenAnzahl = new Set(zeilen.map((z) => z.sorteId)).size;
    const betriebeAnzahl = new Set(zeilen.map((z) => z.nachbarbetriebId)).size;
    // Bleibt Deutsch statt uebersetzt: eine Kontrollausgabe fuer die Vorschau
    // vor dem Schreiben, keine dauerhafte UI-Beschriftung - anders als jeder
    // andere Befundtext hier, der ueber `code` uebersetzt wird (die
    // Oberflaeche zeigt "wert" fuer den Code "summary" per Passthrough an,
    // siehe zukaufAnsicht.import.befund.summary in den messages).
    const summaryText = `${zeilen.length} Position(en), ${summeKg.toFixed(1)} kg gesamt, ${sortenAnzahl} Sorte(n), ${betriebeAnzahl} Nachbarbetrieb(e).`;
    befundHinzufuegen({
      stufe: "hinweis",
      code: "summary",
      meldung: summaryText,
      wert: summaryText,
    });
  }

  return { zeilen, befunde, trennzeichen };
}
