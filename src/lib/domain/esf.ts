import { istGueltigerTag } from "@/lib/listen/zeitraum";
import { preisAmStichtag, type PreislisteEintrag } from "@/lib/domain/rechnungshistorie";

// Belegregister der elektronischen Rechnung (ЭСФ), Stufe 1 (WMCNL-1440). Reine Rechen- und
// Pruefregeln ohne Server-Import. Das System stellt keine ЭСФ aus: es fuehrt das Register (welche
// Lieferung hat welchen Beleg in welchem Zustand) und bereitet die Angaben vor, die das Buero im
// staatlichen Portal braucht. Erfundene Felder eines amtlichen Formats gibt es hier nicht.

export const ESF_STATUS = ["entwurf", "ausgestellt", "bestaetigt", "abgelehnt", "papier"] as const;
export type EsfStatus = (typeof ESF_STATUS)[number];

export const ESF_NUMMER_MAX_ZEICHEN = 100;
export const ESF_BEMERKUNG_MIN_ZEICHEN = 3;
export const ESF_BEMERKUNG_MAX_ZEICHEN = 500;

export function istEsfStatus(wert: string): wert is EsfStatus {
  return (ESF_STATUS as readonly string[]).includes(wert);
}

// Erlaubte Wechsel. Dieselbe Tabelle steht als Trigger in der Datenbank (esf_beleg_pruefen,
// Migration 20261207070000); der Test vergleicht beide.
export const ESF_UEBERGAENGE: Record<EsfStatus, readonly EsfStatus[]> = {
  entwurf: ["ausgestellt", "papier"],
  ausgestellt: ["bestaetigt", "abgelehnt"],
  bestaetigt: [],
  abgelehnt: ["entwurf", "papier"],
  papier: [],
};

export function wechselErlaubt(von: EsfStatus, nach: EsfStatus): boolean {
  return ESF_UEBERGAENGE[von].includes(nach);
}

/** Farbton des Status im Register. */
export const esfTon = {
  entwurf: "neutral",
  ausgestellt: "info",
  bestaetigt: "success",
  abgelehnt: "danger",
  papier: "warning",
} as const satisfies Record<EsfStatus, "neutral" | "info" | "success" | "danger" | "warning">;

/** Endzustaende lassen sich nicht mehr aendern. */
export function istAbgeschlossen(status: EsfStatus): boolean {
  return ESF_UEBERGAENGE[status].length === 0;
}

// --- Entwurf ---------------------------------------------------------------------------------------------------

export interface MwstSatzEintrag {
  gueltigAb: string;
  /** Ausschliessend: an diesem Tag gilt schon der Nachfolger (Trigger mwst_satz_vorherigen_schliessen). */
  gueltigBis: string | null;
  prozent: number;
}

export type EsfLuecke = "preis" | "sorte" | "identifikationsnummer" | "mwstSatz";

export interface EsfEntwurf {
  version: 1;
  /** Liefertag in Almaty: an diesem Tag gelten Preisliste und MwSt-Satz. */
  stichtag: string;
  kunde: { name: string; identifikationsnummer: string | null; rechtsform: string | null };
  ware: {
    sorte: string | null;
    chargeCode: string | null;
    mengeKg: number;
    preisTengeKg: number | null;
    betragTenge: number | null;
  };
  mwst: {
    registriert: boolean;
    prozent: number | null;
    betragTenge: number | null;
    gesamtTenge: number | null;
    /** Die Preisliste wird als Nettopreis gelesen. Ob das stimmt, klaert die Buchhaltung. */
    annahme: "netto";
  };
  /** Was dem Entwurf fehlt, damit er sich ohne Nachfragen ins Portal uebertragen laesst. */
  luecken: EsfLuecke[];
}

export interface EsfEntwurfEingabe {
  stichtag: string;
  kunde: { name: string; identifikationsnummer: string | null; rechtsform: string | null; kundengruppe: string | null };
  sorteId: string | null;
  sorteName: string | null;
  chargeCode: string | null;
  mengeKg: number;
  preislisten: PreislisteEintrag[];
  mwstSaetze: MwstSatzEintrag[];
  mwstRegistriert: boolean;
  mwstRegistriertAm: string | null;
}

const runde = (wert: number) => Math.round(wert * 100) / 100;

export function mwstSatzAm(saetze: readonly MwstSatzEintrag[], tag: string): number | null {
  const passend = saetze
    .filter((s) => s.gueltigAb <= tag && (s.gueltigBis === null || tag < s.gueltigBis))
    .sort((a, b) => b.gueltigAb.localeCompare(a.gueltigAb));
  return passend.length > 0 ? passend[0].prozent : null;
}

/** Ob der Betrieb am Liefertag MwSt-registriert war. Ohne Datum der Registrierung gilt der heutige Stand. */
export function warRegistriertAm(registriert: boolean, registriertAm: string | null, tag: string): boolean {
  return registriert && (registriertAm === null || registriertAm <= tag);
}

export function baueEsfEntwurf(e: EsfEntwurfEingabe): EsfEntwurf {
  const preis = e.sorteId ? preisAmStichtag(e.preislisten, e.sorteId, e.stichtag, e.kunde.kundengruppe) : null;
  const betrag = preis === null ? null : runde(preis * e.mengeKg);
  const registriert = warRegistriertAm(e.mwstRegistriert, e.mwstRegistriertAm, e.stichtag);
  const prozent = registriert ? mwstSatzAm(e.mwstSaetze, e.stichtag) : null;
  const mwstBetrag = betrag !== null && prozent !== null ? runde((betrag * prozent) / 100) : null;
  const gesamt = betrag === null ? null : registriert ? (mwstBetrag === null ? null : runde(betrag + mwstBetrag)) : betrag;

  const luecken: EsfLuecke[] = [];
  if (!e.sorteName) luecken.push("sorte");
  if (preis === null) luecken.push("preis");
  if (!e.kunde.identifikationsnummer) luecken.push("identifikationsnummer");
  if (registriert && prozent === null) luecken.push("mwstSatz");

  return {
    version: 1,
    stichtag: e.stichtag,
    kunde: { name: e.kunde.name, identifikationsnummer: e.kunde.identifikationsnummer, rechtsform: e.kunde.rechtsform },
    ware: { sorte: e.sorteName, chargeCode: e.chargeCode, mengeKg: e.mengeKg, preisTengeKg: preis, betragTenge: betrag },
    mwst: { registriert, prozent, betragTenge: mwstBetrag, gesamtTenge: gesamt, annahme: "netto" },
    luecken,
  };
}

const LUECKEN: readonly EsfLuecke[] = ["preis", "sorte", "identifikationsnummer", "mwstSatz"];

/** Liest ein gespeichertes Standbild defensiv: die Spalte ist jsonb, ein Fremdwert darf die Seite nicht zerlegen. */
export function liesEntwurf(wert: unknown): EsfEntwurf | null {
  if (typeof wert !== "object" || wert === null) return null;
  const e = wert as Record<string, unknown>;
  const kunde = e.kunde as Record<string, unknown> | undefined;
  const ware = e.ware as Record<string, unknown> | undefined;
  const mwst = e.mwst as Record<string, unknown> | undefined;
  if (e.version !== 1 || typeof e.stichtag !== "string" || !kunde || !ware || !mwst) return null;
  const zahl = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const text = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);
  if (typeof kunde.name !== "string" || zahl(ware.mengeKg) === null || typeof mwst.registriert !== "boolean") return null;
  return {
    version: 1,
    stichtag: e.stichtag,
    kunde: { name: kunde.name, identifikationsnummer: text(kunde.identifikationsnummer), rechtsform: text(kunde.rechtsform) },
    ware: {
      sorte: text(ware.sorte),
      chargeCode: text(ware.chargeCode),
      mengeKg: zahl(ware.mengeKg) as number,
      preisTengeKg: zahl(ware.preisTengeKg),
      betragTenge: zahl(ware.betragTenge),
    },
    mwst: { registriert: mwst.registriert, prozent: zahl(mwst.prozent), betragTenge: zahl(mwst.betragTenge), gesamtTenge: zahl(mwst.gesamtTenge), annahme: "netto" },
    luecken: Array.isArray(e.luecken) ? e.luecken.filter((l): l is EsfLuecke => (LUECKEN as readonly unknown[]).includes(l)) : [],
  };
}

// --- Angaben beim Statuswechsel ---------------------------------------------------------------------------------------

export type EsfAngabenFehler = "esfNummer" | "esfDatum" | "esfBemerkung";

export interface EsfAngaben {
  nummer: string;
  ausgestelltAm: string;
  bestaetigtAm: string;
  bemerkung: string;
  /** Ausstelldatum, das der Beleg schon hat (beim Wechsel nach "bestaetigt"). */
  bisherAusgestelltAm: string | null;
}

const tagOk = (tag: string, heute: string) => istGueltigerTag(tag) && tag <= heute;

/** Prueft die Angaben, die ein Wechsel in den Zustand `nach` braucht. null heisst: in Ordnung. */
export function esfAngabenFehler(nach: EsfStatus, a: EsfAngaben, heute: string): EsfAngabenFehler | null {
  const nummer = a.nummer.trim();
  const bemerkung = a.bemerkung.trim();
  switch (nach) {
    case "ausgestellt":
      if (nummer.length < 1 || nummer.length > ESF_NUMMER_MAX_ZEICHEN) return "esfNummer";
      if (!tagOk(a.ausgestelltAm, heute)) return "esfDatum";
      return null;
    case "bestaetigt":
      if (!tagOk(a.bestaetigtAm, heute)) return "esfDatum";
      if (a.bisherAusgestelltAm !== null && a.bestaetigtAm < a.bisherAusgestelltAm) return "esfDatum";
      return null;
    case "abgelehnt":
    case "papier":
      if (bemerkung.length < ESF_BEMERKUNG_MIN_ZEICHEN || bemerkung.length > ESF_BEMERKUNG_MAX_ZEICHEN) return "esfBemerkung";
      return null;
    case "entwurf":
      return null;
  }
}

// --- Frist ----------------------------------------------------------------------------------------------------------

/**
 * Stand der Frist einer zugestellten Lieferung ohne ausgestellten Beleg. Die Frist (Kalendertage ab Liefertag) kommt aus der Einstellung
 * esf.frist_tage (Steuerkodex 214-VIII, Art. 493 Abs. 1: 15 Kalendertage). Der letzte Tag der Frist zaehlt noch; das Fristende wird nicht auf einen
 * Arbeitstag verschoben (vorsichtige Lesart). Ohne gesetzte Frist (null) gibt es keine Aussage.
 */
export type EsfFristStand = { art: "keine" } | { art: "laeuft"; verbleibend: number } | { art: "ueberfaellig"; ueberschritten: number };

/** Ab so vielen verbleibenden Tagen warnt die Liste. */
export const ESF_FRIST_WARNUNG_TAGE = 3;

export function esfFristStand(tageSeitLieferung: number, fristTage: number | null): EsfFristStand {
  if (fristTage === null || !Number.isFinite(fristTage)) return { art: "keine" };
  if (tageSeitLieferung > fristTage) return { art: "ueberfaellig", ueberschritten: tageSeitLieferung - fristTage };
  return { art: "laeuft", verbleibend: fristTage - tageSeitLieferung };
}

// --- Zaehlung -------------------------------------------------------------------------------------------------------

export interface EsfZaehlung {
  offen: number;
  entwurf: number;
  ausgestellt: number;
  bestaetigt: number;
  abgelehnt: number;
  papier: number;
}

/** Zaehlung fuer die Kopfzeile: `offen` sind die zugestellten Lieferungen ohne ausgestellten Beleg. */
export function zaehleBelege(offeneLieferungen: number, status: readonly EsfStatus[]): EsfZaehlung {
  const z: EsfZaehlung = { offen: offeneLieferungen, entwurf: 0, ausgestellt: 0, bestaetigt: 0, abgelehnt: 0, papier: 0 };
  for (const s of status) z[s] += 1;
  return z;
}
