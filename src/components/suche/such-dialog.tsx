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
import { useKiPane } from "@/components/ki/ki-pane-kontext";
import { optionId, SuchListe } from "@/components/suche/such-liste";
import { Sheet } from "@/components/ui/sheet";
import { baueSuchErgebnis, type SuchOption } from "@/lib/suche/gruppen";
import {
  baueSeitenZiele,
  zielSchluesselFuerPfad,
  type ZielSchluessel,
} from "@/lib/suche/seiten-ziele";

// Das Suchfenster: ein Blatt mit dem Eingabefeld im Kopf und den Treffern
// darunter, oben in der Mitte des Bildschirms. Aufgebaut nach dem
// WAI-ARIA-Muster "Combobox mit Listbox": der Fokus bleibt immer im Feld, die
// Pfeiltasten verschieben nur die Markierung (aria-activedescendant), Enter
// oeffnet den markierten Treffer. So kann man weitertippen, ohne erst zurueck
// ins Feld zu muessen.
//
// Was zu einer Eingabe erscheint, rechnet lib/suche/gruppen.ts aus; die Liste
// selbst zeichnet such-liste.tsx. Hier bleiben Eingabe, Markierung, Auswahl
// und die Ansage fuer Vorlesehilfen.

// Die Trefferzahl wird erst vorgelesen, wenn das Tippen ruht - sonst redet
// die Vorlesehilfe bei jedem Buchstaben dazwischen.
const ANSAGE_NACH_MS = 400;

export function SuchDialog({
  feldRef,
  zuletzt,
  onMerke,
  onSchliessen,
}: {
  feldRef: RefObject<HTMLInputElement | null>;
  zuletzt: readonly string[];
  /** Fuer "Zuletzt geoeffnet", wo die Aufzeichnung ueber den Pfad nichts sieht. */
  onMerke: (schluessel: ZielSchluessel) => void;
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
  const hinweisId = useId();
  const [eingabe, setEingabe] = useState("");
  const [aktiv, setAktiv] = useState(0);
  const [ruhendeEingabe, setRuhendeEingabe] = useState("");
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
  const ergebnis = baueSuchErgebnis({
    ziele,
    begriff,
    zuletzt,
    offeneSeite,
    kiVerfuegbar: ki.verfuegbar,
  });
  const optionen = ergebnis.gruppen.flatMap((gruppe) => gruppe.optionen);
  const aktivIndex = optionen.length > 0 ? Math.min(aktiv, optionen.length - 1) : -1;

  const hinweis =
    ergebnis.hinweis === "keineTreffer"
      ? t("keineTreffer", { begriff })
      : ergebnis.hinweis === "leer"
        ? t("leer")
        : null;
  // Angesagt wird erst, wenn die Eingabe ruht, und dann das Ergebnis, das
  // ohnehin gerade dasteht. Solange getippt wird, bleibt die Region leer.
  const ansage =
    ruhendeEingabe !== eingabe || ergebnis.anzahl === null
      ? ""
      : ergebnis.anzahl === 0
        ? t("keineTreffer", { begriff })
        : t("anzahl", { anzahl: ergebnis.anzahl });

  function beiEingabe(wert: string) {
    setEingabe(wert);
    setAktiv(0);
    window.clearTimeout(ansageTimer.current);
    ansageTimer.current = window.setTimeout(() => setRuhendeEingabe(wert), ANSAGE_NACH_MS);
  }

  function waehle(option: SuchOption) {
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
      onMerke(ziel.schluessel);
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

  // Pfeile und Enter gehoeren dem Feld. Esc und Tab laufen weiter zum Sheet:
  // Schliessen und Fokusfalle.
  function beiTaste(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (optionen.length === 0) return;
      const schritt = event.key === "ArrowDown" ? 1 : -1;
      const neu = (aktivIndex + schritt + optionen.length) % optionen.length;
      setAktiv(neu);
      document.getElementById(optionId(listeId, neu))?.scrollIntoView({ block: "nearest" });
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      // Waehrend eine Eingabemethode noch Zeichen zusammensetzt, bestaetigt
      // Enter nur das Zeichen.
      if (event.nativeEvent.isComposing) return;
      const option = optionen[aktivIndex];
      if (option) waehle(option);
    }
  }

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
            aria-activedescendant={aktivIndex >= 0 ? optionId(listeId, aktivIndex) : undefined}
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
        <SuchListe
          listeId={listeId}
          gruppen={ergebnis.gruppen}
          aktivIndex={aktivIndex}
          onAktiv={setAktiv}
          onWaehle={waehle}
        />
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
