"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { usePersona } from "@/components/dashboard/persona";
import { HaustierHuelle } from "@/components/haustier/haustier-huelle";
import { useHaustierAktionen, useHaustierStatus } from "@/components/haustier/haustier-kontext";
import { useKiPane } from "@/components/ki/ki-pane-kontext";
import { usePathname } from "@/i18n/navigation";
import { haustierZustand, modulAusPfad } from "@/lib/haustier";
import { modules } from "@/lib/modules";
import { hasPermission } from "@/lib/rbac";

// Himbi im Dashboard: spiegelt, was der Agent gerade tut, AUCH wenn das Chat-Panel zu ist.
// Der Chat bleibt immer gemountet und streamt weiter (ki-pane.tsx) - Himbi zeigt es nur an:
// arbeitet, wartet auf eine Freigabe, Antwort ist fertig, etwas ging schief. Dazu kommen
// Tipps zum Modul, in dem man gerade ist.

const TIPP_VERZOEGERUNG_MS = 7000;
const TIPP_DAUER_MS = 15000;
const FERTIG_BLASE_MS = 9000;

export function HaustierDashboard() {
  const t = useTranslations("haustier");
  const moduleT = useTranslations("modules");
  const { verfuegbar, offen, umschalten, setOffen } = useKiPane();
  const { phase, text, an } = useHaustierStatus();
  const { setAn, stelleFrage } = useHaustierAktionen();
  const pfad = usePathname();
  const { role } = usePersona();

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

  // Tipp zum Modul: einmal pro Modul und Sitzung, erst nach einer Weile Ruhe.
  const [gemerkterTipp, setTipp] = useState<{ key: string; titel: string; pfad: string } | null>(null);
  // Ein Tipp gilt nur fuer die Seite, auf der er entstand.
  const tipp = gemerkterTipp && gemerkterTipp.pfad === pfad ? gemerkterTipp : null;
  useEffect(() => {
    const modul = modulAusPfad(pfad, modules);
    if (!modul || !hasPermission(role, modul.resource, "view")) return;
    const merker = `damicon-haustier-tipp:${modul.key}`;
    try {
      if (window.sessionStorage.getItem(merker)) return;
    } catch {
      // ohne Speicher: Tipp erscheint bei jedem Besuch, das ist verkraftbar
    }
    const zeigen = window.setTimeout(() => {
      try {
        window.sessionStorage.setItem(merker, "1");
      } catch {
        // egal
      }
      setTipp({ key: modul.key, titel: moduleT(`${modul.key}.title`), pfad });
    }, TIPP_VERZOEGERUNG_MS);
    return () => window.clearTimeout(zeigen);
  }, [pfad, role, moduleT]);
  useEffect(() => {
    if (!tipp) return;
    const id = window.setTimeout(() => setTipp(null), TIPP_DAUER_MS);
    return () => window.clearTimeout(id);
  }, [tipp]);

  if (!verfuegbar || !an) return null;

  const zustand = haustierZustand({ phase, fertigUngelesen: fertig, schlaeft: false });
  const label = t(`label.${zustand}`);
  const tippSichtbar = !!tipp && phase === "ruhe" && !offen && !fertig;

  let blase = null;
  if (!offen) {
    if (phase === "freigabe") {
      blase = (
        <>
          <p className="hb-blase__text">{t("freigabe")}</p>
          <div className="hb-blase__knoepfe">
            <button type="button" className="hb-knopf" onClick={() => setOffen(true)}>
              {t("ansehen")}
            </button>
          </div>
        </>
      );
    } else if (phase === "arbeitet") {
      blase = (
        <>
          <p className="hb-blase__text">{text || t("arbeitet")}</p>
          <p className="hb-blase__klein">{t("imHintergrund")}</p>
        </>
      );
    } else if (phase === "fehler") {
      blase = <p className="hb-blase__text">{t("fehler")}</p>;
    } else if (fertigBlase) {
      blase = (
        <>
          <p className="hb-blase__text">{t("fertig")}</p>
          <div className="hb-blase__knoepfe">
            <button type="button" className="hb-knopf" onClick={() => setOffen(true)}>
              {t("ansehen")}
            </button>
          </div>
        </>
      );
    } else if (tippSichtbar && tipp) {
      blase = (
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
      );
    }
  }

  return (
    <HaustierHuelle
      zustand={zustand}
      blase={blase}
      paneOffen={offen}
      label={label}
      onKlick={() => {
        setFertig(false);
        setFertigBlase(false);
        setTipp(null);
        umschalten();
      }}
      onVerstecken={() => setAn(false)}
      versteckenLabel={t("verstecken")}
    />
  );
}
