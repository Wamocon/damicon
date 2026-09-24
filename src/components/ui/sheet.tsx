"use client";

import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Flaeche, die von unten aufgeht. Gebaut fuer die untere Leiste auf dem Handy
// (untere-leiste.tsx): der ausloesende Knopf steht unten, also kommt der
// Inhalt von dort und nicht von der Seite - der Weg zwischen Knopf und Inhalt
// bleibt kurz, und der Daumen deckt beim Tippen nicht das ab, was er gerade
// geoeffnet hat.
//
// Bewusst kein <dialog>: das Element bringt zwar Fokusfalle und Esc mit, sein
// ::backdrop laesst sich aber nur schwer mit der uebrigen Tiefenstaffelung in
// Einklang bringen, und showModal() muss ueber einen Effekt nachgezogen
// werden, was bei jedem Rendern erneut zu pruefen waere. Die drei Dinge, die
// hier wirklich gebraucht werden - Esc, Klick daneben, Rollen im Baum - sind
// unten ausgeschrieben.
//
// Bei "unten" endet die Flaeche oberhalb der unteren Leiste statt an der
// Bildschirmkante: die Leiste bleibt sichtbar und bedienbar, solange ein Blatt
// offen ist. Daran haengen drei Dinge, die sonst nicht zusammenpassen wuerden -
// die Blende liegt dort unter der Leiste, die Leiste gehoert in die Fokusfalle
// (zusatzFokus), und aria-modal faellt weg, weil hinter dem Blatt eben doch
// etwas Bedienbares steht.
//
// "oben" ist das Gegenstueck fuer Ausloeser am oberen Rand - die globale Suche,
// deren Knopf in der Kopfzeile sitzt. Das Blatt waechst von oben nach unten,
// das Eingabefeld im Kopf bleibt dabei stehen, und die Bildschirmtastatur des
// Handys deckt allenfalls das untere Ende der Liste ab statt des Feldes.

// Was die Tabulatortaste ansteuern kann. Als Modulkonstante, seit die
// Fokusfalle das Dokument abfragt statt nur die eigene Flaeche.
const FOKUSSIERBAR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Wo ein Blatt "oben" hingehoert, in Fensterkoordinaten: dorthin, wo sein
 *  Ausloeser sitzt. */
export interface SheetAnker {
  top: number;
  left: number;
  width: number;
  maxHoehe: number;
}

export function Sheet({
  offen,
  onSchliessen,
  titel,
  children,
  position = "unten",
  onZurueck,
  zusatzFokus,
  anfangsFokus,
  kopf,
  schliessenLabel,
  anker,
}: {
  offen: boolean;
  onSchliessen: () => void;
  titel: string;
  children: ReactNode;
  /** "unten": faehrt von der Kante hoch (Handy-Menues, Standard). "mitte": mittiges Fenster,
   *  fuer Detailinhalte, die nicht von einer Seitenkante zu kommen scheinen sollen. "oben":
   *  haengt am oberen Rand, fuer Ausloeser in der Kopfzeile. */
  position?: "unten" | "mitte" | "oben";
  /** Gesetzt: der Kopf traegt links einen Weg zurueck. Fehlt: nur den Titel. */
  onZurueck?: () => void;
  /** Ein zweiter Baum, der mit in die Fokusfalle gehoert - die untere Leiste,
   *  die bei offenem Blatt bedienbar bleibt. */
  zusatzFokus?: RefObject<HTMLElement | null>;
  /** Bekommt beim Oeffnen den Fokus statt der Flaeche - etwa ein Suchfeld. */
  anfangsFokus?: RefObject<HTMLElement | null>;
  /** Ersetzt den sichtbaren Titel im Kopf, etwa durch ein Eingabefeld. Der Titel
   *  bleibt fuer Vorlesehilfen stehen, er benennt den Dialog. */
  kopf?: ReactNode;
  /** Name fuer Kreuz und Blende. Fehlt er, heissen beide "Menue schliessen". */
  schliessenLabel?: string;
  /** Nur bei "oben": das Blatt geht dort auf, wo sein Ausloeser sitzt, statt
   *  ueber die volle Breite. Fehlt er, etwa auf dem Handy, bleibt es beim
   *  Rand. */
  anker?: SheetAnker | null;
}) {
  const nav = useTranslations("nav");
  const titelId = useId();
  const flaecheRef = useRef<HTMLDivElement>(null);
  const inhaltRef = useRef<HTMLDivElement>(null);
  const schliessenText = schliessenLabel ?? nav("closeMenu");

  // Esc schliesst, und solange das Sheet offen ist, scrollt die Seite
  // darunter nicht mit.
  //
  // Gesperrt wird am <html>, nicht am <body>. Das <html> traegt
  // overflow-x: clip, und damit reicht der Browser ein overflow des <body>
  // nicht mehr an das Fenster weiter: der <body> wurde selbst zum
  // Scrollcontainer, die klebende Kopfzeile klebte an ihm statt am Fenster
  // und verschwand bei gescrollter Seite nach oben - die Seitenleiste mit ihr.
  useEffect(() => {
    if (!offen) return;
    const beiTaste = (event: KeyboardEvent) => {
      if (event.key === "Escape") onSchliessen();
    };
    document.addEventListener("keydown", beiTaste);
    const wurzel = document.documentElement;
    const vorher = wurzel.style.overflow;
    wurzel.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", beiTaste);
      wurzel.style.overflow = vorher;
    };
  }, [offen, onSchliessen]);

  // Der Fokus springt in die Flaeche, sobald sie aufgeht - sonst bliebe er
  // auf dem Knopf in der Leiste, und die erste Tabulatortaste liefe durch die
  // Seite dahinter statt durch das Menue davor.
  //
  // Und erneut, wenn der Titel wechselt: im Menue-Blatt heisst der Dialog nach
  // einem Wechsel der Ebene anders ("Menue" -> "Feld"), und ohne den Sprung
  // meldet das keine Vorlesehilfe. Der Inhalt faengt dabei wieder oben an,
  // sonst stuende die kurze Bereichsliste nach dem Zurueck aus einer langen
  // Modulliste mitten im Scrollweg. Fuer die mittigen Blaetter aendert das
  // nichts - dort wechselt der Titel nur zusammen mit offen.
  //
  // Mit anfangsFokus geht der Fokus stattdessen dorthin. Ein autoFocus im
  // Inhalt reichte nicht: der Effekt hier laeuft nach denen der Kinder und
  // zoege den Fokus wieder auf die Flaeche.
  useEffect(() => {
    if (!offen) return;
    (anfangsFokus?.current ?? flaecheRef.current)?.focus();
    inhaltRef.current?.scrollTo({ top: 0 });
  }, [offen, titel, anfangsFokus]);

  // Der Fokus bleibt in der Flaeche, solange sie offen ist - und bei "unten"
  // zusammen mit der unteren Leiste, die daneben bedienbar bleibt. Ohne das
  // liefe die Tabulatortaste aus dem Blatt heraus in die abgedunkelte Seite
  // darunter, oder die Leiste waere zwar mit dem Finger, aber nicht mit der
  // Tastatur erreichbar - also eine Bedienung, die nur ein Zeigegeraet kennt.
  //
  // Die Ringreihenfolge kommt von querySelectorAll auf dem Dokument: das
  // liefert Dokumentreihenfolge, und damit stehen Leiste und Blatt richtig
  // hintereinander, obwohl sie in zwei getrennten Baeumen haengen. Der Filter
  // laesst nur durch, was in einem der beiden liegt - die Blende bleibt aussen
  // vor, wie bisher.
  //
  // Bewusst kein `inert` am Geschwisterelement: die Flaeche liegt als
  // fixiertes Element ueber der ganzen Seite, ein gemeinsamer Vorfahr waere das
  // <body> selbst - und der traegt auch das Blatt. Was hinter dem Blatt liegt,
  // legt stattdessen das Dashboard-Layout stumm (dashboard/blatt-kontext.tsx).
  useEffect(() => {
    if (!offen) return;
    const beiTab = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const flaeche = flaecheRef.current;
      if (!flaeche) return;
      const zusatz = zusatzFokus?.current ?? null;
      const ziele = Array.from(
        document.querySelectorAll<HTMLElement>(FOKUSSIERBAR),
      ).filter(
        (element) =>
          (flaeche.contains(element) || (zusatz?.contains(element) ?? false)) &&
          // Faengt den Fall ab, dass das Fenster bei offenem Blatt ueber md
          // waechst: die Leiste traegt md:hidden, ihre Knoepfe waeren sonst
          // weiterhin mit der Tabulatortaste erreichbar.
          element.offsetParent !== null &&
          // Was inert ist, ueberspringt der Browser von selbst. Stuende es
          // trotzdem in dieser Liste, laege die Ringgrenze auf einem Element,
          // das nie den Fokus bekommt - und der Sprung zurueck an den Anfang
          // bliebe aus. Betrifft die abgewandte Ebene im Menue-Blatt, die
          // waehrend der Bewegung noch gefuellt ist.
          element.closest("[inert]") === null,
      );
      if (ziele.length === 0) {
        event.preventDefault();
        flaeche.focus();
        return;
      }
      const erstes = ziele[0];
      const letztes = ziele[ziele.length - 1];
      const aktiv = document.activeElement;
      // Rueckwaerts vom ersten Ziel (oder von der Flaeche selbst) ans Ende,
      // vorwaerts vom letzten zurueck an den Anfang.
      if (event.shiftKey && (aktiv === erstes || aktiv === flaeche)) {
        event.preventDefault();
        letztes.focus();
      } else if (!event.shiftKey && aktiv === letztes) {
        event.preventDefault();
        erstes.focus();
      }
    };
    document.addEventListener("keydown", beiTab);
    return () => document.removeEventListener("keydown", beiTab);
  }, [offen, zusatzFokus]);

  if (!offen) return null;

  const mitte = position === "mitte";
  const oben = position === "oben";
  // Mit Anker sitzt das Blatt absolut dort, wo sein Ausloeser ist - der Weg
  // zwischen Knopf und Inhalt bleibt null. Ohne Anker (Handy) haengt es
  // randlos oben: dort sitzt der Knopf ohnehin in der obersten Zeile.
  const amAnker = oben && anker ? anker : null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex print:hidden",
        mitte && "items-center justify-center p-4",
        // Auf dem Handy fast randlos, damit die Liste Platz hat. Ohne Anker am
        // Schreibtisch schmal und etwas unterhalb der Kopfzeile.
        oben &&
          !amAnker &&
          "flex-col items-stretch p-2 pt-[max(0.5rem,env(safe-area-inset-top))] md:items-center md:px-4 md:pt-[10svh]",
        // Die Unterkante steigt um den Platz der unteren Leiste. Die Blende
        // darunter bleibt inset-0 und deckt den Streifen weiter ab - sie
        // liegt dort nur unter der Leiste statt darueber.
        !mitte && !oben && "flex-col justify-end pb-[var(--untere-leiste-raum)]",
      )}
    >
      {/* tabIndex -1: die Blende liegt in der Dokumentreihenfolge zwischen
          Leiste und Blatt, und tabbierbar waere sie genau die Luecke, durch die
          der Fokus aus dem Ring faellt. Mit dem Finger schliesst sie weiterhin,
          mit der Tastatur tun es Esc und das Kreuz. */}
      <button
        type="button"
        tabIndex={-1}
        aria-label={schliessenText}
        onClick={onSchliessen}
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
      />
      <div
        ref={flaecheRef}
        role="dialog"
        // Nur bei den Blaettern in der Mitte und oben stimmt die Zusage, dass
        // es hinter dem Blatt nichts gibt. Unten bleibt die Leiste bedienbar,
        // und eine Zusage, die nicht stimmt, ist fuer eine Vorlesehilfe
        // schlimmer als gar keine. Weglassen statt false: das ist eindeutiger.
        aria-modal={mitte || oben ? true : undefined}
        aria-labelledby={titelId}
        tabIndex={-1}
        style={
          amAnker
            ? {
                top: amAnker.top,
                left: amAnker.left,
                width: amAnker.width,
                maxHeight: amAnker.maxHoehe,
              }
            : undefined
        }
        className={cn(
          // overflow-hidden, damit der Inhalt die untere Rundung nicht
          // ueberlaeuft - der Scrollbereich darin schneidet rechteckig.
          "relative flex min-h-0 flex-col overflow-hidden border-border bg-schwebend shadow-2xl outline-none",
          mitte
            ? "w-full max-w-3xl max-h-[85svh] rounded-2xl border motion-safe:animate-[sheet-auf-mitte_180ms_ease-out]"
            : amAnker
            ? // Lage und Groesse kommen aus dem Anker (style oben).
              "absolute rounded-2xl border motion-safe:animate-[sheet-auf-oben_180ms_ease-out]"
            : oben
            ? // Waechst mit dem Inhalt, hoechstens bis zum Rand. Auf Android
              // schrumpft der Rand mit, sobald die Tastatur aufgeht
              // (interactiveWidget "resizes-content" im Layout).
              "w-full max-h-full rounded-2xl border motion-safe:animate-[sheet-auf-oben_180ms_ease-out] md:max-w-2xl md:max-h-[min(36rem,80svh)]"
            : cn(
                // Rundum gerundet und gerahmt: die Flaeche klebt nicht mehr an
                // der Bildschirmkante, sondern schwebt ueber der Leiste, und
                // eine scharfe Unterkante saehe dort abgeschnitten aus.
                "w-full rounded-2xl border motion-safe:animate-[sheet-auf_200ms_ease-out]",
                // Der Leistenplatz geht vom Budget ab statt oben drauf: sonst
                // laege die Oberkante auf einem 844 px hohen Telefon
                // rechnerisch ueber dem Bildschirmrand. So bleibt sie bei
                // 15 svh, also da, wo sie vorher schon stand. Ab md ist die
                // Variable 0px und die Formel faellt auf 85svh zurueck.
                "max-h-[calc(85svh-var(--untere-leiste-raum))]",
              ),
        )}
      >
        <div className="flex h-14 shrink-0 items-center gap-1 border-b border-border px-4">
          {/* Pfeil und Titel sind zwei Elemente und nicht ein Knopf "< Feld":
              der Knopf fuehrt zur Ebene darueber und nicht nach Feld, und ein
              sichtbarer Text, der etwas anderes sagt als der Vorlese-Name,
              verstiesse gegen WCAG 2.5.3. Beieinander stehen sie trotzdem. */}
          {onZurueck ? (
            <button
              type="button"
              onClick={onZurueck}
              aria-label={nav("back")}
              title={nav("back")}
              className="-ml-2 inline-flex h-11 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          ) : null}
          <h2
            id={titelId}
            className={
              kopf
                ? "sr-only"
                : "min-w-0 flex-1 truncate text-sm font-black text-card-foreground"
            }
          >
            {titel}
          </h2>
          {kopf}
          <button
            type="button"
            onClick={onSchliessen}
            aria-label={schliessenText}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Kein eigener Systemabstand mehr am Fuss: --untere-leiste-raum traegt
            ihn bereits, und das Blatt endet oberhalb davon. */}
        <div
          ref={inhaltRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
