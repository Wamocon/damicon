"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import QrScanner from "qr-scanner";
import { Camera, TriangleAlert } from "lucide-react";

// Gemeinsamer Kamera-/QR-Scan-Baustein fuer AusweisScanFeld und
// SteigeScanFeld: derselbe Zustandsautomat "leer/scan/manuell", derselbe
// Kamerarahmen, derselbe Rueckfall-Mechanismus. Die fachlichen Teile bleiben
// bei den beiden Feldern selbst und kommen als Slot/Prop herein: die
// Trefferanzeige (trefferAnzeige) und die Fallback-Eingabe fuer den
// manuellen Modus (manuelleEingabe), inklusive aller kleinen, bewusst
// erhaltenen Unterschiede zwischen Ausweis- und Steigen-Erfassung (z. B. ob
// es im Leer-Zustand einen direkten Sprung in den manuellen Modus gibt, und
// ob die Fehlermeldung beim Zurueckwechseln von manuell zu scan geleert
// wird).
//
// Worker-Pfad als statisches Asset (public/qr-scanner-worker.min.js, per
// "postinstall" aus node_modules kopiert, siehe
// scripts/copy-qr-scanner-worker.mjs) statt eines bundler-abhaengigen
// new-URL(...)-Worker-Imports - funktioniert unabhaengig davon, ob Turbopack
// (Dev) oder Webpack (Vercel-Build) gerade aktiv ist. Module werden von
// Node/Bundlern nur einmal ausgewertet, auch wenn sowohl AusweisScanFeld als
// auch SteigeScanFeld diese Datei importieren - die Zuweisung passiert also
// trotzdem nur einmal.
if (typeof window !== "undefined") {
  QrScanner.WORKER_PATH = "/qr-scanner-worker.min.js";
}

export type Modus = "leer" | "scan" | "manuell";

/** Ergebnis eines Aufloesungsversuchs: entweder ein Treffer oder ein Fehlertext. */
export type ScanErgebnis<T> = { treffer: T; fehler: null } | { treffer: null; fehler: string };

/**
 * Zustandsautomat und Kamera-Lebenszyklus fuer ein Scan-Feld. Generisch ueber
 * den Trefferty T, damit AusweisScanFeld (PflueckerOption) und SteigeScanFeld
 * (SteigeTreffer) dieselbe Logik nutzen koennen.
 *
 * `verarbeiten` loest einen rohen QR-/Freitext-Wert fachlich auf und liefert
 * entweder einen Treffer oder einen (bereits uebersetzten) Fehlertext -
 * dieselbe Funktion, die auch bei einer manuellen Freitext-Eingabe
 * wiederverwendet werden kann (siehe SteigeScanFeld). Sie sollte mit
 * useCallback stabil gehalten werden, sonst startet die Kamera bei jedem
 * Render neu.
 */
export function useScanFeld<T>({
  verarbeiten,
  keineKameraText,
}: {
  verarbeiten: (rohDaten: string) => ScanErgebnis<T>;
  keineKameraText: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [modus, setModus] = useState<Modus>("leer");
  const [treffer, setTreffer] = useState<T | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const versuchen = useCallback(
    (rohDaten: string) => {
      const ergebnis = verarbeiten(rohDaten);
      if (ergebnis.treffer) {
        setFehler(null);
        setTreffer(ergebnis.treffer);
        return true;
      }
      setFehler(ergebnis.fehler);
      return false;
    },
    [verarbeiten],
  );

  // Kein automatischer Kamerastart beim Rendern: SteigeFormular UND
  // ArbeitszeitFormular zeigen ein Scan-Feld gleichzeitig auf derselben Seite
  // (NachweiskettenKarte). Das verhindert nur, dass mehrere Kameras ohne
  // Zutun des Nutzers gleichzeitig anlaufen (z. B. beim reinen Oeffnen der
  // Seite) - es verhindert NICHT, dass jemand bewusst in mehreren Feldern
  // nacheinander auf den Scan-Knopf klickt; qr-scanner faengt einen dadurch
  // scheiternden zweiten Kamerazugriff ueber start().catch() ab und faellt
  // auf die manuelle Eingabe zurueck.
  useEffect(() => {
    if (modus !== "scan" || treffer || !videoRef.current) return;

    const scanner = new QrScanner(
      videoRef.current,
      (result) => {
        // Sofort stoppen, nicht erst auf den Effekt-Cleanup warten (siehe
        // unten) - qr-scanner ruft onDecode mehrfach je Sekunde auf, zwischen
        // setState und dem naechsten Render koennte sonst noch ein weiterer
        // Frame ausgewertet werden.
        if (versuchen(result.data)) scanner.stop();
      },
      {
        highlightScanRegion: true,
        highlightCodeOutline: true,
        preferredCamera: "environment",
      },
    );

    scanner.start().catch(() => {
      setFehler(keineKameraText);
      setModus("manuell");
    });

    return () => {
      scanner.stop();
      scanner.destroy();
    };
  }, [modus, treffer, versuchen, keineKameraText]);

  return { videoRef, modus, setModus, treffer, setTreffer, fehler, setFehler, versuchen };
}

interface ScanFeldRahmenProps<T> {
  videoRef: RefObject<HTMLVideoElement | null>;
  modus: Modus;
  setModus: (modus: Modus) => void;
  treffer: T | null;
  setTreffer: (treffer: T | null) => void;
  fehler: string | null;
  setFehler: (fehler: string | null) => void;
  scanKnopfText: string;
  manuellStattdessenText: string;
  hinweisText: string;
  /** Nur AusweisScanFeld zeigt im Leer-Zustand zusaetzlich einen direkten
   * Sprung in den manuellen Modus neben dem Scan-Knopf. */
  mitManuellKurzwahl?: boolean;
  /** Fachliche Trefferanzeige (Ausweis-Daten vs. Steigen-Code). Bekommt den
   * Treffer und eine fertige Zuruecksetzen-Funktion (setzt Treffer/Fehler
   * zurueck und wechselt in den Scan-Modus, wie "aendern"/"naechste" es in
   * beiden Feldern bereits taten). */
  trefferAnzeige: (treffer: T, zuruecksetzen: () => void) => ReactNode;
  /** Fachliche Fallback-Eingabe im manuellen Modus (Auswahlliste vs.
   * Freitext mit eigener Validierung) samt dem Link zurueck zum Scannen -
   * bewusst vollstaendig als Slot, weil sich beide Felder hier in
   * Eingabeart, Fehleranzeige und Fehlerbehandlung unterscheiden. */
  manuelleEingabe: () => ReactNode;
}

/** Kamerarahmen, Fallback-Eingabe-Huelle und Zustandslogik "leer/scan/manuell"
 * als gemeinsames Skelett. Wird von AusweisScanFeld und SteigeScanFeld
 * zusammen mit useScanFeld() genutzt. */
export function ScanFeldRahmen<T>({
  videoRef,
  modus,
  setModus,
  treffer,
  setTreffer,
  fehler,
  setFehler,
  scanKnopfText,
  manuellStattdessenText,
  hinweisText,
  mitManuellKurzwahl = false,
  trefferAnzeige,
  manuelleEingabe,
}: ScanFeldRahmenProps<T>) {
  if (treffer) {
    return trefferAnzeige(treffer, () => {
      setTreffer(null);
      setFehler(null);
      setModus("scan");
    });
  }

  if (modus === "leer") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setModus("scan")}
          className="inline-flex h-11 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:border-primary lg:h-auto lg:px-3 lg:py-1.5 lg:text-xs"
        >
          <Camera className="h-3.5 w-3.5" />
          {scanKnopfText}
        </button>
        {mitManuellKurzwahl ? (
          <button
            type="button"
            onClick={() => setModus("manuell")}
            className="text-[11px] font-semibold text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            {manuellStattdessenText}
          </button>
        ) : null}
      </div>
    );
  }

  if (modus === "scan") {
    return (
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
          <p className="text-[11px] text-muted-foreground">{hinweisText}</p>
        )}
        <button
          type="button"
          onClick={() => {
            setFehler(null);
            setModus("manuell");
          }}
          className="text-[11px] font-semibold text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          {manuellStattdessenText}
        </button>
      </div>
    );
  }

  return manuelleEingabe();
}
