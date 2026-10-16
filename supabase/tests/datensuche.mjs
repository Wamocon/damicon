// Datenbanktest der globalen Datensuche (WMCNL-1467): public.search_everything().
// Ausfuehren: npm run test:datensuche   (PGlite, kein Docker noetig)

import { starte } from "./hilfen/pglite-rollen.mjs";

const t = await starte();
const { db, check, als, alsAdmin, alsRolle, mussScheitern } = t;

const suche = (q, max) =>
  max === undefined
    ? db.query("select * from public.search_everything($1);", [q])
    : db.query("select * from public.search_everything($1, $2);", [q, max]);

// --- Testdaten: ein Pfluecker, eine Steige, ein Dokument mit bekannten Namen ----
const { rows: bloecke } = await db.query(
  `select rb.id, rb.code from public.reihenbloecke rb order by rb.code limit 1;`,
);
const block = bloecke[0];
const { rows: chargen } = await db.query(
  `insert into public.chargen (code, reihenblock_id) values ('CH-SUCHE-0001', $1) returning id;`,
  [block.id],
);
await db.query(
  `insert into public.steigen (code, qr_token, charge_id) values ('ST-SUCHE-0001', 'qr-suche-0001', $1);`,
  [chargen[0].id],
);
await db.query(
  `insert into public.pfluecker (name, ausweis) values ('Suchperson Zebra', 'ID-SUCHE-4711');`,
);
await db.query(
  `insert into public.dokumente (name, bezug) values ('Suchdokument 50% Rabatt', 'Antrag SUCHE_1');`,
);

// --- 1. Zugriff ---------------------------------------------------------------
await alsRolle("anon");
await mussScheitern("anon darf die Suche nicht aufrufen", "select * from public.search_everything('CH-')", [], "42501");

// --- 2. Eingabe -----------------------------------------------------------------
await als("admin", async () => {
  for (const [name, q] of [
    ["leere Eingabe", ""],
    ["nur Leerraum", "   "],
    ["ein einzelnes Zeichen", "C"],
    ["null", null],
  ]) {
    const { rows } = await suche(q);
    check(`Mindestlaenge: ${name} liefert nichts`, rows.length === 0, `Treffer: ${rows.length}`);
  }
  const { rows: zwei } = await suche("CH");
  check("Mindestlaenge: zwei Zeichen genuegen", zwei.length > 0, `Treffer: ${zwei.length}`);
});

// --- 3. Maskierung: Platzhalter sind Zeichen --------------------------------------
await als("admin", async () => {
  for (const q of ["%%", "__", "\\\\", "%_"]) {
    const { rows } = await suche(q);
    check(`Maskierung: "${q}" ist kein Platzhalter`, rows.length === 0, `Treffer: ${rows.length}`);
  }
  const { rows: prozent } = await suche("50%");
  check(
    "Maskierung: Prozentzeichen wird woertlich gesucht",
    prozent.length === 1 && prozent[0].treffer_typ === "dokument",
    prozent.map((r) => r.treffer_titel).join(", "),
  );
  const { rows: unterstrich } = await suche("SUCHE_1");
  check(
    "Maskierung: Unterstrich wird woertlich gesucht",
    unterstrich.length === 1 && unterstrich[0].treffer_typ === "dokument",
    unterstrich.map((r) => r.treffer_titel).join(", "),
  );
});

// --- 4. Treffer, Typen und Rangfolge ------------------------------------------------
await als("admin", async () => {
  const { rows } = await suche("SUCHE-0001");
  const typen = rows.map((r) => r.treffer_typ).sort();
  check("Treffer: Steige und Charge mit demselben Code", typen.join(",") === "charge,steige", typen.join(","));
  const steige = rows.find((r) => r.treffer_typ === "steige");
  check("Treffer: Untertitel der Steige nennt Charge und Block", steige?.treffer_untertitel?.includes("CH-SUCHE-0001") && steige.treffer_untertitel.includes(block.code), steige?.treffer_untertitel);

  const { rows: pf } = await suche("zebra");
  check("Treffer: Pfluecker ohne Beachtung der Gross-/Kleinschreibung", pf.length === 1 && pf[0].treffer_typ === "pfluecker");
  const { rows: ausweis } = await suche("id-suche-4711");
  check("Treffer: Pfluecker ueber die Ausweisnummer", ausweis.length === 1 && ausweis[0].treffer_titel === "Suchperson Zebra");

  const { rows: rang } = await suche("CH-SUCHE-0001");
  check("Rang: genau gleicher Code steht vor Teiltreffern", rang[0]?.treffer_rang === 0, `Rang: ${rang[0]?.treffer_rang}`);

  const { rows: anfang } = await suche("CH-SUCH");
  check("Rang: Anfang des Codes ist Stufe 1", anfang.find((r) => r.treffer_typ === "charge")?.treffer_rang === 1);
  const { rows: mitte } = await suche("SUCHE-00");
  check("Rang: Treffer mitten im Code ist Stufe 2", mitte.every((r) => r.treffer_rang === 2));
});

// --- 5. Obergrenze ----------------------------------------------------------------------
await als("admin", async () => {
  await alsAdmin();
  await db.query(
    `insert into public.chargen (code, reihenblock_id)
     select 'CH-MASSE-' || lpad(n::text, 3, '0'), $1 from generate_series(1, 80) n;`,
    [block.id],
  );
  await alsRolle("authenticated", t.konten.admin);
  const { rows: viele } = await suche("CH-MASSE", 1000);
  check("Obergrenze: hoechstens 50 Treffer, auch bei max_rows 1000", viele.length === 50, `Treffer: ${viele.length}`);
  const { rows: standard } = await suche("CH-MASSE");
  check("Obergrenze: Standard sind 20 Treffer", standard.length === 20, `Treffer: ${standard.length}`);
  const { rows: null_ } = await suche("CH-MASSE", 0);
  check("Obergrenze: max_rows 0 wird auf 1 angehoben", null_.length === 1, `Treffer: ${null_.length}`);
});

// --- 6. Zeilensicherheit: die Suche zeigt nie mehr als die Tabelle selbst -----------------
const direkt = {
  steige: "select id from public.steigen",
  charge: "select id from public.chargen",
  aufgabe: "select id from public.pflueckaufgaben",
  pfluecker: "select id from public.pfluecker",
  block: "select id from public.reihenbloecke",
  dokument: "select id from public.dokumente",
  kunde: "select id from public.b2b_kunden",
};
for (const rolle of ["admin", "ceo", "betriebsleitung", "buchhaltung", "brigade", "picker", "erzeuger", "kunde"]) {
  await als(rolle, async () => {
    const { rows } = await suche("SUCHE");
    const gesehen = {};
    for (const [typ, sql] of Object.entries(direkt)) {
      gesehen[typ] = new Set((await db.query(sql)).rows.map((r) => r.id));
    }
    const ueber = rows.filter((r) => !gesehen[r.treffer_typ].has(r.treffer_id));
    check(`RLS: ${rolle} bekommt nur Zeilen, die die Tabelle selbst zeigt`, ueber.length === 0, `Treffer: ${rows.length}, darueber hinaus: ${ueber.length}`);
  });
}

// Personendaten und Kundenstamm: nicht fuer Rollen ohne Buero-Recht. Die Erwartung
// folgt aus den Policies der Tabellen und wird hier festgehalten, damit eine
// spaetere Policy-Aenderung nicht unbemerkt die Suche oeffnet.
const personen = {};
for (const rolle of ["admin", "betriebsleitung", "buchhaltung", "brigade", "picker", "erzeuger", "kunde"]) {
  personen[rolle] = await als(rolle, async () => {
    const { rows } = await suche("SUCHE");
    return rows.filter((r) => r.treffer_typ === "pfluecker").length;
  });
}
check("RLS: admin findet den Pfluecker", personen.admin === 1, `Treffer: ${personen.admin}`);
check(
  "RLS: kunde findet keinen Pfluecker",
  personen.kunde === 0,
  `Treffer: ${personen.kunde} (steht die Policy pfluecker_select_public noch offen, ist das ein Befund fuer die Policies, nicht fuer die Suche)`,
);
check(
  "RLS: erzeuger findet keinen Pfluecker",
  personen.erzeuger === 0,
  `Treffer: ${personen.erzeuger}`,
);

t.ende("Alle Datensuche-Tests gruen.");
