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
import { baenderAus, folgeSpitze, glaetteMund, MUND_ZU, mundAusKlang, mundGeometrie, STILLE, type Baender } from "../../src/lib/domain/lippen";

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
// Baender nach den Medianen der Messung mit der echten Soniox-Stimme vom 25.09.2026
// (kiefer = mitte/(tief+mitte), vorn = hoch/(hoch+mitte), nasal = grund/(grund+tief+mitte)).

const LAUT: Record<string, Baender> = {
  A: { grund: 4, tief: 1, mitte: 3, hoch: 0.33, zisch: 0.05 },
  O: { grund: 3, tief: 1, mitte: 0.4, hoch: 0.002, zisch: 0.02 },
  U: { grund: 2.2, tief: 1, mitte: 0.02, hoch: 0, zisch: 0.01 },
  I: { grund: 2.4, tief: 1, mitte: 0.002, hoch: 0.008, zisch: 0.01 },
  E: { grund: 1.8, tief: 1, mitte: 0.003, hoch: 0.013, zisch: 0.02 },
  S: { grund: 0.3, tief: 0.15, mitte: 0.15, hoch: 0.13, zisch: 0.6 },
  M: { grund: 8, tief: 1, mitte: 0.01, hoch: 0.001, zisch: 0.01 },
};

pruefe("Lippen: A weit offen und nicht rund, O und U rund, I und E breit, S mit Zaehnen", () => {
  const a = mundAusKlang(0.8, LAUT.A!);
  assert.ok(a.offen > 0.6 && a.rund < 0.2, `A ${JSON.stringify(a)}`);
  for (const v of ["O", "U"]) {
    const m = mundAusKlang(0.8, LAUT[v]!);
    assert.ok(m.rund > 0.6 && m.breite < 0.35, `${v} ${JSON.stringify(m)}`);
  }
  for (const v of ["I", "E"]) {
    const m = mundAusKlang(0.8, LAUT[v]!);
    assert.ok(m.breite > 0.8 && m.rund < 0.2, `${v} ${JSON.stringify(m)}`);
  }
  const s = mundAusKlang(0.8, LAUT.S!);
  assert.ok(s.zaehne > 0.8 && s.offen < 0.3, `S ${JSON.stringify(s)}`);
  assert.ok(a.offen > mundAusKlang(0.8, LAUT.U!).offen, "A oeffnet weiter als U");
});

pruefe("Lippen: bei M (starkes Brummen, kein Kiefer) bleibt der Mund fast zu, in einer Pause ganz", () => {
  assert.ok(mundAusKlang(0.8, LAUT.M!).offen < 0.15);
  assert.deepEqual(mundAusKlang(STILLE / 2, LAUT.A!), MUND_ZU);
});

pruefe("Lippen: baenderAus ordnet einen Ton bei 1 kHz der Mitte zu, einen bei 6 kHz dem Zischen", () => {
  const leer = () => new Array<number>(256).fill(0);
  const bei = (hz: number) => {
    const f = leer();
    f[Math.round(hz / (48000 / 512))] = 255;
    return baenderAus(f, 48000, 512);
  };
  const eins = bei(1000);
  assert.ok(eins.mitte > eins.tief * 100 && eins.mitte > eins.zisch * 100);
  const sechs = bei(6000);
  assert.ok(sechs.zisch > sechs.hoch * 100);
});

pruefe("Lippen: die Glaettung haengt nicht an der Bildrate (60 Hz gleich 120 Hz)", () => {
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
});

pruefe("Lippen: die Spitze folgt lauten Stellen sofort, sinkt langsam und nie unter den Boden", () => {
  assert.equal(folgeSpitze(0.04, 0.3, 16), 0.3);
  const spaeter = folgeSpitze(0.3, 0, 1500);
  assert.ok(spaeter < 0.3 && spaeter > 0.1);
  assert.equal(folgeSpitze(0.04, 0, 100), 0.04);
});

pruefe("Lippen: der Mund bleibt im Gesicht (unter den Augen, ueber dem Kinn), A hoeher als U", () => {
  const hoehe = (m: typeof MUND_ZU) => {
    const zahlen = [...mundGeometrie(m).pfad.matchAll(/-?\d+(?:\.\d+)?/g)].map((z) => Number(z[0]));
    const x = zahlen.filter((_, i) => i % 2 === 0);
    const y = zahlen.filter((_, i) => i % 2 === 1);
    assert.ok(Math.min(...x) >= 36 && Math.max(...x) <= 60, `x ${Math.min(...x)}..${Math.max(...x)}`);
    assert.ok(Math.min(...y) >= 78 && Math.max(...y) <= 97, `y ${Math.min(...y)}..${Math.max(...y)}`);
    return Math.max(...y) - Math.min(...y);
  };
  for (const v of Object.keys(LAUT)) hoehe(mundAusKlang(1, LAUT[v]!));
  hoehe(MUND_ZU);
  assert.ok(hoehe(mundAusKlang(0.8, LAUT.A!)) > hoehe(mundAusKlang(0.8, LAUT.U!)));
});

pruefe("Sprachmodus: Himbi statt Kugel, mit Lippen, Blick zum Ziel und stillem Mund bei reduzierter Bewegung", () => {
  const lies = (p: string) => readFileSync(new URL(`../../src/${p}`, import.meta.url), "utf8");
  const modus = lies("components/ki/sprachmodus.tsx");
  assert.ok(modus.includes("<SprachHimbi ") && !modus.includes("SprachKugel"));
  const himbi = lies("components/ki/sprach-himbi.tsx");
  assert.ok(himbi.includes("lippen />") && himbi.includes("leseAusgabeSpektrum()") && himbi.includes('reduziert ? (z === "spricht" ? RUHIG_OFFEN : MUND_ZU) : mund'));
  const figur = lies("components/haustier/himbi.tsx");
  for (const teil of ["umriss", "hoehle", "clip", "zunge", "zaehne"]) assert.ok(figur.includes(`data-lippe="${teil}"`), teil);
});

// -------------------------------------------------------------------------------------

console.log(
  gescheitert === 0
    ? `\n${geprueft} Pruefungen bestanden`
    : `\n${gescheitert} von ${geprueft} Pruefungen fehlgeschlagen`,
);
process.exit(gescheitert === 0 ? 0 : 1);
