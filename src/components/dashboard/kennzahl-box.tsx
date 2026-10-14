"use client";

// Die Kennzahl in der Zonenkarte.
//
// Drei Dinge, die der erste Entwurf falsch hatte:
//
//   1. Die Boxen waren unterschiedlich hoch, weil das Label mal eine und mal
//      zwei Zeilen brauchte. Jetzt ist der Platz fuer den Namen fest
//      (min-h-8, zwei Zeilen), und die Box fuellt ihre Rasterzelle (h-full).
//      Das Raster setzt dazu auto-rows-fr, damit auch Zeilen untereinander
//      dieselbe Hoehe haben.
//   2. Damit standen Wert und Ziel auf verschiedenen Linien. Jetzt liegt der
//      Wert immer unter demselben Kopf, und die Fusszeile haengt an mt-auto,
//      also am unteren Rand - in jeder Box auf derselben Linie.
//   3. Am Wert stand nicht, was er darstellt. "71 %" heisst in einer Box
//      Pflueckintervall und in der naechsten belegte Verkaeufe. Jetzt steht
//      der Name ueber dem Wert und nicht klein darunter, in einer Kurzform,
//      die in zwei Zeilen passt (kpis.<key>.kurz). Das volle Label und der
//      Rechenweg bleiben als Tooltip.
import { useFormatter, useTranslations } from "next-intl";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Datenherkunft, Kpi, KpiTrend } from "@/lib/domain/kpis";
import { zielAuswerten, type Zielstand } from "@/lib/domain/zielstand";
import {
  kachelform,
  kachelInhalt,
  meterSkala,
  type Einzelwerte,
  type KachelInhalt,
  type Kachelplatz,
} from "@/lib/domain/kachel-form";
import {
  AnteilPunkte,
  Kachelhuelle,
  Meter,
  Rangliste,
  Verteilung,
  Zaehler,
} from "@/components/dashboard/kachel-formen";

const trendIcon: Record<KpiTrend, typeof ArrowUpRight> = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  flat: Minus,
};

/**
 * Der Trendpfeil, gefaerbt nach gutRichtung: ein steigender Wert ist nicht
 * ueberall gut. Bei der Verlustquote ist er schlecht, bei der Liefertreue
 * gut - deshalb entscheidet nicht die Richtung allein ueber die Farbe.
 *
 * Die Richtung selbst kommt aus public.kpi_trend, also aus zwei gemessenen
 * Punkten. Bis September 2026 stand sie als Konstante in domain/kpis.ts.
 */
export function TrendPfeil({ kpi, className }: { kpi: Kpi; className?: string }) {
  // Ohne zwei Messpunkte gibt es keine Richtung, und dann steht hier nichts.
  // Ein waagerechter Pfeil waere eine Aussage ueber einen Vergleich, den
  // niemand angestellt hat - die Zeitreihe liefert "flat" ausschliesslich
  // dann, wenn zwei Werte tatsaechlich verglichen wurden und gleich waren.
  if (!kpi.trend) return null;
  const Cmp = trendIcon[kpi.trend];
  const positive =
    (kpi.trend === "up" && kpi.gutRichtung === "up") ||
    (kpi.trend === "down" && kpi.gutRichtung === "down");
  return (
    <Cmp
      className={cn(
        "h-4 w-4 shrink-0",
        kpi.trend === "flat"
          ? "text-muted-foreground"
          : positive
            ? "text-success"
            : "text-destructive",
        className,
      )}
    />
  );
}

// Warum die Luecke nur auf Anforderung erscheint: auf der Uebersicht stand
// diese Einordnung bis September 2026 als Fusszeile an jeder Kachel und wurde
// mit der Textpruefung entfernt - sie beschrieb den Bauzustand, waehrend dort
// die Frage steht, ob eine Zahl von heute ist. Auf der Bereichsseite ist die
// Kennzahl dagegen der Inhalt der Seite; ein grauer Kasten ohne Erklaerung
// sagt dem Betrachter nichts. Deshalb ein Schalter statt einer festen Regel.
const lueckeSchluessel: Record<Datenherkunft, string> = {
  berechenbar: "berechenbar",
  "erfassung-fehlt": "erfassungFehlt",
  "tabelle-fehlt": "tabelleFehlt",
  "rechtlich-ungeklaert": "rechtlichUngeklaert",
};

const punkt: Record<Zielstand, string> = {
  verfehlt: "bg-destructive",
  knapp: "bg-warning",
  erfuellt: "bg-success",
  offen: "bg-muted-foreground/50",
};

const schrift: Record<Zielstand, string> = {
  verfehlt: "text-destructive",
  knapp: "text-warning",
  erfuellt: "text-muted-foreground",
  offen: "text-muted-foreground",
};

/**
 * Zahl und Einheit getrennt. Gerechnete Kennzahlen fuehren beides ohnehin
 * getrennt; der unterschriebene Platzhalter ist eine fertige Zeichenkette
 * ("8,4 %", "446 ₸/kg", "47 min") und wird hier aufgeteilt, damit die Einheit
 * nicht in derselben Groesse steht wie der Wert.
 */
function wertTeile(
  kpi: Kpi,
  zahlFormat: (wert: number) => string,
): { zahl: string; einheit: string } {
  if (kpi.gerechnet) {
    return {
      zahl: zahlFormat(kpi.gerechnet.zahl),
      einheit: kpi.gerechnet.einheit,
    };
  }
  const treffer = kpi.wert.trim().match(/^(-?[\d.,]+)\s*(.*)$/);
  if (!treffer) return { zahl: kpi.wert, einheit: "" };
  return { zahl: treffer[1], einheit: treffer[2] };
}

export function KennzahlBox({
  kpi,
  platz = "schmal",
  verteilung,
  lueckeZeigen = false,
}: {
  kpi: Kpi;
  /** Wie viel Platz die Kachel hat - entscheidet ueber die Form. */
  platz?: Kachelplatz;
  /** Die Einzelwerte hinter der Kennzahl. Ohne sie kein Punktstreifen. */
  verteilung?: Einzelwerte;
  /** Benennt bei einem ungerechneten Wert, welche Datengrundlage fehlt. */
  lueckeZeigen?: boolean;
}) {
  const { voll, kurz, hinweis } = useKennzahlNamen(kpi);
  const { soll, platzhalter, stand: zielstand } = zielAuswerten(kpi);

  // Ein Platzhalter ist ein unterschriebener Ausgangswert, keine Messung.
  // Sein Abstand zum Ziel sagt nichts, also bekommt er auch keine Ampelfarbe -
  // sonst leuchtete die Seite rot wegen Zahlen, die niemand erhoben hat.
  const stand = platzhalter ? "offen" : zielstand;

  const form = kachelform(kpi, platz, (verteilung?.length ?? 0) > 1);

  // Die Heldenzahl traegt eine eigene Flaeche: sie steht nicht IM Raster der
  // Kennzahlen, sondern darueber. Genau eine je Ansicht - sonst ist keine
  // mehr hervorgehoben.
  // Genau eine Huelle fuer alle drei Groessen: derselbe Rahmen, dasselbe
  // Innenmass, derselbe Kopf, dieselbe Fusszeile. Die Heldenzahl war bis
  // hierher ein eigener Block mit eigenem Innenmass und eigenem Kopf - und
  // sah dadurch neben ihren Nachbarn aus wie ein Fremdkoerper. Sie
  // unterscheidet sich jetzt nur noch im Schriftgrad der Zahl und in der
  // Flaeche, die ihr das Raster gibt.
  return (
    <Kachelhuelle
      kurz={kurz}
      lang={voll}
      titel={hinweis}
      fuss={<KennzahlFuss kpi={kpi} soll={soll} stand={stand} platzhalter={platzhalter} />}
    >
      {/* Gemeinsames Hoehenband fuer alles unterhalb des Kopfes. Die acht
          Formen bringen sehr unterschiedlich hohe Grafiken mit - der Meter
          14 px, der Punktstreifen 48. Ohne festen Platz sitzt die Fusszeile
          in jeder Kachel auf einer anderen Linie, und die Reihe wirkt
          unruhig, obwohl auto-rows-fr alle Karten gleich hoch macht. */}
      <div className="flex min-h-[76px] flex-col justify-start">
        <KennzahlKoerper
          kpi={kpi}
          inhalt={kachelInhalt(form, kpi, verteilung)}
          held={form === "held"}
          stand={stand}
          achse={platz === "breit"}
        />
        {/* Der Hinweis steht IM Koerper, nicht darunter: bei einer Kennzahl
            ohne Messung nimmt er den Platz ein, den sonst das Meter oder das
            Histogramm braucht. Darunter waere er ein zusaetzlicher Block, und
            die Karte wuechse ueber ihre Nachbarn hinaus. */}
        {lueckeZeigen && platzhalter && !kpi.gerechnet ? (
          <LueckenHinweis datenherkunft={kpi.datenherkunft} />
        ) : null}
      </div>
    </Kachelhuelle>
  );
}

/** Kurzname für den Kopf, volles Label und Tooltip der Kachel. */
function useKennzahlNamen(kpi: Kpi): { voll: string; kurz: string; hinweis: string } {
  const kpiT = useTranslations("kpis");
  const voll = kpiT(`${kpi.key}.label`);
  const kurz = kpiT.has(`${kpi.key}.kurz`) ? kpiT(`${kpi.key}.kurz`) : voll;
  // Gerechnet steht der Rechenweg im Tooltip, sonst das volle Label. Beim
  // Platzhalter ist der Rechenweg keiner.
  const hinweis =
    kpi.gerechnet && kpiT.has(`${kpi.key}.basis`)
      ? `${voll} - ${kpiT(`${kpi.key}.basis`)}`
      : voll;
  return { voll, kurz, hinweis };
}

/** Die Beschriftung der Zielmarke auf Meter und Streifen, etwa "Ziel 6". */
function useZielMarke(soll: number): string {
  const homeT = useTranslations("dashboard.home");
  const format = useFormatter();
  return `${homeT("target")} ${format.number(soll, { maximumFractionDigits: 1 })}`;
}

// Nur der Inhalt der Fusszeile - den Absatz und seine Ausrichtung traegt
// die Huelle, damit jede Kachel dieselbe Fusslinie hat.
function KennzahlFuss({
  kpi,
  soll,
  stand,
  platzhalter,
}: {
  kpi: Kpi;
  soll: number | null;
  stand: Zielstand;
  platzhalter: boolean;
}) {
  const t = useTranslations("dashboard.kennzahl");
  const homeT = useTranslations("dashboard.home");
  const zielText =
    soll !== null ? `${homeT("target")} ${kpi.ziel}` : t("ohneZiel");
  const standText = platzhalter ? t("platzhalter") : t(`zielstand.${stand}`);

  return (
    <>
      <span
        aria-hidden
        className={cn("h-1.5 w-1.5 shrink-0 rounded-full", punkt[stand])}
      />
      <span className="text-muted-foreground">{zielText}</span>
      <span className={cn("ml-auto shrink-0 font-semibold", schrift[stand])}>
        {standText}
      </span>
    </>
  );
}

/** Alles zwischen Kopf und Lücke, so wie kachelInhalt() es gewählt hat. */
function KennzahlKoerper({
  kpi,
  inhalt,
  held,
  stand,
  achse,
}: {
  kpi: Kpi;
  inhalt: KachelInhalt;
  /** Die Heldenzahl: dieselbe Zeile, nur die Zahl groesser. */
  held: boolean;
  stand: Zielstand;
  /** Skalenbeschriftung am Meter, nur auf breitem Platz. */
  achse: boolean;
}) {
  const t = useTranslations("dashboard.kennzahl");
  const format = useFormatter();
  const { zahl, einheit } = wertTeile(kpi, (wert) =>
    format.number(wert, { maximumFractionDigits: 1 }),
  );

  // Der Zaehler ersetzt die grosse Zahl, statt neben ihr zu stehen: bei
  // Ziel 100 % ist die Ausnahme die Aussage, nicht der Anteil. "0" und
  // darunter "von 3 verletzt" sagt, was "100 %" verschweigt - naemlich
  // wie viele Faelle hinter der Quote stehen.
  if (inhalt.art === "zaehler") {
    const { erfuellt, gesamt } = inhalt.anteil;
    return (
      <Zaehler
        zahl={gesamt - erfuellt}
        zeile={t("verletzt", { count: gesamt - erfuellt, gesamt })}
        stand={erfuellt >= gesamt ? "erfuellt" : "verfehlt"}
      />
    );
  }
  if (inhalt.art === "punkte") {
    return (
      <AnteilPunkte
        erfuellt={inhalt.anteil.erfuellt}
        gesamt={inhalt.anteil.gesamt}
        zeile={t("vonGesamt", { gesamt: inhalt.anteil.gesamt })}
      />
    );
  }
  return (
    <>
      <WertZeile kpi={kpi} zahl={zahl} einheit={einheit} held={held} />
      {inhalt.art === "meter" ? (
        <KennzahlMeter
          kpi={kpi}
          ist={inhalt.ist}
          soll={inhalt.soll}
          einheit={einheit}
          stand={stand}
          achse={achse}
        />
      ) : null}
      {inhalt.art === "rangliste" ? (
        <Rangliste
          zeilen={inhalt.werte}
          schwelle={inhalt.soll}
          gutUnterhalb={kpi.gutRichtung === "down"}
        />
      ) : null}
      {inhalt.art === "streifen" ? (
        <KennzahlStreifen kpi={kpi} werte={inhalt.werte} soll={inhalt.soll} einheit={einheit} />
      ) : null}
    </>
  );
}

/** Wert: beginnt damit in jeder Box auf derselben Linie. */
function WertZeile({
  kpi,
  zahl,
  einheit,
  held,
}: {
  kpi: Kpi;
  zahl: string;
  einheit: string;
  held: boolean;
}) {
  return (
    <p className="mt-2 flex items-baseline gap-1">
      <span
        className={cn(
          "truncate font-black text-foreground",
          // Proportionale Ziffern bleiben: gleich breite Ziffern sind
          // fuer Spalten gedacht, auf einer freistehenden Zahl wirken
          // sie auseinandergezogen.
          held
            ? "text-4xl leading-none tracking-tight sm:text-5xl"
            : "text-xl",
        )}
      >
        {zahl}
      </span>
      {einheit ? (
        <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
          {einheit}
        </span>
      ) : null}
      <TrendPfeil kpi={kpi} className="ml-auto h-3.5 w-3.5 self-center" />
    </p>
  );
}

function KennzahlMeter({
  kpi,
  ist,
  soll,
  einheit,
  stand,
  achse,
}: {
  kpi: Kpi;
  ist: number;
  soll: number;
  einheit: string;
  stand: Zielstand;
  achse: boolean;
}) {
  const format = useFormatter();
  const zielMarke = useZielMarke(soll);
  const skala = meterSkala(ist, soll, einheit);
  return (
    <Meter
      ist={ist}
      ziel={soll}
      skalaBis={skala}
      gutUnterhalb={kpi.gutRichtung === "down"}
      stand={stand}
      beschriftungVon="0"
      beschriftungZiel={zielMarke}
      beschriftungBis={`${format.number(skala, { maximumFractionDigits: 0 })} ${einheit}`}
      achse={achse}
    />
  );
}

function KennzahlStreifen({
  kpi,
  werte,
  soll,
  einheit,
}: {
  kpi: Kpi;
  werte: Einzelwerte;
  soll: number;
  einheit: string;
}) {
  const t = useTranslations("dashboard.kennzahl");
  const format = useFormatter();
  const zielMarke = useZielMarke(soll);
  // Einmal rechnen statt bei jedem Vorkommen im JSX. streifenRand stand
  // viermal in derselben Ausgabe - dieselbe Rechnung mit denselben
  // Eingaben, nur an vier Stellen geschrieben.
  const rand = streifenRand(werte, soll);

  // Wie viele Vorgaenge auf der falschen Seite der Schwelle liegen. Bei 128
  // Chargen sieht man die roten Balken zwar, aber nicht ihre Zahl - und
  // genau die ist die Aussage: "8 von 128" statt "einige".
  const daneben = werte.filter((eintrag) =>
    kpi.gutRichtung === "down" ? eintrag.wert > soll : eintrag.wert < soll,
  ).length;

  return (
    <Verteilung
      werte={werte}
      schwelle={soll}
      skalaVon={rand.von}
      skalaBis={rand.bis}
      gutUnterhalb={kpi.gutRichtung === "down"}
      beschriftungVon={format.number(rand.von, {
        maximumFractionDigits: 0,
      })}
      beschriftungBis={`${format.number(rand.bis, { maximumFractionDigits: 0 })} ${einheit}`}
      beschriftungSchwelle={zielMarke}
      ausreisserName={
        werte.length <= 12 ? ausreisser(werte, kpi.gutRichtung) : undefined
      }
      hinweis={
        daneben > 0
          ? t("verletzt", { count: daneben, gesamt: werte.length })
          : undefined
      }
    />
  );
}

/* Ein Platzhalter ohne Erklaerung ist ein leerer Kasten. Mit der
   Einordnung wird daraus eine Aussage: nicht "hier fehlt eine Zahl",
   sondern "diese Zahl haengt an einer Erfassung, die noch niemand
   macht". Der Text kommt aus datenherkunft und ist damit uebersetzbar -
   das Feld braucht am Kpi ist eine deutsche Notiz fuer die Codeseite. */
function LueckenHinweis({ datenherkunft }: { datenherkunft: Datenherkunft }) {
  const t = useTranslations("dashboard.kennzahl");
  const text = t(`luecke.${lueckeSchluessel[datenherkunft]}`);
  return (
    <div
      title={text}
      className="mt-2 border-t border-dashed border-border pt-1.5 text-[10px] leading-4 text-muted-foreground"
    >
      <p className="font-semibold text-card-foreground">{t("luecke.titel")}</p>
      {/* Auf zwei Zeilen begrenzt: der Kasten drumherum brauchte 62 px und
          zog damit JEDE Karte der Seite auf seine Hoehe - auch die mit
          echten Daten, die darunter ein Loch von rund 50 px bekamen. Die
          vollstaendige Begruendung steht weiter im Tooltip der Kachel. */}
      <p className="line-clamp-2">{text}</p>
    </div>
  );
}

/**
 * Skalenrand fuer den Punktstreifen: etwas Luft links und rechts, damit kein
 * Punkt am Rand klebt und die Schwelle nicht auf der Kante sitzt.
 */
function streifenRand(
  werte: { wert: number }[],
  schwelle: number,
): { von: number; bis: number } {
  const zahlen = [...werte.map((w) => w.wert), schwelle];
  const min = Math.min(...zahlen);
  const max = Math.max(...zahlen);
  const luft = Math.max((max - min) * 0.12, max * 0.04, 1);
  return { von: Math.max(0, Math.floor(min - luft)), bis: Math.ceil(max + luft) };
}

/** Der auffaelligste Wert - der, den man sich ansehen muss. */
function ausreisser(
  werte: { name: string; wert: number }[],
  gutRichtung: "up" | "down",
): string | undefined {
  if (werte.length === 0) return undefined;
  const schlechtester = werte.reduce((a, b) =>
    gutRichtung === "down"
      ? b.wert > a.wert
        ? b
        : a
      : b.wert < a.wert
        ? b
        : a,
  );
  return schlechtester.name;
}
