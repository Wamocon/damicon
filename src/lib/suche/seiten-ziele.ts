import type { Role } from "@/lib/rbac";
import {
  moduleByPath,
  moduleHref,
  sichtbareModule,
  zones,
  type ZoneKey,
} from "@/lib/modules";
import { handbuchHref } from "@/lib/handbuch";
import { darfCeoBerichtLesen } from "@/lib/pruefung/rollen";
import {
  auszug,
  bewerte,
  GEWICHT,
  indexFeld,
  laengstesWort,
  TEILWORT_AB,
  type Anfrage,
  type IndexFeld,
} from "./kern";

// Was die Suche in Stufe 1 findet: die Uebersicht, die Bereiche, die Module
// und die Seiten daneben (Sicherheit, Compliance-Bericht, Handbuch).
// Datensaetze wie Reihenbloecke oder Chargen kommen erst mit Stufe 2
// (WMCNL-1467).
//
// Die Rechtepruefung ist dieselbe wie in Seitenleiste und Menue-Blatt:
// sichtbareModule() aus lib/modules.ts. Gefragt wird mit der Ansichtsrolle,
// damit "Ansicht als" auch hier gilt. Die Modulseite prueft ohnehin selbst
// noch einmal serverseitig - die Suche bietet nur nichts an, was die
// Navigation nicht auch anbietet.
//
// Gesucht wird in zwei Schichten. Zuerst die Namen: Titel, Kurzname,
// Bereich. Danach, unter "Erwaehnt in", die Texte, die auf den Modulseiten
// stehen - die Beschreibung im Kopf der Modulseite und die Zusammenfassung
// auf der Bereichsseite. Nur was dort zu lesen ist: der Text "todo" (was noch
// offen ist) liest nur die KI und das Handbuch, ein Treffer darin fuehrte auf
// eine Seite, auf der das Wort gar nicht steht. Aus demselben Grund fehlen
// die Beschreibungen der Bereiche: sie zaehlen Module auf, die nicht jede
// Rolle sieht.

export type ZielSchluessel =
  | "uebersicht"
  | `bereich:${ZoneKey}`
  | `modul:${string}`
  | "seite:sicherheit"
  | "seite:compliance"
  | "seite:handbuch";

export interface SeitenZiel {
  schluessel: ZielSchluessel;
  titel: string;
  untertitel: string | null;
  href: string;
  /** Fuehrt aus der Anwendung heraus in einen neuen Tab - das Handbuch. */
  extern: boolean;
  /** Name aus der Symbolablage (components/icon.tsx). */
  symbol: string;
  felder: readonly IndexFeld[];
  /** Was auf der Seite zu lesen ist, fuer "Erwaehnt in". Nur bei Modulen. */
  texte?: readonly SeitenText[];
}

/** Ein Text der Seite: im Original fuer den Auszug, normalisiert fuer die Suche. */
export interface SeitenText {
  roh: string;
  feld: IndexFeld;
}

/** Ein Ziel, in dessen Seitentext die Anfrage vorkommt, samt der Stelle. */
export interface Erwaehnung {
  ziel: SeitenZiel;
  auszug: string;
}

/** Text zu einem vollen Schluesselpfad, etwa "modules.lohn.title". */
export type Uebersetze = (schluessel: string) => string;

export const HOECHSTENS_TREFFER = 8;
export const HOECHSTENS_ERWAEHNUNGEN = 5;

interface Umgebung {
  demoModus: boolean;
  locale: string;
}

/**
 * Alle Ziele, die diese Rolle sehen darf, in der Reihenfolge der
 * Seitenleiste. Die Reihenfolge entscheidet bei gleichem Wert - so steht
 * vorn, was man vom Menue her kennt.
 */
export function baueSeitenZiele(
  rolle: Role | null | undefined,
  umgebung: Umgebung,
  t: Uebersetze,
): SeitenZiel[] {
  const uebersicht = t("nav.overview");
  return [
    {
      schluessel: "uebersicht",
      titel: uebersicht,
      untertitel: null,
      href: "/dashboard",
      extern: false,
      symbol: "house",
      felder: [indexFeld(uebersicht, GEWICHT.name)],
    },
    ...bereichsZiele(rolle, t),
    ...nebenSeiten(rolle, umgebung, t),
  ];
}

// Je Bereich erst der Bereich selbst, dann seine Module - wie in der
// Seitenleiste. Sucht jemand "Feld", steht der Bereich vor den Modulen, die
// nur ueber ihren Bereichsnamen passen, und die folgen ihm: so sieht man,
// was darin liegt.
function bereichsZiele(rolle: Role | null | undefined, t: Uebersetze): SeitenZiel[] {
  const ziele: SeitenZiel[] = [];
  for (const zone of zones) {
    const sichtbar = sichtbareModule(rolle, zone.key);
    // Ein Bereich ohne ein einziges sichtbares Modul fehlt auch in der
    // Navigation (useNavZiele) - er fuehrte auf eine leere Seite.
    if (sichtbar.length === 0) continue;

    const bereich = t(`zones.${zone.key}.name`);
    ziele.push({
      schluessel: `bereich:${zone.key}`,
      titel: bereich,
      // Die Tagline zaehlt die Module des Bereichs auf ("Finanzen, Personal,
      // Compliance"). Sie steht nur darunter und wird nicht durchsucht: fuer
      // den Pfluecker faende "Finanzen" sonst den Bereich Buero, in dem er
      // gar keine Finanzen sieht.
      untertitel: t(`zones.${zone.key}.tagline`),
      href: `/dashboard/${zone.key}`,
      extern: false,
      symbol: zone.icon,
      felder: [indexFeld(bereich, GEWICHT.name)],
    });

    for (const modul of sichtbar) {
      // Angezeigt wird der Kurzname wie in Seitenleiste und Menue-Blatt.
      // Gefunden wird ein Modul auch ueber seinen langen Titel, denn den
      // liest man als Ueberschrift auf der Modulseite.
      const kurz = t(`modules.${modul.key}.navTitle`);
      const titel = t(`modules.${modul.key}.title`);
      ziele.push({
        schluessel: `modul:${modul.key}`,
        titel: kurz,
        untertitel: bereich,
        href: moduleHref(modul),
        extern: false,
        symbol: modul.icon,
        felder: [
          indexFeld(kurz, GEWICHT.name),
          indexFeld(titel, GEWICHT.name),
          indexFeld(bereich, GEWICHT.beiwerk),
        ],
        texte: [
          t(`modules.${modul.key}.description`),
          t(`modules.${modul.key}.summary`),
        ].map((roh) => ({ roh, feld: indexFeld(roh, GEWICHT.beiwerk) })),
      });
    }
  }
  return ziele;
}

// Die Seiten neben den Bereichen, die im Dashboard liegen. Eine Tabelle fuer
// beide Richtungen: nebenSeiten() baut daraus die Ziele,
// zielSchluesselFuerPfad() erkennt daran die offene Seite.
//
// Ohne Supabase haben beide nichts zu zeigen: Sicherheit braucht eine
// Sitzung, und der Compliance-Bericht antwortet im Demo-Betrieb mit 404
// (compliance/page.tsx).
const DASHBOARD_SEITEN = [
  {
    schluessel: "seite:sicherheit",
    segment: "sicherheit",
    text: "auth.security",
    symbol: "shield-check",
    fuer: () => true,
  },
  {
    schluessel: "seite:compliance",
    segment: "compliance",
    text: "complianceBericht.titel",
    symbol: "scale",
    fuer: darfCeoBerichtLesen,
  },
] as const satisfies readonly {
  schluessel: ZielSchluessel;
  segment: string;
  text: string;
  symbol: string;
  fuer: (rolle: Role | null | undefined) => boolean;
}[];

function nebenSeiten(
  rolle: Role | null | undefined,
  { demoModus, locale }: Umgebung,
  t: Uebersetze,
): SeitenZiel[] {
  const ziele: SeitenZiel[] = demoModus
    ? []
    : DASHBOARD_SEITEN.filter((seite) => seite.fuer(rolle)).map((seite) => {
        const titel = t(seite.text);
        return {
          schluessel: seite.schluessel,
          titel,
          untertitel: null,
          href: `/dashboard/${seite.segment}`,
          extern: false,
          symbol: seite.symbol,
          felder: [indexFeld(titel, GEWICHT.name)],
        };
      });

  // Das Handbuch oeffnet in einem neuen Tab, an der Client-Navigation vorbei
  // (lib/handbuch.ts). Name und Hinweis wie in der Navigation.
  const handbuch = t("nav.handbook");
  ziele.push({
    schluessel: "seite:handbuch",
    titel: handbuch,
    untertitel: t("nav.handbookHint"),
    href: handbuchHref(locale),
    extern: true,
    symbol: "book-open",
    felder: [indexFeld(handbuch, GEWICHT.name)],
  });
  return ziele;
}

// Bewerten, nach Wert und bei Gleichstand nach der Reihenfolge der Ziele
// sortieren, die besten behalten - fuer Namen und Texte gleich.
function beste<T>(bewertet: readonly { eintrag: T; reihe: number; wert: number }[], max: number): T[] {
  return [...bewertet]
    .sort((a, b) => b.wert - a.wert || a.reihe - b.reihe)
    .slice(0, max)
    .map((b) => b.eintrag);
}

/** Die besten Treffer ueber den Namen. */
export function sucheSeiten(ziele: readonly SeitenZiel[], anfrage: Anfrage): SeitenZiel[] {
  const bewertet: { eintrag: SeitenZiel; reihe: number; wert: number }[] = [];
  ziele.forEach((ziel, reihe) => {
    const wert = bewerte(ziel.felder, anfrage);
    if (wert !== null) bewertet.push({ eintrag: ziel, reihe, wert });
  });
  return beste(bewertet, HOECHSTENS_TREFFER);
}

/**
 * Ziele, in deren Seitentext die Anfrage vorkommt - fuer die Gruppe
 * "Erwaehnt in" unter den Namenstreffern. Was schon ueber den Namen gefunden
 * wurde, steht in `ohne` und kommt nicht doppelt. Erst wenn ein Wort der
 * Anfrage drei Zeichen hat: kuerzer passt in fast jeden Absatz.
 */
export function sucheInTexten(
  ziele: readonly SeitenZiel[],
  anfrage: Anfrage,
  ohne: ReadonlySet<ZielSchluessel>,
): Erwaehnung[] {
  if (laengstesWort(anfrage).length < TEILWORT_AB) return [];

  const bewertet: { eintrag: Erwaehnung; reihe: number; wert: number }[] = [];
  ziele.forEach((ziel, reihe) => {
    if (!ziel.texte?.length || ohne.has(ziel.schluessel)) return;
    const wert = bewerte(
      ziel.texte.map((text) => text.feld),
      anfrage,
    );
    if (wert === null) return;
    // Die erste Stelle, an der das laengste Wort der Anfrage steht, als Beleg
    // unter dem Namen. Die Bewertung verlangt jedes Wort in einem der Texte,
    // eine Stelle gibt es also immer; ohne sie bliebe die Zeile lieber weg.
    const stelle = ziel.texte
      .map((text) => auszug(text.roh, anfrage))
      .find((gefunden) => gefunden !== null);
    if (stelle) bewertet.push({ eintrag: { ziel, auszug: stelle }, reihe, wert });
  });
  return beste(bewertet, HOECHSTENS_ERWAEHNUNGEN);
}

/**
 * Das Ziel hinter einem Pfad ohne Sprachpraefix, wie ihn usePathname() aus
 * @/i18n/navigation liefert - oder null fuer Seiten, die kein Ziel sind.
 */
export function zielSchluesselFuerPfad(pfad: string): ZielSchluessel | null {
  const [wurzel, zweites, drittes, ...rest] = pfad.split("/").filter(Boolean);
  if (wurzel !== "dashboard" || rest.length > 0) return null;
  if (!zweites) return "uebersicht";

  const seite = DASHBOARD_SEITEN.find((s) => s.segment === zweites);
  if (seite) return drittes ? null : seite.schluessel;

  const zone = zones.find((z) => z.key === zweites);
  if (!zone) return null;
  if (!drittes) return `bereich:${zone.key}`;
  const modul = moduleByPath(zone.key, drittes);
  return modul ? `modul:${modul.key}` : null;
}
