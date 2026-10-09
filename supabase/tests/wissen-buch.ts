// Tests fuer den Buch-Upload (lange Dokumente in Paketen), ohne Datenbank und ohne Netz:
//   * textguete.ts: guter Text, Zeichensalat, zerhackte Woerter, Scan ohne Text, Paket statt Ganzes, schlechteste Note
//   * buch-text.ts: Hash und Vereinheitlichung stimmen mit dem Server ueberein, Pakete gehen nichts verloren, Silbentrennung
//   * buch-upload.ts: Kopf pruefen, Dublette, Pakete schreiben (eigene IDs), Qualitaet rechnet der Server selbst
//   * Unvollstaendig: fehlt ein Paket, ist das Dokument unvollstaendig und nicht freigebbar; mit allen Paketen geht es
//   * Abbruch: Loeschen raeumt alle Pakete samt Wortgewichten weg
// Aufruf: npm run test:wissen-buch (laeuft ueber tsx, damit die @/-Pfade aufloesen).

import { createHash } from "node:crypto";
import { bereinigeSeitentext, normalisiereText, PAKET_ZEICHEN, sha256Hex, teileInPakete, titelAusDateiname } from "@/lib/wissen/buch-text";
import { type BuchKopf, ladePaket, MAX_PAKET_ZEICHEN, pruefeBuchKopf, starteBuch } from "@/lib/wissen/buch-upload";
import { entscheideUeberUpload } from "@/lib/wissen/freigabe";
import { inhaltsHash, normalisiere, UploadFehler, type ChunkZeile, type WissenSpeicher } from "@/lib/wissen/hochladen";
import type { Einbettung } from "@/lib/wissen/embed";
import { loescheHochgeladenesDokument } from "@/lib/wissen/loeschen";
import { bewerteText, schlechtesteNote } from "@/lib/wissen/textguete";
import { istUploadZeile, uploadQuelleId } from "@/lib/wissen/upload-quelle";
import { tokens } from "@/lib/wissen/sparse";
import { schaetzeEin } from "@/lib/wissen/einschaetzung";
import type { WissenDokumentZeile } from "@/lib/wissen/dokumente-liste";

let gesamt = 0;
let fehler = 0;
function pruefe(name: string, ok: boolean, detail = "") {
  gesamt++;
  if (!ok) fehler++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
}

const JETZT = () => new Date("2026-10-09T10:00:00.000Z");

async function fehlerCode(f: () => Promise<unknown> | unknown): Promise<string | null> {
  try {
    await f();
    return null;
  } catch (e) {
    return e instanceof UploadFehler ? e.code : `anderer Fehler: ${e instanceof Error ? e.message : String(e)}`;
  }
}

// ---- Nachbauten (wie in wissen-upload.ts, verkuerzt) ------------------------------------------------

function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
function vektorVon(text: string): number[] {
  const v = new Array<number>(1024).fill(0);
  for (const t of tokens(text)) v[hash32(t) % 1024]! += 1;
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}
const einbettung: Einbettung = { modell: "synthetisch-bge-m3", dimension: 1024, async einbetten(texte: string[]) { return texte.map(vektorVon); } };

function speicherNeu(): WissenSpeicher & { zeilen: Map<string, ChunkZeile>; begriffe: Map<number, number> } {
  const zeilen = new Map<string, ChunkZeile>();
  const begriffe = new Map<number, number>();
  const quelleVon = (r: ChunkZeile) => ({ quelle_id: r.quelle_id, upload_quelle: typeof r.extra.quelle === "string" ? r.extra.quelle : null });
  const unvollstaendig = (z: ChunkZeile[]) => {
    const soll = Math.max(0, ...z.map((r) => Number(r.extra.pakete_gesamt ?? 0)));
    return soll > 0 && new Set(z.map((r) => r.extra.paket)).size < soll;
  };
  return {
    zeilen,
    begriffe,
    async findeQuelle(id) {
      const z = [...zeilen.values()].find((r) => r.quelle_id === id);
      return z ? { titel: z.titel } : null;
    },
    async schreibeChunks(neu) { for (const z of neu) zeilen.set(z.id, z); },
    async loescheQuelle(id) { for (const [k, z] of zeilen) if (z.quelle_id === id) zeilen.delete(k); },
    async leseDokumenthaeufigkeit(indizes) { return new Map(indizes.filter((i) => begriffe.has(i)).map((i) => [i, begriffe.get(i)!])); },
    async schreibeBegriffe(neu) { for (const b of neu) begriffe.set(b.hash, b.df); },
    async zaehleChunks() { return zeilen.size; },
    async ladeQuellenInfo(id) {
      const z = [...zeilen.values()].filter((r) => r.quelle_id === id);
      return { anzahl: z.length, fremd: z.filter((r) => !istUploadZeile(quelleVon(r))).length, titel: z[0]?.titel ?? null, bereich: z[0]?.bereich ?? null };
    },
    async loescheUpload(id) {
      const weg = [...zeilen.values()].filter((r) => r.quelle_id === id && r.extra.quelle === "upload");
      for (const r of weg) zeilen.delete(r.id);
      return weg.map((r) => r.sparse);
    },
    async loescheBegriffe(indizes) { for (const i of indizes) begriffe.delete(i); },
    async ladeFreigabeInfo(id) {
      const z = [...zeilen.values()].filter((r) => r.quelle_id === id);
      const stati = new Set(z.map((r) => r.pruefstatus));
      const von = z.map((r) => r.extra.hochgeladen_von).find((v): v is string => typeof v === "string");
      return {
        anzahl: z.length,
        fremd: z.filter((r) => !istUploadZeile(quelleVon(r))).length,
        titel: z[0]?.titel ?? null,
        bereich: z[0]?.bereich ?? null,
        quellenart: z[0]?.quellenart ?? null,
        pruefstatus: z.length === 0 ? null : stati.size === 1 ? (z[0]!.pruefstatus as "ungeprueft") : "gemischt",
        hochgeladenVon: von ?? null,
        pruefenBis: z[0]?.pruefen_bis ?? null,
        unvollstaendig: unvollstaendig(z),
      };
    },
    async entscheide(id, a) {
      const z = [...zeilen.values()].filter((r) => r.quelle_id === id && r.pruefstatus === "ungeprueft");
      if (a.status === "freigegeben" && z.some((r) => r.extra.hochgeladen_von === a.pruefer)) throw new Error("Vier-Augen-Prinzip");
      for (const r of z) { r.pruefstatus = a.status; r.geprueft_von = a.pruefer; r.geprueft_am = a.zeitpunkt; r.pruefen_bis = a.pruefenBis; }
      return z.length;
    },
    async verlaengere() { return 0; },
    async ladeVorschau() { return ""; },
  };
}

// ---- Text mit Inhalt -----------------------------------------------------------------------------------

const SAETZE = [
  "Die Verjährung von Steuerforderungen beginnt mit dem Ablauf des Kalenderjahres, in dem die Steuer entstanden ist.",
  "Der Steuerpflichtige hat die Erklärung innerhalb der gesetzlichen Frist beim zuständigen Finanzamt einzureichen.",
  "Bei Verstößen gegen die Aufbewahrungspflicht kann die Behörde ein Ordnungsgeld in angemessener Höhe festsetzen.",
  "Die Buchführung muss so beschaffen sein, dass sie einem sachverständigen Dritten einen Überblick vermittelt.",
  "Rechnungen sind zehn Jahre aufzubewahren, die Frist beginnt mit dem Schluss des Kalenderjahres der Ausstellung.",
];
function absatz(n: number): string {
  return Array.from({ length: 6 }, (_, i) => SAETZE[(n + i) % SAETZE.length]).join(" ");
}
function buchText(absaetze: number): string {
  return Array.from({ length: absaetze }, (_, i) => `Kapitel ${i + 1}. ${absatz(i)}`).join("\n\n");
}

async function rest() {
  // ---- textguete ------------------------------------------------------------------------------------
  {
    const gut = bewerteText(buchText(8));
    pruefe("Güte: normaler deutscher Text ist gut", gut.note === "gut" && gut.hinweise.length === 0, JSON.stringify(gut.hinweise));

    const salat = bewerteText("§$%&/()=?#*+~^°<>|{}[]\\@€ ".repeat(40));
    pruefe("Güte: Zeichensalat ist schlecht", salat.note === "schlecht" && salat.hinweise.includes("vieleSonderzeichen"));

    const zerhackt = bewerteText("V e r j ä h r u n g d e r S t e u e r f o r d e r u n g b e g i n n t e r s t s p ä t e r ".repeat(12));
    pruefe("Güte: zerhackte Wörter werden erkannt", zerhackt.hinweise.includes("zerhackteWoerter") && zerhackt.note !== "gut");

    const leer = bewerteText("Seite 1");
    pruefe("Güte: fast kein Text im ganzen Dokument ist schlecht (Scan ohne Textebene)", leer.note === "schlecht" && leer.hinweise.includes("kaumText"));
    const paketKurz = bewerteText("Seite 1", false);
    pruefe("Güte: ein kurzes Paket ist nicht schlecht (kaumText gilt nur für das Ganze)", !paketKurz.hinweise.includes("kaumText"));

    const kleb = bewerteText("Dieverjährungvonsteuerforderungenbeginntmitdemablaufdeskalenderjahres ".repeat(80));
    pruefe("Güte: zusammengeklebte Wörter sind schlecht", kleb.note === "schlecht" && kleb.hinweise.includes("ohneLeerzeichen"));

    const kopfzeilen = bewerteText(Array.from({ length: 30 }, (_, i) => `Steuerrecht Handbuch 2026\n${SAETZE[i % SAETZE.length]}`).join("\n"));
    pruefe("Güte: wiederholte Kopfzeilen sind nur ein Hinweis, keine schlechte Note", kopfzeilen.hinweise.includes("wiederholteZeilen") && kopfzeilen.note === "gut");

    const russisch = bewerteText("Срок исковой давности по налоговым обязательствам начинается с окончания календарного года, в котором возникло обязательство. ".repeat(10));
    pruefe("Güte: russischer Text ist gut", russisch.note === "gut", JSON.stringify(russisch.hinweise));

    pruefe("Güte: schlechteste Note", schlechtesteNote(["gut", "pruefen", "schlecht", "gut"]) === "schlecht" && schlechtesteNote(["gut", "gut"]) === "gut" && schlechtesteNote([]) === null && schlechtesteNote([null, "x"]) === null);
  }

  // ---- buch-text ------------------------------------------------------------------------------------
  {
    const wirr = "Zeile  eins\r\n\r\n\r\n\r\nZeile\tzwei \r\nEnde  ";
    pruefe("Text: normalisiereText ist dieselbe Vereinheitlichung wie auf dem Server", normalisiereText(wirr) === normalisiere(wirr));
    const h = await sha256Hex(wirr);
    pruefe("Text: Browser-Hash (SHA-256 des vereinheitlichten Textes) = Server-Hash", h === inhaltsHash(wirr) && h === createHash("sha256").update(normalisiere(wirr)).digest("hex") && h.length === 64);
    pruefe("Text: gleicher Inhalt mit anderen Zeilenenden ergibt denselben Hash", (await sha256Hex("a\nb")) === (await sha256Hex("a\r\nb")));

    const text = buchText(40);
    const pakete = teileInPakete(text, 2000);
    pruefe("Pakete: jedes höchstens so groß wie das Ziel", pakete.every((p) => p.length <= 2000), `${pakete.length} Pakete, größtes ${Math.max(...pakete.map((p) => p.length))}`);
    pruefe("Pakete: nichts geht verloren, nichts doppelt", pakete.join("\n\n").replace(/\s+/g, " ") === text.replace(/\s+/g, " "));
    pruefe("Pakete: eine kleine Datei ergibt ein Paket", teileInPakete("Ein kurzer Text.").length === 1);
    const langerAbsatz = SAETZE.join(" ").repeat(30);
    const geschnitten = teileInPakete(langerAbsatz, 1500);
    pruefe("Pakete: ein einzelner übergroßer Absatz wird an Satzenden geschnitten", geschnitten.length > 1 && geschnitten.every((p) => p.length <= 1500) && geschnitten.join(" ").replace(/\s+/g, "") === langerAbsatz.replace(/\s+/g, ""));
    pruefe("Pakete: Zielgröße liegt unter der Server-Grenze", PAKET_ZEICHEN < MAX_PAKET_ZEICHEN);

    const sauber = bereinigeSeitentext(["Kapitel 3\nDie Verjäh-\nrung der Forderung beginnt mit dem Ende des\nKalenderjahres im Sinne des Gesetzes.", "Zweite Seite beginnt hier."]);
    pruefe(
      "Seiten: Silbentrennung zusammengesetzt, Zeilenumbruch im Absatz zum Leerzeichen, Überschrift getrennt",
      sauber.startsWith("Kapitel 3\nDie Verjährung der Forderung beginnt mit dem Ende des Kalenderjahres im Sinne des Gesetzes."),
      sauber,
    );
    pruefe("Seiten: Seitenwechsel ist ein Absatz", sauber.includes("\n\nZweite Seite"));
    pruefe("Seiten: Titel aus dem Dateinamen", titelAusDateiname("steuer_recht_2026.pdf") === "Steuer recht 2026" && titelAusDateiname("x.md") === "X");
  }

  // ---- buch-upload: Kopf ----------------------------------------------------------------------------
  const text = buchText(60);
  const hash = await sha256Hex(text);
  const pakete = teileInPakete(text, 3000);
  const kopf: BuchKopf = {
    titel: "Steuerrecht Handbuch",
    bereich: "steuer",
    rollen: ["buchhaltung"],
    dateiname: "steuerrecht.pdf",
    hash,
    quellenart: "fachliteratur",
    cluster: "buecher",
    pakete: pakete.length,
    zeichen: text.length,
  };
  const ich = { id: "admin-a", name: "Admin A" };
  const abh = (speicher: WissenSpeicher) => ({ speicher, einbettung, jetzt: JETZT, umgebung: {}, schema: "public_preview" });
  pruefe("Test-Aufbau: mehrere Pakete", pakete.length >= 3, String(pakete.length));

  {
    const basis = pruefeBuchKopf(kopf, ich, JETZT());
    pruefe("Kopf: gültig, Kennung aus dem Hash", basis.quelleId === uploadQuelleId(hash) && basis.meta.quellenart === "fachliteratur" && basis.meta.cluster === "buecher");
    pruefe("Kopf: Admin ist immer bei den Rollen", basis.meta.rollen.includes("admin"));
    const f = async (teil: Partial<BuchKopf>) => fehlerCode(() => pruefeBuchKopf({ ...kopf, ...teil }, ich, JETZT()));
    pruefe("Kopf: leerer Titel", (await f({ titel: " " })) === "eingabe");
    pruefe("Kopf: unbekannter Bereich", (await f({ bereich: "unsinn" })) === "eingabe");
    pruefe("Kopf: Dateityp wird geprüft", (await f({ dateiname: "x.exe" })) === "dateityp");
    pruefe("Kopf: Hash muss ein SHA-256 sein", (await f({ hash: "abc" })) === "eingabe");
    pruefe("Kopf: Zahl der Pakete 0, zu viele, keine Ganzzahl", (await f({ pakete: 0 })) === "eingabe" && (await f({ pakete: 501 })) === "eingabe" && (await f({ pakete: 1.5 })) === "eingabe");
    pruefe("Kopf: unbekannte Quellenart", (await f({ quellenart: "erfunden" })) === "eingabe");
    pruefe("Kopf: Cluster passt nicht zur Art (Internetquelle im Cluster Bücher)", (await f({ quellenart: "internetquelle", cluster: "buecher", url: "https://example.org" })) === "clusterPasstNicht");
    pruefe("Kopf: Art mit Pflicht-Link ohne Link", (await f({ quellenart: "internetquelle", cluster: "internet" })) === "urlFehlt");
    pruefe("Kopf: ohne Cluster folgt der typische Cluster der Art", pruefeBuchKopf({ ...kopf, cluster: undefined }, ich, JETZT()).meta.cluster === "buecher");
  }

  // ---- Pakete schreiben ----------------------------------------------------------------------------------
  {
    const s = speicherNeu();
    const start = await starteBuch(kopf, ich, abh(s));
    pruefe("Start: schreibt nichts", start.quelleId === uploadQuelleId(hash) && s.zeilen.size === 0);

    const erg1 = await ladePaket({ ...kopf, nr: 1, text: pakete[0]! }, ich, abh(s));
    pruefe("Paket 1: Abschnitte geschrieben, Qualität vom Server gerechnet", erg1.chunks > 0 && s.zeilen.size === erg1.chunks && erg1.guete.note === "gut");
    const zeilen1 = [...s.zeilen.values()];
    pruefe("Paket 1: Zeilen tragen Paketnummer, Soll und Güte", zeilen1.every((z) => z.extra.paket === 1 && z.extra.pakete_gesamt === pakete.length && z.extra.guete === "gut"));
    pruefe("Paket 1: ungeprüft und Upload-Kennung", zeilen1.every((z) => z.pruefstatus === "ungeprueft" && z.quelle_id === uploadQuelleId(hash) && z.extra.quelle === "upload"));
    pruefe("Paket 1: Cluster und Art gespeichert", zeilen1.every((z) => z.quellenart === "fachliteratur" && z.cluster === "buecher"));

    const dok = await starteBuch(kopf, ich, abh(s)).then(() => null, (e) => (e instanceof UploadFehler ? e.code : "x"));
    pruefe("Start: ein angefangenes Buch gilt als vorhanden (Dublette)", dok === "doppelt");

    // unvollstaendig: nur Paket 1 von n
    const info1 = await s.ladeFreigabeInfo(uploadQuelleId(hash));
    pruefe("Unvollständig: Paket 1 von n gilt als unvollständig", info1.unvollstaendig === true);
    const frei1 = await fehlerCode(() =>
      entscheideUeberUpload("freigeben", uploadQuelleId(hash), { speicher: s, pruefer: { id: "admin-b" }, jetzt: JETZT, umgebung: {}, schema: "public_preview" }),
    );
    pruefe("Unvollständig: Freigeben wird abgelehnt", frei1 === "unvollstaendig", String(frei1));

    for (let i = 1; i < pakete.length; i++) await ladePaket({ ...kopf, nr: i + 1, text: pakete[i]! }, ich, abh(s));
    const ids = [...s.zeilen.keys()];
    pruefe("Alle Pakete: Abschnitts-IDs sind eindeutig", new Set(ids).size === ids.length && ids.length > pakete.length);
    const info = await s.ladeFreigabeInfo(uploadQuelleId(hash));
    pruefe("Alle Pakete: nicht mehr unvollständig", info.unvollstaendig === false && info.anzahl === s.zeilen.size);

    const selbst = await fehlerCode(() =>
      entscheideUeberUpload("freigeben", uploadQuelleId(hash), { speicher: s, pruefer: { id: ich.id }, jetzt: JETZT, umgebung: {}, schema: "public_preview" }),
    );
    pruefe("Vier-Augen: die hochladende Person gibt nicht frei", selbst !== null);
    const zweite = await entscheideUeberUpload("freigeben", uploadQuelleId(hash), { speicher: s, pruefer: { id: "admin-b" }, jetzt: JETZT, umgebung: {}, schema: "public_preview" });
    pruefe("Vier-Augen: eine zweite Person gibt das vollständige Buch frei", zweite.abschnitte === s.zeilen.size && [...s.zeilen.values()].every((z) => z.pruefstatus === "freigegeben"));
  }

  // ---- Fehler und Abbruch ---------------------------------------------------------------------------------
  {
    const s = speicherNeu();
    const f = (teil: Partial<BuchKopf> & { nr: number; text: string }) => fehlerCode(() => ladePaket({ ...kopf, ...teil }, ich, abh(s)));
    pruefe("Paket: Nummer 0 und über dem Soll", (await f({ nr: 0, text: pakete[0]! })) === "eingabe" && (await f({ nr: pakete.length + 1, text: pakete[0]! })) === "eingabe");
    pruefe("Paket: leerer Text", (await f({ nr: 1, text: "   " })) === "leer");
    pruefe("Paket: zu groß für eine Anfrage", (await f({ nr: 1, text: "Wort ".repeat(MAX_PAKET_ZEICHEN) })) === "zuGross");
    pruefe("Paket: Fehler hinterlassen nichts", s.zeilen.size === 0);

    // schlechter Text im Paket: der Server rechnet selbst, was der Browser sagt, zaehlt nicht
    await ladePaket({ ...kopf, nr: 1, text: "§$%&/()=?#*+~^°<>|{}[]@€ ".repeat(80) }, ich, abh(s));
    pruefe("Paket: schlechter Text wird vom Server als schlecht vermerkt", [...s.zeilen.values()].every((z) => z.extra.guete === "schlecht"));

    // Abbruch nach Paket 1: Loeschen raeumt alles samt Wortgewichten weg
    await ladePaket({ ...kopf, nr: 2, text: pakete[1]! }, ich, abh(s));
    pruefe("Abbruch: Zeilen und Wortgewichte sind da", s.zeilen.size > 0 && s.begriffe.size > 0);
    const weg = await loescheHochgeladenesDokument(uploadQuelleId(hash), { speicher: s, umgebung: {}, schema: "public_preview" });
    pruefe("Abbruch: Löschen entfernt alle Pakete", weg.geloescht > 0 && s.zeilen.size === 0);
    pruefe("Abbruch: Wortgewichte sind zurückgerechnet", s.begriffe.size === 0);

    const sp = speicherNeu();
    const code = await fehlerCode(() => ladePaket({ ...kopf, nr: 1, text: pakete[0]! }, ich, { ...abh(sp), umgebung: { VERCEL_ENV: "preview" }, schema: "public" }));
    pruefe("Umgebung: eine Vorschau mit dem Schema public schreibt nichts", code === "vorschau" && sp.zeilen.size === 0);
  }

  // ---- Einschaetzung --------------------------------------------------------------------------------
  {
    const zeile = (teil: Partial<WissenDokumentZeile> = {}): WissenDokumentZeile => ({
      schluessel: "upload:abc", schluesselSpalte: "quelle_id", titel: "Buch", bereich: "steuer", rollen: ["admin"], datum: null,
      hochgeladenVon: "A", hochgeladenVonId: "a", chunks: 120, herkunft: "upload", loeschbar: true, quellenart: "fachliteratur", cluster: "buecher",
      stufe: 4, rechtsstelle: null, nutzung: "ja", pruefstatus: "ungeprueft", pruefenBis: null, paketeGesamt: 3, paketeDa: 3, unvollstaendig: false,
      guete: "gut", gueteHinweise: [], abgelaufen: false, url: null, ...teil,
    });
    const codes = (teil: Partial<WissenDokumentZeile>) => schaetzeEin(zeile(teil)).gruende.map((g) => g.code);
    pruefe("Einschätzung: sauberes Buch wird zur Freigabe empfohlen", schaetzeEin(zeile()).empfehlung === "freigeben" && schaetzeEin(zeile()).gruende.length === 0);
    pruefe("Einschätzung: unvollständig führt zur Ablehnung", schaetzeEin(zeile({ unvollstaendig: true })).empfehlung === "ablehnen");
    pruefe("Einschätzung: schlechte OCR führt zur Ablehnung", schaetzeEin(zeile({ guete: "schlecht" })).empfehlung === "ablehnen");
    pruefe("Einschätzung: auffällige Güte heißt erst ansehen", schaetzeEin(zeile({ guete: "pruefen" })).empfehlung === "pruefen");
    pruefe("Einschätzung: ohne Einordnung erst ansehen", codes({ quellenart: null, cluster: null }).includes("ohneEinordnung"));
    pruefe("Einschätzung: Internetquelle ohne Link und mit ungültigem Link", codes({ cluster: "internet", url: null }).includes("ohneLink") && codes({ cluster: "internet", url: "kein link" }).includes("linkUngueltig") && !codes({ cluster: "internet", url: "https://adilet.zan.kz/rus/docs/K1700000120" }).includes("ohneLink"));
    pruefe("Einschätzung: Notbehelf ist nur eine Information und ändert die Empfehlung nicht", schaetzeEin(zeile({ nutzung: "notfalls", cluster: "internet", url: "https://habr.com/x/1" })).empfehlung === "freigeben" && codes({ nutzung: "notfalls" }).includes("notbehelf"));
    pruefe("Einschätzung: sehr kurzes Dokument erst ansehen", codes({ chunks: 1 }).includes("sehrKurz"));
    pruefe("Einschätzung: schwerster Befund zuerst", schaetzeEin(zeile({ unvollstaendig: true, guete: "pruefen" })).gruende[0]?.code === "unvollstaendig");
  }

  console.log(`\n${gesamt - fehler}/${gesamt} bestanden`);
  if (fehler > 0) process.exit(1);
}

void rest();
