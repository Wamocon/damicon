// Tests fuer die Qualitaet eines Dokuments in Prozent (src/lib/wissen/qualitaet.ts, textguete.ts), ohne Datenbank und ohne Netz:
//   * Vollstaendigkeitsfaktor aus fehlenden Seiten
//   * Pakete in Buchreihenfolge
//   * Dokumentwert: sauberer Text, schlecht gelesener Text, Gewichtung nach Zeichen, leere Dokumente, Abzug fuer fehlende Seiten
//   * Ton der Anzeige
//   * Uebernahme in die Dokumentliste (gruppiereWissenDokumente)
// Aufruf: npm run test:wissen-qualitaet (laeuft ueber tsx, damit die @/-Pfade aufloesen).

import { gruppiereWissenDokumente, type WissenListeZeile } from "@/lib/wissen/dokumente-liste";
import { dokumentQualitaet, inPakete, qualitaetTon, vollstaendigkeitsFaktor } from "@/lib/wissen/qualitaet";
import { bewerteText } from "@/lib/wissen/textguete";

let gesamt = 0;
let fehler = 0;
function pruefe(name: string, ok: boolean, detail = "") {
  gesamt++;
  if (!ok) fehler++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}${ok ? "" : ` ${detail}`}`);
}

const SAUBER =
  "Der Arbeitgeber ist verpflichtet, dem Arbeitnehmer spätestens einen Monat nach dem vereinbarten Beginn des Arbeitsverhältnisses die wesentlichen Vertragsbedingungen schriftlich niederzulegen, die Niederschrift zu unterzeichnen und dem Arbeitnehmer auszuhändigen. In die Niederschrift sind mindestens aufzunehmen: der Name und die Anschrift der Vertragsparteien, der Zeitpunkt des Beginns des Arbeitsverhältnisses, die Dauer der Probezeit sowie die vereinbarte Arbeitszeit und die Zusammensetzung des Arbeitsentgelts. ";
// Schlecht gelesene Seite: Zeichensalat und zerhackte Woerter, wie sie bei einem schlechten Scan entstehen.
const KAPUTT =
  "D e r  A r b e i t g | b e r  i s t  v e r p f l | c h t e t ,  # ~ ^  d e m  A r b | i t n e h m | r  s p ~ t | s t e n s  e i n e n  M o n a t  § $ % &  n | c h  d | m  v e r e i n b a r t | n  B e g i n n  ] [ {  } \\ |  d | s  A r b | i t s v | r h ~ l t n | s s | s  ";
const wiederhole = (text: string, n: number) => text.repeat(n);

// --- Vollstaendigkeitsfaktor
pruefe("Faktor: nichts bekannt ergibt 1", vollstaendigkeitsFaktor(null) === 1 && vollstaendigkeitsFaktor(undefined) === 1);
pruefe("Faktor: keine fehlenden Seiten ergibt 1", vollstaendigkeitsFaktor({ seiten: 681, fehlend: 0 }) === 1);
pruefe("Faktor: 0 Seiten insgesamt ergibt 1 (keine Teilung durch 0)", vollstaendigkeitsFaktor({ seiten: 0, fehlend: 3 }) === 1);
{
  const f = vollstaendigkeitsFaktor({ seiten: 681, fehlend: 18 });
  pruefe("Faktor: 18 von 681 Seiten fehlen, das mindert um etwa 13 Prozent", Math.abs(f - (1 - 90 / 681)) < 1e-9 && f > 0.86 && f < 0.88, String(f));
}
pruefe("Faktor: nie unter 0,5", vollstaendigkeitsFaktor({ seiten: 100, fehlend: 60 }) === 0.5);

// --- Pakete
{
  const p = inPakete(["a".repeat(50), "b".repeat(50), "c".repeat(50)], 120);
  pruefe("Pakete: Texte werden bis zur Grenze zusammengesetzt, danach beginnt ein neues Paket", p.length === 2 && p[0].startsWith("a") && p[0].includes("b") && p[1].startsWith("c"), JSON.stringify(p.map((x) => x.length)));
  pruefe("Pakete: ein zu langer Einzeltext bleibt ein Paket für sich", inPakete(["x".repeat(500), "y"], 100).length === 2);
  pruefe("Pakete: ohne Texte keine Pakete", inPakete([]).length === 0);
}

// --- Dokumentwert
{
  const q = dokumentQualitaet([wiederhole(SAUBER, 6)]);
  pruefe("Dokument: sauberer Text liegt bei 90 Prozent und mehr, Note gut", q !== null && q.prozent >= 90 && q.note === "gut", JSON.stringify(q));
}
{
  const gut = dokumentQualitaet([wiederhole(SAUBER, 6)]);
  const schlecht = dokumentQualitaet([wiederhole(KAPUTT, 12)]);
  pruefe("Dokument: schlecht gelesener Text liegt deutlich unter dem sauberen Text", gut !== null && schlecht !== null && schlecht.prozent < gut.prozent - 20, JSON.stringify({ gut, schlecht }));
  pruefe("Dokument: schlecht gelesener Text hat nicht die Note gut", schlecht !== null && schlecht.note !== "gut", JSON.stringify(schlecht));
}
{
  // Gewichtung nach Zeichen: ein kleiner schlechter Teil zieht ein langes sauberes Buch kaum herunter, ein grosser schon.
  const sauberLang = wiederhole(SAUBER, 400);
  const kleinKaputt = wiederhole(KAPUTT, 5);
  const grossKaputt = wiederhole(KAPUTT, 800);
  const a = dokumentQualitaet([sauberLang, kleinKaputt]);
  const b = dokumentQualitaet([sauberLang, grossKaputt]);
  const rein = dokumentQualitaet([sauberLang]);
  pruefe("Gewichtung: ein kleiner schlechter Teil mindert wenig", a !== null && rein !== null && rein.prozent - a.prozent <= 5, JSON.stringify({ a, rein }));
  pruefe("Gewichtung: ein grosser schlechter Teil mindert deutlich mehr", a !== null && b !== null && b.prozent < a.prozent - 10, JSON.stringify({ a, b }));
}
pruefe("Dokument: leere und leere Zeichenfolgen ergeben keinen Wert", dokumentQualitaet([]) === null && dokumentQualitaet(["", "   ", "\n"]) === null);
{
  const ohne = dokumentQualitaet([wiederhole(SAUBER, 6)]);
  const mit = dokumentQualitaet([wiederhole(SAUBER, 6)], { seiten: 681, fehlend: 18 });
  pruefe("Dokument: fehlende Seiten senken den Wert um den Vollständigkeitsfaktor", ohne !== null && mit !== null && mit.prozent < ohne.prozent && Math.abs(mit.prozent - ohne.prozent * (1 - 90 / 681)) <= 1, JSON.stringify({ ohne, mit }));
}
{
  const q = dokumentQualitaet([wiederhole(SAUBER, 3)]);
  pruefe("Dokument: der Wert ist eine ganze Zahl zwischen 0 und 100", q !== null && Number.isInteger(q.prozent) && q.prozent >= 0 && q.prozent <= 100);
}
{
  // Verzeichnis und Register zaehlen nicht gegen ein Buch: derselbe Wert wie der Text allein (siehe ohneVerzeichnisse in textguete.ts).
  const verzeichnis = Array.from({ length: 40 }, (_, i) => `§ ${i + 1} Begriffsbestimmungen und Geltungsbereich .......... ${i + 3}`).join("\n");
  const q = dokumentQualitaet([verzeichnis + "\n\n" + wiederhole(SAUBER, 6)]);
  pruefe("Dokument: ein Inhaltsverzeichnis mit Punktlinien mindert nicht", q !== null && q.prozent >= 90, JSON.stringify(q));
}
{
  const g = bewerteText(wiederhole(SAUBER, 6), false);
  pruefe("bewerteText liefert prozent als ganze Zahl von 0 bis 100", Number.isInteger(g.prozent) && g.prozent >= 0 && g.prozent <= 100, String(g.prozent));
}

// --- Ton
pruefe("Ton: ab 90 gut, ab 75 zu prüfen, darunter schlecht", qualitaetTon(95) === "success" && qualitaetTon(90) === "success" && qualitaetTon(89) === "warning" && qualitaetTon(75) === "warning" && qualitaetTon(74) === "danger" && qualitaetTon(0) === "danger");

// --- Dokumentliste
{
  const zeile = (id: string, quelle: string, prozent: number | null | undefined): WissenListeZeile => ({
    id,
    quelle_id: quelle,
    pfad: null,
    titel: quelle,
    bereich: "legal",
    rollen: [],
    eingelesen_am: null,
    upload_quelle: "upload",
    hochgeladen_von: null,
    ...(prozent === undefined ? {} : { guete_prozent: prozent }),
  });
  const liste = gruppiereWissenDokumente([zeile("1", "upload:aaa", 96), zeile("2", "upload:aaa", 96), zeile("3", "upload:bbb", null), zeile("4", "upload:ccc", undefined)]);
  const nach = (k: string) => liste.find((d) => d.schluessel === k);
  pruefe("Liste: der Qualitätswert kommt am Dokument an", nach("upload:aaa")?.gueteProzent === 96);
  pruefe("Liste: ohne Wert (null oder fehlend) bleibt null", nach("upload:bbb")?.gueteProzent === null && nach("upload:ccc")?.gueteProzent === null);
  pruefe("Liste: ein Dokument mit mehreren Zeilen ergibt eine Zeile", liste.filter((d) => d.schluessel === "upload:aaa").length === 1);
}

console.log(`\n${gesamt - fehler}/${gesamt} bestanden`);
process.exit(fehler > 0 ? 1 : 0);
