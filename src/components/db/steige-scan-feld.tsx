"use client";

import { useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Camera, Package, RotateCcw } from "lucide-react";
import { steigenCodeAusScan, normalisiereSteigenCode } from "@/lib/domain/steige-scan";
import { SteigeKontrollierenKnopf } from "@/components/db/nachweiskette-formulare";
import { feldKlassen } from "@/components/db/formular-kit";
import { ScanFeldRahmen, useScanFeld, type ScanErgebnis } from "@/components/db/scan-feld";

// Anforderung 2.7, letzter offener Teil des Abnahmekriteriums: "ein Scan am
// Sammelpunkt ruft die Steige auf". Kennung, Etiketten und Druck gab es
// bereits, den Scan nicht - der Etiketten-QR zeigte nur auf die Herkunft der
// Charge, und eine Charge umfasst viele Steigen.
//
// Die Zuordnung laeuft gegen die bereits geladene, RLS-gefilterte Liste der
// Steigen dieser Aufgabe, genau wie AusweisScanFeld gegen die Pflueckerliste.
// Das spart eine eigene Serverroute: Was der Scan findet, hat der Nutzer
// ohnehin schon auf dem Schirm - der Scan spart ihm nur das Suchen in einer
// Liste, in der am Erntetag dreistellige Stueckzahlen stehen.
//
// Kamerarahmen und Zustandsautomat "leer/scan/manuell" stecken im
// gemeinsamen Baustein src/components/db/scan-feld.tsx (dort auch die
// einmalige Worker-Pfad-Einrichtung), wiederverwendet von AusweisScanFeld.

export interface SteigeTreffer {
  id: string;
  code: string;
  pfluecker: string | null;
  gewichtKg: number | null;
  kontrolliertAm: string | null;
}

export function SteigeScanFeld({
  steigen,
  darfKontrollieren,
}: {
  steigen: SteigeTreffer[];
  darfKontrollieren: boolean;
}) {
  const t = useTranslations("steigeScan");

  // Wie in AusweisScanFeld in einem Ref statt als Effekt-Abhaengigkeit: jede
  // Server Action auf derselben Seite loest revalidatePath() aus und laedt die
  // Liste mit neuer Array-Referenz nach. Ohne den Ref bräche das einen
  // laufenden Scan ab - und nach einer Kontrolle passiert genau das, weil die
  // Kontrolle selbst eine Server Action ist.
  const steigenRef = useRef(steigen);
  useEffect(() => {
    steigenRef.current = steigen;
  }, [steigen]);

  const verarbeiten = useCallback(
    (roh: string): ScanErgebnis<SteigeTreffer> => {
      const code = steigenCodeAusScan(roh);
      if (!code) return { treffer: null, fehler: t("keinSteigenCode") };
      const treffer = steigenRef.current.filter((s) => normalisiereSteigenCode(s.code) === code);
      // Genau ein Treffer, sonst nichts: Bei einer Datenanomalie mit doppelter
      // Kennung ist die stillschweigend erste Wahl die schlechteste.
      if (treffer.length !== 1) return { treffer: null, fehler: t("nichtInDieserAufgabe", { code }) };
      return { treffer: treffer[0], fehler: null };
    },
    [t],
  );

  const { videoRef, modus, setModus, treffer, setTreffer, fehler, setFehler, versuchen } =
    useScanFeld<SteigeTreffer>({ verarbeiten, keineKameraText: t("keineKamera") });

  // Nach einer Kontrolle traegt die Steige in der nachgeladenen Liste einen
  // Zeitstempel. Den Treffer aktuell halten, sonst zeigt die Karte weiterhin
  // "noch nicht kontrolliert" und der Knopf bliebe stehen.
  useEffect(() => {
    if (!treffer) return;
    const frisch = steigen.find((s) => s.id === treffer.id);
    if (frisch && frisch.kontrolliertAm !== treffer.kontrolliertAm) setTreffer(frisch);
  }, [steigen, treffer, setTreffer]);

  return (
    <div className="space-y-1.5">
      <span className="text-[11px] font-semibold text-card-foreground">{t("label")}</span>
      <ScanFeldRahmen<SteigeTreffer>
        videoRef={videoRef}
        modus={modus}
        setModus={setModus}
        treffer={treffer}
        setTreffer={setTreffer}
        fehler={fehler}
        setFehler={setFehler}
        scanKnopfText={t("steigeScannen")}
        manuellStattdessenText={t("manuellStattdessen")}
        hinweisText={t("hinweis")}
        trefferAnzeige={(treffer, zuruecksetzen) => (
          <div className="space-y-1.5 rounded-lg border border-primary/30 bg-primary/[0.06] px-2.5 py-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-[11px]">
              <span className="inline-flex items-center gap-1.5 font-mono font-semibold text-foreground">
                <Package className="h-3.5 w-3.5 shrink-0 text-primary" />
                {treffer.code}
              </span>
              <span className="font-semibold text-foreground">
                {treffer.pfluecker ?? t("ohnePerson")}
              </span>
              <span className="text-muted-foreground">
                {treffer.gewichtKg !== null ? `${treffer.gewichtKg} kg` : "-"}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              {treffer.kontrolliertAm ? (
                <span className="text-[10px] font-semibold text-success">
                  {t("bereitsKontrolliert")}
                </span>
              ) : darfKontrollieren ? (
                <SteigeKontrollierenKnopf id={treffer.id} code={treffer.code} />
              ) : (
                <span className="text-[10px] text-muted-foreground">{t("keinKontrollrecht")}</span>
              )}
              <button
                type="button"
                onClick={zuruecksetzen}
                className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-foreground transition hover:border-primary"
              >
                <RotateCcw className="h-3 w-3" />
                {t("naechste")}
              </button>
            </div>
          </div>
        )}
        manuelleEingabe={() => (
          <div className="space-y-1.5">
            {/* Rückfall ohne Kamera: die Kennung steht als Klartext auf demselben
                Etikett, lässt sich also abtippen. */}
            <input
              type="text"
              inputMode="text"
              placeholder={t("codePlatzhalter")}
              aria-label={t("codeAria")}
              className={feldKlassen}
              onChange={(event) => {
                const wert = event.target.value.trim();
                if (wert.length >= 3) versuchen(wert);
              }}
            />
            {fehler ? <p className="text-[11px] font-semibold text-warning">{fehler}</p> : null}
            <button
              type="button"
              onClick={() => {
                setFehler(null);
                setModus("scan");
              }}
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
