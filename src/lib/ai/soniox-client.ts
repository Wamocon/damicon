// Spracherkennung ueber Soniox (Datei-Weg, kein Livestream).
//
// Gegenstueck zu transkription-client.ts, das denselben Vertrag erfuellt:
// diese Funktion wirft NIE, jeder Fehlerpfad endet in { ok: false }. Der
// Aufrufer faellt dann auf Whisper zurueck (actions/ki-assistent.ts) - eine
// Stoerung bei Soniox darf niemandem das Diktat nehmen.
//
// Der Ablauf sind vier Aufrufe: Datei hochladen, Auftrag starten, auf das
// Ergebnis warten, Text holen. Danach werden Auftrag UND Datei wieder
// geloescht: Soniox behaelt hochgeladene Dateien sonst 30 Tage, und das sind
// Stimmen von Mitarbeitenden. Das Loeschen laeuft auch dann, wenn zwischendrin
// etwas schiefgegangen ist.
//
// Gemessen am 21.09.2026 gegen unsere eigenen Aufnahmen: 1,4-3,4 s je Datei.

export type SonioxAntwort =
  /** `sprachen` sind die Sprachen der einzelnen Token. Sie gehen weiter an
   *  die Antwortsprache (domain/antwortsprache.ts): wer diktiert, soll eine
   *  Antwort in der Sprache bekommen, in der er gesprochen hat - nach dem,
   *  was der Dienst GEHOERT hat, nicht nach dem, was aus dem erkannten Text
   *  zu erraten waere. Genau daran ist Kasachisch gescheitert. */
  | { ok: true; text: string; sprachen: string[] }
  | { ok: false; grund: string };

const MODELL = "stt-async-v5";

/** Abstand zwischen zwei Nachfragen, ob der Auftrag fertig ist. */
const ABFRAGE_ABSTAND_MS = 250;

// Zeitbudget (22.09.2026, zweite Fassung): Soniox darf bis 20 s brauchen.
// Das ist kein Warten auf gut Glueck - ab 6 s laeuft Whisper parallel mit
// (spracherkennung.ts), der erste brauchbare Text gewinnt. Vorher standen
// hier 8 s; an echten 10-Sekunden-Aufnahmen lief das reihenweise in die
// Grenze, danach Whisper ebenfalls, und nach 20,3 s stand kein Text da.
export const SONIOX_ZEITLIMIT_STANDARD_MS = 20_000;

/** Welcher Dienst die Spracherkennung macht. Standard ist "whisper" - solange
 *  niemand KI_SPRACHERKENNUNG_ANBIETER=soniox setzt, aendert sich nichts. */
export function spracherkennungAnbieter(): "whisper" | "soniox" {
  return process.env.KI_SPRACHERKENNUNG_ANBIETER?.trim().toLowerCase() === "soniox" ? "soniox" : "whisper";
}

/** Wo verarbeitet wird. Bewusst OHNE Voreinstellung im Code: der Datenstandort
 *  ist eine Entscheidung des Betriebs, keine des Programmierers - und er
 *  wandert (Demo: US, Pilot: EU, beim Kunden: Kasachstan). Fehlt
 *  SONIOX_API_URL, laeuft Soniox gar nicht erst an und Whisper uebernimmt.
 *  Siehe docs/infra/spracherkennung-anbieter.md. */
export function sonioxBasisUrl(): string | null {
  const wert = process.env.SONIOX_API_URL?.trim();
  return wert ? wert.replace(/\/+$/, "") : null;
}

export function sonioxZeitlimitMs(): number {
  const wert = Number(process.env.SONIOX_ZEITLIMIT_MS);
  return Number.isFinite(wert) && wert >= 2_000 && wert <= 20_000 ? wert : SONIOX_ZEITLIMIT_STANDARD_MS;
}

function schluessel(): string | null {
  return process.env.SONIOX_API_KEY?.trim() || null;
}

/** Raeumt hinter uns auf. Fehler hier sind nicht schlimm genug, um das
 *  Ergebnis zu verwerfen - aber sie muessen sichtbar sein, sonst sammeln sich
 *  unbemerkt Aufnahmen beim Dienstleister. */
async function aufraeumen(basis: string, kopf: HeadersInit, auftragId: string | null, dateiId: string | null): Promise<void> {
  for (const [was, pfad] of [
    ["Auftrag", auftragId ? `/v1/transcriptions/${auftragId}` : null],
    ["Datei", dateiId ? `/v1/files/${dateiId}` : null],
  ] as const) {
    if (!pfad) continue;
    try {
      const antwort = await fetch(`${basis}${pfad}`, { method: "DELETE", headers: kopf });
      if (!antwort.ok) console.error(`[damicon] Soniox: ${was} nicht geloescht (http-${antwort.status})`);
    } catch (fehler) {
      console.error(`[damicon] Soniox: ${was} nicht geloescht:`, fehler instanceof Error ? fehler.message : String(fehler));
    }
  }
}

/** Sprachen, fuer die ein Hinweis mitgeht - dieselben vier, die die
 *  Oberflaeche kennt. Alles andere wird still verworfen. */
const HINWEIS_SPRACHEN = ["de", "en", "ru", "kk"];

/** language_hints als Liste von ISO-Codes.
 *
 *  Anders als bei Whisper ist der Hinweis hier ungefaehrlich: Soniox
 *  BESCHRAENKT damit nicht, sondern gewichtet nur - "Language hints do not
 *  restrict recognition to those languages - they only bias the model toward
 *  them" (https://soniox.com/docs/stt/concepts/language-hints). Dieselbe Seite
 *  empfiehlt ihn ausdruecklich, wenn die erwartete Sprache bekannt ist, und
 *  die Oberflaechensprache ist genau das.
 *
 *  Am 21.09.2026 an sauberen TTS-Aufnahmen gemessen machte er keinen
 *  Unterschied - solches Material ist aber der guenstigste Fall. Bei echten
 *  Aufnahmen soll die Gewichtung helfen; ob sie es tut, zeigt der Vergleich
 *  S1 gegen S2. */
function sprachHinweis(sprache?: string): { language_hints?: string[] } {
  const wert = sprache?.trim().toLowerCase();
  return wert && HINWEIS_SPRACHEN.includes(wert) ? { language_hints: [wert] } : {};
}

/** Modell stt-async-v5: laut Modelltabelle der aktuelle Async-Stand
 *  (https://soniox.com/docs/stt/models, "Active"; stt-async-v4 zeigt darauf). */
export async function transkribiereMitSoniox(
  datei: Blob,
  dateiname: string,
  sprache?: string,
  /** Von aussen abbrechen - siehe transkribiereAudio(). Aufgeraeumt wird
   *  trotzdem: die Aufnahme darf nicht beim Dienstleister liegen bleiben. */
  abbruch?: AbortSignal,
): Promise<SonioxAntwort> {
  const key = schluessel();
  if (!key) return { ok: false, grund: "kein-schluessel" };

  const basis = sonioxBasisUrl();
  if (!basis) return { ok: false, grund: "keine-basis-url" };

  const kopf = { Authorization: `Bearer ${key}` };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), sonioxZeitlimitMs());
  const signal = abbruch ? AbortSignal.any([controller.signal, abbruch]) : controller.signal;
  let dateiId: string | null = null;
  let auftragId: string | null = null;

  try {
    const form = new FormData();
    form.append("file", datei, dateiname);
    const hochgeladen = await fetch(`${basis}/v1/files`, { method: "POST", headers: kopf, body: form, signal });
    if (!hochgeladen.ok) return { ok: false, grund: await grundAusAntwort("upload", hochgeladen) };
    dateiId = ((await hochgeladen.json()) as { id?: string }).id ?? null;
    if (!dateiId) return { ok: false, grund: "upload-ohne-id" };

    const gestartet = await fetch(`${basis}/v1/transcriptions`, {
      method: "POST",
      headers: { ...kopf, "content-type": "application/json" },
      body: JSON.stringify({
        model: MODELL,
        file_id: dateiId,
        // Ohne dieses Feld traegt kein Token eine Sprache
        // (https://soniox.com/docs/stt/concepts/language-identification).
        enable_language_identification: true,
        ...sprachHinweis(sprache),
      }),
      signal,
    });
    if (!gestartet.ok) return { ok: false, grund: await grundAusAntwort("auftrag", gestartet) };
    auftragId = ((await gestartet.json()) as { id?: string }).id ?? null;
    if (!auftragId) return { ok: false, grund: "auftrag-ohne-id" };

    // Warten, bis der Auftrag fertig ist. Im Regelfall beendet das Zeitlimit
    // oben die Schleife ueber das Abbruchsignal; die Rundenzahl ist der Gurt
    // darueber, falls ein fetch das Signal einmal nicht beachtet - ewig
    // drehen darf diese Funktion unter keinen Umstaenden.
    const hoechsteRunden = Math.ceil(sonioxZeitlimitMs() / ABFRAGE_ABSTAND_MS) + 5;
    for (let runde = 0; ; runde++) {
      if (runde > hoechsteRunden) return { ok: false, grund: "zeitueberschreitung" };
      const stand = await fetch(`${basis}/v1/transcriptions/${auftragId}`, { headers: kopf, signal });
      if (!stand.ok) return { ok: false, grund: await grundAusAntwort("status", stand) };
      const j = (await stand.json()) as { status?: string; error_message?: string };
      if (j.status === "completed") break;
      if (j.status === "error") return { ok: false, grund: `auftrag-fehler: ${j.error_message ?? "ohne Angabe"}` };
      await new Promise((r) => setTimeout(r, ABFRAGE_ABSTAND_MS));
    }

    const ergebnis = await fetch(`${basis}/v1/transcriptions/${auftragId}/transcript`, { headers: kopf, signal });
    if (!ergebnis.ok) return { ok: false, grund: await grundAusAntwort("transcript", ergebnis) };
    const j = (await ergebnis.json()) as { text?: unknown; tokens?: unknown };
    const text = typeof j.text === "string" ? j.text.trim() : "";
    if (!text) return { ok: false, grund: "antwort-unerwartete-form" };
    const sprachen = Array.isArray(j.tokens)
      ? (j.tokens as Array<{ language?: unknown }>)
          .map((t) => t?.language)
          .filter((x): x is string => typeof x === "string")
      : [];
    return { ok: true, text, sprachen };
  } catch (fehler) {
    const grund = fehler instanceof Error ? fehler.message : String(fehler);
    if (abbruch?.aborted) return { ok: false, grund: "abgebrochen" };
    return { ok: false, grund: controller.signal.aborted ? "zeitueberschreitung" : `dienst-nicht-erreichbar: ${grund}` };
  } finally {
    clearTimeout(timeout);
    // Aufraeumen ohne das Abbruchsignal: es ist an dieser Stelle womoeglich
    // schon ausgeloest, und die Aufnahme soll trotzdem weg.
    await aufraeumen(basis, kopf, auftragId, dateiId);
  }
}

/** Fehlertext des Dienstes, gekuerzt - nie der Schluessel, der steht nur im
 *  Kopf der Anfrage und nie im Text der Antwort. */
async function grundAusAntwort(schritt: string, antwort: Response): Promise<string> {
  if (antwort.status === 401 || antwort.status === 403) return `zugang-abgewiesen (http-${antwort.status}) - SONIOX_API_KEY pruefen`;
  const auszug = await antwort.text().catch(() => "");
  return `${schritt}-http-${antwort.status}: ${auszug.slice(0, 160)}`;
}
