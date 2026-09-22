// Tests fuer die Tages-Uebersicht auf der Startseite (lib/domain/tagesbericht.ts) und dafuer,
// wer sie ausloesen darf (lib/pruefung/rollen.ts).
//
// Kein Netzwerk, keine Datenbank, kein Modell: die Ableitung ist eine reine Funktion ueber
// einen fertigen Bericht. Genau deshalb liegt sie in lib/domain und nicht in der Komponente.
// Aufruf: npm run test:tagesbericht (ueber tsx, damit die @/-Pfade aufloesen).

import { readFileSync } from "node:fs";
import { bereichskacheln, tagesbericht } from "@/lib/domain/tagesbericht";
import { kennzahlen } from "@/lib/pruefung/befund";
import { darfCeoBericht, darfCeoBerichtLesen, PRUEFBEREICHE, type Pruefbereich } from "@/lib/pruefung/rollen";
import type { Befund, BefundAenderung, Bericht, Schwere } from "@/lib/pruefung/typen";
import { roles } from "@/lib/rbac";

let gesamt = 0;
let fehler = 0;
function pruefe(name: string, ok: boolean, detail = "") {
  gesamt++;
  if (!ok) fehler++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
}
const gleich = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ---- Bausteine ---------------------------------------------------------------------------------

function befund(teil: Partial<Befund> & { id: string; bereich: Pruefbereich }): Befund {
  return {
    feld: `${teil.bereich}-1`,
    titel: `Titel ${teil.id}`,
    status: "verstoss",
    schwere: "hoch",
    befund: "Text",
    belege: ["S1"],
    nachweise: [],
    massnahmen: [],
    ...teil,
  };
}

function bericht(teil: Partial<Bericht> = {}): Bericht {
  return {
    id: "b1",
    erstelltAm: new Date("2026-09-23T06:00:00Z").toISOString(),
    ersteller: { name: "Test", rolle: "ceo" },
    bereiche: [...PRUEFBEREICHE],
    abgelehnteBereiche: [],
    modell: "mock",
    sprache: "de",
    kennzahlen: kennzahlen(teil.befunde ?? []),
    zusammenfassung: "Kurzfassung.",
    prioritaeten: [],
    befunde: [],
    belege: [],
    massnahmen: [],
    vollstaendig: true,
    hinweise: [],
    siegel: { algorithmus: "SHA-256", wert: "x" },
    ...teil,
  };
}

// ---- Wer darf ----------------------------------------------------------------------------------

pruefe("darfCeoBericht: genau ceo und admin", gleich(roles.filter(darfCeoBericht), ["admin", "ceo"]));
pruefe("darfCeoBerichtLesen: genau ceo und admin", gleich(roles.filter(darfCeoBerichtLesen), ["admin", "ceo"]));
pruefe(
  "Ohne Rolle darf niemand - weder lesen noch ausloesen",
  !darfCeoBericht(null) && !darfCeoBericht(undefined) && !darfCeoBerichtLesen(null) && !darfCeoBerichtLesen(undefined),
);
pruefe(
  "Jede Rolle ist entschieden, keine ist vergessen",
  roles.every((r) => typeof darfCeoBericht(r) === "boolean" && typeof darfCeoBerichtLesen(r) === "boolean"),
);
pruefe(
  "Buchhaltung und Betriebsleitung duerfen den Gesamtbericht nicht, obwohl sie Pruefbereiche haben",
  !darfCeoBericht("buchhaltung") && !darfCeoBericht("betriebsleitung") && !darfCeoBerichtLesen("buchhaltung"),
);

// ---- Kein oder beschnittener Bericht -------------------------------------------------------------

const ohne = tagesbericht(null, []);
pruefe("Ohne Bericht: nichts vorhanden, keine Punkte, Reife 0", !ohne.vorhanden && ohne.punkte.length === 0 && ohne.reife === 0);
pruefe("Ohne Bericht: vier Kacheln, alle ungeprueft", bereichskacheln(null).length === 4 && bereichskacheln(null).every((k) => !k.geprueft));

// lib/data/compliance-ceo.ts nimmt die jsonb-Spalte ungeprueft mit "as Bericht" entgegen.
// Eine aeltere Zeile ohne befunde darf die Startseite nicht kippen.
const beschnitten = { id: "alt", erstelltAm: new Date().toISOString() } as unknown as Bericht;
let warfNicht = true;
try {
  const b = tagesbericht(beschnitten, []);
  warfNicht = b.vorhanden === false;
} catch {
  warfNicht = false;
}
pruefe("Beschnittene Altzeile wirft nicht und zaehlt wie kein Bericht", warfNicht);
pruefe("Beschnittene Altzeile: Kacheln bleiben ungeprueft", bereichskacheln(beschnitten).every((k) => !k.geprueft));

// ---- Auswahl der drei Punkte ---------------------------------------------------------------------

const mitAllem = bericht({
  prioritaeten: ["Erstens", "Zweitens"],
  befunde: [befund({ id: "f1", bereich: "risiko", schwere: "kritisch" })],
  massnahmen: [{ schritt: "Sofort handeln", verantwortlich: "admin", frist: "sofort", befundId: "f1", titel: "T", schwere: "kritisch" }],
});
const drei = tagesbericht(mitAllem, []);
pruefe("Prioritaeten stehen vor Befunden", drei.punkte[0]?.text === "Erstens" && drei.punkte[1]?.text === "Zweitens");
pruefe("Danach folgt der schwerste Befund, nicht die Massnahme", drei.punkte[2]?.art === "befund");
pruefe("Nie mehr als drei Punkte", drei.punkte.length === 3);

const nurMassnahme = tagesbericht(
  bericht({
    massnahmen: [
      { schritt: "Sofort handeln", verantwortlich: "admin", frist: "sofort", befundId: "f1", titel: "T", schwere: "hoch" },
      { schritt: "Spaeter", verantwortlich: "admin", frist: "30 Tage", befundId: "f2", titel: "T2", schwere: "hoch" },
    ],
  }),
  [],
);
pruefe("Ohne Prioritaeten und Befunde bleiben nur Sofortmassnahmen", gleich(nurMassnahme.punkte.map((p) => p.text), ["Sofort handeln"]));

// Eine Prioritaet, die einen Befundtitel wiederholt, steht nur einmal da.
const doppelt = tagesbericht(
  bericht({ prioritaeten: ["  Titel f1  "], befunde: [befund({ id: "f1", bereich: "audit" })] }),
  [],
);
pruefe("Wiederholter Text erscheint nur einmal", doppelt.punkte.length === 1);

// Gleichwertige Befunde muessen unabhaengig von der Reihenfolge des Modells gleich herauskommen.
const vorwaerts = [
  befund({ id: "a", bereich: "risiko", schwere: "hoch" }),
  befund({ id: "b", bereich: "audit", schwere: "hoch" }),
  befund({ id: "c", bereich: "steuer", schwere: "hoch" }),
];
const stabilA = tagesbericht(bericht({ befunde: vorwaerts }), []).punkte.map((p) => p.befundId);
const stabilB = tagesbericht(bericht({ befunde: [...vorwaerts].reverse() }), []).punkte.map((p) => p.befundId);
pruefe("Gleichwertige Befunde kommen in Bereichsreihenfolge, egal wie das Modell sie lieferte", gleich(stabilA, stabilB));
pruefe("Und zwar audit vor steuer vor risiko", gleich(stabilA, ["b", "c", "a"]));

const schweren: Schwere[] = ["niedrig", "kritisch", "mittel"];
const nachSchwere = tagesbericht(
  bericht({ befunde: schweren.map((s, i) => befund({ id: `s${i}`, bereich: "audit", schwere: s })) }),
  [],
);
pruefe("Der kritische Befund steht vorn", nachSchwere.punkte[0]?.schwere === "kritisch");

pruefe(
  "Konforme Befunde sind keine Punkte",
  tagesbericht(bericht({ befunde: [befund({ id: "k", bereich: "audit", status: "konform", schwere: "keine" })] }), []).punkte.length === 0,
);

// ---- Zahlen und Zusammenfassung ------------------------------------------------------------------

const zahlenBericht = bericht({
  befunde: [
    befund({ id: "v", bereich: "audit", status: "verstoss" }),
    befund({ id: "l", bereich: "steuer", status: "luecke" }),
    befund({ id: "o", bereich: "recht", status: "hinweis", ohneDaten: true }),
  ],
  massnahmen: [
    { schritt: "A", verantwortlich: "admin", frist: "sofort", befundId: "v", titel: "T", schwere: "hoch" },
    { schritt: "B", verantwortlich: "admin", frist: "90 Tage", befundId: "l", titel: "T", schwere: "mittel" },
  ],
});
const z = tagesbericht(zahlenBericht, []).zahlen;
pruefe("Zahlen: ein Verstoss, eine Luecke", z.verstoesse === 1 && z.luecken === 1);
pruefe("Zahlen: sofort zaehlt nur Massnahmen mit Frist sofort", z.sofort === 1);
pruefe("Zahlen: ohneDaten kommt aus den Kennzahlen", z.ohneDaten === 1);

pruefe(
  "Leere Zusammenfassung bleibt ein leerer String, nicht undefined",
  tagesbericht(bericht({ zusammenfassung: "   " }), []).zusammenfassung === "",
);

// ---- Aenderungen ---------------------------------------------------------------------------------

const vieleAenderungen: BefundAenderung[] = (["niedrig", "kritisch", "mittel", "hoch", "keine"] as Schwere[]).map((s, i) => ({
  befundId: `a${i}`,
  titel: `A${i}`,
  art: "neu",
  status: "verstoss",
  schwere: s,
}));
const mitAenderungen = tagesbericht(bericht(), vieleAenderungen);
pruefe("Hoechstens drei Aenderungen, schwerste zuerst", mitAenderungen.aenderungen.length === 3 && mitAenderungen.aenderungen[0]!.schwere === "kritisch");
pruefe("Der Rest wird gezaehlt, nicht verschwiegen", mitAenderungen.weitereAenderungen === 2 && mitAenderungen.zahlen.aenderungen === 5);

// ---- Alterung --------------------------------------------------------------------------------------

const jetzt = new Date("2026-09-23T12:00:00Z");
const alt = (stunden: number) => bericht({ erstelltAm: new Date(jetzt.getTime() - stunden * 3_600_000).toISOString() });
pruefe("25 Stunden alt gilt als veraltet", tagesbericht(alt(25), [], jetzt).veraltet);
pruefe("23 Stunden alt gilt nicht als veraltet", !tagesbericht(alt(23), [], jetzt).veraltet);

// ---- Kacheln ---------------------------------------------------------------------------------------

const teilLauf = bericht({ bereiche: ["audit", "steuer"], befunde: [befund({ id: "t", bereich: "audit" })] });
const kacheln = bereichskacheln(teilLauf);
pruefe("Immer vier Kacheln, immer in derselben Reihenfolge", gleich(kacheln.map((k) => k.bereich), [...PRUEFBEREICHE]));
pruefe("Nicht gefuehrte Bereiche sind ungeprueft", kacheln.filter((k) => k.geprueft).length === 2);
pruefe(
  "Die Reife einer Kachel ist die der Befunde dieses Bereichs",
  kacheln.find((k) => k.bereich === "audit")!.kz!.reife === kennzahlen([befund({ id: "t", bereich: "audit" })]).reife,
);

// Alle Befunde ohne Betriebsdaten: eine Reife von 100 waere hier eine erfundene Zahl.
const ohneDaten = bereichskacheln(
  bericht({
    befunde: [
      befund({ id: "x1", bereich: "audit", status: "hinweis", ohneDaten: true }),
      befund({ id: "x2", bereich: "audit", status: "hinweis", ohneDaten: true }),
      befund({ id: "y", bereich: "steuer", status: "hinweis" }),
    ],
  }),
);
pruefe("Bereich ohne jede Betriebsdatenlage meldet ohneDaten", ohneDaten.find((k) => k.bereich === "audit")!.ohneDaten);
pruefe("Ein einzelner Befund ohne Daten reicht dafuer nicht", !ohneDaten.find((k) => k.bereich === "steuer")!.ohneDaten);

// ---- Die Weichen im Code ---------------------------------------------------------------------------
// Dieselbe Rollenfrage stand bis zum 23.09.2026 an fuenf Stellen woertlich. Diese Pruefungen
// halten fest, dass sie wieder an einer einzigen haengt.

const quelle = (p: string) => readFileSync(p, "utf8");
const autoRoute = quelle("src/app/api/ki-pruefung/auto/route.ts");
pruefe("Auto-Route entscheidet ueber darfCeoBericht", autoRoute.includes("darfCeoBericht(profil.role)") && !autoRoute.includes('role !== "ceo"'));

const ceoAuto = quelle("src/lib/pruefung/ceo-auto.ts");
pruefe("Auto-Lauf: die echte Rolle steht im Bericht, nicht immer ceo", ceoAuto.includes("rolle: profil.role") && !ceoAuto.includes('rolle: "ceo"'));
pruefe("Auto-Lauf: Abkuehlzeit gegen den zweiten teuren Lauf am Morgen", ceoAuto.includes("ABKUEHLZEIT_MS"));
pruefe("Auto-Lauf: die Sperre haengt am Bericht, nicht an der Person", !ceoAuto.includes("laufend.has(profil.id)"));

const seite = quelle("src/app/[locale]/dashboard/page.tsx");
pruefe("Startseite entscheidet ueber darfCeoBerichtLesen", seite.includes("darfCeoBerichtLesen(profil?.role)") && !seite.includes('profil?.role === "ceo"'));
pruefe(
  "Finanzzahlen stehen an genau einer Stelle, nie doppelt",
  seite.includes("!zeigtTagesUebersicht && darfFinanzenSehen"),
);

const kontext = quelle("src/components/dashboard/ceo-pruefung-kontext.tsx");
pruefe("Der Auto-Lauf haengt an der ECHTEN Rolle, nicht an der Vorschau", kontext.includes("darfCeoBericht(echteRolle)"));

const berichtSeite = quelle("src/app/[locale]/dashboard/compliance/page.tsx");
pruefe("Der volle Bericht ist serverseitig abgesichert", berichtSeite.includes("darfCeoBerichtLesen(profil?.role)") && berichtSeite.includes("notFound()"));

console.log(`\nPruefungen: ${gesamt}   bestanden: ${gesamt - fehler}   fehlgeschlagen: ${fehler}`);
if (fehler > 0) process.exit(1);
console.log("Alle Pruefungen bestanden.");
