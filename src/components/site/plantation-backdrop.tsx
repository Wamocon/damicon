"use client";

import { useEffect, useRef } from "react";

// Dynamischer Hintergrund fuer die Landingpage: ein statisches Gitternetz aus
// 1px-Linien (per CSS, radial ausgeblendet) plus ein leichtes Partikelnetz auf
// Canvas - Punkte driften, nahe Punkte werden mit Linien verbunden, der Cursor
// zieht sie an. Angelehnt an das Gitternetz der LFA-Landingpage, hier im
// Koek-Blau der Landesfarben und deutlich zurueckhaltender.
//
// Respektiert prefers-reduced-motion (dann nur das statische Gitter), pausiert
// bei verstecktem Tab und passt sich der Geraeteaufloesung an.

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
}

export function PlantationBackdrop({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduce.matches) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let particles: Particle[] = [];
    const mouse = { x: -9999, y: -9999 };
    let raf = 0;
    let running = true;

    // Flaggenblau (#00afca) fuer Punkte und Linien. Der Backdrop liegt
    // ausschliesslich auf der dunklen Nachtblau-Flaeche der Login-Seiten,
    // dort traegt das helle Koek - das tiefere --primary wuerde absaufen.
    const rgb = "0,175,202";

    function countFor(w: number) {
      // ~1 Punkt je 14 000 px2, gedeckelt fuer schwache Geraete.
      return Math.min(90, Math.max(24, Math.round((w * height) / 14000)));
    }

    function seed() {
      const count = countFor(width);
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.28,
        vy: (Math.random() - 0.5) * 0.28,
        size: Math.random() * 1.6 + 0.9,
      }));
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = parent!.offsetWidth;
      height = parent!.offsetHeight;
      canvas!.width = width * dpr;
      canvas!.height = height * dpr;
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    const connectDist = 132;
    const mouseRadius = 170;

    function frame() {
      if (!running) return;
      ctx!.clearRect(0, 0, width, height);

      for (const p of particles) {
        // Cursor-Anziehung
        const dxm = mouse.x - p.x;
        const dym = mouse.y - p.y;
        const dm = Math.hypot(dxm, dym);
        if (dm < mouseRadius && dm > 0) {
          const f = ((mouseRadius - dm) / mouseRadius) * 0.035;
          p.vx += (dxm / dm) * f;
          p.vy += (dym / dm) * f;
        }

        p.vx += (Math.random() - 0.5) * 0.006;
        p.vy += (Math.random() - 0.5) * 0.006;
        p.vx *= 0.99;
        p.vy *= 0.99;
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < -20) p.x = width + 20;
        if (p.x > width + 20) p.x = -20;
        if (p.y < -20) p.y = height + 20;
        if (p.y > height + 20) p.y = -20;

        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(${rgb},0.55)`;
        ctx!.fill();
      }

      // Verbindungslinien
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i];
          const b = particles[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d >= connectDist) continue;

          let opacity = (1 - d / connectDist) * 0.22;
          const midX = (a.x + b.x) / 2;
          const midY = (a.y + b.y) / 2;
          const dMouse = Math.hypot(mouse.x - midX, mouse.y - midY);
          if (dMouse < mouseRadius) {
            opacity *= 1 + (1 - dMouse / mouseRadius) * 1.8;
          }
          ctx!.beginPath();
          ctx!.moveTo(a.x, a.y);
          ctx!.lineTo(b.x, b.y);
          ctx!.strokeStyle = `rgba(${rgb},${Math.min(opacity, 0.4)})`;
          ctx!.lineWidth = 1;
          ctx!.stroke();
        }
      }

      raf = requestAnimationFrame(frame);
    }

    function onMove(event: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      mouse.x = event.clientX - rect.left;
      mouse.y = event.clientY - rect.top;
    }
    function onLeave() {
      mouse.x = -9999;
      mouse.y = -9999;
    }
    function onVisibility() {
      running = document.visibilityState === "visible";
      if (running) {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(frame);
      }
    }

    resize();
    raf = requestAnimationFrame(frame);

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(parent);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <div className={className} aria-hidden="true">
      {/* statisches Gitternetz, radial ausgeblendet */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(var(--backdrop-line) 1px, transparent 1px), linear-gradient(90deg, var(--backdrop-line) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage:
            "radial-gradient(ellipse 62% 58% at 50% 45%, black 0%, transparent 78%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 62% 58% at 50% 45%, black 0%, transparent 78%)",
        }}
      />
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  );
}
