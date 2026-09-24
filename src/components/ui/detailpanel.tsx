import type { ComponentProps, ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import {
  LadeMelder,
  PanelInhalt,
  PanelLadebalken,
  PanelSchliessen,
} from "@/components/ui/detailpanel-steuerung";

// Die Huelle der Detailansicht (DESIGN.md Abschnitt 14, WMCNL-2488): Kopf mit
// Titel, Status, Pfeilen und Schliessen, darunter Reiter und Inhalt. Was
// darin steht, liefert das Modul.
//
// Im Code heisst sie Detailpanel, in allen Texten fuer Nutzer
// "Detailansicht". "Seitenpanel" ist in DESIGN.md schon der KI-Chat.

type Ziel = ComponentProps<typeof Link>["href"];

export function Detailpanel({
  titel,
  kopfZusatz,
  schliessenZiel,
  vorher,
  nachher,
  reiter,
  inhaltSchluessel,
  children,
}: {
  /** Name der Region, etwa "Pflückaufgabe PA-2026-0912-01". */
  titel: string;
  /** Status, Faelligkeit und Aehnliches unter dem Titel. */
  kopfZusatz?: ReactNode;
  schliessenZiel: Ziel;
  vorher?: Ziel;
  nachher?: Ziel;
  reiter?: ReactNode;
  /**
   * Wechselt der Schluessel, faengt der Inhalt neu an. Aufgabe und Reiter
   * gehoeren hinein: sonst wanderten Formularmeldungen und halb getippte
   * Werte zur naechsten Aufgabe mit - Next.js behaelt beim Wechsel eines
   * Suchparameters den Zustand der Seite.
   */
  inhaltSchluessel: string;
  children: ReactNode;
}) {
  const t = useTranslations("liste.panel");

  const pfeil =
    "relative inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition duration-knapp hover:bg-muted hover:text-foreground lg:h-9 lg:w-9";
  const pfeilGesperrt =
    "inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground opacity-40 lg:h-9 lg:w-9";

  return (
    <section
      id="detailpanel"
      data-detailpanel=""
      aria-labelledby="detailpanel-titel"
      className={cn(
        "flex min-w-0 flex-col rounded-2xl border border-border bg-card-deckend shadow-sm shadow-black/3",
        "panel-angedockt:max-h-[calc(100svh-6rem)]",
        "panel-schublade:max-h-[calc(100svh-6rem)] panel-schublade:shadow-2xl panel-schublade:shadow-black/20",
        "panel-schublade:motion-safe:animate-[detailpanel-auf_200ms_ease-out]",
      )}
    >
      <header
        className={cn(
          "relative border-b border-border p-4 pb-3",
          // Wo die Detailansicht die Liste ersetzt, scrollt die Seite; der
          // Kopf mit dem Weg zurueck bleibt dann unter der Kopfzeile stehen
          // (56 px hoch unter md, 64 px darueber). top-* nur zusammen mit
          // sticky: am relativ positionierten Kopf verschoebe es ihn sonst.
          "panel-ersetzt:sticky panel-ersetzt:top-14 md:panel-ersetzt:top-16",
          "panel-ersetzt:z-10 panel-ersetzt:rounded-t-2xl panel-ersetzt:bg-card-deckend",
        )}
      >
        <PanelSchliessen
          ziel={schliessenZiel}
          art="liste"
          label={t("zurListe")}
          className="-ml-1 mb-1 hidden panel-ersetzt:inline-flex"
        />
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 pt-1">
            <h2
              id="detailpanel-titel"
              tabIndex={-1}
              className="wrap-break-word text-base font-black text-card-foreground outline-none"
            >
              {titel}
            </h2>
            {kopfZusatz ? (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">{kopfZusatz}</div>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center">
            {vorher ? (
              <Link
                href={vorher}
                replace
                scroll={false}
                prefetch={false}
                aria-label={t("vorheriger")}
                title={t("vorheriger")}
                className={pfeil}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                <LadeMelder bereich="detailpanel" className="right-1 top-1" />
              </Link>
            ) : (
              <span aria-hidden="true" className={pfeilGesperrt}>
                <ChevronLeft className="h-4 w-4" />
              </span>
            )}
            {nachher ? (
              <Link
                href={nachher}
                replace
                scroll={false}
                prefetch={false}
                aria-label={t("naechster")}
                title={t("naechster")}
                className={pfeil}
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
                <LadeMelder bereich="detailpanel" className="right-1 top-1" />
              </Link>
            ) : (
              <span aria-hidden="true" className={pfeilGesperrt}>
                <ChevronRight className="h-4 w-4" />
              </span>
            )}
            <PanelSchliessen
              ziel={schliessenZiel}
              art="kreuz"
              label={t("schliessen")}
              className="panel-ersetzt:hidden"
            />
          </div>
        </div>
        <PanelLadebalken />
      </header>
      {reiter ? <div className="border-b border-border px-4 py-3">{reiter}</div> : null}
      <PanelInhalt key={inhaltSchluessel}>{children}</PanelInhalt>
    </section>
  );
}
