// Schluessel fuer das Live-Diktat (domain/diktat-live.ts).
//
// Der Browser spricht fuer das Live-Diktat direkt mit Soniox - eine
// Vercel-Funktion kann keinen WebSocket offen halten, und jedes Stueck Audio
// ueber den Server zu schicken hiesse Latenz ohne Nutzen. Damit der echte
// Schluessel trotzdem nie den Server verlaesst, gibt diese Route je Aufnahme
// einen KURZLEBIGEN aus: nur fuer Spracherkennung, nur einmal, 60 s zum
// Verbinden (SCHLUESSEL_GUELTIG_S). Die Sitzung haelt beim Diktat hoechstens
// SITZUNG_HOECHSTENS_S, im Gespraech (Sprachmodus, zweck "gespraech") bis
// GESPRAECH_SITZUNG_S - beides in domain/diktat-live.ts.
//
// Seit 28.09.2026 mit festen Obergrenzen je Person und Minute, auch ohne
// Einstellung im Admin-Bereich, und einem eigenen, engeren Zaehler fuer das
// Gespraech (lib/ai/soniox-zugang.ts). Vorher gab es ohne Admin-Grenze gar
// keine, und ein 30-Minuten-Schluessel zaehlte wie ein Diktat (Vibecode-Cleanup,
// Funde 15/79). Die Zaehler liegen im Speicher je Serverinstanz.
//
// Dazu die Konfiguration (Modell, Sprachhinweise, Fachwoerter) und die
// Adresse - beides entscheidet der Server, nicht der Browser. Die Region
// kommt aus SONIOX_API_URL bzw. SONIOX_STT_WS_URL, im Code steht keine
// (docs/infra/spracherkennung-anbieter.md).
//
// Jede Absage hier ist fuer den Browser nur ein Zeichen, den Datei-Weg zu
// nehmen - das Diktat selbst geht nie verloren.
//
// Der Ablauf samt aller Schranken steht in lib/ai/soniox-zugang.ts
// (gibDiktatSchluessel), damit er ohne Anfrage-Umgebung pruefbar ist
// (supabase/tests/schluessel-routen.ts). Hier nur, was eine echte Anfrage braucht.
import { getSessionProfile } from "@/lib/auth";
import { holeSonioxSchluessel } from "@/lib/ai/soniox-client";
import { ladeRatenlimitGrenze, ratenlimitUeberschritten } from "@/lib/ai/ratenbegrenzung";
import { gibDiktatSchluessel } from "@/lib/ai/soniox-zugang";

export const maxDuration = 15;

export async function POST(req: Request) {
  return gibDiktatSchluessel(req, {
    profil: getSessionProfile,
    ratenGrenze: ladeRatenlimitGrenze,
    ueberschritten: ratenlimitUeberschritten,
    holeSchluessel: holeSonioxSchluessel,
  });
}
