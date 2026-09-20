"use client";

import { useId, useSyncExternalStore } from "react";
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
  useAktiveZone,
  useZonenGruppen,
} from "@/components/dashboard/sidebar-zustand";
import { useNavZiele } from "@/components/dashboard/nav-ziele";
import { hasPermission } from "@/lib/rbac";
import {
  moduleHref,
  modulesForZone,
  zones,
  type ModuleDef,
  type ZoneDef,
  type ZoneKey,
} from "@/lib/modules";
import { cn } from "@/lib/utils";

// Die einzige Farbe im Menue ist die der offenen Seite. Sie stand an vier
// Stellen wortwoertlich da - Symbolleiste, Uebersicht, Bereichskopf und
// Moduleintrag - und muss an allen vier dieselbe sein, sonst zeigt das Menue je
// nach Ebene eine andere "aktive" Farbe. Die Regel dazu steht in DESIGN.md.
const AKTIVE_SEITE =
  "bg-primary text-primary-foreground shadow-lg shadow-primary/20";
const RUHENDE_SEITE =
  "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground";

function useIsActive() {
  const pathname = usePathname();
  return (href: string) =>
    href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname === href || pathname.startsWith(`${href}/`);
}

// Eingeklappter Zustand: Uebersicht und die vier Bereiche als Symbole. Ein
// Klick fuehrt auf die Bereichsseite, die die Module ohnehin als Kacheln
// zeigt - deshalb braucht die Leiste kein Ausklapp-Fenster, um brauchbar zu
// sein. Ohne sichtbare Beschriftung traegt jedes Ziel aria-label und title.
function SidebarRail() {
  // Die fuenf Ziele samt Rechteprüfung stehen in nav-ziele.ts. Der genaue
  // Pfad und der Bereich der geoeffneten Seite werden dort getrennt gefuehrt:
  // auf einer Modulseite gilt der Bereich als aktiv, aber nicht als
  // geoeffnete Seite - sonst zeichnete die Leiste eine Seite als "page" aus,
  // die gar nicht offen ist.
  const ziele = useNavZiele();

  const feldKlassen = (aktiv: boolean) =>
    cn(
      "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
      aktiv ? AKTIVE_SEITE : RUHENDE_SEITE,
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

// Ein Modul im aufgeklappten Bereich.
function ModulEintrag({
  module,
  onNavigate,
}: {
  module: ModuleDef;
  onNavigate?: () => void;
}) {
  const moduleT = useTranslations("modules");
  const reifegradT = useTranslations("reifegrad");
  const isActive = useIsActive();
  const href = moduleHref(module);
  const aktiv = isActive(href);
  // Im Menue der Kurzname, im Hover-Text der volle Seitentitel: ausgeschrieben
  // passt er in keiner der fuenf Sprachen in die Spalte (Kasachisch braucht
  // 326 px, verfuegbar sind 201 px).
  const titel = moduleT(`${module.key}.navTitle`);
  const vollerTitel = moduleT(`${module.key}.title`);

  return (
    <li>
      <Link
        href={href}
        onClick={onNavigate}
        aria-current={aktiv ? "page" : undefined}
        title={vollerTitel}
        className={cn(
          "flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm font-medium transition-colors",
          aktiv ? AKTIVE_SEITE : RUHENDE_SEITE,
        )}
      >
        {/* Gleiche 24px-Spur wie die Symbolkachel im Bereichskopf, nur ohne
            Grund: sonst stehen Symbol und Text der Eintraege 8 px links vom
            Bereich darueber. Nur die Breite wird uebernommen - mit h-6 waere
            die Zeile so hoch wie der Bereichskopf und die Abstufung dahin. */}
        <span className="flex h-4 w-6 shrink-0 items-center justify-center">
          <Icon name={module.icon} className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1 truncate">{titel}</span>
        {module.reifegrad === "in-entwicklung" ? (
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning"
            title={reifegradT("in-entwicklung")}
          >
            <span className="sr-only">{reifegradT("in-entwicklung")}</span>
          </span>
        ) : null}
      </Link>
    </li>
  );
}

// Rechts im Bereichskopf steht eine von zwei Angaben: die Zahl der Module,
// oder - wenn die offene Seite im zugeklappten Bereich liegt - ein Punkt in der
// Farbe der aktiven Seite. Beides ist aria-hidden: die Zahl ist Beiwerk, und wo
// man steht, sagt aria-current an der Seite selbst.
function GruppenAnzeige({
  anzahl,
  punkt,
  aufBereichsseite,
}: {
  anzahl: number;
  punkt: boolean;
  aufBereichsseite: boolean;
}) {
  // Der Punkt erscheint nur, wenn die offene Seite IM Bereich liegt, die
  // Bereichsseite selbst aber nicht offen ist - dann traegt der Kopf den
  // ruhenden Grund und der Punkt immer die Primaerfarbe. Auf der
  // Bereichsseite zeigt der Kopf seine Farbe schon selbst.
  if (punkt) {
    return (
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
        aria-hidden="true"
      />
    );
  }

  return (
    <span
      className={cn(
        "shrink-0 text-[10px] font-bold tabular-nums",
        aufBereichsseite
          ? "text-primary-foreground/80"
          : "text-muted-foreground",
      )}
      aria-hidden="true"
    >
      {anzahl}
    </span>
  );
}

// Das Chevron neben dem Bereichsnamen. Es ist das einzige Element im Menue, das
// nicht navigiert, sondern nur auf- und zuklappt - und traegt deshalb eine
// eigene Beschriftung, weil es ohne Text dasteht. 36 x 36 px, damit es neben
// dem Link ein ordentliches Ziel bleibt.
function GruppenUmschalter({
  offen,
  panelId,
  name,
  onUmschalten,
}: {
  offen: boolean;
  panelId: string;
  name: string;
  onUmschalten: () => void;
}) {
  const nav = useTranslations("nav");

  return (
    <button
      type="button"
      onClick={onUmschalten}
      aria-expanded={offen}
      aria-controls={panelId}
      aria-label={nav("toggleZone", { zone: name })}
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
  );
}

// Die Module eines Bereichs. Die Hoehe animiert ueber grid-template-rows, weil
// sich eine Hoehe von auto nicht uebergehen laesst.
function ModulListe({
  id,
  offen,
  items,
  onNavigate,
}: {
  id: string;
  offen: boolean;
  items: ModuleDef[];
  onNavigate?: () => void;
}) {
  return (
    <div
      id={id}
      className={cn(
        "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
        offen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
      )}
    >
      {/* inert nimmt die zugeklappten Links aus Tabreihenfolge und
          Vorlesereihenfolge - ohne das bleiben sie hinter der 0fr-Zeile
          erreichbar, aber unsichtbar. */}
      <div className="overflow-hidden" inert={!offen}>
        <ul className="space-y-0.5 pb-0.5">
          {items.map((module) => (
            <ModulEintrag
              key={module.key}
              module={module}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

// Ein Bereich mit seinen Modulen. Die Gruppe ist eine eigene Flaeche statt
// einer Einrueckung: Einruecken haette die Beschriftungen noch schmaler
// gemacht, und die sind schon ohne das zu knapp.
//
// Bewusst ohne Bereichsfarbe: der Rahmen trennt die Gruppen ausreichend, und
// die einzige Farbe im Menue bleibt damit die der aktiven Seite. Die Farben
// der Bereiche stehen weiterhin in modules.ts und tragen die Startseite.
function ZonenGruppe({
  zone,
  items,
  offen,
  umschalten,
  onNavigate,
}: {
  zone: ZoneDef;
  items: ModuleDef[];
  offen: boolean;
  umschalten: (zone: ZoneKey) => void;
  onNavigate?: () => void;
}) {
  const zoneT = useTranslations("zones");
  // Fuer die Bereichsseite zaehlt der genaue Pfad, nicht der Praefix aus
  // useIsActive - sonst gaelte sie auch auf jeder Modulseite als offen. Die
  // Module markieren sich als offene Seite ohnehin selbst.
  const pathname = usePathname();
  const aktiveZone = useAktiveZone();
  const panelId = useId();

  const name = zoneT(`${zone.key}.name`);
  const zonenHref = `/dashboard/${zone.key}`;
  const aufBereichsseite = pathname === zonenHref;
  // Damit ein zugeklappter Bereich zeigt, dass die offene Seite in ihm liegt -
  // sonst wirkt die Navigation ohne aktiven Eintrag.
  //
  // Dieselbe Quelle wie in SidebarRail: welcher Bereich aktiv ist, sagt allein
  // useAktiveZone(). Vorher lief das hier ueber die Modulliste der Gruppe -
  // zwei Berechnungen fuer dieselbe Frage, die auseinanderlaufen, sobald ein
  // Modul fuer die Rolle unsichtbar ist oder sich die Praefix-Regel aendert.
  // Auf der Bereichsseite traegt der Kopf schon die Farbe der aktiven Seite,
  // dort steht stattdessen weiterhin die Zahl der Module.
  const enthaeltAktives = aktiveZone === zone.key && !aufBereichsseite;
  // Auf der Bereichsseite traegt der Kopf die Farbe der aktiven Seite. Symbol
  // und Name setzen ihre Farbe selbst, deshalb hier nicht RUHENDE_SEITE.
  const symbolFarbe = aufBereichsseite
    ? "text-primary-foreground"
    : "text-muted-foreground";
  const textFarbe = aufBereichsseite
    ? "text-primary-foreground"
    : "text-sidebar-foreground";

  return (
    <li className="rounded-xl border border-sidebar-border px-1 py-0.5">
      {/* Kopf aus zwei Bedienelementen: der Name fuehrt auf die Bereichsseite,
          das Chevron klappt auf und zu. Vorher war die ganze Zeile ein
          Umschalter - dadurch waren die Bereichsseiten aus der Leiste gar
          nicht erreichbar, sondern nur ueber die Brotkrumen. */}
      <div className="flex items-center gap-1">
        <Link
          href={zonenHref}
          onClick={onNavigate}
          aria-current={aufBereichsseite ? "page" : undefined}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-2 transition-colors",
            aufBereichsseite ? AKTIVE_SEITE : "hover:bg-sidebar-accent",
          )}
        >
          <span
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center",
              symbolFarbe,
            )}
          >
            <Icon name={zone.icon} className="h-4 w-4" />
          </span>
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[11px] font-black uppercase tracking-[0.12em]",
              textFarbe,
            )}
          >
            {name}
          </span>
          {/* Aufgeklappt stehen die Module ohnehin darunter - dann sagt weder
              Zahl noch Punkt etwas, was man nicht schon sieht. */}
          {offen ? null : (
            <GruppenAnzeige
              anzahl={items.length}
              punkt={enthaeltAktives}
              aufBereichsseite={aufBereichsseite}
            />
          )}
        </Link>
        <GruppenUmschalter
          offen={offen}
          panelId={panelId}
          name={name}
          onUmschalten={() => umschalten(zone.key)}
        />
      </div>

      <ModulListe
        id={panelId}
        offen={offen}
        items={items}
        onNavigate={onNavigate}
      />
    </li>
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
// ohne Benutzerfuss. Exportiert, weil unter `md` dasselbe Menue im Blatt der
// unteren Leiste steht (untere-leiste.tsx) - dort traegt die Kopfzeile des
// Blatts schon den Titel und das Konto-Blatt die angemeldete Person, beides
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
  const isActive = useIsActive();
  const { offene, umschalten } = useZonenGruppen();

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
                isActive("/dashboard") ? AKTIVE_SEITE : RUHENDE_SEITE,
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
            // Ein Bereich ohne sichtbares Modul erscheint gar nicht - damit
            // taucht auch der Link auf seine Bereichsseite nie fuer eine
            // Rolle auf, die dort nichts zu sehen hat.
            if (items.length === 0) return null;

            return (
              <ZonenGruppe
                key={zone.key}
                zone={zone}
                items={items}
                offen={offene.includes(zone.key)}
                umschalten={umschalten}
                onNavigate={onNavigate}
              />
            );
          })}
        </ul>
    </nav>
  );
}

// Nur noch die feste Spalte ab `md`. Der mobile Teil - Menueknopf oben links
// und die Schublade von der Seite - ist entfallen: unter `md` traegt die
// untere Leiste (untere-leiste.tsx) die Navigation und zeigt denselben
// MenueBaum in einem Blatt, das von unten aufgeht. Zwei Einstiege ins gleiche
// Menue, einer davon in der am schlechtesten erreichbaren Ecke, waeren nur
// doppelt gewesen.
export function DashboardSidebar() {
  // Server rendert immer die volle Spalte. Wer sie eingeklappt hatte, sieht
  // sie nach der Hydration zusammenfahren - dieselbe Abwaegung wie bei den
  // Bereichsgruppen und bei persona.tsx.
  const schmal = useSyncExternalStore(schmalAbonnieren, istSchmal, schmalServer);

  // 19rem statt der frueheren 18rem: die Gruppenflaechen kosten etwas Breite,
  // die Beschriftungen behalten so ihre eigene.
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
