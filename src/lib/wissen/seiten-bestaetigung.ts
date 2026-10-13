import type { SeitenLuecke } from "@/lib/wissen/seitenverlauf";

// Fehlende Seiten im Scan: Was ist offen, was ist als "korrekt fehlend" bestätigt, was wurde nachgeladen? Reine Funktionen ohne Datenbank, sie laufen
// im Browser (Prüffenster, Anzeige) und auf dem Server (Freigabe, Qualität) und kommen zum selben Ergebnis.
//
// Der Ablauf (siehe docs/wissensbasis-supabase.md, Punkt 17):
//   1. Beim Hochladen findet die Seitenverlauf-Prüfung (seitenverlauf.ts) Lücken in der Folge der gedruckten Seitenzahlen und legt sie als Kurzform ab
//      ("48-49 (47)", unscharf "2@105-107 (PDF 106-108)").
//   2. Die prüfende Person sieht am Original nach, welche dieser Seiten WIRKLICH fehlen dürfen (Leerseiten, Notizseiten) und gibt deren gedruckte
//      Seitenzahlen an. Deckt die Angabe nicht ALLE Lücken ab, gibt es keine Freigabe: Echter Inhalt fehlt.
//   3. Dann bleiben zwei Wege: die fehlenden Seiten als OCR-PDF nachladen (nachtrag.ts, sie werden an der richtigen Stelle eingereiht und verkleinern
//      die offenen Lücken) oder das Buch löschen und die ganze PDF neu hochladen.
// Bestätigte Seiten fließen NICHT in die Qualität ein (dort ist nichts zu lesen), offene schon (qualitaet.ts).

/** Eine Lücke, die noch offen ist; `ort` sagt, wo im Text des Buchs sie liegt (Paket und Stelle darin in Promille), damit ein Nachtrag dort eingereiht wird. */
export interface OffeneLuecke extends SeitenLuecke {
  ort?: { paket: number; promille: number };
}

export interface GeleseneLuecken {
  luecken: OffeneLuecke[];
  /** Lücken, die in der Kurzform nur als "+N" angedeutet sind (die Kurzform hält höchstens MAX_LUECKEN_STELLEN). Sie sind nicht einzeln bekannt. */
  weitere: number;
}

const EXAKT = /(?<![\d@-])(\d{1,5})(?:-(\d{1,5}))? \((\d{1,5})\)/gu;
const UNSCHARF = /(\d{1,5})@(\d{1,5})-(\d{1,5}) \((?:PDF )?(\d{1,5})(?:-(\d{1,5}))?\)/gu;

/** Liest die Kurzform der Lücken zurück ("48-49 (47), 2@276-278 (PDF 271-273) +3"). `orte` ist "paket:promille" je Lücke in derselben Reihenfolge. */
export function lueckenAusStellen(stellen: string | null | undefined, orte?: string | null): GeleseneLuecken {
  const text = String(stellen ?? "");
  const gefunden: { index: number; luecke: OffeneLuecke }[] = [];
  for (const m of text.matchAll(UNSCHARF)) {
    const anzahl = Number(m[1]);
    const von = Number(m[2]);
    const bis = Number(m[3]);
    const nach = Number(m[4]);
    gefunden.push({ index: m.index ?? 0, luecke: { nachPdfSeite: nach, vonGedruckt: von, bisGedruckt: bis, anzahl, genau: false, bisPdfSeite: m[5] ? Number(m[5]) : nach } });
  }
  // Die genauen Stellen dürfen nicht aus einer unscharfen Angabe herausgelesen werden: Treffer innerhalb eines unscharfen Bereichs fallen weg.
  const belegt = [...text.matchAll(UNSCHARF)].map((m) => [m.index ?? 0, (m.index ?? 0) + m[0].length] as const);
  for (const m of text.matchAll(EXAKT)) {
    const i = m.index ?? 0;
    if (belegt.some(([a, b]) => i >= a && i < b)) continue;
    const von = Number(m[1]);
    const bis = m[2] ? Number(m[2]) : von;
    if (bis < von) continue;
    gefunden.push({ index: i, luecke: { nachPdfSeite: Number(m[3]), vonGedruckt: von, bisGedruckt: bis, anzahl: bis - von + 1, genau: true } });
  }
  gefunden.sort((a, b) => a.index - b.index);
  const luecken = gefunden.map((g) => g.luecke);
  const ortListe = String(orte ?? "").split(",").map((o) => /^(\d{1,4}):(\d{1,4})$/.exec(o.trim()));
  if (ortListe.length === luecken.length) {
    luecken.forEach((l, i) => {
      const o = ortListe[i];
      if (o) l.ort = { paket: Number(o[1]), promille: Math.min(1000, Number(o[2])) };
    });
  }
  const mehr = /\+(\d{1,5})\s*$/.exec(text);
  return { luecken, weitere: mehr ? Number(mehr[1]) : 0 };
}

export type SeitenzahlFehler = "zeichen" | "bereich" | "zuViele";

export interface GeleseneSeitenzahlen {
  seiten: number[];
  fehler: SeitenzahlFehler | null;
}

const MAX_SEITENZAHLEN = 2000;
const MAX_SPANNE = 5000;

/** Liest eine Angabe gedruckter Seitenzahlen: "48-49, 120; 200–205". Nur Ziffern, Komma, Semikolon, Leerzeichen und Bindestrich; das Ergebnis ist sortiert und ohne Doppelte. */
export function leseSeitenzahlen(eingabe: string | null | undefined): GeleseneSeitenzahlen {
  const roh = String(eingabe ?? "").trim();
  if (!roh) return { seiten: [], fehler: null };
  if (roh.length > 4000 || !/^[0-9\s,;\-–—]+$/u.test(roh)) return { seiten: [], fehler: "zeichen" };
  const glatt = roh.replace(/\s*[-–—]\s*/gu, "-");
  const menge = new Set<number>();
  for (const teil of glatt.split(/[\s,;]+/u).filter(Boolean)) {
    const bereich = /^(\d{1,5})-(\d{1,5})$/.exec(teil);
    if (bereich) {
      const von = Number(bereich[1]);
      const bis = Number(bereich[2]);
      if (bis < von || bis - von >= MAX_SPANNE) return { seiten: [], fehler: "bereich" };
      for (let n = von; n <= bis; n++) menge.add(n);
    } else if (/^\d{1,5}$/.test(teil)) {
      menge.add(Number(teil));
    } else {
      return { seiten: [], fehler: "zeichen" };
    }
    if (menge.size > MAX_SEITENZAHLEN) return { seiten: [], fehler: "zuViele" };
  }
  const seiten = [...menge].filter((n) => n >= 1).sort((a, b) => a - b);
  return { seiten, fehler: null };
}

/** Fasst Seitenzahlen zu Bereichen zusammen: [48,49,120] -> "48-49, 120". */
export function alsBereichsText(seiten: readonly number[]): string {
  const aus: string[] = [];
  let start: number | null = null;
  let ende = 0;
  const schliesse = () => {
    if (start !== null) aus.push(start === ende ? String(start) : `${start}-${ende}`);
  };
  for (const n of [...new Set(seiten)].sort((a, b) => a - b)) {
    if (start !== null && n === ende + 1) {
      ende = n;
    } else {
      schliesse();
      start = n;
      ende = n;
    }
  }
  schliesse();
  return aus.join(", ");
}

export interface Abzug {
  /** Was nach dem Abzug noch offen ist. */
  rest: OffeneLuecke[];
  /** Die Seitenzahlen, die tatsächlich eine Lücke (oder einen Teil davon) gedeckt haben. */
  benutzt: number[];
  /** Angegebene Seitenzahlen, die zu keiner (noch offenen) Lücke gehören. */
  uebrig: number[];
}

/**
 * Zieht Seitenzahlen von den Lücken ab. Bei einer genauen Lücke zählt jede einzelne Seite ("48-49" fehlt: beide müssen angegeben sein, sonst bleibt
 * der Rest offen). Bei einer unscharfen Lücke ("2 Seiten irgendwo zwischen 105 und 107") zählt jede angegebene Seite in diesem Bereich einmal, bis die
 * Zahl der fehlenden erreicht ist: Welche der Seiten es sind, lässt sich dort ohnehin nicht sagen.
 */
export function ziehSeitenAb(luecken: readonly OffeneLuecke[], seiten: readonly number[]): Abzug {
  const frei = new Set(seiten);
  const benutzt = new Set<number>();
  const rest: OffeneLuecke[] = [];
  for (const l of luecken) {
    if (l.genau) {
      const offen: number[] = [];
      for (let n = l.vonGedruckt; n <= l.bisGedruckt; n++) {
        if (frei.has(n)) {
          benutzt.add(n);
          frei.delete(n);
        } else {
          offen.push(n);
        }
      }
      let start = -1;
      let ende = -1;
      const gib = () => {
        if (start >= 0) rest.push({ ...l, vonGedruckt: start, bisGedruckt: ende, anzahl: ende - start + 1 });
      };
      for (const n of offen) {
        if (start >= 0 && n === ende + 1) {
          ende = n;
        } else {
          gib();
          start = n;
          ende = n;
        }
      }
      gib();
    } else {
      let offen = l.anzahl;
      for (let n = l.vonGedruckt; n <= l.bisGedruckt && offen > 0; n++) {
        if (frei.has(n)) {
          benutzt.add(n);
          frei.delete(n);
          offen--;
        }
      }
      if (offen > 0) rest.push({ ...l, anzahl: offen });
    }
  }
  return { rest, benutzt: [...benutzt].sort((a, b) => a - b), uebrig: [...frei].sort((a, b) => a - b) };
}

/** Summe der fehlenden Seiten. */
export const zaehleFehlend = (luecken: readonly SeitenLuecke[]): number => luecken.reduce((s, l) => s + l.anzahl, 0);

export interface Abdeckung {
  /** true: Alle Lücken sind durch die angegebenen Seiten gedeckt und es gibt keine unbekannten weiteren. */
  ok: boolean;
  offen: OffeneLuecke[];
  /** Fehlende Seiten, die noch nicht gedeckt sind (Summe von offen). */
  fehlendOffen: number;
  /** Die angegebenen Seiten, die etwas gedeckt haben (das wird abgelegt). */
  bestaetigt: number[];
  /** Angegebene Seiten ohne Lücke dazu: Tippfehler oder falsche Seite. */
  uebrig: number[];
  /** Weitere Lücken, die nur als "+N" bekannt sind: Sie lassen sich nicht bestätigen. */
  weitere: number;
}

/** Prüft, ob die angegebenen Seiten ALLE offenen Lücken abdecken. */
export function pruefeAbdeckung(gelesen: GeleseneLuecken, bestaetigt: readonly number[]): Abdeckung {
  const abzug = ziehSeitenAb(gelesen.luecken, bestaetigt);
  return {
    ok: abzug.rest.length === 0 && gelesen.weitere === 0,
    offen: abzug.rest,
    fehlendOffen: zaehleFehlend(abzug.rest),
    bestaetigt: abzug.benutzt,
    uebrig: abzug.uebrig,
    weitere: gelesen.weitere,
  };
}

/** Die Lücken, die nach den nachgeladenen Seiten noch offen sind. */
export function offeneNachNachtraegen(gelesen: GeleseneLuecken, nachgeladen: readonly number[]): GeleseneLuecken {
  return { luecken: ziehSeitenAb(gelesen.luecken, nachgeladen).rest, weitere: gelesen.weitere };
}

export interface SeitenStand {
  /** Lücken laut Prüfung beim Hochladen (extra.seiten_pruefung.fehlend). */
  fehlendBeimHochladen: number;
  stellen: string | null;
  orte?: string | null;
  /** Gedruckte Seitenzahlen, die per Nachtrag nachgeladen wurden (Tabelle wissen_seiten_nachtrag). */
  nachgeladen: readonly number[];
  /** Die prüfende Person hat die verbleibenden Lücken bestätigt (Zeile in wissen_seiten_vermerk). */
  bestaetigt: boolean;
}

export interface OffenerStand {
  luecken: OffeneLuecke[];
  /** Offene fehlende Seiten insgesamt, auch die nicht einzeln bekannten. */
  fehlend: number;
  /** Lücken, die nur als Zahl bekannt sind (Kurzform gekappt oder nicht lesbar). */
  unbekannt: number;
}

/**
 * Was ist an einem Dokument noch offen? Lücken laut Hochladen minus Nachtrag. Bestätigte Lücken bleiben offen im Sinne der Anzeige nicht übrig: Wer sie
 * bestätigt hat, hat sie als "korrekt fehlend" eingestuft, sie zählen nicht mehr (fehlend = 0).
 */
export function offenerStand(s: SeitenStand): OffenerStand {
  if (s.bestaetigt) return { luecken: [], fehlend: 0, unbekannt: 0 };
  const gelesen = lueckenAusStellen(s.stellen, s.orte);
  const bekannt = zaehleFehlend(gelesen.luecken);
  // Was die Kurzform nicht einzeln nennt (gekappt, unlesbar), bleibt als Zahl offen, abzüglich dessen, was nachgeladen wurde.
  const unbekannt = Math.max(0, s.fehlendBeimHochladen - bekannt);
  const rest = ziehSeitenAb(gelesen.luecken, s.nachgeladen).rest;
  return { luecken: rest, fehlend: zaehleFehlend(rest) + unbekannt, unbekannt };
}
