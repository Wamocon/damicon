import type { Role } from "@/lib/rbac";
import {
  moduleByPath,
  moduleHref,
  sichtbareModule,
  zones,
  type ZoneKey,
} from "@/lib/modules";
import { darfCeoBerichtLesen } from "@/lib/pruefung/rollen";
import {
  auszug,
  bewerte,
  indexFeld,
  TEILWORT_AB,
  zerlegeAnfrage,
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

// Gewichte innerhalb derselben Stufe: der Name vor dem Beiwerk. Sucht jemand
// "Feld", steht der Bereich Feld vor den Modulen, die nur ueber ihren
// Bereichsnamen passen - und die folgen ihm, so sieht man, was darin liegt.
const NAME = 3;
const BEIWERK = 1;

/**
 * Alle Ziele, die diese Rolle sehen darf, in der Reihenfolge der
 * Seitenleiste. Die Reihenfolge entscheidet bei gleichem Wert - so steht
 * vorn, was man vom Menue her kennt.
 */
export function baueSeitenZiele(
  rolle: Role | null | undefined,
  { demoModus, locale }: { demoModus: boolean; locale: string },
  t: Uebersetze,
): SeitenZiel[] {
  const uebersicht = t("nav.overview");
  const ziele: SeitenZiel[] = [
    {
      schluessel: "uebersicht",
      titel: uebersicht,
      untertitel: null,
      href: "/dashboard",
      extern: false,
      symbol: "house",
      felder: [indexFeld(uebersicht, NAME)],
    },
  ];

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
      felder: [indexFeld(bereich, NAME)],
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
          indexFeld(kurz, NAME),
          indexFeld(titel, NAME),
          indexFeld(bereich, BEIWERK),
        ],
        texte: [
          t(`modules.${modul.key}.description`),
          t(`modules.${modul.key}.summary`),
        ].map((roh) => ({ roh, feld: indexFeld(roh, BEIWERK) })),
      });
    }
  }

  // Ohne Supabase haben beide Seiten nichts zu zeigen: Sicherheit braucht
  // eine Sitzung, und der Compliance-Bericht antwortet im Demo-Betrieb mit
  // 404 (compliance/page.tsx).
  if (!demoModus) {
    const sicherheit = t("auth.security");
    ziele.push({
      schluessel: "seite:sicherheit",
      titel: sicherheit,
      untertitel: null,
      href: "/dashboard/sicherheit",
      extern: false,
      symbol: "shield-check",
      felder: [indexFeld(sicherheit, NAME)],
    });

    if (darfCeoBerichtLesen(rolle)) {
      const bericht = t("complianceBericht.titel");
      ziele.push({
        schluessel: "seite:compliance",
        titel: bericht,
        untertitel: null,
        href: "/dashboard/compliance",
        extern: false,
        symbol: "scale",
        felder: [indexFeld(bericht, NAME)],
      });
    }
  }

  // Das Handbuch ist ein Route Handler mit fertiger HTML-Seite und oeffnet in
  // einem neuen Tab (handbuch-link.tsx). Deshalb die volle Adresse mit
  // Sprachpraefix - an der Client-Navigation vorbei.
  const handbuch = t("nav.handbook");
  ziele.push({
    schluessel: "seite:handbuch",
    titel: handbuch,
    untertitel: t("nav.handbookHint"),
    href: `/${locale}/dashboard/handbuch`,
    extern: true,
    symbol: "book-open",
    felder: [indexFeld(handbuch, NAME)],
  });

  return ziele;
}

/** Die besten Treffer zu einer Eingabe, leer bei leerer Eingabe. */
export function sucheSeiten(
  ziele: readonly SeitenZiel[],
  roh: string,
  max = HOECHSTENS_TREFFER,
): SeitenZiel[] {
  const anfrage = zerlegeAnfrage(roh);
  if (!anfrage) return [];

  const bewertet: { ziel: SeitenZiel; reihe: number; wert: number }[] = [];
  ziele.forEach((ziel, reihe) => {
    const wert = bewerte(ziel.felder, anfrage);
    if (wert !== null) bewertet.push({ ziel, reihe, wert });
  });

  return bewertet
    .sort((a, b) => b.wert - a.wert || a.reihe - b.reihe)
    .slice(0, max)
    .map((eintrag) => eintrag.ziel);
}

/**
 * Ziele, in deren Seitentext die Anfrage vorkommt - fuer die Gruppe
 * "Erwaehnt in" unter den Namenstreffern. Was schon ueber den Namen gefunden
 * wurde, steht in `ohne` und kommt nicht doppelt. Erst ab drei Zeichen:
 * kuerzer passt in fast jeden Absatz.
 */
export function sucheInTexten(
  ziele: readonly SeitenZiel[],
  roh: string,
  ohne: ReadonlySet<ZielSchluessel>,
  max = HOECHSTENS_ERWAEHNUNGEN,
): Erwaehnung[] {
  const anfrage = zerlegeAnfrage(roh);
  if (!anfrage || anfrage.normal.length < TEILWORT_AB) return [];

  const bewertet: { erwaehnung: Erwaehnung; reihe: number; wert: number }[] = [];
  ziele.forEach((ziel, reihe) => {
    if (!ziel.texte?.length || ohne.has(ziel.schluessel)) return;
    const wert = bewerte(
      ziel.texte.map((text) => text.feld),
      anfrage,
    );
    if (wert === null) return;
    // Die erste Stelle, an der ein Wort der Anfrage steht, als Beleg unter dem
    // Namen. Auszug und Bewertung normalisieren Wort fuer Wort gleich, eine
    // Stelle gibt es also immer; ohne sie bliebe die Zeile lieber weg.
    const stelle = ziel.texte
      .map((text) => auszug(text.roh, anfrage))
      .find((gefunden) => gefunden !== null);
    if (stelle) bewertet.push({ erwaehnung: { ziel, auszug: stelle }, reihe, wert });
  });

  return bewertet
    .sort((a, b) => b.wert - a.wert || a.reihe - b.reihe)
    .slice(0, max)
    .map((eintrag) => eintrag.erwaehnung);
}

/**
 * Das Ziel hinter einem Pfad ohne Sprachpraefix, wie ihn usePathname() aus
 * @/i18n/navigation liefert - oder null fuer Seiten, die kein Ziel sind.
 */
export function zielSchluesselFuerPfad(pfad: string): ZielSchluessel | null {
  const [wurzel, zweites, drittes, ...rest] = pfad.split("/").filter(Boolean);
  if (wurzel !== "dashboard" || rest.length > 0) return null;
  if (!zweites) return "uebersicht";
  if (!drittes && zweites === "sicherheit") return "seite:sicherheit";
  if (!drittes && zweites === "compliance") return "seite:compliance";

  const zone = zones.find((z) => z.key === zweites);
  if (!zone) return null;
  if (!drittes) return `bereich:${zone.key}`;
  const modul = moduleByPath(zone.key, drittes);
  return modul ? `modul:${modul.key}` : null;
}
