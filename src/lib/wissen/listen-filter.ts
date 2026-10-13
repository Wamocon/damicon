// Filter der Dokumentliste in der Verwaltung (Seite Wissensbasis, Administration) und im Assistenten (wissensbasisAbrufen). Reine Funktionen ohne
// Abhaengigkeiten, damit Oberflaeche und Assistent dieselben Begriffe verwenden:
//
//   Verlaesslichkeit  amtlich     Rechtsnorm, Rechtsprechung, Verwaltungsanweisung, Behoerdeninformation (ohne Quellenart: die bisherige Stufe 1 bis 3)
//                     sicher      wird als tragende Quelle genutzt (Nutzung "ja" in ihrem Bereich), das schliesst amtliche Quellen ein
//                     hinweis     wird nur als Hinweis genutzt, nie allein tragend
//                     unsicher    ungesicherte Internetquelle: nur als Notbehelf genutzt und dem Nutzer entsprechend gekennzeichnet
//                     ohne        noch nicht eingeordnet (keine Quellenart oder kein Cluster)
//   Status            wartet (Upload wartet auf die Freigabe), freigegeben, abgelehnt, unvollstaendig (Buch, dem Pakete fehlen), abgelaufen (Wiedervorlage faellig)
//
// "Bereich" ist der Bereich der Wissensbasis (Recht, Steuern, Compliance, Audit, Risiko und die Bereiche des Bestands wie amtlich oder fachquellen),
// nicht eine Zone der Anwendung (Feld, Hof, Buero, Markt): Ein Dokument gehoert zu einem Sachgebiet und ist fuer bestimmte Rollen sichtbar.

import { ohneEinordnung, type WissenDokumentZeile } from "@/lib/wissen/dokumente-liste";
import type { Cluster, Quellenart } from "@/lib/wissen/quellenart";
import { bereichSchluessel } from "@/lib/wissen/upload-konstanten";

export const VERLAESSLICHKEITEN = ["amtlich", "sicher", "hinweis", "unsicher", "ohne"] as const;
export type Verlaesslichkeit = (typeof VERLAESSLICHKEITEN)[number];

export const STATUS_FILTER = ["wartet", "freigegeben", "abgelehnt", "unvollstaendig", "abgelaufen"] as const;
export type StatusFilter = (typeof STATUS_FILTER)[number];

export const HERKUENFTE = ["upload", "skript"] as const;
export type HerkunftFilter = (typeof HERKUENFTE)[number];

export interface ListenFilter {
  /** Ein Cluster oder "ohne" (nicht eingeordnet); null = alle. */
  cluster: Cluster | "ohne" | null;
  /** Schluessel des Bereichs (recht, steuer ... oder ein Bereich des Bestands); null = alle. */
  bereich: string | null;
  art: Quellenart | null;
  verlaesslichkeit: Verlaesslichkeit | null;
  status: StatusFilter | null;
  herkunft: HerkunftFilter | null;
  /** Rolle, die das Dokument sehen darf; null = alle. */
  rolle: string | null;
  /** Teil des Titels; mehrere Woerter muessen alle vorkommen. */
  suche: string;
}

export const KEIN_FILTER: ListenFilter = { cluster: null, bereich: null, art: null, verlaesslichkeit: null, status: null, herkunft: null, rolle: null, suche: "" };

/** Wie viele Filter sind gesetzt (die Suche zaehlt mit, wenn sie nicht leer ist). */
export const aktiveFilter = (f: ListenFilter): number =>
  [f.cluster, f.bereich, f.art, f.verlaesslichkeit, f.status, f.herkunft, f.rolle].filter((x) => x !== null).length + (f.suche.trim() ? 1 : 0);

const AMTLICHE_ARTEN: readonly string[] = ["rechtsnorm", "rechtsprechung", "verwaltungsanweisung", "behoerdeninfo"];

export function istAmtlich(d: Pick<WissenDokumentZeile, "quellenart" | "stufe">): boolean {
  if (d.quellenart) return AMTLICHE_ARTEN.includes(d.quellenart);
  // Bestand ohne Quellenart: die bisherige Stufe der Recherche (1 Primaerrecht, 2 untergesetzlich, 3 amtliche Erlaeuterung)
  return d.stufe !== null && d.stufe <= 3;
}

export function verlaesslichkeitVon(d: WissenDokumentZeile, v: Verlaesslichkeit): boolean {
  switch (v) {
    case "amtlich":
      return istAmtlich(d);
    case "sicher":
      return d.nutzung === "ja";
    case "hinweis":
      return d.nutzung === "hinweis";
    case "unsicher":
      return d.nutzung === "notfalls";
    case "ohne":
      return ohneEinordnung(d);
  }
}

export function statusVon(d: WissenDokumentZeile, s: StatusFilter): boolean {
  switch (s) {
    case "wartet":
      return d.herkunft === "upload" && d.pruefstatus === "ungeprueft" && !d.unvollstaendig;
    case "freigegeben":
      return d.pruefstatus === "freigegeben" && !d.abgelaufen;
    case "abgelehnt":
      return d.pruefstatus === "abgelehnt";
    case "unvollstaendig":
      return d.unvollstaendig;
    case "abgelaufen":
      return d.abgelaufen;
  }
}

/** Passt das Dokument zu allen gesetzten Filtern? `ausser` laesst einen Filter weg (fuer die Zaehler an den Auswahlfeldern). */
export function passtZumFilter(d: WissenDokumentZeile, f: ListenFilter, ausser?: keyof ListenFilter): boolean {
  if (ausser !== "cluster" && f.cluster !== null && (f.cluster === "ohne" ? !ohneEinordnung(d) : d.cluster !== f.cluster)) return false;
  if (ausser !== "bereich" && f.bereich !== null && bereichSchluessel(d.bereich) !== f.bereich) return false;
  if (ausser !== "art" && f.art !== null && d.quellenart !== f.art) return false;
  if (ausser !== "verlaesslichkeit" && f.verlaesslichkeit !== null && !verlaesslichkeitVon(d, f.verlaesslichkeit)) return false;
  if (ausser !== "status" && f.status !== null && !statusVon(d, f.status)) return false;
  if (ausser !== "herkunft" && f.herkunft !== null && d.herkunft !== f.herkunft) return false;
  if (ausser !== "rolle" && f.rolle !== null && !d.rollen.includes(f.rolle)) return false;
  if (ausser !== "suche") {
    const worte = f.suche.toLowerCase().split(/\s+/).filter(Boolean);
    if (worte.length > 0) {
      const titel = (d.titel ?? "").toLowerCase();
      if (!worte.every((w) => titel.includes(w))) return false;
    }
  }
  return true;
}

export const filtere = (liste: readonly WissenDokumentZeile[], f: ListenFilter): WissenDokumentZeile[] => liste.filter((d) => passtZumFilter(d, f));

/** Wie viele Dokumente haette der Filter mit dem Wert `wert` (bei sonst gleichen Filtern)? Fuer die Zahlen in den Auswahlfeldern. */
export function zaehleMit<K extends Exclude<keyof ListenFilter, "suche">>(liste: readonly WissenDokumentZeile[], f: ListenFilter, feld: K, wert: ListenFilter[K]): number {
  const probe = { ...f, [feld]: wert } as ListenFilter;
  return liste.filter((d) => passtZumFilter(d, probe)).length;
}
