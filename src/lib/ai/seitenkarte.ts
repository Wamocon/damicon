// Seitenkarte des Sprachmodus: welche Stellen der aktuellen Seite das Modell
// mit einer Sprechmarke ("[[a3]]", domain/sprechmarken.ts) zeigen kann.
// Der Browser baut sie (components/ki/ui-steuerung.ts, seitenKarte), der Server
// nimmt sie als Eingabe des Nutzers entgegen (api/ki-assistent/route.ts).
//
// Format und Grenzen stehen seit dem 28.09.2026 (Vibecode-Cleanup, Fund 44/45)
// nur noch hier. Vorher waren sie auf beiden Seiten getrennt festgelegt und
// passten nicht zusammen: der Server kappte die ganze Zeile auf 60 Zeichen und
// schnitt so " (zugeklappt)" ab oder verstuemmelte es, und eine Seitenzeile
// ueber 120 Zeichen fiel ohne Meldung ganz weg. Browserfaehig, ohne Importe.

/** Obergrenze der ganzen Karte, wie sie vom Browser kommt. */
export const MAX_SEITENKARTE_ZEICHEN = 4_000;

/** Titel einer Stelle (Ueberschrift, Karte, Listenpunkt). */
export const MAX_STELLEN_TITEL = 60;

/** Titel der Seite (h1 oder document.title). */
export const MAX_SEITEN_TITEL = 80;

/** Pfad der Seite, mit Sprachpraefix. */
export const MAX_SEITEN_PFAD = 120;

const SEITE = "Seite: ";
const ZUGEKLAPPT = " (zugeklappt)";

/** Eine Zeile der Karte je Stelle: "a3 Titel" oder "e12 Titel (zugeklappt)". */
export function kartenZeile(ref: string, titel: string, zugeklappt = false): string {
  return `${ref} ${titel}${zugeklappt ? ZUGEKLAPPT : ""}`;
}

/** Die erste Zeile der Karte: "Seite: /de/dashboard/lohn - Lohnabrechnung". */
export function seitenZeile(pfad: string, titel: string): string {
  return `${SEITE}${pfad} - ${titel}`;
}

/** Die Seitenkarte aus dem Browser, bereinigt: begrenzt, ohne Steuerzeichen und
 *  Klammern, nur das erwartete Format. Alles andere faellt weg. Im Prompt steht
 *  sie danach als Daten gekennzeichnet (mitSeitenkarte, domain/antwort-anweisungen.ts). */
export function bereinigteSeitenkarte(roh: unknown): string | null {
  if (typeof roh !== "string" || !roh.trim()) return null;
  // Nur das erwartete Format: eine Zeile "Seite: ..." und Zeilen "a3 Titel" /
  // "e12 Titel". Alles andere faellt weg. Zu lange Zeilen werden gekappt statt
  // verworfen, und die Kappung gilt dem Titel, nicht dem Zusatz "(zugeklappt)".
  const zeilen = roh
    .slice(0, MAX_SEITENKARTE_ZEICHEN)
    .split("\n")
    .map((z) => z.replace(/[\u0000-\u001f\u007f<>{}[\]`]/g, " ").replace(/\s+/g, " ").trim())
    .map((z) => {
      const seite = /^Seite: (.+)$/.exec(z);
      if (seite) return `${SEITE}${seite[1]!.slice(0, MAX_SEITEN_PFAD + " - ".length + MAX_SEITEN_TITEL).trim()}`;
      const eintrag = /^([ea]\d{1,5}) (.+)$/.exec(z);
      if (!eintrag) return "";
      const zugeklappt = eintrag[2]!.endsWith(ZUGEKLAPPT);
      const titel = (zugeklappt ? eintrag[2]!.slice(0, -ZUGEKLAPPT.length) : eintrag[2]!).slice(0, MAX_STELLEN_TITEL).trim();
      return titel ? kartenZeile(eintrag[1]!, titel, zugeklappt) : "";
    })
    .filter(Boolean);
  return zeilen.length > 0 ? zeilen.join("\n") : null;
}
