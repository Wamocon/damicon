"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { useTranslations } from "next-intl";
import { Bell, BellOff } from "lucide-react";
import { usePersona } from "@/components/dashboard/persona";
import { Sheet } from "@/components/ui/sheet";
import { useIstHandy } from "@/components/ui/handy";
import type { Role } from "@/lib/rbac";

// Stufe 1 der Benachrichtigungen (WMCNL-2485): die Glocke oeffnet ein Fenster,
// das sagt, dass nichts vorliegt. Vorher war sie ein Knopf ohne Ziel mit einem
// Punkt, der immer "ungelesen" behauptete (UX-Audit Punkt 8). Echte Eintraege
// kommen mit Stufe 2 (WMCNL-2486): pro Person, ueber Supabase Realtime.
//
// Am Schreibtisch eine Schublade vom rechten Rand, auf dem Handy ein Blatt von
// unten wie Menue und Konto (ui/sheet.tsx). Das Popover an der Glocke davor war
// fuer eine Liste mit Symbol, Titel und zwei Zeilen Text zu schmal.
//
// Das Fenster haengt wie die Suche (suche/such-kontext.tsx) im Layout und nicht
// in der Kopfzeile: deren backdrop-blur macht sie zum Bezugsrahmen fuer
// fixierte Kinder, ein Sheet darin waere auf die Kopfzeile beschnitten.

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

interface GlockenWert {
  offen: boolean;
  oeffne: () => void;
}

const GlockenKontext = createContext<GlockenWert>({ offen: false, oeffne: () => {} });

export function GlockenProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("benachrichtigungen");
  const istHandy = useIstHandy();
  const [offen, setOffen] = useState(false);
  // Wer das Fenster geoeffnet hat, bekommt den Fokus zurueck - sonst stuende
  // er nach Esc irgendwo am Seitenanfang statt auf der Glocke.
  const ausloeserRef = useRef<HTMLElement | null>(null);

  const oeffne = useCallback(() => {
    ausloeserRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOffen(true);
  }, []);

  const schliesse = useCallback(() => {
    const ausloeser = ausloeserRef.current;
    ausloeserRef.current = null;
    flushSync(() => setOffen(false));
    if (ausloeser?.isConnected) ausloeser.focus();
  }, []);

  const wert = useMemo(() => ({ offen, oeffne }), [offen, oeffne]);

  return (
    <GlockenKontext.Provider value={wert}>
      {children}
      {/* modal auch auf dem Handy: das Blatt kommt aus der Kopfzeile, nicht
          aus der unteren Leiste, und die Leiste liegt unter seiner Blende. */}
      <Sheet
        offen={offen}
        onSchliessen={schliesse}
        titel={t("titel")}
        position={istHandy ? "unten" : "rechts"}
        modal
        schliessenLabel={t("schliessen")}
      >
        {/* Stufe 2 setzt hier die Liste ein und zeigt den Leerzustand nur
            noch, wenn sie leer ist. */}
        <div className="flex min-h-full flex-col items-center justify-center gap-2 px-6 py-12 text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <BellOff className="h-6 w-6" aria-hidden="true" />
          </span>
          <p className="text-sm font-semibold text-card-foreground">{t("leer")}</p>
          <p className="max-w-xs text-xs text-muted-foreground">{t("leerHinweis")}</p>
        </div>
      </Sheet>
    </GlockenKontext.Provider>
  );
}

export function Glocke() {
  const t = useTranslations("dashboard");
  const { role } = usePersona();
  const { offen, oeffne } = useContext(GlockenKontext);
  const gesehen = useSyncExternalStore(abonnieren, istGesehen, istGesehenServer);

  if (!GLOCKE_ROLLEN.includes(role)) return null;

  function oeffnen() {
    oeffne();
    if (!gesehen) alsGesehenMerken();
  }

  return (
    <button
      type="button"
      onClick={oeffnen}
      aria-label={t("notifications")}
      aria-haspopup="dialog"
      aria-expanded={offen}
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
  );
}
