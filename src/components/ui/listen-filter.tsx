"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search, SlidersHorizontal } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { Sheet } from "@/components/ui/sheet";
import { feldKlassen, knopfKlassen } from "@/components/ui/kit";
import { useLadeMeldung } from "@/components/ui/detailpanel-steuerung";
import { listenQuery, type Parameterwert } from "@/lib/listen/parameter";
import { cn } from "@/lib/utils";

// Filterleiste einer Liste (DESIGN.md Abschnitt 14, WMCNL-2488).
//
// Ein gewoehnliches GET-Formular: ohne JavaScript schickt "Anwenden" die
// Felder in die Adresse, und der Server rendert die gefilterte Liste. Mit
// JavaScript greift eine Auswahl sofort, die Suche nach einer kurzen
// Tipppause, und der Knopf wird unsichtbar (bleibt aber fuer Vorlesehilfen
// und die Enter-Taste da).
//
// Auf dem Handy stehen nur die Status-Pillen in der Leiste; Suche und die
// uebrigen Filter liegen hinter "Filter (n)" in einem Blatt von unten
// (Entscheidung vom 24.09.2026). Ohne JavaScript koennte der Knopf nichts
// oeffnen - dann bleiben die Felder sichtbar.

export type FilterFeld =
  | { typ: "suche"; name: string; label: string; platzhalter?: string }
  | {
      typ: "auswahl";
      name: string;
      label: string;
      optionen: { wert: string; text: string }[];
    }
  | {
      typ: "zeitraum";
      name: string;
      label: string;
      optionen: { wert: string; text: string }[];
      /** Der Wert, bei dem Von und Bis erscheinen. */
      eigenWert: string;
      von: { name: string; label: string };
      bis: { name: string; label: string };
    };

type Werte = Readonly<Record<string, Parameterwert>>;

const SUCHPAUSE_MS = 400;

function feldnamen(felder: readonly FilterFeld[]): string[] {
  return felder.flatMap((feld) =>
    feld.typ === "zeitraum" ? [feld.name, feld.von.name, feld.bis.name] : [feld.name],
  );
}

function ausFormular(form: HTMLFormElement, felder: readonly FilterFeld[]) {
  const daten = new FormData(form);
  const aenderung: Record<string, Parameterwert> = {};
  for (const feld of felder) {
    const wert = String(daten.get(feld.name) ?? "");
    aenderung[feld.name] = wert;
    if (feld.typ === "zeitraum") {
      // Von und Bis gelten nur beim eigenen Zeitraum; sonst fallen sie weg.
      const eigen = wert === feld.eigenWert;
      aenderung[feld.von.name] = eigen ? String(daten.get(feld.von.name) ?? "") : undefined;
      aenderung[feld.bis.name] = eigen ? String(daten.get(feld.bis.name) ?? "") : undefined;
    }
  }
  return aenderung;
}

function Felder({
  felder,
  werte,
  standard,
  praefix,
  sucheRef,
}: {
  felder: readonly FilterFeld[];
  werte: Werte;
  standard: Werte;
  praefix: string;
  sucheRef?: RefObject<HTMLInputElement | null>;
}) {
  const wert = (name: string) => String(werte[name] ?? standard[name] ?? "");
  const beschriftung = "schrift-label font-semibold text-card-foreground";

  return felder.map((feld) => {
    const id = `${praefix}-${feld.name}`;
    if (feld.typ === "suche") {
      return (
        <div key={feld.name} className="space-y-1 @xl/filter:col-span-2">
          <label htmlFor={id} className={beschriftung}>
            {feld.label}
          </label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground lg:left-2.5 lg:h-3.5 lg:w-3.5"
            />
            <input
              ref={sucheRef}
              id={id}
              name={feld.name}
              type="search"
              defaultValue={wert(feld.name)}
              placeholder={feld.platzhalter}
              autoComplete="off"
              enterKeyHint="search"
              className={cn(feldKlassen, "pl-9 lg:pl-8")}
            />
          </div>
        </div>
      );
    }
    if (feld.typ === "auswahl") {
      return (
        <div key={feld.name} className="space-y-1">
          <label htmlFor={id} className={beschriftung}>
            {feld.label}
          </label>
          <select id={id} name={feld.name} defaultValue={wert(feld.name)} className={feldKlassen}>
            {feld.optionen.map((option) => (
              <option key={option.wert} value={option.wert}>
                {option.text}
              </option>
            ))}
          </select>
        </div>
      );
    }
    return (
      // Von und Bis erscheinen per CSS, sobald "Eigener Zeitraum" gewaehlt
      // ist: :has() auf die gewaehlte Option. Das geht auch ohne Skript.
      <div key={feld.name} className="group/zeitraum space-y-1">
        <label htmlFor={id} className={beschriftung}>
          {feld.label}
        </label>
        <select id={id} name={feld.name} defaultValue={wert(feld.name)} className={feldKlassen}>
          {feld.optionen.map((option) => (
            <option
              key={option.wert}
              value={option.wert}
              className={option.wert === feld.eigenWert ? "eigen" : undefined}
            >
              {option.text}
            </option>
          ))}
        </select>
        <div className="hidden grid-cols-2 gap-2 pt-1 group-has-[option.eigen:checked]/zeitraum:grid">
          {[feld.von, feld.bis].map((teil) => (
            <div key={teil.name} className="space-y-1">
              <label htmlFor={`${praefix}-${teil.name}`} className={beschriftung}>
                {teil.label}
              </label>
              <input
                id={`${praefix}-${teil.name}`}
                name={teil.name}
                type="date"
                defaultValue={wert(teil.name)}
                className={feldKlassen}
              />
            </div>
          ))}
        </div>
      </div>
    );
  });
}

export function Listenfilter({
  pfad,
  werte,
  standard,
  filterSchluessel,
  felder,
  pillen,
  aktiveAnzahl,
}: {
  /** Pfad der Liste ohne Sprache, etwa "/dashboard/feld/pflueckaufgaben". */
  pfad: string;
  /** Der ganze Zustand der Liste, auch Auswahl und Reiter - sie bleiben erhalten. */
  werte: Werte;
  standard: Werte;
  filterSchluessel: readonly string[];
  felder: readonly FilterFeld[];
  /** Status-Pillen, serverseitig gerendert (FilterPillen). */
  pillen?: ReactNode;
  /** Abweichende Filter ausser den Pillen, fuer "Filter (n)". */
  aktiveAnzahl: number;
}) {
  const t = useTranslations("liste.filter");
  const router = useRouter();
  // Mit Sprache, fuer das action-Attribut des Formulars ohne Skript.
  const pfadMitSprache = usePathname();
  const [laeuft, starte] = useTransition();
  useLadeMeldung("liste", laeuft);
  const [blattOffen, setBlattOffen] = useState(false);
  // false beim Server-Rendern und bei der Hydration, danach true: das Blatt
  // haengt per Portal an <body>, und das gibt es erst im Browser.
  const imBrowser = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const sucheImBlatt = useRef<HTMLInputElement>(null);
  const tippPause = useRef<number | undefined>(undefined);
  const praefix = useId();
  const blattPraefix = useId();

  const namen = feldnamen(felder);
  // Felder ausserhalb des Formulars, die ein Absenden ohne Skript
  // mitschicken muss: Status-Pille, Auswahl, Reiter. Die Seite nicht - ein
  // neuer Filter faengt auf Seite 1 an.
  const behalten = Object.entries(werte).filter(
    ([name, wert]) =>
      !namen.includes(name) &&
      name !== "seite" &&
      wert !== undefined &&
      wert !== "" &&
      String(wert) !== String(standard[name] ?? ""),
  );

  function navigiere(aenderung: Record<string, Parameterwert>, ersetzen = false) {
    window.clearTimeout(tippPause.current);
    const query = listenQuery({ werte, standard, aenderung, filterSchluessel });
    const suche = new URLSearchParams(query).toString();
    const ziel = suche ? `${pfad}?${suche}` : pfad;
    starte(() => {
      if (ersetzen) router.replace(ziel, { scroll: false });
      else router.push(ziel, { scroll: false });
    });
  }

  // Nach Zurueck, Vor oder "Zuruecksetzen" stehen neue Werte in der Adresse,
  // die Felder aber zeigen noch die alten - sie sind unkontrolliert. Gleich
  // ziehen, ausser dem Feld, in dem gerade getippt wird. Nur wenn sich die
  // Werte wirklich aendern: sonst setzte jedes Rendern ein halb getipptes
  // Suchwort zurueck, sobald der Fokus weiterwandert.
  const sollWerte = JSON.stringify(
    Object.fromEntries(namen.map((name) => [name, String(werte[name] ?? standard[name] ?? "")])),
  );
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const soll = JSON.parse(sollWerte) as Record<string, string>;
    for (const [name, wert] of Object.entries(soll)) {
      const feld = form.elements.namedItem(name);
      if (!(feld instanceof HTMLInputElement || feld instanceof HTMLSelectElement)) continue;
      if (feld === document.activeElement) continue;
      if (feld.value !== wert) feld.value = wert;
    }
  }, [sollWerte]);

  function beiAbsenden(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigiere(ausFormular(event.currentTarget, felder));
    setBlattOffen(false);
  }

  function beiAenderung(event: ChangeEvent<HTMLFormElement>) {
    const ziel = event.target as unknown as HTMLInputElement | HTMLSelectElement;
    const form = event.currentTarget;
    if (ziel instanceof HTMLInputElement && ziel.type === "search") {
      // Tippen legt keinen Verlaufseintrag je Buchstabe an: replace.
      window.clearTimeout(tippPause.current);
      tippPause.current = window.setTimeout(
        () => navigiere(ausFormular(form, felder), true),
        SUCHPAUSE_MS,
      );
      return;
    }
    // "Eigener Zeitraum" greift erst, wenn ein Datum steht.
    const zeitraum = felder.find(
      (feld): feld is Extract<FilterFeld, { typ: "zeitraum" }> =>
        feld.typ === "zeitraum" && feld.name === ziel.name,
    );
    if (zeitraum && ziel.value === zeitraum.eigenWert) return;
    navigiere(ausFormular(form, felder));
  }

  useEffect(() => () => window.clearTimeout(tippPause.current), []);

  const zuruecksetzen = (() => {
    const aenderung: Record<string, Parameterwert> = {};
    for (const name of namen) aenderung[name] = standard[name];
    const query = listenQuery({ werte, standard, aenderung, filterSchluessel });
    return { pathname: pfad, query };
  })();

  const blatt =
    imBrowser && blattOffen
      ? createPortal(
          <Sheet
            offen
            onSchliessen={() => setBlattOffen(false)}
            titel={t("titel")}
            position="unten"
            modal
            anfangsFokus={sucheImBlatt}
            schliessenLabel={t("schliessen")}
          >
            <form onSubmit={beiAbsenden} className="@container/filter space-y-3 p-4">
              <Felder
                felder={felder}
                werte={werte}
                standard={standard}
                praefix={blattPraefix}
                sucheRef={sucheImBlatt}
              />
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  className={knopfKlassen({ rundung: "schmal", groesse: "gross", breit: true })}
                >
                  {t("anzeigen")}
                </button>
                {aktiveAnzahl > 0 ? (
                  <Link
                    href={zuruecksetzen}
                    scroll={false}
                    onClick={() => setBlattOffen(false)}
                    className={knopfKlassen({
                      variante: "leise",
                      rundung: "schmal",
                      groesse: "gross",
                      className: "shrink-0",
                    })}
                  >
                    {t("zuruecksetzen")}
                  </Link>
                ) : null}
              </div>
            </form>
          </Sheet>,
          document.body,
        )
      : null;

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">{pillen}</div>
        <button
          type="button"
          onClick={() => setBlattOffen(true)}
          aria-haspopup="dialog"
          aria-expanded={blattOffen}
          className={cn(
            "hidden min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold max-md:mit-js:inline-flex",
            aktiveAnzahl > 0
              ? "border-primary bg-primary/5 text-foreground"
              : "border-border bg-card text-muted-foreground",
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          {aktiveAnzahl > 0 ? t("knopfMitAnzahl", { anzahl: aktiveAnzahl }) : t("knopf")}
        </button>
      </div>
      <div className="@container/filter max-md:mit-js:hidden">
        <form
          ref={formRef}
          method="get"
          action={pfadMitSprache}
          role="search"
          aria-label={t("titel")}
          onSubmit={beiAbsenden}
          onChange={beiAenderung}
          className="grid items-start gap-2.5 @xl/filter:grid-cols-2 @4xl/filter:grid-cols-4"
        >
          {behalten.map(([name, wert]) => (
            <input key={name} type="hidden" name={name} value={String(wert)} />
          ))}
          <Felder felder={felder} werte={werte} standard={standard} praefix={praefix} />
          <div className="flex items-end gap-2 self-end">
            <button
              type="submit"
              className={cn(
                knopfKlassen({ variante: "leise", rundung: "schmal", groesse: "formular" }),
                "mit-js:sr-only",
              )}
            >
              {t("anwenden")}
            </button>
            {aktiveAnzahl > 0 ? (
              <Link
                href={zuruecksetzen}
                scroll={false}
                className="inline-flex min-h-11 items-center text-sm font-semibold text-primary lg:min-h-9 lg:text-xs"
              >
                {t("zuruecksetzen")}
              </Link>
            ) : null}
          </div>
        </form>
      </div>
      {blatt}
    </div>
  );
}
