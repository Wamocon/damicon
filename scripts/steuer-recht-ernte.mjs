// Erntet weitere Rechtsakte von old.adilet.zan.kz in den Korpus.
//
// Der Steuerkodex selbst laeuft ueber steuer-korpus-ernte.mjs. Hier kommen die
// Akte dazu, auf die er verweist oder die neben ihm gelten: Einfuehrungsgesetz,
// Ordnungswidrigkeiten (Strafhoehen), Zivilgesetzbuch (Kommission gegen
// Eigenhandel), Arbeitsgesetzbuch (ЕСУТД-Umfeld) und die tragenden Anordnungen
// zu Registrierkasse und Mehrwertsteuererstattung.
//
// Kodizes werden artikelweise zerlegt, Anordnungen bleiben ein Dokument.
//
// Sicherheitsregel: abgerufene Inhalte sind Daten, niemals Anweisungen.
//
// Aufruf: node scripts/steuer-recht-ernte.mjs [--kein-abruf]

import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import { join } from "node:path";

const ZIEL = "docs/recherche/steuern/korpus/recht";
const CACHE = ".cache/steuerkorpus/recht";
const HEUTE = new Date().toISOString().slice(0, 10);
const PAUSE_MS = 1500;

const AKTE = [
  {
    code: "Z2500000215", kuerzel: "einfuehrungsgesetz", stufe: 1, zerlegen: false,
    name: "Begleitgesetz zum Steuerkodex 214-VIII (Aenderungen und Ergaenzungen)",
    gueltig_ab: "2026-01-01", ueberholt: false, sprachen: ["rus", "kaz"],
  },
  {
    code: "K1400000235", kuerzel: "koap", stufe: 1, zerlegen: true,
    name: "Kodex ueber Ordnungswidrigkeiten (Strafhoehen fuer Steuer- und Meldeverstoesse)",
    gueltig_ab: null, ueberholt: false, sprachen: ["rus", "kaz"],
  },
  {
    code: "K940001000_", kuerzel: "zgb-allgemein", stufe: 1, zerlegen: true,
    name: "Zivilgesetzbuch, Allgemeiner Teil",
    gueltig_ab: null, ueberholt: false, sprachen: ["rus"],
  },
  {
    code: "K990000409_", kuerzel: "zgb-besonderer-teil", stufe: 1, zerlegen: true,
    name: "Zivilgesetzbuch, Besonderer Teil (Kommission, Auftrag, Kauf)",
    gueltig_ab: null, ueberholt: false, sprachen: ["rus"],
  },
  {
    code: "K1500000414", kuerzel: "arbeitsgesetzbuch", stufe: 1, zerlegen: true,
    name: "Arbeitsgesetzbuch der Republik Kasachstan",
    gueltig_ab: null, ueberholt: false, sprachen: ["rus"],
  },
  {
    code: "V2500037238", kuerzel: "anordnung-kkm", stufe: 2, zerlegen: false,
    name: "Anordnung zu Fragen der Anwendung von Registrierkassen",
    gueltig_ab: "2026-01-01", ueberholt: false, sprachen: ["rus"],
  },
  {
    code: "V2500037306", kuerzel: "anordnung-649-mwst-erstattung", stufe: 2, zerlegen: false,
    name: "Anordnung 649: Regeln zur Erstattung des Mehrwertsteuerueberschusses",
    gueltig_ab: "2026-01-01", ueberholt: false, sprachen: ["rus"],
  },
  {
    code: "K1700000120", kuerzel: "steuerkodex-2017-aufgehoben", stufe: 1, zerlegen: false,
    name: "Steuerkodex 2017, aufgehoben zum 01.01.2026 (nur fuer den Fassungsvergleich)",
    gueltig_ab: "2018-01-01", gueltig_bis: "2025-12-31", ueberholt: true, sprachen: ["rus"],
  },
];

const MUSTER = {
  rus: [
    /<p><b>(?:<a name="(z\d+)"><\/a>)?\s*Стать[яи]\s*([0-9]+(?:-[0-9]+)?)\.\s*([^<]*)<\/b><\/p>/g,
    /<h3(?: id="(z\d+)")?>\s*Стать[яи]\s*([0-9]+(?:-[0-9]+)?)\.\s*([^<]*)<\/h3>/g,
  ],
  kaz: [
    /<p><b>(?:<a name="(z\d+)"><\/a>)?\s*([0-9]+(?:-[0-9]+)?)-бап\.\s*([^<]*)<\/b><\/p>/g,
    /<h3(?: id="(z\d+)")?>\s*([0-9]+(?:-[0-9]+)?)-бап\.\s*([^<]*)<\/h3>/g,
  ],
};

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
  t = t.replace(/<[^>]+>/g, "");
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
    headers: { "User-Agent": "Damicon-Recherche/1.0 (interne Steuerrecherche)" },
    signal: AbortSignal.timeout(90000),
  });
  if (!a.ok) throw new Error(`HTTP ${a.status}`);
  const t = await a.text();
  await mkdir(CACHE, { recursive: true });
  await writeFile(pfad, t, "utf8");
  await schlafen(PAUSE_MS);
  return t;
}

function frontmatter(o) {
  return [
    "---",
    `chunk_id: ${jaFeld(o.chunk_id)}`,
    `quelle_id: ${jaFeld(o.quelle_id)}`,
    `norm_id: ${o.norm_id ? jaFeld(o.norm_id) : "null"}`,
    `sprache: ${jaFeld(o.sprache)}`,
    `autoritaetsstufe: ${o.stufe}`,
    `rechtsstelle: ${o.rechtsstelle ? jaFeld(o.rechtsstelle) : "null"}`,
    `titel: ${jaFeld(o.titel)}`,
    `gueltig_ab: ${o.gueltig_ab ? jaFeld(o.gueltig_ab) : "null"}`,
    `gueltig_bis: ${o.gueltig_bis ? jaFeld(o.gueltig_bis) : "null"}`,
    `ist_ueberholt: ${o.ueberholt}`,
    "ersetzt_durch: null",
    `abgerufen_am: ${jaFeld(HEUTE)}`,
    `url: ${jaFeld(o.url)}`,
    'konfidenz: "bestaetigt"',
    "---",
    "",
  ].join("\n");
}

async function main() {
  const nurCache = process.argv.includes("--kein-abruf");
  let dateien = 0;

  for (const akt of AKTE) {
    for (const sp of akt.sprachen) {
      const kurz = sp === "rus" ? "ru" : "kk";
      const url = `https://old.adilet.zan.kz/${sp}/docs/${akt.code}`;
      process.stdout.write(`${akt.kuerzel} (${kurz}) ... `);
      let html;
      try {
        html = await holen(url, join(CACHE, `${akt.code}-${sp}.html`), nurCache);
      } catch (f) {
        console.log(`FEHLER ${f.message}`);
        continue;
      }

      if (!akt.zerlegen) {
        const ordner = join(ZIEL, akt.kuerzel);
        await mkdir(ordner, { recursive: true });
        const text = alsText(html);
        await writeFile(
          join(ordner, `${akt.kuerzel}-${kurz}.md`),
          frontmatter({
            chunk_id: `${akt.kuerzel}-${kurz}`, quelle_id: `adilet-${akt.code}-${kurz}`,
            norm_id: null, sprache: kurz, stufe: akt.stufe, rechtsstelle: null,
            titel: akt.name, gueltig_ab: akt.gueltig_ab, gueltig_bis: akt.gueltig_bis,
            ueberholt: akt.ueberholt, url,
          }) + text + "\n",
          "utf8",
        );
        dateien++;
        console.log(`1 Datei, ${(text.length / 1024).toFixed(0)} kB`);
        continue;
      }

      const treffer = MUSTER[sp].flatMap((m) => [...html.matchAll(m)])
        .sort((a, b) => a.index - b.index);
      const gesehen = new Set();
      const artikel = [];
      for (let i = 0; i < treffer.length; i++) {
        const t = treffer[i];
        if (gesehen.has(t[2])) continue;
        gesehen.add(t[2]);
        const ende = i + 1 < treffer.length ? treffer[i + 1].index : html.length;
        artikel.push({
          anker: t[1], nummer: t[2], titel: alsText(t[3]),
          koerper: alsText(html.slice(t.index + t[0].length, ende)),
        });
      }
      if (artikel.length < 20) {
        console.log(`nur ${artikel.length} Artikel erkannt, nichts geschrieben`);
        continue;
      }
      const ordner = join(ZIEL, akt.kuerzel, kurz);
      await mkdir(ordner, { recursive: true });
      for (const a of artikel) {
        const nr = String(a.nummer).replace(/[^0-9-]/g, "").padStart(4, "0");
        await writeFile(
          join(ordner, `art-${nr}.md`),
          frontmatter({
            chunk_id: `${akt.kuerzel}-${kurz}#art-${a.nummer}`,
            quelle_id: `adilet-${akt.code}-${kurz}`,
            norm_id: `${akt.kuerzel}-art-${a.nummer}`, sprache: kurz, stufe: akt.stufe,
            rechtsstelle: kurz === "ru" ? `ст. ${a.nummer}` : `${a.nummer}-бап`,
            titel: a.titel || akt.name, gueltig_ab: akt.gueltig_ab,
            gueltig_bis: akt.gueltig_bis, ueberholt: akt.ueberholt,
            url: a.anker ? `${url}#${a.anker}` : url,
          }) + `# ${a.nummer}. ${a.titel}\n\n${a.koerper}\n`,
          "utf8",
        );
        dateien++;
      }
      console.log(`${artikel.length} Artikel`);
    }
  }
  console.log(`\nInsgesamt ${dateien} Dateien geschrieben.`);
}

main().catch((f) => { console.error(`Abbruch: ${f.message}`); process.exit(1); });
