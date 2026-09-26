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
import { DATENBANK_SCHEMA } from "../scripts/datenbank-schema.mjs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Fehlende Env-Variablen. Aufruf: node --env-file=.env.local supabase/testdaten.mjs --bestand",
  );
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false }, db: { schema: DATENBANK_SCHEMA } });

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
const nurJahr = hat("--jahr");
const nurFinanz = hat("--finanz");
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

/** Liest eine Abfrage seitenweise aus.
 *
 *  supabase/config.toml begrenzt jede Antwort auf max_rows = 1000. Wer mehr
 *  Zeilen erwartet und das nicht beachtet, bekommt stillschweigend nur die
 *  erste Seite. Eine Pruefung auf Vollstaendigkeit haelt Vorhandenes dann fuer
 *  fehlend und legt es ein zweites Mal an.
 */
async function alleZeilen(aufbau, seite = 1000) {
  const alles = [];
  for (let von = 0; ; von += seite) {
    const { data, error } = await aufbau().range(von, von + seite - 1);
    if (error) throw new Error(error.message);
    alles.push(...(data ?? []));
    if ((data?.length ?? 0) < seite) return alles;
  }
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

  // --- Jahrespaket: zeitliche Abdeckung je Bereich -------------------------
  // Eine Zahl allein sagt wenig. Entscheidend ist, ueber welchen Zeitraum sie
  // sich verteilt - genau daran hing die Anforderung "mindestens ein Jahr".
  console.log("\nZeitliche Abdeckung");
  console.log("-".repeat(64));
  const spannen = [
    ["pflueckaufgaben", "faelligkeit", "Pflueckaufgaben"],
    ["chargen", "ernte_datum", "Chargen"],
    ["arbeitszeiten", "beginn", "Arbeitszeiten"],
    ["lohn_abrechnungen", "periode_start", "Lohnabrechnungen"],
    ["finance_ledger_entries", "buchungsdatum", "Finanzbuchungen"],
    ["wetter_messungen", "gemessen_am", "Wettermessungen"],
    ["lieferungen", "geliefert_am", "Lieferungen"],
    ["touren", "datum", "Touren"],
    ["vorbestellungen", "liefertermin", "Vorbestellungen"],
    ["reklamationen", "gemeldet_am", "Reklamationen"],
    ["schulungsteilnahmen", "abgeschlossen_am", "Schulungsteilnahmen"],
  ];
  for (const [tabelle, spalte, name] of spannen) {
    const { count } = await db.from(tabelle).select("*", { count: "exact", head: true });
    // Zeilen ohne Datum ausschliessen: bei aufsteigender Sortierung stehen sie
    // vorn und wuerden die Spanne als leer ausweisen, obwohl Daten da sind.
    const { data: aeltest } = await db.from(tabelle).select(spalte)
      .not(spalte, "is", null).order(spalte, { ascending: true }).limit(1);
    const { data: neuest } = await db.from(tabelle).select(spalte)
      .not(spalte, "is", null).order(spalte, { ascending: false }).limit(1);
    const von = aeltest?.[0]?.[spalte];
    const bis = neuest?.[0]?.[spalte];
    if (!von || !bis) { console.log(`  ${name.padEnd(22)}${String(count ?? 0).padStart(6)}  -`); continue; }
    const tage = Math.round((new Date(bis) - new Date(von)) / 86400000);
    const monate = (tage / 30.4).toFixed(1);
    console.log(`  ${name.padEnd(22)}${String(count ?? 0).padStart(6)}  ${String(von).slice(0, 10)} bis ${String(bis).slice(0, 10)}  (${monate} Monate)`);
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
// Jahrespaket - zwoelf Monate Betrieb in jedem Bereich
// ===========================================================================
// Deckt den Zeitraum bis kurz vor den Seed-Bestand ab. Der Seed beginnt am
// 20.08.2026 (aelteste Reklamation), deshalb endet dieses Paket am 14.08.2026
// und beginnt ein Jahr davor. Zusammen ergibt das eine lueckenlose Historie
// von rund zwoelf Monaten, ohne eine einzige Seed-Zeile anzufassen.
//
// Die Abgrenzung beim Entfernen laeuft ueber genau dieses Datum: alles vor dem
// Stichtag gehoert zum Jahrespaket, alles danach zum Seed oder zu einem Lauf.
const JAHR_BIS = new Date(2026, 7, 14);   // 14.08.2026
const JAHR_VON = new Date(2025, 6, 15);   // 15.07.2025, dreizehn Monate mit Reserve
const JAHR_STICHTAG = "2026-08-15";

// Die Saison in Almaty, aus den Erntefenstern der vier Sorten in seed.sql:
// Tulameen traegt sommertragend im Juni und Juli, Polka, Polana und Kweli
// remontierend ab August bis zum ersten Frost. Ein gleichmaessig gefuelltes
// Jahr waere fachlich falsch - im Januar wird hier nicht geerntet.
//
// aufgaben: Pflueckaufgaben im Monat. 0 heisst: keine Ernte, aber der Betrieb
// laeuft weiter (Rueckschnitt, Schulung, Pflanzenschutz, Planung).
const SAISON = [
  { monat: 1,  name: "Januar",    aufgaben: 0,  sorten: [],                      schnitt: true  },
  { monat: 2,  name: "Februar",   aufgaben: 0,  sorten: [],                      schnitt: true  },
  { monat: 3,  name: "Maerz",     aufgaben: 0,  sorten: [],                      psm: true      },
  { monat: 4,  name: "April",     aufgaben: 0,  sorten: [],                      psm: true      },
  { monat: 5,  name: "Mai",       aufgaben: 2,  sorten: ["Tulameen"],            psm: true      },
  { monat: 6,  name: "Juni",      aufgaben: 14, sorten: ["Tulameen"]                            },
  { monat: 7,  name: "Juli",      aufgaben: 18, sorten: ["Tulameen"]                            },
  { monat: 8,  name: "August",    aufgaben: 24, sorten: ["Polka", "Polana", "Kweli"]            },
  { monat: 9,  name: "September", aufgaben: 26, sorten: ["Polka", "Polana", "Kweli"]            },
  { monat: 10, name: "Oktober",   aufgaben: 12, sorten: ["Polka", "Polana"]                     },
  { monat: 11, name: "November",  aufgaben: 0,  sorten: [],                      schnitt: true  },
  { monat: 12, name: "Dezember",  aufgaben: 0,  sorten: [],                      schnitt: true  },
];

/** Alle Monatsanfaenge zwischen JAHR_VON und JAHR_BIS, aelteste zuerst. */
function monateImZeitraum() {
  const liste = [];
  const d = new Date(JAHR_VON.getFullYear(), JAHR_VON.getMonth(), 1);
  while (d <= JAHR_BIS) {
    liste.push(new Date(d));
    d.setMonth(d.getMonth() + 1);
  }
  return liste;
}

/** Streut n Termine ueber einen Monat, ohne Zufall: gleiche Eingabe, gleiche
 *  Ausgabe. Ein Seed-Lauf soll zweimal dasselbe Jahr erzeugen. */
function tageImMonat(monatsStart, anzahl) {
  if (anzahl === 0) return [];
  const letzterTag = new Date(monatsStart.getFullYear(), monatsStart.getMonth() + 1, 0).getDate();
  const spanne = Math.min(letzterTag, 28);
  const tage = [];
  for (let i = 0; i < anzahl; i += 1) {
    const tag = 1 + Math.floor((i * spanne) / anzahl);
    const d = new Date(monatsStart.getFullYear(), monatsStart.getMonth(), tag);
    if (d >= JAHR_VON && d <= JAHR_BIS) tage.push(d);
  }
  return tage;
}


/** Deterministische Streuung statt Zufall: derselbe Aufruf ergibt denselben
 *  Wert, damit ein zweiter Lauf dasselbe Jahr erzeugt. */
function streu(i, spanne) {
  return ((i * 2654435761) % 1000) / 1000 * spanne;
}

async function jahrAnlegen() {
  console.log(`\nJahrespaket anlegen: ${url}`);
  console.log(`Zeitraum ${iso(JAHR_VON)} bis ${iso(JAHR_BIS)}, Saison nach Erntefenster\n`);

  // --- Bezugsdaten ---------------------------------------------------------
  const { data: sorten } = await db.from("sorten").select("id, name");
  const { data: bloecke } = await db.from("reihenbloecke").select("id, code, status, sorte_id");
  const { data: brigaden } = await db.from("brigaden").select("id, name");
  const { data: pfluecker } = await db.from("pfluecker").select("id, name, ausweis");
  const { data: kunden } = await db.from("b2b_kunden").select("id, name");
  const { data: parzellen } = await db.from("feldparzellen").select("id, name");
  const { data: nachbarn } = await db.from("nachbarbetriebe").select("id, name");
  if (!sorten?.length || !bloecke?.length || !pfluecker?.length) {
    schlecht("Stammdaten fehlen - laeuft seed.sql auf dieser Instanz?");
    return;
  }
  const sorteVon = (name) => sorten.find((s) => s.name === name);

  // Gesperrte Bloecke scheiden aus: pflueckaufgabe_sperre_pruefen() weist eine
  // Aufgabe darauf ab, und das zu Recht.
  //
  // Die Bloecke der drei Laeufe und des Scannerpakets ebenfalls: sonst haengen
  // an ihnen Chargen aus zwei Paketen, und das Abraeumen des einen scheitert
  // an den Zeilen des anderen. Jedes Paket bleibt bei seinen eigenen Bloecken.
  const belegt = new Set([1, 2, 3, SCANNER].map((n) => KENNUNG.reihenblock(n)));
  const frei = bloecke.filter((b) => b.status !== "wartezeitgesperrt" && !belegt.has(b.id));
  const bloeckeFuer = (sortenName) => {
    const s = sorteVon(sortenName);
    const passend = frei.filter((b) => b.sorte_id === s?.id);
    return passend.length > 0 ? passend : frei;
  };

  // --- 1. Wetter -----------------------------------------------------------
  // Taeglich ueber das ganze Jahr, je Feldparzelle. Die Temperaturkurve folgt
  // dem Jahresverlauf in Almaty: kalte Winter, heisse Sommer. Ohne sie zeigt
  // Feld > Wetter eine Gerade.
  // Je Parzelle und Tag pruefen statt pauschal: der Bestand deckt oft nur
  // einen Teil des Jahres ab, und eine Luecke faellt in Feld > Wetter auf.
  const wetterDa = await alleZeilen(() => db
    .from("wetter_messungen").select("feldparzelle_id, gemessen_am")
    .gte("gemessen_am", iso(JAHR_VON)).lte("gemessen_am", iso(JAHR_BIS))
    .order("gemessen_am"));
  const wetterHat = new Set(wetterDa.map((w) => `${w.feldparzelle_id}|${w.gemessen_am}`));
  const erwartet = (parzellen?.length ?? 0) * Math.round((JAHR_BIS - JAHR_VON) / 86400000);
  if (wetterHat.size >= erwartet) {
    unveraendert(`Wetter im Zeitraum (${wetterHat.size} Messungen)`);
  } else {
    const messungen = [];
    for (const parz of parzellen ?? []) {
      const tag = new Date(JAHR_VON);
      let i = 0;
      while (tag <= JAHR_BIS) {
        // Jahresgang: Tiefpunkt Mitte Januar, Hochpunkt Mitte Juli.
        const tagImJahr = Math.floor((tag - new Date(tag.getFullYear(), 0, 0)) / 86400000);
        const kurve = Math.sin(((tagImJahr - 105) / 365) * 2 * Math.PI);
        const mittel = 10 + kurve * 15;
        if (wetterHat.has(`${parz.id}|${iso(tag)}`)) { tag.setDate(tag.getDate() + 1); i += 1; continue; }
        messungen.push({
          feldparzelle_id: parz.id,
          gemessen_am: iso(tag),
          temp_min_c: Math.round((mittel - 6 + streu(i, 3)) * 10) / 10,
          temp_max_c: Math.round((mittel + 7 + streu(i + 7, 4)) * 10) / 10,
          niederschlag_mm: i % 9 === 0 ? Math.round(streu(i, 12) * 10) / 10 : 0,
        });
        tag.setDate(tag.getDate() + 1);
        i += 1;
      }
    }
    for (let i = 0; i < messungen.length; i += 500) {
      pruefe(await db.from("wetter_messungen").insert(messungen.slice(i, i + 500)), "Wetter anlegen");
    }
    ok(`${messungen.length} Wettermessungen ueber ${parzellen.length} Parzellen`);
  }

  // --- 2. Ernte je Monat ---------------------------------------------------
  const { count: aufgabenDa } = await db
    .from("pflueckaufgaben").select("*", { count: "exact", head: true }).lt("faelligkeit", JAHR_STICHTAG);
  if ((aufgabenDa ?? 0) > 0) {
    // Nicht abbrechen: die uebrigen Schritte pruefen selbst, ob sie noch etwas
    // zu tun haben. So laesst sich ein halb angelegtes Paket vervollstaendigen.
    unveraendert(`${aufgabenDa} Pflueckaufgaben im Zeitraum`);
    const bestand = await alleZeilen(() => db
      .from("pflueckaufgaben").select("id, code, faelligkeit, ist_menge_kg, ausschuss_kg")
      .lt("faelligkeit", JAHR_STICHTAG).order("faelligkeit"));
    const chargenDa = await alleZeilen(() => db
      .from("chargen").select("id, code, pflueckaufgabe_id, ernte_datum")
      .lt("ernte_datum", JAHR_STICHTAG).order("ernte_datum"));
    await jahrMarkt(chargenDa, kunden, sorten, nachbarn);
    await jahrBuero(bestand, pfluecker);
    await jahrUebrige(pfluecker, kunden, chargenDa);
    console.log("");
    return;
  }

  const alleAufgaben = [];
  let lfd = 0;
  for (const monatsStart of monateImZeitraum()) {
    const saison = SAISON[monatsStart.getMonth()];
    if (saison.aufgaben === 0) continue;
    // Die Bloecke des Monats: nur so viele, dass jeder im Rhythmus von zwei bis
    // drei Tagen drankommt. Rundlaufend ueber ALLE Bloecke zu verteilen ergibt
    // Abstaende von Wochen je Block - und genau das misst die Kennzahl
    // pflueckintervall ("Anteil der Erntefolgen im Abstand von hoechstens drei
    // Tagen"). Der Rotationsplan des Produkts verspricht zwei bis drei Tage.
    const bloeckeDesMonats = [...new Set(saison.sorten.flatMap(bloeckeFuer))];
    const proBlock = Math.max(1, Math.floor(saison.aufgaben / Math.max(1, bloeckeDesMonats.length)));
    let blockZaehler = 0;

    for (const tag of tageImMonat(monatsStart, saison.aufgaben)) {
      // Jeder Block bekommt seine Durchgaenge am Stueck, bevor der naechste
      // drankommt - so liegen sie im Abstand weniger Tage.
      const blockIndex = Math.min(
        bloeckeDesMonats.length - 1,
        Math.floor(blockZaehler / proBlock),
      );
      const block = bloeckeDesMonats[blockIndex];
      blockZaehler += 1;
      const sortenName = saison.sorten.find((n) =>
        bloeckeFuer(n).some((b) => b.id === block.id)) ?? saison.sorten[0];
      const brigade = brigaden[lfd % brigaden.length];
      const ziel = 60 + Math.round(streu(lfd, 60));
      const ist = Math.round((ziel * (0.88 + streu(lfd + 3, 0.2))) * 10) / 10;
      const ausschuss = Math.round(ist * (0.03 + streu(lfd + 5, 0.05)) * 10) / 10;
      const beginn = new Date(tag); beginn.setHours(6, 0, 0, 0);
      alleAufgaben.push({
        code: `PA-J-${iso(tag).replaceAll("-", "").slice(2)}-${String(lfd % 100).padStart(2, "0")}`,
        reihenblock_id: block.id, brigade_id: brigade.id, sorte_id: sorteVon(sortenName).id,
        status: "abgeschlossen", zielmenge_kg: ziel, ist_menge_kg: ist, ausschuss_kg: ausschuss,
        qualitaetsfaktor: Math.round((0.94 + streu(lfd + 11, 0.16)) * 100) / 100,
        faelligkeit: beginn.toISOString(),
        pfluecker_anzahl: 2 + (lfd % 3),
      });
      lfd += 1;
    }
  }

  const angelegt = [];
  for (let i = 0; i < alleAufgaben.length; i += 100) {
    const teil = alleAufgaben.slice(i, i + 100);
    const { data, error } = await db.from("pflueckaufgaben").insert(teil).select("id, code, faelligkeit, ist_menge_kg, ausschuss_kg");
    if (error) { schlecht(`Pflueckaufgaben: ${error.message}`); return; }
    angelegt.push(...(data ?? []));
  }
  ok(`${angelegt.length} Pflueckaufgaben ueber die Saison`);

  const chargen = await jahrNachweis(angelegt, pfluecker);
  await jahrMarkt(chargen, kunden, sorten, nachbarn);
  await jahrBuero(angelegt, pfluecker);
  await jahrUebrige(pfluecker, kunden, chargen);
  console.log("");
}


/** Steigen, Arbeitszeiten und Kuehlmessungen zu den Aufgaben des Jahres.
 *
 *  Ohne geraet_zeitpunkt: geraet_zeitpunkt_pruefen() weist einen Wert ab, der
 *  mehr als 24 Stunden vor dem Servereingang liegt - eine Regel gegen falsch
 *  gestellte Geraeteuhren. Fuer eine nachtraeglich erzeugte Historie waere das
 *  Feld ohnehin gelogen: diese Zeilen sind nie ueber ein Geraet erfasst worden.
 */
async function jahrNachweis(angelegt, pfluecker) {
  // Die Chargen entstehen per Trigger an der Aufgabe, tragen aber noch keine
  // Menge: aufgabe_fortschreiben() laeuft erst bei einem UPDATE. Fuer eine
  // glaubwuerdige Historie werden sie deshalb nachgezogen.
  const chargen = await alleZeilen(() => db
    .from("chargen").select("id, code, pflueckaufgabe_id, ernte_datum")
    .in("pflueckaufgabe_id", angelegt.map((a) => a.id)).order("ernte_datum"));
  const chargeZu = new Map(chargen.map((c) => [c.pflueckaufgabe_id, c]));

  const nachzug = [];
  const steigen = [];
  const zeiten = [];
  const messungen = [];
  let i = 0;

  for (const aufgabe of angelegt) {
    const charge = chargeZu.get(aufgabe.id);
    if (!charge) continue;
    const start = new Date(aufgabe.faelligkeit);
    const gepflueckt = new Date(start); gepflueckt.setHours(start.getHours() + 2);
    // Vorkuehlung meist innerhalb der 60-Minuten-Regel, gelegentlich darueber:
    // eine Historie ohne einen einzigen Verstoss ist unglaubwuerdig und macht
    // die Kennzahl "Kuehlkette eingehalten" bedeutungslos.
    const verzug = i % 17 === 0 ? 70 + Math.round(streu(i, 20)) : 25 + Math.round(streu(i, 25));
    const vorgekuehlt = new Date(gepflueckt); vorgekuehlt.setMinutes(vorgekuehlt.getMinutes() + verzug);

    // code und ernte_datum muessen mit: ein upsert schreibt die ganze Zeile,
    // und beide sind not null ohne brauchbaren Default fuer eine Bestandszeile.
    nachzug.push({
      id: charge.id, code: charge.code, ernte_datum: charge.ernte_datum,
      menge_kg: aufgabe.ist_menge_kg, ausschuss_kg: aufgabe.ausschuss_kg,
      pflueck_zeitpunkt: gepflueckt.toISOString(), vorkuehlung_zeitpunkt: vorgekuehlt.toISOString(),
      status: "ausgeliefert",
    });
    messungen.push({
      charge_id: charge.id, gemessen_am: vorgekuehlt.toISOString(),
      temperatur_c: Math.round((2.4 + streu(i + 2, 2.2)) * 10) / 10,
    });

    // Die Mannschaft dieser Aufgabe. Steigen UND Arbeitszeiten gehen an genau
    // diese Personen: kpi_aktuell() rechnet die Pflueckleistung je Person aus
    // beidem und verlangt fuer dieselbe Aufgabe beides. Wer Steigen traegt,
    // aber keine Arbeitszeit hat, faellt aus der Kennzahl - und der Wert
    // stimmt dann nicht mehr mit der Wirklichkeit ueberein.
    const anzahlLeute = 2 + (i % 3);
    const mannschaft = Array.from({ length: anzahlLeute },
      (_, n) => pfluecker[(i + n) % pfluecker.length]);

    // Steigen: so viele, dass ihre Summe ungefaehr die Istmenge trifft.
    const anzahl = Math.max(anzahlLeute, Math.round(aufgabe.ist_menge_kg / 4.2));
    const je = Math.round((aufgabe.ist_menge_kg / anzahl) * 100) / 100;
    for (let n = 0; n < anzahl; n += 1) {
      steigen.push({
        code: "", charge_id: charge.id, pflueckaufgabe_id: aufgabe.id, gewicht_kg: je,
        pfluecker_id: mannschaft[n % mannschaft.length].id,
      });
    }

    // Arbeitszeiten aus der Erntemenge ableiten, nicht frei waehlen: die
    // Kennzahl "Pflueckleistung" rechnet kg je Stunde ueber genau diese beiden
    // Groessen. Entkoppelt ergaeben sich Werte, die kein Betrieb kennt - der
    // Integrationstest prueft auf mehr als 3 kg/h, die Baseline liegt bei 6,1.
    const leistung = 5.6 + streu(i + 13, 1.4);
    const gesamtMinuten = Math.round((aufgabe.ist_menge_kg / leistung) * 60);
    const jeMinuten = Math.max(60, Math.round(gesamtMinuten / mannschaft.length));
    for (const [n, person] of mannschaft.entries()) {
      const beginn = new Date(start); beginn.setHours(6, 0, 0, 0);
      beginn.setMinutes(beginn.getMinutes() + n * 15);
      const ende = new Date(beginn); ende.setMinutes(ende.getMinutes() + jeMinuten);
      zeiten.push({
        pfluecker_id: person.id, pflueckaufgabe_id: aufgabe.id,
        beginn: beginn.toISOString(), ende: ende.toISOString(),
      });
    }
    i += 1;
  }

  // chargen: upsert statt einzelner Updates - ein Aufruf je 200 Zeilen.
  for (let n = 0; n < nachzug.length; n += 200) {
    pruefe(await db.from("chargen").upsert(nachzug.slice(n, n + 200)), "Chargen nachziehen");
  }
  ok(`${nachzug.length} Chargen mit Menge, Pflueck- und Vorkuehlzeitpunkt`);

  for (let n = 0; n < steigen.length; n += 500) {
    pruefe(await db.from("steigen").insert(steigen.slice(n, n + 500)), "Steigen anlegen");
  }
  ok(`${steigen.length} Steigen`);

  for (let n = 0; n < zeiten.length; n += 500) {
    pruefe(await db.from("arbeitszeiten").insert(zeiten.slice(n, n + 500)), "Arbeitszeiten anlegen");
  }
  ok(`${zeiten.length} Arbeitszeiten`);

  for (let n = 0; n < messungen.length; n += 500) {
    pruefe(await db.from("kuehlketten_messungen").insert(messungen.slice(n, n + 500)), "Kuehlmessungen anlegen");
  }
  const verstoesse = messungen.filter((_, n) => n % 17 === 0).length;
  ok(`${messungen.length} Kuehlmessungen, davon ${verstoesse} ueber der 60-Minuten-Regel`);

  return chargen;
}


/** Markt: Lieferungen mit Touren, Vorbestellungen, Reklamationen, Zukauf. */
async function jahrMarkt(chargen, kunden, sorten, nachbarn) {
  if (chargen.length === 0 || !kunden?.length) return;

  const { count: tourenDa } = await db
    .from("touren").select("*", { count: "exact", head: true }).lt("datum", JAHR_STICHTAG);
  if ((tourenDa ?? 0) > 0) {
    unveraendert(`${tourenDa} Touren mit Lieferungen im Zeitraum`);
    return;
  }

  // --- Touren und Lieferungen ---------------------------------------------
  // Etwa jede dritte Charge geht in den Handel. Mehrere Lieferungen eines
  // Tages fahren auf einer Tour - so sieht Hof > Logistik echte Buendel.
  // Jede dritte Charge, aber die erste und die letzte immer: sonst endet die
  // Lieferhistorie Wochen vor dem Zeitraum und deckt keine zwoelf Monate ab.
  const versand = chargen.filter((_, i) => i % 3 === 0 || i === 0 || i === chargen.length - 1);
  const nachTag = new Map();
  for (const ch of versand) {
    const tag = ch.ernte_datum;
    if (!nachTag.has(tag)) nachTag.set(tag, []);
    nachTag.get(tag).push(ch);
  }

  const touren = [];
  const tage = [...nachTag.keys()].sort();
  for (const [i, tag] of tage.entries()) {
    const d = new Date(tag); d.setDate(d.getDate() + 1);
    touren.push({
      datum: iso(d), status: "abgeschlossen",
      distanz_km: Math.round(40 + streu(i, 90)),
      dauer_minuten: Math.round(90 + streu(i + 4, 150)),
    });
  }
  const angelegteTouren = [];
  for (let i = 0; i < touren.length; i += 200) {
    const { data, error } = await db.from("touren").insert(touren.slice(i, i + 200)).select("id, datum");
    if (error) { schlecht(`Touren: ${error.message}`); break; }
    angelegteTouren.push(...(data ?? []));
  }
  ok(`${angelegteTouren.length} Touren`);

  // --- Vorbestellungen, dann die Lieferungen dazu --------------------------
  // Die Reihenfolge ist keine Kosmetik: liefertreue misst geliefert_am gegen
  // vorbestellungen.liefertermin und braucht deshalb die Verknuepfung. Ohne
  // sie hat die Kennzahl null Datensaetze und der Bereich Markt bleibt leer.
  // lieferung_vorbestellung_zugehoerigkeit_pruefen() verlangt zudem, dass
  // Vorbestellung und Lieferung denselben Kunden tragen.
  const tourNach = new Map(angelegteTouren.map((t) => [t.datum, t.id]));
  const entwuerfe = [];
  let i = 0;
  for (const [tag, liste] of nachTag) {
    const d = new Date(tag); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0);
    const tourId = tourNach.get(iso(d)) ?? null;
    for (const [reihenfolge, ch] of liste.entries()) {
      const kunde = kunden[i % kunden.length];
      // Der zugesagte Termin: meist der Liefertag, jede zwoelfte Lieferung
      // kommt einen Tag zu spaet. Eine Liefertreue von glatten 100 Prozent
      // waere als Kennzahl wertlos.
      const zugesagt = new Date(d);
      if (i % 12 === 0) zugesagt.setDate(zugesagt.getDate() - 1);
      entwuerfe.push({
        kunde, charge: ch, tourId, reihenfolge: reihenfolge + 1,
        geliefertAm: d.toISOString(), zugesagt: iso(zugesagt),
        menge: 40 + Math.round(streu(i, 60)),
        nr: i,
      });
      i += 1;
    }
  }

  // Zwei Drittel der Lieferungen gehen auf eine Vorbestellung zurueck, der
  // Rest ist Tagesgeschaeft - so ist es im Betrieb auch.
  const mitVorbestellung = entwuerfe.filter((e) => e.nr % 3 !== 2);
  const vorbestellungenVorab = mitVorbestellung.map((e) => ({
    b2b_kunde_id: e.kunde.id,
    sorte_id: sorten[e.nr % sorten.length].id,
    menge_kg: e.menge,
    liefertermin: e.zugesagt,
    status: "geliefert",
  }));
  const angelegteVorbestellungen = [];
  for (let n = 0; n < vorbestellungenVorab.length; n += 200) {
    const { data, error } = await db.from("vorbestellungen")
      .insert(vorbestellungenVorab.slice(n, n + 200)).select("id");
    if (error) { schlecht(`Vorbestellungen: ${error.message}`); break; }
    angelegteVorbestellungen.push(...(data ?? []));
  }
  ok(`${angelegteVorbestellungen.length} Vorbestellungen mit zugesagtem Termin`);

  const vorbestellungZu = new Map();
  mitVorbestellung.forEach((e, n) => {
    if (angelegteVorbestellungen[n]) vorbestellungZu.set(e.nr, angelegteVorbestellungen[n].id);
  });

  const lieferungen = entwuerfe.map((e) => ({
    b2b_kunde_id: e.kunde.id, charge_id: e.charge.id,
    vorbestellung_id: vorbestellungZu.get(e.nr) ?? null,
    tour_id: e.tourId, tour_reihenfolge: e.reihenfolge,
    geliefert_am: e.geliefertAm, menge_kg: e.menge,
    status: "zugestellt", empfaenger_name: `Warenannahme ${e.kunde.name}`,
  }));
  const angelegteLieferungen = [];
  for (let n = 0; n < lieferungen.length; n += 300) {
    const { data, error } = await db.from("lieferungen").insert(lieferungen.slice(n, n + 300)).select("id, geliefert_am");
    if (error) { schlecht(`Lieferungen: ${error.message}`); break; }
    angelegteLieferungen.push(...(data ?? []));
  }
  ok(`${angelegteLieferungen.length} Lieferungen, zugestellt und quittiert`);

  // --- Transporttemperaturen ----------------------------------------------
  // Vier Messpunkte je Fahrt. Die Kuehlkette im Transport ist eine eigene
  // Kennzahl, ohne Messpunkte bleibt sie leer.
  const transport = [];
  for (const [n, lf] of angelegteLieferungen.entries()) {
    const start = new Date(lf.geliefert_am);
    for (let m = 0; m < 4; m += 1) {
      const zeit = new Date(start); zeit.setMinutes(zeit.getMinutes() - 90 + m * 30);
      transport.push({
        lieferung_id: lf.id, gemessen_am: zeit.toISOString(),
        temperatur_c: Math.round((2.0 + streu(n + m, 2.6)) * 10) / 10,
      });
    }
  }
  for (let n = 0; n < transport.length; n += 500) {
    pruefe(await db.from("transport_temperatur_messungen").insert(transport.slice(n, n + 500)), "Transportmessungen");
  }
  ok(`${transport.length} Transportmessungen`);


  // --- Zukauf --------------------------------------------------------------
  // Der Aggregator kauft in der Hauptsaison bei den Nachbarn zu.
  if (nachbarn?.length) {
    const zukauf = [];
    for (const [n, tag] of tage.entries()) {
      if (n % 4 !== 0) continue;
      zukauf.push({
        nachbarbetrieb_id: nachbarn[n % nachbarn.length].id,
        sorte_id: sorten[n % sorten.length].id,
        menge_kg: 60 + Math.round(streu(n + 6, 90)),
        preis_tenge_kg: 1500 + Math.round(streu(n, 400)),
        rechnungsdatum: tag,
      });
    }
    for (let n = 0; n < zukauf.length; n += 300) {
      pruefe(await db.from("zukauf_positionen").insert(zukauf.slice(n, n + 300)), "Zukauf");
    }
    ok(`${zukauf.length} Zukaufpositionen`);
  }
  return angelegteLieferungen;
}


/** Buero: Lohnabrechnungen je Monat und Pfluecker, Kostentraeger, Buchungen. */
async function jahrBuero(angelegt, pfluecker) {
  const { count: lohnDa } = await db
    .from("lohn_abrechnungen").select("*", { count: "exact", head: true }).lt("periode_ende", JAHR_STICHTAG);
  if ((lohnDa ?? 0) > 0) {
    unveraendert(`${lohnDa} Lohnabrechnungen im Zeitraum`);
  } else {
  // --- Lohn ----------------------------------------------------------------
  // Eine Abrechnung je Pfluecker und Saisonmonat. lohn_abrechnungen traegt ein
  // unique (pfluecker_id, periode_start, periode_ende), deshalb saubere
  // Monatsgrenzen statt ueberlappender Zeitraeume.
  const abrechnungen = [];
  let i = 0;
  for (const monatsStart of monateImZeitraum()) {
    const saison = SAISON[monatsStart.getMonth()];
    if (saison.aufgaben === 0) continue;
    const ende = new Date(monatsStart.getFullYear(), monatsStart.getMonth() + 1, 0);
    if (ende > JAHR_BIS) continue;
    for (const p of pfluecker) {
      const stunden = 120 + Math.round(streu(i, 60));
      const menge = Math.round((stunden * (5.4 + streu(i + 2, 1.6))) * 10) / 10;
      const quote = Math.round((3.5 + streu(i + 5, 4)) * 100) / 100;
      // Der Faktor folgt der Ausschussquote: unter dem Ziel von 5 Prozent
      // steigt er, darueber faellt er - im Korridor 0,90 bis 1,10.
      const faktor = Math.max(0.9, Math.min(1.1, Math.round((1 + (5 - quote) * 0.02) * 100) / 100));
      const grund = stunden * 850;
      const mengenteil = Math.round(menge * 800 * faktor);
      abrechnungen.push({
        pfluecker_id: p.id, periode_start: iso(monatsStart), periode_ende: iso(ende),
        stunden, menge_kg: menge, ausschussquote: quote, qualitaetsfaktor: faktor,
        grundlohn_tenge: grund, mengen_komponente_tenge: mengenteil,
        gesamt_tenge: grund + mengenteil, status: "ausgezahlt",
      });
      i += 1;
    }
  }
  for (let n = 0; n < abrechnungen.length; n += 200) {
    pruefe(await db.from("lohn_abrechnungen").insert(abrechnungen.slice(n, n + 200)), "Lohnabrechnungen");
  }
    ok(`${abrechnungen.length} Lohnabrechnungen, ausgezahlt`);
  }

  // --- Finanzen ------------------------------------------------------------
  // Je Erntetag ein Kostentraeger (unique auf Block, Sorte und Erntetag) mit
  // einem Erloes und zwei Kostenzeilen. Erst damit hat der Deckungsbeitrag
  // ueber das Jahr eine Grundlage.
  const { data: aufgabenMitBlock } = await db
    .from("pflueckaufgaben").select("id, reihenblock_id, sorte_id, faelligkeit, ist_menge_kg")
    .in("id", angelegt.map((a) => a.id));
  const traeger = [];
  const gesehen = new Set();
  for (const a of aufgabenMitBlock ?? []) {
    const tag = iso(new Date(a.faelligkeit));
    const schluessel = `${a.reihenblock_id}|${a.sorte_id}|${tag}`;
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    traeger.push({
      reihenblock_id: a.reihenblock_id, sorte_id: a.sorte_id, erntetag: tag,
      bezeichnung: `Ernte ${tag}`,
    });
  }
  // kostentraeger traegt ein unique (reihenblock_id, sorte_id, erntetag).
  // Bestehende Zeilen deshalb erst einsammeln und nur die Luecken anlegen -
  // sonst scheitert ein zweiter Lauf an der ersten Dublette.
  const vorhandeneTraeger = await alleZeilen(() => db
    .from("kostentraeger").select("id, reihenblock_id, sorte_id, erntetag")
    .lt("erntetag", JAHR_STICHTAG).order("erntetag"));
  const schonDa = new Set(vorhandeneTraeger.map((t) => `${t.reihenblock_id}|${t.sorte_id}|${t.erntetag}`));
  const fehlende = traeger.filter((t) => !schonDa.has(`${t.reihenblock_id}|${t.sorte_id}|${t.erntetag}`));

  const angelegteTraeger = [...vorhandeneTraeger];
  for (let n = 0; n < fehlende.length; n += 200) {
    const { data, error } = await db.from("kostentraeger").insert(fehlende.slice(n, n + 200))
      .select("id, reihenblock_id, sorte_id, erntetag");
    if (error) { schlecht(`Kostentraeger: ${error.message}`); break; }
    angelegteTraeger.push(...(data ?? []));
  }
  ok(`${angelegteTraeger.length} Kostentraeger, davon ${fehlende.length} neu`);

  // Bewusst ohne charge_id: finance_ledger_entries.charge_id steht auf
  // "on delete set null", und dieses SET NULL ist ein UPDATE auf eine
  // append-only-Tabelle. Eine Buchung mit Chargenbezug macht ihre Charge damit
  // dauerhaft unloeschbar - das Jahrespaket waere nicht mehr abraeumbar.
  // Der Deckungsbeitrag je Kostentraeger traegt trotzdem, er haengt am
  // Kostentraeger (Reihenblock, Sorte, Erntetag), nicht an der Charge. Nur
  // die Sicht deckungsbeitrag_je_charge bleibt fuer das Jahr leer; fuer sie
  // gibt es das Beispiel aus 20260923010000 im Seed.
  const traegerZu = new Map(angelegteTraeger.map((t) => [`${t.reihenblock_id}|${t.sorte_id}|${t.erntetag}`, t.id]));
  const buchungen = [];
  let n = 0;
  for (const a of aufgabenMitBlock ?? []) {
    const tag = iso(new Date(a.faelligkeit));
    const tid = traegerZu.get(`${a.reihenblock_id}|${a.sorte_id}|${tag}`);
    if (!tid) continue;
    const menge = Number(a.ist_menge_kg ?? 0);
    buchungen.push(
      { kostentraeger_id: tid, typ: "erloes", kategorie: "Verkauf",
        betrag_tenge: Math.round(menge * (1900 + streu(n, 300))), buchungsdatum: tag,
        beschreibung: "Verkauf Handel" },
      { kostentraeger_id: tid, typ: "kosten", kategorie: "Lohn",
        betrag_tenge: Math.round(menge * 800), buchungsdatum: tag,
        beschreibung: "Pflueckloehne" },
      { kostentraeger_id: tid, typ: "kosten", kategorie: "Material",
        betrag_tenge: Math.round(menge * (120 + streu(n + 3, 80))), buchungsdatum: tag,
        beschreibung: "Schalen und Steigen" },
    );
    n += 1;
  }
  // finance_ledger_entries ueberlebt jedes --entfernen: append-only, ohne
  // Ausnahme fuer service_role. Ohne diese Pruefung legt jeder Lauf denselben
  // Satz noch einmal an und der Bestand waechst bei jedem Zyklus.
  const { count: schonGebucht } = await db
    .from("finance_ledger_entries").select("*", { count: "exact", head: true })
    .lt("buchungsdatum", JAHR_STICHTAG);
  if ((schonGebucht ?? 0) >= buchungen.length) {
    unveraendert(`${schonGebucht} Finanzbuchungen im Zeitraum (append-only, bleiben bestehen)`);
  } else {
    for (let m = 0; m < buchungen.length; m += 500) {
      pruefe(await db.from("finance_ledger_entries").insert(buchungen.slice(m, m + 500)), "Buchungen");
    }
    ok(`${buchungen.length} Finanzbuchungen, Erloes und Kosten je Erntetag`);
  }
}

/** Winter und Fruehjahr: Schulungen, Einarbeitung, Reklamationen. */
async function jahrUebrige(pfluecker, kunden, chargen) {
  // --- Schulungsteilnahmen -------------------------------------------------
  // Der Winter ist die Zeit der Unterweisungen. Ohne Teilnahmen steht die
  // Pflichtschulungs-Sicht fuer jeden auf offen.
  const { count: schulDa } = await db
    .from("schulungsteilnahmen").select("*", { count: "exact", head: true });
  const { data: videos } = schulDa ? { data: null } : await db.from("schulungsvideos").select("id").limit(5);
  if (schulDa) unveraendert(`${schulDa} Schulungsteilnahmen`);
  const { data: profile } = await db.from("profiles").select("id").limit(10);
  if (videos?.length && profile?.length) {
    // Ueber das Jahr verteilt, nicht in einem Block: Unterweisungen finden im
    // Winter statt (Januar, Februar) und noch einmal vor dem Saisonstart im
    // Mai. Ein einziger Monat waere keine Jahresabdeckung.
    // Ueber den ganzen Zeitraum gespannt, nicht nur ueber den Winter: die
    // Abdeckung soll in jedem Bereich zwoelf Monate betragen.
    const termine = [
      new Date(2025, 6, 18), new Date(2025, 8, 3), new Date(2025, 10, 18),
      new Date(2026, 0, 14), new Date(2026, 1, 11), new Date(2026, 3, 9),
      new Date(2026, 4, 20), new Date(2026, 6, 8), new Date(2026, 7, 11),
    ];
    const teilnahmen = [];
    let i = 0;
    for (const [nr, v] of videos.entries()) {
      for (const p of profile) {
        const basis = termine[(nr + i) % termine.length];
        const d = new Date(basis); d.setDate(d.getDate() + (i % 6));
        teilnahmen.push({ schulungsvideo_id: v.id, profil_id: p.id, abgeschlossen_am: d.toISOString() });
        i += 1;
      }
    }
    const { error } = await db.from("schulungsteilnahmen").insert(teilnahmen);
    if (error) schlecht(`Schulungsteilnahmen: ${error.message.slice(0, 70)}`);
    else ok(`${teilnahmen.length} Schulungsteilnahmen, ueber das Jahr verteilt`);
  }

  // --- Einarbeitung --------------------------------------------------------
  const { count: fortDa } = await db
    .from("einarbeitung_fortschritt").select("*", { count: "exact", head: true });
  const { data: schritte } = fortDa ? { data: null } : await db.from("einarbeitung_schritte").select("id").order("reihenfolge");
  if (fortDa) unveraendert(`${fortDa} Einarbeitungsschritte`);
  if (schritte?.length && pfluecker.length) {
    const fortschritt = [];
    for (const [i, p] of pfluecker.entries()) {
      // Ein Pfluecker bleibt bewusst unvollstaendig: MAL-0417 haengt am Konto
      // der Rolle picker, und TF-P4 braucht einen offenen Punkt zum Abhaken.
      const bis = p.ausweis === AUSWEIS ? Math.max(1, schritte.length - 2) : schritte.length;
      for (const s of schritte.slice(0, bis)) {
        fortschritt.push({ pfluecker_id: p.id, schritt_id: s.id });
      }
      void i;
    }
    const { error } = await db.from("einarbeitung_fortschritt").insert(fortschritt);
    if (error) schlecht(`Einarbeitung: ${error.message.slice(0, 70)}`);
    else ok(`${fortschritt.length} Einarbeitungsschritte abgehakt`);
  }

  // --- Reklamationen -------------------------------------------------------
  if (kunden?.length && chargen.length > 0) {
    // gemeldet_von verweist auf ein Profil. Der Kunde meldet selbst, deshalb
    // sein Konto - so sieht es auch die Rueckverfolgung in Markt > Reklamationen.
    const { count: reklDa } = await db
      .from("reklamationen").select("*", { count: "exact", head: true }).lt("gemeldet_am", JAHR_STICHTAG);
    if ((reklDa ?? 0) > 0) { unveraendert(`${reklDa} Reklamationen im Zeitraum`); return; }
    const melderId = await idVon("profiles", "email", "kunde@damicon.demo");
    const gruende = ["temperatur", "menge", "verpackung"];
    const rekl = [];
    for (let i = 0; i < 9; i += 1) {
      const ch = chargen[(i * 13) % chargen.length];
      const d = new Date(ch.ernte_datum);
      d.setDate(d.getDate() + 2);
      if (d > JAHR_BIS) continue;
      rekl.push({
        code: `RK-J-${iso(d).replaceAll("-", "").slice(2)}-${i}`,
        charge_id: ch.id, b2b_kunde_id: kunden[i % kunden.length].id,
        grund: gruende[i % gruende.length],
        betreff: `Beanstandung Lieferung ${iso(d)}`,
        beschreibung: "Im Wareneingang beanstandet, Ruecksprache mit dem Buero erfolgt.",
        // Vier bis zwoelf Kilo je Fall. Bei rund 2800 gelieferten Kilo ergibt
        // das eine Reklamationsquote knapp ueber dem Ziel von 2 Prozent -
        // ein Wert, den ein Betrieb kennt. Mit acht bis achtundzwanzig Kilo
        // kam die Kennzahl auf 6,8 Prozent, und das waere ein Alarmzustand.
        betroffene_menge_kg: 4 + Math.round(streu(i, 8)),
        status: i % 3 === 0 ? "abgelehnt" : "erledigt",
        gemeldet_am: d.toISOString(), gemeldet_von: melderId,
        erledigt_am: new Date(d.getTime() + 3 * 86400000).toISOString(),
        loesung: i % 3 === 0 ? "Keine Abweichung feststellbar." : "Gutschrift erteilt.",
      });
    }
    const { error } = await db.from("reklamationen").insert(rekl);
    if (error) schlecht(`Reklamationen: ${error.message.slice(0, 80)}`);
    else ok(`${rekl.length} Reklamationen ueber das Jahr`);
  }
}


/** Raeumt das Jahrespaket ab: alles vor dem Stichtag, nichts danach.
 *
 *  Die Abgrenzung ueber das Datum statt ueber Kennungen ist hier der
 *  verlaesslichere Weg: es entstehen mehrere tausend Zeilen, und jede einzeln
 *  mit einer festen UUID zu versehen waere aufwendiger, ohne mehr zu sichern.
 *  Der Seed beginnt am 20.08.2026, der Stichtag liegt davor.
 *
 *  Die Sperrtrigger auf Steigen, Kuehl- und Transportmessungen lassen den
 *  service_role-Weg durch (auth.uid() is null). finance_ledger_entries nicht -
 *  die Buchungen bleiben stehen und werden am Ende benannt.
 */
async function jahrEntfernen() {
  console.log(`\nJahrespaket entfernen: ${url}`);
  console.log(`Alles vor dem ${JAHR_STICHTAG}\n`);

  async function wegVor(tabelle, spalte, was) {
    const { error, count } = await db
      .from(tabelle).delete({ count: "exact" }).lt(spalte, JAHR_STICHTAG);
    if (error) schlecht(`${was}: ${error.message.slice(0, 80)}`);
    else if ((count ?? 0) > 0) ok(`${count} ${was}`);
  }

  // Erst die Aufgaben des Zeitraums einsammeln - an ihnen haengt der Rest.
  const { data: aufgaben } = await db
    .from("pflueckaufgaben").select("id").lt("faelligkeit", JAHR_STICHTAG);
  const aufgabenIds = (aufgaben ?? []).map((a) => a.id);
  const { data: chargen } = aufgabenIds.length
    ? await db.from("chargen").select("id").in("pflueckaufgabe_id", aufgabenIds)
    : { data: [] };
  const chargenIds = (chargen ?? []).map((c) => c.id);

  async function wegIn(tabelle, spalte, werte, was) {
    for (let i = 0; i < werte.length; i += 200) {
      const { error, count } = await db
        .from(tabelle).delete({ count: "exact" }).in(spalte, werte.slice(i, i + 200));
      if (error) { schlecht(`${was}: ${error.message.slice(0, 80)}`); return; }
      if ((count ?? 0) > 0) gezaehlt[was] = (gezaehlt[was] ?? 0) + count;
    }
    if (gezaehlt[was]) ok(`${gezaehlt[was]} ${was}`);
  }
  const gezaehlt = {};

  // Reihenfolge nach den Fremdschluesseln: chargen und pflueckaufgaben haengen
  // mit RESTRICT am Reihenblock, Messungen mit CASCADE an Charge und Lieferung.
  await wegVor("transport_temperatur_messungen", "gemessen_am", "Transportmessungen");
  await wegVor("lieferungen", "geliefert_am", "Lieferungen");
  await wegVor("touren", "datum", "Touren");
  if (chargenIds.length) await wegIn("kuehlketten_messungen", "charge_id", chargenIds, "Kuehlmessungen");
  if (aufgabenIds.length) await wegIn("steigen", "pflueckaufgabe_id", aufgabenIds, "Steigen");
  if (aufgabenIds.length) await wegIn("arbeitszeiten", "pflueckaufgabe_id", aufgabenIds, "Arbeitszeiten");
  await wegVor("lohn_abrechnungen", "periode_ende", "Lohnabrechnungen");
  await wegVor("reklamationen", "gemeldet_am", "Reklamationen");
  await wegVor("vorbestellungen", "liefertermin", "Vorbestellungen");
  await wegVor("zukauf_positionen", "rechnungsdatum", "Zukaufpositionen");
  if (aufgabenIds.length) await wegIn("pflueckaufgaben", "id", aufgabenIds, "Pflueckaufgaben");
  if (chargenIds.length) await wegIn("chargen", "id", chargenIds, "Chargen");
  await wegVor("wetter_messungen", "gemessen_am", "Wettermessungen");
  await wegVor("schulungsteilnahmen", "abgeschlossen_am", "Schulungsteilnahmen");

  const { error: eFort } = await db.from("einarbeitung_fortschritt").delete().not("id", "is", null);
  if (eFort) schlecht(`Einarbeitung: ${eFort.message.slice(0, 70)}`);
  else ok("Einarbeitungsfortschritt zurueckgesetzt");

  // Kostentraeger bleiben, solange Buchungen darauf zeigen (SET NULL waere
  // moeglich, macht die Buchung aber zur Waise ohne Zuordnung).
  const { count: buchungen } = await db
    .from("finance_ledger_entries").select("*", { count: "exact", head: true })
    .lt("buchungsdatum", JAHR_STICHTAG);
  if ((buchungen ?? 0) > 0) {
    hinweis(`${buchungen} Finanzbuchungen bleiben stehen - append-only, keine Ausnahme fuer service_role`);
    hinweis("Die zugehoerigen Kostentraeger bleiben deshalb ebenfalls.");
  }
  console.log("");
}

// ===========================================================================
// Finanzen im laufenden Monat
// ===========================================================================
// Das Jahrespaket endet fest am 14.08.2026 (JAHR_BIS). Je weiter die echte
// Zeit darueber hinauslaeuft, desto laenger ist der laufende Monat leer - und
// genau den zeigt die Finanzseite beim Oeffnen. Dieser Modus fuellt ihn, und
// zwar relativ zu heute statt zu einem festen Datum. Er veraltet deshalb
// nicht.
//
// Die Kostentraeger werden aus den CHARGEN des Monats abgeleitet, nicht aus
// den Pflueckaufgaben. Grund: deckungsbeitrag_je_kostentraeger holt die Menge
// ueber chargen.ernte_datum (Migration 20260920000000, lateral join). Passt
// der Erntetag nicht auf eine Charge, bleibt die Spalte "je Kilogramm" leer.
//
// ABRAEUMEN GEHT NICHT, und das ist kein Versehen: finance_ledger_entries ist
// append-only, und kostentraeger_id steht auf "on delete set null" - das SET
// NULL waere ein UPDATE auf die gesperrte Tabelle. Ein Kostentraeger mit
// Buchung ist damit unloeschbar. Deshalb gibt es hier kein --entfernen.

// Zwei Kostentraeger ohne Erntetag. Fachlich echte Faelle: zugekaufte Ware
// hat keine eigene Ernte. Fuer die Oberflaeche sind sie der Pruefstein dafuer,
// dass ein Zeitraumfilter sie nicht verschluckt - ohne Datum gibt es nichts
// zu vergleichen, sie muessen in jedem Zeitraum stehen bleiben.
const ZUKAUF = [
  { i: 1, bezeichnung: "Zukauf Nachbarbetrieb Talgar", erloes: 412000, kosten: 318000 },
  { i: 2, bezeichnung: "Zukauf Sammelstelle Issyk", erloes: 268500, kosten: 221000 },
];

async function finanzAnlegen() {
  const heute = new Date();
  const von = iso(new Date(heute.getFullYear(), heute.getMonth(), 1));
  const bis = iso(new Date(heute.getFullYear(), heute.getMonth() + 1, 0));
  console.log(`\nFinanzen im laufenden Monat anlegen: ${url}`);
  console.log(`Zeitraum ${von} bis ${bis}\n`);

  // --- Chargen des Monats --------------------------------------------------
  const chargen = await alleZeilen(() => db
    .from("chargen").select("id, reihenblock_id, sorte_id, ernte_datum")
    .gte("ernte_datum", von).lte("ernte_datum", bis).order("ernte_datum"));
  if (chargen.length === 0) {
    schlecht(`keine Charge zwischen ${von} und ${bis} - erst --jahr oder --lauf ausfuehren`);
    return;
  }

  // Die geerntete Menge traegt die Betraege. Sie steht an der Pflueckaufgabe,
  // nicht an der Charge.
  const aufgaben = await alleZeilen(() => db
    .from("pflueckaufgaben").select("charge_id, ist_menge_kg")
    .in("charge_id", chargen.map((c) => c.id)));
  const mengeJeCharge = new Map();
  for (const a of aufgaben) {
    if (!a.charge_id) continue;
    mengeJeCharge.set(a.charge_id, (mengeJeCharge.get(a.charge_id) ?? 0) + Number(a.ist_menge_kg ?? 0));
  }

  // --- Kostentraeger -------------------------------------------------------
  // unique (reihenblock_id, sorte_id, erntetag): Bestehendes erst einsammeln,
  // nur die Luecken anlegen.
  const vorhandene = await alleZeilen(() => db
    .from("kostentraeger").select("id, reihenblock_id, sorte_id, erntetag")
    .gte("erntetag", von).lte("erntetag", bis));
  const schonDa = new Map(
    vorhandene.map((t) => [`${t.reihenblock_id}|${t.sorte_id}|${t.erntetag}`, t.id]),
  );

  const neue = [];
  const gesehen = new Set();
  for (const c of chargen) {
    const schluessel = `${c.reihenblock_id}|${c.sorte_id}|${c.ernte_datum}`;
    if (gesehen.has(schluessel) || schonDa.has(schluessel)) continue;
    gesehen.add(schluessel);
    neue.push({
      reihenblock_id: c.reihenblock_id, sorte_id: c.sorte_id,
      erntetag: c.ernte_datum, bezeichnung: `Ernte ${c.ernte_datum}`,
    });
  }
  for (let n = 0; n < neue.length; n += 200) {
    const { data, error } = await db.from("kostentraeger").insert(neue.slice(n, n + 200))
      .select("id, reihenblock_id, sorte_id, erntetag");
    if (error) { schlecht(`Kostentraeger: ${error.message}`); return; }
    for (const t of data ?? []) schonDa.set(`${t.reihenblock_id}|${t.sorte_id}|${t.erntetag}`, t.id);
  }
  ok(`${schonDa.size} Kostentraeger im Monat, davon ${neue.length} neu`);

  // --- Zukauf ohne Erntetag ------------------------------------------------
  // Feste Kennungen, damit ein zweiter Lauf sie wiedererkennt. NULL ist in
  // einem unique-Index nicht mit sich selbst gleich, zwei Zeilen ganz ohne
  // Bezug waeren also auch ohne feste IDs jedes Mal neu.
  const zukaufIds = [];
  for (const z of ZUKAUF) {
    const id = K(z.i, "00000004");
    zukaufIds.push({ ...z, id });
    const { data: da } = await db.from("kostentraeger").select("id").eq("id", id).maybeSingle();
    if (da) { unveraendert(`Kostentraeger ${z.bezeichnung}`); continue; }
    pruefe(
      await db.from("kostentraeger").insert({ id, bezeichnung: z.bezeichnung, erntetag: null }),
      "Zukauf-Kostentraeger anlegen",
    );
    ok(`Kostentraeger ${z.bezeichnung}, ohne Erntetag`);
  }

  // --- Buchungen -----------------------------------------------------------
  // Je Erntetag ein Erloes und zwei Kostenzeilen, wie im Jahrespaket.
  const buchungen = [];
  let n = 0;
  for (const c of chargen) {
    const tid = schonDa.get(`${c.reihenblock_id}|${c.sorte_id}|${c.ernte_datum}`);
    if (!tid) continue;
    const menge = mengeJeCharge.get(c.id) ?? 0;
    if (menge <= 0) continue;
    buchungen.push(
      { kostentraeger_id: tid, typ: "erloes", kategorie: "Verkauf",
        betrag_tenge: Math.round(menge * (1900 + streu(n, 300))), buchungsdatum: c.ernte_datum,
        beschreibung: "Verkauf Handel" },
      { kostentraeger_id: tid, typ: "kosten", kategorie: "Lohn",
        betrag_tenge: Math.round(menge * 800), buchungsdatum: c.ernte_datum,
        beschreibung: "Pflueckloehne" },
      { kostentraeger_id: tid, typ: "kosten", kategorie: "Material",
        betrag_tenge: Math.round(menge * (120 + streu(n + 3, 80))), buchungsdatum: c.ernte_datum,
        beschreibung: "Schalen und Steigen" },
    );
    n += 1;
  }

  // Append-only: ohne diese Pruefung legt jeder Lauf denselben Satz noch
  // einmal an, und wegholen laesst sich nichts davon.
  const { count: schonGebucht } = await db
    .from("finance_ledger_entries").select("*", { count: "exact", head: true })
    .gte("buchungsdatum", von).lte("buchungsdatum", bis);
  if ((schonGebucht ?? 0) >= buchungen.length && buchungen.length > 0) {
    unveraendert(`${schonGebucht} Buchungen im Monat (append-only, bleiben bestehen)`);
  } else {
    for (let m = 0; m < buchungen.length; m += 500) {
      pruefe(await db.from("finance_ledger_entries").insert(buchungen.slice(m, m + 500)), "Buchungen");
    }
    ok(`${buchungen.length} Buchungen, Erloes und Kosten je Erntetag`);
  }

  // Die beiden Zukaufzeilen haengen an ihren festen Kostentraegern, die
  // Pruefung laeuft deshalb ueber die Zuordnung statt ueber das Datum.
  for (const z of zukaufIds) {
    const { count } = await db
      .from("finance_ledger_entries").select("*", { count: "exact", head: true })
      .eq("kostentraeger_id", z.id);
    if ((count ?? 0) > 0) { unveraendert(`Buchungen fuer ${z.bezeichnung}`); continue; }
    pruefe(
      await db.from("finance_ledger_entries").insert([
        { kostentraeger_id: z.id, typ: "erloes", kategorie: "B2B-Verkauf",
          betrag_tenge: z.erloes, buchungsdatum: bis, beschreibung: "Weiterverkauf Zukaufware" },
        { kostentraeger_id: z.id, typ: "kosten", kategorie: "Zukauf + Handling",
          betrag_tenge: z.kosten, buchungsdatum: bis, beschreibung: "Einkauf und Umpacken" },
      ]),
      "Zukaufbuchungen",
    );
    ok(`2 Buchungen fuer ${z.bezeichnung}`);
  }

  hinweis("Buchungen sind append-only - dieser Satz bleibt dauerhaft bestehen.");
  hinweis("Kostentraeger mit Buchung sind deshalb ebenfalls nicht mehr loeschbar.");
  console.log("");
}

// ===========================================================================
async function main() {
  if (nurBestand) { await bestand(); }
  else if (nurFinanz) { await finanzAnlegen(); }
  else if (nurSockel) { await sockel(); }
  else if (nurJahr) {
    if (entfernen) await jahrEntfernen();
    else await jahrAnlegen();
  }
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
  --jahr                 zwoelf Monate Betrieb in jedem Bereich
  --jahr --entfernen     raeumt sie wieder ab
  --finanz               fuellt den LAUFENDEN Monat mit Kostentraegern und
                         Buchungen, dazu zwei Zukauf-Kostentraeger ohne
                         Erntetag. Kein --entfernen moeglich: das Ledger
                         ist append-only.

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
