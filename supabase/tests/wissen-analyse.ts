// Tests fuer die Analyse (analyse.ts) und ihre Zusammenfuehrung mit einer KI-Antwort (analyse-ki.ts), ohne Datenbank und ohne Netz.
// Aufruf: npm run test:wissen-analyse (laeuft ueber tsx, damit die @/-Pfade aufloesen).

import { analysiereDokument, stichprobeVon } from "@/lib/wissen/analyse";
import { fuehreZusammen, KI_AUSZUG_ZEICHEN, kiAuszug, parseKiAntwort } from "@/lib/wissen/analyse-ki";

let gesamt = 0;
let fehler = 0;
function pruefe(name: string, ok: boolean, detail = "") {
  gesamt++;
  if (!ok) fehler++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
}

const wiederhole = (absatz: string, zeichen: number) => {
  let s = "";
  while (s.length < zeichen) s += `${absatz}\n\n`;
  return s;
};

// ---- Heuristik -------------------------------------------------------------------------------------------------------------------------------
{
  const steuerbuch = `Handbuch der Umsatzsteuer\nISBN 978-3-12345-678-9\nInhaltsverzeichnis\nKapitel 1 Grundlagen der Umsatzsteuer\nKapitel 2 Vorsteuerabzug\nVorwort\n\n${wiederhole(
    "Die Umsatzsteuer wird auf Lieferungen und Leistungen erhoben. Der Vorsteuerabzug setzt eine ordnungsgemäße Rechnung voraus, die Mehrwertsteuer wird vom Unternehmer abgeführt und vom Finanzamt geprüft.",
    160_000,
  )}`;
  const a = analysiereDokument(steuerbuch, "umsatzsteuer_handbuch.pdf");
  pruefe("Steuerbuch: Bereich Steuern, Quellenart Fachliteratur", a.bereich === "steuer" && a.quellenart === "fachliteratur", `${a.bereich}/${a.quellenart}/${a.sicherheit}`);
  pruefe("Steuerbuch: Sprache Deutsch, Originaltext, hohe Sicherheit", a.sprache === "de" && a.textgrundlage === "original" && a.sicherheit === "hoch");

  const gesetz = Array.from({ length: 40 }, (_, i) => `Статья ${i + 1}. Налогоплательщик обязан уплатить налог на добавленную стоимость в срок, установленный налоговым кодексом.`).join("\n");
  const g = analysiereDokument(`Налоговый кодекс Республики Казахстан\n${gesetz}`, "nk_rk.md");
  pruefe("Russischer Gesetzestext: Bereich Steuern, Quellenart Rechtsnorm (Wortgrenzen mit kyrillischen Merkmalen)", g.bereich === "steuer" && g.quellenart === "rechtsnorm" && g.sprache === "ru", `${g.bereich}/${g.quellenart}/${g.sprache}`);

  const vertrag = Array.from({ length: 30 }, (_, i) => `Статья ${i + 1}. Договор считается заключённым, когда стороны достигли соглашения. Право собственности переходит к покупателю по договору.`).join("\n");
  const v = analysiereDokument(`Гражданский кодекс\n${vertrag}`, "gk.txt");
  pruefe("Russisches Zivilrecht: Bereich Recht", v.bereich === "recht" && v.quellenart === "rechtsnorm");

  const iso = `ISO 31000:2018 Risk management Guidelines\nScope\nThis document provides guidelines on managing risk. Normative references: ISO Guide 73. ${wiederhole(
    "Risk management is an iterative process. The risk assessment identifies risk sources, and risk treatment modifies risk. ISO 31000 describes principles, framework and process.",
    30_000,
  )}`;
  const i = analysiereDokument(iso, "ISO_31000_2018.pdf");
  pruefe("ISO 31000: Bereich Risiko, Quellenart Standard", i.bereich === "risiko" && i.quellenart === "standard" && i.sprache === "en", `${i.bereich}/${i.quellenart}`);

  const ifs = analysiereDokument(`IFS Food Version 8\nScheme rules\nScope\n${wiederhole("The certification body shall audit the HACCP system. IFS Food audit requirements and certification of the supplier audit protocol.", 40_000)}`, "IFS_Food_8.pdf");
  pruefe("IFS Food: Bereich Audit, Quellenart Standard", ifs.bereich === "audit" && ifs.quellenart === "standard", `${ifs.bereich}/${ifs.quellenart}`);

  const urteil = analysiereDokument(`Urteil\nIm Namen des Volkes\nAktenzeichen 5 U 12/24\nDas Gericht hat durch Urteil entschieden. Die Klage wird abgewiesen, die Haftung des Vertrags bleibt bestehen. Das Urteil ist vorläufig vollstreckbar. Beschluss des Gerichts.`, "u.pdf");
  pruefe("Urteil: Quellenart Rechtsprechung", urteil.quellenart === "rechtsprechung" && urteil.bereich === "recht");

  const uebersetzt = analysiereDokument(`${wiederhole("Das Gesetz regelt den Vertrag. Der Kodex der Haftung gilt für das Gericht.", 20_000)}\nAus dem Russischen übersetzt von Anna Beispiel.`, "x.md");
  pruefe("Hinweis auf Übersetzung: fachlich übersetzt", uebersetzt.textgrundlage === "fachlich_uebersetzt");
  const maschinell = analysiereDokument(`${wiederhole("Das Gesetz regelt den Vertrag.", 5_000)}\nMaschinell übersetzt mit DeepL.`, "x.md");
  pruefe("Hinweis auf maschinelle Übersetzung hat Vorrang", maschinell.textgrundlage === "maschinell_uebersetzt");
  const amtlich = analysiereDokument(`${wiederhole("Das Gesetz regelt den Vertrag.", 5_000)}\nOfficial translation of the Ministry.`, "x.md");
  pruefe("Hinweis auf amtliche Übersetzung", amtlich.textgrundlage === "amtlich_uebersetzt");

  const unklar = analysiereDokument("Kurze Notiz zu einem Besuch am Dienstag, nichts Besonderes.", "notiz.txt");
  pruefe("Unklarer Kurztext: niedrige Sicherheit statt falscher Gewissheit", unklar.sicherheit === "niedrig" && unklar.gruende.includes("bereichUnklar"));

  const stichprobe = stichprobeVon("a".repeat(500_000));
  pruefe("Stichprobe: Anfang, Mitte und Ende, nicht der ganze Text", stichprobe.length < 20_000 && stichprobe.length > 15_000, String(stichprobe.length));
}

// ---- KI-Zusammenfuehrung ---------------------------------------------------------------------------------------------------------------------
{
  const heuristik = analysiereDokument(`${wiederhole("Die Umsatzsteuer und der Vorsteuerabzug.", 30_000)}`, "x.pdf");
  pruefe("KI-Auszug: begrenzt und enthält Anfang und Ende", kiAuszug("A".repeat(100_000) + "ENDE").length <= KI_AUSZUG_ZEICHEN + 50 && kiAuszug("A".repeat(100_000) + "ENDE").includes("ENDE"));

  const ok = parseKiAntwort({ bereich: "compliance", quellenart: "praxisbeitrag", textgrundlage: "original", titel: "Datenschutz in der Praxis", begruendung: "Handreichung einer Kanzlei zu DSGVO", sicherheit: "hoch" });
  pruefe("KI-Antwort: gültige Angaben werden übernommen", ok !== null && ok.bereich === "compliance" && ok.quellenart === "praxisbeitrag");
  pruefe("KI-Antwort: unbekannter Bereich oder unbekannte Quellenart wird verworfen", parseKiAntwort({ bereich: "kochen", quellenart: "praxisbeitrag", textgrundlage: "original" }) === null && parseKiAntwort({ bereich: "recht", quellenart: "erfunden", textgrundlage: "original" }) === null);
  pruefe("KI-Antwort: Müll ergibt null, kein Absturz", parseKiAntwort(null) === null && parseKiAntwort("text") === null && parseKiAntwort({}) === null);

  const z = fuehreZusammen(heuristik, ok);
  pruefe("Zusammenführung: die KI-Angaben ersetzen die Heuristik, Herkunft ist KI", z.bereich === "compliance" && z.quellenart === "praxisbeitrag" && z.quelle === "ki" && z.hinweis === "Handreichung einer Kanzlei zu DSGVO");
  pruefe("Zusammenführung: ohne KI-Antwort bleibt die Heuristik", fuehreZusammen(heuristik, null) === heuristik);
  const lang = parseKiAntwort({ bereich: "recht", quellenart: "rechtsnorm", textgrundlage: "original", begruendung: "x".repeat(900) });
  pruefe("KI-Antwort: überlange Begründung wird gekürzt", (lang?.begruendung ?? "").length <= 300);
  const unsicher = fuehreZusammen(heuristik, parseKiAntwort({ bereich: "steuer", quellenart: "fachliteratur", textgrundlage: "original", sicherheit: "niedrig" }));
  pruefe("Zusammenführung: eine niedrige KI-Sicherheit senkt die Sicherheit", unsicher.sicherheit === "niedrig");
}

console.log(`\n${gesamt - fehler}/${gesamt} bestanden`);
if (fehler > 0) process.exit(1);
