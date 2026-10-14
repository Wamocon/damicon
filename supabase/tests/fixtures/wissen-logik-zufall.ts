// Zufallseingaben für den Vergleich "Verhalten unverändert" (supabase/tests/wissen-logik.ts): Texte für bewerteText, Listenzeilen für
// gruppiereWissenDokumente, Antworten der Datenbank für ladeFreigabeInfo und Lagen für entscheideUeberUpload. Frei erfunden, kein echtes Dokument.
// Der Zufall hat einen festen Startwert: dieselben Eingaben bei jedem Lauf und auf jedem Rechner. Die Wertevorräte enthalten mit Absicht die
// Ränder jeder Bedingung (leer, null, 0, Text statt Zahl, unbekannte Werte), damit jede Verzweigung von beiden Seiten erreicht wird.
// Titel, Bereiche und Pfade bestehen nur aus Kleinbuchstaben: localeCompare sortiert sie dann unter jeder Spracheinstellung gleich (CI läuft mit C.UTF-8).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { WissenListeZeile } from "@/lib/wissen/dokumente-liste";
import type { FreigabeAktion } from "@/lib/wissen/freigabe";
import type { FreigabeInfo } from "@/lib/wissen/hochladen";
import { QUELLENARTEN } from "@/lib/wissen/quellenart";

export type Zufall = ReturnType<typeof zufall>;

/** mulberry32: klein, schnell und auf jeder Plattform gleich. */
export function zufall(start: number) {
  let s = start >>> 0;
  const zahl = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const ganz = (min: number, max: number): number => min + Math.floor(zahl() * (max - min + 1));
  const wahl = <T>(liste: readonly T[]): T => liste[Math.floor(zahl() * liste.length)] as T;
  const ja = (p = 0.5): boolean => zahl() < p;
  return { zahl, ganz, wahl, ja };
}

/** Mit Wahrscheinlichkeit 0,15 fehlt das Feld ganz (undefined), sonst ein Wert aus dem Vorrat. */
const vielleicht = <T>(r: Zufall, werte: readonly T[]): T | undefined => (r.ja(0.15) ? undefined : r.wahl(werte));

/** Setzt nur, was nicht undefined ist: ein fehlendes Feld bleibt ein fehlendes Feld. */
function setze<T extends object>(ziel: T, felder: Record<string, unknown>): T {
  for (const [name, wert] of Object.entries(felder)) if (wert !== undefined) (ziel as Record<string, unknown>)[name] = wert;
  return ziel;
}

// ---- bewerteText ----------------------------------------------------------------------------------------------------------------

const BAUSTEINE: Record<string, readonly string[]> = {
  deutsch: ["der", "Arbeitgeber", "ist", "verpflichtet", "dem", "Arbeitnehmer", "spätestens", "einen", "Monat", "nach", "Beginn", "Niederschrift", "Vertrag", "Frist", "und", "Steuer", "Gesetz"],
  russisch: ["договор", "работник", "статья", "налог", "в", "и", "с", "организация", "срок", "декларация"],
  kasachisch: ["және", "үшін", "бойынша", "салық", "құқық", "ә", "ө"],
  einzelErlaubt: ["a", "i", "o", "u", "A", "I", "в", "и", "к", "о", "с", "у", "я", "а", "ә", "ө", "В"],
  einzelFremd: ["b", "x", "D", "e", "r", "q", "т", "Ж", "z"],
  ohneVokal: ["strkn", "bcdfg", "Pfstrm", "nkrtt", "грст", "Brnn"],
  lang: ["Donaudampfschifffahrtsgesellschaft", "Arbeitsverhältnisbeendigungsvereinbarung", "Steuerberatungsgesellschaftsvertrag"],
  gemischt: ["Koдекс", "нaлог", "Vertrаg", "Cтатья"],
  ziffern: ["12", "2026", "4711", "3,5", "7", "100000", "1.2.3"],
  sonder: ["#", "~", "^", "|", "§", "$", "%", "&", "[", "]", "{", "}", "\\", "@", "*", "+", "=", "<", ">"],
  satz: [",", ".", ";", ":", "!", "?", "-", "'", "’", "(", ")", "«", "»", "…", "·"],
  apostroph: ["don't", "l’état", "Arbeit-geber", "o'clock", "17-jährig"],
};

const ZEILEN = {
  kopf: ["Kopfzeile des Buchs Seite", "Steuerkodex Republik Kasachstan", "Глава первая"],
  punktlinie: ["Artikel 5 .......... 12", "Kapitel 2 …… 7", "Abschnitt · · · · · 113", "Vorwort ....", "Einleitung . . . . . . 1"],
  initialen: ["Smith J. K. Steuerrecht", "Казакова Н.А. Налоговое право", "Müller A.B.C. und D. E."],
  zahlen: ["12 13 14 15 16 17 18 19 20 21 22", "1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12", "Art. 5 12 47 112 304 1020 4711 9000", "2026 2025 2024 2023 2022 abc"],
};

/** Ein Text aus gewichteten Bausteinen: Jeder Fall hat sein eigenes Profil, viele Arten bleiben bei 0. */
export function zufallsText(r: Zufall): { text: string; ganzesDokument: boolean } {
  const arten = Object.keys(BAUSTEINE);
  const gewichte = arten.map(() => (r.ja(0.55) ? 0 : 1 + r.ganz(0, 20)));
  if (!gewichte.some((g) => g > 0)) gewichte[0] = 1;
  const summe = gewichte.reduce((s, g) => s + g, 0);
  const baustein = (): string => {
    let x = r.zahl() * summe;
    for (let i = 0; i < arten.length; i++) {
      x -= gewichte[i]!;
      if (x < 0) return r.wahl(BAUSTEINE[arten[i]!]!);
    }
    return r.wahl(BAUSTEINE.deutsch!);
  };
  const anzahl = r.wahl([0, 1, 3, 10, 30, 45, 50, 55, 80, 120, 250, 500]) + r.ganz(0, 8);
  const zeilenwechsel = r.wahl([0, 0.02, 0.1, 0.3, 0.6]);
  const trenner = r.wahl([" ", " ", " ", "", "  ", "\t"]);
  const umbruch = r.wahl(["\n", "\n", "\r\n", "\r"]);
  const kopf = r.ja(0.3) ? r.wahl(ZEILEN.kopf) : null;
  const teile: string[] = [];
  for (let i = 0; i < anzahl; i++) {
    teile.push(baustein());
    if (r.zahl() >= zeilenwechsel) {
      teile.push(trenner);
      continue;
    }
    teile.push(umbruch);
    if (kopf && r.ja(0.5)) teile.push(kopf, umbruch);
    if (r.ja(0.05)) teile.push(r.wahl(ZEILEN.punktlinie), umbruch);
    if (r.ja(0.05)) teile.push(r.wahl(ZEILEN.initialen), umbruch);
    if (r.ja(0.05)) teile.push(r.wahl(ZEILEN.zahlen), umbruch);
  }
  return { text: teile.join(""), ganzesDokument: r.ja(0.7) };
}

// ---- gruppiereWissenDokumente ---------------------------------------------------------------------------------------------------

function zufallsZeile(r: Zufall): WissenListeZeile {
  const rollen = r.wahl([null, [], ["admin"], ["admin", "buero"], ["lager"], ["buero", "admin"]]);
  const zeile: WissenListeZeile = {
    id: r.wahl(["z1", "z2", "z3", "z4"]),
    quelle_id: r.wahl([null, "upload:aa", "upload:aa", "upload:bb", "recht/a.md"]),
    pfad: r.wahl([null, "recht/a.md", "buch/b.md"]),
    titel: r.wahl([null, "alpha", "beta", "gamma", ""]),
    bereich: r.wahl([null, "", "recht", "steuer", "personal"]),
    rollen: rollen ? [...rollen] : null,
    eingelesen_am: r.wahl([null, "2026-01-01", "2026-05-01", "2026-05-01T10:00:00Z", "2025-12-31"]),
    upload_quelle: r.wahl([null, "upload", "upload", "skript"]),
    hochgeladen_von: r.wahl([null, "", "anna", "bert"]),
  };
  // Text statt Zahl ("567", "x") kommt aus extra->> und der Datenbankfunktion: die Liste muss damit umgehen.
  return setze(zeile, {
    autoritaetsstufe: vielleicht(r, [null, 1, 3, 5]),
    quellenart: vielleicht(r, [null, "rechtsnorm", "internetquelle", "fachliteratur", "unsinn"]),
    cluster: vielleicht(r, [null, "buecher", "internet", "unsinn"]),
    textgrundlage: vielleicht(r, [null, "original", "maschinell_uebersetzt"]),
    rechtsstelle: vielleicht(r, [null, "", "art. 5", "art. 7"]),
    pruefstatus: vielleicht(r, [null, "ungeprueft", "freigegeben", "freigegeben", "abgelehnt", "unsinn"]),
    pruefen_bis: vielleicht(r, [null, "", "2026-01-01", "2026-10-14", "2026-12-31", "2027-06-01"]),
    url: vielleicht(r, [null, "https://example.org/a"]),
    hochgeladen_von_id: vielleicht(r, [null, "", "u1", "u2"]),
    paket: vielleicht(r, [null, "", "0", "1", "2", "3"]),
    pakete_gesamt: vielleicht(r, [null, "", "2", "3"]),
    guete: vielleicht(r, [null, "", "gut", "pruefen", "schlecht", "kaputt"]),
    guete_hinweise: vielleicht(r, [null, "", "kaumText", "kaumText,unsinn,seitenLuecken", "zerhackteWoerter,kaumText"]),
    guete_prozent: vielleicht(r, [null, 0, 55, 97, "88"]),
    original_groesse: vielleicht(r, [null, 0, 1234, "567", "0", "x"]),
    seiten_fehlend: vielleicht(r, [null, 0, "0", 2, "3", "", "abc"]),
    seiten_stellen: vielleicht(r, [null, "", "48-49 (47)", "48-49 (47), 120 (118)", "2@105-107 (PDF 106-108)", "48-49 (47) +2"]),
    seiten_vermerk: vielleicht(r, [null, "", "leere seiten"]),
    seiten_bestaetigt: vielleicht(r, [null, "", "48-49"]),
    seiten_vermerkt: vielleicht(r, [null, true, false]),
    seiten_nachgeladen: vielleicht(r, [null, "", "48", "48-49", "120", "48-49, 120"]),
    anzahl: vielleicht(r, [null, 0, -1, 1, 3]),
  });
}

/** Ein bis neun Zeilen mit wenigen Schlüsseln, damit Zeilen desselben Dokuments oft zusammenkommen. */
export function zufallsZeilen(r: Zufall): { zeilen: WissenListeZeile[]; heute: string } {
  const n = r.wahl([1, 1, 2, 3, 4, 6, 9]);
  return { zeilen: Array.from({ length: n }, () => zufallsZeile(r)), heute: r.wahl(["2026-10-14", "2026-01-01", "2027-06-01"]) };
}

// ---- ladeFreigabeInfo -----------------------------------------------------------------------------------------------------------

/** Eine Abfrage, wie sie der nachgebaute Client sieht: Tabelle und die Kette der Aufrufe mit ihren Argumenten. */
export interface Abfrage {
  tabelle: string;
  kette: [string, unknown[]][];
}

export interface Antwort {
  data?: unknown;
  error?: { message: string } | null;
  count?: number | null;
}

/**
 * Ein Supabase-Client, der jede Abfrage erst beim Ausführen (await) protokolliert: Tabelle, Kette mit Argumenten und wie viele Abfragen in diesem
 * Moment noch laufen. So zeigt das Protokoll Reihenfolge UND Gleichzeitigkeit (fünf Zählungen nebeneinander, danach eine nach der anderen).
 */
export function nachgebauterClient(antworte: (a: Abfrage) => Antwort): { client: SupabaseClient; protokoll: string[] } {
  const protokoll: string[] = [];
  let laufend = 0;
  const from = (tabelle: string) => {
    const kette: [string, unknown[]][] = [];
    const abfrage: object = new Proxy(
      {},
      {
        get(_ziel, name) {
          if (name === "then") {
            return (erfuellt: (w: unknown) => unknown, abgelehnt: (g: unknown) => unknown) => {
              protokoll.push(`${laufend} laufend | ${tabelle} | ${JSON.stringify(kette)}`);
              laufend++;
              const a = antworte({ tabelle, kette });
              return Promise.resolve()
                .then(() => {
                  laufend--;
                  return { data: a.data ?? null, error: a.error ?? null, count: a.count ?? null };
                })
                .then(erfuellt, abgelehnt);
            };
          }
          if (typeof name !== "string") return undefined;
          return (...args: unknown[]) => {
            kette.push([name, args]);
            return abfrage;
          };
        },
      },
    );
    return abfrage;
  };
  return { client: { from } as unknown as SupabaseClient, protokoll };
}

export type Zaehlung = "anzahl" | "upload" | "ungeprueft" | "freigegeben" | "abgelehnt";

export interface InfoSzenario {
  quelleId: string;
  zahlen: Record<Zaehlung, number | null>;
  /** data der Abfrage nach der ersten Zeile (titel, bereich, ...). */
  erste: unknown;
  nachtraege: unknown;
  paketZeilen: Record<string, unknown>[];
  /** Die Seiten der Paketabfrage antworten mit data null. */
  paketeLeer: boolean;
  /** Abfragen, die mit einem Fehler antworten: eine Zählung, "erste", "nachtraege" oder "pakete@<von>". */
  fehler: string[];
}

/** Welche Abfrage ist das? Aus der Kette gelesen, so wie ladeFreigabeInfo sie baut. */
export function einordnen({ tabelle, kette }: Abfrage): string {
  if (tabelle === "wissen_seiten_nachtrag") return "nachtraege";
  const bereich = kette.find(([m]) => m === "range");
  if (bereich) return `pakete@${String(bereich[1][0])}`;
  const optionen = kette.find(([m]) => m === "select")?.[1][1] as { count?: string } | undefined;
  if (!optionen?.count) return "erste";
  if (kette.some(([m]) => m === "like")) return "upload";
  const status = kette.find(([m, args]) => m === "eq" && args[0] === "pruefstatus");
  return status ? String(status[1][1]) : "anzahl";
}

export function antwortFuer(s: InfoSzenario, a: Abfrage): Antwort {
  const art = einordnen(a);
  if (s.fehler.includes(art)) return { error: { message: `nicht erreichbar (${art})` } };
  if (art === "erste") return { data: s.erste };
  if (art === "nachtraege") return { data: s.nachtraege };
  if (art.startsWith("pakete@")) {
    const [von, bis] = a.kette.find(([m]) => m === "range")![1] as [number, number];
    return { data: s.paketeLeer ? null : s.paketZeilen.slice(von, bis + 1) };
  }
  return { count: s.zahlen[art as Zaehlung] };
}

function zufallsErsteZeile(r: Zufall): Record<string, unknown> {
  return setze(
    {},
    {
      titel: vielleicht(r, [null, "buch a"]),
      bereich: vielleicht(r, [null, "recht"]),
      quellenart: vielleicht(r, [null, "fachliteratur", "unsinn"]),
      pruefen_bis: vielleicht(r, [null, "2027-01-01"]),
      hochgeladen_von: vielleicht(r, [null, "u1"]),
      seiten_fehlend: vielleicht(r, [null, "", "0", "3", "abc"]),
      seiten_stellen: vielleicht(r, [null, "48-49 (47)"]),
      seiten_orte: vielleicht(r, [null, "1:500"]),
    },
  );
}

export function zufallsInfoSzenario(r: Zufall): InfoSzenario {
  const anzahl = r.wahl([null, 0, 1, 3, 3, 7, 999, 1000, 1001, 2000, 2001]);
  const a = anzahl ?? 0;
  const teil = () => r.wahl([anzahl, anzahl, Math.max(0, a - 1), 0, null, a + 1]);
  const laenge = r.wahl([0, a, a, Math.max(0, a - 1), Math.min(a, 5)]);
  const paketZeilen = Array.from({ length: laenge }, (_, i) =>
    setze({}, { paket: vielleicht(r, [null, "", "0", "1", "2", "3", String(i + 1)]), gesamt: vielleicht(r, [null, "", "0", "2", "3", "5", "abc"]) }),
  );
  const fehlerArten = ["anzahl", "upload", "ungeprueft", "freigegeben", "abgelehnt", "erste", "nachtraege", "pakete@0", "pakete@1000"];
  return {
    quelleId: r.wahl(["upload:0123456789abcdef0123456789abcdef", "recht/a.md"]),
    zahlen: { anzahl, upload: teil(), ungeprueft: teil(), freigegeben: teil(), abgelehnt: teil() },
    erste: r.wahl([null, [], [zufallsErsteZeile(r)], [zufallsErsteZeile(r)], [zufallsErsteZeile(r), zufallsErsteZeile(r)]]),
    nachtraege: r.wahl([null, [], [{ seiten: "48" }], [{ seiten: "48" }, { seiten: "50-51" }], [{ seiten: "" }], [{ seiten: "" }, { seiten: "" }]]),
    paketZeilen,
    paketeLeer: r.ja(0.05),
    fehler: r.ja(0.35) ? Array.from({ length: r.ganz(1, 2) }, () => r.wahl(fehlerArten)) : [],
  };
}

// ---- entscheideUeberUpload ------------------------------------------------------------------------------------------------------

export interface EntscheidSzenario {
  aktion: FreigabeAktion;
  quelleId: string;
  umgebung: Record<string, string | undefined>;
  schema: string;
  info: FreigabeInfo;
  /** ladeFreigabeInfo scheitert mit einem Error, mit einem Text oder gar nicht. */
  ladeFehler: "error" | "text" | null;
  jetzt: string;
  seitenBestaetigt?: string | null;
  seitenVermerk?: string | null;
  vermerkAblage: "ok" | "fehlt" | "fehler";
  entscheide: "alle" | "weniger" | "fehler";
  verlaengere: "alle" | "keine" | "fehler";
}

export const PRUEFER = "pruefer-1";

export function zufallsEntscheidSzenario(r: Zufall): EntscheidSzenario {
  // "unsinn" kommt aus keinem Aufrufer, zeigt aber, dass alles ausser freigeben und verlaengern wie ablehnen behandelt wird.
  const aktion = r.wahl(["freigeben", "freigeben", "freigeben", "ablehnen", "verlaengern", "verlaengern", "unsinn"]) as FreigabeAktion;
  const status = aktion === "verlaengern" ? ["freigegeben", "freigegeben", "freigegeben", "ungeprueft", "abgelehnt", "gemischt", null] : ["ungeprueft", "ungeprueft", "ungeprueft", "freigegeben", "abgelehnt", "gemischt", null];
  const info = setze(
    {
      anzahl: r.wahl([0, 3, 3, 3, 3, 5]),
      fremd: r.wahl([0, 0, 0, 0, 0, 0, 0, 1]),
      titel: r.wahl([null, "Buch A"]),
      bereich: r.wahl([null, "recht"]),
      quellenart: r.wahl([null, "unsinn", ...QUELLENARTEN]),
      pruefstatus: r.wahl(status) as FreigabeInfo["pruefstatus"],
      hochgeladenVon: r.wahl([null, "", PRUEFER, "hochlader-2", "hochlader-2", "hochlader-2"]),
      pruefenBis: r.wahl([null, "", "2026-01-01", "2026-10-13", "2026-10-14", "2026-10-15", "2027-01-01"]),
      unvollstaendig: r.ja(0.15),
    } as FreigabeInfo,
    {
      seitenFehlend: vielleicht(r, [0, 0, 2, 2, 3, 3, 5]),
      seitenStellen: vielleicht(r, [null, "48-49 (47)", "48-49 (47)", "48-49 (47), 120 (118)", "48-49 (47), 120 (118)", "2@105-107 (PDF 106-108)", "48-49 (47) +2", "kaputt"]),
      seitenOrte: vielleicht(r, [null, "1:500", "1:500,2:100"]),
      seitenNachgeladen: vielleicht(r, [null, "48", "48-49", "120", "48-49, 120", "x"]),
    },
  );
  return setze(
    {
      aktion,
      quelleId: r.ja(0.92) ? "upload:0123456789abcdef0123456789abcdef" : r.wahl(["upload:xyz", "recht/a.md", ""]),
      umgebung: r.wahl([{}, {}, {}, {}, {}, { VERCEL_ENV: "production" }, { VERCEL_ENV: "preview" }, { VERCEL_ENV: "preview", WISSEN_UPLOAD_PREVIEW_OK: "true" }]),
      schema: r.wahl(["public", "public", "public_preview"]),
      info,
      ladeFehler: r.wahl([null, null, null, null, null, null, null, null, "error", "text"]),
      jetzt: r.wahl(["2026-10-14T08:00:00.000Z", "2026-10-14T23:59:59.000Z", "2026-02-28T12:00:00.000Z"]),
      vermerkAblage: r.wahl(["ok", "ok", "ok", "ok", "fehlt", "fehler"]),
      entscheide: r.wahl(["alle", "alle", "alle", "alle", "weniger", "fehler"]),
      verlaengere: r.wahl(["alle", "alle", "alle", "keine", "fehler"]),
    } as EntscheidSzenario,
    {
      seitenBestaetigt: vielleicht(r, [null, "", "48-49", "48-49", "48-49, 120", "48-49, 120", "48", "120", "105-106", "abc", "49-48", "48-49, 120, 300"]),
      seitenVermerk: vielleicht(r, [null, "", "ab", "  Leere\u0007 Seiten  ", "x".repeat(400), "Leere Seiten im Buch"]),
    },
  );
}
