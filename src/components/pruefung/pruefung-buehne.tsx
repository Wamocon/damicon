"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ClipboardCheck, Landmark, Scale, ShieldAlert, type LucideIcon } from "lucide-react";
import { Himbi } from "@/components/haustier/himbi";
import "@/components/haustier/haustier.css";
import type { AgentStand, PruefungStand } from "@/components/pruefung/use-pruefung";
import type { HaustierZustand } from "@/lib/haustier";
import type { Pruefbereich } from "@/lib/pruefung/rollen";
import { cn } from "@/lib/utils";

// Die Buehne: Himbi in der Mitte, je Bereich ein Mini-Himbi, der aus der Mitte "geschickt" wird,
// arbeitet, seine Befunde zurueckmeldet und danach verschwindet. Alles, was sich bewegt, ist
// transform oder opacity (pruefung.css). Auf schmalen Flaechen (Container < 620 px) gibt es keine
// Kreisanordnung, die Mini-Himbis stehen dann in einer Liste.

export const BEREICH_SYMBOL: Record<Pruefbereich, LucideIcon> = { audit: ClipboardCheck, steuer: Landmark, recht: Scale, risiko: ShieldAlert };

// Anordnung als Anteil von Breite und Hoehe der Buehne; Himbi selbst steht in der Mitte.
const ORTE: Record<number, Array<[number, number]>> = {
  1: [[0.2, 0.5]],
  2: [[0.17, 0.5], [0.83, 0.5]],
  3: [[0.17, 0.27], [0.83, 0.27], [0.5, 0.83]],
  4: [[0.16, 0.25], [0.84, 0.25], [0.16, 0.77], [0.84, 0.77]],
};

const ZUSTAND: Record<AgentStand["phase"], HaustierZustand> = { wartet: "schlaeft", spawn: "denkt", sammelt: "denkt", denkt: "denkt", fertig: "fertig", fehler: "traurig" };
const FUNKEN = Array.from({ length: 10 }, (_, i) => i * 36);

function Funken() {
  return (
    <span className="pr-funken" aria-hidden>
      {FUNKEN.map((w) => (
        <i key={w} style={{ ["--w" as string]: `${w}deg` }} />
      ))}
    </span>
  );
}

export function PruefungBuehne({ stand, klein = false }: { stand: PruefungStand; klein?: boolean }) {
  const t = useTranslations("pruefung");
  const box = useRef<HTMLDivElement>(null);
  const [masse, setMasse] = useState({ w: 900, h: 430 });
  const [weg, setWeg] = useState<ReadonlySet<Pruefbereich>>(new Set());
  const [fluege, setFluege] = useState<Array<{ bereich: Pruefbereich; n: number }>>([]);
  const timer = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setMasse({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fertige Mini-Himbis: kurz feiern, dann aufloesen, ihre Befunde fliegen zu Himbi in die Mitte.
  useEffect(() => {
    for (const b of stand.reihenfolge) {
      const a = stand.agenten[b];
      if (a?.phase !== "fertig" || timer.current.has(b)) continue;
      const n = a.befunde;
      timer.current.set(
        b,
        setTimeout(() => {
          setWeg((v) => new Set(v).add(b));
          setFluege((f) => [...f, { bereich: b, n }]);
          setTimeout(() => setFluege((f) => f.filter((x) => x.bereich !== b)), 1100);
        }, 2600),
      );
    }
  }, [stand.agenten, stand.reihenfolge]);
  useEffect(() => {
    const laufend = timer.current;
    return () => laufend.forEach((x) => clearTimeout(x));
  }, []);

  const n = stand.reihenfolge.length;
  const orte = ORTE[Math.min(Math.max(n, 1), 4)] ?? ORTE[4]!;
  const mitteX = masse.w / 2;
  const mitteY = masse.h / 2;
  const fertig = stand.reihenfolge.filter((b) => stand.agenten[b]?.phase === "fertig" || stand.agenten[b]?.phase === "fehler").length;
  const fertigGanz = stand.phase === "fertig";

  let mitteText = t("phase.plant");
  if (stand.phase === "fehler") mitteText = t("phase.fehler");
  else if (fertigGanz) mitteText = t("phase.fertig");
  else if (stand.synthese === "laeuft") mitteText = t("phase.synthese");
  else if (n > 0) mitteText = t("phase.arbeit", { fertig, gesamt: n });
  const mitteZustand: HaustierZustand = stand.phase === "fehler" ? "traurig" : fertigGanz ? "fertig" : "denkt";

  return (
    <div ref={box} className={cn("pr-buehne", klein && "pr-buehne--klein")} data-phase={stand.phase} data-synthese={stand.synthese}>
      <div className="pr-mitte">
        <div className="pr-mitte__himbi">
          <span className="pr-glut" aria-hidden />
          <span className="pr-orbit" aria-hidden />
          <Himbi zustand={mitteZustand} groesse={klein ? 78 : 104} />
        </div>
        <p className="pr-mitte__text" aria-live="polite">
          {mitteText}
        </p>
        <span className="pr-mitte__zahl" key={stand.befunde.length} data-stoss={stand.befunde.length > 0 ? "" : undefined}>
          {stand.befunde.length}
          <span className="sr-only"> {t("zaehler.befunde")}</span>
        </span>
      </div>

      {!klein &&
        stand.reihenfolge.map((bereich, i) => {
          const a = stand.agenten[bereich];
          if (!a) return null;
          const [fx, fy] = orte[i] ?? [0.5, 0.5];
          const x = fx * masse.w;
          const y = fy * masse.h;
          const dx = x - mitteX;
          const dy = y - mitteY;
          const laenge = Math.hypot(dx, dy);
          const winkel = (Math.atan2(dy, dx) * 180) / Math.PI;
          const istWeg = weg.has(bereich);
          const aktiv = a.phase === "spawn" || a.phase === "sammelt" || a.phase === "denkt" || a.phase === "fertig" || a.phase === "fehler";
          const Symbol = BEREICH_SYMBOL[bereich];
          const felder = a.reihenfolge.map((id) => a.felder[id]!);
          const daten = felder.reduce((s, f) => s + (f.daten ?? 0), 0);
          const quellen = felder.reduce((s, f) => s + (f.quellen ?? 0), 0);
          const letzteStelle = [...felder].reverse().find((f) => f.stelle)?.stelle;
          const offen = felder.find((f) => !f.bewertet);
          let status = t(`agent.${a.phase}`);
          if (a.phase === "sammelt" && letzteStelle) status = t("agent.fand", { stelle: letzteStelle });
          if (a.phase === "denkt" && offen) status = t("agent.bewertet", { feld: offen.titel });
          return (
            <div key={bereich} data-bereich={bereich}>
              <div
                className="pr-strahl"
                data-an={istWeg ? "weg" : aktiv ? "ja" : "nein"}
                data-fluss={a.phase === "sammelt" || a.phase === "denkt" ? "ja" : "nein"}
                style={{ left: mitteX, top: mitteY, width: laenge, ["--winkel" as string]: `${winkel}deg`, ["--laenge" as string]: `${laenge}px`, ["--dauer" as string]: `${1.3 + i * 0.25}s` }}
                aria-hidden
              />
              <div
                className="pr-agent"
                data-phase={a.phase}
                data-weg={istWeg ? "ja" : "nein"}
                style={{ ["--x" as string]: `${x}px`, ["--y" as string]: `${y}px` }}
              >
                <div className="pr-agent__himbi">
                  <Himbi zustand={ZUSTAND[a.phase]} groesse={54} />
                  <span className="pr-agent__marke">
                    <Symbol className="h-3 w-3" />
                  </span>
                  {a.phase === "fertig" ? <Funken /> : null}
                </div>
                <div className="pr-agent__name">{t(`agent.name.${bereich}`)}</div>
                <div className="pr-agent__status" key={`${a.phase}-${status}`}>
                  {status}
                </div>
                <div className="pr-agent__zaehler">
                  <span>{t("zaehler.daten")} {daten}</span>
                  <span>{t("zaehler.quellen")} {quellen}</span>
                  <span>{t("zaehler.befunde")} {a.befunde}</span>
                </div>
                <div className="pr-agent__punkte" aria-hidden>
                  {felder.map((f, k) => (
                    <span key={k} className="pr-agent__punkt" data-stufe={f.bewertet ? "fertig" : f.daten !== null && f.quellen !== null ? "daten" : "offen"} />
                  ))}
                </div>
              </div>
            </div>
          );
        })}

      {!klein &&
        fluege.map((f) => {
          const i = stand.reihenfolge.indexOf(f.bereich);
          const [fx, fy] = orte[i] ?? [0.5, 0.5];
          const x = fx * masse.w;
          const y = fy * masse.h;
          return (
            <span
              key={f.bereich}
              className="pr-flug"
              data-bereich={f.bereich}
              style={{ ["--x" as string]: `${x}px`, ["--y" as string]: `${y}px`, ["--tx" as string]: `${mitteX - x}px`, ["--ty" as string]: `${mitteY - y}px` }}
            >
              +{f.n}
            </span>
          );
        })}
    </div>
  );
}
