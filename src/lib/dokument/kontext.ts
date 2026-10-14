import { createHash } from "node:crypto";
import type { DokumentEingabe, RahmenTexte } from "@/lib/dokument/damicon-dokument";

// Was jede Dokumentvorlage braucht: Uebersetzer je Namensraum, Zeitpunkt, Sprache, Ersteller. Die Vorlagen sind
// reine Funktionen (Daten rein, Dokument raus) und damit ohne Datenbank und ohne Server testbar. Geladen wird in
// lib/dokument/arten.ts, ausgeliefert ueber app/api/dokument/[art]/route.ts.

export type Uebersetzer = (schluessel: string, werte?: Record<string, string | number>) => string;

export interface DokumentKontext {
  sprache: string;
  jetzt: Date;
  /** Wer das Dokument erzeugt: Name und Rolle (Rolle schon in der Sprache des Dokuments). */
  ersteller: { name: string; rolle: string };
  /** Uebersetzer fuer einen Namensraum, zum Beispiel "dokument.esutd" oder "esutdAnsicht". */
  t: (namensraum: string) => Uebersetzer;
}

/** Die Namensraeume, die jede Vorlage zusaetzlich zu ihren eigenen braucht. */
export const RAHMEN_NAMENSRAUM = "dokument.rahmen";

export function rahmenTexte(x: DokumentKontext): RahmenTexte {
  const r = x.t(RAHMEN_NAMENSRAUM);
  return {
    sprache: x.sprache,
    untertitel: r("untertitel"),
    vertraulich: r("vertraulich"),
    fussVertraulich: r("fussVertraulich"),
    seite: r("seite"),
    von: r("von"),
    inhalt: r("inhalt"),
    kennung: r("kennung"),
    erstelltAm: r("erstelltAm"),
    ersteller: r("ersteller"),
    siegel: r("siegel"),
    siegelKurz: r("siegelKurz"),
    siegelHinweis: r("siegelHinweis"),
    unterschrift: r("unterschrift"),
    ortDatum: r("ortDatum"),
    freigabe: r("freigabe"),
    freigabeText: r("freigabeText"),
    hinweise: r("hinweise"),
    drucken: r("drucken"),
    tippDruck: r("tippDruck"),
  };
}

/** Kanonische Form: Schluessel sortiert, damit dieselben Daten immer dieselbe Pruefsumme ergeben. */
function kanonisch(wert: unknown): string {
  if (Array.isArray(wert)) return `[${wert.map(kanonisch).join(",")}]`;
  if (wert !== null && typeof wert === "object") {
    const o = wert as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${kanonisch(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(wert) ?? "null";
}

export function pruefsumme(wert: unknown): string {
  return createHash("sha256").update(kanonisch(wert), "utf8").digest("hex");
}

/**
 * Versiegelt den Inhalt: SHA-256 ueber Titel, Kennzahlen, Abschnitte, Eckdaten und Hinweise. Zeitpunkt und Ersteller
 * gehoeren bewusst nicht dazu: dieselben Daten ergeben dieselbe Pruefsumme, egal wer sie wann abruft.
 */
export function versiegeln(e: Omit<DokumentEingabe, "siegel">): DokumentEingabe {
  return {
    ...e,
    siegel: pruefsumme({ art: e.art, titel: e.titel, untertitel: e.untertitel, meta: e.meta, kennzahlen: e.kennzahlen, abschnitte: e.abschnitte, hinweise: e.hinweise }),
  };
}

/** Dokumentnummer: Kuerzel, Tag und die ersten Zeichen der Pruefsumme des Inhalts oder einer Kennung. */
export function kennungFuer(kuerzel: string, jetzt: Date, schluessel: string): string {
  const tag = jetzt.toISOString().slice(0, 10).replace(/-/g, "");
  return `${kuerzel}-${tag}-${createHash("sha256").update(schluessel, "utf8").digest("hex").slice(0, 8)}`;
}

/** Dateiname ohne Sonderzeichen: Titel und Datum. */
export function dateinameFuer(titel: string, jetzt: Date): string {
  const sauber = titel.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
  return `${sauber}-${jetzt.toISOString().slice(0, 10)}`;
}

// ---- Formate ---------------------------------------------------------------------------------------------------------------

export const ZEITZONE = "Asia/Almaty";

/** "14.10.2026" aus einem ISO-Tag oder einem Zeitpunkt (der Tag in Almaty). */
export function tagText(iso: string | null | undefined, sprache: string): string {
  if (!iso) return "-";
  const tag = iso.length > 10 ? new Date(iso).toLocaleDateString("en-CA", { timeZone: ZEITZONE }) : iso;
  try {
    return new Date(`${tag}T00:00:00Z`).toLocaleDateString(sprache, { dateStyle: "medium", timeZone: "UTC" });
  } catch {
    return tag;
  }
}

export function zeitText(iso: string | null | undefined, sprache: string): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString(sprache, { dateStyle: "medium", timeStyle: "short", timeZone: ZEITZONE });
  } catch {
    return iso;
  }
}

export function zahlText(wert: number | null | undefined, sprache: string, stellen = 2): string {
  if (wert === null || wert === undefined || !Number.isFinite(wert)) return "-";
  return wert.toLocaleString(sprache, { maximumFractionDigits: stellen });
}

export function tengeText(wert: number | null | undefined, sprache: string): string {
  return wert === null || wert === undefined ? "-" : `${zahlText(wert, sprache)} ₸`;
}
