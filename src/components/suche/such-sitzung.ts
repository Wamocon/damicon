"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { usePersona } from "@/components/dashboard/persona";
import { useKiPane } from "@/components/ki/ki-pane-kontext";
import { optionId, type SuchGruppe, type SuchOption } from "@/components/suche/such-liste";
import { zerlegeAnfrage } from "@/lib/suche/kern";
import {
  baueSeitenZiele,
  sucheInTexten,
  sucheSeiten,
  zielSchluesselFuerPfad,
  type SeitenZiel,
  type ZielSchluessel,
} from "@/lib/suche/seiten-ziele";
import { browserAblage, merkeZuletzt, zuletztAufloesen } from "@/lib/suche/zuletzt";

// Was die Suchleiste in der Kopfzeile (such-leiste.tsx, ab xl) und das
// Suchfenster (such-dialog.tsx, darunter) gemeinsam haben: Eingabe, Treffer,
// Markierung, Auswahl und Ansage. Zwei Oberflaechen, eine Suche - zwei Kopien
// liefen beim naechsten Zusatz auseinander, und die vergessene fiele erst
// auf, wenn jemand auf der anderen Breite sucht.
//
// Das Eingabefeld folgt dem WAI-ARIA-Muster "Combobox mit Listbox": der Fokus
// bleibt immer im Feld, die Pfeiltasten verschieben nur die Markierung
// (aria-activedescendant), Enter oeffnet den markierten Treffer.
//
// Bis zu drei Gruppen: die Namenstreffer, darunter "Erwaehnt in" mit Seiten,
// deren Text den Begriff nennt, und wenn beides leer bleibt die Frage an die KI.

// Ein einzelner Buchstabe ist keine Frage an die KI.
const KI_AB = 2;
// Die Trefferzahl wird erst vorgelesen, wenn das Tippen ruht - sonst redet
// die Vorlesehilfe bei jedem Buchstaben dazwischen.
const ANSAGE_NACH_MS = 400;

function suche(ziele: readonly SeitenZiel[], begriff: string) {
  const namen = sucheSeiten(ziele, begriff);
  const erwaehnt = sucheInTexten(
    ziele,
    begriff,
    new Set<ZielSchluessel>(namen.map((ziel) => ziel.schluessel)),
  );
  return { namen, erwaehnt };
}

export type SuchSitzung = ReturnType<typeof useSuchSitzung>;

export function useSuchSitzung({
  zuletzt,
  nutzerId,
  onSchliessen,
}: {
  zuletzt: readonly string[];
  nutzerId: string | null;
  /** Nach einer Auswahl. fokusZurueck: ohne Sprung auf eine andere Seite -
   *  der Fokus bleibt bzw. kehrt zurueck. */
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
  const { namen, erwaehnt } = mitAnfrage ? suche(ziele, begriff) : { namen: [], erwaehnt: [] };
  const zuletztZiele = mitAnfrage ? [] : zuletztAufloesen(zuletzt, ziele, offeneSeite);
  const nichtsGefunden = mitAnfrage && namen.length === 0 && erwaehnt.length === 0;
  const kiZeile = nichtsGefunden && ki.verfuegbar && begriff.length >= KI_AB;

  const gruppen: SuchGruppe[] = (
    mitAnfrage
      ? [
          {
            titel: t("gruppeTreffer"),
            optionen: namen.map((ziel): SuchOption => ({ art: "ziel", ziel })),
          },
          {
            titel: t("gruppeErwaehnt"),
            optionen: erwaehnt.map(
              ({ ziel, auszug }): SuchOption => ({ art: "ziel", ziel, auszug }),
            ),
          },
          {
            titel: null,
            optionen: kiZeile ? [{ art: "ki", begriff } satisfies SuchOption] : [],
          },
        ]
      : [
          {
            titel: t("gruppeZuletzt"),
            optionen: zuletztZiele.map((ziel): SuchOption => ({ art: "ziel", ziel })),
          },
        ]
  ).filter((gruppe) => gruppe.optionen.length > 0);
  const optionen = gruppen.flatMap((gruppe) => gruppe.optionen);
  const aktivIndex = optionen.length > 0 ? Math.min(aktiv, optionen.length - 1) : -1;

  const hinweis = nichtsGefunden
    ? t("keineTreffer", { begriff })
    : !mitAnfrage && zuletztZiele.length === 0
      ? t("leer")
      : null;

  const angesagtBegriff = angesagt.trim();
  const angesagtErgebnis =
    zerlegeAnfrage(angesagtBegriff) === null ? null : suche(ziele, angesagtBegriff);
  const angesagtAnzahl = angesagtErgebnis
    ? angesagtErgebnis.namen.length + angesagtErgebnis.erwaehnt.length
    : null;
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

  function zuruecksetzen() {
    window.clearTimeout(ansageTimer.current);
    setEingabe("");
    setAktiv(0);
    setAngesagt("");
  }

  function waehle(option: SuchOption) {
    // Nach jeder Auswahl beginnt die Suche wieder leer. Das Fenster haengt
    // danach ohnehin aus, die Leiste in der Kopfzeile bleibt stehen.
    zuruecksetzen();
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
  // Esc und Tab regelt die jeweilige Oberflaeche.
  function beiTaste(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      if (optionen.length === 0) return;
      const schritt = event.key === "ArrowDown" ? 1 : -1;
      const neu = (aktivIndex + schritt + optionen.length) % optionen.length;
      setAktiv(neu);
      document.getElementById(optionId(listeId, neu))?.scrollIntoView({ block: "nearest" });
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

  // Was jedes Eingabefeld der Suche traegt. Die Pflichtangaben der Combobox
  // (role, aria-controls, aria-expanded, aria-activedescendant) setzt die
  // Oberflaeche selbst am Feld: die Leiste kennt noch den Zustand "zu", und
  // am Feld liest man sie, ohne erst hierher zu springen.
  const feldProps = {
    type: "text",
    "aria-label": t("eingabe"),
    "aria-describedby": hinweisId,
    "aria-autocomplete": "list",
    value: eingabe,
    onChange: (event: ChangeEvent<HTMLInputElement>) => beiEingabe(event.target.value),
    placeholder: t("platzhalter"),
    inputMode: "search",
    enterKeyHint: "go",
    autoComplete: "off",
    autoCorrect: "off",
    autoCapitalize: "none",
    spellCheck: false,
  } as const;

  return {
    eingabe,
    zuruecksetzen,
    gruppen,
    hatOptionen: optionen.length > 0,
    aktivIndex,
    setAktiv,
    hinweis,
    ansage,
    waehle,
    beiTaste,
    listeId,
    hinweisId,
    aktiveOptionId: aktivIndex >= 0 ? optionId(listeId, aktivIndex) : undefined,
    feldProps,
  };
}
