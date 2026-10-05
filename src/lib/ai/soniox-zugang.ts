// Ausgabe der Kurzzeitschluessel fuer Soniox: Live-Diktat (api/ki-spracherkennung)
// und Vorlese-Strom (api/ki-sprachausgabe/schluessel).
//
// Warum hier und nicht in den Routen (Vibecode-Cleanup 28.09.2026, Funde 38/81/86):
// die Schranken dieser beiden Routen waren nur als Quelltext festgenagelt. Eine
// auskommentierte Rechtepruefung oder ein "&& false" am Nachweis blieb in allen
// Tests gruen. Jetzt liegt der ganze Ablauf hier, und die Routen reichen nur die
// Teile herein, die eine Anfrage brauchen (Sitzung, Datenbank, Zaehler, Soniox).
// supabase/tests/schluessel-routen.ts ruft ihn mit Attrappen dafuer auf und prueft
// jede Absage samt der Zusage, dass dabei kein Soniox-Schluessel geholt wird.
//
// Rechte, Schalter, Adresse und Signatur werden NICHT hereingereicht: sie kommen
// aus rbac.ts und den Umgebungsvariablen, genau wie in Produktion. Faellt eine
// dieser Pruefungen weg, wird ein Test rot.
import { hasPermission, type Role } from "@/lib/rbac";
import { diktatLiveAn, sprechertrennungAn } from "@/lib/domain/schalter";
import { GESPRAECH_SITZUNG_S, liveKonfiguration, SCHLUESSEL_GUELTIG_S, SITZUNG_HOECHSTENS_S, sonioxLiveAdresse, type LiveZweck } from "@/lib/domain/diktat-live";
import { holeSonioxSchluessel, sonioxBasisUrl, sonioxReferenz } from "@/lib/ai/soniox-client";
import { SONIOX_TTS_MODELL } from "@/lib/ai/sprachausgabe-client";
import { skaliereFuerSprachausgabe } from "@/lib/ai/ratenbegrenzung";
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
import { istUuid } from "@/lib/utils";

// --- Feste Obergrenzen (Vibecode-Cleanup 28.09.2026, Funde 15/26/78/79) ----------
//
// Die Grenze aus dem Admin-Bereich gilt nur, wenn dort eine eingestellt ist; im
// Auslieferungszustand gibt es keine (lib/ai/ratenbegrenzung.ts). Fuer Schluessel,
// mit denen der Browser direkt bei Soniox Audio verbraucht, war das beim Diktat
// ein offener Hahn: jede Rolle mit Chat-Recht, auch "kunde", konnte beliebig viele
// Sitzungen oeffnen. Deshalb hier feste Grenzen je Person und Minute, UNABHAENGIG
// von der Einstellung - dieselbe Art wie STROM_SCHLUESSEL_JE_MINUTE beim Vorlesen.
//
// Ehrlich zur Reichweite: der Zaehler liegt im Speicher je Serverinstanz
// (ratenbegrenzung.ts). Mit mehreren warmen Instanzen auf Vercel ist die Grenze ein
// Vielfaches, und ein Tageskontingent gibt es nicht. Die Grenzen deckeln den Takt,
// nicht die Summe.

/** Live-Diktat: ein Schluessel je Aufnahme, eine Aufnahme dauert Sekunden. Zwoelf
 *  in der Minute schafft niemand, der wirklich diktiert. */
export const DIKTAT_SCHLUESSEL_JE_MINUTE = 12;

/** Gespraech (Sprachmodus): EINE Verbindung hoert bis zu GESPRAECH_SITZUNG_S zu,
 *  neu verbunden wird nur nach einem Abbruch (hoechstens MAX_NEUVERSUCHE schnelle
 *  hintereinander, domain/sprachmodus.ts) oder nach dem Stummschalten. Ein
 *  Schluessel ist hier 15-mal so viel Sitzungszeit wie beim Diktat, deshalb ein
 *  eigener, engerer Zaehler - vorher zaehlte das Gespraech wie ein Diktat. */
export const GESPRAECH_SCHLUESSEL_JE_MINUTE = 6;

/** Nachweis ueber eine gespeicherte Antwort: nur so lange nach ihrem Entstehen.
 *  Vorher reichte irgendeine alte eigene Antwort, jeden Tag aufs Neue, fuer einen
 *  Schluessel, der beliebigen Text spricht. Aeltere Antworten liest der Knopf
 *  trotzdem vor: der Strom sagt ab, und der Datei-Weg (api/ki-sprachausgabe, Text
 *  aus der gespeicherten Nachricht, zwischengespeichert) uebernimmt
 *  (components/ki/sprachausgabe-live.ts, beiAufgabe). */
export const NACHWEIS_NACHRICHT_FRISCH_MS = 15 * 60 * 1000;

/** So weit darf der Zeitstempel einer Antwort vor unserer Uhr liegen (Uhren von
 *  Datenbank und Funktion). Mehr hat sich jemand ausgedacht. */
const UHR_SPIELRAUM_MS = 60_000;

/** Was eine Anfrage von aussen braucht. Die Routen reichen die echten Funktionen
 *  herein (getSessionProfile, ladeRatenlimitGrenze, ratenlimitUeberschritten,
 *  holeSonioxSchluessel), der Test Attrappen. */
export interface SchluesselUmgebung {
  /** Die angemeldete Person, null ohne Anmeldung. */
  profil: () => Promise<{ id: string; role: Role } | null>;
  /** Die Grenze aus dem Admin-Bereich je Minute, null = keine eingestellt. */
  ratenGrenze: (rolle: Role) => Promise<number | null>;
  /** Zaehlt und sagt, ob die Grenze schon erreicht war (lib/ai/ratenbegrenzung.ts). */
  ueberschritten: (schluessel: string, grenzeProMinute: number | null) => boolean;
  holeSchluessel: typeof holeSonioxSchluessel;
}

/** Eine Absage. Der Grund geht an den Browser - nie mehr als ein Wort, das nichts
 *  ueber das Innere verraet. `no-store`: eine Absage darf nirgends haengen bleiben. */
export function schluesselFehler(status: number, grund: string): Response {
  return Response.json({ grund }, { status, headers: { "cache-control": "no-store" } });
}

// --- Live-Diktat ----------------------------------------------------------------

/** Liest Sprache und Zweck. Ein kaputter Koerper ist kein Fehler: dann ein
 *  Diktat ohne Sprachhinweis. Nur die zwei bekannten Zwecke; alles andere ist
 *  ein Diktat. */
async function leseDiktatWunsch(req: Request): Promise<{ sprache: string | undefined; zweck: LiveZweck }> {
  try {
    const body = (await req.json()) as { sprache?: unknown; zweck?: unknown };
    return {
      sprache: typeof body.sprache === "string" ? body.sprache : undefined,
      zweck: body.zweck === "gespraech" ? "gespraech" : "diktat",
    };
  } catch {
    return { sprache: undefined, zweck: "diktat" };
  }
}

export async function gibDiktatSchluessel(req: Request, u: SchluesselUmgebung): Promise<Response> {
  const profil = await u.profil();
  if (!profil) return schluesselFehler(401, "nicht-angemeldet");
  // Dieselbe Berechtigung wie der Chat und der Datei-Weg des Diktats.
  if (!hasPermission(profil.role, "ki_assistent", "create")) return schluesselFehler(403, "keine-berechtigung");
  if (!diktatLiveAn()) return schluesselFehler(404, "nicht-aktiv");

  const adresse = sonioxLiveAdresse(sonioxBasisUrl(), process.env.SONIOX_STT_WS_URL);
  if (!adresse) {
    console.error("[damicon] Live-Diktat: keine Adresse - SONIOX_API_URL (api.<region>.soniox.com) oder SONIOX_STT_WS_URL setzen");
    return schluesselFehler(404, "nicht-aktiv");
  }

  // Erst der Zweck, dann gezaehlt: das Gespraech hat seinen eigenen Zaehler.
  const { sprache, zweck } = await leseDiktatWunsch(req);

  // Feste Obergrenze je Zweck, auch ohne Einstellung im Admin-Bereich ...
  const fest =
    zweck === "gespraech"
      ? u.ueberschritten(`stt-gespraech:${profil.id}`, GESPRAECH_SCHLUESSEL_JE_MINUTE)
      : u.ueberschritten(`stt-live:${profil.id}`, DIKTAT_SCHLUESSEL_JE_MINUTE);
  if (fest) return schluesselFehler(429, "ratenlimit");
  // ... und dazu derselbe Zaehler wie der Datei-Weg (actions/ki-assistent.ts),
  // wenn der Admin-Bereich eine Grenze setzt.
  if (u.ueberschritten(`stt:${profil.id}`, await u.ratenGrenze(profil.role))) {
    return schluesselFehler(429, "ratenlimit");
  }

  const schluessel = await u.holeSchluessel("transcribe_websocket", {
    gueltigS: SCHLUESSEL_GUELTIG_S,
    // Im Gespraech hoert eine Verbindung durchgehend zu (domain/diktat-live.ts).
    sitzungS: zweck === "gespraech" ? GESPRAECH_SITZUNG_S : SITZUNG_HOECHSTENS_S,
    referenz: sonioxReferenz("diktat", profil.id),
  });
  if (!schluessel.ok) {
    // Der Grund kann Teile der Dienstantwort enthalten - nur ins Protokoll.
    console.error("[damicon] Live-Diktat: kein Schluessel:", schluessel.grund);
    return schluesselFehler(502, "dienst-nicht-erreichbar");
  }

  return Response.json(
    { schluessel: schluessel.schluessel, adresse, konfiguration: liveKonfiguration(sprache, zweck, { sprechertrennung: sprechertrennungAn() }) },
    { headers: { "cache-control": "no-store" } },
  );
}

// --- Vorlese-Strom ----------------------------------------------------------------

/** Die Zeile, die als Nachweis ueber eine Nachrichten-ID dient. */
export interface NachweisNachricht {
  rolle: string;
  profil_id: string;
  erstellt_am: string;
}

export interface VorleseUmgebung extends SchluesselUmgebung {
  /** Liest eine Nachricht MIT DER SITZUNG der Person (RLS). `ok: false` heisst
   *  Datenbankfehler, `nachricht: null` nicht gefunden oder nicht sichtbar. */
  ladeNachricht: (id: string) => Promise<{ ok: true; nachricht: NachweisNachricht | null } | { ok: false }>;
  /** Nur fuer den Test; sonst die Uhr. */
  jetzt?: () => number;
}

/** Taugt eine gespeicherte Zeile als Nachweis? Nur eine ANTWORT (rolle
 *  assistent), nur die EIGENE - das Buero liest per RLS auch fremde Gespraeche,
 *  die sollen keinen Schluessel oeffnen -, und nur eine FRISCHE
 *  (NACHWEIS_NACHRICHT_FRISCH_MS). */
function nachweisNachrichtGilt(nachricht: NachweisNachricht | null, profilId: string, jetzt: number): boolean {
  if (!nachricht || nachricht.rolle !== "assistent" || nachricht.profil_id !== profilId) return false;
  const erstellt = Date.parse(nachricht.erstellt_am);
  if (!Number.isFinite(erstellt)) return false;
  return erstellt <= jetzt + UHR_SPIELRAUM_MS && jetzt - erstellt <= NACHWEIS_NACHRICHT_FRISCH_MS;
}

export async function gibVorleseSchluessel(req: Request, u: VorleseUmgebung): Promise<Response> {
  const profil = await u.profil();
  if (!profil) return schluesselFehler(401, "nicht-angemeldet");
  // Dieselbe Berechtigung wie der Chat: wer nicht chatten darf, hat nichts vorzulesen.
  if (!hasPermission(profil.role, "ki_assistent", "create")) return schluesselFehler(403, "keine-berechtigung");
  // 404 heisst fuer den Browser: kein Strom hier, den Abschnitts-Weg nehmen.
  if (!sprachausgabeStromAn()) return schluesselFehler(404, "nicht-aktiv");

  const adresse = sonioxTtsWsAdresse(sonioxBasisUrl(), process.env.SONIOX_TTS_WS_URL);
  if (!adresse) {
    console.error("[damicon] Vorlese-Strom: keine Adresse - SONIOX_API_URL (api.<region>.soniox.com) oder SONIOX_TTS_WS_URL setzen");
    return schluesselFehler(404, "nicht-aktiv");
  }

  // Feste Obergrenze fuer diesen Endpunkt, und dazu der Zaehler des Vorlesens.
  if (u.ueberschritten(`tts-strom:${profil.id}`, STROM_SCHLUESSEL_JE_MINUTE)) return schluesselFehler(429, "ratenlimit");
  if (u.ueberschritten(`tts:${profil.id}`, skaliereFuerSprachausgabe(await u.ratenGrenze(profil.role)))) {
    return schluesselFehler(429, "ratenlimit");
  }

  // Nachweis, dass es etwas vorzulesen gibt.
  let body: { zug?: unknown; ablauf?: unknown; sig?: unknown; nachrichtId?: unknown };
  try {
    body = await req.json();
  } catch {
    return schluesselFehler(400, "ungueltige-eingabe");
  }
  if (typeof body.nachrichtId === "string") {
    if (!istUuid(body.nachrichtId)) return schluesselFehler(400, "ungueltige-eingabe");
    const gelesen = await u.ladeNachricht(body.nachrichtId);
    if (!gelesen.ok) return schluesselFehler(500, "db-fehler");
    // Nicht gefunden, fremd, alt und "keine Antwort" sehen gleich aus.
    if (!nachweisNachrichtGilt(gelesen.nachricht, profil.id, (u.jetzt ?? Date.now)())) return schluesselFehler(403, "nicht-erlaubt");
  } else {
    const geheimnis = sprachausgabeGeheimnis();
    const zug = typeof body.zug === "string" ? body.zug : "";
    const ablauf = typeof body.ablauf === "number" ? body.ablauf : Number.NaN;
    const sig = typeof body.sig === "string" ? body.sig : "";
    if (!geheimnis || !zug) return schluesselFehler(403, "nicht-erlaubt");
    // Zug-Nachweis: dieselbe Signatur wie ein Abschnitt, mit Nummer 0 und leerem
    // Text (api/ki-assistent schickt ihn zu Beginn jeder Antwort).
    const geprueft = pruefeAbschnitt({ nutzerId: profil.id, zug, nr: 0, text: "", ablauf, sig }, geheimnis, (u.jetzt ?? Date.now)());
    if (!geprueft.ok) {
      console.warn("[damicon] Vorlese-Strom: Nachweis abgewiesen:", geprueft.grund);
      return schluesselFehler(403, "nicht-erlaubt");
    }
  }

  const schluessel = await u.holeSchluessel("tts_rt", {
    gueltigS: STROM_SCHLUESSEL_GUELTIG_S,
    sitzungS: STROM_SITZUNG_S,
    referenz: sonioxReferenz("vorlesen", profil.id),
  });
  if (!schluessel.ok) {
    // Der Grund kann Teile der Dienstantwort enthalten - nur ins Protokoll.
    console.error("[damicon] Vorlese-Strom: kein Schluessel:", schluessel.grund);
    return schluesselFehler(502, "dienst-nicht-erreichbar");
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
