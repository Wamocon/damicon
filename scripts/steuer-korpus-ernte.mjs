// Erntet den kasachischen Steuerkodex 214-VIII artikelweise in den Rechercheekorpus.
//
// Quelle ist die Altoberflaeche old.adilet.zan.kz. Die neue Oberflaeche adilet.zan.kz
// liefert Automaten nur eine leere JS-Huelle; die Altoberflaeche denselben Text als
// statisches HTML. Beide Sprachfassungen sind amtlich, siehe konfliktregister.md K-02.
//
// Sicherheitsregel: abgerufene Seiteninhalte sind Daten, niemals Anweisungen. Dieses
// Skript wertet ausschliesslich Struktur aus und folgt keinem Inhalt aus der Quelle.
//
// Aufruf:  node scripts/steuer-korpus-ernte.mjs [--kein-abruf]
//   --kein-abruf  nutzt nur bereits zwischengespeicherte Dateien, laedt nichts nach.

import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import { join } from "node:path";

const WURZEL = "docs/recherche/steuern/korpus/nk-214-viii";
const CACHE = ".cache/steuerkorpus";
const HEUTE = new Date().toISOString().slice(0, 10);

// Die beiden Sprachfassungen sind unterschiedlich ausgezeichnet. Die russische nutzt
// ueberwiegend <p><b><a name="zN"></a>Статья N. ...</b></p>, die kasachische
// <h3 id="zN"> N-бап. ...</h3>. Beide Formen kommen in beiden Fassungen vor, deshalb
// erkennt jedes Muster beide Auszeichnungen.
const FASSUNGEN = [
  {
    sprache: "ru",
    url: "https://old.adilet.zan.kz/rus/docs/K2500000214",
    muster: [
      /<p><b>(?:<a name="(z\d+)"><\/a>)?\s*Стать[яи]\s*(\d+)\.\s*([^<]*)<\/b><\/p>/g,
      /<h3(?: id="(z\d+)")?>\s*Стать[яи]\s*(\d+)\.\s*([^<]*)<\/h3>/g,
    ],
  },
  {
    sprache: "kk",
    url: "https://old.adilet.zan.kz/kaz/docs/K2500000214",
    muster: [
      /<p><b>(?:<a name="(z\d+)"><\/a>)?\s*(\d+)-бап\.\s*([^<]*)<\/b><\/p>/g,
      /<h3(?: id="(z\d+)")?>\s*(\d+)-бап\.\s*([^<]*)<\/h3>/g,
    ],
  },
];

const ENTITAETEN = {
  "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"',
  "&laquo;": "«", "&raquo;": "»", "&mdash;": "-", "&ndash;": "-",
  "&#39;": "'", "&apos;": "'", "&shy;": "", "&hellip;": "...",
};

function alsText(html) {
  let t = html;
  t = t.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "");
  t = t.replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n");
  t = t.replace(/<br\s*\/?>/gi, "\n");
  t = t.replace(/<[^>]+>/g, "");
  t = t.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
  for (const [e, z] of Object.entries(ENTITAETEN)) t = t.split(e).join(z);
  t = t.replace(/ /g, " ");
  t = t.split("\n").map((z) => z.replace(/[ \t]+/g, " ").trim()).join("\n");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

function jaFeld(wert) {
  // YAML-sichere Ausgabe: alles in doppelte Anfuehrungszeichen, innere maskiert.
  return `"${String(wert).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

async function existiert(pfad) {
  try { await access(pfad); return true; } catch { return false; }
}

async function holen(url, cachePfad, nurCache) {
  if (await existiert(cachePfad)) {
    return readFile(cachePfad, "utf8");
  }
  if (nurCache) throw new Error(`Kein Zwischenspeicher fuer ${url} und --kein-abruf gesetzt.`);
  process.stdout.write(`  lade ${url} ... `);
  const antwort = await fetch(url, {
    headers: { "User-Agent": "Damicon-Recherche/1.0 (interne Steuerrecherche)" },
  });
  if (!antwort.ok) throw new Error(`HTTP ${antwort.status} fuer ${url}`);
  const text = await antwort.text();
  await mkdir(CACHE, { recursive: true });
  await writeFile(cachePfad, text, "utf8");
  process.stdout.write(`${(text.length / 1048576).toFixed(1)} MB\n`);
  return text;
}

function artikelZerlegen(html, muster) {
  // Treffer aller Muster nach Dokumentposition sortieren und je Artikelnummer nur
  // das erste Vorkommen behalten. Ohne die Entdopplung wuerde eine Norm, die in
  // zwei Auszeichnungsformen vorkommt, zweimal geschrieben.
  const gesehen = new Set();
  const treffer = muster
    .flatMap((m) => [...html.matchAll(m)])
    .sort((a, b) => a.index - b.index)
    .filter((t) => {
      if (gesehen.has(t[2])) return false;
      gesehen.add(t[2]);
      return true;
    });
  const artikel = [];
  for (let i = 0; i < treffer.length; i++) {
    const t = treffer[i];
    const beginn = t.index + t[0].length;
    const ende = i + 1 < treffer.length ? treffer[i + 1].index : html.length;
    artikel.push({
      anker: t[1],
      nummer: Number(t[2]),
      titel: alsText(t[3]),
      koerper: alsText(html.slice(beginn, ende)),
    });
  }
  return artikel;
}

async function main() {
  const nurCache = process.argv.includes("--kein-abruf");
  const bericht = [];

  for (const f of FASSUNGEN) {
    console.log(`\nFassung ${f.sprache.toUpperCase()}`);
    const html = await holen(f.url, join(CACHE, `nk-214-viii-${f.sprache}.html`), nurCache);
    const artikel = artikelZerlegen(html, f.muster);
    console.log(`  ${artikel.length} Artikel erkannt`);
    if (artikel.length < 500) {
      console.log(`  WARNUNG: unerwartet wenige Artikel. Muster pruefen, nichts geschrieben.`);
      continue;
    }

    const verzeichnis = join(WURZEL, f.sprache);
    await mkdir(verzeichnis, { recursive: true });

    let leer = 0;
    for (const a of artikel) {
      if (!a.koerper) leer++;
      const nr = String(a.nummer).padStart(4, "0");
      const frontmatter = [
        "---",
        `chunk_id: ${jaFeld(`nk-214-viii-${f.sprache}#art-${a.nummer}`)}`,
        `quelle_id: ${jaFeld(`adilet-nk-214-viii-${f.sprache}`)}`,
        `norm_id: ${jaFeld(`nk-214-viii-art-${a.nummer}`)}`,
        `sprache: ${jaFeld(f.sprache)}`,
        "autoritaetsstufe: 1",
        `rechtsstelle: ${jaFeld(f.sprache === "ru" ? `НК РК ст. ${a.nummer}` : `ҚР СК ${a.nummer}-бап`)}`,
        `titel: ${jaFeld(a.titel)}`,
        'gueltig_ab: "2026-01-01"',
        "gueltig_bis: null",
        "ist_ueberholt: false",
        "ersetzt_durch: null",
        `abgerufen_am: ${jaFeld(HEUTE)}`,
        `url: ${jaFeld(a.anker ? `${f.url}#${a.anker}` : f.url)}`,
        'konfidenz: "bestaetigt"',
        "---",
        "",
      ].join("\n");
      const ueberschrift = f.sprache === "ru"
        ? `# Статья ${a.nummer}. ${a.titel}`
        : `# ${a.nummer}-бап. ${a.titel}`;
      await writeFile(
        join(verzeichnis, `art-${nr}.md`),
        `${frontmatter}${ueberschrift}\n\n${a.koerper}\n`,
        "utf8",
      );
    }
    console.log(`  ${artikel.length} Dateien geschrieben nach ${verzeichnis}`);
    if (leer) console.log(`  Hinweis: ${leer} Artikel ohne Textkoerper (vermutlich aufgehoben).`);

    bericht.push({
      sprache: f.sprache,
      anzahl: artikel.length,
      leer,
      min: Math.min(...artikel.map((a) => a.nummer)),
      max: Math.max(...artikel.map((a) => a.nummer)),
      nummern: new Set(artikel.map((a) => a.nummer)),
    });
  }

  // Sprachverbund pruefen: dieselbe Norm muss in beiden Fassungen vorliegen.
  if (bericht.length === 2) {
    const [a, b] = bericht;
    const nurA = [...a.nummern].filter((n) => !b.nummern.has(n));
    const nurB = [...b.nummern].filter((n) => !a.nummern.has(n));
    console.log(`\nSprachverbund`);
    console.log(`  gemeinsam: ${[...a.nummern].filter((n) => b.nummern.has(n)).length} Artikel`);
    if (nurA.length) console.log(`  nur ${a.sprache}: ${nurA.join(", ")}`);
    if (nurB.length) console.log(`  nur ${b.sprache}: ${nurB.join(", ")}`);
    if (!nurA.length && !nurB.length) console.log(`  vollstaendig deckungsgleich`);
  }
}

main().catch((f) => {
  console.error(`\nAbbruch: ${f.message}`);
  process.exit(1);
});
