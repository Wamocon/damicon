import { notFound } from "next/navigation";
import { getFormatter, setRequestLocale } from "next-intl/server";
import { EntwurfSeite } from "@/components/dashboard/entwuerfe/entwurf-seite";
import {
  betriebsZeitzone,
  spruchIndex,
  tageszeitBestimmen,
} from "@/components/dashboard/entwuerfe/tageszeit";
import { istVariante } from "@/components/dashboard/entwuerfe/varianten";
import { ladeKpis } from "@/lib/data/kpis";
import { getSessionProfile } from "@/lib/auth";
import { kpisFuerRolle } from "@/lib/domain/kpis";

// Vergleichsansicht der Entwuerfe fuer die Uebersichtsseite, unter
// /dashboard/entwurf/<ist|m1|m2|m3>.
//
// Entwurfsmaterial: faellt weg, sobald entschieden ist, was in die Uebersicht
// wandert. Sie steht bewusst unter /dashboard, damit sie Kopfzeile,
// Seitenleiste und Rollenwahl der echten Seite traegt. Das statische Segment
// "entwurf" geht der dynamischen Zone [zone] vor, die vier Zonenschluessel
// bleiben also unberuehrt.

export default async function EntwurfPage({
  params,
}: {
  params: Promise<{ locale: string; variante: string }>;
}) {
  const { locale, variante } = await params;
  setRequestLocale(locale);

  if (!istVariante(variante)) notFound();

  const [{ kpis, quelle }, profil, format] = await Promise.all([
    ladeKpis(),
    getSessionProfile(),
    getFormatter(),
  ]);

  // Derselbe serverseitige Rollenfilter wie auf der echten Uebersichtsseite:
  // vertrauliche Kennzahlen duerfen den Client gar nicht erst erreichen.
  let sichtbareKpis = kpis;
  if (profil) {
    const { kern, erweitert } = kpisFuerRolle(profil.role, kpis);
    sichtbareKpis = [...kern, ...erweitert];
  }

  // Tageszeit und Satz bestimmt der Server. Rechnete der Browser sie selbst,
  // stuende im ausgelieferten HTML eine andere Begruessung als nach der
  // Hydration.
  const jetzt = new Date();

  return (
    <EntwurfSeite
      variante={variante}
      kpis={sichtbareKpis}
      quelle={quelle}
      tageszeit={tageszeitBestimmen(jetzt)}
      datum={format.dateTime(jetzt, {
        dateStyle: "full",
        timeZone: betriebsZeitzone,
      })}
      spruch={spruchIndex(jetzt)}
    />
  );
}
