// Generische, schemagetriebene Lesewerkzeuge des KI-Agenten. Zwei Werkzeuge
// decken JEDE Tabelle ab - auch solche, die es beim Schreiben dieses Codes
// noch nicht gab (siehe datenmodell.ts fuer Entdeckung und Sicherheitsmodell).
//
// Das Modell formuliert nie SQL: es waehlt eine Tabelle, Spalten, Filter aus
// einer festen Operatorenliste und eine Sortierung - alles wird gegen das
// entdeckte Schema geprueft, bevor eine Abfrage mit der Sitzung des Nutzers
// (also unter RLS) ausgefuehrt wird.

import type { SupabaseClient } from "@supabase/supabase-js";
import { tool } from "ai";
import { z } from "zod";
import { ohneUmlaute } from "@/lib/text/umlaute";
import { createClient } from "@/lib/supabase/server";
import { hasPermission, type Role } from "@/lib/rbac";
import {
  FILTER_OPERATOREN,
  kuerzeWert,
  ladeDatenmodell,
  type TabellenInfo,
} from "@/lib/ai/datenmodell";
import { modulFuerTabelle, zielFuerTabelle } from "@/lib/ai/ziele";

const MAX_ZEILEN = 50;
const STANDARD_ZEILEN = 20;

function spaltenZeile(t: TabellenInfo): string[] {
  return t.spalten.map((s) => `${s.name}:${s.typ}${s.verweistAuf ? ` -> ${s.verweistAuf}` : ""}`);
}

// Rollenvorschau eines Administrators: seine Sitzung darf mehr sehen als die
// Rolle, die er gerade vorfuehrt. Damit die Vorschau ehrlich ist, gilt dort
// zusaetzlich die App-Berechtigung des Moduls hinter der Tabelle - eine Tabelle
// ohne Modul ist in der Vorschau gesperrt. Im Normalbetrieb entscheidet allein
// RLS (siehe datenmodell.ts), damit neue Tabellen ohne Pflege abfragbar sind.
function tabelleErlaubt(name: string, rolle: Role | null | undefined, vorschau: boolean): boolean {
  if (!vorschau) return true;
  const modul = modulFuerTabelle(name);
  return modul ? hasPermission(rolle, modul.resource, "view") : false;
}

export function baueDatenWerkzeuge(rolle: Role | null | undefined, vorschau = false) {
  const datenmodellErkunden = tool({
    description:
      "Erkundet das Datenmodell der Anwendung. Ohne Suchbegriff: alle abfragbaren Tabellen mit Kurzbeschreibung. Mit Suchbegriff: passende Tabellen mit allen Spalten (Name:Typ, Fremdschlüssel als '-> tabelle.spalte'). Rufe das auf, BEVOR du datenLesen für eine Tabelle nutzt, deren Spalten du nicht sicher kennst. Enthält nur Tabellen, keine Zeilen - was eine Rolle davon sehen darf, entscheidet erst datenLesen.",
    inputSchema: z.object({
      suchbegriff: z.string().max(60).optional().describe("Stichwort, z. B. 'kühl', 'lohn', 'kunde'"),
    }),
    execute: async ({ suchbegriff }) => {
      const modell = await ladeDatenmodell();
      const alle = [...modell.values()].filter((t) => tabelleErlaubt(t.name, rolle, vorschau));
      if (!suchbegriff?.trim()) {
        return { anzahl: alle.length, tabellen: alle.map((t) => ({ name: t.name, beschreibung: t.beschreibung })) };
      }
      // Tabellen und Spalten sind ASCII (pfluecker, kuehlketten_messungen): 'Pflücker' und 'kühl' muessen trotzdem treffen.
      const original = suchbegriff.trim().toLowerCase();
      const s = ohneUmlaute(original);
      const treffer = alle
        .filter(
          (t) =>
            t.name.includes(s) ||
            t.beschreibung.toLowerCase().includes(original) ||
            ohneUmlaute(t.beschreibung.toLowerCase()).includes(s) ||
            t.spalten.some((c) => c.name.includes(s)),
        )
        .slice(0, 8);
      return {
        anzahl: treffer.length,
        tabellen: treffer.map((t) => ({ name: t.name, beschreibung: t.beschreibung, spalten: spaltenZeile(t) })),
      };
    },
  });

  const datenLesen = tool({
    description: `Liest Zeilen aus einer Tabelle der Anwendung - mit den Rechten des angemeldeten Nutzers (Zeilen, die seine Rolle nicht sehen darf, kommen nie zurück; eine leere Antwort kann also auch 'nicht freigegeben' bedeuten). Filter sind UND-verknuepft. Maximal ${MAX_ZEILEN} Zeilen; 'anzahlGesamt' nennt die Gesamtzahl. Für Summen oder Vergleiche lies die Zeilen und rechne selbst. Fremdschlüssel löst du mit einer zweiten Abfrage auf.`,
    inputSchema: z.object({
      tabelle: z.string().max(80),
      spalten: z.array(z.string().max(80)).max(20).optional().describe("Nur diese Spalten; ohne Angabe alle"),
      filter: z
        .array(
          z.object({
            spalte: z.string().max(80),
            operator: z.enum(FILTER_OPERATOREN),
            wert: z.union([z.string().max(200), z.number(), z.boolean()]).optional(),
          }),
        )
        .max(6)
        .optional(),
      sortierung: z.object({ spalte: z.string().max(80), absteigend: z.boolean().optional() }).optional(),
      limit: z.number().int().min(1).max(MAX_ZEILEN).optional(),
    }),
    execute: async ({ tabelle: tabelleRoh, spalten: spaltenRoh, filter: filterRoh, sortierung: sortierungRoh, limit }) => {
      // Namen sind ASCII; wer sie mit Umlaut schreibt, meint dieselbe Tabelle.
      const tabelle = ohneUmlaute(tabelleRoh);
      const spalten = spaltenRoh?.map(ohneUmlaute);
      const filter = filterRoh?.map((f) => ({ ...f, spalte: ohneUmlaute(f.spalte) }));
      const sortierung = sortierungRoh ? { ...sortierungRoh, spalte: ohneUmlaute(sortierungRoh.spalte) } : undefined;
      const modell = await ladeDatenmodell();
      const info = modell.get(tabelle);
      if (!info || !tabelleErlaubt(tabelle, rolle, vorschau)) {
        return { fehler: `Tabelle '${tabelle}' ist nicht abfragbar. Nutze datenmodellErkunden, um gültige Tabellen zu finden.` };
      }
      const erlaubt = new Set(info.spalten.map((s) => s.name));
      const unbekannt = [
        ...(spalten ?? []),
        ...(filter ?? []).map((f) => f.spalte),
        ...(sortierung ? [sortierung.spalte] : []),
      ].filter((s) => !erlaubt.has(s));
      if (unbekannt.length > 0) {
        return { fehler: `Unbekannte Spalte(n): ${unbekannt.join(", ")}. Gültig: ${[...erlaubt].join(", ")}` };
      }

      const client = (await createClient()) as unknown as SupabaseClient;
      const auswahl = (spalten?.length ? spalten : [...erlaubt]).join(",");
      let abfrage = client.from(tabelle).select(auswahl, { count: "exact" });

      for (const f of filter ?? []) {
        if (f.operator === "istLeer") {
          abfrage = abfrage.is(f.spalte, null);
        } else if (f.operator === "istNichtLeer") {
          abfrage = abfrage.not(f.spalte, "is", null);
        } else {
          if (f.wert === undefined) return { fehler: `Filter '${f.operator}' auf '${f.spalte}' braucht einen Wert.` };
          switch (f.operator) {
            case "gleich": abfrage = abfrage.eq(f.spalte, f.wert); break;
            case "ungleich": abfrage = abfrage.neq(f.spalte, f.wert); break;
            case "groesser": abfrage = abfrage.gt(f.spalte, f.wert); break;
            case "groesserGleich": abfrage = abfrage.gte(f.spalte, f.wert); break;
            case "kleiner": abfrage = abfrage.lt(f.spalte, f.wert); break;
            case "kleinerGleich": abfrage = abfrage.lte(f.spalte, f.wert); break;
            case "enthaelt": abfrage = abfrage.ilike(f.spalte, `%${String(f.wert).replace(/[%_]/g, "")}%`); break;
          }
        }
      }
      if (sortierung) abfrage = abfrage.order(sortierung.spalte, { ascending: !sortierung.absteigend });

      const { data, error, count } = await abfrage.limit(limit ?? STANDARD_ZEILEN);
      if (error) {
        console.error("[damicon] Agent-Abfrage fehlgeschlagen:", tabelle, error.message);
        return { fehler: "Die Abfrage ist fehlgeschlagen (Typ oder Wert passt nicht zur Spalte)." };
      }

      const zeilen = ((data ?? []) as unknown as Record<string, unknown>[]).map((zeile) =>
        Object.fromEntries(Object.entries(zeile).map(([k, v]) => [k, kuerzeWert(v)])),
      );
      return {
        tabelle,
        anzahlGesamt: count ?? zeilen.length,
        angezeigt: zeilen.length,
        zeilen,
        ziel: zielFuerTabelle(tabelle, rolle),
      };
    },
  });

  return { datenmodellErkunden, datenLesen };
}
