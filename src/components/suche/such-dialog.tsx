"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { usePersona } from "@/components/dashboard/persona";
import { Icon } from "@/components/icon";
import { Himbeere } from "@/components/ki/himbeere";
import { useKiPane } from "@/components/ki/ki-pane-kontext";
import { BlattZeilenInhalt, blattZeilenKlassen } from "@/components/ui/blatt-zeile";
import { Sheet } from "@/components/ui/sheet";
import { zerlegeAnfrage } from "@/lib/suche/kern";
import {
  baueSeitenZiele,
  sucheSeiten,
  zielSchluesselFuerPfad,
  type SeitenZiel,
} from "@/lib/suche/seiten-ziele";
import { browserAblage, merkeZuletzt, zuletztAufloesen } from "@/lib/suche/zuletzt";
import { cn } from "@/lib/utils";

// Das Suchfenster: ein Blatt von oben mit dem Eingabefeld im Kopf und den
// Treffern darunter. Aufgebaut nach dem WAI-ARIA-Muster "Combobox mit
// Listbox": der Fokus bleibt immer im Feld, die Pfeiltasten verschieben nur
// die Markierung (aria-activedescendant), Enter oeffnet den markierten
// Treffer. So kann man weitertippen, ohne erst zurueck ins Feld zu muessen.

type Option = { art: "ziel"; ziel: SeitenZiel } | { art: "ki"; begriff: string };

// Ein einzelner Buchstabe ist keine Frage an die KI.
const KI_AB = 2;
// Die Trefferzahl wird erst vorgelesen, wenn das Tippen ruht - sonst redet
// die Vorlesehilfe bei jedem Buchstaben dazwischen.
const ANSAGE_NACH_MS = 400;

export function SuchDialog({
  feldRef,
  zuletzt,
  nutzerId,
  onSchliessen,
}: {
  feldRef: RefObject<HTMLInputElement | null>;
  zuletzt: readonly string[];
  nutzerId: string | null;
  /** fokusZurueck: ohne Sprung geschlossen, der Ausloeser bekommt den Fokus wieder. */
  onSchliessen: (fokusZurueck: boolean) => void;
}) {
  const t = useTranslations("suche");
  const alle = useTranslations();
  const locale = useLocale();
  const { role, demoModus } = usePersona();
  const pathname = usePathname();
  const router = useRouter();
  const ki = useKiPane();
  const listeId = useId();
  const gruppeId = useId();
  const hinweisId = useId();
  const [eingabe, setEingabe] = useState("");
  const [aktiv, setAktiv] = useState(0);
  const [angesagt, setAngesagt] = useState("");
  const ansageTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(ansageTimer.current), []);

  // Mit der Ansichtsrolle, wie Seitenleiste und Menue-Blatt: bei "Ansicht
  // als" findet die Suche genau das, was die Navigation zeigt.
  const ziele = useMemo(
    () => baueSeitenZiele(role, { demoModus, locale }, (schluessel) => alle(schluessel)),
    [role, demoModus, locale, alle],
  );

  const offeneSeite = zielSchluesselFuerPfad(pathname);
  const begriff = eingabe.trim();
  const mitAnfrage = zerlegeAnfrage(begriff) !== null;
  const treffer = mitAnfrage ? sucheSeiten(ziele, begriff) : [];
  const zuletztZiele = mitAnfrage ? [] : zuletztAufloesen(zuletzt, ziele, offeneSeite);
  const kiZeile =
    mitAnfrage && treffer.length === 0 && ki.verfuegbar && begriff.length >= KI_AB;

  const optionen: Option[] = [
    ...(mitAnfrage ? treffer : zuletztZiele).map((ziel): Option => ({ art: "ziel", ziel })),
    ...(kiZeile ? [{ art: "ki", begriff } satisfies Option] : []),
  ];
  const aktivIndex = optionen.length > 0 ? Math.min(aktiv, optionen.length - 1) : -1;
  const optionId = (index: number) => `${listeId}-${index}`;

  const gruppenTitel = mitAnfrage
    ? treffer.length > 0
      ? t("gruppeTreffer")
      : null
    : zuletztZiele.length > 0
      ? t("gruppeZuletzt")
      : null;
  const hinweis = mitAnfrage
    ? treffer.length === 0
      ? t("keineTreffer", { begriff })
      : null
    : zuletztZiele.length === 0
      ? t("leer")
      : null;

  const angesagtBegriff = angesagt.trim();
  const angesagtAnzahl =
    zerlegeAnfrage(angesagtBegriff) === null
      ? null
      : sucheSeiten(ziele, angesagtBegriff).length;
  const ansage =
    angesagtAnzahl === null
      ? ""
      : angesagtAnzahl === 0
        ? t("keineTreffer", { begriff: angesagtBegriff })
        : t("anzahl", { anzahl: angesagtAnzahl });

  function beiEingabe(wert: string) {
    setEingabe(wert);
    setAktiv(0);
    window.clearTimeout(ansageTimer.current);
    ansageTimer.current = window.setTimeout(() => setAngesagt(wert), ANSAGE_NACH_MS);
  }

  function waehle(option: Option) {
    if (option.art === "ki") {
      // Erst die Suche zu, dann das Panel auf: beide liegen ueber der Seite,
      // uebereinander waere eines zu viel.
      onSchliessen(false);
      ki.frageStellen(option.begriff);
      return;
    }
    const { ziel } = option;
    if (ziel.extern) {
      // Das Handbuch laeuft im neuen Tab ausserhalb von React - die
      // Aufzeichnung ueber den Pfad sieht es nicht, also hier von Hand.
      window.open(ziel.href, "_blank", "noopener");
      merkeZuletzt(browserAblage(), nutzerId, ziel.schluessel);
      onSchliessen(true);
      return;
    }
    if (ziel.schluessel === offeneSeite) {
      onSchliessen(true);
      return;
    }
    onSchliessen(false);
    router.push(ziel.href);
  }

  // Pfeile und Enter gehoeren dem Feld. stopPropagation, damit sie nicht
  // zusaetzlich bei Himbis Tour ankommen, die am window auf Pfeile hoert.
  // Esc und Tab laufen weiter zum Sheet: Schliessen und Fokusfalle.
  function beiTaste(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      if (optionen.length === 0) return;
      const schritt = event.key === "ArrowDown" ? 1 : -1;
      const neu = (aktivIndex + schritt + optionen.length) % optionen.length;
      setAktiv(neu);
      document.getElementById(optionId(neu))?.scrollIntoView({ block: "nearest" });
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      // Waehrend eine Eingabemethode noch Zeichen zusammensetzt, bestaetigt
      // Enter nur das Zeichen.
      if (event.nativeEvent.isComposing) return;
      const option = optionen[aktivIndex];
      if (option) waehle(option);
    }
  }

  const zeilen = optionen.map((option, index) => (
    <div
      key={option.art === "ziel" ? option.ziel.schluessel : "ki"}
      id={optionId(index)}
      role="option"
      aria-selected={index === aktivIndex}
      // Der Fokus bleibt im Feld, auch wenn man mit der Maus waehlt.
      onMouseDown={(event) => event.preventDefault()}
      onPointerMove={() => {
        if (index !== aktivIndex) setAktiv(index);
      }}
      onClick={() => waehle(option)}
      className={cn(
        blattZeilenKlassen(false),
        "cursor-pointer lg:h-12",
        // Nicht nur Farbe: der Rahmen traegt die Markierung auch fuer alle,
        // die den Farbton nicht unterscheiden.
        index === aktivIndex && "border-primary/40 bg-muted ring-2 ring-ring",
      )}
    >
      {option.art === "ziel" ? (
        <BlattZeilenInhalt
          symbol={<Icon name={option.ziel.symbol} className="h-4 w-4" />}
          text={option.ziel.titel}
          untertitel={option.ziel.untertitel}
        />
      ) : (
        <BlattZeilenInhalt
          symbol={<Himbeere groesse={18} />}
          text={t("kiFragen", { begriff: option.begriff })}
        />
      )}
    </div>
  ));

  return (
    <Sheet
      offen
      onSchliessen={() => onSchliessen(true)}
      titel={t("titel")}
      position="oben"
      anfangsFokus={feldRef}
      schliessenLabel={t("schliessen")}
      kopf={
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={feldRef}
            type="text"
            role="combobox"
            aria-label={t("eingabe")}
            aria-describedby={hinweisId}
            aria-autocomplete="list"
            aria-controls={listeId}
            aria-expanded={optionen.length > 0}
            aria-activedescendant={aktivIndex >= 0 ? optionId(aktivIndex) : undefined}
            value={eingabe}
            onChange={(event) => beiEingabe(event.target.value)}
            onKeyDown={beiTaste}
            placeholder={t("platzhalter")}
            inputMode="search"
            enterKeyHint="go"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            // text-base unter lg: Safari auf iOS zoomt bei kleinerer Schrift
            // beim Fokus hinein und bleibt vergroessert (DESIGN.md).
            className="h-11 min-w-0 flex-1 rounded-md bg-transparent text-base text-foreground placeholder:text-muted-foreground lg:h-9 lg:text-sm"
          />
        </div>
      }
    >
      <div className="p-2">
        {hinweis ? <p className="px-3 py-4 text-sm text-muted-foreground">{hinweis}</p> : null}
        <div
          role="listbox"
          id={listeId}
          aria-label={t("ergebnisse")}
          hidden={optionen.length === 0}
        >
          {gruppenTitel ? (
            <div role="group" aria-labelledby={gruppeId} className="space-y-1">
              <div
                id={gruppeId}
                role="presentation"
                className="px-3 pb-1 pt-2 schrift-label font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {gruppenTitel}
              </div>
              {zeilen}
            </div>
          ) : (
            <div className="space-y-1">{zeilen}</div>
          )}
        </div>
        <p id={hinweisId} className="sr-only">
          {t("bedienung")}
        </p>
        <p role="status" className="sr-only">
          {ansage}
        </p>
      </div>
    </Sheet>
  );
}
