// Tageszeit fuer die Begruessung. Serverseitig bestimmt und als Prop
// durchgereicht: rechnete der Client sie selbst, stuende beim ersten Rendern
// eine andere Begruessung im HTML als nach der Hydration.
//
// Die Zeitzone steht hier fest, weil der Betrieb im Umland von Almaty liegt.
// Ohne Angabe zaehlte die Zeitzone des Servers - auf einem Vercel-Knoten
// in Europa waere das drei bis fuenf Stunden daneben, und "Guten Morgen"
// stuende am fruehen Nachmittag. Seit dem 15.10.2026 setzt auch next-intl
// diese Zeitzone (src/i18n/request.ts), damit Uhrzeiten auf dem Bildschirm
// dieselben sind wie in den Dokumenten.
export const betriebsZeitzone = "Asia/Almaty";

/** Kalendertag in der Betriebszeitzone als "JJJJ-MM-TT" - der Tag auf dem Feld. */
export function tagInZone(zeitpunkt: Date, zeitzone: string = betriebsZeitzone): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zeitzone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(zeitpunkt);
}

/** Versatz der Zone zu UTC in Minuten zu einem Zeitpunkt (Almaty: 300). Aus Intl gelesen, denn er hat sich in Kasachstan schon geaendert (2024 von +6 auf +5). */
function versatzMinuten(zeitpunkt: Date, zeitzone: string): number {
  const teile = new Intl.DateTimeFormat("en-CA", { timeZone: zeitzone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(zeitpunkt);
  const wert = (art: string) => Number(teile.find((t) => t.type === art)?.value);
  const lokalAlsUtc = Date.UTC(wert("year"), wert("month") - 1, wert("day"), wert("hour"), wert("minute"), wert("second"));
  return Math.round((lokalAlsUtc - Math.floor(zeitpunkt.getTime() / 1000) * 1000) / 60_000);
}

/** Der Zeitpunkt, an dem es in der Zone am Tag `tag` (JJJJ-MM-TT) `uhrzeit` (HH:MM) ist. */
export function ortszeitAlsInstant(tag: string, uhrzeit: string, zeitzone: string = betriebsZeitzone): Date {
  const [jahr, monat, tagImMonat] = tag.split("-").map(Number);
  const [stunde, minute] = uhrzeit.split(":").map(Number);
  const alsUtc = Date.UTC(jahr, monat - 1, tagImMonat, stunde, minute);
  // Der Versatz gilt am gesuchten Zeitpunkt, nicht an der Naeherung: einmal nachziehen (relevant nur bei einer Zeitumstellung).
  const erster = alsUtc - versatzMinuten(new Date(alsUtc), zeitzone) * 60_000;
  return new Date(alsUtc - versatzMinuten(new Date(erster), zeitzone) * 60_000);
}

/** Uhrzeit "HH:MM" eines Zeitpunkts in der Zone. */
export function uhrzeitInZone(zeitpunkt: Date, zeitzone: string = betriebsZeitzone): string {
  const teile = new Intl.DateTimeFormat("en-CA", { timeZone: zeitzone, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).formatToParts(zeitpunkt);
  const wert = (art: string) => teile.find((t) => t.type === art)?.value ?? "00";
  return `${wert("hour")}:${wert("minute")}`;
}

export type Tageszeit = "morgen" | "tag" | "abend";

export function tageszeitBestimmen(
  jetzt: Date = new Date(),
  zeitzone: string = betriebsZeitzone,
): Tageszeit {
  // Die Stunde ueber formatToParts, nicht ueber format() (Befund vom 28.09.2026): das deutsche
  // CLDR-Muster ist "HH 'Uhr'", format() liefert also "08 Uhr", Number("08 Uhr") ist NaN, und
  // beide Vergleiche unten waren falsch - es hiess zu jeder Uhrzeit "Guten Abend". hourCycle
  // "h23" statt hour12: false, damit Mitternacht 0 ist und nicht 24 (wie in heuteAnweisung).
  const stunde = Number(
    new Intl.DateTimeFormat("de-DE", {
      timeZone: zeitzone,
      hour: "numeric",
      hourCycle: "h23",
    })
      .formatToParts(jetzt)
      .find((teil) => teil.type === "hour")?.value,
  );
  // Grenzen nach deutschem Sprachgebrauch. In der Erntesaison beginnt die
  // Schicht vor Sonnenaufgang, "Guten Morgen" gilt deshalb bis 11 Uhr.
  if (stunde < 11) return "morgen";
  if (stunde < 18) return "tag";
  return "abend";
}

/** Wie viele Saetze unter dashboard.begruessung.spruch stehen. */
export const spruchAnzahl = 8;

const abschnittNummer: Record<Tageszeit, number> = {
  morgen: 0,
  tag: 1,
  abend: 2,
};

/**
 * Welcher der Saetze heute dran ist.
 *
 * Bewusst berechnet und nicht gewuerfelt: der Satz wechselt dreimal am Tag,
 * zu den Grenzen der Tageszeit, und bleibt dazwischen stehen. Bei jedem
 * Seitenaufruf ein neuer Satz waere auf einer Seite, die jemand zwanzigmal
 * am Tag oeffnet, blosse Unruhe - und der Server muesste ihn ohnehin
 * bestimmen, weil ein im Browser gewuerfelter Satz nach der Hydration ein
 * anderer waere als im ausgelieferten HTML.
 */
export function spruchIndex(
  jetzt: Date = new Date(),
  anzahl: number = spruchAnzahl,
  zeitzone: string = betriebsZeitzone,
): number {
  const tageSeitEpoche = Math.floor(Date.parse(tagInZone(jetzt, zeitzone)) / 86_400_000);
  const abschnitt = abschnittNummer[tageszeitBestimmen(jetzt, zeitzone)];
  return (tageSeitEpoche * 3 + abschnitt) % anzahl;
}
