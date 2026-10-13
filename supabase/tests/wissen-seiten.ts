// Tests fuer die Pruefung des Seitenverlaufs beim Buch-Upload (src/lib/wissen/seitenverlauf.ts), ohne Datenbank, ohne Netz, ohne PDF:
//   * Seitenzahl-Kandidaten aus Kopf- und Fusszeilen
//   * Verlauf: lueckenlos, fehlende Seiten (genau und ungefaehr), Rauschen, doppelte Seiten, neue Zaehlung, wenige oder keine Seitenzahlen
//   * Rand einer PDF-Seite aus den Positionen der Textstuecke (auch bei einem Foto der Seite)
//   * Artikelfolge bei Gesetzen (Verzeichnis zaehlt nicht, Nebennummern, aufgehobene Bereiche, vereinzelte Verweise)
//   * Kurzform fuer den Server
// Die Faelle spiegeln die echten Funde an den 20 Buechern vom 12.10.2026 (zum Beispiel Ordnungswidrigkeitenkodex: Seite 47 folgt 50).
// Aufruf: npm run test:wissen-seiten (laeuft ueber tsx, damit die @/-Pfade aufloesen).

import {
  alsSeitenAngabe,
  beschreibeArtikelLuecken,
  beschreibeLuecken,
  MAX_STELLEN,
  pruefeArtikelfolge,
  pruefeSeitenverlauf,
  randAusStuecken,
  seitenZahlKandidaten,
  type SeitenRand,
} from "@/lib/wissen/seitenverlauf";

let gesamt = 0;
let fehler = 0;
function pruefe(name: string, ok: boolean, detail = "") {
  gesamt++;
  if (!ok) fehler++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
}

/** Eine PDF-Seite je Eintrag: gedruckte Seitenzahl im Fuss, null = Seite ohne lesbare Zahl. */
function buch(gedruckt: readonly (number | null)[]): SeitenRand[] {
  return gedruckt.map((n) => ({ kopf: [], fuss: n === null ? [] : ["Kodex der Republik", String(n)], zeichen: 1800 }));
}
/** Gedruckte Seiten von 1 bis n, ohne die angegebenen (Seiten, die der Scanner uebersprungen hat). */
function ohne(n: number, fehlen: readonly number[]): number[] {
  const weg = new Set(fehlen);
  const aus: number[] = [];
  for (let i = 1; i <= n; i++) if (!weg.has(i)) aus.push(i);
  return aus;
}

// ---- Kandidaten -----------------------------------------------------------------------------------------------
{
  const k = (z: string[]) => [...seitenZahlKandidaten(z)].sort((a, b) => a - b).join(",");
  pruefe("Kandidaten: Zahl allein auf der Zeile", k(["47"]) === "47");
  pruefe("Kandidaten: Zahl mit Strichen und Punkten drumherum", k(["- 47 -"]) === "47" && k(["47."]) === "47" && k(["[47]"]) === "47");
  pruefe("Kandidaten: Zahl am Zeilenanfang und am Zeilenende (Kolumnentitel)", k(["72 Статья 90 – 91"]).includes("72") && k(["Статья 86 – 87 69"]).includes("69"));
  pruefe("Kandidaten: eine lange Kopfzeile mit Zahl am Anfang", k(["98 — Методические рекомендации по применению Международных стандартов аудита"]) === "98");
  pruefe("Kandidaten: Datum, Bruch und Satz mit Zahl mittendrin zaehlen nicht", k(["12.03.2026"]) === "" && k(["1/2"]) === "" && k(["siehe Artikel 5 des Gesetzes"]) === "");
  pruefe("Kandidaten: leer und Null", k([]) === "" && k(["0"]) === "");
}

// ---- Verlauf: lueckenlos ----------------------------------------------------------------------------------------
{
  const p = pruefeSeitenverlauf(buch(ohne(100, [])));
  pruefe("Verlauf: lückenlos, alle Seiten gelesen", p.geprueft && p.fehlend === 0 && p.luecken.length === 0 && p.abdeckung === 1 && !p.eingeschraenkt, JSON.stringify(p));
  const mitTitel = pruefeSeitenverlauf(buch([null, null, null, ...ohne(100, []), null, null]));
  pruefe("Verlauf: Titel, Verzeichnis und Rückseite ohne Zahl stören nicht", mitTitel.fehlend === 0 && mitTitel.erkannt === 100 && mitTitel.abdeckung === 1);
  const roemisch = pruefeSeitenverlauf(buch([null, null, null, null, null, null, ...ohne(60, [])]));
  pruefe("Verlauf: ungezählte Vorspannseiten verschieben den Versatz nur am Anfang", roemisch.fehlend === 0);
}

// ---- Verlauf: fehlende Seiten ---------------------------------------------------------------------------------
{
  const eine = pruefeSeitenverlauf(buch(ohne(100, [48, 49])));
  const l = eine.luecken[0];
  pruefe("Lücke: 48 und 49 fehlen (Seite 47 folgt 50)", eine.fehlend === 2 && eine.luecken.length === 1 && l?.vonGedruckt === 48 && l.bisGedruckt === 49 && l.anzahl === 2 && l.genau && l.nachPdfSeite === 47, JSON.stringify(eine.luecken));

  const einzelne = pruefeSeitenverlauf(buch(ohne(120, [60])));
  pruefe("Lücke: eine einzelne Seite", einzelne.fehlend === 1 && einzelne.luecken[0]?.vonGedruckt === 60 && einzelne.luecken[0]?.bisGedruckt === 60);

  // Die Befunde der echten Buecher: Ordnungswidrigkeitenkodex, 681 PDF-Seiten, 18 Seiten fehlen
  const koap = [48, 49, 168, 169, 276, 277, 296, 297, 310, 311, 440, 441, 442, 443, 526, 527, 662, 663];
  const alle = pruefeSeitenverlauf(buch(ohne(700, koap)));
  pruefe("Lücke: Ordnungswidrigkeitenkodex, 18 Seiten in 8 Stellen, alle gefunden", alle.fehlend === 18 && alle.luecken.length === 8, `${alle.fehlend} Seiten, ${alle.luecken.length} Stellen`);
  pruefe("Lücke: die Stellen stimmen (48-49, 440-443, 662-663)", alle.luecken.some((x) => x.vonGedruckt === 48 && x.bisGedruckt === 49) && alle.luecken.some((x) => x.vonGedruckt === 440 && x.bisGedruckt === 443 && x.anzahl === 4) && alle.luecken.some((x) => x.vonGedruckt === 662 && x.bisGedruckt === 663));
  pruefe("Lücke: Beschreibung für Anzeige und Speicher", beschreibeLuecken(alle.luecken).startsWith("48-49 (47), 168-169"));

  // Jede dritte Seite ohne lesbare Zahl: Die Zahl der fehlenden Seiten bleibt sicher, die Lage ist dann ein Bereich
  const luftig = ohne(300, [100, 101, 200, 201]).map((n, i) => (i % 3 === 0 ? null : n));
  const l2 = pruefeSeitenverlauf(buch(luftig));
  pruefe("Lücke: bei unlesbaren Nachbarseiten stimmt die Zahl der fehlenden Seiten", l2.fehlend === 4 && l2.luecken.reduce((s, x) => s + x.anzahl, 0) === 4, JSON.stringify(l2.luecken));
  pruefe("Lücke: nicht eindeutige Lage ist als Bereich gekennzeichnet", l2.luecken.every((x) => x.genau || (x.vonGedruckt <= 101 && x.bisGedruckt >= 100) || (x.vonGedruckt <= 201 && x.bisGedruckt >= 200)), JSON.stringify(l2.luecken));

  // Seite direkt vor der Luecke ohne Zahl: Bereich statt genauer Stelle
  const vor = buch([...ohne(39, []), null, ...Array.from({ length: 58 }, (_, i) => 43 + i)]);
  const pv = pruefeSeitenverlauf(vor);
  pruefe("Lücke: ist die Seite vor der Lücke ohne Zahl, kommt ein Bereich mit sicherer Anzahl", pv.fehlend === 2 && pv.luecken.length === 1 && !pv.luecken[0]!.genau && pv.luecken[0]!.anzahl === 2, JSON.stringify(pv.luecken));
}

// ---- Verlauf: Rauschen, doppelte Seiten, neue Zaehlung, wenige Seiten --------------------------------------------
{
  const rauschen = ohne(100, []).map((n) => (n === 30 ? 7 : n));
  pruefe("Rauschen: ein falsch gelesener Wert ohne Bestätigung ist keine Lücke", pruefeSeitenverlauf(buch(rauschen)).fehlend === 0);
  const jahr = pruefeSeitenverlauf(Array.from({ length: 60 }, (_, i) => ({ kopf: [], fuss: [i % 7 === 0 ? "Verlag 2026" : String(i + 1)], zeichen: 1500 })));
  pruefe("Rauschen: eine Jahreszahl im Fuss ist keine Seitenzahl", jahr.fehlend === 0 && jahr.luecken.length === 0);

  const doppelt = pruefeSeitenverlauf(buch([...ohne(50, []), ...ohne(100, []).slice(48)]));
  pruefe("Doppelte Seiten: der Versatz steigt, das ist nur ein Hinweis", doppelt.fehlend === 0 && doppelt.eingeschoben === 1 && doppelt.luecken.length === 0, JSON.stringify({ e: doppelt.eingeschoben, f: doppelt.fehlend }));

  const neu = pruefeSeitenverlauf(buch([...ohne(60, []), ...ohne(300, ohne(300, []).filter((n) => n < 200))]));
  pruefe("Neue Zählung (Anhang beginnt bei 200): Hinweis, keine Lücke", neu.fehlend === 0 && neu.neuzaehlungen === 1, JSON.stringify({ n: neu.neuzaehlungen, f: neu.fehlend }));

  const kurz = pruefeSeitenverlauf(buch(ohne(8, [])));
  pruefe("Zu kurz: unter 12 Seiten wird nicht geprüft", !kurz.geprueft && kurz.fehlend === 0);

  const ohneZahlen = pruefeSeitenverlauf(buch(Array.from({ length: 80 }, () => null)));
  pruefe("Ohne lesbare Seitenzahl: eingeschränkt, keine Lücke behauptet", ohneZahlen.geprueft && ohneZahlen.eingeschraenkt && ohneZahlen.fehlend === 0 && ohneZahlen.erkannt === 0);

  const wenige = pruefeSeitenverlauf(buch(ohne(200, []).map((n) => (n % 5 === 0 ? n : null))));
  pruefe("Wenig Zahlen (jede fünfte Seite): keine Lücke behauptet, Prüfung eingeschränkt", wenige.fehlend === 0 && wenige.eingeschraenkt, JSON.stringify({ a: wenige.abdeckung, e: wenige.eingeschraenkt }));
  const sehrWenige = pruefeSeitenverlauf(buch(ohne(300, []).map((n) => (n % 8 === 0 ? n : null))));
  pruefe("Sehr wenig Zahlen (jede achte Seite): Hinweis auf eingeschränkte Prüfung", sehrWenige.eingeschraenkt && sehrWenige.fehlend === 0, JSON.stringify({ a: sehrWenige.abdeckung }));

  const leerSeiten = buch(ohne(100, [])).map((s, i) => (i === 49 ? { ...s, zeichen: 3 } : s));
  const ls = pruefeSeitenverlauf(leerSeiten);
  pruefe("Seite ohne Text mitten im Buch wird gemeldet", ls.ohneText.length === 1 && ls.ohneText[0] === 50);
  const randSeiten = buch(ohne(100, [])).map((s, i) => (i === 1 || i === 99 ? { ...s, zeichen: 0 } : s));
  pruefe("Leere zweite und letzte Seite (Innentitel, Rückseite) werden nicht gemeldet", pruefeSeitenverlauf(randSeiten).ohneText.length === 0);
}

// ---- Rand aus den Positionen ----------------------------------------------------------------------------------------
{
  const h = 800;
  const fuss = randAusStuecken(
    [
      { str: "Der Text steht mitten auf der Seite.", x: 80, y: 300 },
      { str: "und geht weiter.", x: 80, y: 330 },
      { str: "47", x: 400, y: 770 },
    ],
    h,
    120,
  );
  pruefe("Rand: Seitenzahl unten wird als Fusszeile erkannt", fuss.fuss.includes("47") && fuss.zeichen === 120);
  const kopfSeite = randAusStuecken([{ str: "98", x: 40, y: 30 }, { str: "Methodische Hinweise", x: 80, y: 31 }, { str: "Fliesstext", x: 80, y: 400 }], h, 50);
  pruefe("Rand: Stücke auf gleicher Höhe bilden eine Zeile (Zahl und Kolumnentitel)", kopfSeite.kopf.some((z) => z === "98 Methodische Hinweise"), JSON.stringify(kopfSeite.kopf));
  // Foto der Seite: Der Text liegt in der Mitte der Datei, die Seitenzahl am Ende des Textblocks
  const foto = randAusStuecken([{ str: "Absatz eins", x: 200, y: 240 }, { str: "Absatz zwei", x: 200, y: 300 }, { str: "Absatz drei", x: 200, y: 360 }, { str: "661", x: 420, y: 520 }], h, 400);
  pruefe("Rand: bei einem Foto der Seite zählt das Ende des Textblocks", foto.fuss.includes("661"), JSON.stringify(foto));
  pruefe("Rand: ohne Höhe oder Text bleibt der Rand leer", randAusStuecken([], 800, 0).fuss.length === 0 && randAusStuecken([{ str: "x", x: 0, y: 5 }], 0, 1).kopf.length === 0);
}

// ---- Artikelfolge --------------------------------------------------------------------------------------------------------
{
  const artikel = (nummern: number[]) => nummern.map((n) => `**Статья ${n}.** Gegenstand ${n}\n1. Der Text des Artikels ${n} steht hier und geht über mehrere Zeilen.`).join("\n\n");
  const bis = (n: number, ohneNr: number[] = []) => Array.from({ length: n }, (_, i) => i + 1).filter((x) => !ohneNr.includes(x));

  const voll = pruefeArtikelfolge(artikel(bis(120)));
  pruefe("Artikel: lückenlose Folge", voll !== null && voll.fehlend === 0 && voll.kleinste === 1 && voll.groesste === 120);

  const luecke = pruefeArtikelfolge(artikel(bis(120, [40, 41, 42, 77])));
  pruefe("Artikel: fehlende Nummern als Bereiche (40-42 und 77)", luecke !== null && luecke.fehlend === 4 && beschreibeArtikelLuecken(luecke.luecken) === "40-42, 77", JSON.stringify(luecke));

  const verzeichnis = "INHALT\n\n" + [40, 41, 42].map((n) => `Статья ${n}. Gegenstand ${n} ........................ ${n + 10}`).join("\n") + "\n\n";
  const mitVerz = pruefeArtikelfolge(verzeichnis + artikel(bis(120, [40, 41, 42])));
  pruefe("Artikel: das Inhaltsverzeichnis verdeckt keine Lücke", mitVerz !== null && mitVerz.fehlend === 3, JSON.stringify(mitVerz));

  const nebenNr = pruefeArtikelfolge(artikel(bis(100, [50])) + "\n\n**Статья 50-1.** Eingefügter Artikel\nText.");
  pruefe("Artikel: eine Nebennummer (50-1) ersetzt Artikel 50 nicht", nebenNr !== null && nebenNr.fehlend === 1 && nebenNr.luecken[0]?.[0] === 50);

  const aufgehoben = pruefeArtikelfolge(artikel(bis(100, [60, 61, 62])) + "\n\nСтатьи 60-62. Исключены в соответствии с Законом.");
  pruefe("Artikel: ein aufgehobener Bereich (Статьи 60-62) gilt als vorhanden", aufgehoben !== null && aufgehoben.fehlend === 0, JSON.stringify(aufgehoben));

  pruefe("Artikel: weniger als 30 Überschriften ist kein Gesetz", pruefeArtikelfolge(artikel(bis(20))) === null);

  const verweis = pruefeArtikelfolge(artikel(bis(100)) + "\n\nNach Artikel 140 gilt etwas anderes, siehe auch Статья 5. und statьи 9.");
  pruefe("Artikel: ein Verweis im Satz verlängert die Folge nicht", verweis !== null && verweis.groesste === 100 && verweis.fehlend === 0, JSON.stringify(verweis));

  const beginnt407 = pruefeArtikelfolge("Fußnote: siehe Статья 6.\n\n" + artikel(Array.from({ length: 80 }, (_, i) => 407 + i)));
  pruefe("Artikel: ein Buch, das bei 407 beginnt, wird nicht von einem vereinzelten Verweis aufgezogen", beginnt407 !== null && beginnt407.kleinste === 407 && beginnt407.fehlend === 0, JSON.stringify(beginnt407));

  const deutsch = "§ 1 Anwendungsbereich\nText.\n\n" + Array.from({ length: 60 }, (_, i) => `Artikel ${i + 2}\nText des Artikels ${i + 2}.`).join("\n\n") + "\n\nAls Folge von Artikel 99 gilt Folgendes, wie in Artikel 100 bestimmt.";
  const de = pruefeArtikelfolge(deutsch);
  pruefe("Artikel: deutsche Überschriften am Zeilenanfang, Verweise im Satz zählen nicht", de !== null && de.groesste === 61 && de.fehlend === 0, JSON.stringify(de));
}

// ---- Kurzform fuer den Server ------------------------------------------------------------------------------------------
{
  const p = pruefeSeitenverlauf(buch(ohne(300, [48, 49, 200])));
  const a = alsSeitenAngabe(p, null);
  pruefe("Angabe: Zahlen und Stellen", a.seiten === 297 && a.fehlend === 3 && a.stellen.startsWith("48-49") && a.abdeckung === 100 && a.artikelFehlend === undefined, JSON.stringify(a));
  const g = alsSeitenAngabe(p, { artikel: 100, kleinste: 1, groesste: 100, luecken: [[85, 89]], fehlend: 5 });
  pruefe("Angabe: Artikelhinweis nur, wenn mitgegeben", g.artikelFehlend === 5 && g.artikelStellen === "85-89");
  const lang = alsSeitenAngabe({ ...p, luecken: Array.from({ length: 200 }, (_, i) => ({ nachPdfSeite: i, vonGedruckt: i * 10, bisGedruckt: i * 10 + 1, anzahl: 2, genau: true })) }, null);
  pruefe("Angabe: die Stellenangabe bleibt kurz (höchstens MAX_STELLEN Zeichen)", lang.stellen.length <= MAX_STELLEN && lang.stellen.endsWith(" +160") && /^[0-9@(),+\-\sPDF]*$/.test(lang.stellen), String(lang.stellen.length));
}

// ---- Lücke mit einer Seite ohne lesbare Zahl (Buchhalter-Nachschlagewerk, 13.10.2026) ---------------------------
// Die Texterkennung las auf einer Seite zwischen den sicheren Stellen keine Zahl (im Bild stand sie). Die Anzahl der fehlenden Seiten ist sicher, die Lage
// nur ein Bereich: Die Angabe darf dann nicht "nach PDF-Seite X" behaupten, sondern nennt die PDF-Seiten, in denen die Lücke liegt.
{
  // PDF-Seite 1 bis 104 tragen 1 bis 104, PDF-Seite 105 hat keine lesbare Zahl, PDF-Seite 106 trägt 108: Zwei Seiten fehlen irgendwo zwischen 105 und 107.
  const fortsetzung = Array.from({ length: 33 }, (_, i) => 108 + i);
  const p = pruefeSeitenverlauf(buch([...ohne(104, []), null, ...fortsetzung]));
  const l = p.luecken[0];
  pruefe("Unscharfe Lücke: die Anzahl ist sicher (2), die Lage ein Bereich (genau false)", p.fehlend === 2 && p.luecken.length === 1 && l?.anzahl === 2 && l.genau === false, JSON.stringify(l));
  pruefe("Unscharfe Lücke: gedruckter Bereich 105 bis 107", l?.vonGedruckt === 105 && l.bisGedruckt === 107, JSON.stringify(l));
  pruefe("Unscharfe Lücke: die PDF-Seiten von der letzten sicheren bis zur nächsten sicheren (104 bis 106), nicht nur \"danach\"", l?.nachPdfSeite === 104 && l.bisPdfSeite === 106, JSON.stringify(l));
  pruefe("Unscharfe Lücke: die Kurzform nennt den PDF-Bereich", beschreibeLuecken(p.luecken) === "2@105-107 (PDF 104-106)", beschreibeLuecken(p.luecken));
  pruefe("Unscharfe Lücke: die Kurzform für den Server enthält denselben Text", alsSeitenAngabe(p, null).stellen === "2@105-107 (PDF 104-106)");

  // Gegenprobe: Ist die Zahl auf der Seite dazwischen lesbar (105), ist die Lücke genau (106 und 107) und trägt kein bisPdfSeite
  const genau = pruefeSeitenverlauf(buch([...ohne(104, []), 105, ...fortsetzung]));
  pruefe("Gegenprobe: mit lesbarer Zahl auf der Seite dazwischen ist die Lücke genau (106 und 107)", genau.luecken.length === 1 && genau.luecken[0]?.genau === true && genau.luecken[0]?.vonGedruckt === 106 && genau.luecken[0]?.bisGedruckt === 107 && genau.luecken[0]?.bisPdfSeite === undefined, JSON.stringify(genau.luecken));

  // Wie im echten Buch: eine unscharfe Stelle, später eine genaue; jede unscharfe trägt ihren Bereich, die genaue nicht
  const gemischt = pruefeSeitenverlauf(buch([...ohne(104, []), null, ...Array.from({ length: 12 }, (_, i) => 108 + i), ...Array.from({ length: 30 }, (_, i) => 122 + i)]));
  const unscharf = gemischt.luecken.filter((x) => !x.genau);
  pruefe("Gemischt: die unscharfe Lücke trägt ihren PDF-Bereich", unscharf.length === 1 && unscharf[0]?.bisPdfSeite === 106, JSON.stringify(gemischt.luecken));
  pruefe("Gemischt: ein späterer Sprung ohne Zwischenseite bleibt genau (120 und 121)", gemischt.luecken.some((x) => x.genau && x.vonGedruckt === 120 && x.bisGedruckt === 121 && x.bisPdfSeite === undefined), JSON.stringify(gemischt.luecken));
}

console.log(`\n${gesamt - fehler}/${gesamt} bestanden`);
process.exit(fehler > 0 ? 1 : 0);
