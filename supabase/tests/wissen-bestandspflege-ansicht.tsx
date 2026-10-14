import { WissenBestandspflege } from "../../src/components/db/wissen-bestandspflege";
import type { WissenDokumentZeile } from "../../src/lib/wissen/dokumente-liste";
import { imMarkup, pruefer, rendere, SPRACHEN, texteVon } from "./hilfen/ansicht-probe";

// Charakterisierung der Karte "Bestand prüfen und bereinigen" (WissenBestandspflege in wissen-bestandspflege.tsx), ohne Browser und ohne
// Datenbank. Über die Angaben erreichbar ist nur der Anfang: Analyse bereit, Zahl der Dokumente ohne Qualitätswert und ob der Knopf dafür frei
// ist. Alles Weitere (Fortschritt, Befunde, Vergleich, Bestätigung, Ergebnis) entsteht erst nach Server-Antworten und wird ab dem Zerlegen
// an den Teilkomponenten geprüft; die Abläufe selbst bleiben Prüfpunkte im Browser.
// Aufruf: npm run test:wissen-bestandspflege-ansicht

const { pruefe, ende } = pruefer();

const de = texteVon("de") as { kiAssistentAnsicht: { wissensVerwaltung: { pflege: Record<string, string> & { qualitaet: Record<string, string> } } } };
const p = de.kiAssistentAnsicht.wissensVerwaltung.pflege;

const dok = (schluessel: string, teil: Partial<WissenDokumentZeile> = {}): WissenDokumentZeile => ({
  schluessel,
  schluesselSpalte: "quelle_id",
  titel: `Dokument ${schluessel}`,
  bereich: "steuer",
  rollen: ["admin"],
  datum: null,
  hochgeladenVon: null,
  hochgeladenVonId: null,
  chunks: 5,
  herkunft: "skript",
  loeschbar: false,
  quellenart: null,
  cluster: null,
  textgrundlage: null,
  stufe: 4,
  rechtsstelle: null,
  nutzung: "ja",
  pruefstatus: "freigegeben",
  pruefenBis: null,
  paketeGesamt: null,
  paketeDa: 0,
  unvollstaendig: false,
  guete: null,
  gueteHinweise: [],
  gueteProzent: null,
  originalGroesse: null,
  seitenFehlend: 0,
  seitenStellen: null,
  seitenVermerk: null,
  seitenBestaetigt: null,
  seitenVermerkt: false,
  seitenNachgeladen: null,
  seitenOffen: 0,
  seitenOffenStellen: null,
  abgelaufen: false,
  url: null,
  ...teil,
});

const karte = (dokumente: readonly WissenDokumentZeile[] | null | undefined, loc = "de") => rendere(<WissenBestandspflege dokumente={dokumente} beiFertig={() => {}} />, loc);
const qualitaetsKnopf = (html: string) => html.match(new RegExp(`<button type="button"[^>]*>${imMarkup(p.qualitaet.knopf)}</button>`))?.[0] ?? "";
const hinweis = (anzahl: number) => imMarkup(p.qualitaet.hinweis.replace("{anzahl}", String(anzahl)));

// ---- 1. Ohne Dokumente ---------------------------------------------------------------------------------------------------------------
for (const [name, dokumente] of [["undefined", undefined], ["null", null], ["leer", []]] as const) {
  const { html, fehler } = karte(dokumente);
  pruefe(`Ohne Dokumente (${name}): baut ohne Fehler auf`, fehler.length === 0 && html.length > 0, fehler.slice(0, 3).join(" | "));
  pruefe(`Ohne Dokumente (${name}): null Dokumente ohne Wert, Knopf gesperrt`, html.includes(hinweis(0)) && qualitaetsKnopf(html).includes('disabled=""'));
}

// ---- 2. Der Anfang der Analyse ---------------------------------------------------------------------------------------------------
{
  const { html } = karte([]);
  pruefe("Anfang: Titel und Einleitung der Karte", html.includes(`>${imMarkup(p.titel)}</p>`) && html.includes(imMarkup(p.lead)));
  pruefe("Anfang: der inhaltliche Vergleich ist angehakt und änderbar", html.includes(`<input type="checkbox" class="mt-0.5" checked=""/><span><span class="font-semibold">${imMarkup(p.mitVergleich)}</span><span class="block text-[11px] text-muted-foreground">${imMarkup(p.mitVergleichHinweis)}</span></span>`));
  pruefe("Anfang: Analyse starten ist frei, kein Abbrechen", html.includes(`<button type="button" class="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50">${imMarkup(p.start)}</button>`) && !html.includes(`>${imMarkup(p.abbrechen)}</button>`));
  pruefe("Anfang: kein Fortschritt, kein Fehler, kein Ergebnis, keine Befunde", !html.includes("<progress") && !html.includes('role="alert"') && !html.includes('role="status"') && !html.includes(imMarkup(p.ladeListe)) && !html.includes("<ul"));
  pruefe("Anfang: Qualitätsbereich mit Trennlinie, ohne Statuszeile", html.includes(`<div class="mt-3 space-y-1 border-t border-border pt-2"><p class="text-[11px] text-muted-foreground">${hinweis(0)}</p>`) && !html.includes(imMarkup(p.qualitaet.fertig.split("{")[0]!)));
}

// ---- 3. Dokumente ohne Qualitätswert -------------------------------------------------------------------------------------------------
{
  const dokumente = [
    dok("upload:a"),
    dok("upload:b", { gueteProzent: 80 }),
    dok("amtlich/merkblatt.md", { schluesselSpalte: "pfad" }),
    dok("upload:c", { chunks: 0 }),
    dok("upload:d", { herkunft: "upload" }),
  ];
  const { html, fehler } = karte(dokumente);
  pruefe("Ohne Wert: zählt nur Dokumente mit quelle_id, Abschnitten und ohne Wert", fehler.length === 0 && html.includes(hinweis(2)), fehler.slice(0, 3).join(" | "));
  pruefe("Ohne Wert: der Knopf ist frei", qualitaetsKnopf(html) !== "" && !qualitaetsKnopf(html).includes('disabled=""'));
  const alleMitWert = karte([dok("upload:e", { gueteProzent: 0 })]);
  pruefe("Wert 0 zählt als berechnet: Knopf gesperrt", alleMitWert.html.includes(hinweis(0)) && qualitaetsKnopf(alleMitWert.html).includes('disabled=""'));
}

// ---- 4. Alle Sprachen --------------------------------------------------------------------------------------------------------------
for (const loc of SPRACHEN) {
  const { fehler } = karte([dok("upload:a")], loc);
  pruefe(`Sprache ${loc}: kein fehlender Schlüssel, kein Fehler`, fehler.length === 0, fehler.slice(0, 3).join(" | "));
}

ende();
