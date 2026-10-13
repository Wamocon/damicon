// Tests fuer fehlende Scanseiten: bestaetigen, nachladen, einreihen (ohne Datenbank, ohne Netz):
//   * seiten-bestaetigung.ts: Kurzform zuruecklesen, Seitenzahlen lesen, Abdeckung der Luecken (genau und unscharf), offener Stand
//   * seiten-orte.ts: wo im Buchtext (Paket, Promille) liegt eine Luecke
//   * nachtrag-zuordnung.ts: Seiten einer Nachlade-PDF den offenen Luecken zuordnen
//   * nachtrag.ts: Einfuegestelle waehlen, Nachtrag pruefen und schreiben (mit Nachbauten von Speicher und Einbettung)
//   * dokumente-liste.ts: die Liste rechnet offene Seiten aus (nachgeladen, bestaetigt)
//   * Texte: alle neuen Meldungen gibt es in allen vier Sprachen
// Aufruf: npm run test:wissen-bestaetigung (laeuft ueber tsx, damit die @/-Pfade aufloesen).

import { readFileSync } from "node:fs";
import { bereinigeSeitentext, teileInPakete } from "@/lib/wissen/buch-text";
import { gruppiereWissenDokumente } from "@/lib/wissen/dokumente-liste";
import { UploadFehler, type ChunkZeile, type FreigabeInfo, type WissenSpeicher } from "@/lib/wissen/hochladen";
import { ladeNachtrag, waehleEinfuegestelle, type NachtragBasis, type NachtragSpeicher } from "@/lib/wissen/nachtrag";
import { ordneSeitenZu } from "@/lib/wissen/nachtrag-zuordnung";
import { alsBereichsText, leseSeitenzahlen, lueckenAusStellen, offenerStand, offeneNachNachtraegen, pruefeAbdeckung, zaehleFehlend } from "@/lib/wissen/seiten-bestaetigung";
import { ermittleOrte } from "@/lib/wissen/seiten-orte";
import { alsSeitenAngabe, beschreibeLuecken, MAX_LUECKEN_STELLEN, type SeitenLuecke, type SeitenPruefung, type SeitenRand } from "@/lib/wissen/seitenverlauf";
import type { Einbettung } from "@/lib/wissen/embed";
import { tokens } from "@/lib/wissen/sparse";

let gesamt = 0;
let fehler = 0;
function pruefe(name: string, ok: boolean, detail = "") {
  gesamt++;
  if (!ok) fehler++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
}

async function fehlerCode(f: () => Promise<unknown> | unknown): Promise<string | null> {
  try {
    await f();
    return null;
  } catch (e) {
    return e instanceof UploadFehler ? e.code : `anderer Fehler: ${e instanceof Error ? e.message : String(e)}`;
  }
}

const luecke = (nachPdfSeite: number, von: number, bis: number): SeitenLuecke => ({ nachPdfSeite, vonGedruckt: von, bisGedruckt: bis, anzahl: bis - von + 1, genau: true });
const unscharf = (nachPdfSeite: number, bisPdf: number, von: number, bis: number, anzahl: number): SeitenLuecke => ({ nachPdfSeite, vonGedruckt: von, bisGedruckt: bis, anzahl, genau: false, bisPdfSeite: bisPdf });

async function main() {
  // ---- Seitenzahlen lesen --------------------------------------------------------------------------------------------------------------
  {
    const l = (s: string) => leseSeitenzahlen(s);
    pruefe("Seitenzahlen: einzelne Zahlen und Bereiche", alsBereichsText(l("48-49, 120").seiten) === "48-49, 120" && l("48-49, 120").fehler === null);
    pruefe("Seitenzahlen: Leerzeichen, Semikolon und verschiedene Striche", alsBereichsText(l(" 48 – 49 ; 120 ").seiten) === "48-49, 120" && alsBereichsText(l("5—7 9").seiten) === "5-7, 9");
    pruefe("Seitenzahlen: Doppelte fallen weg, die Reihenfolge ist aufsteigend", alsBereichsText(l("9, 5, 5-6, 6").seiten) === "5-6, 9");
    pruefe("Seitenzahlen: leer ist keine Angabe, aber kein Fehler", l("").seiten.length === 0 && l("   ").fehler === null && leseSeitenzahlen(null).seiten.length === 0);
    pruefe("Seitenzahlen: Buchstaben und Sonderzeichen sind ungültig", l("48 bis 49").fehler === "zeichen" && l("48; DROP").fehler === "zeichen" && l("4.8").fehler === "zeichen");
    pruefe("Seitenzahlen: ein umgekehrter oder riesiger Bereich ist ungültig", l("49-48").fehler === "bereich" && l("1-99999").fehler === "bereich");
    pruefe("Seitenzahlen: Seite 0 zählt nicht", l("0, 3").seiten.join() === "3");
    pruefe("Seitenzahlen: mehr als 2000 sind zu viele", l("1-1500, 2000-2600").fehler === "zuViele");
    pruefe("Bereichstext: Folgen werden zusammengefasst", alsBereichsText([1, 2, 3, 7, 9, 10]) === "1-3, 7, 9-10" && alsBereichsText([]) === "");
  }

  // ---- Kurzform zurücklesen ------------------------------------------------------------------------------------------------------------
  {
    const l1 = [luecke(47, 48, 49), luecke(200, 168, 168), unscharf(271, 273, 276, 278, 2)];
    const text = beschreibeLuecken(l1);
    const g = lueckenAusStellen(text, "3:410,7:0,9:1000");
    pruefe("Kurzform: eine Lücke je Stelle, in der Reihenfolge des Textes", g.luecken.length === 3 && g.weitere === 0, text);
    pruefe(
      "Kurzform: genaue Lücke mit Bereich und PDF-Seite",
      g.luecken[0]!.genau && g.luecken[0]!.vonGedruckt === 48 && g.luecken[0]!.bisGedruckt === 49 && g.luecken[0]!.nachPdfSeite === 47 && g.luecken[0]!.anzahl === 2,
    );
    pruefe("Kurzform: eine einzelne Seite", g.luecken[1]!.vonGedruckt === 168 && g.luecken[1]!.bisGedruckt === 168 && g.luecken[1]!.anzahl === 1);
    pruefe(
      "Kurzform: unscharfe Lücke mit Zahl, Bereich und PDF-Spanne",
      !g.luecken[2]!.genau && g.luecken[2]!.anzahl === 2 && g.luecken[2]!.vonGedruckt === 276 && g.luecken[2]!.bisGedruckt === 278 && g.luecken[2]!.nachPdfSeite === 271 && g.luecken[2]!.bisPdfSeite === 273,
    );
    pruefe("Kurzform: die Orte (Paket und Promille) gehören zur Lücke gleicher Stelle", g.luecken[0]!.ort?.paket === 3 && g.luecken[0]!.ort?.promille === 410 && g.luecken[2]!.ort?.promille === 1000);
    pruefe("Kurzform: eine falsche Zahl von Orten wird ignoriert", lueckenAusStellen(text, "3:410").luecken.every((x) => x.ort === undefined));
    pruefe("Kurzform: die Rückkehr gibt dieselbe Beschreibung", beschreibeLuecken(g.luecken) === text);
    pruefe("Kurzform: '+N' nennt weitere, nicht einzeln bekannte Lücken", lueckenAusStellen("48-49 (47) +3").weitere === 3 && lueckenAusStellen("48-49 (47)").weitere === 0);
    pruefe("Kurzform: der ältere Fall ohne 'PDF' vor der Seite wird gelesen", lueckenAusStellen("2@105-107 (106)").luecken[0]?.anzahl === 2 && lueckenAusStellen("2@105-107 (106)").luecken[0]?.genau === false);
    pruefe("Kurzform: leer oder null ergibt nichts", lueckenAusStellen("").luecken.length === 0 && lueckenAusStellen(null).luecken.length === 0);
    pruefe("Kurzform: bis zu MAX_LUECKEN_STELLEN Lücken werden einzeln beschrieben", beschreibeLuecken(Array.from({ length: 45 }, (_, i) => luecke(10 + i, 100 + 2 * i, 100 + 2 * i))).endsWith(" +5") && MAX_LUECKEN_STELLEN === 40);
  }

  // ---- Abdeckung -----------------------------------------------------------------------------------------------------------------------
  {
    const g = lueckenAusStellen("48-49 (47), 168 (200), 2@276-278 (PDF 271-273)");
    const a = (...s: number[]) => pruefeAbdeckung(g, s);
    pruefe("Abdeckung: deckt die Angabe alles ab, ist es ok", a(48, 49, 168, 276, 278).ok && a(48, 49, 168, 276, 278).fehlendOffen === 0);
    pruefe("Abdeckung: fehlt eine Seite einer genauen Lücke, bleibt der Rest offen", !a(48, 168, 276, 277).ok && beschreibeLuecken(a(48, 168, 276, 277).offen) === "49 (47)");
    pruefe("Abdeckung: fehlt eine ganze Lücke, ist sie offen", beschreibeLuecken(a(48, 49, 276, 277).offen) === "168 (200)");
    pruefe("Abdeckung: unscharf zählt jede Seite im Bereich einmal", a(48, 49, 168, 276).fehlendOffen === 1 && a(48, 49, 168, 276).offen[0]?.anzahl === 1);
    pruefe("Abdeckung: unscharf, Seiten außerhalb des Bereichs decken nichts", a(48, 49, 168, 300, 301).fehlendOffen === 2);
    pruefe("Abdeckung: unscharf, mehr Seiten im Bereich als fehlen: die übrige zählt nicht", a(48, 49, 168, 276, 277, 278).uebrig.join() === "278" && a(48, 49, 168, 276, 277, 278).ok);
    pruefe("Abdeckung: Seiten ohne Lücke werden als übrig gemeldet", a(48, 49, 168, 276, 278, 400).uebrig.join() === "400" && a(48, 49, 168, 276, 278, 400).ok);
    pruefe("Abdeckung: nichts angegeben deckt nichts", !a().ok && a().fehlendOffen === 5);
    pruefe("Abdeckung: abgelegt werden nur Seiten, die etwas gedeckt haben", alsBereichsText(a(48, 49, 168, 276, 278, 400).bestaetigt) === "48-49, 168, 276, 278");
    pruefe("Abdeckung: weitere, nicht einzeln bekannte Lücken sind nicht bestätigbar", !pruefeAbdeckung({ luecken: [], weitere: 2 }, [1]).ok && pruefeAbdeckung({ luecken: [], weitere: 0 }, []).ok);
    pruefe("Abdeckung: zaehleFehlend summiert", zaehleFehlend(g.luecken) === 5);
  }

  // ---- offener Stand (nachgeladen, bestätigt, nicht einzeln bekannt) -------------------------------------------------------------------
  {
    const basis = { fehlendBeimHochladen: 5, stellen: "48-49 (47), 168 (200), 2@276-278 (PDF 271-273)", nachgeladen: [] as number[], bestaetigt: false };
    pruefe("Stand: ohne Nachtrag und Bestätigung sind alle fehlenden Seiten offen", offenerStand(basis).fehlend === 5 && offenerStand(basis).luecken.length === 3 && offenerStand(basis).unbekannt === 0);
    pruefe("Stand: nachgeladene Seiten sind nicht mehr offen", offenerStand({ ...basis, nachgeladen: [48, 49] }).fehlend === 3 && beschreibeLuecken(offenerStand({ ...basis, nachgeladen: [48, 49] }).luecken) === "168 (200), 2@276-278 (PDF 271-273)");
    pruefe("Stand: eine nur teilweise nachgeladene Lücke bleibt mit dem Rest offen", beschreibeLuecken(offenerStand({ ...basis, nachgeladen: [48] }).luecken).startsWith("49 (47)"));
    pruefe("Stand: unscharf, eine nachgeladene Seite im Bereich senkt die Zahl", offenerStand({ ...basis, nachgeladen: [277] }).fehlend === 4);
    pruefe("Stand: bestätigt heißt nichts mehr offen (Leerseiten zählen nicht in die Qualität)", offenerStand({ ...basis, bestaetigt: true }).fehlend === 0);
    pruefe("Stand: was die Kurzform nicht einzeln nennt, bleibt als Zahl offen", offenerStand({ ...basis, fehlendBeimHochladen: 9 }).fehlend === 9 && offenerStand({ ...basis, fehlendBeimHochladen: 9 }).unbekannt === 4);
    pruefe("Stand: ohne lesbare Stellen ist alles unbekannt", offenerStand({ fehlendBeimHochladen: 3, stellen: null, nachgeladen: [], bestaetigt: false }).unbekannt === 3);
    pruefe("Stand: nichts fehlt, nichts offen", offenerStand({ fehlendBeimHochladen: 0, stellen: "", nachgeladen: [], bestaetigt: false }).fehlend === 0);
    pruefe("Stand: offeneNachNachtraegen zieht ab", offeneNachNachtraegen(lueckenAusStellen("48-49 (47)"), [49]).luecken[0]?.vonGedruckt === 48);
  }

  // ---- Orte der Lücken im Buchtext -----------------------------------------------------------------------------------------------------
  {
    const absatzVon = (n: number) => `Seite ${n}. ` + "Der Steuerpflichtige hat die Erklärung innerhalb der gesetzlichen Frist beim zuständigen Finanzamt einzureichen. ".repeat(6).trim();
    const seiten = Array.from({ length: 60 }, (_, i) => absatzVon(i + 1));
    const text = bereinigeSeitentext(seiten);
    const pakete = teileInPakete(text, 8_000);
    const orte = ermittleOrte(seiten, pakete, [luecke(1, 2, 2), luecke(30, 31, 31), luecke(60, 61, 61), luecke(0, 1, 1)]);
    pruefe("Orte: eine Lücke je Eintrag, Pakete beginnen bei 1", orte.length === 4 && orte.every((o) => o.paket >= 1 && o.paket <= pakete.length));
    pruefe("Orte: nach der letzten Seite liegt die Lücke am Ende des letzten Pakets", orte[2]!.paket === pakete.length && orte[2]!.promille >= 995);
    pruefe("Orte: am Anfang des Buchs liegt die Lücke im ersten Paket ganz vorn", orte[3]!.paket === 1 && orte[3]!.promille === 0);
    pruefe("Orte: die Mitte liegt in einem mittleren Paket", orte[1]!.paket > 1 && orte[1]!.paket < pakete.length);
    // Gegenprobe: Die Stelle entspricht dem Anteil am Text
    const gesamtLaenge = text.length;
    const erwartet = (text.indexOf("Seite 31.") / gesamtLaenge) * pakete.length;
    pruefe("Orte: Paket und Promille ergeben ungefähr den Anteil am ganzen Text", Math.abs(orte[1]!.paket - 1 + orte[1]!.promille / 1000 - erwartet) < 0.5, `${(orte[1]!.paket - 1 + orte[1]!.promille / 1000).toFixed(2)} gegen ${erwartet.toFixed(2)}`);
    pruefe("Orte: höchstens MAX_LUECKEN_STELLEN", ermittleOrte(seiten, pakete, Array.from({ length: 50 }, (_, i) => luecke(i + 1, 500 + i, 500 + i))).length === MAX_LUECKEN_STELLEN);
    const p: SeitenPruefung = { seiten: 60, erkannt: 50, abdeckung: 0.9, luecken: [luecke(30, 31, 31)], fehlend: 1, eingeschoben: 0, neuzaehlungen: 0, ohneText: [], eingeschraenkt: false, geprueft: true };
    const angabe = alsSeitenAngabe(p, null, [orte[1]!]);
    pruefe("Angabe: die Orte gehen als 'paket:promille' mit", angabe.orte === `${orte[1]!.paket}:${orte[1]!.promille}`);
    pruefe("Angabe: eine falsche Zahl von Orten wird nicht mitgeschickt", alsSeitenAngabe(p, null, [orte[0]!, orte[1]!]).orte === undefined && alsSeitenAngabe(p, null).orte === undefined);
  }

  // ---- Zuordnung der Nachlade-Seiten ---------------------------------------------------------------------------------------------------
  {
    const rand = (zahl: string | null): SeitenRand => ({ kopf: [], fuss: zahl === null ? [] : [zahl], zeichen: 500 });
    const offen = lueckenAusStellen("48-49 (47), 168 (200), 2@276-280 (PDF 271-273)").luecken;
    const z = ordneSeitenZu([rand("49"), rand("48"), rand("168")], offen);
    pruefe("Zuordnung: jede Seite bekommt ihre gedruckte Zahl, je Lücke eine Gruppe in der Reihenfolge der Lücken", z.gruppen.length === 2 && z.gruppen[0]!.seiten.join() === "48,49" && z.gruppen[1]!.seiten.join() === "168");
    pruefe("Zuordnung: die PDF-Seiten gehören in dieselbe Reihenfolge (aufsteigend nach gedruckter Zahl)", z.gruppen[0]!.pdfSeiten.join() === "2,1");
    pruefe("Zuordnung: nichts bleibt offen oder unklar", z.unklar.length === 0 && z.ausserhalb.length === 0);
    const u = ordneSeitenZu([rand("48"), rand(null), rand("49")], offen);
    pruefe("Zuordnung: eine Seite ohne lesbare Zahl wird gemeldet", u.unklar.join() === "2");
    const a = ordneSeitenZu([rand("48"), rand("300")], offen);
    pruefe("Zuordnung: eine Zahl, die zu keiner offenen Lücke gehört, wird gemeldet und nicht eingereiht", a.ausserhalb.join() === "2" && a.gruppen.length === 1 && a.gruppen[0]!.seiten.join() === "48");
    const doppelt = ordneSeitenZu([rand("48"), rand("48")], offen);
    pruefe("Zuordnung: dieselbe Zahl zweimal: die zweite Seite ist außerhalb", doppelt.ausserhalb.join() === "2");
    const manuell = ordneSeitenZu([rand(null), rand(null)], offen, [48, 49]);
    pruefe("Zuordnung: von Hand angegebene Zahlen gelten in der Reihenfolge der Datei", manuell.unklar.length === 0 && manuell.gruppen[0]?.seiten.join() === "48,49");
    const falsch = ordneSeitenZu([rand("48"), rand("49")], offen, [48]);
    pruefe("Zuordnung: eine Angabe mit falscher Zahl wird ignoriert, gelesen wird weiter", falsch.gruppen[0]?.seiten.join() === "48,49");
    const unsch = ordneSeitenZu([rand("276"), rand("277"), rand("278")], offen);
    pruefe("Zuordnung: unscharf nimmt nicht mehr Seiten, als dort fehlen (zwei), die dritte ist außerhalb", unsch.gruppen[0]?.seiten.length === 2 && unsch.ausserhalb.join() === "3");
    pruefe("Zuordnung: Seitenzahl im Kopf statt im Fuß wird auch gelesen", ordneSeitenZu([{ kopf: ["48"], fuss: [], zeichen: 400 }], offen).gruppen[0]?.seiten.join() === "48");
  }

  // ---- Einfügestelle -------------------------------------------------------------------------------------------------------------------
  {
    const l = [100, 100, 100, 100];
    pruefe("Stelle: Anfang des Pakets heißt: vor allen Abschnitten", waehleEinfuegestelle(l, 0) === 0);
    pruefe("Stelle: Ende des Pakets heißt: nach allen Abschnitten", waehleEinfuegestelle(l, 1000) === 4);
    pruefe("Stelle: die Mitte liegt zwischen dem zweiten und dem dritten Abschnitt", waehleEinfuegestelle(l, 500) === 2);
    pruefe("Stelle: es gilt die nächstgelegene Grenze (30 % liegt näher an 25 % als an 50 %)", waehleEinfuegestelle(l, 300) === 1 && waehleEinfuegestelle(l, 400) === 2);
    pruefe("Stelle: ungleiche Längen zählen nach Zeichen", waehleEinfuegestelle([10, 10, 380, 100], 40) === 2);
    pruefe("Stelle: ohne Abschnitte oder bei nutzlosen Werten vorn", waehleEinfuegestelle([], 500) === 0 && waehleEinfuegestelle([0, 0], 500) === 0);
  }

  // ---- Nachtrag schreiben (Nachbauten) -------------------------------------------------------------------------------------------------
  {
    const vektor = (text: string): number[] => {
      const v = new Array<number>(1024).fill(0);
      for (const t of tokens(text)) v[[...t].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7) % 1024]! += 1;
      const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
      return v.map((x) => x / norm);
    };
    const einbettung: Einbettung = { modell: "synthetisch-bge-m3", dimension: 1024, async einbetten(texte: string[]) { return texte.map(vektor); } };
    const ID = "upload:" + "a".repeat(32);
    const bauen = (info: Partial<FreigabeInfo> = {}) => {
      const geschrieben: ChunkZeile[] = [];
      const speicher = {
        async ladeFreigabeInfo(): Promise<FreigabeInfo> {
          return {
            anzahl: 40, fremd: 0, titel: "Steuerbuch", bereich: "steuer", quellenart: "fachliteratur", pruefstatus: "ungeprueft", hochgeladenVon: "admin-a", pruefenBis: null, unvollstaendig: false,
            seitenFehlend: 3, seitenStellen: "48-49 (47), 2@276-280 (PDF 271-273)", seitenOrte: "2:500,4:1000", seitenNachgeladen: null, ...info,
          };
        },
        async schreibeChunks(z: ChunkZeile[]) { geschrieben.push(...z); },
        async leseDokumenthaeufigkeit() { return new Map<number, number>(); },
        async schreibeBegriffe() { /* keine Wortgewichte im Nachbau */ },
        async zaehleChunks() { return 100; },
        async loescheQuelle() { /* nicht gebraucht */ },
      } as unknown as WissenSpeicher;
      const aufrufe: string[] = [];
      const merken: { nr: number; seiten: string; abschnitte: number }[] = [];
      let vorhanden = true;
      const pfadFuer = (paket: number) => `upload/steuer/steuerbuch.pdf#${String(paket).padStart(4, "0")}`;
      const nachtrag: NachtragSpeicher = {
        async ladeBasis(): Promise<NachtragBasis> {
          return {
            meta: {
              titel: "Steuerbuch", bereich: "steuer", dateiname: "steuerbuch.pdf", typ: "txt", hash: "a".repeat(64), rollen: ["admin"], hochgeladenVon: { id: "admin-a", name: "A" }, quellenart: "fachliteratur",
              cluster: "buecher", textgrundlage: "original", url: null, zeitpunkt: "2026-10-13T10:00:00.000Z",
              seiten: { seiten: 300, fehlend: 3, stellen: "48-49 (47), 2@276-280 (PDF 271-273)", abdeckung: 90, orte: "2:500,4:1000" },
            },
            paketeGesamt: 4,
            naechsteNr: 1,
          };
        },
        async findeStelle(_q, paket, promille) { aufrufe.push(`stelle:${paket}:${promille}`); return vorhanden ? { pfad: pfadFuer(paket), davor: 7 } : null; },
        async reiheEin(_q, p, ids, davor) { aufrufe.push(`ein:${p}:${ids.length}:${davor}`); },
        async merke(_q, a) { merken.push({ nr: a.nr, seiten: a.seiten, abschnitte: a.abschnitte }); aufrufe.push(`merke:${a.nr}`); },
      };
      const abh = { speicher, einbettung, nachtrag, pruefer: { id: "admin-b" }, jetzt: () => new Date("2026-10-13T11:00:00.000Z"), umgebung: {}, schema: "public_preview" };
      return { speicher, geschrieben, nachtrag, aufrufe, merken, abh, setzePfad: (p: string | null) => { vorhanden = p !== null; } };
    };
    const SEITE48 = "Der Steuerpflichtige hat die Erklärung innerhalb der gesetzlichen Frist beim zuständigen Finanzamt einzureichen. Verspätete Abgaben werden mit einem Zuschlag belegt.";
    const text = (n: number) => Array.from({ length: n }, () => SEITE48).join("\n\n");

    {
      const t = bauen();
      const erg = await ladeNachtrag({ quelleId: ID, gruppen: [{ seiten: [48, 49], text: text(2) }] }, t.abh);
      pruefe("Nachtrag: schreibt die neuen Abschnitte und reiht sie ein", t.geschrieben.length > 0 && t.aufrufe.join("|") === `stelle:2:500|ein:upload/steuer/steuerbuch.pdf#0002:${t.geschrieben.length}:7|merke:1`, t.aufrufe.join("|"));
      pruefe("Nachtrag: die Abschnitte tragen Paket, Pfad und Herkunft des Buchs", t.geschrieben.every((z) => z.pfad === "upload/steuer/steuerbuch.pdf#0002" && z.quelle_id === ID && z.extra.paket === 2 && z.extra.pakete_gesamt === 4 && z.extra.hochgeladen_von === "admin-a"));
      pruefe("Nachtrag: bleiben ungeprüft und unfreigegeben", t.geschrieben.every((z) => z.pruefstatus === "ungeprueft" && z.geprueft_von === null));
      pruefe("Nachtrag: die Abschnitts-Kennung ist eigen und stabil (nachtrag-Nummer)", t.geschrieben.every((z) => z.chunk_id === `${ID}#n1`));
      pruefe("Nachtrag: das Ergebnis nennt Seiten, Abschnitte und was offen bleibt (Seite 2@276-280)", erg.seiten === "48-49" && erg.abschnitte === t.geschrieben.length && erg.offen === 2, JSON.stringify(erg));
      pruefe("Nachtrag: gemerkt wird der Nachtrag mit den gedruckten Seiten", t.merken[0]?.seiten === "48-49" && t.merken[0]?.nr === 1);
    }
    {
      const t = bauen();
      await ladeNachtrag({ quelleId: ID, gruppen: [{ seiten: [49], text: text(1) }, { seiten: [48], text: text(1) }] }, t.abh);
      pruefe("Nachtrag: mehrere Gruppen bekommen aufeinanderfolgende Nummern", t.merken.map((m) => m.nr).join() === "1,2" && t.merken.map((m) => m.seiten).join() === "49,48");
    }
    {
      const t = bauen();
      await ladeNachtrag({ quelleId: ID, gruppen: [{ seiten: [277, 278], text: text(1) }] }, t.abh);
      pruefe("Nachtrag: eine unscharfe Lücke wird an ihrem Ort eingereiht (Paket 4, Ende)", t.aufrufe[0] === "stelle:4:1000");
    }
    {
      const t = bauen();
      const f = await fehlerCode(() => ladeNachtrag({ quelleId: ID, gruppen: [{ seiten: [48, 49], text: text(1) }, { seiten: [300], text: text(1) }] }, t.abh));
      pruefe("Nachtrag: passt eine Gruppe zu keiner offenen Lücke, scheitert alles und nichts wird geschrieben", f === "nachtragUngueltig" && t.geschrieben.length === 0 && t.aufrufe.length === 0, String(f));
    }
    {
      const t = bauen();
      pruefe("Nachtrag: eine Gruppe über zwei Lücken wird abgelehnt", (await fehlerCode(() => ladeNachtrag({ quelleId: ID, gruppen: [{ seiten: [49, 277], text: text(1) }] }, t.abh))) === "nachtragUngueltig");
      pruefe("Nachtrag: mehr Seiten als in einer unscharfen Lücke fehlen werden abgelehnt", (await fehlerCode(() => ladeNachtrag({ quelleId: ID, gruppen: [{ seiten: [276, 277, 278], text: text(1) }] }, t.abh))) === "nachtragUngueltig");
      pruefe("Nachtrag: dieselbe Seite in zwei Gruppen: die zweite passt nicht mehr", (await fehlerCode(() => ladeNachtrag({ quelleId: ID, gruppen: [{ seiten: [48], text: text(1) }, { seiten: [48], text: text(1) }] }, t.abh))) === "nachtragUngueltig" && t.geschrieben.length === 0);
    }
    {
      const t = bauen({ seitenNachgeladen: "48-49" });
      pruefe("Nachtrag: eine schon nachgeladene Seite ist nicht mehr offen", (await fehlerCode(() => ladeNachtrag({ quelleId: ID, gruppen: [{ seiten: [48], text: text(1) }] }, t.abh))) === "nachtragUngueltig");
    }
    {
      const t = bauen({ seitenFehlend: 0, seitenStellen: "" });
      pruefe("Nachtrag: ein Buch ohne offene Lücke nimmt nichts an", (await fehlerCode(() => ladeNachtrag({ quelleId: ID, gruppen: [{ seiten: [48], text: text(1) }] }, t.abh))) === "nachtragUngueltig");
    }
    {
      pruefe("Nachtrag: ein freigegebenes Buch ändert sich nicht mehr", (await fehlerCode(() => ladeNachtrag({ quelleId: ID, gruppen: [{ seiten: [48], text: text(1) }] }, bauen({ pruefstatus: "freigegeben" }).abh))) === "nichtPruefbar");
      pruefe("Nachtrag: ein unvollständiges Buch nimmt nichts an", (await fehlerCode(() => ladeNachtrag({ quelleId: ID, gruppen: [{ seiten: [48], text: text(1) }] }, bauen({ unvollstaendig: true }).abh))) === "unvollstaendig");
      pruefe("Nachtrag: fremde Zeilen (Skript) sind tabu", (await fehlerCode(() => ladeNachtrag({ quelleId: ID, gruppen: [{ seiten: [48], text: text(1) }] }, bauen({ fremd: 1 }).abh))) === "nichtFreigebbar");
      pruefe("Nachtrag: keine Kennung eines Uploads", (await fehlerCode(() => ladeNachtrag({ quelleId: "pfad/skript.md", gruppen: [{ seiten: [48], text: text(1) }] }, bauen().abh))) === "nichtFreigebbar");
      pruefe("Nachtrag: unbekanntes Buch", (await fehlerCode(() => ladeNachtrag({ quelleId: ID, gruppen: [{ seiten: [48], text: text(1) }] }, bauen({ anzahl: 0 }).abh))) === "nichtGefunden");
      pruefe("Nachtrag: die Vorschau schreibt nie in die gemeinsame Datenbank", (await fehlerCode(() => ladeNachtrag({ quelleId: ID, gruppen: [{ seiten: [48], text: text(1) }] }, { ...bauen().abh, umgebung: { VERCEL_ENV: "preview" }, schema: "public" }))) === "vorschau");
    }
    {
      const t = bauen();
      const g = (x: unknown) => fehlerCode(() => ladeNachtrag({ quelleId: ID, gruppen: x as never }, t.abh));
      pruefe("Nachtrag: ungültige Eingabe (keine Gruppen, keine Seiten, falsche Zahlen)", (await g([])) === "nachtragUngueltig" && (await g("x")) === "nachtragUngueltig" && (await g([{ seiten: [], text: "abc" }])) === "nachtragUngueltig" && (await g([{ seiten: [0], text: "abc" }])) === "nachtragUngueltig" && (await g([{ seiten: [1.5], text: "abc" }])) === "nachtragUngueltig");
      pruefe("Nachtrag: leerer Text", (await g([{ seiten: [48], text: "   " }])) === "leer");
      pruefe("Nachtrag: zu langer Text", (await g([{ seiten: [48], text: "x ".repeat(70_000) }])) === "zuGross");
      pruefe("Nachtrag: bei all dem wurde nichts geschrieben", t.geschrieben.length === 0 && t.aufrufe.length === 0);
    }
    {
      const t = bauen();
      t.setzePfad(null);
      pruefe("Nachtrag: gibt es das Paket nicht, scheitert er ohne zu schreiben", (await fehlerCode(() => ladeNachtrag({ quelleId: ID, gruppen: [{ seiten: [48], text: text(1) }] }, t.abh))) === "nachtragUngueltig" && t.geschrieben.length === 0);
    }
    {
      const t = bauen({ seitenOrte: null });
      await ladeNachtrag({ quelleId: ID, gruppen: [{ seiten: [48], text: text(1) }] }, t.abh);
      pruefe("Nachtrag: ohne gespeicherten Ort (älteres Buch) kommt der Text ans Ende des letzten Pakets", t.aufrufe[0] === "stelle:4:1000");
    }
  }

  // ---- Liste: offene Seiten ------------------------------------------------------------------------------------------------------------
  {
    const zeile = (teil: Record<string, unknown>) => ({
      id: "1", quelle_id: "upload:" + "c".repeat(32), pfad: "upload/steuer/b.pdf#0001", titel: "Buch", bereich: "steuer", rollen: ["admin"], eingelesen_am: "2026-10-13T10:00:00Z", autoritaetsstufe: 3,
      quellenart: "fachliteratur", cluster: "buecher", textgrundlage: "original", pruefstatus: "ungeprueft", pruefen_bis: null, url: null, rechtsstelle: null, upload_quelle: "upload", hochgeladen_von: "A",
      hochgeladen_von_id: "a", paket: "1", pakete_gesamt: "1", guete: "gut", guete_hinweise: null, anzahl: 3, seiten_fehlend: "3", seiten_stellen: "48-49 (47), 168 (200)", ...teil,
    });
    const hole = (teil: Record<string, unknown>) => gruppiereWissenDokumente([zeile(teil) as never])[0]!;
    const frisch = hole({});
    pruefe("Liste: alle fehlenden Seiten sind offen, mit ihren Stellen", frisch.seitenOffen === 3 && frisch.seitenOffenStellen === "48-49 (47), 168 (200)");
    const nach = hole({ seiten_nachgeladen: "48-49" });
    pruefe("Liste: nachgeladene Seiten sind nicht mehr offen", nach.seitenOffen === 1 && nach.seitenOffenStellen === "168 (200)" && nach.seitenNachgeladen === "48-49");
    const best = hole({ seiten_vermerkt: true, seiten_bestaetigt: "48-49, 168", pruefstatus: "freigegeben" });
    pruefe("Liste: bestätigte Seiten sind nicht offen, die Zahl bleibt als Befund", best.seitenOffen === 0 && best.seitenOffenStellen === null && best.seitenFehlend === 3 && best.seitenBestaetigt === "48-49, 168" && best.seitenVermerkt);
    const alt = hole({ seiten_vermerkt: true, seiten_vermerk: "Leere Seiten im Buch" });
    pruefe("Liste: ein früherer Freitext-Vermerk gilt als bestätigt", alt.seitenOffen === 0 && alt.seitenVermerk === "Leere Seiten im Buch" && alt.seitenBestaetigt === null);
    pruefe("Liste: ohne Befund nichts offen", hole({ seiten_fehlend: "0", seiten_stellen: "" }).seitenOffen === 0);
    const teile = gruppiereWissenDokumente([zeile({ id: "1", paket: "1", pfad: "x#1" }), zeile({ id: "2", paket: "2", pfad: "x#2", seiten_nachgeladen: "48-49" }) as never] as never[])[0]!;
    pruefe("Liste: mehrere Zeilen eines Dokuments ergeben einen Stand (Nachtrag aus irgendeiner Zeile)", teile.seitenOffen === 1 && teile.seitenNachgeladen === "48-49");
  }

  // ---- Texte in allen vier Sprachen ----------------------------------------------------------------------------------------------------
  {
    const lese = (l: string) => JSON.parse(readFileSync(`src/messages/${l}.json`, "utf-8")) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    const SCHLUESSEL = [
      "kiAssistentAnsicht.wissensVerwaltung.liste.seitenNachgeladen",
      "kiAssistentAnsicht.wissensVerwaltung.liste.seitenBestaetigt",
      "kiAssistentAnsicht.wissensVerwaltung.liste.seitenOffen",
      ...["titel", "text", "nachgeladen", "regel", "erklaerung", "unbekannt", "bestaetigt", "bestaetigtPlatzhalter", "angabeUngueltig", "nochNichts", "abgedeckt", "nichtAbgedeckt", "uebrig", "vermerk", "gesperrt"].map((k) => `kiAssistentAnsicht.wissensVerwaltung.pruefung.seiten.${k}`),
      ...["titel", "erklaerung", "manuell", "manuellPlatzhalter", "waehlen", "oeffnet", "liest", "sendet", "fertig", "keinePdf", "angabeUngueltig", "angabeAnzahl", "unklar", "ausserhalb", "keineZuordnung", "ohneText", "lesenFehler"].map((k) => `kiAssistentAnsicht.wissensVerwaltung.pruefung.nachladen.${k}`),
      "aktionen.ok.wissenNachgeladen",
      "aktionen.fehler.wissenSeitenNichtBestaetigt",
      "aktionen.fehler.wissenSeitenNichtAbgedeckt",
      "aktionen.fehler.wissenNachtragUngueltig",
    ];
    for (const sprache of ["de", "en", "ru", "kk"]) {
      const j = lese(sprache);
      const fehlt = SCHLUESSEL.filter((k) => typeof k.split(".").reduce((o: any, teil) => o?.[teil], j) !== "string"); // eslint-disable-line @typescript-eslint/no-explicit-any
      pruefe(`Texte (${sprache}): alle neuen Meldungen sind da`, fehlt.length === 0, fehlt.join(", "));
    }
    const de = lese("de");
    const alles = JSON.stringify(de.kiAssistentAnsicht.wissensVerwaltung.pruefung) + JSON.stringify(de.aktionen.fehler.wissenSeitenNichtAbgedeckt);
    pruefe("Texte (de): keine Gedankenstriche im Fließtext", !/[–—]/u.test(alles.replace(/"(?:\\.|[^"\\])*(?:\d\s?[–—]\s?\d)(?:\\.|[^"\\])*"/g, "")));
    pruefe("Texte: der alte Pflicht-Vermerk-Text ist weg", de.aktionen.fehler.wissenVermerkFehlt === undefined);
  }

  console.log(`\n${gesamt - fehler}/${gesamt} bestanden`);
  if (fehler > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
