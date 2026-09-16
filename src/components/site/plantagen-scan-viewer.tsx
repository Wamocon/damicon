"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Box, Loader2 } from "lucide-react";
import type { PlantagenScan } from "@/lib/site-medien";

// Gaussian-Splat-Viewer (gsplat, ohne Three.js). Bibliothek und Scan-Datei
// laden erst auf Knopfdruck: Ein Splat liegt schnell bei 20 bis 60 MB, das
// darf niemand ungefragt ueber Mobilfunk ziehen - deshalb steht die Groesse
// auf dem Knopf. Gerendert wird nur, solange der Viewer im Bild ist.
// data-lenis-prevent haelt das weiche Scrollen vom Mausrad fern, hier zoomt es.

type Zustand = "bereit" | "laedt" | "laeuft" | "fehler";

export function PlantagenScanViewer({ scan }: { scan: PlantagenScan }) {
  const t = useTranslations("erlebnis.scan");
  const [zustand, setZustand] = useState<Zustand>("bereit");
  const [prozent, setProzent] = useState(0);
  const leinwand = useRef<HTMLCanvasElement>(null);
  const aufraeumen = useRef<(() => void) | null>(null);

  useEffect(() => {
    const ablage = aufraeumen;
    return () => ablage.current?.();
  }, []);

  async function starten() {
    const canvas = leinwand.current;
    if (!canvas) return;
    setZustand("laedt");
    try {
      const SPLAT = await import("gsplat");
      const szene = new SPLAT.Scene();
      const kamera = new SPLAT.Camera();
      const renderer = new SPLAT.WebGLRenderer(canvas);
      const steuerung = new SPLAT.OrbitControls(kamera, canvas);
      const melden = (wert: number) => setProzent(Math.round(Math.min(1, Math.max(0, wert)) * 100));

      if (scan.format === "ply") await SPLAT.PLYLoader.LoadAsync(scan.quelle, szene, melden);
      else await SPLAT.Loader.LoadAsync(scan.quelle, szene, melden);

      let raf = 0;
      let sichtbar = true;
      const bild = () => {
        steuerung.update();
        renderer.render(szene, kamera);
        raf = sichtbar ? requestAnimationFrame(bild) : 0;
      };
      const sicht = new IntersectionObserver(([eintrag]) => {
        sichtbar = Boolean(eintrag?.isIntersecting);
        if (sichtbar && !raf) raf = requestAnimationFrame(bild);
      });
      const groesse = new ResizeObserver(() => renderer.resize());
      sicht.observe(canvas);
      groesse.observe(canvas);
      raf = requestAnimationFrame(bild);

      aufraeumen.current = () => {
        cancelAnimationFrame(raf);
        sicht.disconnect();
        groesse.disconnect();
        steuerung.dispose();
        renderer.dispose();
      };
      setZustand("laeuft");
    } catch {
      setZustand("fehler");
    }
  }

  return (
    <div
      data-lenis-prevent
      className="relative mt-10 aspect-4/3 w-full overflow-hidden rounded-3xl border border-border bg-[#04161c] md:aspect-21/9"
    >
      <canvas ref={leinwand} className="absolute inset-0 h-full w-full touch-none" />
      {zustand === "laeuft" ? (
        <p className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/55 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
          {t("bedienung")}
        </p>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
          {zustand === "bereit" ? (
            <button
              type="button"
              onClick={starten}
              className="inline-flex min-h-12 items-center gap-2 rounded-full bg-white px-6 text-sm font-black text-[#04161c] shadow-xl transition hover:-translate-y-0.5"
            >
              <Box className="h-4 w-4" />
              {t("laden", { mb: scan.megabyte })}
            </button>
          ) : null}
          {zustand === "laedt" ? (
            <p role="status" className="inline-flex items-center gap-2 text-sm font-bold">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("laedt", { prozent })}
            </p>
          ) : null}
          {zustand === "fehler" ? (
            <p role="alert" className="text-sm font-bold text-white/85">
              {t("fehler")}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
