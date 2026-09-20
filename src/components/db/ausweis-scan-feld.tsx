"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import QrScanner from "qr-scanner";
import { Camera, CheckCircle2, RotateCcw, TriangleAlert } from "lucide-react";
import { pflueckerZuAusweis, type PflueckerOption } from "@/lib/domain/ausweis-scan";

// Anforderung 2.7/2.8: Kamera-QR-Scan des Pfluecker-Ausweises ersetzt die
// bisherige HTML-Dropdown-Auswahl in SteigeFormular/ArbeitszeitFormular
// (nachweiskette-formulare.tsx). Die Zuordnungslogik selbst
// (pflueckerZuAusweis()) steht bewusst in einer eigenen, reinen Datei
// (src/lib/domain/ausweis-scan.ts) - testbar ohne Kamera, siehe
// supabase/tests/ausweis-scan.mjs.
//
// Worker-Pfad als statisches Asset (public/qr-scanner-worker.min.js, per
// "postinstall" aus node_modules kopiert, siehe
// scripts/copy-qr-scanner-worker.mjs) statt eines bundler-abhaengigen
// new-URL(...)-Worker-Imports - funktioniert unabhaengig davon, ob Turbopack
// (Dev) oder Webpack (Vercel-Build) gerade aktiv ist.
if (typeof window !== "undefined") {
  QrScanner.WORKER_PATH = "/qr-scanner-worker.min.js";
}

// QR-Inhalt vs. Klartext auf demselben Ausweis: ein QR-Code laesst sich aus
// groesserer Distanz und automatisiert erfassen (z. B. eine fest montierte
// Kamera), waehrend der aufgedruckte Klartext bewusstes Ablesen aus der Naehe
// braucht - ein Unterschied in der Reichweite, keine "keine neue
// Preisgabe"-Aussage ohne Einschraenkung (adversarischer Review-Fund). Fuer
// den engen betrieblichen Anwendungsfall (Sammelpunkt der eigenen Brigade,
// kein oeffentlicher Aushang) als vertretbar eingestuft, aber bewusst nicht
// stillschweigend entschieden - siehe PR-/Jira-Notiz zu Anforderung 2.7/2.8.
type Modus = "leer" | "scan" | "manuell";

export function AusweisScanFeld({
  name,
  pfluecker,
}: {
  name: string;
  pfluecker: PflueckerOption[];
}) {
  const t = useTranslations("ausweisScan");
  const videoRef = useRef<HTMLVideoElement>(null);
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

  const [modus, setModus] = useState<Modus>("leer");
  const [ausgewaehlt, setAusgewaehlt] = useState<PflueckerOption | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  // Adversarischer Review-Fund: der versteckte Wert ist ein kontrolliertes
  // Feld (value=..., kein defaultValue) - ein natives form.reset() (das
  // useOfflineFormular nach jeder Offline-Einreihung aufruft, damit derselbe
  // Erfasser sofort die naechste Steige erfassen kann) setzt das DOM-Feld
  // zwar zurueck, der React-State "ausgewaehlt" bliebe aber unveraendert und
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
      setAusgewaehlt(null);
      setFehler(null);
      setModus("leer");
    };
    formular.addEventListener("reset", zuruecksetzen);
    return () => formular.removeEventListener("reset", zuruecksetzen);
  }, []);

  // Kein automatischer Kamerastart beim Rendern: SteigeFormular UND
  // ArbeitszeitFormular zeigen dieses Feld gleichzeitig auf derselben Seite
  // (NachweiskettenKarte). Das verhindert nur, dass BEIDE Kameras ohne
  // Zutun des Nutzers gleichzeitig anlaufen (z. B. beim reinen Oeffnen der
  // Seite) - es verhindert NICHT, dass jemand bewusst in beiden Feldern
  // nacheinander auf "Ausweis scannen" klickt; qr-scanner faengt einen
  // dadurch scheiternden zweiten Kamerazugriff ueber start().catch() ab und
  // faellt auf die manuelle Auswahl zurueck.
  useEffect(() => {
    if (modus !== "scan" || ausgewaehlt || !videoRef.current) return;

    const scanner = new QrScanner(
      videoRef.current,
      (result) => {
        const treffer = pflueckerZuAusweis(result.data, pflueckerRef.current);
        if (treffer) {
          setFehler(null);
          setAusgewaehlt(treffer);
          // Sofort stoppen, nicht erst auf den Effekt-Cleanup warten (siehe
          // unten) - qr-scanner ruft onDecode mehrfach je Sekunde auf,
          // zwischen setState und dem naechsten Render koennte sonst noch
          // ein weiterer Frame ausgewertet werden.
          scanner.stop();
        } else {
          setFehler(t("keinTreffer"));
        }
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
  }, [modus, ausgewaehlt, t]);

  return (
    <div className="space-y-1.5">
      <span className="text-[11px] font-semibold text-card-foreground">{t("label")}</span>
      <input ref={hiddenRef} type="hidden" name={name} value={ausgewaehlt?.id ?? ""} />

      {ausgewaehlt ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-success/30 bg-success/[0.06] px-2.5 py-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-success">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            {ausgewaehlt.name}
          </span>
          <button
            type="button"
            onClick={() => {
              setAusgewaehlt(null);
              setFehler(null);
              setModus("scan");
            }}
            className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold text-foreground transition hover:border-primary"
          >
            <RotateCcw className="h-3 w-3" />
            {t("aendern")}
          </button>
        </div>
      ) : modus === "leer" ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setModus("scan")}
            className="inline-flex h-11 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:border-primary lg:h-auto lg:px-3 lg:py-1.5 lg:text-xs"
          >
            <Camera className="h-3.5 w-3.5" />
            {t("ausweisScannen")}
          </button>
          <button
            type="button"
            onClick={() => setModus("manuell")}
            className="text-[11px] font-semibold text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            {t("manuellStattdessen")}
          </button>
        </div>
      ) : modus === "scan" ? (
        <div className="space-y-1.5">
          <div className="overflow-hidden rounded-lg border border-border bg-black">
            <video
              ref={videoRef}
              /* Hochkant auf dem Handy: das Geraet wird so gehalten, und der
                 QR-Code steht senkrecht vor einem. 16:9 ergab bei 358 px
                 Breite ein 201 px hohes Querbild. Ab md bleibt es beim
                 Querformat, dort steht die Kamera meist am Bildschirm. */
              className="aspect-[3/4] w-full object-cover lg:aspect-video"
              muted
              playsInline
            />
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
          <select
            className="h-11 w-full rounded-lg border border-border bg-background px-3 text-base text-foreground outline-none transition focus:border-primary lg:h-9 lg:px-2.5 lg:text-xs"
            defaultValue=""
            onChange={(event) => {
              const treffer = pfluecker.find((p) => p.id === event.target.value) ?? null;
              setAusgewaehlt(treffer);
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
    </div>
  );
}
