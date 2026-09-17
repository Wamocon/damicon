"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import QrScanner from "qr-scanner";
import { Camera, Package, RotateCcw, TriangleAlert } from "lucide-react";
import { steigenCodeAusScan, normalisiereSteigenCode } from "@/lib/domain/steige-scan";
import { SteigeKontrollierenKnopf } from "@/components/db/nachweiskette-formulare";

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
// Der Worker-Pfad wird nicht erneut gesetzt: ausweis-scan-feld.tsx tut das
// bereits beim Laden des Moduls, und beide Komponenten erscheinen auf
// derselben Seite.

export interface SteigeTreffer {
  id: string;
  code: string;
  pfluecker: string | null;
  gewichtKg: number | null;
  kontrolliertAm: string | null;
}

type Modus = "leer" | "scan" | "manuell";

export function SteigeScanFeld({
  steigen,
  darfKontrollieren,
}: {
  steigen: SteigeTreffer[];
  darfKontrollieren: boolean;
}) {
  const t = useTranslations("steigeScan");
  const videoRef = useRef<HTMLVideoElement>(null);

  // Wie in AusweisScanFeld in einem Ref statt als Effekt-Abhaengigkeit: jede
  // Server Action auf derselben Seite loest revalidatePath() aus und laedt die
  // Liste mit neuer Array-Referenz nach. Ohne den Ref bräche das einen
  // laufenden Scan ab - und nach einer Kontrolle passiert genau das, weil die
  // Kontrolle selbst eine Server Action ist.
  const steigenRef = useRef(steigen);
  useEffect(() => {
    steigenRef.current = steigen;
  }, [steigen]);

  const [modus, setModus] = useState<Modus>("leer");
  const [gefunden, setGefunden] = useState<SteigeTreffer | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  // Nach einer Kontrolle traegt die Steige in der nachgeladenen Liste einen
  // Zeitstempel. Den Treffer aktuell halten, sonst zeigt die Karte weiterhin
  // "noch nicht kontrolliert" und der Knopf bliebe stehen.
  useEffect(() => {
    if (!gefunden) return;
    const frisch = steigen.find((s) => s.id === gefunden.id);
    if (frisch && frisch.kontrolliertAm !== gefunden.kontrolliertAm) setGefunden(frisch);
  }, [steigen, gefunden]);

  function auswerten(roh: string) {
    const code = steigenCodeAusScan(roh);
    if (!code) {
      setFehler(t("keinSteigenCode"));
      return false;
    }
    const treffer = steigenRef.current.filter(
      (s) => normalisiereSteigenCode(s.code) === code,
    );
    // Genau ein Treffer, sonst nichts: Bei einer Datenanomalie mit doppelter
    // Kennung ist die stillschweigend erste Wahl die schlechteste.
    if (treffer.length !== 1) {
      setFehler(t("nichtInDieserAufgabe", { code }));
      return false;
    }
    setFehler(null);
    setGefunden(treffer[0]);
    return true;
  }

  useEffect(() => {
    if (modus !== "scan" || gefunden || !videoRef.current) return;

    const scanner = new QrScanner(
      videoRef.current,
      (result) => {
        // Erst stoppen, wenn die Auswertung wirklich getroffen hat - sonst
        // beendet ein versehentlich erfasster Fremdcode den Scan und der
        // Nutzer muss neu starten, statt die Kamera einfach weiterzuhalten.
        if (auswerten(result.data)) scanner.stop();
      },
      {
        highlightScanRegion: true,
        highlightCodeOutline: true,
        preferredCamera: "environment",
      },
    );

    scanner.start().catch(() => {
      setFehler(t("keineKamera"));
      setModus("manuell");
    });

    return () => {
      scanner.stop();
      scanner.destroy();
    };
    // auswerten liest nur Refs und setState - bewusst nicht in den
    // Abhaengigkeiten, sonst startet die Kamera bei jedem Render neu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modus, gefunden, t]);

  return (
    <div className="space-y-1.5">
      <span className="text-[11px] font-semibold text-card-foreground">{t("label")}</span>

      {gefunden ? (
        <div className="space-y-1.5 rounded-lg border border-primary/30 bg-primary/[0.06] px-2.5 py-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1.5 font-mono font-semibold text-foreground">
              <Package className="h-3.5 w-3.5 shrink-0 text-primary" />
              {gefunden.code}
            </span>
            <span className="font-semibold text-foreground">
              {gefunden.pfluecker ?? t("ohnePerson")}
            </span>
            <span className="text-muted-foreground">
              {gefunden.gewichtKg !== null ? `${gefunden.gewichtKg} kg` : "-"}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {gefunden.kontrolliertAm ? (
              <span className="text-[10px] font-semibold text-success">
                {t("bereitsKontrolliert")}
              </span>
            ) : darfKontrollieren ? (
              <SteigeKontrollierenKnopf id={gefunden.id} code={gefunden.code} />
            ) : (
              <span className="text-[10px] text-muted-foreground">{t("keinKontrollrecht")}</span>
            )}
            <button
              type="button"
              onClick={() => {
                setGefunden(null);
                setFehler(null);
                setModus("scan");
              }}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-foreground transition hover:border-primary"
            >
              <RotateCcw className="h-3 w-3" />
              {t("naechste")}
            </button>
          </div>
        </div>
      ) : modus === "leer" ? (
        <button
          type="button"
          onClick={() => setModus("scan")}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-primary"
        >
          <Camera className="h-3.5 w-3.5" />
          {t("steigeScannen")}
        </button>
      ) : modus === "scan" ? (
        <div className="space-y-1.5">
          <div className="overflow-hidden rounded-lg border border-border bg-black">
            <video ref={videoRef} className="aspect-video w-full object-cover" muted playsInline />
          </div>
          {fehler ? (
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-warning">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
              {fehler}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">{t("hinweis")}</p>
          )}
          <button
            type="button"
            onClick={() => {
              setFehler(null);
              setModus("manuell");
            }}
            className="text-[11px] font-semibold text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            {t("manuellStattdessen")}
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          {/* Rückfall ohne Kamera: die Kennung steht als Klartext auf demselben
              Etikett, lässt sich also abtippen. */}
          <input
            type="text"
            inputMode="text"
            placeholder={t("codePlatzhalter")}
            aria-label={t("codeAria")}
            className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-xs text-foreground outline-none transition focus:border-primary"
            onChange={(event) => {
              const wert = event.target.value.trim();
              if (wert.length >= 3) auswerten(wert);
            }}
          />
          {fehler ? (
            <p className="text-[11px] font-semibold text-warning">{fehler}</p>
          ) : null}
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
    </div>
  );
}
