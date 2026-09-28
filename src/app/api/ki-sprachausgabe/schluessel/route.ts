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
//     (Zug-Nachweis, vom Chat-Stream signiert, gilt ABSCHNITT_GUELTIG_MS) oder
//     eine gespeicherte EIGENE Antwort, die hoechstens
//     NACHWEIS_NACHRICHT_FRISCH_MS alt ist (Nachrichten-ID, gelesen mit der
//     Sitzung, also per RLS; die zeitliche Grenze seit 28.09.2026, vorher
//     reichte jede alte Antwort, Vibecode-Cleanup Funde 26/78),
//   - einmalig: ein Schluessel oeffnet genau einen Strom, 60 s lang, und ein
//     Strom dauert hoechstens STROM_SITZUNG_S (Soniox liefert ohnehin
//     hoechstens 2 Minuten Audio je Strom),
//   - feste Obergrenze je Person und Minute (STROM_SCHLUESSEL_JE_MINUTE), auch
//     ohne Einstellung im Admin-Bereich, dazu die Grenze des Vorlesens,
//   - pseudonyme Kennung bei Soniox.
//
// Was das NICHT verhindert, ehrlich benannt: ein Nachweis laesst sich innerhalb
// seiner Gueltigkeit mehrfach einloesen, und die Zaehler liegen im Speicher je
// Serverinstanz. Eine angemeldete Person mit Chat-Recht (auch "kunde") kommt so
// auf bis zu STROM_SCHLUESSEL_JE_MINUTE Stroeme je Minute und Instanz, jeder
// mit beliebigem Text bis zu STROM_SITZUNG_S - ohne Tageskontingent. Das sind
// Sprachminuten im zweistelligen Bereich je Minute, nicht "wenige". Zuzuordnen
// ist es ueber die pseudonyme Kennung. Ein instanzuebergreifender Zaehler waere
// der naechste Schritt (lib/ai/ratenbegrenzung.ts).
//
// Dazu Adresse und Konfiguration - Stimme, Tempo, Format und Region entscheidet
// der Server, nicht der Browser.
//
// Der Ablauf samt aller Schranken steht in lib/ai/soniox-zugang.ts
// (gibVorleseSchluessel), damit er ohne Anfrage-Umgebung pruefbar ist
// (supabase/tests/schluessel-routen.ts). Hier nur, was eine echte Anfrage braucht.
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { holeSonioxSchluessel } from "@/lib/ai/soniox-client";
import { ladeRatenlimitGrenze, ratenlimitUeberschritten } from "@/lib/ai/ratenbegrenzung";
import { gibVorleseSchluessel } from "@/lib/ai/soniox-zugang";

export const maxDuration = 15;

export async function POST(req: Request) {
  return gibVorleseSchluessel(req, {
    profil: getSessionProfile,
    ratenGrenze: ladeRatenlimitGrenze,
    ueberschritten: ratenlimitUeberschritten,
    holeSchluessel: holeSonioxSchluessel,
    // Mit der Sitzung der Person: RLS entscheidet, welche Antworten sie sieht.
    ladeNachricht: async (id) => {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("ki_chat_nachrichten")
        .select("rolle, profil_id, erstellt_am")
        .eq("id", id)
        .maybeSingle();
      return error ? { ok: false } : { ok: true, nachricht: data };
    },
  });
}
