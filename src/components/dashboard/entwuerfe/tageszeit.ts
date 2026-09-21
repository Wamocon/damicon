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
