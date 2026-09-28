#!/usr/bin/env node
// =============================================================================
// Damicon - Himbi als Tagesbegleiter (Rueckmeldung vom 28.09.2026)
// =============================================================================
// Ausfuehren:  node supabase/tests/himbi-tagesbegleiter.mjs
//
// "Himbi soll mit mir interagieren, zum Beispiel mir vorschlagen, was ich heute machen kann,
// was dringende Themen sind, und mir helfen, den Tag zu organisieren. Er soll mir Fragen
// stellen!" Geprueft wird ohne Netz und ohne Datenbank:
//   1. der Tagesmerker (src/lib/himbi-tagesbeginn.ts): einmal am Tag je Nutzer, Tag in Almaty,
//      gesperrter Speicher,
//   2. die Anweisung TAGESBEGLEITER und "heute" (src/lib/domain/antwort-anweisungen.ts) und
//      ihr Platz im Systemprompt (src/app/api/ki-assistent/route.ts),
//   3. die Begruessung im Sprachmodus und die Sprechblase (Quelltextpruefungen),
//   4. Texte in allen vier Sprachen, Einstellung mit Voreinstellung an, Handbuch.
// =============================================================================

import { readFileSync } from "node:fs";
import { register } from "node:module";
import {
  heuteAnweisung,
  sprachmodusFormatAnweisung,
  TAGESBEGLEITER,
} from "../../src/lib/domain/antwort-anweisungen.ts";

// Der Tagesmerker importiert seine Nachbarn ueber "@/..." (wie Next): derselbe Lader wie in
// ki-assistent.mjs.
register(new URL("./hilfen/alias-lader.mjs", import.meta.url), { data: { src: new URL("../../src/", import.meta.url).href } });
const {
  merkeTagesbeginn,
  TAGESBEGINN_SPEICHER,
  tagesbeginnAusSpeicher,
  tagesbeginnFaellig,
} = await import("../../src/lib/himbi-tagesbeginn.ts");
const { spruchIndex, tagInZone, tageszeitBestimmen } = await import("../../src/lib/domain/tageszeit.ts");

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

// Zeilenenden vereinheitlicht: unter Windows liegen die Dateien mit CRLF im Arbeitsbaum.
const lies = (pfad) => readFileSync(new URL(`../../${pfad}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

/** Nachgebaute Ablage wie localStorage. */
function neueAblage() {
  const daten = new Map();
  return {
    daten,
    getItem: (k) => (daten.has(k) ? daten.get(k) : null),
    setItem: (k, v) => daten.set(k, String(v)),
    removeItem: (k) => daten.delete(k),
  };
}

// --- 1. Tagesmerker ------------------------------------------------------------
console.log("\n1. Tagesmerker (lib/himbi-tagesbeginn.ts)");
{
  // 07:00 bzw. 08:00 in Almaty (UTC+5, aeltere Zeitzonendaten +6) - beides der 28.09.
  const morgens = new Date("2026-09-28T02:00:00Z");
  // 22:00 bzw. 23:00 in Almaty, noch derselbe Tag.
  const abends = new Date("2026-09-28T17:00:00Z");
  // 00:30 bzw. 01:30 in Almaty: schon der 29.09., in UTC aber noch der 28.
  const nachMitternacht = new Date("2026-09-28T19:30:00Z");
  pruefe("Almaty-Tag: 19:30 UTC am 28. ist in Almaty schon der 29.", tagInZone(nachMitternacht) === "2026-09-29", tagInZone(nachMitternacht));

  const a = neueAblage();
  pruefe("Neuer Tag: Gespraech und Blase sind faellig", tagesbeginnFaellig(a, "nutzer-1", "gespraech", morgens) && tagesbeginnFaellig(a, "nutzer-1", "blase", morgens));
  merkeTagesbeginn(a, "nutzer-1", "gespraech", morgens);
  pruefe("Nach dem Gespraech: am selben Tag kein zweites Gespraech", !tagesbeginnFaellig(a, "nutzer-1", "gespraech", abends));
  pruefe("Nach dem Gespraech: auch keine Blase mehr (Tageslage kam schon)", !tagesbeginnFaellig(a, "nutzer-1", "blase", abends));
  pruefe("Gespeichert als JSON {nutzer, tag, arten} unter eigenem Schluessel", (() => {
    const w = JSON.parse(a.getItem(TAGESBEGINN_SPEICHER));
    return TAGESBEGINN_SPEICHER === "damicon-himbi-tagesbeginn" && w.nutzer === "nutzer-1" && w.tag === "2026-09-28" && JSON.stringify(w.arten) === '["gespraech"]';
  })());
  pruefe("Almaty-Tag: nach Mitternacht in Almaty wieder faellig, obwohl in UTC noch derselbe Tag", tagesbeginnFaellig(a, "nutzer-1", "gespraech", nachMitternacht));
  pruefe("Anderer Nutzer am selben Rechner: fuer ihn ist heute noch nichts gewesen", tagesbeginnFaellig(a, "nutzer-2", "gespraech", abends) && tagesbeginnFaellig(a, "nutzer-2", "blase", abends));

  const b = neueAblage();
  merkeTagesbeginn(b, "nutzer-1", "blase", morgens);
  pruefe("Nach der Blase: keine zweite Blase, das Gespraech ist aber noch faellig", !tagesbeginnFaellig(b, "nutzer-1", "blase", abends) && tagesbeginnFaellig(b, "nutzer-1", "gespraech", abends));
  merkeTagesbeginn(b, "nutzer-1", "gespraech", abends);
  merkeTagesbeginn(b, "nutzer-1", "gespraech", abends);
  pruefe("Beide Arten am selben Tag, ohne Doppelte", JSON.stringify(JSON.parse(b.getItem(TAGESBEGINN_SPEICHER)).arten) === '["blase","gespraech"]');
  merkeTagesbeginn(b, "nutzer-1", "blase", nachMitternacht);
  pruefe("Neuer Tag: der alte Eintrag wird ersetzt, nicht fortgeschrieben", (() => {
    const w = JSON.parse(b.getItem(TAGESBEGINN_SPEICHER));
    return w.tag === "2026-09-29" && JSON.stringify(w.arten) === '["blase"]';
  })());

  const kaputt = neueAblage();
  kaputt.setItem(TAGESBEGINN_SPEICHER, "{kein json");
  pruefe("Kaputter Eintrag zaehlt als nichts gemerkt", tagesbeginnFaellig(kaputt, "nutzer-1", "gespraech", morgens));
  merkeTagesbeginn(kaputt, "nutzer-1", "gespraech", morgens);
  pruefe("... und wird beim Merken ueberschrieben", !tagesbeginnFaellig(kaputt, "nutzer-1", "gespraech", morgens));

  const gesperrt = {
    getItem: () => {
      throw new Error("SecurityError");
    },
    setItem: () => {
      throw new Error("SecurityError");
    },
    removeItem: () => {
      throw new Error("SecurityError");
    },
  };
  let geworfen = false;
  try {
    merkeTagesbeginn(gesperrt, "nutzer-1", "gespraech", morgens);
  } catch {
    geworfen = true;
  }
  pruefe("Gesperrter Speicher: nicht faellig (lieber keine Begruessung als eine bei jedem Aufruf), Merken wirft nicht", !tagesbeginnFaellig(gesperrt, "nutzer-1", "gespraech", morgens) && !geworfen);
  pruefe("Ohne Ablage oder ohne Nutzer: nicht faellig", !tagesbeginnFaellig(null, "nutzer-1", "gespraech", morgens) && !tagesbeginnFaellig(neueAblage(), null, "blase", morgens));

  pruefe("Einstellung: Voreinstellung an, nur ein gespeichertes 'aus' schaltet ab", tagesbeginnAusSpeicher(null) && tagesbeginnAusSpeicher(undefined) && tagesbeginnAusSpeicher("an") && tagesbeginnAusSpeicher("kaputt") && !tagesbeginnAusSpeicher("aus"));
}

// --- 1b. Tageszeit (lib/domain/tageszeit.ts) ---------------------------------------
// Befund vom 28.09.2026: tageszeitBestimmen las die Stunde aus format(), das im deutschen
// CLDR-Muster "08 Uhr" liefert; Number("08 Uhr") ist NaN, also kam immer "abend" heraus. Die
// Tests davor prueften nur den Quelltext, deshalb hier echte Aufrufe mit festen UTC-Zeitpunkten.
console.log("\n1b. Tageszeit (lib/domain/tageszeit.ts), echte Aufrufe");
{
  // Asia/Almaty ist UTC+5 (aeltere Zeitzonendaten +6): die Zeitpunkte liegen so, dass beide
  // Versaetze in dieselbe Tageszeit fallen.
  const faelle = [
    ["2026-09-28T19:00:00Z", "morgen", "Mitternacht in Almaty (00:00 bzw. 01:00), nicht 24 Uhr"],
    ["2026-09-28T02:00:00Z", "morgen", "07:00 bzw. 08:00 in Almaty"],
    ["2026-09-28T08:00:00Z", "tag", "13:00 bzw. 14:00 in Almaty"],
    ["2026-09-28T15:00:00Z", "abend", "20:00 bzw. 21:00 in Almaty"],
  ];
  for (const [utc, erwartet, wann] of faelle) {
    const ist = tageszeitBestimmen(new Date(utc));
    pruefe(`tageszeitBestimmen: ${wann} ist "${erwartet}"`, ist === erwartet, `ist: ${ist}`);
  }
  // Die Grenzen genau, mit festem Versatz UTC+5 (Etc/GMT-5 hat umgekehrtes Vorzeichen).
  const grenzen = [
    ["2026-09-28T05:59:00Z", "morgen", "10:59"],
    ["2026-09-28T06:00:00Z", "tag", "11:00"],
    ["2026-09-28T12:59:00Z", "tag", "17:59"],
    ["2026-09-28T13:00:00Z", "abend", "18:00"],
    ["2026-09-28T18:59:00Z", "abend", "23:59"],
    ["2026-09-28T19:00:00Z", "morgen", "00:00"],
  ];
  for (const [utc, erwartet, uhr] of grenzen) {
    const ist = tageszeitBestimmen(new Date(utc), "Etc/GMT-5");
    pruefe(`tageszeitBestimmen: Grenze ${uhr} Uhr ist "${erwartet}"`, ist === erwartet, `ist: ${ist}`);
  }
  // Folge fuer den Tagesspruch: er wechselt dreimal am Tag, nicht nur einmal.
  const spruecheHeute = new Set(["2026-09-28T02:00:00Z", "2026-09-28T08:00:00Z", "2026-09-28T15:00:00Z"].map((z) => spruchIndex(new Date(z))));
  pruefe("spruchIndex: morgens, tagsueber und abends je ein anderer Satz", spruecheHeute.size === 3, [...spruecheHeute].join(","));
}

// --- 2. Anweisung und Systemprompt -----------------------------------------------
console.log("\n2. TAGESBEGLEITER und 'heute' im Systemprompt");
{
  pruefe("TAGESBEGLEITER: ruft zuerst tagesLageAbrufen, sonst risikoRadarAbrufen", TAGESBEGLEITER.includes("rufe zuerst tagesLageAbrufen auf") && TAGESBEGLEITER.includes("zuerst risikoRadarAbrufen"));
  pruefe("TAGESBEGLEITER: hoechstens drei Punkte, das Dringendste zuerst, genau eine Frage am Schluss", TAGESBEGLEITER.includes("höchstens drei Punkte, das Dringendste zuerst") && TAGESBEGLEITER.includes("schließe mit genau einer Frage"));
  pruefe("TAGESBEGLEITER: hoechstens eine Rueckfrage je Antwort, nie dieselbe zweimal, keine nach reiner Sachauskunft", TAGESBEGLEITER.includes("Höchstens eine Frage je Antwort, immer als letzter Satz") && TAGESBEGLEITER.includes("nie dieselbe Frage zweimal") && TAGESBEGLEITER.includes("reinen Sachauskunft"));
  pruefe("TAGESBEGLEITER: Tagesplan nur aus den Daten, nichts erfinden", TAGESBEGLEITER.includes("TAGESPLAN") && TAGESBEGLEITER.includes("Erfinde keine Termine, Mengen oder Personen"));
  pruefe("TAGESBEGLEITER: Aktion aus einem Vorschlag nur als Frage, Ja ist ausdrueckliche Anweisung, Freigabe bleibt", TAGESBEGLEITER.includes("Ein Vorschlag ist noch keine Anweisung") && TAGESBEGLEITER.includes("gilt das als ausdrückliche Anweisung") && TAGESBEGLEITER.includes("die Anwendung holt die Freigabe ein") && TAGESBEGLEITER.includes("nicht erneut an"));
  pruefe("TAGESBEGLEITER: im Sprachmodus gilt weiter die Laengenregel", TAGESBEGLEITER.includes("höchstens vier Sätze, die Frage eingeschlossen"));
  pruefe("TAGESBEGLEITER: keine woertlichen Beispielsaetze in Anfuehrungszeichen (die Stimme laese sie deutsch vor)", !/['"„“‚‘«»]/.test(TAGESBEGLEITER), TAGESBEGLEITER.match(/['"„“‚‘«»]/)?.[0] ?? "");
  pruefe("TAGESBEGLEITER: formuliert in der Antwortsprache, Regeln nur sinngemaess", TAGESBEGLEITER.includes("immer in der Antwortsprache"));

  for (const sprache of ["de", "en", "ru", "kk"]) {
    const a = sprachmodusFormatAnweisung(sprache);
    pruefe(`Sprachmodus-Schluss ${sprache}: Vorschlag ODER Frage (siehe TAGESBEGLEITER), nicht beides`, a.includes("Schließe, wenn es passt, mit einem kurzen Vorschlag oder einer Frage (siehe TAGESBEGLEITER), nicht mit beidem.") && !a.includes("wonach er fragen kann"));
  }

  const montag = heuteAnweisung(new Date("2026-09-28T03:15:00Z"), "Asia/Almaty");
  pruefe("heute: Wochentag, Datum, ISO-Datum und Uhrzeit in Almaty", /^Heute: Montag, 28\.09\.2026 \(2026-09-28\), \d{2}:15 Uhr \(Betriebszeit Almaty, Asia\/Almaty\)\.$/.test(montag), montag);
  const spaet = heuteAnweisung(new Date("2026-09-28T19:30:00Z"), "Asia/Almaty");
  pruefe("heute: nach Mitternacht in Almaty ist schon Dienstag (nicht das UTC-Datum)", spaet.startsWith("Heute: Dienstag, 29.09.2026 (2026-09-29), 0"), spaet);
  pruefe("heute: Mitternacht als 00, nicht 24", /, 00:05 Uhr/.test(heuteAnweisung(new Date("2026-09-28T19:05:00Z"), "Asia/Almaty")) || /, 01:05 Uhr/.test(heuteAnweisung(new Date("2026-09-28T19:05:00Z"), "Asia/Almaty")));

  const route = lies("src/app/api/ki-assistent/route.ts");
  const fest = /const festerTeil = \[([\s\S]*?)\]\s*\.filter\(Boolean\)/.exec(route)?.[1] ?? "";
  const wechselnd = /const wechselnderTeil = \[([\s\S]*?)\]\s*\.filter\(Boolean\)/.exec(route)?.[1] ?? "";
  pruefe("Route: TAGESBEGLEITER steht im festen (gecachten) Teil, fuer alle Modi", /^\s*TAGESBEGLEITER,\s*$/m.test(fest) && !fest.includes("modus === \"sprache\" ? TAGESBEGLEITER"));
  pruefe("Route: TAGESBEGLEITER steht nicht im wechselnden Teil", fest !== "" && wechselnd !== "" && !wechselnd.includes("TAGESBEGLEITER"));
  pruefe("Route: 'heute' in Almaty-Zeit, nur im wechselnden Teil (keine Uhrzeit im Cache)", route.includes("const heute = heuteAnweisung(new Date(), betriebsZeitzone);") && /^\s*heute,\s*$/m.test(wechselnd) && !/\bheute\b/.test(fest) && !route.includes("Heutiges Datum: ${new Date().toISOString()"));
  const raten = /const RATEN_ANWEISUNG =\s*"([^"]*)"/.exec(route)?.[1] ?? "";
  pruefe("Route: 'frage nicht zurueck' gilt nur noch fuer das Deuten einer unklaren Frage", raten.includes("Um eine solche Frage zu deuten, frage nicht zurück") && !raten.includes("handle - frage nicht zurück") && raten.includes("regelt TAGESBEGLEITER"));
}

// --- 3. Begruessung im Sprachmodus und Sprechblase -------------------------------
console.log("\n3. Begruessung im Sprachmodus, Sprechblase, Kontext");
{
  const modus = lies("src/components/ki/sprachmodus.tsx");
  const beginn = modus.indexOf("const tagesbeginnGeprueft = useRef(false);");
  const ende = modus.indexOf("}, [phase, tagesbeginnAn, nutzerId, sprache, dispatch, t]);", beginn);
  const block = beginn >= 0 && ende > beginn ? modus.slice(beginn, ende) : "";
  pruefe("Sprachmodus: Begruessung nur beim ersten 'hoert' der Sitzung (Ref, nicht nach Pause/Fehler/Neuversuch)", /if \(phase !== "hoert" \|\| tagesbeginnGeprueft\.current\) return;\s*tagesbeginnGeprueft\.current = true;/.test(block));
  pruefe("Sprachmodus: nur mit Einstellung an und wenn heute fuer diesen Nutzer noch faellig", block.includes("if (!tagesbeginnAn) return;") && block.includes('if (!tagesbeginnFaellig(ablage, nutzerId, "gespraech", jetzt)) return;'));
  pruefe("Sprachmodus: nur wenn der Chat bereit und frei ist und keine Freigabe wartet", block.includes("if (!stand.bereit || stand.beschaeftigt || stand.einwilligungFehlt || leseFreigabeAnfrage()) return;"));
  pruefe("Sprachmodus: Text in der Oberflaechensprache je Tageszeit, als offene Frage (Nachsatz haengt an)", block.includes("t(`tagesbeginn.${tageszeitBestimmen(jetzt)}`)") && block.includes("offeneFrage.current = { text: frage, sprachen: [sprache] };") && block.includes("stelleSprachFrage(frage, [sprache]);"));
  const iFrage = block.indexOf("stelleSprachFrage(frage, [sprache]);");
  const iMerker = block.indexOf('merkeTagesbeginn(ablage, nutzerId, "gespraech", jetzt);');
  const iEnde = block.indexOf('dispatch({ art: "aeusserung-ende" });');
  const iGestellt = block.indexOf('dispatch({ art: "frage-gestellt" });');
  pruefe("Sprachmodus: Merker erst NACH dem Stellen der Frage", iFrage > 0 && iMerker > iFrage);
  pruefe("Sprachmodus: danach Phase ueber 'versteht' nach 'denkt' (sonst naehme das Ohr Himbis Echo als Frage)", iEnde > iFrage && iGestellt > iEnde);
  pruefe("Sprachmodus: Nutzer und Einstellung kommen aus den Kontexten", modus.includes("const { beendeSprachmodus, nutzerId } = useKiPane();") && modus.includes("const { tagesbeginnAn } = useHaustierStatus();"));
  pruefe("Start: die Einwilligung wird vor dem Sprachmodus geprueft (die Begruessung ist die erste Frage)", lies("src/components/ki/ki-pane-kontext.tsx").includes("if (leseChatStand().einwilligungFehlt) {"));

  const pane = lies("src/components/ki/ki-pane-kontext.tsx");
  pruefe("KI-Kontext: nutzerId steht im Kontextwert (nicht nur als Prop)", pane.includes("nutzerId: string | null;") && pane.includes("nutzerId: nutzerId ?? null,") && pane.includes("  nutzerId: null,\n"));

  const dash = lies("src/components/haustier/haustier-dashboard.tsx");
  pruefe("Blase: nicht auf dem Handy, nicht wenn Himbi weg oder aus, nicht im Sprachmodus, nur bei Ruhe, nur mit Einstellung", dash.includes("const grussMoeglich = verfuegbar && !handy && an && !weg && !sprachmodus && tagesbeginnAn && ruhigGenug;") && dash.includes("const tagesGrussSichtbar = !!tagesGruss && ruhigGenug && !sprachmodus && tagesbeginnAn;"));
  // Befund vom 28.09.2026: der Timer merkte den Gruss, auch wenn Tour-Frage, laufende Tour oder
  // Live-Hinweis vor ihm standen oder der Tab im Hintergrund lag; der Gruss verfiel dann
  // ungesehen und war fuer den Tag verbraucht. Jetzt legt der Timer ihn nur bereit, gemerkt und
  // die 45 s gestartet wird erst, wenn er die gezeigte Blase ist (lib/haustier.ts sichtbareBlase).
  pruefe("Blase: der Timer legt den Gruss nur bereit (einmal am Tag je Nutzer), ohne ihn zu merken", dash.includes('if (!tagesbeginnFaellig(ablage, nutzerId, "blase", jetzt)) return;\n      setTagesGruss(tageszeitBestimmen(jetzt));'));
  pruefe("Blase: gemerkt und die Anzeigedauer gestartet erst, wenn der Gruss die gezeigte Blase ist", /const tagesGrussGezeigt = blasen\.gezeigt === "tagesgruss";\s*useEffect\(\(\) => \{\s*if \(!tagesGrussGezeigt\) return;\s*merkeTagesbeginn\(browserAblage\(\), nutzerId, "blase"\);\s*const id = window\.setTimeout\(\(\) => setTagesGruss\(null\), TAGESGRUSS_DAUER_MS\);/.test(dash) && dash.split("merkeTagesbeginn(").length === 2);
  pruefe("Blase: ein noch wartender Gruss faellt im Sprachmodus weg (dort beginnt das Gespraech den Tag)", dash.includes("if (sprachmodus && tagesGruss) setTagesGruss(null);"));
  pruefe("Auswahl: eine reine Funktion waehlt die Blase; gezeigt heisst Figur im Bild und Seite sichtbar", dash.includes("const blasen = sichtbareBlase(blasenReihenfolge, {") && dash.includes("figurImBild: verfuegbar && !handy && an && !weg && !sprachmodus,") && dash.includes("seiteSichtbar,") && dash.includes("const blase = blasen.gewaehlt ? blasenInhalt[blasen.gewaehlt] : null;"));
  const reihenfolgeBlock = /const blasenReihenfolge[^=]*= \[([\s\S]*?)\];/.exec(dash)?.[1] ?? "";
  const reihenfolge = [...reihenfolgeBlock.matchAll(/art: "(\w+)"/g)].map((m) => m[1]).join(",");
  pruefe("Auswahl: Rangfolge der Blasen unveraendert (dringendste zuerst, Tagesgruss vor Befinden, Anstupser und Tipp)", reihenfolge === "willkommen,freigabe,arbeitet,fehler,fertig,liveHinweis,tourAktiv,tourFrage,tagesgruss,befinden,befindenAntwort,anstupser,tipp", reihenfolge);
  pruefe("Tipp: kommt erst nach Ruhe, Merker und 15 s erst, wenn er die gezeigte Blase ist (nicht hinter dem Tagesgruss verbraucht)", dash.includes("if (!ruhigGenug || tipp) return;") && !dash.includes('window.sessionStorage.setItem(merker, "1");') && /const tippGezeigt = blasen\.gezeigt === "tipp";\s*useEffect\(\(\) => \{\s*if \(!tippGezeigt \|\| !tipp\) return;\s*try \{\s*window\.sessionStorage\.setItem\(`damicon-haustier-tipp:\$\{tipp\.key\}`, "1"\);[\s\S]{0,120}const id = window\.setTimeout\(\(\) => setTipp\(null\), TIPP_DAUER_MS\);/.test(dash));
  pruefe("Anstupser: gestellt, gemerkt und als Absage gezaehlt erst, wenn er die gezeigte Blase ist", dash.includes("const zeigen = window.setTimeout(() => setAnstupser(naechste), ANSTUPSER_VERZOEGERUNG_MS);") && /const anstupserGezeigt = blasen\.gezeigt === "anstupser";\s*useEffect\(\(\) => \{\s*if \(!anstupserGezeigt \|\| !anstupser\) return;\s*gestellt\.current\.add\(anstupser\);[\s\S]{0,300}absagen\.current \+= 1;\s*setAnstupser\(null\);\s*\}, ANSTUPSER_DAUER_MS\);/.test(dash));
  pruefe("Befinden: Sitzungsmerker erst, wenn die Frage die gezeigte Blase ist", dash.includes("const zeigen = window.setTimeout(() => setBefindenFrage(true), BEFINDEN_VERZOEGERUNG_MS);") && /const befindenGezeigt = blasen\.gezeigt === "befinden";\s*useEffect\(\(\) => \{\s*if \(!befindenGezeigt\) return;\s*try \{\s*window\.sessionStorage\.setItem\(BEFINDEN_SCHLUESSEL, "1"\);/.test(dash));
  pruefe("Blase: ein Eintrag in blasenInhalt, 'Ja' stellt befinden.hilfeText, 'Nein' schliesst", /tagesgruss: tagesGruss \? \([\s\S]{0,900}stelleFrage\(t\("befinden\.hilfeText"\)\);\s*setTagesGruss\(null\);[\s\S]{0,300}onClick=\{\(\) => setTagesGruss\(null\)\}/.test(dash));
  pruefe("Blase: Gruss mit Vornamen wie in der Begruessung, sonst ohne Namen", dash.includes("begruessungT(tagesGruss, { name: anredeName(name) })") && dash.includes("begruessungT(`${tagesGruss}OhneNamen`)"));
  pruefe("Blase: ein Klick auf Himbi schliesst auch den Gruss", /onKlick=\{\(\) => \{[\s\S]{0,300}setTagesGruss\(null\);/.test(dash));

  const kontext = lies("src/components/haustier/haustier-kontext.tsx");
  pruefe("Einstellung: Voreinstellung an (Serverwert und Standardkontext)", kontext.includes("const tagesbeginnServerWert = (): boolean => true;") && kontext.includes("  tagesbeginnAn: true,\n"));
  const haustier = lies("src/lib/haustier.ts");
  pruefe("Einstellung: Speicher in lib/haustier.ts, gesperrter Speicher heisst an", /export function leseTagesbeginn\(\): boolean \{\s*try \{\s*return tagesbeginnAusSpeicher\(window\.localStorage\.getItem\(TAGESBEGINN_SCHALTER\)\);\s*\} catch \{\s*return true;/.test(haustier));
  const einstellung = lies("src/components/haustier/haustier-einstellung.tsx");
  pruefe("Einstellung: Schalter mit Titel und Beschreibung wie die vorhandenen", einstellung.includes('aria-checked={tagesbeginnAn}') && einstellung.includes("onClick={() => setTagesbeginnAn(!tagesbeginnAn)}") && einstellung.includes('t("einstellung.tagesbeginnText")'));
}

// --- 4. Texte und Handbuch -----------------------------------------------------------
console.log("\n4. Texte in vier Sprachen, Handbuch");
{
  const GEDANKENSTRICH = /\s[-–—]\s|[–—]/;
  const texte = {};
  for (const sprache of ["de", "en", "ru", "kk"]) {
    const j = JSON.parse(lies(`src/messages/${sprache}.json`));
    texte[sprache] = j;
    const tb = j.kiAssistentAnsicht?.sprachmodus?.tagesbeginn ?? {};
    const gruss = j.haustier?.tagesgruss ?? {};
    const e = j.haustier?.einstellung ?? {};
    const alle = [tb.morgen, tb.tag, tb.abend, gruss.frage, gruss.ja, gruss.nein, e.tagesbeginnTitel, e.tagesbeginnText, j.haustier?.befinden?.hilfeText];
    pruefe(`Texte ${sprache}: alle neuen Schluessel vorhanden`, alle.every((x) => typeof x === "string" && x.trim().length > 0));
    pruefe(`Texte ${sprache}: die Blase setzt den Gruss mit Anrede ein ({anrede})`, typeof gruss.frage === "string" && gruss.frage.includes("{anrede}"));
    pruefe(`Texte ${sprache}: keine Gedankenstriche`, alle.every((x) => typeof x === "string" && !GEDANKENSTRICH.test(x)));
    const name = sprache === "ru" || sprache === "kk" ? "Химби" : "Himbi";
    pruefe(`Texte ${sprache}: Himbi heisst hier "${name}"`, [tb.morgen, tb.tag, tb.abend, e.tagesbeginnTitel].every((x) => typeof x === "string" && x.includes(name)));
    pruefe(`Texte ${sprache}: die Begruessung im Gespraech ist eine Frage`, [tb.morgen, tb.tag, tb.abend].every((x) => typeof x === "string" && x.trim().endsWith("?")));
  }
  pruefe("Texte de: der Einstellungstitel heisst wie gewuenscht", texte.de.haustier.einstellung.tagesbeginnTitel === "Himbi beginnt den Tag mit mir");
  pruefe("Texte de: 'Womit anfangen?' fragt nach den drei dringendsten Dingen und einer Rueckfrage", texte.de.haustier.befinden.hilfeText.includes("drei dringendsten Dinge") && texte.de.haustier.befinden.hilfeText.includes("frag mich, womit ich anfangen soll"));
  pruefe("Texte de: Voreinstellung an steht in der Beschreibung", texte.de.haustier.einstellung.tagesbeginnText.startsWith("Standardmäßig an."));

  for (const sprache of ["de", "en", "ru", "kk"]) {
    const hb = lies(`scripts/handbuch/texte-${sprache}.ts`);
    const titel = texte[sprache].haustier.einstellung.tagesbeginnTitel;
    const eintrag = /begriff: "(Tagesbegleiter|Day companion|Помощник на день|Күн серігі)",\s*text: "([^"]*)"/.exec(hb);
    pruefe(`Handbuch ${sprache}: Glossareintrag zum Tagesbegleiter nennt den Schalter wie in der Einstellung`, !!eintrag && eintrag[2].includes(titel));
    pruefe(`Handbuch ${sprache}: ohne Gedankenstriche`, !!eintrag && !GEDANKENSTRICH.test(eintrag[2]));
  }
}

console.log(`\nPruefungen: ${bestanden + fehlgeschlagen}   bestanden: ${bestanden}   fehlgeschlagen: ${fehlgeschlagen}`);
if (fehlgeschlagen > 0) {
  process.exitCode = 1;
} else {
  console.log("Alle Pruefungen bestanden.");
}
