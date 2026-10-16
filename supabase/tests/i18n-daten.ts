import { DATEN_SPRACHEN, liesI18n, uebersetzt, uebersetztOderNull } from "../../src/lib/i18n-daten";

// Übersetzungen der Freitextspalten (src/lib/i18n-daten.ts): lesen, wählen, zurückfallen. Rein, ohne Datenbank.
// Aufruf: npm run test:i18n-daten

let fehler = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) fehler++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
}

const i18n = liesI18n({ bezeichnung: { en: "Hosting", ru: "Хостинг", kk: "Хостинг" }, notiz: { en: "Note" } });

check("Sprachen: Deutsch, Englisch, Russisch, Kasachisch", DATEN_SPRACHEN.join() === "de,en,ru,kk");
check("Wählen: die Übersetzung der Sprache", uebersetzt(i18n, "bezeichnung", "en", "Hosting und Datenbank") === "Hosting" && uebersetzt(i18n, "bezeichnung", "ru", "x") === "Хостинг");
check("Zurückfallen: ohne Übersetzung in der Sprache das Original", uebersetzt(i18n, "notiz", "ru", "Notiz") === "Notiz");
check("Zurückfallen: ohne Übersetzung für die Spalte das Original", uebersetzt(i18n, "kategorie", "en", "Personal") === "Personal");
check("Zurückfallen: eine Sprache, die es nicht gibt, ist das Original", uebersetzt(i18n, "bezeichnung", "fr", "Original") === "Original" && uebersetzt(i18n, "bezeichnung", "", "Original") === "Original");
check("Deutsch: das Original steht in der Spalte, eine Übersetzung nach Deutsch gibt es nur bei fremdem Original", uebersetzt(i18n, "bezeichnung", "de", "Hosting und Datenbank") === "Hosting und Datenbank");
check("Deutsch: ein russisches Original hat eine deutsche Übersetzung", uebersetzt(liesI18n({ text: { de: "Guten Tag" } }), "text", "de", "Добрый день") === "Guten Tag");
check("Ohne Übersetzungen: undefined und null sind das Original", uebersetzt(undefined, "bezeichnung", "en", "A") === "A" && uebersetzt(null, "bezeichnung", "en", "A") === "A");
check("Leere Spalte: ohne Original bleibt es leer, es gibt keine Übersetzung ohne Original", uebersetztOderNull(i18n, "notiz", "en", null) === null && uebersetztOderNull(i18n, "notiz", "en", undefined) === null && uebersetztOderNull(i18n, "notiz", "en", "Notiz") === "Note");

// --- Lesen: Fremdwerte aus der Datenbank bringen die Seite nicht zum Absturz ---------------------------------------------------------------
check("Lesen: kein Objekt ergibt keine Übersetzungen", ["x", 3, true, null, undefined, ["a"]].every((w) => Object.keys(liesI18n(w)).length === 0));
check("Lesen: eine Spalte, die kein Objekt ist, fällt weg", Object.keys(liesI18n({ a: "x", b: [1], c: null, d: { en: "ok" } })).join() === "d");
check("Lesen: unbekannte Sprachen und Nicht-Texte fallen weg", JSON.stringify(liesI18n({ a: { fr: "x", en: 3, ru: "ok", kk: null } })) === JSON.stringify({ a: { ru: "ok" } }));
check("Lesen: leere und nur aus Leerzeichen bestehende Texte zählen nicht", Object.keys(liesI18n({ a: { en: "", ru: "   " } })).length === 0 && uebersetzt(liesI18n({ a: { en: "" } }), "a", "en", "Original") === "Original");
check("Lesen: der Text bleibt unverändert, auch mit Anführungszeichen und Umlauten", uebersetzt(liesI18n({ a: { en: 'Say "hi" – größer' } }), "a", "en", "x") === 'Say "hi" – größer');

if (fehler > 0) {
  console.log(`\n${fehler} Pruefung(en) fehlgeschlagen.`);
  process.exit(1);
}
console.log("\nAlle Tests der Übersetzungshilfen gruen.");
