"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { ComplianceTourAnzeige } from "@/components/dashboard/use-compliance-tour";
import type { PruefungStand } from "@/components/pruefung/use-pruefung";
import { bewegungReduziert } from "@/lib/bewegung";
import { browserAblage, sitzungsAblage } from "@/lib/browser-ablage";
import { tageszeitBestimmen, type Tageszeit } from "@/lib/domain/tageszeit";
import { merkeTagesbeginn, tagesbeginnFaellig } from "@/lib/himbi-tagesbeginn";
import {
  blasenKandidaten,
  merkeTippGezeigt,
  modulAusPfad,
  sichtbareBlase,
  springeZuAnker,
  tippSchonGezeigt,
  type AgentPhase,
  type BlasenArt,
  type Stimmung,
} from "@/lib/haustier";
import { modules } from "@/lib/modules";
import { hasPermission, type Role } from "@/lib/rbac";

// Wann Himbi im Dashboard (haustier-dashboard.tsx) von sich aus etwas sagt, seit dem 14.10.2026 eigene Hooks: das Willkommen nach
// dem Zurückholen, der Live-Lauf-Hinweis, die ungelesene Antwort, die Frage nach dem Befinden, der Tagesgruß, die Anstupser und
// der Tipp zum Modul, dazu die Wahl der gezeigten Blase und was erst beim Zeigen gemerkt wird. Die Komponente ruft die Hooks in
// dieser Reihenfolge; so laufen die Effekte in derselben Folge wie vorher, als alles in der Komponente stand.

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

export type Befinden = "gut" | "mittel" | "viel";
export type Anstupser = (typeof ANSTUPSER)[number];
export interface ModulTipp {
  key: string;
  titel: string;
  pfad: string;
}

/** Nach dem Zurueckholen: kurz jubeln und "Da bin ich wieder" sagen. */
export function useWillkommen() {
  const [willkommen, setWillkommen] = useState(false);
  const willkommenTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(willkommenTimer.current), []);
  const begruesse = () => {
    setWillkommen(true);
    window.clearTimeout(willkommenTimer.current);
    willkommenTimer.current = window.setTimeout(() => setWillkommen(false), WILLKOMMEN_MS);
  };
  return { willkommen, begruesse };
}

// Live-Lauf-Hinweis: einmal je Sitzung, sobald der automatische CEO-Check zu laufen beginnt -
// springt sofort zur Live-Anzeige (kein Warten wie beim Tour-Angebot) und hebt sie hervor, damit
// der CEO gleich sieht, dass und ungefaehr wie lange es dauert. Haengt am Anker
// "compliance-live-lauf" (ceo-auto-pruefung.tsx) - erst vorhanden, sobald die Uebersichtsseite
// die laufende Pruefung tatsaechlich zeichnet; deshalb auch bei jedem Seitenwechsel (pfad) ein
// neuer Versuch, solange noch nichts gezeigt wurde.
export function useLiveHinweis({ an, weg, ceoStand, pfad }: { an: boolean; weg: boolean; ceoStand: PruefungStand | null; pfad: string }) {
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
  return { liveHinweisAktiv, setLiveHinweisAktiv, liveZiel, liveHuepf };
}
export type LiveHinweis = ReturnType<typeof useLiveHinweis>;

/** Antwort kam an, waehrend das Panel zu war: Himbi jubelt, bis man hinsieht. */
export function useFertigMeldung(phase: AgentPhase, offen: boolean) {
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
  return { fertig, setFertig, fertigBlase, setFertigBlase };
}
export type FertigMeldung = ReturnType<typeof useFertigMeldung>;

// Wie laeuft dein Tag? Einmal je Sitzung, und nur wenn gerade wirklich nichts los ist.
// Die Antwort faerbt Himbis Miene - sie hoert zu, statt die Frage nur zu stellen.
export function useBefinden() {
  const [befindenFrage, setBefindenFrage] = useState(false);
  const [befinden, setBefinden] = useState<Befinden | null>(null);
  const [befindenBlase, setBefindenBlase] = useState(false);
  const [eigeneMiene, setEigeneMiene] = useState<Stimmung | null>(null);
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

  function antworteAufBefinden(wahl: Befinden) {
    setBefinden(wahl);
    setBefindenFrage(false);
    setBefindenBlase(true);
    setEigeneMiene(wahl === "gut" ? "gut" : wahl === "viel" ? "warnung" : "neutral");
  }
  return { befindenFrage, setBefindenFrage, befinden, befindenBlase, setBefindenBlase, eigeneMiene, antworteAufBefinden };
}
export type BefindenLage = ReturnType<typeof useBefinden>;

// Himbi beginnt den Tag (Rueckmeldung vom 28.09.2026: "Himbi soll mir vorschlagen, was ich
// heute machen kann, was dringende Themen sind ... Er soll mir Fragen stellen!"): einmal am
// Tag je Nutzer ein Gruss mit dem Angebot, zu sagen, was heute dringend ist. Kostet nichts,
// bis jemand "Ja" sagt, dann geht dieselbe Frage wie bei "Womit anfangen?" an den Chat.
// Dieselben Regeln wie fuer alle Blasen (nicht auf dem Handy, nicht wenn Himbi weg oder aus
// ist, nicht im Sprachmodus, nur bei Ruhe) und die Einstellung "Himbi beginnt den Tag mit
// mir". Wer heute schon im Sprachmodus begruesst wurde, bekommt keine mehr
// (lib/himbi-tagesbeginn.ts).
// Der Timer legt den Gruss nur bereit. Gemerkt und die Anzeigedauer gestartet wird erst, wenn
// er die gezeigte Blase ist (tagesGrussGezeigt in useBlasenMerker, Befund vom 28.09.2026): vorher
// merkte der Timer ihn auch hinter Tour-Frage, laufender Tour oder Live-Hinweis und im
// Hintergrund-Tab, und der Gruss verfiel fuer den ganzen Tag, ohne dass ihn jemand sah.
export function useTagesGruss({
  verfuegbar,
  handy,
  an,
  weg,
  sprachmodus,
  tagesbeginnAn,
  ruhigGenug,
  nutzerId,
}: {
  verfuegbar: boolean;
  handy: boolean;
  an: boolean;
  weg: boolean;
  sprachmodus: boolean;
  tagesbeginnAn: boolean;
  ruhigGenug: boolean;
  nutzerId: string | null;
}) {
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
  return { tagesGruss, setTagesGruss };
}
export type TagesGrussLage = ReturnType<typeof useTagesGruss>;

/** Anstupser: die naechste noch nicht gestellte Frage, sobald lange nichts passiert. */
export function useAnstupser(ruhigGenug: boolean) {
  const [anstupser, setAnstupser] = useState<Anstupser | null>(null);
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
    // gezaehlt wird erst, wenn er die gezeigte Blase ist (anstupserGezeigt in useBlasenMerker,
    // 28.09.2026). Vorher zaehlte ein Anstupser hinter der Tour-Frage oder im Hintergrund-Tab als Absage.
    const zeigen = window.setTimeout(() => setAnstupser(naechste), ANSTUPSER_VERZOEGERUNG_MS);
    return () => window.clearTimeout(zeigen);
  }, [ruhigGenug]);
  // "Spaeter" zaehlt als Absage, wie das Verstreichen der Anzeigedauer (anstupserGezeigt in useBlasenMerker).
  const sageAb = () => {
    absagen.current += 1;
    setAnstupser(null);
  };
  return { anstupser, setAnstupser, absagen, gestellt, sageAb };
}
export type AnstupserLage = ReturnType<typeof useAnstupser>;

/** Tipp zum Modul: einmal pro Modul und Sitzung, erst nach einer Weile Ruhe. */
export function useModulTipp({ pfad, role, ruhigGenug }: { pfad: string; role: Role; ruhigGenug: boolean }) {
  const moduleT = useTranslations("modules");
  const [gemerkterTipp, setTipp] = useState<ModulTipp | null>(null);
  // Ein Tipp gilt nur fuer die Seite, auf der er entstand.
  const tipp = gemerkterTipp && gemerkterTipp.pfad === pfad ? gemerkterTipp : null;
  useEffect(() => {
    // Erst nach einer Weile Ruhe, und nicht noch einmal, solange einer bereitliegt. Der Merker
    // wird erst gesetzt, wenn der Tipp die gezeigte Blase ist (tippGezeigt in useBlasenMerker,
    // Befund vom 28.09.2026): vorher lief der Tipp hinter dem Tagesgruss ab und kam fuer dieses
    // Modul die ganze Sitzung nicht wieder.
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
  return { tipp, setTipp };
}
export type ModulTippLage = ReturnType<typeof useModulTipp>;

// --- Welche Blase gerade zu sehen ist ------------------------------------------------------
// Echte Arbeit (Freigabe/Arbeitet/Fehler) und eine frisch angekommene Antwort gewinnen immer
// vor dem Live-Lauf-Hinweis und der Compliance-Tour: die Fuehrung wartet lieber kurz, als eine
// Meldung zu verdecken, die Aufmerksamkeit braucht.
// liveHinweisSichtbar und tourAktivSichtbar steuern auch Miene und Blick der Figur
// (haustier-dashboard.tsx), deshalb stehen hier die Meldungen, vor denen sie zuruecktreten.
export function waehleBlase({
  willkommen,
  phase,
  fertigBlase,
  offen,
  liveHinweisAktiv,
  tour,
  ruhigGenug,
  sprachmodus,
  tagesbeginnAn,
  tagesGruss,
  befindenLage,
  anstupser,
  tipp,
  verfuegbar,
  handy,
  an,
  weg,
  seiteSichtbar,
}: {
  willkommen: boolean;
  phase: AgentPhase;
  fertigBlase: boolean;
  offen: boolean;
  liveHinweisAktiv: boolean;
  tour: Pick<ComplianceTourAnzeige, "aktiv" | "frageBereit">;
  ruhigGenug: boolean;
  sprachmodus: boolean;
  tagesbeginnAn: boolean;
  tagesGruss: Tageszeit | null;
  befindenLage: Pick<BefindenLage, "befindenFrage" | "befinden" | "befindenBlase">;
  anstupser: Anstupser | null;
  tipp: ModulTipp | null;
  verfuegbar: boolean;
  handy: boolean;
  an: boolean;
  weg: boolean;
  seiteSichtbar: boolean;
}) {
  const { befindenFrage, befinden, befindenBlase } = befindenLage;
  const keineWichtigereMeldung = phase !== "freigabe" && phase !== "arbeitet" && phase !== "fehler" && !fertigBlase;
  const liveHinweisSichtbar = !offen && keineWichtigereMeldung && liveHinweisAktiv;
  const tourAktivSichtbar = !offen && keineWichtigereMeldung && !liveHinweisSichtbar && tour.aktiv;

  // Hier steht nur, was bereitliegt. Wann eine Blase bereit ist und welche gewinnt, entscheiden
  // blasenKandidaten und BLASEN_RANGFOLGE in lib/haustier.ts (Fund 53 vom 28.09.2026: vorher
  // trugen Befinden, Tour-Frage, Tipp und Anstupser hier eigene Ausschluesse, und die Liste log).
  // Der erste bereite Kandidat gewinnt (sichtbareBlase), der Inhalt jeder Blase steht in
  // blasenInhalt (haustier-dashboard.tsx).
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
  return { liveHinweisSichtbar, tourAktivSichtbar, blasen };
}
export type BlasenWahl = ReturnType<typeof waehleBlase>;

// Merker und Anzeigedauer erst ab dem Moment, in dem die Blase die gezeigte ist. Verdeckt sie
// danach etwas Dringenderes, haelt ihre Uhr an und beginnt neu, sobald sie wieder dran ist:
// sonst liefe sie wie vorher hinter einer anderen Blase ab.
// Die Setzer und Referenzen kommen aus den Hooks oben und behalten ihre Identität; sie stehen nur
// deshalb in den Abhängigkeiten, weil sie hier als Eingabe ankommen. Ausgelöst wird wie vorher allein
// über das Zeigen, den Nutzer, den Tipp und den Anstupser.
export function useBlasenMerker({
  blasen,
  nutzerId,
  grussLage,
  tippLage,
  anstupserLage,
}: {
  blasen: { gezeigt: BlasenArt | null };
  nutzerId: string | null;
  grussLage: Pick<TagesGrussLage, "setTagesGruss">;
  tippLage: ModulTippLage;
  anstupserLage: AnstupserLage;
}) {
  const { setTagesGruss } = grussLage;
  const { tipp, setTipp } = tippLage;
  const { anstupser, setAnstupser, absagen, gestellt } = anstupserLage;

  const tagesGrussGezeigt = blasen.gezeigt === "tagesgruss";
  useEffect(() => {
    if (!tagesGrussGezeigt) return;
    merkeTagesbeginn(browserAblage(), nutzerId, "blase");
    const id = window.setTimeout(() => setTagesGruss(null), TAGESGRUSS_DAUER_MS);
    return () => window.clearTimeout(id);
  }, [tagesGrussGezeigt, nutzerId, setTagesGruss]);

  const tippGezeigt = blasen.gezeigt === "tipp";
  useEffect(() => {
    if (!tippGezeigt || !tipp) return;
    merkeTippGezeigt(sitzungsAblage(), tipp.key);
    const id = window.setTimeout(() => setTipp(null), TIPP_DAUER_MS);
    return () => window.clearTimeout(id);
  }, [tippGezeigt, tipp, setTipp]);

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
  }, [anstupserGezeigt, anstupser, gestellt, absagen, setAnstupser]);

  const befindenGezeigt = blasen.gezeigt === "befinden";
  useEffect(() => {
    if (!befindenGezeigt) return;
    try {
      window.sessionStorage.setItem(BEFINDEN_SCHLUESSEL, "1");
    } catch {
      // egal
    }
  }, [befindenGezeigt]);
}
