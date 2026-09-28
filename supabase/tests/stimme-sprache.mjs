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
// =============================================================================

import { readFileSync } from "node:fs";
import { register } from "node:module";

// Die Module importieren ihre Nachbarn ueber den Alias "@/..." (wie Next).
register(new URL("./hilfen/alias-lader.mjs", import.meta.url), { data: { src: new URL("../../src/", import.meta.url).href } });

const erk = await import("../../src/lib/text/sprache-erkennen.ts");
const chunker = await import("../../src/lib/wissen/chunker.ts");
const { bestimmeAntwortsprache, vorleseSprache, zugAusNachrichten } = await import("../../src/lib/domain/antwortsprache.ts");
const { erzeugeSatzZerleger, saetzeAusAntwort } = await import("../../src/lib/domain/sprachausgabe.ts");
const { satzSprache, ueberwiegendeSchrift, erkenneSprache, erkenneSpracheEindeutig } = erk;

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
  const RU = "Налог уплачивается ежемесячно до двадцать пятого числа.";
  const KK = "Салық айдың жиырма бесінші күніне дейін төленеді.";
  const DE = "Die Lieferung ist heute angekommen und wird gerade geprüft.";
  const EN = "The delivery arrived today and is being checked right now.";

  // Schriftwechsel schaltet um.
  pruefe("satzSprache: de-Zug + russischer Satz -> ru", satzSprache(RU, "de") === "ru", satzSprache(RU, "de"));
  pruefe("satzSprache: de-Zug + kasachischer Satz -> kk", satzSprache(KK, "de") === "kk", satzSprache(KK, "de"));
  pruefe("satzSprache: en-Zug + russischer Satz -> ru", satzSprache(RU, "en") === "ru");
  pruefe("satzSprache: en-Zug + kasachischer Satz -> kk", satzSprache(KK, "en") === "kk");

  // Innerhalb einer Schrift nie pro Satz wechseln.
  pruefe("satzSprache: ru-Zug + kasachischer Satz bleibt ru (kein Wechsel innerhalb Kyrillisch)", satzSprache(KK, "ru") === "ru");
  pruefe("satzSprache: kk-Zug + russischer Satz bleibt kk", satzSprache(RU, "kk") === "kk");
  pruefe("satzSprache: ru-Zug + russischer Satz mit kasachischem Ortsnamen bleibt ru", satzSprache("Поставка из Қостанай прибыла сегодня утром.", "ru") === "ru");
  pruefe("satzSprache: de-Zug + englischer Satz bleibt de (kein Wechsel innerhalb Lateinisch)", satzSprache(EN, "de") === "de");
  pruefe("satzSprache: en-Zug + deutscher Satz bleibt en", satzSprache(DE, "en") === "en");
  pruefe("satzSprache: de-Zug + 'Rufen Sie an.'-Fall bleibt de", satzSprache("Rufen Sie bitte heute noch den Lieferanten an.", "de") === "de");

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
  pruefe("satzSprache: kurzer russischer Satz im de-Zug bleibt de (unter 12 Buchstaben)", satzSprache("Да, верно.", "de") === "de");
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
  pruefe("Knopf: mit Metadaten gelten sie", vorleseSprache("ru", DE, "de") === "ru");
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
  pruefe("Route: jeder data-satz bekommt die Sprache seines Satzes (satzSprache)", /type: "data-satz",[\s\S]{0,400}sprache: satzSprache\(text, antwortSprache\),/.test(route));
  pruefe("Route: data-satz traegt nicht mehr pauschal die Sprache des Zuges", !/type: "data-satz",[\s\S]{0,200}sprache: antwortSprache,/.test(route));
  pruefe("Route: die Frage fuer die Sprachwahl kommt aus zugAusNachrichten (Folgeanfragen)", route.includes("zugAusNachrichten(") && /bestimmeAntwortsprache\(\s*\{[^}]*frage: sprachZug\.frage[^}]*vorigeSprache: sprachZug\.vorigeSprache/.test(route));
  pruefe("Route: die Metadaten der Nachrichten gehen in die Sprachwahl ein", /sprache: \(n\.metadata as \{ sprache\?: unknown \} \| undefined\)\?\.sprache/.test(route));

  const fassade = quelle("src/components/ki/ki-chat-sprache.ts");
  pruefe("Knopf: ohne Metadaten entscheidet der Text (vorleseSprache), nicht die Oberflaeche", fassade.includes("const s = vorleseSprache(antwortSprache, text, sprache);") && !fassade.includes("antwortSprache ?? sprache"));
  pruefe("Antwort ohne Abschnitte: ebenso", fassade.includes("vorleseSprache(antwortSpracheAus(letzte), ganz, sprache)") && !fassade.includes("antwortSpracheAus(letzte) ?? sprache"));

  const live = quelle("src/components/ki/sprachausgabe-live.ts");
  pruefe("Knopf ueber den Strom: je Satz satzSprache, zumSprechen und sprich mit der Satzsprache",
    /const s = satzSprache\(satz, sprache\);\s*return \{ text: zumSprechen\(satz, s\), sprache: s \};/.test(live) && live.includes("s.sprich(t.text, t.sprache)"));
}

// --- 6. Der Strom wechselt die Sprache ---------------------------------------
//     Nachgebauter WebSocket und AudioContext, wie der Strom-Durchlauf in
//     ki-assistent.mjs. Der Sprecher selbst bleibt unveraendert: pumpe() beendet
//     bei anderer Sprache den laufenden Strom und oeffnet nach terminated einen neuen.
{
  const warte = (ms = 15) => new Promise((r) => setTimeout(r, ms));
  class FakeWS {
    static OPEN = 1;
    static alle = [];
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.gesendet = [];
      FakeWS.alle.push(this);
      setTimeout(() => {
        this.readyState = 1;
        this.onopen?.();
      }, 1);
    }
    send(d) {
      this.gesendet.push(JSON.parse(d));
    }
    close() {
      this.readyState = 3;
      this.geschlossen = true;
    }
    empfange(obj) {
      this.onmessage?.({ data: JSON.stringify(obj) });
    }
    starts() {
      return this.gesendet.filter((n) => n.api_key);
    }
  }
  const quellen = [];
  const ctx = {
    currentTime: 0,
    state: "running",
    destination: {},
    resume: async () => {},
    createGain: () => ({ connect() {} }),
    createAnalyser: () => ({ connect() {}, getByteTimeDomainData() {} }),
    createBuffer: (_k, n, rate) => {
      const d = new Float32Array(n);
      return { duration: n / rate, getChannelData: () => d };
    },
    createBufferSource: () => {
      const q = { connect() {}, start(t) { q.startZeit = t; }, stop() { q.gestoppt = true; } };
      quellen.push(q);
      return q;
    },
  };
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
  const pcm = (n) => btoa(String.fromCharCode(...new Uint8Array(n * 2)));
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
  } finally {
    globalThis.WebSocket = alt.ws;
    globalThis.fetch = alt.fetch;
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
