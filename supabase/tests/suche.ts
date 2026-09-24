// Globale Suche, Stufe 1: Suchkern, Zielliste und Zuletzt-Liste
// (src/lib/suche/). Kein Browser, keine Datenbank.
//
// Der Kern der Pruefung ist die Abdeckung: fuer jede Rolle, jede Sprache und
// beide Betriebsarten muss jedes Modul, das die Navigation zeigt, ueber seinen
// Namen auf Rang 1 gefunden werden - und keines, das sie nicht zeigt. Kommt ein
// Modul dazu oder aendert sich ein Name so, dass er mit einem anderen
// zusammenfaellt, wird der Lauf hier rot und nicht erst beim Nutzer.
//
// Aufruf: npm run test:suche (ueber tsx, damit die @/-Pfade aufloesen).

import { readFileSync } from "node:fs";
import {
  bewerte,
  indexFeld,
  istSuchKuerzel,
  normalisiere,
  zerlegeAnfrage,
  type Taste,
} from "@/lib/suche/kern";
import {
  baueSeitenZiele,
  sucheSeiten,
  zielSchluesselFuerPfad,
  type SeitenZiel,
  type Uebersetze,
} from "@/lib/suche/seiten-ziele";
import {
  liesZuletzt,
  merkeZuletzt,
  zuletztAufloesen,
  ZULETZT_SPEICHER,
  type Ablage,
} from "@/lib/suche/zuletzt";
import { modules, moduleHref, sichtbareModule, zones } from "@/lib/modules";
import { darfCeoBerichtLesen } from "@/lib/pruefung/rollen";
import { roles } from "@/lib/rbac";

let bestanden = 0;
let fehlgeschlagen = 0;

function pruefe(name: string, bedingung: boolean, zusatz = "") {
  if (bedingung) {
    bestanden++;
    console.log(`PASS  ${name}${zusatz ? "  - " + zusatz : ""}`);
  } else {
    fehlgeschlagen++;
    console.log(`FAIL  ${name}${zusatz ? "  - " + zusatz : ""}`);
  }
}

// --- Texte wie zur Laufzeit: jede Sprache ueber Deutsch gelegt ------------
// Nachgebaut aus src/i18n/request.ts - fehlende oder leere Texte fallen dort
// auf die deutsche Fassung zurueck, also auch hier.

type Baum = { [k: string]: string | Baum };
const sprachen = ["de", "en", "ru", "kk"] as const;

function lade(sprache: string): Baum {
  return JSON.parse(readFileSync(`src/messages/${sprache}.json`, "utf8")) as Baum;
}

function mische(basis: Baum, drueber: Baum): Baum {
  const ergebnis: Baum = { ...basis };
  for (const [k, v] of Object.entries(drueber)) {
    const alt = ergebnis[k];
    if (typeof v === "object" && typeof alt === "object") ergebnis[k] = mische(alt, v);
    else if (v !== "") ergebnis[k] = v;
  }
  return ergebnis;
}

const deutsch = lade("de");
function uebersetzer(sprache: string): Uebersetze {
  const baum = sprache === "de" ? deutsch : mische(deutsch, lade(sprache));
  return (pfad) => {
    const wert = pfad
      .split(".")
      .reduce<unknown>((b, k) => (b && typeof b === "object" ? (b as Baum)[k] : undefined), baum);
    if (typeof wert !== "string") throw new Error(`Text fehlt: ${pfad} (${sprache})`);
    return wert;
  };
}

// --- 1. Normalisieren ------------------------------------------------------

const pflucker = ["Pflücker", "Pfluecker", "Pflucker", "PFLÜCKER"].map(normalisiere);
pruefe(
  "Umlaut, Ersatzschreibung, ohne Umlaut und Grossschreibung sind gleich",
  pflucker.every((p) => p === "pflucker"),
  pflucker.join(" / "),
);
pruefe("ß wird ss", normalisiere("Straße") === "strasse");
pruefe("ё wird е, kyrillisch klein", normalisiere("ЁЛКА") === "елка");
pruefe("й bleibt ein eigener Buchstabe", normalisiere("Мой") === "мой" && normalisiere("мой") !== normalisiere("мои"));
pruefe("é wird e", normalisiere("Café") === "cafe");
pruefe(
  "kasachische Buchstaben bleiben erhalten",
  normalisiere("Қатар блогы Әлем Үй") === "қатар блогы әлем үй",
);
pruefe(
  "Satzzeichen trennen Woerter, Leerraum faellt weg",
  normalisiere("  Kühlketten-Uhr  (neu) ") === "kuhlketten uhr neu",
);
pruefe("leere Anfrage wird zu null", zerlegeAnfrage("  -- / ") === null);

// --- 2. Rangstufen ----------------------------------------------------------

const wert = (felder: string[], anfrage: string) =>
  bewerte(
    felder.map((f) => indexFeld(f, 3)),
    zerlegeAnfrage(anfrage)!,
  );
const stufen = [
  wert(["Lohn"], "lohn"), // Feld gleich Anfrage
  wert(["Lohnabrechnung"], "lohn"), // Feld beginnt mit Anfrage
  wert(["Qualität und Lohn"], "lohn"), // Wortanfang
  bewerte([indexFeld("Feld", 1), indexFeld("Reihenblöcke", 3)], zerlegeAnfrage("feld reihen")!), // ueber zwei Felder
  wert(["Kühlkette"], "kette"), // Teilwort
];
pruefe(
  "Stufen: gleich > Anfang > Wortanfang > zwei Felder > Teilwort",
  stufen.every((w, i) => w !== null && (i === 0 || w < stufen[i - 1]!)),
  stufen.join(" > "),
);
pruefe("Teilwort erst ab drei Zeichen", wert(["Kühlkette"], "ke") === null);
pruefe("kein Treffer ergibt null", wert(["Lohn"], "Kühlkette") === null);
pruefe(
  "Kuhlkette und Kuehlkette finden Kühlkette genau",
  wert(["Kühlkette"], "Kuhlkette") === 53 && wert(["Kühlkette"], "Kuehlkette") === 53,
);

// --- 3. Abdeckung: jede Rolle, jede Sprache, beide Betriebsarten ------------

const modulFehler: string[] = [];
const unsichtbarGefunden: string[] = [];
const bereichFehler: string[] = [];
const seitenFehler: string[] = [];
const hrefFehler: string[] = [];
let laeufe = 0;

const erster = (ziele: SeitenZiel[], anfrage: string) => sucheSeiten(ziele, anfrage)[0]?.schluessel;

for (const sprache of sprachen) {
  const t = uebersetzer(sprache);
  for (const rolle of roles) {
    for (const demoModus of [false, true]) {
      laeufe++;
      const ziele = baueSeitenZiele(rolle, { demoModus, locale: sprache }, t);
      const lauf = `${sprache}/${rolle}/${demoModus ? "demo" : "db"}`;

      for (const zone of zones) {
        const sichtbar = sichtbareModule(rolle, zone.key);
        const sichtbareSchluessel = new Set(sichtbar.map((m) => m.key));

        for (const modul of sichtbar) {
          const titel = t(`modules.${modul.key}.title`);
          const kurz = t(`modules.${modul.key}.navTitle`);
          for (const anfrage of [titel, kurz, titel.toUpperCase()]) {
            const gefunden = erster(ziele, anfrage);
            if (gefunden !== `modul:${modul.key}`) {
              modulFehler.push(`${lauf} "${anfrage}" -> ${gefunden ?? "nichts"}`);
            }
          }
        }

        for (const modul of modules.filter((m) => m.zone === zone.key)) {
          if (sichtbareSchluessel.has(modul.key)) continue;
          const treffer = sucheSeiten(ziele, t(`modules.${modul.key}.title`), 50);
          if (treffer.some((z) => z.schluessel === `modul:${modul.key}`)) {
            unsichtbarGefunden.push(`${lauf} ${modul.key}`);
          }
        }

        const hatBereich = ziele.some((z) => z.schluessel === `bereich:${zone.key}`);
        if (hatBereich !== sichtbar.length > 0) {
          bereichFehler.push(`${lauf} ${zone.key}: Ziel ${hatBereich}, Module ${sichtbar.length}`);
        } else if (hatBereich && erster(ziele, t(`zones.${zone.key}.name`)) !== `bereich:${zone.key}`) {
          bereichFehler.push(`${lauf} ${zone.key}: nicht auf Rang 1`);
        }
      }

      const hat = (s: string) => ziele.some((z) => z.schluessel === s);
      if (hat("seite:sicherheit") === demoModus) seitenFehler.push(`${lauf} Sicherheit`);
      if (hat("seite:compliance") !== (!demoModus && darfCeoBerichtLesen(rolle))) {
        seitenFehler.push(`${lauf} Compliance`);
      }
      const handbuch = ziele.find((z) => z.schluessel === "seite:handbuch");
      if (!handbuch?.extern || handbuch.href !== `/${sprache}/dashboard/handbuch`) {
        seitenFehler.push(`${lauf} Handbuch`);
      }
      if (!hat("uebersicht")) seitenFehler.push(`${lauf} Uebersicht`);

      // Jede Adresse ohne Sprachpraefix ist eine bekannte Dashboard-Route -
      // die Client-Navigation setzt das Praefix selbst davor.
      const erlaubt = new Set([
        "/dashboard",
        "/dashboard/sicherheit",
        "/dashboard/compliance",
        ...zones.map((z) => `/dashboard/${z.key}`),
        ...modules.map(moduleHref),
      ]);
      for (const ziel of ziele) {
        if (!ziel.extern && !erlaubt.has(ziel.href)) hrefFehler.push(`${lauf} ${ziel.href}`);
      }
    }
  }
}

const zeige = (liste: string[]) => (liste.length ? liste.slice(0, 5).join("; ") : "");
pruefe(
  "jedes sichtbare Modul steht mit Titel, Kurzname und Grossschreibung auf Rang 1",
  modulFehler.length === 0,
  modulFehler.length ? zeige(modulFehler) : `${laeufe} Laeufe`,
);
pruefe("kein unsichtbares Modul wird gefunden", unsichtbarGefunden.length === 0, zeige(unsichtbarGefunden));
pruefe(
  "Bereiche genau dann, wenn sie ein sichtbares Modul haben, und mit ihrem Namen auf Rang 1",
  bereichFehler.length === 0,
  zeige(bereichFehler),
);
pruefe(
  "Sicherheit nur mit Datenbank, Compliance nur fuer admin und ceo, Handbuch immer extern",
  seitenFehler.length === 0,
  zeige(seitenFehler),
);
pruefe("alle internen Adressen sind bekannte Dashboard-Routen", hrefFehler.length === 0, zeige(hrefFehler));

const pickerZiele = baueSeitenZiele("picker", { demoModus: true, locale: "de" }, uebersetzer("de"));
const pickerModule = pickerZiele.filter((z) => z.schluessel.startsWith("modul:")).length;
pruefe("Pfluecker sieht genau zwei Module", pickerModule === 2, String(pickerModule));
pruefe(
  "Suche nach einem Bereichsnamen zeigt den Bereich vor seinen Modulen",
  (() => {
    const ziele = baueSeitenZiele("admin", { demoModus: false, locale: "de" }, uebersetzer("de"));
    const treffer = sucheSeiten(ziele, "Feld");
    return treffer[0]?.schluessel === "bereich:feld" && treffer.length > 1;
  })(),
);
pruefe(
  "leere Eingabe liefert keine Treffer",
  sucheSeiten(pickerZiele, "   ").length === 0,
);
pruefe(
  "die Tagline eines Bereichs fuehrt nicht auf Module, die die Rolle nicht sieht",
  sucheSeiten(pickerZiele, "Finanzen").length === 0,
  sucheSeiten(pickerZiele, "Finanzen").map((z) => z.schluessel).join(","),
);

// --- 4. Zuletzt geoeffnet ---------------------------------------------------

function ablage(): Ablage & { daten: Map<string, string> } {
  const daten = new Map<string, string>();
  return {
    daten,
    getItem: (k) => daten.get(k) ?? null,
    setItem: (k, v) => void daten.set(k, v),
    removeItem: (k) => void daten.delete(k),
  };
}

{
  const a = ablage();
  merkeZuletzt(a, "u1", "modul:lohn");
  merkeZuletzt(a, "u1", "bereich:feld");
  merkeZuletzt(a, "u1", "modul:lohn");
  pruefe(
    "neuester Eintrag vorn, doppelte fallen weg",
    liesZuletzt(a, "u1").join(",") === "modul:lohn,bereich:feld",
  );

  for (const m of modules) merkeZuletzt(a, "u1", `modul:${m.key}`);
  pruefe("hoechstens zehn Eintraege", liesZuletzt(a, "u1").length === 10);

  pruefe("andere Person sieht eine leere Liste", liesZuletzt(a, "u2").length === 0);
  pruefe("und die fremde Liste ist danach geloescht", !a.daten.has(ZULETZT_SPEICHER));

  a.setItem(ZULETZT_SPEICHER, "{kaputt");
  pruefe("kaputtes JSON ergibt eine leere Liste", liesZuletzt(a, "u1").length === 0);
  a.setItem(ZULETZT_SPEICHER, JSON.stringify({ nutzer: "u1", ziele: [1, 2] }));
  pruefe("falsche Form ergibt eine leere Liste", liesZuletzt(a, "u1").length === 0);

  pruefe("ohne Ablage keine Liste und kein Fehler", liesZuletzt(null, "u1").length === 0);

  const werfend: Ablage = {
    getItem: () => {
      throw new Error("gesperrt");
    },
    setItem: () => {
      throw new Error("gesperrt");
    },
    removeItem: () => {},
  };
  merkeZuletzt(werfend, "u1", "uebersicht");
  pruefe("gesperrter Speicher wirft nicht", liesZuletzt(werfend, "u1").length === 0);

  // Der Pfluecker sieht lohn und schulungen, finanzen nicht.
  const ziele = baueSeitenZiele("picker", { demoModus: true, locale: "de" }, uebersetzer("de"));
  const aufgeloest = zuletztAufloesen(
    ["modul:gibt-es-nicht", "modul:finanzen", "modul:schulungen", "uebersicht", "seite:handbuch"],
    ziele,
    "uebersicht",
  )
    .map((z) => z.schluessel)
    .join(",");
  pruefe(
    "Aufloesen behaelt die Reihenfolge und laesst Unbekanntes, Unsichtbares und die offene Seite weg",
    aufgeloest === "modul:schulungen,seite:handbuch",
    aufgeloest,
  );
  const fuenf = zuletztAufloesen(
    ziele.map((z) => z.schluessel),
    ziele,
    null,
  );
  pruefe("hoechstens fuenf aufgeloeste Eintraege", fuenf.length === 5, String(fuenf.length));
}

// --- 5. Pfad zu Ziel --------------------------------------------------------

const pfade: [string, string | null][] = [
  ["/dashboard", "uebersicht"],
  ["/dashboard/feld", "bereich:feld"],
  ["/dashboard/hof/qr-steigen", "modul:qr_steigen"],
  ["/dashboard/sicherheit", "seite:sicherheit"],
  ["/dashboard/compliance", "seite:compliance"],
  ["/dashboard/buero/gibt-es-nicht", null],
  ["/dashboard/feld/reihenbloecke/mehr", null],
  ["/herkunft/abc", null],
];
const pfadFehler = pfade.filter(([p, s]) => zielSchluesselFuerPfad(p) !== s).map(([p]) => p);
pruefe("Pfade werden ihrem Ziel zugeordnet", pfadFehler.length === 0, pfadFehler.join(", "));

// --- 6. Tastenkuerzel -------------------------------------------------------

const taste = (teil: Partial<Taste>): Taste => ({
  key: "",
  code: "",
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...teil,
});
const kuerzel: [string, Taste, boolean, boolean][] = [
  ["/ ausserhalb eines Feldes", taste({ key: "/", code: "Slash" }), false, true],
  ["/ mit Umschalt (deutsche Tastatur)", taste({ key: "/", code: "Digit7", shiftKey: true }), false, true],
  ["/ im Eingabefeld", taste({ key: "/", code: "Slash" }), true, false],
  ["Strg+/", taste({ key: "/", ctrlKey: true }), false, false],
  ["Strg+K", taste({ key: "k", code: "KeyK", ctrlKey: true }), false, true],
  ["Strg+K im Eingabefeld", taste({ key: "k", code: "KeyK", ctrlKey: true }), true, true],
  ["Cmd+K", taste({ key: "k", code: "KeyK", metaKey: true }), false, true],
  ["Strg+Umschalt+K", taste({ key: "K", code: "KeyK", ctrlKey: true, shiftKey: true }), false, false],
  ["Strg+Alt+K", taste({ key: "k", code: "KeyK", ctrlKey: true, altKey: true }), false, false],
  ["Strg+K auf russischer Belegung", taste({ key: "л", code: "KeyK", ctrlKey: true }), false, true],
  ["Strg+T auf der K-Taste (Dvorak)", taste({ key: "t", code: "KeyK", ctrlKey: true }), false, false],
  ["K ohne Strg", taste({ key: "k", code: "KeyK" }), false, false],
  ["gehaltene Taste", taste({ key: "k", code: "KeyK", ctrlKey: true, repeat: true }), false, false],
];
const kuerzelFehler = kuerzel
  .filter(([, t, imFeld, erwartet]) => istSuchKuerzel(t, imFeld) !== erwartet)
  .map(([name]) => name);
pruefe("Tastenkuerzel", kuerzelFehler.length === 0, kuerzelFehler.join(", ") || `${kuerzel.length} Faelle`);

console.log(
  `\nPruefungen: ${bestanden + fehlgeschlagen}   bestanden: ${bestanden}   fehlgeschlagen: ${fehlgeschlagen}`,
);
if (fehlgeschlagen > 0) process.exit(1);
console.log("Alle Pruefungen bestanden.");
