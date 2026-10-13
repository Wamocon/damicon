// Prueft beim Buch-Upload, ob der Verlauf der gedruckten Seitenzahlen LUECKENLOS ist.
//
// Warum: Ein gescanntes Buch kann Seiten verlieren (der Scanner ueberspringt eine Aufnahme, eine Seite klebt, eine Datei wird beschnitten).
// Die OCR liest dann jede vorhandene Seite sauber, der Text sieht gut aus (textguete.ts meldet "gut"), aber ein Gesetzesartikel oder ein
// Kapitel fehlt einfach. Das faellt nur auf, wenn man die gedruckte Seitenzahl am Fuss der Seite mit der Position in der Datei vergleicht:
// Folgt auf die gedruckte Seite 47 gleich die 50, fehlen die Seiten 48 und 49.
//
// Das Verfahren (reine Funktionen, laufen im Browser und im Test unter Node):
//   1. Je PDF-Seite werden die Zahlen aus Kopf- und Fusszeile gesammelt (Kandidaten fuer die gedruckte Seitenzahl). Eine Seite ohne
//      Zahl (Titel, Leerseite, Tabelle, Bild) schadet nicht.
//   2. Die Seiten werden der Reihe nach durchlaufen. Der "Versatz" ist PDF-Seite minus gedruckte Seite. Solange er gleich bleibt, ist
//      alles in Ordnung. Springt er, und der neue Versatz wird von den folgenden Seiten bestaetigt, ist das ein Ereignis:
//        Versatz sinkt  -> Seiten fehlen (die Zahl der fehlenden Seiten ist genau die Differenz),
//        Versatz steigt -> Seiten sind doppelt oder es sind ungezaehlte Seiten eingeschoben (nur ein Hinweis),
//        Sprung ueber 40 Seiten -> neue Zaehlung (Anhang, zweiter Band): nur ein Hinweis.
//   3. Ein einzelner falsch gelesener Wert ohne Bestaetigung durch Nachbarseiten wird als Rauschen ignoriert.
//
// Grenzen: Die Pruefung findet FEHLENDE SEITEN, nicht fehlende Zeilen. Ein Buch ohne lesbare Seitenzahlen (Kalender, Tabellen)
// lässt sich nur eingeschraenkt pruefen; das meldet "eingeschraenkt". Bei einem Gesetz ergaenzt pruefeArtikelfolge die Kontrolle.

/** Zeilen am Rand einer PDF-Seite (oben und unten) und die Zahl der Zeichen der Seite. */
export interface SeitenRand {
  kopf: readonly string[];
  fuss: readonly string[];
  zeichen: number;
}

export interface SeitenLuecke {
  /** PDF-Seite (1-basiert), nach der die Seiten fehlen: die letzte Seite vor der Luecke. */
  nachPdfSeite: number;
  /** Gedruckte Seiten, die fehlen: von bis bis (einschliesslich). Bei genau=false ist es der Bereich, in dem sie fehlen. */
  vonGedruckt: number;
  bisGedruckt: number;
  /** Wie viele Seiten fehlen insgesamt (immer sicher, auch wenn die Lage nicht ganz eindeutig ist). */
  anzahl: number;
  /** true: Die fehlenden Seiten sind einzeln bekannt (von bis bis sind alle weg). false: In von bis bis fehlen `anzahl` Seiten, die uebrigen sind da. */
  genau: boolean;
  /**
   * Nur bei genau=false: die erste PDF-Seite NACH der Luecke mit sicher gelesener Seitenzahl. Zwischen nachPdfSeite und bisPdfSeite liegen PDF-Seiten, auf denen die
   * Texterkennung keine Seitenzahl gelesen hat; die Luecke kann vor, zwischen oder hinter ihnen liegen. Die Angabe "nach PDF-Seite" allein waere dann falsch genau.
   */
  bisPdfSeite?: number;
}

export interface SeitenPruefung {
  /** Zahl der PDF-Seiten. */
  seiten: number;
  /** Auf wie vielen Seiten die gedruckte Seitenzahl dem laufenden Verlauf entsprach. */
  erkannt: number;
  /** Anteil der Seiten zwischen der ersten und der letzten erkannten Seitenzahl, auf denen die Zahl lesbar war (0 bis 1). */
  abdeckung: number;
  luecken: SeitenLuecke[];
  /** Summe der fehlenden Seiten. */
  fehlend: number;
  /** Ereignisse, bei denen der Versatz steigt (doppelte oder ungezaehlte Seiten): Hinweis, kein Fehler. */
  eingeschoben: number;
  /** Neue Zaehlung (Sprung ueber GROSSER_SPRUNG Seiten): Hinweis. */
  neuzaehlungen: number;
  /** PDF-Seiten mitten im Buch ohne Text (OCR-Ausfall oder Leerseite). */
  ohneText: number[];
  /** Zu wenige lesbare Seitenzahlen: Eine Luecke koennte unentdeckt sein. */
  eingeschraenkt: boolean;
  /** false: zu kurz, es gibt nichts zu pruefen (Markdown und Textdateien haben keine Seiten). Ohne lesbare Seitenzahl ist es true mit eingeschraenkt. */
  geprueft: boolean;
}

const MIN_SEITEN = 12;
/** Eine Seitenzahl gilt, wenn sie von mindestens so vielen der naechsten FENSTER Seiten bestaetigt wird. */
const STUETZE = 3;
const FENSTER = 10;
const GROSSER_SPRUNG = 40;
const MIN_ABDECKUNG = 0.4;
const MIN_ZEICHEN_SEITE = 40;

/** Zahlen aus Rand-Zeilen: allein auf der Zeile, am Zeilenanfang oder am Zeilenende (nicht mitten im Satz, nicht Teil von 12.03 oder 1/2). */
export function seitenZahlKandidaten(zeilen: readonly string[]): Set<number> {
  const aus = new Set<number>();
  for (const roh of zeilen) {
    const z = roh.replace(/^[\s\-–—•*|[\](){}.#]+|[\s\-–—•*|[\](){}.#]+$/gu, "");
    if (!z || z.length > 120) continue;
    if (/^\d{1,4}$/.test(z)) {
      aus.add(Number(z));
      continue;
    }
    const vorn = /^(\d{1,4})(?=\s)/.exec(z);
    if (vorn) aus.add(Number(vorn[1]));
    const hinten = /(?<=\s)(\d{1,4})$/.exec(z);
    if (hinten) aus.add(Number(hinten[1]));
  }
  for (const n of [...aus]) if (n < 1) aus.delete(n);
  return aus;
}

interface Ereignis {
  /** Letzte Seite, die zum alten Versatz passte. */
  letzte: number;
  /** Erste Seite mit dem neuen Versatz. */
  erste: number;
  alt: number;
  neu: number;
}

/** Fasst eine Liste ganzer Zahlen zu Bereichen zusammen: [48,49,168] -> [[48,49],[168,168]]. */
function alsBereiche(zahlen: readonly number[]): [number, number][] {
  const aus: [number, number][] = [];
  for (const n of [...zahlen].sort((a, b) => a - b)) {
    const l = aus[aus.length - 1];
    if (l && l[1] === n - 1) l[1] = n;
    else aus.push([n, n]);
  }
  return aus;
}

export function pruefeSeitenverlauf(seiten: readonly SeitenRand[]): SeitenPruefung {
  const n = seiten.length;
  const leer: SeitenPruefung = { seiten: n, erkannt: 0, abdeckung: 0, luecken: [], fehlend: 0, eingeschoben: 0, neuzaehlungen: 0, ohneText: [], eingeschraenkt: false, geprueft: false };
  if (n < MIN_SEITEN) return leer;
  const kand = seiten.map((s) => seitenZahlKandidaten([...s.fuss, ...s.kopf]));

  const stuetze = (versatz: number, ab: number): number => {
    let k = 0;
    for (let j = ab; j <= Math.min(n, ab + FENSTER - 1); j++) if (kand[j - 1]!.has(j - versatz)) k++;
    return k;
  };

  let versatz: number | null = null;
  let letzte = 0;
  let erste = 0;
  let erkannt = 0;
  let letzteErkannte = 0;
  const ereignisse: Ereignis[] = [];
  for (let i = 1; i <= n; i++) {
    const k = kand[i - 1]!;
    if (versatz !== null && k.has(i - versatz)) {
      letzte = i;
      letzteErkannte = i;
      erkannt++;
      continue;
    }
    if (k.size === 0) continue;
    let beste: { v: number; s: number } | null = null;
    for (const c of k) {
      const v = i - c;
      if (v === versatz) continue;
      const s = stuetze(v, i);
      if (s >= STUETZE && (!beste || s > beste.s)) beste = { v, s };
    }
    if (!beste) continue;
    if (versatz === null) {
      erste = i;
    } else {
      ereignisse.push({ letzte, erste: i, alt: versatz, neu: beste.v });
    }
    versatz = beste.v;
    letzte = i;
    letzteErkannte = i;
    erkannt++;
  }

  // Keine einzige verlaessliche Seitenzahl (Tabellenbuch, Kalender): Es gibt nichts zu vergleichen.
  if (versatz === null) return { ...leer, geprueft: true, eingeschraenkt: true };

  const luecken: SeitenLuecke[] = [];
  let eingeschoben = 0;
  let neuzaehlungen = 0;
  for (const e of ereignisse) {
    const delta = e.neu - e.alt;
    if (Math.abs(delta) > GROSSER_SPRUNG) {
      neuzaehlungen++;
      continue;
    }
    if (delta > 0) {
      eingeschoben++;
      continue;
    }
    const gedrL = e.letzte - e.alt;
    const gedrE = e.erste - e.neu;
    const dazwischen = e.erste - e.letzte - 1;
    const anzahl = -delta;
    // Seiten zwischen den beiden sicheren Stellen: Tragen sie lesbare Zahlen im fraglichen Bereich, sind die fehlenden Zahlen einzeln bekannt.
    let genau = dazwischen === 0;
    let fehlende: number[] = [];
    const bereich: number[] = [];
    for (let g = gedrL + 1; g <= gedrE - 1; g++) bereich.push(g);
    // gedruckte Seite -> PDF-Seite fuer die Seiten dazwischen, deren Zahl lesbar ist
    const lage = new Map<number, number>();
    if (genau) {
      fehlende = bereich;
    } else {
      let aufgeloest = true;
      let vorige = gedrL;
      for (let p = e.letzte + 1; p < e.erste; p++) {
        const c = [...kand[p - 1]!].filter((x) => x > vorige && x < gedrE).sort((a, b) => a - b)[0];
        if (c === undefined) {
          aufgeloest = false;
          break;
        }
        lage.set(c, p);
        vorige = c;
      }
      if (aufgeloest) {
        fehlende = bereich.filter((g) => !lage.has(g));
        genau = fehlende.length === anzahl;
      }
    }
    if (genau && fehlende.length > 0) {
      for (const [von, bis] of alsBereiche(fehlende)) {
        // Die PDF-Seite vor der Luecke: die letzte lesbare Seite mit kleinerer gedruckter Zahl, sonst die letzte sichere.
        let davor = e.letzte;
        for (const [gedr, pdf] of lage) if (gedr < von && pdf > davor) davor = pdf;
        luecken.push({ nachPdfSeite: davor, vonGedruckt: von, bisGedruckt: bis, anzahl: bis - von + 1, genau: true });
      }
    } else {
      // Nicht eindeutig: von bis bis ist der Bereich zwischen den beiden sicher gelesenen Seiten, in dem `anzahl` Seiten fehlen.
      luecken.push({ nachPdfSeite: e.letzte, vonGedruckt: gedrL + 1, bisGedruckt: gedrE - 1, anzahl, genau: false, bisPdfSeite: e.erste });
    }
  }

  // Abdeckung: nur zwischen der ersten und der letzten erkannten Seite zaehlt (Titel, Verzeichnis, Impressum duerfen ohne Zahl sein).
  const spanne = Math.max(1, letzteErkannte - erste + 1);
  const abdeckung = Math.min(1, erkannt / spanne);
  const ohneText: number[] = [];
  for (let i = Math.max(3, erste); i < Math.min(n, letzteErkannte); i++) if (seiten[i - 1]!.zeichen < MIN_ZEICHEN_SEITE) ohneText.push(i);

  return {
    seiten: n,
    erkannt,
    abdeckung,
    luecken,
    fehlend: luecken.reduce((s, l) => s + l.anzahl, 0),
    eingeschoben,
    neuzaehlungen,
    ohneText,
    eingeschraenkt: abdeckung < MIN_ABDECKUNG,
    geprueft: true,
  };
}

/** Wie viele Luecken die Kurzform einzeln auffuehrt; darueber steht nur "+N". Ein Buch mit so vielen Luecken gehoert neu gescannt (seiten-bestaetigung.ts). */
export const MAX_LUECKEN_STELLEN = 40;

/** Kurze Beschreibung der Luecken fuer Anzeige, Protokoll und Speicher: "48-49 (nach PDF-Seite 47), 4 Seiten zwischen 438 und 445 (nach PDF-Seite 428)". */
export function beschreibeLuecken(luecken: readonly SeitenLuecke[], maxStellen = MAX_LUECKEN_STELLEN): string {
  const teile = luecken.slice(0, maxStellen).map((l) =>
    l.genau
      ? `${l.vonGedruckt === l.bisGedruckt ? l.vonGedruckt : `${l.vonGedruckt}-${l.bisGedruckt}`} (${l.nachPdfSeite})`
      : `${l.anzahl}@${l.vonGedruckt}-${l.bisGedruckt} (PDF ${l.nachPdfSeite}-${l.bisPdfSeite ?? l.nachPdfSeite})`,
  );
  return teile.join(", ") + (luecken.length > maxStellen ? ` +${luecken.length - maxStellen}` : "");
}

// ---- Angabe fuer den Server ----------------------------------------------------------------------------------------------------------

/** Das Ergebnis in der Kurzform, die der Browser dem Server zum Ablegen schickt (buch-upload.ts prueft sie und legt sie je Zeile ab). */
export interface SeitenAngabe {
  /** PDF-Seiten insgesamt. */
  seiten: number;
  /** Fehlende gedruckte Seiten (Summe). */
  fehlend: number;
  /** Wo: beschreibeLuecken(), zum Beispiel "48-49 (47), 2@276-278 (PDF 271-273)". */
  stellen: string;
  /** Anteil der Seiten mit lesbarer Seitenzahl in Prozent (0 bis 100). */
  abdeckung: number;
  /** Wo die Luecken im Text des Buchs liegen: je Luecke (Reihenfolge wie in stellen) "paket:promille", durch Komma getrennt. Damit ein Nachtrag
   *  (nachtrag.ts) die nachgeladenen Seiten an der richtigen Stelle einreiht. Fehlt, wenn der Browser die Lage nicht bestimmen konnte. */
  orte?: string;
  /** Bei Gesetzen: fehlende Artikelnummern (nur ein Hinweis, aufgehobene Artikel koennen dabei sein). */
  artikelFehlend?: number;
  artikelStellen?: string;
}

/** Laenge der Stellenangabe, die der Server annimmt (bis zu 40 Luecken). */
export const MAX_STELLEN = 1000;
/** Laenge der Angabe der Orte der Luecken. */
export const MAX_ORTE = 600;

export function alsSeitenAngabe(p: SeitenPruefung, a: ArtikelPruefung | null, orte?: readonly { paket: number; promille: number }[]): SeitenAngabe {
  const ortText = orte && orte.length === Math.min(p.luecken.length, MAX_LUECKEN_STELLEN) ? orte.map((o) => `${o.paket}:${o.promille}`).join(",").slice(0, MAX_ORTE) : "";
  return {
    seiten: p.seiten,
    fehlend: p.fehlend,
    stellen: beschreibeLuecken(p.luecken).slice(0, MAX_STELLEN),
    abdeckung: Math.round(p.abdeckung * 100),
    ...(ortText ? { orte: ortText } : {}),
    ...(a ? { artikelFehlend: a.fehlend, artikelStellen: beschreibeArtikelLuecken(a.luecken).slice(0, MAX_STELLEN) } : {}),
  };
}

// ---- Rand einer PDF-Seite aus den Textstuecken (PDF.js) -------------------------------------------------------------------------

export interface TextStueck {
  str: string;
  /** Position in der Seite, y von oben nach unten (Viewport-Koordinaten). */
  x: number;
  y: number;
}

const RAND_OBEN = 0.1;
const RAND_UNTEN = 0.86;

/**
 * Sammelt Kopf- und Fusszeilen einer Seite aus den Textstuecken. Die Position entscheidet (oberste 10 und unterste 14 Prozent der Seitenhoehe),
 * nicht die Reihenfolge im Textstrom: Ein OCR-Lauf legt die Fusszeile oft nicht ans Ende. Stuecke auf gleicher Hoehe bilden eine Zeile.
 */
export function randAusStuecken(stuecke: readonly TextStueck[], hoehe: number, zeichen: number): SeitenRand {
  if (hoehe <= 0) return { kopf: [], fuss: [], zeichen };
  const toleranz = hoehe * 0.012;
  const zeilen: { y: number; teile: TextStueck[] }[] = [];
  for (const s of [...stuecke].filter((x) => x.str.trim()).sort((a, b) => a.y - b.y)) {
    const z = zeilen[zeilen.length - 1];
    if (z && Math.abs(z.y - s.y) <= toleranz) z.teile.push(s);
    else zeilen.push({ y: s.y, teile: [s] });
  }
  const text = (z: { teile: TextStueck[] }) => z.teile.sort((a, b) => a.x - b.x).map((t) => t.str.trim()).join(" ").replace(/\s+/g, " ").trim();
  // Zusaetzlich die ersten zwei und die letzten drei Zeilen des Textblocks: Bei einem Foto der Seite (Hand am Rand, schiefes Blatt) liegt die
  // Seitenzahl nicht im Seitenrand der Datei, sondern am Ende des Textes.
  const oben = new Set(zeilen.filter((z) => z.y <= hoehe * RAND_OBEN).concat(zeilen.slice(0, 2)));
  const unten = new Set(zeilen.filter((z) => z.y >= hoehe * RAND_UNTEN).concat(zeilen.slice(-3)));
  return {
    kopf: zeilen.filter((z) => oben.has(z)).map(text),
    fuss: zeilen.filter((z) => unten.has(z)).map(text),
    zeichen,
  };
}

// ---- Artikelfolge bei Gesetzen ----------------------------------------------------------------------------------------------------

export interface ArtikelPruefung {
  /** Zahl der gefundenen Artikelueberschriften. */
  artikel: number;
  kleinste: number;
  groesste: number;
  /** Fehlende Artikelnummern als Bereiche. Aufgehobene Artikel koennen hier erscheinen, wenn die Ausgabe sie nicht aufzaehlt. */
  luecken: [number, number][];
  /** Anzahl fehlender Nummern insgesamt. */
  fehlend: number;
}

const MIN_ARTIKEL = 30;

/**
 * Artikelfolge eines Gesetzes ("Статья 85." oder "Artikel 85" / "§ 85"): Welche Nummern zwischen der kleinsten und der groessten fehlen?
 * Absaetze mit Punktlinien (Inhaltsverzeichnis) zaehlen nicht, sonst verdeckt das Verzeichnis jede Luecke. Bereiche wie "Статьи 286-290"
 * (aufgehoben) zaehlen als vorhanden. Ohne mindestens 30 Ueberschriften ist es kein Gesetz im Sinn dieser Pruefung: null.
 */
export function pruefeArtikelfolge(text: string): ArtikelPruefung | null {
  const absaetze = text.split(/\n{2,}/).filter((a) => !/\.{4,}|…{2,}/.test(a));
  const da = new Set<number>();
  let treffer = 0;
  // Russisch: "Статья 85." mit grossem S und Punkt (ein Verweis im Satz heisst "статьи 85" klein und ohne Punkt), auch mitten im Absatz,
  // weil die Bereinigung kurze Zeilen nicht immer trennt. Eine Nebennummer ("Статья 272-4.") zaehlt nicht fuer 272.
  // Deutsch und Englisch: nur am Zeilenanfang, denn "nach Artikel 5" im Satz ist ein Verweis.
  const russisch = /(?:^|[\s*])Статья\s+(\d{1,4})(?!\d|-\d)\./gu;
  const sonst = /^[ \t]*\**[ \t]*(?:Artikel|Article|§)[ \t]*(\d{1,4})(?!\d|-\d)\.?\**(?=[ \t]|$)/gmu;
  const bereich = /(?:Статьи|Artikel|Articles|§§)\s*(\d{1,4})\.?\s*[-–—]\s*(\d{1,4})/gu;
  for (const a of absaetze) {
    for (const m of a.matchAll(russisch)) {
      da.add(Number(m[1]));
      treffer++;
    }
    for (const m of a.matchAll(sonst)) {
      da.add(Number(m[1]));
      treffer++;
    }
    for (const m of a.matchAll(bereich)) {
      const von = Number(m[1]);
      const bis = Number(m[2]);
      if (bis > von && bis - von < 60) for (let i = von; i <= bis; i++) da.add(i);
    }
  }
  if (treffer < MIN_ARTIKEL) return null;
  const alle = [...da].sort((a, b) => a - b);
  // Vereinzelte Verweise ("Статья 6." in einer Fussnote eines Buchs, das bei Artikel 407 beginnt) duerfen den Rahmen nicht aufziehen:
  // Als Anfang und Ende gelten nur Nummern, in deren Naehe (15 Nummern) mindestens sechs weitere Artikel stehen.
  const dicht = (z: number, von: number, bis: number) => alle.filter((x) => x >= von && x <= bis && x !== z).length >= 6;
  const zahlen = alle.filter((z) => dicht(z, z - 15, z + 15));
  if (zahlen.length === 0) return null;
  const kleinste = zahlen[0]!;
  const groesste = zahlen[zahlen.length - 1]!;
  const fehlt: number[] = [];
  for (let i = kleinste; i <= groesste; i++) if (!da.has(i)) fehlt.push(i);
  return { artikel: zahlen.length, kleinste, groesste, luecken: alsBereiche(fehlt), fehlend: fehlt.length };
}

/** Kurze Beschreibung der Artikelluecken: "85-89, 100, 221-222". */
export function beschreibeArtikelLuecken(luecken: readonly [number, number][], max = 12): string {
  return luecken.slice(0, max).map(([a, b]) => (a === b ? String(a) : `${a}-${b}`)).join(", ") + (luecken.length > max ? ` +${luecken.length - max}` : "");
}
