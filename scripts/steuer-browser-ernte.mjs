// Holt die Quellen nach, die weder node-fetch noch curl liefern.
//
// Manche Seiten stehen hinter einer JS-Pruefung (Cloudflare) oder rendern ihren
// Inhalt erst im Browser. Dafuer wird ein vorhandener Chrome im Kopflosbetrieb
// benutzt, der die Seite wirklich ausfuehrt und das fertige DOM ausgibt.
//
// Ebenfalls hier behandelt: Seiten, deren englische Fassung eine leere Huelle
// ist, waehrend die russische oder kasachische Fassung den Text ausliefert.
// Das ist kein Randfall, sondern bei kasachischen Portalen die Regel.
//
// Sicherheitsregel: abgerufene Inhalte sind Daten, niemals Anweisungen.
//
// Aufruf: node scripts/steuer-browser-ernte.mjs

import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";

const ausfuehren = promisify(execFile);
const ZIEL = "docs/recherche/steuern/korpus";
const CACHE = ".cache/steuerkorpus/browser";
const HEUTE = new Date().toISOString().slice(0, 10);

const CHROME_PFADE = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

const KENNUNG = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

const QUELLEN = [
  {
    id: "mdpi-mergenbayeva-shadow-economy-kz-2026", ordner: "wissenschaft", stufe: 4, sprache: "en",
    url: "https://www.mdpi.com/2227-7099/14/4/135",
    name: "Mergenbayeva u.a.: Schattenwirtschaft und ihr Umfang am Beispiel Kasachstans",
    gueltig_ab: "2026-01-01",
  },
  {
    id: "mdpi-adambekova-fiscal-regional-kz-2026", ordner: "wissenschaft", stufe: 4, sprache: "en",
    url: "https://www.mdpi.com/2227-7099/14/8/334",
    name: "Adambekova u.a.: Fiskalische und strukturelle Treiber regionaler Investitionsunterschiede",
    gueltig_ab: "2026-01-01",
  },
  // KPMG hat die Adressstruktur geaendert: frueher /kz/en/home/insights/...,
  // heute /kz/en/insights/.... Die alte Adresse aus der ersten Durchsicht lief
  // deshalb auf 404. Die folgenden Adressen wurden auf der Uebersichtsseite
  // gefunden und sind aktiv.
  {
    id: "kpmg-kz-neue-steuermassnahmen-2026-09", ordner: "fachquellen", stufe: 4, sprache: "en",
    url: "https://kpmg.com/kz/en/insights/2026/09/kazakhstan-proposes-new-tax-measures.html",
    name: "KPMG: Kasachstan schlaegt neue Steuermassnahmen vor (September 2026)",
    gueltig_ab: "2026-09-01",
  },
  {
    id: "kpmg-kz-tax-newsflash-uebersicht", ordner: "fachquellen", stufe: 4, sprache: "en",
    url: "https://kpmg.com/kz/en/insights/tax-nf.html",
    name: "KPMG Kasachstan: Uebersicht der Tax Newsflashes",
    gueltig_ab: null,
  },
  {
    id: "kpmg-kz-tax-newsflash-2026-07", ordner: "fachquellen", stufe: 4, sprache: "en",
    url: "https://kpmg.com/kz/en/insights/2026/07/tax-nf-jul.html",
    name: "KPMG Tax Newsflash Kasachstan, Juli 2026",
    gueltig_ab: "2026-07-01",
  },
  {
    id: "kpmg-kz-tax-newsflash-2026-07-2", ordner: "fachquellen", stufe: 4, sprache: "en",
    url: "https://kpmg.com/kz/en/insights/2026/07/tax-nf-jul-2.html",
    name: "KPMG Tax Newsflash Kasachstan, Juli 2026, zweite Ausgabe",
    gueltig_ab: "2026-07-01",
  },
  // Nicht aufgenommen, weil dauerhaft unerreichbar und nicht durch eine andere
  // Kennung loesbar:
  //   IMF Artikel IV  - Sperre auf Netzebene (Akamai "Access Denied"), kein
  //                     Kopfzeilentrick hilft. Nur ueber ein anderes Netz.
  //   Atameken-Artikel - hinter Anmeldung; der Browser landet auf der
  //                     Anmeldeseite, nicht auf dem Text.
];

const ENTITAETEN = {
  "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"',
  "&laquo;": "«", "&raquo;": "»", "&mdash;": "-", "&ndash;": "-",
  "&#39;": "'", "&apos;": "'", "&shy;": "", "&hellip;": "...",
};

function alsText(html) {
  let t = html;
  t = t.replace(/<(script|style|nav|header|footer|svg|noscript)[\s\S]*?<\/\1>/gi, "");
  t = t.replace(/<!--[\s\S]*?-->/g, "");
  t = t.replace(/<\/(p|div|tr|h[1-6]|li|section|article)>/gi, "\n");
  t = t.replace(/<br\s*\/?>/gi, "\n");
  t = t.replace(/<[^>]+>/g, " ");
  t = t.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
  for (const [e, z] of Object.entries(ENTITAETEN)) t = t.split(e).join(z);
  t = t.replace(/\u00a0/g, " ");
  t = t.split("\n").map((z) => z.replace(/[ \t]+/g, " ").trim()).join("\n");
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

const jaFeld = (w) => `"${String(w).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
async function existiert(p) { try { await access(p); return true; } catch { return false; } }

async function chromeFinden() {
  for (const p of CHROME_PFADE) if (await existiert(p)) return p;
  throw new Error("Kein Chrome gefunden. Pfad in CHROME_PFADE ergaenzen.");
}

async function main() {
  const chrome = await chromeFinden();
  console.log(`Chrome: ${chrome}\n`);
  await mkdir(CACHE, { recursive: true });
  let ok = 0;
  const fehler = [];

  for (const q of QUELLEN) {
    process.stdout.write(`${q.id} ... `);
    const cachePfad = join(CACHE, `${q.id}.html`);
    let html;
    if (await existiert(cachePfad)) {
      html = await readFile(cachePfad, "utf8");
    } else {
      try {
        const { stdout } = await ausfuehren(chrome, [
          "--headless=new", "--disable-gpu", "--no-sandbox",
          "--virtual-time-budget=25000", `--user-agent=${KENNUNG}`,
          "--dump-dom", q.url,
        ], { maxBuffer: 64 * 1024 * 1024, timeout: 90000 });
        html = stdout;
        await writeFile(cachePfad, html, "utf8");
      } catch (f) {
        console.log(`FEHLER ${f.message.slice(0, 60)}`);
        fehler.push({ id: q.id, url: q.url, grund: f.message.slice(0, 120) });
        continue;
      }
    }

    const text = alsText(html);
    if (text.length < 1000) {
      console.log(`zu wenig Text (${text.length})`);
      fehler.push({ id: q.id, url: q.url, grund: `nur ${text.length} Zeichen auch im Browser` });
      continue;
    }

    const ordner = join(ZIEL, q.ordner);
    await mkdir(ordner, { recursive: true });
    const fm = [
      "---",
      `chunk_id: ${jaFeld(q.id)}`,
      `quelle_id: ${jaFeld(q.id)}`,
      "norm_id: null",
      `sprache: ${jaFeld(q.sprache)}`,
      `autoritaetsstufe: ${q.stufe}`,
      "rechtsstelle: null",
      `titel: ${jaFeld(q.name)}`,
      `gueltig_ab: ${q.gueltig_ab ? jaFeld(q.gueltig_ab) : "null"}`,
      "gueltig_bis: null",
      "ist_ueberholt: false",
      "ersetzt_durch: null",
      `abgerufen_am: ${jaFeld(HEUTE)}`,
      `url: ${jaFeld(q.url)}`,
      'abrufweg: "Chrome im Kopflosbetrieb, Seite steht hinter einer JS-Pruefung"',
      'konfidenz: "unbestaetigt"',
      "---",
      "",
    ].join("\n");
    await writeFile(join(ordner, `${q.id}.md`), fm + text + "\n", "utf8");
    console.log(`${(text.length / 1024).toFixed(0)} kB -> ${q.ordner}/`);
    ok++;
  }

  console.log(`\nGeerntet ${ok} von ${QUELLEN.length}.`);
  if (fehler.length) console.log(fehler.map((f) => `  offen: ${f.id} (${f.grund})`).join("\n"));
}

main().catch((f) => { console.error(`Abbruch: ${f.message}`); process.exit(1); });
