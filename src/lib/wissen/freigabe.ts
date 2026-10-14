import { pruefeUploadUmgebung, UploadFehler, type FreigabeInfo, type WissenSpeicher } from "@/lib/wissen/hochladen";
import { istQuellenart, pruefenBis, type Quellenart } from "@/lib/wissen/quellenart";
import { alsBereichsText, leseSeitenzahlen, offenerStand, pruefeAbdeckung, type OffenerStand } from "@/lib/wissen/seiten-bestaetigung";
import { beschreibeLuecken } from "@/lib/wissen/seitenverlauf";
import { istUploadQuelleId } from "@/lib/wissen/upload-quelle";

// Vier-Augen-Prinzip fuer hochgeladene Wissensdokumente. Ein Upload ist ungeprueft und fuer niemanden durchsuchbar (auch
// nicht fuer den Admin: die Zeilensicherheit der Datenbank zeigt nur Freigegebenes). Freigeben, ablehnen und verlaengern
// duerfen die, die ki_assistent:manage haben, aber die Freigabe und die Verlaengerung NICHT die Person, die hochgeladen hat.
//
// Zwei Schichten, die sich nicht aufeinander verlassen:
//   1. Hier: Vorschau-Schutz, Form der quelle_id, nur Upload-Zeilen, nur im richtigen Status, nicht die eigene Person.
//   2. Datenbank: ein Waechter (Trigger wissen_pruefung_wache, Migration 20261124000000) lehnt dieselben Faelle ab, auch
//      wenn hier ein Fehler stuende. Die UPDATE-Anweisung filtert ausserdem selbst auf Marker und Status.
// Ist die Freigabe einmal erteilt, bleibt sie: freigegeben und abgelehnt aendern sich nicht mehr (Trigger).

export type FreigabeAktion = "freigeben" | "ablehnen" | "verlaengern";

export interface FreigabeErgebnis {
  titel: string | null;
  bereich: string | null;
  quellenart: string | null;
  /** Zahl der Zeilen (Abschnitte), die dieser Aufruf geaendert hat. */
  abschnitte: number;
  /** Neue Wiedervorlage (JJJJ-MM-TT) oder null, wenn die Art nie ablaeuft. */
  pruefenBis: string | null;
  /** Fehlende Scanseiten, die bei der Entscheidung noch offen waren (0 = keine; nachgeladene Seiten sind abgezogen), die bestaetigten gedruckten Seitenzahlen
   *  und der freiwillige Grund. */
  seitenFehlend: number;
  seitenBestaetigt: string | null;
  seitenVermerk: string | null;
}

export interface FreigabeAbhaengigkeiten {
  speicher: WissenSpeicher;
  /** profiles.id der entscheidenden Person. */
  pruefer: { id: string };
  jetzt?: () => Date;
  umgebung?: Record<string, string | undefined>;
  schema?: string;
  /** Gedruckte Seitenzahlen, die die pruefende Person als korrekt fehlend bestaetigt ("48-49, 120"). Pflicht, wenn ein Buch mit offenen Seitenluecken freigegeben
   *  wird, und sie muss ALLE offenen Luecken abdecken (seiten-bestaetigung.ts). */
  seitenBestaetigt?: string | null;
  /** Freiwilliger Grund zu den bestaetigten Seiten, zum Beispiel "Leere Seiten im Buch". */
  seitenVermerk?: string | null;
}

export const VERMERK_MIN = 3;
export const VERMERK_MAX = 300;

/** Bereinigter Vermerk (ohne Steuerzeichen, einfache Leerzeichen, hoechstens 300 Zeichen); zu kurz oder leer ergibt "" (gilt als nicht angegeben). */
export function saeubereVermerk(text: string | null | undefined): string {
  const t = String(text ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, VERMERK_MAX)
    .trim();
  return t.length >= VERMERK_MIN ? t : "";
}

const heute = (jetzt: Date) => jetzt.toISOString().slice(0, 10);

/** Was jeder Schritt einer Entscheidung braucht: das geladene Dokument, die Uhrzeit der Entscheidung und die Quellenart (null, wenn unbekannt). */
interface Entscheidung {
  d: FreigabeAbhaengigkeiten;
  quelleId: string;
  info: FreigabeInfo;
  jetzt: Date;
  zeitpunkt: string;
  art: Quellenart | null;
}

/** Die Seitenangaben im Ergebnis: offene fehlende Seiten bei der Entscheidung, die bestätigten Seitenzahlen und der Grund dazu. */
interface SeitenAngaben {
  fehlend: number;
  bestaetigt: string | null;
  vermerk: string | null;
}

/** Scheitert der Speicher, heisst der Fehler "freigeben", mit dem Titel des Dokuments, wenn er bekannt ist, und der Ursache. */
const speicherFehler =
  (titel?: string | null) =>
  (ursache: unknown): never => {
    throw new UploadFehler("freigeben", titel ?? undefined, ursache);
  };

export async function entscheideUeberUpload(aktion: FreigabeAktion, quelleId: string, d: FreigabeAbhaengigkeiten): Promise<FreigabeErgebnis> {
  const info = await ladePruefbaresDokument(quelleId, d);
  const jetzt = d.jetzt?.() ?? new Date();
  const art = istQuellenart(info.quellenart) ? (info.quellenart as Quellenart) : null;
  const e: Entscheidung = { d, quelleId, info, jetzt, zeitpunkt: jetzt.toISOString(), art };
  return aktion === "verlaengern" ? verlaengereWiedervorlage(e) : entscheideUeberWartendes(aktion, e);
}

/** Vorschau-Schutz und Form der quelle_id, dann das Dokument: Es muss Zeilen haben, und alle muessen aus dem Upload stammen. */
async function ladePruefbaresDokument(quelleId: string, d: FreigabeAbhaengigkeiten): Promise<FreigabeInfo> {
  pruefeUploadUmgebung(d.umgebung ?? process.env, d.schema);
  // Skript-Quellen haben Pfade als quelle_id: hier endet es, ohne dass die Datenbank gefragt wird.
  if (!istUploadQuelleId(quelleId)) throw new UploadFehler("nichtFreigebbar");

  const info: FreigabeInfo = await d.speicher.ladeFreigabeInfo(quelleId).catch(speicherFehler());
  if (info.anzahl === 0) throw new UploadFehler("nichtGefunden");
  if (info.fremd > 0) throw new UploadFehler("nichtFreigebbar");
  return info;
}

async function verlaengereWiedervorlage({ d, quelleId, info, jetzt, zeitpunkt, art }: Entscheidung): Promise<FreigabeErgebnis> {
  // Nur ein freigegebenes Dokument, dessen Wiedervorlage erreicht ist, und nur durch eine zweite Person.
  if (info.pruefstatus !== "freigegeben" || !info.pruefenBis || info.pruefenBis >= heute(jetzt)) throw new UploadFehler("nichtPruefbar");
  sicherheitsPruefung(info, d.pruefer.id);
  const neu = art ? pruefenBis(art, jetzt) : null;
  if (!neu) throw new UploadFehler("nichtPruefbar");
  const n = await d.speicher.verlaengere(quelleId, { pruefer: d.pruefer.id, zeitpunkt, pruefenBis: neu }).catch(speicherFehler(info.titel));
  if (n !== info.anzahl) throw new UploadFehler("nichtPruefbar");
  return ergebnis(info, n, neu, { fehlend: 0, bestaetigt: null, vermerk: null });
}

async function entscheideUeberWartendes(aktion: FreigabeAktion, e: Entscheidung): Promise<FreigabeErgebnis> {
  const { d, quelleId, info, jetzt, zeitpunkt, art } = e;
  const freigeben = aktion === "freigeben";
  // Freigeben und Ablehnen: nur, solange das Dokument wartet.
  if (info.pruefstatus !== "ungeprueft") throw new UploadFehler("nichtPruefbar");
  // Ein Buch, dem Pakete fehlen, wird nicht freigegeben: Es ginge als halbes Buch in die Suche. Ablehnen und Loeschen gehen.
  if (freigeben && info.unvollstaendig) throw new UploadFehler("unvollstaendig");
  // Freigeben braucht die zweite Person. Ablehnen darf auch, wer hochgeladen hat: Das ist ein Zurueckziehen, keine Freigabe.
  if (freigeben) sicherheitsPruefung(info, d.pruefer.id);
  const stand = offeneSeiten(info);
  const seiten = freigeben && stand.fehlend > 0 ? await bestaetigeFehlendeSeiten(e, stand) : { bestaetigt: null, vermerk: null };
  const neu = freigeben && art ? pruefenBis(art, jetzt) : null;
  const n = await d.speicher
    .entscheide(quelleId, { status: freigeben ? "freigegeben" : "abgelehnt", pruefer: d.pruefer.id, zeitpunkt, pruefenBis: neu })
    .catch(speicherFehler(info.titel));
  // Eine Anweisung, alles oder nichts: weniger Zeilen heisst, jemand anderes war schneller.
  if (n !== info.anzahl) throw new UploadFehler("nichtPruefbar");
  return ergebnis(info, n, neu, { fehlend: stand.fehlend, ...seiten });
}

/** Fehlende Scanseiten laut Pruefung beim Hochladen, abzueglich der nachgeladenen. Bestaetigt ist hier noch nichts: Das geschieht erst mit der Freigabe. */
function offeneSeiten(info: FreigabeInfo): OffenerStand {
  return offenerStand({
    fehlendBeimHochladen: info.seitenFehlend ?? 0,
    stellen: info.seitenStellen ?? null,
    orte: info.seitenOrte ?? null,
    nachgeladen: leseSeitenzahlen(info.seitenNachgeladen).seiten,
    bestaetigt: false,
  });
}

/**
 * Fehlen im Scan Seiten (Seitenverlauf-Pruefung beim Hochladen) und sind sie nicht nachgeladen, sieht die pruefende Person am Original nach und gibt die
 * gedruckten Seitenzahlen an, die KORREKT fehlen (Leerseiten, Notizseiten). Die Angabe muss ALLE offenen Luecken abdecken: Sonst fehlt echter Inhalt, und das
 * Buch wird nicht freigegeben (die Seiten werden nachgeladen oder das Buch wird neu hochgeladen). Ablehnen braucht nichts davon. Die Bestaetigung wird VOR der
 * Entscheidung abgelegt: Scheitert diese, bleibt sie zu einem weiter wartenden Dokument, harmlos; umgekehrt gaebe es ein freigegebenes Buch ohne Bestaetigung.
 */
async function bestaetigeFehlendeSeiten({ d, quelleId, info, zeitpunkt }: Entscheidung, stand: OffenerStand): Promise<Omit<SeitenAngaben, "fehlend">> {
  // Lücken, die nicht einzeln bekannt sind (zu viele, nicht lesbar), lassen sich nicht bestätigen: Das Buch gehört neu gescannt.
  if (stand.unbekannt > 0) throw new UploadFehler("seitenNichtAbgedeckt", beschreibeLuecken(stand.luecken) || "-");
  const angabe = leseSeitenzahlen(d.seitenBestaetigt);
  if (angabe.fehler || angabe.seiten.length === 0) throw new UploadFehler("seitenNichtBestaetigt", info.titel ?? undefined);
  const abdeckung = pruefeAbdeckung({ luecken: stand.luecken, weitere: 0 }, angabe.seiten);
  if (!abdeckung.ok) throw new UploadFehler("seitenNichtAbgedeckt", beschreibeLuecken(abdeckung.offen));
  if (!d.speicher.legeSeitenVermerkAb) throw new UploadFehler("freigeben", info.titel ?? undefined);
  const bestaetigt = alsBereichsText(abdeckung.bestaetigt);
  const vermerk = saeubereVermerk(d.seitenVermerk) || null;
  await d.speicher.legeSeitenVermerkAb(quelleId, { vermerk, bestaetigt, stellen: info.seitenStellen ?? null, von: d.pruefer.id, zeitpunkt }).catch(speicherFehler(info.titel));
  return { bestaetigt, vermerk };
}

function ergebnis(info: FreigabeInfo, abschnitte: number, neu: string | null, seiten: SeitenAngaben): FreigabeErgebnis {
  return {
    titel: info.titel,
    bereich: info.bereich,
    quellenart: info.quellenart,
    abschnitte,
    pruefenBis: neu,
    seitenFehlend: seiten.fehlend,
    seitenBestaetigt: seiten.bestaetigt,
    seitenVermerk: seiten.vermerk,
  };
}

/** Das Vier-Augen-Prinzip: Wer hochgeladen hat, gibt nicht frei. Ist der Hochladende unbekannt, wird nicht freigegeben. */
function sicherheitsPruefung(info: FreigabeInfo, pruefer: string): void {
  if (!info.hochgeladenVon) throw new UploadFehler("nichtFreigebbar");
  if (info.hochgeladenVon === pruefer) throw new UploadFehler("selbstFreigabe");
}
