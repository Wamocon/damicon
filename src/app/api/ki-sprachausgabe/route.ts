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

  let body: { nachrichtId?: unknown; sprache?: unknown };
  try {
    body = await req.json();
  } catch {
    return fehler(400, "ungueltige-eingabe");
  }
  const nachrichtId = typeof body.nachrichtId === "string" ? body.nachrichtId : "";
  if (!UUID.test(nachrichtId)) return fehler(400, "ungueltige-eingabe");
  const oberflaechenSprache = typeof body.sprache === "string" ? body.sprache : "de";

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

  // Die Stimme folgt der Systemsprache. Frueher wurde die Sprache aus dem
  // Antworttext erraten - bei einer Antwort, die selbst schon in der
  // falschen Sprache stand, las die falsche Stimme dann den falschen Text.
  const sprache = istSprachausgabeSprache(oberflaechenSprache) ? oberflaechenSprache : "de";
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
