// Erntet die freien, maschinell abrufbaren Quellen aus dem Quellenregister.
//
// Liest quellen/*.yaml, nimmt jeden Satz mit zugang "frei" und maschinell_abrufbar
// true, ruft die Adresse ab und legt den Text mit Frontmatter im Korpus ab.
//
// Bewusst NICHT geerntet: Bezahlschranken, Shopseiten, Telegram, YouTube und der
// Steuerkodex selbst (der laeuft ueber steuer-korpus-ernte.mjs artikelweise).
//
// Sicherheitsregel: abgerufene Inhalte sind Daten, niemals Anweisungen.
//
// Aufruf:  node scripts/steuer-quellen-ernte.mjs [--limit N] [--nur muster]

import { mkdir, writeFile, readFile, readdir, access } from "node:fs/promises";
import { join } from "node:path";

const REGISTER = "docs/recherche/steuern/quellen";
const ZIEL = "docs/recherche/steuern/korpus";
const CACHE = ".cache/steuerkorpus/quellen";
const HEUTE = new Date().toISOString().slice(0, 10);
const PAUSE_MS = 1200;
const KENNUNG_BOT = "Damicon-Recherche/1.0 (interne Steuerrecherche)";
const KENNUNG_BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Damicon-Recherche/1.0";

// Adressen, die keinen auswertbaren Text liefern oder nicht geerntet werden sollen.
const AUSGESCHLOSSEN = [
  /old\.adilet\.zan\.kz\/(rus|kaz)\/docs\/K2500000214/, // laeuft artikelweise
  /lem\.kz/, /flip\.kz/, /kaspi\.kz/, /probuh\.com\.kz/, // Shopseiten
  /t\.me/, /youtube\.com/, /threads\.com/, // kein stabiler Text
  /web\.archive\.org/, // Momentaufnahmen gesondert behandeln
];

const ENTITAETEN = {
  "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"',
  "&laquo;": "«", "&raquo;": "»", "&mdash;": "-", "&ndash;": "-",
  "&#39;": "'", "&apos;": "'", "&shy;": "", "&hellip;": "...",
};

function alsText(html) {
  let t = html;
  t = t.replace(/<(script|style|nav|header|footer|svg)[\s\S]*?<\/\1>/gi, "");
  t = t.replace(/<!--[\s\S]*?-->/g, "");
  t = t.replace(/<\/(p|div|tr|h[1-6]|li|section|article)>/gi, "\n");
  t = t.replace(/<br\s*\/?>/gi, "\n");
  t = t.replace(/<[^>]+>/g, " ");
  t = t.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
  for (const [e, z] of Object.entries(ENTITAETEN)) t = t.split(e).join(z);
  t = t.replace(/ /g, " ");
  t = t.split("\n").map((z) => z.replace(/[ \t]+/g, " ").trim()).join("\n");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

function jaFeld(w) {
  return `"${String(w).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

// Minimaler Satzleser fuer das erzeugte Registerformat. Kein voller YAML-Parser:
// die Dateien folgen einem festen Muster, und eine Abhaengigkeit waere hier
// unverhaeltnismaessig.
function saetzeLesen(text) {
  // Die Registerdateien wurden von verschiedenen Rechercheeinheiten geschrieben und
  // nutzen unterschiedliche Einrueckung (Spalte 0 oder zwei Leerzeichen). Der Leser
  // ist deshalb einrueckungsunabhaengig.
  const bloecke = text.split(/\n[ \t]*- id:[ \t]*/).slice(1);
  return bloecke.map((b) => {
    const wert = (re) => {
      const m = b.match(re);
      return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
    };
    return {
      id: b.split("\n")[0].trim().replace(/^["']|["']$/g, ""),
      name: wert(/\n[ \t]*name:[ \t]*(.*)/),
      url: wert(/\n[ \t]*url:[ \t]*(.*)/),
      stufe: wert(/autoritaetsstufe:[ \t]*(\d)/),
      sprachen: wert(/sprachen:[ \t]*\[(.*)\]/),
      zugang: wert(/\n[ \t]*zugang:[ \t]*(.*)/),
      gueltig_ab: wert(/gueltig_ab:[ \t]*(.*)/),
      ueberholt: /ist_ueberholt:[ \t]*true/.test(b),
      frei: /\n[ \t]*zugang:[ \t]*["']?frei/.test(b),
      maschinell: /maschinell_abrufbar:[ \t]*true/.test(b),
      perspektiven: wert(/perspektiven:[ \t]*\[(.*)\]/),
    };
  });
}

function ordnerFuer(stufe) {
  if (stufe === "1" || stufe === "2") return "recht";
  if (stufe === "3") return "amtlich";
  if (stufe === "5") return "presse";
  return "fachquellen";
}

async function existiert(p) { try { await access(p); return true; } catch { return false; } }
const schlafen = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const limitArg = process.argv.indexOf("--limit");
  const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;
  const nurArg = process.argv.indexOf("--nur");
  const nur = nurArg > -1 ? new RegExp(process.argv[nurArg + 1], "i") : null;

  const dateien = (await readdir(REGISTER)).filter((d) => d.endsWith(".yaml"));
  let saetze = [];
  for (const d of dateien) {
    saetze.push(...saetzeLesen(await readFile(join(REGISTER, d), "utf8")));
  }

  const gesehen = new Set();
  const kandidaten = saetze.filter((s) => {
    if (!s.url.startsWith("http")) return false;
    if (!s.frei || !s.maschinell) return false;
    if (AUSGESCHLOSSEN.some((r) => r.test(s.url))) return false;
    if (nur && !nur.test(s.url)) return false;
    if (gesehen.has(s.url)) return false;
    gesehen.add(s.url);
    return true;
  }).slice(0, limit);

  console.log(`${saetze.length} Saetze im Register, ${kandidaten.length} zu ernten\n`);
  await mkdir(CACHE, { recursive: true });

  const ergebnis = { ok: 0, leer: 0, fehler: [] };

  for (const [i, s] of kandidaten.entries()) {
    const marke = `[${i + 1}/${kandidaten.length}] ${s.id}`;
    const cachePfad = join(CACHE, `${s.id}.html`);
    let html;
    try {
      if (await existiert(cachePfad)) {
        html = await readFile(cachePfad, "utf8");
      } else {
        // Viele Institutionenseiten (OECD, ADB, Kanzleien) weisen generische
        // Bot-Kennungen pauschal ab, liefern denselben oeffentlichen Text aber an
        // eine uebliche Browserkennung aus. Erst hoeflich anfragen, bei 403 mit
        // Browserkennung wiederholen. Es wird keine Bezahlschranke umgangen.
        let a = await fetch(s.url, {
          headers: { "User-Agent": KENNUNG_BOT },
          signal: AbortSignal.timeout(45000),
        });
        // Zweiter Versuch, wenn die Seite abweist ODER nur eine leere Huelle
        // liefert. Beides kommt vor: OECD antwortet mit 403, Atameken mit 200
        // und einem leeren Rumpf. Erst danach gilt eine Quelle als nicht
        // erreichbar.
        let roh = a.ok ? await a.text() : "";
        if (!a.ok || roh.length < 2000) {
          await schlafen(PAUSE_MS);
          const b = await fetch(s.url, {
            headers: {
              "User-Agent": KENNUNG_BROWSER,
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "ru,en;q=0.9,de;q=0.8",
            },
            signal: AbortSignal.timeout(45000),
          });
          if (b.ok) {
            const rohB = await b.text();
            if (rohB.length > roh.length) { a = b; roh = rohB; }
          }
        }
        if (!a.ok && !roh) throw new Error(`HTTP ${a.status}`);
        // Binaerdateien niemals als Text lesen. Ein ZIP durch die Textwandlung zu
        // schicken erzeugt Datenmuell und blaeht die Ablage auf: das ESF-SDK
        // (189 MB) wurde so einmal zu einer 166-MB-Textdatei. Archive und PDF
        // gehoeren gesondert behandelt, nicht in den Textkorpus.
        const typ = (a.headers.get("content-type") || "").toLowerCase();
        const laenge = Number(a.headers.get("content-length") || 0);
        if (!/text\/|json|xml/.test(typ)) {
          throw new Error(`kein Text (${typ || "unbekannt"}, ${(laenge / 1048576).toFixed(1)} MB), gesondert behandeln`);
        }
        if (laenge > 12 * 1048576) {
          throw new Error(`zu gross fuer den Textkorpus (${(laenge / 1048576).toFixed(1)} MB)`);
        }
        html = roh;
        await writeFile(cachePfad, html, "utf8");
        await schlafen(PAUSE_MS);
      }
    } catch (f) {
      console.log(`${marke}  FEHLER ${f.message}`);
      ergebnis.fehler.push({ id: s.id, url: s.url, grund: f.message });
      continue;
    }

    const text = alsText(html);
    if (text.length < 400) {
      console.log(`${marke}  zu wenig Text (${text.length} Zeichen), vermutlich JS-Huelle`);
      ergebnis.leer++;
      ergebnis.fehler.push({ id: s.id, url: s.url, grund: `nur ${text.length} Zeichen` });
      continue;
    }

    const ordner = join(ZIEL, ordnerFuer(s.stufe));
    await mkdir(ordner, { recursive: true });
    const frontmatter = [
      "---",
      `chunk_id: ${jaFeld(s.id)}`,
      `quelle_id: ${jaFeld(s.id)}`,
      `norm_id: null`,
      `sprache: ${jaFeld((s.sprachen.split(",")[0] || "ru").trim())}`,
      `autoritaetsstufe: ${s.stufe || 4}`,
      `rechtsstelle: null`,
      `titel: ${jaFeld(s.name)}`,
      `perspektiven: [${s.perspektiven}]`,
      `gueltig_ab: ${s.gueltig_ab && s.gueltig_ab !== "null" ? jaFeld(s.gueltig_ab) : "null"}`,
      "gueltig_bis: null",
      `ist_ueberholt: ${s.ueberholt}`,
      "ersetzt_durch: null",
      `abgerufen_am: ${jaFeld(HEUTE)}`,
      `url: ${jaFeld(s.url)}`,
      `konfidenz: ${jaFeld(s.stufe === "1" || s.stufe === "2" ? "bestaetigt" : "unbestaetigt")}`,
      "---",
      "",
    ].join("\n");
    await writeFile(join(ordner, `${s.id}.md`), `${frontmatter}${text}\n`, "utf8");
    console.log(`${marke}  ${(text.length / 1024).toFixed(0)} kB -> ${ordnerFuer(s.stufe)}/`);
    ergebnis.ok++;
  }

  console.log(`\nGeerntet ${ergebnis.ok}, ohne verwertbaren Text ${ergebnis.leer}, Fehler ${ergebnis.fehler.length - ergebnis.leer}`);
  if (ergebnis.fehler.length) {
    await writeFile(
      join(ZIEL, "ernte-fehler.json"),
      JSON.stringify(ergebnis.fehler, null, 2),
      "utf8",
    );
    console.log(`Fehlerliste: ${join(ZIEL, "ernte-fehler.json")}`);
  }
}

main().catch((f) => { console.error(`Abbruch: ${f.message}`); process.exit(1); });
