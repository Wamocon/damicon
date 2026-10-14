import type { Analyse } from "@/lib/wissen/analyse";
import { fuehreZusammen, type KiAntwort } from "@/lib/wissen/analyse-ki";
import type { BuchKopf } from "@/lib/wissen/buch-upload";
import { titelAusDateiname } from "@/lib/wissen/buch-text";
import { vollstaendigkeitsFaktor } from "@/lib/wissen/qualitaet";
import { clusterPasst, istCluster, istQuellenart, nutzungFuer, QUELLENART_INFO, TEXTGRUNDLAGEN } from "@/lib/wissen/quellenart";
import { ermittleOrte } from "@/lib/wissen/seiten-orte";
import { alsSeitenAngabe, type ArtikelPruefung, type SeitenPruefung } from "@/lib/wissen/seitenverlauf";
import type { Guete } from "@/lib/wissen/textguete";
import { UPLOAD_BEREICHE } from "@/lib/wissen/upload-konstanten";

// Ein Buch in der Auflistung beim Hochladen (components/db/wissen-buecher.tsx): sein Zustand, was es zum Hochladen braucht, und jeder Uebergang
// (neu gewaehlt, gelesen, von Hand geaendert, von der KI eingeordnet) als reine Funktion ohne React. Dazu der Kopf, der mit jedem Paket zum Server
// geht, und der Gesamtfortschritt eines Laufs. Die Oberflaeche haelt nur den Zustand und ruft diese Funktionen; ohne Browser geprueft in
// supabase/tests/wissen-buecher-ansicht.tsx.

export type Schritt = "wartet" | "liest" | "bereit" | "laedt" | "fertig" | "fehler" | "abgebrochen";
export type Feld = "bereich" | "quellenart" | "textgrundlage";

export interface Eintrag {
  id: number;
  datei: File;
  titel: string;
  schritt: Schritt;
  seite: number;
  seiten: number;
  paket: number;
  pakete: number;
  guete: Guete | null;
  /** Ergebnis der Pruefung des Seitenverlaufs (nur PDF) und, bei Gesetzen, der Artikelfolge. */
  verlauf: SeitenPruefung | null;
  artikel: ArtikelPruefung | null;
  /** Der rohe Text jeder PDF-Seite (nur PDF): daraus bestimmt der Browser, wo im Buch eine Luecke liegt (seiten-orte.ts). */
  roheSeiten: string[] | null;
  /** Die Administration nimmt die Luecken im Scan bewusst in Kauf. */
  trotzdem: boolean;
  /** Qualitaet in Prozent (Text und Vollstaendigkeit), vor dem Hochladen im Browser gerechnet; null vor dem Lesen. */
  qualitaet: number | null;
  /** Original-PDF zur Prüfung abgelegt (ok), nicht abgelegt (Code des Grundes) oder nicht versucht (null). */
  original: "ok" | string | null;
  /** Fortschritt des Originals in Prozent, solange es hochgeladen wird. */
  originalProzent: number | null;
  /** Wie oft das aktuelle Paket erneut gesendet wird (0 = erster Versuch). */
  versuch: number;
  fehler: string | null;
  text: string | null;
  hash: string | null;
  analyse: Analyse | null;
  ki: "aus" | "laeuft" | "fertig" | "keine";
  bereich: string;
  quellenart: string;
  textgrundlage: string;
  url: string;
  /** Felder, die die Administration selbst geaendert hat: Eine spaetere KI-Antwort ueberschreibt sie nicht. */
  eigene: ReadonlySet<Feld>;
}

/** Ein Eintrag mit gelesenem Text und Hash: nur er laesst sich hochladen. */
export type Ladbar = Eintrag & { text: string; hash: string };

/** Der Lauf des Hochladens: welche Buecher, wann gestartet, wann zu Ende (fuer Gesamtanzeige und Restzeit). */
export interface Lauf {
  ids: number[];
  start: number;
  ende: number | null;
}

/** Was das Lesen einer Datei ergibt (im Browser, wissen-buecher.tsx). */
export interface Gelesen {
  text: string;
  guete: Guete;
  verlauf: SeitenPruefung | null;
  artikel: ArtikelPruefung | null;
  hash: string | null;
  analyse: Analyse;
  pakete: number;
  roheSeiten: string[] | null;
}

export function istTextDatei(datei: File): boolean {
  return /\.(md|txt)$/i.test(datei.name);
}

export const artPasst = (art: string, cluster: string): boolean => istQuellenart(art) && istCluster(cluster) && clusterPasst(art, cluster);

// Fehlende Seiten im Scan: Das Buch geht nur hoch, wenn die Administration es ausdruecklich bestaetigt.
const luckenOffen = (e: Eintrag): boolean => (e.verlauf?.fehlend ?? 0) > 0 && !e.trotzdem;
// Die Artikelfolge zaehlt nur bei Gesetzen (Rechtsnorm, Verwaltungsanweisung): Ein Kommentar oder ein Lehrbuch nennt nur einzelne Artikel.
export const istGesetz = (e: Eintrag): boolean => e.quellenart === "rechtsnorm" || e.quellenart === "verwaltungsanweisung";
export const gesperrt = (e: Eintrag) => e.schritt === "laedt" || e.schritt === "fertig";
export const istLadbar = (e: Eintrag): e is Ladbar => !!e.text && !!e.hash && istQuellenart(e.quellenart);

export function eintragOk(e: Eintrag, cluster: string): boolean {
  if (e.schritt !== "bereit" || !e.guete || e.guete.note === "schlecht" || !e.hash || !e.text) return false;
  if (luckenOffen(e)) return false;
  if (!(UPLOAD_BEREICHE as readonly string[]).includes(e.bereich) || !istQuellenart(e.quellenart) || !artPasst(e.quellenart, cluster)) return false;
  if (nutzungFuer(e.bereich, e.quellenart) === "nein") return false;
  if (!(TEXTGRUNDLAGEN as readonly string[]).includes(e.textgrundlage)) return false;
  if (e.titel.trim().length === 0) return false;
  if (QUELLENART_INFO[e.quellenart].urlPflicht && !/^https?:\/\//i.test(e.url.trim())) return false;
  return true;
}

/** Bereit, aber nicht ladbar: Die Angaben passen nicht zusammen oder ein Link fehlt (Luecken und schlechter Text melden sich selbst). */
export const angabenFehlen = (e: Eintrag, cluster: string): boolean => e.schritt === "bereit" && e.guete?.note !== "schlecht" && !luckenOffen(e) && !eintragOk(e, cluster);
/** In der Liste von selbst aufgeklappt: ein Fehler, offene Luecken, schlechter Text oder fehlende Angaben. */
export const brauchtAufmerksamkeit = (e: Eintrag, cluster: string): boolean => !!e.fehler || luckenOffen(e) || e.guete?.note === "schlecht" || (e.schritt === "bereit" && !eintragOk(e, cluster));

/** Ein neuer Eintrag je gewaehlter Datei: Er wartet aufs Lesen, Bereich, Quellenart und Textgrundlage sind vorbelegt, bis die Analyse sie vorschlaegt. */
export function neuerEintrag(id: number, datei: File): Eintrag {
  return {
    id,
    datei,
    titel: titelAusDateiname(datei.name),
    schritt: "wartet",
    seite: 0,
    seiten: 0,
    paket: 0,
    pakete: 0,
    guete: null,
    verlauf: null,
    artikel: null,
    roheSeiten: null,
    trotzdem: false,
    qualitaet: null,
    original: null,
    originalProzent: null,
    versuch: 0,
    fehler: null,
    text: null,
    hash: null,
    analyse: null,
    ki: "aus",
    bereich: "recht",
    quellenart: "fachliteratur",
    textgrundlage: "original",
    url: "",
    eigene: new Set<Feld>(),
  };
}

// Eine Analyse in die Felder eines Buchs uebernehmen: nur, was die Administration nicht selbst geaendert hat. Eine Art, die nicht zum
// Cluster passt (zum Beispiel Internetquelle im Cluster Buecher), wird durch Fachliteratur ersetzt.
export function uebernimm(alt: Eintrag, analyse: Analyse, cluster: string): Eintrag {
  const haben = alt.eigene;
  const art = artPasst(analyse.quellenart, cluster) ? analyse.quellenart : "fachliteratur";
  return {
    ...alt,
    analyse,
    bereich: haben.has("bereich") ? alt.bereich : analyse.bereich,
    quellenart: haben.has("quellenart") ? alt.quellenart : art,
    textgrundlage: haben.has("textgrundlage") ? alt.textgrundlage : analyse.textgrundlage,
  };
}

/** Ein Feld von Hand geaendert: Es gilt danach als eigene Angabe. */
export function mitEigenemFeld(e: Eintrag, feld: Feld, wert: string): Eintrag {
  const neu: Eintrag = { ...e, [feld]: wert, eigene: new Set(e.eigene).add(feld) };
  // Der Bereich bestimmt, ob die Art zulaessig ist; ein Wechsel auf eine gesperrte Kombination setzt die Art zurueck.
  if (feld === "bereich" && istQuellenart(e.quellenart) && nutzungFuer(wert, e.quellenart) === "nein") return { ...neu, quellenart: "" };
  return neu;
}

/** Die KI-Antwort zu einem Eintrag einarbeiten (Heuristik und KI zusammenfuehren, eigene Aenderungen bleiben); ohne Antwort bleibt er, wie er ist. */
export function mitKiAntwort(e: Eintrag, a: { id: string; ki: KiAntwort | null } | undefined, cluster: string): Eintrag {
  if (!a) return e;
  if (!a.ki || !e.analyse) return { ...e, ki: "keine" };
  const neu = uebernimm(e, fuehreZusammen(e.analyse, a.ki), cluster);
  const titel = neu.titel === titelAusDateiname(e.datei.name) && a.ki.titel ? a.ki.titel.trim().slice(0, 200) : neu.titel;
  return { ...neu, ki: "fertig", titel };
}

/** Qualitaet in Prozent vor dem Hochladen: Text, gemindert um fehlende Seiten im Scan (nur bei geprueftem Seitenverlauf). */
const qualitaetVorab = (guete: Guete, verlauf: SeitenPruefung | null): number =>
  Math.round(guete.prozent * vollstaendigkeitsFaktor(verlauf?.geprueft ? { seiten: verlauf.seiten, fehlend: verlauf.fehlend } : null));

/** Ein gelesener Eintrag: bereit, mit dem Vorschlag der Analyse in den Feldern. */
export function nachDemLesen(e: Eintrag, g: Gelesen, cluster: string): Eintrag {
  return { ...uebernimm(e, g.analyse, cluster), schritt: "bereit", text: g.text, guete: g.guete, verlauf: g.verlauf, artikel: g.artikel, roheSeiten: g.roheSeiten, trotzdem: false, qualitaet: qualitaetVorab(g.guete, g.verlauf), hash: g.hash, pakete: g.pakete, ki: "aus" };
}

/** Der Kopf, den Start, jedes Paket und der Abschluss eines Buchs mitschicken; mit der Seitenangabe, wenn der Seitenverlauf geprueft ist. */
export function buchKopf(eintrag: Ladbar, pakete: string[], rollen: string[], cluster: string): BuchKopf {
  return {
    titel: eintrag.titel.trim(),
    bereich: eintrag.bereich,
    rollen,
    dateiname: eintrag.datei.name,
    hash: eintrag.hash,
    quellenart: eintrag.quellenart,
    cluster,
    textgrundlage: eintrag.textgrundlage,
    url: eintrag.url.trim() || undefined,
    pakete: pakete.length,
    zeichen: eintrag.text.length,
    ...(eintrag.verlauf?.geprueft
      ? { seiten: alsSeitenAngabe(eintrag.verlauf, istGesetz(eintrag) ? eintrag.artikel : null, eintrag.roheSeiten ? ermittleOrte(eintrag.roheSeiten, pakete, eintrag.verlauf.luecken) : undefined) }
      : {}),
  };
}

/** Pakete eines Buchs, die schon zaehlen: alle, sobald es fertig oder gescheitert ist; beim laufenden die angekommenen. */
const erledigtePakete = (e: Eintrag): number => (e.schritt === "fertig" || e.schritt === "fehler" || e.schritt === "abgebrochen" ? e.pakete : e.schritt === "laedt" ? e.paket : 0);

/** Restzeit in Minuten, sobald es genug Messung gibt (mindestens zwei Pakete und fuenf Sekunden); null davor und nach dem Ende. */
function restMinuten(lauf: Lauf | null, vergangen: number, erledigt: number, gesamt: number): number | null {
  if (!lauf || lauf.ende || erledigt < 2 || vergangen < 5) return null;
  return Math.max(1, Math.ceil(((vergangen / erledigt) * (gesamt - erledigt)) / 60));
}

// Gesamtfortschritt: gelesen wird nacheinander, hochgeladen wird nach Paketen. Ein Buch zaehlt mit allen seinen Paketen, sobald es fertig
// oder gescheitert ist; ein laufendes mit den Paketen, die schon angekommen sind.
export function gesamtFortschritt(eintraege: readonly Eintrag[], lauf: Lauf | null, jetzt: number) {
  const imLauf = lauf ? eintraege.filter((e) => lauf.ids.includes(e.id)) : [];
  const paketeGesamt = imLauf.reduce((s, e) => s + e.pakete, 0);
  const paketeErledigt = imLauf.reduce((s, e) => s + erledigtePakete(e), 0);
  const vergangen = lauf ? ((lauf.ende ?? jetzt) - lauf.start) / 1000 : 0;
  return {
    liestNoch: eintraege.some((e) => e.schritt === "wartet" || e.schritt === "liest"),
    gelesen: eintraege.filter((e) => e.schritt !== "wartet" && e.schritt !== "liest").length,
    imLauf,
    paketeGesamt,
    paketeErledigt,
    buecherFertig: imLauf.filter((e) => e.schritt === "fertig").length,
    buecherFehler: imLauf.filter((e) => e.schritt === "fehler" || e.schritt === "abgebrochen").length,
    aktuellesBuch: imLauf.find((e) => e.schritt === "laedt"),
    prozent: paketeGesamt > 0 ? Math.min(100, Math.floor((paketeErledigt * 100) / paketeGesamt)) : 0,
    restMinuten: restMinuten(lauf, vergangen, paketeErledigt, paketeGesamt),
  };
}
