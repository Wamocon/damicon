import { tool } from "ai";
import { z } from "zod";
import type { Role } from "@/lib/rbac";
import { darfWissenNutzen, sucheWissen, wissenVerfuegbar } from "@/lib/wissen/suche";

// Schicht 5 der Werkzeuge: die Wissensbasis fuer Recht, Steuer, Compliance und Audit.
// Wie alle Werkzeuge wird es nur angeboten, wenn die Rolle es nutzen darf UND es
// einen Index gibt (Sicherheit durch Abwesenheit). Die Rolle wird zusaetzlich als
// Filter in die Suche geschrieben (lib/wissen/suche.ts) - das Modell kann sie
// nicht angeben und nicht aendern.
//
// Das Werkzeug liefert Belege mit Kennung (S1, S2 ...), Fundstelle, Link, Stand
// und Autoritaetsstufe. Der Systemprompt (QUELLEN_ANWEISUNG in api/ki-assistent)
// verlangt, jede rechtliche Aussage mit dieser Kennung zu belegen.

const MAX_TEXT = 1500;

export function baueWissenWerkzeug(rolle: Role | null | undefined, belegStart = 1) {
  if (!rolle || !wissenVerfuegbar() || !darfWissenNutzen(rolle)) return null;
  // Fortlaufende Kennungen ueber alle Aufrufe dieser Antwort: ein zweiter Aufruf
  // beginnt nicht wieder bei S1, sonst waeren zwei Quellen nicht zu unterscheiden.
  let naechste = belegStart;
  return tool({
    description:
      "Durchsucht die Wissensbasis fuer Recht, Steuer (Steuerkodex 2026), Arbeitsrecht, Compliance und Audit (Kasachstan) und liefert die passenden Textstellen mit Beleg. " +
      "Nutze es bei JEDER Frage zu Gesetzen, Pflichten, Fristen, Sanktionen, Steuersaetzen, Pruefungen oder Nachweisen - auch wenn du die Antwort zu kennen glaubst, denn 2026 gilt ein neuer Steuerkodex und Trainingswissen ist veraltet. " +
      "Die Rechtstexte liegen auf Russisch und Kasachisch vor. Gib deshalb IMMER zusaetzlich 'frageRussisch' an: dieselbe Frage sinngemaess auf Russisch mit den juristischen Fachbegriffen und, falls du sie kennst, Artikelnummern (z. B. 'порог постановки на учет по НДС ст. 82 НК РК'). Ohne sie findet die Stichwortsuche in den russischen Texten nichts. " +
      "Jeder Treffer hat eine Kennung (S1, S2 ...), Fundstelle, Autoritaetsstufe (1 Primaerrecht, 2 untergesetzlich, 3 amtliche Erlaeuterung, 4 Fachquelle, 5 Presse), Stand und Link.",
    inputSchema: z.object({
      frage: z.string().min(3).max(500).describe("Die Frage in der Sprache des Nutzers, moeglichst praezise und vollstaendig."),
      frageRussisch: z.string().max(500).optional().describe("Dieselbe Frage auf Russisch mit juristischen Fachbegriffen und Artikelnummern."),
      auchUeberholte: z.boolean().optional().describe("Nur auf true setzen, wenn ausdruecklich nach frueherem Recht gefragt wird."),
    }),
    execute: async ({ frage, frageRussisch, auchUeberholte }) => {
      try {
        const r = await sucheWissen({ frage, frageRussisch }, rolle, { nurAktuell: !auchUeberholte });
        return {
          anzahl: r.belege.length,
          dauerMs: r.dauerMs.gesamt,
          belege: r.belege.map((b) => ({ ...b, id: `S${naechste++}`, text: b.text.slice(0, MAX_TEXT) })),
          hinweis:
            r.belege.length === 0
              ? "Keine passende Stelle in der Wissensbasis gefunden. Sage das offen und kennzeichne alles Weitere als Allgemeinwissen."
              : "Belege mit ihrer Kennung zitieren, zum Beispiel [S1]. Stufe 4 und 5 sind keine Rechtsquellen, sondern Auskuenfte Dritter: als solche kennzeichnen.",
        };
      } catch {
        return {
          anzahl: 0,
          belege: [],
          fehler: "wissensbasis-nicht-erreichbar",
          hinweis: "Die Wissensbasis ist gerade nicht erreichbar. Sage das offen, antworte nur mit Allgemeinwissen und kennzeichne es so.",
        };
      }
    },
  });
}
