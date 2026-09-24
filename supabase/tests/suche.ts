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

import { existsSync, readFileSync } from "node:fs";
import {
  auszug,
  bewerte,
  GEWICHT,
  indexFeld,
  istSuchKuerzel,
  laengstesWort,
  normalisiere,
  STUFE,
  STUFEN_ABSTAND,
  zerlegeAnfrage,
  type Anfrage,
  type Taste,
} from "@/lib/suche/kern";
import {
  baueSeitenZiele,
  HOECHSTENS_ERWAEHNUNGEN,
  sucheInTexten,
  sucheSeiten,
  zielSchluesselFuerPfad,
  type SeitenZiel,
  type Uebersetze,
  type ZielSchluessel,
} from "@/lib/suche/seiten-ziele";
import { baueSuchErgebnis, KI_AB, type SuchErgebnis } from "@/lib/suche/gruppen";
import {
  HOECHSTENS_GEMERKT,
  HOECHSTENS_ZULETZT,
  liesZuletzt,
  merkeZuletzt,
  zuletztAufloesen,
  ZULETZT_SPEICHER,
  type Ablage,
} from "@/lib/suche/zuletzt";
import { deepMerge, type MessageTree } from "@/i18n/deep-merge";
import { modules, sichtbareModule, zones } from "@/lib/modules";
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

// Eine Anfrage, die es geben muss - leere Eingaben prueft Abschnitt 1 eigens.
function anfrage(roh: string): Anfrage {
  const zerlegt = zerlegeAnfrage(roh);
  if (!zerlegt) throw new Error(`Keine Anfrage: "${roh}"`);
  return zerlegt;
}

// --- Texte wie zur Laufzeit: jede Sprache ueber Deutsch gelegt ------------
// Mit derselben Regel wie src/i18n/request.ts (deep-merge.ts): fehlende oder
// leere Texte fallen auf die deutsche Fassung zurueck.

const sprachen = ["de", "en", "ru", "kk"] as const;

function lade(sprache: string): MessageTree {
  return JSON.parse(readFileSync(`src/messages/${sprache}.json`, "utf8")) as MessageTree;
}

const deutsch = lade("de");
function uebersetzer(sprache: string): Uebersetze {
  const baum = sprache === "de" ? deutsch : deepMerge(deutsch, lade(sprache));
  return (pfad) => {
    const wert = pfad
      .split(".")
      .reduce<unknown>((b, k) => (b && typeof b === "object" ? (b as MessageTree)[k] : undefined), baum);
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
pruefe(
  "ein Betonungszeichen zerteilt das Wort nicht",
  normalisiere("Ку́хня") === "кухня",
  normalisiere("Ку́хня"),
);
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

const wert = (felder: string[], roh: string) =>
  bewerte(
    felder.map((f) => indexFeld(f, GEWICHT.name)),
    anfrage(roh),
  );
const stufen = [
  wert(["Lohn"], "lohn"), // Feld gleich Anfrage
  wert(["Lohnabrechnung"], "lohn"), // Feld beginnt mit Anfrage
  wert(["Qualität und Lohn"], "lohn"), // Wortanfang
  bewerte(
    [indexFeld("Feld", GEWICHT.beiwerk), indexFeld("Reihenblöcke", GEWICHT.name)],
    anfrage("feld reihen"),
  ), // ueber zwei Felder
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
  wert(["Kühlkette"], "Kuhlkette") === STUFE.gleich * STUFEN_ABSTAND + GEWICHT.name &&
    wert(["Kühlkette"], "Kuehlkette") === STUFE.gleich * STUFEN_ABSTAND + GEWICHT.name,
);
{
  const verteilt = bewerte(
    [indexFeld("Feld", GEWICHT.beiwerk), indexFeld("Reihenblöcke", GEWICHT.name)],
    anfrage("Feld Blöcke"),
  );
  pruefe(
    "ein Wortanfang in einem Feld und ein Teilwort im anderen ergeben zusammen einen Treffer",
    verteilt === STUFE.teilwort * STUFEN_ABSTAND,
    String(verteilt),
  );
  const bereichsname = bewerte([indexFeld("Hof", GEWICHT.beiwerk)], anfrage("Hof"));
  const eigenerName = bewerte([indexFeld("Hofladen", GEWICHT.name)], anfrage("Hof"));
  pruefe(
    "der Bereichsname eines Moduls zaehlt hoechstens als Wortanfang, der eigene Name davor",
    bereichsname === STUFE.woerter * STUFEN_ABSTAND + GEWICHT.beiwerk &&
      eigenerName !== null &&
      eigenerName > bereichsname,
    `${bereichsname} < ${eigenerName}`,
  );
}

// --- 3. Abdeckung: jede Rolle, jede Sprache, beide Betriebsarten ------------

const modulFehler: string[] = [];
const unsichtbarVorhanden: string[] = [];
const bereichFehler: string[] = [];
const seitenFehler: string[] = [];
const rundlaufFehler: string[] = [];
let laeufe = 0;

const erster = (ziele: SeitenZiel[], roh: string) => sucheSeiten(ziele, anfrage(roh))[0]?.schluessel;

for (const sprache of sprachen) {
  const t = uebersetzer(sprache);
  for (const rolle of roles) {
    for (const demoModus of [false, true]) {
      laeufe++;
      const ziele = baueSeitenZiele(rolle, { demoModus, locale: sprache }, t);
      const vorhanden = new Set<string>(ziele.map((z) => z.schluessel));
      const lauf = `${sprache}/${rolle}/${demoModus ? "demo" : "db"}`;

      for (const zone of zones) {
        const sichtbar = sichtbareModule(rolle, zone.key);
        const sichtbareSchluessel = new Set(sichtbar.map((m) => m.key));

        for (const modul of sichtbar) {
          const titel = t(`modules.${modul.key}.title`);
          const kurz = t(`modules.${modul.key}.navTitle`);
          for (const roh of [titel, kurz, titel.toUpperCase()]) {
            const gefunden = erster(ziele, roh);
            if (gefunden !== `modul:${modul.key}`) {
              modulFehler.push(`${lauf} "${roh}" -> ${gefunden ?? "nichts"}`);
            }
          }
        }

        // Die Suche kann nur liefern, was in der Zielliste steht - also darf
        // ein unsichtbares Modul dort gar nicht erst stehen.
        for (const modul of modules.filter((m) => m.zone === zone.key)) {
          if (!sichtbareSchluessel.has(modul.key) && vorhanden.has(`modul:${modul.key}`)) {
            unsichtbarVorhanden.push(`${lauf} ${modul.key}`);
          }
        }

        const hatBereich = vorhanden.has(`bereich:${zone.key}`);
        if (hatBereich !== sichtbar.length > 0) {
          bereichFehler.push(`${lauf} ${zone.key}: Ziel ${hatBereich}, Module ${sichtbar.length}`);
        } else if (hatBereich && erster(ziele, t(`zones.${zone.key}.name`)) !== `bereich:${zone.key}`) {
          bereichFehler.push(`${lauf} ${zone.key}: nicht auf Rang 1`);
        }
      }

      if (vorhanden.has("seite:sicherheit") === demoModus) seitenFehler.push(`${lauf} Sicherheit`);
      if (vorhanden.has("seite:compliance") !== (!demoModus && darfCeoBerichtLesen(rolle))) {
        seitenFehler.push(`${lauf} Compliance`);
      }
      const handbuch = ziele.find((z) => z.schluessel === "seite:handbuch");
      if (!handbuch?.extern || handbuch.href !== `/${sprache}/dashboard/handbuch`) {
        seitenFehler.push(`${lauf} Handbuch`);
      }
      if (!vorhanden.has("uebersicht")) seitenFehler.push(`${lauf} Uebersicht`);

      // Rundlauf: jede interne Adresse fuehrt ueber dieselbe Zuordnung, mit
      // der die Suche die offene Seite erkennt, auf ihr eigenes Ziel zurueck.
      // Die festen Seiten muessen zudem als Route im App-Verzeichnis liegen.
      for (const ziel of ziele) {
        if (ziel.extern) continue;
        if (zielSchluesselFuerPfad(ziel.href) !== ziel.schluessel) {
          rundlaufFehler.push(`${lauf} ${ziel.href} -> ${zielSchluesselFuerPfad(ziel.href) ?? "nichts"}`);
        }
        if (ziel.schluessel.startsWith("seite:")) {
          const datei = `src/app/[locale]${ziel.href}/page.tsx`;
          if (!existsSync(datei)) rundlaufFehler.push(`${lauf} ${datei} fehlt`);
        }
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
pruefe("kein unsichtbares Modul steht in der Zielliste", unsichtbarVorhanden.length === 0, zeige(unsichtbarVorhanden));
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
pruefe(
  "jede interne Adresse fuehrt auf ihr Ziel zurueck, feste Seiten gibt es als Route",
  rundlaufFehler.length === 0,
  zeige(rundlaufFehler),
);

const pickerZiele = baueSeitenZiele("picker", { demoModus: true, locale: "de" }, uebersetzer("de"));
const pickerModule = pickerZiele.filter((z) => z.schluessel.startsWith("modul:")).length;
pruefe("Pfluecker sieht genau zwei Module", pickerModule === 2, String(pickerModule));
{
  const adminZiele = baueSeitenZiele("admin", { demoModus: false, locale: "de" }, uebersetzer("de"));
  const feld = uebersetzer("de")("zones.feld.name");
  const treffer = sucheSeiten(adminZiele, anfrage("Feld"));
  pruefe(
    "Suche nach einem Bereichsnamen zeigt den Bereich und dahinter seine Module",
    treffer[0]?.schluessel === "bereich:feld" &&
      treffer.length > 1 &&
      treffer.slice(1).every((z) => z.schluessel.startsWith("modul:") && z.untertitel === feld),
    treffer.map((z) => z.schluessel).join(","),
  );
  const verteilt = sucheSeiten(adminZiele, anfrage("Feld Blöcke")).map((z) => z.schluessel);
  pruefe(
    "ein zweites passendes Wort laesst den Treffer nicht verschwinden (Feld Blöcke)",
    verteilt.includes("modul:reihenbloecke"),
    verteilt.join(","),
  );
}
pruefe(
  "die Tagline eines Bereichs fuehrt nicht auf Module, die die Rolle nicht sieht",
  sucheSeiten(pickerZiele, anfrage("Finanzen")).length === 0,
  sucheSeiten(pickerZiele, anfrage("Finanzen")).map((z) => z.schluessel).join(","),
);

// --- 3b. Erwaehnt in: Texte der Modulseiten ---------------------------------

{
  const ziele = baueSeitenZiele("admin", { demoModus: false, locale: "de" }, uebersetzer("de"));
  const erwaehnt = (roh: string) => {
    const namen = new Set<ZielSchluessel>(sucheSeiten(ziele, anfrage(roh)).map((z) => z.schluessel));
    return sucheInTexten(ziele, anfrage(roh), namen).map((e) => e.ziel.schluessel);
  };

  const wartezeitNamen = sucheSeiten(ziele, anfrage("Wartezeit")).map((z) => z.schluessel);
  const wartezeitText = erwaehnt("Wartezeit");
  pruefe(
    "Wartezeit: Pflanzenschutz ueber den Namen, Reihenbloecke ueber den Seitentext",
    wartezeitNamen.includes("modul:pflanzenschutz") && wartezeitText.includes("modul:reihenbloecke"),
    `Namen ${wartezeitNamen.join(",")} | Text ${wartezeitText.join(",")}`,
  );
  pruefe(
    "was schon ueber den Namen gefunden wurde, steht nicht noch einmal unter Erwaehnt in",
    !wartezeitText.includes("modul:pflanzenschutz"),
  );
  pruefe(
    "Erntesperre findet Pflanzenschutz nur ueber den Seitentext",
    sucheSeiten(ziele, anfrage("Erntesperre")).length === 0 &&
      erwaehnt("Erntesperre").includes("modul:pflanzenschutz"),
  );
  pruefe(
    "der Text todo (nur KI und Handbuch) wird nicht durchsucht",
    erwaehnt("Spritzmitteldatenbank").length === 0 &&
      sucheSeiten(ziele, anfrage("Spritzmitteldatenbank")).length === 0,
  );
  pruefe("unter drei Zeichen keine Suche im Text", erwaehnt("ch").length === 0);
  pruefe(
    "auch nicht mit Leerzeichen dazwischen (a b)",
    erwaehnt("a b").length === 0,
    erwaehnt("a b").join(","),
  );
  pruefe(
    "genau fuenf Erwaehnungen, wenn mehr Seiten passen",
    erwaehnt("Reihenblock").length === HOECHSTENS_ERWAEHNUNGEN,
    String(erwaehnt("Reihenblock").length),
  );

  const picker = baueSeitenZiele("picker", { demoModus: false, locale: "de" }, uebersetzer("de"));
  pruefe(
    "der Pfluecker findet Wartezeit nirgends - die Seiten mit dem Wort sieht er nicht",
    sucheInTexten(picker, anfrage("Wartezeit"), new Set()).length === 0,
  );

  // Fuer jede Rolle und Sprache: jede Erwaehnung zeigt auf ein Modul, das die
  // Rolle laut sichtbareModule() sieht, und ihr Auszug enthaelt das gesuchte
  // Wort. Beides unabhaengig von der Zielliste geprueft, aus der die
  // Erwaehnungen stammen.
  const falsch: string[] = [];
  for (const sprache of sprachen) {
    const t = uebersetzer(sprache);
    for (const rolle of roles) {
      const eigene = baueSeitenZiele(rolle, { demoModus: false, locale: sprache }, t);
      for (const modul of modules) {
        const wort = t(`modules.${modul.key}.description`).split(/\s+/).find((w) => w.length >= 6);
        const gesucht = wort ? zerlegeAnfrage(wort) : null;
        if (!gesucht) continue;
        for (const e of sucheInTexten(eigene, gesucht, new Set())) {
          const schluessel = e.ziel.schluessel.replace(/^modul:/, "");
          const ziel = modules.find((m) => m.key === schluessel);
          const sichtbar = !!ziel && sichtbareModule(rolle, ziel.zone).some((m) => m.key === schluessel);
          const belegt = normalisiere(e.auszug).includes(laengstesWort(gesucht));
          if (!sichtbar || !belegt) {
            falsch.push(`${sprache}/${rolle}/${wort} -> ${e.ziel.schluessel}${sichtbar ? "" : " unsichtbar"}${belegt ? "" : " ohne Beleg"}`);
          }
        }
      }
    }
  }
  pruefe(
    "Erwaehnungen nur fuer sichtbare Module und mit dem Wort im Auszug",
    falsch.length === 0,
    zeige(falsch),
  );
}

// --- 3c. Gruppen im Suchfenster --------------------------------------------

{
  const ziele = baueSeitenZiele("admin", { demoModus: false, locale: "de" }, uebersetzer("de"));
  const ergebnis = (begriff: string, zuletzt: string[] = [], kiVerfuegbar = true) =>
    baueSuchErgebnis({ ziele, begriff, zuletzt, offeneSeite: "uebersicht", kiVerfuegbar });
  const arten = (e: SuchErgebnis) => e.gruppen.map((g) => g.art).join(",");

  const leer = ergebnis("");
  pruefe(
    "ohne Eingabe und ohne Verlauf: keine Gruppe, der Hinweis, keine Ansage",
    leer.gruppen.length === 0 && leer.hinweis === "leer" && leer.anzahl === null,
  );
  const verlauf = ergebnis("", ["uebersicht", "modul:lohn"]);
  pruefe(
    "ohne Eingabe: Zuletzt geoeffnet ohne die offene Seite",
    arten(verlauf) === "zuletzt" &&
      verlauf.gruppen[0]!.optionen.length === 1 &&
      verlauf.hinweis === null,
    arten(verlauf),
  );
  const wartezeit = ergebnis("Wartezeit");
  pruefe(
    "Namenstreffer vor Erwaehnt in, die Ansage zaehlt beide",
    arten(wartezeit) === "treffer,erwaehnt" &&
      wartezeit.anzahl === wartezeit.gruppen.reduce((s, g) => s + g.optionen.length, 0) &&
      wartezeit.hinweis === null,
    `${arten(wartezeit)} / ${wartezeit.anzahl}`,
  );
  const nichts = ergebnis("Xylophon");
  pruefe(
    "ohne Treffer: nur die Frage an die KI, mit Hinweis und der Ansage 0",
    arten(nichts) === "ki" && nichts.hinweis === "keineTreffer" && nichts.anzahl === 0,
    arten(nichts),
  );
  // Ein Buchstabe, der in keinem deutschen Namen steht, damit nur die Laenge
  // ueber die KI-Zeile entscheidet.
  const einBuchstabe = ergebnis("ж".repeat(KI_AB - 1));
  pruefe(
    "ein einzelner Buchstabe ohne Treffer ist keine Frage an die KI",
    einBuchstabe.gruppen.length === 0 && einBuchstabe.hinweis === "keineTreffer",
    arten(einBuchstabe),
  );
  pruefe("ohne verfuegbare KI keine KI-Zeile", ergebnis("Xylophon", [], false).gruppen.length === 0);
}

{
  const text =
    "Jede Behandlung wird mit Mittel, Menge, Block, Datum und ausführender Person erfasst und sperrt den Reihenblock automatisch bis zum Ablauf der gesetzlichen Wartezeit.";
  const hinten = auszug(text, anfrage("Wartezeit"));
  pruefe(
    "Auszug setzt kurz vor dem Fund ein, markiert den Schnitt vorn und am Textende keinen",
    !!hinten && hinten.startsWith("… ") && hinten.includes("Wartezeit") && !hinten.endsWith("…"),
    hinten ?? "null",
  );
  const vorn = auszug(text, anfrage("Jede"));
  pruefe("Auszug am Textanfang ohne Schnitt vorn", !!vorn && vorn.startsWith("Jede ") && vorn.endsWith(" …"), vorn ?? "null");
  const ohneUmlaut = auszug(text, anfrage("ausfuhrender"));
  pruefe("Auszug findet die Stelle auch ohne Umlaut", !!ohneUmlaut && ohneUmlaut.includes("ausführender"), ohneUmlaut ?? "null");
  const zweiWoerter = auszug(text, anfrage("Wartezeit d"));
  pruefe(
    "bei mehreren Woertern setzt der Auszug am laengsten an, nicht an einem Buchstaben",
    !!zweiWoerter && zweiWoerter.includes("Wartezeit"),
    zweiWoerter ?? "null",
  );
  pruefe("kein Auszug ohne Fund", auszug(text, anfrage("Kühlkette")) === null);
}

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
  pruefe(
    "hoechstens so viele Eintraege wie gemerkt werden",
    liesZuletzt(a, "u1").length === HOECHSTENS_GEMERKT,
    String(liesZuletzt(a, "u1").length),
  );

  pruefe("andere Person sieht eine leere Liste", liesZuletzt(a, "u2").length === 0);
  pruefe("und die fremde Liste ist danach geloescht", !a.daten.has(ZULETZT_SPEICHER));

  merkeZuletzt(a, null, "uebersicht");
  pruefe(
    "ohne Anmeldung (Demo) eine eigene Liste, die niemand Angemeldetes sieht",
    liesZuletzt(a, null).join(",") === "uebersicht" && liesZuletzt(a, "u1").length === 0,
  );

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
  const doppelt = zuletztAufloesen(["uebersicht", "uebersicht", "seite:handbuch"], ziele, null)
    .map((z) => z.schluessel)
    .join(",");
  pruefe("Doppelte aus einem veraenderten Speicher erscheinen einmal", doppelt === "uebersicht,seite:handbuch", doppelt);
  const alle = zuletztAufloesen(
    ziele.map((z) => z.schluessel),
    ziele,
    null,
  );
  pruefe("hoechstens fuenf aufgeloeste Eintraege", alle.length === HOECHSTENS_ZULETZT, String(alle.length));
}

// --- 5. Pfad zu Ziel --------------------------------------------------------

const pfade: [string, string | null][] = [
  ["/dashboard", "uebersicht"],
  ["/dashboard/feld", "bereich:feld"],
  ["/dashboard/hof/qr-steigen", "modul:qr_steigen"],
  ["/dashboard/sicherheit", "seite:sicherheit"],
  ["/dashboard/compliance", "seite:compliance"],
  ["/dashboard/sicherheit/mehr", null],
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
const WIN = false;
const MAC = true;
// Name, Taste, im Eingabefeld, Mac, erwartet
const kuerzel: [string, Taste, boolean, boolean, boolean][] = [
  ["/ ausserhalb eines Feldes", taste({ key: "/", code: "Slash" }), false, WIN, true],
  ["/ mit Umschalt (deutsche Tastatur)", taste({ key: "/", code: "Digit7", shiftKey: true }), false, WIN, true],
  ["/ mit AltGr (Windows meldet Strg+Alt)", taste({ key: "/", ctrlKey: true, altKey: true }), false, WIN, true],
  ["/ im Eingabefeld", taste({ key: "/", code: "Slash" }), true, WIN, false],
  ["Strg+/", taste({ key: "/", ctrlKey: true }), false, WIN, false],
  ["Cmd+/", taste({ key: "/", metaKey: true }), false, MAC, false],
  ["Strg+K", taste({ key: "k", code: "KeyK", ctrlKey: true }), false, WIN, true],
  ["Strg+K im Eingabefeld", taste({ key: "k", code: "KeyK", ctrlKey: true }), true, WIN, true],
  ["Windows-Taste+K", taste({ key: "k", code: "KeyK", metaKey: true }), false, WIN, false],
  ["Cmd+K auf dem Mac", taste({ key: "k", code: "KeyK", metaKey: true }), false, MAC, true],
  ["Cmd+K auf dem Mac im Eingabefeld", taste({ key: "k", code: "KeyK", metaKey: true }), true, MAC, true],
  ["Strg+K auf dem Mac (loescht dort bis Zeilenende)", taste({ key: "k", code: "KeyK", ctrlKey: true }), true, MAC, false],
  ["Strg+Umschalt+K", taste({ key: "K", code: "KeyK", ctrlKey: true, shiftKey: true }), false, WIN, false],
  ["Strg+Alt+K", taste({ key: "k", code: "KeyK", ctrlKey: true, altKey: true }), false, WIN, false],
  ["Strg+K auf russischer Belegung", taste({ key: "л", code: "KeyK", ctrlKey: true }), false, WIN, true],
  ["Strg+T auf der K-Taste (Dvorak)", taste({ key: "t", code: "KeyK", ctrlKey: true }), false, WIN, false],
  ["K ohne Strg", taste({ key: "k", code: "KeyK" }), false, WIN, false],
  ["gehaltene Taste", taste({ key: "k", code: "KeyK", ctrlKey: true, repeat: true }), false, WIN, false],
  ["waehrend eine Eingabemethode Zeichen setzt", taste({ key: "k", code: "KeyK", ctrlKey: true, isComposing: true }), false, WIN, false],
];
const kuerzelFehler = kuerzel
  .filter(([, t, imFeld, mac, erwartet]) => istSuchKuerzel(t, imFeld, mac) !== erwartet)
  .map(([name]) => name);
pruefe("Tastenkuerzel", kuerzelFehler.length === 0, kuerzelFehler.join(", ") || `${kuerzel.length} Faelle`);

console.log(
  `\nPruefungen: ${bestanden + fehlgeschlagen}   bestanden: ${bestanden}   fehlgeschlagen: ${fehlgeschlagen}`,
);
if (fehlgeschlagen > 0) process.exit(1);
console.log("Alle Pruefungen bestanden.");
