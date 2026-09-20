import { generateText, stepCountIs, streamText, tool, type LanguageModel } from "ai";
import { z } from "zod";
import type { Role } from "@/lib/rbac";
import { befundEingabe, kennzahlen, massnahmenplan, pruefeBefund, sha256Hex, siegelFuer, sortiereBefunde } from "@/lib/pruefung/befund";
import { punkteFuer, type Pruefpunkt } from "@/lib/pruefung/felder";
import type { Pruefbereich } from "@/lib/pruefung/rollen";
import type { Befund, Bericht, Ereignis, Nachweis } from "@/lib/pruefung/typen";
import type { Beleg, SuchErgebnis } from "@/lib/wissen/suche";

// Die Pruefung als Zusammenspiel: Himbi plant, je Bereich entsteht ein "Mini-Himbi" (ein eigener
// Modellaufruf mit eigenem Auftrag), alle laufen gleichzeitig, melden ihre Befunde und sind danach
// fertig. Am Ende fuehrt Himbi zusammen.
//
// Was NICHT dem Modell ueberlassen wird (Audit-Festigkeit):
//   * WAS geprueft wird (felder.ts), damit jeder Lauf dieselben Punkte abdeckt
//   * das Zusammentragen der Betriebsdaten (die Lesewerkzeuge der Rolle, direkt aufgerufen)
//   * die Wissenssuche (je Pruefungsfeld, mit russischen Fachbegriffen): die Suche "muss" nicht
//     erst vom Modell gewollt werden
//   * ob ein Befund gilt (befund.ts): ohne Rechtsbeleg aus DIESEM Feld und ohne Betriebsdaten wird
//     ein Verstoss zum Hinweis herabgestuft
//   * Kennzahlen, Massnahmenplan, Siegel
// Dem Modell bleibt, was es gut kann: die Daten gegen die Rechtstexte lesen und Klartext schreiben.

export interface LaufAnfrage {
  rolle: Role;
  ersteller: { name: string };
  bereiche: Pruefbereich[];
  abgelehnt: Pruefbereich[];
  sprache: string;
}

export interface LaufAbhaengigkeiten {
  modell: LanguageModel;
  modellName: string;
  /** Lesewerkzeuge der Rolle (baueWerkzeuge): was fehlt, darf die Rolle nicht sehen. */
  werkzeuge: Record<string, unknown>;
  suche: (fragen: { frage: string; frageRussisch: string }, rolle: Role, opts: { limit: number }) => Promise<SuchErgebnis>;
  jetzt?: () => Date;
  neueId?: () => string;
}

const SPRACHEN: Record<string, string> = { de: "German", en: "English", ru: "Russian", kk: "Kazakh", tr: "Turkish" };
const BEREICHSNAME: Record<Pruefbereich, string> = { audit: "Audit und Pruefungsbereitschaft", steuer: "Steuern", recht: "Recht (Arbeits- und Datenschutzrecht)", risiko: "Risiko und Sanktionen" };
const MAX_BELEGE_JE_FELD = 4;
const MAX_AUSZUG = 900;

const kurz = (text: string, max: number) => (text.length > max ? `${text.slice(0, max).trimEnd()} ...` : text);

interface Feldstand {
  punkt: Pruefpunkt;
  nachweise: Nachweis[];
  faktenText: string;
  belege: Beleg[];
  rechtFehler: string | null;
}

export function systemPrompt(bereich: Pruefbereich, rolle: Role, sprache: string): string {
  const name = SPRACHEN[sprache] ?? SPRACHEN.de;
  return [
    `Du bist ein Pruefer fuer den Bereich "${BEREICHSNAME[bereich]}" in einer Compliance-Pruefung eines Himbeerbetriebs in Kasachstan. Die Pruefung wurde von der Rolle "${rolle}" ausgeloest.`,
    "Du bewertest Pruefungsfelder anhand von (1) BETRIEBSDATEN aus der Datenbank und (2) RECHTSQUELLEN aus der Wissensbasis. Beides wurde bereits fuer dich zusammengetragen, du suchst nichts selbst.",
    "REGELN",
    "1. Rufe fuer JEDES Pruefungsfeld genau einmal befundMelden auf, in der Reihenfolge der Liste. Schreibe darueber hinaus keinen Text.",
    '2. status: "verstoss" = die Betriebsdaten zeigen einen Verstoss oder eine ueberfaellige Pflicht. "luecke" = eine Pflicht ist nicht nachgewiesen oder die Daten sind unvollstaendig. "konform" = Betriebsdaten und Recht zeigen, dass die Pflicht erfuellt ist. "hinweis" = nicht beurteilbar (keine Betriebsdaten oder keine eindeutige Rechtsquelle).',
    "3. Jede rechtliche Aussage stuetzt sich auf Rechtsquellen: nenne ihre Kennungen (zum Beispiel S12) im Feld belege, ausschliesslich aus DIESEM Pruefungsfeld. Erfinde nie Kennungen, Artikel, Zahlen, Betraege oder Fristen. Ist eine Quelle nur Fachquelle (Stufe 4 oder 5), sage im Befund, dass die Primaerquelle zu pruefen ist.",
    "4. befund: zwei bis vier Saetze. Zuerst, was die Betriebsdaten zeigen (mit Zahlen), dann die Norm im Klartext (zum Beispiel 'НК РК ст. 101') und was daraus folgt. Russischen Wortlaut nur kurz zitieren und uebersetzen.",
    "5. massnahmen nur bei verstoss oder luecke, hoechstens drei: konkret (was genau), verantwortlich (admin, betriebsleitung, buchhaltung oder brigade), frist (sofort, 7 Tage, 30 Tage oder 90 Tage). Nur Schritte, die sich aus Daten und Rechtsquellen ergeben.",
    '6. Sei streng und ehrlich: lieber "hinweis" als eine Behauptung ohne Grundlage. Eine Pruefung ist nur so viel wert, wie sie belegt ist.',
    `LANGUAGE: Write titel, befund and massnahmen in ${name}.`,
  ].join("\n");
}

export function agentPrompt(felder: Feldstand[]): string {
  return felder
    .map((f) => {
      const daten = f.faktenText ? f.faktenText : "NICHT VERFUEGBAR (fuer diese Rolle liegen zu diesem Feld keine Betriebsdaten vor)";
      const recht = f.belege.length
        ? f.belege.map((b) => `[${b.id}] ${b.fundstelle} | Stufe ${b.stufe ?? "?"} | Stand ${b.gueltigAb ?? b.abgerufenAm ?? "?"}\n${kurz(b.text.replace(/\s+/g, " "), MAX_AUSZUG)}`).join("\n\n")
        : `KEINE TREFFER${f.rechtFehler ? ` (${f.rechtFehler})` : ""}`;
      return `=== PRUEFUNGSFELD ${f.punkt.id}: ${f.punkt.titel}\nFrage: ${f.punkt.frage}\n\nBETRIEBSDATEN:\n${daten}\n\nRECHTSQUELLEN:\n${recht}`;
    })
    .join("\n\n");
}

async function fuehreAus(werkzeug: unknown): Promise<unknown> {
  const t = werkzeug as { execute?: (i: unknown, o: unknown) => unknown } | undefined;
  if (!t?.execute) return undefined;
  return await t.execute({}, { toolCallId: "pruefung", messages: [] });
}

async function sammle(punkt: Pruefpunkt, dep: LaufAbhaengigkeiten, rolle: Role, belegNr: { n: number }): Promise<Feldstand> {
  const nachweise: Nachweis[] = [];
  const teile: string[] = [];
  const [fakten, recht] = await Promise.all([
    Promise.all(
      punkt.fakten.map(async (quelle) => {
        try {
          const ergebnis = await fuehreAus(dep.werkzeuge[quelle]);
          return ergebnis === undefined ? null : { quelle, roh: JSON.stringify(ergebnis) };
        } catch {
          return null;
        }
      }),
    ),
    dep
      .suche({ frage: punkt.frage, frageRussisch: punkt.russisch }, rolle, { limit: MAX_BELEGE_JE_FELD })
      .then((r) => ({ belege: r.belege, fehler: null as string | null }))
      .catch((e: unknown) => ({ belege: [] as Beleg[], fehler: String(e instanceof Error ? e.message : e).slice(0, 120) })),
  ]);
  for (const f of fakten) {
    if (!f) continue;
    nachweise.push({ quelle: f.quelle, daten: kurz(f.roh, 600), hash: await sha256Hex(f.roh) });
    teile.push(`(${f.quelle}) ${kurz(f.roh, 3500)}`);
  }
  // Kennungen ueber den ganzen Lauf eindeutig, damit ein Zitat im Bericht nie zwei Quellen meinen kann.
  const belege = recht.belege.map((b) => ({ ...b, id: `S${++belegNr.n}` }));
  return { punkt, nachweise, faktenText: teile.join("\n"), belege, rechtFehler: recht.fehler };
}

export async function fuehrePruefungAus(
  anfrage: LaufAnfrage,
  dep: LaufAbhaengigkeiten,
  emit: (e: Ereignis) => void,
  signal?: AbortSignal,
): Promise<Bericht> {
  const jetzt = dep.jetzt ?? (() => new Date());
  const id = (dep.neueId ?? (() => globalThis.crypto.randomUUID()))();
  const belegNr = { n: 0 };
  const alleFelder = new Map<string, Feldstand>();
  const hinweise: string[] = [];

  emit({
    t: "start",
    id,
    rolle: anfrage.rolle,
    agenten: anfrage.bereiche.map((bereich) => ({ bereich, felder: punkteFuer(bereich).map((p) => ({ id: p.id, titel: p.titel })) })),
    abgelehnt: anfrage.abgelehnt,
  });

  const laufeAgent = async (bereich: Pruefbereich, verzoegerungMs: number): Promise<{ befunde: Befund[]; vollstaendig: boolean }> => {
    if (verzoegerungMs) await new Promise((r) => setTimeout(r, verzoegerungMs));
    emit({ t: "agent", bereich, phase: "spawn" });
    const punkte = punkteFuer(bereich);
    const befunde = new Map<string, Befund>();
    let vollstaendig = true;
    try {
      emit({ t: "agent", bereich, phase: "sammelt" });
      const stand = await Promise.all(
        punkte.map(async (p) => {
          const s = await sammle(p, dep, anfrage.rolle, belegNr);
          alleFelder.set(p.id, s);
          emit({ t: "feld", bereich, feld: p.id, phase: "fakten", anzahl: s.nachweise.length, text: s.nachweise.map((n) => n.quelle).join(", ") });
          emit({ t: "feld", bereich, feld: p.id, phase: "recht", anzahl: s.belege.length, text: s.belege[0]?.fundstelle });
          if (s.rechtFehler) hinweise.push(`${p.titel}: Wissenssuche nicht erreichbar (${s.rechtFehler})`);
          return s;
        }),
      );
      emit({ t: "agent", bereich, phase: "denkt" });

      const bewerte = async (offen: Feldstand[]) => {
        const werkzeug = tool({
          description: "Meldet den Befund zu genau einem Pruefungsfeld.",
          inputSchema: befundEingabe,
          execute: async (eingabe) => {
            const s = offen.find((f) => f.punkt.id === eingabe.feld);
            if (!s) return { fehler: `Unbekanntes Pruefungsfeld ${eingabe.feld}` };
            if (befunde.has(s.punkt.id)) return { fehler: `Zu ${s.punkt.id} wurde bereits ein Befund gemeldet` };
            const b = pruefeBefund(eingabe, {
              id: `${s.punkt.id}`,
              bereich,
              gueltigeBelege: new Set(s.belege.map((x) => x.id)),
              nachweise: s.nachweise,
              hatDaten: s.nachweise.length > 0,
            });
            befunde.set(s.punkt.id, b);
            emit({ t: "befund", befund: b });
            emit({ t: "feld", bereich, feld: s.punkt.id, phase: "bewertet" });
            return { ok: true };
          },
        });
        const r = streamText({
          model: dep.modell,
          system: systemPrompt(bereich, anfrage.rolle, anfrage.sprache),
          prompt: agentPrompt(offen),
          tools: { befundMelden: werkzeug },
          toolChoice: "required",
          // Ein Schritt genuegt: die Befunde kommen als Werkzeugaufrufe, danach gibt es nichts zu sagen.
          stopWhen: stepCountIs(1),
          temperature: 0,
          maxOutputTokens: 4000,
          abortSignal: signal,
        });
        for await (const teil of r.fullStream) {
          if (teil.type === "error") throw teil.error instanceof Error ? teil.error : new Error(String(teil.error));
        }
      };

      // Ein Modell kann ein Feld auslassen oder gar keinen Werkzeugaufruf liefern (das SDK meldet dann eine
      // Verletzung von toolChoice). Beides ist kein Grund, den ganzen Bereich zu verwerfen: einmal gezielt
      // nachfragen, danach ehrlich als "nicht bewertet" fuehren. Erst wenn GAR NICHTS gelang, gilt der Agent als ausgefallen.
      let letzterFehler: unknown = null;
      try {
        await bewerte(stand);
      } catch (e) {
        if (signal?.aborted) throw e;
        letzterFehler = e;
      }
      const fehlend = stand.filter((s) => !befunde.has(s.punkt.id));
      if (fehlend.length > 0 && !signal?.aborted) {
        try {
          await bewerte(fehlend);
        } catch (e) {
          letzterFehler = e;
        }
      }
      if (befunde.size === 0 && letzterFehler) throw letzterFehler;
      for (const s of stand) {
        if (befunde.has(s.punkt.id)) continue;
        vollstaendig = false;
        const b: Befund = {
          id: s.punkt.id,
          bereich,
          feld: s.punkt.id,
          titel: s.punkt.titel,
          status: "hinweis",
          schwere: "niedrig",
          befund: "Fuer dieses Pruefungsfeld liegt keine belastbare Bewertung vor. Bitte manuell pruefen.",
          belege: [],
          nachweise: s.nachweise,
          massnahmen: [],
          ohneRechtsbeleg: true,
          ...(s.nachweise.length === 0 ? { ohneDaten: true } : {}),
        };
        befunde.set(s.punkt.id, b);
        emit({ t: "befund", befund: b });
        hinweise.push(`${s.punkt.titel}: nicht bewertet`);
      }
      emit({ t: "agent", bereich, phase: "fertig" });
    } catch (e) {
      vollstaendig = false;
      const text = String(e instanceof Error ? e.message : e).slice(0, 160);
      hinweise.push(`Bereich ${bereich} nicht abgeschlossen: ${text}`);
      emit({ t: "agent", bereich, phase: "fehler", text });
    }
    return { befunde: [...befunde.values()], vollstaendig };
  };

  const ergebnisse = await Promise.all(anfrage.bereiche.map((b, i) => laufeAgent(b, i * 350)));
  const befunde = sortiereBefunde(ergebnisse.flatMap((e) => e.befunde));
  const vollstaendig = ergebnisse.every((e) => e.vollstaendig) && anfrage.bereiche.length > 0;
  if (anfrage.abgelehnt.length > 0) hinweise.push(`Nicht freigegeben fuer die Rolle ${anfrage.rolle} und daher nicht geprueft: ${anfrage.abgelehnt.join(", ")}`);

  // ---- Zusammenfuehren -------------------------------------------------------------------------
  emit({ t: "synthese", phase: "start" });
  const kz = kennzahlen(befunde);
  let zusammenfassung = "";
  let prioritaeten: string[] = [];
  // Zwei Versuche: ein einzelner Ausreisser des Modells (zu lange Zusammenfassung, kurzer Ausfall) darf den
  // Bericht nicht auf den Kennzahlentext zurueckwerfen. Die Grenzen im Schema sind grosszuegig, die Kuerze
  // kommt aus dem Prompt und aus dem Kuerzen danach; ein Fehler wird protokolliert, nicht verschluckt.
  const liste = befunde.map((b) => `- [${b.status}/${b.schwere}] ${b.titel}: ${kurz(b.befund, 220)}`).join("\n");
  const sprache = SPRACHEN[anfrage.sprache] ?? SPRACHEN.de;
  for (let versuch = 1; versuch <= 2 && !zusammenfassung && !signal?.aborted; versuch++) {
    try {
      const ergebnis: { wert: { zusammenfassung: string; prioritaeten: string[] } | null } = { wert: null };
      await generateText({
        model: dep.modell,
        system: `Du fasst eine Compliance-Pruefung fuer die Betriebsleitung zusammen. Nutze AUSSCHLIESSLICH die gelieferten Befunde, erfinde nichts. Pruefungsreife: ${kz.reife} von 100 (${kz.stufe}). Fasse dich kurz: die Zusammenfassung hoechstens 500 Zeichen, jede Prioritaet hoechstens 150 Zeichen. Schreibe in ${sprache}.`,
        prompt: liste || "Keine Befunde.",
        tools: {
          berichtAbschliessen: tool({
            description: "Liefert die Zusammenfassung und die drei wichtigsten Prioritaeten.",
            inputSchema: z.object({
              zusammenfassung: z.string().min(10).max(2000).describe("Drei bis vier Saetze: Gesamtlage, groesste Risiken, was gut ist."),
              prioritaeten: z.array(z.string().min(3).max(600)).min(1).max(5).describe("Die drei wichtigsten naechsten Schritte, dringendster zuerst."),
            }),
            execute: async (e) => {
              ergebnis.wert = e;
              return { ok: true };
            },
          }),
        },
        toolChoice: { type: "tool", toolName: "berichtAbschliessen" },
        stopWhen: stepCountIs(1),
        temperature: 0,
        maxOutputTokens: 1200,
        abortSignal: signal,
      });
      if (ergebnis.wert) {
        zusammenfassung = kurz(ergebnis.wert.zusammenfassung, 900);
        prioritaeten = ergebnis.wert.prioritaeten.slice(0, 3).map((p) => kurz(p, 260));
      }
    } catch (e) {
      console.warn(`[damicon] Pruefung: Zusammenfassung, Versuch ${versuch} fehlgeschlagen:`, e instanceof Error ? e.message : e);
    }
  }
  if (!zusammenfassung) {
    zusammenfassung = `${kz.anzahl} Pruefungsfelder bewertet: ${kz.nachStatus.verstoss} Verstoesse, ${kz.nachStatus.luecke} Luecken, ${kz.nachStatus.hinweis} Hinweise, ${kz.nachStatus.konform} konform. Pruefungsreife ${kz.reife} von 100.`;
    prioritaeten = massnahmenplan(befunde).slice(0, 3).map((m) => m.schritt);
    hinweise.push("Die Zusammenfassung wurde ohne Modell aus den Kennzahlen erstellt.");
  }
  emit({ t: "synthese", phase: "fertig" });

  const zitiert = new Set(befunde.flatMap((b) => b.belege));
  const belege = [...alleFelder.values()].flatMap((f) => f.belege).filter((b) => zitiert.has(b.id));
  const ohneSiegel: Omit<Bericht, "siegel"> = {
    id,
    erstelltAm: jetzt().toISOString(),
    ersteller: { name: anfrage.ersteller.name, rolle: anfrage.rolle },
    bereiche: anfrage.bereiche,
    abgelehnteBereiche: anfrage.abgelehnt,
    modell: dep.modellName,
    sprache: anfrage.sprache,
    kennzahlen: kz,
    zusammenfassung,
    prioritaeten,
    befunde,
    belege,
    massnahmen: massnahmenplan(befunde),
    vollstaendig,
    hinweise,
  };
  return { ...ohneSiegel, siegel: await siegelFuer(ohneSiegel) };
}
