// Schluessel fuer das Vorlesen als Strom (domain/sprachausgabe-strom.ts).
//
// Der Browser spricht fuer das Vorlesen direkt mit dem Soniox-TTS-WebSocket:
// Soniox erzeugt etwa in Echtzeit, und nur ein Strom, der schon waehrend der
// Erzeugung spielt, klingt ohne Wartezeit und ohne Luecken. Eine
// Vercel-Funktion kann den WebSocket nicht so lange halten, wie gesprochen
// wird. Damit der echte Schluessel trotzdem nie den Server verlaesst, gibt
// diese Route einen KURZLEBIGEN aus - dasselbe Muster wie beim Live-Diktat
// (api/ki-spracherkennung).
//
// Anders als die signierten Abschnitte (api/ki-sprachausgabe, Weg 2) bindet
// ein Schluessel den Text nicht: wer ihn hat, kann bis zum Ende seines Stroms
// sprechen lassen, was er will. Deshalb eng begrenzt:
//
//   - nur mit NACHWEIS, dass es etwas vorzulesen gibt: die laufende Antwort
//     (Zug-Nachweis, vom Chat-Stream signiert) oder eine gespeicherte eigene
//     Antwort (Nachrichten-ID, gelesen mit der Sitzung, also per RLS),
//   - einmalig: ein Schluessel oeffnet genau einen Strom, 60 s lang, und ein
//     Strom dauert hoechstens STROM_SITZUNG_S (Soniox liefert ohnehin
//     hoechstens 2 Minuten Audio je Strom),
//   - feste Obergrenze je Person und Minute (STROM_SCHLUESSEL_JE_MINUTE), auch
//     ohne Einstellung im Admin-Bereich, dazu die Grenze des Vorlesens,
//   - pseudonyme Kennung bei Soniox.
//
// Ein Missbrauch kostet also hoechstens wenige Sprachminuten einer angemeldeten
// Person mit einer echten Antwort und ist ihr ueber die Kennung zuzuordnen.
//
// Dazu Adresse und Konfiguration - Stimme, Tempo, Format und Region entscheidet
// der Server, nicht der Browser.
import { getSessionProfile } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { holeSonioxSchluessel, sonioxBasisUrl } from "@/lib/ai/soniox-client";
import { SONIOX_TTS_MODELL } from "@/lib/ai/sprachausgabe-client";
import { ladeRatenlimitGrenze, ratenlimitUeberschritten, skaliereFuerSprachausgabe } from "@/lib/ai/ratenbegrenzung";
import { sonioxStimmeFuer, sprachausgabeSprachen, sprachausgabeStromAn, sprechTempo, stilleKuerzen } from "@/lib/domain/sprachausgabe";
import { pruefeAbschnitt, sprachausgabeGeheimnis } from "@/lib/domain/sprachausgabe-signatur";
import {
  STROM_ABTASTRATE,
  STROM_AUDIOFORMAT,
  STROM_SCHLUESSEL_GUELTIG_S,
  STROM_SCHLUESSEL_JE_MINUTE,
  STROM_SITZUNG_S,
  sonioxTtsWsAdresse,
  type StromKonfiguration,
} from "@/lib/domain/sprachausgabe-strom";
import { createHash } from "node:crypto";

export const maxDuration = 15;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fehler(status: number, grund: string) {
  return Response.json({ grund }, { status, headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const profil = await getSessionProfile();
  if (!profil) return fehler(401, "nicht-angemeldet");
  // Dieselbe Berechtigung wie der Chat: wer nicht chatten darf, hat nichts vorzulesen.
  if (!hasPermission(profil.role, "ki_assistent", "create")) return fehler(403, "keine-berechtigung");
  // 404 heisst fuer den Browser: kein Strom hier, den Abschnitts-Weg nehmen.
  if (!sprachausgabeStromAn()) return fehler(404, "nicht-aktiv");

  const adresse = sonioxTtsWsAdresse(sonioxBasisUrl(), process.env.SONIOX_TTS_WS_URL);
  if (!adresse) {
    console.error("[damicon] Vorlese-Strom: keine Adresse - SONIOX_API_URL (api.<region>.soniox.com) oder SONIOX_TTS_WS_URL setzen");
    return fehler(404, "nicht-aktiv");
  }

  // Feste Obergrenze fuer diesen Endpunkt, und dazu der Zaehler des Vorlesens.
  if (ratenlimitUeberschritten(`tts-strom:${profil.id}`, STROM_SCHLUESSEL_JE_MINUTE)) return fehler(429, "ratenlimit");
  if (ratenlimitUeberschritten(`tts:${profil.id}`, skaliereFuerSprachausgabe(await ladeRatenlimitGrenze(profil.role)))) {
    return fehler(429, "ratenlimit");
  }

  // Nachweis, dass es etwas vorzulesen gibt.
  let body: { zug?: unknown; ablauf?: unknown; sig?: unknown; nachrichtId?: unknown };
  try {
    body = await req.json();
  } catch {
    return fehler(400, "ungueltige-eingabe");
  }
  if (typeof body.nachrichtId === "string") {
    if (!UUID.test(body.nachrichtId)) return fehler(400, "ungueltige-eingabe");
    const supabase = await createClient();
    const { data: nachricht, error } = await supabase
      .from("ki_chat_nachrichten")
      .select("rolle")
      .eq("id", body.nachrichtId)
      .maybeSingle();
    if (error) return fehler(500, "db-fehler");
    // Nicht gefunden und "gehoert jemand anderem" sehen gleich aus.
    if (!nachricht || nachricht.rolle !== "assistent") return fehler(403, "nicht-erlaubt");
  } else {
    const geheimnis = sprachausgabeGeheimnis();
    const zug = typeof body.zug === "string" ? body.zug : "";
    const ablauf = typeof body.ablauf === "number" ? body.ablauf : Number.NaN;
    const sig = typeof body.sig === "string" ? body.sig : "";
    if (!geheimnis || !zug) return fehler(403, "nicht-erlaubt");
    // Zug-Nachweis: dieselbe Signatur wie ein Abschnitt, mit Nummer 0 und leerem
    // Text (api/ki-assistent schickt ihn zu Beginn jeder Antwort).
    const geprueft = pruefeAbschnitt({ nutzerId: profil.id, zug, nr: 0, text: "", ablauf, sig }, geheimnis);
    if (!geprueft.ok) {
      console.warn("[damicon] Vorlese-Strom: Nachweis abgewiesen:", geprueft.grund);
      return fehler(403, "nicht-erlaubt");
    }
  }

  const schluessel = await holeSonioxSchluessel("tts_rt", {
    gueltigS: STROM_SCHLUESSEL_GUELTIG_S,
    sitzungS: STROM_SITZUNG_S,
    einmalig: true,
    // Pseudonym statt Profil-ID, wie beim Diktat.
    referenz: createHash("sha256").update(`damicon-vorlesen:${profil.id}`).digest("hex").slice(0, 32),
  });
  if (!schluessel.ok) {
    // Der Grund kann Teile der Dienstantwort enthalten - nur ins Protokoll.
    console.error("[damicon] Vorlese-Strom: kein Schluessel:", schluessel.grund);
    return fehler(502, "dienst-nicht-erreichbar");
  }

  // Stimme und Tempo je Sprache, alle vier: antwortet das Modell in einer
  // anderen Sprache als der Oberflaeche, passt der Schluessel trotzdem.
  const konfigurationen: Record<string, StromKonfiguration> = {};
  for (const sprache of sprachausgabeSprachen) {
    konfigurationen[sprache] = {
      model: SONIOX_TTS_MODELL,
      language: sprache,
      voice: sonioxStimmeFuer(sprache),
      audio_format: STROM_AUDIOFORMAT,
      sample_rate: STROM_ABTASTRATE,
      speed: sprechTempo(sprache),
      ...(stilleKuerzen() ? { reduce_silence: true } : {}),
    };
  }
  return Response.json(
    {
      schluessel: schluessel.schluessel,
      adresse,
      konfigurationen,
      // Relativ statt als Uhrzeit: die Uhr des Browsers muss nicht stimmen.
      gueltigMs: STROM_SCHLUESSEL_GUELTIG_S * 1000,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
