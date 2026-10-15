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
// Seit WMCNL-2470 rechnen die Kennzahlen aus erfassten Posten und Annahmen
// (Abschnitte darunter), nicht mehr aus Konstanten. Fehlt eine Art von Posten,
// steht die Kennzahl auf "offen". Jede Kachel traegt ihre Herkunft (belegt,
// geschaetzt, offen), und die Seite kennzeichnet sich als Ganzes. Ein
// festgehaltener Stand (?stand=...) zeigt die Rechnung von damals, mit dem
// Kurs von damals. Ohne Datenbank rechnet die Seite mit den Modellwerten der
// Kennzahlenliste vom 23.09.2026 und erlaubt keine Erfassung.

import { getFormatter, getTranslations } from "next-intl/server";
import { Aufklapper, Card, PageHeader, Section, StatusPill } from "@/components/ui/kit";
import { DokumentKnopf } from "@/components/ui/dokument-knopf";
import { cn, istUuid } from "@/lib/utils";
import {
  Diagramm,
  baueModell,
  type Kachel,
  type Modell,
  type Rechenquelle,
  type Rechnung,
} from "@/components/db/wirtschaftlichkeit-modell";
import { WirtschaftlichkeitErfassung } from "@/components/db/wirtschaftlichkeit-erfassung";
import { WirtschaftlichkeitHerleitung } from "@/components/db/wirtschaftlichkeit-herleitung";
import { getSessionProfile } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { ladeSchwundHerleitung, ladeStand, ladeWirtschaftlichkeit } from "@/lib/data/wirtschaftlichkeit";
import { tagInZone } from "@/lib/domain/tageszeit";
import {
  barwertIstPunkte,
  planIst,
  rechneStand,
  roiIstPunkte,
  zeilenBisLetzteErfassung,
} from "@/lib/domain/wirtschaftlichkeit-erfassung";

/** Gross im Raster, klein im Aufklapper. Sonst ist die Kachel dieselbe. */
type Groesse = "gross" | "klein";

function Herkunftspille({ kachel, modell }: { kachel: Kachel; modell: Modell }) {
  if (kachel.herkunft === "belegt") return null;
  return (
    <StatusPill tone={kachel.herkunft === "offen" ? "neutral" : "warning"}>
      {kachel.herkunft === "offen" ? modell.offenLabel : modell.geschaetztLabel}
    </StatusPill>
  );
}

/**
 * Label, Wert, Rubelbetrag, Frage und Rechenweg einer Kennzahl.
 *
 * Eine Fassung fuer beide Stellen, nicht zwei: Raster und Aufklapper zeigen
 * dieselben fuenf Felder in derselben Reihenfolge. Standen sie zweimal da,
 * wuerde ein sechstes Feld irgendwann nur an einer der beiden Stellen
 * ankommen, und niemandem faellt auf, an welcher.
 */
function Kennzahlfelder({
  kachel,
  modell,
  groesse,
}: {
  kachel: Kachel;
  modell: Modell;
  groesse: Groesse;
}) {
  return (
    <>
      {/* Kopfzeile: Name links, Markierung rechts. Der Flex-Container gehoert
          hierher und nicht um den ganzen Block - liegt der Wert mit darin,
          stellt er sich neben das Label statt darunter. */}
      <div className="flex items-start justify-between gap-2">
        <p className="schrift-label font-semibold uppercase tracking-wide text-muted-foreground">
          {kachel.label}
        </p>
        <Herkunftspille kachel={kachel} modell={modell} />
      </div>
      <p
        className={cn(
          "mt-1 font-black text-foreground",
          groesse === "gross" ? "text-2xl" : "text-xl",
        )}
        title={kachel.genau}
      >
        {kachel.wert}
        {kachel.klammer ? (
          <span
            className={cn(
              "ml-1.5 font-bold text-muted-foreground",
              groesse === "gross" ? "text-base" : "text-sm",
            )}
          >
            ({kachel.klammer})
          </span>
        ) : null}
      </p>
      <p className="mt-0.5 schrift-dense text-muted-foreground">{kachel.frage}</p>
    </>
  );
}

function Kennzahlkachel({ kachel, modell, rechnung }: { kachel: Kachel; modell: Modell; rechnung: Rechnung }) {
  return (
    <Card
      ton="daten"
      // Gestrichelter Rahmen in der Warnfarbe bei allem, was nicht belegt
      // ist - die zweite Markierungsstufe neben der seitenweiten
      // Kennzeichnung oben. Gestrichelt allein reicht nicht: --border ist so
      // hell, dass der Strichel gegen die Kartenflaeche verschwindet. Die
      // Farbe traegt die Bedeutung nicht allein, die Pille daneben sagt sie
      // in Worten (DESIGN.md Regel 7).
      className={cn("p-4", kachel.herkunft !== "belegt" && "border-dashed border-warning/45")}
    >
      <Kennzahlfelder kachel={kachel} modell={modell} groesse="gross" />
      <div className="mt-3">
        <Diagramm art={kachel.diagramm} rechnung={rechnung} />
      </div>
      <p className="mt-2 border-t border-border pt-2 schrift-label text-muted-foreground">
        {kachel.rechenweg}
      </p>
    </Card>
  );
}

export async function WirtschaftlichkeitAnsicht({ pfad, standId }: { pfad: string; standId?: string }) {
  const [t, daten, profil, format] = await Promise.all([
    getTranslations("wirtschaftlichkeitAnsicht"),
    ladeWirtschaftlichkeit(),
    getSessionProfile(),
    getFormatter(),
  ]);
  const heute = tagInZone(new Date());

  // Ein festgehaltener Stand ersetzt die laufenden Daten vollstaendig, auch den Kurs.
  const festgehalten = standId && istUuid(standId) ? await ladeStand(standId) : null;
  const quelle: Rechenquelle = festgehalten ? "stand" : daten.quelle === "modell" ? "modell" : "erfasst";
  const posten = festgehalten?.snapshot.posten ?? daten.posten;
  const ist = festgehalten?.snapshot.ist ?? daten.ist;
  const annahmen = festgehalten?.snapshot.annahmen ?? daten.annahmen;
  const menge = festgehalten ? festgehalten.snapshot.mengeAbgeleitet : daten.menge;

  const stand = rechneStand(posten, annahmen, menge);
  const bisMonat = (festgehalten ? tagInZone(new Date(festgehalten.snapshot.erstelltAm)) : heute).slice(0, 7);
  const vergleich = planIst(stand.nutzenEur, ist, annahmen, bisMonat);
  const erfasst = zeilenBisLetzteErfassung(vergleich.zeilen, ist);
  const istPunkte =
    erfasst.length > 0 && stand.capexEur !== null && stand.opexEur !== null
      ? {
          roi: roiIstPunkte(erfasst, stand.capexEur, stand.opexEur),
          barwert: barwertIstPunkte(erfasst, stand.capexEur, stand.opexEur, annahmen.kalkulationszins),
        }
      : null;
  const rechnung: Rechnung = { stand, annahmen, istPunkte };

  const modell = await baueModell(rechnung, {
    quelle,
    postenAnzahl: posten.length,
    standName: festgehalten?.kopf.bezeichnung,
    standDatum: festgehalten ? format.dateTime(new Date(festgehalten.kopf.standAm), { dateStyle: "medium", timeZone: "Asia/Almaty" }) : undefined,
  });

  const darfSchreiben = quelle === "erfasst" && hasPermission(profil?.role, "wirtschaftlichkeit", "create");
  // Die Herleitung aus den Betriebsdaten gehoert zur laufenden Rechnung, nicht zu einem festgehaltenen Stand (der haelt seine Werte fest).
  const herleitung = quelle === "erfasst" ? await ladeSchwundHerleitung(annahmen) : null;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("titel")} description={t("lead")}>
        <StatusPill tone={modell.pille.ton}>{modell.pille.text}</StatusPill>
      </PageHeader>

      <Card ton="innen" className="space-y-2 p-4">
        <p className="schrift-dense text-card-foreground">{modell.hinweis}</p>
        <p className="schrift-label text-muted-foreground">{modell.kursHinweis}</p>
        {standId && !festgehalten ? <p className="schrift-label font-semibold text-warning">{t("standUnbekannt")}</p> : null}
        {quelle === "erfasst" && !darfSchreiben ? <p className="schrift-label text-muted-foreground">{t("nurLesen")}</p> : null}
        {quelle !== "modell" ? (
          <div className="pt-1">
            <DokumentKnopf art="wirtschaftlichkeit" parameter={festgehalten ? { stand: festgehalten.kopf.id } : {}} />
          </div>
        ) : null}
      </Card>

      <Section title={t("abschnitt.titel")} description={t("abschnitt.lead")}>
        <p className="schrift-dense text-muted-foreground">{modell.jahresnutzenSatz}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {modell.fokus.map((kachel) => (
            <Kennzahlkachel key={kachel.schluessel} kachel={kachel} modell={modell} rechnung={rechnung} />
          ))}
        </div>
      </Section>

      <Aufklapper titel={t("weitere.titel")} beschreibung={t("weitere.lead")}>
        {/* Bewusst kein dl: das Label steht bereits als erstes Feld in
            Kennzahlfelder. Ein zusaetzliches dt daneben liesse jeden
            Screenreader den Namen zweimal vorlesen. */}
        <div className="grid gap-4 sm:grid-cols-2">
          {modell.weitere.map((kachel) => (
            <div key={kachel.schluessel} className="min-w-0">
              <Kennzahlfelder kachel={kachel} modell={modell} groesse="klein" />
              <p className="mt-0.5 schrift-label text-muted-foreground">{kachel.rechenweg}</p>
            </div>
          ))}
        </div>
      </Aufklapper>

      {quelle !== "modell" ? (
        <WirtschaftlichkeitErfassung
          pfad={pfad}
          posten={posten}
          ist={ist}
          annahmen={annahmen}
          menge={menge}
          staende={daten.staende}
          stand={stand}
          planIst={vergleich}
          aktiverStand={festgehalten?.kopf.id}
          darfSchreiben={darfSchreiben}
          heute={heute}
        />
      ) : null}

      {herleitung ? <WirtschaftlichkeitHerleitung herleitung={herleitung} darfSchreiben={darfSchreiben} /> : null}

      <Card ton="innen" className="p-4">
        <p className="schrift-dense text-muted-foreground">{t("fussnote")}</p>
      </Card>
    </div>
  );
}
