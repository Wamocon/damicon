import type { ComponentProps, ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { DetailpanelSteuerung, LadeMelder } from "@/components/ui/detailpanel-steuerung";

// Liste mit Detailansicht (DESIGN.md Abschnitt 14, WMCNL-2488). Eine Liste,
// deren Eintraege per Klick rechts eine Detailansicht oeffnen. Zuerst gebaut
// fuer die Pflueckaufgaben; Reklamationen (WMCNL-2489) und die langen Listen
// der uebrigen Module (WMCNL-2491) sollen darauf aufsetzen.
//
// Alles hier ist Server-tauglich: Auswahl, Seite und Filter stehen in der
// Adresse, jeder Wechsel ist ein Link. Was im Browser laufen muss - Esc,
// Fokus, Ladeanzeige -, steckt in detailpanel-steuerung.tsx.

type Ziel = ComponentProps<typeof Link>["href"];

const BEHAELTER_ID = "liste-mit-detailpanel";

/**
 * Behaelter fuer Liste und Detailansicht. Wie die Detailansicht steht,
 * entscheidet die freie Breite des Behaelters (Container-Abfrage), nicht die
 * Fensterbreite - siehe die Varianten panel-* in globals.css:
 *
 *   angedockt  rechts neben der Liste, die bedienbar bleibt;
 *   schublade  ueber der Liste, im Hauptbereich und mitscrollend;
 *   ersetzt    an Stelle der Liste, mit "Liste" zurueck.
 */
export function ListeMitDetailpanel({
  liste,
  panel,
  auswahlId,
  listenSchluessel,
  schliessenZiel,
}: {
  liste: ReactNode;
  /** Die Detailansicht, oder null bei keiner Auswahl. */
  panel: ReactNode | null;
  auswahlId: string | null;
  /** Query der Liste ohne Auswahl und Reiter, fuer die Zurueck-Logik. */
  listenSchluessel: string;
  /** Adresse der Liste ohne Auswahl (Pfad ohne Sprache, mit Query). */
  schliessenZiel: string;
}) {
  const offen = panel !== null;
  return (
    <div id={BEHAELTER_ID} className="@container/liste">
      <div
        className={cn(
          "grid items-start gap-6",
          offen && "panel-angedockt:grid-cols-[minmax(0,1fr)_var(--detailpanel-breite)]",
        )}
      >
        <div className={cn("col-start-1 row-start-1 min-w-0", offen && "panel-ersetzt:hidden")}>
          {liste}
        </div>
        {offen ? (
          <div
            className={cn(
              "col-start-1 row-start-1 min-w-0",
              "panel-angedockt:sticky panel-angedockt:top-20 panel-angedockt:col-start-2",
              // Ueber der Liste, aber unter Kopfzeile (z-40) und unterer
              // Leiste (z-50): die Schublade gehoert zur Seite, nicht darueber.
              "panel-schublade:sticky panel-schublade:top-20 panel-schublade:z-20",
              "panel-schublade:w-[min(var(--detailpanel-breite),100%)] panel-schublade:justify-self-end",
            )}
          >
            {panel}
          </div>
        ) : null}
      </div>
      <DetailpanelSteuerung
        auswahlId={auswahlId}
        listenSchluessel={listenSchluessel}
        schliessenZiel={schliessenZiel}
        behaelterId={BEHAELTER_ID}
      />
    </div>
  );
}

/**
 * Ein Eintrag der Liste, als Link auf seine Detailansicht. Bleibt ein <a>,
 * dessen Name den Code enthaelt: danach suchen die Ende-zu-Ende-Tests, und
 * eine Vorlesehilfe liest die ganze Karte als einen Link.
 */
export function ListenEintrag({
  id,
  ziel,
  aktiv,
  ersetzen,
  children,
}: {
  id: string;
  ziel: Ziel;
  aktiv: boolean;
  /** Ist schon eine Aufgabe offen, ersetzt der Wechsel den Verlaufseintrag. */
  ersetzen: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      id={`eintrag-${id}`}
      data-eintrag=""
      href={ziel}
      scroll={false}
      // Vorladen je Zeile hiesse 20 Serveranfragen beim Oeffnen der Seite.
      // Ohne Vorladen zeigt useLinkStatus verlaesslich, dass geladen wird.
      prefetch={false}
      replace={ersetzen}
      aria-current={aktiv ? "true" : undefined}
      className={cn(
        "relative block w-full scroll-mt-24 rounded-xl border p-4 text-left transition duration-knapp",
        aktiv
          ? "border-primary bg-primary/5"
          : "border-border bg-card hover:border-primary/40",
      )}
    >
      {children}
      <LadeMelder bereich="detailpanel" />
    </Link>
  );
}

/**
 * "‹ Zurueck · Seite 2 von 6 · Weiter ›". Links auf die Nachbarseiten, sonst
 * nichts. Anders als Filter und Auswahl scrollen sie: der Knopf steht unter
 * der Liste, und die naechste Seite beginnt oben. Das Ziel sollte deshalb auf
 * den Anfang der Liste zeigen (hash), sonst landet man am Seitenkopf.
 */
export function Blaettern({
  seite,
  seiten,
  ziel,
}: {
  seite: number;
  seiten: number;
  ziel: (seite: number) => Ziel;
}) {
  const t = useTranslations("liste.blaettern");
  if (seiten <= 1) return null;

  const knopf =
    "relative inline-flex min-h-11 items-center gap-1 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground transition duration-knapp hover:border-primary/40 lg:min-h-9 lg:text-xs";
  const gesperrt =
    "inline-flex min-h-11 items-center gap-1 rounded-lg border border-border px-3 text-sm font-semibold text-muted-foreground opacity-50 lg:min-h-9 lg:text-xs";

  return (
    // Mittig statt an den Raendern: unten rechts steht Himbi (haustier.css)
    // und laege sonst ueber "Weiter".
    <nav aria-label={t("label")} className="flex items-center justify-center gap-3 pt-1">
      {seite > 1 ? (
        <Link href={ziel(seite - 1)} prefetch={false} className={knopf}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          {t("zurueck")}
          <LadeMelder bereich="liste" />
        </Link>
      ) : (
        <span aria-disabled="true" className={gesperrt}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          {t("zurueck")}
        </span>
      )}
      <span className="schrift-label font-semibold text-muted-foreground tabular-nums">
        {t("stand", { seite, seiten })}
      </span>
      {seite < seiten ? (
        <Link href={ziel(seite + 1)} prefetch={false} className={knopf}>
          {t("weiter")}
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
          <LadeMelder bereich="liste" />
        </Link>
      ) : (
        <span aria-disabled="true" className={gesperrt}>
          {t("weiter")}
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </span>
      )}
    </nav>
  );
}

/** Leere Liste: sagt, warum, und bietet den naechsten Schritt an. */
export function LeererZustand({
  titel,
  text,
  aktion,
}: {
  titel: string;
  text?: string;
  aktion?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border p-6 text-center">
      <p className="text-sm font-semibold text-card-foreground">{titel}</p>
      {text ? <p className="mt-1 schrift-dense text-muted-foreground">{text}</p> : null}
      {aktion ? <div className="mt-3 flex justify-center">{aktion}</div> : null}
    </div>
  );
}
