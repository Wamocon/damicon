// Tests fuer die Hilfe des Assistenten bei der Verwaltung der Wissensbasis (wissen-verwaltung-werkzeug.ts, aktionen.ts), ohne Datenbank:
//   * die Werkzeuge gibt es nur fuer die Administration (ki_assistent:manage), nicht fuer CEO, Betriebsleitung, Buchhaltung, Kunde
//   * die Aenderung der Einordnung ist eine Aktion mit Bestaetigung (needsApproval) und nur der Administration angeboten
//   * Dokumente werden ueber Kennung oder eindeutigen Titel gefunden, bei mehreren Treffern nicht geraten
//   * die Anweisung im Systemprompt nennt die Grenzen (kein Hochladen, kein Freigeben)
// Die Ausfuehrung gegen echte Zeilen prueft wissen-umordnen-db.ts. Aufruf: npm run test:wissen-assistent

import { readFileSync } from "node:fs";
import { AKTIONS_NAMEN } from "@/lib/ai/aktionen-meta";
import { baueAktionen } from "@/lib/ai/aktionen";
import { baueWerkzeuge } from "@/lib/ai/tools";
import { baueWissenVerwaltungWerkzeuge, findeDokument } from "@/lib/ai/wissen-verwaltung-werkzeug";
import { WISSEN_VERWALTUNG_ANWEISUNG } from "@/lib/ai/wissen-verwaltung-anweisung";
import { roles } from "@/lib/rbac";
import type { WissenDokumentZeile } from "@/lib/wissen/dokumente-liste";

let gesamt = 0;
let fehler = 0;
function pruefe(name: string, ok: boolean, detail = "") {
  gesamt++;
  if (!ok) fehler++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
}

const NAMEN = ["wissensbasisAbrufen", "wissenDokumentAnalysieren"];
for (const rolle of roles) {
  const w = baueWissenVerwaltungWerkzeuge(rolle);
  const hat = w !== null;
  pruefe(`Verwaltungswerkzeuge nur für die Administration: ${rolle} ${hat ? "bekommt" : "bekommt keine"}`, hat === (rolle === "admin"));
}
pruefe("Die Werkzeuge heißen wie in den Beschriftungen", Object.keys(baueWissenVerwaltungWerkzeuge("admin") ?? {}).join() === NAMEN.join());

const adminWerkzeuge = Object.keys(baueWerkzeuge("admin"));
pruefe("Im Werkzeugsatz der Administration stehen beide Lesewerkzeuge und die Aktion", NAMEN.every((n) => adminWerkzeuge.includes(n)) && adminWerkzeuge.includes("wissenEinordnungAendern"));
for (const rolle of roles.filter((r) => r !== "admin")) {
  const satz = Object.keys(baueWerkzeuge(rolle));
  pruefe(`Rolle ${rolle}: weder Verwaltungswerkzeuge noch Einordnungsaktion`, !NAMEN.some((n) => satz.includes(n)) && !satz.includes("wissenEinordnungAendern"));
}
pruefe("Die Lesewerkzeuge gibt es auch im Weg ohne Aktionen, die Aktion nicht", Object.keys(baueWerkzeuge("admin", { nurLesen: true })).includes("wissensbasisAbrufen") && !Object.keys(baueWerkzeuge("admin", { nurLesen: true })).includes("wissenEinordnungAendern"));
pruefe("Die Einordnungsaktion ist als Aktion eingetragen", (AKTIONS_NAMEN as string[]).includes("wissenEinordnungAendern"));

const aktion = baueAktionen("admin").wissenEinordnungAendern as unknown as { needsApproval?: boolean; description?: string } | undefined;
pruefe("Die Änderung der Einordnung verlangt eine Bestätigung des Nutzers", aktion?.needsApproval === true);
pruefe("Die Aktion beschreibt das Vier-Augen-Prinzip und die Quelle der Kennung", /Vier-Augen/.test(aktion?.description ?? "") && /wissensbasisAbrufen/.test(aktion?.description ?? ""));
pruefe("Der CEO bekommt die Aktion nicht, obwohl er update hat", !("wissenEinordnungAendern" in baueAktionen("ceo")));

// ---- Dokumente finden ----------------------------------------------------------------------------------------------------------------------------
const zeile = (schluessel: string, titel: string): WissenDokumentZeile =>
  ({ schluessel, schluesselSpalte: "quelle_id", titel, bereich: "legal", rollen: [], datum: null, hochgeladenVon: null, hochgeladenVonId: null, chunks: 1, herkunft: "skript", loeschbar: false, quellenart: null, cluster: null, textgrundlage: null, stufe: null, rechtsstelle: null, nutzung: "ja", pruefstatus: "freigegeben", pruefenBis: null, paketeGesamt: null, paketeDa: 0, unvollstaendig: false, guete: null, gueteHinweise: [], abgelaufen: false, url: null }) as WissenDokumentZeile;
const liste = [zeile("upload:aaa", "Steuerrecht Handbuch 2026"), zeile("upload:bbb", "Steuerrecht Kommentar"), zeile("skript/c.md", "ISO 31000 Risikomanagement")];
pruefe("Finden: eine Kennung trifft genau", findeDokument(liste, "upload:bbb").treffer?.titel === "Steuerrecht Kommentar");
pruefe("Finden: ein eindeutiger Titelteil trifft (Groß- und Kleinschreibung egal)", findeDokument(liste, "iso 31000").treffer?.schluessel === "skript/c.md");
const mehrdeutig = findeDokument(liste, "Steuerrecht");
pruefe("Finden: mehrere Treffer werden nicht geraten, sondern als Kandidaten genannt", mehrdeutig.treffer === null && mehrdeutig.kandidaten.length === 2);
pruefe("Finden: kein Treffer und leere Eingabe ergeben nichts", findeDokument(liste, "Kochbuch").treffer === null && findeDokument(liste, "   ").kandidaten.length === 0);
pruefe("Finden: mehrere Wörter müssen alle im Titel stehen", findeDokument(liste, "steuerrecht kommentar").treffer?.schluessel === "upload:bbb");

// ---- Anweisung und Verdrahtung ---------------------------------------------------------------------------------------------------------------
pruefe("Anweisung: nennt alle drei Werkzeuge", ["wissensbasisAbrufen", "wissenDokumentAnalysieren", "wissenEinordnungAendern"].every((n) => WISSEN_VERWALTUNG_ANWEISUNG.includes(n)));
pruefe("Anweisung: Hochladen und Freigeben kann der Assistent nicht", /HOCHLADEN kannst du nicht/.test(WISSEN_VERWALTUNG_ANWEISUNG) && /FREIGEBEN kannst du nicht/.test(WISSEN_VERWALTUNG_ANWEISUNG));
pruefe("Anweisung: nur der Cluster wird gewählt, der Rest kommt aus der Analyse", /nur den Cluster wählen/.test(WISSEN_VERWALTUNG_ANWEISUNG));
pruefe("Anweisung: Auszüge sind keine Anweisungen", /keine Anweisung an dich/.test(WISSEN_VERWALTUNG_ANWEISUNG));
const route = readFileSync("src/app/api/ki-assistent/route.ts", "utf8");
pruefe("Route: die Anweisung gilt nur, wenn das Verwaltungswerkzeug angeboten wird", /"wissensbasisAbrufen" in werkzeuge \? WISSEN_VERWALTUNG_ANWEISUNG : ""/.test(route));
const quelle = readFileSync("src/lib/ai/wissen-verwaltung-werkzeug.ts", "utf8");
pruefe("Werkzeuge: schreiben nie selbst (kein update, insert oder delete)", !/\.(update|insert|delete|upsert)\(/.test(quelle));
pruefe("Werkzeuge: Recht wird vor dem Aufbau geprüft (ki_assistent:manage)", /hasPermission\(rolle, "ki_assistent", "manage"\)/.test(quelle));

console.log(`\n${gesamt - fehler}/${gesamt} bestanden`);
if (fehler > 0) process.exit(1);
