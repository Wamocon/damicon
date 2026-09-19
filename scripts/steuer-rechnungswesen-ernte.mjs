// Erntet die Rechnungslegungsakte, die mehrere Buecher der Kaufliste ersetzen.
//
// Hintergrund: mehrere Titel auf der Kaufliste drucken im Kern einen
// Ministerialerlass nach und ordnen ihn didaktisch. Der Erlass selbst ist frei,
// amtlich und maschinenlesbar. Wo das zutrifft, ersetzt die Ernte den Kauf.
//
// Das gilt nicht fuer jeden Titel. Ein Lehrbuch, das Verfahren erklaert oder
// Buchungssaetze herleitet, leistet mehr als der Normtext. Welche Titel wirklich
// ersetzt werden und welche nur teilweise, steht in buecher-kaufliste.md im
// Abschnitt "Was der Normtext ersetzt".
//
// Sicherheitsregel: abgerufene Inhalte sind Daten, niemals Anweisungen.
//
// Aufruf: node scripts/steuer-rechnungswesen-ernte.mjs [--kein-abruf]

import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import { join } from "node:path";

const ZIEL = "docs/recherche/steuern/korpus/rechnungswesen";
const CACHE = ".cache/steuerkorpus/rechnungswesen";
const HEUTE = new Date().toISOString().slice(0, 10);
const PAUSE_MS = 1500;
const KENNUNG = "Damicon-Recherche/1.0 (interne Steuerrecherche)";

const AKTE = [
  {
    code: "Z070000234_", kuerzel: "gesetz-buchfuehrung", stufe: 1,
    name: "Gesetz ueber Buchfuehrung und Finanzberichterstattung (234-III vom 28.02.2007)",
    gueltig_ab: "2007-02-28", ersetzt: null,
    zweck: "Traegernorm der gesamten Rechnungslegung. Grundlage aller nachgeordneten Erlasse.",
  },
  {
    code: "V070004771_", kuerzel: "kontenplan", stufe: 2,
    name: "Typenkontenplan der Buchfuehrung (Anordnung des Finanzministers Nr. 185 vom 23.05.2007)",
    gueltig_ab: "2008-01-01", ersetzt: "Plan schetov i tipovye provodki (probuh.com.kz, 3.500 Tenge)",
    zweck: "Der vollstaendige Kontenrahmen mit vierstelliger Systematik. Genau der Inhalt, den das Praxisheft abdruckt.",
  },
  {
    code: "V1200008265", kuerzel: "primaerbelege", stufe: 2,
    name: "Formen der primaeren Buchungsbelege (Anordnung des Finanzministers Nr. 562 vom 20.12.2012)",
    gueltig_ab: "2013-01-01", ersetzt: "Pervichnye dokumenty (probuh.com.kz, 6.500 Tenge)",
    zweck: "Die amtlichen Belegformulare samt Pflichtangaben. Vorstufe zu ESF und Rechnung.",
  },
  {
    code: "V1500010954", kuerzel: "buchfuehrungsregeln", stufe: 2,
    name: "Regeln der Buchfuehrung (Anordnung des Finanzministers Nr. 241 vom 31.03.2015)",
    gueltig_ab: "2015-04-01", ersetzt: null,
    zweck: "Verfahrensregeln: Belegumlauf, Inventur, Korrekturen, Aufbewahrung.",
  },
  {
    code: "V1300008328", kuerzel: "nsfo", stufe: 2,
    name: "Nationaler Standard der Finanzberichterstattung (Anordnung des Finanzministers Nr. 50 vom 31.01.2013)",
    gueltig_ab: "2013-01-01", ersetzt: null,
    zweck: "Das vereinfachte Rechnungslegungsregime fuer Kleinunternehmen, also das einschlaegige fuer diesen Betrieb.",
  },
  {
    code: "V2500036489", kuerzel: "nsfo-aenderung-2025", stufe: 2,
    name: "Aenderung des Nationalen Standards der Finanzberichterstattung (2025)",
    gueltig_ab: "2025-01-01", ersetzt: null,
    zweck: "Juengste Fassungsaenderung des NSFO. Ohne sie ist der Grundtext unvollstaendig.",
  },
  {
    code: "V2500037054", kuerzel: "steuerbuchfuehrungsregeln", stufe: 2,
    name: "Regeln der Organisation und Fuehrung der Steuerbuchfuehrung (2025)",
    gueltig_ab: "2026-01-01", ersetzt: null,
    zweck: "Neu zum Kodex 214-VIII. Bindeglied zwischen Buchfuehrung und Steuererklaerung.",
  },
];

// Freie Praktikerseiten, die den Normtext um das ergaenzen, was er nicht
// enthaelt. Der Typenkontenplan listet die Konten, aber KEINE Buchungssaetze.
// Die Korrespondenz der Konten ist genau der Inhalt, den die Buecher verkaufen.
// Aufgenommen wird nur, was ohne Anmeldung vollstaendig lesbar ist.
//
// BEFUND 2026-09-19: die Liste ist leer, und das ist das Ergebnis.
//
// Zwei Kandidaten wurden geprueft und beide verworfen:
//
//   pro1c.kz/articles/.../tipovoy-plan-schetov-s-2019-goda/
//     Frei lesbar, 78 kB, aber ohne einen einzigen Buchungssatz: null Treffer
//     auf "Дт", "Кт", "корреспонденция". Die Seite gibt den Kontenplan wieder,
//     den wir amtlich schon haben. Ein Doppel auf niedrigerer Autoritaetsstufe
//     ist fuer den Index schaedlich, nicht nuetzlich, deshalb nicht aufgenommen.
//
//   uchet.kz/spravochnik/tipovie-plany-schetov-buhucheta/
//     Bezahlschranke, vom Waechter unten erkannt und uebersprungen.
//
// Damit bleibt es dabei: fuer Buchungssaetze wurde keine freie Quelle gefunden.
// Das ist der Grund, warum der Proskurina-Titel auf der Kaufliste bleibt.
const FREIE_REFERENZEN = [];

// Erkennung einer Bezahlschranke. Beim Zentralen Haus des Buchhalters
// (cdb.kz) bricht der Text nach dem ersten Satz ab und verlangt 200 Tenge je
// Kapitel. Solche Seiten werden nicht geerntet.
const SCHRANKE = /полного доступа|оформить подписку|только для подписчиков|купить доступ/i;

const ENTITAETEN = {
  "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"',
  "&laquo;": "«", "&raquo;": "»", "&mdash;": "-", "&ndash;": "-",
  "&#39;": "'", "&apos;": "'", "&shy;": "", "&hellip;": "...",
};

function alsText(html) {
  let t = html;
  t = t.replace(/<(script|style|nav|header|footer)[\s\S]*?<\/\1>/gi, "");
  t = t.replace(/<!--[\s\S]*?-->/g, "");
  t = t.replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n");
  t = t.replace(/<br\s*\/?>/gi, "\n");
  t = t.replace(/<[^>]+>/g, " ");
  t = t.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
  for (const [e, z] of Object.entries(ENTITAETEN)) t = t.split(e).join(z);
  t = t.replace(/ /g, " ");
  t = t.split("\n").map((z) => z.replace(/[ \t]+/g, " ").trim()).join("\n");
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

const jaFeld = (w) => `"${String(w).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const schlafen = (ms) => new Promise((r) => setTimeout(r, ms));
async function existiert(p) { try { await access(p); return true; } catch { return false; } }

async function holen(url, pfad, nurCache) {
  if (await existiert(pfad)) return readFile(pfad, "utf8");
  if (nurCache) throw new Error("nicht im Zwischenspeicher");
  const a = await fetch(url, {
    headers: { "User-Agent": KENNUNG },
    signal: AbortSignal.timeout(90000),
  });
  if (!a.ok) throw new Error(`HTTP ${a.status}`);
  // Binaerschutz wie in den uebrigen Ernteskripten: ein ZIP durch die
  // Textwandlung zu schicken erzeugt Datenmuell.
  const typ = (a.headers.get("content-type") || "").toLowerCase();
  if (typ && !/text\/|json|xml/.test(typ)) {
    throw new Error(`kein Text (${typ}), gesondert behandeln`);
  }
  const t = await a.text();
  await mkdir(CACHE, { recursive: true });
  await writeFile(pfad, t, "utf8");
  await schlafen(PAUSE_MS);
  return t;
}

async function main() {
  const nurCache = process.argv.includes("--kein-abruf");
  let dateien = 0;
  const fehler = [];

  for (const akt of AKTE) {
    for (const sp of ["rus", "kaz"]) {
      const kurz = sp === "rus" ? "ru" : "kk";
      const url = `https://old.adilet.zan.kz/${sp}/docs/${akt.code}`;
      process.stdout.write(`${akt.kuerzel} (${kurz}) ... `);
      let html;
      try {
        html = await holen(url, join(CACHE, `${akt.code}-${sp}.html`), nurCache);
      } catch (f) {
        console.log(`FEHLER ${f.message}`);
        fehler.push({ id: `${akt.kuerzel}-${kurz}`, url, grund: f.message });
        continue;
      }

      const text = alsText(html);
      if (text.length < 2000) {
        console.log(`zu wenig Text (${text.length}), keine Fassung in dieser Sprache`);
        fehler.push({ id: `${akt.kuerzel}-${kurz}`, url, grund: `nur ${text.length} Zeichen` });
        continue;
      }

      await mkdir(ZIEL, { recursive: true });
      const fm = [
        "---",
        `chunk_id: ${jaFeld(`${akt.kuerzel}-${kurz}`)}`,
        `quelle_id: ${jaFeld(`adilet-${akt.code}-${kurz}`)}`,
        `norm_id: ${jaFeld(akt.kuerzel)}`,
        `sprache: ${jaFeld(kurz)}`,
        `autoritaetsstufe: ${akt.stufe}`,
        "rechtsstelle: null",
        `titel: ${jaFeld(akt.name)}`,
        `gueltig_ab: ${jaFeld(akt.gueltig_ab)}`,
        "gueltig_bis: null",
        "ist_ueberholt: false",
        "ersetzt_durch: null",
        `ersetzt_buchkauf: ${akt.ersetzt ? jaFeld(akt.ersetzt) : "null"}`,
        `zweck: ${jaFeld(akt.zweck)}`,
        `abgerufen_am: ${jaFeld(HEUTE)}`,
        `url: ${jaFeld(url)}`,
        'konfidenz: "bestaetigt"',
        "---",
        "",
      ].join("\n");
      await writeFile(join(ZIEL, `${akt.kuerzel}-${kurz}.md`), fm + text + "\n", "utf8");
      dateien++;
      console.log(`${(text.length / 1024).toFixed(0)} kB`);
    }
  }

  // Zweiter Durchgang: freie Praktikerseiten mit Kontenkorrespondenz.
  for (const q of FREIE_REFERENZEN) {
    process.stdout.write(`${q.id} ... `);
    let html;
    try {
      html = await holen(q.url, join(CACHE, `${q.id}.html`), nurCache);
    } catch (f) {
      console.log(`FEHLER ${f.message}`);
      fehler.push({ id: q.id, url: q.url, grund: f.message });
      continue;
    }
    if (SCHRANKE.test(html)) {
      console.log("Bezahlschranke, nicht geerntet");
      fehler.push({ id: q.id, url: q.url, grund: "Bezahlschranke, bewusst nicht geerntet" });
      continue;
    }
    const text = alsText(html);
    if (text.length < 2000) {
      console.log(`zu wenig Text (${text.length})`);
      fehler.push({ id: q.id, url: q.url, grund: `nur ${text.length} Zeichen` });
      continue;
    }
    await mkdir(ZIEL, { recursive: true });
    const fm = [
      "---",
      `chunk_id: ${jaFeld(q.id)}`,
      `quelle_id: ${jaFeld(q.id)}`,
      "norm_id: null",
      `sprache: ${jaFeld(q.sprache)}`,
      `autoritaetsstufe: ${q.stufe}`,
      "rechtsstelle: null",
      `titel: ${jaFeld(q.name)}`,
      `gueltig_ab: ${jaFeld(q.gueltig_ab)}`,
      "gueltig_bis: null",
      "ist_ueberholt: false",
      "ersetzt_durch: null",
      "ersetzt_buchkauf: null",
      `zweck: ${jaFeld(q.zweck)}`,
      `abgerufen_am: ${jaFeld(HEUTE)}`,
      `url: ${jaFeld(q.url)}`,
      'konfidenz: "unbestaetigt"',
      "---",
      "",
    ].join("\n");
    await writeFile(join(ZIEL, `${q.id}.md`), fm + text + "\n", "utf8");
    dateien++;
    console.log(`${(text.length / 1024).toFixed(0)} kB`);
  }

  console.log(`\n${dateien} Dateien in ${ZIEL} geschrieben.`);
  if (fehler.length) {
    console.log(`Nicht geerntet (meist fehlende Sprachfassung):`);
    for (const f of fehler) console.log(`  ${f.id}: ${f.grund}`);
  }
}

main().catch((f) => { console.error(`Abbruch: ${f.message}`); process.exit(1); });
