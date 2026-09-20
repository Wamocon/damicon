// Tests fuer scripts/pruefe-migrationen.mjs (reine Logik, ohne Git und ohne Datenbank).
import { pruefe, zerstoerendeAnweisungen } from "../../scripts/pruefe-migrationen.mjs";

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

const basis = { dateien: ["20261001000000_alt.sql", "20261026000000_letzte.sql"], geaendert: [] };
const mit = (neu, inhalt = "select 1;", extra = {}) => pruefe({
  dateien: [...basis.dateien, neu],
  inhalte: { [neu]: inhalt },
  basis: { ...basis, ...extra },
});

check("neue, neuere Migration ist in Ordnung", mit("20261027000000_neu.sql").length === 0);
check("ohne Basis werden nur Namen geprueft", pruefe({ dateien: ["20261001000000_a.sql"], inhalte: {} }).length === 0);
check("Name ohne 14 Ziffern wird abgelehnt", pruefe({ dateien: ["2026_x.sql"], inhalte: {} }).length === 1);
check("Grossbuchstaben im Namen werden abgelehnt", pruefe({ dateien: ["20261001000000_Neu.sql"], inhalte: {} }).length === 1);
check("doppelte Version wird abgelehnt", pruefe({ dateien: ["20261001000000_a.sql", "20261001000000_b.sql"], inhalte: {} }).length === 1);
check("aeltere Version als die letzte der Basis wird abgelehnt", mit("20261015000000_dazwischen.sql").some((f) => f.includes("nicht neuer")));
check("gleiche Version wie die letzte der Basis wird abgelehnt", mit("20261026000000_zwilling.sql").some((f) => f.includes("nicht neuer")));
check("geaenderte vorhandene Migration wird abgelehnt", mit("20261027000000_neu.sql", "select 1;", { geaendert: ["20261001000000_alt.sql"] }).some((f) => f.includes("bereits vorhandene")));

check("DROP TABLE ohne Freigabe wird abgelehnt", mit("20261027000000_x.sql", "drop table public.foo;").some((f) => f.includes("zerstoerende")));
check("DROP COLUMN ohne Freigabe wird abgelehnt", mit("20261027000000_x.sql", "alter table t drop column a;").length === 1);
check("TRUNCATE ohne Freigabe wird abgelehnt", mit("20261027000000_x.sql", "truncate t;").length === 1);
check("DELETE ohne WHERE wird abgelehnt", mit("20261027000000_x.sql", "delete from t;").length === 1);
check("DELETE mit WHERE ist in Ordnung", mit("20261027000000_x.sql", "delete from t where id = 1;").length === 0);
check("Freigabe-Zeile erlaubt DROP TABLE", mit("20261027000000_x.sql", "-- migration:destruktiv-ok\ndrop table t;").length === 0);
check("Wort im Kommentar loest keinen Alarm aus", mit("20261027000000_x.sql", "-- drop table wird hier nicht ausgefuehrt\nselect 1;").length === 0);
check("Wort in einer Zeichenkette loest keinen Alarm aus", mit("20261027000000_x.sql", "select 'drop table x';").length === 0);
check("drop policy und drop function sind erlaubt", mit("20261027000000_x.sql", "drop policy p on t; drop function f();").length === 0);
check("zerstoerendeAnweisungen findet mehrere", zerstoerendeAnweisungen("drop table a; truncate b;").length === 2);
check("zerstoerende Anweisung in schon vorhandener Datei wird nicht erneut bemaengelt",
  pruefe({ dateien: basis.dateien, inhalte: { [basis.dateien[0]]: "drop table t;" }, basis }).length === 0);

console.log(`\nPruefungen: ${gesamt}   bestanden: ${gesamt - fehlgeschlagen}   fehlgeschlagen: ${fehlgeschlagen}`);
if (fehlgeschlagen > 0) process.exit(1);
console.log("Alle Pruefungen bestanden.");
