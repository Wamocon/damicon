import { generateText, tool, type LanguageModel } from "ai";
import { analysiereDokument, type Analyse } from "@/lib/wissen/analyse";
import { fuehreZusammen, KI_SYSTEM_ANWEISUNG, kiAuszug, KiAntwortSchema, parseKiAntwort, type KiAntwort } from "@/lib/wissen/analyse-ki";

// Der Modellaufruf der KI-Analyse (nur Server). Nutzt die Anbieterkette der Anwendung (ladeAnbieterKette): derselbe Anbieter und dieselben
// Ausweichanbieter wie der Assistent. Ohne Anbieter oder bei einem Fehler gilt allein die Heuristik; die Analyse bricht nie ab.

const ZEITLIMIT_MS = 25_000;

export interface AnalyseEingabe {
  /** Kennung der Datei in der Oberflaeche. */
  id: string;
  dateiname: string;
  /** Der Text oder ein Auszug daraus (kiAuszug kuerzt ihn). */
  text: string;
}

export interface AnalyseErgebnis {
  id: string;
  analyse: Analyse;
  /** Wurde ein Modell gefragt und hat es geantwortet? */
  ki: boolean;
}

/** Fragt das Modell nach der Einordnung eines Auszugs. null bei jedem Fehler. */
export async function frageModell(modell: LanguageModel, dateiname: string, auszug: string, signal?: AbortSignal): Promise<KiAntwort | null> {
  let antwort: unknown = null;
  try {
    await generateText({
      model: modell,
      system: KI_SYSTEM_ANWEISUNG,
      prompt: `Dateiname: ${dateiname.slice(0, 200)}\n\nAUSZUG:\n${auszug}`,
      toolChoice: { type: "tool", toolName: "einordnen" },
      tools: {
        einordnen: tool({
          description: "Liefert die Einordnung des Dokuments.",
          inputSchema: KiAntwortSchema,
          execute: async (eingabe) => {
            antwort = eingabe;
            return "ok";
          },
        }),
      },
      abortSignal: signal ?? AbortSignal.timeout(ZEITLIMIT_MS),
    });
  } catch (e) {
    console.warn("[damicon] KI-Analyse fehlgeschlagen:", e instanceof Error ? e.message : e);
    return null;
  }
  return parseKiAntwort(antwort);
}

/** Heuristik fuer alle, KI-Verfeinerung fuer jede, solange ein Modell da ist. Hoechstens `parallel` Anfragen gleichzeitig. */
export async function analysiereMitKi(eingaben: AnalyseEingabe[], modell: LanguageModel | null, parallel = 3): Promise<AnalyseErgebnis[]> {
  const ergebnisse: AnalyseErgebnis[] = new Array(eingaben.length);
  let naechster = 0;
  const lauf = async () => {
    for (;;) {
      const i = naechster++;
      if (i >= eingaben.length) return;
      const e = eingaben[i]!;
      const heuristik = analysiereDokument(e.text, e.dateiname);
      const ki = modell ? await frageModell(modell, e.dateiname, kiAuszug(e.text)) : null;
      ergebnisse[i] = { id: e.id, analyse: fuehreZusammen(heuristik, ki), ki: ki !== null };
    }
  };
  await Promise.all(Array.from({ length: Math.min(parallel, eingaben.length) }, lauf));
  return ergebnisse;
}

/** Nur die Modellantworten (ohne Heuristik), fuer die Server Action: Die Oberflaeche rechnet die Heuristik selbst und fuehrt beides zusammen. */
export async function kiAntworten(eingaben: AnalyseEingabe[], modell: LanguageModel, parallel = 3): Promise<{ id: string; ki: KiAntwort | null }[]> {
  const ergebnisse: { id: string; ki: KiAntwort | null }[] = new Array(eingaben.length);
  let naechster = 0;
  const lauf = async () => {
    for (;;) {
      const i = naechster++;
      if (i >= eingaben.length) return;
      const e = eingaben[i]!;
      ergebnisse[i] = { id: e.id, ki: await frageModell(modell, e.dateiname, kiAuszug(e.text)) };
    }
  };
  await Promise.all(Array.from({ length: Math.min(parallel, eingaben.length) }, lauf));
  return ergebnisse;
}
