// Tests der Bestandspflege (Analysen und Entfernen), ohne Datenbank und ohne Netz:
//   * bestandspflege.ts: Heuristiken (Arbeitsdokument, Rohbefund, veraltet, Jahr, Link, Wiedervorlage), Nähe (Dublette, durch Buch abgedeckt, teilweise),
//     Zusammenfassung und Zählung
//   * bestandspflege-entfernen.ts: Grabstein vor dem Löschen, Wortgewichte zurückgerechnet, wiederholbar, Vorschau-Schutz, Eingabe, Fehlerwege
// Aufruf: npm run test:wissen-bestandspflege (läuft über tsx, damit die @/-Pfade auflösen).

import { baueBefunde, bewerteNaehe, heuristischeBefunde, ohneEntfernte, SCHWELLEN, staerksteStufe, zaehleBefunde, type DokumentNaehe, type NaeheProbe } from "@/lib/wissen/bestandspflege";
import { entferneDokument, istQuelleId, PflegeFehler, type BestandsSpeicher } from "@/lib/wissen/bestandspflege-entfernen";
import type { WissenDokumentZeile } from "@/lib/wissen/dokumente-liste";

let gesamt = 0;
let fehler = 0;
function pruefe(name: string, ok: boolean, detail = "") {
  gesamt++;
  if (!ok) fehler++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
}

const HEUTE = "2026-10-13";

function dok(teil: Partial<WissenDokumentZeile> & { titel: string }): WissenDokumentZeile {
  return {
    schluessel: teil.schluessel ?? `bestand/${teil.titel}.md`,
    schluesselSpalte: "quelle_id",
    bereich: "legal",
    weitereBereiche: [],
    rollen: ["admin"],
    datum: null,
    hochgeladenVon: null,
    hochgeladenVonId: null,
    chunks: 5,
    herkunft: "skript",
    loeschbar: false,
    quellenart: "fachliteratur",
    cluster: "internet",
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
    gueteProzent: null, originalGroesse: null, seitenFehlend: 0, seitenStellen: null, seitenVermerk: null, seitenBestaetigt: null, seitenVermerkt: false, seitenNachgeladen: null, seitenOffen: 0, seitenOffenStellen: null,
    abgelaufen: false,
    url: "https://example.org/quelle",
    ...teil,
  };
}

const proben = (werte: number[], ziel: { quelleId: string; titel: string; istUpload: boolean }): NaeheProbe[] => werte.map((w) => ({ aehnlichkeit: w, ...ziel }));
const naeheVon = (d: WissenDokumentZeile, p: NaeheProbe[]): DokumentNaehe => ({ schluessel: d.schluessel, proben: p });
const buch = { quelleId: "upload:aaa", titel: "Steuerkodex (Buch)", istUpload: true };
const anderes = { quelleId: "bestand/anderes.md", titel: "Anderes Dokument", istUpload: false };

// ---- Heuristiken --------------------------------------------------------------------------------------------------------
{
  const art = (t: string, teil: Partial<WissenDokumentZeile> = {}) => heuristischeBefunde(dok({ titel: t, ...teil }), HEUTE);
  const hat = (b: ReturnType<typeof art>, grund: string) => b.some((x) => x.grund === grund);

  for (const t of ["Index: damicon-audit-kb-kasachstan", "README: Wissensdatenbank Kasachstan", "Auftrag: Audit-Fachliteratur 2021–2026", "Auftrag Widerlegungsrunde (19.09.2026)", "Gemeinsamer Auftrag für die Rechercheagenten (Phase 1 und 2)", "Research-Plan: Audit in Kasachstan", "Quellenkarte", "Suchbegriffe je Agent und Sprache", "Lücken und offene Fragen", "Вопросы к аудитору / юристу в Республике Казахстан"]) {
    const b = art(t);
    pruefe(`Arbeitsdokument erkannt: ${t.slice(0, 40)}`, hat(b, "arbeitsdokument") && b.find((x) => x.grund === "arbeitsdokument")?.stufe === "entfernen");
  }
  pruefe("Fachdokument ist kein Arbeitsdokument", !hat(art("Steuerkodex 214-VIII, Spiegelportal (artikelweise)"), "arbeitsdokument") && !hat(art("Gesetz Nr. 94-V über personenbezogene Daten"), "arbeitsdokument"));
  pruefe("Pfad index.md zählt als Arbeitsdokument", hat(art("Übersicht", { schluessel: "audit/Audit/damicon-audit-kb/index.md" }), "arbeitsdokument"));
  const roh = art("Handel und Aussenhandel - Rohbefund (P12 bis P15)");
  pruefe("Rohbefund: nur prüfen, nicht entfernen", hat(roh, "rohbefund") && roh.find((x) => x.grund === "rohbefund")?.stufe === "pruefen");
  pruefe("Arbeitsdokument-Regeln gelten nur für den Bestand", art("Index: Buch", { herkunft: "upload" }).every((x) => x.grund !== "arbeitsdokument"));

  pruefe("veraltet: ausdrücklich im Titel", hat(art("KGD Gebietsabteilung Abai: Kontosperrung - VERALTETE Rechtsgrundlage (Negativbefund)"), "markiertVeraltet"));
  pruefe("veraltet: Hinweis in der Rechtsstelle", hat(art("Steuerkodex", { rechtsstelle: "alte Fassung vor 2026" }), "markiertVeraltet"));
  const jahr = art("KGD-Vorsitzenden-Blog: Ist Agentenvergütung USt-pflichtig? (2021)");
  pruefe("Jahr im Titel mindestens drei Jahre alt: Hinweis", hat(jahr, "jahrAlt") && jahr.find((x) => x.grund === "jahrAlt")?.stufe === "hinweis" && jahr.find((x) => x.grund === "jahrAlt")?.wert === "2021");
  pruefe("Jahr im Titel neu genug: kein Befund", !hat(art("Formular 200.00: Ausfüllregeln 2026"), "jahrAlt") && !hat(art("Audit-Fachliteratur 2021–2026 Überblick"), "jahrAlt"));

  pruefe("Herkunft: kein Link", hat(art("Rohtext", { url: null }), "keinLink") && hat(art("Rohtext", { url: "Kazakhstan Law Review" }), "keinLink"));
  pruefe("Herkunft: sauberer Link ist kein Befund", !hat(art("Rohtext", { url: "https://kgd.gov.kz/ru/x" }), "keinLink"));
  const fällig = art("Handbuch", { herkunft: "upload", abgelaufen: true, pruefenBis: "2026-10-01" });
  pruefe("Wiedervorlage fällig: Prüfen, mit Datum", hat(fällig, "wiedervorlageFaellig") && fällig[0]?.wert === "2026-10-01" && fällig[0]?.stufe === "pruefen");
}

// ---- Nähe: Dublette und Abdeckung ----------------------------------------------------------------------------------------
{
  const d = dok({ titel: "NK RK Art. 479 (Spiegel)" });
  const abg = bewerteNaehe(d, naeheVon(d, proben([0.93, 0.91, 0.9, 0.95, 0.89, 0.92], buch)));
  pruefe("Abdeckung: alle Proben ab 0,88 im Buch -> abgedeckt, prüfen", abg.length === 1 && abg[0]!.grund === "abgedeckt" && abg[0]!.stufe === "pruefen" && abg[0]!.vergleichMit === "upload:aaa" && abg[0]!.anteil === 1, JSON.stringify(abg));
  pruefe("Abdeckung: Minimum wird mitgegeben", Math.abs((abg[0]?.minimum ?? 0) - 0.89) < 1e-9);

  const knapp = bewerteNaehe(d, naeheVon(d, proben([0.93, 0.91, 0.9, 0.95, 0.7, 0.6], buch)));
  pruefe("Abdeckung: nur zwei Drittel der Proben reichen nicht für abgedeckt", !knapp.some((b) => b.grund === "abgedeckt"));
  const teil = bewerteNaehe(d, naeheVon(d, proben([0.85, 0.84, 0.86, 0.5, 0.4, 0.3], buch)));
  pruefe("Teilweise: mindestens die Hälfte ab 0,82 -> Hinweis", teil.some((b) => b.grund === "teilweiseAbgedeckt" && b.stufe === "hinweis"), JSON.stringify(teil));
  pruefe("Thema allein (Ähnlichkeit 0,7) ist kein Befund", bewerteNaehe(d, naeheVon(d, proben([0.7, 0.72, 0.69, 0.71, 0.7, 0.7], buch))).length === 0);

  const gemischt = bewerteNaehe(d, naeheVon(d, [...proben([0.95, 0.95, 0.95], buch), ...proben([0.95, 0.95, 0.95], { quelleId: "upload:bbb", titel: "Anderes Buch", istUpload: true })]));
  pruefe("Abdeckung: verteilt auf zwei Bücher reicht nicht (die meisten Treffer eines Buchs zählen)", !gemischt.some((b) => b.grund === "abgedeckt"));

  const dub = bewerteNaehe(d, naeheVon(d, proben([0.99, 0.98, 0.99, 0.97, 0.99, 0.98], anderes)));
  pruefe("Dublette: nahezu gleicher Text in einem anderen Bestandsdokument", dub.length === 1 && dub[0]!.grund === "dublette" && dub[0]!.vergleichMit === anderes.quelleId, JSON.stringify(dub));
  const dubBuch = bewerteNaehe(d, naeheVon(d, proben([0.99, 0.98, 0.99, 0.97, 0.99, 0.98], buch)));
  pruefe("Bestand gegen Buch ist abgedeckt, nicht Dublette", dubBuch.some((b) => b.grund === "abgedeckt") && !dubBuch.some((b) => b.grund === "dublette"));
  const buch2 = dok({ titel: "Buch B", herkunft: "upload", schluessel: "upload:bbb", loeschbar: true });
  const dubUpload = bewerteNaehe(buch2, naeheVon(buch2, proben([0.99, 0.99, 0.99, 0.99, 0.99, 0.99], buch)));
  pruefe("Zwei Uploads mit gleichem Text: Dublette (nie 'abgedeckt')", dubUpload.length === 1 && dubUpload[0]!.grund === "dublette");
  pruefe("Ohne Proben oder ohne Nähe: nichts", bewerteNaehe(d, undefined).length === 0 && bewerteNaehe(d, naeheVon(d, [])).length === 0);
  pruefe("Schwellen sind aus der Handprüfung abgeleitet (gleich > abgedeckt > teilweise)", SCHWELLEN.gleich > SCHWELLEN.abgedeckt && SCHWELLEN.abgedeckt > SCHWELLEN.teilweise);
}

// ---- Zusammenfassung ---------------------------------------------------------------------------------------------------
{
  const a = dok({ titel: "Auftrag: Recherche" });
  const b = dok({ titel: "Gesetz X", url: "kein Link" });
  const c = dok({ titel: "Gesetz Y" });
  const leer = dok({ titel: "Leer", chunks: 0 });
  const naehe = new Map<string, DokumentNaehe>([[c.schluessel, naeheVon(c, proben([0.9, 0.91, 0.92, 0.93, 0.94, 0.95], buch))]]);
  const liste = baueBefunde([c, b, a, leer], naehe, HEUTE);
  pruefe("Befunde: nur Dokumente mit Befund, ohne leere", liste.length === 3 && !liste.some((x) => x.dokument.titel === "Leer"));
  pruefe("Befunde: stärkste Stufe zuerst (entfernen, prüfen, Hinweis)", liste[0]!.dokument.titel === "Auftrag: Recherche" && liste[0]!.stufe === "entfernen" && liste[1]!.stufe === "pruefen" && liste[2]!.stufe === "hinweis", liste.map((x) => x.stufe).join(","));
  const z = zaehleBefunde(liste);
  pruefe("Zählung je Art und Stufe", z.art.arbeitsdokument === 1 && z.art.abgedeckt === 1 && z.art.herkunft >= 1 && z.stufe.entfernen === 1 && z.stufe.pruefen === 1);
  // Nach dem Entfernen (in der Oberfläche gefunden: Der Hinweis "Dublette von X" blieb nach dem Entfernen von X stehen)
  const x = dok({ titel: "Text X", schluessel: "bestand/x.md" });
  const y = dok({ titel: "Text Y", schluessel: "bestand/y.md" });
  const naeheXY = new Map<string, DokumentNaehe>([
    [x.schluessel, naeheVon(x, proben([0.99, 0.99, 0.99, 0.99, 0.99, 0.99], { quelleId: y.schluessel, titel: "Text Y", istUpload: false }))],
    [y.schluessel, naeheVon(y, proben([0.99, 0.99, 0.99, 0.99, 0.99, 0.99], { quelleId: x.schluessel, titel: "Text X", istUpload: false }))],
  ]);
  const paar = baueBefunde([x, y], naeheXY, HEUTE);
  pruefe("Dublette zwischen zwei Dokumenten: beide haben den Befund", paar.length === 2 && paar.every((b) => b.befunde[0]?.grund === "dublette"));
  const nach = ohneEntfernte(paar, new Set([x.schluessel]));
  pruefe("Nach dem Entfernen von X: X ist weg und Y hat keinen Befund mehr (Dublette von X fällt weg)", nach.length === 0);
  const mitMehr = baueBefunde([x, dok({ titel: "Text Y", schluessel: "bestand/y.md", url: null })], naeheXY, HEUTE);
  const nach2 = ohneEntfernte(mitMehr, new Set([x.schluessel]));
  pruefe("Ein anderer Befund bleibt bestehen, die Stufe wird neu bestimmt", nach2.length === 1 && nach2[0]!.befunde.length === 1 && nach2[0]!.befunde[0]!.grund === "keinLink" && nach2[0]!.stufe === "hinweis", JSON.stringify(nach2.map((b) => b.befunde)));
  pruefe("Ohne Entfernte bleibt alles, wie es ist", ohneEntfernte(paar, new Set()).length === 2);
  pruefe("Stärkste Stufe", staerksteStufe([]) === "hinweis" && staerksteStufe([{ art: "herkunft", stufe: "hinweis", grund: "keinLink" }, { art: "dublette", stufe: "pruefen", grund: "dublette" }]) === "pruefen");
}

// ---- Entfernen ---------------------------------------------------------------------------------------------------------
interface Zeile { quelle: string; sparse: string; titel: string }
function speicher(zeilen: Zeile[], begriffe: Record<number, number>, optionen: { grabsteinFehler?: boolean; loeschFehler?: boolean; gewichteFehler?: boolean } = {}) {
  const rows = new Map<string, Zeile>(zeilen.map((z, i) => [`id${i}`, z]));
  const df = new Map<number, number>(Object.entries(begriffe).map(([k, v]) => [Number(k), v]));
  const idf = new Map<number, number>();
  const grabsteine: { quelleId: string; grund: string; abschnitte: number; von: string | null }[] = [];
  const ereignisse: string[] = [];
  const s: BestandsSpeicher = {
    async ladeQuellenInfo(id) {
      const z = [...rows.values()].filter((r) => r.quelle === id);
      return { anzahl: z.length, fremd: 0, titel: z[0]?.titel ?? null, bereich: z.length ? "legal" : null };
    },
    async leseDokumenthaeufigkeit(indizes) {
      if (optionen.gewichteFehler) throw new Error("Gewichte kaputt");
      return new Map(indizes.filter((i) => df.has(i)).map((i) => [i, df.get(i)!]));
    },
    async schreibeBegriffe(neu) {
      for (const n of neu) {
        df.set(n.hash, n.df);
        idf.set(n.hash, n.idf);
      }
    },
    async zaehleChunks() {
      return rows.size;
    },
    async loescheBegriffe(indizes) {
      for (const i of indizes) df.delete(i);
    },
    async loescheDokument(id) {
      ereignisse.push("loeschen");
      if (optionen.loeschFehler) throw new Error("Löschen kaputt");
      const weg = [...rows].filter(([, r]) => r.quelle === id);
      for (const [k] of weg) rows.delete(k);
      return weg.map(([, r]) => r.sparse);
    },
    async merkeEntfernt(e) {
      ereignisse.push("grabstein");
      if (optionen.grabsteinFehler) throw new Error("Grabstein kaputt");
      grabsteine.push({ quelleId: e.quelleId, grund: e.grund, abschnitte: e.abschnitte, von: e.von });
    },
  };
  return { s, rows, df, grabsteine, ereignisse };
}
const sp = (...indizes: number[]) => `{${indizes.map((i) => `${i}:1`).join(",")}}/1000000000`;
const fehlerCode = async (f: () => Promise<unknown>): Promise<string | null> => {
  try {
    await f();
    return null;
  } catch (e) {
    return e instanceof PflegeFehler ? e.code : `anderer Fehler: ${e instanceof Error ? e.message : String(e)}`;
  }
};

async function entfernen() {
  const Q = "bestand/arbeit.md";
  const aufbau = () =>
    speicher(
      [
        { quelle: Q, sparse: sp(1, 2), titel: "Index: Recherche" },
        { quelle: Q, sparse: sp(2, 3), titel: "Index: Recherche" },
        { quelle: "bestand/behalten.md", sparse: sp(1), titel: "Gesetz" },
      ],
      { 1: 2, 2: 2, 3: 1 },
    );

  {
    const t = aufbau();
    const e = await entferneDokument(Q, "Arbeitsdokument der Recherche", "admin-1", { speicher: t.s, umgebung: {} });
    pruefe("Entfernen: alle Zeilen des Dokuments sind weg, das andere Dokument bleibt", e.geloescht === 2 && !e.schonWeg && t.rows.size === 1 && [...t.rows.values()][0]!.quelle === "bestand/behalten.md");
    pruefe("Entfernen: Grabstein mit Grund, Person und Abschnittszahl", t.grabsteine.length === 1 && t.grabsteine[0]!.quelleId === Q && t.grabsteine[0]!.grund === "Arbeitsdokument der Recherche" && t.grabsteine[0]!.von === "admin-1" && t.grabsteine[0]!.abschnitte === 2);
    pruefe("Entfernen: der Grabstein steht VOR dem Löschen", t.ereignisse[0] === "grabstein" && t.ereignisse[1] === "loeschen", t.ereignisse.join(","));
    pruefe("Wortgewichte: df zurückgerechnet, Wörter ohne Textstelle entfernt", t.df.get(1) === 1 && !t.df.has(2) && !t.df.has(3), JSON.stringify([...t.df]));
    pruefe("Ergebnis nennt Titel, Bereich, kein Upload, Gewichte in Ordnung", e.titel === "Index: Recherche" && e.bereich === "legal" && !e.upload && !e.gewichteOffen);

    const zweites = await entferneDokument(Q, "noch einmal", "admin-1", { speicher: t.s, umgebung: {} });
    pruefe("Wiederholbar: das zweite Entfernen meldet 'schon weg' und ändert die Gewichte nicht", zweites.schonWeg && zweites.geloescht === 0 && t.df.get(1) === 1 && t.grabsteine.length === 1);
  }
  {
    const t = aufbau();
    const e = await entferneDokument("upload:abc", "Test", null, { speicher: speicher([{ quelle: "upload:abc", sparse: sp(1), titel: "Buch" }], { 1: 1 }).s, umgebung: {} });
    pruefe("Auch ein Upload lässt sich entfernen (Kennzeichnung im Ergebnis)", e.upload && e.geloescht === 1);
    void t;
  }
  {
    const t = aufbau();
    pruefe("Unbekannte quelle_id: schon weg, kein Grabstein", (await entferneDokument("gibt-es-nicht", "x", null, { speicher: t.s, umgebung: {} })).schonWeg && t.grabsteine.length === 0);
  }
  {
    const t = aufbau();
    pruefe("Grabstein misslingt: nichts wird gelöscht", (await fehlerCode(() => entferneDokument(Q, "x", null, { speicher: speicher([{ quelle: Q, sparse: sp(1), titel: "T" }], { 1: 1 }, { grabsteinFehler: true }).s, umgebung: {} }))) === "grabstein");
    const t2 = speicher([{ quelle: Q, sparse: sp(1), titel: "T" }], { 1: 1 }, { grabsteinFehler: true });
    await fehlerCode(() => entferneDokument(Q, "x", null, { speicher: t2.s, umgebung: {} }));
    pruefe("Grabstein misslingt: die Zeilen sind noch da und es wurde nie gelöscht", t2.rows.size === 1 && !t2.ereignisse.includes("loeschen"));
    void t;
  }
  {
    const t = speicher([{ quelle: Q, sparse: sp(1), titel: "T" }], { 1: 1 }, { loeschFehler: true });
    pruefe("Löschen misslingt: Fehler 'loeschen'", (await fehlerCode(() => entferneDokument(Q, "x", null, { speicher: t.s, umgebung: {} }))) === "loeschen");
  }
  {
    const t = speicher([{ quelle: Q, sparse: sp(1), titel: "T" }], { 1: 1 }, { gewichteFehler: true });
    const e = await entferneDokument(Q, "x", null, { speicher: t.s, umgebung: {} });
    pruefe("Gewichte misslingen: das Dokument ist trotzdem weg, das Ergebnis meldet es", e.geloescht === 1 && e.gewichteOffen && t.rows.size === 0);
  }
  {
    const t = aufbau();
    const f = (q: string, g: string) => fehlerCode(() => entferneDokument(q, g, null, { speicher: t.s, umgebung: {} }));
    pruefe("Eingabe: leere Kennung, leerer Grund, zu langer Grund, Steuerzeichen", (await f("", "x")) === "eingabe" && (await f(Q, "  ")) === "eingabe" && (await f(Q, "x".repeat(301))) === "eingabe" && (await f("a\u0000b", "x")) === "eingabe");
    pruefe("Eingabe: nichts wurde gelöscht", t.rows.size === 3 && t.grabsteine.length === 0);
    pruefe("istQuelleId: Skriptpfade und Upload-Kennungen sind gültig", istQuelleId("legal/Legal/x/y.md") && istQuelleId("upload:5563c42195e847d2df79061a81432a86") && !istQuelleId(42) && !istQuelleId(""));
  }
  {
    const t = aufbau();
    const code = await fehlerCode(() => entferneDokument(Q, "x", null, { speicher: t.s, umgebung: { VERCEL_ENV: "preview" }, schema: "public" }));
    pruefe("Vorschau-Schutz: eine Vorschau mit dem Schema public entfernt nichts", code === "umgebung" && t.rows.size === 3 && t.ereignisse.length === 0, String(code));
    const ok = await entferneDokument(Q, "x", null, { speicher: aufbau().s, umgebung: { VERCEL_ENV: "preview" }, schema: "public_preview" });
    pruefe("Vorschau mit dem Schema public_preview darf entfernen", ok.geloescht === 2);
  }
}

entfernen().then(() => {
  console.log(`\n${gesamt - fehler}/${gesamt} bestanden`);
  process.exit(fehler > 0 ? 1 : 0);
});
