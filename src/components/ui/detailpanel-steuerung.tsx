"use client";

import { useEffect, useRef, type MouseEvent } from "react";
import { ChevronLeft, X } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { seiteGesperrt } from "@/components/ui/scroll-sperre";
import { symbolKnopfKlassen, type Ziel } from "@/components/ui/kit";
import { cn } from "@/lib/utils";

// Die Teile der Liste mit Detailansicht, die im Browser laufen muessen
// (DESIGN.md Abschnitt 14, WMCNL-2488): Schliessen, Esc, Fokus, Zurueck und
// das Signal fuer Himbi. Den Ladezustand fuehrt lade-status.tsx. Alles andere
// rendert der Server: Liste, Detailansicht und alle Wechsel sind Links auf
// eine andere Adresse.
//
// Die Bausteine gehen von einer Liste mit Detailansicht je Seite aus: die
// Schliessen-Aktion, die IDs der Detailansicht und das Signal an <html> gibt
// es je Seite einmal (DESIGN.md Abschnitt 14, Regeln).

// Die eine offene Detailansicht der Seite meldet hier, wie sie schliesst.
// Die Links "Zur Liste" und das Kreuz rufen es auf. Ohne Skript sind es
// gewoehnliche Links auf die Liste.
let schliessenAktion: (() => void) | null = null;

export function PanelSchliessen({
  ziel,
  art,
  label,
  className,
}: {
  ziel: Ziel;
  art: "kreuz" | "liste";
  label: string;
  className?: string;
}) {
  function beiKlick(event: MouseEvent<HTMLAnchorElement>) {
    // Mit gedrueckter Taste oder Mittelklick bleibt es ein Link.
    if (!schliessenAktion || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    schliessenAktion();
  }

  if (art === "kreuz") {
    return (
      <Link
        href={ziel}
        scroll={false}
        prefetch={false}
        onClick={beiKlick}
        aria-label={label}
        title={label}
        className={cn(symbolKnopfKlassen, className)}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </Link>
    );
  }
  return (
    <Link
      href={ziel}
      scroll={false}
      prefetch={false}
      onClick={beiKlick}
      className={cn(
        "inline-flex min-h-11 items-center gap-1 rounded-lg pr-2 text-sm font-semibold text-primary lg:min-h-9",
        className,
      )}
    >
      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      {label}
    </Link>
  );
}

type Anordnung = "angedockt" | "schublade" | "ersetzt";

/**
 * Die Anordnung, wie das CSS sie gerade gewaehlt hat: das Raster traegt sie
 * als --anordnung (Varianten panel-* in globals.css, ui/liste.tsx). Die
 * Grenzen stehen damit nur im CSS und nicht noch einmal hier.
 */
function anordnung(behaelter: HTMLElement | null): Anordnung {
  const raster = behaelter?.querySelector<HTMLElement>("[data-raster]");
  const wert = raster ? getComputedStyle(raster).getPropertyValue("--anordnung").trim() : "";
  return wert === "angedockt" || wert === "schublade" ? wert : "ersetzt";
}

function tastaturImFeld(ziel: EventTarget | null): boolean {
  if (!(ziel instanceof HTMLElement)) return false;
  if (ziel.isContentEditable) return true;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(ziel.tagName)) return true;
  // Im KI-Panel und in einem Dialog gehoert Esc dem Panel bzw. dem Dialog.
  return Boolean(ziel.closest(".ki-pane-huelle, [role=dialog]"));
}

/**
 * Unsichtbarer Begleiter der Liste mit Detailansicht. Steht immer im Baum,
 * auch bei geschlossener Detailansicht - nur so sieht er die Wechsel von
 * "zu" auf "offen" und zurueck.
 *
 * Zurueck: Oeffnen aus der Liste legt einen Verlaufseintrag an, Wechsel der
 * Auswahl oder des Reiters ersetzen ihn (replace an den Links). Schliessen
 * geht deshalb einen Schritt zurueck, genau auf die Liste von vorher - die
 * Zurueck-Taste und die Zurueck-Geste auf Android tun dasselbe. Kam man ueber
 * einen geteilten Link oder hat inzwischen gefiltert oder geblaettert, gibt
 * es diesen Schritt nicht; dann ersetzt Schliessen die Adresse durch die Liste.
 */
export function DetailpanelSteuerung({
  auswahlId,
  listenSchluessel,
  schliessenZiel,
  behaelterId,
}: {
  auswahlId: string | null;
  /** Die Query der Liste ohne Auswahl und Reiter; aendert sie sich, war es ein Filterwechsel. */
  listenSchluessel: string;
  /** Adresse der Liste ohne Auswahl, als Pfad ohne Sprache. */
  schliessenZiel: string;
  behaelterId: string;
}) {
  const router = useRouter();
  const vorige = useRef<{ auswahl: string | null; liste: string } | null>(null);
  // Aus der Liste geoeffnet und seitdem weder gefiltert noch geblaettert: dann
  // steht die Liste von vorher genau einen Schritt zurueck im Verlauf. Welche
  // Parameter Auswahl und Reiter heissen, muss die Steuerung dafuer nicht
  // wissen - der Listenschluessel kommt vom Modul.
  const ausListe = useRef(false);

  // Wechsel beobachten: Fokus fuehren, merken, woher geoeffnet wurde.
  useEffect(() => {
    const vorher = vorige.current;
    vorige.current = { auswahl: auswahlId, liste: listenSchluessel };
    // Beim ersten Rendern gibt es nichts zu fuehren. Wer einen geteilten Link
    // oeffnet, soll den Fokus nicht mitten auf der Seite finden.
    if (!vorher) return;

    let rahmen = 0;
    if (!vorher.auswahl && auswahlId) {
      ausListe.current = true;
      rahmen = requestAnimationFrame(() => {
        const titel = document.getElementById("detailpanel-titel");
        titel?.focus({ preventScroll: true });
        // Ersetzt die Detailansicht die Liste, steht man sonst mitten in ihr.
        if (anordnung(document.getElementById(behaelterId)) === "ersetzt") {
          titel?.scrollIntoView({ block: "start" });
        }
      });
    } else if (vorher.auswahl && auswahlId) {
      // Gefiltert oder geblaettert, waehrend die Detailansicht offen war: der
      // Schritt zurueck fuehrte jetzt auf eine andere Liste.
      if (vorher.liste !== listenSchluessel) ausListe.current = false;
      // Pfeile und Reiter behalten ihren Fokus; nur wer aus der Liste kommt,
      // landet auf dem Titel der neuen Auswahl.
      const panel = document.getElementById("detailpanel");
      if (vorher.auswahl !== auswahlId && !panel?.contains(document.activeElement)) {
        rahmen = requestAnimationFrame(() =>
          document.getElementById("detailpanel-titel")?.focus({ preventScroll: true }),
        );
      }
    } else if (vorher.auswahl && !auswahlId) {
      ausListe.current = false;
      rahmen = requestAnimationFrame(() => {
        // Die Zeile, sonst die Liste selbst - etwa nach einem geteilten Link,
        // dessen Eintrag nicht auf dieser Seite steht.
        const ziel =
          document.getElementById(`eintrag-${vorher.auswahl}`) ??
          document.getElementById(`${behaelterId}-liste`);
        ziel?.focus({ preventScroll: true });
        ziel?.scrollIntoView({ block: "nearest" });
      });
    }
    return () => cancelAnimationFrame(rahmen);
  }, [auswahlId, listenSchluessel, behaelterId]);

  // Schliessen und Esc, solange etwas offen ist.
  useEffect(() => {
    if (!auswahlId) return;
    const schliessen = () => {
      if (ausListe.current) {
        ausListe.current = false;
        router.back();
      } else {
        router.replace(schliessenZiel, { scroll: false });
      }
    };
    schliessenAktion = schliessen;

    const beiTaste = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // Liegt eine andere Ebene ueber der Seite (Blatt, Suche, KI auf dem
      // Handy), schliesst Esc diese und nicht die Detailansicht darunter.
      if (tastaturImFeld(event.target) || seiteGesperrt()) return;
      schliessen();
    };
    document.addEventListener("keydown", beiTaste);
    return () => {
      document.removeEventListener("keydown", beiTaste);
      if (schliessenAktion === schliessen) schliessenAktion = null;
    };
  }, [auswahlId, router, schliessenZiel]);

  // Anordnung und Breite an <html> melden. Himbi weicht damit aus
  // (haustier.css): neben der angedockten Detailansicht rueckt er um ihre
  // Breite nach links; liegt sie als Schublade ueber der Liste oder ersetzt
  // sie die Liste, blendet er sich aus. Die Breite wird gemessen, weil sie
  // mit dem Platz waechst (--detailpanel-angedockt in globals.css).
  useEffect(() => {
    const wurzel = document.documentElement;
    const aufraeumen = () => {
      delete wurzel.dataset.detailpanel;
      wurzel.style.removeProperty("--detailpanel-ist");
    };
    if (!auswahlId) {
      aufraeumen();
      return;
    }
    const behaelter = document.getElementById(behaelterId);
    const panel = document.getElementById("detailpanel");
    const bestimme = () => {
      wurzel.dataset.detailpanel = anordnung(behaelter);
      if (panel) wurzel.style.setProperty("--detailpanel-ist", `${panel.offsetWidth}px`);
    };
    bestimme();
    // Der Behaelter aendert seine Breite mit jedem Fensterwechsel, auch ueber
    // die md-Grenze hinweg - ein eigener resize-Listener waere doppelt.
    const beobachter = new ResizeObserver(bestimme);
    if (behaelter) beobachter.observe(behaelter);
    if (panel) beobachter.observe(panel);
    return () => {
      beobachter.disconnect();
      aufraeumen();
    };
  }, [auswahlId, behaelterId]);

  return null;
}
