// Tests fuer die reine Logik hinter Himbi (src/lib/haustier.ts). Ohne React, ohne
// Datenbank, ohne Browser - laeuft in gut einer Sekunde und faellt auf, bevor jemand
// die Oberflaeche aufmacht.
//
// Der Schwerpunkt liegt auf stimmungAusAntwort: die Funktion entscheidet ohne
// Modellaufruf, welches Gesicht Himbi nach einer Antwort macht, und muss das in allen
// fuenf Sprachen der Oberflaeche treffen. Genau solche Wortlisten verrutschen still,
// wenn jemand spaeter ein Wort ergaenzt.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { agentPhase, haustierZustand, modulAusPfad, stimmungAusAntwort, tourDauer } from "../../src/lib/haustier";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Himbi } from "../../src/components/haustier/himbi";
import { BLICK_DENKT } from "../../src/lib/haustier";
import { BAENDER, baenderAus, folgeSpitze, glaetteMund, MUND_ZU, mundAusKlang, mundGeometrie, SPITZE_BODEN, STILLE, type Baender, type Mundform } from "../../src/lib/domain/lippen";
import {
  blickImGespraech,
  darfRuhen,
  faelligeForm,
  glaetteSchein,
  laechelnFuer,
  nickenProzent,
  RUHIG_OFFEN,
  scheinStil,
  scheinZiel,
  sichtbareForm,
  taktMund,
  type MundEintrag,
} from "../../src/lib/domain/himbi-gespraech";
import {
  ausgabeLatenz,
  ausgangFuer,
  LATENZ_HOECHSTENS,
  leseAusgabePegel,
  leseAusgabeSpektrum,
  meldeElementWiedergabe,
  setzeAusgangZurueck,
  spieltUeberElement,
} from "../../src/lib/ausgabe-pegel";

let geprueft = 0;
let gescheitert = 0;

function pruefe(name: string, fn: () => void): void {
  geprueft += 1;
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (fehler) {
    gescheitert += 1;
    console.log(`  FEHL ${name}`);
    console.log(`       ${fehler instanceof Error ? fehler.message.split("\n")[0] : String(fehler)}`);
  }
}

// ---- stimmungAusAntwort -------------------------------------------------------------

const STIMMUNG: Array<[string, string, ReturnType<typeof stimmungAusAntwort>]> = [
  // Erfolg
  ["de", "Die Lieferung ist gespeichert und der Beleg liegt im Archiv.", "gut"],
  ["en", "Done. The invoice was created and sent.", "gut"],
  ["ru", "Готово, данные сохранены.", "gut"],
  ["kk", "Дайын, мәліметтер сақталды.", "gut"],
  ["tr", "Hazır, kayıt oluşturuldu.", "gut"],
  // Befund
  ["de", "Leider konnte ich die Charge nicht zuordnen.", "warnung"],
  ["en", "Error: the cold chain record is missing.", "warnung"],
  ["ru", "Ошибка: запись не найдена.", "warnung"],
  ["kk", "Қате: жазба табылмады.", "warnung"],
  ["tr", "Hata: soğuk zincir kaydı eksik.", "warnung"],
  // Rueckfrage
  ["de", "Soll ich die Tour auf morgen verschieben?", "frage"],
  ["en", "Which field should I check first?", "frage"],
  ["ru", "Какой участок проверить?", "frage"],
  ["kk", "Қай алқапты тексерейін?", "frage"],
  ["tr", "Hangi tarlayı kontrol edeyim?", "frage"],
  // Auskunft
  ["de", "Die Tour umfasst vier Felder.", "neutral"],
  ["en", "The tour covers four fields.", "neutral"],
];

for (const [sprache, text, erwartet] of STIMMUNG) {
  pruefe(`stimmung ${sprache} -> ${erwartet}: ${text.slice(0, 40)}`, () => {
    assert.equal(stimmungAusAntwort(text), erwartet);
  });
}

pruefe("stimmung: leerer Text ist neutral", () => {
  assert.equal(stimmungAusAntwort(""), "neutral");
  assert.equal(stimmungAusAntwort("   \n  "), "neutral");
});

pruefe("stimmung: Zeichen zaehlen auch ohne Worte", () => {
  assert.equal(stimmungAusAntwort("✅ Alles abgeglichen."), "gut");
  assert.equal(stimmungAusAntwort("⚠ Der Grenzwert ist ueberschritten."), "warnung");
});

pruefe("stimmung: Warnung gewinnt vor Rueckfrage", () => {
  assert.equal(stimmungAusAntwort("Da ist ein Fehler. Soll ich es trotzdem tun?"), "warnung");
});

pruefe("stimmung: Rueckfrage gewinnt vor Erfolg", () => {
  assert.equal(stimmungAusAntwort("Ich habe die Charge gefunden. Soll ich sie buchen?"), "frage");
});

pruefe("stimmung: Fragezeichen zaehlt in der letzten Zeile, nicht mitten im Text", () => {
  assert.equal(stimmungAusAntwort("Welche Charge? Ich nehme die erste.\n\nDie Tour hat vier Felder."), "neutral");
  assert.equal(stimmungAusAntwort("- Feld A\n- Feld B\n\nWelches nehmen wir?"), "frage");
});

pruefe("stimmung: haeufige Woerter faerben nicht - sonst waere alles eine Warnung", () => {
  // "nicht" und "kein" stehen in fast jeder deutschen Antwort. Stuenden sie in der
  // Wortliste, saehe Himbi dauerhaft besorgt aus.
  assert.equal(stimmungAusAntwort("Das betrifft nicht nur die Brigade, sondern auch das Buero."), "neutral");
  assert.equal(stimmungAusAntwort("Es gibt keine weiteren Auffaelligkeiten."), "neutral");
});

pruefe("stimmung: Beugungen laufen mit", () => {
  assert.equal(stimmungAusAntwort("Die Charge wurde gefundene Ware zugeordnet."), "gut");
  assert.equal(stimmungAusAntwort("Ein Fehlerbericht liegt vor."), "warnung");
  assert.equal(stimmungAusAntwort("Kayıt bulundu."), "gut");
});

// ---- agentPhase ---------------------------------------------------------------------

pruefe("agentPhase: eine offene Freigabe gewinnt vor allem", () => {
  assert.equal(agentPhase({ beschaeftigt: true, freigabeOffen: true, fehler: true }), "freigabe");
});

pruefe("agentPhase: sonst gilt beschaeftigt vor Fehler", () => {
  assert.equal(agentPhase({ beschaeftigt: true, freigabeOffen: false, fehler: true }), "arbeitet");
  assert.equal(agentPhase({ beschaeftigt: false, freigabeOffen: false, fehler: true }), "fehler");
  assert.equal(agentPhase({ beschaeftigt: false, freigabeOffen: false, fehler: false }), "ruhe");
});

// ---- haustierZustand ----------------------------------------------------------------

pruefe("haustierZustand: Rangfolge von oben nach unten", () => {
  const b = { fertigUngelesen: true, schlaeft: true, spricht: true };
  assert.equal(haustierZustand({ ...b, phase: "freigabe" }), "freigabe");
  assert.equal(haustierZustand({ ...b, phase: "fehler" }), "fehler");
  assert.equal(haustierZustand({ ...b, phase: "arbeitet" }), "denkt");
  assert.equal(haustierZustand({ ...b, phase: "ruhe" }), "spricht");
  assert.equal(haustierZustand({ ...b, phase: "ruhe", spricht: false }), "fertig");
  assert.equal(haustierZustand({ ...b, phase: "ruhe", spricht: false, fertigUngelesen: false }), "schlaeft");
  assert.equal(
    haustierZustand({ phase: "ruhe", spricht: false, fertigUngelesen: false, schlaeft: false }),
    "ruhe",
  );
});

// ---- modulAusPfad -------------------------------------------------------------------

const MODULE = [
  { zone: "feld", slug: "pflueckauftraege" },
  { zone: "buero", slug: "lohn" },
] as const;

pruefe("modulAusPfad: findet das Modul, ignoriert Suchteil und fehlende Treffer", () => {
  assert.deepEqual(modulAusPfad("/dashboard/buero/lohn", MODULE), MODULE[1]);
  assert.deepEqual(modulAusPfad("/dashboard/buero/lohn?monat=3", MODULE), MODULE[1]);
  assert.equal(modulAusPfad("/dashboard/buero", MODULE), null);
  assert.equal(modulAusPfad("/einstellungen/buero/lohn", MODULE), null);
});

// ---- tourDauer ----------------------------------------------------------------------

pruefe("tourDauer: bleibt zwischen 5,5 und 9,5 Sekunden", () => {
  assert.equal(tourDauer(""), 5500);
  assert.equal(tourDauer("x".repeat(400)), 9500);
  const mittel = tourDauer("x".repeat(60));
  assert.ok(mittel > 5500 && mittel < 9500, `erwartet dazwischen, war ${mittel}`);
});

// ---- Lippen im Sprachmodus (src/lib/domain/lippen.ts) --------------------------------
// Grundlage sind echte Bilder der Soniox-Stimmen (supabase/tests/lippen-soniox.json:
// Lena de, Maya en/ru, Yana kk, Spektrum aus einem echten AnalyserNode in Chromium).
// Bis zur Gegenpruefung vom 25.09.2026 standen hier nur ausgedachte Baender, und ein
// Test auf Quelltext-Zeichenketten erkannte 0 von 15 Mutationen der Bildschleife.

interface ReferenzProbe {
  sprache: string;
  stimme: string;
  laut: string;
  text: string;
  info: { rate: number; fft: number; min: number; max: number };
  bilder: Array<{ lautheit: number; f: string }>;
}
const REFERENZ = (JSON.parse(readFileSync(new URL("./lippen-soniox.json", import.meta.url), "utf8")) as { proben: ReferenzProbe[] }).proben;
const formenVon = (p: ReferenzProbe) =>
  p.bilder.map((b) => mundAusKlang(b.lautheit, baenderAus(Buffer.from(b.f, "base64"), p.info.rate, p.info.fft, p.info.min, p.info.max)));
const anteil = (formen: Mundform[], f: (m: Mundform) => boolean) => formen.filter(f).length / formen.length;
const proben = (laut: string) => REFERENZ.filter((p) => p.laut === laut);

pruefe("Lippen (echte Stimmen): A ist in allen vier Sprachen offen und nicht rund", () => {
  assert.equal(proben("A").length, 4);
  for (const p of proben("A")) {
    const f = formenVon(p);
    assert.ok(anteil(f, (m) => m.rund > 0.5) <= 0.1, `${p.sprache} rund ${anteil(f, (m) => m.rund > 0.5)}`);
    assert.ok(anteil(f, (m) => m.offen >= 0.4) >= 0.8, `${p.sprache} offen`);
  }
});

pruefe("Lippen (echte Stimmen): U und O sind rund (ausser englischem 'Oh', einem Doppellaut)", () => {
  const runde = [...proben("U"), ...proben("O").filter((p) => p.sprache !== "en")];
  assert.equal(runde.length, 7);
  for (const p of runde) {
    const f = formenVon(p);
    assert.ok(anteil(f, (m) => m.rund > 0.5) >= 0.8, `${p.sprache}/${p.laut} rund ${anteil(f, (m) => m.rund > 0.5)}`);
    assert.ok(anteil(f, (m) => m.breite > 0.7) === 0, `${p.sprache}/${p.laut} breit`);
  }
});

pruefe("Lippen (echte Stimmen): I ist breit, E nie rund (auch das offene russische Э)", () => {
  for (const p of proben("I")) {
    const f = formenVon(p);
    assert.ok(anteil(f, (m) => m.breite > 0.7) >= 0.8, `${p.sprache}/I breit`);
    assert.ok(anteil(f, (m) => m.rund > 0.5) <= 0.1, `${p.sprache}/I rund`);
  }
  for (const p of proben("E")) assert.ok(anteil(formenVon(p), (m) => m.rund > 0.5) <= 0.1, `${p.sprache}/E rund`);
});

pruefe("Lippen (echte Stimmen): S zeigt Zaehne bei fast geschlossenem Kiefer", () => {
  for (const p of proben("S")) {
    const f = formenVon(p);
    assert.ok(anteil(f, (m) => m.zaehne > 0.5) >= 0.8, `${p.sprache}/S`);
    assert.ok(anteil(f, (m) => m.offen < 0.4) >= 0.8, `${p.sprache}/S offen`);
  }
});

pruefe("Lippen (echte Stimmen): Saetze voller M und L runden hoechstens ein Drittel der Bilder (vorher bis 64 %)", () => {
  const saetze = [...proben("M-Satz"), ...proben("L-Satz")];
  assert.equal(saetze.length, 7);
  for (const p of saetze) {
    const r = anteil(formenVon(p), (m) => m.rund > 0.5);
    assert.ok(r <= 0.35, `${p.sprache}/${p.laut} rund ${r}`);
  }
});

pruefe("Lippen: Stille ist eine feste Schwelle; darunter bleibt der Mund zu", () => {
  assert.equal(STILLE, 0.1);
  const a = REFERENZ.find((p) => p.laut === "A")!;
  const b = baenderAus(Buffer.from(a.bilder[0]!.f, "base64"), a.info.rate, a.info.fft, a.info.min, a.info.max);
  assert.deepEqual(mundAusKlang(0.05, b), MUND_ZU);
  assert.deepEqual(mundAusKlang(0.099, b), MUND_ZU);
  assert.ok(mundAusKlang(0.3, b).offen > 0);
});

pruefe("Lippen: jedes Bin gehoert genau einem Band, die Grenzen liegen bei 250, 700, 1800, 4000 und 8000 Hz", () => {
  for (const rate of [48000, 44100]) {
    const binHz = rate / 512;
    const band = (hz: number) => {
      const f = new Array<number>(256).fill(0);
      f[Math.round(hz / binHz)] = 255;
      const b = baenderAus(f, rate, 512);
      return (Object.keys(b) as Array<keyof Baender>).filter((k) => b[k] > 1e-9);
    };
    for (let i = 1; i < Math.floor(8000 / binHz); i++) assert.equal(band(i * binHz).length, 1, `${rate} Hz, Bin ${i} (${Math.round(i * binHz)} Hz)`);
    // Je Band das erste und das letzte Bin gehoeren zu genau diesem Band.
    for (const name of Object.keys(BAENDER) as Array<keyof Baender>) {
      const [von, bis] = BAENDER[name];
      for (const i of [Math.ceil(von / binHz), Math.ceil(bis / binHz) - 1]) {
        assert.deepEqual(band(i * binHz), [name], `${rate} Hz: ${Math.round(i * binHz)} Hz gehoert zu ${name}`);
      }
    }
    assert.deepEqual([BAENDER.grund[1], BAENDER.tief[1], BAENDER.mitte[1], BAENDER.hoch[1], BAENDER.zisch[1]], [250, 700, 1800, 4000, 8000]);
  }
});

pruefe("Lippen: gleich dichte Energie ergibt in unterschiedlich breiten Baendern denselben Mittelwert", () => {
  const f = new Array<number>(256).fill(200);
  const b = baenderAus(f, 48000, 512);
  assert.ok(Math.abs(b.tief - b.mitte) < 1e-12 && Math.abs(b.mitte - b.zisch) < 1e-12);
});

pruefe("Lippen: die Glaettung haengt nicht an der Bildrate, Oeffnen schneller als Schliessen", () => {
  const ziel = { offen: 1, breite: 0.9, rund: 0, zaehne: 0 };
  let sechzig = MUND_ZU;
  for (let i = 0; i < 6; i++) sechzig = glaetteMund(sechzig, ziel, 1000 / 60);
  let hundertzwanzig = MUND_ZU;
  for (let i = 0; i < 12; i++) hundertzwanzig = glaetteMund(hundertzwanzig, ziel, 1000 / 120);
  assert.ok(Math.abs(sechzig.offen - hundertzwanzig.offen) < 0.01);
  assert.ok(sechzig.offen > 0.9, "nach 100 ms fast ganz offen (Anstieg 35 ms)");
  let zu = { ...ziel };
  for (let i = 0; i < 3; i++) zu = glaetteMund(zu, MUND_ZU, 1000 / 60);
  assert.ok(zu.offen > 0.5, "Schliessen weicher als Oeffnen");
  assert.ok(Math.abs(glaetteMund(MUND_ZU, ziel, 5000).offen - glaetteMund(MUND_ZU, ziel, 100).offen) < 1e-12, "ein verschlucktes Bild zaehlt hoechstens 100 ms");
});

pruefe("Lippen: die Spitze halbiert sich in 1,5 s, folgt lauten Stellen sofort und bleibt ueber dem Boden", () => {
  assert.equal(folgeSpitze(SPITZE_BODEN, 0.3, 16), 0.3);
  let s = 0.3;
  for (let t = 0; t < 1500; t += 16) s = folgeSpitze(s, 0, 16);
  assert.ok(Math.abs(s - 0.15) < 0.02, `nach 1,5 s ${s}`);
  for (let t = 0; t < 20000; t += 16) s = folgeSpitze(s, 0, 16);
  assert.equal(s, SPITZE_BODEN);
});

pruefe("Lippen: Geometrie - geschlossen laechelt er, rund ist schmaler, S zeigt Zaehne, die Zunge liegt unter den Zaehnen", () => {
  const punkte = (m: Mundform) => [...mundGeometrie(m).pfad.matchAll(/-?\d+(?:\.\d+)?/g)].map((z) => Number(z[0]));
  const breite = (m: Mundform) => { const p = punkte(m); const x = p.filter((_, i) => i % 2 === 0); return Math.max(...x) - Math.min(...x); };
  const zu = punkte(MUND_ZU);
  const winkelY = zu[1]!;
  const unterlippeY = zu[zu.length - 3]!; // Kontrollpunkt der Unterlippe
  assert.ok(winkelY < unterlippeY, "Mundwinkel ueber der Unterlippe (Laecheln)");
  assert.ok(breite({ offen: 0.5, breite: 0.5, rund: 1, zaehne: 0 }) < breite({ offen: 0.5, breite: 0.5, rund: 0, zaehne: 0 }));
  assert.ok(mundGeometrie({ offen: 0.18, breite: 0.8, rund: 0, zaehne: 0.9 }).zaehne.deckkraft > 0.8);
  assert.equal(mundGeometrie(MUND_ZU).zaehne.deckkraft, 0);
  const a = mundGeometrie({ offen: 0.9, breite: 0.5, rund: 0, zaehne: 0 });
  assert.ok(a.zunge.cy > a.zaehne.y + a.zaehne.hoehe, "Zunge unter den Zaehnen");
  for (const p of REFERENZ) for (const m of formenVon(p)) {
    const q = punkte(m);
    const x = q.filter((_, i) => i % 2 === 0);
    const y = q.filter((_, i) => i % 2 === 1);
    assert.ok(Math.min(...x) >= 36 && Math.max(...x) <= 60 && Math.min(...y) >= 78 && Math.max(...y) <= 97, "Mund bleibt im Gesicht");
  }
});

// ---- Himbi im Gespraech (src/lib/domain/himbi-gespraech.ts) --------------------------

pruefe("Gespraech: der Latenzpuffer liefert die Form von vor latenzMs und bleibt klein", () => {
  const verlauf: MundEintrag[] = [];
  const form = (offen: number): Mundform => ({ offen, breite: 0.5, rund: 0, zaehne: 0 });
  let faellig = MUND_ZU;
  for (let t = 0; t <= 1000; t += 10) faellig = faelligeForm(verlauf, t, form(t / 1000), 200);
  assert.ok(Math.abs(faellig.offen - 0.8) < 0.011, `nach 1 s mit 200 ms Latenz: ${faellig.offen}`);
  assert.ok(verlauf.length <= 22, `Puffer ${verlauf.length}`);
  const ohne: MundEintrag[] = [];
  assert.equal(faelligeForm(ohne, 0, form(0.3), 0).offen, 0.3);
  assert.equal(faelligeForm(ohne, 16, form(0.7), 0).offen, 0.7);
  assert.equal(ohne.length, 1);
});

pruefe("Gespraech: bei reduzierter Bewegung steht der Mund still (sprechend ruhig offen, sonst zu)", () => {
  const offen = { offen: 0.9, breite: 0.2, rund: 1, zaehne: 0 };
  assert.deepEqual(sichtbareForm(true, "spricht", offen), RUHIG_OFFEN);
  for (const z of ["hoert", "denkt", "pausiert", "fehler"] as const) assert.deepEqual(sichtbareForm(true, z, offen), MUND_ZU);
  assert.deepEqual(sichtbareForm(false, "spricht", offen), offen);
  assert.equal(laechelnFuer("denkt"), 0.2);
  assert.equal(laechelnFuer("hoert"), 1);
});

pruefe("Gespraech: der Schein folgt beim Zuhoeren dem Mikrofon, beim Sprechen dem Mund, sonst ruht er", () => {
  assert.ok(Math.abs(scheinZiel("hoert", 0.1, 0.9) - 0.6) < 1e-9);
  assert.equal(scheinZiel("hoert", 0.5, 0), 1);
  assert.equal(scheinZiel("spricht", 0.5, 0.4), 0.4);
  assert.equal(scheinZiel("denkt", 0.5, 0.4), 0);
  let sechzig = 0;
  for (let i = 0; i < 6; i++) sechzig = glaetteSchein(sechzig, 1, 1000 / 60);
  let hundertzwanzig = 0;
  for (let i = 0; i < 12; i++) hundertzwanzig = glaetteSchein(hundertzwanzig, 1, 1000 / 120);
  assert.ok(Math.abs(sechzig - hundertzwanzig) < 0.01, "Schein unabhaengig von der Bildrate");
  assert.ok(1 - glaetteSchein(1, 0, 16) < glaetteSchein(0, 1, 16), "Abklingen langsamer als Anstieg");
  assert.deepEqual(scheinStil(0), { deckkraft: 0.55, groesse: 0.92 });
  assert.ok(Math.abs(scheinStil(1).deckkraft - 1) < 1e-12);
  assert.equal(nickenProzent(1), -3);
  assert.equal(nickenProzent(2), -3);
});

pruefe("Gespraech: Blick zum Ziel (nicht im Schlaf), beim Denken wie in der Ecke nach oben, angedockt zur Seite", () => {
  const rechts = blickImGespraech("spricht", { dx: 400, dy: 0 }, false);
  assert.ok(rechts.x > 3 && Math.abs(rechts.y) < 1e-9);
  const obenLinks = blickImGespraech("hoert", { dx: -300, dy: -300 }, false);
  assert.ok(obenLinks.x < 0 && obenLinks.y < 0);
  const nah = blickImGespraech("hoert", { dx: 20, dy: 0 }, false);
  assert.ok(nah.x > 0 && nah.x < rechts.x, "nahe Ziele weniger weit");
  assert.deepEqual(blickImGespraech("pausiert", { dx: 400, dy: 0 }, false), { x: 0, y: 0 });
  assert.deepEqual(blickImGespraech("denkt", null, false), { ...BLICK_DENKT });
  assert.ok(blickImGespraech("spricht", null, true).x > 0);
  assert.deepEqual(blickImGespraech("hoert", null, true), { x: 0, y: 0 });
});

pruefe("Gespraech: Takt-Mund fuer den Datei-Weg bleibt im Rahmen und bewegt sich", () => {
  const werte = Array.from({ length: 60 }, (_, i) => taktMund(i * 33).offen);
  assert.ok(werte.every((w) => w >= 0 && w <= 0.6));
  assert.ok(Math.max(...werte) - Math.min(...werte) > 0.2);
});

pruefe("Gespraech: die Bildschleife ruht nur in Pause und Fehler, und erst wenn alles still ist", () => {
  assert.equal(darfRuhen("pausiert", MUND_ZU, 0), true);
  assert.equal(darfRuhen("fehler", MUND_ZU, 0.005), true);
  assert.equal(darfRuhen("fehler", { ...MUND_ZU, offen: 0.2 }, 0), false);
  assert.equal(darfRuhen("pausiert", MUND_ZU, 0.3), false);
  assert.equal(darfRuhen("hoert", MUND_ZU, 0), false);
});

// ---- Ausgang (src/lib/ausgabe-pegel.ts) -----------------------------------------------

function falscherKontext(zustand: string, outputLatency?: number, baseLatency?: number) {
  const knoten = () => ({ connect() {} });
  const analyser = {
    fftSize: 0,
    smoothingTimeConstant: 0,
    frequencyBinCount: 256,
    minDecibels: -100,
    maxDecibels: -30,
    connect() {},
    getByteTimeDomainData(a: Uint8Array) { a.fill(200); },
    getByteFrequencyData(a: Uint8Array) { a.fill(90); },
  };
  return { state: zustand, sampleRate: 48000, outputLatency, baseLatency, destination: {}, createGain: knoten, createAnalyser: () => analyser } as unknown as AudioContext;
}

pruefe("Ausgang: Spektrum und Pegel nur, solange der Kontext klingt (angehalten: Mund zu, kein Echo)", () => {
  setzeAusgangZurueck();
  assert.equal(leseAusgabeSpektrum(), null);
  assert.equal(leseAusgabePegel(), 0);
  const laeuft = falscherKontext("running", 0.02, 0.01);
  ausgangFuer(laeuft);
  const s = leseAusgabeSpektrum();
  assert.ok(s && s.frequenzen[10] === 90 && s.abtastrate === 48000 && s.fftGroesse === 512);
  assert.ok(Math.abs(s!.latenz - 0.03) < 1e-9);
  assert.ok(leseAusgabePegel() > 0.5);
  setzeAusgangZurueck();
  ausgangFuer(falscherKontext("suspended"));
  assert.equal(leseAusgabeSpektrum(), null);
  assert.equal(leseAusgabePegel(), 0);
  setzeAusgangZurueck();
});

pruefe("Ausgang: Latenz aus outputLatency + baseLatency, begrenzt, ungueltige Werte zaehlen als 0", () => {
  assert.ok(Math.abs(ausgabeLatenz(0.02, 0.01) - 0.03) < 1e-9);
  assert.equal(ausgabeLatenz(1, 0.5), LATENZ_HOECHSTENS);
  assert.equal(ausgabeLatenz(undefined, undefined), 0);
  assert.equal(ausgabeLatenz(Number.NaN, 0.01), 0.01);
  assert.equal(ausgabeLatenz(-1, 0), 0);
});

pruefe("Ausgang: der Datei-Weg meldet seine Wiedergabe (Himbi spricht dann im Takt)", () => {
  meldeElementWiedergabe(true);
  assert.equal(spieltUeberElement(), true);
  meldeElementWiedergabe(false);
  assert.equal(spieltUeberElement(), false);
});

// ---- Figur (src/components/haustier/himbi.tsx) ----------------------------------------

pruefe("Figur: mit lippen gibt es den formbaren Mund, ohne ihn bleibt Himbi wie in der Ecke", () => {
  const mit = renderToStaticMarkup(createElement(Himbi, { zustand: "spricht", lippen: true }));
  for (const teil of ["umriss", "hoehle", "clip", "zunge", "zaehne"]) assert.ok(mit.includes(`data-lippe="${teil}"`), teil);
  assert.ok(mit.includes("data-lippen"));
  assert.ok(mit.includes(`d="${mundGeometrie(MUND_ZU).pfad}"`), "startet geschlossen");
  const ohne = renderToStaticMarkup(createElement(Himbi, { zustand: "spricht" }));
  assert.ok(!ohne.includes("data-lippe") && !ohne.includes("data-lippen"));
});

// -------------------------------------------------------------------------------------

console.log(
  gescheitert === 0
    ? `\n${geprueft} Pruefungen bestanden`
    : `\n${gescheitert} von ${geprueft} Pruefungen fehlgeschlagen`,
);
process.exit(gescheitert === 0 ? 0 : 1);
