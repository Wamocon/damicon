"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useTranslations } from "next-intl";
import { Bell, BellOff } from "lucide-react";
import { usePersona } from "@/components/dashboard/persona";
import type { Role } from "@/lib/rbac";

// Stufe 1 der Benachrichtigungen (WMCNL-2485): die Glocke oeffnet ein Panel,
// das sagt, dass nichts vorliegt. Vorher war sie ein Knopf ohne Ziel mit einem
// Punkt, der immer "ungelesen" behauptete (UX-Audit Punkt 8). Echte Eintraege
// kommen mit Stufe 2 (WMCNL-2486): pro Person, ueber Supabase Realtime.

// Kunde und Picker bekommen vorerst nichts, was hier stehen koennte. Eine feste
// Liste statt einer RBAC-Ressource, weil es noch keine Daten gibt, auf die sich
// ein Recht beziehen koennte - das entscheidet Stufe 2.
const GLOCKE_ROLLEN: readonly Role[] = [
  "admin",
  "ceo",
  "betriebsleitung",
  "buchhaltung",
  "brigade",
  "erzeuger",
];

// Der Punkt heisst hier "noch nie hineingeschaut", nicht "ungelesen" - zu lesen
// gibt es noch nichts. Nach dem ersten Oeffnen bleibt er weg, gemerkt pro
// Browser. Stufe 2 ersetzt ihn durch die Zahl der ungelesenen Eintraege.
const GESEHEN_SCHLUESSEL = "damicon-glocke-gesehen";
const listeners = new Set<() => void>();

function abonnieren(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function istGesehen(): boolean {
  try {
    return localStorage.getItem(GESEHEN_SCHLUESSEL) === "1";
  } catch {
    // Ohne Speicher (gesperrt, manches private Fenster) lieber kein Punkt als
    // einer, der sich nie wegklicken laesst.
    return true;
  }
}

// Auf dem Server gilt die Glocke als gesehen, der Punkt kommt erst im Browser
// dazu. Andersherum stuende er bei allen, die schon hineingeschaut haben, einen
// Augenblick da und verschwaende dann.
function istGesehenServer(): boolean {
  return true;
}

function alsGesehenMerken() {
  try {
    localStorage.setItem(GESEHEN_SCHLUESSEL, "1");
  } catch {
    // ignore
  }
  listeners.forEach((listener) => listener());
}

export function Glocke() {
  const t = useTranslations("benachrichtigungen");
  const dashboardT = useTranslations("dashboard");
  const { role } = usePersona();
  const gesehen = useSyncExternalStore(abonnieren, istGesehen, istGesehenServer);
  const [offen, setOffen] = useState(false);
  const wurzelRef = useRef<HTMLDivElement>(null);
  const knopfRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const titelId = useId();

  // Wie beim Sync-Panel schliesst ein Klick daneben. Dazu, was das Sync-Panel
  // nicht kann: der Fokus geht ins Panel, damit die Vorlesehilfe den Inhalt
  // vorliest; Tab aus der Glocke heraus schliesst es; Esc schliesst und gibt
  // den Fokus an die Glocke zurueck.
  useEffect(() => {
    if (!offen) return;
    panelRef.current?.focus();

    function ausserhalb(ziel: EventTarget | null) {
      return !!wurzelRef.current && !wurzelRef.current.contains(ziel as Node);
    }
    function aufAussenklick(ereignis: MouseEvent) {
      if (ausserhalb(ereignis.target)) setOffen(false);
    }
    function aufFokusAusserhalb(ereignis: FocusEvent) {
      if (ausserhalb(ereignis.target)) setOffen(false);
    }
    function aufEsc(ereignis: KeyboardEvent) {
      if (ereignis.key !== "Escape") return;
      setOffen(false);
      knopfRef.current?.focus();
    }

    document.addEventListener("mousedown", aufAussenklick);
    document.addEventListener("focusin", aufFokusAusserhalb);
    document.addEventListener("keydown", aufEsc);
    return () => {
      document.removeEventListener("mousedown", aufAussenklick);
      document.removeEventListener("focusin", aufFokusAusserhalb);
      document.removeEventListener("keydown", aufEsc);
    };
  }, [offen]);

  if (!GLOCKE_ROLLEN.includes(role)) return null;

  function umschalten() {
    setOffen((wert) => !wert);
    if (!gesehen) alsGesehenMerken();
  }

  return (
    <div className="relative" ref={wurzelRef}>
      <button
        ref={knopfRef}
        type="button"
        onClick={umschalten}
        aria-label={dashboardT("notifications")}
        aria-haspopup="dialog"
        aria-expanded={offen}
        aria-controls={offen ? panelId : undefined}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-muted"
      >
        <Bell className="h-4 w-4" />
        {gesehen ? null : (
          <span
            aria-hidden="true"
            data-glocke-punkt=""
            className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary"
          />
        )}
      </button>

      {offen ? (
        // Rechts buendig an der Glocke, die 16 px vom Fensterrand steht. Unter
        // 352 px Fensterbreite blieben links sonst keine 16 px, dort haelt
        // max-w das Panel im Fenster.
        //
        // bg-schwebend und nicht bg-card wie beim Sync-Panel: --card ist im
        // Dunkeln zu 26 % durchsichtig, und durch das Panel schimmerte der
        // Reifegrad-Ring der Uebersicht (siehe globals.css, --schwebend).
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-labelledby={titelId}
          tabIndex={-1}
          className="absolute right-0 top-11 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-schwebend p-3 shadow-lg outline-none"
        >
          <p id={titelId} className="text-xs font-black text-card-foreground">
            {t("titel")}
          </p>
          {/* Titel und Inhalt getrennt: Stufe 2 setzt hier die Liste ein und
              zeigt den Leerzustand nur noch, wenn sie leer ist. */}
          <div className="mt-3 flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-border p-4 text-center">
            <BellOff className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            <p className="text-xs font-semibold text-card-foreground">{t("leer")}</p>
            <p className="text-[11px] text-muted-foreground">{t("leerHinweis")}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
