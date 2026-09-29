#!/usr/bin/env node
// =============================================================================
// Damicon - Die Stimme passt zur Sprache des Textes
// =============================================================================
// Ausfuehren:  node supabase/tests/stimme-sprache.mjs
//
// Rueckmeldung vom 28.09.2026: "Wenn ich Deutsch als Systemsprache eingestellt
// habe und dann einen russischen Text vorlesen lasse, liest er das mit der
// deutschen Stimme mit viel Akzent vor. Egal welche Systemsprache eingestellt
// ist, sollte die Stimme zu der jeweiligen Textsprache passen."
//
// Geprueft wird, rein und ohne Netz:
//   1. satzSprache (lib/text/sprache-erkennen.ts): Stimme je Satz, zurueckhaltend.
//   2. Der Zerleger (domain/sprachausgabe.ts) trennt bei einem Schriftwechsel.
//   3. bestimmeAntwortsprache/zugAusNachrichten (domain/antwortsprache.ts):
//      Folgeanfragen und kurze Antworten fallen nicht mehr auf die Oberflaeche.
//   4. vorleseSprache: der Knopf an einer Nachricht ohne Metadaten.
//   5. Quelltext: route.ts, der Knopf und das Live-Vorlesen nutzen das alles.
//   6. Der Strom-Sprecher (components/ki/sprachausgabe-strom.ts) oeffnet fuer
//      einen russischen Satz nach einem deutschen einen zweiten Strom mit der
//      russischen Konfiguration.
//   7. Die Funde der Gegenpruefung vom 28.09.2026 (Fund 1 bis 6): kurze
//      Antworten, Wortlisten, Sprache innerhalb einer Schrift, Ortsnamen,
//      Wechselgrenze, Rest nach Abbruch, Sprachbloecke im Datei-Weg.
// =============================================================================

import { readFileSync } from "node:fs";
import { register } from "node:module";
import { erzeugeAudioKontext, erzeugeFakeWS, pcm, warte } from "./hilfen/attrappen.mjs";

// Die Module importieren ihre Nachbarn ueber den Alias "@/..." (wie Next).
register(new URL("./hilfen/alias-lader.mjs", import.meta.url), { data: { src: new URL("../../src/", import.meta.url).href } });

const erk = await import("../../src/lib/text/sprache-erkennen.ts");
const chunker = await import("../../src/lib/wissen/chunker.ts");
const { bestimmeAntwortsprache, vorleseSprache, zugAusNachrichten } = await import("../../src/lib/domain/antwortsprache.ts");
const { erzeugeSatzZerleger, saetzeAusAntwort } = await import("../../src/lib/domain/sprachausgabe.ts");
const { satzSprache, ueberwiegendeSchrift, erkenneSprache, erkenneSpracheEindeutig, sprachenFuerSaetze, erzeugeSprachFolge } = erk;

// Die Uebersetzungsliste aus Fund 2 (28.09.2026): sieben Satzpaare de/ru. Der Strom-Durchlauf (6)
// und die Sprachfolge (7) pruefen dieselbe Liste - bis zum 29.09.2026 stand sie zweimal hier.
const UEBERSETZUNG_PAARE = [
  ["Die Lieferung kommt morgen früh an.", "Поставка прибудет завтра утром."],
  ["Die Brigade beginnt um sieben Uhr.", "Бригада начинает работу в семь часов."],
  ["Die Kühlkette wird heute geprüft.", "Холодовая цепь проверяется сегодня."],
  ["Die Löhne werden am Freitag gezahlt.", "Зарплата выплачивается в пятницу."],
  ["Der Bericht ist bis Montag fällig.", "Отчёт нужно сдать до понедельника."],
  ["Die Pflücker bekommen neue Kisten.", "Сборщики получают новые ящики."],
  ["Die Waage wird morgen geeicht.", "Весы будут поверены завтра."],
];
const UEBERSETZUNG = "Hier die Übersetzung:\n\n" + UEBERSETZUNG_PAARE.map(([d, r], i) => `${i + 1}. ${d} ${r}`).join("\n");

let bestanden = 0;
let fehlgeschlagen = 0;

function pruefe(name, bedingung, info = "") {
  if (bedingung) {
    bestanden++;
    console.log(`  OK   ${name}${info ? "  " + info : ""}`);
  } else {
    fehlgeschlagen++;
    console.log(`  FEHL ${name}${info ? "  " + info : ""}`);
  }
}

const quelle = (pfad) => readFileSync(new URL(`../../${pfad}`, import.meta.url), "utf8");

// --- 0. Erkennung browserfaehig ----------------------------------------------
{
  const modul = quelle("src/lib/text/sprache-erkennen.ts");
  pruefe("Erkennung: sprache-erkennen.ts importiert nichts aus Node (laeuft im Browser)", !/from "node:/.test(modul) && !/require\(/.test(modul));
  pruefe("Erkennung: chunker.ts reicht dieselben Funktionen weiter", chunker.erkenneSprache === erkenneSprache && chunker.erkenneSpracheEindeutig === erkenneSpracheEindeutig && chunker.lateinischeSprache === erk.lateinischeSprache);
  pruefe("Erkennung: verhaelt sich wie vorher (Russisch, Kasachisch, Englisch-Standard, eindeutig ohne Standard)",
    erkenneSprache("Когда прибыла поставка из Алматы?", 10) === "ru" &&
      erkenneSprache("Алматыдан жеткізілім қашан келді?", 10) === "kk" &&
      erkenneSprache("Lohnabrechnung fristgerecht abgeben", 10) === "en" &&
      erkenneSpracheEindeutig("Lohnabrechnung fristgerecht abgeben", 10) === null &&
      erkenneSprache("kurz", 10) === null);
}

// --- 1. satzSprache: die Stimme je Satz --------------------------------------
{
  const zaehle = (text) => {
    const { kyrillisch, lateinisch } = erk.zaehleSchrift(text);
    return kyrillisch + lateinisch;
  };
  const RU = "Налог уплачивается ежемесячно до двадцать пятого числа.";
  const KK = "Салық айдың жиырма бесінші күніне дейін төленеді.";
  const DE = "Die Lieferung ist heute angekommen und wird gerade geprüft.";
  const EN = "The delivery arrived today and is being checked right now.";

  // Schriftwechsel schaltet um.
  pruefe("satzSprache: de-Zug + russischer Satz -> ru", satzSprache(RU, "de") === "ru", satzSprache(RU, "de"));
  pruefe("satzSprache: de-Zug + kasachischer Satz -> kk", satzSprache(KK, "de") === "kk", satzSprache(KK, "de"));
  pruefe("satzSprache: en-Zug + russischer Satz -> ru", satzSprache(RU, "en") === "ru");
  pruefe("satzSprache: en-Zug + kasachischer Satz -> kk", satzSprache(KK, "en") === "kk");

  // Innerhalb einer Schrift nur bei langen, eindeutigen Saetzen (seit 28.09.2026,
  // Fund 3; vorher nie): ru -> kk mit robustem Nachweis, de <-> en ab 40 Buchstaben.
  pruefe("satzSprache: ru-Zug + kasachischer Satz (Sonderbuchstaben in mehreren Woertern) -> kk", satzSprache(KK, "ru") === "kk");
  pruefe("satzSprache: kk-Zug + kurzer russischer Satz bleibt kk", satzSprache(RU, "kk") === "kk");
  pruefe("satzSprache: ru-Zug + russischer Satz mit kasachischem Ortsnamen bleibt ru", satzSprache("Поставка из Қостанай прибыла сегодня утром.", "ru") === "ru");
  pruefe("satzSprache: de-Zug + langer, eindeutig englischer Satz -> en", satzSprache(EN, "de") === "en");
  pruefe("satzSprache: en-Zug + langer, eindeutig deutscher Satz -> de", satzSprache(DE, "en") === "de");
  pruefe("satzSprache: de-Zug + 'Rufen Sie an.'-Fall bleibt de", satzSprache("Rufen Sie bitte heute noch den Lieferanten an.", "de") === "de");

  // Die Schwellen selbst, je ein Satz knapp darunter und einer genau darauf (Cleanup-Fund 92,
  // 29.09.2026). Vorher lagen die kuerzesten Proben bei 7 und 16 Buchstaben: SATZ_MINDEST_BUCHSTABEN
  // liess sich zwischen 9 und 16, WECHSEL_LATEINISCH_BUCHSTABEN zwischen 17 und 45 verschieben,
  // ohne dass eine Pruefung anschlug.
  pruefe("Schwelle 12: ein russischer Satz mit 11 Buchstaben im de-Zug bleibt de", zaehle("Да, спасибо, ок.") === 11 && satzSprache("Да, спасибо, ок.", "de") === "de");
  pruefe("Schwelle 12: mit 12 Buchstaben wechselt er nach ru", zaehle("Верно, спасибо.") === 12 && satzSprache("Верно, спасибо.", "de") === "ru");
  pruefe("Schwelle 40: ein eindeutig englischer Satz mit 39 Buchstaben im de-Zug bleibt de", zaehle("Please send me all the new reports for this week.") === 39 && satzSprache("Please send me all the new reports for this week.", "de") === "de");
  pruefe("Schwelle 40: mit 40 Buchstaben wechselt er nach en", zaehle("Please send me all the new reports for this month.") === 40 && satzSprache("Please send me all the new reports for this month.", "de") === "en");

  // ru-Zug + lateinischer Satz: nur bei sicherer Erkennung.
  pruefe("satzSprache: ru-Zug + eindeutig deutscher Satz -> de", satzSprache(DE, "ru") === "de", satzSprache(DE, "ru"));
  pruefe("satzSprache: ru-Zug + eindeutig englischer Satz -> en", satzSprache(EN, "ru") === "en", satzSprache(EN, "ru"));
  pruefe("satzSprache: kk-Zug + eindeutig deutscher Satz -> de", satzSprache(DE, "kk") === "de");
  pruefe("satzSprache: ru-Zug + lateinischer Satz ohne Merkmal bleibt ru", satzSprache("Lohnabrechnung fristgerecht abgeben.", "ru") === "ru");

  // Gemischt, Zahlen, Eigennamen: die Sprache des Zuges.
  const polka = "Polka: 1100 kg, Kweli: 500 kg, всего 1600 кг.";
  pruefe("satzSprache: gemischter Satz (Sorten lateinisch, Rest kyrillisch) bleibt beim Zug",
    satzSprache(polka, "ru") === "ru" && satzSprache(polka, "de") === "de" && satzSprache(polka, "kk") === "kk" && satzSprache(polka, "en") === "en");
  pruefe("satzSprache: nur Zahlen und Einheiten bleiben beim Zug", satzSprache("1100 кг / 500 kg / 1600", "de") === "de" && satzSprache("25.09.2026, 14:30", "ru") === "ru");
  pruefe("satzSprache: Himbi in einem russischen Satz -> ru auch im de-Zug", satzSprache("Himbi поможет вам спланировать сегодняшний день.", "de") === "ru");
  pruefe("satzSprache: Damicon in einem kasachischen Satz -> kk im de-Zug", satzSprache("Damicon бүгін жеткізілімді тексереді.", "de") === "kk");
  pruefe("satzSprache: nur Eigennamen im ru-Zug bleiben ru", satzSprache("Himbi, Damicon, Polka, Kweli.", "ru") === "ru");
  pruefe("satzSprache: Himbi in einem deutschen Satz im de-Zug bleibt de", satzSprache("Himbi hilft Ihnen heute beim Planen.", "de") === "de");

  // Kurze Saetze entscheiden nichts.
  pruefe("satzSprache: kurzer russischer Satz im de-Zug bleibt de (7 Buchstaben)", satzSprache("Да, верно.", "de") === "de");
  pruefe("satzSprache: kurzer deutscher Satz im ru-Zug bleibt ru", satzSprache("Ja, genau.", "ru") === "ru");
  pruefe("satzSprache: leerer Text bleibt beim Zug", satzSprache("", "kk") === "kk");

  // Die Schrift selbst.
  pruefe("Schrift: klar kyrillisch, klar lateinisch, gemischt, zu kurz",
    ueberwiegendeSchrift(RU) === "kyrillisch" && ueberwiegendeSchrift(DE) === "lateinisch" && ueberwiegendeSchrift(polka) === null && ueberwiegendeSchrift("Да.") === null);
}

// --- 2. Der Zerleger trennt bei einem Schriftwechsel -------------------------
{
  const antwort =
    "Hier ist die Antwort. Die Frist ist klar geregelt. Налог уплачивается ежемесячно до двадцать пятого числа. Danach prüfen wir die Belege gemeinsam.";
  const alle = (stil, stueckweise) => {
    const z = erzeugeSatzZerleger(stil);
    const raus = [];
    if (stueckweise) for (const wort of antwort.split(/(?<= )/)) raus.push(...z.fuettere(wort));
    else raus.push(...z.fuettere(antwort));
    raus.push(...z.abschliessen());
    return raus.map((a) => a.text);
  };
  for (const stil of ["abschnitte", "saetze"]) {
    for (const stueckweise of [false, true]) {
      const texte = alle(stil, stueckweise);
      const gemischt = texte.filter((t) => /[А-я]/.test(t) && /[A-Za-z]/.test(t));
      const russisch = texte.find((t) => /Налог/.test(t));
      pruefe(`Zerleger ${stil}${stueckweise ? " (Wort fuer Wort)" : ""}: kein Abschnitt mischt deutsche und russische Saetze`, gemischt.length === 0, JSON.stringify(texte));
      pruefe(`Zerleger ${stil}${stueckweise ? " (Wort fuer Wort)" : ""}: der russische Satz steht allein und bekommt die russische Stimme`,
        russisch === "Налог уплачивается ежемесячно до двадцать пятого числа." && satzSprache(russisch, "de") === "ru");
      pruefe(`Zerleger ${stil}${stueckweise ? " (Wort fuer Wort)" : ""}: die deutschen Saetze behalten die deutsche Stimme`,
        texte.filter((t) => t !== russisch).every((t) => satzSprache(t, "de") === "de"));
    }
  }

  // Einsprachig wie vorher: im Stil "abschnitte" werden Saetze weiter zusammengefasst.
  {
    const z = erzeugeSatzZerleger("abschnitte");
    const texte = [...z.fuettere("Hier ist die Antwort. Die Frist ist klar. Die Belege liegen vor. Morgen geht es weiter."), ...z.abschliessen()].map((a) => a.text);
    pruefe("Zerleger: eine einsprachige Antwort wird wie bisher zusammengefasst (erster Satz allein, der Rest gemeinsam)",
      texte.length === 2 && texte[0] === "Hier ist die Antwort." && texte[1] === "Die Frist ist klar. Die Belege liegen vor. Morgen geht es weiter.", JSON.stringify(texte));
    const ru = erzeugeSatzZerleger("abschnitte");
    const ruTexte = [...ru.fuettere("Вот ответ. Срок понятен. Документы на месте. Завтра продолжим."), ...ru.abschliessen()].map((a) => a.text);
    pruefe("Zerleger: eine russische Antwort ebenso", ruTexte.length === 2 && ruTexte[1] === "Срок понятен. Документы на месте. Завтра продолжим.", JSON.stringify(ruTexte));
  }

  // Kurze oder gemischte Saetze trennen nichts: sie haben keine klare Schrift.
  {
    const z = erzeugeSatzZerleger("abschnitte");
    const texte = [...z.fuettere("Hier ist die Antwort. Polka: 1100 kg, всего 1600 кг. Die Belege liegen vor."), ...z.abschliessen()].map((a) => a.text);
    pruefe("Zerleger: ein gemischter Satz (Zahlen, Sorten) trennt nichts", texte.length === 2 && texte[1] === "Polka: 1100 kg, всего 1600 кг. Die Belege liegen vor.", JSON.stringify(texte));
  }

  // Der Knopf nutzt denselben Zerleger.
  {
    const saetze = saetzeAusAntwort("Die Frist ist klar geregelt.\n\nНалог уплачивается ежемесячно до двадцать пятого числа.");
    pruefe("Knopf: saetzeAusAntwort trennt ebenso, jede Stimme passt",
      saetze.length === 2 && satzSprache(saetze[0], "de") === "de" && satzSprache(saetze[1], "de") === "ru", JSON.stringify(saetze));
  }
}

// --- 3. Antwortsprache: Folgeanfrage und kurze Antworten ---------------------
{
  const erkenner = (t) => erkenneSprache(t, 10);
  const verlaufsErkenner = (t) => erkenneSpracheEindeutig(t, 40);
  const bestimme = (nachrichten, oberflaeche, diktatSprachen) => {
    const zug = zugAusNachrichten(nachrichten, verlaufsErkenner);
    return bestimmeAntwortsprache({ frage: zug.frage, oberflaeche, vorigeSprache: zug.vorigeSprache, diktatSprachen }, erkenner);
  };
  const RU_FRAGE = { rolle: "user", text: "Какие поставки пришли сегодня утром?" };
  const RU_ANTWORT = { rolle: "assistant", text: "Сегодня утром пришли две поставки: Polka и Kweli, всего 1600 килограммов.", sprache: "ru" };
  const DE_FRAGE = { rolle: "user", text: "Welche Lieferungen sind heute früh gekommen?" };
  const DE_ANTWORT = { rolle: "assistant", text: "Heute früh sind zwei Lieferungen gekommen, Polka und Kweli, zusammen 1600 Kilogramm.", sprache: "de" };

  // (a) Folgeanfrage: die letzte Nachricht ist vom Assistenten (seiteLesen, Freigabe).
  {
    const folge = [RU_FRAGE, { rolle: "assistant", text: "", sprache: "ru" }];
    const zug = zugAusNachrichten(folge, verlaufsErkenner);
    pruefe("Folgeanfrage: als Frage gilt die letzte Nutzernachricht, nicht ''", zug.frage === RU_FRAGE.text);
    const r = bestimme(folge, "de");
    pruefe("Folgeanfrage: russische Frage bei deutscher Oberflaeche -> ru (nicht mehr die Oberflaeche)", r.sprache === "ru" && r.herkunft === "frage", `${r.sprache} (${r.herkunft})`);
    const ohneMeta = bestimme([RU_FRAGE, { rolle: "assistant", text: "" }], "de");
    pruefe("Folgeanfrage: auch ohne Metadaten der laufenden Antwort -> ru", ohneMeta.sprache === "ru");
    const mitDiktat = bestimme([{ rolle: "user", text: "Wie viele Pflücker sind heute eingeteilt?" }, { rolle: "assistant", text: "" }], "de", ["kk", "kk"]);
    pruefe("Folgeanfrage: das Diktat der Frage gilt weiterhin (genug Text)", mitDiktat.sprache === "kk" && mitDiktat.herkunft === "diktat", `${mitDiktat.sprache} (${mitDiktat.herkunft})`);
    const ersteUndFolge = [bestimme([RU_ANTWORT, { rolle: "user", text: "Да" }], "de"), bestimme([RU_ANTWORT, { rolle: "user", text: "Да" }, { rolle: "assistant", text: "" }], "de")];
    pruefe("Folgeanfrage: erste Anfrage und Folgeanfrage eines Zuges kommen zur selben Sprache", ersteUndFolge[0].sprache === ersteUndFolge[1].sprache && ersteUndFolge[0].sprache === "ru");
  }

  // (b) Kurze Antworten unter der Erkennungsschwelle.
  {
    const da = bestimme([RU_FRAGE, RU_ANTWORT, { rolle: "user", text: "Да" }], "de");
    pruefe("Kurz: 'Да' nach russischem Verlauf bei deutscher Oberflaeche -> ru", da.sprache === "ru" && da.herkunft === "verlauf", `${da.sprache} (${da.herkunft})`);
    const ja = bestimme([DE_FRAGE, DE_ANTWORT, { rolle: "user", text: "Ja" }], "ru");
    pruefe("Kurz: 'Ja' nach deutschem Verlauf bei russischer Oberflaeche -> de", ja.sprache === "de" && ja.herkunft === "verlauf", `${ja.sprache} (${ja.herkunft})`);
    const ie = bestimme([RU_FRAGE, RU_ANTWORT, { rolle: "user", text: "Иә" }], "de");
    pruefe("Kurz: 'Иә' nach russischem Verlauf bleibt ru (kein Wechsel innerhalb Kyrillisch)", ie.sprache === "ru", `${ie.sprache} (${ie.herkunft})`);
    const ok = bestimme([RU_FRAGE, RU_ANTWORT, { rolle: "user", text: "OK" }], "de");
    pruefe("Kurz: 'OK' nach russischem Verlauf -> ru (lateinisch, aber ohne Merkmal)", ok.sprache === "ru" && ok.herkunft === "verlauf", `${ok.sprache} (${ok.herkunft})`);
    const zeichen = bestimme([DE_FRAGE, DE_ANTWORT, { rolle: "user", text: "?" }], "kk");
    pruefe("Kurz: '?' nach deutschem Verlauf -> de", zeichen.sprache === "de" && zeichen.herkunft === "verlauf");
    const daOhne = bestimme([{ rolle: "user", text: "Да" }], "de");
    pruefe("Kurz: 'Да' ohne Verlauf bei deutscher Oberflaeche -> ru (die Schrift ist eindeutig)", daOhne.sprache === "ru" && daOhne.herkunft === "schrift", `${daOhne.sprache} (${daOhne.herkunft})`);
    const ieOhne = bestimme([{ rolle: "user", text: "Иә" }], "en");
    pruefe("Kurz: 'Иә' ohne Verlauf -> kk (kasachischer Sonderbuchstabe)", ieOhne.sprache === "kk" && ieOhne.herkunft === "schrift", `${ieOhne.sprache} (${ieOhne.herkunft})`);
    const daNachDe = bestimme([DE_FRAGE, DE_ANTWORT, { rolle: "user", text: "Да" }], "de");
    pruefe("Kurz: 'Да' nach deutschem Verlauf -> ru (Kyrillisch wird nie deutsch beantwortet)", daNachDe.sprache === "ru" && daNachDe.herkunft === "schrift", `${daNachDe.sprache} (${daNachDe.herkunft})`);
    const danke = bestimme([RU_FRAGE, RU_ANTWORT, { rolle: "user", text: "Danke!" }], "ru");
    pruefe("Kurz: 'Danke!' nach russischem Verlauf -> de (ein unterscheidendes Wort)", danke.sprache === "de" && danke.herkunft === "schrift", `${danke.sprache} (${danke.herkunft})`);
    const jaOhne = bestimme([{ rolle: "user", text: "Ja" }], "ru");
    pruefe("Kurz: 'Ja' ohne Verlauf -> Oberflaeche (nichts spricht fuer eine Sprache)", jaOhne.sprache === "ru" && jaOhne.herkunft === "oberflaeche");
  }

  // (c) Sprache des vorigen Zuges: Metadaten vor Text, Text ohne Metadaten.
  {
    const meta = zugAusNachrichten([RU_FRAGE, { ...RU_ANTWORT, sprache: "kk" }, { rolle: "user", text: "Да" }], verlaufsErkenner);
    pruefe("Vorzug: metadata.sprache der letzten Antwort gilt vor dem Text", meta.vorigeSprache === "kk");
    const ohneMeta = zugAusNachrichten([RU_FRAGE, { rolle: "assistant", text: RU_ANTWORT.text }, { rolle: "user", text: "Да" }], verlaufsErkenner);
    pruefe("Vorzug: ohne Metadaten (geladener Verlauf) entscheidet der Text der letzten Antwort", ohneMeta.vorigeSprache === "ru");
    const kurzerText = zugAusNachrichten(
      [DE_FRAGE, { rolle: "assistant", text: DE_ANTWORT.text }, { rolle: "user", text: "Danke" }, { rolle: "assistant", text: "Erledigt." }, { rolle: "user", text: "OK" }],
      verlaufsErkenner,
    );
    pruefe("Vorzug: gibt die letzte Antwort zu wenig her, zaehlt die Nachricht davor, die genug hat", kurzerText.vorigeSprache === "de", String(kurzerText.vorigeSprache));
    const zuWenig = zugAusNachrichten([{ rolle: "user", text: "Hallo" }, { rolle: "assistant", text: "Erledigt." }, { rolle: "user", text: "OK" }], verlaufsErkenner);
    pruefe("Vorzug: hat kein Text genug Buchstaben, gibt es keinen", zuWenig.vorigeSprache === null);
    const leer = zugAusNachrichten([{ rolle: "user", text: "Да" }], verlaufsErkenner);
    pruefe("Vorzug: ohne Verlauf keiner", leer.vorigeSprache === null && leer.frage === "Да");
    const fremd = zugAusNachrichten([RU_FRAGE, { ...RU_ANTWORT, sprache: "fr" }, { rolle: "user", text: "Да" }], verlaufsErkenner);
    pruefe("Vorzug: unbekannte Metadaten zaehlen nicht, dann der Text", fremd.vorigeSprache === "ru");
  }

  // (d) Unveraendert: lange Fragen entscheiden selbst.
  {
    const r = bestimme([RU_FRAGE, RU_ANTWORT, { rolle: "user", text: "Wie viele Pflücker sind heute eingeteilt?" }], "ru");
    pruefe("Unveraendert: eine deutsche Frage nach russischem Verlauf -> de (die Frage entscheidet)", r.sprache === "de" && r.herkunft === "frage", `${r.sprache} (${r.herkunft})`);
  }
}

// --- 4. vorleseSprache: der Knopf an einer Nachricht --------------------------
{
  const RU = "Сегодня утром пришли две поставки, обе уже проверены и приняты на склад.";
  const KK = "Бүгін таңертең екі жеткізілім келді, екеуі де тексерілді және қоймаға қабылданды.";
  const DE = "Heute früh sind zwei Lieferungen gekommen, beide sind geprüft und eingelagert.";
  pruefe("Knopf: mit Metadaten gelten sie (kurzer oder passender Text)", vorleseSprache("ru", "Erledigt.", "de") === "ru" && vorleseSprache("ru", RU, "de") === "ru");
  pruefe("Knopf: mit Metadaten, aber langer, klar anderssprachiger Text -> der Text (Fund 3)", vorleseSprache("ru", DE, "de") === "de");
  pruefe("Knopf: ohne Metadaten, russischer Text, Oberflaeche de -> ru", vorleseSprache(undefined, RU, "de") === "ru");
  pruefe("Knopf: ohne Metadaten, kasachischer Text, Oberflaeche en -> kk", vorleseSprache(undefined, KK, "en") === "kk");
  pruefe("Knopf: ohne Metadaten, deutscher Text, Oberflaeche ru -> de", vorleseSprache(undefined, DE, "ru") === "de");
  pruefe("Knopf: ohne Metadaten, zu kurzer Text -> Oberflaeche", vorleseSprache(undefined, "Erledigt.", "kk") === "kk");
  pruefe("Knopf: ohne Metadaten, lateinisch ohne Merkmal, Oberflaeche de -> de (nicht der Englisch-Standard)",
    vorleseSprache(undefined, "Lohnabrechnung Kassenbuch Umsatzsteuer Vorsteuer Quartalsmeldung Fristverlaengerung", "de") === "de");
  pruefe("Knopf: unbekannte Oberflaeche -> de", vorleseSprache(undefined, "", "fr") === "de");
}

// --- 5. Quelltext: die Wege nutzen es ----------------------------------------
{
  const route = quelle("src/app/api/ki-assistent/route.ts");
  pruefe("Route: jeder data-satz bekommt die Sprache seines Satzes (Folge je Antwort)", /type: "data-satz",[\s\S]{0,400}sprache: sprachFolge\.naechste\(text\),/.test(route));
  pruefe("Route: data-satz traegt nicht mehr pauschal die Sprache des Zuges", !/type: "data-satz",[\s\S]{0,200}sprache: antwortSprache,/.test(route));
  pruefe("Route: die Frage fuer die Sprachwahl kommt aus zugAusNachrichten (Folgeanfragen)", route.includes("zugAusNachrichten(") && /bestimmeAntwortsprache\(\s*\{[^}]*frage: sprachZug\.frage[^}]*vorigeSprache: sprachZug\.vorigeSprache/.test(route));
  pruefe("Route: die Metadaten der Nachrichten gehen in die Sprachwahl ein", /sprache: \(n\.metadata as \{ sprache\?: unknown \} \| undefined\)\?\.sprache/.test(route));

  const fassade = quelle("src/components/ki/ki-chat-sprache.ts");
  pruefe("Knopf: ohne Metadaten entscheidet der Text (vorleseSprache), nicht die Oberflaeche", fassade.includes("const s = vorleseSprache(antwortSprache, text, sprache);") && !fassade.includes("antwortSprache ?? sprache"));
  pruefe("Antwort ohne Abschnitte: ebenso", fassade.includes("vorleseSprache(antwortSpracheAus(letzte), ganz, sprache)") && !fassade.includes("antwortSpracheAus(letzte) ?? sprache"));

  const live = quelle("src/components/ki/sprachausgabe-live.ts");
  pruefe("Knopf ueber den Strom: je Satz die Sprache der Folge, zumSprechen und sprich mit derselben Sprache",
    live.includes("const sprachen = sprachenFuerSaetze(saetze, sprache);") &&
      live.includes("text: zumSprechen(satz, sprachen[stelle]!), sprache: sprachen[stelle]!") &&
      live.includes("s.sprich(t.text, t.sprache)"));
}

// --- 6. Der Strom wechselt die Sprache ---------------------------------------
//     Nachgebauter WebSocket und AudioContext aus hilfen/attrappen.mjs, dieselben wie
//     im Strom-Durchlauf von ki-assistent.mjs. Der Sprecher selbst bleibt unveraendert:
//     pumpe() beendet bei anderer Sprache den laufenden Strom und oeffnet nach
//     terminated einen neuen.
{
  const FakeWS = erzeugeFakeWS();
  const { ctx } = erzeugeAudioKontext();
  const alt = { ws: globalThis.WebSocket, fetch: globalThis.fetch };
  const konfigurationen = {
    de: { model: "tts-rt-v2", language: "de", voice: "Lena", audio_format: "pcm_s16le", sample_rate: 24000, speed: 1.2 },
    ru: { model: "tts-rt-v2", language: "ru", voice: "Maya", audio_format: "pcm_s16le", sample_rate: 24000, speed: 1.1 },
  };
  const abrufe = [];
  let nr = 0;
  globalThis.WebSocket = FakeWS;
  globalThis.fetch = async (url, init) => {
    if (String(url) !== "/api/ki-sprachausgabe/schluessel") throw new Error("unerwarteter fetch " + url);
    abrufe.push(JSON.parse(init.body));
    nr++;
    return new Response(JSON.stringify({ schluessel: `tmp-${nr}`, adresse: "wss://tts-rt.eu.soniox.com/tts-websocket", konfigurationen, gueltigMs: 60_000 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const modul = await import("../../src/components/ki/sprachausgabe-strom.ts?fall=stimme-sprache");
    const aufgaben = [];
    const s = modul.erzeugeStromSprecher(() => ctx, { beiZustand: () => {}, beiAufgabe: (grund, n) => aufgaben.push({ grund, n }) });
    s.setzeNachweis({ art: "zug", zug: "z-sprache", ablauf: Date.now() + 60_000, sig: "cd34" });
    await warte();
    const deutsch = "Die Frist ist klar geregelt.";
    const russisch = "Налог уплачивается ежемесячно до двадцать пятого числа.";
    s.sprich(deutsch, satzSprache(deutsch, "de"));
    s.sprich(russisch, satzSprache(russisch, "de"));
    s.ende();
    await warte();
    const ws = FakeWS.alle.at(-1);
    const erster = ws.starts();
    pruefe("Strom-Sprachwechsel: der erste Strom spricht de (Lena) und bekommt nur den deutschen Satz",
      erster.length === 1 && erster[0].language === "de" && erster[0].voice === "Lena" &&
        ws.gesendet.filter((n) => n.stream_id === erster[0].stream_id && typeof n.text === "string" && n.text.trim()).map((n) => n.text.trim()).join("|") === deutsch);
    pruefe("Strom-Sprachwechsel: fuer den russischen Satz wird der deutsche Strom beendet (text_end), noch kein zweiter geoeffnet",
      ws.gesendet.some((n) => n.text_end === true && n.stream_id === erster[0].stream_id));
    ws.empfange({ stream_id: erster[0].stream_id, audio: pcm(2400) });
    ws.empfange({ stream_id: erster[0].stream_id, audio_end: true });
    ws.empfange({ stream_id: erster[0].stream_id, terminated: true });
    await warte();
    const beide = ws.starts();
    pruefe("Strom-Sprachwechsel: nach terminated oeffnet ein zweiter Strom mit der ru-Konfiguration (Maya, ru)",
      beide.length === 2 && beide[1].language === "ru" && beide[1].voice === "Maya" && beide[1].speed === 1.1 && beide[1].stream_id !== erster[0].stream_id, JSON.stringify(beide.map((b) => b.language)));
    pruefe("Strom-Sprachwechsel: der zweite Strom bekommt den russischen Satz", ws.gesendet.some((n) => n.stream_id === beide[1]?.stream_id && n.text === `${russisch} `));
    pruefe("Strom-Sprachwechsel: der zweite Strom hat einen eigenen Schluessel", beide[1]?.api_key !== erster[0].api_key && abrufe.length >= 2);
    pruefe("Strom-Sprachwechsel: der Strom gibt dabei nicht auf", aufgaben.length === 0, JSON.stringify(aufgaben));
    s.stopp();

    // Fund 2 (28.09.2026): eine Uebersetzungsliste mit sieben Satzpaaren kostete
    // 14 Stroeme und 14 Schluessel - die Grenze liegt bei 12 je Minute. Mit der
    // Folge (sprachenFuerSaetze) hoechstens 5.
    {
      const saetze = saetzeAusAntwort(UEBERSETZUNG);
      const sprachen = sprachenFuerSaetze(saetze, "de");
      const aufgaben2 = [];
      const s2 = modul.erzeugeStromSprecher(() => ctx, { beiZustand: () => {}, beiAufgabe: (grund, n) => aufgaben2.push({ grund, n }) });
      const abrufeVorher = abrufe.length;
      s2.setzeNachweis({ art: "nachricht", nachrichtId: "11111111-2222-4333-8444-555555555555" });
      await warte();
      saetze.forEach((t, i) => s2.sprich(t, sprachen[i]));
      s2.ende();
      const beendet = new Set();
      for (let runde = 0; runde < 40; runde++) {
        await warte();
        const ws = FakeWS.alle.at(-1);
        for (const start of ws.starts()) {
          if (beendet.has(start.stream_id)) continue;
          beendet.add(start.stream_id);
          ws.empfange({ stream_id: start.stream_id, audio: pcm(240) });
          ws.empfange({ stream_id: start.stream_id, audio_end: true });
          ws.empfange({ stream_id: start.stream_id, terminated: true });
        }
      }
      const schluessel = abrufe.length - abrufeVorher;
      pruefe("Fund 2: sieben Satzpaare de/ru im Strom kosten hoechstens 5 Schluessel (vorher 14)", schluessel <= 5 && schluessel >= 2, `${schluessel} Schluessel, ${beendet.size} Stroeme`);
      pruefe("Fund 2: ... und der Strom gibt dabei nicht auf", aufgaben2.length === 0, JSON.stringify(aufgaben2));
      s2.stopp();
    }
  } finally {
    globalThis.WebSocket = alt.ws;
    globalThis.fetch = alt.fetch;
  }
}

// --- 7. Funde der Gegenpruefung vom 28.09.2026 ------------------------------
//     Jeder Block zeigt einen bestaetigten Fund.
{
  const sa = await import("../../src/lib/domain/sprachausgabe.ts");
  const { vorlesePlan } = sa;
  const wechsel = (sprachen) => sprachen.slice(1).filter((s, i) => s !== sprachen[i]).length;
  const erkenner = (t) => erkenneSprache(t, 10);
  const verlaufsErkenner = (t) => erkenneSpracheEindeutig(t, 40);
  const bestimme = (nachrichten, oberflaeche) => {
    const zug = zugAusNachrichten(nachrichten, verlaufsErkenner);
    return bestimmeAntwortsprache({ frage: zug.frage, oberflaeche, vorigeSprache: zug.vorigeSprache }, erkenner);
  };
  const DE_VERLAUF = [
    { rolle: "user", text: "Welche Lieferungen sind heute früh gekommen?" },
    { rolle: "assistant", text: "Heute früh sind zwei Lieferungen gekommen, Polka und Kweli, zusammen 1600 Kilogramm.", sprache: "de" },
  ];
  const EN_VERLAUF = [
    { rolle: "user", text: "Which deliveries arrived this morning?" },
    { rolle: "assistant", text: "Two deliveries arrived this morning, Polka and Kweli, 1600 kilograms in total.", sprache: "en" },
  ];

  // Fund 1: eine kurze lateinische Antwort ab 10 Buchstaben ohne Merkwort wurde englisch.
  for (const antwort of ["Mach weiter", "Brigade Nord zuerst", "Zeig Details", "Okay, weiter", "Klingt gut, los", "Lohnabrechnung Brigade Nord", "Die Lohnabrechnung zuerst"]) {
    const r = bestimme([...DE_VERLAUF, { rolle: "user", text: antwort }], "de");
    pruefe(`Fund 1: '${antwort}' nach deutschem Verlauf bleibt de`, r.sprache === "de", `${r.sprache} (${r.herkunft})`);
  }
  {
    const r = bestimme([...EN_VERLAUF, { rolle: "user", text: "Lohnabrechnung Brigade Nord" }], "de");
    pruefe("Fund 1: ohne Merkmal nach englischem Verlauf bleibt es en (Verlauf vor Oberflaeche)", r.sprache === "en" && r.herkunft === "verlauf", `${r.sprache} (${r.herkunft})`);
    const ohne = bestimme([{ rolle: "user", text: "Lohnabrechnung Brigade Nord" }], "ru");
    pruefe("Fund 1: ohne Merkmal und ohne Verlauf entscheidet die Oberflaeche, nicht der Englisch-Standard", ohne.sprache === "ru" && ohne.herkunft === "oberflaeche", `${ohne.sprache} (${ohne.herkunft})`);
    const lang = bestimme([...DE_VERLAUF, { rolle: "user", text: "Please show me the deliveries for tomorrow and the open tasks." }], "de");
    pruefe("Fund 1: eine eindeutig englische Frage nach deutschem Verlauf wird weiter englisch beantwortet", lang.sprache === "en" && lang.herkunft === "frage", `${lang.sprache} (${lang.herkunft})`);
  }
  pruefe("Wortlisten: 'die', 'zuerst', 'mach', 'weiter' zaehlen fuer Deutsch",
    erk.lateinischeSprache("die Lohnabrechnung") === "de" && erk.lateinischeSprache("zuerst") === "de" && erkenneSpracheEindeutig("Mach das bitte zuerst", 1) === "de");
  pruefe("Wortlisten: 'the', 'show', 'next', 'please' zaehlen fuer Englisch", erkenneSpracheEindeutig("show the next one please", 1) === "en");
  pruefe("Wortlisten: mehrdeutige Kurzwoerter ('an', 'a', 'I') entscheiden nichts", erk.lateinischeSprache("Rufen an") === null && erk.lateinischeSprache("Klasse A") === null && erk.lateinischeSprache("I") === null);
  pruefe("Eindeutig: ein einzelnes Merkwort reicht nicht mehr", erkenneSpracheEindeutig("Lieferung heute", 1) === null && erkenneSpracheEindeutig("Delivery today", 1) === null);
  pruefe("Eindeutig: verlangt einen Abstand (3 zu 2 ist kein Ergebnis)", erkenneSpracheEindeutig("die und ist the and", 1) === null);

  // Fund 3: innerhalb derselben Schrift gewannen Metadaten und Zug gegen einen klar anderen Text.
  {
    const EN_MAIL = "Dear supplier, please confirm the delivery of 1100 kilograms of raspberries for tomorrow morning. Kind regards.";
    const KK_TEXT = "Құрметті жеткізуші, ертеңгі таңға 1100 килограмм таңқурай жеткізілетінін растаңыз. Бізге бүгін кешке дейін хабарласыңыз.";
    pruefe("Fund 3: Knopf, Metadaten de, klar englischer Text -> en", vorleseSprache("de", EN_MAIL, "de") === "en", vorleseSprache("de", EN_MAIL, "de"));
    pruefe("Fund 3: Knopf, Metadaten ru, klar kasachischer Text -> kk", vorleseSprache("ru", KK_TEXT, "de") === "kk", vorleseSprache("ru", KK_TEXT, "de"));
    pruefe("Fund 3: Knopf, Metadaten ru, kurzer Text -> Metadaten", vorleseSprache("ru", "Erledigt, danke.", "de") === "ru");
    const EN_SATZ = "Please confirm the delivery of the raspberries for tomorrow morning.";
    pruefe("Fund 3: de-Zug, langer eindeutig englischer Satz -> en", satzSprache(EN_SATZ, "de") === "en", satzSprache(EN_SATZ, "de"));
    pruefe("Fund 3: de-Zug, kurzer englischer Satz bleibt de (16 Buchstaben, die Grenze selbst pruefen die Schwellen-Paare oben)", satzSprache("Please call me back.", "de") === "de");
    pruefe("Fund 3: en-Zug, langer eindeutig deutscher Satz -> de", satzSprache("Bitte bestätigen Sie die Lieferung der Himbeeren für morgen früh.", "en") === "de");
    pruefe("Fund 3: ru-Zug, kasachischer Satz mit robustem Nachweis -> kk", satzSprache("Салық айдың жиырма бесінші күніне дейін төленеді.", "ru") === "kk");
    const RU_LANG = "Налог уплачивается ежемесячно до двадцать пятого числа, отчёт подаётся вместе с платежом.";
    pruefe("Fund 3: kk-Zug, langer russischer Satz ganz ohne Sonderbuchstaben -> ru", satzSprache(RU_LANG, "kk") === "ru", satzSprache(RU_LANG, "kk"));
    pruefe("Fund 3: kk-Zug, kurzer russischer Satz bleibt kk (unter 60 Buchstaben)", satzSprache("Налог уплачивается ежемесячно до двадцать пятого числа.", "kk") === "kk");
    const gemischt = "Gern, hier ist der Entwurf für die Mail:\n\nDear supplier, please confirm the delivery of 1100 kilograms of raspberries for tomorrow morning. We will pick them up at the gate.\n\nSoll ich die Mail so abschicken?";
    pruefe("Fund 3: gemischte Antwort (deutsche Einleitung, englische Mail) behaelt die Metadaten", vorleseSprache("de", gemischt, "de") === "de");
    const saetze = sa.saetzeAusAntwort(gemischt);
    const sprachen = sprachenFuerSaetze(saetze, "de");
    pruefe("Fund 3: ... und je Satz: Einleitung de, Mail en, Rueckfrage de", sprachen[0] === "de" && sprachen.includes("en") && sprachen.at(-1) === "de" && wechsel(sprachen) === 2, JSON.stringify(sprachen));
  }

  // Fund 4: ein einzelner kasachischer Ortsname machte einen russischen Satz kasachisch.
  {
    const KOSTANAI = "Поставка прибыла в Қостанай вчера вечером.";
    const OSKEMEN = "Отправьте отчёт в Өскемен до пятницы, пожалуйста, это важно.";
    pruefe("Fund 4: de-Zug, russischer Satz mit 'Қостанай' -> ru", satzSprache(KOSTANAI, "de") === "ru", satzSprache(KOSTANAI, "de"));
    pruefe("Fund 4: en-Zug, ebenso -> ru", satzSprache(KOSTANAI, "en") === "ru");
    pruefe("Fund 4: de-Zug, russischer Satz mit 'Өскемен' -> ru", satzSprache(OSKEMEN, "de") === "ru");
    const RU_ANTWORT = "Поставка прибыла в Қостанай вчера вечером, всё проверено и принято на склад.";
    pruefe("Fund 4: Knopf ohne Metadaten, russische Antwort mit 'Қостанай' -> ru", vorleseSprache(undefined, RU_ANTWORT, "ru") === "ru", vorleseSprache(undefined, RU_ANTWORT, "ru"));
    pruefe("Fund 4: Erkennung eindeutig: ein Ortsname ist kein Kasachisch", erkenneSpracheEindeutig(RU_ANTWORT, 40) === "ru");
  }

  // Cleanup-Funde 40/41 (29.09.2026): die Stimme hielt sich seit Fund 4 an die robuste Regel, die
  // Antwortsprache nicht. Eine getippte russische Frage mit einem kasachischen Ortsnamen bekam eine
  // kasachische Antwort - sogar mitten in einem russischen Gespraech, weil die Frage vor dem Verlauf
  // entscheidet. Jetzt gilt EINE Regel (kasachischNachweis in lib/text/sprache-erkennen.ts).
  {
    const RU_VERLAUF = [
      { rolle: "user", text: "Какие поставки пришли сегодня утром?" },
      { rolle: "assistant", text: "Сегодня утром пришли две поставки, всего 1600 килограммов.", sprache: "ru" },
    ];
    const KK_VERLAUF = [
      { rolle: "user", text: "Бүгін қандай жеткізілімдер келді?" },
      { rolle: "assistant", text: "Бүгін таңертең екі жеткізілім келді, барлығы 1600 килограмм.", sprache: "kk" },
    ];
    for (const [frage, oberflaeche, verlauf] of [
      ["Сколько клубники отгрузили в Қостанай сегодня?", "de", RU_VERLAUF],
      ["Поставка прибыла в Қостанай вчера вечером.", "de", []],
      ["Покажи задачи бригады Қызылжар на сегодня", "ru", []],
      ["Отправьте отчёт в Өскемен до пятницы, пожалуйста.", "en", []],
      ["Поставка прибыла в Қостанай вчера вечером.", "kk", RU_VERLAUF],
    ]) {
      const r = bestimme([...verlauf, { rolle: "user", text: frage }], oberflaeche);
      pruefe(`Fund 40: russische Frage mit kasachischem Ortsnamen -> ru ('${frage.slice(0, 32)}...', Oberflaeche ${oberflaeche}, ${verlauf.length ? "mit" : "ohne"} Verlauf)`, r.sprache === "ru", `${r.sprache} (${r.herkunft})`);
    }
    // Die Gegenrichtung bleibt: echtes Kasachisch wird kasachisch beantwortet.
    const kkFrage = bestimme([{ rolle: "user", text: "Алматыдан жеткізілім қашан келді?" }], "ru");
    pruefe("Fund 40: eine kasachische Frage (Sonderbuchstaben in mehreren Woertern) -> kk, auch bei russischer Oberflaeche", kkFrage.sprache === "kk" && kkFrage.herkunft === "frage", `${kkFrage.sprache} (${kkFrage.herkunft})`);
    // Ein einziges Wort mit Sonderbuchstaben entscheidet nichts - weder fuer kk (der Ortsname) noch
    // gegen kk: eine kurze kasachische Frage mit nur einem solchen Wort folgt dem Gespraech.
    const kurzKk = bestimme([...KK_VERLAUF, { rolle: "user", text: "Бүгін не бар?" }], "ru");
    pruefe("Fund 40: eine kurze kasachische Frage mit nur einem Merkwort bleibt im kasachischen Gespraech kk", kurzKk.sprache === "kk" && kurzKk.herkunft === "verlauf", `${kurzKk.sprache} (${kurzKk.herkunft})`);
    const ieOhne = bestimme([{ rolle: "user", text: "Жоқ" }], "de");
    pruefe("Fund 40: kurze Antworten unter der Entscheidungsschwelle ('Жоқ') bleiben ohne Verlauf kk", ieOhne.sprache === "kk" && ieOhne.herkunft === "schrift", `${ieOhne.sprache} (${ieOhne.herkunft})`);
    // Die Regel selbst, an ihrer einen Stelle.
    const { kasachischNachweis } = erk;
    pruefe(
      "Fund 41: kasachischNachweis - Ortsname offen, mehrere Merkwoerter kasachisch, keine Sonderbuchstaben russisch",
      typeof kasachischNachweis === "function" &&
        kasachischNachweis("Поставка прибыла в Қостанай вчера вечером.") === "offen" &&
        kasachischNachweis("Алматыдан жеткізілім қашан келді?") === "kasachisch" &&
        kasachischNachweis("Когда прибыла поставка из Алматы?") === "russisch" &&
        kasachischNachweis("Иә") === "offen",
    );
    pruefe(
      "Fund 41: dieselbe Regel in allen Erkennern - ein Ortsname macht keinen Text kasachisch, auch nicht den groben",
      erkenneSprache("Поставка прибыла в Қостанай вчера вечером.", 10) === "ru" && erkenneSpracheEindeutig("Поставка прибыла в Қостанай вчера вечером.", 10) === "ru",
    );
  }

  // Fund 5: lateinischer Satz im ru-Zug, "an" machte deutschen Text englisch, ein Umlaut Namenslisten deutsch.
  {
    pruefe("Fund 5: 'an' macht einen deutschen Satz nicht englisch", satzSprache("Сегодня: Lieferung Polka 1100 kg an Kunde Frische GmbH.", "ru") !== "en", satzSprache("Сегодня: Lieferung Polka 1100 kg an Kunde Frische GmbH.", "ru"));
    pruefe("Fund 5: eine Namensliste mit einem Umlaut bleibt beim Zug", satzSprache("Pflücker: Ivanov, Petrov, Sidorov, Smirnov.", "ru") === "ru");
    pruefe("Fund 5: ein eindeutig deutscher Satz mit 'an' wird deutsch", satzSprache("Die Lieferung geht heute an Frische GmbH.", "ru") === "de", satzSprache("Die Lieferung geht heute an Frische GmbH.", "ru"));
  }

  // Fund 2: jeder Schriftwechsel kostete einen Strom und einen Schluessel (12 je Minute).
  {
    const saetze = sa.saetzeAusAntwort(UEBERSETZUNG);
    const sprachen = sprachenFuerSaetze(saetze, "de");
    pruefe("Fund 2: hoechstens 4 Sprachwechsel je Antwort (statt 14)", wechsel(sprachen) <= 4, `${wechsel(sprachen)} Wechsel: ${sprachen.join(",")}`);
    pruefe("Fund 2: bis zur Grenze wechselt die Stimme mit der Schrift", sprachen.includes("ru") && sprachen[0] === "de");
    const folge = erzeugeSprachFolge("de");
    const schrittweise = saetze.map((s) => folge.naechste(s));
    pruefe("Fund 2: dieselbe Vergabe im Server-Weg (Satz fuer Satz) wie im Knopf-Weg (alle auf einmal)", JSON.stringify(schrittweise) === JSON.stringify(sprachen));
    const einschub = sprachenFuerSaetze(["Налог уплачивается ежемесячно до двадцать пятого числа.", "1600 кг.", "Срок уплаты продлевается только в особых случаях."], "de");
    pruefe("Fund 2: ein kurzer Einschub zwischen zwei russischen Saetzen wird russisch (kein Wechsel)", einschub.every((s) => s === "ru"), einschub.join(","));
    const kurzLatein = sprachenFuerSaetze(["Налог уплачивается ежемесячно до двадцать пятого числа.", "OK.", "Срок уплаты продлевается только в особых случаях."], "ru");
    pruefe("Fund 2: ein 'OK.' im ru-Zug schaltet nicht um", kurzLatein.every((s) => s === "ru"));
    pruefe("Fund 2: satzSprache und die Folge sind sich fuer einen einzelnen Satz einig", sprachenFuerSaetze(["Поставка прибыла в Қостанай вчера вечером."], "de")[0] === satzSprache("Поставка прибыла в Қостанай вчера вечером.", "de"));
    const route = quelle("src/app/api/ki-assistent/route.ts");
    pruefe("Fund 2: die Route vergibt die Sprache je data-satz ueber EINE Folge je Antwort", route.includes("erzeugeSprachFolge(antwortSprache)") && /type: "data-satz",[\s\S]{0,500}sprache: sprachFolge\.naechste\(text\),/.test(route));
    const live = quelle("src/components/ki/sprachausgabe-live.ts");
    pruefe("Fund 2: der Knopf-Weg vergibt die Sprachen mit derselben Funktion", live.includes("sprachenFuerSaetze(saetze, sprache)"));
    pruefe("Fund 2: gibt der Strom mitten in einer Nachricht auf, liest der Datei-Weg den Rest (kein stiller Abbruch)",
      !/if \(ungesprochen >= n\.saetze\) ohneStrom\.current\?\.\(n\.id\);\s*return;/.test(live) && live.includes("ohneStrom.current?.(n.id, rest)"));
    pruefe("Fund 2: der Rest setzt erst ein, wenn der eingeplante Ton verklungen ist", live.includes("nachholen.current = lies") && /nachholen\.current = null;\s*durchgang\.current \+= 1;/.test(live));
    const fassade = quelle("src/components/ki/ki-chat-sprache.ts");
    pruefe("Fund 2: die Fassade reicht den Rest an den Datei-Weg weiter", fassade.includes("(id: string, rest?: number)") && fassade.includes("spieleDatei(id, nachrichtSprache.current.get(id), rest)"));
  }

  // Fund 6: der Datei-Weg las gemischte Antworten mit einer Stimme.
  {
    const gemischt = "Die Frist ist klar geregelt.\n\nНалог уплачивается ежемесячно до двадцать пятого числа.\n\nDanach prüfen wir die Belege gemeinsam.";
    const plan = vorlesePlan(gemischt, "de");
    pruefe("Fund 6: Plan zerlegt in Sprachbloecke (de, ru, de)", plan.bloecke.map((b) => b.sprache).join(",") === "de,ru,de", JSON.stringify(plan.bloecke));
    pruefe("Fund 6: jeder Block traegt nur seinen Text", plan.bloecke[1]?.text === "Налог уплачивается ежемесячно до двадцать пятого числа." && plan.bloecke[0]?.von === 0 && plan.bloecke[2]?.bis === 3);
    const einsprachig = vorlesePlan("Die Frist ist klar geregelt. Danach prüfen wir die Belege gemeinsam.", "de");
    pruefe("Fund 6: eine einsprachige Antwort bleibt EIN Block", einsprachig.bloecke.length === 1 && einsprachig.bloecke[0].sprache === "de");
    const rest = vorlesePlan(gemischt, "de", { rest: 1 });
    pruefe("Fund 6: 'rest' liest nur die letzten Saetze, mit derselben Sprache wie im ganzen Plan", rest.bloecke.length === 1 && rest.bloecke[0].von === 2 && rest.bloecke[0].sprache === "de");
    pruefe("Fund 6: ein zu grosser Rest liest alles", vorlesePlan(gemischt, "de", { rest: 99 }).bloecke.length === 3);
    const viele = vorlesePlan("Hier:\n\n" + Array.from({ length: 8 }, (_, i) => `Die Lieferung ${i + 1} kommt morgen früh an. Поставка ${i + 1} прибудет завтра утром.`).join("\n"), "de");
    pruefe("Fund 6: hoechstens 5 Bloecke (4 Wechsel), also hoechstens 5 Anfragen je Nachricht", viele.bloecke.length <= 5, String(viele.bloecke.length));
    pruefe("Fund 6: Metadaten de, ganz englischer Text -> ein englischer Block",
      vorlesePlan("Dear supplier, please confirm the delivery of 1100 kilograms of raspberries for tomorrow morning.", "de").bloecke.map((b) => b.sprache).join() === "en");

    // Cleanup-Fund 27 (29.09.2026): Soniox erzeugt ueber REST etwa in Sprechdauer - gemessen in
    // der Gegenpruefung vom 28.09.2026 41 bis 46 ms je Zeichen (872 Zeichen in 39,9 s). Der
    // Datei-Weg gab trotzdem einen Block bis 3000 Zeichen in EINE Anfrage: nach 30 s brach das
    // Zeitlimit ab (dann las Sokrates mit anderer Stimme, oder es kam 502), der GET-Strom endete an
    // maxDuration (60 s) mitten in der Antwort. Mit Soniox teilt der Plan deshalb an Satzgrenzen.
    {
      const MS_JE_ZEICHEN = 46;
      const saetze = Array.from({ length: 24 }, (_, i) => `Die Lieferung ${i + 1} kommt morgen früh mit dem ersten Wagen am Lager an.`);
      const lang = saetze.join(" ");
      const bisher = process.env.KI_SPRACHAUSGABE_ANBIETER;
      try {
        process.env.KI_SPRACHAUSGABE_ANBIETER = "soniox";
        const plan = sa.vorlesePlan(lang, "de");
        const dauer = plan.bloecke.map((b) => sa.zumSprechen(b.text, b.sprache).length * MS_JE_ZEICHEN);
        const lueckenlos = plan.bloecke.every((b, i) => b.von === (i === 0 ? 0 : plan.bloecke[i - 1].bis)) && plan.bloecke.at(-1)?.bis === saetze.length;
        pruefe(
          "Fund 27: mit Soniox bleibt jeder Block des Datei-Wegs mit Luft unter dem Zeitlimit von 30 s (hier hoechstens 25 s)",
          plan.bloecke.length > 1 && dauer.every((ms) => ms <= 25_000) && lueckenlos && plan.bloecke.every((b) => b.sprache === "de"),
          `${plan.bloecke.length} Bloecke, ${dauer.map((ms) => (ms / 1000).toFixed(1)).join("/")} s`,
        );
        pruefe("Fund 27: ... eine kurze Antwort bleibt auch mit Soniox EIN Block (ihr Ablagepfad bleibt)", sa.vorlesePlan(saetze.slice(0, 3).join(" "), "de").bloecke.length === 1);
        process.env.KI_SPRACHAUSGABE_ANBIETER = "sokrates";
        pruefe("Fund 27: ... und mit Sokrates (schnell, eine Datei ohne Luecken) bleibt die lange Antwort ein Block", sa.vorlesePlan(lang, "de").bloecke.length === 1);
      } finally {
        if (bisher === undefined) delete process.env.KI_SPRACHAUSGABE_ANBIETER;
        else process.env.KI_SPRACHAUSGABE_ANBIETER = bisher;
      }
    }
    const teilPfad = sa.sprachausgabePfad("n1", { anbieter: "sokrates", stimme: "ru-female", sprache: "ru" }, { von: 1, bis: 2 });
    pruefe("Fund 6: ein Block hat einen eigenen Ablagepfad, der ganze Text den bisherigen", teilPfad === "n1/sokrates-ru-female-ru-v4-s1-2.mp3" && sa.sprachausgabePfad("n1", { anbieter: "sokrates", stimme: "de-female", sprache: "de" }) === "n1/sokrates-de-female-de-v4.mp3", teilPfad);
    const route = quelle("src/app/api/ki-sprachausgabe/route.ts");
    pruefe("Fund 6: die Route zerlegt die GESPEICHERTE Nachricht (vorlesePlan(nachricht.inhalt ...))", route.includes("vorlesePlan(nachricht.inhalt,"));
    pruefe("Fund 6: vom Browser kommen nur Zahlen (rest, block), nie Text", !/searchParams\.get\("text"\)/.test(route) && route.includes('adresse.searchParams.get("block")') && route.includes('adresse.searchParams.get("rest")') && !/body\.text\b/.test(route));
    pruefe("Fund 6: ein Block ausserhalb des Plans wird abgelehnt", route.includes('fehler(422, "kein-block")'));
    pruefe("Fund 6: der Plan (plan=1) liefert nur die Zahl der Bloecke", route.includes('adresse.searchParams.get("plan") === "1"') && route.includes("Response.json({ bloecke:"));
    const knopf = quelle("src/components/ki/sprachausgabe.tsx");
    pruefe("Fund 6: der Knopf spielt die Bloecke nacheinander, den Plan fragt er erst nach dem ersten play()",
      knopf.includes("&plan=1") && knopf.includes("&block=${block}") && knopf.indexOf("const gestartet = audio.play();") < knopf.indexOf("void bloecke();"));
  }
}

console.log("\n----------------------------------------------------------");
console.log(`Pruefungen: ${bestanden + fehlgeschlagen}   bestanden: ${bestanden}   fehlgeschlagen: ${fehlgeschlagen}`);
if (fehlgeschlagen) {
  console.log("Es gibt fehlgeschlagene Pruefungen.");
  process.exit(1);
}
console.log("Alle Pruefungen bestanden.");
process.exit(0);
