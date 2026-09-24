// Werkzeuge, mit denen der Agent die OBERFLAECHE lesen und bedienen kann - wie
// ein Mensch vor dem Bildschirm. Sie haben bewusst KEIN execute: der Server
// kennt nur das Schema, die Ausfuehrung passiert im Browser des Nutzers
// (ki/ui-steuerung.ts, per onToolCall des AI SDK), weil nur dort die aktuelle
// Seite existiert. Das Ergebnis geht als Werkzeugausgabe zurueck an das Modell.
//
// Sicherheit (alles im Client, ui-steuerung.ts):
//   * Bedient wird nur der Inhaltsbereich der Anwendung, nie das KI-Panel selbst.
//   * Abmelden, Passwortfelder und Ziele ausserhalb der Anwendung sind gesperrt.
//   * Alles, was etwas absendet, aendert oder loescht, wird dem Nutzer vorher zur
//     Bestaetigung vorgelegt - der Agent kann nichts still ausloesen.
//   * Der Agent handelt mit den Rechten des Nutzers: was dessen Rolle in der
//     Oberflaeche nicht sieht, kann er auch nicht anklicken.

import { tool } from "ai";
import { z } from "zod";

const ref = z
  .string()
  .regex(/^e\d{1,3}$/, "Format e12")
  .describe("Referenz aus der Elementliste der letzten seiteLesen-Antwort, z. B. 'e12'");
const absicht = z
  .string()
  .min(2)
  .max(80)
  .describe("Kurz, in der Sprache des Nutzers: was du damit erreichen willst (wird ihm angezeigt)");

const seiteLesen = tool({
  description:
    "Liest die Seite, die der Nutzer gerade sieht: Adresse, Überschriften, sichtbarer Text (inklusive Tabelleninhalt) und eine Liste bedienbarer Elemente (Schaltflächen, Links, Eingabefelder, Auswahlen) mit je einer Referenz ('ref'). Nutze es, um Fragen zu beantworten, was auf dem Bildschirm steht ('was zeigt diese Tabelle', 'erkläre diese Seite'), und IMMER vor klicke, fuelleFeld oder zeigeAuf. Nach jeder Aktion, die die Seite verändert (Klick, Navigation), sind die Referenzen veraltet - lies die Seite dann erneut. Hat die Seite sehr viele Elemente, grenze mit 'fokus' ein.",
  inputSchema: z.object({
    fokus: z
      .string()
      .max(80)
      .optional()
      .describe("Optional: Stichwort; die Elementliste enthält dann nur passende Elemente"),
  }),
});

const klicke = tool({
  description:
    "Klickt ein Element der aktuellen Seite an (Schaltfläche, Link, Reiter, Aufklappbereich, Kontrollkasten). Ein Mauszeiger fährt sichtbar hin. Was etwas absendet, ändert oder loescht, legt die Anwendung dem Nutzer vor dem Klick zur Bestätigung vor - du bekommst dann 'abgelehnt' zurück, wenn er nein sagt. Abmelden ist gesperrt. Lies danach die Seite erneut.",
  inputSchema: z.object({ ref, absicht }),
});

const fuelleFeld = tool({
  description:
    "Trägt einen Wert in ein Eingabefeld ein oder wählt eine Option (Textfeld, Zahl, Datum, Auswahlliste; bei Kontrollkästen 'true' oder 'false'). Bei Auswahllisten den sichtbaren Text oder den Wert der Option angeben. Schickt NICHTS ab - dafür gibt es klicke auf die Schaltfläche. Passwortfelder sind gesperrt.",
  inputSchema: z.object({ ref, wert: z.string().max(500), absicht }),
});

const scrolleZu = tool({
  description:
    "Scrollt die Seite: entweder zu einem Element (ref) oder in eine Richtung ('oben', 'unten', 'weiter' = eine Bildschirmhöhe nach unten). Ohne Nebenwirkung.",
  inputSchema: z.object({
    ref: ref.optional(),
    richtung: z.enum(["oben", "unten", "weiter"]).optional(),
  }),
});

const zeigeAuf = tool({
  description:
    "Zeigt dem Nutzer ein Element: der Mauszeiger fährt hin und das Element wird hervorgehoben. Ohne Klick, ohne Nebenwirkung. Nutze es, um bei einer Erklärung auf eine Stelle der Seite zu deuten.",
  inputSchema: z.object({ ref, absicht }),
});

type SteuerWerkzeuge = {
  klicke: typeof klicke;
  fuelleFeld: typeof fuelleFeld;
  scrolleZu: typeof scrolleZu;
  zeigeAuf: typeof zeigeAuf;
};

/** 'lesen' = nur seiteLesen (Assistent-Modus), 'steuern' = alles (Agent-Modus),
 *  'zeigen' = lesen, scrollen und hervorheben, aber nichts anklicken oder ausfuellen
 *  (Sprachmodus: ohne sichtbaren Chat gibt es keine Stelle fuer eine Freigabe). */
export function baueUiWerkzeuge(stufe: "lesen" | "steuern" | "zeigen"): { seiteLesen: typeof seiteLesen } & Partial<SteuerWerkzeuge> {
  if (stufe === "steuern") return { seiteLesen, klicke, fuelleFeld, scrolleZu, zeigeAuf };
  if (stufe === "zeigen") return { seiteLesen, scrolleZu, zeigeAuf };
  return { seiteLesen };
}
