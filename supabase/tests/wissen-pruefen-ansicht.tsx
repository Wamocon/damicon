import type { ComponentProps } from "react";
import { PruefVorschau, SeitenAbdeckung, WissenPruefenKnopf } from "../../src/components/db/wissen-verwaltung";
import { bewerteSeitenAngabe } from "../../src/lib/wissen/seiten-bestaetigung";
import type { WissenDokumentZeile } from "../../src/lib/wissen/dokumente-liste";
import { imMarkup, pruefer, rendere, SPRACHEN, texteVon } from "./hilfen/ansicht-probe";

// Charakterisierung des Prüffensters der Wissensverwaltung (WissenPruefenKnopf in wissen-verwaltung.tsx), ohne Browser und ohne Datenbank.
// Geprüft wird der erste Aufbau (das Fenster steht geschlossen im Markup) für jeden Zustand, den die Angaben des Dokuments erreichen:
// Erstprüfung und Wiedervorlage, mit und ohne Quellenart, Link als Adresse, als Freitext oder fehlend, Lücken im Scan mit bekannten, teils
// unbekannten und ganz unbekannten Stellen. Was erst nach Eingaben entsteht (Abdeckung der Seitenzahlen, Vorschau geladen), prüft ab dem
// Zerlegen die Teilkomponente selbst; das Abschicken und Schließen des Fensters bleibt ein Prüfpunkt im Browser.
// Aufruf: npm run test:wissen-pruefen-ansicht

const { pruefe, ende } = pruefer();

const de = texteVon("de") as { roles: Record<string, string>; kiAssistentAnsicht: { wissensVerwaltung: Record<string, Record<string, unknown>> } };
const w = de.kiAssistentAnsicht.wissensVerwaltung;
const pr = w.pruefung as Record<string, string> & { seiten: Record<string, string>; nachladen: Record<string, string> };
const liste = w.liste as Record<string, string>;

const basis: WissenDokumentZeile = {
  schluessel: "upload:abc123",
  schluesselSpalte: "quelle_id",
  titel: "Kommentar zum Steuerkodex",
  bereich: "steuer",
  rollen: ["admin", "buchhaltung"],
  datum: "2026-10-01",
  hochgeladenVon: "Anna Admin",
  hochgeladenVonId: "u-anna",
  chunks: 42,
  herkunft: "upload",
  loeschbar: true,
  quellenart: "fachliteratur",
  cluster: "buecher",
  textgrundlage: "original",
  stufe: 4,
  rechtsstelle: null,
  nutzung: "hinweis",
  pruefstatus: "ungeprueft",
  pruefenBis: null,
  paketeGesamt: 3,
  paketeDa: 3,
  unvollstaendig: false,
  guete: "gut",
  gueteHinweise: [],
  gueteProzent: 91,
  originalGroesse: 2048,
  seitenFehlend: 0,
  seitenStellen: null,
  seitenVermerk: null,
  seitenBestaetigt: null,
  seitenVermerkt: false,
  seitenNachgeladen: null,
  seitenOffen: 0,
  seitenOffenStellen: null,
  abgelaufen: false,
  url: "https://example.org/kommentar",
};

const knopf = (d: WissenDokumentZeile, artName: string | null = "Fachliteratur", loc = "de") =>
  rendere(<WissenPruefenKnopf dokument={d} bereichName="Steuern" artName={artName} beiErgebnis={() => {}} />, loc);
/** Das öffnende Tag des Knopfs mit diesem value (Freigeben, Ablehnen, Verlängern) oder "". */
const absenden = (html: string, wert: string) => html.match(new RegExp(`<button[^>]*value="${wert}"[^>]*>`))?.[0] ?? "";
const zeile = (html: string, dt: string, dd: string) => html.includes(`${imMarkup(dt)}: </dt><dd class="inline`) && new RegExp(`${imMarkup(dt)}: </dt><dd class="[^"]*">${imMarkup(dd).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</dd>`).test(html);

// ---- 1. Erstprüfung eines hochgeladenen Buchs ohne Lücken ---------------------------------------------------------------------------
{
  const { html, fehler } = knopf(basis);
  pruefe("Erstprüfung: baut ohne Fehler und ohne fehlenden Schlüssel auf", fehler.length === 0 && html.length > 0, fehler.slice(0, 3).join(" | "));
  pruefe("Erstprüfung: Knopf heißt Prüfen und öffnet ein Fenster mit Titel", html.startsWith(`<button type="button" class="inline-flex h-7`) && html.includes(`>${pr.knopf}</button>`) && html.includes(`aria-labelledby="pruefen-titel-upload:abc123"`) && html.includes(`<h3 id="pruefen-titel-upload:abc123" class="text-sm font-black">${imMarkup(pr.titel)}</h3>`));
  pruefe("Erstprüfung: das Formular trägt die Kennung des Dokuments", html.includes(`<input type="hidden" name="quelle_id" value="upload:abc123"/>`));
  pruefe("Erstprüfung: Dokument und Bereich stehen im Fenster", zeile(html, "Dokument", "Kommentar zum Steuerkodex") && zeile(html, "Bereich", "Steuern"));
  pruefe("Erstprüfung: Quellenart mit Cluster, Stufe und Nutzung", zeile(html, liste.quellenart, `Fachliteratur, Bücher, ${liste.stufe} 4, Nur Hinweis`));
  pruefe("Erstprüfung: Rollen, hochgeladen von und Zahl der Abschnitte", zeile(html, liste.rollen, `${de.roles.admin}, ${de.roles.buchhaltung}`) && zeile(html, liste.von, "Anna Admin") && zeile(html, "Abschnitte", "42"));
  pruefe("Erstprüfung: ein brauchbarer Link wird zum Link", html.includes(`<a href="https://example.org/kommentar" target="_blank" rel="noreferrer noopener" class="underline">https://example.org/kommentar</a>`));
  pruefe("Erstprüfung: Einschätzung mit Überschrift steht im Fenster", html.includes(`<p class="font-semibold">${imMarkup(String((w.einschaetzung as Record<string, string>).titel))}: `));
  pruefe("Erstprüfung: die Vorschau zeigt zuerst den Ladehinweis", html.includes(`leading-4">${imMarkup(pr.vorschauLaedt)}</div>`) && html.includes(`>${imMarkup(pr.vorschau)}</p>`));
  pruefe("Erstprüfung: das Original-PDF ist eingebunden (Upload, nicht Wiedervorlage)", html.includes(`>${imMarkup(String((w.original as Record<string, string>).titel))}</p>`));
  pruefe("Erstprüfung: ohne offene Lücken kein Abschnitt zu fehlenden Seiten und kein Nachladen", !html.includes(imMarkup(pr.seiten.titel)) && !html.includes("seiten_bestaetigt") && !html.includes(imMarkup(pr.nachladen.titel)));
  pruefe("Erstprüfung: Hinweis zum Vier-Augen-Prinzip", html.includes(`<p role="note" class="rounded-lg border border-warning/30 bg-warning/[0.08] p-2 text-xs font-semibold text-warning">${imMarkup(pr.hinweis)}</p>`));
  pruefe("Erstprüfung: Abbrechen, Ablehnen und Freigeben, beide frei; kein Verlängern", html.includes(`>${pr.abbrechen}</button>`) && /type="submit"/.test(absenden(html, "ablehnen")) && !absenden(html, "ablehnen").includes('disabled=""') && /type="submit"/.test(absenden(html, "freigeben")) && !absenden(html, "freigeben").includes('disabled=""') && absenden(html, "verlaengern") === "");
  pruefe("Erstprüfung: Reihenfolge der Knöpfe Abbrechen, Ablehnen, Freigeben", html.indexOf(`>${pr.abbrechen}</button>`) < html.indexOf(`value="ablehnen"`) && html.indexOf(`value="ablehnen"`) < html.indexOf(`value="freigeben"`));
}

// ---- 2. Wiedervorlage (freigegeben und abgelaufen): Lücken zählen nicht mehr ----------------------------------------------------------
{
  const d: WissenDokumentZeile = { ...basis, pruefstatus: "freigegeben", abgelaufen: true, seitenOffen: 2, seitenOffenStellen: "48-49 (47)" };
  const { html, fehler } = knopf(d);
  pruefe("Wiedervorlage: baut ohne Fehler auf", fehler.length === 0, fehler.slice(0, 3).join(" | "));
  pruefe("Wiedervorlage: Knopf und Titel für die erneute Prüfung", html.includes(`>${imMarkup(pr.knopfErneut)}</button>`) && html.includes(`>${imMarkup(pr.titelErneut)}</h3>`));
  pruefe("Wiedervorlage: keine Einschätzung, kein Original, keine Lücken", !html.includes(`<p class="font-semibold">${imMarkup(String((w.einschaetzung as Record<string, string>).titel))}: `) && !html.includes(`>${imMarkup(String((w.original as Record<string, string>).titel))}</p>`) && !html.includes("seiten_bestaetigt"));
  pruefe("Wiedervorlage: Hinweis für die Wiedervorlage", html.includes(`text-warning">${imMarkup(pr.hinweisErneut)}</p>`) && !html.includes(imMarkup(pr.hinweis) + "</p>"));
  pruefe("Wiedervorlage: nur Verlängern, frei; kein Ablehnen und kein Freigeben", /type="submit"/.test(absenden(html, "verlaengern")) && !absenden(html, "verlaengern").includes('disabled=""') && absenden(html, "ablehnen") === "" && absenden(html, "freigeben") === "");
}

// ---- 3. Offene Lücken mit bekannten Stellen und Nachtrag ----------------------------------------------------------------------------
{
  const d: WissenDokumentZeile = { ...basis, seitenFehlend: 4, seitenStellen: "48-49 (47), 120 (118), 200 (190)", seitenOffen: 3, seitenOffenStellen: "48-49 (47), 120 (118)", seitenNachgeladen: "200" };
  const { html, fehler } = knopf(d);
  pruefe("Lücken: baut ohne Fehler auf", fehler.length === 0, fehler.slice(0, 3).join(" | "));
  pruefe("Lücken: Abschnitt mit Überschrift und Zahl der offenen Seiten", html.includes(`<div role="group" aria-labelledby="pruefen-titel-upload:abc123-seiten"`) && html.includes(`<p id="pruefen-titel-upload:abc123-seiten" class="text-[11px] font-semibold text-warning">${imMarkup(pr.seiten.titel)}</p>`) && html.includes(imMarkup(pr.seiten.text.replace("{anzahl}", "3").replace("{stellen}", "48-49 (47), 120 (118)"))));
  pruefe("Lücken: die schon nachgeladenen Seiten werden genannt", html.includes(imMarkup(pr.seiten.nachgeladen.replace("{seiten}", "200"))));
  pruefe("Lücken: Regel und Erklärung der Schreibweise", html.includes(imMarkup(pr.seiten.regel)) && html.includes(imMarkup(pr.seiten.erklaerung)));
  pruefe("Lücken: alle Stellen bekannt, also kein Hinweis auf unbekannte Seiten", !html.includes("text-[11px] font-semibold text-destructive\">3 ") && !/weitere fehlende Seite/.test(html));
  pruefe("Lücken: Feld für die bestätigten Seitenzahlen, leer, höchstens 400 Zeichen, beschrieben durch die Abdeckung", /<input maxLength="400" inputMode="text" autoComplete="off" aria-describedby="pruefen-titel-upload:abc123-abdeckung" placeholder="[^"]+" class="w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground" name="seiten_bestaetigt" value=""\/>/.test(html));
  pruefe("Lücken: die Abdeckung meldet, dass noch nichts angegeben ist, ohne übrige Seiten", html.includes(`<div id="pruefen-titel-upload:abc123-abdeckung" role="status" aria-live="polite" class="space-y-0.5 text-[11px]"><p class="text-muted-foreground">${imMarkup(pr.seiten.nochNichts)}</p></div>`));
  pruefe("Lücken: Feld für den Grund (höchstens 300 Zeichen) und Knopf mit dem Vorschlag", /<input maxLength="300" placeholder="[^"]+" class="w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground" name="seiten_vermerk" value=""\/>/.test(html) && html.includes(`<button type="button" class="inline-flex h-7 items-center rounded-lg border border-border px-2 text-[11px] font-semibold">${imMarkup(pr.seiten.vorschlag)}</button>`));
  pruefe("Lücken: Freigeben ist gesperrt und sagt warum, Ablehnen geht", absenden(html, "freigeben").includes(`disabled=""`) && !absenden(html, "ablehnen").includes('disabled=""') && html.includes(`<p class="text-[11px] font-semibold text-destructive">${imMarkup(pr.seiten.gesperrt)}</p>`));
  pruefe("Lücken: das Nachladen der Seiten ist eingebunden", html.includes(`aria-label="${imMarkup(pr.nachladen.titel)}"`));
}

// ---- 4. Lücken nur teilweise einzeln bekannt (Rückfall auf seitenStellen) -----------------------------------------------------------
{
  const d: WissenDokumentZeile = { ...basis, seitenFehlend: 5, seitenStellen: "48-49 (47)", seitenOffen: 5, seitenOffenStellen: null };
  const { html, fehler } = knopf(d);
  pruefe("Teilweise bekannt: baut ohne Fehler auf", fehler.length === 0, fehler.slice(0, 3).join(" | "));
  pruefe("Teilweise bekannt: die Stellen kommen aus seitenStellen", html.includes(imMarkup(pr.seiten.text.replace("{anzahl}", "5").replace("{stellen}", "48-49 (47)"))));
  pruefe("Teilweise bekannt: drei Seiten sind nicht einzeln bekannt", html.includes(`<p class="text-[11px] font-semibold text-destructive">3 weitere fehlende Seiten sind nicht einzeln bekannt`));
  pruefe("Teilweise bekannt: ohne Nachtrag kein Satz dazu", !html.includes("Bereits nachgeladen"));
}

// ---- 5. Lücken ganz ohne Stellen --------------------------------------------------------------------------------------------------
{
  const d: WissenDokumentZeile = { ...basis, seitenFehlend: 1, seitenOffen: 1, seitenStellen: null, seitenOffenStellen: null };
  const { html, fehler } = knopf(d);
  pruefe("Ohne Stellen: baut ohne Fehler auf, Stellen als Strich, eine Seite unbekannt", fehler.length === 0 && html.includes(imMarkup(pr.seiten.text.replace("{anzahl}", "1").replace("{stellen}", "-"))) && html.includes(`<p class="text-[11px] font-semibold text-destructive">Eine weitere fehlende Seite ist nicht einzeln bekannt`), fehler.slice(0, 3).join(" | "));
}

// ---- 6. Bestand ohne Quellenart, Link als Freitext, ohne Rollen und ohne Person -----------------------------------------------------
{
  const d: WissenDokumentZeile = { ...basis, herkunft: "skript", loeschbar: false, quellenart: null, cluster: null, stufe: null, nutzung: "ja", rollen: [], hochgeladenVon: null, hochgeladenVonId: null, url: "kodeksy-kz.com ; https://prg.kz/kodeks" };
  const { html, fehler } = knopf(d, null);
  pruefe("Bestand: baut ohne Fehler auf", fehler.length === 0, fehler.slice(0, 3).join(" | "));
  pruefe("Bestand: ohne Quellenart keine Zeile dazu", !html.includes(`${imMarkup(liste.quellenart)}: </dt>`));
  pruefe("Bestand: ohne Rollen ein Strich, ohne Person das Einlese-Skript", zeile(html, liste.rollen, "-") && zeile(html, liste.von, liste.vonSkript));
  pruefe("Bestand: Freitext bleibt Text, der enthaltene Link wird zusätzlich angeboten", html.includes(`kodeksy-kz.com ; https://prg.kz/kodeks <a href="https://prg.kz/kodeks" target="_blank" rel="noreferrer noopener" class="underline">↗</a>`));
  pruefe("Bestand: kein Original-PDF (nur bei Uploads), aber die Einschätzung", !html.includes(`>${imMarkup(String((w.original as Record<string, string>).titel))}</p>`) && html.includes(`<p class="font-semibold">${imMarkup(String((w.einschaetzung as Record<string, string>).titel))}: `));
}

// ---- 7. Quellenart ohne Cluster und Stufe, Nutzung als Notbehelf, ohne Link --------------------------------------------------------
{
  const d: WissenDokumentZeile = { ...basis, quellenart: "internetquelle", cluster: null, stufe: null, nutzung: "notfalls", url: null };
  const { html, fehler } = knopf(d, "Internetquelle");
  pruefe("Notbehelf: Quellenart nur mit der Nutzung", fehler.length === 0 && zeile(html, liste.quellenart, "Internetquelle, Nur Notbehelf"), fehler.slice(0, 3).join(" | "));
  pruefe("Notbehelf: ohne Link keine Zeile Quelle", !html.includes(`${imMarkup(liste.link)}: </dt>`));
}
{
  const d: WissenDokumentZeile = { ...basis, nutzung: "ja" };
  const { html } = knopf(d);
  pruefe("Normale Nutzung: kein Zusatz hinter der Stufe", zeile(html, liste.quellenart, `Fachliteratur, Bücher, ${liste.stufe} 4`));
}

// ---- 8. Seitenangabe als reine Funktion (seit dem Zerlegen, 14.10.2026) ---------------------------------------------------------------
// Was erst nach der Eingabe der korrekt fehlenden Seiten entsteht: Abdeckung, übrige Seiten, Sperre der Freigabe.
{
  const mitLuecken: WissenDokumentZeile = { ...basis, seitenFehlend: 3, seitenOffen: 3, seitenOffenStellen: "48-49 (47), 120 (118)" };
  const leerAngabe = bewerteSeitenAngabe(mitLuecken, false, "");
  pruefe("Seitenangabe: offene Lücken ohne Angabe sperren die Freigabe", leerAngabe.luecken && leerAngabe.angabe.seiten.length === 0 && !leerAngabe.seitenOk && leerAngabe.unbekannt === 0 && leerAngabe.gelesen.luecken.length === 2);
  const voll = bewerteSeitenAngabe(mitLuecken, false, "48-49, 120");
  pruefe("Seitenangabe: alle Lücken abgedeckt gibt frei", voll.abdeckung.ok && voll.seitenOk && voll.abdeckung.bestaetigt.length === 3 && voll.abdeckung.uebrig.length === 0);
  const teil = bewerteSeitenAngabe(mitLuecken, false, "48");
  pruefe("Seitenangabe: teilweise abgedeckt sperrt, zwei Seiten bleiben offen", !teil.abdeckung.ok && !teil.seitenOk && teil.abdeckung.fehlendOffen === 2);
  const ungueltig = bewerteSeitenAngabe(mitLuecken, false, "48-49x");
  pruefe("Seitenangabe: ungültige Angabe sperrt", !!ungueltig.angabe.fehler && !ungueltig.seitenOk);
  const uebrig = bewerteSeitenAngabe(mitLuecken, false, "48-49, 120, 300");
  pruefe("Seitenangabe: Seiten ohne Lücke zählen nicht, die Freigabe bleibt möglich", uebrig.seitenOk && uebrig.abdeckung.uebrig.join() === "300");
  const unbekannt = bewerteSeitenAngabe({ ...mitLuecken, seitenOffen: 5 }, false, "48-49, 120");
  pruefe("Seitenangabe: nicht einzeln bekannte Seiten lassen sich nicht bestätigen", unbekannt.unbekannt === 2 && !unbekannt.abdeckung.ok && !unbekannt.seitenOk);
  const rueckfall = bewerteSeitenAngabe({ ...mitLuecken, seitenOffenStellen: null, seitenStellen: "48-49 (47)", seitenOffen: 2 }, false, "48-49");
  pruefe("Seitenangabe: ohne offene Stellen gelten die Stellen der Prüfung", rueckfall.gelesen.luecken.length === 1 && rueckfall.seitenOk);
  const erneut = bewerteSeitenAngabe(mitLuecken, true, "");
  pruefe("Seitenangabe: bei der Wiedervorlage zählen Lücken nicht", !erneut.luecken && erneut.seitenOk);
  const ohne = bewerteSeitenAngabe(basis, false, "");
  pruefe("Seitenangabe: ohne offene Lücken frei", !ohne.luecken && ohne.seitenOk);

  const abdeckung = (eingabe: string, d: WissenDokumentZeile = mitLuecken) => {
    const s = bewerteSeitenAngabe(d, false, eingabe);
    return rendere(<SeitenAbdeckung id="x-abdeckung" angabe={s.angabe} abdeckung={s.abdeckung} />).html;
  };
  pruefe("Abdeckung: noch nichts angegeben", abdeckung("") === `<div id="x-abdeckung" role="status" aria-live="polite" class="space-y-0.5 text-[11px]"><p class="text-muted-foreground">${imMarkup(pr.seiten.nochNichts)}</p></div>`);
  pruefe("Abdeckung: ungültig, ohne Liste übriger Seiten", abdeckung("48, 300x") === `<div id="x-abdeckung" role="status" aria-live="polite" class="space-y-0.5 text-[11px]"><p class="font-semibold text-destructive">${imMarkup(pr.seiten.angabeUngueltig)}</p></div>`);
  pruefe("Abdeckung: alles abgedeckt mit Zahl der Seiten", abdeckung("48-49, 120").includes(`<p class="font-semibold">Alle offenen Lücken sind abgedeckt (3 Seiten als korrekt fehlend bestätigt).</p>`));
  pruefe("Abdeckung: nicht abgedeckt mit Zahl und Stellen", abdeckung("48").includes(`<p class="break-words font-semibold text-destructive">Nicht abgedeckt: 2 Seiten, Stellen: 49 (47), 120 (118).`));
  pruefe("Abdeckung: nur Unbekanntes offen, Stellen als Strich", abdeckung("48-49, 120", { ...mitLuecken, seitenOffen: 5 }).includes("Nicht abgedeckt: 0 Seiten, Stellen: -."));
  pruefe("Abdeckung: übrige Seiten werden genannt", abdeckung("48-49, 120, 300").includes(`<p class="break-words text-muted-foreground">Diese Seitenzahlen gehören zu keiner offenen Lücke und zählen nicht: 300.</p>`));
  pruefe("Abdeckung: höchstens zwölf übrige Seiten, dann Auslassung", abdeckung("48-49, 120, 300-313").includes("zählen nicht: 300, 301, 302, 303, 304, 305, 306, 307, 308, 309, 310, 311 ...."));

  const vorschau = (v: ComponentProps<typeof PruefVorschau>["vorschau"]) => rendere(<PruefVorschau vorschau={v} />).html.match(/leading-4">([^<]*)<\/div>/)?.[1];
  pruefe("Vorschau: vor dem Laden und beim Laden der Ladehinweis", vorschau(null) === imMarkup(pr.vorschauLaedt) && vorschau("laedt") === imMarkup(pr.vorschauLaedt));
  pruefe("Vorschau: Fehler und geladener Text", vorschau({ text: "", fehler: true }) === imMarkup(pr.vorschauFehler) && vorschau({ text: "Erster Satz <b>", fehler: false }) === "Erster Satz &lt;b&gt;");
}

// ---- 9. Alle Sprachen: kein fehlender Schlüssel in den Zuständen mit den meisten Texten -----------------------------------------------
for (const loc of SPRACHEN) {
  const zustaende: [string, WissenDokumentZeile, string | null][] = [
    ["Erstprüfung", basis, "Fachliteratur"],
    ["Wiedervorlage", { ...basis, pruefstatus: "freigegeben", abgelaufen: true }, "Fachliteratur"],
    ["Lücken", { ...basis, seitenOffen: 5, seitenStellen: "48-49 (47)", seitenNachgeladen: "200" }, null],
  ];
  for (const [name, d, art] of zustaende) {
    const { fehler } = knopf(d, art, loc);
    pruefe(`Sprache ${loc}, ${name}: kein fehlender Schlüssel, kein Fehler`, fehler.length === 0, fehler.slice(0, 3).join(" | "));
  }
}

ende();
