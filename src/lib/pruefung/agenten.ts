import { generateText, stepCountIs, streamText, tool, type LanguageModel } from "ai";
import { z } from "zod";
import type { Role } from "@/lib/rbac";
import { befundEingabe, kennzahlen, massnahmenplan, pruefeBefund, sha256Hex, siegelFuer, sortiereBefunde } from "@/lib/pruefung/befund";
import { punkteFuer, type Pruefpunkt } from "@/lib/pruefung/felder";
import { feldTitel } from "@/lib/pruefung/felder-titel";
import type { Pruefbereich } from "@/lib/pruefung/rollen";
import type { Befund, Bericht, Ereignis, Nachweis } from "@/lib/pruefung/typen";
import { fuerSprache } from "@/lib/text/umlaute";
import type { Beleg, SuchErgebnis } from "@/lib/wissen/suche";

// Die Pruefung als Zusammenspiel vieler kleiner Helfer. Himbi plant, je Bereich leitet ein Bereichs-Himbi, und JEDES
// Pruefungsfeld bekommt sein eigenes Team, das sich die Arbeit uebergibt:
//
//   Sammler  (Betriebsdaten aus der Datenbank)  \
//                                                 >-- Uebergabe --> Pruefer (eigener Modellaufruf, schreibt den Befund)
//   Jurist   (Rechtsquellen aus der Wissensbasis) /
//
// Alle Felder laufen gleichzeitig (leicht gestaffelt), jedes Team meldet seine Schritte einzeln. Am Ende fuehrt Himbi
// zusammen. Ein Ausfall betrifft nur das eigene Feld: die anderen liefern weiter.
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

const SPRACHEN: Record<string, string> = { de: "German", en: "English", ru: "Russian", kk: "Kazakh" };
const BEREICHSNAME: Record<Pruefbereich, string> = { audit: "Audit und Prüfungsbereitschaft", steuer: "Steuern", recht: "Recht (Arbeits- und Datenschutzrecht)", risiko: "Risiko und Sanktionen" };
const MAX_BELEGE_JE_FELD = 4;
const MAX_AUSZUG = 900;
/** Abstand, in dem die Feld-Teams eines Bereichs und die Bereiche selbst losgeschickt werden: sichtbar nacheinander, technisch gleichzeitig. */
const STAFFEL_FELD_MS = 130;
const STAFFEL_BEREICH_MS = 350;

const kurz = (text: string, max: number) => (text.length > max ? `${text.slice(0, max).trimEnd()} ...` : text);

// Feste Saetze des Berichts in der Sprache des Berichts: ein englischer oder russischer Bericht enthaelt kein deutsches Wort,
// das nicht ausdruecklich ein Eigenname oder Zitat ist.
interface Texte {
  keineBewertung: string;
  sucheFehler: (titel: string, grund: string) => string;
  nichtBewertet: (titel: string) => string;
  bereichFehler: (bereich: string, grund: string) => string;
  abgelehnt: (rolle: string, liste: string) => string;
  ohneModell: string;
  zusammenfassung: (z: { anzahl: number; verstoss: number; luecke: number; hinweis: number; konform: number; reife: number }) => string;
}

const TEXTE: Record<string, Texte> = {
  de: {
    keineBewertung: "Für dieses Prüfungsfeld liegt keine belastbare Bewertung vor. Bitte manuell prüfen.",
    sucheFehler: (t, g) => `${t}: Wissenssuche nicht erreichbar (${g})`,
    nichtBewertet: (t) => `${t}: nicht bewertet`,
    bereichFehler: (b, g) => `Bereich ${b} nicht abgeschlossen: ${g}`,
    abgelehnt: (r, l) => `Nicht freigegeben für die Rolle ${r} und daher nicht geprüft: ${l}`,
    ohneModell: "Die Zusammenfassung wurde ohne Modell aus den Kennzahlen erstellt.",
    zusammenfassung: (z) => `${z.anzahl} Prüfungsfelder bewertet: ${z.verstoss} Verstöße, ${z.luecke} Lücken, ${z.hinweis} Hinweise, ${z.konform} konform. Prüfungsreife ${z.reife} von 100.`,
  },
  en: {
    keineBewertung: "No reliable assessment is available for this audit item. Please review it manually.",
    sucheFehler: (t, g) => `${t}: knowledge base not reachable (${g})`,
    nichtBewertet: (t) => `${t}: not assessed`,
    bereichFehler: (b, g) => `Area ${b} not completed: ${g}`,
    abgelehnt: (r, l) => `Not released for the role ${r} and therefore not audited: ${l}`,
    ohneModell: "The summary was generated from the key figures without the language model.",
    zusammenfassung: (z) => `${z.anzahl} audit items assessed: ${z.verstoss} violations, ${z.luecke} gaps, ${z.hinweis} notes, ${z.konform} compliant. Audit readiness ${z.reife} of 100.`,
  },
  ru: {
    keineBewertung: "По этому пункту проверки нет надёжной оценки. Проверьте его вручную.",
    sucheFehler: (t, g) => `${t}: база знаний недоступна (${g})`,
    nichtBewertet: (t) => `${t}: не оценено`,
    bereichFehler: (b, g) => `Раздел ${b} не завершён: ${g}`,
    abgelehnt: (r, l) => `Не разрешено для роли ${r}, поэтому не проверялось: ${l}`,
    ohneModell: "Резюме составлено по показателям без языковой модели.",
    zusammenfassung: (z) => `Оценено пунктов проверки: ${z.anzahl}. Нарушений: ${z.verstoss}, пробелов: ${z.luecke}, замечаний: ${z.hinweis}, соответствует: ${z.konform}. Готовность к проверке ${z.reife} из 100.`,
  },
  kk: {
    keineBewertung: "Бұл тексеру тармағы бойынша сенімді баға жоқ. Оны қолмен тексеріңіз.",
    sucheFehler: (t, g) => `${t}: білім қорына қол жеткізу мүмкін емес (${g})`,
    nichtBewertet: (t) => `${t}: бағаланбады`,
    bereichFehler: (b, g) => `${b} бөлімі аяқталмады: ${g}`,
    abgelehnt: (r, l) => `${r} рөлі үшін рұқсат етілмеген, сондықтан тексерілмеді: ${l}`,
    ohneModell: "Қорытынды тілдік модельсіз көрсеткіштер бойынша жасалды.",
    zusammenfassung: (z) => `Тексеру тармақтары бағаланды: ${z.anzahl}. Бұзушылықтар: ${z.verstoss}, олқылықтар: ${z.luecke}, ескертпелер: ${z.hinweis}, сәйкес: ${z.konform}. Тексеруге дайындық ${z.reife} / 100.`,
  },
};
const texte = (sprache: string): Texte => TEXTE[sprache] ?? TEXTE.de!;

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
    `Du bist ein Prüfer für den Bereich "${BEREICHSNAME[bereich]}" in einer Compliance-Prüfung eines Himbeerbetriebs in Kasachstan. Die Prüfung wurde von der Rolle "${rolle}" ausgelöst.`,
    "Du bewertest Prüfungsfelder anhand von (1) BETRIEBSDATEN aus der Datenbank und (2) RECHTSQUELLEN aus der Wissensbasis. Beides wurde bereits für dich zusammengetragen, du suchst nichts selbst.",
    "REGELN",
    "1. Rufe für JEDES Prüfungsfeld genau einmal befundMelden auf, in der Reihenfolge der Liste. Schreibe darüber hinaus keinen Text.",
    '2. status: "verstoss" = die Betriebsdaten zeigen einen Verstoß oder eine überfällige Pflicht. "luecke" = eine Pflicht ist nicht nachgewiesen oder die Daten sind unvollständig. "konform" = Betriebsdaten und Recht zeigen, dass die Pflicht erfüllt ist. "hinweis" = nicht beurteilbar (keine Betriebsdaten oder keine eindeutige Rechtsquelle).',
    "3. Jede rechtliche Aussage stützt sich auf Rechtsquellen: nenne ihre Kennungen (zum Beispiel S12) im Feld belege, ausschließlich aus DIESEM Prüfungsfeld. Erfinde nie Kennungen, Artikel, Zahlen, Beträge oder Fristen. Ist eine Quelle nur Fachquelle (Stufe 4 oder 5), sage im Befund, dass die Primärquelle zu prüfen ist.",
    "4. befund: zwei bis vier Sätze. Zuerst, was die Betriebsdaten zeigen (mit Zahlen), dann die Norm im Klartext (zum Beispiel 'НК РК ст. 101') und was daraus folgt. Russischen Wortlaut nur kurz zitieren und übersetzen.",
    "5. massnahmen nur bei verstoss oder luecke, höchstens drei: konkret (was genau), verantwortlich (admin, betriebsleitung, buchhaltung oder brigade), frist (sofort, 7 Tage, 30 Tage oder 90 Tage). Nur Schritte, die sich aus Daten und Rechtsquellen ergeben.",
    '6. Sei streng und ehrlich: lieber "hinweis" als eine Behauptung ohne Grundlage. Eine Prüfung ist nur so viel wert, wie sie belegt ist.',
    `LANGUAGE: Write titel, befund and massnahmen ONLY in ${name}, consistently and without mixing languages. Legal citations, article numbers and short quotes of the original Russian wording may stay as they are.${
      sprache === "de" ? " Use correct German spelling with real umlauts (ä, ö, ü) and ß; never write ae, oe, ue or ss in their place." : ""
    }`,
  ].join("\n");
}

export function agentPrompt(felder: Feldstand[]): string {
  return felder
    .map((f) => {
      const daten = f.faktenText ? f.faktenText : "NICHT VERFÜGBAR (für diese Rolle liegen zu diesem Feld keine Betriebsdaten vor)";
      const recht = f.belege.length
        ? f.belege.map((b) => `[${b.id}] ${b.fundstelle} | Stufe ${b.stufe ?? "?"} | Stand ${b.gueltigAb ?? b.abgerufenAm ?? "?"}\n${kurz(b.text.replace(/\s+/g, " "), MAX_AUSZUG)}`).join("\n\n")
        : `KEINE TREFFER${f.rechtFehler ? ` (${f.rechtFehler})` : ""}`;
      return `=== PRÜFUNGSFELD ${f.punkt.id}: ${f.punkt.titel}\nFrage: ${f.punkt.frage}\n\nBETRIEBSDATEN:\n${daten}\n\nRECHTSQUELLEN:\n${recht}`;
    })
    .join("\n\n");
}

async function fuehreAus(werkzeug: unknown): Promise<unknown> {
  const t = werkzeug as { execute?: (i: unknown, o: unknown) => unknown } | undefined;
  if (!t?.execute) return undefined;
  return await t.execute({}, { toolCallId: "pruefung", messages: [] });
}

interface SammelMeldung {
  fakten: (nachweise: Nachweis[]) => void;
  recht: (belege: Beleg[]) => void;
}

/** Sammler und Jurist arbeiten gleichzeitig und melden jeder für sich, sobald sie fertig sind. */
async function sammle(punkt: Pruefpunkt, dep: LaufAbhaengigkeiten, rolle: Role, belegNr: { n: number }, meldung: SammelMeldung, schreibweise: (text: string) => string): Promise<Feldstand> {
  const sammler = Promise.all(
    punkt.fakten.map(async (quelle) => {
      try {
        const ergebnis = await fuehreAus(dep.werkzeuge[quelle]);
        return ergebnis === undefined ? null : { quelle, roh: JSON.stringify(ergebnis) };
      } catch {
        return null;
      }
    }),
  ).then(async (fakten) => {
    const nachweise: Nachweis[] = [];
    const teile: string[] = [];
    for (const f of fakten) {
      if (!f) continue;
      nachweise.push({ quelle: f.quelle, daten: kurz(f.roh, 600), hash: await sha256Hex(f.roh) });
      teile.push(`(${f.quelle}) ${kurz(f.roh, 3500)}`);
    }
    meldung.fakten(nachweise);
    return { nachweise, faktenText: teile.join("\n") };
  });
  const jurist = dep
    .suche({ frage: punkt.frage, frageRussisch: punkt.russisch }, rolle, { limit: MAX_BELEGE_JE_FELD })
    .then((r) => ({ belege: r.belege, fehler: null as string | null }))
    .catch((e: unknown) => ({ belege: [] as Beleg[], fehler: String(e instanceof Error ? e.message : e).slice(0, 120) }))
    .then((r) => {
      // Kennungen über den ganzen Lauf eindeutig, damit ein Zitat im Bericht nie zwei Quellen meinen kann.
      // Titel und Fundstelle sind Beschriftungen und werden in der Schreibweise des Berichts gezeigt (die Wissensbasis enthaelt auch
      // Quellen mit Ersatzschreibung im Titel); der Wortlaut der Rechtstexte bleibt unveraendert.
      const belege = r.belege.map((b) => ({ ...b, id: `S${++belegNr.n}`, fundstelle: schreibweise(b.fundstelle), titel: b.titel ? schreibweise(b.titel) : b.titel }));
      meldung.recht(belege);
      return { belege, fehler: r.fehler };
    });
  const [fakten, recht] = await Promise.all([sammler, jurist]);
  return { punkt, nachweise: fakten.nachweise, faktenText: fakten.faktenText, belege: recht.belege, rechtFehler: recht.fehler };
}

const schlafe = (ms: number): Promise<void> => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

type FeldErgebnis = { art: "modell"; befund: Befund } | { art: "ausgelassen"; befund: Befund } | { art: "fehler"; fehler: unknown; stand: Feldstand | null };

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
  const T = texte(anfrage.sprache);
  // Feldtitel in der Sprache des Berichts (Ablauf, Hinweise und Ersatzbefund sprechen dieselbe Sprache wie der Rest).
  const titelVon = (p: Pruefpunkt) => feldTitel(p.id, anfrage.sprache, p.titel);
  // Was ein Modell auf Deutsch schreibt, kommt manchmal in Ersatzschreibung (ae, oe, ue); hier wird es vor dem Siegel korrigiert.
  const schreibweise = (text: string) => fuerSprache(text, anfrage.sprache);
  const bereinige = (b: Befund): Befund => ({
    ...b,
    titel: schreibweise(b.titel),
    befund: schreibweise(b.befund),
    massnahmen: b.massnahmen.map((m) => ({ ...m, schritt: schreibweise(m.schritt) })),
  });

  emit({
    t: "start",
    id,
    rolle: anfrage.rolle,
    agenten: anfrage.bereiche.map((bereich) => ({ bereich, felder: punkteFuer(bereich).map((p) => ({ id: p.id, titel: titelVon(p) })) })),
    abgelehnt: anfrage.abgelehnt,
  });

  const ersatzBefund = (bereich: Pruefbereich, punkt: Pruefpunkt, nachweise: Nachweis[]): Befund => ({
    id: punkt.id,
    bereich,
    feld: punkt.id,
    titel: titelVon(punkt),
    status: "hinweis",
    schwere: "niedrig",
    befund: T.keineBewertung,
    belege: [],
    nachweise,
    massnahmen: [],
    ohneRechtsbeleg: true,
    ...(nachweise.length === 0 ? { ohneDaten: true } : {}),
  });

  /** Das Team eines Prüfungsfelds: Sammler und Jurist parallel, Übergabe, Prüfer. */
  const laufeFeld = async (bereich: Pruefbereich, punkt: Pruefpunkt, verzoegerungMs: number, beiUebergabe: () => void): Promise<FeldErgebnis> => {
    await schlafe(verzoegerungMs);
    let stand: Feldstand | null = null;
    try {
      if (signal?.aborted) throw new Error("abgebrochen");
      emit({ t: "feld", bereich, feld: punkt.id, phase: "start" });
      stand = await sammle(punkt, dep, anfrage.rolle, belegNr, {
        fakten: (nachweise) => emit({ t: "feld", bereich, feld: punkt.id, phase: "fakten", anzahl: nachweise.length, text: nachweise.map((n) => n.quelle).join(", ") }),
        recht: (belege) => emit({ t: "feld", bereich, feld: punkt.id, phase: "recht", anzahl: belege.length, text: belege[0]?.fundstelle }),
      }, schreibweise);
      alleFelder.set(punkt.id, stand);
      if (stand.rechtFehler) hinweise.push(T.sucheFehler(titelVon(punkt), stand.rechtFehler));
      // Übergabe: beide Zuarbeiten liegen vor, der Prüfer übernimmt.
      emit({ t: "feld", bereich, feld: punkt.id, phase: "denkt" });
      beiUebergabe();

      const feld = stand;
      const gemeldet: { befund: Befund | null } = { befund: null };
      // Wird im Werkzeug gesetzt; als Funktion gelesen, damit die Typpruefung den Zustand nach dem Modellaufruf nicht als "immer null" annimmt.
      const gemeldetBefund = (): Befund | null => gemeldet.befund;
      const pruefe = async () => {
        const werkzeug = tool({
          description: "Meldet den Befund zu genau einem Prüfungsfeld.",
          inputSchema: befundEingabe,
          execute: async (eingabe) => {
            if (eingabe.feld !== feld.punkt.id) return { fehler: `Unbekanntes Prüfungsfeld ${eingabe.feld}` };
            if (gemeldet.befund) return { fehler: `Zu ${feld.punkt.id} wurde bereits ein Befund gemeldet` };
            const b = bereinige(
              pruefeBefund(eingabe, {
                id: `${feld.punkt.id}`,
                bereich,
                gueltigeBelege: new Set(feld.belege.map((x) => x.id)),
                nachweise: feld.nachweise,
                hatDaten: feld.nachweise.length > 0,
              }),
            );
            gemeldet.befund = b;
            emit({ t: "befund", befund: b });
            emit({ t: "feld", bereich, feld: feld.punkt.id, phase: "bewertet" });
            return { ok: true };
          },
        });
        const r = streamText({
          model: dep.modell,
          system: systemPrompt(bereich, anfrage.rolle, anfrage.sprache),
          prompt: agentPrompt([feld]),
          tools: { befundMelden: werkzeug },
          toolChoice: "required",
          // Ein Schritt genügt: der Befund kommt als Werkzeugaufruf, danach gibt es nichts zu sagen.
          stopWhen: stepCountIs(1),
          temperature: 0,
          maxOutputTokens: 2000,
          abortSignal: signal,
        });
        for await (const teil of r.fullStream) {
          if (teil.type === "error") throw teil.error instanceof Error ? teil.error : new Error(String(teil.error));
        }
      };

      // Ein Modell kann das Feld auslassen oder gar keinen Werkzeugaufruf liefern (das SDK meldet dann eine Verletzung von
      // toolChoice). Beides ist kein Grund, das Feld zu verwerfen: einmal gezielt nachfragen, danach ehrlich als "nicht
      // bewertet" führen. Nur wenn beide Versuche mit einem Fehler enden, gilt das Team als ausgefallen.
      let letzterFehler: unknown = null;
      for (let versuch = 1; versuch <= 2 && !gemeldetBefund() && !signal?.aborted; versuch++) {
        try {
          await pruefe();
        } catch (e) {
          if (signal?.aborted) throw e;
          letzterFehler = e;
        }
      }
      const fertig = gemeldetBefund();
      if (fertig) return { art: "modell", befund: fertig };
      if (letzterFehler) return { art: "fehler", fehler: letzterFehler, stand };
      const b = ersatzBefund(bereich, punkt, feld.nachweise);
      emit({ t: "befund", befund: b });
      emit({ t: "feld", bereich, feld: punkt.id, phase: "bewertet" });
      hinweise.push(T.nichtBewertet(titelVon(punkt)));
      return { art: "ausgelassen", befund: b };
    } catch (e) {
      if (signal?.aborted) throw e;
      return { art: "fehler", fehler: e, stand };
    }
  };

  const laufeAgent = async (bereich: Pruefbereich, verzoegerungMs: number): Promise<{ befunde: Befund[]; vollstaendig: boolean }> => {
    await schlafe(verzoegerungMs);
    emit({ t: "agent", bereich, phase: "spawn" });
    const punkte = punkteFuer(bereich);
    let denktGemeldet = false;
    const beiUebergabe = () => {
      if (denktGemeldet) return;
      denktGemeldet = true;
      emit({ t: "agent", bereich, phase: "denkt" });
    };
    try {
      emit({ t: "agent", bereich, phase: "sammelt" });
      const ergebnisse = await Promise.all(punkte.map((p, i) => laufeFeld(bereich, p, i * STAFFEL_FELD_MS, beiUebergabe)));
      const fehlgeschlagen = ergebnisse.filter((r): r is Extract<FeldErgebnis, { art: "fehler" }> => r.art === "fehler");
      // Nur wenn GAR NICHTS gelang, gilt der Bereich als ausgefallen (Modell nicht erreichbar, Guthaben leer ...).
      if (fehlgeschlagen.length === ergebnisse.length && fehlgeschlagen.length > 0) throw fehlgeschlagen[0]!.fehler;
      const befunde: Befund[] = [];
      let vollstaendig = true;
      ergebnisse.forEach((r, i) => {
        if (r.art === "modell") {
          befunde.push(r.befund);
          return;
        }
        vollstaendig = false;
        if (r.art === "ausgelassen") {
          befunde.push(r.befund);
          return;
        }
        // Ausgefallenes Team in einem sonst gelungenen Bereich: ehrlich als "nicht bewertet" führen.
        const p = punkte[i]!;
        const b = ersatzBefund(bereich, p, r.stand?.nachweise ?? []);
        befunde.push(b);
        emit({ t: "befund", befund: b });
        emit({ t: "feld", bereich, feld: p.id, phase: "bewertet" });
        hinweise.push(T.nichtBewertet(titelVon(p)));
      });
      emit({ t: "agent", bereich, phase: "fertig" });
      return { befunde, vollstaendig };
    } catch (e) {
      if (signal?.aborted) throw e;
      const text = String(e instanceof Error ? e.message : e).slice(0, 160);
      hinweise.push(T.bereichFehler(bereich, text));
      emit({ t: "agent", bereich, phase: "fehler", text });
      return { befunde: [], vollstaendig: false };
    }
  };

  const ergebnisse = await Promise.all(anfrage.bereiche.map((b, i) => laufeAgent(b, i * STAFFEL_BEREICH_MS)));
  const befunde = sortiereBefunde(ergebnisse.flatMap((e) => e.befunde));
  const vollstaendig = ergebnisse.every((e) => e.vollstaendig) && anfrage.bereiche.length > 0;
  if (anfrage.abgelehnt.length > 0) hinweise.push(T.abgelehnt(anfrage.rolle, anfrage.abgelehnt.join(", ")));

  // ---- Zusammenführen -------------------------------------------------------------------------
  emit({ t: "synthese", phase: "start" });
  const kz = kennzahlen(befunde);
  let zusammenfassung = "";
  let prioritaeten: string[] = [];
  // Zwei Versuche: ein einzelner Ausreißer des Modells (zu lange Zusammenfassung, kurzer Ausfall) darf den
  // Bericht nicht auf den Kennzahlentext zurückwerfen. Die Grenzen im Schema sind großzügig, die Kürze
  // kommt aus dem Prompt und aus dem Kürzen danach; ein Fehler wird protokolliert, nicht verschluckt.
  const liste = befunde.map((b) => `- [${b.status}/${b.schwere}] ${b.titel}: ${kurz(b.befund, 220)}`).join("\n");
  const sprache = SPRACHEN[anfrage.sprache] ?? SPRACHEN.de;
  for (let versuch = 1; versuch <= 2 && !zusammenfassung && !signal?.aborted; versuch++) {
    try {
      const ergebnis: { wert: { zusammenfassung: string; prioritaeten: string[] } | null } = { wert: null };
      await generateText({
        model: dep.modell,
        system: `Du fasst eine Compliance-Prüfung für die Betriebsleitung zusammen. Nutze AUSSCHLIESSLICH die gelieferten Befunde, erfinde nichts. Prüfungsreife: ${kz.reife} von 100 (${kz.stufe}). Fasse dich kurz: die Zusammenfassung höchstens 500 Zeichen, jede Priorität höchstens 150 Zeichen. Schreibe ausschließlich in ${sprache}, ohne Sprachen zu mischen.${
          anfrage.sprache === "de" ? " Verwende die richtige deutsche Schreibweise mit Umlauten (ä, ö, ü) und ß, nie ae, oe oder ue." : ""
        }`,
        prompt: liste || "Keine Befunde.",
        tools: {
          berichtAbschliessen: tool({
            description: "Liefert die Zusammenfassung und die drei wichtigsten Prioritäten.",
            inputSchema: z.object({
              zusammenfassung: z.string().min(10).max(2000).describe("Drei bis vier Sätze: Gesamtlage, größte Risiken, was gut ist."),
              prioritaeten: z.array(z.string().min(3).max(600)).min(1).max(5).describe("Die drei wichtigsten nächsten Schritte, dringendster zuerst."),
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
        zusammenfassung = schreibweise(kurz(ergebnis.wert.zusammenfassung, 900));
        prioritaeten = ergebnis.wert.prioritaeten.slice(0, 3).map((p) => schreibweise(kurz(p, 260)));
      }
    } catch (e) {
      console.warn(`[damicon] Prüfung: Zusammenfassung, Versuch ${versuch} fehlgeschlagen:`, e instanceof Error ? e.message : e);
    }
  }
  if (!zusammenfassung) {
    zusammenfassung = T.zusammenfassung({ anzahl: kz.anzahl, verstoss: kz.nachStatus.verstoss, luecke: kz.nachStatus.luecke, hinweis: kz.nachStatus.hinweis, konform: kz.nachStatus.konform, reife: kz.reife });
    prioritaeten = massnahmenplan(befunde).slice(0, 3).map((m) => m.schritt);
    hinweise.push(T.ohneModell);
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
