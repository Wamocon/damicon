// =============================================================================
// Damicon - Testdaten fuer den E2E-Durchlauf
// =============================================================================
// Ausfuehren:
//   node --env-file=.env.local supabase/testdaten.mjs --bestand
//   node --env-file=.env.local supabase/testdaten.mjs --sockel
//   node --env-file=.env.local supabase/testdaten.mjs --lauf=1
//   node --env-file=.env.local supabase/testdaten.mjs --lauf=1 --entfernen
//
// Stellt den Startzustand fuer den Gesamtprozess her (Vorbestellung bis
// Deckungsbeitrag, 36 Schritte, sechs Rollen). Die Vorgaenge selbst - Pflueck-
// aufgabe, Charge, Steigen, Lieferung, Lohnlauf - entstehen in der Oberflaeche.
// Genau das ist die Vorfuehrung, deshalb legt dieses Skript sie nicht an.
//
// Drei Durchlaeufe, damit sich der Prozess mehrfach ueben laesst. Jeder haengt
// an einem eigenen Reihenblock, einer eigenen Vorbestellung und einer eigenen
// Lohnperiode - sonst blockiert der erste Lauf den zweiten, weil
// lohn_abrechnungen ein unique (pfluecker_id, periode_start, periode_ende)
// traegt und eine abgeschlossene Pflueckaufgabe unveraenderlich ist.
//
// Idempotent ueber feste Kennungen: ein zweiter Lauf aendert nichts.
// =============================================================================

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Fehlende Env-Variablen. Aufruf: node --env-file=.env.local supabase/testdaten.mjs --bestand",
  );
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } });

// --- Argumente --------------------------------------------------------------
const argumente = process.argv.slice(2);
const hat = (name) => argumente.includes(name);
const wert = (name) => {
  const treffer = argumente.find((a) => a.startsWith(`${name}=`));
  return treffer ? treffer.slice(name.length + 1) : null;
};

const nurBestand = hat("--bestand");
const nurSockel = hat("--sockel");
const entfernen = hat("--entfernen");
const nurScanner = hat("--scanner");
const laufNummer = wert("--lauf") ? Number(wert("--lauf")) : null;

// --- Schutz: nicht versehentlich gegen die Produktion ----------------------
// Ohne diese Abfrage haengt ein Schreibvorgang auf der gehosteten Instanz nur
// an einer vergessenen --env-file. Lesen ist immer erlaubt.
const istLokal = /127\.0\.0\.1|localhost/.test(url);
if (!istLokal && !nurBestand && !hat("--ich-weiss-was-ich-tue")) {
  console.error(`\nZiel ist NICHT lokal: ${url}`);
  console.error("Zum Schreiben dort zusaetzlich --ich-weiss-was-ich-tue angeben.\n");
  process.exit(1);
}

// --- Feste Kennungen --------------------------------------------------------
// Feste UUIDs statt zufaelliger: so ist derselbe Datensatz beim zweiten Lauf
// wiedererkennbar (idempotent) und beim Entfernen exakt adressierbar. Ein
// Namensmuster wie "DEMO-" im Code waere in der Vorfuehrung sichtbar.
const K = (n, art) => `d0000000-0000-4000-8000-${String(n).padStart(4, "0")}${art}`;
const KENNUNG = {
  reihenblock: (n) => K(n, "00000001"),
  vorbestellung: (n) => K(n, "00000002"),
  arbeitszeit: (n, i) => K(n, `0000001${i}`),
  aufgabe: (n) => K(n, "00000003"),
  kontingent: "d0000000-0000-4000-8000-900000000001",
};

// Das Scannerpaket liegt bewusst neben den drei Laeufen (Kennung 9): Es dient
// zum Ueben der Kamera, nicht zum Vorfuehren, und soll sich unabhaengig von
// einem laufenden Durchgang anlegen und abraeumen lassen.
const SCANNER = 9;

const LAEUFE = {
  1: { block: "T-N-A-05", menge: 90, terminPlus: 3, wochenZurueck: 0 },
  2: { block: "T-N-A-06", menge: 75, terminPlus: 4, wochenZurueck: 1 },
  3: { block: "T-N-A-07", menge: 120, terminPlus: 5, wochenZurueck: 2 },
};

const KUNDE = "Almaty Fresh Market";
const SORTE = "Polka";
const AUSWEIS = "MAL-0417";
const GRUPPE = "Reihengruppe A";
const PARZELLE = "Parzelle Nord";

// --- Ausgabe ----------------------------------------------------------------
let fehler = 0;
const ok = (text) => console.log(`  OK        ${text}`);
const unveraendert = (text) => console.log(`  bereits   ${text}`);
const schlecht = (text) => {
  console.log(`  FEHLER    ${text}`);
  fehler += 1;
};
const hinweis = (text) => console.log(`  Hinweis   ${text}`);

/** Wirft mit klarer Meldung statt still weiterzulaufen. */
function pruefe(antwort, was) {
  if (antwort.error) throw new Error(`${was}: ${antwort.error.message}`);
  return antwort.data;
}

/** Loest einen Bestandsdatensatz ueber seinen natuerlichen Schluessel auf.
 *  IDs sind je Umgebung verschieden, Namen nicht. */
async function idVon(tabelle, spalte, wert, zusatz = {}) {
  let abfrage = db.from(tabelle).select("id").eq(spalte, wert);
  for (const [k, v] of Object.entries(zusatz)) abfrage = abfrage.eq(k, v);
  const { data, error } = await abfrage.maybeSingle();
  if (error) throw new Error(`${tabelle}.${spalte}=${wert}: ${error.message}`);
  return data?.id ?? null;
}

// --- Datumshelfer -----------------------------------------------------------
// Ortszeit, nicht UTC: toISOString() haette bei MESZ aus Mitternacht den
// Vortag gemacht und die Lohnperiode um einen Tag verschoben.
const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const tagePlus = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};
/** Montag der Woche, die n Wochen zurueckliegt. */
function wochenStart(wochenZurueck) {
  const d = new Date();
  const wochentag = (d.getDay() + 6) % 7; // Montag = 0
  d.setDate(d.getDate() - wochentag - wochenZurueck * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ===========================================================================
// Bestandsaufnahme - nur lesend
// ===========================================================================
async function bestand() {
  console.log(`\nBestand: ${url}\n`);

  // Die Tabellen, an denen der E2E-Durchlauf haengt. Zahl statt Schaetzung:
  // head + count spart das Uebertragen der Zeilen.
  const tabellen = [
    "betriebe", "sorten", "reihenbloecke", "brigaden", "pfluecker", "profiles",
    "b2b_kunden", "kontingente", "preislisten", "vorbestellungen",
    "pflueckaufgaben", "chargen", "steigen", "arbeitszeiten",
    "lieferungen", "touren", "lohn_saetze", "lohn_abrechnungen", "lohn_positionen",
    "wetter_messungen", "schulungsteilnahmen", "einarbeitung_fortschritt",
    "esutd_vertraege", "ki_anbieter", "kundeneinladungen",
  ];

  console.log("Tabelle                     Zeilen");
  console.log("-".repeat(40));
  for (const t of tabellen) {
    const { count, error } = await db.from(t).select("*", { count: "exact", head: true });
    const zahl = error ? `Fehler: ${error.message.slice(0, 30)}` : String(count ?? 0);
    console.log(`${t.padEnd(28)}${zahl}`);
  }

  // --- Die drei Voraussetzungen des E2E-Durchlaufs -------------------------
  console.log("\nVoraussetzungen fuer den Durchlauf");
  console.log("-".repeat(40));

  // 1. Aktive Preisliste mit der Sorte. vorbestellungen.ts filtert auf
  //    aktiv = true; ohne sie sieht der Kunde in Phase 1 keine Preise.
  const { data: preislisten } = await db
    .from("preislisten")
    .select("name, aktiv, kundengruppe, preislisten_positionen ( preis_tenge_kg, sorten ( name ) )")
    .eq("aktiv", true);
  const mitSorte = (preislisten ?? []).filter((p) =>
    (p.preislisten_positionen ?? []).some((pos) => pos.sorten?.name === SORTE),
  );
  if (mitSorte.length > 0) ok(`aktive Preisliste mit ${SORTE}: ${mitSorte.map((p) => p.name).join(", ")}`);
  else schlecht(`keine aktive Preisliste mit ${SORTE} - der Kunde sieht keine Preise`);

  // 2. Kontingent des Demo-Kunden. Ohne es laeuft die Bestaetigung zwar durch,
  //    reserviert aber nichts - die Vorfuehrung verspricht etwas, das ausbleibt.
  const kundeId = await idVon("b2b_kunden", "name", KUNDE);
  const sorteId = await idVon("sorten", "name", SORTE);
  if (!kundeId) schlecht(`B2B-Kunde "${KUNDE}" fehlt`);
  else {
    const { data: kont } = await db
      .from("kontingente")
      .select("menge_kg, reserviert_kg, saison")
      .eq("b2b_kunde_id", kundeId)
      .eq("sorte_id", sorteId);
    const frei = (kont ?? []).reduce((s, k) => s + (Number(k.menge_kg) - Number(k.reserviert_kg)), 0);
    if (frei > 0) ok(`Kontingent ${KUNDE}/${SORTE}: ${frei} kg frei`);
    else schlecht(`kein freies Kontingent fuer ${KUNDE}/${SORTE} - Reservierung bleibt aus`);
  }

  // 3. Gesperrter Reihenblock fuer den Negativtest in Schritt 10.
  const heute = iso(new Date());
  const { data: gesperrt } = await db
    .from("pflanzenschutz_behandlungen")
    .select("freigabe_am, reihenbloecke ( code )")
    .gt("freigabe_am", heute);
  if ((gesperrt ?? []).length > 0) {
    ok(`gesperrte Bloecke: ${gesperrt.map((b) => `${b.reihenbloecke?.code} bis ${b.freigabe_am}`).join(", ")}`);
  } else {
    schlecht("kein Block mit Wartezeit in der Zukunft - Schritt 10 zeigt nichts");
  }

  // --- Zustand der drei Durchlaeufe ----------------------------------------
  console.log("\nDurchlaeufe");
  console.log("-".repeat(40));
  for (const n of [1, 2, 3]) {
    const { data: block } = await db
      .from("reihenbloecke").select("code, status").eq("id", KENNUNG.reihenblock(n)).maybeSingle();
    const { data: vb } = await db
      .from("vorbestellungen").select("menge_kg, status").eq("id", KENNUNG.vorbestellung(n)).maybeSingle();
    if (!block && !vb) console.log(`  Lauf ${n}: nicht angelegt`);
    else console.log(`  Lauf ${n}: Block ${block?.code ?? "-"} (${block?.status ?? "-"}), Vorbestellung ${vb ? `${vb.menge_kg} kg, ${vb.status}` : "-"}`);
  }

  // Scannerpaket: liegt neben den Laeufen, deshalb eigene Zeile.
  const { data: scanAufgabe } = await db
    .from("pflueckaufgaben").select("code, status").eq("id", KENNUNG.aufgabe(SCANNER)).maybeSingle();
  if (!scanAufgabe) {
    console.log("  Scanner: nicht angelegt");
  } else {
    const { count } = await db
      .from("steigen").select("*", { count: "exact", head: true })
      .eq("pflueckaufgabe_id", KENNUNG.aufgabe(SCANNER));
    const { data: ch } = await db
      .from("chargen").select("oeffentlicher_code").eq("pflueckaufgabe_id", KENNUNG.aufgabe(SCANNER)).maybeSingle();
    console.log(`  Scanner: ${scanAufgabe.code} (${scanAufgabe.status}), ${count ?? 0} Steigen, Herkunft /de/herkunft/${ch?.oeffentlicher_code ?? "-"}`);
  }
  console.log("");
}

// ===========================================================================
// Sockel - behebt die drei Blocker, laeuft einmal, gehoert zu keinem Lauf
// ===========================================================================
async function sockel() {
  console.log(`\nSockel: ${url}\n`);

  // --- 1. Preisliste aktivieren -------------------------------------------
  // vorbestellungen.ts:137 filtert auf aktiv = true, danach auf die
  // Kundengruppe: erlaubt sind Listen ohne Gruppe und die der eigenen. Der
  // Demo-Kunde steht auf "einzelhandel", fuer ihn greift also die allgemeine
  // Liste ohne Gruppe. Deren aktiv-Flag steht auf false - ohne diesen Schritt
  // sieht er in Phase 1 keine Preise.
  const { data: listen } = await db
    .from("preislisten")
    .select("id, name, aktiv, kundengruppe")
    .is("kundengruppe", null);

  for (const liste of listen ?? []) {
    if (liste.aktiv) {
      unveraendert(`Preisliste "${liste.name}" war schon aktiv`);
      continue;
    }
    pruefe(await db.from("preislisten").update({ aktiv: true }).eq("id", liste.id), "Preisliste aktivieren");
    ok(`Preisliste "${liste.name}" aktiviert`);
  }

  // --- 2. Kontingent fuer den Demo-Kunden ----------------------------------
  // Ohne Kontingent laeuft die Bestaetigung durch, reserviert aber nichts:
  // vorbestellung_kontingent_abgleichen() prueft auf "if v_kontingent_id is
  // not null". Die Vorfuehrung verspricht in Phase 2 eine Reservierung.
  const kundeId = await idVon("b2b_kunden", "name", KUNDE);
  const sorteId = await idVon("sorten", "name", SORTE);
  if (!kundeId || !sorteId) {
    schlecht(`${KUNDE} oder Sorte ${SORTE} fehlt - laeuft seed.sql auf dieser Instanz?`);
    return;
  }

  const { data: vorhanden } = await db
    .from("kontingente").select("id").eq("id", KENNUNG.kontingent).maybeSingle();
  if (vorhanden) {
    unveraendert(`Kontingent ${KUNDE}/${SORTE} steht bereits`);
  } else {
    pruefe(
      await db.from("kontingente").insert({
        id: KENNUNG.kontingent,
        sorte_id: sorteId,
        b2b_kunde_id: kundeId,
        menge_kg: 1500,
        reserviert_kg: 0,
        saison: String(new Date().getFullYear()),
      }),
      "Kontingent anlegen",
    );
    ok(`Kontingent ${KUNDE}/${SORTE}: 1500 kg, davon 0 reserviert`);
  }

  // --- 3. Frische Wartezeitsperre ------------------------------------------
  // Schritt 10 zeigt, dass ein gesperrter Block gar nicht erst zur Auswahl
  // steht. Die Sperren aus seed.sql sind laengst abgelaufen. Eine Behandlung
  // von heute sperrt drei Tage - das traegt bis Freitag.
  //
  // Diese Zeile bleibt dauerhaft: pflanzenschutz_behandlungen ist append-only
  // (20260917000000), ein Rueckdatieren wuerde die gesetzliche Wartezeit
  // unterlaufen. Bewusst in Kauf genommen, sie gehoert fachlich zum Betrieb.
  const heute = iso(new Date());
  const { data: nochGesperrt } = await db
    .from("pflanzenschutz_behandlungen").select("id").gt("freigabe_am", heute).limit(1);

  if ((nochGesperrt ?? []).length > 0) {
    unveraendert("ein Block ist bereits gesperrt");
  } else {
    const blockId = await idVon("reihenbloecke", "code", "T-N-A-04");
    const mittelId = await idVon("psm_mittel", "name", "Signum");
    if (!blockId || !mittelId) {
      schlecht("Reihenblock T-N-A-04 oder Mittel Signum fehlt");
    } else {
      const leitung = await idVon("profiles", "email", "leitung@damicon.demo");
      pruefe(
        await db.from("pflanzenschutz_behandlungen").insert({
          reihenblock_id: blockId,
          psm_mittel_id: mittelId,
          behandelt_am: heute,
          wartezeit_tage: 3,
          aufwandmenge: 1.5,
          aufwandmenge_einheit: "kg_ha",
          durchgefuehrt_von_profil_id: leitung,
        }),
        "Behandlung anlegen",
      );
      ok(`T-N-A-04 behandelt am ${heute}, gesperrt bis ${iso(tagePlus(3))}`);
    }
  }
  console.log("");
}

// ===========================================================================
// Durchlauf anlegen
// ===========================================================================
async function laufAnlegen(n) {
  const plan = LAEUFE[n];
  if (!plan) { schlecht(`Lauf ${n} gibt es nicht, waehle 1, 2 oder 3`); return; }

  console.log(`\nLauf ${n} anlegen: ${url}\n`);

  const sorteId = await idVon("sorten", "name", SORTE);
  const kundeId = await idVon("b2b_kunden", "name", KUNDE);
  const pflueckerId = await idVon("pfluecker", "ausweis", AUSWEIS);
  if (!sorteId || !kundeId || !pflueckerId) {
    schlecht("Stammdaten fehlen - laeuft seed.sql und db:seed-auth auf dieser Instanz?");
    return;
  }

  // Reihengruppe ueber den Namen aufloesen, nicht ueber die ID: die ist je
  // Umgebung verschieden.
  const { data: gruppen } = await db
    .from("reihengruppen")
    .select("id, name, feldparzellen ( name )")
    .eq("name", GRUPPE);
  const gruppe = (gruppen ?? []).find((g) => g.feldparzellen?.name === PARZELLE);
  if (!gruppe) { schlecht(`${GRUPPE} in ${PARZELLE} nicht gefunden`); return; }

  // --- 1. Reihenblock ------------------------------------------------------
  // Status "bepflanzt" ist Absicht: Schritt 7 bis 9 gibt ihn frei. Stuende er
  // schon auf "erntereif", haette die Planungsphase nichts zu tun.
  const blockId = KENNUNG.reihenblock(n);
  const { data: blockDa } = await db.from("reihenbloecke").select("code").eq("id", blockId).maybeSingle();
  if (blockDa) {
    unveraendert(`Reihenblock ${blockDa.code}`);
  } else {
    pruefe(
      await db.from("reihenbloecke").insert({
        id: blockId,
        reihengruppe_id: gruppe.id,
        code: plan.block,
        sorte_id: sorteId,
        status: "bepflanzt",
        laenge_m: 42,
        letzte_ernte: iso(tagePlus(-21)),
      }),
      "Reihenblock anlegen",
    );
    ok(`Reihenblock ${plan.block}, ${SORTE}, bepflanzt`);
  }

  // --- 2. Vorbestellung ----------------------------------------------------
  // Status "angefragt": Phase 2 bestaetigt sie, und erst dieser Uebergang
  // loest die Kontingentreservierung aus (angefragt -> bestaetigt).
  const vbId = KENNUNG.vorbestellung(n);
  const { data: vbDa } = await db.from("vorbestellungen").select("menge_kg").eq("id", vbId).maybeSingle();
  if (vbDa) {
    unveraendert(`Vorbestellung ueber ${vbDa.menge_kg} kg`);
  } else {
    pruefe(
      await db.from("vorbestellungen").insert({
        id: vbId,
        b2b_kunde_id: kundeId,
        sorte_id: sorteId,
        menge_kg: plan.menge,
        liefertermin: iso(tagePlus(plan.terminPlus)),
        status: "angefragt",
      }),
      "Vorbestellung anlegen",
    );
    ok(`Vorbestellung ${plan.menge} kg ${SORTE} fuer ${KUNDE}, Termin ${iso(tagePlus(plan.terminPlus))}`);
  }

  // --- 3. Arbeitszeiten ----------------------------------------------------
  // Ohne sie rechnet der Lohnlauf in Phase 7 nur die eine Aufgabe des
  // Durchlaufs ab - der Betrag waere unrealistisch klein. Drei Tage zu je
  // acht Stunden ergeben eine Woche, die sich vorzeigen laesst.
  const start = wochenStart(plan.wochenZurueck);
  let angelegt = 0;
  for (let i = 0; i < 3; i += 1) {
    const zeitId = KENNUNG.arbeitszeit(n, i);
    const { data: da } = await db.from("arbeitszeiten").select("id").eq("id", zeitId).maybeSingle();
    if (da) continue;
    const beginn = new Date(start);
    beginn.setDate(beginn.getDate() + i);
    beginn.setHours(7, 0, 0, 0);
    const ende = new Date(beginn);
    ende.setHours(15, 0, 0, 0);
    pruefe(
      await db.from("arbeitszeiten").insert({
        id: zeitId,
        pfluecker_id: pflueckerId,
        beginn: beginn.toISOString(),
        ende: ende.toISOString(),
      }),
      "Arbeitszeit anlegen",
    );
    angelegt += 1;
  }
  const periodeEnde = new Date(start);
  periodeEnde.setDate(periodeEnde.getDate() + 6);
  if (angelegt > 0) ok(`${angelegt} Arbeitszeiten fuer ${AUSWEIS}, je 8 h`);
  else unveraendert(`Arbeitszeiten fuer ${AUSWEIS}`);

  console.log(`\n  Lohnperiode fuer Phase 7: ${iso(start)} bis ${iso(periodeEnde)}`);
  console.log(`  Reihenblock fuer Phase 2: ${plan.block}`);
  console.log(`  Vorbestellung fuer Phase 1: ${plan.menge} kg ${SORTE}\n`);
}

// ===========================================================================
// Durchlauf entfernen
// ===========================================================================
// Loescht, was der Lauf angelegt hat, und alles, was im Prozess daraus
// entstanden ist. Die Reihenfolge folgt den Fremdschluesseln: chargen und
// pflueckaufgaben haengen mit RESTRICT am Reihenblock, der deshalb zuletzt geht.
//
// Die Sperrtrigger auf kuehlketten_messungen, transport_temperatur_messungen
// und steigen lassen den service_role-Weg durch (auth.uid() is null, siehe
// block_erntebuchung_mutation und steige_nach_abschluss_fest). Ueber die
// Anwendung bleiben sie unveraenderlich - hier, ausserhalb, geht das Aufraeumen.
//
// Nicht loeschbar bleiben finance_ledger_entries, audit_events,
// personenbezogene_zugriffe und reklamation_ereignisse: die haengen an
// block_ledger_mutation(), und die kennt keine Ausnahme.
async function laufEntfernen(n) {
  const plan = LAEUFE[n];
  if (!plan) { schlecht(`Lauf ${n} gibt es nicht, waehle 1, 2 oder 3`); return; }

  console.log(`\nLauf ${n} entfernen: ${url}\n`);

  const blockId = KENNUNG.reihenblock(n);
  const vbId = KENNUNG.vorbestellung(n);

  /** Loescht und meldet die Anzahl, ohne bei leerer Menge zu laermen. */
  async function weg(tabelle, spalte, werte, was) {
    const liste = Array.isArray(werte) ? werte : [werte];
    if (liste.length === 0) return;
    const { error, count } = await db
      .from(tabelle).delete({ count: "exact" }).in(spalte, liste);
    if (error) schlecht(`${was}: ${error.message}`);
    else if ((count ?? 0) > 0) ok(`${count} ${was} entfernt`);
  }

  async function ids(tabelle, spalte, werte) {
    const liste = Array.isArray(werte) ? werte : [werte];
    if (liste.length === 0) return [];
    const { data } = await db.from(tabelle).select("id").in(spalte, liste);
    return (data ?? []).map((z) => z.id);
  }

  // Alles einsammeln, was am Reihenblock des Laufs haengt.
  const aufgaben = await ids("pflueckaufgaben", "reihenblock_id", blockId);
  const chargen = await ids("chargen", "reihenblock_id", blockId);
  const lieferungen = [
    ...(await ids("lieferungen", "charge_id", chargen)),
    ...(await ids("lieferungen", "vorbestellung_id", vbId)),
  ];

  // 1. Transportmessungen, dann die Lieferungen
  await weg("transport_temperatur_messungen", "lieferung_id", lieferungen, "Transportmessungen");
  await weg("lieferungen", "id", lieferungen, "Lieferungen");

  // 2. Kuehlmessungen und Steigen, dann die Chargen
  await weg("kuehlketten_messungen", "charge_id", chargen, "Kuehlmessungen");
  await weg("steigen", "charge_id", chargen, "Steigen (ueber Charge)");
  await weg("steigen", "pflueckaufgabe_id", aufgaben, "Steigen (ueber Aufgabe)");

  // 3. Lohnabrechnung der Periode. lohn_positionen haengt per CASCADE dran.
  const pflueckerId = await idVon("pfluecker", "ausweis", AUSWEIS);
  if (pflueckerId) {
    const start = wochenStart(plan.wochenZurueck);
    const ende = new Date(start);
    ende.setDate(ende.getDate() + 6);
    const { error, count } = await db
      .from("lohn_abrechnungen").delete({ count: "exact" })
      .eq("pfluecker_id", pflueckerId)
      .lte("periode_start", iso(ende))
      .gte("periode_ende", iso(start));
    if (error) schlecht(`Lohnabrechnung: ${error.message}`);
    else if ((count ?? 0) > 0) ok(`${count} Lohnabrechnung(en) der Periode entfernt`);
  }

  // 4. Aufgaben (media_belege haengen per CASCADE dran) und Chargen
  await weg("pflueckaufgaben", "id", aufgaben, "Pflueckaufgaben");
  await weg("chargen", "id", chargen, "Chargen");

  // 5. Was der Lauf selbst angelegt hat
  await weg("arbeitszeiten", "id", [0, 1, 2].map((i) => KENNUNG.arbeitszeit(n, i)), "Arbeitszeiten");

  // Eine bestaetigte Vorbestellung haelt Menge im Kontingent fest. Der Trigger
  // vorbestellung_kontingent_abgleichen() bucht nur bei bestaetigt -> storniert
  // zurueck, nicht beim Loeschen - ein einfaches DELETE liesse die Reservierung
  // als Phantom stehen. Deshalb erst stornieren, dann loeschen.
  const { data: vbStatus } = await db
    .from("vorbestellungen").select("status").eq("id", vbId).maybeSingle();
  if (vbStatus?.status === "bestaetigt") {
    const { error } = await db.from("vorbestellungen").update({ status: "storniert" }).eq("id", vbId);
    if (error) schlecht(`Vorbestellung stornieren: ${error.message}`);
    else ok("Vorbestellung storniert, Kontingent zurueckgebucht");
  }
  await weg("vorbestellungen", "id", vbId, "Vorbestellung");
  await weg("reihenbloecke", "id", blockId, "Reihenblock");

  // 6. Was stehen bleibt, offen benennen statt stillschweigend uebergehen.
  const { count: buchungen } = await db
    .from("finance_ledger_entries").select("*", { count: "exact", head: true })
    .in("charge_id", chargen.length > 0 ? chargen : ["00000000-0000-0000-0000-000000000000"]);
  if ((buchungen ?? 0) > 0) {
    hinweis(`${buchungen} Finanzbuchung(en) bleiben stehen - append-only, keine Ausnahme fuer service_role`);
  }
  console.log("");
}

// ===========================================================================
// Scannerpaket - Steigen mit echten Etiketten zum Ueben der Kamera
// ===========================================================================
// Beide Scanner sitzen in der Nachweiskette einer Pflueckaufgabe
// (components/db/nachweiskette-ansicht.tsx und -formulare.tsx):
//   * Ausweis-Scan ordnet einen Pfluecker zu. Der QR traegt den rohen Code
//     ("MAL-0417") - dafuer genuegen die Stammdaten, die schon stehen.
//   * Steige-Scan sucht eine Steige. Der QR traegt die Herkunfts-URL mit
//     ?steige=<Code>. Dafuer braucht es Steigen, die es vor Phase 3 nicht gibt.
//
// Die Aufgabe bleibt auf "in_arbeit": nach dem Abschluss sind Steigen fest
// (steige_nach_abschluss_fest) und eine Stichprobenkontrolle nicht mehr
// moeglich. Genau die soll sich hier aber ueben lassen.
//
// Die Etiketten stehen danach unter Hof > QR-Steigen zum Anzeigen und Drucken.
async function scannerAnlegen() {
  console.log(`\nScannerpaket anlegen: ${url}
`);

  const sorteId = await idVon("sorten", "name", SORTE);
  const pflueckerId = await idVon("pfluecker", "ausweis", AUSWEIS);
  const brigadeId = await idVon("brigaden", "name", "Brigade Nord");
  if (!sorteId || !pflueckerId || !brigadeId) {
    schlecht("Stammdaten fehlen - laeuft seed.sql auf dieser Instanz?");
    return;
  }

  const { data: gruppen } = await db
    .from("reihengruppen").select("id, name, feldparzellen ( name )").eq("name", GRUPPE);
  const gruppe = (gruppen ?? []).find((g) => g.feldparzellen?.name === PARZELLE);
  if (!gruppe) { schlecht(`${GRUPPE} in ${PARZELLE} nicht gefunden`); return; }

  // --- Reihenblock ---------------------------------------------------------
  const blockId = KENNUNG.reihenblock(SCANNER);
  const { data: blockDa } = await db
    .from("reihenbloecke").select("code").eq("id", blockId).maybeSingle();
  if (blockDa) {
    unveraendert(`Reihenblock ${blockDa.code}`);
  } else {
    pruefe(
      await db.from("reihenbloecke").insert({
        id: blockId, reihengruppe_id: gruppe.id, code: "T-N-B-09",
        sorte_id: sorteId, status: "erntereif", laenge_m: 40,
      }),
      "Reihenblock anlegen",
    );
    ok("Reihenblock T-N-B-09, Polka, erntereif");
  }

  // --- Pflueckaufgabe ------------------------------------------------------
  // Mit ihr entsteht per charge_zur_aufgabe_anlegen() automatisch die Charge,
  // an der die Steigen und damit die Etiketten haengen.
  const aufgabeId = KENNUNG.aufgabe(SCANNER);
  const { data: aufgabeDa } = await db
    .from("pflueckaufgaben").select("code, status").eq("id", aufgabeId).maybeSingle();
  if (aufgabeDa) {
    unveraendert(`Pflueckaufgabe ${aufgabeDa.code} (${aufgabeDa.status})`);
  } else {
    pruefe(
      await db.from("pflueckaufgaben").insert({
        id: aufgabeId, code: "PA-SCAN-UEBUNG", reihenblock_id: blockId,
        brigade_id: brigadeId, sorte_id: sorteId, status: "in_arbeit",
        zielmenge_kg: 60, faelligkeit: iso(tagePlus(1)),
      }),
      "Pflueckaufgabe anlegen",
    );
    ok("Pflueckaufgabe PA-SCAN-UEBUNG, in Arbeit");
  }

  const { data: charge } = await db
    .from("chargen").select("id, code, oeffentlicher_code, pflueck_zeitpunkt")
    .eq("pflueckaufgabe_id", aufgabeId).maybeSingle();
  if (!charge) { schlecht("Zur Aufgabe ist keine Charge entstanden"); return; }

  // --- Zeitpunkte und Kuehlmessung -----------------------------------------
  // Ohne sie bleiben auf der oeffentlichen Herkunftsseite drei Felder leer:
  // Pflueckzeitpunkt, Vorkuehlung und die Aussage, ob die Kuehlkette hielt.
  // Genau die will Phase 6 zeigen. 38 Minuten bis zur Vorkuehlung liegen
  // innerhalb der 60-Minuten-Regel - die Seite meldet "eingehalten".
  if (!charge.pflueck_zeitpunkt) {
    const gepflueckt = new Date();
    gepflueckt.setHours(gepflueckt.getHours() - 3);
    const vorgekuehlt = new Date(gepflueckt);
    vorgekuehlt.setMinutes(vorgekuehlt.getMinutes() + 38);
    pruefe(
      await db.from("chargen").update({
        pflueck_zeitpunkt: gepflueckt.toISOString(),
        vorkuehlung_zeitpunkt: vorgekuehlt.toISOString(),
        status: "gekuehlt",
      }).eq("id", charge.id),
      "Zeitpunkte setzen",
    );
    // ergebnis und minuten_seit_pfluecken rechnet kuehlkette_bewerten() selbst.
    pruefe(
      await db.from("kuehlketten_messungen").insert({
        charge_id: charge.id,
        gemessen_am: vorgekuehlt.toISOString(),
        temperatur_c: 3.5,
      }),
      "Kuehlmessung anlegen",
    );
    ok("Pflueckzeitpunkt, Vorkuehlung nach 38 min, Messung 3,5 Grad");
  } else {
    unveraendert("Zeitpunkte und Kuehlmessung");
  }

  // --- Steigen -------------------------------------------------------------
  // code leer lassen: steige_nummer_vergeben() setzt Code UND qr_token selbst,
  // abgeleitet aus dem Chargencode. So tragen die Etiketten echte Nummern
  // statt erfundener.
  const { count: vorhanden } = await db
    .from("steigen").select("*", { count: "exact", head: true }).eq("pflueckaufgabe_id", aufgabeId);
  if ((vorhanden ?? 0) > 0) {
    unveraendert(`${vorhanden} Steigen an der Aufgabe`);
  } else {
    const gewichte = [4.2, 4.0, 4.4, 3.9, 4.1, 4.3];
    for (const g of gewichte) {
      pruefe(
        await db.from("steigen").insert({
          code: "", charge_id: charge.id, pflueckaufgabe_id: aufgabeId,
          gewicht_kg: g, pfluecker_id: pflueckerId,
        }),
        "Steige anlegen",
      );
    }
    ok(`${gewichte.length} Steigen, zusammen ${gewichte.reduce((a, b) => a + b, 0).toFixed(1)} kg`);
  }

  const { data: liste } = await db
    .from("steigen").select("code").eq("pflueckaufgabe_id", aufgabeId).order("code");
  console.log("\n  Zum Scannen bereit, Etiketten unter Hof > QR-Steigen:");
  for (const st of liste ?? []) console.log(`    ${st.code}`);
  console.log(`\n  Herkunftsseite: /de/herkunft/${charge.oeffentlicher_code}`);
  console.log(`  Ausweis zum Scannen: ${AUSWEIS}\n`);
}

async function scannerEntfernen() {
  console.log(`\nScannerpaket entfernen: ${url}
`);
  const blockId = KENNUNG.reihenblock(SCANNER);
  const aufgabeId = KENNUNG.aufgabe(SCANNER);

  const { data: chargen } = await db.from("chargen").select("id").eq("reihenblock_id", blockId);
  const chargenIds = (chargen ?? []).map((c) => c.id);

  for (const [tabelle, spalte, werte, was] of [
    ["kuehlketten_messungen", "charge_id", chargenIds, "Kuehlmessungen"],
    ["steigen", "pflueckaufgabe_id", [aufgabeId], "Steigen"],
    ["pflueckaufgaben", "id", [aufgabeId], "Pflueckaufgabe"],
    ["chargen", "id", chargenIds, "Chargen"],
    ["reihenbloecke", "id", [blockId], "Reihenblock"],
  ]) {
    if (werte.length === 0) continue;
    const { error, count } = await db.from(tabelle).delete({ count: "exact" }).in(spalte, werte);
    if (error) schlecht(`${was}: ${error.message}`);
    else if ((count ?? 0) > 0) ok(`${count} ${was} entfernt`);
  }
  console.log("");
}

// ===========================================================================
async function main() {
  if (nurBestand) { await bestand(); }
  else if (nurSockel) { await sockel(); }
  else if (nurScanner) {
    if (entfernen) await scannerEntfernen();
    else await scannerAnlegen();
  }
  else if (laufNummer !== null) {
    if (entfernen) await laufEntfernen(laufNummer);
    else await laufAnlegen(laufNummer);
  } else {
    console.log(`\nDamicon - Testdaten fuer den E2E-Durchlauf

  --bestand              zaehlt und prueft die Voraussetzungen (nur lesend)
  --sockel               behebt die drei Blocker, laeuft einmal
  --lauf=1|2|3           legt einen Durchlauf an
  --lauf=1|2|3 --entfernen    raeumt ihn wieder ab
  --scanner              Steigen mit Etiketten zum Ueben der Kamera
  --scanner --entfernen  raeumt sie wieder ab

Auf einer nicht-lokalen Instanz zusaetzlich --ich-weiss-was-ich-tue.
`);
  }
  if (fehler > 0) {
    console.error(`${fehler} Fehler.`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Abgebrochen:", error.message ?? error);
  process.exit(1);
});
