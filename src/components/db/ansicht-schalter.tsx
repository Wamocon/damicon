"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, LayoutGrid, List } from "lucide-react";

// Umschalter Liste und Raster für die Auflistungen der Wissensverwaltung (Dokumentliste, Auflistung beim Hochladen).
// Liste: eine Zeile je Element mit Titel und den wichtigsten Angaben, die Details klappen auf. Raster: große Kacheln mit allen Angaben.
// Die Wahl merkt sich der Browser je Auflistung (localStorage, nur eine Annehmlichkeit: ohne Speicher gilt die Liste).

export type Ansicht = "liste" | "raster";

function lese(schluessel: string): Ansicht {
  try {
    if (typeof window === "undefined") return "liste";
    const wert = window.localStorage.getItem(schluessel);
    return wert === "raster" ? "raster" : "liste";
  } catch {
    return "liste";
  }
}

/** Die gewählte Ansicht, gemerkt unter `schluessel`. Die Auflistungen erscheinen erst nach dem Laden im Browser, der Anfangswert stimmt dann schon. */
export function useAnsicht(schluessel: string): [Ansicht, (a: Ansicht) => void] {
  const [ansicht, setzeAnsicht] = useState<Ansicht>(() => lese(schluessel));
  const waehle = useCallback(
    (a: Ansicht) => {
      setzeAnsicht(a);
      try {
        window.localStorage.setItem(schluessel, a);
      } catch {
        // ohne Speicher gilt die Wahl nur für diese Sitzung
      }
    },
    [schluessel],
  );
  return [ansicht, waehle];
}

/**
 * Welche Elemente der Liste aufgeklappt sind. Ohne ausdrückliche Wahl gilt der Standard des Elements (zum Beispiel: wartet auf mich, braucht
 * Aufmerksamkeit); eine Wahl der Person hat Vorrang, auch "alle auf" und "alle zu".
 */
export function useAufgeklappt<K extends string | number>() {
  const [wahl, setzeWahl] = useState<ReadonlyMap<K, boolean>>(new Map());
  const istOffen = useCallback((schluessel: K, standard: boolean) => wahl.get(schluessel) ?? standard, [wahl]);
  const schalte = useCallback(
    (schluessel: K, standard: boolean) =>
      setzeWahl((alt) => {
        const neu = new Map(alt);
        neu.set(schluessel, !(alt.get(schluessel) ?? standard));
        return neu;
      }),
    [],
  );
  const setzeAlle = useCallback((schluessel: readonly K[], offen: boolean) => setzeWahl(new Map(schluessel.map((s) => [s, offen] as const))), []);
  return { istOffen, schalte, setzeAlle };
}

export function AnsichtSchalter({
  ansicht,
  beiWahl,
  beiAlle,
}: {
  ansicht: Ansicht;
  beiWahl: (a: Ansicht) => void;
  /** Nur in der Liste: alle Elemente auf- oder zuklappen. */
  beiAlle?: (offen: boolean) => void;
}) {
  const t = useTranslations("kiAssistentAnsicht.wissensVerwaltung.ansicht");
  const knopf = (a: Ansicht, text: string, icon: React.ReactNode) => (
    <button
      type="button"
      aria-pressed={ansicht === a}
      onClick={() => beiWahl(a)}
      className={`inline-flex h-8 items-center gap-1.5 px-2.5 text-[11px] font-semibold transition ${
        ansicht === a ? "bg-primary text-primary-foreground" : "bg-background text-card-foreground hover:bg-muted"
      }`}
    >
      {icon}
      {text}
    </button>
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label={t("gruppe")} className="inline-flex overflow-hidden rounded-lg border border-border">
        {knopf("liste", t("liste"), <List className="size-3.5" aria-hidden="true" />)}
        {knopf("raster", t("raster"), <LayoutGrid className="size-3.5" aria-hidden="true" />)}
      </div>
      {ansicht === "liste" && beiAlle ? (
        <>
          <button type="button" onClick={() => beiAlle(true)} className="inline-flex h-8 items-center rounded-lg border border-border px-2.5 text-[11px] font-semibold hover:bg-muted">
            {t("alleAuf")}
          </button>
          <button type="button" onClick={() => beiAlle(false)} className="inline-flex h-8 items-center rounded-lg border border-border px-2.5 text-[11px] font-semibold hover:bg-muted">
            {t("alleZu")}
          </button>
        </>
      ) : null}
    </div>
  );
}

/** Der Pfeil am Ende einer aufklappbaren Zeile; dreht sich beim Aufklappen. */
export function AufklappPfeil({ offen }: { offen: boolean }) {
  return <ChevronDown aria-hidden="true" className={`size-4 shrink-0 text-muted-foreground transition-transform ${offen ? "rotate-180" : ""}`} />;
}
