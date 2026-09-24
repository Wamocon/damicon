"use client";

import { useTranslations } from "next-intl";
import { ChevronRight, House } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useSeitenPfad, type PfadStation } from "@/components/dashboard/nav-ziele";
import { cn } from "@/lib/utils";

function PfadListe({
  stationen,
  className,
}: {
  stationen: PfadStation[];
  className?: string;
}) {
  const nav = useTranslations("nav");

  // Der Pfad steht in einem gerahmten Feld, wie die uebrigen Bedienelemente
  // der Kopfzeile. Gemischte Schreibung statt Versalien mit Sperrung: der Pfad
  // ist hier eine Bedienung und keine Ueberschriftenzeile mehr.
  //
  // Die Farbgebung ist umgedreht gegenueber der frueheren Zeile ueber der
  // Ueberschrift: der Weg dorthin ist gedaempft, die offene Seite traegt die
  // volle Textfarbe. Das gilt auch fuer das Haus - auf der Uebersicht ist es
  // dunkel, auf jeder anderen Seite ein gedaempfter Link.
  return (
    <nav
      aria-label={nav("breadcrumb")}
      className={cn(
        "h-9 items-center rounded-lg border border-border bg-card",
        stationen.length === 1
          ? // Auf der Uebersicht ist das Haus die einzige Station. Das Feld
            // umschliesst es dann quadratisch wie die uebrigen Symbolknoepfe
            // der Kopfzeile, statt als breite Pille mit Luft danebenzustehen.
            "w-9 justify-center"
          : // Sonst ein Boden: wird die Kopfzeile eng, etwa mit angedocktem
            // KI-Panel, schrumpfte der Pfad ohne ihn auf null und waere weg.
            "min-w-24 px-2.5",
        className,
      )}
    >
      <ol className="flex h-full min-w-0 items-center gap-x-1.5 text-sm">
        {/* Nur die offene Seite darf schrumpfen. Ohne shrink-0 an den
            Stationen davor geben bei 1100 px alle gleichzeitig nach: der
            Trenner verschwindet und die Woerter kleben aneinander. */}
        {stationen.map((station, i) => {
          const letzte = i === stationen.length - 1;
          const inhalt = station.alsHaus ? (
            <>
              <House aria-hidden="true" className="h-4 w-4" />
              <span className="sr-only">{station.text}</span>
            </>
          ) : (
            station.text
          );
          return (
            <li
              key={station.text}
              className={cn(
                "flex items-center gap-x-1.5",
                letzte ? "min-w-0" : "shrink-0",
              )}
            >
              {i > 0 ? (
                <ChevronRight
                  aria-hidden="true"
                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60"
                />
              ) : null}
              {station.href ? (
                <Link
                  href={station.href}
                  title={station.alsHaus ? station.text : undefined}
                  className={cn(
                    "shrink-0 rounded-sm text-muted-foreground transition-colors hover:text-foreground",
                    station.alsHaus
                      ? "inline-flex items-center justify-center"
                      : "font-medium",
                  )}
                >
                  {inhalt}
                </Link>
              ) : (
                <span
                  aria-current="page"
                  title={station.alsHaus ? station.text : undefined}
                  className={cn(
                    "font-semibold text-foreground",
                    station.alsHaus
                      ? "inline-flex shrink-0 items-center justify-center"
                      : "min-w-16 truncate",
                  )}
                >
                  {inhalt}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Der Pfad in der Kopfzeile, rechts neben dem Einklappknopf. Anders als die
 * frueher ueber der Ueberschrift stehende Zeile scrollt er nicht mit dem
 * Inhalt weg - gebraucht wird er genau dann, wenn man mitten auf einer langen
 * Modulseite steht.
 *
 * Wird es eng, faellt die mittlere Station weg, bevor die offene Seite
 * abgeschnitten wird. Bei 900 px stand sonst "Haus > Bereich" da und genau
 * die Seite fehlte, auf der man ist. Gemessen passt der volle Pfad ab
 * 1280 px, darunter nicht mehr - nachgemessen am 24.09.2026 mit der Lupe
 * neben der Glocke, ausgeklappter Seitenleiste, "Ansicht als" und dem
 * laengsten Modulnamen in allen vier Sprachen.
 *
 * Erst ab md. Darunter traegt die Kopfzeile den einstufigen Rueckweg
 * (topbar.tsx), der auf 390 px in eine Zeile passt.
 */
export function TopbarPfad() {
  const stationen = useSeitenPfad();
  // Endet der Pfad mit einem Link statt mit der geoeffneten Seite, kennt die
  // Ableitung den Namen dieser Seite nicht - etwa auf /dashboard/sicherheit.
  // Ein Haus allein saehe dort aus wie die Uebersicht. Diese Seiten trugen
  // auch vorher keine Brotkrumen; den Weg zurueck haben sie ueber die
  // Seitenleiste.
  if (stationen.length === 0 || stationen[stationen.length - 1]!.href) {
    return null;
  }

  if (stationen.length === 3) {
    return (
      <>
        <PfadListe stationen={stationen} className="hidden xl:flex" />
        <PfadListe
          stationen={[stationen[0]!, stationen[2]!]}
          className="hidden md:flex xl:hidden"
        />
      </>
    );
  }

  return <PfadListe stationen={stationen} className="hidden md:flex" />;
}
