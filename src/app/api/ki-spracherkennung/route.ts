// Schluessel fuer das Live-Diktat (domain/diktat-live.ts).
//
// Der Browser spricht fuer das Live-Diktat direkt mit Soniox - eine
// Vercel-Funktion kann keinen WebSocket offen halten, und jedes Stueck Audio
// ueber den Server zu schicken hiesse Latenz ohne Nutzen. Damit der echte
// Schluessel trotzdem nie den Server verlaesst, gibt diese Route je Aufnahme
// einen KURZLEBIGEN aus: nur fuer Spracherkennung, nur einmal, 60 s zum
// Verbinden, hoechstens zwei Minuten Sitzung.
//
// Dazu die Konfiguration (Modell, Sprachhinweise, Fachwoerter) und die
// Adresse - beides entscheidet der Server, nicht der Browser. Die Region
// kommt aus SONIOX_API_URL bzw. SONIOX_STT_WS_URL, im Code steht keine
// (docs/infra/spracherkennung-anbieter.md).
//
// Jede Absage hier ist fuer den Browser nur ein Zeichen, den Datei-Weg zu
// nehmen - das Diktat selbst geht nie verloren.
import { getSessionProfile } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { diktatLiveAn } from "@/lib/domain/schalter";
import { liveKonfiguration, SCHLUESSEL_GUELTIG_S, SITZUNG_HOECHSTENS_S, sonioxLiveAdresse } from "@/lib/domain/diktat-live";
import { holeSonioxSchluessel, sonioxBasisUrl } from "@/lib/ai/soniox-client";
import { ladeRatenlimitGrenze, ratenlimitUeberschritten } from "@/lib/ai/ratenbegrenzung";
import { createHash } from "node:crypto";

export const maxDuration = 15;

function fehler(status: number, grund: string) {
  return Response.json({ grund }, { status, headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const profil = await getSessionProfile();
  if (!profil) return fehler(401, "nicht-angemeldet");
  // Dieselbe Berechtigung wie der Chat und der Datei-Weg des Diktats.
  if (!hasPermission(profil.role, "ki_assistent", "create")) return fehler(403, "keine-berechtigung");
  if (!diktatLiveAn()) return fehler(404, "nicht-aktiv");

  const adresse = sonioxLiveAdresse(sonioxBasisUrl(), process.env.SONIOX_STT_WS_URL);
  if (!adresse) {
    console.error("[damicon] Live-Diktat: keine Adresse - SONIOX_API_URL (api.<region>.soniox.com) oder SONIOX_STT_WS_URL setzen");
    return fehler(404, "nicht-aktiv");
  }

  // Derselbe Zaehler wie der Datei-Weg (actions/ki-assistent.ts): ein
  // Schluessel ist ein Diktat.
  if (ratenlimitUeberschritten(`stt:${profil.id}`, await ladeRatenlimitGrenze(profil.role))) {
    return fehler(429, "ratenlimit");
  }

  let sprache: string | undefined;
  try {
    const body = (await req.json()) as { sprache?: unknown };
    sprache = typeof body.sprache === "string" ? body.sprache : undefined;
  } catch {
    sprache = undefined;
  }

  const schluessel = await holeSonioxSchluessel("transcribe_websocket", {
    gueltigS: SCHLUESSEL_GUELTIG_S,
    sitzungS: SITZUNG_HOECHSTENS_S,
    // Pseudonym statt Profil-ID: bei Soniox soll nichts stehen, was sich
    // ohne unsere Datenbank einer Person zuordnen liesse.
    referenz: createHash("sha256").update(`damicon-diktat:${profil.id}`).digest("hex").slice(0, 32),
  });
  if (!schluessel.ok) {
    // Der Grund kann Teile der Dienstantwort enthalten - nur ins Protokoll.
    console.error("[damicon] Live-Diktat: kein Schluessel:", schluessel.grund);
    return fehler(502, "dienst-nicht-erreichbar");
  }

  return Response.json(
    { schluessel: schluessel.schluessel, adresse, konfiguration: liveKonfiguration(sprache) },
    { headers: { "cache-control": "no-store" } },
  );
}
