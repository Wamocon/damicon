import type { ReactNode } from "react";

// Kopf eines Website-Abschnitts: Überzeile, Überschrift und Einleitung. Vorher stand dieselbe Auszeichnung elfmal in acht Dateien
// (WMC-Cleanup 13.10.2026). Ohne eigene Hülle, damit der Kopf in einem Reveal oder direkt im Container stehen kann wie bisher.
export function AbschnittKopf({ ueberzeile, titel, einleitung }: { ueberzeile: ReactNode; titel: ReactNode; einleitung: ReactNode }) {
  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.14em] text-primary">{ueberzeile}</p>
      <h2 className="mt-2 max-w-2xl text-3xl font-black text-foreground md:text-4xl">{titel}</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{einleitung}</p>
    </>
  );
}
