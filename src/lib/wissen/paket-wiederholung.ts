import type { AktionsStatus } from "@/lib/actions/status";

// Ein Buch geht in vielen Paketen zum Server (buch-upload.ts), und ein einziger kurzer Fehler bei einem Paket hat bisher das ganze Buch abgebrochen
// ("Paket 12 von 30 ist fehlgeschlagen, das Buch wurde wieder entfernt"). Meist ist so ein Fehler vorübergehend: der Einbettungsdienst antwortet langsam,
// eine Verbindung bricht ab. Darum wird ein Paket bei solchen Fehlern bis zu zweimal erneut gesendet, nach kurzer Wartezeit.
//
// Das ist gefahrlos, weil das Schreiben eines Pakets wiederholbar ist: Die Abschnitts-IDs sind stabil (aus Dokument, Paketnummer und Stelle), geschrieben
// wird mit upsert (speicher-supabase.ts), und ein Paket, das scheiterte, hat nichts gespeichert oder nur dieselben Zeilen. Fehler, die ein zweiter Versuch
// nicht heilt (ungültige Eingabe, leerer Text, zu groß, fehlendes Recht), werden nie wiederholt.

/** Meldungsschlüssel (Namespace "aktionen"), bei denen ein erneuter Versuch sinnvoll ist. */
export const VORUEBERGEHENDE_MELDUNGEN: ReadonlySet<string> = new Set(["fehler.wissenEinbettung", "fehler.wissenZeit", "fehler.wissenSpeichern", "fehler.unbekannt"]);

/** Wartezeit vor dem ersten und dem zweiten erneuten Versuch (Millisekunden). */
export const WIEDERHOLUNG_WARTEZEITEN_MS: readonly number[] = [2_000, 6_000];

export function istVoruebergehend(status: AktionsStatus): boolean {
  return status.stand === "fehler" && VORUEBERGEHENDE_MELDUNGEN.has(status.meldung ?? "fehler.unbekannt");
}

const FEHLER_UNBEKANNT: AktionsStatus = { stand: "fehler", meldung: "fehler.unbekannt" };

const wartePause = (ms: number, abbruch?: AbortSignal) =>
  new Promise<void>((fertig) => {
    if (abbruch?.aborted) return fertig();
    const t = setTimeout(fertig, ms);
    abbruch?.addEventListener("abort", () => { clearTimeout(t); fertig(); }, { once: true });
  });

/**
 * Führt `versuch` aus und wiederholt es bei vorübergehenden Fehlern (auch bei einer Ausnahme, zum Beispiel einem Netzabbruch). Liefert das letzte Ergebnis.
 * `beiNeuemVersuch(n)` wird vor jedem erneuten Versuch gerufen (n = 1 für den ersten erneuten Versuch). Ein Abbruch beendet das Warten sofort.
 */
export async function mitWiederholung(
  versuch: () => Promise<AktionsStatus>,
  opt: { beiNeuemVersuch?: (nr: number) => void; abbruch?: AbortSignal; warte?: (ms: number) => Promise<void>; wartezeiten?: readonly number[] } = {},
): Promise<AktionsStatus> {
  const zeiten = opt.wartezeiten ?? WIEDERHOLUNG_WARTEZEITEN_MS;
  const warte = opt.warte ?? ((ms: number) => wartePause(ms, opt.abbruch));
  const ausfuehren = () => versuch().catch((): AktionsStatus => FEHLER_UNBEKANNT);
  let ergebnis = await ausfuehren();
  for (let nr = 1; nr <= zeiten.length && istVoruebergehend(ergebnis) && !opt.abbruch?.aborted; nr++) {
    opt.beiNeuemVersuch?.(nr);
    await warte(zeiten[nr - 1]!);
    if (opt.abbruch?.aborted) break;
    ergebnis = await ausfuehren();
  }
  return ergebnis;
}
