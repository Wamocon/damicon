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
import { erzeugeSprachausgabe, erzeugeSprachausgabeMitRueckfall } from "@/lib/ai/sprachausgabe-client";
import { ladeRatenlimitGrenze, ratenlimitUeberschritten, skaliereFuerSprachausgabe } from "@/lib/ai/ratenbegrenzung";
import { darfDemo, istDemoSprache, MAX_SCHRITT_ZEICHEN, schrittMitId, sprechtext } from "@/lib/demo/drehbuch";
import { istSprachausgabeSprache, sprechfassung, stimmenFuer, type Stimme } from "@/lib/domain/sprachausgabe";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { DATENBANK_SCHEMA } from "@/lib/supabase/schema";
import { fuerSprache } from "@/lib/text/umlaute";

const BUCKET = "ki-sprachausgabe";
/** Version der Aufbereitung: bei geänderter Sprechweise hochzählen, dann entsteht neues Audio. */
const DEMO_VERSION = 2;
/** Sprechtempo der Vorführung bei Soniox (erlaubt 0,7 bis 1,3). Verlauf am 06.11.2026: 1,2 (Chat) war am 05.11.
 *  zu schnell, 0,92 zu langsam, 1,06 noch zu langsam, 1,3 (Obergrenze) zu schnell: 1,04 sind 20 Prozent weniger
 *  als 1,3. */
const DEMO_TEMPO = 1.04;
/** Versuche mit der bevorzugten Stimme, bevor die Ersatzstimme spricht. */
const VERSUCHE = 3;

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

function audioAntwort(audio: ArrayBuffer | Uint8Array, typ: string, herkunft: "treffer" | "neu", ersatzstimme = false) {
  const koerper = audio instanceof Uint8Array ? new Uint8Array(audio) : audio;
  return new Response(koerper, {
    status: 200,
    headers: {
      "content-type": typ || "audio/mpeg",
      "x-damicon-zwischenspeicher": herkunft,
      // Die Ersatzstimme ist kein Dauerzustand: der Browser merkt sie sich nicht, damit der nächste
      // Lauf es wieder mit der bevorzugten Stimme versucht. Sonst darf er den Schritt behalten (er
      // klingt immer gleich), aber nur für diese Person (private).
      ...(ersatzstimme ? { "x-damicon-ersatzstimme": "1", "cache-control": "no-store" } : { "cache-control": "private, max-age=3600" }),
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
  // Die Vorführung spricht ruhiger als der Chat: bei Soniox ein langsameres Tempo, und die Pausen
  // zwischen den Wörtern bleiben (Rückmeldung vom 06.11.2026: Himbi sprach zu schnell, man kam nicht
  // mit). Sokrates kennt kein Tempo und bleibt, wie es ist.
  const stimmen = stimmenFuer(sprache).map((s): Stimme => (s.anbieter === "soniox" ? { ...s, tempo: DEMO_TEMPO, stilleKuerzen: false } : s));
  if (stimmen.length === 0) return fehler(422, "keine-stimme");
  // Wie bei den Antworten: Symbole und Zahlen als Wörter, auf Deutsch echte Umlaute.
  const text = sprechfassung(fuerSprache(roh, sprache), sprache);

  const dienst = createServiceRoleClient();
  // Gesucht wird unter der BEVORZUGTEN Stimme. Hat beim letzten Mal der Rückfall gesprochen, liegt
  // das Audio unter dessen Pfad, dann wird neu erzeugt und die bessere Stimme bekommt ihre Chance.
  const gesucht = ablagePfad(sprache, stimmen[0], text);
  const { data: gespeichert } = await dienst.storage.from(BUCKET).download(gesucht);
  if (gespeichert) return audioAntwort(await gespeichert.arrayBuffer(), gespeichert.type || "audio/mpeg", "treffer");

  // Eine Vorführung klingt nur dann gut, wenn jeder Schritt dieselbe Stimme hat. Fiel die bevorzugte
  // Stimme bei einer Anfrage aus, sprang die Route früher sofort auf die Ersatzstimme, und ein
  // einzelner Schritt klang plötzlich anders. Deshalb erst die bevorzugte Stimme, bis zu dreimal mit
  // kurzer Pause (ein abgewiesener Anruf geht beim zweiten oft durch), und nur wenn sie ganz ausfällt
  // die Ersatzstimme, besser eine andere Stimme als Stille.
  const bevorzugt = stimmen[0];
  const beginn = Date.now();
  let erzeugt: { audio: ArrayBuffer; typ: string; stimme: Stimme } | null = null;
  let letzterGrund = "";
  for (let versuch = 1; versuch <= VERSUCHE && !erzeugt; versuch++) {
    const ergebnis = await erzeugeSprachausgabe(text, bevorzugt);
    if (ergebnis.ok) {
      erzeugt = { audio: ergebnis.audio, typ: ergebnis.typ, stimme: bevorzugt };
      break;
    }
    letzterGrund = ergebnis.grund;
    console.error(`[damicon] Sprachausgabe der Vorführung, Versuch ${versuch} über ${bevorzugt.anbieter} fehlgeschlagen:`, ergebnis.grund);
    // Die Route darf höchstens eine Minute laufen: nach 25 s lohnt kein weiterer Versuch.
    if (versuch < VERSUCHE && Date.now() - beginn < 25_000) await new Promise((fertig) => setTimeout(fertig, 600 * versuch));
    else break;
  }
  let ersatzstimme = false;
  if (!erzeugt && stimmen.length > 1) {
    const ersatz = await erzeugeSprachausgabeMitRueckfall(text, stimmen.slice(1));
    if (ersatz.ok) {
      erzeugt = { audio: ersatz.audio, typ: ersatz.typ, stimme: ersatz.stimme };
      ersatzstimme = true;
      console.warn("[damicon] Sprachausgabe der Vorführung: Ersatzstimme für einen Schritt, Grund:", letzterGrund);
    }
  }
  if (!erzeugt) {
    // Der Grund kann interne Angaben enthalten (Umgebungsvariable, Rohantwort des Dienstes): nur ins
    // Server-Protokoll. Der Browser spielt dann die Untertitel weiter.
    console.error("[damicon] Sprachausgabe der Vorführung fehlgeschlagen:", letzterGrund);
    return fehler(502, "dienst-nicht-erreichbar");
  }

  const audio = erzeugt.audio;
  const typ = erzeugt.typ || "audio/mpeg";
  // Der Ton einer Ersatzstimme wird NICHT abgelegt: sonst spräche dieser Schritt in jeder späteren
  // Vorführung mit der anderen Stimme. Beim nächsten Mal bekommt die bevorzugte Stimme ihre Chance.
  if (!ersatzstimme) {
    const pfad = ablagePfad(sprache, erzeugt.stimme, text);
    // Nach der Antwort ablegen: wer zuhört, wartet nicht. Ein Fehler beim Ablegen macht die fertige
    // Antwort nicht kaputt, dann bleibt es beim nächsten Mal eben wieder langsam.
    after(async () => {
      const { error } = await dienst.storage.from(BUCKET).upload(pfad, audio, { contentType: typ, upsert: false });
      if (error) console.error("[damicon] Sprachausgabe der Vorführung nicht zwischengespeichert:", error.message);
    });
  }
  return audioAntwort(audio, typ, "neu", ersatzstimme);
}
