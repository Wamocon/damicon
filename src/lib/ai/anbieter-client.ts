import {
  baueAnthropicAnfrage,
  baueOpenAiKompatibelAnfrage,
  parseAnthropicAntwort,
  parseOpenAiKompatibelAntwort,
  zeitlimitMs,
  type ChatNachricht,
} from "@/lib/ai/anfrage";
import type { KiAnbieterTyp } from "@/lib/domain/ki-assistent";

// Ruft den konfigurierten KI-Anbieter auf. Masterplan-Vorgabe (Anforderung
// 5.4): "kein 5xx bei Ausfall" - diese Funktion wirft deshalb NIE, jeder
// Fehlerpfad (Zeitueberschreitung, Netzwerkfehler, HTTP-Fehlerstatus,
// unerwartete Antwortform) endet in { ok: false }, nie in einer geworfenen
// Exception. Der Aufrufer (actions/ki-assistent.ts) zeigt dann die
// deterministische Ausweichantwort statt eines Fehlerbildschirms.
export type AnbieterAntwort = { ok: true; text: string } | { ok: false; grund: string };

// Vibecode-Cleanup: vorher zwei getrennte Ternaries (einmal fuers Bauen,
// einmal fuers Parsen), die beide auf anbieter.typ unterschieden - bei einem
// dritten Anbietertyp (im Migrationskommentar bereits als Erweiterung
// angekuendigt) waeren zwei Stellen statt einer zu aendern. Jetzt eine
// einzige Zuordnungstabelle je Typ.
const ANBIETER_ADAPTER: Record<
  KiAnbieterTyp,
  {
    bauen: (basisUrl: string, modell: string, apiKey: string, verlauf: ChatNachricht[]) => ReturnType<typeof baueOpenAiKompatibelAnfrage>;
    parsen: (json: unknown) => string | null;
  }
> = {
  openai_kompatibel: { bauen: baueOpenAiKompatibelAnfrage, parsen: parseOpenAiKompatibelAntwort },
  anthropic: { bauen: baueAnthropicAnfrage, parsen: parseAnthropicAntwort },
};

export async function sendeChatAnfrage(
  anbieter: { typ: KiAnbieterTyp; basisUrl: string; modell: string; apiKey: string },
  verlauf: ChatNachricht[],
): Promise<AnbieterAntwort> {
  const adapter = ANBIETER_ADAPTER[anbieter.typ];
  const anfrage = adapter.bauen(anbieter.basisUrl, anbieter.modell, anbieter.apiKey, verlauf);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), zeitlimitMs());

  try {
    const antwort = await fetch(anfrage.url, {
      method: "POST",
      headers: anfrage.headers,
      body: anfrage.body,
      signal: controller.signal,
    });

    if (!antwort.ok) {
      const auszug = await antwort.text().catch(() => "");
      return { ok: false, grund: `http-${antwort.status}: ${auszug.slice(0, 200)}` };
    }

    const json = await antwort.json().catch(() => null);
    const text = adapter.parsen(json);

    if (!text) return { ok: false, grund: "antwort-unerwartete-form" };
    return { ok: true, text };
  } catch (error) {
    const grund = error instanceof Error ? error.message : String(error);
    return { ok: false, grund: controller.signal.aborted ? "zeitueberschreitung" : grund };
  } finally {
    clearTimeout(timeout);
  }
}
