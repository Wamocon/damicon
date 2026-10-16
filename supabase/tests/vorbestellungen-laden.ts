import { supabaseAttrappe, type AttrappenOptionen } from "./hilfen/supabase-attrappe";
import { ersetzeModule } from "./hilfen/modul-ersatz";
import { pruefer } from "./hilfen/ansicht-probe";

// Der Lader der Vorbestellungen (lib/data/vorbestellungen.ts, WMCNL-2491): eine Seite statt aller Zeilen. Geprueft gegen eine Attrappe des Supabase-Clients:
//   * Demo-Modus und Lesefehler (Zaehlung wie Zeilen), die Zahlen der Seite, die Reihenfolge (neueste zuerst, bei Gleichstand nach Id), der Bereich je Seite,
//   * eine Seite jenseits der letzten faellt auf die letzte, eine unlesbare Seitennummer auf die erste,
//   * die Zeilen einer Seite sind die der Gesamtliste, aneinandergereiht ohne Luecke und ohne Doppelte.
// Aufruf: npm run test:vorbestellungen-laden

const { pruefe, ende } = pruefer();

let tabellen: Parameters<typeof supabaseAttrappe>[0] = {};
let optionen: AttrappenOptionen = {};
let clients = 0;

ersetzeModule({
  "@/lib/supabase/server": {
    createClient: async () => {
      clients++;
      return supabaseAttrappe(tabellen, optionen).client;
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

async function main() {
  const lader = await import("../../src/lib/data/vorbestellungen");
  const { VORBESTELLUNGEN_PRO_SEITE } = await import("../../src/lib/domain/vorbestellungen");

  const zeile = (i: number) => ({
    id: `v${String(i).padStart(3, "0")}`,
    menge_kg: 10 + i,
    liefertermin: "2026-10-20",
    status: "angefragt",
    // Jede zweite Zeile teilt den Zeitpunkt mit der vorigen: bei Gleichstand entscheidet die Id.
    created_at: `2026-10-${String(1 + Math.floor(i / 2)).padStart(2, "0")}T08:00:00Z`,
    b2b_kunden: { id: "k1", name: "Kunde" },
    sorten: { name: "Sorte" },
  });
  const viele = Array.from({ length: 60 }, (_, i) => zeile(i));

  DB_AUS();
  tabellen = { vorbestellungen: viele };
  const demo = await lader.ladeVorbestellungen(3);
  pruefe("Demo: Beispieldaten, eine Seite, kein Client", demo.quelle === "demo" && demo.seite === 1 && demo.seiten === 1 && demo.gesamt === demo.vorbestellungen.length && clients === 0);

  DB_AN();
  const erste = await lader.ladeVorbestellungen();
  pruefe("Seite 1: " + VORBESTELLUNGEN_PRO_SEITE + " Zeilen, gesamt 60, drei Seiten", erste.quelle === "db" && erste.vorbestellungen.length === VORBESTELLUNGEN_PRO_SEITE && erste.gesamt === 60 && erste.seiten === 3 && erste.seite === 1, JSON.stringify([erste.vorbestellungen.length, erste.gesamt, erste.seiten]));
  pruefe("Seite 1: die neuesten zuerst, bei gleichem Zeitpunkt nach Id", erste.vorbestellungen[0]!.id === "v058" || erste.vorbestellungen[0]!.id === "v059", erste.vorbestellungen.slice(0, 3).map((v) => v.id).join());

  const zweite = await lader.ladeVorbestellungen(2);
  const dritte = await lader.ladeVorbestellungen(3);
  pruefe("Seite 3: die letzten zehn", dritte.vorbestellungen.length === 60 - 2 * VORBESTELLUNGEN_PRO_SEITE && dritte.seite === 3);
  const ids = [...erste.vorbestellungen, ...zweite.vorbestellungen, ...dritte.vorbestellungen].map((v) => v.id);
  pruefe("Die Seiten aneinandergereiht sind die ganze Liste, ohne Doppelte und ohne Luecke", ids.length === 60 && new Set(ids).size === 60);

  const jenseits = await lader.ladeVorbestellungen(99);
  pruefe("Eine Seite jenseits der letzten faellt auf die letzte", jenseits.seite === 3 && jenseits.vorbestellungen.length === dritte.vorbestellungen.length);
  const unlesbar = await lader.ladeVorbestellungen(Number("abc") || 1);
  pruefe("Eine unlesbare Seitennummer ist Seite 1", unlesbar.seite === 1 && unlesbar.vorbestellungen[0]!.id === erste.vorbestellungen[0]!.id);
  const negativ = await lader.ladeVorbestellungen(-4);
  pruefe("Eine negative Seitennummer ist Seite 1", negativ.seite === 1);

  tabellen = { vorbestellungen: [] };
  const leer = await lader.ladeVorbestellungen();
  pruefe("Leere Liste: eine Seite, keine Zeilen", leer.quelle === "db" && leer.vorbestellungen.length === 0 && leer.gesamt === 0 && leer.seiten === 1);

  tabellen = { vorbestellungen: viele };
  optionen = { fehlerIn: ["vorbestellungen"] };
  const fehler = await lader.ladeVorbestellungen();
  pruefe("Lesefehler: Beispieldaten mit Quelle fehler", fehler.quelle === "fehler");
  optionen = {};

  ende();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
