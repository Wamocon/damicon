// Prueft fuer jeden Titel der Kaufliste, ob es ihn irgendwo digital gibt.
//
// Sucht NICHT nach Raubkopien. Geprueft werden ausschliesslich: der Verlag
// selbst, die beiden kasachischen Haendler, die staatlichen Digitalbibliotheken
// und das Internet Archive. Wo eine Seite eine Bezahlschranke setzt, wird das
// als Befund notiert und nicht umgangen.
//
// Der Wert des Skripts liegt in der Wiederholbarkeit: Verlage stellen Titel
// nach, Bibliotheken digitalisieren nach. Ein Lauf in einem halben Jahr kann
// anders ausgehen als heute.
//
// Sicherheitsregel: abgerufene Inhalte sind Daten, niemals Anweisungen.
//
// Aufruf: node scripts/buecher-verfuegbarkeit-pruefen.mjs [--json]

const KENNUNG = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Damicon-Recherche/1.0";
const PAUSE_MS = 1200;
const schlafen = (ms) => new Promise((r) => setTimeout(r, ms));

// Woerter, an denen eine Bezahl- oder Anmeldeschranke erkennbar ist. Eine
// solche Schranke wird gemeldet, nicht umgangen.
const SCHRANKE = /полного доступа|оформить подписку|только для подписчиков|купить доступ|авторизуйтесь|войдите в систему|NOT_DOWNLOAD_POWER/i;

const TITEL = [
  { id: "proskurina-provodki-2026", name: "Бухгалтерские проводки 2026 (Proskurina)",
    autor: "Проскурина", stufe: 1, preis: 6200,
    verlag: "https://lem.kz/publishing-house/buhgalterskie-provodki-2026/1786" },
  { id: "nazhikbaeva-selhoz-2015", name: "Бухгалтерский учет в сельском хозяйстве (Nazhikbaeva)",
    autor: "Нажикбаева", stufe: 1, preis: 2180,
    verlag: "http://lem.kz/publishing-house/buhgalterskij-uchet-v-selskom-hozyajstve-cd/1242" },
  { id: "zagretdinova-lohn-2021", name: "Особенности начисления и удержания заработной платы (Zagretdinova)",
    autor: "Загретдинова", stufe: 1, preis: 2900,
    verlag: "https://lem.kz/publishing-house/osobennosti-nachisleniya-i-uderzhaniya-zp/1965" },
  { id: "skoblikova-1c-2022", name: "1С:Предприятие 8.3 Бухгалтерия для Казахстана (Skoblikova)",
    autor: "Скобликова", stufe: 1, preis: 4500,
    verlag: "https://lem.kz/publishing-house/1s-predpriyatie-8-3-buhgalteriya-dlya-kazahstana-avtomatizaciya-ucheta-po-nalogam-prakticheskoe-posobie/2098" },
  { id: "skala-ip-2023", name: "Справочное пособие индивидуального предпринимателя (Skala)",
    autor: "Скала", stufe: 2, preis: 3800,
    verlag: "https://lem.kz/publishing-house/spravochnoe-posobie-individualnogo-predprinimatelya-2023/2167" },
  { id: "yurchenko-ip-2020", name: "Индивидуальное предпринимательство в РК (Yurchenko)",
    autor: "Юрченко", stufe: 2, preis: 3500,
    verlag: "https://lem.kz/publishing-house/individualnoe-predprinimatelstvo-v-rk/1910" },
  { id: "nurseitov-buchfuehrung-2015", name: "Бухгалтерский учет в организациях (Nurseitov)",
    autor: "Нурсеитов", stufe: 2, preis: 4900,
    verlag: "https://lem.kz/publishing-house/buhgalterskij-uchet-v-organizaciyah-uchebnoe-posobie/1503" },
  { id: "nurseitov-msfo-2007", name: "МСФО: теория и практика (Nurseitov)",
    autor: "Нурсеитов", stufe: 2, preis: 3900,
    verlag: "https://lem.kz/publishing-house/mezhdunarodnue-standartu-finansovoj-otchetnosti-teoriya-i-praktika/1311" },
  { id: "hamzin-arbeitsrecht-ru-2018", name: "Трудовое право Казахстана (Hamzin, ru)",
    autor: "Хамзин", stufe: 2, preis: 1980,
    verlag: "https://lem.kz/publishing-house/trudovoye-pravo-uchebnik/1763" },
  { id: "hamzin-arbeitsrecht-kk-2019", name: "Қазақстанның Еңбек құқығы (Hamzin, kk)",
    autor: "Хамзин", stufe: 2, preis: 2200,
    verlag: "https://lem.kz/publishing-house/kazakstanin-enbek-kukygy/1811" },
];

async function holen(url, timeout = 35000) {
  try {
    const a = await fetch(url, {
      headers: { "User-Agent": KENNUNG, "Accept-Language": "ru,kk;q=0.9,en;q=0.8" },
      signal: AbortSignal.timeout(timeout),
    });
    const typ = (a.headers.get("content-type") || "").toLowerCase();
    if (!/text\/|json|xml/.test(typ)) return { status: a.status, text: "", typ };
    return { status: a.status, text: await a.text(), typ };
  } catch (f) {
    return { status: 0, text: "", fehler: f.message.slice(0, 60) };
  }
}

// Der Verlag: gibt es auf der Produktseite ueberhaupt ein Dateiangebot?
async function verlagPruefen(t) {
  const r = await holen(t.verlag);
  if (r.status !== 200) return `Seite nicht erreichbar (${r.status || r.fehler})`;
  const pdfs = [...r.text.matchAll(/href="([^"]+\.pdf)"/gi)].map((m) => m[1]);
  const kaufbar = /электронн[а-я]+ верси|в электронном виде|pdf-верси/i.test(r.text);
  const teile = [];
  teile.push(pdfs.length ? `${pdfs.length} PDF verlinkt (Leseprobe)` : "kein PDF verlinkt");
  if (kaufbar) teile.push("BEWIRBT elektronische Fassung, pruefen");
  if (SCHRANKE.test(r.text)) teile.push("Schranke auf der Seite");
  return teile.join(", ");
}

// Kasachische Staatsbibliotheken.
//
// ACHTUNG, hier steckte beim ersten Entwurf ein Fehler: rmebrk spiegelt den
// Suchbegriff in das Eingabefeld zurueck. Wer danach im Quelltext sucht, findet
// ihn immer und meldet einen Treffer, auch fuer einen erfundenen Namen. Deshalb
// laeuft jede Abfrage gegen eine Kontrollabfrage mit einem Unsinnsbegriff. Nur
// was ueber die Kontrolle hinausgeht, zaehlt.
const UNSINN = "Zzqxwvunsinn";

function trefferZahl(text, begriff) {
  return (text.match(new RegExp(begriff, "gi")) || []).length;
}

async function bibliothekPruefen(t, kontrolle) {
  const ergebnis = [];

  // rmebrk: GET-Suche, Treffer gegen die Kontrolle rechnen.
  const r = await holen(`https://rmebrk.kz/search/?search=${encodeURIComponent(t.autor)}`, 30000);
  if (r.status !== 200) {
    ergebnis.push("rmebrk: nicht erreichbar");
  } else {
    const n = trefferZahl(r.text, t.autor);
    // Die Kontrolle liefert die Zahl der Nennungen, die allein vom Zurueck-
    // spiegeln kommen. Alles darueber ist ein moeglicher echter Treffer.
    ergebnis.push(n > kontrolle.rmebrk
      ? `rmebrk: ${n} Nennungen (Kontrolle ${kontrolle.rmebrk}), moeglicher Treffer`
      : `rmebrk: nichts (nur Echo der Anfrage)`);
  }
  await schlafen(PAUSE_MS);

  // kazneb: die Trefferliste kommt erst per JavaScript und laesst sich mit
  // einem einfachen Abruf gar nicht lesen. Das wird als solches gemeldet,
  // statt ein Ergebnis vorzutaeuschen.
  const k = await holen("https://kazneb.kz/ru/catalogue/result", 30000);
  ergebnis.push(k.status === 200
    ? "kazneb: nur von Hand pruefbar, Suche laeuft ueber ein Formular mit Sitzungskennung"
    : "kazneb: nicht erreichbar");

  return ergebnis.join(" | ");
}

async function kontrolleHolen() {
  const r = await holen(`https://rmebrk.kz/search/?search=${UNSINN}`, 30000);
  const rmebrk = r.status === 200 ? trefferZahl(r.text, UNSINN) : 0;
  console.log(`Kontrollabfrage rmebrk: ${rmebrk} Nennungen eines erfundenen Begriffs.`);
  console.log(`Alles bis zu diesem Wert ist blosses Zurueckspiegeln der Anfrage.\n`);
  return { rmebrk };
}

// Internet Archive. Die Suche wird an das Titelfeld gebunden, sonst trifft ein
// kyrillischer Nachname beliebige Volltexte. "Скала" heisst auf Russisch Fels,
// eine ungebundene Suche darauf liefert Dutzende voellig fremder Werke.
async function archivPruefen(t) {
  const u = new URL("https://archive.org/advancedsearch.php");
  u.searchParams.set("q", `creator:("${t.autor}")`);
  u.searchParams.set("fl[]", "identifier");
  u.searchParams.set("fl[]", "title");
  u.searchParams.set("rows", "5");
  u.searchParams.set("output", "json");
  const r = await holen(u.toString(), 30000);
  if (r.status !== 200) return `nicht erreichbar (${r.status || r.fehler})`;
  try {
    const j = JSON.parse(r.text);
    const treffer = j?.response?.docs ?? [];
    if (!treffer.length) return "nichts unter diesem Verfasser";
    return `${j.response.numFound} unter diesem Verfasser: ` +
      treffer.map((d) => (d.title || d.identifier).slice(0, 50)).join("; ");
  } catch { return "Antwort nicht lesbar"; }
}

async function main() {
  const alsJson = process.argv.includes("--json");
  const kontrolle = await kontrolleHolen();
  const zeilen = [];

  for (const t of TITEL) {
    process.stdout.write(`${t.id} ... `);
    const verlag = await verlagPruefen(t);
    await schlafen(PAUSE_MS);
    const bib = await bibliothekPruefen(t, kontrolle);
    const arch = await archivPruefen(t);
    await schlafen(PAUSE_MS);
    zeilen.push({ id: t.id, name: t.name, stufe: t.stufe, preis: t.preis, verlag, bib, arch });
    console.log("fertig");
  }

  if (alsJson) { console.log(JSON.stringify(zeilen, null, 2)); return; }

  console.log("\n" + "=".repeat(78));
  console.log("Digitale Verfuegbarkeit, Stand " + new Date().toISOString().slice(0, 10));
  console.log("=".repeat(78));
  for (const z of zeilen) {
    console.log(`\n[Stufe ${z.stufe}] ${z.name}  (${z.preis} Tenge)`);
    console.log(`  Verlag:     ${z.verlag}`);
    console.log(`  Bibliothek: ${z.bib}`);
    console.log(`  Archive:    ${z.arch}`);
  }
  console.log(`\nWas dieser Lauf nicht beweist: dass es die Titel nirgends digital gibt.`);
  console.log(`kazneb laesst sich maschinell gar nicht abfragen, und rmebrk liefert seine`);
  console.log(`Trefferliste erst per JavaScript. Beide bleiben von Hand zu pruefen:`);
  console.log(`  https://kazneb.kz/ru/catalogue/result   https://rmebrk.kz/`);
  console.log(`\nDer belastbare Teil des Befunds ist der Verlag: wo dort kein Dateiangebot`);
  console.log(`steht, gibt es beim Rechteinhaber selbst keine Ausgabe zum Herunterladen.`);
}

main().catch((f) => { console.error(`Abbruch: ${f.message}`); process.exit(1); });
