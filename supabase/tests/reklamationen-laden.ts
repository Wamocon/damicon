import { supabaseAttrappe, type AttrappenOptionen } from "./hilfen/supabase-attrappe";
import { ersetzeModule } from "./hilfen/modul-ersatz";
import { pruefer } from "./hilfen/ansicht-probe";

// Charakterisierung der Reklamationslader (lib/data/reklamationen.ts) gegen eine Attrappe des Supabase-Clients (seit 14.10.2026):
//   * ladeReklamation: Demo-Modus, Lesefehler, unbekannte Id, die vollständige Rückverfolgung (Pflücker ohne Doppelte, Kühl- und
//     Transportmessungen chronologisch über alle Lieferungen, Nachbarbetrieb), eingebettete Beziehungen als Objekt, Liste oder null,
//     Zahlen als Text, der Verlauf mit und ohne Autor und ein Fehler nur beim Verlauf.
//   * ladeReklamationen, ladeB2bKundenOptionen, ladeChargenOptionen: dieselben Fälle für Liste und Auswahlfelder.
//   * jede Abfrage: Tabelle, Spalten, Filter und Sortierung in der Reihenfolge, in der der Lader sie baut.
// createClient() aus lib/supabase/server ist durch die Attrappe ersetzt (hilfen/modul-ersatz.ts), der Rest läuft unverändert.
// Aufruf: npm run test:reklamationen-laden

const { pruefe, ende } = pruefer();

// ---- Attrappe mit Protokoll ------------------------------------------------------------------------------------------------------
/** Jede Abfrage als Liste ihrer Glieder: Tabelle, dann jeder Aufruf mit Argumenten (Leerraum in select entfernt wie supabase-js). */
let abfragen: string[][] = [];
let clients = 0;
let tabellen: Parameters<typeof supabaseAttrappe>[0] = {};
let optionen: AttrappenOptionen = {};

function mitProtokoll(client: { from(tabelle: string): object }) {
  return {
    from(tabelle: string) {
      const kette = [tabelle];
      abfragen.push(kette);
      const abfrage = client.from(tabelle) as Record<string | symbol, unknown>;
      const stellvertreter: object = new Proxy(abfrage, {
        get(ziel, name) {
          const wert = Reflect.get(ziel, name);
          if (typeof wert !== "function") return wert;
          if (name === "then") return wert.bind(ziel);
          return (...argumente: unknown[]) => {
            const lesbar = argumente.map((a) => (name === "select" && typeof a === "string" ? JSON.stringify(a.replace(/\s/g, "")) : JSON.stringify(a)));
            kette.push(`${String(name)}(${lesbar.join(", ")})`);
            const ergebnis = (wert as (...a: unknown[]) => unknown).apply(ziel, argumente);
            return ergebnis === ziel ? stellvertreter : ergebnis;
          };
        },
      });
      return stellvertreter;
    },
  };
}

ersetzeModule({
  "@/lib/supabase/server": {
    createClient: async () => {
      clients++;
      return mitProtokoll(supabaseAttrappe(tabellen, optionen).client);
    },
  },
});

const DB_AN = () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "attrappe";
};
const DB_AUS = () => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
};
function lage(neueTabellen: Parameters<typeof supabaseAttrappe>[0], neueOptionen: AttrappenOptionen = {}) {
  tabellen = neueTabellen;
  optionen = neueOptionen;
  abfragen = [];
  clients = 0;
}
const gleich = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ---- Testdaten ---------------------------------------------------------------------------------------------------------------------
const SELECT_DETAIL =
  "id,code,grund,betreff,beschreibung,status,betroffene_menge_kg,gemeldet_am,frist_am,erledigt_am,loesung,gutschrift_tenge,charge_id,gemeldet_von," +
  "b2b_kunden(id,name)," +
  "chargen(code,reihenbloecke(code),steigen(pfluecker_id,pfluecker(name,ausweis)),kuehlketten_messungen(id,minuten_seit_pfluecken,ergebnis,gemessen_am)," +
  "zukauf_positionen(nachbarbetriebe(name,ort)),lieferungen(transport_temperatur_messungen(id,temperatur_c,ergebnis,gemessen_am)))," +
  "profiles(full_name)";
const SELECT_VERLAUF = "id,neuer_status,text,sichtbar_fuer_kunde,created_at,profiles(full_name,role)";
const SELECT_LISTE = "id,code,grund,betreff,status,betroffene_menge_kg,gemeldet_am,frist_am,gutschrift_tenge,b2b_kunden(id,name),chargen(code,reihenbloecke(code))";
const abfrageDetail = (id: string) => ["reklamationen", `select(${JSON.stringify(SELECT_DETAIL)})`, `eq("id", ${JSON.stringify(id)})`, "maybeSingle()"];
const abfrageVerlauf = (id: string) => ["reklamation_ereignisse", `select(${JSON.stringify(SELECT_VERLAUF)})`, `eq("reklamation_id", ${JSON.stringify(id)})`, 'order("created_at")'];

const kopfVoll = {
  code: "REK-1",
  grund: "temperatur",
  betreff: "Zu warm",
  beschreibung: "Kühlkette nach 72 Minuten",
  status: "angenommen",
  betroffene_menge_kg: "44.2",
  gemeldet_am: "2026-09-03T09:10:00+06:00",
  frist_am: "2026-09-08",
  erledigt_am: "2026-09-05T10:00:00+06:00",
  loesung: "Gutschrift erteilt",
  gutschrift_tenge: "15000",
  charge_id: "c1",
  gemeldet_von: "u1",
};
const reklVoll = {
  id: "r1",
  ...kopfVoll,
  b2b_kunden: [{ id: "k1", name: "Handelskette A" }],
  chargen: [
    {
      code: "CH-0902-12",
      reihenbloecke: [{ code: "T-N-A-03" }],
      steigen: [
        { pfluecker_id: "p1", pfluecker: { name: "Aliya", ausweis: "A-1" } },
        { pfluecker_id: "p1", pfluecker: { name: "Aliya", ausweis: "A-1" } },
        { pfluecker_id: null, pfluecker: { name: "Ohne Id", ausweis: "X" } },
        { pfluecker_id: "p2", pfluecker: null },
        { pfluecker_id: "p3", pfluecker: [{ name: "Bek", ausweis: "B-3" }] },
      ],
      kuehlketten_messungen: [
        { id: "k-spaet", minuten_seit_pfluecken: 72, ergebnis: "verstoss", gemessen_am: "2026-09-02T12:00:00Z" },
        { id: "k-frueh", minuten_seit_pfluecken: null, ergebnis: "ok", gemessen_am: "2026-09-02T08:00:00Z" },
      ],
      zukauf_positionen: [{ nachbarbetriebe: [{ name: "Ferma Talgar", ort: null }] }],
      lieferungen: [
        { transport_temperatur_messungen: [{ id: "t3", temperatur_c: "6.5", ergebnis: "warnung", gemessen_am: "2026-09-03T07:00:00Z" }, { id: "t1", temperatur_c: 4, ergebnis: "ok", gemessen_am: "2026-09-03T05:00:00Z" }] },
        { transport_temperatur_messungen: null },
        { transport_temperatur_messungen: [{ id: "t2", temperatur_c: "4.5", ergebnis: "ok", gemessen_am: "2026-09-03T06:00:00Z" }] },
      ],
    },
  ],
  profiles: { full_name: "Daniyar Omarov" },
};
const reklLeer = {
  id: "r2",
  ...kopfVoll,
  code: "REK-2",
  status: "offen",
  beschreibung: null,
  betroffene_menge_kg: null,
  frist_am: null,
  erledigt_am: null,
  loesung: null,
  gutschrift_tenge: null,
  charge_id: null,
  gemeldet_von: null,
  b2b_kunden: null,
  chargen: null,
  profiles: null,
};
// Charge als Objekt, aber ohne jede Rückverfolgung: Beziehungen fehlen, sind null oder leer.
const reklNurCharge = {
  id: "r3",
  ...kopfVoll,
  code: "REK-3",
  b2b_kunden: { id: "k2", name: "Almaty Fresh" },
  chargen: { code: "CH-Z-01", reihenbloecke: null, zukauf_positionen: [{ nachbarbetriebe: null }] },
  profiles: [{ full_name: "Aigerim" }],
};
const reklZukaufLeer = { ...reklNurCharge, id: "r4", chargen: { code: "CH-Z-02", reihenbloecke: { code: "T-S-B-01" }, zukauf_positionen: [], lieferungen: [] } };
const reklZukaufObjekt = { ...reklNurCharge, id: "r5", chargen: { code: "CH-Z-03", zukauf_positionen: { nachbarbetriebe: { name: "Bauer Nurlan", ort: "Esik" } } } };

const ereignisse = [
  { id: "e2", reklamation_id: "r1", neuer_status: "angenommen", text: "Angenommen", sichtbar_fuer_kunde: false, created_at: "2026-09-04T10:00:00Z", profiles: [{ full_name: "Daniyar Omarov", role: "betriebsleitung" }] },
  { id: "e1", reklamation_id: "r1", neuer_status: null, text: "Gemeldet", sichtbar_fuer_kunde: true, created_at: "2026-09-03T03:10:00Z", profiles: null },
  { id: "e-fremd", reklamation_id: "r2", neuer_status: null, text: "Fremd", sichtbar_fuer_kunde: true, created_at: "2026-09-03T03:00:00Z", profiles: null },
];
const alleTabellen = { reklamationen: [reklVoll, reklLeer, reklNurCharge, reklZukaufLeer, reklZukaufObjekt], reklamation_ereignisse: ereignisse };

const listenTeil = {
  id: "r1",
  code: "REK-1",
  kunde: "Handelskette A",
  kundeId: "k1",
  chargeCode: "CH-0902-12",
  reihenblock: "T-N-A-03",
  grund: "temperatur",
  betreff: "Zu warm",
  status: "angenommen",
  betroffeneMengeKg: 44.2,
  gemeldetAm: "2026-09-03T09:10:00+06:00",
  fristAm: "2026-09-08",
  gutschriftTenge: 15000,
};
const erwartetVoll = {
  ...listenTeil,
  beschreibung: "Kühlkette nach 72 Minuten",
  chargeId: "c1",
  gemeldetVon: "Daniyar Omarov",
  erledigtAm: "2026-09-05T10:00:00+06:00",
  loesung: "Gutschrift erteilt",
  ereignisse: [
    { id: "e1", neuerStatus: null, text: "Gemeldet", sichtbarFuerKunde: true, autor: null, erstelltAm: "2026-09-03T03:10:00Z" },
    { id: "e2", neuerStatus: "angenommen", text: "Angenommen", sichtbarFuerKunde: false, autor: "Daniyar Omarov (betriebsleitung)", erstelltAm: "2026-09-04T10:00:00Z" },
  ],
  pflueckerListe: [
    { name: "Aliya", ausweis: "A-1" },
    { name: "Bek", ausweis: "B-3" },
  ],
  kuehlmessungen: [
    { id: "k-frueh", minutenSeitPfluecken: null, ergebnis: "ok", gemessenAm: "2026-09-02T08:00:00Z" },
    { id: "k-spaet", minutenSeitPfluecken: 72, ergebnis: "verstoss", gemessenAm: "2026-09-02T12:00:00Z" },
  ],
  nachbarbetrieb: { name: "Ferma Talgar", ort: null },
  transportMessungen: [
    { id: "t1", temperaturC: 4, ergebnis: "ok", gemessenAm: "2026-09-03T05:00:00Z" },
    { id: "t2", temperaturC: 4.5, ergebnis: "ok", gemessenAm: "2026-09-03T06:00:00Z" },
    { id: "t3", temperaturC: 6.5, ergebnis: "warnung", gemessenAm: "2026-09-03T07:00:00Z" },
  ],
};
const ohneRueckverfolgung = { pflueckerListe: [], kuehlmessungen: [], nachbarbetrieb: null, transportMessungen: [] };

async function main() {
  const lader = await import("../../src/lib/data/reklamationen");

  // ---- 1. ladeReklamation im Demo-Modus ------------------------------------------------------------------------------------------
  DB_AUS();
  lage(alleTabellen);
  const demo = await lader.ladeReklamation("demo-rek-1");
  pruefe(
    "Demo: Detail aus den Beispieldaten, ohne Rückverfolgung, ohne Client",
    demo?.code === "REK-20260903-0001" && demo.kundeId === "demo-rek-1" && demo.chargeId === null && demo.gemeldetVon === "Handelskette A" && demo.ereignisse.length === 2 &&
      gleich({ pflueckerListe: demo.pflueckerListe, kuehlmessungen: demo.kuehlmessungen, nachbarbetrieb: demo.nachbarbetrieb, transportMessungen: demo.transportMessungen }, ohneRueckverfolgung) && clients === 0,
    JSON.stringify(demo).slice(0, 120),
  );
  pruefe(
    "Demo: Felder in der Reihenfolge der Detailansicht",
    Object.keys(demo ?? {}).join(",") === Object.keys(erwartetVoll).join(","),
    Object.keys(demo ?? {}).join(","),
  );
  pruefe("Demo: unbekannte Id ergibt null", (await lader.ladeReklamation("gibt-es-nicht")) === null && clients === 0);

  // ---- 2. ladeReklamation gegen die Datenbank -------------------------------------------------------------------------------------
  DB_AN();
  lage(alleTabellen);
  const voll = await lader.ladeReklamation("r1");
  pruefe("Detail: vollständige Reklamation genau wie erwartet (Feldreihenfolge eingeschlossen)", gleich(voll, erwartetVoll), JSON.stringify(voll));
  pruefe("Detail: ein Client, zwei Abfragen, Reklamation vor Verlauf", clients === 1 && abfragen.length === 2);
  pruefe("Detail: Abfrage der Reklamation mit allen Beziehungen", gleich(abfragen[0], abfrageDetail("r1")), abfragen[0]?.join(" . "));
  pruefe("Detail: Abfrage des Verlaufs, nach Zeitpunkt sortiert", gleich(abfragen[1], abfrageVerlauf("r1")), abfragen[1]?.join(" . "));

  lage(alleTabellen);
  const leer = await lader.ladeReklamation("r2");
  pruefe(
    "Detail: ohne Kunde, Charge, Profil und Zahlen",
    gleich(leer, {
      ...listenTeil,
      id: "r2",
      code: "REK-2",
      kunde: "-",
      kundeId: "",
      chargeCode: null,
      reihenblock: null,
      status: "offen",
      betroffeneMengeKg: null,
      fristAm: null,
      gutschriftTenge: null,
      beschreibung: null,
      chargeId: null,
      gemeldetVon: null,
      erledigtAm: null,
      loesung: null,
      ereignisse: [{ id: "e-fremd", neuerStatus: null, text: "Fremd", sichtbarFuerKunde: true, autor: null, erstelltAm: "2026-09-03T03:00:00Z" }],
      ...ohneRueckverfolgung,
    }),
    JSON.stringify(leer),
  );

  lage(alleTabellen);
  const nurCharge = await lader.ladeReklamation("r3");
  pruefe(
    "Detail: Charge als Objekt ohne Reihenblock und ohne Rückverfolgung, Profil als Liste",
    nurCharge?.chargeCode === "CH-Z-01" && nurCharge.reihenblock === null && nurCharge.kunde === "Almaty Fresh" && nurCharge.kundeId === "k2" && nurCharge.gemeldetVon === "Aigerim" &&
      gleich({ pflueckerListe: nurCharge.pflueckerListe, kuehlmessungen: nurCharge.kuehlmessungen, nachbarbetrieb: nurCharge.nachbarbetrieb, transportMessungen: nurCharge.transportMessungen }, ohneRueckverfolgung) &&
      gleich(nurCharge.ereignisse, []),
    JSON.stringify(nurCharge),
  );
  lage(alleTabellen);
  const zukaufLeer = await lader.ladeReklamation("r4");
  pruefe("Detail: Reihenblock als Objekt, leere Zukauf- und Lieferliste", zukaufLeer?.reihenblock === "T-S-B-01" && zukaufLeer.nachbarbetrieb === null && gleich(zukaufLeer.transportMessungen, []), JSON.stringify(zukaufLeer));
  lage(alleTabellen);
  const zukaufObjekt = await lader.ladeReklamation("r5");
  pruefe("Detail: Zukauf und Nachbarbetrieb als Objekt, mit Ort", gleich(zukaufObjekt?.nachbarbetrieb, { name: "Bauer Nurlan", ort: "Esik" }), JSON.stringify(zukaufObjekt?.nachbarbetrieb));

  lage(alleTabellen);
  pruefe("Detail: unbekannte Id ergibt null, beide Abfragen laufen trotzdem", (await lader.ladeReklamation("r-unbekannt")) === null && abfragen.length === 2 && gleich(abfragen[1], abfrageVerlauf("r-unbekannt")));
  lage(alleTabellen, { fehlerIn: ["reklamationen"] });
  pruefe("Detail: Lesefehler der Reklamation ergibt null", (await lader.ladeReklamation("r1")) === null && abfragen.length === 2);
  lage(alleTabellen, { fehlerIn: ["reklamation_ereignisse"] });
  const ohneVerlauf = await lader.ladeReklamation("r1");
  pruefe("Detail: Lesefehler nur beim Verlauf ergibt die Reklamation mit leerem Verlauf", gleich(ohneVerlauf, { ...erwartetVoll, ereignisse: [] }), JSON.stringify(ohneVerlauf?.ereignisse));

  // ---- 3. ladeReklamationen ------------------------------------------------------------------------------------------------------
  DB_AUS();
  lage(alleTabellen);
  const demoListe = await lader.ladeReklamationen();
  pruefe(
    "Liste Demo: Beispieldaten, Kunden-Id ist die Reklamations-Id, kein Client",
    demoListe.quelle === "demo" && demoListe.reklamationen.map((r) => r.id).join(",") === "demo-rek-1,demo-rek-2,demo-rek-3" && demoListe.reklamationen[0]!.kundeId === "demo-rek-1" && clients === 0,
  );
  pruefe("Liste Demo: Felder eines Eintrags", Object.keys(demoListe.reklamationen[0]!).join(",") === Object.keys(listenTeil).join(","), Object.keys(demoListe.reklamationen[0]!).join(","));
  DB_AN();
  lage(alleTabellen);
  const liste = await lader.ladeReklamationen();
  pruefe("Liste: eine Abfrage mit Kunde, Charge und Reihenblock, neueste zuerst", gleich(abfragen, [["reklamationen", `select(${JSON.stringify(SELECT_LISTE)})`, 'order("gemeldet_am", {"ascending":false})']]), abfragen[0]?.join(" . "));
  pruefe("Liste: Quelle db und vollständiger erster Eintrag", liste.quelle === "db" && liste.reklamationen.length === 5 && gleich(liste.reklamationen.find((r) => r.id === "r1"), listenTeil), JSON.stringify(liste.reklamationen.find((r) => r.id === "r1")));
  pruefe(
    "Liste: Eintrag ohne Kunde und Charge",
    gleich(liste.reklamationen.find((r) => r.id === "r2"), { ...listenTeil, id: "r2", code: "REK-2", kunde: "-", kundeId: "", chargeCode: null, reihenblock: null, status: "offen", betroffeneMengeKg: null, fristAm: null, gutschriftTenge: null }),
  );
  lage(alleTabellen, { fehlerIn: ["reklamationen"] });
  const fehlerListe = await lader.ladeReklamationen();
  pruefe("Liste: Lesefehler zeigt die Beispieldaten mit Quelle fehler", fehlerListe.quelle === "fehler" && fehlerListe.reklamationen.length === 3);

  // ---- 4. Auswahlfelder ----------------------------------------------------------------------------------------------------------
  DB_AUS();
  lage({ b2b_kunden: [{ id: "k1", name: "A" }] });
  pruefe("Auswahl Demo: keine Kunden, keine Chargen, kein Client", gleich(await lader.ladeB2bKundenOptionen(), []) && gleich(await lader.ladeChargenOptionen(null), []) && clients === 0);
  DB_AN();
  lage({ b2b_kunden: [{ id: "k2", name: "Zeta" }, { id: "k1", name: "Alpha" }] });
  const kunden = await lader.ladeB2bKundenOptionen();
  pruefe("Auswahl Kunden: nach Name sortiert", gleich(kunden, [{ id: "k1", label: "Alpha" }, { id: "k2", label: "Zeta" }]) && gleich(abfragen, [["b2b_kunden", 'select("id,name")', 'order("name")']]), abfragen[0]?.join(" . "));
  const chargen = Array.from({ length: 205 }, (_, i) => ({ id: `c${i}`, code: `CH-${String(i).padStart(3, "0")}` }));
  lage({ chargen });
  const alle = await lader.ladeChargenOptionen(null);
  pruefe("Auswahl Chargen fürs Büro: die 200 neuesten Codes", alle.length === 200 && alle[0]!.label === "CH-204" && gleich(abfragen, [["chargen", 'select("id,code")', 'order("code", {"ascending":false})', "limit(200)"]]), abfragen[0]?.join(" . "));
  lage({
    lieferungen: [
      { charge_id: "c2", b2b_kunde_id: "k1", chargen: { id: "c2", code: "CH-B" } },
      { charge_id: "c1", b2b_kunde_id: "k1", chargen: [{ id: "c1", code: "CH-A" }] },
      { charge_id: "c2", b2b_kunde_id: "k1", chargen: { id: "c2", code: "CH-B" } },
      { charge_id: null, b2b_kunde_id: "k1", chargen: null },
      { charge_id: "c9", b2b_kunde_id: "k2", chargen: { id: "c9", code: "CH-FREMD" } },
    ],
  });
  const eigene = await lader.ladeChargenOptionen("k1");
  pruefe(
    "Auswahl Chargen für einen Kunden: nur eigene Lieferungen, ohne Doppelte, nach Code",
    gleich(eigene, [{ id: "c1", label: "CH-A" }, { id: "c2", label: "CH-B" }]) &&
      gleich(abfragen, [["lieferungen", 'select("charge_id,chargen(id,code)")', 'eq("b2b_kunde_id", "k1")', 'not("charge_id", "is", null)']]),
    abfragen[0]?.join(" . "),
  );

  DB_AUS();
  ende();
}

main().catch((e) => {
  console.error("FAIL  Ausnahme", e);
  process.exit(1);
});
