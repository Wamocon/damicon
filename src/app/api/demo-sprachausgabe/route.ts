// Stimme der Vorführung: liest EINEN Schritt des Drehbuchs (lib/demo/drehbuch.ts) als Audio vor.
//
// Der Browser nennt nur Schrittkennung und Sprache, der Text kommt aus dem Drehbuch auf dem
// Server. Damit bleibt diese Route kein offener Sprachgenerator, genau wie /api/ki-sprachausgabe,
// die deshalb nur gespeicherte Antworten liest. Hier ist der Text fest, also darf ein Schritt ohne
// Nachrichten-ID gelesen werden.
//
// GET, damit ein <audio>-Element die Adresse direkt abspielen kann. Das Anmelde-Cookie ist
// SameSite=Lax: eine fremde Seite, die diese Adresse einbindet, schickt es nicht mit.
//
// Zwischenspeicher: derselbe private Bucket wie bei den Antworten (ki-sprachausgabe), unter dem
// Verzeichnis demo/. Der Pfad trägt Sprache, Stimme und einen Abdruck des Textes: ändert sich das
// Drehbuch, entsteht neues Audio, und nichts Altes wird ausgeliefert. Preview und Produktion
// teilen sich den Bucket und sind über das Schema im Pfad getrennt (wie sprachausgabePfad).
import { createHash } from "node:crypto";
import { after } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { erzeugeSprachausgabeMitRueckfall } from "@/lib/ai/sprachausgabe-client";
import { ladeRatenlimitGrenze, ratenlimitUeberschritten, skaliereFuerSprachausgabe } from "@/lib/ai/ratenbegrenzung";
import { darfDemo, istDemoSprache, MAX_SCHRITT_ZEICHEN, schrittMitId, sprechtext } from "@/lib/demo/drehbuch";
import { istSprachausgabeSprache, sprechfassung, stimmenFuer, type Stimme } from "@/lib/domain/sprachausgabe";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { DATENBANK_SCHEMA } from "@/lib/supabase/schema";
import { fuerSprache } from "@/lib/text/umlaute";

const BUCKET = "ki-sprachausgabe";
/** Version der Aufbereitung: bei geänderter Sprechweise hochzählen, dann entsteht neues Audio. */
const DEMO_VERSION = 1;

export const maxDuration = 60;

function fehler(status: number, grund: string) {
  return Response.json({ grund }, { status });
}

const kennung = (wert: string) => wert.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();

function ablagePfad(sprache: string, stimme: Stimme, text: string): string {
  const verzeichnis = DATENBANK_SCHEMA === "public" ? "" : `${kennung(DATENBANK_SCHEMA)}/`;
  const abdruck = createHash("sha256").update(text).digest("hex").slice(0, 16);
  const tempo = stimme.tempo !== undefined ? `-t${Math.round(stimme.tempo * 100)}` : "";
  return `${verzeichnis}demo/${sprache}/${kennung(stimme.anbieter)}-${kennung(stimme.stimme)}${tempo}-v${DEMO_VERSION}-${abdruck}.mp3`;
}

function audioAntwort(audio: ArrayBuffer | Uint8Array, typ: string, herkunft: "treffer" | "neu") {
  const koerper = audio instanceof Uint8Array ? new Uint8Array(audio) : audio;
  return new Response(koerper, {
    status: 200,
    headers: {
      "content-type": typ || "audio/mpeg",
      "x-damicon-zwischenspeicher": herkunft,
      // Derselbe Schritt klingt immer gleich: der Browser darf ihn behalten, aber nur für diese
      // Person (private). So kostet das Vorladen des nächsten Schritts den Ablauf nichts.
      "cache-control": "private, max-age=3600",
    },
  });
}

export async function GET(req: Request) {
  const profil = await getSessionProfile();
  if (!profil) return fehler(401, "nicht-angemeldet");
  // Die echte Profilrolle entscheidet, nicht eine im Browser gewählte Vorschau-Rolle.
  if (!darfDemo(profil.role)) return fehler(403, "keine-berechtigung");

  // Eigener Namensraum: eine Vorführung (rund zwanzig Schritte) soll das Vorlese-Budget des Chats
  // nicht aufbrauchen. Dieselbe Grenze, skaliert wie beim Vorlesen.
  const ratenGrenze = await ladeRatenlimitGrenze(profil.role);
  if (ratenlimitUeberschritten(`demo-tts:${profil.id}`, skaliereFuerSprachausgabe(ratenGrenze))) {
    return fehler(429, "ratenlimit");
  }

  const adresse = new URL(req.url);
  const schritt = schrittMitId(adresse.searchParams.get("schritt") ?? "");
  const sprache = adresse.searchParams.get("sprache") ?? "de";
  if (!schritt || !istDemoSprache(sprache)) return fehler(404, "unbekannter-schritt");
  const roh = sprechtext(schritt, sprache);
  if (roh === null) return fehler(404, "kein-text");
  if (roh.length > MAX_SCHRITT_ZEICHEN) return fehler(422, "text-zu-lang");

  if (!istSprachausgabeSprache(sprache)) return fehler(422, "keine-stimme");
  const stimmen = stimmenFuer(sprache);
  if (stimmen.length === 0) return fehler(422, "keine-stimme");
  // Wie bei den Antworten: Symbole und Zahlen als Wörter, auf Deutsch echte Umlaute.
  const text = sprechfassung(fuerSprache(roh, sprache), sprache);

  const dienst = createServiceRoleClient();
  // Gesucht wird unter der BEVORZUGTEN Stimme. Hat beim letzten Mal der Rückfall gesprochen, liegt
  // das Audio unter dessen Pfad, dann wird neu erzeugt und die bessere Stimme bekommt ihre Chance.
  const gesucht = ablagePfad(sprache, stimmen[0], text);
  const { data: gespeichert } = await dienst.storage.from(BUCKET).download(gesucht);
  if (gespeichert) return audioAntwort(await gespeichert.arrayBuffer(), gespeichert.type || "audio/mpeg", "treffer");

  const erzeugt = await erzeugeSprachausgabeMitRueckfall(text, stimmen);
  if (!erzeugt.ok) {
    // Der Grund kann interne Angaben enthalten (Umgebungsvariable, Rohantwort des Dienstes): nur ins
    // Server-Protokoll. Der Browser spielt dann die Untertitel weiter.
    console.error("[damicon] Sprachausgabe der Vorführung fehlgeschlagen:", erzeugt.grund);
    return fehler(502, "dienst-nicht-erreichbar");
  }

  const pfad = ablagePfad(sprache, erzeugt.stimme, text);
  const audio = erzeugt.audio;
  const typ = erzeugt.typ || "audio/mpeg";
  // Nach der Antwort ablegen: wer zuhört, wartet nicht. Ein Fehler beim Ablegen macht die fertige
  // Antwort nicht kaputt, dann bleibt es beim nächsten Mal eben wieder langsam.
  after(async () => {
    const { error } = await dienst.storage.from(BUCKET).upload(pfad, audio, { contentType: typ, upsert: false });
    if (error) console.error("[damicon] Sprachausgabe der Vorführung nicht zwischengespeichert:", error.message);
  });
  return audioAntwort(audio, typ, "neu");
}
