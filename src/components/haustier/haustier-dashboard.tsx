"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useCeoPruefung } from "@/components/dashboard/ceo-pruefung-kontext";
import { useComplianceTourAnzeige } from "@/components/dashboard/compliance-tour-kontext";
import { usePersona } from "@/components/dashboard/persona";
import { AbzeichenModal } from "@/components/haustier/abzeichen-modal";
import { DamiconLogo } from "@/components/brand/damicon-logo";
import { HaustierHuelle } from "@/components/haustier/haustier-huelle";
import { HimbiVersteck } from "@/components/haustier/himbi-versteck";
import { useHaustierAktionen, useHaustierStatus } from "@/components/haustier/haustier-kontext";
import { useKiPane } from "@/components/ki/ki-pane-kontext";
import { useIstHandy } from "@/components/ui/handy";
import { usePathname } from "@/i18n/navigation";
import { anredeName } from "@/components/dashboard/begruessung";
import { bewegungReduziert } from "@/lib/bewegung";
import { tageszeitBestimmen, type Tageszeit } from "@/lib/domain/tageszeit";
import { merkeTagesbeginn, tagesbeginnFaellig } from "@/lib/himbi-tagesbeginn";
import { browserAblage, sitzungsAblage } from "@/lib/browser-ablage";
import {
  blasenKandidaten,
  haustierZustand,
  merkeTippGezeigt,
  modulAusPfad,
  sichtbareBlase,
  springeZuAnker,
  tippSchonGezeigt,
  type BlasenArt,
  type Stimmung,
} from "@/lib/haustier";
import { modules } from "@/lib/modules";
import { hasPermission } from "@/lib/rbac";

// Himbi im Dashboard: spiegelt, was der Agent gerade tut, AUCH wenn das Chat-Panel zu ist.
// Der Chat bleibt immer gemountet und streamt weiter (ki-pane.tsx) - Himbi zeigt es nur an:
// arbeitet, wartet auf eine Freigabe, Antwort ist fertig, etwas ging schief. Dazu kommen
// Tipps zum Modul, in dem man gerade ist.

const TIPP_VERZOEGERUNG_MS = 7000;
// Himbi fragt einmal je Sitzung, wie der Tag laeuft. Spaeter als der Modultipp: die Blasen
// kommen nacheinander, nie zwei auf einmal (Rangfolge: BLASEN_RANGFOLGE in lib/haustier.ts).
const BEFINDEN_VERZOEGERUNG_MS = 25000;
const BEFINDEN_ANTWORT_MS = 8000;
// Wie lange die Miene aus der Antwort des Menschen die aus dem Antworttext ueberstimmt.
const BEFINDEN_MIENE_MS = 45000;
const BEFINDEN_SCHLUESSEL = "damicon-haustier-befinden";
// Anstupser: kleine Fragen, wenn der Chat laenger ungenutzt bleibt. Jede hoechstens
// einmal je Sitzung, und nach zwei Absagen hintereinander ist Schluss - wer zweimal
// "spaeter" sagt, meint nicht "frag gleich nochmal".
const ANSTUPSER = ["neuHeute", "kuehlzeit", "fristen"] as const;
const ANSTUPSER_VERZOEGERUNG_MS = 90_000;
const ANSTUPSER_DAUER_MS = 18_000;
const ANSTUPSER_ABSAGEN_MAX = 2;
const ANSTUPSER_SCHLUESSEL = "damicon-haustier-anstupser";
const TIPP_DAUER_MS = 15000;
// Tagesgruss (lib/himbi-tagesbeginn.ts): einmal am Tag je Nutzer, gleich nach dem Ankommen und
// vor dem Modultipp - er ist der Anfang des Tages, nicht eine Frage unter vielen.
const TAGESGRUSS_VERZOEGERUNG_MS = 2500;
const TAGESGRUSS_DAUER_MS = 45_000;
const FERTIG_BLASE_MS = 9000;
const WILLKOMMEN_MS = 3200;
// Live-Lauf-Hinweis: springt SOFORT (kein Warten wie beim Tour-Angebot) zur laufenden
// Pruefung, sobald sie beginnt - der CEO soll beim ersten Login gleich sehen, dass und wie
// lange es dauert, statt es zu erraten.
const LIVE_HINWEIS_DAUER_MS = 14000;

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
  const moduleT = useTranslations("modules");
  const ceoT = useTranslations("ceoUebersicht");
  const begruessungT = useTranslations("dashboard.begruessung");
  const { verfuegbar, offen, umschalten, setOffen, darstellung, sprachmodus, nutzerId } = useKiPane();
  const { phase, text, an, weg, stimmung, inventar, tagesbeginnAn } = useHaustierStatus();
  const { stelleFrage, schickeWeg, holeZurueck } = useHaustierAktionen();
  const pfad = usePathname();
  const { role, name } = usePersona();
  const tour = useComplianceTourAnzeige();
  const ceoStand = useCeoPruefung();
  // Auf dem Handy steht Himbi in der unteren Leiste (untere-leiste.tsx) und
  // nicht frei im Bild. Frei schwebend deckte er dort Karteninhalt zu, und
  // daneben trug die Leiste noch einmal dieselbe Himbeere als KI-Knopf -
  // zwei Zeichen fuer dieselbe Sache, eines davon im Weg.
  const handy = useIstHandy();
  const seiteSichtbar = useSyncExternalStore(abonniereSeitenSichtbarkeit, seiteImVordergrund, seiteAufDemServer);

  // Nach dem Zurueckholen: kurz jubeln und "Da bin ich wieder" sagen.
  const [willkommen, setWillkommen] = useState(false);
  const willkommenTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(willkommenTimer.current), []);

  // Live-Lauf-Hinweis: einmal je Sitzung, sobald der automatische CEO-Check zu laufen beginnt -
  // springt sofort zur Live-Anzeige (kein Warten wie beim Tour-Angebot) und hebt sie hervor, damit
  // der CEO gleich sieht, dass und ungefaehr wie lange es dauert. Haengt am Anker
  // "compliance-live-lauf" (ceo-auto-pruefung.tsx) - erst vorhanden, sobald die Uebersichtsseite
  // die laufende Pruefung tatsaechlich zeichnet; deshalb auch bei jedem Seitenwechsel (pfad) ein
  // neuer Versuch, solange noch nichts gezeigt wurde.
  const [liveHinweisGezeigt, setLiveHinweisGezeigt] = useState(false);
  const [liveHinweisAktiv, setLiveHinweisAktiv] = useState(false);
  const [liveZiel, setLiveZiel] = useState<Element | null>(null);
  const [liveHuepf, setLiveHuepf] = useState(0);
  const liveHinweisTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(liveHinweisTimer.current), []);
  useEffect(() => {
    // an/weg: HaustierDashboard zeichnet zwar spaeter "return null", aber Hooks laufen davon
    // unberuehrt weiter - ohne diese Pruefung wuerde die Seite bei abgestelltem oder weggeschicktem
    // Himbi trotzdem unsichtbar zur Live-Anzeige springen, mit niemandem, der das erklaert.
    if (!an || weg || ceoStand?.phase !== "laeuft" || liveHinweisGezeigt) return;
    const versuch = window.setTimeout(() => {
      const ziel = document.getElementById("compliance-live-lauf");
      if (!ziel) return;
      setLiveHinweisGezeigt(true);
      setLiveHinweisAktiv(true);
      setLiveZiel(ziel);
      setLiveHuepf((n) => n + 1);
      springeZuAnker("compliance-live-lauf", { bewegungReduziert: bewegungReduziert() });
      window.clearTimeout(liveHinweisTimer.current);
      liveHinweisTimer.current = window.setTimeout(() => setLiveHinweisAktiv(false), LIVE_HINWEIS_DAUER_MS);
    }, 0);
    return () => window.clearTimeout(versuch);
  }, [an, weg, ceoStand?.phase, liveHinweisGezeigt, pfad]);

  // Antwort kam an, waehrend das Panel zu war: Himbi jubelt, bis man hinsieht.
  const [fertig, setFertig] = useState(false);
  const [fertigBlase, setFertigBlase] = useState(false);
  // "Werte aus dem vorigen Render ableiten": kein Effekt noetig, kein zweiter Render-Durchgang.
  const [vorherPhase, setVorherPhase] = useState(phase);
  if (vorherPhase !== phase) {
    setVorherPhase(phase);
    if (vorherPhase === "arbeitet" && phase === "ruhe" && !offen) {
      setFertig(true);
      setFertigBlase(true);
    }
  }
  if (offen && (fertig || fertigBlase)) {
    setFertig(false);
    setFertigBlase(false);
  }
  useEffect(() => {
    if (!fertigBlase) return;
    const id = window.setTimeout(() => setFertigBlase(false), FERTIG_BLASE_MS);
    return () => window.clearTimeout(id);
  }, [fertigBlase]);

  // Wie laeuft dein Tag? Einmal je Sitzung, und nur wenn gerade wirklich nichts los ist.
  // Die Antwort faerbt Himbis Miene - sie hoert zu, statt die Frage nur zu stellen.
  // Wirklich nichts los: kein Panel offen, keine laufende Antwort, keine ungelesene.
  // Der Anstupser-Zaehler startet neu, sobald sich daran etwas aendert.
  const ruhigGenug = phase === "ruhe" && !offen && !fertig;
  const [befindenFrage, setBefindenFrage] = useState(false);
  const [befinden, setBefinden] = useState<"gut" | "mittel" | "viel" | null>(null);
  const [befindenBlase, setBefindenBlase] = useState(false);
  const [eigeneMiene, setEigeneMiene] = useState<Stimmung | null>(null);
  // Die drei Sterne auf dem Chapan sind keine Bewertung mehr - jeder oeffnet dasselbe
  // Abzeichen (abzeichen-modal.tsx).
  const [abzeichenOffen, setAbzeichenOffen] = useState(false);
  const [logoOffen, setLogoOffen] = useState(false);
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(BEFINDEN_SCHLUESSEL)) return;
    } catch {
      // ohne Speicher: die Frage kommt einmal je Seitenaufruf, das ist verkraftbar
    }
    // Gemerkt wird erst, wenn die Frage die gezeigte Blase ist (befindenGezeigt unten), sonst
    // waere sie nach einem Neuladen verloren, ohne dass jemand sie gesehen hat (28.09.2026).
    const zeigen = window.setTimeout(() => setBefindenFrage(true), BEFINDEN_VERZOEGERUNG_MS);
    return () => window.clearTimeout(zeigen);
  }, []);
  useEffect(() => {
    if (!befindenBlase) return;
    const id = window.setTimeout(() => setBefindenBlase(false), BEFINDEN_ANTWORT_MS);
    return () => window.clearTimeout(id);
  }, [befindenBlase]);
  useEffect(() => {
    if (!eigeneMiene) return;
    const id = window.setTimeout(() => setEigeneMiene(null), BEFINDEN_MIENE_MS);
    return () => window.clearTimeout(id);
  }, [eigeneMiene]);

  // Himbi beginnt den Tag (Rueckmeldung vom 28.09.2026: "Himbi soll mir vorschlagen, was ich
  // heute machen kann, was dringende Themen sind ... Er soll mir Fragen stellen!"): einmal am
  // Tag je Nutzer ein Gruss mit dem Angebot, zu sagen, was heute dringend ist. Kostet nichts,
  // bis jemand "Ja" sagt, dann geht dieselbe Frage wie bei "Womit anfangen?" an den Chat.
  // Dieselben Regeln wie fuer alle Blasen (nicht auf dem Handy, nicht wenn Himbi weg oder aus
  // ist, nicht im Sprachmodus, nur bei Ruhe) und die Einstellung "Himbi beginnt den Tag mit
  // mir". Wer heute schon im Sprachmodus begruesst wurde, bekommt keine mehr
  // (lib/himbi-tagesbeginn.ts).
  // Der Timer legt den Gruss nur bereit. Gemerkt und die Anzeigedauer gestartet wird erst, wenn
  // er die gezeigte Blase ist (tagesGrussGezeigt unten, Befund vom 28.09.2026): vorher merkte
  // der Timer ihn auch hinter Tour-Frage, laufender Tour oder Live-Hinweis und im
  // Hintergrund-Tab, und der Gruss verfiel fuer den ganzen Tag, ohne dass ihn jemand sah.
  const [tagesGruss, setTagesGruss] = useState<Tageszeit | null>(null);
  // Im Sprachmodus beginnt das Gespraech den Tag; ein Gruss, der noch wartet, faellt weg. Ist er
  // danach noch faellig (die Begruessung im Gespraech kam nicht zustande), plant der Timer neu.
  if (sprachmodus && tagesGruss) setTagesGruss(null);
  const grussMoeglich = verfuegbar && !handy && an && !weg && !sprachmodus && tagesbeginnAn && ruhigGenug;
  useEffect(() => {
    if (!grussMoeglich || tagesGruss) return;
    const ablage = browserAblage();
    if (!tagesbeginnFaellig(ablage, nutzerId, "blase")) return;
    const zeigen = window.setTimeout(() => {
      const jetzt = new Date();
      if (!tagesbeginnFaellig(ablage, nutzerId, "blase", jetzt)) return;
      setTagesGruss(tageszeitBestimmen(jetzt));
    }, TAGESGRUSS_VERZOEGERUNG_MS);
    return () => window.clearTimeout(zeigen);
  }, [grussMoeglich, tagesGruss, nutzerId]);

  // Anstupser: die naechste noch nicht gestellte Frage, sobald lange nichts passiert.
  const [anstupser, setAnstupser] = useState<(typeof ANSTUPSER)[number] | null>(null);
  const absagen = useRef(0);
  const gestellt = useRef<Set<string>>(new Set());
  useEffect(() => {
    try {
      const roh = window.sessionStorage.getItem(ANSTUPSER_SCHLUESSEL);
      if (roh) gestellt.current = new Set(roh.split(","));
    } catch {
      // ohne Speicher: die Fragen kommen je Seitenaufruf einmal
    }
  }, []);
  useEffect(() => {
    if (!ruhigGenug) return;
    const naechste = ANSTUPSER.find((a) => !gestellt.current.has(a));
    if (!naechste || absagen.current >= ANSTUPSER_ABSAGEN_MAX) return;
    // Nur bereitlegen: als gestellt gemerkt, die 18 s gestartet und beim Ablauf als Absage
    // gezaehlt wird erst, wenn er die gezeigte Blase ist (anstupserGezeigt unten, 28.09.2026).
    // Vorher zaehlte ein Anstupser hinter der Tour-Frage oder im Hintergrund-Tab als Absage.
    const zeigen = window.setTimeout(() => setAnstupser(naechste), ANSTUPSER_VERZOEGERUNG_MS);
    return () => window.clearTimeout(zeigen);
  }, [ruhigGenug]);

  // Tipp zum Modul: einmal pro Modul und Sitzung, erst nach einer Weile Ruhe.
  const [gemerkterTipp, setTipp] = useState<{ key: string; titel: string; pfad: string } | null>(null);
  // Ein Tipp gilt nur fuer die Seite, auf der er entstand.
  const tipp = gemerkterTipp && gemerkterTipp.pfad === pfad ? gemerkterTipp : null;
  useEffect(() => {
    // Erst nach einer Weile Ruhe, und nicht noch einmal, solange einer bereitliegt. Der Merker
    // wird erst gesetzt, wenn der Tipp die gezeigte Blase ist (tippGezeigt unten, Befund vom
    // 28.09.2026): vorher lief der Tipp hinter dem Tagesgruss ab und kam fuer dieses Modul die
    // ganze Sitzung nicht wieder.
    if (!ruhigGenug || tipp) return;
    const modul = modulAusPfad(pfad, modules);
    if (!modul || !hasPermission(role, modul.resource, "view")) return;
    // Nicht auf den Platzhalterseiten. Dort stand "Soll ich dir zeigen, was
    // du hier tun kannst?" ueber einer Seite, auf der man nichts tun kann.
    if (modul.reifegrad === "in-entwicklung") return;
    if (tippSchonGezeigt(sitzungsAblage(), modul.key)) return;
    const zeigen = window.setTimeout(
      () => setTipp({ key: modul.key, titel: moduleT(`${modul.key}.title`), pfad }),
      TIPP_VERZOEGERUNG_MS,
    );
    return () => window.clearTimeout(zeigen);
  }, [pfad, role, moduleT, ruhigGenug, tipp]);

  // --- Welche Blase gerade zu sehen ist ------------------------------------------------------
  // Die Bedingungen stehen hier oben (vor den fruehen return), weil die Effekte darunter auf die
  // gezeigte Blase reagieren und Hooks nicht hinter einem return stehen duerfen.
  // Echte Arbeit (Freigabe/Arbeitet/Fehler) und eine frisch angekommene Antwort gewinnen immer
  // vor dem Live-Lauf-Hinweis und der Compliance-Tour: die Fuehrung wartet lieber kurz, als eine
  // Meldung zu verdecken, die Aufmerksamkeit braucht.
  // liveHinweisSichtbar und tourAktivSichtbar steuern auch Miene und Blick der Figur (unten),
  // deshalb stehen hier die Meldungen, vor denen sie zuruecktreten.
  const keineWichtigereMeldung = phase !== "freigabe" && phase !== "arbeitet" && phase !== "fehler" && !fertigBlase;
  const liveHinweisSichtbar = !offen && keineWichtigereMeldung && liveHinweisAktiv;
  const tourAktivSichtbar = !offen && keineWichtigereMeldung && !liveHinweisSichtbar && tour.aktiv;

  // Hier steht nur, was bereitliegt. Wann eine Blase bereit ist und welche gewinnt, entscheiden
  // blasenKandidaten und BLASEN_RANGFOLGE in lib/haustier.ts (Fund 53 vom 28.09.2026: vorher
  // trugen Befinden, Tour-Frage, Tipp und Anstupser hier eigene Ausschluesse, und die Liste log).
  // Der erste bereite Kandidat gewinnt (sichtbareBlase), der Inhalt jeder Blase steht unten in
  // blasenInhalt.
  const blasenReihenfolge = blasenKandidaten({
    willkommen,
    phase,
    fertigBlase,
    liveHinweis: liveHinweisSichtbar,
    tourAktiv: tourAktivSichtbar,
    ruhigGenug,
    sprachmodus,
    tagesbeginnAn,
    tourFrage: tour.frageBereit,
    tagesgruss: !!tagesGruss,
    befindenAntwort: befindenBlase && !!befinden,
    tipp: !!tipp,
    befinden: befindenFrage,
    anstupser: !!anstupser,
  });
  // gezeigt: Himbi steht im Bild (nicht auf dem Handy, nicht weg oder aus, im Sprachmodus ist die
  // Figur verborgen) und die Seite liegt im Vordergrund.
  const blasen = sichtbareBlase(blasenReihenfolge, {
    paneOffen: offen,
    figurImBild: verfuegbar && !handy && an && !weg && !sprachmodus,
    seiteSichtbar,
  });

  // Merker und Anzeigedauer erst ab dem Moment, in dem die Blase die gezeigte ist. Verdeckt sie
  // danach etwas Dringenderes, haelt ihre Uhr an und beginnt neu, sobald sie wieder dran ist:
  // sonst liefe sie wie vorher hinter einer anderen Blase ab.
  const tagesGrussGezeigt = blasen.gezeigt === "tagesgruss";
  useEffect(() => {
    if (!tagesGrussGezeigt) return;
    merkeTagesbeginn(browserAblage(), nutzerId, "blase");
    const id = window.setTimeout(() => setTagesGruss(null), TAGESGRUSS_DAUER_MS);
    return () => window.clearTimeout(id);
  }, [tagesGrussGezeigt, nutzerId]);

  const tippGezeigt = blasen.gezeigt === "tipp";
  useEffect(() => {
    if (!tippGezeigt || !tipp) return;
    merkeTippGezeigt(sitzungsAblage(), tipp.key);
    const id = window.setTimeout(() => setTipp(null), TIPP_DAUER_MS);
    return () => window.clearTimeout(id);
  }, [tippGezeigt, tipp]);

  const anstupserGezeigt = blasen.gezeigt === "anstupser";
  useEffect(() => {
    if (!anstupserGezeigt || !anstupser) return;
    gestellt.current.add(anstupser);
    try {
      window.sessionStorage.setItem(ANSTUPSER_SCHLUESSEL, [...gestellt.current].join(","));
    } catch {
      // egal
    }
    const id = window.setTimeout(() => {
      absagen.current += 1;
      setAnstupser(null);
    }, ANSTUPSER_DAUER_MS);
    return () => window.clearTimeout(id);
  }, [anstupserGezeigt, anstupser]);

  const befindenGezeigt = blasen.gezeigt === "befinden";
  useEffect(() => {
    if (!befindenGezeigt) return;
    try {
      window.sessionStorage.setItem(BEFINDEN_SCHLUESSEL, "1");
    } catch {
      // egal
    }
  }, [befindenGezeigt]);

  if (!verfuegbar || handy) return null;
  if (weg) {
    return (
      <HimbiVersteck
        label={t("zurueckholen")}
        paneOffen={offen}
        onClick={() => {
          holeZurueck();
          setWillkommen(true);
          window.clearTimeout(willkommenTimer.current);
          willkommenTimer.current = window.setTimeout(() => setWillkommen(false), WILLKOMMEN_MS);
        }}
      />
    );
  }
  if (!an) return null;

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
  const miene: Stimmung = eigeneMiene ?? stimmung;

  function antworteAufBefinden(wahl: "gut" | "mittel" | "viel") {
    setBefinden(wahl);
    setBefindenFrage(false);
    setBefindenBlase(true);
    setEigeneMiene(wahl === "gut" ? "gut" : wahl === "viel" ? "warnung" : "neutral");
  }

  // Der Inhalt jeder Sprechblase; welche davon gezeigt wird, entscheidet blasenReihenfolge oben
  // (lib/haustier.ts sichtbareBlase). Alle werden gebaut (reines JSX, ohne Seiteneffekt), nur
  // die gewaehlte wird gezeigt.
  const blasenInhalt: Record<BlasenArt, ReactNode> = {
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
          <button
            type="button"
            className="hb-knopf hb-knopf--leise"
            onClick={() => {
              absagen.current += 1;
              setAnstupser(null);
            }}
          >
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
