// Tests fuer scripts/pruefe-drift.mjs (reine Logik, ohne Datenbank).
import { bekannteLesen, driftBefunde } from "../../scripts/pruefe-drift.mjs";

let fehlgeschlagen = 0;
let gesamt = 0;
function check(name, bedingung, detail = "") {
  gesamt++;
  if (bedingung) console.log(`PASS  ${name}`);
  else {
    fehlgeschlagen++;
    console.log(`FAIL  ${name}${detail ? ` - ${detail}` : ""}`);
  }
}

const datei = (version, summe = `s${version}`) => ({ version, datei: `${version}_x.sql`, pruefsumme: summe });
const dateien = [datei("20261001000000"), datei("20261002000000")];
const pub = ["20261001000000", "20261002000000"];
const preview = [
  { version: "20261001000000", pruefsumme: "s20261001000000" },
  { version: "20261002000000", pruefsumme: "s20261002000000" },
];

const sauber = driftBefunde({ dateien, public: pub, preview });
check("alles gleich: kein Fehler, kein Hinweis", sauber.fehler.length === 0 && sauber.hinweise.length === 0);

const ohneDatei = driftBefunde({ dateien, public: [...pub, "20261003000000"], preview });
check("Version in public ohne Datei ist ein Fehler", ohneDatei.fehler.length === 1 && ohneDatei.fehler[0].includes("keine Datei dazu"));
check("der Fehler nennt die Version", ohneDatei.fehler[0].includes("20261003000000"));

const uebersprungen = driftBefunde({ dateien, public: ["20261002000000"], preview });
check("Datei auf main, in public nicht angewendet, ist ein Fehler", uebersprungen.fehler.length === 1 && uebersprungen.fehler[0].includes("in public nicht angewendet"));

const ohnePreview = driftBefunde({ dateien, public: pub, preview: [preview[0]] });
check("Datei auf main, in public_preview nicht angewendet, ist ein Fehler", ohnePreview.fehler.length === 1 && ohnePreview.fehler[0].includes("public_preview nicht angewendet"));

const geaendert = driftBefunde({ dateien, public: pub, preview: [preview[0], { version: "20261002000000", pruefsumme: "anders" }] });
check("abweichende Pruefsumme in public_preview ist ein Fehler", geaendert.fehler.length === 1 && geaendert.fehler[0].includes("geaendert"));

const ohneSumme = driftBefunde({ dateien, public: pub, preview: [preview[0], { version: "20261002000000", pruefsumme: null }] });
check("Verlauf ohne Pruefsumme (aelterer Stand) ist kein Fehler", ohneSumme.fehler.length === 0);

const offenerPr = driftBefunde({ dateien, public: pub, preview: [...preview, { version: "20261120000000", pruefsumme: "p" }] });
check("Migration eines offenen Pull Requests in public_preview ist nur ein Hinweis", offenerPr.fehler.length === 0 && offenerPr.hinweise.length === 1 && offenerPr.hinweise[0].includes("20261120000000"));

const keinVerlauf = driftBefunde({ dateien, public: pub, preview: null });
check("fehlender Verlauf von public_preview ist ein Fehler", keinVerlauf.fehler.length === 1 && keinVerlauf.fehler[0].includes("keinen Migrationsverlauf"));

const bekannt = driftBefunde({ dateien, public: [...pub, "20261003000000"], preview, bekannt: ["20261003000000"] });
check("bekannte Altlast wird nicht gemeldet", bekannt.fehler.length === 0);

const bekanntDatei = driftBefunde({ dateien, public: ["20261002000000"], preview: [preview[1]], bekannt: ["20261001000000"] });
check("bekannte Altlast gilt auch fuer eine Datei, die nirgends angewendet ist", bekanntDatei.fehler.length === 0);

const mehrere = driftBefunde({ dateien, public: ["20261009000000"], preview: [] });
check("mehrere Abweichungen werden alle gemeldet", mehrere.fehler.length === 5, `Fehler: ${mehrere.fehler.length}`);

check("bekannteLesen ignoriert Kommentare und Leerzeilen",
  JSON.stringify(bekannteLesen("# Kopf\n\n20261003000000  # im Dashboard angelegt\r\n  20261004000000\nkeine-version\n")) === JSON.stringify(["20261003000000", "20261004000000"]));
check("bekannteLesen: leere Datei ergibt keine Eintraege", bekannteLesen("").length === 0);

console.log(`\nPruefungen: ${gesamt}   bestanden: ${gesamt - fehlgeschlagen}   fehlgeschlagen: ${fehlgeschlagen}`);
if (fehlgeschlagen > 0) process.exit(1);
console.log("Alle Pruefungen bestanden.");
