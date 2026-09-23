// Wirtschaftlichkeit: Investitionsrechnung zur Damicon-Einfuehrung.
//
// Nicht zu verwechseln mit der Finanzseite nebenan. Die rechnet den laufenden
// Betrieb (Deckungsbeitrag je Kilogramm, Monat fuer Monat). Diese hier rechnet
// die einmalige Investition ueber drei Jahre: wann das Geld zurueck ist, was
// der Sprung kostet, was das Besitzen kostet.
//
// Sechs Kennzahlen im Raster, je mit eigenem Diagramm, vier weitere im
// Aufklapper darunter ohne Diagramm - die Auswahl stammt von der
// Geschaeftsfuehrung.
//
// Die Zahlen sind Modellwerte aus der Kennzahlenliste vom 23.09.2026, nicht
// aus dem Betrieb. Deshalb traegt das Modul reifegrad "in-entwicklung", die
// Seite eine Kennzeichnung, und jede nicht belegte Kachel eine eigene.

import { getTranslations } from "next-intl/server";
import { Aufklapper, Card, PageHeader, Section, StatusPill } from "@/components/ui/kit";
import {
  Diagramm,
  baueModell,
  type Kachel,
  type Modell,
} from "@/components/db/wirtschaftlichkeit-modell";

function Herkunftspille({ kachel, modell }: { kachel: Kachel; modell: Modell }) {
  if (kachel.herkunft === "belegt") return null;
  return (
    <StatusPill tone={kachel.herkunft === "offen" ? "neutral" : "warning"}>
      {kachel.herkunft === "offen" ? modell.offenLabel : modell.geschaetztLabel}
    </StatusPill>
  );
}

function Kennzahlkachel({ kachel, modell }: { kachel: Kachel; modell: Modell }) {
  return (
    <Card
      ton="daten"
      // Gestrichelter Rahmen in der Warnfarbe bei allem, was nicht belegt
      // ist - die zweite Markierungsstufe neben der seitenweiten
      // Kennzeichnung oben. Gestrichelt allein reicht nicht: --border ist so
      // hell, dass der Strichel gegen die Kartenflaeche verschwindet. Die
      // Farbe traegt die Bedeutung nicht allein, die Pille daneben sagt sie
      // in Worten (DESIGN.md Regel 7).
      className={
        kachel.herkunft === "belegt" ? "p-4" : "border-dashed border-warning/45 p-4"
      }
    >
      <div className="flex items-start justify-between gap-2">
        <p className="schrift-label font-semibold uppercase tracking-wide text-muted-foreground">
          {kachel.label}
        </p>
        <Herkunftspille kachel={kachel} modell={modell} />
      </div>
      <p className="mt-1 text-2xl font-black text-foreground" title={kachel.genau}>
        {kachel.wert}
        {kachel.klammer ? (
          <span className="ml-1.5 text-base font-bold text-muted-foreground">
            ({kachel.klammer})
          </span>
        ) : null}
      </p>
      <p className="mt-0.5 schrift-dense text-muted-foreground">{kachel.frage}</p>
      <div className="mt-3">
        <Diagramm art={kachel.diagramm} />
      </div>
      <p className="mt-2 border-t border-border pt-2 schrift-label text-muted-foreground">
        {kachel.rechenweg}
      </p>
    </Card>
  );
}

export async function WirtschaftlichkeitAnsicht() {
  const t = await getTranslations("wirtschaftlichkeitAnsicht");
  const modell = await baueModell();

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("titel")} description={t("lead")}>
        <StatusPill tone="warning">{t("modellPille")}</StatusPill>
      </PageHeader>

      <Card ton="innen" className="p-4">
        <p className="schrift-dense text-card-foreground">{modell.modellHinweis}</p>
        <p className="mt-1 schrift-label text-muted-foreground">{modell.kursHinweis}</p>
      </Card>

      <Section title={t("abschnitt.titel")} description={t("abschnitt.lead")}>
        <p className="schrift-dense text-muted-foreground">{modell.jahresnutzenSatz}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {modell.fokus.map((kachel) => (
            <Kennzahlkachel key={kachel.schluessel} kachel={kachel} modell={modell} />
          ))}
        </div>
      </Section>

      <Aufklapper titel={t("weitere.titel")} beschreibung={t("weitere.lead")}>
        <dl className="grid gap-4 sm:grid-cols-2">
          {modell.weitere.map((kachel) => (
            <div key={kachel.schluessel} className="min-w-0">
              <dt className="schrift-label font-semibold uppercase tracking-wide text-muted-foreground">
                {kachel.label}
              </dt>
              <dd>
                <p className="mt-1 text-xl font-black text-foreground" title={kachel.genau}>
                  {kachel.wert}
                  {kachel.klammer ? (
                    <span className="ml-1.5 text-sm font-bold text-muted-foreground">
                      ({kachel.klammer})
                    </span>
                  ) : null}
                  {kachel.herkunft !== "belegt" ? (
                    <span className="ml-2 align-middle">
                      <Herkunftspille kachel={kachel} modell={modell} />
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 schrift-dense text-muted-foreground">{kachel.frage}</p>
                <p className="mt-0.5 schrift-label text-muted-foreground">{kachel.rechenweg}</p>
              </dd>
            </div>
          ))}
        </dl>
      </Aufklapper>

      <Card ton="innen" className="p-4">
        <p className="schrift-dense text-muted-foreground">{t("fussnote")}</p>
      </Card>
    </div>
  );
}
