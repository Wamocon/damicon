// Anweisungen ans Modell, die von der Antwortsprache abhaengen.
//
// Der Systemprompt des Assistenten ist deutsch - und einzelne Zeilen darin
// VERLANGTEN deutsche Ausgabe, auch wenn die Antwort russisch sein sollte:
//
//   - "Schliesse mit einer Zeile 'Empfehlung: ...' ab"
//   - "gib den massgeblichen Satz im Original mit DEUTSCHER Uebersetzung wieder"
//   - "sage 'Dazu habe ich in der Wissensbasis keine Stelle gefunden'"
//
// Gerade die Antworten zu Compliance, Recht und Steuern (also auch die
// Zusammenfassung nach der Tour) laufen ueber diese Zeilen, weil dort die
// Wissenssuche erzwungen wird. Die Sprachanweisung am Ende des Prompts sagt
// "antworte auf Russisch", die Zeilen davor sagen "uebersetze ins Deutsche":
// das Modell folgt dann oft den vielen deutschen Vorgaben statt der einen.
//
// Deshalb stehen diese Saetze hier je Sprache - und es gibt zusaetzlich einen
// kurzen Hinweis in der Sprache der Antwort direkt an der Frage (siehe
// spracheErinnerung), weil er dort am naechsten am Modell steht.
//
// Reine Funktionen ohne Importe, damit supabase/tests/ki-assistent.mjs sie mit
// blossem Node pruefen kann.

export type AntwortSprache = "de" | "en" | "ru" | "kk";

/** Name der Sprache, wie er im deutschen Prompt steht. */
const NAME: Record<AntwortSprache, string> = {
  de: "Deutsch",
  en: "Englisch",
  ru: "Russisch",
  kk: "Kasachisch",
};

/** Beschriftung der Schlusszeile ("Empfehlung: ..."). */
export const EMPFEHLUNG: Record<AntwortSprache, string> = {
  de: "Empfehlung",
  en: "Recommendation",
  ru: "Рекомендация",
  kk: "Ұсыныс",
};

/** Der Satz, wenn die Wissensbasis nichts Passendes liefert. */
export const KEINE_STELLE: Record<AntwortSprache, string> = {
  de: "Dazu habe ich in der Wissensbasis keine Stelle gefunden",
  en: "I found no passage on this in the knowledge base",
  ru: "В базе знаний я не нашёл подходящего места по этому вопросу",
  kk: "Білім қорынан бұл сұрақ бойынша сәйкес жерді таппадым",
};

/** Ein Satz in der Sprache der Antwort - steht am Ende der Nutzerfrage, wenn
 *  sie ans Modell geht. Kurz, im Klammerton, damit er als Hinweis gelesen wird
 *  und nicht als Teil der Frage. */
export const ERINNERUNG: Record<AntwortSprache, string> = {
  de: "Antworte auf Deutsch.",
  en: "Reply in English.",
  ru: "Ответь на русском языке.",
  kk: "Қазақ тілінде жауап бер.",
};

export function spracheErinnerung(sprache: AntwortSprache): string {
  return `(${ERINNERUNG[sprache]})`;
}

/** Die Nachrichten, wie sie ans Modell gehen: an der letzten Nutzerfrage haengt
 *  ein Hinweis in der Antwortsprache. Nur die Kopie fuers Modell - gespeichert
 *  und angezeigt wird die Frage unveraendert. Endet der Verlauf nicht mit einer
 *  Nutzerfrage (Freigabe-Runde), bleibt alles, wie es ist. */
export function mitSprachErinnerung<T extends { role: string; parts: unknown[] }>(
  nachrichten: readonly T[],
  sprache: AntwortSprache,
): T[] {
  const kopie = [...nachrichten];
  const letzte = kopie.at(-1);
  if (!letzte || letzte.role !== "user") return kopie;
  kopie[kopie.length - 1] = {
    ...letzte,
    parts: [...letzte.parts, { type: "text", text: `\n\n${spracheErinnerung(sprache)}` }],
  };
  return kopie;
}

/** Formatregeln jeder Antwort. Auf Deutsch unveraendert; in anderen Sprachen
 *  traegt die Schlusszeile die Beschriftung der Antwortsprache. */
export function formatAnweisung(sprache: AntwortSprache): string {
  const schluss =
    sprache === "de"
      ? "- Schließe, wenn sinnvoll, mit einer Zeile 'Empfehlung: ...' ab."
      : `- Schließe, wenn sinnvoll, mit einer Zeile '${EMPFEHLUNG[sprache]}: ...' ab - die Beschriftung steht in der Antwortsprache (${NAME[sprache]}), nicht auf Deutsch.`;
  return [
    "Formatiere jede Antwort wie ein kurzer Fachbericht, nicht wie eine Chat-Nachricht:",
    "- Beginne mit einem einzeiligen Fazit in Fettschrift.",
    "- Nutze Markdown-Zwischenueberschriften (##), wenn mehrere Themen beruehrt sind.",
    "- Zahlen, Daten und Fristen immer in Fettschrift.",
    schluss,
    "- Kein Füllwort, keine Höflichkeitsfloskeln am Anfang oder Ende.",
    "- Keine Emojis.",
    "- Auf Deutsch sprichst du den Nutzer mit 'Sie' an.",
  ].join("\n");
}

/** Belegpflicht fuer Recht, Steuer, Compliance und Audit. Auf Deutsch
 *  unveraendert; sonst werden Uebersetzung und Festsaetze in der Antwortsprache
 *  verlangt statt auf Deutsch. */
export function quellenAnweisung(sprache: AntwortSprache): string {
  const uebersetzung =
    sprache === "de"
      ? "gib den maßgeblichen Satz kurz im Original mit deutscher Übersetzung wieder"
      : `gib den maßgeblichen Satz kurz im Original wieder, mit Übersetzung in die Antwortsprache (${NAME[sprache]}) - nicht ins Deutsche; ist der Beleg schon in der Antwortsprache, zitiere ihn nur`;
  const schlusssatz =
    sprache === "de"
      ? "Schließe verbindliche Rechts- und Steuerfragen mit einem Satz ab, dass eine Beratung durch Steuerberater oder Anwalt die Auskunft nicht ersetzt."
      : `Schließe verbindliche Rechts- und Steuerfragen mit einem Satz in der Antwortsprache (${NAME[sprache]}) ab, dass eine Beratung durch Steuerberater oder Anwalt die Auskunft nicht ersetzt.`;
  return [
    "QUELLEN UND BELEGE: Bei jeder Frage zu Recht, Steuern, Arbeitsrecht, Compliance oder Audit rufst du ZUERST wissenSuchen auf (mit frageRussisch) und antwortest auf Grundlage der gefundenen Belege. Regeln:",
    "1. Jede rechtliche Aussage, Zahl, Frist oder Sanktion bekommt direkt dahinter die Kennung ihres Belegs in eckigen Klammern, zum Beispiel [S1]; mehrere Belege: [S1][S3].",
    "2. Zitiere nur Kennungen, die wissenSuchen in DIESER Antwort geliefert hat. Erfinde nie Fundstellen, Artikelnummern oder Zitate.",
    `3. Nenne bei wichtigen Aussagen die Fundstelle im Klartext (zum Beispiel 'НК РК ст. 82'). Ist der Beleg russisch oder kasachisch, ${uebersetzung}.`,
    "4. Belege der Stufe 4 oder 5 sind Auskünfte Dritter, keine Rechtsquellen: schreibe 'laut Fachquelle' und weise darauf hin, dass die Primärquelle zu prüfen ist. Bei überholten oder widerspruechlichen Belegen sage das ausdrücklich und nenne den Stand (Abrufdatum), wenn die Angabe zeitkritisch ist.",
    `5. Liefert das Werkzeug nichts Passendes, sage '${KEINE_STELLE[sprache]}' und gib alles Weitere nur als Allgemeinwissen an. Kein Beleg, keine Behauptung.`,
    `6. ${schlusssatz}`,
  ].join("\n");
}
