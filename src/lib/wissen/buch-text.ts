// Hilfen fuer den Buch-Upload, die im Browser laufen (und im Test unter Node): Text bereinigen, in Pakete teilen, Hash bilden.
// Ohne Abhaengigkeit von Node und vom Server: dieses Modul wird in den Browser gebuendelt.
//
// Warum im Browser: Ein Buch als gescanntes PDF ist zehn bis hundert Megabyte gross. Eine Server Action nimmt auf Vercel hoechstens
// wenige Megabyte je Anfrage (Plattformgrenze) und 60 Sekunden Laufzeit. Deshalb liest der Browser die Datei selbst, holt den Text
// heraus (buch-pdf.ts) und schickt nur den TEXT in Paketen von etwa 80.000 Zeichen. Die Originaldatei verlaesst den Rechner nie.

/** Zielgroesse eines Pakets in Zeichen: ungefaehr 60 Abschnitte, die der Server in einer Anfrage einbettet. */
export const PAKET_ZEICHEN = 80_000;

/** Wie die Plattform zaehlt: dieselbe Vereinheitlichung wie normalisiere() in hochladen.ts (nicht importierbar: dort steht node:crypto).
 *  Ein Test haelt beide gleich, denn derselbe Inhalt muss denselben Hash und damit dieselbe Kennung ergeben. */
export function normalisiereText(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/** SHA-256 des vereinheitlichten Textes als Hex (64 Zeichen). Browser und Node 20+ haben crypto.subtle. */
export async function sha256Hex(text: string): Promise<string> {
  const daten = new TextEncoder().encode(normalisiereText(text));
  const digest = await crypto.subtle.digest("SHA-256", daten);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Eine Zeile gehoert zum selben Absatz wie die vorige, wenn sie klein beginnt, oder wenn die vorige weder mit einem Satzzeichen endet
 *  noch kurz ist. Kurze Zeilen ohne Satzzeichen sind Ueberschriften und bleiben getrennt. Im Deutschen beginnt nach einem Zeilenende
 *  oft ein grosses Nomen: Deshalb entscheidet nicht der Anfangsbuchstabe, sondern das Ende der vorigen Zeile und ihre Laenge. */
const SATZENDE = /[.!?:;»"”)\]]$/u;
const KURZE_ZEILE = 40;

function fuegeZeilenZusammen(seite: string): string {
  let aus = "";
  let vorige = "";
  for (const roh of seite.split("\n")) {
    const zeile = roh.trim();
    if (!zeile) {
      aus += "\n\n";
      vorige = "";
      continue;
    }
    if (!vorige) {
      aus += zeile;
    } else {
      const klein = /^\p{Ll}/u.test(zeile);
      const fortsetzung = klein || (!SATZENDE.test(vorige) && vorige.length >= KURZE_ZEILE);
      aus += (fortsetzung ? " " : "\n") + zeile;
    }
    vorige = zeile;
  }
  return aus;
}

/**
 * Bringt den Text eines PDF-Seiten-Stroms in eine lesbare Form: Silbentrennung am Zeilenende wieder zusammensetzen ("Verjaeh-\nrung"),
 * Zeilenumbrueche mitten im Absatz zu Leerzeichen, Seitenwechsel als Absatz. Ueberschriften (kurze Zeilen ohne Satzzeichen) bleiben getrennt.
 */
export function bereinigeSeitentext(rohSeiten: readonly string[]): string {
  return rohSeiten
    .map((seite) =>
      fuegeZeilenZusammen(
        seite
          .replace(/\r\n?/g, "\n")
          .replace(/[ \t]+/g, " ")
          // Silbentrennung: Buchstabe, Bindestrich, Zeilenende, Kleinbuchstabe -> ein Wort
          .replace(/(\p{L})[-­]\n(\p{Ll})/gu, "$1$2"),
      ).trim(),
    )
    .filter((s) => s.length > 0)
    .join("\n\n");
}

/** Schneidet einen zu langen Absatz an Satzenden, zur Not hart an einer Wortgrenze. */
function schneide(absatz: string, groesse: number): string[] {
  if (absatz.length <= groesse) return [absatz];
  const teile: string[] = [];
  let rest = absatz;
  while (rest.length > groesse) {
    const fenster = rest.slice(0, groesse);
    let schnitt = Math.max(fenster.lastIndexOf(". "), fenster.lastIndexOf("! "), fenster.lastIndexOf("? "));
    if (schnitt < groesse * 0.5) schnitt = fenster.lastIndexOf(" ");
    if (schnitt < groesse * 0.3) schnitt = groesse - 1;
    teile.push(rest.slice(0, schnitt + 1).trim());
    rest = rest.slice(schnitt + 1).trim();
  }
  if (rest) teile.push(rest);
  return teile;
}

/** Teilt den Text an Absatzgrenzen in Pakete von hoechstens `groesse` Zeichen. Nichts geht verloren, nichts wird doppelt gesendet. */
export function teileInPakete(text: string, groesse = PAKET_ZEICHEN): string[] {
  const absaetze = text.replace(/\r\n?/g, "\n").split(/\n{2,}/).map((a) => a.trim()).filter(Boolean).flatMap((a) => schneide(a, groesse));
  const pakete: string[] = [];
  let aktuell = "";
  for (const a of absaetze) {
    if (aktuell && aktuell.length + a.length + 2 > groesse) {
      pakete.push(aktuell);
      aktuell = "";
    }
    aktuell = aktuell ? `${aktuell}\n\n${a}` : a;
  }
  if (aktuell) pakete.push(aktuell);
  return pakete;
}

/** Titel aus dem Dateinamen: ohne Endung, Unterstriche und Punkte zu Leerzeichen, mit grossem Anfangsbuchstaben. */
export function titelAusDateiname(dateiname: string): string {
  const ohne = dateiname.replace(/\.[A-Za-z0-9]{2,4}$/, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  return ohne ? ohne.charAt(0).toUpperCase() + ohne.slice(1) : dateiname;
}
