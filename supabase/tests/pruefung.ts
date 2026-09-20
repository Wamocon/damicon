// Tests fuer die Compliance-Pruefung (Rollen, Befundregeln, Siegel, Ablauf mit Mock-Modell).
// Kein Netzwerk, keine Datenbank, kein echtes Modell: Das Modell wird durch ein Skript ersetzt, das
// die Werkzeugaufrufe liefert, die ein Modell liefern wuerde (auch fehlerhafte). So laesst sich
// pruefen, dass die Regeln greifen, WENN das Modell sich irrt.
// Aufruf: npm run test:pruefung (laeuft ueber tsx, damit die @/-Pfade aufloesen).

import { readFileSync } from "node:fs";
import { MockLanguageModelV3 } from "ai/test";
import { fuehrePruefungAus, type LaufAbhaengigkeiten } from "@/lib/pruefung/agenten";
import { kanonisch, kennzahlen, massnahmenplan, pruefeBefund, siegelGueltig, type BefundEingabe } from "@/lib/pruefung/befund";
import { PRUEFPUNKTE } from "@/lib/pruefung/felder";
import { darfPruefen, erlaubteBereiche, PRUEFBEREICHE, waehleBereiche } from "@/lib/pruefung/rollen";
import type { Befund, Ereignis } from "@/lib/pruefung/typen";
import { roles, type Role } from "@/lib/rbac";
import type { Beleg } from "@/lib/wissen/suche";

let gesamt = 0;
let fehler = 0;
function pruefe(name: string, ok: boolean, detail = "") {
  gesamt++;
  if (!ok) fehler++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
}
const gleich = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ---- Rollen ------------------------------------------------------------------------------------
pruefe("Admin darf alle vier Bereiche", gleich(erlaubteBereiche("admin"), [...PRUEFBEREICHE]));
pruefe("Buchhaltung: Audit und Steuer", gleich(erlaubteBereiche("buchhaltung"), ["audit", "steuer"]));
pruefe("Betriebsleitung: Recht und Risiko", gleich(erlaubteBereiche("betriebsleitung"), ["recht", "risiko"]));
pruefe("Brigade, Pfluecker, Erzeuger, Kunde und ohne Rolle: keine Pruefung", (["brigade", "picker", "erzeuger", "kunde"] as Role[]).every((r) => !darfPruefen(r)) && !darfPruefen(null) && !darfPruefen(undefined));
pruefe("Jede Rolle ist entweder freigegeben oder gesperrt, keine ist vergessen", roles.every((r) => typeof darfPruefen(r) === "boolean"));
const w1 = waehleBereiche("buchhaltung", ["steuer", "recht"]);
pruefe("Buchhaltung fragt Steuer und Recht: Recht wird abgelehnt und benannt", gleich(w1.erlaubt, ["steuer"]) && gleich(w1.abgelehnt, ["recht"]));
pruefe("Ohne Angabe laufen alle erlaubten Bereiche", gleich(waehleBereiche("betriebsleitung", undefined).erlaubt, ["recht", "risiko"]));
pruefe("Kunde: nichts erlaubt, auch nicht auf Anfrage", waehleBereiche("kunde", ["audit"]).erlaubt.length === 0);
const w2 = waehleBereiche("admin", ["audit", "quatsch", 5, "audit"]);
pruefe("Unbekannte Bereiche und doppelte Eintraege werden nicht ausgefuehrt", gleich(w2.erlaubt, ["audit"]) && gleich(w2.unbekannt, ["quatsch"]));
pruefe("Nur unbekannte Bereiche: zurueck auf die erlaubten der Rolle, nicht auf alle", gleich(waehleBereiche("buchhaltung", ["quatsch"]).erlaubt, ["audit", "steuer"]));

// ---- Pruefprogramm -----------------------------------------------------------------------------
pruefe("Jeder Bereich hat mindestens drei Pruefungsfelder", PRUEFBEREICHE.every((b) => PRUEFPUNKTE.filter((p) => p.bereich === b).length >= 3));
pruefe("Feldkennungen sind eindeutig", new Set(PRUEFPUNKTE.map((p) => p.id)).size === PRUEFPUNKTE.length);
pruefe("Jedes Feld hat eine russische Suchformulierung", PRUEFPUNKTE.every((p) => /[а-я]{4}/i.test(p.russisch)));

// ---- Befundregeln ------------------------------------------------------------------------------
const kontext = (o: Partial<Parameters<typeof pruefeBefund>[1]> = {}) => ({ id: "st-ust", bereich: "steuer" as const, gueltigeBelege: new Set(["S1", "S2"]), nachweise: [{ quelle: "mwstStatusAbrufen", daten: "{}", hash: "abc" }], hatDaten: true, ...o });
const eingabe = (o: Partial<BefundEingabe> = {}): BefundEingabe => ({ feld: "st-ust", status: "verstoss", schwere: "hoch", titel: "Registrierung ueberfaellig", befund: "Der Umsatz liegt ueber der Schwelle, die Registrierung fehlt.", belege: ["S1"], massnahmen: [{ schritt: "Registrierung beantragen", verantwortlich: "buchhaltung", frist: "sofort" }], ...o });
pruefe("Verstoss mit gueltigem Beleg und Daten bleibt Verstoss", pruefeBefund(eingabe(), kontext()).status === "verstoss");
const erfunden = pruefeBefund(eingabe({ belege: ["S999", "S1000"] }), kontext());
pruefe("Erfundene Belegkennungen fallen weg, der Verstoss wird zum Hinweis (kein Beleg, keine Behauptung)", erfunden.status === "hinweis" && erfunden.belege.length === 0 && erfunden.ohneRechtsbeleg === true);
pruefe("Ein Hinweis ist nie kritisch oder hoch", ["kritisch", "hoch"].every((s) => pruefeBefund(eingabe({ belege: [], schwere: s as never }), kontext()).schwere === "mittel"));
const ohneDaten = pruefeBefund(eingabe(), kontext({ hatDaten: false, nachweise: [] }));
pruefe("Ohne Betriebsdaten ist nur ein Hinweis moeglich (nichts raten)", ohneDaten.status === "hinweis" && ohneDaten.ohneDaten === true);
const konformOhne = pruefeBefund(eingabe({ status: "konform", schwere: "keine", belege: [], massnahmen: [] }), kontext());
pruefe("'Konform' ohne Rechtsbeleg ist keine Aussage: Hinweis", konformOhne.status === "hinweis" && konformOhne.ohneRechtsbeleg === true);
const konformMit = pruefeBefund(eingabe({ status: "konform", schwere: "hoch" }), kontext());
pruefe("'Konform' mit Beleg: Schwere 'keine' und keine Massnahmen", konformMit.status === "konform" && konformMit.schwere === "keine" && konformMit.massnahmen.length === 0);
pruefe("Verstoss mit Schwere 'keine' wird auf 'mittel' angehoben", pruefeBefund(eingabe({ schwere: "keine" }), kontext()).schwere === "mittel");
pruefe("Doppelte und fremde Kennungen: nur gueltige, einmal", gleich(pruefeBefund(eingabe({ belege: ["S1", "S1", "S2", "S7"] }), kontext()).belege, ["S1", "S2"]));
pruefe("Nachweise (Betriebsdaten mit Pruefsumme) bleiben am Befund", pruefeBefund(eingabe(), kontext()).nachweise[0]?.hash === "abc");

const bs: Befund[] = [
  { ...pruefeBefund(eingabe({ schwere: "kritisch" }), kontext()), id: "a" },
  { ...pruefeBefund(eingabe({ schwere: "mittel", massnahmen: [{ schritt: "Berichtigung vorbereiten", verantwortlich: "admin", frist: "30 Tage" }] }), kontext()), id: "b" },
  { ...pruefeBefund(eingabe({ status: "konform", schwere: "keine" }), kontext()), id: "c" },
  { ...pruefeBefund(eingabe({ belege: [] }), kontext()), id: "d" },
];
const kz = kennzahlen(bs);
pruefe("Kennzahlen: Reife = 100 - 25 (kritisch) - 5 (mittel) - 1 (Hinweis) = 69", kz.reife === 69 && kz.stufe === "luecken", String(kz.reife));
pruefe("Kennzahlen: Zaehlung nach Status", kz.nachStatus.verstoss === 2 && kz.nachStatus.konform === 1 && kz.nachStatus.hinweis === 1 && kz.ohneRechtsbeleg === 1);
pruefe("Reife nie unter 0", kennzahlen(Array.from({ length: 10 }, (_, i) => ({ ...bs[0]!, id: String(i) }))).reife === 0);
pruefe("Keine Befunde: Reife 100", kennzahlen([]).reife === 100 && kennzahlen([]).stufe === "bereit");
const plan = massnahmenplan(bs);
pruefe("Massnahmenplan: 'sofort' vor '30 Tage'", plan.length === 3 && plan[0]!.frist === "sofort" && plan.at(-1)!.frist === "30 Tage");

// ---- Siegel ------------------------------------------------------------------------------------
pruefe("kanonisch: Schluesselreihenfolge spielt keine Rolle", kanonisch({ b: 1, a: [2, { d: 1, c: 2 }] }) === kanonisch({ a: [2, { c: 2, d: 1 }], b: 1 }));
pruefe("kanonisch: undefined wird ausgelassen", kanonisch({ a: 1, b: undefined }) === kanonisch({ a: 1 }));

// ---- Ablauf mit Mock-Modell --------------------------------------------------------------------
const nutzung = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
const beleg = (id: string, stufe = 1): Beleg => ({ id, fundstelle: `НК РК ст. ${id}`, titel: "t", sprache: "ru", stufe, gueltigAb: "2026-01-01", gueltigBis: null, ueberholt: false, konfidenz: null, abgerufenAm: "2026-09-19", url: "https://adilet.zan.kz/x", bereich: "steuer", text: "Текст нормы", punktzahl: 1 });
const felderImPrompt = (prompt: string) => [...prompt.matchAll(/=== PRUEFUNGSFELD ([a-z-]+):/g)].map((m) => m[1]!);
const ersteBelegNr = (prompt: string, feld: string) => new RegExp(`=== PRUEFUNGSFELD ${feld}:[\\s\\S]*?\\[(S\\d+)\\]`).exec(prompt)?.[1];

function textAus(prompt: unknown): string {
  return (prompt as Array<{ role: string; content: unknown }>)
    .map((m) => (typeof m.content === "string" ? m.content : (m.content as Array<{ type: string; text?: string }>).map((t) => t.text ?? "").join("")))
    .join("\n");
}

type Verhalten = { syntheseFehler?: number; langeZusammenfassung?: boolean; gesehen?: Set<string>; auslassen?: Set<string>; erfundeneBelege?: Set<string>; werfeBei?: string; zaehler: { agent: number; synthese: number; nachfrage: number } };
function mockModell(v: Verhalten) {
  return new MockLanguageModelV3({
    doGenerate: async () => {
      v.zaehler.synthese++;
      if (v.syntheseFehler && v.zaehler.synthese <= v.syntheseFehler) throw new Error("kurzer Ausfall");
      return {
        content: [{ type: "tool-call" as const, toolCallId: "z1", toolName: "berichtAbschliessen", input: JSON.stringify({ zusammenfassung: v.langeZusammenfassung ? "Der Betrieb hat Luecken bei den Fristen. ".repeat(40) : "Der Betrieb hat Luecken bei den Fristen, ist aber im Datenschutz gut aufgestellt.", prioritaeten: ["Registrierung beantragen", "ESUTD-Fristen nachholen"] }) }],
        finishReason: { unified: "tool-calls" as const, raw: undefined },
        usage: nutzung,
        warnings: [],
      };
    },
    doStream: async ({ prompt }) => {
      const text = textAus(prompt);
      v.zaehler.agent++;
      if (v.werfeBei && text.includes(v.werfeBei)) throw new Error("Modell nicht erreichbar");
      const felder = felderImPrompt(text);
      v.gesehen ??= new Set();
      const teile = felder
        // Ein ausgelassenes Feld fehlt nur beim ersten Mal; bei der gezielten Nachfrage liefert das Modell es.
        .filter((f) => !(v.auslassen?.has(f) && !v.gesehen!.has(f)))
        .map((f) => {
          const nr = ersteBelegNr(text, f);
          const belege = v.erfundeneBelege?.has(f) ? ["S999"] : nr ? [nr] : [];
          return {
            type: "tool-call" as const,
            toolCallId: `t-${f}`,
            toolName: "befundMelden",
            input: JSON.stringify({
              feld: f,
              status: "verstoss",
              schwere: "hoch",
              titel: `Befund ${f}`,
              befund: `Die Betriebsdaten zeigen eine Abweichung zu ${f}, die Norm verlangt eine Erfuellung.`,
              belege,
              massnahmen: [{ schritt: `Massnahme fuer ${f} umsetzen`, verantwortlich: "admin", frist: "7 Tage" }],
            }),
          };
        });
      for (const f of felder) v.gesehen.add(f);
      return {
        stream: new ReadableStream({
          start(c) {
            c.enqueue({ type: "stream-start", warnings: [] });
            for (const t of teile) c.enqueue(t);
            c.enqueue({ type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage: nutzung });
            c.close();
          },
        }),
      };
    },
  });
}

function abhaengigkeiten(v: Verhalten, opts: { werkzeuge?: Record<string, unknown>; sucheFehler?: boolean } = {}): LaufAbhaengigkeiten {
  const werkzeug = (name: string) => ({ execute: async () => ({ quelle: name, wert: 42 }) });
  let nr = 0;
  return {
    modell: mockModell(v),
    modellName: "mock-haiku",
    werkzeuge: opts.werkzeuge ?? Object.fromEntries(["mwstStatusAbrufen", "esutdOffeneFristenAbrufen", "complianceUebersichtAbrufen", "kuehlketteAbrufen", "risikoRadarAbrufen"].map((n) => [n, werkzeug(n)])),
    suche: async () => {
      if (opts.sucheFehler) throw new Error("Qdrant nicht erreichbar");
      nr++;
      return { belege: [beleg("S1"), beleg("S2", 4)], dauerMs: { einbettung: 1, suche: 1, gesamt: 2 } };
    },
    jetzt: () => new Date("2026-09-20T10:00:00Z"),
    neueId: () => `lauf-${++nr}`,
  };
}

async function ablauf() {
  // 1. Vollpruefung als Admin
  const v: Verhalten = { zaehler: { agent: 0, synthese: 0, nachfrage: 0 }, erfundeneBelege: new Set(["st-esf"]) };
  const ereignisse: Ereignis[] = [];
  const bericht = await fuehrePruefungAus({ rolle: "admin", ersteller: { name: "Test Admin" }, bereiche: [...PRUEFBEREICHE], abgelehnt: [], sprache: "de" }, abhaengigkeiten(v), (e) => ereignisse.push(e));
  const arten = ereignisse.map((e) => e.t);
  pruefe("Ablauf: beginnt mit start, endet mit synthese fertig", arten[0] === "start" && ereignisse.at(-1)?.t === "synthese" && (ereignisse.at(-1) as { phase: string }).phase === "fertig");
  const spawn = ereignisse.filter((e) => e.t === "agent" && e.phase === "spawn").map((e) => (e as { bereich: string }).bereich).sort();
  pruefe("Ablauf: vier Mini-Himbis werden gestartet, je Bereich einer", gleich(spawn, ["audit", "recht", "risiko", "steuer"]));
  pruefe("Ablauf: jeder Agent durchlaeuft sammelt, denkt, fertig", PRUEFBEREICHE.every((b) => ["sammelt", "denkt", "fertig"].every((p) => ereignisse.some((e) => e.t === "agent" && e.bereich === b && e.phase === p))));
  pruefe("Ablauf: jedes Feld meldet Betriebsdaten und Rechtsquellen", PRUEFPUNKTE.every((p) => ereignisse.some((e) => e.t === "feld" && e.feld === p.id && e.phase === "fakten") && ereignisse.some((e) => e.t === "feld" && e.feld === p.id && e.phase === "recht")));
  pruefe("Bericht: ein Befund je Pruefungsfeld", bericht.befunde.length === PRUEFPUNKTE.length && new Set(bericht.befunde.map((b) => b.feld)).size === PRUEFPUNKTE.length);
  const esf = bericht.befunde.find((b) => b.feld === "st-esf")!;
  pruefe("Bericht: erfundene Belegkennung (S999) wurde zum Hinweis herabgestuft", esf.status === "hinweis" && esf.ohneRechtsbeleg === true && esf.belege.length === 0);
  const ust = bericht.befunde.find((b) => b.feld === "st-ust")!;
  pruefe("Bericht: gueltiger Beleg bleibt, Verstoss mit Nachweis (Betriebsdaten + Pruefsumme)", ust.status === "verstoss" && ust.belege.length === 1 && ust.nachweise[0]?.hash.length === 64);
  const lohn = bericht.befunde.find((b) => b.feld === "st-lohn")!;
  pruefe("Bericht: Feld ohne Betriebsdatenquelle ist nur ein Hinweis (ohneDaten)", lohn.status === "hinweis" && lohn.ohneDaten === true);
  const nrn = bericht.belege.map((b) => b.id);
  pruefe("Bericht: Belegkennungen ueber den ganzen Lauf eindeutig, nur zitierte enthalten", new Set(nrn).size === nrn.length && bericht.befunde.every((b) => b.belege.every((id) => nrn.includes(id))));
  pruefe("Bericht: Zusammenfassung und Prioritaeten vom Modell, Kennzahlen aus dem Code", bericht.zusammenfassung.includes("Luecken") && bericht.prioritaeten.length === 2 && bericht.kennzahlen.anzahl === PRUEFPUNKTE.length && bericht.kennzahlen.reife < 100);
  pruefe("Bericht: vollstaendig, ersteller, modell", bericht.vollstaendig === true && bericht.ersteller.rolle === "admin" && bericht.modell === "mock-haiku");
  pruefe("Siegel: gueltig", await siegelGueltig(bericht));
  const manipuliert = structuredClone(bericht);
  manipuliert.befunde[0]!.status = "konform";
  pruefe("Siegel: nach einer Aenderung am Befund ungueltig", !(await siegelGueltig(manipuliert)));
  const manipuliert2 = structuredClone(bericht);
  manipuliert2.kennzahlen.reife = 100;
  pruefe("Siegel: nach einer Aenderung der Reife ungueltig", !(await siegelGueltig(manipuliert2)));
  const manipuliert3 = structuredClone(bericht);
  manipuliert3.belege[0]!.text = "anderer Wortlaut";
  pruefe("Siegel: nach einer Aenderung am zitierten Gesetzestext ungueltig", !(await siegelGueltig(manipuliert3)));

  // 2. Buchhaltung: nur ihre Bereiche, Ablehnung im Bericht
  const v2: Verhalten = { zaehler: { agent: 0, synthese: 0, nachfrage: 0 } };
  const ev2: Ereignis[] = [];
  const b2 = await fuehrePruefungAus({ rolle: "buchhaltung", ersteller: { name: "B" }, bereiche: ["steuer"], abgelehnt: ["recht"], sprache: "de" }, abhaengigkeiten(v2), (e) => ev2.push(e));
  pruefe("Buchhaltung: nur Steuer laeuft, kein Agent fuer Recht", ev2.filter((e) => e.t === "agent" && e.phase === "spawn").length === 1 && b2.befunde.every((b) => b.bereich === "steuer"));
  pruefe("Buchhaltung: abgelehnter Bereich steht im Bericht und in den Hinweisen", gleich(b2.abgelehnteBereiche, ["recht"]) && b2.hinweise.some((h) => h.includes("recht")));

  // 3. Ohne Lesewerkzeuge (Rolle darf keine Betriebsdaten sehen): keine harten Aussagen
  const v3: Verhalten = { zaehler: { agent: 0, synthese: 0, nachfrage: 0 } };
  const b3 = await fuehrePruefungAus({ rolle: "betriebsleitung", ersteller: { name: "L" }, bereiche: ["risiko"], abgelehnt: [], sprache: "de" }, abhaengigkeiten(v3, { werkzeuge: {} }), () => {});
  pruefe("Ohne Lesewerkzeuge: alle Befunde nur Hinweise, ohneDaten", b3.befunde.length > 0 && b3.befunde.every((b) => b.status === "hinweis" && b3.befunde.every((x) => x.ohneDaten)));

  // 4. Wissenssuche faellt aus: kein Beleg, keine Behauptung
  const v4: Verhalten = { zaehler: { agent: 0, synthese: 0, nachfrage: 0 } };
  const b4 = await fuehrePruefungAus({ rolle: "admin", ersteller: { name: "A" }, bereiche: ["steuer"], abgelehnt: [], sprache: "de" }, abhaengigkeiten(v4, { sucheFehler: true }), () => {});
  pruefe("Wissenssuche ausgefallen: keine Verstoesse ohne Rechtsquelle, Ausfall ist im Bericht vermerkt", b4.befunde.every((b) => b.status === "hinweis") && b4.hinweise.some((h) => h.includes("nicht erreichbar")));

  // 5. Modell laesst ein Feld aus: einmal nachfragen, danach ehrlich "nicht bewertet"
  const v5: Verhalten = { zaehler: { agent: 0, synthese: 0, nachfrage: 0 }, auslassen: new Set(["st-lohn"]) };
  const b5 = await fuehrePruefungAus({ rolle: "admin", ersteller: { name: "A" }, bereiche: ["steuer"], abgelehnt: [], sprache: "de" }, abhaengigkeiten(v5), () => {});
  pruefe("Ausgelassenes Feld: der Agent wird gezielt nachgefragt", v5.zaehler.agent >= 2);
  pruefe("Ausgelassenes Feld: nach der Nachfrage ist ein Befund da, der Bericht bleibt vollstaendig", b5.befunde.some((b) => b.feld === "st-lohn") && b5.vollstaendig === true);

  // 6. Ein Bereich scheitert: die anderen laufen weiter, der Bericht sagt es
  const v6: Verhalten = { zaehler: { agent: 0, synthese: 0, nachfrage: 0 }, werfeBei: "Risiko und Sanktionen" };
  const ev6: Ereignis[] = [];
  const b6 = await fuehrePruefungAus({ rolle: "admin", ersteller: { name: "A" }, bereiche: ["steuer", "risiko"], abgelehnt: [], sprache: "de" }, abhaengigkeiten(v6), (e) => ev6.push(e));
  pruefe("Ausfall eines Agenten: Ereignis 'fehler', die anderen Bereiche liefern trotzdem", ev6.some((e) => e.t === "agent" && e.bereich === "risiko" && e.phase === "fehler") && b6.befunde.some((b) => b.bereich === "steuer"));
  pruefe("Ausfall eines Agenten: Bericht ist als unvollstaendig gekennzeichnet und nennt den Bereich", b6.vollstaendig === false && b6.hinweise.some((h) => h.includes("risiko")));

  // 7. Zusammenfassung: ein Ausreisser darf den Bericht nicht auf den Kennzahlentext zurueckwerfen
  const v7: Verhalten = { zaehler: { agent: 0, synthese: 0, nachfrage: 0 }, syntheseFehler: 1 };
  const b7 = await fuehrePruefungAus({ rolle: "admin", ersteller: { name: "A" }, bereiche: ["audit"], abgelehnt: [], sprache: "de" }, abhaengigkeiten(v7), () => {});
  pruefe("Zusammenfassung: ein kurzer Ausfall wird wiederholt, der Text kommt vom Modell", v7.zaehler.synthese === 2 && b7.zusammenfassung.includes("Luecken") && !b7.hinweise.some((h) => h.includes("ohne Modell")));
  const v8: Verhalten = { zaehler: { agent: 0, synthese: 0, nachfrage: 0 }, syntheseFehler: 5 };
  const b8 = await fuehrePruefungAus({ rolle: "admin", ersteller: { name: "A" }, bereiche: ["audit"], abgelehnt: [], sprache: "de" }, abhaengigkeiten(v8), () => {});
  pruefe("Zusammenfassung: nach zwei Fehlschlaegen der Kennzahlentext, im Bericht vermerkt", v8.zaehler.synthese === 2 && b8.zusammenfassung.includes("Pruefungsreife") && b8.hinweise.some((h) => h.includes("ohne Modell")));
  const v9: Verhalten = { zaehler: { agent: 0, synthese: 0, nachfrage: 0 }, langeZusammenfassung: true };
  const b9 = await fuehrePruefungAus({ rolle: "admin", ersteller: { name: "A" }, bereiche: ["audit"], abgelehnt: [], sprache: "de" }, abhaengigkeiten(v9), () => {});
  pruefe("Zusammenfassung: eine sehr lange Modellantwort wird gekuerzt statt verworfen", v9.zaehler.synthese === 1 && b9.zusammenfassung.length <= 910 && b9.zusammenfassung.startsWith("Der Betrieb"), String(b9.zusammenfassung.length));
}

// ---- Route -------------------------------------------------------------------------------------
const route = readFileSync("src/app/api/ki-pruefung/route.ts", "utf8");
pruefe("Route: Anmeldung, Recht ki_assistent und Pruefrecht der Rolle werden erzwungen", route.includes("nicht angemeldet") && route.includes('hasPermission(profil.role, "ki_assistent", "create")') && route.includes("darfPruefen(profil.role)"));
pruefe("Route: angefragte Bereiche werden auf die Rolle zugeschnitten", route.includes("waehleBereiche(profil.role, body.bereiche)") && route.includes("wahl.erlaubt.length === 0"));
pruefe("Route: ohne Wissensbasis wird abgelehnt (kein Audit ohne Belege)", route.includes("wissenVerfuegbar()") && route.includes("wissensbasis nicht verfuegbar"));
pruefe("Route: ein Lauf je Person, Start und Ende im Audit-Protokoll", route.includes("laufend.has(profil.id)") && route.includes("compliance_pruefung_gestartet") && route.includes("compliance_pruefung_abgeschlossen"));
pruefe("Route: Abbruch des Clients bricht den Lauf ab", route.includes("req.signal"));

ablauf()
  .catch((e) => pruefe("Ablauftests laufen durch", false, String(e instanceof Error ? e.stack : e)))
  .then(() => {
    console.log(`\nPruefungen: ${gesamt}   bestanden: ${gesamt - fehler}   fehlgeschlagen: ${fehler}`);
    if (fehler > 0) process.exit(1);
    console.log("Alle Pruefungen bestanden.");
  });
