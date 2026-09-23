import type { Bericht } from "@/lib/pruefung/typen";

// Der Prüfbericht als Gesprächsgrundlage: Nach einer Prüfung kann der Nutzer im Chat nachfragen ("Warum ist das ein
// Verstoß?", "Was genau muss ich tun?"). Damit der Assistent auf DEMSELBEN Ergebnis aufsetzt, bekommt er den Bericht in
// gekürzter Form als Kontext. Bewusst Text und nicht das ganze Objekt: der Wortlaut der Rechtsquellen (Anhang) wird nicht
// mitgeschickt, dafür gibt es wissenSuchen, und Fundstellen stehen im Klartext statt als Kennung (S12), damit sie im Chat
// nicht mit den Zitatmarken der laufenden Wissenssuche verwechselt werden.

/** Obergrenze in Zeichen: der Client kürzt darauf, der Server prüft es erneut. */
export const MAX_KONTEXT_ZEICHEN = 14_000;

const kurz = (text: string, max: number) => (text.length > max ? `${text.slice(0, max).trimEnd()} ...` : text);

export function berichtKontext(b: Bericht): string {
  const kz = b.kennzahlen;
  const fundstelle = new Map(b.belege.map((q) => [q.id, `${q.fundstelle}${q.stufe !== null ? ` (Stufe ${q.stufe})` : ""}`]));
  const zeilen: string[] = [
    `PRÜFBERICHT ${b.id}`,
    `Erstellt am ${b.erstelltAm.slice(0, 10)} von ${b.ersteller.name} (Rolle ${b.ersteller.rolle}), Modell ${b.modell}, Berichtssprache ${b.sprache}.`,
    `Geprüfte Bereiche: ${b.bereiche.join(", ") || "keine"}${b.abgelehnteBereiche.length ? `. Nicht geprüft (keine Freigabe): ${b.abgelehnteBereiche.join(", ")}` : ""}.`,
    `Prüfungsreife ${kz.reife} von 100 (${kz.stufe}): ${kz.nachStatus.verstoss} Verstöße, ${kz.nachStatus.luecke} Lücken, ${kz.nachStatus.hinweis} Hinweise, ${kz.nachStatus.konform} konform.`,
    `Zusammenfassung: ${b.zusammenfassung}`,
  ];
  if (b.prioritaeten.length) zeilen.push(`Prioritäten: ${b.prioritaeten.map((p, i) => `${i + 1}. ${p}`).join(" ")}`);
  zeilen.push("", "BEFUNDE");
  for (const f of b.befunde) {
    const quellen = f.belege.map((id) => fundstelle.get(id)).filter((x): x is string => !!x);
    const teile = [
      `- ${f.titel} [${f.status}, Schwere ${f.schwere}, Bereich ${f.bereich}]: ${kurz(f.befund, 520)}`,
      quellen.length ? `  Rechtsgrundlage: ${quellen.join("; ")}` : f.ohneRechtsbeleg ? "  Ohne gültigen Rechtsbeleg (nur Hinweis)." : "",
      f.nachweise.length ? `  Betriebsdaten: ${f.nachweise.map((n) => n.quelle).join(", ")}` : f.ohneDaten ? "  Ohne Betriebsdaten." : "",
      ...f.massnahmen.map((m) => `  Maßnahme (${m.verantwortlich}, ${m.frist}): ${kurz(m.schritt, 260)}`),
    ].filter(Boolean);
    zeilen.push(teile.join("\n"));
  }
  if (b.hinweise.length || !b.vollstaendig) {
    zeilen.push("", `HINWEISE ZUM LAUF${!b.vollstaendig ? " (Bericht unvollständig)" : ""}`, ...b.hinweise.map((h) => `- ${kurz(h, 200)}`));
  }
  const text = zeilen.join("\n");
  return text.length > MAX_KONTEXT_ZEICHEN ? `${text.slice(0, MAX_KONTEXT_ZEICHEN - 40).trimEnd()}\n[... gekürzt]` : text;
}
