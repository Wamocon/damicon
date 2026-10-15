import type { Umschlag } from "@/lib/domain/integration-auslieferung";

// Vorlage für den Körper des Webhooks (Entscheidung vom 15.10.2026, WMCNL-1627/2290): Das Zielformat eines Partners wie 1C ist ein Mapping, das die
// Administration pflegt, und kein Code. Eine Vorlage ist ein JSON-Objekt, dessen Texte Platzhalter tragen dürfen:
//
//   "{{daten.entwurf.kunde.name}}"      ein Text, der nur aus einem Platzhalter besteht, behält den Typ des Werts (Zahl bleibt Zahl, fehlend wird null)
//   "ЭСФ {{daten.esfNummer}} vom ..."   ein Platzhalter im Text wird als Text eingesetzt (fehlend: leer)
//
// Wurzeln: "umschlag" (id, ereignis, idempotenzSchluessel, erstelltAm, versuch) und "daten" (die Nutzdaten des Ereignisses, bei der ЭСФ belegId,
// lieferungId, status, esfNummer, ausgestelltAm, bestaetigtAm und der Entwurf mit kunde, ware und mwst). Pfade trennt ein Punkt, ein Eintrag einer
// Liste hat die Form liste[0]. Keine Ausdrücke, keine Aufrufe, nichts außer dem Nachschlagen: Die Vorlage kann nichts ausführen und nichts lesen, was
// nicht im Umschlag steht (insbesondere keine Umgebungsvariablen).

export const VORLAGE_MAX_ZEICHEN = 20_000;
export const VORLAGE_MAX_TIEFE = 8;
export const VORLAGE_MAX_PLATZHALTER = 200;
export const VORLAGE_WURZELN = ["umschlag", "daten"] as const;

const PLATZHALTER = /\{\{\s*([^{}]*?)\s*\}\}/g;
const GANZER_PLATZHALTER = /^\{\{\s*([^{}]*?)\s*\}\}$/;
const PFAD = /^(umschlag|daten)((\.[A-Za-z_][A-Za-z0-9_]*|\[\d{1,3}\])*)$/;

export type VorlageFehler = "leer" | "kein_json" | "kein_objekt" | "zu_gross" | "zu_tief" | "zu_viele_platzhalter" | "pfad";

export type VorlagePruefung = { ok: true; vorlage: Record<string, unknown> | null } | { ok: false; fehler: VorlageFehler; detail?: string };

/** Prüft den Text einer Vorlage aus dem Formular. Leer heißt: keine Vorlage (der Umschlag geht unverändert hinaus). */
export function pruefeVorlage(roh: string): VorlagePruefung {
  const text = roh.trim();
  if (text === "") return { ok: true, vorlage: null };
  if (text.length > VORLAGE_MAX_ZEICHEN) return { ok: false, fehler: "zu_gross" };
  let wert: unknown;
  try {
    wert = JSON.parse(text);
  } catch {
    return { ok: false, fehler: "kein_json" };
  }
  if (typeof wert !== "object" || wert === null || Array.isArray(wert)) return { ok: false, fehler: "kein_objekt" };

  let platzhalter = 0;
  let schlechterPfad: string | null = null;
  let zuTief = false;
  const gehe = (w: unknown, tiefe: number): void => {
    if (tiefe > VORLAGE_MAX_TIEFE) {
      zuTief = true;
      return;
    }
    if (typeof w === "string") {
      for (const m of w.matchAll(PLATZHALTER)) {
        platzhalter += 1;
        if (!PFAD.test(m[1]) && schlechterPfad === null) schlechterPfad = m[1];
      }
      // Eine einzelne geschweifte Klammer ist kein Platzhalter. Ein unvollstaendiger ("{{daten.x") bleibt Text, faellt aber beim Pruefen nicht auf: gewollt, es ist Text.
    } else if (Array.isArray(w)) {
      for (const e of w) gehe(e, tiefe + 1);
    } else if (typeof w === "object" && w !== null) {
      for (const [k, v] of Object.entries(w)) {
        gehe(k, tiefe + 1);
        gehe(v, tiefe + 1);
      }
    }
  };
  gehe(wert, 1);
  if (zuTief) return { ok: false, fehler: "zu_tief" };
  if (platzhalter > VORLAGE_MAX_PLATZHALTER) return { ok: false, fehler: "zu_viele_platzhalter" };
  if (schlechterPfad !== null) return { ok: false, fehler: "pfad", detail: schlechterPfad };
  return { ok: true, vorlage: wert as Record<string, unknown> };
}

/** Schlägt einen Pfad nach. Unbekannt oder durch einen Nicht-Container unterbrochen: undefined. */
export function schlageNach(kontext: unknown, pfad: string): unknown {
  const m = PFAD.exec(pfad);
  if (!m) return undefined;
  let aktuell: unknown = (kontext as Record<string, unknown>)[m[1]];
  const schritte = m[2].match(/\.[A-Za-z_][A-Za-z0-9_]*|\[\d{1,3}\]/g) ?? [];
  for (const schritt of schritte) {
    if (aktuell === null || typeof aktuell !== "object") return undefined;
    if (schritt.startsWith("[")) {
      if (!Array.isArray(aktuell)) return undefined;
      aktuell = aktuell[Number(schritt.slice(1, -1))];
    } else {
      const schluessel = schritt.slice(1);
      // Nur eigene Eintraege: __proto__, constructor und Verwandte bleiben aussen vor.
      if (!Object.prototype.hasOwnProperty.call(aktuell, schluessel)) return undefined;
      aktuell = (aktuell as Record<string, unknown>)[schluessel];
    }
  }
  return aktuell;
}

/** Setzt die Platzhalter einer Vorlage ein und gibt den fertigen Körper zurück. */
export function wendeVorlageAn(vorlage: unknown, kontext: unknown): unknown {
  if (typeof vorlage === "string") {
    const ganz = GANZER_PLATZHALTER.exec(vorlage);
    if (ganz) {
      const wert = schlageNach(kontext, ganz[1]);
      return wert === undefined ? null : wert;
    }
    return vorlage.replace(PLATZHALTER, (_, pfad: string) => {
      const wert = schlageNach(kontext, pfad);
      if (wert === undefined || wert === null) return "";
      return typeof wert === "object" ? JSON.stringify(wert) : String(wert);
    });
  }
  if (Array.isArray(vorlage)) return vorlage.map((e) => wendeVorlageAn(e, kontext));
  if (typeof vorlage === "object" && vorlage !== null) {
    return Object.fromEntries(Object.entries(vorlage).map(([k, v]) => [String(wendeVorlageAn(k, kontext) ?? ""), wendeVorlageAn(v, kontext)]));
  }
  return vorlage;
}

/** Was die Vorlage sieht: der Umschlag in zwei Wurzeln. */
export function vorlagenKontext(u: Umschlag): { umschlag: Omit<Umschlag, "daten">; daten: unknown } {
  const { daten, ...rest } = u;
  return { umschlag: rest, daten };
}

/** Der Körper des Webhooks: die Vorlage mit eingesetzten Werten oder, ohne Vorlage, der Umschlag unverändert. */
export function baueKoerper(u: Umschlag, vorlage: unknown): unknown {
  return vorlage === null || vorlage === undefined ? u : wendeVorlageAn(vorlage, vorlagenKontext(u));
}

// --- Beispiele für die Oberfläche ---------------------------------------------------------------------------------------------------------------

/** Ein Beispiel-Umschlag (ЭСФ ausgestellt), an dem die Oberfläche die Vorlage zeigt, bevor sie gespeichert wird. */
export const VORSCHAU_UMSCHLAG: Umschlag = {
  id: "00000000-0000-4000-8000-000000000001",
  ereignis: "esf.beleg_ausgestellt",
  idempotenzSchluessel: "esf:0001:ausgestellt:1760000000000000",
  erstelltAm: "2026-10-15T09:30:00.000Z",
  versuch: 1,
  daten: {
    belegId: "0000beleg-0001",
    lieferungId: "0000lief-0001",
    status: "ausgestellt",
    esfNummer: "ESF-2026-000123",
    ausgestelltAm: "2026-10-15",
    bestaetigtAm: null,
    entwurf: {
      version: 1,
      stichtag: "2026-10-14",
      kunde: { name: "Handelskette A", identifikationsnummer: "123456789012", rechtsform: "too" },
      ware: { sorte: "Tulameen", chargeCode: "CH-1", mengeKg: 80, preisTengeKg: 3200, betragTenge: 256000 },
      mwst: { registriert: true, prozent: 16, betragTenge: 40960, gesamtTenge: 296960, annahme: "netto" },
      luecken: [],
    },
  },
};

/**
 * Ein Ausgangspunkt für 1C per OData (Realisierungsdokument, JSON). Die Feldnamen sind Beispiele: Sie stehen in $metadata der jeweiligen 1C-Basis
 * und hängen von der Konfiguration ab. Die Vorlage ersetzt das Mapping, ein Entwickler von 1C passt die Namen an.
 */
export const VORLAGE_BEISPIEL_1C = `{
  "Date": "{{daten.ausgestelltAm}}",
  "ВнешнийИдентификатор": "{{umschlag.idempotenzSchluessel}}",
  "НомерЭСФ": "{{daten.esfNummer}}",
  "ИННКонтрагента": "{{daten.entwurf.kunde.identifikationsnummer}}",
  "СуммаДокумента": "{{daten.entwurf.mwst.gesamtTenge}}",
  "Товары": [
    {
      "Номенклатура": "{{daten.entwurf.ware.sorte}}",
      "Количество": "{{daten.entwurf.ware.mengeKg}}",
      "Цена": "{{daten.entwurf.ware.preisTengeKg}}",
      "Сумма": "{{daten.entwurf.ware.betragTenge}}"
    }
  ]
}`;
