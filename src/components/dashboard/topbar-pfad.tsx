"use client";

import { useTranslations } from "next-intl";
import { ChevronRight, House, Search } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { moduleByPath, zones } from "@/lib/modules";
import { cn } from "@/lib/utils";

interface Station {
  /** Fehlt genau bei der offenen Seite - das entscheidet ueber Link oder
   *  aria-current, wie im WAI-ARIA-Muster "breadcrumb". */
  href?: string;
  text: string;
  /** Die Uebersicht steht als Haus statt als Wort und spart damit rund
   *  110 px - genau dort, wo die Kopfzeile eng wird. */
  alsHaus?: boolean;
}

/**
 * Der Pfad wird aus dem Adresspfad abgeleitet und nicht von der Seite
 * gereicht: die Kopfzeile liegt ausserhalb der Seite und kann nichts
 * entgegennehmen. Genauso arbeitet useElternSeite() in nav-ziele.ts, das den
 * einstufigen Rueckweg auf dem Handy traegt. Beide muessen dasselbe Ergebnis
 * liefern.
 */
function useBrotkrumenPfad(): Station[] {
  const pathname = usePathname();
  const nav = useTranslations("nav");
  const zoneT = useTranslations("zones");
  const moduleT = useTranslations("modules");

  // Ohne Sprachpraefix, das nimmt usePathname aus @/i18n/navigation schon weg.
  const segmente = pathname.split("/").filter(Boolean);
  if (segmente[0] !== "dashboard") return [];

  const haus: Station = {
    href: segmente.length > 1 ? "/dashboard" : undefined,
    text: nav("overview"),
    alsHaus: true,
  };
  if (segmente.length === 1) return [haus];

  // Seiten neben den Bereichen, etwa /dashboard/sicherheit: dort gibt es
  // keinen benannten Weg, und ein Haus allein saehe aus wie die Uebersicht.
  // Diese Seiten trugen auch vorher keine Brotkrumen.
  const zone = zones.find((z) => z.key === segmente[1]);
  if (!zone) return [];

  const modul = segmente[2] ? moduleByPath(zone.key, segmente[2]) : null;
  const stationen: Station[] = [
    haus,
    {
      href: modul ? `/dashboard/${zone.key}` : undefined,
      text: zoneT(`${zone.key}.name`),
    },
  ];
  if (modul) stationen.push({ text: moduleT(`${modul.key}.navTitle`) });
  return stationen;
}

function PfadListe({
  stationen,
  className,
}: {
  stationen: Station[];
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
          : // Sonst ein Boden: ohne ihn schrumpft der Pfad neben dem
            // wachsenden Suchfeld auf null und ist schlicht weg.
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
 * Der Pfad in der Kopfzeile, zwischen Einklappknopf und Suche. Anders als die
 * frueher ueber der Ueberschrift stehende Zeile scrollt er nicht mit dem
 * Inhalt weg - gebraucht wird er genau dann, wenn man mitten auf einer langen
 * Modulseite steht.
 *
 * Wird es eng, faellt die mittlere Station weg, bevor die offene Seite
 * abgeschnitten wird. Bei 900 px stand sonst "Haus > Bereich" da und genau
 * die Seite fehlte, auf der man ist. Gemessen passt der volle Pfad ab
 * 1280 px, darunter nicht mehr.
 *
 * Erst ab md. Darunter traegt die Kopfzeile den einstufigen Rueckweg
 * (topbar.tsx), der auf 390 px in eine Zeile passt.
 */
export function TopbarPfad() {
  const stationen = useBrotkrumenPfad();
  if (stationen.length === 0) return null;

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

// Die Suche ist bis heute eine Attrappe (Punkt 1 des UX-Audits, PT-D-07 im
// UI-Bericht). Form und Ort aendern sich hier, die Funktion nicht.
const suchStil =
  "items-center rounded-lg border border-border bg-card text-muted-foreground";

/**
 * Das Suchfeld, erst ab xl. Es waechst in die Luecke zwischen Pfad und
 * Werkzeugen. Darunter uebernimmt TopbarSuchknopf.
 */
export function TopbarSuche() {
  const t = useTranslations("dashboard");
  return (
    <div className={cn("hidden min-w-0 flex-1 gap-2 px-3 py-2 text-sm xl:flex", suchStil)}>
      <Search className="h-4 w-4 shrink-0" />
      <span className="truncate">{t("searchPlaceholder")}</span>
    </div>
  );
}

/**
 * Der Suchknopf unterhalb von xl. Er steht rechts bei den uebrigen
 * Werkzeugen und nicht neben dem Pfad: dort waere er ein einzelnes Symbol
 * mitten in der Zeile, hier reiht er sich bei Sprache und Farbschema ein.
 */
export function TopbarSuchknopf() {
  const t = useTranslations("dashboard");
  return (
    <span
      aria-hidden
      title={t("searchPlaceholder")}
      className={cn("hidden h-9 w-9 shrink-0 justify-center md:inline-flex xl:hidden", suchStil)}
    >
      <Search className="h-4 w-4" />
    </span>
  );
}
