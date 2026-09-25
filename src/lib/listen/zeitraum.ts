import { betriebsZeitzone, tagInZone } from "@/lib/domain/tageszeit";

export { tagInZone };

// Zeitraumfilter fuer Listen: feste Stufen plus ein eigener Zeitraum mit
// Von und Bis (Entscheidung vom 24.09.2026, WMCNL-2488).
//
// Gerechnet wird in Betriebszeit Almaty, nicht in der Zeitzone des Servers
// oder des Browsers. "Heute" ist der Tag auf dem Feld: ein Vercel-Knoten in
// Europa laege sonst fuenf Stunden daneben, und eine Aufgabe fuer den fruehen
// Morgen stuende noch unter "gestern". Dieselbe Ueberlegung wie in
// domain/tageszeit.ts.
//
// Die Grenzen sind halboffen, [ab, vor): der erste Moment des Zeitraums zaehlt
// mit, der erste Moment danach nicht. So schliessen zwei aufeinanderfolgende
// Zeitraeume lueckenlos und ohne Ueberschneidung aneinander.

export const zeitraumStufen = ["alle", "heute", "woche", "monat", "saison", "eigen"] as const;
export type ZeitraumStufe = (typeof zeitraumStufen)[number];

export interface ZeitraumGrenzen {
  /** Erster Moment im Zeitraum, als UTC-ISO-String. */
  ab?: string;
  /** Erster Moment nach dem Zeitraum, als UTC-ISO-String. */
  vor?: string;
}

const DATUM = /^(\d{4})-(\d{2})-(\d{2})$/;
const WANDZEIT = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/;

/** Abstand der Zeitzone zu UTC in Minuten, im gegebenen Moment. Almaty: +300. */
function versatzMinuten(zeitpunkt: number, zeitzone: string): number {
  const teile = new Intl.DateTimeFormat("en-US", {
    timeZone: zeitzone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(zeitpunkt));
  const wert = (typ: Intl.DateTimeFormatPartTypes) =>
    Number(teile.find((teil) => teil.type === typ)?.value ?? 0);
  const alsUtc = Date.UTC(
    wert("year"),
    wert("month") - 1,
    wert("day"),
    wert("hour"),
    wert("minute"),
    wert("second"),
  );
  return Math.round((alsUtc - zeitpunkt) / 60_000);
}

/**
 * Eine Wandzeit ("2026-09-24" oder "2026-09-24T14:30") in der Zeitzone als
 * UTC-Zeitpunkt. null bei ungueltiger Eingabe, auch bei Daten, die es nicht
 * gibt (31. Februar).
 *
 * Der Versatz wird ueber Intl bestimmt und nicht fest mit +5 gerechnet:
 * Kasachstan ist erst am 1. Maerz 2024 von UTC+6 auf UTC+5 gewechselt, und die
 * Testdaten reichen bis Juli 2025 zurueck, aeltere echte Daten womoeglich
 * weiter.
 */
export function wandzeitZuUtc(wandzeit: string, zeitzone: string = betriebsZeitzone): Date | null {
  const treffer = WANDZEIT.exec(wandzeit.trim());
  if (!treffer) return null;
  const [jahr, monat, tag, stunde, minute, sekunde] = treffer
    .slice(1)
    .map((teil) => Number(teil ?? 0));
  if (stunde > 23 || minute > 59 || sekunde > 59) return null;

  const naiv = Date.UTC(jahr, monat - 1, tag, stunde, minute, sekunde);
  const pruefung = new Date(naiv);
  if (
    pruefung.getUTCFullYear() !== jahr ||
    pruefung.getUTCMonth() !== monat - 1 ||
    pruefung.getUTCDate() !== tag
  ) {
    return null;
  }

  // Zwei Schritte: der Versatz haengt vom Moment ab, und den kennen wir erst
  // nach dem ersten Schritt. Beim Zeitzonenwechsel 2024 liegt genau hier der
  // Unterschied zwischen +6 und +5.
  const erster = naiv - versatzMinuten(naiv, zeitzone) * 60_000;
  return new Date(naiv - versatzMinuten(erster, zeitzone) * 60_000);
}

/**
 * Ein Kalendertag "JJJJ-MM-TT", den es gibt. Das Format allein laesst
 * "2026-02-31" durch; ein solcher Tag faellt aus der Adresse, statt den
 * eigenen Zeitraum still um seine Grenze zu bringen.
 */
export function istGueltigerTag(tag: string): boolean {
  const treffer = DATUM.exec(tag);
  if (!treffer) return false;
  const [jahr, monat, t] = treffer.slice(1).map(Number);
  const datum = new Date(Date.UTC(jahr, monat - 1, t));
  return (
    datum.getUTCFullYear() === jahr && datum.getUTCMonth() === monat - 1 && datum.getUTCDate() === t
  );
}

/** Kalenderrechnung auf "JJJJ-MM-TT", unabhaengig von jeder Zeitzone. */
function tagePlus(tag: string, tage: number): string {
  const [jahr, monat, t] = tag.split("-").map(Number);
  return new Date(Date.UTC(jahr, monat - 1, t + tage)).toISOString().slice(0, 10);
}

function tagesbeginn(tag: string, zeitzone: string): string | undefined {
  return wandzeitZuUtc(tag, zeitzone)?.toISOString();
}

/**
 * Grenzen eines Zeitraums. "woche" beginnt am Montag (ISO 8601, so zaehlt man
 * in Kasachstan wie in Deutschland), "saison" ist das Kalenderjahr: die Ernte
 * laeuft von Mai bis Oktober, ein Jahr umfasst also genau eine Saison.
 */
export function zeitraumGrenzen(
  stufe: ZeitraumStufe,
  eigen: { von?: string; bis?: string } = {},
  jetzt: Date = new Date(),
  zeitzone: string = betriebsZeitzone,
): ZeitraumGrenzen {
  const heute = tagInZone(jetzt, zeitzone);
  const [jahr, monat] = heute.split("-").map(Number);

  switch (stufe) {
    case "alle":
      return {};
    case "heute":
      return { ab: tagesbeginn(heute, zeitzone), vor: tagesbeginn(tagePlus(heute, 1), zeitzone) };
    case "woche": {
      const wochentag = new Date(`${heute}T00:00:00Z`).getUTCDay();
      const montag = tagePlus(heute, -((wochentag + 6) % 7));
      return { ab: tagesbeginn(montag, zeitzone), vor: tagesbeginn(tagePlus(montag, 7), zeitzone) };
    }
    case "monat": {
      const erster = `${jahr}-${String(monat).padStart(2, "0")}-01`;
      const naechster =
        monat === 12 ? `${jahr + 1}-01-01` : `${jahr}-${String(monat + 1).padStart(2, "0")}-01`;
      return { ab: tagesbeginn(erster, zeitzone), vor: tagesbeginn(naechster, zeitzone) };
    }
    case "saison":
      return {
        ab: tagesbeginn(`${jahr}-01-01`, zeitzone),
        vor: tagesbeginn(`${jahr + 1}-01-01`, zeitzone),
      };
    case "eigen": {
      let von = eigen.von && istGueltigerTag(eigen.von) ? eigen.von : undefined;
      let bis = eigen.bis && istGueltigerTag(eigen.bis) ? eigen.bis : undefined;
      // Vertauscht eingegeben: gemeint ist trotzdem der Zeitraum dazwischen.
      if (von && bis && von > bis) [von, bis] = [bis, von];
      return {
        ab: von ? tagesbeginn(von, zeitzone) : undefined,
        // Bis einschliesslich: der ganze Bis-Tag gehoert dazu.
        vor: bis ? tagesbeginn(tagePlus(bis, 1), zeitzone) : undefined,
      };
    }
  }
}
