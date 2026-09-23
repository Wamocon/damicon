"use client";

import { useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Camera, CheckCircle2, RotateCcw } from "lucide-react";
import { pflueckerZuAusweis, type PflueckerOption } from "@/lib/domain/ausweis-scan";
import { ScanFeldRahmen, useScanFeld, type ScanErgebnis } from "@/components/db/scan-feld";

// Anforderung 2.7/2.8: Kamera-QR-Scan des Pfluecker-Ausweises ersetzt die
// bisherige HTML-Dropdown-Auswahl in SteigeFormular/ArbeitszeitFormular
// (nachweiskette-formulare.tsx). Die Zuordnungslogik selbst
// (pflueckerZuAusweis()) steht bewusst in einer eigenen, reinen Datei
// (src/lib/domain/ausweis-scan.ts) - testbar ohne Kamera, siehe
// supabase/tests/ausweis-scan.mjs. Kamerarahmen und Zustandsautomat
// "leer/scan/manuell" stecken im gemeinsamen Baustein
// src/components/db/scan-feld.tsx (dort auch die Worker-Pfad-Einrichtung),
// wiederverwendet von SteigeScanFeld.
//
// QR-Inhalt vs. Klartext auf demselben Ausweis: ein QR-Code laesst sich aus
// groesserer Distanz und automatisiert erfassen (z. B. eine fest montierte
// Kamera), waehrend der aufgedruckte Klartext bewusstes Ablesen aus der Naehe
// braucht - ein Unterschied in der Reichweite, keine "keine neue
// Preisgabe"-Aussage ohne Einschraenkung (adversarischer Review-Fund). Fuer
// den engen betrieblichen Anwendungsfall (Sammelpunkt der eigenen Brigade,
// kein oeffentlicher Aushang) als vertretbar eingestuft, aber bewusst nicht
// stillschweigend entschieden - siehe PR-/Jira-Notiz zu Anforderung 2.7/2.8.

export function AusweisScanFeld({
  name,
  pfluecker,
}: {
  name: string;
  pfluecker: PflueckerOption[];
}) {
  const t = useTranslations("ausweisScan");
  const hiddenRef = useRef<HTMLInputElement>(null);
  // In einem Ref statt einer Effekt-Abhaengigkeit: jede Server-Action auf
  // derselben Seite (auch eine voellig andere, z. B. KuehlmessungFormular)
  // loest revalidatePath() aus, das laedt pfluecker mit neuer Array-Referenz
  // nach - ohne den Ref wuerde das einen laufenden Scan in einem ANDEREN,
  // unbeteiligten AusweisScanFeld unterbrechen (adversarischer Review-Fund).
  const pflueckerRef = useRef(pfluecker);
  useEffect(() => {
    pflueckerRef.current = pfluecker;
  }, [pfluecker]);

  const verarbeiten = useCallback(
    (roh: string): ScanErgebnis<PflueckerOption> => {
      const treffer = pflueckerZuAusweis(roh, pflueckerRef.current);
      return treffer ? { treffer, fehler: null } : { treffer: null, fehler: t("keinTreffer") };
    },
    [t],
  );

  const { videoRef, modus, setModus, treffer, setTreffer, fehler, setFehler } =
    useScanFeld<PflueckerOption>({ verarbeiten, keineKameraText: t("keineKamera") });

  // Adversarischer Review-Fund: der versteckte Wert ist ein kontrolliertes
  // Feld (value=..., kein defaultValue) - ein natives form.reset() (das
  // useOfflineFormular nach jeder Offline-Einreihung aufruft, damit derselbe
  // Erfasser sofort die naechste Steige erfassen kann) setzt das DOM-Feld
  // zwar zurueck, der React-State "treffer" bliebe aber unveraendert und
  // wuerde weiterhin den Namen der zuvor gewaehlten Person anzeigen, obwohl
  // pfluecker_id im DOM bereits wieder leer ist - eine Vorbestellung ohne
  // Person, unbemerkt bis zum spaeteren, endgueltig scheiternden Sync. Das
  // native "reset"-Ereignis (feuert auch bei programmatischem
  // form.reset(), nicht nur beim Klick auf einen Reset-Knopf) synchronisiert
  // den React-Zustand deshalb aktiv mit.
  useEffect(() => {
    const formular = hiddenRef.current?.form;
    if (!formular) return;
    const zuruecksetzen = () => {
      setTreffer(null);
      setFehler(null);
      setModus("leer");
    };
    formular.addEventListener("reset", zuruecksetzen);
    return () => formular.removeEventListener("reset", zuruecksetzen);
  }, [setTreffer, setFehler, setModus]);

  return (
    <div className="space-y-1.5">
      <span className="text-[11px] font-semibold text-card-foreground">{t("label")}</span>
      <input ref={hiddenRef} type="hidden" name={name} value={treffer?.id ?? ""} />
      <ScanFeldRahmen<PflueckerOption>
        videoRef={videoRef}
        modus={modus}
        setModus={setModus}
        treffer={treffer}
        setTreffer={setTreffer}
        fehler={fehler}
        setFehler={setFehler}
        scanKnopfText={t("ausweisScannen")}
        manuellStattdessenText={t("manuellStattdessen")}
        hinweisText={t("hinweis")}
        mitManuellKurzwahl
        trefferAnzeige={(treffer, zuruecksetzen) => (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-success/30 bg-success/[0.06] px-2.5 py-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-success">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              {treffer.name}
            </span>
            <button
              type="button"
              onClick={zuruecksetzen}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold text-foreground transition hover:border-primary"
            >
              <RotateCcw className="h-3 w-3" />
              {t("aendern")}
            </button>
          </div>
        )}
        manuelleEingabe={() => (
          <div className="space-y-1.5">
            <select
              className="h-11 w-full rounded-lg border border-border bg-background px-3 text-base text-foreground outline-none transition focus:border-primary lg:h-9 lg:px-2.5 lg:text-xs"
              defaultValue=""
              onChange={(event) => {
                const treffer = pfluecker.find((p) => p.id === event.target.value) ?? null;
                setTreffer(treffer);
              }}
            >
              <option value="" disabled>
                {t("bitteWaehlen")}
              </option>
              {pfluecker.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setModus("scan")}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              <Camera className="h-3 w-3" />
              {t("scanStattdessen")}
            </button>
          </div>
        )}
      />
    </div>
  );
}
