import { chunkiere } from "@/lib/wissen/chunker";
import {
  baueDokument,
  einbettenUndSchreiben,
  pruefeUploadUmgebung,
  MAX_CHUNKS,
  UploadFehler,
  ZEITBUDGET_MS,
  type FreigabeInfo,
  type UploadAbhaengigkeiten,
  type UploadMetadaten,
} from "@/lib/wissen/hochladen";
import { MAX_PAKET_ZEICHEN } from "@/lib/wissen/buch-upload";
import { alsBereichsText, leseSeitenzahlen, offenerStand, ziehSeitenAb, type OffeneLuecke } from "@/lib/wissen/seiten-bestaetigung";
import { bewerteText } from "@/lib/wissen/textguete";
import { istUploadQuelleId } from "@/lib/wissen/upload-quelle";

// Nachtrag: Fehlen einem hochgeladenen Buch echte Seiten, werden sie als OCR-PDF nachgeladen. Der Browser liest die Datei (wie beim Buch-Upload),
// ordnet jeder Seite ihre gedruckte Seitenzahl zu und schickt den Text je Lücke als Gruppe hierher. Der Server prüft, dass die Seiten zu einer OFFENEN
// Lücke des Buchs gehören, bettet den Text ein und reiht die neuen Abschnitte an der Stelle der Lücke ins Buch ein (Paket und Stelle darin stehen seit dem
// Hochladen in extra.seiten_pruefung.orte). Danach sind diese Seiten nicht mehr offen: Die Freigabe verlangt für sie keine Bestätigung mehr, und die
// Qualität steigt, weil der Abzug für fehlende Seiten entfällt.
//
// Was der Server NICHT prüfen kann: ob der Text wirklich zu den angegebenen Seitenzahlen gehört. Er sieht nur Text. Wie bei der Seitenverlauf-Prüfung ist das
// ein Hinweis für die zweite Person, die das Buch am Original sieht, kein Beweis. Die Original-PDF bleibt bis zur Freigabe das, was geprüft wird.
// Ein Nachtrag ändert nichts an der Kennung des Buchs (Hash des ursprünglichen Textes) und nichts an der Person, die hochgeladen hat: Die Freigabe darf
// weiterhin nicht von ihr kommen.

export const MAX_GRUPPEN = 40;
export const MAX_SEITEN_JE_GRUPPE = 400;

export interface NachtragGruppe {
  /** Gedruckte Seitenzahlen dieser Gruppe (alle in derselben Lücke). */
  seiten: number[];
  /** Der bereinigte Text dieser Seiten in Reihenfolge. */
  text: string;
}

export interface NachtragEingabe {
  quelleId: string;
  gruppen: NachtragGruppe[];
}

/** Was der Nachtrag über das Buch wissen muss (aus der ersten Zeile des Buchs, siehe speicher-nachtrag.ts). */
export interface NachtragBasis {
  /** Wie beim Hochladen, ohne Paket und ohne Güte; dateiname ohne die Paketnummer. */
  meta: UploadMetadaten;
  paketeGesamt: number;
  /** Nächste freie Nummer in wissen_seiten_nachtrag. */
  naechsteNr: number;
}

export interface NachtragSpeicher {
  ladeBasis(quelleId: string): Promise<NachtragBasis | null>;
  /**
   * Wo im Paket die neuen Abschnitte hin sollen: `pfad` des Pakets und die Zahl der vorhandenen Abschnitte (in Lesereihenfolge), die vorn bleiben.
   * null, wenn es das Paket nicht gibt.
   */
  findeStelle(quelleId: string, paket: number, promille: number): Promise<{ pfad: string; davor: number } | null>;
  /** Setzt die neuen Abschnitte (ids) hinter die ersten `davor` vorhandenen des Pakets und nummeriert teil/teile neu (Funktion wissen_nachtrag_einreihen). */
  reiheEin(quelleId: string, pfad: string, ids: string[], davor: number): Promise<void>;
  /** Merkt sich den Nachtrag (eine Zeile in wissen_seiten_nachtrag). */
  merke(quelleId: string, a: { nr: number; seiten: string; abschnitte: number; von: string; zeitpunkt: string }): Promise<void>;
}

export interface NachtragAbhaengigkeiten extends UploadAbhaengigkeiten {
  nachtrag: NachtragSpeicher;
  pruefer: { id: string };
}

export interface NachtragErgebnis {
  titel: string | null;
  bereich: string | null;
  /** Gedruckte Seiten, die nachgeladen wurden ("48-49, 120"). */
  seiten: string;
  abschnitte: number;
  /** Fehlende Seiten, die danach noch offen sind. */
  offen: number;
}

/**
 * Wählt die Stelle zwischen den Abschnitten eines Pakets: `laengen` sind die Zeichenzahlen der vorhandenen Abschnitte in Lesereihenfolge, `promille` die Lage
 * im Paket (0 = Anfang, 1000 = Ende). Liefert, wie viele Abschnitte vorn bleiben: die nächstgelegene Grenze zwischen zwei Abschnitten.
 */
export function waehleEinfuegestelle(laengen: readonly number[], promille: number): number {
  const gesamt = laengen.reduce((s, l) => s + l, 0);
  if (laengen.length === 0 || promille <= 0 || gesamt <= 0) return 0;
  if (promille >= 1000) return laengen.length;
  const ziel = (promille / 1000) * gesamt;
  let start = 0;
  for (let i = 0; i < laengen.length; i++) {
    const ende = start + laengen[i]!;
    if (ziel <= ende) return ziel - start < ende - ziel ? i : i + 1;
    start = ende;
  }
  return laengen.length;
}

const pad = (n: number) => String(n).padStart(4, "0");

function pruefeGruppen(gruppen: unknown): NachtragGruppe[] {
  if (!Array.isArray(gruppen) || gruppen.length === 0 || gruppen.length > MAX_GRUPPEN) throw new UploadFehler("nachtragUngueltig");
  return gruppen.map((g) => {
    const seiten = (g as NachtragGruppe | null)?.seiten;
    const text = (g as NachtragGruppe | null)?.text;
    if (!Array.isArray(seiten) || seiten.length === 0 || seiten.length > MAX_SEITEN_JE_GRUPPE) throw new UploadFehler("nachtragUngueltig");
    if (!seiten.every((n) => Number.isInteger(n) && n >= 1 && n <= 99_999)) throw new UploadFehler("nachtragUngueltig");
    if (typeof text !== "string" || text.trim().length === 0) throw new UploadFehler("leer");
    if (text.length > MAX_PAKET_ZEICHEN) throw new UploadFehler("zuGross");
    return { seiten: [...new Set(seiten)].sort((a, b) => a - b), text };
  });
}

/** Welche offene Lücke nimmt diese Seiten auf? Alle Seiten müssen im Bereich der Lücke liegen; bei einer unscharfen Lücke nicht mehr, als dort fehlen. */
function findeLuecke(offen: readonly OffeneLuecke[], seiten: readonly number[]): OffeneLuecke | null {
  return (
    offen.find((l) => seiten.every((n) => n >= l.vonGedruckt && n <= l.bisGedruckt) && (l.genau || seiten.length <= l.anzahl)) ?? null
  );
}

/** Der Ort für eine Lücke ohne gespeicherte Lage (Bücher aus der Zeit vor dem Nachtrag): das Ende des letzten Pakets. */
const ENDE = (gesamt: number) => ({ paket: Math.max(1, gesamt), promille: 1000 });

/** Lädt Seiten nach und reiht sie ins Buch ein. Wirft ausschließlich UploadFehler. */
export async function ladeNachtrag(e: NachtragEingabe, d: NachtragAbhaengigkeiten): Promise<NachtragErgebnis> {
  pruefeUploadUmgebung(d.umgebung ?? process.env, d.schema);
  const uhr = d.jetztMs ?? Date.now;
  const beginn = uhr();
  const budget = d.zeitbudgetMs ?? ZEITBUDGET_MS;
  if (!istUploadQuelleId(e.quelleId)) throw new UploadFehler("nichtFreigebbar");
  const gruppen = pruefeGruppen(e.gruppen);

  const info: FreigabeInfo = await d.speicher.ladeFreigabeInfo(e.quelleId).catch((u) => {
    throw new UploadFehler("speichern", undefined, u);
  });
  if (info.anzahl === 0) throw new UploadFehler("nichtGefunden");
  if (info.fremd > 0) throw new UploadFehler("nichtFreigebbar");
  // Nur ein wartendes, vollständiges Buch: Ein freigegebenes ändert sich nicht mehr, ein unvollständiges wird gelöscht und neu hochgeladen.
  if (info.pruefstatus !== "ungeprueft") throw new UploadFehler("nichtPruefbar");
  if (info.unvollstaendig) throw new UploadFehler("unvollstaendig");

  const basis = await d.nachtrag.ladeBasis(e.quelleId).catch((u) => {
    throw new UploadFehler("speichern", undefined, u);
  });
  if (!basis) throw new UploadFehler("nichtGefunden");

  const stand = offenerStand({
    fehlendBeimHochladen: info.seitenFehlend ?? 0,
    stellen: info.seitenStellen ?? null,
    orte: info.seitenOrte ?? null,
    nachgeladen: leseSeitenzahlen(info.seitenNachgeladen).seiten,
    bestaetigt: false,
  });
  let offen: OffeneLuecke[] = stand.luecken;
  if (offen.length === 0) throw new UploadFehler("nachtragUngueltig");

  // Erst alles prüfen, dann schreiben: Eine Gruppe, die zu keiner offenen Lücke passt, lässt den ganzen Nachtrag scheitern, bevor etwas gespeichert ist.
  const geplant = gruppen.map((g) => {
    const luecke = findeLuecke(offen, g.seiten);
    if (!luecke) throw new UploadFehler("nachtragUngueltig", alsBereichsText(g.seiten));
    offen = ziehSeitenAb(offen, g.seiten).rest;
    return { gruppe: g, ort: luecke.ort ?? ENDE(basis.paketeGesamt) };
  });

  let nr = basis.naechsteNr;
  let abschnitte = 0;
  const seiten: number[] = [];
  for (const { gruppe, ort } of geplant) {
    if (uhr() - beginn > budget) throw new UploadFehler("zeit", String(Math.round(budget / 1000)));
    // Die Stelle zuerst bestimmen, solange die neuen Abschnitte noch nicht im Paket stehen.
    const stelle = await d.nachtrag.findeStelle(e.quelleId, ort.paket, ort.promille).catch((u) => {
      throw new UploadFehler("speichern", undefined, u);
    });
    if (!stelle) throw new UploadFehler("nachtragUngueltig");

    const text = bewerteText(gruppe.text, false);
    const luecken = (basis.meta.seiten?.fehlend ?? 0) > 0;
    const guete = luecken ? { ...text, note: text.note === "gut" ? ("pruefen" as const) : text.note, hinweise: [...text.hinweise, "seitenLuecken"] } : text;
    const paketMeta: UploadMetadaten = {
      ...basis.meta,
      zeitpunkt: (d.jetzt?.() ?? new Date()).toISOString(),
      dateiname: `${basis.meta.dateiname}#${pad(ort.paket)}`,
      paket: { nr: ort.paket, gesamt: basis.paketeGesamt },
      guete: { note: guete.note, hinweise: guete.hinweise },
    };
    const dok = baueDokument(gruppe.text, paketMeta);
    dok.meta.chunk_id = `${e.quelleId}#n${nr}`;
    const chunks = chunkiere(dok);
    if (chunks.length === 0) throw new UploadFehler("leer");
    if (chunks.length > MAX_CHUNKS) throw new UploadFehler("zuLang", String(MAX_CHUNKS));
    // Das Paket, in das eingereiht wird, bestimmt der Pfad der vorhandenen Abschnitte; er muss mit dem Pfad der neuen übereinstimmen.
    if (chunks.some((c) => c.pfad !== stelle.pfad)) throw new UploadFehler("nachtragUngueltig");

    await einbettenUndSchreiben(chunks, paketMeta, d, { beginn, budget, quelleId: e.quelleId, aufraeumen: false });
    await d.nachtrag.reiheEin(e.quelleId, stelle.pfad, chunks.map((c) => c.id), stelle.davor).catch((u) => {
      throw new UploadFehler("speichern", undefined, u);
    });
    await d.nachtrag
      .merke(e.quelleId, { nr, seiten: alsBereichsText(gruppe.seiten), abschnitte: chunks.length, von: d.pruefer.id, zeitpunkt: (d.jetzt?.() ?? new Date()).toISOString() })
      .catch((u) => {
        throw new UploadFehler("speichern", undefined, u);
      });
    nr++;
    abschnitte += chunks.length;
    seiten.push(...gruppe.seiten);
  }
  return { titel: info.titel, bereich: info.bereich, seiten: alsBereichsText(seiten), abschnitte, offen: stand.unbekannt + offen.reduce((s, l) => s + l.anzahl, 0) };
}
