import type { Role } from "@/lib/rbac";
import type { Pruefbereich } from "@/lib/pruefung/rollen";
import { FRISTEN, type BefundStatus, type Bericht, type Frist, type Schwere } from "@/lib/pruefung/typen";

// Die Checkliste zum Prüfbericht: aus jedem Verstoß und jeder Lücke die Maßnahmen, aus jedem Hinweis ein Prüfauftrag,
// geordnet nach Frist und Schwere. Sie ist ein Arbeitsmittel NEBEN dem Bericht: der Bericht bleibt unverändert und versiegelt,
// die Checkliste wird abgehakt. Rein aus dem Bericht abgeleitet (kein Modell), damit sie sofort da ist und jeder Punkt auf einen
// Befund und dessen Rechtsgrundlage zurückführt.

export interface ChecklistenPunkt {
  id: string;
  befundId: string;
  titel: string;
  /** Der Schritt; leer bei einem Prüfauftrag (die Oberfläche setzt dann ihren Standardtext ein). */
  schritt: string;
  art: "massnahme" | "pruefen";
  verantwortlich: Role;
  frist: Frist;
  schwere: Schwere;
  status: BefundStatus;
  /** Fundstellen der Rechtsgrundlage, im Klartext. */
  grundlage: string[];
}

const REIHE_SCHWERE: Record<Schwere, number> = { kritisch: 0, hoch: 1, mittel: 2, niedrig: 3, keine: 4 };
const VERANTWORTLICH: Record<Pruefbereich, Role> = { audit: "buchhaltung", steuer: "buchhaltung", recht: "betriebsleitung", risiko: "betriebsleitung" };

export function checklisteAus(b: Bericht): ChecklistenPunkt[] {
  const fundstelle = new Map(b.belege.map((q) => [q.id, q.fundstelle]));
  const punkte: ChecklistenPunkt[] = [];
  for (const f of b.befunde) {
    const grundlage = f.belege.map((id) => fundstelle.get(id)).filter((x): x is string => !!x);
    if (f.massnahmen.length > 0) {
      f.massnahmen.forEach((m, i) =>
        punkte.push({ id: `${f.id}:${i}`, befundId: f.id, titel: f.titel, schritt: m.schritt, art: "massnahme", verantwortlich: m.verantwortlich, frist: m.frist, schwere: f.schwere, status: f.status, grundlage }),
      );
    } else if (f.status === "hinweis" || f.status === "verstoss" || f.status === "luecke") {
      // Ein Hinweis ist nicht beurteilbar (keine Daten oder kein Rechtsbeleg): der nächste Schritt ist, ihn beurteilbar zu machen.
      punkte.push({ id: `${f.id}:pruefen`, befundId: f.id, titel: f.titel, schritt: "", art: "pruefen", verantwortlich: VERANTWORTLICH[f.bereich], frist: "30 Tage", schwere: f.schwere, status: f.status, grundlage });
    }
  }
  const fristReihe = (f: Frist) => FRISTEN.indexOf(f);
  return punkte.sort((a, c) => fristReihe(a.frist) - fristReihe(c.frist) || REIHE_SCHWERE[a.schwere] - REIHE_SCHWERE[c.schwere] || a.id.localeCompare(c.id));
}

/** Fortschritt in ganzen Prozent; ohne Punkte gilt die Checkliste als erledigt. */
export function fortschritt(punkte: readonly ChecklistenPunkt[], erledigt: ReadonlySet<string>): { erledigt: number; gesamt: number; prozent: number } {
  const geschafft = punkte.filter((p) => erledigt.has(p.id)).length;
  return { erledigt: geschafft, gesamt: punkte.length, prozent: punkte.length === 0 ? 100 : Math.round((geschafft / punkte.length) * 100) };
}
