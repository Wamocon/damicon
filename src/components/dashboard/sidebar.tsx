"use client";

import {
  useCallback,
  useEffect,
  useId,
  useSyncExternalStore,
} from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, LayoutDashboard } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { DamiconLogo } from "@/components/brand/damicon-logo";
import { Icon } from "@/components/icon";
import { usePersona } from "@/components/dashboard/persona";
import {
  BenutzerFuss,
  BenutzerFussSchmal,
} from "@/components/dashboard/benutzer-fuss";
import {
  istSchmal,
  schmalAbonnieren,
  schmalServer,
} from "@/components/dashboard/sidebar-zustand";
import {
  useAktiveZone,
  useNavZiele,
} from "@/components/dashboard/nav-ziele";
import { hasPermission } from "@/lib/rbac";
import { moduleHref, modulesForZone, zones, type ZoneKey } from "@/lib/modules";
import { cn } from "@/lib/utils";

// Offene Bereichsgruppen. Gespeichert werden die OFFENEN, Standard ist "keine
// offen" - aufgeklappt wird dann nur der Bereich der gerade geoeffneten Seite.
//
// Grund ist die Hoehe: bei 1000 px Fensterhoehe stehen dem Menue rund 810 px
// zur Verfuegung, vier offene Gruppen brauchen aber gut 1200 px. "Alles offen"
// heisst also zwingend Scrollbalken, und zwar immer. Mit genau einer offenen
// Gruppe passt auch die groesste (Buero, neun Eintraege) ohne Scrollen; wer
// eine zweite aufklappt, bekommt den Balken - dann aber, weil er es so wollte.
//
// Der Store liegt auf Modulebene und nicht in einem useState, weil die Sidebar
// zweimal gleichzeitig im Baum haengt (feste Spalte ab md, Schublade darunter)
// - beide muessen denselben Zustand zeigen. Gleiches Muster wie persona.tsx.
const ZONEN_SPEICHER = "damicon-sidebar-bereiche";
const KEINE_ZONEN: readonly ZoneKey[] = [];
const zonenListener = new Set<() => void>();
let zonenCache: readonly ZoneKey[] | null = null;
// Bereich, fuer den das automatische Aufklappen schon gelaufen ist. Bewusst
// auf Modulebene und nicht als useRef: sonst klappt die Schublade beim
// Oeffnen den Bereich erneut auf, den man an der festen Spalte eben
// zugeklappt hat.
let zuletztGeoeffnet: ZoneKey | null = null;

function zonenAbonnieren(callback: () => void) {
  zonenListener.add(callback);
  return () => {
    zonenListener.delete(callback);
  };
}

// useSyncExternalStore verlangt eine stabile Referenz. Bei jedem Aufruf neu zu
// parsen ergaebe jedes Mal ein neues Array und schickt React in eine
// Endlosschleife - deshalb der Cache, der nur beim Schreiben erneuert wird.
function offeneZonen(): readonly ZoneKey[] {
  if (zonenCache) return zonenCache;
  let gelesen: readonly ZoneKey[] = KEINE_ZONEN;
  try {
    const roh = localStorage.getItem(ZONEN_SPEICHER);
    const werte: unknown = roh ? JSON.parse(roh) : null;
    if (Array.isArray(werte)) {
      gelesen = werte.filter((wert): wert is ZoneKey =>
        zones.some((zone) => zone.key === wert),
      );
    }
  } catch {
    // ignore
  }
  zonenCache = gelesen;
  return gelesen;
}

function zonenSetzen(naechste: readonly ZoneKey[]) {
  zonenCache = naechste;
  try {
    localStorage.setItem(ZONEN_SPEICHER, JSON.stringify(naechste));
  } catch {
    // ignore
  }
  zonenListener.forEach((listener) => listener());
}

function useIsActive() {
  const pathname = usePathname();
  return (href: string) =>
    href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname === href || pathname.startsWith(`${href}/`);
}

function useZonenGruppen() {
  const aktiveZone = useAktiveZone();
  const offene = useSyncExternalStore(
    zonenAbonnieren,
    offeneZonen,
    () => KEINE_ZONEN,
  );

  // Der Bereich der geoeffneten Seite klappt auf - sonst stuende man auf einer
  // Seite, die in der Navigation nicht zu sehen ist.
  //
  // Nur beim Wechsel des Bereichs, nicht bei jeder Aenderung von "offene":
  // sonst springt der Bereich, in dem man gerade steht, sofort wieder auf und
  // liesse sich ueberhaupt nicht zuklappen.
  useEffect(() => {
    if (!aktiveZone || zuletztGeoeffnet === aktiveZone) return;
    zuletztGeoeffnet = aktiveZone;
    const aktuell = offeneZonen();
    if (!aktuell.includes(aktiveZone)) {
      zonenSetzen([...aktuell, aktiveZone]);
    }
  }, [aktiveZone]);

  const umschalten = useCallback((zone: ZoneKey) => {
    const aktuell = offeneZonen();
    zonenSetzen(
      aktuell.includes(zone)
        ? aktuell.filter((eintrag) => eintrag !== zone)
        : [...aktuell, zone],
    );
  }, []);

  return { offene, umschalten };
}

// Eingeklappter Zustand: Uebersicht und die vier Bereiche als Symbole. Ein
// Klick fuehrt auf die Bereichsseite, die die Module ohnehin als Kacheln
// zeigt - deshalb braucht die Leiste kein Ausklapp-Fenster, um brauchbar zu
// sein. Ohne sichtbare Beschriftung traegt jedes Ziel aria-label und title.
function SidebarRail() {
  // Dieselben fuenf Ziele wie die untere Leiste auf dem Handy, aus einer
  // Quelle (nav-ziele.ts). Der genaue Pfad und der Bereich der geoeffneten
  // Seite werden dort getrennt gefuehrt: auf einer Modulseite gilt der Bereich
  // als aktiv, aber nicht als geoeffnete Seite.
  const ziele = useNavZiele();

  const feldKlassen = (aktiv: boolean) =>
    cn(
      "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
      aktiv
        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
        : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground",
    );

  return (
    <div className="flex h-full min-h-0 flex-col items-center gap-2 p-2">
      <Link href="/" aria-label="Damicon" title="Damicon" className="mt-1">
        <DamiconLogo className="shadow-lg shadow-primary/20" />
      </Link>

      <div className="h-px w-8 bg-sidebar-border" />

      <nav className="flex min-h-0 flex-1 flex-col items-center gap-1.5 overflow-y-auto">
        {ziele.map((ziel) => (
          <Link
            key={ziel.key}
            href={ziel.href}
            aria-label={ziel.name}
            title={ziel.name}
            aria-current={
              ziel.aktuelleSeite ? "page" : ziel.imZiel ? "true" : undefined
            }
            className={feldKlassen(ziel.imZiel)}
          >
            <Icon name={ziel.icon} className="h-4 w-4" />
          </Link>
        ))}
      </nav>

      <BenutzerFussSchmal />
    </div>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const nav = useTranslations("nav");

  return (
    <div className="flex h-full min-h-0 flex-col p-4">
      {/* Der Umschalter sitzt in der Kopfzeile, nicht hier: dort steht er an
          derselben Stelle, ob die Leiste nun schmal oder breit ist. */}
      <Link href="/" className="flex items-center gap-2.5" onClick={onNavigate}>
        <DamiconLogo className="shadow-lg shadow-primary/20" />
        <span className="min-w-0">
          <span className="block text-lg font-black leading-tight text-sidebar-foreground">
            Damicon
          </span>
          <span className="block truncate text-[11px] font-semibold text-muted-foreground">
            {nav("platformSubtitle")}
          </span>
        </span>
      </Link>

      <MenueBaum onNavigate={onNavigate} className="mt-4" />

      <BenutzerFuss onNavigate={onNavigate} />
    </div>
  );
}

// Der Baum aus "Uebersicht" und den vier Bereichsgruppen, ohne Bildmarke und
// ohne Benutzerfuss. Exportiert, weil unter `md` dasselbe Menue im Sheet der
// unteren Leiste steht (untere-leiste.tsx) - dort traegt die Kopfzeile des
// Sheets schon den Titel und das Konto-Sheet die angemeldete Person, beides
// staende sonst doppelt da.
export function MenueBaum({
  onNavigate,
  className,
}: {
  onNavigate?: () => void;
  className?: string;
}) {
  const { role } = usePersona();
  const nav = useTranslations("nav");
  const zoneT = useTranslations("zones");
  const moduleT = useTranslations("modules");
  const reifegradT = useTranslations("reifegrad");
  const isActive = useIsActive();
  // Fuer die Bereichsseite zaehlt der genaue Pfad, nicht der Praefix aus
  // useIsActive - sonst gaelte sie auch auf jeder Modulseite als offen.
  const pathname = usePathname();
  const { offene, umschalten } = useZonenGruppen();
  const gruppenId = useId();

  return (
    <nav className={cn("min-h-0 flex-1 overflow-y-auto pr-1", className)}>
        <ul className="space-y-1.5">
          {/* "Uebersicht" steht auf derselben Ebene wie die vier Bereiche und
              bekommt deshalb dieselbe Flaeche - ohne sie haengt die Zeile lose
              ueber vier Karten. */}
          <li className="rounded-xl border border-sidebar-border px-1 py-0.5">
            <Link
              href="/dashboard"
              onClick={onNavigate}
              aria-current={isActive("/dashboard") ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm font-semibold transition-colors",
                isActive("/dashboard")
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground",
              )}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center">
                <LayoutDashboard className="h-4 w-4" />
              </span>
              {nav("overview")}
            </Link>
          </li>

          {zones.map((zone) => {
            const items = modulesForZone(zone.key).filter((module) =>
              hasPermission(role, module.resource, "view"),
            );
            if (items.length === 0) return null;

            const offen = offene.includes(zone.key);
            const panelId = `${gruppenId}-${zone.key}`;
            const zonenHref = `/dashboard/${zone.key}`;
            // Nur die Bereichsseite selbst, nicht alles darunter: die Module
            // markieren sich als offene Seite schon selbst.
            const aufBereichsseite = pathname === zonenHref;
            // Damit ein zugeklappter Bereich zeigt, dass die offene Seite in
            // ihm liegt - sonst wirkt die Navigation ohne aktiven Eintrag.
            const enthaeltAktives = items.some((module) =>
              isActive(moduleHref(module)),
            );

            return (
              // Die Gruppe ist eine eigene Flaeche statt einer Einrueckung:
              // Einruecken haette die Beschriftungen noch schmaler gemacht,
              // und die sind schon ohne das zu knapp.
              //
              // Bewusst ohne Bereichsfarbe: der Rahmen trennt die Gruppen
              // ausreichend, und die einzige Farbe im Menue bleibt damit die
              // der aktiven Seite. Die Farben der Bereiche stehen weiterhin in
              // modules.ts und tragen die Startseite.
              <li
                key={zone.key}
                className="rounded-xl border border-sidebar-border px-1 py-0.5"
              >
                {/* Kopf aus zwei Bedienelementen: der Name fuehrt auf die
                    Bereichsseite, das Chevron klappt auf und zu. Vorher war
                    die ganze Zeile ein Umschalter - dadurch waren die
                    Bereichsseiten aus der Leiste gar nicht erreichbar,
                    sondern nur ueber die Brotkrumen. */}
                <div className="flex items-center gap-1">
                  <Link
                    href={zonenHref}
                    onClick={onNavigate}
                    aria-current={aufBereichsseite ? "page" : undefined}
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-2 transition-colors",
                      aufBereichsseite
                        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                        : "hover:bg-sidebar-accent",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center",
                        aufBereichsseite
                          ? "text-primary-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      <Icon name={zone.icon} className="h-4 w-4" />
                    </span>
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-[11px] font-black uppercase tracking-[0.12em]",
                        aufBereichsseite
                          ? "text-primary-foreground"
                          : "text-sidebar-foreground",
                      )}
                    >
                      {zoneT(`${zone.key}.name`)}
                    </span>
                    {offen ? null : enthaeltAktives ? (
                      // Der Punkt sagt "die offene Seite liegt hier drin" und
                      // traegt deshalb die Farbe der aktiven Seite.
                      <span
                        className={cn(
                          "h-1.5 w-1.5 shrink-0 rounded-full",
                          aufBereichsseite
                            ? "bg-primary-foreground"
                            : "bg-primary",
                        )}
                        aria-hidden="true"
                      />
                    ) : (
                      <span
                        className={cn(
                          "shrink-0 text-[10px] font-bold tabular-nums",
                          aufBereichsseite
                            ? "text-primary-foreground/80"
                            : "text-muted-foreground",
                        )}
                        aria-hidden="true"
                      >
                        {items.length}
                      </span>
                    )}
                  </Link>
                  <button
                    type="button"
                    onClick={() => umschalten(zone.key)}
                    aria-expanded={offen}
                    aria-controls={panelId}
                    aria-label={nav("toggleZone", {
                      zone: zoneT(`${zone.key}.name`),
                    })}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  >
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 transition-transform duration-200 motion-reduce:transition-none",
                        !offen && "-rotate-90",
                      )}
                      aria-hidden="true"
                    />
                  </button>
                </div>

                <div
                  id={panelId}
                  className={cn(
                    "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
                    offen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                  )}
                >
                  {/* inert nimmt die zugeklappten Links aus Tabreihenfolge und
                      Vorlesereihenfolge - ohne das bleiben sie hinter der
                      0fr-Zeile erreichbar, aber unsichtbar. */}
                  <div className="overflow-hidden" inert={!offen}>
                    <ul className="space-y-0.5 pb-0.5">
                      {items.map((module) => {
                        const href = moduleHref(module);
                        const aktiv = isActive(href);
                        // Im Menue der Kurzname, im Hover-Text der volle
                        // Seitentitel: ausgeschrieben passt er in keiner der
                        // fuenf Sprachen in die Spalte (Kasachisch braucht
                        // 326 px, verfuegbar sind 201 px).
                        const titel = moduleT(`${module.key}.navTitle`);
                        const vollerTitel = moduleT(`${module.key}.title`);
                        return (
                          <li key={module.key}>
                            <Link
                              href={href}
                              onClick={onNavigate}
                              aria-current={aktiv ? "page" : undefined}
                              title={vollerTitel}
                              className={cn(
                                "flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm font-medium transition-colors",
                                aktiv
                                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground",
                              )}
                            >
                              {/* Gleiche 24px-Spur wie die Symbolkachel im
                                  Bereichskopf, nur ohne Grund: sonst stehen
                                  Symbol und Text der Eintraege 8 px links
                                  vom Bereich darueber. Nur die Breite wird
                                  uebernommen - mit h-6 waere die Zeile so
                                  hoch wie der Bereichskopf und die
                                  Abstufung dahin. */}
                              <span className="flex h-4 w-6 shrink-0 items-center justify-center">
                                <Icon name={module.icon} className="h-4 w-4" />
                              </span>
                              <span className="min-w-0 flex-1 truncate">
                                {titel}
                              </span>
                              {module.reifegrad === "in-entwicklung" ? (
                                <span
                                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning"
                                  title={reifegradT("in-entwicklung")}
                                >
                                  <span className="sr-only">
                                    {reifegradT("in-entwicklung")}
                                  </span>
                                </span>
                              ) : null}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
    </nav>
  );
}

// Nur noch die feste Spalte ab `md`. Der mobile Teil - Menueknopf oben links
// und die Schublade von der Seite - ist entfallen: unter `md` traegt die
// untere Leiste (untere-leiste.tsx) die Navigation und zeigt dasselbe Menue
// in einem Sheet, das von unten aufgeht. Zwei Einstiege ins gleiche Menue,
// einer davon in der am schlechtesten erreichbaren Ecke, waeren nur doppelt
// gewesen.
export function DashboardSidebar() {
  // Server rendert immer die volle Spalte. Wer sie eingeklappt hatte, sieht
  // sie nach der Hydration zusammenfahren - dieselbe Abwaegung wie bei den
  // Bereichsgruppen und bei persona.tsx.
  const schmal = useSyncExternalStore(schmalAbonnieren, istSchmal, schmalServer);

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-svh shrink-0 self-start overflow-hidden border-r border-sidebar-border bg-sidebar/95 backdrop-blur-xl md:block print:hidden",
        "transition-[width] duration-200 ease-out motion-reduce:transition-none",
        schmal ? "w-16" : "w-76",
      )}
    >
      {schmal ? <SidebarRail /> : <SidebarBody />}
    </aside>
  );
}
