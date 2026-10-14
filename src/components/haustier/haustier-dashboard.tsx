"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useCeoPruefung } from "@/components/dashboard/ceo-pruefung-kontext";
import { useComplianceTourAnzeige } from "@/components/dashboard/compliance-tour-kontext";
import { usePersona } from "@/components/dashboard/persona";
import { AbzeichenModal } from "@/components/haustier/abzeichen-modal";
import { DamiconLogo } from "@/components/brand/damicon-logo";
import { HaustierHuelle } from "@/components/haustier/haustier-huelle";
import { HimbiVersteck } from "@/components/haustier/himbi-versteck";
import {
  useAnstupser,
  useBefinden,
  useBlasenMerker,
  useFertigMeldung,
  useLiveHinweis,
  useModulTipp,
  useTagesGruss,
  useWillkommen,
  waehleBlase,
  type AnstupserLage,
  type BefindenLage,
  type BlasenWahl,
  type FertigMeldung,
  type LiveHinweis,
  type ModulTippLage,
  type TagesGrussLage,
} from "@/components/haustier/haustier-dashboard-blasen";
import { useHaustierAktionen, useHaustierStatus } from "@/components/haustier/haustier-kontext";
import { useKiPane } from "@/components/ki/ki-pane-kontext";
import { useIstHandy } from "@/components/ui/handy";
import { usePathname } from "@/i18n/navigation";
import { anredeName } from "@/components/dashboard/begruessung";
import { haustierZustand, type BlasenArt, type Stimmung } from "@/lib/haustier";

// Himbi im Dashboard: spiegelt, was der Agent gerade tut, AUCH wenn das Chat-Panel zu ist.
// Der Chat bleibt immer gemountet und streamt weiter (ki-pane.tsx) - Himbi zeigt es nur an:
// arbeitet, wartet auf eine Freigabe, Antwort ist fertig, etwas ging schief. Dazu kommen
// Tipps zum Modul, in dem man gerade ist.
// Seit dem 14.10.2026 zerlegt: wann Himbi von sich aus etwas sagt und welche Blase gezeigt wird, steht in
// haustier-dashboard-blasen.ts; hier bleiben die Sichtbarkeit, die Figur mit ihren Blasen und die Abzeichen.

// Liegt der Tab im Hintergrund, sieht niemand eine Blase: dann wird nichts als gezeigt gemerkt
// und keine Anzeigedauer verbraucht (Befund vom 28.09.2026, siehe sichtbareBlase).
function abonniereSeitenSichtbarkeit(melde: () => void): () => void {
  document.addEventListener("visibilitychange", melde);
  return () => document.removeEventListener("visibilitychange", melde);
}
const seiteImVordergrund = () => document.visibilityState === "visible";
const seiteAufDemServer = () => true;

export function HaustierDashboard() {
  const t = useTranslations("haustier");
  const { verfuegbar, offen, sprachmodus, nutzerId } = useKiPane();
  const { phase, an, weg, tagesbeginnAn } = useHaustierStatus();
  const { holeZurueck } = useHaustierAktionen();
  const pfad = usePathname();
  const { role } = usePersona();
  const tour = useComplianceTourAnzeige();
  const ceoStand = useCeoPruefung();
  // Auf dem Handy steht Himbi in der unteren Leiste (untere-leiste.tsx) und
  // nicht frei im Bild. Frei schwebend deckte er dort Karteninhalt zu, und
  // daneben trug die Leiste noch einmal dieselbe Himbeere als KI-Knopf -
  // zwei Zeichen fuer dieselbe Sache, eines davon im Weg.
  const handy = useIstHandy();
  const seiteSichtbar = useSyncExternalStore(abonniereSeitenSichtbarkeit, seiteImVordergrund, seiteAufDemServer);

  // Die Hooks in dieser Reihenfolge: so laufen ihre Effekte wie vorher, als sie hier standen.
  const { willkommen, begruesse } = useWillkommen();
  const live = useLiveHinweis({ an, weg, ceoStand, pfad });
  const meldung = useFertigMeldung(phase, offen);
  // Wirklich nichts los: kein Panel offen, keine laufende Antwort, keine ungelesene.
  // Der Anstupser-Zaehler startet neu, sobald sich daran etwas aendert.
  const ruhigGenug = phase === "ruhe" && !offen && !meldung.fertig;
  const befindenLage = useBefinden();
  // Die drei Sterne auf dem Chapan sind keine Bewertung mehr - jeder oeffnet dasselbe
  // Abzeichen (abzeichen-modal.tsx).
  const [abzeichenOffen, setAbzeichenOffen] = useState(false);
  const [logoOffen, setLogoOffen] = useState(false);
  const grussLage = useTagesGruss({ verfuegbar, handy, an, weg, sprachmodus, tagesbeginnAn, ruhigGenug, nutzerId });
  const anstupserLage = useAnstupser(ruhigGenug);
  const tippLage = useModulTipp({ pfad, role, ruhigGenug });

  // Die Wahl steht vor den fruehen return, weil die Merker darunter auf die gezeigte Blase
  // reagieren und Hooks nicht hinter einem return stehen duerfen.
  const wahl = waehleBlase({
    willkommen,
    phase,
    fertigBlase: meldung.fertigBlase,
    offen,
    liveHinweisAktiv: live.liveHinweisAktiv,
    tour,
    ruhigGenug,
    sprachmodus,
    tagesbeginnAn,
    tagesGruss: grussLage.tagesGruss,
    befindenLage,
    anstupser: anstupserLage.anstupser,
    tipp: tippLage.tipp,
    verfuegbar,
    handy,
    an,
    weg,
    seiteSichtbar,
  });
  useBlasenMerker({ blasen: wahl.blasen, nutzerId, grussLage, tippLage, anstupserLage });

  if (!verfuegbar || handy) return null;
  if (weg) {
    return (
      <HimbiVersteck
        label={t("zurueckholen")}
        paneOffen={offen}
        onClick={() => {
          holeZurueck();
          begruesse();
        }}
      />
    );
  }
  if (!an) return null;

  return (
    <HimbiImDashboard
      willkommen={willkommen}
      wahl={wahl}
      live={live}
      meldung={meldung}
      befindenLage={befindenLage}
      grussLage={grussLage}
      anstupserLage={anstupserLage}
      tippLage={tippLage}
      abzeichenOffen={abzeichenOffen}
      setAbzeichenOffen={setAbzeichenOffen}
      logoOffen={logoOffen}
      setLogoOffen={setLogoOffen}
    />
  );
}

interface FigurLage {
  willkommen: boolean;
  wahl: BlasenWahl;
  live: LiveHinweis;
  meldung: FertigMeldung;
  befindenLage: BefindenLage;
  grussLage: TagesGrussLage;
  anstupserLage: AnstupserLage;
  tippLage: ModulTippLage;
  abzeichenOffen: boolean;
  setAbzeichenOffen: (offen: boolean) => void;
  logoOffen: boolean;
  setLogoOffen: (offen: boolean) => void;
}

/** Himbi im Bild: die Huelle mit Zustand, Miene und Blase, dazu Abzeichen und Logo. Ohne eigenen Zustand und ohne Effekte;
 *  alles kommt aus HaustierDashboard, die Kontexte liest sie im selben Render noch einmal. */
function HimbiImDashboard({
  willkommen,
  wahl,
  live,
  meldung,
  befindenLage,
  grussLage,
  anstupserLage,
  tippLage,
  abzeichenOffen,
  setAbzeichenOffen,
  logoOffen,
  setLogoOffen,
}: FigurLage) {
  const t = useTranslations("haustier");
  const { offen, umschalten, setOffen, darstellung, sprachmodus } = useKiPane();
  const { phase, stimmung, inventar } = useHaustierStatus();
  const { schickeWeg } = useHaustierAktionen();
  const tour = useComplianceTourAnzeige();
  const blasenInhalt = useBlasenInhalt({ live, befindenLage, grussLage, anstupserLage, tippLage });
  const { liveHinweisSichtbar, tourAktivSichtbar, blasen } = wahl;
  const { liveZiel, liveHuepf, setLiveHinweisAktiv } = live;
  const { fertig, setFertig, setFertigBlase } = meldung;
  const { setBefindenFrage, setBefindenBlase } = befindenLage;
  const { setTagesGruss } = grussLage;
  const { setAnstupser } = anstupserLage;
  const { setTipp } = tippLage;

  // Ein Klick auf Himbi holt den Assistenten in die Mitte statt an den Rand: sie ist
  // mitten im Bild angesprochen worden, also antwortet sie auch dort. Der Knopf in der
  // Kopfzeile oeffnet weiterhin das angedockte Panel.
  const aufBuehne = offen && darstellung === "buehne";

  const zustand = willkommen
    ? "fertig"
    : liveHinweisSichtbar
      ? "denkt"
      : tourAktivSichtbar
        ? tour.tourZustand
        : haustierZustand({ phase, fertigUngelesen: fertig, schlaeft: false });
  const label = t(`label.${zustand}`);

  // Die Antwort des Menschen gewinnt fuer eine Weile vor der Miene aus dem Antworttext:
  // wer gerade gesagt hat, dass viel los ist, soll kein zufriedenes Gesicht sehen.
  const miene: Stimmung = befindenLage.eigeneMiene ?? stimmung;
  const blase = blasen.gewaehlt ? blasenInhalt[blasen.gewaehlt] : null;

  return (
    <>
      <HaustierHuelle
        // Im Sprachmodus fuehrt Himbi in der Mitte das Gespraech (ki/sprach-himbi.tsx);
        // die Figur in der Ecke wird ausgeblendet, damit es nur einen gibt
        // (Rueckmeldung vom 25.09.2026).
        verborgen={sprachmodus}
        zustand={zustand}
        stimmung={miene}
        buehne={aufBuehne}
        blase={blase}
        paneOffen={offen}
        label={label}
        blickZiel={liveHinweisSichtbar ? liveZiel : tour.tourZiel}
        positionFolgtBlick
        huepf={liveHinweisSichtbar ? liveHuepf : tour.huepf}
        aufAbzeichen={() => setAbzeichenOffen(true)}
        aufLogo={() => setLogoOffen(true)}
        inventar={inventar}
        onKlick={() => {
          setFertig(false);
          setFertigBlase(false);
          setTipp(null);
          setBefindenFrage(false);
          setBefindenBlase(false);
          setAnstupser(null);
          setTagesGruss(null);
          setLiveHinweisAktiv(false);
          // Bis 22.09.2026 oeffnete ein Klick auf Himbi die Buehne (Mitte,
          // Seite dahinter unscharf) statt des angedockten Panels: das deckte
          // die Seitenleiste zu und liess sich nicht neben der Navigation
          // lesen. Jetzt oeffnet der Klick immer in der zuletzt gewaehlten
          // Darstellung (Standard: angedockt rechts, per Griff verbreiterbar)
          // - die Buehne bleibt ueber den Knopf im Panelkopf erreichbar.
          if (offen) umschalten();
          else setOffen(true);
        }}
        weg={{ onWeg: schickeWeg, halten: t("weg.halten"), tschuess: t("weg.tschuess"), hinweis: t("weg.hinweis") }}
      />
      {abzeichenOffen ? (
        <AbzeichenModal titel={t("abzeichen.titel")} schliessenText={t("abzeichen.schliessen")} onClose={() => setAbzeichenOffen(false)}>
          <Image src="/abzeichen/ki-innovator.png" alt={t("abzeichen.alt")} fill sizes="(min-width: 640px) 24rem, 88vw" priority className="object-contain" />
        </AbzeichenModal>
      ) : null}
      {logoOffen ? (
        <AbzeichenModal
          titel={t("logo.titel")}
          schliessenText={t("abzeichen.schliessen")}
          bildKlasse="hb-abzeichen-bild--logo"
          onClose={() => setLogoOffen(false)}
        >
          <DamiconLogo title={t("logo.alt")} className="h-full w-full" />
        </AbzeichenModal>
      ) : null}
    </>
  );
}

/**
 * Der Inhalt jeder Sprechblase; welche davon gezeigt wird, entscheidet waehleBlase
 * (haustier-dashboard-blasen.ts, lib/haustier.ts sichtbareBlase). Alle werden gebaut (reines JSX, ohne Seiteneffekt),
 * nur die gewaehlte wird gezeigt.
 */
function useBlasenInhalt({
  live,
  befindenLage,
  grussLage,
  anstupserLage,
  tippLage,
}: Pick<FigurLage, "live" | "befindenLage" | "grussLage" | "anstupserLage" | "tippLage">): Record<BlasenArt, ReactNode> {
  const t = useTranslations("haustier");
  const ceoT = useTranslations("ceoUebersicht");
  const begruessungT = useTranslations("dashboard.begruessung");
  const { setOffen } = useKiPane();
  const { text } = useHaustierStatus();
  const { stelleFrage } = useHaustierAktionen();
  const { name } = usePersona();
  const tour = useComplianceTourAnzeige();
  const { setLiveHinweisAktiv } = live;
  const { befinden, setBefindenBlase, antworteAufBefinden } = befindenLage;
  const { tagesGruss, setTagesGruss } = grussLage;
  const { anstupser, setAnstupser, sageAb } = anstupserLage;
  const { tipp, setTipp } = tippLage;

  return {
    willkommen: <p className="hb-blase__text">{t("willkommen")}</p>,
    freigabe: (
      <>
        <p className="hb-blase__text">{t("freigabe")}</p>
        <div className="hb-blase__knoepfe">
          <button type="button" className="hb-knopf" onClick={() => setOffen(true)}>
            {t("ansehen")}
          </button>
        </div>
      </>
    ),
    arbeitet: (
      <>
        <p className="hb-blase__text">{text || t("arbeitet")}</p>
        <p className="hb-blase__klein">{t("imHintergrund")}</p>
      </>
    ),
    fehler: <p className="hb-blase__text">{t("fehler")}</p>,
    fertig: (
      <>
        <p className="hb-blase__text">{t("fertig")}</p>
        <div className="hb-blase__knoepfe">
          <button type="button" className="hb-knopf" onClick={() => setOffen(true)}>
            {t("ansehen")}
          </button>
        </div>
      </>
    ),
    liveHinweis: (
      <>
        <p className="hb-blase__text">{ceoT("liveHinweis")}</p>
        <div className="hb-blase__knoepfe">
          <button type="button" className="hb-knopf" onClick={() => setLiveHinweisAktiv(false)}>
            {ceoT("liveHinweisKnopf")}
          </button>
        </div>
      </>
    ),
    tourAktiv: tour.tourBlase,
    tourFrage: tour.frageBlase,
    // Wie bei befinden unten: nur mit echtem Wert bauen, sonst fragte next-intl bei jedem
    // Rendern nach einem Schluessel "null".
    tagesgruss: tagesGruss ? (
      <>
        <p className="hb-blase__text">
          {t("tagesgruss.frage", {
            anrede: name ? begruessungT(tagesGruss, { name: anredeName(name) }) : begruessungT(`${tagesGruss}OhneNamen`),
          })}
        </p>
        <div className="hb-blase__knoepfe">
          <button
            type="button"
            className="hb-knopf"
            onClick={() => {
              stelleFrage(t("befinden.hilfeText"));
              setTagesGruss(null);
            }}
          >
            {t("tagesgruss.ja")}
          </button>
          <button type="button" className="hb-knopf hb-knopf--leise" onClick={() => setTagesGruss(null)}>
            {t("tagesgruss.nein")}
          </button>
        </div>
      </>
    ) : null,
    befinden: (
      <>
        <p className="hb-blase__text">{t("befinden.frage")}</p>
        <div className="hb-blase__knoepfe">
          <button type="button" className="hb-knopf" onClick={() => antworteAufBefinden("gut")}>
            {t("befinden.gut")}
          </button>
          <button type="button" className="hb-knopf hb-knopf--leise" onClick={() => antworteAufBefinden("mittel")}>
            {t("befinden.mittel")}
          </button>
          <button type="button" className="hb-knopf hb-knopf--leise" onClick={() => antworteAufBefinden("viel")}>
            {t("befinden.viel")}
          </button>
        </div>
      </>
    ),
    // Wie bei anstupser/tipp unten: erst bei echtem Wert bauen, nicht nur bei echtem
    // "sichtbar" pruefen - alle Kandidaten werden unabhaengig vom Gewinner konstruiert, ein
    // befinden.antwort.null wuerde sonst bei jedem Rendern eine next-intl-Fehlermeldung
    // auf der Konsole erzeugen (live verifiziert).
    befindenAntwort: befinden ? (
      <>
        <p className="hb-blase__text">{t(`befinden.antwort.${befinden}`)}</p>
        {befinden === "viel" ? (
          <div className="hb-blase__knoepfe">
            <button
              type="button"
              className="hb-knopf"
              onClick={() => {
                stelleFrage(t("befinden.hilfeText"));
                setBefindenBlase(false);
              }}
            >
              {t("befinden.hilfe")}
            </button>
          </div>
        ) : null}
      </>
    ) : null,
    anstupser: anstupser ? (
      <>
        <p className="hb-blase__text">{t(`anstupser.${anstupser}.frage`)}</p>
        <div className="hb-blase__knoepfe">
          <button
            type="button"
            className="hb-knopf"
            onClick={() => {
              stelleFrage(t(`anstupser.${anstupser}.frageText`));
              setAnstupser(null);
            }}
          >
            {t("tipp.ja")}
          </button>
          <button type="button" className="hb-knopf hb-knopf--leise" onClick={sageAb}>
            {t("tipp.spaeter")}
          </button>
        </div>
      </>
    ) : null,
    tipp: tipp ? (
      <>
        <p className="hb-blase__text">{t("tipp.frage", { bereich: tipp.titel })}</p>
        <div className="hb-blase__knoepfe">
          <button
            type="button"
            className="hb-knopf"
            onClick={() => {
              stelleFrage(t("tipp.frageText", { bereich: tipp.titel }));
              setTipp(null);
            }}
          >
            {t("tipp.ja")}
          </button>
          <button type="button" className="hb-knopf hb-knopf--leise" onClick={() => setTipp(null)}>
            {t("tipp.spaeter")}
          </button>
        </div>
      </>
    ) : null,
  };
}
