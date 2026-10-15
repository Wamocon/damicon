"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { useFormatter, useTranslations } from "next-intl";
import { Bell, BellOff } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { holeBenachrichtigungen, markiereBenachrichtigungenGelesen } from "@/lib/actions/benachrichtigungen";
import { ABRUF_INTERVALL_MS, benachrichtigungTon, plakatZahl, type BenachrichtigungEintrag } from "@/lib/domain/benachrichtigungen";
import { modules, moduleHref } from "@/lib/modules";
import { usePersona } from "@/components/dashboard/persona";
import { Sheet } from "@/components/ui/sheet";
import { useIstHandy } from "@/components/ui/handy";
import type { Role } from "@/lib/rbac";

// Stufe 1 der Benachrichtigungen (WMCNL-2485): die Glocke oeffnet ein Fenster,
// das sagt, dass nichts vorliegt. Vorher war sie ein Knopf ohne Ziel mit einem
// Punkt, der immer "ungelesen" behauptete (UX-Audit Punkt 8).
//
// Stufe 2 (WMCNL-2486): das Fenster zeigt die Hinweise der Person (Nachweise, ЭСФ,
// ЕСУТД, Block-Risiko), die die Datenbank stuendlich erzeugt (Migration
// 20261208150000). Die Glocke fragt beim Laden, alle fuenf Minuten, solange die
// Seite sichtbar ist, und beim Oeffnen; ein Klick auf einen Hinweis markiert ihn
// als gelesen und fuehrt ins Modul. Supabase Realtime waere moeglich, aber der
// Takt der Erzeugung ist stuendlich: Nachfragen reicht und braucht keine
// dauerhafte Verbindung.
//
// Am Schreibtisch eine Schublade vom rechten Rand, auf dem Handy ein Blatt von
// unten wie Menue und Konto (ui/sheet.tsx). Ein Popover an der Glocke nach dem
// Muster des Sync-Panels war ausprobiert und verworfen: fuer eine Liste mit
// Symbol, Titel und zwei Zeilen Text zu schmal.
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

interface GlockenWert {
  offen: boolean;
  oeffne: () => void;
  /** Zahl der ungelesenen Hinweise (0 ohne Datenbank oder wenn nichts vorliegt). */
  ungelesen: number;
}

const GlockenKontext = createContext<GlockenWert>({ offen: false, oeffne: () => {}, ungelesen: 0 });

const HINWEIS_ICON = { danger: "text-destructive", warning: "text-warning" } as const;

/** Eine Zeile des Fensters: Titel, wann, wohin. Ein Klick markiert den Hinweis als gelesen (beim Verlassen der Seite) und fuehrt ins Modul. */
function HinweisZeile({ eintrag, beiKlick }: { eintrag: BenachrichtigungEintrag; beiKlick: (eintrag: BenachrichtigungEintrag) => void }) {
  const t = useTranslations("benachrichtigungen");
  const format = useFormatter();
  const modul = modules.find((m) => m.key === eintrag.modul);
  const inhalt = (
    <>
      <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${eintrag.gelesen ? "bg-transparent" : "bg-primary"}`} />
      <span className="min-w-0 flex-1">
        <span className={`block text-sm ${eintrag.gelesen ? "text-muted-foreground" : "font-semibold text-card-foreground"} `}>
          <Bell className={`mr-1.5 inline h-3.5 w-3.5 ${HINWEIS_ICON[benachrichtigungTon[eintrag.art]]}`} aria-hidden="true" />
          {t(`art.${eintrag.art}`, { name: eintrag.parameter.name ?? "", anzahl: eintrag.parameter.anzahl ?? 0 })}
        </span>
        <span className="block text-[11px] text-muted-foreground">{format.relativeTime(new Date(eintrag.erstelltAm))}</span>
      </span>
    </>
  );
  const klassen = "flex items-start gap-2.5 border-b border-border px-4 py-3 text-left transition-colors hover:bg-muted/60";
  return modul ? (
    <Link href={moduleHref(modul)} onClick={() => beiKlick(eintrag)} className={klassen}>
      {inhalt}
    </Link>
  ) : (
    <button type="button" onClick={() => beiKlick(eintrag)} className={`${klassen} w-full`}>
      {inhalt}
    </button>
  );
}

export function GlockenProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("benachrichtigungen");
  const istHandy = useIstHandy();
  const { role } = usePersona();
  const [offen, setOffen] = useState(false);
  const [eintraege, setEintraege] = useState<BenachrichtigungEintrag[]>([]);
  const [ungelesen, setUngelesen] = useState(0);
  const sichtbar = GLOCKE_ROLLEN.includes(role);

  const laden = useCallback(async () => {
    const stand = await holeBenachrichtigungen().catch(() => null);
    if (!stand) return;
    setEintraege(stand.eintraege);
    setUngelesen(stand.ungelesen);
  }, []);

  // Beim Laden und danach alle fuenf Minuten, aber nur, solange die Seite sichtbar ist; beim Zurueckkehren sofort.
  useEffect(() => {
    if (!sichtbar) return;
    const abruf = () => {
      if (document.visibilityState === "visible") void laden();
    };
    abruf();
    const takt = setInterval(abruf, ABRUF_INTERVALL_MS);
    document.addEventListener("visibilitychange", abruf);
    return () => {
      clearInterval(takt);
      document.removeEventListener("visibilitychange", abruf);
    };
  }, [sichtbar, laden]);

  const gelesen = useCallback(
    async (auswahl: string[] | "alle") => {
      const ids = auswahl === "alle" ? null : new Set(auswahl);
      // Sofort in der Oberflaeche, damit der Klick nicht auf die Antwort wartet; schlaegt es fehl, holt der naechste Abruf den echten Stand.
      setEintraege((alt) => alt.map((e) => (ids === null || ids.has(e.id) ? { ...e, gelesen: true } : e)));
      setUngelesen((alt) => (ids === null ? 0 : Math.max(0, alt - eintraege.filter((e) => !e.gelesen && ids.has(e.id)).length)));
      if (!(await markiereBenachrichtigungenGelesen(auswahl))) void laden();
    },
    [eintraege, laden],
  );
  // Wer das Fenster geoeffnet hat, bekommt den Fokus zurueck - sonst stuende
  // er nach Esc irgendwo am Seitenanfang statt auf der Glocke.
  const ausloeserRef = useRef<HTMLElement | null>(null);

  const oeffne = useCallback(() => {
    ausloeserRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOffen(true);
    void laden();
  }, [laden]);

  const schliesse = useCallback(() => {
    const ausloeser = ausloeserRef.current;
    ausloeserRef.current = null;
    flushSync(() => setOffen(false));
    if (ausloeser?.isConnected) ausloeser.focus();
  }, []);

  const wert = useMemo(() => ({ offen, oeffne, ungelesen }), [offen, oeffne, ungelesen]);

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
        {eintraege.length > 0 ? (
          <div className="flex min-h-full flex-col">
            {ungelesen > 0 ? (
              <button type="button" onClick={() => void gelesen("alle")} className="border-b border-border px-4 py-2.5 text-left text-xs font-semibold text-primary hover:bg-muted/60">
                {t("alleGelesen")}
              </button>
            ) : null}
            <ul>
              {eintraege.map((eintrag) => (
                <li key={eintrag.id}>
                  <HinweisZeile eintrag={eintrag} beiKlick={(e) => void (e.gelesen ? schliesse() : gelesen([e.id]).then(schliesse))} />
                </li>
              ))}
            </ul>
            <p className="px-4 py-3 text-[11px] text-muted-foreground">{t("leerHinweis")}</p>
          </div>
        ) : (
          <div className="flex min-h-full flex-col items-center justify-center gap-2 px-6 py-12 text-center">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <BellOff className="h-6 w-6" aria-hidden="true" />
            </span>
            <p className="text-sm font-semibold text-card-foreground">{t("leer")}</p>
            <p className="max-w-xs text-xs text-muted-foreground">{t("leerHinweis")}</p>
          </div>
        )}
      </Sheet>
    </GlockenKontext.Provider>
  );
}

export function Glocke() {
  const t = useTranslations("dashboard");
  const { role } = usePersona();
  const tb = useTranslations("benachrichtigungen");
  const { offen, oeffne, ungelesen } = useContext(GlockenKontext);

  if (!GLOCKE_ROLLEN.includes(role)) return null;

  return (
    <button
      type="button"
      onClick={oeffne}
      aria-label={ungelesen > 0 ? `${t("notifications")}, ${tb("ungelesenAnzahl", { anzahl: ungelesen })}` : t("notifications")}
      aria-haspopup="dialog"
      aria-expanded={offen}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-muted"
    >
      <Bell className="h-4 w-4" />
      {ungelesen > 0 ? (
        <span
          aria-hidden="true"
          data-glocke-zahl=""
          className="absolute -right-1.5 -top-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-4 text-primary-foreground"
        >
          {plakatZahl(ungelesen)}
        </span>
      ) : null}
    </button>
  );
}
