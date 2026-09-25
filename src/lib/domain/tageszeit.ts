// Tageszeit fuer die Begruessung. Serverseitig bestimmt und als Prop
// durchgereicht: rechnete der Client sie selbst, stuende beim ersten Rendern
// eine andere Begruessung im HTML als nach der Hydration.
//
// Die Zeitzone steht hier fest, weil der Betrieb im Umland von Almaty liegt.
// next-intl hat keine konfigurierte timeZone (src/i18n/request.ts), ohne
// diese Angabe zaehlte also die Zeitzone des Servers - auf einem Vercel-Knoten
// in Europa waere das drei bis fuenf Stunden daneben, und "Guten Morgen"
// stuende am fruehen Nachmittag.
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

export type Tageszeit = "morgen" | "tag" | "abend";

export function tageszeitBestimmen(
  jetzt: Date = new Date(),
  zeitzone: string = betriebsZeitzone,
): Tageszeit {
  const stunde = Number(
    new Intl.DateTimeFormat("de-DE", {
      timeZone: zeitzone,
      hour: "numeric",
      hour12: false,
    }).format(jetzt),
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
