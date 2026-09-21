import { notFound } from "next/navigation";
import { getFormatter, setRequestLocale } from "next-intl/server";
import { EntwurfSeite } from "@/components/dashboard/entwuerfe/entwurf-seite";
import type { Tageslage } from "@/components/dashboard/entwuerfe/tageslage";
import {
  betriebsZeitzone,
  tageszeitBestimmen,
} from "@/components/dashboard/entwuerfe/tageszeit";
import {
  brauchtTageslage,
  istVariante,
} from "@/components/dashboard/entwuerfe/varianten";
import { ladeKpis } from "@/lib/data/kpis";
import { ladePflueckaufgaben } from "@/lib/data/pflueckaufgaben";
import { ladeReihenbloecke } from "@/lib/data/reihenbloecke";
import { ladeKuehlkettenUebersicht } from "@/lib/data/kuehlkette";
import { ladeReklamationen } from "@/lib/data/reklamationen";
import { ladeDokumente } from "@/lib/data/dokumente";
import { getSessionProfile } from "@/lib/auth";
import { kpisFuerRolle } from "@/lib/domain/kpis";

// Vergleichsansicht der Entwuerfe fuer die Uebersichtsseite, unter
// /dashboard/entwurf/<ist|basis|w1..w5>.
//
// Entwurfsmaterial: faellt weg, sobald entschieden ist, was in die Uebersicht
// wandert. Sie steht bewusst unter /dashboard, damit sie Kopfzeile,
// Seitenleiste und Rollenwahl der echten Seite traegt. Das statische Segment
// "entwurf" geht der dynamischen Zone [zone] vor, die vier Zonenschluessel
// bleiben also unberuehrt.

/** Zaehlt die offenen Vorgaenge je Zone fuer Variante w3. */
async function ladeTageslage(): Promise<Tageslage> {
  const [aufgaben, bloecke, kuehlkette, reklamationen, dokumente] =
    await Promise.all([
      ladePflueckaufgaben(),
      ladeReihenbloecke(),
      ladeKuehlkettenUebersicht(),
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
    chargenOhneKuehlung: kuehlkette.offeneChargen.length,
    dokumenteAbgelaufen: dokumente.dokumente.filter(
      (dokument) => dokument.status === "abgelaufen",
    ).length,
    reklamationenOffen: reklamationen.reklamationen.filter(
      (fall) => fall.status === "offen" || fall.status === "in_pruefung",
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

  const lage = brauchtTageslage(variante) ? await ladeTageslage() : null;
  const jetzt = new Date();

  return (
    <EntwurfSeite
      variante={variante}
      kpis={sichtbareKpis}
      quelle={quelle}
      lage={lage}
      tageszeit={tageszeitBestimmen(jetzt)}
      datum={format.dateTime(jetzt, {
        dateStyle: "full",
        timeZone: betriebsZeitzone,
      })}
    />
  );
}
