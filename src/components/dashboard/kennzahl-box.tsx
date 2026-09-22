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

const trendIcon: Record<KpiTrend, typeof ArrowUpRight> = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  flat: Minus,
};

/**
 * Der Trendpfeil, gefaerbt nach gutRichtung: ein steigender Wert ist nicht
 * ueberall gut. Bei der Verlustquote ist er schlecht, bei der Liefertreue
 * gut - deshalb entscheidet nicht die Richtung allein ueber die Farbe.
 */
export function TrendPfeil({ kpi, className }: { kpi: Kpi; className?: string }) {
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

const balken: Record<Zielstand, string> = {
  verfehlt: "bg-destructive",
  knapp: "bg-warning",
  erfuellt: "bg-success",
  offen: "bg-muted-foreground/40",
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

/**
 * Das Band zeigt den Istwert gegen den Zielwert. Die Skala endet etwas hinter
 * dem groesseren der beiden Werte, damit ein knapp verfehltes Ziel nicht am
 * Rand klebt. Die Marke steht auf dem Zielwert.
 */
function Zielband({
  ist,
  soll,
  stand,
  titel,
}: {
  ist: number;
  soll: number;
  stand: Zielstand;
  titel: string;
}) {
  const skala = Math.max(ist, soll) * 1.15;
  if (skala <= 0) return null;
  const istAnteil = Math.min(100, (ist / skala) * 100);
  const zielAnteil = Math.min(100, (soll / skala) * 100);

  return (
    <div
      title={titel}
      className="relative mt-2 h-1.5 w-full rounded-full bg-border"
    >
      <div
        className={cn("h-full rounded-full", balken[stand])}
        style={{ width: `${istAnteil}%` }}
      />
      <span
        aria-hidden
        className="absolute -top-0.5 h-2.5 w-0.5 rounded-full bg-foreground"
        style={{ left: `${zielAnteil}%` }}
      />
    </div>
  );
}

export function KennzahlBox({
  kpi,
  zielband = false,
  lueckeZeigen = false,
}: {
  kpi: Kpi;
  /** Band vom Istwert zur Zielmarke. */
  zielband?: boolean;
  /** Benennt bei einem ungerechneten Wert, welche Datengrundlage fehlt. */
  lueckeZeigen?: boolean;
}) {
  const kpiT = useTranslations("kpis");
  const t = useTranslations("dashboard.kennzahl");
  const homeT = useTranslations("dashboard.home");
  const format = useFormatter();
  const auswertung = zielAuswerten(kpi);
  const { ist, soll, platzhalter } = auswertung;
  const { zahl, einheit } = wertTeile(kpi, (wert) =>
    format.number(wert, { maximumFractionDigits: 1 }),
  );

  // Ein Platzhalter ist ein unterschriebener Ausgangswert, keine Messung.
  // Sein Abstand zum Ziel sagt nichts, also bekommt er auch keine Ampelfarbe -
  // sonst leuchtete die Seite rot wegen Zahlen, die niemand erhoben hat.
  const stand = platzhalter ? "offen" : auswertung.stand;

  const voll = kpiT(`${kpi.key}.label`);
  const kurz = kpiT.has(`${kpi.key}.kurz`) ? kpiT(`${kpi.key}.kurz`) : voll;
  // Gerechnet steht der Rechenweg im Tooltip, sonst das volle Label. Beim
  // Platzhalter ist der Rechenweg keiner.
  const hinweis =
    kpi.gerechnet && kpiT.has(`${kpi.key}.basis`)
      ? `${voll} - ${kpiT(`${kpi.key}.basis`)}`
      : voll;

  return (
    <div
      title={hinweis}
      className="flex h-full min-w-0 flex-col rounded-xl border border-border bg-card p-3"
    >
      {/* Kopf: fester Platz fuer zwei Zeilen, in jeder Box gleich hoch. */}
      <p className="line-clamp-2 min-h-8 text-[11px] font-semibold leading-4 text-card-foreground">
        {kurz}
      </p>

      {/* Die volle Beschreibung, sobald die Karte breit genug ist. Gemessen
          wird die Karte, nicht das Fenster: am Schreibtisch stehen zwei
          Zonenkarten nebeneinander und haben je rund 600 px, auf dem Telefon
          hat dieselbe Karte 350 px - dort bleibt es beim Kurznamen und dem
          Tooltip. Der Platz ist auch hier fest, damit die Boxen gleich hoch
          bleiben. */}
      <p className="mt-1 hidden min-h-8 text-[10px] leading-4 text-muted-foreground @md:line-clamp-2">
        {voll}
      </p>

      {/* Wert: beginnt damit in jeder Box auf derselben Linie. */}
      <p className="mt-2 flex items-baseline gap-1">
        <span className="truncate text-xl font-black tabular-nums text-foreground">
          {zahl}
        </span>
        {einheit ? (
          <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
            {einheit}
          </span>
        ) : null}
        <TrendPfeil kpi={kpi} className="ml-auto h-3.5 w-3.5 self-center" />
      </p>

      {zielband && !platzhalter && ist !== null && soll !== null ? (
        <Zielband
          ist={ist}
          soll={soll}
          stand={stand}
          titel={t("bandTitel", { ist: `${zahl} ${einheit}`.trim(), ziel: kpi.ziel })}
        />
      ) : null}

      {/* Ein Platzhalter ohne Erklaerung ist ein leerer Kasten. Mit der
          Einordnung wird daraus eine Aussage: nicht "hier fehlt eine Zahl",
          sondern "diese Zahl haengt an einer Erfassung, die noch niemand
          macht". Der Text kommt aus datenherkunft und ist damit uebersetzbar -
          das Feld braucht am Kpi ist eine deutsche Notiz fuer die Codeseite. */}
      {lueckeZeigen && platzhalter && !kpi.gerechnet ? (
        <p className="mt-2 rounded-lg border border-dashed border-border bg-muted/30 px-2 py-1.5 text-[10px] leading-4 text-muted-foreground">
          <span className="font-semibold text-card-foreground">
            {t("luecke.titel")}
          </span>{" "}
          {t(`luecke.${lueckeSchluessel[kpi.datenherkunft]}`)}
        </p>
      ) : null}

      {/* Fuss: haengt am unteren Rand, steht dadurch in jeder Box gleich.
          Umbrechen statt kuerzen: bei drei Spalten ist eine Box rund 145 px
          breit, dort passt "Ziel > 700 ₸/kg" neben "Ziel verfehlt" nicht in
          eine Zeile. Abgeschnitten stand dort "Ziel > 700 T..." - ein halber
          Zielwert ist schlechter als eine Zeile mehr. */}
      <p className="mt-auto flex flex-wrap items-center gap-x-1.5 pt-2 text-[10px] leading-4">
        <span
          aria-hidden
          className={cn("h-1.5 w-1.5 shrink-0 rounded-full", punkt[stand])}
        />
        <span className="text-muted-foreground">
          {soll !== null ? `${homeT("target")} ${kpi.ziel}` : t("ohneZiel")}
        </span>
        <span className={cn("ml-auto shrink-0 font-semibold", schrift[stand])}>
          {platzhalter ? t("platzhalter") : t(`zielstand.${stand}`)}
        </span>
      </p>
    </div>
  );
}
