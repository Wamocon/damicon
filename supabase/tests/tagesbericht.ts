// Tests fuer die Tages-Uebersicht auf der Startseite (lib/domain/tagesbericht.ts) und dafuer,
// wer sie ausloesen darf (lib/pruefung/rollen.ts).
//
// Kein Netzwerk, keine Datenbank, kein Modell: die Ableitung ist eine reine Funktion ueber
// einen fertigen Bericht. Genau deshalb liegt sie in lib/domain und nicht in der Komponente.
// Aufruf: npm run test:tagesbericht (ueber tsx, damit die @/-Pfade aufloesen).

import { readFileSync } from "node:fs";
import { bereichskacheln } from "@/lib/domain/tagesbericht";
import { kennzahlen } from "@/lib/pruefung/befund";
import { darfCeoBericht, darfCeoBerichtLesen, PRUEFBEREICHE, type Pruefbereich } from "@/lib/pruefung/rollen";
import type { Befund, Bericht } from "@/lib/pruefung/typen";
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

// ---- Kein oder beschnittener Bericht -------------------------------------------------------

pruefe("Ohne Bericht: vier Kacheln, alle ungeprueft", bereichskacheln(null).length === 4 && bereichskacheln(null).every((k) => !k.geprueft));

// lib/data/compliance-ceo.ts nimmt die jsonb-Spalte ungeprueft mit "as Bericht" entgegen.
// Eine aeltere Zeile ohne befunde darf die Startseite nicht kippen.
const beschnitten = { id: "alt", erstelltAm: new Date().toISOString() } as unknown as Bericht;
pruefe("Beschnittene Altzeile: Kacheln bleiben ungeprueft, kein Absturz", bereichskacheln(beschnitten).every((k) => !k.geprueft));

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
// Die Finanzzahlen stehen an genau einer Stelle. Seit dem 23.09.2026 ist das die rechte
// Haelfte der Begruessungskarte - der Reiter Compliance traegt nur noch die vier
// Pruefbereiche, einen eigenen Finanzreiter gibt es nicht mehr.
const compliance = quelle("src/components/dashboard/tages-compliance.tsx");
const kachelQuelle2 = quelle("src/components/dashboard/tages-kacheln.tsx");
pruefe("Der Reiter Compliance laedt keine Finanzzahlen", !compliance.includes("ladeFinanzVorschau") && !kachelQuelle2.includes("FinanzKachel"));
pruefe("Die Finanzzahl haengt an der Startkarte, nicht an einem Reiter", seite.includes("<StartkarteFinanzen />") && !seite.includes("FinanzenReiter"));

const kontext = quelle("src/components/dashboard/ceo-pruefung-kontext.tsx");
pruefe("Der Auto-Lauf haengt an der ECHTEN Rolle, nicht an der Vorschau", kontext.includes("darfCeoBericht(echteRolle)"));

const berichtSeite = quelle("src/app/[locale]/dashboard/compliance/page.tsx");
pruefe("Der volle Bericht ist serverseitig abgesichert", berichtSeite.includes("darfCeoBerichtLesen(profil?.role)") && berichtSeite.includes("notFound()"));

console.log(`\nPruefungen: ${gesamt}   bestanden: ${gesamt - fehler}   fehlgeschlagen: ${fehler}`);
if (fehler > 0) process.exit(1);
console.log("Alle Pruefungen bestanden.");
