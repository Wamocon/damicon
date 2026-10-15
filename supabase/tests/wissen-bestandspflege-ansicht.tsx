import type { ComponentProps } from "react";
import { ArtFilterLeiste, BefundEintrag, EntfernenBestaetigung, PflegeErgebnis, PflegeFortschritt, WissenBestandspflege } from "../../src/components/db/wissen-bestandspflege";
import type { EntfernenAntwort } from "../../src/lib/actions/wissen-bestandspflege";
import type { Befund, BefundArt, DokumentBefunde } from "../../src/lib/wissen/bestandspflege";
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
  weitereBereiche: [],
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

// ---- 4. Teilkomponenten (seit dem Zerlegen, 14.10.2026): was erst nach Server-Antworten erscheint ------------------------------------
const befund = (schluessel: string, befunde: Befund[], teil: Partial<WissenDokumentZeile> = {}): DokumentBefunde => ({ dokument: dok(schluessel, teil), befunde, stufe: befunde[0]?.stufe ?? "hinweis" });
const pflegeTexte = p as unknown as { ergebnis: Record<string, string> & { code: Record<string, string> }; vergleich: Record<string, string>; bestaetigung: Record<string, string>; art: Record<string, string>; stufe: Record<string, string>; herkunft: Record<string, string> };
{
  const fortschritt = (phase: "bereit" | "laeuft" | "fertig" | "fehler", f: { fertig: number; gesamt: number } | null) => rendere(<PflegeFortschritt phase={phase} fortschritt={f} />).html;
  pruefe("Fortschritt: die Liste wird geladen, noch ohne Balken", fortschritt("laeuft", null) === `<div role="status" aria-live="polite" class="mt-2 space-y-1"><p class="text-xs font-semibold text-card-foreground">${imMarkup(p.ladeListe)}</p></div>`);
  pruefe("Fortschritt: Vergleich mit Zahl und Balken", fortschritt("laeuft", { fertig: 3, gesamt: 10 }).includes(`Inhaltlicher Vergleich: 3 von 10 Dokumenten</p><progress class="h-1.5 w-full" max="10" value="3" aria-label="${imMarkup(p.fortschrittBalken)}"></progress>`));
  pruefe("Fortschritt: ohne Dokumente bleibt der Balken bei mindestens 1", fortschritt("laeuft", { fertig: 0, gesamt: 0 }).includes(`max="1" value="0"`));
  pruefe("Fortschritt: Fehler als Meldung, bereit und fertig ohne Anzeige", fortschritt("fehler", null) === `<p role="alert" class="mt-2 text-xs font-semibold text-destructive">${imMarkup(p.fehler)}</p>` && fortschritt("bereit", null) === "" && fortschritt("fertig", { fertig: 1, gesamt: 1 }) === "");

  const ergebnis = (antwort: EntfernenAntwort) => rendere(<PflegeErgebnis antwort={antwort} />).html;
  const e = pflegeTexte.ergebnis;
  pruefe("Ergebnis: ohne Berechtigung", ergebnis({ zugriff: false, ergebnisse: [] }) === `<div role="status" class="mt-3 space-y-1 rounded-lg border border-border bg-muted/30 p-2.5 text-xs"><p class="font-semibold text-destructive">${imMarkup(e.zugriff!)}</p></div>`);
  pruefe("Ergebnis: falsche Bestätigung", ergebnis({ zugriff: true, bestaetigungFalsch: true, ergebnisse: [] }).includes(imMarkup(e.bestaetigungFalsch!)));
  const gemischt = ergebnis({
    zugriff: true,
    ergebnisse: [
      { quelleId: "upload:a", titel: "A", status: "entfernt", abschnitte: 5 },
      { quelleId: "upload:e", titel: "E", status: "entfernt", abschnitte: 7, gewichteOffen: true },
      { quelleId: "upload:b", titel: "B", status: "schonWeg", abschnitte: 0 },
      { quelleId: "upload:c", titel: "C", status: "fehler", abschnitte: 0, code: "loeschen" },
      { quelleId: "", titel: null, status: "fehler", abschnitte: 0, code: "grabstein" },
    ],
  });
  pruefe("Ergebnis: entfernt mit Summe der Abschnitte, schon weg, Wortgewichte offen", gemischt.includes("2 Dokumente entfernt (12 Abschnitte).") && gemischt.includes("1 Dokument war schon entfernt.") && gemischt.includes(imMarkup(e.gewichteOffen!)));
  pruefe("Ergebnis: jeder Fehler mit Kennung und Grund, ohne Kennung ein Strich", gemischt.includes(`upload:c: nicht entfernt (${imMarkup(e.code.loeschen!)})`) && gemischt.includes(`-: nicht entfernt (${imMarkup(e.code.grabstein!)})`));
  pruefe("Ergebnis: ohne Code der unbekannte Fehler", ergebnis({ zugriff: true, ergebnisse: [{ quelleId: "upload:x", titel: null, status: "fehler", abschnitte: 0 }] }).includes(`(${imMarkup(e.code.unbekannt!)})`) && !ergebnis({ zugriff: true, ergebnisse: [] }).includes("entfernt ("));

  const befunde = [
    befund("upload:a", [{ art: "arbeitsdokument", stufe: "entfernen", grund: "arbeitsdokument" }]),
    befund("upload:b", [{ art: "dublette", stufe: "entfernen", grund: "dublette", wert: "Original", vergleichMit: "upload:c", anteil: 0.8, minimum: 0.9 }, { art: "herkunft", stufe: "hinweis", grund: "keinLink" }]),
    befund("upload:d", [{ art: "dublette", stufe: "pruefen", grund: "dublette", wert: "X" }]),
  ];
  const filter = (artFilter: BefundArt | null) => rendere(<ArtFilterLeiste befunde={befunde} artFilter={artFilter} beiWahl={() => {}} />).html;
  const knoepfe = (html: string) => [...html.matchAll(/<button type="button" aria-pressed="(true|false)"[^>]*class="([^"]*)">([^<]*)(?:<!-- -->)?([^<]*)<\/button>/g)].map((m) => `${m[1]}|${m[2].endsWith("bg-muted") ? "aktiv" : ""}|${m[3]}${m[4]}`);
  pruefe("Filter: Alle und nur die vorkommenden Arten mit Zahl der Dokumente", knoepfe(filter(null)).join(" / ") === `true|aktiv|Alle (3) / false||${pflegeTexte.art.arbeitsdokument} (1) / false||${pflegeTexte.art.dublette} (2) / false||${pflegeTexte.art.herkunft} (1)`, knoepfe(filter(null)).join(" / "));
  pruefe("Filter: die gewählte Art ist gedrückt und hervorgehoben", knoepfe(filter("dublette")).join(" / ") === `false||Alle (3) / false||${pflegeTexte.art.arbeitsdokument} (1) / true|aktiv|${pflegeTexte.art.dublette} (2) / false||${pflegeTexte.art.herkunft} (1)`, knoepfe(filter("dublette")).join(" / "));

  const formular = { grund: "Dublette", setGrund: () => {}, geprueft: true, setGeprueft: () => {}, zahl: "2", setZahl: () => {} };
  const bestaetigung = (kannEntfernen: boolean, laeuft: boolean, f = formular) => rendere(<EntfernenBestaetigung ausgewaehlt={befunde.slice(0, 2)} formular={f} kannEntfernen={kannEntfernen} laeuft={laeuft} beiEntfernen={() => {}} beiZurueck={() => {}} />).html;
  const b = pflegeTexte.bestaetigung;
  const offen = bestaetigung(true, false);
  pruefe("Bestätigung: Fenster mit Titel, Zahl der Dokumente und Summe der Abschnitte", offen.startsWith(`<div role="alertdialog" aria-label="${imMarkup(b.titel!)}"`) && offen.includes("2 Dokumente mit 10 Abschnitten werden aus der Wissensbasis entfernt."));
  pruefe("Bestätigung: jedes Dokument mit Zahl der Abschnitte", offen.includes(`<li>Dokument upload:a <span class="text-muted-foreground">(5)</span></li><li>Dokument upload:b <span class="text-muted-foreground">(5)</span></li>`));
  pruefe("Bestätigung: Grund, Haken und Zahl mit den Eingaben", offen.includes(`<input type="text" maxLength="300" placeholder="${imMarkup(b.grundBeispiel!)}" class="w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground" value="Dublette"/>`) && offen.includes(`<input type="checkbox" class="mt-0.5" checked=""/><span>${imMarkup(b.geprueft!)}</span>`) && offen.includes(`<input type="text" inputMode="numeric" class="w-24 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground" value="2"/>`) && offen.includes("Zur Bestätigung die Zahl der Dokumente eintippen (2)"));
  pruefe("Bestätigung: Entfernen frei, Zurück frei", offen.includes(`<button type="button" class="inline-flex h-8 items-center rounded-lg bg-destructive px-3 text-xs font-semibold text-destructive-foreground disabled:opacity-50">${imMarkup(b.los!)}</button><button type="button" class="${"inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs font-semibold disabled:opacity-50"}">${imMarkup(b.zurueck!)}</button>`));
  pruefe("Bestätigung: ohne vollständige Angaben gesperrt", bestaetigung(false, false, { ...formular, geprueft: false }).includes(`<button type="button" disabled="" class="inline-flex h-8 items-center rounded-lg bg-destructive`) && bestaetigung(false, false, { ...formular, geprueft: false }).includes(`<input type="checkbox" class="mt-0.5"/>`));
  pruefe("Bestätigung: während des Entfernens Hinweis und Zurück gesperrt", bestaetigung(false, true).includes(`>${imMarkup(b.laeuft!)}</button><button type="button" disabled=""`));

  const eintrag = (d: DokumentBefunde, gewaehlt = false, vergleiche: ComponentProps<typeof BefundEintrag>["vergleiche"] = {}) =>
    rendere(<BefundEintrag b={d} gewaehlt={gewaehlt} beiWahl={() => {}} vergleiche={vergleiche} beiVergleich={async () => {}} />).html;
  const dublette = befunde[1]!;
  const zu = eintrag(dublette, true);
  pruefe("Befund: Auswahl angehakt, Titel, Stufe und Herkunft", zu.includes(`<input type="checkbox" class="mt-0.5" aria-label="Dokument upload:b auswählen" checked=""/><span class="break-words">Dokument upload:b</span>`) && zu.includes(`>${imMarkup(pflegeTexte.stufe.entfernen!)}</span>`) && zu.includes(`>${imMarkup(pflegeTexte.herkunft.bestand!)}</span>`) && zu.includes(">5 Abschnitte</p>"));
  pruefe("Befund: Begründung mit Wert und Anteilen, Vergleich noch zu", zu.includes(`<span class="font-semibold">${imMarkup(pflegeTexte.art.dublette!)}:</span> Fast derselbe Text wie &quot;Original&quot; (80 % der geprüften Abschnitte, mindestens 90 % Ähnlichkeit).`) && zu.includes(`<button type="button" class="font-semibold underline">${imMarkup(pflegeTexte.vergleich.an!)}</button></li>`));
  pruefe("Befund: ohne Vergleichspartner kein Knopf", zu.includes(`<span class="font-semibold">${imMarkup(pflegeTexte.art.herkunft!)}:</span> Kein brauchbarer Link zur Quelle: die Herkunft ist nicht prüfbar.</li>`));
  pruefe("Befund: ohne quelle_id nicht wählbar, hochgeladen", eintrag(befund("amtlich/x.md", [{ art: "veraltet", stufe: "pruefen", grund: "jahrAlt", wert: "2019" }], { schluesselSpalte: "pfad", herkunft: "upload" })).includes(`<input type="checkbox" class="mt-0.5" disabled="" aria-label="Dokument amtlich/x.md auswählen"/>`) && eintrag(befund("amtlich/x.md", [{ art: "veraltet", stufe: "pruefen", grund: "jahrAlt", wert: "2019" }], { schluesselSpalte: "pfad", herkunft: "upload" })).includes(`>${imMarkup(pflegeTexte.herkunft.upload!)}</span>`));
  const v = pflegeTexte.vergleich;
  pruefe("Vergleich: lädt", eintrag(dublette, false, { "upload:b|upload:c": { laedt: true, paare: [], titel: null, fehler: false } }).includes(`>${imMarkup(v.zu!)}</button><span class="ml-1 text-muted-foreground">${imMarkup(v.laedt!)}</span>`));
  pruefe("Vergleich: Fehler oder keine Paare", eintrag(dublette, false, { "upload:b|upload:c": { laedt: false, paare: [{ aehnlichkeit: 0.5, bestand: "x", gegenueber: "y" }], titel: null, fehler: true } }).includes(`<span class="ml-1 text-destructive">${imMarkup(v.keine!)}</span>`) && eintrag(dublette, false, { "upload:b|upload:c": { laedt: false, paare: [], titel: "T", fehler: false } }).includes(`<span class="ml-1 text-destructive">${imMarkup(v.keine!)}</span>`));
  const paare = eintrag(dublette, false, { "upload:b|upload:c": { laedt: false, paare: [{ aehnlichkeit: 0.934, bestand: "Text A", gegenueber: "Text B" }], titel: "Original", fehler: false } });
  pruefe("Vergleich: Abschnitte im Wortlaut nebeneinander mit Ähnlichkeit", paare.includes(`<div class="grid gap-2 rounded-md border border-border p-2 sm:grid-cols-2"><div><p class="text-[11px] font-semibold">${imMarkup(v.dieses!)}</p><p class="whitespace-pre-wrap break-words text-[11px] text-muted-foreground">Text A</p></div><div><p class="text-[11px] font-semibold">&quot;Original&quot; (93 % Ähnlichkeit)</p><p class="whitespace-pre-wrap break-words text-[11px] text-muted-foreground">Text B</p></div></div>`));
}

// ---- 5. Alle Sprachen --------------------------------------------------------------------------------------------------------------
for (const loc of SPRACHEN) {
  const { fehler } = karte([dok("upload:a")], loc);
  pruefe(`Sprache ${loc}: kein fehlender Schlüssel, kein Fehler`, fehler.length === 0, fehler.slice(0, 3).join(" | "));
  const teile = rendere(
    <>
      <PflegeFortschritt phase="laeuft" fortschritt={{ fertig: 1, gesamt: 2 }} />
      <PflegeFortschritt phase="fehler" fortschritt={null} />
      <PflegeErgebnis antwort={{ zugriff: false, bestaetigungFalsch: true, ergebnisse: [{ quelleId: "a", titel: null, status: "entfernt", abschnitte: 1, gewichteOffen: true }, { quelleId: "b", titel: null, status: "schonWeg", abschnitte: 0 }, { quelleId: "c", titel: null, status: "fehler", abschnitte: 0, code: "umgebung" }] }} />
      <BefundEintrag b={befund("upload:a", [{ art: "abgedeckt", stufe: "pruefen", grund: "abgedeckt", wert: "Buch", vergleichMit: "upload:z", anteil: 0.5, minimum: 0.8 }])} gewaehlt={false} beiWahl={() => {}} vergleiche={{ "upload:a|upload:z": { laedt: false, paare: [{ aehnlichkeit: 0.9, bestand: "a", gegenueber: "b" }], titel: "Buch", fehler: false } }} beiVergleich={async () => {}} />
      <EntfernenBestaetigung ausgewaehlt={[befund("upload:a", [])]} formular={{ grund: "", setGrund: () => {}, geprueft: false, setGeprueft: () => {}, zahl: "", setZahl: () => {} }} kannEntfernen={false} laeuft={false} beiEntfernen={() => {}} beiZurueck={() => {}} />
    </>,
    loc,
  );
  pruefe(`Sprache ${loc}, Teilkomponenten: kein fehlender Schlüssel, kein Fehler`, teile.fehler.length === 0, teile.fehler.slice(0, 3).join(" | "));
}

ende();
