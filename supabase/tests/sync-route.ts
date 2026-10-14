import { ersetzeModule } from "./hilfen/modul-ersatz";
import { pruefer } from "./hilfen/ansicht-probe";

// Charakterisierung des Endpunkts der Offline-Warteschlange POST /api/sync (src/app/api/sync/route.ts) vor dem Zerlegen (seit 14.10.2026).
//
// Die Route wird mit echten Request-Objekten aufgerufen (JSON und multipart/form-data mit Datei). Ersetzt sind die AAL2-Prüfung
// (requireAal2Aktuell aus lib/auth) und die sechs Kernfunktionen aus lib/actions/nachweiskette und lib/actions/pflueckaufgaben
// (hilfen/modul-ersatz.ts); NextResponse ist echt. Festgehalten wird jede Verzweigung: AAL2 fehlt, kaputtes Formular, kaputte
// Nutzlast, kaputtes JSON, fehlende Pflichtangaben, unbekannter Aktionstyp, Beleg ohne Datei, jeder der sieben Aktionstypen mit der
// Umsetzung der Nutzlast (Text gekürzt, Zahl mit Komma, leere und unendliche Werte, Gerätezeitpunkt) und die drei Ergebnisarten
// (angewendet, konflikt, fehler) samt Meldung und Wert. Je Fall: Aufrufe an die Attrappen mit Argumenten, Status, Content-Type, Körper.
// Dazu, was die Route heute nicht abfängt: ein JSON-Körper null und eine Kernfunktion, die wirft, lassen POST mit der Ausnahme enden.
// Aufruf: npm run test:sync-route

const { pruefe, ende } = pruefer();
const json = (wert: unknown) => JSON.stringify(wert);

interface Ergebnis {
  erledigt: boolean;
  status: { stand: string; meldung?: string; wert?: string };
}
let aufrufe: string[] = [];
let aal2Fehlt = false;
let ergebnis: Ergebnis = { erledigt: true, status: { stand: "ok", meldung: "ok.gespeichert" } };
let kernWirft = false;

/** Datei-Argumente lesbar machen: Name, Typ und Größe statt des Objekts. */
const lesbar = (params: Record<string, unknown>) =>
  JSON.stringify(params, (_schluessel, wert: unknown) => (wert instanceof File ? `Datei(${wert.name}, ${wert.type}, ${wert.size})` : wert));
const kern = (name: string) => async (params: Record<string, unknown>) => {
  aufrufe.push(`${name}(${lesbar(params)})`);
  if (kernWirft) throw new Error("Kern gescheitert");
  return ergebnis;
};

ersetzeModule({
  "@/lib/auth": {
    requireAal2Aktuell: async () => {
      aufrufe.push("requireAal2Aktuell()");
      if (aal2Fehlt) throw new Error("mfa-erforderlich");
    },
  },
  "@/lib/actions/nachweiskette": {
    kuehlmessungKern: kern("kuehlmessungKern"),
    steigeKern: kern("steigeKern"),
    arbeitszeitKern: kern("arbeitszeitKern"),
  },
  "@/lib/actions/pflueckaufgaben": {
    aufgabeStatusKern: kern("aufgabeStatusKern"),
    mengeMeldenKern: kern("mengeMeldenKern"),
    belegKern: kern("belegKern"),
  },
});

const ADRESSE = "http://localhost/api/sync";
const alsJson = (body: unknown, kopf: Record<string, string> = { "content-type": "application/json" }) =>
  new Request(ADRESSE, { method: "POST", headers: kopf, body: typeof body === "string" ? body : json(body) });
function alsFormular(felder: Record<string, string | File>): Request {
  const form = new FormData();
  for (const [name, wert] of Object.entries(felder)) form.append(name, wert);
  return new Request(ADRESSE, { method: "POST", body: form });
}
const aktion = (aktionTyp: string, nutzlast: unknown, geraetZeitpunkt: string | null = "2026-10-14T08:15:00+05:00") => ({ aktionId: "akt-1", aktionTyp, geraetZeitpunkt, nutzlast });
const bild = () => new File([new Uint8Array([1, 2, 3, 4])], "beleg.jpg", { type: "image/jpeg" });

interface Antwort {
  status: number;
  typ: string | null;
  koerper: unknown;
  aufrufe: string[];
  koerperGelesen: boolean;
}
type Post = (req: Request) => Promise<Response>;

async function rufe(POST: Post, req: Request, lage: { aal2Fehlt?: boolean; ergebnis?: Ergebnis; kernWirft?: boolean } = {}): Promise<Antwort> {
  aufrufe = [];
  aal2Fehlt = lage.aal2Fehlt ?? false;
  kernWirft = lage.kernWirft ?? false;
  ergebnis = lage.ergebnis ?? { erledigt: true, status: { stand: "ok", meldung: "ok.gespeichert" } };
  const res = await POST(req);
  return { status: res.status, typ: res.headers.get("content-type"), koerper: await res.json(), aufrufe, koerperGelesen: req.bodyUsed };
}

const EINGABE = { ergebnis: "fehler", meldung: "fehler.eingabe" };
const ANGEWENDET = { ergebnis: "angewendet", meldung: "ok.gespeichert" };

async function main() {
  const { POST } = (await import("../../src/app/api/sync/route")) as { POST: Post };

  // ---- 1. AAL2 vor allem anderen ------------------------------------------------------------------------------------------------
  let a = await rufe(POST, alsJson(aktion("kuehlmessung_erfassen", { aufgabe_id: "a1", temperatur_c: 4 })), { aal2Fehlt: true });
  pruefe(
    "AAL2 fehlt: 403 fehler.angemeldet, der Körper bleibt ungelesen, keine Kernfunktion",
    a.status === 403 && json(a.koerper) === json({ ergebnis: "fehler", meldung: "fehler.angemeldet" }) && json(a.aufrufe) === json(["requireAal2Aktuell()"]) && !a.koerperGelesen,
    json(a),
  );
  pruefe("Antworten sind JSON", a.typ === "application/json", String(a.typ));

  // ---- 2. JSON-Weg: Eingabeprüfung -------------------------------------------------------------------------------------------------
  const ungueltig: [string, Request][] = [
    ["kaputtes JSON", alsJson("{kaputt")],
    ["ohne Content-Type und kein JSON", new Request(ADRESSE, { method: "POST", body: "aktionId=1" })],
    ["Content-Type in Großbuchstaben gilt als JSON", new Request(ADRESSE, { method: "POST", headers: { "content-type": "Multipart/Form-Data; boundary=x" }, body: "--x--" })],
    ["ohne aktionId", alsJson({ aktionTyp: "menge_melden", nutzlast: {} })],
    ["leere aktionId", alsJson({ ...aktion("menge_melden", {}), aktionId: "" })],
    ["ohne aktionTyp", alsJson({ aktionId: "akt-1", nutzlast: {} })],
    ["Nutzlast null", alsJson(aktion("menge_melden", null))],
    ["Nutzlast fehlt", alsJson({ aktionId: "akt-1", aktionTyp: "menge_melden" })],
    ["Nutzlast als Text", alsJson(aktion("menge_melden", "x"))],
    ["unbekannter Aktionstyp", alsJson(aktion("loeschen", { id: "a1" }))],
  ];
  for (const [name, req] of ungueltig) {
    a = await rufe(POST, req);
    pruefe(`${name}: 400 fehler.eingabe nach der AAL2-Prüfung, keine Kernfunktion`, a.status === 400 && json(a.koerper) === json(EINGABE) && json(a.aufrufe) === json(["requireAal2Aktuell()"]), json(a));
  }
  let ausnahme: unknown = null;
  try {
    await rufe(POST, alsJson("null"));
  } catch (e) {
    ausnahme = e;
  }
  pruefe("JSON-Körper null: POST endet mit einem TypeError (heute nicht abgefangen)", ausnahme instanceof TypeError && json(aufrufe) === json(["requireAal2Aktuell()"]), String(ausnahme));

  // ---- 3. JSON-Weg: die sieben Aktionstypen ----------------------------------------------------------------------------------------
  const faelle: [string, unknown, string][] = [
    [
      "kuehlmessung_erfassen",
      aktion("kuehlmessung_erfassen", { aufgabe_id: "  a1  ", temperatur_c: "4,5" }),
      'kuehlmessungKern({"aufgabeId":"a1","temperaturC":4.5,"geraetZeitpunkt":"2026-10-14T08:15:00+05:00","aktionId":"akt-1"})',
    ],
    [
      "kuehlmessung_erfassen ohne Zahl und Gerätezeitpunkt",
      aktion("kuehlmessung_erfassen", { aufgabe_id: 7, temperatur_c: "  " }, ""),
      'kuehlmessungKern({"aufgabeId":"","temperaturC":null,"geraetZeitpunkt":null,"aktionId":"akt-1"})',
    ],
    [
      "steige_erfassen",
      aktion("steige_erfassen", { aufgabe_id: "a1", pfluecker_id: " p1 ", gewicht_kg: 12.5 }),
      'steigeKern({"aufgabeId":"a1","pflueckerId":"p1","gewichtKg":12.5,"geraetZeitpunkt":"2026-10-14T08:15:00+05:00","aktionId":"akt-1"})',
    ],
    [
      "steige_erfassen mit Text statt Zahl",
      aktion("steige_erfassen", { aufgabe_id: "a1", gewicht_kg: "zwölf" }, null),
      'steigeKern({"aufgabeId":"a1","pflueckerId":"","gewichtKg":null,"geraetZeitpunkt":null,"aktionId":"akt-1"})',
    ],
    [
      "arbeitszeit_erfassen",
      aktion("arbeitszeit_erfassen", { aufgabe_id: "a1", pfluecker_id: "p2", minuten: " 90 " }),
      'arbeitszeitKern({"aufgabeId":"a1","pflueckerId":"p2","minuten":90,"geraetZeitpunkt":"2026-10-14T08:15:00+05:00","aktionId":"akt-1"})',
    ],
    [
      "aufgabe_annehmen ignoriert den Gerätezeitpunkt",
      aktion("aufgabe_annehmen", { id: " a1 " }),
      'aufgabeStatusKern({"aufgabeId":"a1","neuerStatus":"angenommen","arbeitsbeginnGeraetZeitpunkt":null,"aktionId":"akt-1"})',
    ],
    [
      "aufgabe_arbeit_starten",
      aktion("aufgabe_arbeit_starten", { id: "a1" }),
      'aufgabeStatusKern({"aufgabeId":"a1","neuerStatus":"in_arbeit","arbeitsbeginnGeraetZeitpunkt":"2026-10-14T08:15:00+05:00","aktionId":"akt-1"})',
    ],
    [
      "menge_melden mit Komma, Unendlich und Wahrheitswert",
      aktion("menge_melden", { id: "a1", ist_menge_kg: "120,5", ausschuss_kg: "Infinity", pfluecker_anzahl: true }),
      'mengeMeldenKern({"aufgabeId":"a1","istMengeKg":120.5,"ausschussKg":null,"pflueckerAnzahl":null,"aktionId":"akt-1"})',
    ],
    [
      "Nutzlast als Liste gilt als Objekt",
      aktion("menge_melden", ["a1"]),
      'mengeMeldenKern({"aufgabeId":"","istMengeKg":null,"ausschussKg":null,"pflueckerAnzahl":null,"aktionId":"akt-1"})',
    ],
  ];
  for (const [name, body, erwartet] of faelle) {
    a = await rufe(POST, alsJson(body));
    pruefe(`JSON ${name}: Kernfunktion mit umgesetzter Nutzlast, 200 angewendet`, a.status === 200 && json(a.koerper) === json(ANGEWENDET) && json(a.aufrufe) === json(["requireAal2Aktuell()", erwartet]), json(a));
  }
  a = await rufe(POST, alsJson(aktion("beleg_hochladen", { aufgabe_id: "a1", art: "foto" })));
  pruefe("JSON beleg_hochladen ohne Datei: 400 fehler.keineDatei, keine Kernfunktion", a.status === 400 && json(a.koerper) === json({ ergebnis: "fehler", meldung: "fehler.keineDatei" }) && json(a.aufrufe) === json(["requireAal2Aktuell()"]), json(a));

  // ---- 4. Ergebnisarten ------------------------------------------------------------------------------------------------------------
  const ergebnisse: [string, Ergebnis, unknown][] = [
    ["erledigt mit Wert", { erledigt: true, status: { stand: "ok", meldung: "ok.gespeichert", wert: "m-1" } }, { ergebnis: "angewendet", meldung: "ok.gespeichert", wert: "m-1" }],
    ["erledigt trotz fachlichem Alarm", { erledigt: true, status: { stand: "fehler", meldung: "fehler.kuehlkette" } }, { ergebnis: "angewendet", meldung: "fehler.kuehlkette" }],
    ["Konflikt (fehler.zustand)", { erledigt: false, status: { stand: "fehler", meldung: "fehler.zustand" } }, { ergebnis: "konflikt", meldung: "fehler.zustand" }],
    ["Fehler mit Meldung", { erledigt: false, status: { stand: "fehler", meldung: "fehler.berechtigung", wert: "x" } }, { ergebnis: "fehler", meldung: "fehler.berechtigung", wert: "x" }],
    ["Fehler ohne Meldung", { erledigt: false, status: { stand: "fehler" } }, { ergebnis: "fehler", meldung: "fehler.unbekannt" }],
  ];
  for (const [name, vorgabe, erwartet] of ergebnisse) {
    a = await rufe(POST, alsJson(aktion("aufgabe_annehmen", { id: "a1" })), { ergebnis: vorgabe });
    pruefe(`Ergebnis ${name}: 200 mit ${json(erwartet)}`, a.status === 200 && json(a.koerper) === json(erwartet) && a.typ === "application/json", json(a));
  }
  ausnahme = null;
  try {
    await rufe(POST, alsJson(aktion("aufgabe_annehmen", { id: "a1" })), { kernWirft: true });
  } catch (e) {
    ausnahme = e;
  }
  pruefe("Kernfunktion wirft: POST endet mit derselben Ausnahme (heute nicht abgefangen)", ausnahme instanceof Error && ausnahme.message === "Kern gescheitert", String(ausnahme));

  // ---- 5. multipart/form-data ------------------------------------------------------------------------------------------------------
  a = await rufe(POST, new Request(ADRESSE, { method: "POST", headers: { "content-type": "multipart/form-data; boundary=fehlt" }, body: "kein formular" }));
  pruefe("Formular kaputt: 400 fehler.eingabe, keine Kernfunktion", a.status === 400 && json(a.koerper) === json(EINGABE) && json(a.aufrufe) === json(["requireAal2Aktuell()"]), json(a));
  a = await rufe(POST, alsFormular({ aktionId: "akt-2", aktionTyp: "beleg_hochladen", nutzlast: "{kaputt", datei: bild() }));
  pruefe("Formular mit kaputter Nutzlast: 400 fehler.eingabe", a.status === 400 && json(a.koerper) === json(EINGABE) && json(a.aufrufe) === json(["requireAal2Aktuell()"]), json(a));
  a = await rufe(POST, alsFormular({ aktionTyp: "beleg_hochladen", nutzlast: "{}", datei: bild() }));
  pruefe("Formular ohne aktionId: 400 fehler.eingabe", a.status === 400 && json(a.koerper) === json(EINGABE) && json(a.aufrufe) === json(["requireAal2Aktuell()"]), json(a));
  a = await rufe(POST, alsFormular({ aktionId: "akt-2", aktionTyp: "beleg_hochladen", nutzlast: "null", datei: bild() }));
  pruefe("Formular mit Nutzlast null: 400 fehler.eingabe", a.status === 400 && json(a.koerper) === json(EINGABE) && json(a.aufrufe) === json(["requireAal2Aktuell()"]), json(a));
  a = await rufe(
    POST,
    alsFormular({ aktionId: "akt-2", aktionTyp: "beleg_hochladen", geraetZeitpunkt: "2026-10-14T09:00:00+05:00", nutzlast: json({ aufgabe_id: " a1 ", art: "foto", hinweis: "  " }), datei: bild() }),
  );
  pruefe(
    "Formular beleg_hochladen: Datei und Nutzlast an belegKern, leerer Hinweis wird null",
    a.status === 200 &&
      json(a.koerper) === json(ANGEWENDET) &&
      json(a.aufrufe) ===
        json(["requireAal2Aktuell()", 'belegKern({"aufgabeId":"a1","art":"foto","hinweis":null,"geraetZeitpunkt":"2026-10-14T09:00:00+05:00","datei":"Datei(beleg.jpg, image/jpeg, 4)","aktionId":"akt-2"})']),
    json(a),
  );
  a = await rufe(POST, alsFormular({ aktionId: "akt-2", aktionTyp: "beleg_hochladen", geraetZeitpunkt: "", nutzlast: json({ aufgabe_id: "a1", art: "foto", hinweis: "Riss" }), datei: "kein bild" }));
  pruefe("Formular mit Text statt Datei: 400 fehler.keineDatei", a.status === 400 && json(a.koerper) === json({ ergebnis: "fehler", meldung: "fehler.keineDatei" }) && json(a.aufrufe) === json(["requireAal2Aktuell()"]), json(a));
  a = await rufe(POST, alsFormular({ aktionId: "akt-2", aktionTyp: "beleg_hochladen", datei: bild() }));
  pruefe(
    "Formular ohne Nutzlast und Gerätezeitpunkt: leere Nutzlast, Gerätezeitpunkt null",
    a.status === 200 && json(a.aufrufe) === json(["requireAal2Aktuell()", 'belegKern({"aufgabeId":"","art":"","hinweis":null,"geraetZeitpunkt":null,"datei":"Datei(beleg.jpg, image/jpeg, 4)","aktionId":"akt-2"})']),
    json(a),
  );
  a = await rufe(POST, alsFormular({ aktionId: "akt-3", aktionTyp: "menge_melden", geraetZeitpunkt: "2026-10-14T09:00:00+05:00", nutzlast: json({ id: "a1", ist_menge_kg: 80 }) }));
  pruefe(
    "Formular für einen anderen Aktionstyp: derselbe Weg wie JSON",
    a.status === 200 && json(a.aufrufe) === json(["requireAal2Aktuell()", 'mengeMeldenKern({"aufgabeId":"a1","istMengeKg":80,"ausschussKg":null,"pflueckerAnzahl":null,"aktionId":"akt-3"})']),
    json(a),
  );
  a = await rufe(POST, alsFormular({ aktionId: "akt-3", aktionTyp: "unbekannt", nutzlast: "{}" }));
  pruefe("Formular mit unbekanntem Aktionstyp: 400 fehler.eingabe", a.status === 400 && json(a.koerper) === json(EINGABE) && json(a.aufrufe) === json(["requireAal2Aktuell()"]), json(a));

  ende();
}

main().catch((e) => {
  console.log("FAIL  Ausnahme", e instanceof Error ? e.stack : e);
  process.exit(1);
});
