// CSV-Dateien schreiben (Semikolon als Trenner, Zeilenende CRLF), damit Excel mit deutscher und
// russischer Regionaleinstellung sie ohne Importassistenten oeffnet.
//
// Schutz vor Formel-Einschleusung: Beginnt ein Wert mit =, +, - oder @ (oder einem Tabulator oder
// Zeilenumbruch), wertet eine Tabellenkalkulation ihn als Formel aus. Die Werte stammen aus Eingaben
// von Menschen (Namen, Beschreibungen), deshalb bekommt ein solcher Wert ein Hochkomma vorangestellt.
// Das veraendert den sichtbaren Text nicht, entschaerft aber die Zelle. Eine Zahl mit Vorzeichen ist hier
// bewusst nicht ausgenommen: die Dateien enthalten Text und Datumsangaben, keine Rechenwerte.

const GEFAEHRLICHER_ANFANG = /^[=+\-@\t\r\n]/;

export function csvZelle(wert: string | number | null | undefined, trenner = ";"): string {
  let text = wert === null || wert === undefined ? "" : String(wert);
  if (GEFAEHRLICHER_ANFANG.test(text)) text = `'${text}`;
  if (text.includes('"') || text.includes(trenner) || /[\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** Eine Tabelle als CSV-Text, ohne Kodierungsmarke (BOM): die setzt, wer die Datei ausliefert. */
export function csvDatei(zeilen: readonly (readonly (string | number | null | undefined)[])[], trenner = ";"): string {
  return zeilen.map((zeile) => zeile.map((z) => csvZelle(z, trenner)).join(trenner)).join("\r\n") + "\r\n";
}
