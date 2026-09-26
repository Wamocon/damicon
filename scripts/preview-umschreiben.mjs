// Schreibt eine Migration fuer das Schema public_preview um (reine Logik, ohne Datenbank).
//
// Warum: Production und Preview teilen eine Supabase-Datenbank. Preview arbeitet im Schema
// public_preview, einer Kopie von public. Jede Migration laeuft deshalb ein zweites Mal,
// umgeschrieben, auf public_preview, und zwar schon beim Push in einen Pull Request, also VOR
// dem Review und vor public. Die Migrationen verweisen fest auf public (public.tabelle,
// set search_path = public); ohne Umschreiben wuerden Preview-Funktionen in Production schreiben.
//
// Gemeinsam genutzte Objekte ausserhalb von public (gleiche Auth, gleicher Storage, gleiches
// pg_cron) bekommen fuer Preview eigene Zwillinge:
//   - Trigger auf auth.* und storage.*  -> Name mit Endung _preview; die aufgerufene Funktion
//     faengt in Preview jeden Fehler ab, damit ungepruefter PR-Code nie eine Production-Anmeldung bricht
//   - Policies auf auth.* und storage.* -> Name mit Endung _preview
//   - Storage-Buckets                   -> Id mit Endung -preview (ausser GEMEINSAME_BUCKETS)
//   - pg_cron-Jobs                       -> Name mit Endung -preview, Befehl mit search_path public_preview
// Alles, was sich nicht sicher umschreiben laesst, wird abgelehnt. Einen Abschnitt, der fuer
// Preview nicht laufen soll, rahmt man in der Migration so:
//   -- preview:auslassen
//   ...
//   -- preview:ende

export const PREVIEW_SCHEMA = "public_preview";
export const GEMEINSAME_BUCKETS = ["ki-sprachausgabe"];
export const HUELLE = "-- preview:huelle";

const GEMEINSAME_SCHEMAS = ["auth", "storage", "cron", "realtime", "vault", "net", "supabase_functions", "supabase_migrations", "graphql", "graphql_public", "pgsodium", "pgbouncer"];
const GEMEINSAM = `(?:${GEMEINSAME_SCHEMAS.join("|")})`;
const NAME = String.raw`("(?:[^"]|"")+"|[A-Za-z_][\w$]*)`;
const MAX_NAME = 63;
const CRON_PFAD = `set search_path = ${PREVIEW_SCHEMA}, extensions; `;
// Erweiterungen, die ihr Schema selbst festlegen (nicht verschiebbar)
const FESTE_ERWEITERUNGEN = ["pg_cron", "pg_net", "pgsodium", "supabase_vault"];

/** Zerlegt SQL in Abschnitte: code, kommentar, zeichenkette, bezeichner, dollar. */
export function abschnitte(sql) {
  const teile = [];
  let i = 0;
  let code = 0;
  const n = sql.length;
  const schiebe = (typ, ende) => {
    if (i > code) teile.push({ typ: "code", text: sql.slice(code, i) });
    teile.push({ typ, text: sql.slice(i, ende) });
    i = ende;
    code = ende;
  };
  while (i < n) {
    const c = sql[i];
    const d = sql[i + 1];
    if (c === "-" && d === "-") {
      const e = sql.indexOf("\n", i);
      schiebe("kommentar", e < 0 ? n : e);
    } else if (c === "/" && d === "*") {
      let tiefe = 1;
      let j = i + 2;
      while (j < n && tiefe > 0) {
        if (sql[j] === "/" && sql[j + 1] === "*") { tiefe++; j += 2; }
        else if (sql[j] === "*" && sql[j + 1] === "/") { tiefe--; j += 2; }
        else j++;
      }
      schiebe("kommentar", j);
    } else if (c === "'") {
      const escape = /[eE]/.test(sql[i - 1] ?? "") && !/[\w$]/.test(sql[i - 2] ?? "");
      let j = i + 1;
      while (j < n) {
        if (escape && sql[j] === "\\") { j += 2; continue; }
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") { j += 2; continue; }
          j++;
          break;
        }
        j++;
      }
      schiebe("zeichenkette", Math.min(j, n));
    } else if (c === '"') {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === '"') {
          if (sql[j + 1] === '"') { j += 2; continue; }
          j++;
          break;
        }
        j++;
      }
      schiebe("bezeichner", Math.min(j, n));
    } else if (c === "$" && !/[\w$]/.test(sql[i - 1] ?? "")) {
      const m = /^\$(?:[A-Za-z_]\w*)?\$/.exec(sql.slice(i, i + 64));
      if (m) {
        const e = sql.indexOf(m[0], i + m[0].length);
        schiebe("dollar", e < 0 ? n : e + m[0].length);
      } else i++;
    } else i++;
  }
  if (code < n) teile.push({ typ: "code", text: sql.slice(code) });
  return teile;
}

/** Zerlegt SQL in Anweisungen auf oberster Ebene (Semikolon ausserhalb von Kommentaren, Zeichenketten und $-Rumpf). */
export function anweisungen(sql) {
  const liste = [];
  let aktuell = "";
  for (const t of abschnitte(sql)) {
    if (t.typ !== "code") { aktuell += t.text; continue; }
    const stuecke = t.text.split(";");
    for (let k = 0; k < stuecke.length; k++) {
      aktuell += stuecke[k];
      if (k < stuecke.length - 1) {
        liste.push(aktuell + ";");
        aktuell = "";
      }
    }
  }
  if (aktuell.trim()) liste.push(aktuell);
  return liste;
}

/** Text zum Erkennen: ohne Kommentare, Zeichenketten und $-Rumpf optional geleert. */
function erkennungstext(anweisung, { rumpf }) {
  return abschnitte(anweisung)
    .map((t) => {
      if (t.typ === "kommentar") return " ";
      if (t.typ === "zeichenkette") return rumpf ? t.text : "''";
      if (t.typ === "dollar") return rumpf ? t.text : "$$ $$";
      return t.text;
    })
    .join("");
}

function ohneKommentare(anweisung) {
  return abschnitte(anweisung).map((t) => (t.typ === "kommentar" ? " " : t.text)).join("");
}

function mitEndung(name, endung) {
  const roh = name.startsWith('"') ? name.slice(1, -1) : name;
  if (roh.length + endung.length > MAX_NAME) throw new Error(`Name "${roh}${endung}" ist laenger als ${MAX_NAME} Zeichen`);
  return name.startsWith('"') ? `"${roh}${endung}"` : `${name}${endung}`;
}

/** "auth"."users" und auth."users" werden zu auth.users, damit die Erkennung sie findet. */
function gemeinsameSchemasEntquoten(sql) {
  const liste = GEMEINSAME_SCHEMAS.join("|");
  return sql
    .replace(new RegExp(`"(${liste})"\\.`, "g"), "$1.")
    .replace(new RegExp(`\\b(${liste})\\."([a-z_][a-z0-9_$]*)"`, "g"), "$1.$2");
}

/** Ersetzt die Verweise auf das Schema public durch public_preview. Die Rolle PUBLIC ("to public", "from public") bleibt. */
export function schemaUmbenennen(sql) {
  const s = PREVIEW_SCHEMA;
  return sql
    .replace(/"public"\./g, `"${s}".`)
    // auch dynamisch gebaute Namen: format('public.%I', t) und 'public.' || t
    .replace(/(?<![\w$"])public\.(?=["A-Za-z_%'])/gi, `${s}.`)
    .replace(/(\bsearch_path"?\s*(?:=|\bto\b)\s*)([^;\n]*)/gi, (_, kopf, liste) =>
      kopf + liste.replace(/(^|[\s,])(["']?)public\2(?=[\s,]|$)/gi, `$1$2${s}$2`))
    .replace(/('search_path'\s*,\s*')([^']*)'/gi, (_, kopf, liste) =>
      `${kopf}${liste.replace(/(^|[\s,])public(?=[\s,]|$)/gi, `$1${s}`)}'`)
    .replace(/\bschema\s+("?)public\1(?![\w.$])/gi, (_, q) => `schema ${q}${s}${q}`)
    .replace(/(\b(?:\w*schema\w*|nspname)\s*(?:=|<>|!=)\s*)'public'/gi, `$1'${s}'`)
    .replace(/(\b(?:\w*schema\w*|nspname)\s+(?:not\s+)?in\s*\()([^)]*)\)/gi, (_, kopf, liste) =>
      `${kopf}${liste.replace(/'public'/g, `'${s}'`)})`)
    .replace(/'public'(\s*::\s*regnamespace)/gi, `'${s}'$1`)
    .replace(/(to_regnamespace\s*\(\s*)'public'/gi, `$1'${s}'`)
    // "if not exists (select 1 from pg_type where typname = 'x')" findet sonst das Objekt in public
    .replace(/(\b((?:\w+\.)?)(typ|rel|pro|con)name\s*=\s*'[^']*')(?!\s+and\s+(?:\w+\.)?\w+namespace\b)/gi, (_, vergleich, alias, art) =>
      `${vergleich} and ${alias}${art}namespace = '${s}'::regnamespace`);
}

const R = (quelle, flags = "i") => new RegExp(quelle, flags);

const TRIGGER_ANLEGEN = R(String.raw`\bcreate\s+(?:or\s+replace\s+)?(?:constraint\s+)?trigger\s+${NAME}\s+(?:before|after|instead\s+of)\b[\s\S]*?\bon\s+(?:only\s+)?(?:auth|storage)\.`);
const TRIGGER_AUF_GEMEINSAM = [
  TRIGGER_ANLEGEN,
  R(String.raw`\bdrop\s+trigger\s+(?:if\s+exists\s+)?${NAME}\s+on\s+(?:only\s+)?(?:auth|storage)\.`),
  R(String.raw`\bcomment\s+on\s+trigger\s+${NAME}\s+on\s+(?:auth|storage)\.`),
  R(String.raw`\balter\s+trigger\s+${NAME}\s+on\s+(?:auth|storage)\.`),
  R(String.raw`\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:auth|storage)\.\S+\s+(?:enable|disable)\s+(?:always\s+|replica\s+)?trigger\s+`),
];
const POLICY_AUF_GEMEINSAM = [
  R(String.raw`\b(?:create|alter)\s+policy\s+${NAME}\s+on\s+(?:auth|storage)\.`),
  R(String.raw`\bdrop\s+policy\s+(?:if\s+exists\s+)?${NAME}\s+on\s+(?:auth|storage)\.`),
  R(String.raw`\bcomment\s+on\s+policy\s+${NAME}\s+on\s+(?:auth|storage)\.`),
];
const UNERLAUBT = [
  [R(String.raw`\b(?:create|alter|drop)\s+(?:or\s+replace\s+)?(?:unique\s+)?(?:table|view|materialized\s+view|function|procedure|type|domain|sequence|aggregate|operator)\s+(?:if\s+(?:not\s+)?exists\s+)?(?:only\s+)?${GEMEINSAM}\.`), "legt ein Objekt in einem gemeinsamen Schema an oder aendert es"],
  [R(String.raw`\bcreate\s+(?:unique\s+)?index\b[^;]*?\bon\s+(?:only\s+)?${GEMEINSAM}\.`), "legt einen Index in einem gemeinsamen Schema an"],
  [R(String.raw`\b(?:create|alter|drop)\s+schema\s+(?:if\s+(?:not\s+)?exists\s+)?"?${GEMEINSAM}\b`), "aendert ein gemeinsames Schema"],
  [R(String.raw`\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${GEMEINSAM}\.`), "aendert eine Tabelle in einem gemeinsamen Schema"],
  [R(String.raw`\b(?:insert\s+into|update|delete\s+from|truncate(?:\s+table)?)\s+(?:only\s+)?${GEMEINSAM}\.(?!buckets\b)`), "aendert Daten in einem gemeinsamen Schema"],
  [R(String.raw`\b(?:grant|revoke)\b[^;]*?\bon\s+(?:table\s+|function\s+|sequence\s+|schema\s+|all\s+\w+\s+in\s+schema\s+)?"?${GEMEINSAM}\b`), "vergibt Rechte in einem gemeinsamen Schema"],
  [R(String.raw`\bcomment\s+on\s+(?:table|column|function|view|type)\s+${GEMEINSAM}\.`), "kommentiert ein Objekt in einem gemeinsamen Schema"],
  [R(String.raw`\b(?:create|alter|drop)\s+event\s+trigger\b`), "Event-Trigger gelten fuer die ganze Datenbank"],
  [R(String.raw`\b(?:vault|net|supabase_functions|pgsodium)\.\w+\s*\(`), "ruft eine Funktion mit Seiteneffekt in einem gemeinsamen Schema auf"],
  [R(String.raw`\balter\s+(?:role|user|database|system)\b`), "aendert Einstellungen fuer die ganze Datenbank oder eine Rolle"],
  [R(String.raw`\breset\s+(?:search_path|all)\b|\bset\s+(?:session\s+|local\s+)?search_path\s*(?:=|to)\s*default\b`), "setzt den search_path zurueck, unqualifizierte Namen trafen dann public"],
  [R(String.raw`\b(?:drop|alter)\s+extension\b`), "Erweiterungen gelten fuer die ganze Datenbank"],
];

function triggerUmbenennen(a) {
  return a
    .replace(R(String.raw`(\bcreate\s+(?:or\s+replace\s+)?(?:constraint\s+)?trigger\s+)${NAME}`, "gi"), (_, k, n) => k + mitEndung(n, "_preview"))
    .replace(R(String.raw`(\bdrop\s+trigger\s+(?:if\s+exists\s+)?)${NAME}`, "gi"), (_, k, n) => k + mitEndung(n, "_preview"))
    .replace(R(String.raw`(\bcomment\s+on\s+trigger\s+)${NAME}`, "gi"), (_, k, n) => k + mitEndung(n, "_preview"))
    .replace(R(String.raw`(\balter\s+trigger\s+)${NAME}`, "gi"), (_, k, n) => k + mitEndung(n, "_preview"))
    .replace(R(String.raw`(\balter\s+trigger\s+\S+\s+on\s+\S+\s+rename\s+to\s+)${NAME}`, "gi"), (_, k, n) => k + mitEndung(n, "_preview"))
    .replace(R(String.raw`(\b(?:enable|disable)\s+(?:always\s+|replica\s+)?trigger\s+)${NAME}`, "gi"), (m, k, n) =>
      /^(all|user)$/i.test(n) ? m : k + mitEndung(n, "_preview"));
}

function policyUmbenennen(a) {
  return a
    .replace(R(String.raw`(\b(?:create|alter)\s+policy\s+)${NAME}`, "gi"), (_, k, n) => k + mitEndung(n, "_preview"))
    .replace(R(String.raw`(\bdrop\s+policy\s+(?:if\s+exists\s+)?)${NAME}`, "gi"), (_, k, n) => k + mitEndung(n, "_preview"))
    .replace(R(String.raw`(\bcomment\s+on\s+policy\s+)${NAME}`, "gi"), (_, k, n) => k + mitEndung(n, "_preview"))
    .replace(R(String.raw`(\balter\s+policy\s+\S+\s+on\s+\S+\s+rename\s+to\s+)${NAME}`, "gi"), (_, k, n) => k + mitEndung(n, "_preview"));
}

const escape = (wert) => wert.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const literal = (wert) => new RegExp(`'${escape(wert)}'`, "g");

/** Argumente eines Aufrufs ab `start` (direkt hinter der oeffnenden Klammer): [{ von, bis }], null ohne schliessende Klammer. */
function argumente(text, start) {
  const liste = [];
  let tiefe = 0;
  let von = start;
  let pos = start;
  for (const t of abschnitte(text.slice(start))) {
    if (t.typ !== "code") { pos += t.text.length; continue; }
    for (let k = 0; k < t.text.length; k++, pos++) {
      const c = t.text[k];
      if (c === "(") tiefe++;
      else if (c === ")") {
        if (tiefe === 0) { liste.push({ von, bis: pos }); return liste; }
        tiefe--;
      } else if (c === "," && tiefe === 0) {
        liste.push({ von, bis: pos });
        von = pos + 1;
      }
    }
  }
  return null;
}

/** Wert eines Arguments ohne "name =>": { von, bis, art } mit art "text", "dollar" oder "sonst". */
function argumentWert(text, arg) {
  const roh = text.slice(arg.von, arg.bis);
  const praefix = /^\s*(?:[a-z_]+\s*(?:=>|:=)\s*)?/i.exec(roh)[0];
  const von = arg.von + praefix.length;
  const wert = text.slice(von, arg.bis).trimEnd();
  const art = /^'(?:[^']|'')*'$/.test(wert) ? "text" : /^(\$[A-Za-z_]*\$)[\s\S]*\1$/.test(wert) ? "dollar" : "sonst";
  return { von, bis: von + wert.length, art, wert, name: /^\s*([a-z_]+)\s*(?:=>|:=)/i.exec(roh)?.[1]?.toLowerCase() };
}

/** Cron-Jobs bekommen die Endung -preview, ihr Befehl laeuft mit search_path public_preview. */
function cronUmschreiben(text) {
  const aufrufe = [...text.matchAll(/\bcron\.(schedule_in_database|schedule|unschedule|alter_job)\s*\(/gi)];
  const namen = new Set();
  const aenderungen = [];
  for (const m of aufrufe) {
    const funktion = m[1].toLowerCase();
    if (funktion === "alter_job") throw new Error("cron.alter_job arbeitet mit Job-IDs und laesst sich fuer Preview nicht umschreiben");
    const args = argumente(text, m.index + m[0].length);
    if (!args) throw new Error(`cron.${funktion}( ohne schliessende Klammer`);
    const werte = args.map((a) => argumentWert(text, a));
    const benannt = (n) => werte.find((w) => w.name === n);
    const positionell = werte.filter((w) => !w.name);
    let name;
    let befehl;
    if (funktion === "unschedule") name = benannt("job_name") ?? positionell[0];
    else if (funktion === "schedule_in_database") {
      name = benannt("job_name") ?? positionell[0];
      befehl = benannt("command") ?? positionell[2];
    } else {
      name = benannt("job_name") ?? (positionell.length >= 3 ? positionell[0] : undefined);
      befehl = benannt("command") ?? (positionell.length >= 3 ? positionell[2] : positionell[1]);
    }
    if (funktion === "unschedule" && name?.art !== "text") throw new Error("cron.unschedule nur mit dem Jobnamen als Literal, nicht mit ID oder Variable");
    if (name && name.art !== "text") throw new Error("Cron-Jobname muss ein Literal sein");
    if (name) namen.add(name.wert.slice(1, -1));
    if (befehl) {
      if (befehl.art === "sonst") throw new Error("Cron-Befehl muss ein Literal sein");
      const kopf = befehl.art === "text" ? 1 : /^\$[A-Za-z_]*\$/.exec(befehl.wert)[0].length;
      aenderungen.push({ pos: befehl.von + kopf, einfuegen: befehl.art === "text" ? CRON_PFAD.replace(/'/g, "''") : CRON_PFAD });
    }
  }
  let neu = text;
  for (const a of aenderungen.sort((x, y) => y.pos - x.pos)) neu = neu.slice(0, a.pos) + a.einfuegen + neu.slice(a.pos);
  for (const m of neu.matchAll(/\bjobname\s*(?:=|<>|!=)\s*'((?:[^']|'')*)'/gi)) namen.add(m[1]);
  for (const n of namen) {
    if (n.endsWith("-preview")) continue;
    neu = neu.replace(literal(n), `'${n}-preview'`);
  }
  return neu;
}

/** Alle Bucket-Ids, die irgendeine Migration in storage.buckets anlegt. */
export function bucketsAus(inhalte) {
  const ids = new Set();
  for (const sql of inhalte) {
    for (const a of anweisungen(gemeinsameSchemasEntquoten(sql))) {
      const t = ohneKommentare(a);
      if (!/\binsert\s+into\s+storage\.buckets\b/i.test(t)) continue;
      const werte = t.slice(t.search(/\bvalues\b/i));
      for (const m of werte.matchAll(/\(\s*'([^']+)'/g)) ids.add(m[1]);
    }
  }
  return [...ids];
}

/** Funktionen, die Trigger auf auth.* oder storage.* aufrufen (in Preview mit Fehlerhuelle). */
export function triggerFunktionenAus(inhalte) {
  const namen = new Set();
  for (const sql of inhalte) {
    for (const a of anweisungen(gemeinsameSchemasEntquoten(sql))) {
      const t = erkennungstext(a, { rumpf: false });
      if (!TRIGGER_ANLEGEN.test(t)) continue;
      const m = /\bexecute\s+(?:function|procedure)\s+(?:"?public"?\.)?"?([A-Za-z_][\w$]*)"?\s*\(/i.exec(t);
      if (m) namen.add(m[1].toLowerCase());
    }
  }
  return [...namen];
}

/** Legt um den plpgsql-Rumpf eine Huelle, die jeden Fehler abfaengt und den Datensatz durchlaesst. */
function mitFehlerhuelle(anweisung, funktion) {
  const teile = abschnitte(anweisung);
  const i = teile.findIndex((t) => t.typ === "dollar");
  if (i < 0) throw new Error(`Rumpf von ${funktion} nicht gefunden`);
  const marke = /^\$[A-Za-z_]*\$/.exec(teile[i].text)[0];
  let rumpf = teile[i].text.slice(marke.length, -marke.length).replace(/\s+$/, "");
  if (!rumpf.endsWith(";")) rumpf += ";";
  const huelle = [
    `begin ${HUELLE}`,
    rumpf,
    `exception when others then ${HUELLE}`,
    `  raise warning 'Preview-Trigger % gescheitert, Production bleibt unberuehrt: %', '${funktion}', sqlerrm; ${HUELLE}`,
    `  return case when tg_op = 'DELETE' then old else new end; ${HUELLE}`,
    `end; ${HUELLE}`,
    "",
  ].join("\n");
  teile[i] = { typ: "dollar", text: `${marke}\n${huelle}${marke}` };
  return teile.map((t) => t.text).join("");
}

function markierteAbschnitteEntfernen(sql) {
  const zeilen = sql.split("\n");
  const aus = [];
  let offen = false;
  for (const z of zeilen) {
    if (/^\s*--\s*preview:auslassen\b/i.test(z)) {
      if (offen) throw new Error("'-- preview:auslassen' doppelt ohne '-- preview:ende'");
      offen = true;
      continue;
    }
    if (/^\s*--\s*preview:ende\b/i.test(z)) {
      if (!offen) throw new Error("'-- preview:ende' ohne vorheriges '-- preview:auslassen'");
      offen = false;
      continue;
    }
    if (!offen) aus.push(z);
  }
  if (offen) throw new Error("'-- preview:auslassen' ohne abschliessendes '-- preview:ende'");
  return aus.join("\n");
}

/**
 * @param {string} sql Inhalt einer Migrationsdatei
 * @param {{ buckets?: string[], triggerFunktionen?: string[] }} [optionen]
 *   buckets: alle bekannten Bucket-Ids (bucketsAus), triggerFunktionen: siehe triggerFunktionenAus
 * @returns {{ sql: string, gemeinsam: string[], fehler: string[] }}
 *   sql: umgeschriebene Migration fuer public_preview
 *   gemeinsam: die umgeschriebenen Anweisungen, die gemeinsame Objekte (Auth, Storage, Cron) anlegen
 *   fehler: Anweisungen, die sich nicht sicher umschreiben lassen
 */
export function umschreiben(sql, { buckets = [], triggerFunktionen = [] } = {}) {
  const fehler = [];
  const gemeinsam = [];
  let quelle;
  try {
    quelle = markierteAbschnitteEntfernen(sql);
  } catch (e) {
    return { sql: "", gemeinsam, fehler: [e.message] };
  }
  const eigeneBuckets = buckets.filter((b) => !GEMEINSAME_BUCKETS.includes(b));
  const aus = [];

  for (const original of anweisungen(quelle)) {
    const anweisung = gemeinsameSchemasEntquoten(original);
    const kurz = ohneKommentare(anweisung).replace(/\s+/g, " ").trim().slice(0, 120);
    if (!kurz || kurz === ";") { aus.push(anweisung); continue; }

    const volltext = ohneKommentare(anweisung);
    const istDo = /^\s*do\b/i.test(erkennungstext(anweisung, { rumpf: false }));
    const istCron = /\bcron\.\w+\s*\(/i.test(volltext);
    const istFunktion = /^\s*create\s+(?:or\s+replace\s+)?(?:function|procedure)\b/i.test(volltext);
    // DO-Bloecke und Cron-Befehle laufen bei der Migration: dort auch Rumpf und Zeichenketten pruefen
    const erkennung = erkennungstext(anweisung, { rumpf: istDo || (istCron && !istFunktion) });

    if (/^\s*create\s+extension\b/i.test(erkennung)) {
      aus.push(anweisung);
      continue;
    }

    const istTrigger = TRIGGER_AUF_GEMEINSAM.some((r) => r.test(erkennung));
    const istPolicy = POLICY_AUF_GEMEINSAM.some((r) => r.test(erkennung));
    const istBucket = /\b(?:insert\s+into|update)\s+storage\.buckets\b/i.test(erkennung);
    const funktion = /^\s*create\s+(?:or\s+replace\s+)?function\s+(?:"?public"?\.)"?([A-Za-z_][\w$]*)"?\s*\(/i.exec(erkennung)?.[1]?.toLowerCase();
    const brauchtHuelle = funktion && triggerFunktionen.includes(funktion);

    if ((istTrigger || istPolicy) && istDo) {
      fehler.push(`Trigger oder Policy auf auth/storage in einem DO-Block, bitte als eigene Anweisung schreiben: ${kurz}`);
      continue;
    }
    if (istTrigger && /\b(?:enable|disable)\s+(?:always\s+|replica\s+)?trigger\s+(?:all|user)\b/i.test(erkennung)) {
      fehler.push(`Schaltet alle Trigger einer gemeinsamen Tabelle, das traefe auch Production: ${kurz}`);
      continue;
    }
    const verboten = UNERLAUBT.find(([r]) => r.test(erkennung) && !(istTrigger && /\balter\s+table\b/i.test(erkennung)));
    if (verboten) {
      fehler.push(`${verboten[1]}: ${kurz}`);
      continue;
    }
    if (brauchtHuelle && !/\blanguage\s+'?plpgsql'?/i.test(erkennung)) {
      fehler.push(`${funktion} wird von einem Trigger auf auth/storage aufgerufen und muss plpgsql sein: ${kurz}`);
      continue;
    }

    let neu;
    try {
      neu = schemaUmbenennen(anweisung);
      if (istTrigger) neu = triggerUmbenennen(neu);
      if (istPolicy) neu = policyUmbenennen(neu);
      if (istCron) neu = cronUmschreiben(neu);
      if (brauchtHuelle) neu = mitFehlerhuelle(neu, funktion);
    } catch (e) {
      fehler.push(`${e.message}: ${kurz}`);
      continue;
    }

    if (/\bstorage\./i.test(volltext)) {
      const genannt = buckets.filter((b) => literal(b).test(volltext));
      const geteilt = genannt.filter((b) => GEMEINSAME_BUCKETS.includes(b));
      if ((istBucket || istPolicy) && genannt.length > 0 && geteilt.length === genannt.length) {
        continue; // betrifft nur gemeinsame Buckets: fuer Preview gibt es nichts anzulegen
      }
      if (geteilt.length > 0) {
        fehler.push(`Anweisung mischt eigene und gemeinsame Buckets (${geteilt.join(", ")}): ${kurz}`);
        continue;
      }
      if (istPolicy && genannt.length === 0 && /\b(?:create|alter)\s+policy\b/i.test(erkennung)) {
        fehler.push(`Storage-Policy ohne Bucket-Bezug, ihr Preview-Zwilling gaelte auch fuer die Production-Buckets: ${kurz}`);
        continue;
      }
      for (const b of eigeneBuckets) neu = neu.replace(literal(b), `'${b}-preview'`);
    }

    if (/'public'/.test(ohneKommentare(neu))) {
      fehler.push(`'public' als Wert, etwa als Schema in format() oder quote_ident(); das liesse sich nicht sicher umschreiben. Bitte public.name direkt schreiben: ${kurz}`);
      continue;
    }

    if (istTrigger || istPolicy || istBucket || (istCron && !istFunktion) || brauchtHuelle) gemeinsam.push(neu);
    aus.push(neu);
  }
  return { sql: aus.join(""), gemeinsam, fehler };
}

/**
 * Zusaetzliche Regeln fuer NEUE Migrationen. Preview laeuft vor public; eine Pruefung, die das Schema
 * offen laesst, faende spaeter in public das Preview-Objekt und uebersprunge sich selbst.
 * @returns {string[]} Fehler
 */
export function neueMigrationPruefen(sql) {
  const fehler = [];
  let quelle;
  try {
    quelle = markierteAbschnitteEntfernen(sql);
  } catch (e) {
    return [e.message];
  }
  for (const a of anweisungen(quelle)) {
    const t = ohneKommentare(a);
    const kurz = t.replace(/\s+/g, " ").trim().slice(0, 120);
    const ohneSchema = (spalte, schemaSpalte) =>
      R(String.raw`\b${spalte}\s*(?:=|in\b)`).test(t) && !R(String.raw`\b${schemaSpalte}\b`).test(t);
    const funde = [
      ["typname", "typnamespace"], ["relname", "relnamespace"], ["proname", "pronamespace"], ["conname", "connamespace"],
      ["tgname", "tgrelid"], ["policyname", "schemaname"], ["indexname", "schemaname"], ["tablename", "schemaname"],
      ["viewname", "schemaname"], ["table_name", "table_schema"], ["routine_name", "routine_schema"],
      ["constraint_name", "constraint_schema"],
    ].filter(([s, n]) => ohneSchema(s, n));
    if (funde.length > 0) {
      fehler.push(`Katalogabfrage ueber ${funde.map(([s]) => s).join(", ")} ohne Schema (z. B. "and ${funde[0][1]} = 'public'::regnamespace" bzw. "= 'public'"); sonst findet public das Objekt aus public_preview: ${kurz}`);
    }
    if (/\bto_reg(?:class|type|proc|procedure)\s*\(\s*'[^'.]+'\s*\)/i.test(t)) {
      fehler.push(`to_regclass/to_regtype ohne Schema, bitte 'public.name' schreiben: ${kurz}`);
    }
    for (const m of t.matchAll(/\bcreate\s+extension\s+(if\s+not\s+exists\s+)?"?([\w-]+)"?([^;']*)/gi)) {
      if (!m[1]) fehler.push(`create extension ohne "if not exists": ${kurz}`);
      if (!/\bwith\s+schema\b|\bschema\s+\w/i.test(m[3]) && !FESTE_ERWEITERUNGEN.includes(m[2].toLowerCase())) {
        fehler.push(`create extension ${m[2]} ohne "with schema extensions"; sonst landet sie im Suchpfad von public_preview: ${kurz}`);
      }
    }
  }
  return fehler;
}
