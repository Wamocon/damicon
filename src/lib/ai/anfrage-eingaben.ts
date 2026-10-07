// Eingaben einer Chat-Anfrage aus dem Browser (api/ki-assistent/route.ts):
// Verlauf, Pfad und die Referenzen, auf die das Modell zeigen darf. Alles hier
// ist Eingabe des Nutzers und wird geprueft, bevor es den Prompt erreicht.
//
// Seit dem 28.09.2026 (Vibecode-Cleanup, Fund 44) als reine Funktionen in
// einem eigenen Modul: vorher standen sie nicht exportiert in route.ts, und
// die Tests pinnten nur ihren Quelltext. Jetzt pruefen sie das Verhalten mit
// echten Eingaben (supabase/tests/chat-eingaben.ts).
import type { UIMessage } from "ai";
import { z } from "zod";

/** Der Client schickt den ganzen Verlauf mit: begrenzt, damit ein manipulierter
 *  Aufruf keine unbegrenzte Tokenrechnung erzeugt. */
export const MAX_NACHRICHTEN = 40;
export const MAX_VERLAUF_ZEICHEN = 160_000;

/** Teile je Nachricht: ein Agentenlauf mit 28 Schritten hat je Schritt einen
 *  step-start-, Text- und Werkzeugteil, also rund 90. Die Grenze liegt weit
 *  darueber und faengt nur Manipulation ab. */
export const MAX_TEILE_JE_NACHRICHT = 400;

// Schema des Verlaufs (seit 28.09.2026, Fund 84). Vorher pruefte die Route nur
// Rolle und "parts ist ein Array": ein Teil null erreichte schnappschuesseKuerzen
// und warf dort einen TypeError, also eine unbehandelte 500 nach bereits
// gezaehltem Ratenlimit. Geprueft wird, worauf sich der Server verlaesst (Rolle,
// Teile mit Typ, Text als Zeichenkette). Alles Uebrige (Werkzeugteile samt
// Ein- und Ausgabe, Metadaten) reicht das Schema unveraendert durch; es wird
// danach nur gekuerzt oder vom SDK in Modellnachrichten umgewandelt.
// Dateiteile schickt die Anwendung nie; ein "file" ohne url warf in convertToModelMessages
// "Invalid URL", also eine 500 (Gegenpruefung vom 29.09.2026).
const teilSchema = z
  .looseObject({ type: z.string().min(1).max(100), text: z.unknown().optional() })
  .refine((teil) => teil.type !== "text" || typeof teil.text === "string", { message: "text ohne Zeichenkette" })
  .refine((teil) => teil.type !== "file", { message: "Dateiteil" });
const nachrichtSchema = z.looseObject({
  id: z.string().max(200),
  role: z.enum(["user", "assistant", "system"]),
  parts: z.array(teilSchema).max(MAX_TEILE_JE_NACHRICHT),
});

/** Der Verlauf aus dem Browser, schematisch geprueft. Nur Nutzer- und
 *  Assistentennachrichten gehen weiter: eine eingeschmuggelte 'system'-Nachricht
 *  wuerde sonst wie eine Anweisung des Betreibers behandelt. null heisst:
 *  ungueltige Eingabe (400).
 *
 *  Geprueft werden nur die letzten MAX_NACHRICHTEN: der Browser schickt den
 *  ganzen Verlauf der Sitzung, verwendet werden ohnehin nur diese. */
export function verlaufAusAnfrage(roh: unknown): UIMessage[] | null {
  if (!Array.isArray(roh)) return null;
  const geprueft = z.array(nachrichtSchema).safeParse(roh.slice(-MAX_NACHRICHTEN));
  if (!geprueft.success) return null;
  return geprueft.data.filter((n) => n.role !== "system") as unknown as UIMessage[];
}

/** Nur ein Pfad innerhalb der Anwendung, ohne Sprachpraefix - als Kontext fuer
 *  den Prompt, nie als Adresse, die irgendwohin aufgeloest wird. */
export function bereinigterPfad(roh: unknown): string | null {
  if (typeof roh !== "string") return null;
  const pfad = roh.split(/[?#]/)[0]?.replace(/^\/(de|en|ru|kk|tr)(?=\/)/, "") ?? "";
  return /^\/[a-z0-9/_-]{0,120}$/i.test(pfad) ? pfad : null;
}

/** Die Referenzen, die das Modell kennt: aus der Seitenkarte dieser Anfrage und
 *  aus der juengsten seiteLesen-Antwort. Eine Sprechmarke auf eine andere, erfundene
 *  Referenz wird verworfen, bevor sie einen falschen Rahmen setzt. */
export function bekannteReferenzen(nachrichten: UIMessage[], seitenkarte: string | null): Set<string> {
  const bekannt = new Set<string>();
  for (const treffer of (seitenkarte ?? "").matchAll(/^([ea]\d{1,5}) /gm)) bekannt.add(treffer[1]!);
  // Die Ausgabe von seiteLesen kommt aus dem Browser zurueck, ihr Inhalt ist
  // nicht geprueft (verlaufAusAnfrage prueft nur den Rahmen): Listen und
  // Eintraege deshalb erst ansehen, dann lesen.
  const liste = (wert: unknown): unknown[] => (Array.isArray(wert) ? wert : []);
  for (let i = nachrichten.length - 1; i >= 0; i--) {
    for (const teil of [...nachrichten[i]!.parts].reverse()) {
      const t = teil as unknown as { type: string; state?: string; output?: unknown };
      if (t.type !== "tool-seiteLesen" || t.state !== "output-available") continue;
      const ausgabe = typeof t.output === "object" && t.output !== null ? (t.output as { elemente?: unknown; abschnitte?: unknown }) : {};
      for (const e of [...liste(ausgabe.elemente), ...liste(ausgabe.abschnitte)]) {
        const ref = typeof e === "object" && e !== null ? (e as { ref?: unknown }).ref : undefined;
        if (typeof ref === "string") bekannt.add(ref);
      }
      return bekannt;
    }
  }
  return bekannt;
}

/** Aeltere Seitenstaende aus dem Verlauf loeschen: nur der juengste seiteLesen-
 *  Schnappschuss ist noch gueltig, die anderen wuerden nur Tokens kosten und das
 *  Modell mit veralteten Referenzen verwirren. */
export function schnappschuesseKuerzen(nachrichten: UIMessage[]): UIMessage[] {
  let gefunden = false;
  const kopie = nachrichten.map((n) => ({ ...n, parts: [...n.parts] }));
  for (let i = kopie.length - 1; i >= 0; i--) {
    const teile = kopie[i]!.parts;
    for (let j = teile.length - 1; j >= 0; j--) {
      const teil = teile[j] as unknown as { type: string; state?: string };
      if (teil.type !== "tool-seiteLesen" || teil.state !== "output-available") continue;
      if (gefunden) {
        teile[j] = { ...teil, output: { hinweis: "Aelterer Seitenstand, nicht mehr aktuell. Rufe seiteLesen erneut auf." } } as unknown as (typeof teile)[number];
      } else {
        gefunden = true;
      }
    }
  }
  return kopie;
}

// Alte Werkzeugausgaben (vor der letzten Nutzerfrage) auf einen Auszug kuerzen. Ein Agentenlauf sammelt
// schnell Seitenschnappschuesse und Datenabfragen an (je 20 bis 30 KB): nach etwa acht Seiten lag der
// Verlauf ueber der Grenze, und JEDE weitere Frage scheiterte mit 413 - im Chat als "KI nicht erreichbar",
// bis man die Seite neu lud. Die Antworttexte bleiben vollstaendig, sie fassen die Ergebnisse zusammen.
export const ALTE_AUSGABE_MAX_ZEICHEN = 1500;
export function alteAusgabenKuerzen(nachrichten: UIMessage[]): UIMessage[] {
  const letzterNutzer = nachrichten.map((n) => n.role).lastIndexOf("user");
  return nachrichten.map((n, i) => {
    if (i >= letzterNutzer || n.role !== "assistant") return n;
    const teile = n.parts.map((teil) => {
      const t = teil as unknown as { type: string; state?: string; output?: unknown };
      if (!t.type.startsWith("tool-") || t.state !== "output-available") return teil;
      const roh = JSON.stringify(t.output ?? null);
      if (roh.length <= ALTE_AUSGABE_MAX_ZEICHEN) return teil;
      return { ...t, output: { gekuerzt: true, auszug: roh.slice(0, ALTE_AUSGABE_MAX_ZEICHEN) } } as unknown as (typeof n.parts)[number];
    });
    return { ...n, parts: teile };
  });
}
