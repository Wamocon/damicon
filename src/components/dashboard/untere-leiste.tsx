"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { LayoutGrid, UserRound } from "lucide-react";
import { Icon } from "@/components/icon";
import { useBlatt } from "@/components/dashboard/blatt-kontext";
import {
  useModulZiele,
  useNavZiele,
  type ModulZiel,
  type NavZiel,
} from "@/components/dashboard/nav-ziele";
import { KontoBlatt } from "@/components/dashboard/konto-blatt";
import { useAktiveZone } from "@/components/dashboard/sidebar-zustand";
import { useHaustierStatus } from "@/components/haustier/haustier-kontext";
import { Himbi } from "@/components/haustier/himbi";
import { Himbeere } from "@/components/ki/himbeere";
import { useKiPane } from "@/components/ki/ki-pane-kontext";
import { BlattZeile } from "@/components/ui/blatt-zeile";
import { Sheet } from "@/components/ui/sheet";
import { haustierZustand } from "@/lib/haustier";
import type { ZoneKey } from "@/lib/modules";
import { cn } from "@/lib/utils";

// Untere Leiste, nur unter `md`. Drei Knoepfe: Menue, KI-Assistent, Konto.
//
// Die erste Fassung trug die fuenf Navigationsziele der eingeklappten
// Seitenleiste (Uebersicht und die vier Bereiche). Damit war die Leiste zwar
// bedienbar, aber nicht vollstaendig: die 27 Module erreichte man nur ueber
// den Umweg Bereichsseite, und alles, was nicht Navigation ist - KI,
// angemeldete Person, Sprache, Farbschema, Abmelden - hing weiterhin an der
// Kopfzeile oder an der Schublade, also wieder am oberen Rand.
//
// Jetzt fuehrt jeder der drei Knoepfe eine eigene Flaeche von unten herauf.
// Die Kopfzeile traegt darunter nur noch Bildmarke, Name und die Anzeigen, die
// beim Arbeiten sichtbar bleiben muessen (Synchronisierung, Meldungen).
//
// Ohne Beschriftung, wie die erste Fassung. Anders als bei den Bereichen
// ("Schneeflocke" fuer den Hof) sind diese drei Zeichen gelaeufig; jedes
// traegt zusaetzlich aria-label und title.
//
// Die Leiste bleibt sichtbar und bedienbar, waehrend ein Blatt offen ist: sie
// steigt dafuer ueber das Blatt (z-110), die Blende darunter deckt nur den
// Rest der Seite ab, und das Blatt endet oberhalb von ihr (ui/sheet.tsx). Wer
// das Menue offen hat, kommt damit mit einem Tipp ins Konto-Blatt, statt erst
// schliessen zu muessen.

type Blatt = "menue" | "konto" | null;

// Abstand und Innenabstand beider Menue-Ebenen. Eine Konstante, weil die Hoehe
// der Schiene (menue-schiene, globals.css) mit genau diesen zwei Werten rechnet:
// 0.375rem zwischen den Zeilen, 2rem oben und unten zusammen.
const BLATT_LISTE = "space-y-1.5 p-4";

function LeistenKnopf({
  label,
  aktiv,
  onClick,
  children,
}: {
  label: string;
  aktiv: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-expanded={aktiv}
      className={cn(
        "flex h-11 w-full items-center justify-center rounded-full transition-colors",
        aktiv
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

// Himbi als KI-Knopf. Auf dem Handy steht er hier statt frei im Bild: dort
// deckte er Karteninhalt zu, und direkt daneben trug die Leiste noch einmal
// dieselbe Himbeere - zwei Zeichen fuer dieselbe Sache, eines davon im Weg.
// Ein Tipp darauf oeffnet den Assistenten, also genau das, was ein Tipp auf
// die schwebende Figur auch tat.
//
// Was er zeigt, ist die Phase des Agenten: denkt, wartet auf eine Freigabe,
// etwas ging schief. Der Punkt daneben macht es auch dann sichtbar, wenn die
// Figur bei 30 px klein ist.
//
// Ist Himbi abgeschaltet oder weggeschickt (Einstellung im Panel), bleibt es
// bei der schlichten Himbeere - die Entscheidung gilt auf beiden Geraeten.
// Ebenso im Sprachmodus: dort fuehrt Himbi selbst das Gespraech (sprach-himbi.tsx),
// ein zweiter kleiner Himbi schien sonst hinter der Bedienleiste durch.
function HimbiKnopf() {
  const { phase, an, weg } = useHaustierStatus();
  const { sprachmodus } = useKiPane();

  if (!an || weg || sprachmodus) return <Himbeere groesse={20} />;

  const zustand = haustierZustand({ phase, fertigUngelesen: false, schlaeft: false });
  const meldet = phase !== "ruhe";

  // 28 px breit ergeben 42 px Hoehe (die Figur ist 96 x 144) und bleiben damit
  // im 44-px-Knopf. Der Schlagschatten der Figur (.hb-svg) sitzt ausserhalb
  // des Umrisses, deshalb overflow-visible.
  return (
    <span className="relative inline-flex items-center justify-center overflow-visible">
      <Himbi zustand={zustand} groesse={28} />
      {meldet ? (
        <span
          className={cn(
            "absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full",
            phase === "fehler" ? "bg-destructive" : "bg-primary",
          )}
          aria-hidden="true"
        />
      ) : null}
    </span>
  );
}

// Erste Ebene: "Uebersicht" und die vier Bereiche.
//
// Die Bereiche fuehren hier nirgendwohin, sie klappen die zweite Ebene auf -
// deshalb Knoepfe statt Links. BlattZeile macht das ohne href von selbst, mit
// gleichem Mass und gleichem Pfeil. aria-current entfaellt dabei: es gehoert
// an eine Seite, nicht an ein Bedienelement, das keine ist. `aktiv` bleibt,
// damit sichtbar ist, in welchem Bereich man gerade steht.
function BereichsListe({
  ziele,
  onBereich,
  onNavigate,
}: {
  ziele: NavZiel[];
  onBereich: (zone: ZoneKey) => void;
  onNavigate: () => void;
}) {
  return (
    <ul className={BLATT_LISTE}>
      {ziele.map((ziel) => {
        const symbol = <Icon name={ziel.icon} className="h-5 w-5" />;

        if (ziel.key === "overview") {
          return (
            <li key={ziel.key}>
              <BlattZeile
                href={ziel.href}
                onClick={onNavigate}
                aktiv={ziel.imZiel}
                aktuelleSeite={ziel.aktuelleSeite}
                symbol={symbol}
                text={ziel.name}
              />
            </li>
          );
        }

        // In eine eigene Konstante, weil die Typverengung von ziel.key nicht
        // in die Closure des Klickhandlers reicht.
        const bereich = ziel.key;
        return (
          <li key={ziel.key}>
            <BlattZeile
              onClick={() => onBereich(bereich)}
              aktiv={ziel.imZiel}
              symbol={symbol}
              text={ziel.name}
            />
          </li>
        );
      })}
    </ul>
  );
}

// Zweite Ebene: die Module eines Bereichs.
//
// Ganz oben steht der Bereich selbst. Ohne ihn waere seine Seite aus dem Menue
// nicht mehr erreichbar, seit ein Tipp auf den Bereich nur noch aufklappt -
// und sie traegt mehr als die Modulliste, naemlich Kacheln mit
// Kurzbeschreibung und Reifegrad. Beschriftet ist sie mit dem Bereichsnamen
// und nicht mit "Uebersicht": das Wort steht eine Ebene hoeher schon fuer das
// Dashboard, und zweimal dasselbe Wort fuer zwei verschiedene Seiten ist
// schlechter als eine Wiederholung des Bereichsnamens aus dem Kopf darueber.
//
// Die Bereichszeile kommt fertig aus useNavZiele, samt Route, Symbol, Namen und
// der Frage, ob ihre Seite offen ist. Sie fehlt nur in einem Randfall: die
// geoeffnete Seite liegt in einem Bereich, in dem die Rolle kein Modul sehen
// darf - dann steht der Bereich auch nicht in der ersten Ebene.
function ModulListe({
  bereich,
  ziele,
  onNavigate,
}: {
  bereich: NavZiel | undefined;
  ziele: ModulZiel[];
  onNavigate: () => void;
}) {
  return (
    <ul className={BLATT_LISTE}>
      {bereich ? (
        <li>
          <BlattZeile
            href={bereich.href}
            onClick={onNavigate}
            aktiv={bereich.aktuelleSeite}
            aktuelleSeite={bereich.aktuelleSeite}
            symbol={<Icon name={bereich.icon} className="h-5 w-5" />}
            text={bereich.name}
          />
        </li>
      ) : null}
      {ziele.map((ziel) => (
        <li key={ziel.key}>
          <BlattZeile
            href={ziel.href}
            onClick={onNavigate}
            aktiv={ziel.aktuelleSeite}
            aktuelleSeite={ziel.aktuelleSeite}
            symbol={<Icon name={ziel.icon} className="h-5 w-5" />}
            text={ziel.name}
          />
        </li>
      ))}
    </ul>
  );
}

// Beide Ebenen nebeneinander auf einer Schiene, die waagerecht durchgeschoben
// wird. Ein harter Tausch liesse offen, ob man tiefer geht oder zurueck; der
// Weg nach links sagt es, und der Pfeil im Kopf wird damit selbsterklaerend.
//
// Beide Ebenen bleiben im Baum, die abgewandte traegt `inert` - sonst liefe
// die Tabulatortaste durch eine Liste, die halb aus dem Bild geschoben ist.
// Die Hoehe der Schiene faehrt mit (menue-schiene, globals.css): ohne sie
// stuende unter der kurzen Bereichsliste die Luecke der laengsten Modulliste.
function MenueBlattInhalt({
  zone,
  gezeigteZone,
  onBereich,
  onNavigate,
}: {
  zone: ZoneKey | null;
  gezeigteZone: ZoneKey | null;
  onBereich: (zone: ZoneKey) => void;
  onNavigate: () => void;
}) {
  // Beide Listen entstehen hier und werden weitergereicht, statt dass jede
  // Ebene ihre eigene holt: die Hoehe der Schiene rechnet mit ihrer Laenge,
  // und zwei Ableitungen derselben Liste koennten auseinanderlaufen, ohne dass
  // es auffaellt - das Blatt waere dann ein paar Pixel zu kurz.
  const ziele = useNavZiele();
  const modulZiele = useModulZiele(gezeigteZone);
  const bereich = ziele.find((ziel) => ziel.key === gezeigteZone);

  // Die Bereichsseite zaehlt als eigene Zeile mit, sofern es sie gibt.
  const zeilen = zone ? modulZiele.length + (bereich ? 1 : 0) : ziele.length;

  return (
    <div
      className="menue-schiene overflow-x-clip overflow-y-visible transition-[height] duration-weit ease-schwung motion-reduce:transition-none"
      style={{ "--zeilen": String(zeilen) } as CSSProperties}
    >
      <div
        className={cn(
          "flex w-[200%] items-start transition-transform duration-weit ease-schwung motion-reduce:transition-none",
          zone ? "-translate-x-1/2" : "translate-x-0",
        )}
      >
        <div className="w-1/2 shrink-0" inert={zone ? true : undefined}>
          <BereichsListe
            ziele={ziele}
            onBereich={onBereich}
            onNavigate={onNavigate}
          />
        </div>
        <div className="w-1/2 shrink-0" inert={zone ? undefined : true}>
          {gezeigteZone ? (
            <ModulListe
              bereich={bereich}
              ziele={modulZiele}
              onNavigate={onNavigate}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function UntereLeiste() {
  const nav = useTranslations("nav");
  const t = useTranslations("dashboard");
  const zoneT = useTranslations("zones");
  const [blatt, setBlatt] = useState<Blatt>(null);
  // Welche Ebene des Menues offen ist. `gezeigteZone` haelt daneben fest,
  // wessen Module die zweite Ansicht zeichnet: beim Zurueck wird `zone` sofort
  // null, die Ansicht faehrt aber noch nach rechts aus dem Bild und waere
  // sonst waehrend der ganzen Bewegung leer.
  const [zone, setZone] = useState<ZoneKey | null>(null);
  const [gezeigteZone, setGezeigteZone] = useState<ZoneKey | null>(null);
  const aktiveZone = useAktiveZone();
  const navRef = useRef<HTMLElement>(null);
  // Der KI-Knopf schaltet kein eigenes Blatt, sondern dasselbe Panel wie der
  // Knopf in der Kopfzeile am Schreibtisch (ki-pane-kontext.tsx). Ohne
  // Datenbank oder ohne das Recht dazu gibt es das Panel nicht - dann traegt
  // die Leiste zwei Knoepfe statt drei.
  const ki = useKiPane();
  const { setOffen } = useBlatt();

  // Solange ein Blatt offen ist, liegt die Seite dahinter still - das ersetzt
  // das aria-modal, das die Blaetter hier nicht mehr tragen koennen
  // (blatt-kontext.tsx).
  useEffect(() => {
    setOffen(blatt !== null);
  }, [blatt, setOffen]);

  const schliessen = () => {
    setBlatt(null);
    setZone(null);
    setGezeigteZone(null);
  };

  const umschalten = (ziel: Exclude<Blatt, null>) => {
    if (blatt === ziel) {
      schliessen();
      return;
    }
    // Das Menue oeffnet in dem Bereich, in dem die geoeffnete Seite liegt:
    // von dort aus ist das naechste Ziel meistens ein Nachbarmodul. Gesetzt
    // wird das hier beim Oeffnen und nicht in einem Effekt auf aktiveZone -
    // sonst spraenge das Menue nach jedem Zurueck wieder in den Bereich.
    if (ziel === "menue") {
      setZone(aktiveZone);
      setGezeigteZone(aktiveZone);
    }
    setBlatt(ziel);
  };

  const hinein = (gewaehlt: ZoneKey) => {
    setGezeigteZone(gewaehlt);
    setZone(gewaehlt);
  };

  return (
    <>
      <nav
        ref={navRef}
        aria-label={nav("mainNav")}
        className={cn(
          // pointer-events-none an der Huelle: sie ist ein durchsichtiger
          // Kasten ueber die volle Breite, und ohne das schluckt sie die Tipps
          // links und rechts neben der Pille - bei offenem Blatt waeren das
          // genau die Stellen, an denen man daneben tippt, um zu schliessen.
          "pointer-events-none fixed inset-x-0 bottom-0 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:hidden print:hidden",
          // Ueber das Blatt, aber nur dann: das KI-Panel liegt weiterhin als
          // Vollbild darueber (z-70), und das soll es auch.
          blatt ? "z-[110]" : "z-50",
        )}
      >
        <ul className="pointer-events-auto flex items-center justify-around gap-1 rounded-full border border-border bg-schwebend p-1.5 shadow-lg shadow-black/10">
          <li className="flex-1">
            <LeistenKnopf
              label={nav("openMenu")}
              aktiv={blatt === "menue"}
              onClick={() => umschalten("menue")}
            >
              <LayoutGrid className="h-5 w-5" />
            </LeistenKnopf>
          </li>

          {ki.verfuegbar ? (
            <li className="flex-1">
              <LeistenKnopf
                label={t("askAi")}
                aktiv={ki.offen}
                onClick={() => {
                  // Panel und Blaetter schliessen einander aus: das Panel ist
                  // auf dem Handy formatfuellend und liegt ueber allem, ein
                  // Blatt darunter waere offen, aber unsichtbar.
                  schliessen();
                  ki.umschalten();
                }}
              >
                <HimbiKnopf />
              </LeistenKnopf>
            </li>
          ) : null}

          <li className="flex-1">
            <LeistenKnopf
              label={nav("account")}
              aktiv={blatt === "konto"}
              onClick={() => umschalten("konto")}
            >
              <UserRound className="h-5 w-5" />
            </LeistenKnopf>
          </li>
        </ul>
      </nav>

      <Sheet
        offen={blatt === "menue"}
        onSchliessen={schliessen}
        titel={zone ? zoneT(`${zone}.name`) : nav("menu")}
        onZurueck={zone ? () => setZone(null) : undefined}
        zusatzFokus={navRef}
      >
        <MenueBlattInhalt
          zone={zone}
          gezeigteZone={gezeigteZone}
          onBereich={hinein}
          onNavigate={schliessen}
        />
      </Sheet>

      <Sheet
        offen={blatt === "konto"}
        onSchliessen={schliessen}
        titel={nav("account")}
        zusatzFokus={navRef}
      >
        <KontoBlatt onNavigate={schliessen} />
      </Sheet>
    </>
  );
}
