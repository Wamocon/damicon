import type { LanguageModel } from "ai";
import { darfAusweichen, klassifiziere, retryAfterSekunden, Schalter, type AusfallArt } from "@/lib/ai/ausfall";

// Ein Sprachmodell, das hinter den Kulissen mehrere Anbieter hat: faellt der erste aus (Guthaben aufgebraucht,
// Ratenlimit, Ueberlastung, Netz), antwortet der naechste. Fuer die Aufrufer (streamText, generateText, jeder Schritt
// einer Werkzeugschleife) ist es ein ganz normales Modell, es aendert sich nichts an der Anwendung.
//
// Zwei Stellen, an denen ein Fehler auftreten kann:
//   1. beim Aufruf (HTTP-Status): das faengt probiere() ab
//   2. als ERSTES Ereignis des Stroms: Anthropic meldet "overloaded" gelegentlich erst im Strom, nach einer
//      erfolgreichen Verbindung. Solange noch nichts an den Nutzer ging, laesst sich auch das ueberspringen.
// Ein Fehler MITTEN in einer laufenden Antwort wird nicht ersetzt: der Nutzer hat dann schon Text gesehen, ein
// zweiter Anbieter wuerde von vorn beginnen und den Text doppeln.

export interface KettenGlied {
  name: string;
  modell: LanguageModel;
}

export interface AusweichEreignis {
  von: string;
  nach: string | null;
  art: AusfallArt;
  meldung: string;
}

export interface AusfallOptionen {
  schalter?: Schalter;
  beiAusweichen?: (e: AusweichEreignis) => void;
}

// Teile eines Stroms, die noch nichts Inhaltliches an den Nutzer geben.
const VORSPANN = new Set(["stream-start", "response-metadata", "raw"]);

type Strom = { stream: ReadableStream<{ type: string; error?: unknown }> } & Record<string, unknown>;

/** Liest den Strom bis zum ersten inhaltlichen Teil. Ist das ein Fehler, der einen Wechsel lohnt, wird er geworfen. */
async function ersterTeil(quelle: Strom): Promise<Strom> {
  const leser = quelle.stream.getReader();
  const puffer: Array<{ type: string; error?: unknown }> = [];
  let ende = false;
  for (;;) {
    const { done, value } = await leser.read();
    if (done) {
      ende = true;
      break;
    }
    puffer.push(value);
    if (VORSPANN.has(value.type)) continue;
    if (value.type === "error" && darfAusweichen(klassifiziere(value.error))) {
      leser.cancel().catch(() => {});
      throw value.error;
    }
    break;
  }
  const neu = new ReadableStream<{ type: string; error?: unknown }>({
    start(c) {
      for (const teil of puffer) c.enqueue(teil);
      if (ende) c.close();
    },
    async pull(c) {
      if (ende) return;
      const { done, value } = await leser.read();
      if (done) c.close();
      else c.enqueue(value);
    },
    cancel(grund) {
      return leser.cancel(grund);
    },
  });
  return { ...quelle, stream: neu };
}

export function ausfallModell(kette: KettenGlied[], optionen: AusfallOptionen = {}): LanguageModel {
  if (kette.length === 0) throw new Error("Ausfallmodell braucht mindestens einen Anbieter.");
  const schalter = optionen.schalter ?? new Schalter();
  const erstes = kette[0]!.modell as unknown as { specificationVersion: string; supportedUrls?: unknown };

  async function probiere<T>(aufruf: (m: never) => Promise<T>): Promise<T> {
    const frei = kette.filter((k) => !schalter.offen(k.name));
    // Sind alle gesperrt, wird der versucht, dessen Sperre zuerst endet (besser eine Anfrage riskieren als keine).
    const notfall = schalter.fruehesteFreigabe(kette.map((k) => k.name));
    const reihenfolge = frei.length > 0 ? frei : kette.filter((k) => k.name === notfall);
    let letzter: unknown;
    for (const [i, glied] of reihenfolge.entries()) {
      try {
        const ergebnis = await aufruf(glied.modell as never);
        schalter.schliessen(glied.name);
        return ergebnis;
      } catch (fehler) {
        letzter = fehler;
        const art = klassifiziere(fehler);
        if (!darfAusweichen(art)) throw fehler;
        schalter.oeffnen(glied.name, art, retryAfterSekunden(fehler));
        const nach = reihenfolge[i + 1]?.name ?? null;
        optionen.beiAusweichen?.({ von: glied.name, nach, art, meldung: String((fehler as { message?: string })?.message ?? fehler).slice(0, 200) });
        if (nach === null) throw fehler;
      }
    }
    throw letzter;
  }

  return {
    specificationVersion: erstes.specificationVersion,
    provider: "ausfall",
    modelId: kette.map((k) => k.name).join("+"),
    get supportedUrls() {
      return erstes.supportedUrls ?? {};
    },
    doGenerate: (o: unknown) => probiere((m: { doGenerate: (x: unknown) => Promise<unknown> }) => m.doGenerate(o)),
    doStream: (o: unknown) => probiere(async (m: { doStream: (x: unknown) => Promise<Strom> }) => ersterTeil(await m.doStream(o))),
  } as unknown as LanguageModel;
}
