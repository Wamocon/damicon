import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { KennzahlBox, TrendPfeil } from "../../src/components/dashboard/kennzahl-box";
import type { Datenherkunft, Kpi } from "../../src/lib/domain/kpis";
import { kachelInhalt } from "../../src/lib/domain/kachel-form";
import { imMarkup, pruefer, rendere, SPRACHEN, texteVon } from "./hilfen/ansicht-probe";

// Charakterisierung der Kennzahlkachel (dashboard/kennzahl-box.tsx), ohne Browser (seit 14.10.2026):
//   * Kopf und Tooltip: Kurzname, langer Name, Rechenweg nur bei gerechneten Werten mit Basis, Kurzname fällt auf das Label zurück.
//   * Wertzeile: Zahl und Einheit aus gerechneten Werten und aus dem unterschriebenen Platzhalter, Heldengröße, Trendpfeil je Richtung.
//   * Fußzeile: Ampelpunkt, Zieltext und Zielstand (verfehlt, knapp, erfüllt, offen, Platzhalter, ohne Ziel).
//   * jede Form: Meter (mit und ohne Achse), Heldenzahl, nur Wert, Zähler, Punkte, Rangliste, Punktstreifen, Histogramm, dazu die Fälle,
//     in denen eine gewünschte Form mangels Ziel, Grundgesamtheit oder Einzelwerten nichts zeichnet.
//   * Lücke: nur auf Anforderung und nur beim Platzhalter, Text je Datenherkunft.
//   * seit dem Zerlegen (14.10.2026) die Variantenwahl kachelInhalt() aus lib/domain/kachel-form.ts als reine Funktion, je Form.
// Die Kachel hat keinen Zustand und keine Effekte, alles Sichtbare entsteht beim ersten Aufbau.
// Aufruf: npm run test:kennzahl-box

const { pruefe, ende } = pruefer();

type Texte = Record<string, Record<string, unknown>>;
const de = texteVon("de") as Texte & { kpis: Record<string, { label: string; kurz?: string; basis?: string }> };
const k = de.dashboard.kennzahl as {
  ohneZiel: string;
  platzhalter: string;
  zielstand: Record<string, string>;
  luecke: Record<string, string>;
};
const ZIEL = (de.dashboard.home as { target: string }).target;

const basis: Kpi = {
  key: "verlustquote",
  zone: "hof",
  wert: "8,4 %",
  ziel: "< 6 %",
  gutRichtung: "down",
  platzhalter: true,
  datenherkunft: "berechenbar",
  stufe: "kern",
  sichtbarFuer: ["admin"],
  braucht: "nichts",
};
const gerechnet = (zahl: number, einheit: string, datensaetze = 10) => ({ zahl, einheit, basis: "Probe", datensaetze });
const verteilung3 = [
  { name: "CH-A", wert: 30 },
  { name: "CH-B", wert: 72 },
  { name: "CH-C", wert: 50 },
];
const kuehlung: Kpi = { ...basis, key: "zeitBisVorkuehlung", wert: "47 min", ziel: "< 60 min", form: "streifen", gerechnet: gerechnet(47, "min") };

type Optionen = { platz?: "schmal" | "breit"; verteilung?: { name: string; wert: number }[]; lueckeZeigen?: boolean };
const box = (kpi: Kpi, o: Optionen = {}, loc = "de") => rendere(<KennzahlBox kpi={kpi} platz={o.platz} verteilung={o.verteilung} lueckeZeigen={o.lueckeZeigen} />, loc);

// ---- Auszüge aus dem Markup ---------------------------------------------------------------------------------------------------------
const kopf = (html: string) => {
  const m = html.match(/^<div title="([^"]*)" class="flex h-full min-w-0 flex-col rounded-xl border border-border bg-card p-3"><p class="line-clamp-2 min-h-8 text-\[11px\] font-semibold leading-4 text-card-foreground">([^<]*)<\/p><p class="mt-1 hidden min-h-8 text-\[10px\] leading-4 text-muted-foreground @md:line-clamp-2">([^<]*)<\/p><div class="flex min-h-\[76px\] flex-col justify-start">/);
  return m ? { titel: m[1], kurz: m[2], lang: m[3] } : null;
};
const wertZeile = (html: string) => html.match(/<p class="mt-2 flex items-baseline gap-1">(.*?)<\/p>/)?.[1] ?? null;
const zahl = (html: string) => {
  const m = wertZeile(html)?.match(/^<span class="truncate font-black text-foreground ([^"]+)">([^<]*)<\/span>/);
  return m ? { klasse: m[1], text: m[2] } : null;
};
const einheit = (html: string) => wertZeile(html)?.match(/<span class="shrink-0 text-\[11px\] font-medium text-muted-foreground">([^<]*)<\/span>/)?.[1] ?? null;
const pfeil = (html: string) => wertZeile(html)?.match(/<svg [^>]*class="lucide ([^"]+)"/)?.[1] ?? null;
const fuss = (html: string) => {
  const m = html.match(/<p class="mt-auto flex flex-wrap items-center gap-x-1\.5 pt-2 text-\[10px\] leading-4"><span aria-hidden="true" class="h-1\.5 w-1\.5 shrink-0 rounded-full ([^"]+)"><\/span><span class="text-muted-foreground">([^<]*)<\/span><span class="ml-auto shrink-0 font-semibold ([^"]+)">([^<]*)<\/span><\/p><\/div>$/);
  return m ? `${m[1]}|${m[2]}|${m[3]}|${m[4]}` : null;
};
const METER = '<div class="relative h-3.5 rounded bg-primary/10">';
const achse = (html: string) => html.match(/<div class="mt-1 flex justify-between text-\[10px\] tabular-nums text-muted-foreground"><span>([^<]*)<\/span><span>([^<]*)<\/span><span>([^<]*)<\/span><\/div>/)?.slice(1).join("|") ?? null;
const zaehler = (html: string) => {
  const m = html.match(/<div class="mt-2 flex flex-1 flex-col justify-center"><p class="text-xl font-black leading-none ([^"]+)">([^<]*)<\/p><p class="mt-1\.5 text-\[11px\] leading-4 text-muted-foreground">([^<]*)<\/p><\/div>/);
  return m ? `${m[1]}|${m[2]}|${m[3]}` : null;
};
const punkte = (html: string) => {
  const m = html.match(/<p class="flex items-baseline gap-1\.5"><span class="text-xl font-black leading-none">([^<]*)<\/span><span class="text-\[11px\] font-medium text-muted-foreground">([^<]*)<\/span><\/p><div class="mt-2\.5 flex flex-wrap gap-1\.5">(.*?)<\/div>/);
  if (!m) return null;
  const kreise = [...m[3]!.matchAll(/class="h-4 w-4 rounded-full border-2 ([^"]+)"/g)].map((t) => t[1]);
  return `${m[1]}|${m[2]}|${kreise.join(",")}`;
};
const ranglisteNamen = (html: string) => [...html.matchAll(/<div class="grid grid-cols-\[minmax\(0,1fr\)_2fr_auto\] items-center gap-2 text-\[11px\]"><span class="truncate text-muted-foreground">([^<]*)<\/span>/g)].map((m) => m[1]).join(",");
const STREIFEN = '<div class="relative h-12">';
const PUNKT = "absolute top-[21px] h-3 w-3";
const HISTOGRAMM = '<div class="absolute inset-x-0 bottom-2 top-4 flex items-end gap-px">';
const schwelle = (html: string) => html.match(/<span class="absolute top-0 z-10 -translate-x-1\/2 whitespace-nowrap text-\[10px\] text-muted-foreground" style="left:[^"]*">([^<]*)<\/span>/)?.[1] ?? null;
const streifenFuss = (html: string) => {
  const m = html.match(/<div class="flex justify-between gap-2 text-\[10px\] tabular-nums text-muted-foreground"><span>([^<]*)<\/span>(?:<span class="truncate font-medium">([^<]*)<\/span>)?<span>([^<]*)<\/span><\/div>/);
  return m ? `${m[1]}|${m[2] ?? "-"}|${m[3]}` : null;
};
const ausreisser = (html: string) => html.match(/<span class="absolute top-9 block max-w-\[55%\] -translate-x-1\/2 truncate text-\[10px\] text-muted-foreground" style="left:[^"]*">([^<]*)<\/span>/)?.[1] ?? null;
const luecke = (html: string) => {
  const m = html.match(/<div title="([^"]*)" class="mt-2 border-t border-dashed border-border pt-1\.5 text-\[10px\] leading-4 text-muted-foreground"><p class="font-semibold text-card-foreground">([^<]*)<\/p><p class="line-clamp-2">([^<]*)<\/p><\/div><\/div>/);
  return m ? `${m[1]}|${m[2]}|${m[3]}` : null;
};
/** Was im Körper der Kachel steht, in der Reihenfolge des Markups. */
const koerper = (html: string) =>
  [
    [wertZeile(html), "wert"],
    [html.includes(METER) ? 1 : null, "meter"],
    [zaehler(html), "zaehler"],
    [punkte(html), "punkte"],
    [ranglisteNamen(html) || null, "rangliste"],
    [html.includes(STREIFEN) ? 1 : null, "streifen"],
    [luecke(html), "luecke"],
  ]
    .filter(([wert]) => wert !== null)
    .map(([, name]) => name)
    .join("+");

// ---- 1. Kopf und Tooltip -----------------------------------------------------------------------------------------------------------
{
  const v = de.kpis.verlustquote!;
  const platzhalter = box(basis);
  pruefe("Kopf: baut ohne Fehler und ohne fehlenden Schlüssel auf", platzhalter.fehler.length === 0, platzhalter.fehler.join(" | "));
  pruefe(
    "Kopf: Platzhalter zeigt Kurzname, langen Namen und im Tooltip nur das Label",
    JSON.stringify(kopf(platzhalter.html)) === JSON.stringify({ titel: imMarkup(v.label), kurz: imMarkup(v.kurz!), lang: imMarkup(v.label) }),
    JSON.stringify(kopf(platzhalter.html)),
  );
  const mitBasis = box({ ...basis, gerechnet: gerechnet(7.7, "%") });
  pruefe("Kopf: gerechnet mit Basis steht der Rechenweg hinter dem Label im Tooltip", kopf(mitBasis.html)?.titel === imMarkup(`${v.label} - ${v.basis}`), kopf(mitBasis.html)?.titel);
  const ohneBasis = box({ ...basis, key: "vermarktungsfaehig", gerechnet: gerechnet(91, "%") });
  pruefe("Kopf: gerechnet ohne Basis bleibt das Label im Tooltip", kopf(ohneBasis.html)?.titel === imMarkup(de.kpis.vermarktungsfaehig!.label), kopf(ohneBasis.html)?.titel);

  // Ein Schlüssel ohne Kurzform: der Kopf trägt dann das volle Label.
  const texte = { ...de, kpis: { ...de.kpis, probeOhneKurz: { label: "Probe mit langem Namen" } } };
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="de" timeZone="Europe/Berlin" messages={texte}>
      <KennzahlBox kpi={{ ...basis, key: "probeOhneKurz" }} />
    </NextIntlClientProvider>,
  );
  pruefe("Kopf: ohne Kurzform steht das volle Label auch oben", JSON.stringify(kopf(html)) === JSON.stringify({ titel: "Probe mit langem Namen", kurz: "Probe mit langem Namen", lang: "Probe mit langem Namen" }), JSON.stringify(kopf(html)));
}

// ---- 2. Wertzeile: Zahl und Einheit ------------------------------------------------------------------------------------------------
{
  const faelle: [string, Kpi, string, string | null][] = [
    ["gerechnet, auf eine Nachkommastelle gerundet", { ...basis, gerechnet: gerechnet(7.75, "%") }, "7,8", "%"],
    ["gerechnet, ganze Zahl mit Einheit", { ...basis, wert: "446 ₸/kg", ziel: "> 700 ₸/kg", gutRichtung: "up", gerechnet: gerechnet(446.04, "₸/kg") }, "446", "₸/kg"],
    ["Platzhalter mit Dezimalkomma", basis, "8,4", "%"],
    ["Platzhalter mit Vorzeichen und Leerraum", { ...basis, wert: "  -3,5 kg " }, "-3,5", "kg"],
    ["Platzhalter ohne Zahl bleibt ganz stehen", { ...basis, wert: "n. v." }, "n. v.", null],
    ["Platzhalter ohne Einheit", { ...basis, wert: "12" }, "12", null],
  ];
  for (const [name, kpi, z, e] of faelle) {
    const { html } = box(kpi);
    pruefe(`Wert: ${name}`, zahl(html)?.text === imMarkup(z) && einheit(html) === e && zahl(html)?.klasse === "text-xl", `${zahl(html)?.text}|${einheit(html)}|${zahl(html)?.klasse}`);
  }
}

// ---- 3. Trendpfeil -----------------------------------------------------------------------------------------------------------------
{
  const pfeilIn = (trend: Kpi["trend"], gutRichtung: "up" | "down") => pfeil(box({ ...basis, trend, gutRichtung }).html);
  const IN_BOX = "ml-auto h-3.5 w-3.5 self-center";
  pruefe("Trend: ohne Richtung kein Pfeil", pfeilIn(undefined, "down") === null && pfeilIn(null, "up") === null);
  pruefe("Trend: steigt und steigen ist gut, grün", pfeilIn("up", "up") === `lucide-arrow-up-right shrink-0 text-success ${IN_BOX}`, pfeilIn("up", "up") ?? "");
  pruefe("Trend: steigt und steigen ist schlecht, rot", pfeilIn("up", "down") === `lucide-arrow-up-right shrink-0 text-destructive ${IN_BOX}`, pfeilIn("up", "down") ?? "");
  pruefe("Trend: fällt und fallen ist gut, grün", pfeilIn("down", "down") === `lucide-arrow-down-right shrink-0 text-success ${IN_BOX}`, pfeilIn("down", "down") ?? "");
  pruefe("Trend: fällt und fallen ist schlecht, rot", pfeilIn("down", "up") === `lucide-arrow-down-right shrink-0 text-destructive ${IN_BOX}`, pfeilIn("down", "up") ?? "");
  pruefe("Trend: waagerecht, grau", pfeilIn("flat", "up") === `lucide-minus shrink-0 text-muted-foreground ${IN_BOX}` && pfeilIn("flat", "down") === `lucide-minus shrink-0 text-muted-foreground ${IN_BOX}`, pfeilIn("flat", "up") ?? "");

  const allein = (kpi: Kpi, className?: string) => renderToStaticMarkup(<TrendPfeil kpi={kpi} className={className} />);
  pruefe("Trend allein: ohne Richtung leer", allein(basis) === "");
  pruefe("Trend allein: Grundgröße h-4 w-4", allein({ ...basis, trend: "up", gutRichtung: "up" }).includes('class="lucide lucide-arrow-up-right h-4 w-4 shrink-0 text-success"'));
  pruefe("Trend allein: eigene Klasse überschreibt die Größe", allein({ ...basis, trend: "flat" }, "h-6 w-6").includes('class="lucide lucide-minus shrink-0 text-muted-foreground h-6 w-6"'));
}

// ---- 4. Fußzeile -------------------------------------------------------------------------------------------------------------------
{
  const zielText = (ziel: string) => imMarkup(`${ZIEL} ${ziel}`);
  pruefe("Fuß: Platzhalter ohne Ampel", fuss(box(basis).html) === `bg-muted-foreground/50|${zielText("< 6 %")}|text-muted-foreground|${k.platzhalter}`, fuss(box(basis).html) ?? "");
  const verfehlt = box({ ...basis, gerechnet: gerechnet(7.7, "%") }).html;
  pruefe("Fuß: gerechnet und verfehlt, rot", fuss(verfehlt) === `bg-destructive|${zielText("< 6 %")}|text-destructive|${k.zielstand.verfehlt}`, fuss(verfehlt) ?? "");
  const knapp = box({ ...basis, gerechnet: gerechnet(6.3, "%") }).html;
  pruefe("Fuß: knapp daneben, gelb", fuss(knapp) === `bg-warning|${zielText("< 6 %")}|text-warning|${k.zielstand.knapp}`, fuss(knapp) ?? "");
  const erfuellt = box({ ...basis, gerechnet: gerechnet(5.2, "%") }).html;
  pruefe("Fuß: im Ziel, grüner Punkt und graue Schrift", fuss(erfuellt) === `bg-success|${zielText("< 6 %")}|text-muted-foreground|${k.zielstand.erfuellt}`, fuss(erfuellt) ?? "");
  const ohneZiel = box({ ...basis, ziel: "Ausgangswert", gerechnet: gerechnet(5.2, "%") }).html;
  pruefe("Fuß: ohne Zielzahl steht kein Zielwert", fuss(ohneZiel) === `bg-muted-foreground/50|${imMarkup(k.ohneZiel)}|text-muted-foreground|${k.zielstand.offen}`, fuss(ohneZiel) ?? "");
  const nullZiel = box({ ...basis, ziel: "0 %", gerechnet: gerechnet(1, "%") }).html;
  pruefe("Fuß: Ziel null ist ein Zielwert, aber nicht auswertbar", fuss(nullZiel) === `bg-muted-foreground/50|${zielText("0 %")}|text-muted-foreground|${k.zielstand.offen}`, fuss(nullZiel) ?? "");
}

// ---- 5. Formen -------------------------------------------------------------------------------------------------------------------
{
  const meterSchmal = box({ ...basis, gerechnet: gerechnet(7.7, "%") }).html;
  pruefe("Meter schmal: Wert und Meter, ohne Achse", koerper(meterSchmal) === "wert+meter" && achse(meterSchmal) === null, koerper(meterSchmal));
  const meterBreit = box({ ...basis, gerechnet: gerechnet(7.7, "%") }, { platz: "breit" }).html;
  pruefe("Meter breit: Achse von null über das Ziel bis zur Skala", koerper(meterBreit) === "wert+meter" && achse(meterBreit) === `0|${ZIEL} 6|10 %`, achse(meterBreit) ?? "");
  pruefe(
    "Meter: Zielmarke und Istbalken auf der Skala",
    meterBreit.includes('style="left:0;width:60%"') && meterBreit.includes('class="absolute top-[3px] h-2 rounded bg-destructive" style="left:0;width:77%"'),
  );
  const meterAufwaerts = box({ ...basis, key: "liefertreue", wert: "71 %", ziel: "> 95 %", gutRichtung: "up", gerechnet: gerechnet(71.25, "%") }, { platz: "breit" }).html;
  pruefe("Meter aufwärts: erlaubter Bereich rechts vom Ziel, Skala bis 100", meterAufwaerts.includes('style="left:95%;right:0"') && achse(meterAufwaerts) === `0|${ZIEL} 95|100 %`, achse(meterAufwaerts) ?? "");
  const platzhalter = box(basis, { platz: "breit" }).html;
  pruefe("Meter: ein Platzhalter bekommt kein Meter", koerper(platzhalter) === "wert", koerper(platzhalter));

  const held = box({ ...basis, form: "held", gerechnet: gerechnet(7.7, "%") }, { platz: "breit" }).html;
  pruefe("Held breit: große Zahl mit Meter und Achse", zahl(held)?.klasse === "text-4xl leading-none tracking-tight sm:text-5xl" && koerper(held) === "wert+meter" && achse(held) === `0|${ZIEL} 6|10 %`, zahl(held)?.klasse);
  const heldSchmal = box({ ...basis, form: "held", gerechnet: gerechnet(7.7, "%") }).html;
  pruefe("Held schmal: fällt auf das Meter zurück", zahl(heldSchmal)?.klasse === "text-xl" && koerper(heldSchmal) === "wert+meter");
  const heldOhneZiel = box({ ...basis, ziel: "Ausgangswert", form: "held", gerechnet: gerechnet(7.7, "%") }, { platz: "breit" }).html;
  pruefe("Held ohne Zielzahl: große Zahl, kein Meter", zahl(heldOhneZiel)?.klasse === "text-4xl leading-none tracking-tight sm:text-5xl" && koerper(heldOhneZiel) === "wert");

  const nurWert = box({ ...basis, ziel: "Ausgangswert", gerechnet: gerechnet(7.7, "%") }, { platz: "breit" }).html;
  pruefe("Wert: ohne Zielzahl nur die Zahl", koerper(nurWert) === "wert", koerper(nurWert));

  const nullFehler = { ...basis, key: "behandlungenWartezeit", wert: "100 %", ziel: "100 %", gutRichtung: "up" as const, form: "zaehler" as const };
  const verletzt = box({ ...nullFehler, gerechnet: gerechnet(75, "%", 4) }).html;
  pruefe("Zähler: ersetzt die Zahl, eine Verletzung von vier, rot", koerper(verletzt) === "zaehler" && zaehler(verletzt) === "text-destructive|1|1 von 4 verletzt", zaehler(verletzt) ?? "");
  const sauber = box({ ...nullFehler, gerechnet: gerechnet(100, "%", 4) }).html;
  pruefe("Zähler: keine Verletzung, grün", zaehler(sauber) === "text-success|0|0 von 4 verletzt", zaehler(sauber) ?? "");
  const ohneProzent = box({ ...nullFehler, ziel: "< 60 min", gutRichtung: "down", gerechnet: gerechnet(47, "min", 4) }).html;
  pruefe("Zähler ohne Prozent: keine Grundgesamtheit, nur die Zahl", koerper(ohneProzent) === "wert" && zahl(ohneProzent)?.text === "47" && einheit(ohneProzent) === "min", koerper(ohneProzent));

  const abdeckung = { ...basis, key: "esutdAbdeckung", wert: "60 %", ziel: "> 90 %", gutRichtung: "up" as const, form: "punkte" as const };
  const teilweise = box({ ...abdeckung, gerechnet: gerechnet(60, "%", 5) }).html;
  pruefe(
    "Punkte: drei von fünf, gefüllte Punkte gelb",
    koerper(teilweise) === "punkte" && punkte(teilweise) === "3|von 5|border-warning bg-warning,border-warning bg-warning,border-warning bg-warning,border-border,border-border",
    punkte(teilweise) ?? "",
  );
  const vollstaendig = box({ ...abdeckung, gerechnet: gerechnet(100, "%", 3) }).html;
  pruefe("Punkte: vollständig, alle grün", punkte(vollstaendig) === "3|von 3|border-success bg-success,border-success bg-success,border-success bg-success", punkte(vollstaendig) ?? "");
  const punkteOhneDaten = box(abdeckung).html;
  pruefe("Punkte als Platzhalter: keine Grundgesamtheit, Wert", koerper(punkteOhneDaten) === "wert");

  const streuung = { ...basis, key: "pflueckStreuung", wert: "1,8 x", ziel: "< 1,5 x", form: "rangliste" as const, gerechnet: gerechnet(1.8, "x") };
  const rangliste = box(streuung, { platz: "breit", verteilung: [{ name: "Aliya", wert: 9.5 }, { name: "Bek", wert: 5.25 }] }).html;
  pruefe("Rangliste breit: Wert und je eine Zeile", koerper(rangliste) === "wert+rangliste" && ranglisteNamen(rangliste) === "Aliya,Bek", koerper(rangliste));
  pruefe("Rangliste: Schwelle aus dem Ziel, über der Schwelle gelb", (rangliste.match(/block h-full rounded bg-warning/g) ?? []).length === 2);
  const ranglisteEinzeln = box(streuung, { platz: "breit", verteilung: [{ name: "Aliya", wert: 9.5 }] }).html;
  pruefe("Rangliste mit nur einem Wert: Meter", koerper(ranglisteEinzeln) === "wert+meter", koerper(ranglisteEinzeln));
  const ranglisteOhneZiel = box({ ...streuung, ziel: "Ausgangswert" }, { platz: "breit", verteilung: [{ name: "Aliya", wert: 9.5 }, { name: "Bek", wert: 5.25 }] }).html;
  pruefe("Rangliste ohne Zielzahl: nur der Wert", koerper(ranglisteOhneZiel) === "wert", koerper(ranglisteOhneZiel));
}

// ---- 6. Verteilung: Punktstreifen und Histogramm -----------------------------------------------------------------------------------
{
  const streifen = box(kuehlung, { platz: "breit", verteilung: verteilung3 }).html;
  pruefe("Streifen: Wert und Punktstreifen, je Wert ein Punkt", koerper(streifen) === "wert+streifen" && (streifen.split(PUNKT).length - 1) === 3 && !streifen.includes(HISTOGRAMM), koerper(streifen));
  pruefe("Streifen: Schwelle aus dem Ziel", schwelle(streifen) === `${ZIEL} 60`, schwelle(streifen) ?? "");
  pruefe("Streifen: Skala mit Luft, Zählzeile, Einheit am Ende", streifenFuss(streifen) === "24|1 von 3 verletzt|78 min", streifenFuss(streifen) ?? "");
  pruefe("Streifen: fallen ist gut, der größte Wert ist der Ausreißer", ausreisser(streifen) === "CH-B", ausreisser(streifen) ?? "");

  const aufwaerts = box({ ...kuehlung, key: "pflueckleistung", wert: "6 kg/h", ziel: "> 7 kg/h", gutRichtung: "up", gerechnet: gerechnet(6, "kg/h") }, { platz: "breit", verteilung: [{ name: "Aliya", wert: 9 }, { name: "Bek", wert: 4 }, { name: "Dana", wert: 6.5 }, { name: "Erlan", wert: 4 }] }).html;
  pruefe("Streifen: steigen ist gut, der kleinste Wert ist der Ausreißer (der erste bei Gleichstand)", ausreisser(aufwaerts) === "Bek", ausreisser(aufwaerts) ?? "");
  pruefe("Streifen: steigen ist gut, verletzt ist, was unter dem Ziel liegt", streifenFuss(aufwaerts) === "3|3 von 4 verletzt|10 kg/h", streifenFuss(aufwaerts) ?? "");

  const alleImZiel = box(kuehlung, { platz: "breit", verteilung: [{ name: "A", wert: 30 }, { name: "B", wert: 60 }] }).html;
  pruefe("Streifen: niemand daneben, keine Zählzeile (genau auf dem Ziel zählt nicht)", streifenFuss(alleImZiel) === "26|-|64 min", streifenFuss(alleImZiel) ?? "");

  const dreizehn = Array.from({ length: 13 }, (_, i) => ({ name: `C${i}`, wert: 20 + i * 5 }));
  const histogramm = box(kuehlung, { platz: "breit", verteilung: dreizehn }).html;
  pruefe("Histogramm: ab dreizehn Werten Klassen statt Punkte, ohne Ausreißernamen", koerper(histogramm) === "wert+streifen" && histogramm.includes(HISTOGRAMM) && !histogramm.includes(PUNKT) && ausreisser(histogramm) === null, koerper(histogramm));
  pruefe("Histogramm: Zählzeile über alle Werte", streifenFuss(histogramm) === "12|4 von 13 verletzt|88 min", streifenFuss(histogramm) ?? "");
  const zwoelf = box(kuehlung, { platz: "breit", verteilung: dreizehn.slice(0, 12) }).html;
  pruefe("Grenze: bei zwölf Werten noch Punkte mit Ausreißer", zwoelf.includes(PUNKT) && !zwoelf.includes(HISTOGRAMM) && ausreisser(zwoelf) === "C11", ausreisser(zwoelf) ?? "");

  const schmal = box(kuehlung, { verteilung: verteilung3 }).html;
  pruefe("Streifen schmal: Meter statt Streifen", koerper(schmal) === "wert+meter", koerper(schmal));
  const ohneWerte = box(kuehlung, { platz: "breit" }).html;
  pruefe("Streifen ohne Einzelwerte: Meter", koerper(ohneWerte) === "wert+meter", koerper(ohneWerte));
  const ohneZiel = box({ ...kuehlung, ziel: "Ausgangswert" }, { platz: "breit", verteilung: verteilung3 }).html;
  pruefe("Streifen ohne Zielzahl: nur der Wert", koerper(ohneZiel) === "wert", koerper(ohneZiel));
  const nachkomma = box({ ...kuehlung, ziel: "< 60,5 min" }, { platz: "breit", verteilung: [{ name: "A", wert: 10.4 }, { name: "B", wert: 61.6 }] }).html;
  pruefe("Streifen: Schwelle mit einer Nachkommastelle, Skala ganzzahlig", schwelle(nachkomma) === `${ZIEL} 60,5` && streifenFuss(nachkomma) === "4|1 von 2 verletzt|68 min", `${schwelle(nachkomma)} ${streifenFuss(nachkomma)}`);
}

// ---- 7. Lücke ----------------------------------------------------------------------------------------------------------------------
{
  const herkunft: [Datenherkunft, string][] = [
    ["berechenbar", "berechenbar"],
    ["erfassung-fehlt", "erfassungFehlt"],
    ["tabelle-fehlt", "tabelleFehlt"],
    ["rechtlich-ungeklaert", "rechtlichUngeklaert"],
  ];
  for (const [datenherkunft, schluessel] of herkunft) {
    const { html } = box({ ...basis, datenherkunft }, { lueckeZeigen: true });
    const text = imMarkup(k.luecke[schluessel]!);
    pruefe(`Lücke: ${datenherkunft} im Tooltip und im Text, nach dem Wert`, luecke(html) === `${text}|${imMarkup(k.luecke.titel!)}|${text}` && koerper(html) === "wert+luecke", luecke(html) ?? "");
  }
  pruefe("Lücke: ohne Anforderung keine", luecke(box(basis).html) === null);
  pruefe("Lücke: gerechnet keine, auch auf Anforderung", luecke(box({ ...basis, gerechnet: gerechnet(7.7, "%") }, { lueckeZeigen: true }).html) === null);
}

// ---- 8. kachelInhalt: welche Zeichnung eine Form mit den Daten der Kachel bekommt (seit dem Zerlegen, 14.10.2026) ------------------
{
  const art = (form: Parameters<typeof kachelInhalt>[0], kpi: Kpi, werte?: { name: string; wert: number }[]) => JSON.stringify(kachelInhalt(form, kpi, werte));
  const prozent = { ...basis, ziel: "100 %", gutRichtung: "up" as const, gerechnet: gerechnet(75, "%", 4) };
  pruefe("Inhalt: Zähler mit Grundgesamtheit", art("zaehler", prozent) === JSON.stringify({ art: "zaehler", anteil: { erfuellt: 3, gesamt: 4 } }), art("zaehler", prozent));
  pruefe("Inhalt: Punkte mit Grundgesamtheit", art("punkte", prozent) === JSON.stringify({ art: "punkte", anteil: { erfuellt: 3, gesamt: 4 } }), art("punkte", prozent));
  pruefe("Inhalt: Zähler und Punkte ohne Prozent nur der Wert", art("zaehler", { ...prozent, gerechnet: gerechnet(47, "min", 4) }) === '{"art":"wert"}' && art("punkte", basis) === '{"art":"wert"}');
  const gemessen = { ...basis, gerechnet: gerechnet(7.7, "%") };
  pruefe("Inhalt: Meter und Heldenzahl zeichnen das Meter", art("meter", gemessen) === JSON.stringify({ art: "meter", ist: 7.7, soll: 6 }) && art("held", gemessen) === art("meter", gemessen), art("held", gemessen));
  pruefe("Inhalt: Meter ohne Messung oder ohne Zielzahl nur der Wert", art("meter", basis) === '{"art":"wert"}' && art("held", { ...gemessen, ziel: "Ausgangswert" }) === '{"art":"wert"}');
  pruefe("Inhalt: Rangliste und Streifen mit Einzelwerten und Schwelle", art("rangliste", gemessen, verteilung3) === JSON.stringify({ art: "rangliste", werte: verteilung3, soll: 6 }) && art("streifen", gemessen, verteilung3) === JSON.stringify({ art: "streifen", werte: verteilung3, soll: 6 }));
  pruefe("Inhalt: Rangliste und Streifen ohne Einzelwerte oder ohne Zielzahl nur der Wert", art("streifen", gemessen) === '{"art":"wert"}' && art("rangliste", { ...gemessen, ziel: "Ausgangswert" }, verteilung3) === '{"art":"wert"}');
  pruefe("Inhalt: die Form Wert bleibt der Wert, auch mit allen Daten", art("wert", gemessen, verteilung3) === '{"art":"wert"}');
}

// ---- 9. Sprachen -------------------------------------------------------------------------------------------------------------------
for (const loc of SPRACHEN) {
  const proben = [
    box({ ...basis, trend: "up" }, { lueckeZeigen: true }, loc),
    box({ ...basis, ziel: "100 %", gutRichtung: "up", form: "zaehler", gerechnet: gerechnet(75, "%", 4) }, {}, loc),
    box({ ...basis, ziel: "Ausgangswert", gerechnet: gerechnet(7.7, "%") }, {}, loc),
    box(kuehlung, { platz: "breit", verteilung: verteilung3 }, loc),
  ];
  const fehler = proben.flatMap((p) => p.fehler);
  pruefe(`Sprache ${loc}: Platzhalter, Zähler, ohne Ziel und Streifen ohne fehlenden Schlüssel`, fehler.length === 0, fehler.slice(0, 3).join(" | "));
}

ende();
