// Wirtschaftlichkeit in zwei Teilen (Entscheidung vom 16.10.2026).
//
// Erstens die Wirtschaftlichkeit des Betriebs (betriebsrechnung-ansicht.tsx): Erlöse, Kosten und Ergebnis über drei bis fünf Jahre, mit dem System als Effekt.
// Zweitens, hier, die Investitionsrechnung zum System: wann das Geld zurück ist, was der Sprung kostet, was das Besitzen kostet. Nicht zu verwechseln mit der
// Finanzseite nebenan, die den laufenden Betrieb Monat für Monat rechnet.
//
// Sechs Kennzahlen des Systems im Raster, je mit eigenem Diagramm, vier weitere im Aufklapper darunter ohne Diagramm: die Auswahl stammt von der
// Geschaeftsfuehrung. Der Horizont (drei bis fünf Jahre, Adresszeile ?jahre=) gilt für beide Teile.
//
// Seit WMCNL-2470 rechnen die Kennzahlen aus erfassten Posten und Annahmen
// (Abschnitte darunter), nicht mehr aus Konstanten. Fehlt eine Art von Posten,
// steht die Kennzahl auf "offen". Jede Kachel traegt ihre Herkunft (belegt,
// geschaetzt, offen), und die Seite kennzeichnet sich als Ganzes. Ein
// festgehaltener Stand (?stand=...) zeigt die Rechnung von damals, mit dem
// Kurs von damals. Ohne Datenbank rechnet die Seite mit den Modellwerten der
// Kennzahlenliste vom 23.09.2026 und erlaubt keine Erfassung.

import { getFormatter, getTranslations } from "next-intl/server";
import { Aufklapper, Card, Section, StatusPill } from "@/components/ui/kit";
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
import { BetriebsrechnungAnsicht } from "@/components/db/betriebsrechnung-ansicht";
import { Kennzahlfelder } from "@/components/db/kennzahl-karte";
import { WirtschaftlichkeitErfassung } from "@/components/db/wirtschaftlichkeit-erfassung";
import { WirtschaftlichkeitHerleitung } from "@/components/db/wirtschaftlichkeit-herleitung";
import { getSessionProfile } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { ladeSchwundHerleitung, ladeStand, ladeWirtschaftlichkeit } from "@/lib/data/wirtschaftlichkeit";
import { tagInZone } from "@/lib/domain/tageszeit";
import { planJahreAus } from "@/lib/domain/betriebsrechnung";
import {
  barwertIstPunkte,
  planIst,
  rechneStand,
  roiIstPunkte,
  zeilenBisLetzteErfassung,
  type Annahmen,
  type IstEintrag,
  type PlanIst,
  type Rechenstand,
} from "@/lib/domain/wirtschaftlichkeit-erfassung";

/** ROI und Kapitalwert der erfassten Ist-Werte auf der Achse der Plankurven; null, solange nichts erfasst ist oder Investition und laufende Kosten fehlen. */
function istPunkteFuer(stand: Rechenstand, vergleich: PlanIst, ist: IstEintrag[], annahmen: Annahmen): Rechnung["istPunkte"] {
  const erfasst = zeilenBisLetzteErfassung(vergleich.zeilen, ist);
  if (erfasst.length === 0 || stand.capexEur === null || stand.opexEur === null) return null;
  return {
    roi: roiIstPunkte(erfasst, stand.capexEur, stand.opexEur),
    barwert: barwertIstPunkte(erfasst, stand.capexEur, stand.opexEur, annahmen.kalkulationszins),
  };
}

/** Überschrift des zweiten Teils: ob sich das System lohnt, mit der Kennzeichnung seiner Kennzahlen. */
function SystemKopf({ titel, lead, pille }: { titel: string; lead: string; pille: Modell["pille"] }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-t border-border pt-6">
      <div className="min-w-0">
        <h2 className="text-xl font-black text-foreground">{titel}</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{lead}</p>
      </div>
      <StatusPill tone={pille.ton}>{pille.text}</StatusPill>
    </div>
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
      <Kennzahlfelder kachel={kachel} texte={modell} groesse="gross" />
      <div className="mt-3">
        <Diagramm art={kachel.diagramm} rechnung={rechnung} />
      </div>
      <p className="mt-2 border-t border-border pt-2 schrift-label text-muted-foreground">
        {kachel.rechenweg}
      </p>
    </Card>
  );
}

export async function WirtschaftlichkeitAnsicht({ pfad, standId, jahre }: { pfad: string; standId?: string; jahre?: string }) {
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

  const horizont = planJahreAus(jahre);
  const stand = rechneStand(posten, annahmen, menge, horizont);
  const bisMonat = (festgehalten ? tagInZone(new Date(festgehalten.snapshot.erstelltAm)) : heute).slice(0, 7);
  const vergleich = planIst(stand.nutzenEur, ist, annahmen, bisMonat);
  const rechnung: Rechnung = { stand, annahmen, istPunkte: istPunkteFuer(stand, vergleich, ist, annahmen), jahre: horizont };

  // Die Fixkosten gehören zum Betrieb, nicht zum System: die Hinweise der Kennzahlen zählen nur die Posten des Systems.
  const modell = await baueModell(rechnung, {
    quelle,
    postenAnzahl: posten.filter((p) => p.art !== "fixkosten").length,
    standName: festgehalten?.kopf.bezeichnung,
    standDatum: festgehalten ? format.dateTime(new Date(festgehalten.kopf.standAm), { dateStyle: "medium", timeZone: "Asia/Almaty" }) : undefined,
  });

  const darfSchreiben = quelle === "erfasst" && hasPermission(profil?.role, "wirtschaftlichkeit", "create");
  // Die Herleitung aus den Betriebsdaten gehoert zur laufenden Rechnung, nicht zu einem festgehaltenen Stand (der haelt seine Werte fest).
  const herleitung = quelle === "erfasst" ? await ladeSchwundHerleitung(annahmen) : null;

  return (
    <div className="space-y-6">
      <BetriebsrechnungAnsicht
        modus={quelle}
        pfad={pfad}
        standId={festgehalten?.kopf.id}
        jahre={horizont}
        betrieb={daten.betrieb}
        betriebIst={daten.betriebIst}
        stand={stand}
        annahmen={annahmen}
        posten={posten}
        darfSchreiben={darfSchreiben}
        heute={heute}
        kursHinweis={modell.kursHinweis}
        herkunftTexte={modell}
      />

      <SystemKopf titel={t("titel")} lead={t("lead", { jahre: horizont })} pille={modell.pille} />

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
              <Kennzahlfelder kachel={kachel} texte={modell} groesse="klein" />
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
