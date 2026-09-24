"use client";

import {
  useEffect,
  useRef,
  useSyncExternalStore,
  type ComponentProps,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useLinkStatus } from "next/link";
import { ChevronLeft, X } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { seiteGesperrt } from "@/components/ui/scroll-sperre";
import { cn } from "@/lib/utils";

// Die Teile der Liste mit Detailansicht, die im Browser laufen muessen
// (DESIGN.md Abschnitt 14, WMCNL-2488). Alles andere rendert der Server: Liste,
// Detailansicht und alle Wechsel sind Links auf eine andere Adresse und
// funktionieren deshalb auch ohne JavaScript.

type Ziel = ComponentProps<typeof Link>["href"];

// ---------------------------------------------------------------------------
// Ladezustand
//
// Ein Klick auf einen Eintrag, einen Reiter oder einen Filter wartet auf den
// Server. Bei Suchparametern greift kein loading.tsx - Next.js behaelt die
// alte Ansicht, bis die neue da ist (layout-router.js ignoriert die Query im
// Schluessel des Segments). Ohne Rueckmeldung wirkt der Klick wirkungslos.
//
// Der Link weiss, dass er laedt (useLinkStatus), die Flaeche, die sich
// aendern wird, weiss es nicht. Dazwischen steht dieser kleine Speicher: je
// Bereich ein Zaehler, den Melder hoch- und herunterzaehlen.
// ---------------------------------------------------------------------------

type Bereich = "liste" | "detailpanel";

const laufend: Record<Bereich, number> = { liste: 0, detailpanel: 0 };
const hoerer = new Set<() => void>();

function melde(bereich: Bereich, schritt: 1 | -1) {
  laufend[bereich] = Math.max(0, laufend[bereich] + schritt);
  hoerer.forEach((hoeren) => hoeren());
}

function abonniere(hoeren: () => void) {
  hoerer.add(hoeren);
  return () => {
    hoerer.delete(hoeren);
  };
}

export function useLaedt(bereich: Bereich): boolean {
  return useSyncExternalStore(
    abonniere,
    () => laufend[bereich] > 0,
    () => false,
  );
}

/** Meldet einen laufenden Wechsel, der nicht ueber einen Link geht (Filterformular). */
export function useLadeMeldung(bereich: Bereich, laeuft: boolean) {
  useEffect(() => {
    if (!laeuft) return;
    melde(bereich, 1);
    return () => melde(bereich, -1);
  }, [bereich, laeuft]);
}

/**
 * Steht in einem Link und zeigt, dass er laedt: ein Punkt, der erst nach
 * 150 ms erscheint, damit schnelle Antworten nicht flackern. Feste Groesse,
 * nur die Deckkraft wechselt - so springt nichts.
 */
export function LadeMelder({
  bereich,
  className,
}: {
  bereich: Bereich;
  className?: string;
}) {
  const { pending } = useLinkStatus();
  useLadeMeldung(bereich, pending);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute right-2 top-2 h-2 w-2 rounded-full bg-primary opacity-0",
        pending && "animate-[lade-einblenden_200ms_ease_150ms_forwards]",
        className,
      )}
    />
  );
}

/** Schmaler Balken unter dem Kopf der Detailansicht, solange sie laedt. */
export function PanelLadebalken() {
  const laedt = useLaedt("detailpanel");
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-primary opacity-0",
        laedt && "animate-[lade-einblenden_200ms_ease_150ms_forwards]",
      )}
    />
  );
}

/** Inhalt der Detailansicht: blasser, solange die naechste Aufgabe laedt. */
export function PanelInhalt({ children }: { children: ReactNode }) {
  const laedt = useLaedt("detailpanel");
  return (
    <div
      aria-busy={laedt || undefined}
      className={cn(
        "min-h-0 flex-1 p-4 transition-opacity duration-knapp",
        "panel-angedockt:overflow-y-auto panel-angedockt:overscroll-contain",
        "panel-schublade:overflow-y-auto panel-schublade:overscroll-contain",
        laedt && "opacity-60",
      )}
    >
      {children}
    </div>
  );
}

/** Eintraege der Liste: blasser, solange ein Filter oder eine Seite laedt. */
export function ListenInhalt({ children }: { children: ReactNode }) {
  const laedt = useLaedt("liste");
  return (
    <div
      aria-busy={laedt || undefined}
      className={cn("space-y-3 transition-opacity duration-knapp", laedt && "opacity-60")}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Schliessen, Esc, Fokus, Zurueck
// ---------------------------------------------------------------------------

// Die eine offene Detailansicht der Seite meldet hier, wie sie schliesst.
// Die Links "Liste" und das Kreuz rufen es auf. Ohne Skript sind es
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
        className={cn(
          "inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition duration-knapp hover:bg-muted hover:text-foreground lg:h-9 lg:w-9",
          className,
        )}
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

// Dieselben Grenzen wie die Varianten panel-* in globals.css.
function anordnung(behaelter: HTMLElement | null): Anordnung {
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const breite = (behaelter?.clientWidth ?? 0) / rem;
  if (breite >= 56) return "angedockt";
  if (window.matchMedia("(width >= 48rem)").matches && breite >= 36) return "schublade";
  return "ersetzt";
}

/** Die Liste hinter der Detailansicht: Pfad und Query ohne Auswahl und Reiter. */
function aktuelleListe(): string {
  const query = new URLSearchParams(window.location.search);
  query.delete("aufgabe");
  query.delete("reiter");
  query.sort();
  return `${window.location.pathname}?${query.toString()}`;
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
 * Aufgabe oder des Reiters ersetzen ihn (replace an den Links). Schliessen
 * geht deshalb einen Schritt zurueck, genau auf die Liste von vorher - die
 * Zurueck-Taste und die Zurueck-Geste auf Android tun dasselbe. Kam man ueber
 * einen geteilten Link oder hat inzwischen gefiltert, gibt es diesen Schritt
 * nicht; dann ersetzt Schliessen die Adresse durch die Liste.
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
  const listeBeimOeffnen = useRef<string | null>(null);

  // Wechsel beobachten: Fokus fuehren, merken, woher geoeffnet wurde.
  useEffect(() => {
    const vorher = vorige.current;
    vorige.current = { auswahl: auswahlId, liste: listenSchluessel };
    // Beim ersten Rendern gibt es nichts zu fuehren. Wer einen geteilten Link
    // oeffnet, soll den Fokus nicht mitten auf der Seite finden.
    if (!vorher) return;

    if (!vorher.auswahl && auswahlId) {
      listeBeimOeffnen.current = aktuelleListe();
      requestAnimationFrame(() => {
        const titel = document.getElementById("detailpanel-titel");
        titel?.focus({ preventScroll: true });
        // Ersetzt die Detailansicht die Liste, steht man sonst mitten in ihr.
        if (anordnung(document.getElementById(behaelterId)) === "ersetzt") {
          titel?.scrollIntoView({ block: "start" });
        }
      });
      return;
    }

    if (vorher.auswahl && auswahlId && vorher.liste !== listenSchluessel) {
      // Gefiltert oder geblaettert, waehrend die Detailansicht offen war: der
      // Schritt zurueck fuehrte jetzt auf eine andere Liste.
      listeBeimOeffnen.current = null;
    }

    if (vorher.auswahl && auswahlId && vorher.auswahl !== auswahlId) {
      // Pfeile und Reiter behalten ihren Fokus; nur wer aus der Liste kommt,
      // landet auf dem Titel der neuen Aufgabe.
      const panel = document.getElementById("detailpanel");
      if (!panel?.contains(document.activeElement)) {
        requestAnimationFrame(() =>
          document.getElementById("detailpanel-titel")?.focus({ preventScroll: true }),
        );
      }
      return;
    }

    if (vorher.auswahl && !auswahlId) {
      listeBeimOeffnen.current = null;
      requestAnimationFrame(() => {
        const zeile =
          document.getElementById(`eintrag-${vorher.auswahl}`) ?? document.getElementById("liste");
        zeile?.focus({ preventScroll: true });
        zeile?.scrollIntoView({ block: "nearest" });
      });
    }
  }, [auswahlId, listenSchluessel, behaelterId]);

  // Schliessen und Esc, solange eine Aufgabe offen ist.
  useEffect(() => {
    if (!auswahlId) return;
    const schliessen = () => {
      if (listeBeimOeffnen.current !== null && listeBeimOeffnen.current === aktuelleListe()) {
        listeBeimOeffnen.current = null;
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

  // Anordnung an <html> melden. Himbi weicht damit aus (haustier.css): neben
  // der angedockten oder ueber der Liste liegenden Detailansicht rueckt er
  // nach links, wo sie die Liste ersetzt, blendet er sich aus.
  useEffect(() => {
    const wurzel = document.documentElement;
    if (!auswahlId) {
      delete wurzel.dataset.detailpanel;
      return;
    }
    const behaelter = document.getElementById(behaelterId);
    const bestimme = () => {
      wurzel.dataset.detailpanel = anordnung(behaelter);
    };
    bestimme();
    const beobachter = new ResizeObserver(bestimme);
    if (behaelter) beobachter.observe(behaelter);
    window.addEventListener("resize", bestimme);
    return () => {
      beobachter.disconnect();
      window.removeEventListener("resize", bestimme);
      delete wurzel.dataset.detailpanel;
    };
  }, [auswahlId, behaelterId]);

  return null;
}
