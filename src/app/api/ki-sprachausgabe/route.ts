// Sprachausgabe einer KI-Antwort: liest eine bereits gespeicherte
// Assistenten-Nachricht und gibt sie als Audio (mp3) zurueck.
//
// Bewusst NUR per Nachrichten-ID, nie mit frei uebergebenem Text: sonst waere
// diese Route fuer jede angemeldete Person ein kostenloser Sprachgenerator
// fuer beliebige Inhalte - auf Rechenzeit von Caesar. Gelesen wird mit der
// Sitzung des Nutzers (createClient), RLS auf ki_chat_nachrichten entscheidet
// also, welche Antworten ueberhaupt erreichbar sind - dieselben, die der
// Nutzer im Chat ohnehin sieht, keine fremden.
import { getSessionProfile } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { erzeugeSprachausgabe } from "@/lib/ai/sprachausgabe-client";
import { istSprachausgabeSprache, sprachausgabePfad, stimmeFuerOberflaeche, textFuerSprachausgabe } from "@/lib/domain/sprachausgabe";
import { istSprache, stimmenSprache } from "@/lib/domain/antwortsprache";
import { erkenneSprache } from "@/lib/wissen/chunker";
import { pruefeAbschnitt, sprachausgabeGeheimnis } from "@/lib/domain/sprachausgabe-signatur";
import { sprachausgabeLiveAn } from "@/lib/domain/schalter";
import { ladeRatenlimitGrenze, ratenlimitUeberschritten, skaliereFuerSprachausgabe } from "@/lib/ai/ratenbegrenzung";

// Zwischenspeicher: Bucket "ki-sprachausgabe" (Migration 20261101000000),
// privat und nur ueber service_role erreichbar. Die Berechtigung haengt an der
// ANTWORT - deshalb wird der Bucket erst angefasst, NACHDEM die Zeile mit der
// Sitzung des Nutzers gelesen wurde (RLS). Wer die Antwort nicht sehen darf,
// kommt hier nie an, auch mit geratener ID nicht.
const BUCKET = "ki-sprachausgabe";

export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fehler(status: number, grund: string, extra: Record<string, string> = {}) {
  return Response.json({ grund, ...extra }, { status });
}

export async function POST(req: Request) {
  const profil = await getSessionProfile();
  if (!profil) return fehler(401, "nicht-angemeldet");
  // Dieselbe Berechtigung wie der Chat selbst: wer nicht chatten darf, hat
  // auch keine Antworten zum Vorlesen.
  if (!hasPermission(profil.role, "ki_assistent", "create")) return fehler(403, "keine-berechtigung");

  // Ratenbegrenzung (Vibecode-Cleanup Phase 2): lib/ai/ratenbegrenzung.ts,
  // eigener Namensraum ("tts:"), getrennt vom Chat-Zaehler in
  // actions/ki-assistent.ts bzw. api/ki-assistent/route.ts - eine einzige
  // Antwort kann hier mehrere Abschnitte ausloesen (Weg 2 unten), ein
  // gemeinsamer Zaehler wuerde das Chat-Budget allein durch Sprachausgabe
  // aufbrauchen. Admin-konfigurierbar (KiRatenlimitVerwaltung in den
  // KI-Einstellungen), dieselbe Grenze wie der Chat, aber skaliert
  // (skaliereFuerSprachausgabe) - ohne Admin-Einstellung gilt kein Limit.
  const ratenGrenze = await ladeRatenlimitGrenze(profil.role);
  if (ratenlimitUeberschritten(`tts:${profil.id}`, skaliereFuerSprachausgabe(ratenGrenze))) {
    return fehler(429, "ratenlimit");
  }

  let body: { nachrichtId?: unknown; sprache?: unknown; abschnitt?: unknown };
  try {
    body = await req.json();
  } catch {
    return fehler(400, "ungueltige-eingabe");
  }
  // --- Weg 2: ein einzelner Abschnitt einer noch laufenden Antwort ---------
  //
  // Der Weg ueber die Nachrichten-ID greift erst, wenn die Antwort fertig und
  // gespeichert ist. Beim Vorlesen waehrend des Schreibens gibt es diese Zeile
  // noch nicht - der Text kommt deshalb mit.
  //
  // Damit das kein offener Sprachgenerator wird, traegt jeder Abschnitt eine
  // Signatur, die der Chat-Stream beim Erzeugen gesetzt hat. Sie bindet
  // Nutzer, Zug, Nummer, Textabdruck und Ablauf zusammen: ein fremder,
  // veraenderter, verschobener oder alter Abschnitt kommt nicht durch.
  // Freier Text bleibt damit unmoeglich - genau wie auf dem alten Weg.
  if (body.abschnitt !== undefined && body.abschnitt !== null) {
    if (!sprachausgabeLiveAn()) return fehler(404, "nicht-aktiv");
    const geheimnis = sprachausgabeGeheimnis();
    if (!geheimnis) return fehler(404, "nicht-aktiv");

    const a = body.abschnitt as Record<string, unknown>;
    const abschnittText = typeof a.text === "string" ? a.text.trim() : "";
    const zug = typeof a.zug === "string" ? a.zug : "";
    const nr = typeof a.nr === "number" ? a.nr : Number.NaN;
    const ablauf = typeof a.ablauf === "number" ? a.ablauf : Number.NaN;
    const sig = typeof a.sig === "string" ? a.sig : "";
    if (!abschnittText || !zug || !Number.isInteger(nr)) return fehler(400, "ungueltige-eingabe");
    if (abschnittText.length > 600) return fehler(400, "abschnitt-zu-lang");

    const gepruefter = pruefeAbschnitt(
      { nutzerId: profil.id, zug, nr, text: abschnittText, ablauf, sig },
      geheimnis,
    );
    // Ein Fehlschlag ist immer 403, nie 400: sonst verraet der Status, WELCHER
    // Teil nicht gestimmt hat, und man koennte sich an einer Signatur
    // entlangtasten. Der Grund steht im Protokoll, nicht in der Antwort.
    if (!gepruefter.ok) {
      console.warn("[damicon] Sprachausgabe-Abschnitt abgewiesen:", gepruefter.grund);
      return fehler(403, "nicht-erlaubt");
    }

    // Die Sprache kommt vom Zug, nicht aus der Oberflaeche und nicht je
    // Abschnitt neu geraten: alle Abschnitte eines Zuges klingen gleich.
    const zugSprache = istSprache(body.sprache) ? body.sprache : "de";
    const stimmeDesZuges = istSprachausgabeSprache(zugSprache) ? stimmeFuerOberflaeche(zugSprache) : null;
    if (!stimmeDesZuges) return fehler(422, "keine-stimme", { sprache: zugSprache });

    const erzeugt = await erzeugeSprachausgabe(abschnittText, stimmeDesZuges);
    if (!erzeugt.ok) {
      // Vibecode-Cleanup-Fund (Phase 2): erzeugt.grund kann interne Details
      // enthalten (Name einer Umgebungsvariable, bis zu 200 Zeichen
      // Rohantwort von Sokrates/Caesar, siehe ai/sprachausgabe-client.ts) -
      // nur ins Server-Protokoll, nicht an den Client. Dasselbe Muster wie
      // weiter unten bei Weg 1.
      console.error("[damicon] Sprachausgabe-Abschnitt fehlgeschlagen:", erzeugt.grund);
      return fehler(502, "dienst-nicht-erreichbar");
    }
    // Abschnitte werden NICHT zwischengespeichert: sie entstehen einmal,
    // werden einmal gesprochen, und der fertige Text ist danach ueber die
    // Nachrichten-ID erreichbar. Ein Zwischenspeicher waere Ablage ohne Leser.
    //
    // Bewusst offen (eigener Review, nicht in diesem Schritt behoben): eine
    // gueltige Signatur laesst sich innerhalb ihrer zehn Minuten wiederholt
    // einloesen, und weil nichts zwischengespeichert wird, kostet jede
    // Wiederholung eine Erzeugung. Die Signatur verhindert FREMDEN und
    // VERAENDERTEN Text, nicht die Wiederholung des eigenen. Die allgemeine
    // Ratenbegrenzung oben (Vibecode-Cleanup Phase 2, lib/ai/
    // ratenbegrenzung.ts) bremst auch dieses Muster mit, ist aber grosszuegig
    // genug bemessen, um es nicht zuverlaessig zu verhindern. Ein
    // Zwischenspeicher je Signatur waere der naechste, engere Schritt.
    return new Response(new Uint8Array(erzeugt.audio), {
      status: 200,
      headers: {
        "content-type": erzeugt.typ || "audio/mpeg",
        "cache-control": "no-store",
        "x-sprache": zugSprache,
        "x-abschnitt": String(nr),
      },
    });
  }

  // --- Weg 1: eine fertige, gespeicherte Antwort ---------------------------
  const nachrichtId = typeof body.nachrichtId === "string" ? body.nachrichtId : "";
  if (!UUID.test(nachrichtId)) return fehler(400, "ungueltige-eingabe");
  // "sprache" ist jetzt die Sprache DIESER ANTWORT (L), die der Chat-Stream
  // mitgeschickt hat - nicht mehr die Oberflaechensprache. Fehlt sie (alter
  // Browser-Tab, direkter Aufruf), faengt die Gegenprobe unten das auf.
  const gemeldeteSprache = typeof body.sprache === "string" ? body.sprache : "de";

  const supabase = await createClient();
  const { data: nachricht, error } = await supabase
    .from("ki_chat_nachrichten")
    .select("rolle, inhalt")
    .eq("id", nachrichtId)
    .maybeSingle();
  if (error) return fehler(500, "db-fehler");
  // Nicht gefunden und "gehoert jemand anderem" sehen bewusst gleich aus -
  // die Route verraet nicht, ob eine fremde ID existiert.
  if (!nachricht || nachricht.rolle !== "assistent") return fehler(404, "nicht-gefunden");

  const text = textFuerSprachausgabe(nachricht.inhalt);
  if (!text) return fehler(422, "kein-text");

  // Die Stimme folgt der Sprache DIESER ANTWORT, nicht der Einstellung.
  //
  // Vorher kam sie allein aus der Oberflaeche. Antwortete das Modell in der
  // Sprache der Frage - und das tut es -, las eine fremde Stimme den Text
  // vor: deutsche Antwort mit russischer Stimme (Waleri, 22.09.2026).
  //
  // Zwei Quellen, in dieser Reihenfolge:
  //   1. L, vom Chat-Stream mitgeschickt.
  //   2. der fertige Text selbst - er ist der Beleg. Weicht er eindeutig ab,
  //      gewinnt er: lieber die richtige Stimme zum vorhandenen Text als
  //      beides falsch.
  const gewuenscht = istSprache(gemeldeteSprache) ? gemeldeteSprache : "de";
  const gepruefte = stimmenSprache(gewuenscht, text, (t) => erkenneSprache(t, 10));
  if (gepruefte.abweichung) {
    // Nur zaehlen, nie den Text: haeuft sich das, stimmt etwas mit der
    // Anweisung ans Modell nicht.
    console.warn("[damicon] Sprachausgabe: Antworttext ist " + gepruefte.sprache + ", angekuendigt war " + gewuenscht);
  }
  const sprache = istSprachausgabeSprache(gepruefte.sprache) ? gepruefte.sprache : "de";
  const stimme = stimmeFuerOberflaeche(sprache);
  if (!stimme) return fehler(422, "keine-stimme", { sprache });

  const dienst = createServiceRoleClient();
  const pfad = sprachausgabePfad(nachrichtId, stimme);

  // 1. Schon einmal vorgelesen? Dann ohne Caesar ausliefern.
  const { data: gespeichert } = await dienst.storage.from(BUCKET).download(pfad);
  if (gespeichert) {
    return audioAntwort(await gespeichert.arrayBuffer(), gespeichert.type || "audio/mpeg", sprache, "treffer");
  }

  // 2. Sonst erzeugen lassen ...
  const ergebnis = await erzeugeSprachausgabe(text, stimme);
  if (!ergebnis.ok) {
    console.error("[damicon] Sprachausgabe fehlgeschlagen:", ergebnis.grund);
    return fehler(502, "dienst-nicht-erreichbar");
  }

  // 3. ... und ablegen. Ein Fehler beim Ablegen darf die fertige Antwort nicht
  // kaputtmachen - dann bleibt es beim naechsten Mal eben wieder langsam.
  const { error: ablageFehler } = await dienst.storage
    .from(BUCKET)
    .upload(pfad, ergebnis.audio, { contentType: ergebnis.typ, upsert: false });
  if (ablageFehler) console.error("[damicon] Sprachausgabe nicht zwischengespeichert:", ablageFehler.message);

  return audioAntwort(ergebnis.audio, ergebnis.typ, sprache, "neu");
}

function audioAntwort(audio: ArrayBuffer, typ: string, sprache: string, herkunft: "treffer" | "neu") {
  return new Response(audio, {
    status: 200,
    headers: {
      "content-type": typ,
      "x-damicon-zwischenspeicher": herkunft,
      // Dieselbe Antwort klingt immer gleich - der Browser darf sie behalten,
      // aber nur fuer diesen Nutzer (private), nie in einem geteilten Cache.
      "cache-control": "private, max-age=3600",
      "x-damicon-sprache": sprache,
    },
  });
}
