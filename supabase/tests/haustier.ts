// Tests fuer die reine Logik hinter Himbi (src/lib/haustier.ts). Ohne React, ohne
// Datenbank, ohne Browser - laeuft in gut einer Sekunde und faellt auf, bevor jemand
// die Oberflaeche aufmacht.
//
// Der Schwerpunkt liegt auf stimmungAusAntwort: die Funktion entscheidet ohne
// Modellaufruf, welches Gesicht Himbi nach einer Antwort macht, und muss das in allen
// fuenf Sprachen der Oberflaeche treffen. Genau solche Wortlisten verrutschen still,
// wenn jemand spaeter ein Wort ergaenzt.

import assert from "node:assert/strict";
import { agentPhase, haustierZustand, modulAusPfad, stimmungAusAntwort, tourDauer } from "../../src/lib/haustier";

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

// -------------------------------------------------------------------------------------

console.log(
  gescheitert === 0
    ? `\n${geprueft} Pruefungen bestanden`
    : `\n${gescheitert} von ${geprueft} Pruefungen fehlgeschlagen`,
);
process.exit(gescheitert === 0 ? 0 : 1);
