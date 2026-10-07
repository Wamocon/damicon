// Fuenf SYNTHETISCHE Proben fuer den Vergleich "ETL-Ausgabe unveraendert" (supabase/tests/wissen-etl-unveraendert.ts):
// deutsch, russisch, gemischt mit Zahlen und Abkuerzungen, leer und sehr lang. Frei erfunden, kein echtes Dokument.

function langerText(): string {
  const absaetze: string[] = [];
  for (let i = 0; i < 400; i++) {
    absaetze.push(
      `Absatz ${i}: Der Betrieb Nummer ${i % 17} meldet die Quarkspeise-Anzeige nach Artikel ${i} fristgerecht. ` +
        `Статья ${i}: организация ${i % 13} подаёт декларацию ЭСФ в срок до ${(i % 28) + 1} числа. ` +
        `Beleg ${i * 7} wird ${(i % 9) + 1} Jahre aufbewahrt, Stichtag 2026-${String((i % 12) + 1).padStart(2, "0")}.`,
    );
  }
  return absaetze.join("\n\n");
}

export const PROBEN: { name: string; text: string }[] = [
  { name: "deutsch", text: "Die Meldefrist Schneeeule betraegt vierzehn Tage nach dem Stichtag. Wer sie versaeumt, erhaelt eine Verwarnung. Beleg 4711 wird sieben Jahre aufbewahrt." },
  { name: "russisch", text: "Срок подачи декларации составляет тридцать дней после отчётной даты. Налогообложения, налогообложение, налогообложению: статья 358 НК РК." },
  { name: "gemischt", text: "ст. 358 НК РК: ЭСФ und БИН 123456789012 gelten ab 2026; Frist 30 Tage, Betrag 1 200,50 KZT. Hinweis auf § 7 Abs. 2." },
  { name: "leer", text: "" },
  { name: "sehr lang", text: langerText() },
];
