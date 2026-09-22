import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { ZonePageBody } from "@/components/dashboard/zone-page-body";
import { ladeKpis } from "@/lib/data/kpis";
import { ladeVerteilungen } from "@/lib/data/kachel-verteilungen";
import { getSessionProfile } from "@/lib/auth";
import { kpisFuerRolle } from "@/lib/domain/kpis";
import { zones, type ZoneKey } from "@/lib/modules";

export default async function ZonePage({
  params,
}: {
  params: Promise<{ locale: string; zone: string }>;
}) {
  const { locale, zone } = await params;
  setRequestLocale(locale);

  if (!zones.some((z) => z.key === zone)) notFound();

  const [{ kpis, quelle }, profil] = await Promise.all([
    ladeKpis(),
    getSessionProfile(),
  ]);

  // Derselbe serverseitige Vorfilter wie auf der Uebersicht. Ohne ihn
  // erreichten alle Kennzahlen jeden angemeldeten Client, auch die Rollen,
  // die laut sichtbarFuer keine einzige sehen sollen. Die ausfuehrliche
  // Begruendung steht in src/app/[locale]/dashboard/page.tsx.
  let sichtbareKpis = kpis;
  if (profil) {
    const { kern, erweitert } = kpisFuerRolle(profil.role, kpis);
    sichtbareKpis = [...kern, ...erweitert];
  }

  // Die Zone schneidet die Liste zu, bevor sie den Server verlaesst. Die
  // Seite zeigt ohnehin nur ihre eigene Zone, und was gar nicht erst
  // ausgeliefert wird, steht auch nicht im Browser.
  const zonenKpis = sichtbareKpis.filter((kpi) => kpi.zone === zone);

  // Die Einzelwerte hinter einer Kennzahl holt nur, wer sie auch zeigt. Der
  // Punktstreifen steht auf genau zwei Kennzahlen, beide in Feld und Hof -
  // die Buero- und Marktseite laden deshalb keine Zeile mehr als vorher.
  //
  // Schwelle und Punkte muessen auf derselben Skala liegen: die
  // Pflueckleistung misst kg/h gegen ein Ziel in kg/h, die Vorkuehlung
  // Minuten gegen Minuten. Die Streuung dagegen ist ein Verhaeltnis ("1,8x")
  // und bekommt bewusst keine Verteilung - ein Streifen mit der Schwelle 1,8
  // auf einer kg/h-Achse waere eine falsche Aussage.
  const verteilungen: Record<string, { name: string; wert: number }[]> = {};
  if (zone === "feld" || zone === "hof") {
    const einzelwerte = await ladeVerteilungen();
    if (zone === "feld") {
      verteilungen.pflueckleistung = einzelwerte.personen.map((person) => ({
        name: person.name,
        wert: person.kgProStunde,
      }));
    } else {
      verteilungen.zeitBisVorkuehlung = einzelwerte.vorkuehlung.map((charge) => ({
        name: charge.code,
        wert: charge.minuten,
      }));
    }
  }

  return (
    <ZonePageBody
      zone={zone as ZoneKey}
      kpis={zonenKpis}
      quelle={quelle}
      verteilungen={verteilungen}
    />
  );
}
