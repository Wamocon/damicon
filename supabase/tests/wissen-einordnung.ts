import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { gruppiereWissenDokumente, ohneEinordnung, type WissenListeZeile } from "../../src/lib/wissen/dokumente-liste";
import { MAX_ZUORDNUNGEN, ordneBestandEin, pruefeZuordnungen } from "../../src/lib/wissen/einordnen";
import { hostVon, istAmtlicheSeite, schlageVor } from "../../src/lib/wissen/einordnung-vorschlag";
import { wirkungVon } from "../../src/lib/wissen/einordnung-wirkung";
import { CLUSTER, clusterPasst, istCluster, QUELLENARTEN, standardStufe } from "../../src/lib/wissen/quellenart";

// Bestand einordnen (Administration, Seite Wissensbasis): Vorschlag (einordnung-vorschlag.ts), Wirkung auf die Suche
// (einordnung-wirkung.ts) und das Schreiben (einordnen.ts). Ohne Datenbank: das Schreiben laeuft gegen einen kleinen Ersatz,
// der die Abfragekette von PostgREST nachbildet und festhaelt, WAS geschrieben wird.

let bestanden = 0;
let fehlgeschlagen = 0;
function pruefe(name: string, bedingung: boolean, zusatz = "") {
  if (bedingung) {
    bestanden++;
    console.log(`PASS  ${name}${zusatz ? "  - " + zusatz : ""}`);
  } else {
    fehlgeschlagen++;
    console.log(`FAIL  ${name}${zusatz ? "  - " + zusatz : ""}`);
  }
}
const lies = (pfad: string) => readFileSync(pfad, "utf8");

// --- 1. Vorschlag ---------------------------------------------------------------------------------
const v = (url: string | null, stufe: number | null, rechtsstelle: string | null = null) => schlageVor({ url, stufe, rechtsstelle });
const behoerde = v("https://www.aifc.kz/steuerregime", 3);
pruefe("Vorschlag: amtliche Seite und Stufe 3 (AIFC-Steuerregime) -> Behoerdeninformation, Cluster Internet, sicher", behoerde.quellenart === "behoerdeninfo" && behoerde.cluster === "internet" && behoerde.sicherheit === "hoch" && behoerde.grund === "amtlicheSeite" && behoerde.host === "aifc.kz");
pruefe("Vorschlag: amtliche Seite und Stufe 1 -> Rechtsnorm, Stufe 2 -> Verwaltungsanweisung, beide sicher, Cluster Internet", v("https://adilet.zan.kz/rus/docs/Z1", 1).quellenart === "rechtsnorm" && v("https://adilet.zan.kz/x", 1).cluster === "internet" && v("https://www.gov.kz/x", 2).quellenart === "verwaltungsanweisung" && v("https://www.gov.kz/x", 2).sicherheit === "hoch");
pruefe("Vorschlag: eine Rechtsstelle auf einer amtlichen Seite (Stufe 1 oder ohne Stufe) macht es zur Rechtsnorm; bei Stufe 3 bleibt es eine Behoerdeninformation", v("https://www.gesetze-im-internet.de/estg", 1, "§ 1 EStG").quellenart === "rechtsnorm" && v("https://www.gesetze-im-internet.de/estg", 1, "§ 1 EStG").grund === "rechtsstelle" && v("https://www.gesetze-im-internet.de/estg", null, "§ 1 EStG").quellenart === "rechtsnorm" && v("https://www.gesetze-im-internet.de/estg", 3, "§ 1 EStG").quellenart === "behoerdeninfo");
pruefe("Vorschlag: amtliche Seite mit Stufe 5 widerspricht sich leicht -> Behoerdeninformation, nur plausibel", v("https://www.gov.kz/x", 5).quellenart === "behoerdeninfo" && v("https://www.gov.kz/x", 5).sicherheit === "mittel");
pruefe("Vorschlag: Wikipedia -> Internetquelle, Forum und Q&A -> Forum (sicher), Blog -> Internetquelle", v("https://de.wikipedia.org/wiki/X", 5).quellenart === "internetquelle" && v("https://www.reddit.com/r/x", 5).quellenart === "forum" && v("https://www.reddit.com/r/x", 5).sicherheit === "hoch" && v("https://forum.beispiel.de/t/1", 5).quellenart === "forum" && v("https://medium.com/x", 5).quellenart === "internetquelle" && v("https://blog.beispiel.de/x", 5).grund === "blog");
pruefe("Vorschlag: unbekannte Seite folgt der bisherigen Stufe (4 Fachliteratur, 5 Internetquelle), Cluster Internet, plausibel", v("https://fachverlag.example/x", 4).quellenart === "fachliteratur" && v("https://fachverlag.example/x", 5).quellenart === "internetquelle" && v("https://fachverlag.example/x", 4).sicherheit === "mittel" && v("https://fachverlag.example/x", 4).cluster === "internet");
pruefe("Vorschlag: nennt die Stufe Recht (1 bis 3), die Seite ist aber nicht als amtlich bekannt, widersprechen sich die Hinweise -> unsicher", v("https://unbekannt.example/x", 2).sicherheit === "niedrig" && v("https://unbekannt.example/x", 2).quellenart === "verwaltungsanweisung");
pruefe("Vorschlag: ohne Link nur die Stufe, der Cluster bleibt offen, unsicher; ohne beides gar nichts", v(null, 4).cluster === null && v(null, 4).sicherheit === "niedrig" && v(null, 4).grund === "keinLink" && v(null, 4).quellenart === "fachliteratur" && v(null, null).quellenart === null && v("kein link", 3).cluster === null);
pruefe("Vorschlag: hostVon entfernt www und liefert null bei ungueltigen Links", hostVon("https://www.Beispiel.de/a") === "beispiel.de" && hostVon("kein link") === null && hostVon(null) === null && hostVon("") === null);
pruefe("Vorschlag: gov.com ist keine amtliche Seite, gov.kz, gov.uk und die Top-Level-Domain gov sind es", !istAmtlicheSeite("fake.gov.com") && !istAmtlicheSeite("evilgov.kz") && istAmtlicheSeite("gov.kz") && istAmtlicheSeite("nalog.gov.ru") && istAmtlicheSeite("irs.gov") && istAmtlicheSeite("afsa.aifc.kz"));
{
  // Jeder Vorschlag ist ein gueltiger Wert: bekannte Art, bekannter Cluster, und beide passen zusammen.
  const urls = [null, "kein link", "https://www.gov.kz/a", "https://de.wikipedia.org/x", "https://www.reddit.com/r/a", "https://medium.com/a", "https://x.example/a", "https://adilet.zan.kz/a"];
  let ungueltig = 0;
  for (const url of urls) for (const stufe of [null, 0, 1, 2, 3, 4, 5, 6]) for (const rs of [null, "§ 1"]) {
    const x = v(url, stufe, rs);
    if (x.quellenart !== null && !(QUELLENARTEN as readonly string[]).includes(x.quellenart)) ungueltig++;
    if (x.cluster !== null && !istCluster(x.cluster)) ungueltig++;
    if (x.quellenart !== null && x.cluster !== null && !clusterPasst(x.quellenart, x.cluster)) ungueltig++;
  }
  pruefe("Vorschlag: ueber alle Kombinationen aus Link, Stufe und Rechtsstelle nur bekannte Arten und Cluster, die zusammenpassen", ungueltig === 0, `${ungueltig} ungueltig`);
}

// --- 2. Wirkung -----------------------------------------------------------------------------------
const zeile = (id: string, titel: string, bereich: string, stufe: number | null, extra: Partial<WissenListeZeile> = {}): WissenListeZeile => ({
  id, quelle_id: `q-${id}`, pfad: `p/${id}.md`, titel, bereich, rollen: ["admin"], eingelesen_am: "2026-01-01", upload_quelle: null, hochgeladen_von: null,
  autoritaetsstufe: stufe, quellenart: null, cluster: null, pruefstatus: "freigegeben", pruefen_bis: null, url: "https://x.example/a", rechtsstelle: null, ...extra,
});
const doks = gruppiereWissenDokumente([
  zeile("a", "Presse im Recht", "legal", 5), zeile("a2", "Presse im Recht", "legal", 5, { quelle_id: "q-a" }),
  zeile("b", "Presse im Risiko", "risiko", 5),
  zeile("c", "Amtlich", "legal", 3),
  zeile("d", "Presse wird Gesetz", "legal", 5),
  zeile("e", "Gesetz wird Forum", "risiko", 1),
  zeile("f", "Schon eingeordnet", "legal", 4, { quellenart: "fachliteratur", cluster: "buecher" }),
]);
const w = wirkungVon(doks, [
  { schluessel: "q-a", quellenart: "internetquelle", cluster: "internet" },
  { schluessel: "q-b", quellenart: "internetquelle", cluster: "internet" },
  { schluessel: "q-c", quellenart: "behoerdeninfo", cluster: "internet" },
  { schluessel: "q-d", quellenart: "rechtsnorm", cluster: "internet" },
  { schluessel: "q-e", quellenart: "forum", cluster: "internet" },
  { schluessel: "q-f", quellenart: "rechtsnorm", cluster: "publikationen" },
  { schluessel: "q-gibtsnicht", quellenart: "rechtsnorm", cluster: "internet" },
  { schluessel: "q-c", quellenart: "forum", cluster: "buecher" },
]);
pruefe("Wirkung: Internetquelle im Bereich Recht ist danach nicht mehr auffindbar, im Risiko nur noch Hinweis", w.gesperrt.map((z) => z.schluessel).join() === "q-a" && w.nurHinweis.map((z) => z.schluessel).sort().join() === "q-b,q-e");
pruefe("Wirkung: Abschnitte werden je Dokument gezaehlt (q-a hat zwei Zeilen)", w.abschnitte === 2 + 1 + 1 + 1 + 1 && w.dokumente === 5, `${w.dokumente} Dokumente, ${w.abschnitte} Abschnitte`);
pruefe("Wirkung: Stufe 3 als Behoerdeninformation aendert nichts (Stufe 3, tragend)", !w.stufeGeaendert.some((z) => z.schluessel === "q-c"));
pruefe("Wirkung: Stufe 5 als Rechtsnorm steigt auf 1 und bekommt Zugang zu den reservierten Plaetzen", w.kommenInPrimaer.map((z) => z.schluessel).join() === "q-d" && w.stufeGeaendert.some((z) => z.schluessel === "q-d" && z.stufeAlt === 5 && z.stufeNeu === 1));
pruefe("Wirkung: Stufe 1 als Forum faellt auf 5 und verliert den reservierten Platz", w.verlassenPrimaer.map((z) => z.schluessel).join() === "q-e");
pruefe("Wirkung: eine Zuordnung zu einem unbekannten oder schon eingeordneten Dokument oder mit unpassendem Cluster wird abgelehnt und nirgends gezaehlt", w.abgelehnt.sort().join() === "q-c,q-f,q-gibtsnicht" || w.abgelehnt.sort().join() === "q-f,q-gibtsnicht,q-c" || (w.abgelehnt.length === 3 && w.abgelehnt.includes("q-f") && w.abgelehnt.includes("q-gibtsnicht") && w.abgelehnt.includes("q-c")), w.abgelehnt.join());
pruefe("Wirkung: die Stufe der Einordnung ist die der Quellenart (wie beim Upload)", w.stufeGeaendert.every((z) => QUELLENARTEN.some((a) => standardStufe(a) === z.stufeNeu)) && standardStufe("rechtsnorm") === 1);
pruefe("Liste: ohneEinordnung ist wahr, wenn Art oder Cluster fehlt", ohneEinordnung({ quellenart: null, cluster: null }) && ohneEinordnung({ quellenart: "forum", cluster: null }) && ohneEinordnung({ quellenart: null, cluster: "internet" }) && !ohneEinordnung({ quellenart: "forum", cluster: "internet" }));
pruefe("Liste: Rechtsstelle und Schluesselspalte (quelle_id, sonst pfad, sonst id) stehen je Dokument", doks.find((d) => d.schluessel === "q-a")!.schluesselSpalte === "quelle_id" && gruppiereWissenDokumente([zeile("z", "Ohne Quelle", "legal", 3, { quelle_id: null, rechtsstelle: "Art. 5" })])[0]!.schluesselSpalte === "pfad" && gruppiereWissenDokumente([zeile("z", "Nur id", "legal", 3, { quelle_id: null, pfad: null, rechtsstelle: "Art. 5" })])[0]!.schluesselSpalte === "id");

// --- 3. Pruefung der Eingabe ---------------------------------------------------------------------
{
  const gut = { schluessel: "q-1", schluesselSpalte: "quelle_id", quellenart: "rechtsnorm", cluster: "internet" };
  pruefe("Eingabe: eine gueltige Zuordnung kommt durch", pruefeZuordnungen([gut]).gueltig.length === 1 && pruefeZuordnungen([gut]).ungueltig === 0);
  const schlecht = [
    { ...gut, quellenart: "geraten" }, { ...gut, cluster: "web" }, { ...gut, quellenart: "forum", cluster: "buecher" }, { ...gut, schluesselSpalte: "titel" },
    { ...gut, schluessel: "" }, { ...gut, schluessel: "x".repeat(501) }, null, "text", 5,
  ];
  const e = pruefeZuordnungen([gut, ...schlecht]);
  pruefe("Eingabe: unbekannte Art oder Cluster, unpassender Cluster, fremde Spalte, leere oder zu lange Kennung und Muell werden gezaehlt und nie angewendet", e.gueltig.length === 1 && e.ungueltig === schlecht.length, `${e.gueltig.length} gueltig, ${e.ungueltig} ungueltig`);
  pruefe("Eingabe: dieselbe Kennung zweimal zaehlt nur einmal; kein Feld ist ein Array -> nichts", pruefeZuordnungen([gut, gut]).gueltig.length === 1 && pruefeZuordnungen([gut, gut]).ungueltig === 1 && pruefeZuordnungen({ a: 1 }).gueltig.length === 0);
  const viele = Array.from({ length: MAX_ZUORDNUNGEN + 25 }, (_, i) => ({ ...gut, schluessel: `q-${i}` }));
  pruefe(`Eingabe: hoechstens ${MAX_ZUORDNUNGEN} Dokumente je Aufruf, der Rest wird als ungueltig gezaehlt`, pruefeZuordnungen(viele).gueltig.length === MAX_ZUORDNUNGEN && pruefeZuordnungen(viele).ungueltig === 25);
}

async function rest() {
// --- 4. Schreiben gegen einen Ersatz der Datenbank ---------------------------------------------
interface Zeile { id: string; quelle_id: string | null; pfad: string | null; autoritaetsstufe: number | null; quellenart: string | null; cluster: string | null; pruefstatus: string; pruefen_bis: string | null }
function ersatz(zeilen: Zeile[]) {
  const geschrieben: Record<string, unknown>[] = [];
  const baue = () => {
    const st = { op: "select" as "select" | "update", werte: {} as Record<string, unknown>, filter: [] as ((z: Zeile) => boolean)[], rueckgabe: false };
    const b: Record<string, unknown> = {
      select: () => { if (st.op === "update") st.rueckgabe = true; return b; },
      update: (werte: Record<string, unknown>) => { st.op = "update"; st.werte = werte; geschrieben.push(werte); return b; },
      eq: (spalte: keyof Zeile, wert: unknown) => { st.filter.push((z) => z[spalte] === wert); return b; },
      is: (spalte: keyof Zeile, wert: null) => { st.filter.push((z) => z[spalte] === wert); return b; },
      then: (ok: (r: unknown) => unknown) => {
        const treffer = zeilen.filter((z) => st.filter.every((f) => f(z)));
        if (st.op === "update") for (const z of treffer) Object.assign(z, st.werte);
        return Promise.resolve({ data: st.op === "select" ? treffer.map((z) => ({ autoritaetsstufe: z.autoritaetsstufe })) : st.rueckgabe ? treffer.map((z) => ({ id: z.id })) : null, error: null }).then(ok);
      },
    };
    return b;
  };
  return { db: { from: () => baue() } as unknown as SupabaseClient, geschrieben };
}
{
  const z = (id: string, q: string, stufe: number | null, art: string | null = null): Zeile => ({ id, quelle_id: q, pfad: `p/${id}`, autoritaetsstufe: stufe, quellenart: art, cluster: art ? "buecher" : null, pruefstatus: "freigegeben", pruefen_bis: null });
  const zeilen = [z("1", "q-a", 5), z("2", "q-a", 5), z("3", "q-a", 4), z("4", "q-b", 3), z("5", "q-fertig", 4, "fachliteratur")];
  const { db, geschrieben } = ersatz(zeilen);
  const ergebnis = await ordneBestandEin(db, [
    { schluessel: "q-a", schluesselSpalte: "quelle_id", quellenart: "rechtsnorm", cluster: "internet" },
    { schluessel: "q-b", schluesselSpalte: "quelle_id", quellenart: "behoerdeninfo", cluster: "internet" },
    { schluessel: "q-fertig", schluesselSpalte: "quelle_id", quellenart: "forum", cluster: "internet" },
    { schluessel: "q-gibtsnicht", schluesselSpalte: "quelle_id", quellenart: "forum", cluster: "internet" },
  ]);
  pruefe("Schreiben: Quellenart, Cluster und Stufe (aus der Art) werden bei allen Zeilen des Dokuments gesetzt", zeilen.filter((x) => x.quelle_id === "q-a").every((x) => x.quellenart === "rechtsnorm" && x.cluster === "internet" && x.autoritaetsstufe === 1) && zeilen.find((x) => x.id === "4")!.autoritaetsstufe === standardStufe("behoerdeninfo"));
  pruefe("Schreiben: eine schon eingeordnete Quelle wird nie ueberschrieben, eine unbekannte Kennung aendert nichts (beide uebersprungen)", zeilen.find((x) => x.id === "5")!.quellenart === "fachliteratur" && zeilen.find((x) => x.id === "5")!.cluster === "buecher" && ergebnis.uebersprungen === 2);
  pruefe("Schreiben: Ergebnis zaehlt Dokumente und Abschnitte", ergebnis.dokumente === 2 && ergebnis.abschnitte === 4, `${ergebnis.dokumente} Dokumente, ${ergebnis.abschnitte} Abschnitte`);
  pruefe("Schreiben: das Protokoll haelt Art, Cluster und die Stufe vorher (kleinster Wert bei gemischten Zeilen) und nachher fest", JSON.stringify(ergebnis.protokoll.find((p) => p.schluessel === "q-a")) === JSON.stringify({ schluessel: "q-a", quellenart: "rechtsnorm", cluster: "internet", stufe_vorher: 4, stufe_neu: 1, abschnitte: 3 }));
  pruefe("Schreiben: geschrieben werden genau drei Felder; Pruefstatus, Wiedervorlage und Rollen bleiben unberuehrt", geschrieben.every((x) => Object.keys(x).sort().join() === "autoritaetsstufe,cluster,quellenart") && zeilen.every((x) => x.pruefstatus === "freigegeben" && x.pruefen_bis === null));
  const nochmal = await ordneBestandEin(db, [{ schluessel: "q-a", schluesselSpalte: "quelle_id", quellenart: "forum", cluster: "internet" }]);
  pruefe("Schreiben: ein zweiter Lauf ist wirkungslos (idempotent): die erste Einordnung bleibt", nochmal.dokumente === 0 && nochmal.uebersprungen === 1 && zeilen.filter((x) => x.quelle_id === "q-a").every((x) => x.quellenart === "rechtsnorm"));
  const ueberPfad = ersatz([{ ...z("9", "x", 3), quelle_id: null }]);
  const e2 = await ordneBestandEin(ueberPfad.db, [{ schluessel: "p/9", schluesselSpalte: "pfad", quellenart: "behoerdeninfo", cluster: "internet" }]);
  pruefe("Schreiben: ein Dokument ohne quelle_id wird ueber seinen Pfad adressiert", e2.dokumente === 1);
}

// --- 5. Die Action und die Anbindung -------------------------------------------------------------
{
  const a = lies("src/lib/actions/wissen.ts");
  const k = a.slice(a.indexOf("export async function wissenBestandEinordnen"));
  pruefe("Action: prueft zuerst das Recht (ki_assistent:manage), dann die Eingabe, dann die Umgebung, erst danach wird geschrieben", k.indexOf("requirePermission") > 0 && k.indexOf("requirePermission") < k.indexOf("pruefeZuordnungen") && k.indexOf("pruefeZuordnungen") < k.indexOf("pruefeUploadUmgebung") && k.indexOf("pruefeUploadUmgebung") < k.indexOf("ordneBestandEin"));
  pruefe("Action: protokolliert jede Einordnung (wissen.eingeordnet) mit Zahl der Dokumente und je Dokument Art, Cluster und Stufen", /protokolliere\(profil, "wissen\.eingeordnet"/.test(k) && /zuordnungen: ergebnis\.protokoll/.test(k));
  pruefe("Action: laeuft ueber den Dienst-Client (wie die Liste) und nur nach der Rechtepruefung", /createServiceRoleClient\(\)/.test(k));
  const schreiben = lies("src/lib/wissen/einordnen.ts");
  pruefe("Schreiben: die Bedingung \"nur ohne Quellenart\" steht in der Abfrage selbst, nicht nur in der Oberflaeche", /\.is\("quellenart", null\)/.test(schreiben) && (schreiben.match(/\.is\("quellenart", null\)/g) ?? []).length === 2);
  pruefe("Schreiben: es gibt keine Wiedervorlage fuer Bestand (kein pruefen_bis im Schreibzugriff)", !/pruefen_bis|pruefstatus/.test(schreiben.slice(schreiben.indexOf("export async function ordneBestandEin"))));
  const etl = lies("scripts/wissen-nach-supabase.ts");
  pruefe("Einlese-Lauf: schreibt weder Quellenart noch Cluster, eine Einordnung ueberlebt ihn", !/quellenart|cluster/.test(etl.slice(etl.indexOf("function zeile"), etl.indexOf("function zeile") + 2500)));
  const liste = lies("src/lib/wissen/dokumente-liste.ts");
  pruefe("Liste: liest Cluster und Rechtsstelle mit", /cluster, pruefstatus/.test(liste) && /rechtsstelle/.test(liste));
}
void CLUSTER;

console.log(`\nPruefungen: ${bestanden + fehlgeschlagen}   bestanden: ${bestanden}   fehlgeschlagen: ${fehlgeschlagen}`);
if (fehlgeschlagen > 0) process.exit(1);
console.log("Alle Pruefungen bestanden.");
}

rest().catch((e) => {
  console.error(e);
  process.exit(1);
});
