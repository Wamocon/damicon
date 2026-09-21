import { notFound } from "next/navigation";
import { getFormatter, setRequestLocale } from "next-intl/server";
import { EntwurfSeite } from "@/components/dashboard/entwuerfe/entwurf-seite";
import { istVariante } from "@/components/dashboard/entwuerfe/varianten";
import type { Tageslage } from "@/components/dashboard/entwuerfe/variante-2-tageslage";
import { ladeKpis } from "@/lib/data/kpis";
import { ladePflueckaufgaben } from "@/lib/data/pflueckaufgaben";
import { ladeReihenbloecke } from "@/lib/data/reihenbloecke";
import { ladeReklamationen } from "@/lib/data/reklamationen";
import { ladeDokumente } from "@/lib/data/dokumente";
import { getSessionProfile } from "@/lib/auth";
import { kpisFuerRolle } from "@/lib/domain/kpis";

// Vergleichsansicht der Entwuerfe fuer die Uebersichtsseite. Sechs Zustaende
// derselben Seite unter /dashboard/entwurf/<ist|v1..v5>.
//
// Diese Route ist Entwurfsmaterial und faellt weg, sobald entschieden ist,
// welche Varianten in die Uebersicht wandern. Sie steht bewusst unter
// /dashboard: so traegt sie Kopfzeile, Seitenleiste und Rollenwahl der
// echten Seite, und ein Vergleichsbild zeigt die Seite im Rahmen, in dem sie
// spaeter steht. Das statische Segment "entwurf" geht der dynamischen Zone
// [zone] vor, die vier Zonenschluessel bleiben also unberuehrt.

/** Zaehlt zusammen, was Variante 2 als Tageslage zeigt. */
async function ladeTageslage(): Promise<Tageslage> {
  const [aufgaben, bloecke, reklamationen, dokumente] = await Promise.all([
    ladePflueckaufgaben(),
    ladeReihenbloecke(),
    ladeReklamationen(),
    ladeDokumente(),
  ]);

  const gesperrt = bloecke.bloecke.filter((block) => block.sperre !== null);

  return {
    aufgabenOffen: aufgaben.aufgaben.filter(
      (aufgabe) => aufgabe.status !== "abgeschlossen",
    ).length,
    bloeckeGesperrt: gesperrt.length,
    bloeckeFaellig: gesperrt.filter((block) => block.sperre?.faellig).length,
    reklamationenOffen: reklamationen.reklamationen.filter(
      (fall) => fall.status === "offen" || fall.status === "in_pruefung",
    ).length,
    dokumenteAbgelaufen: dokumente.dokumente.filter(
      (dokument) => dokument.status === "abgelaufen",
    ).length,
  };
}

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

  // Die Tageslage kostet vier Abfragen - nur laden, wo sie gezeigt wird.
  const lage = variante === "v2" ? await ladeTageslage() : null;

  return (
    <EntwurfSeite
      variante={variante}
      kpis={sichtbareKpis}
      quelle={quelle}
      lage={lage}
      stand={format.dateTime(new Date(), {
        dateStyle: "short",
        timeStyle: "short",
      })}
      istAdmin={profil?.role === "admin"}
    />
  );
}
