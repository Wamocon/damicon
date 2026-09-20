"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { ZoneKey } from "@/lib/modules";

// Pfad ueber dem Seitentitel. Er ersetzt die fruehere reine Textzeile
// ("FELD"), die zwar sagte, wo man steht, aber keinen Weg zurueck bot - bei
// vier Ebenen unter dem Betrieb blieb nur der Umweg ueber die Seitenleiste.
//
// Die letzte Station ist die geoeffnete Seite selbst und deshalb kein Link
// (WAI-ARIA-Muster "breadcrumb": aria-current="page"). Auf einer Modulseite
// traegt sie den Kurznamen aus dem Menue, waehrend die Ueberschrift darunter
// den vollen Titel zeigt - so wiederholt sich nichts wortgleich.
export function Brotkrumen({
  zone,
  modulKey,
}: {
  zone?: ZoneKey;
  /** Gesetzt auf einer Modulseite; fehlt auf einer Bereichsseite. */
  modulKey?: string;
}) {
  const nav = useTranslations("nav");
  const zoneT = useTranslations("zones");
  const moduleT = useTranslations("modules");

  // href fehlt genau bei der aktuellen Seite - das entscheidet zugleich
  // ueber Link oder aria-current.
  const stationen: { href?: string; text: string }[] = [
    { href: "/dashboard", text: nav("overview") },
  ];
  if (zone) {
    stationen.push({
      href: modulKey ? `/dashboard/${zone}` : undefined,
      text: zoneT(`${zone}.name`),
    });
  }
  if (zone && modulKey) {
    stationen.push({ text: moduleT(`${modulKey}.navTitle`) });
  }

  // Auf dem Handy nur eine Station: die Seite eine Ebene darueber. Der volle
  // Pfad brauchte dort zwei Zeilen ("Uebersicht > Buero > Rollen und Rechte"),
  // und die letzte Station wiederholt ohnehin die Ueberschrift direkt
  // darunter. Was bleibt, ist das, wofuer man den Pfad auf dem Handy benutzt:
  // einen Schritt zurueck.
  //
  // Beide Fassungen stehen im Markup und werden per CSS umgeschaltet, statt
  // die Fensterbreite in JavaScript zu messen - der Pfad steht auf jeder
  // Seite, und ein zweiter Renderdurchgang samt Flackern bei jedem
  // Seitenwechsel waere ein hoher Preis fuer eine Zeile.
  const eltern = [...stationen].reverse().find((station) => station.href);

  return (
    <nav aria-label={nav("breadcrumb")}>
      {eltern ? (
        <Link
          href={eltern.href!}
          className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-[0.14em] text-primary underline-offset-4 hover:underline md:hidden"
        >
          <ChevronLeft className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {eltern.text}
        </Link>
      ) : null}

      <ol className="hidden flex-wrap items-center gap-x-1.5 gap-y-1 text-xs font-black uppercase tracking-[0.14em] md:flex">
        {stationen.map((station, i) => (
          <li key={station.text} className="flex items-center gap-x-1.5">
            {i > 0 ? (
              <ChevronRight
                className="h-3 w-3 shrink-0 text-muted-foreground/70"
                aria-hidden="true"
              />
            ) : null}
            {station.href ? (
              <Link
                href={station.href}
                className="rounded-sm text-primary underline-offset-4 hover:underline"
              >
                {station.text}
              </Link>
            ) : (
              <span aria-current="page" className="text-muted-foreground">
                {station.text}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
