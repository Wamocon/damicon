"use server";

import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { ladeAktivenStandardAnbieter } from "@/lib/ai/lade-anbieter";
import { requirePermission, type SessionProfile } from "@/lib/auth";
import { dbFehler, fehler, ok, zugriffsFehler, type AktionsStatus } from "@/lib/actions/status";
import { ladeKiChatVerlauf, ladeWissensPreislisten } from "@/lib/data/ki-assistent";
import {
  baueGesamtWissenskontext,
  baueSystemPrompt,
  MAX_NACHRICHT_LAENGE,
  sollteAutomatischEskalieren,
  wissensQuellenFuerFaehigkeiten,
  type KiChatNachrichtZeile,
} from "@/lib/domain/ki-assistent";
import { hasPermission } from "@/lib/rbac";
import { sendeChatAnfrage } from "@/lib/ai/anbieter-client";
import { sendeAgentAnfrage } from "@/lib/ai/agent";
import { entschluessleApiKey } from "@/lib/ai/schluessel";
import { transkribiereAudio, transkriptionsMeldung, waermeTranskriptionVor } from "@/lib/ai/transkription-client";
import { spracherkennungAnbieter, transkribiereMitSoniox } from "@/lib/ai/soniox-client";
import type { ChatNachricht } from "@/lib/ai/anfrage";
import type { Json } from "@/lib/database.types";
import { text, aktualisiere, protokolliere as protokolliereBasis } from "@/lib/actions/formular-helfer";

// Chat-Aktionen des KI-Assistenten (Anforderung 5.4/5.5). Masterplan-Vorgabe
// woertlich: "RBAC-Gate vor dem Modellaufruf, deterministischer Fallback,
// Protokollierung, kein 5xx bei Ausfall" - die Reihenfolge unten haelt sich
// bewusst an genau diese vier Punkte:
//   1. requirePermission() zuerst, vor jedem weiteren Schritt (RBAC-Gate).
//   2. Bei jedem Fehlerpfad (kein Anbieter konfiguriert, Zeitueberschreitung,
//      Fehlerantwort) eine deterministische, uebersetzte Ausweichantwort statt
//      eines geworfenen Fehlers (Fallback).
//   3. audit_events-Eintrag bei jeder Aktion, echt wie fallback (Protokoll).
//   4. Der gesamte Modellaufruf steht in try/catch; selbst ein Bug in
//      sendeChatAnfrage() (das laut eigenem Vertrag schon nie wirft) kann
//      diese Aktion nicht zu einem ungefangenen Serverfehler machen.
//
// Bewusst offen (adversarischer Review, nicht in diesem Schritt behoben):
// weder hier noch bei kiEskalationAnfordern gibt es eine Ratenbegrenzung -
// jede Rolle mit "ki_assistent:create" kann beliebig oft einen echten,
// kostenpflichtigen Modellaufruf bzw. eine Eskalationszeile ausloesen. Ein
// Doppelklick/Retry auf "Senden" kann zudem zu doppelten Nachrichten und
// doppeltem Modellaufruf fuehren (istErsteNachricht liest den Verlauf vor
// dem Insert, keine Sperre gegen echte Gleichzeitigkeit) - abgemildert,
// nicht ausgeschlossen, durch SubmitKnopf() (formular-kit.tsx), das den
// Knopf waehrend eines laufenden Requests deaktiviert, dasselbe Mass an
// Schutz wie bei jedem anderen Formular in diesem Projekt.

const MAX_VERLAUF_FUER_MODELL = 10;

function protokolliere(
  profil: SessionProfile,
  aktion: string,
  metadata: Record<string, Json> = {},
) {
  return protokolliereBasis(profil, aktion, "ki_chat_nachrichten", profil.id, metadata);
}

// ladeAktivenStandardAnbieter() ist jetzt in lib/ai/lade-anbieter.ts - der
// neue streamende Route Handler (anthropic-Pfad, app/api/ki-assistent/
// route.ts) braucht dieselbe Funktion, keine zweite Kopie.

// Baut den an das Modell uebergebenen Verlauf: Systemprompt zuerst, danach
// die letzten echten Gespraechsbeitraege (keine system-Zeilen, siehe
// Kommentar unten), zuletzt die neue Nutzernachricht.
function baueVerlaufFuerModell(
  systemPrompt: string,
  bisherigerVerlauf: KiChatNachrichtZeile[],
  nachricht: string,
): ChatNachricht[] {
  return [
    { rolle: "system", inhalt: systemPrompt },
    // Nur echte Gespraechsbeitraege, keine system-Zeilen aus dem Verlauf
    // (Eskalationshinweise u. Ae.) - sonst mischten sich die bei
    // baueAnthropicAnfrage() alle in dasselbe system-Feld wie der
    // eigentliche Systemprompt.
    ...bisherigerVerlauf
      .filter((n) => n.rolle !== "system")
      .slice(-MAX_VERLAUF_FUER_MODELL)
      .map((n) => ({ rolle: n.rolle, inhalt: n.inhalt })),
    { rolle: "nutzer", inhalt: nachricht },
  ];
}

export async function kiNachrichtSenden(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  // 1. RBAC-Gate vor jedem weiteren Schritt.
  let profil: SessionProfile;
  try {
    profil = await requirePermission("ki_assistent", "create");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const nachricht = text(formData, "nachricht");
  if (!nachricht || nachricht.length > MAX_NACHRICHT_LAENGE) {
    return fehler("fehler.eingabe");
  }

  const bisherigerVerlauf = await ladeKiChatVerlauf();

  // Anforderung 5.5 (Einwilligung): vor der allerersten Nachricht muss der
  // Transparenzhinweis bestaetigt worden sein - das Formular schickt das
  // Haekchen nur bei einem leeren Verlauf mit (siehe
  // ki-assistent-formulare.tsx), ab der zweiten Nachricht gilt die
  // Einwilligung als erteilt.
  const istErsteNachricht = bisherigerVerlauf.nachrichten.length === 0;
  if (istErsteNachricht && text(formData, "einwilligung") !== "on") {
    return fehler("fehler.einwilligung");
  }

  // Die Systemsprache bestimmt alles an diesem Zug: die Antwort des Modells
  // und die Ausweichtexte, die diese Aktion selbst schreibt. Siehe
  // api/ki-assistent/route.ts, warum nicht mehr aus dem Fragetext erkannt
  // wird.
  const antwortIn = await getLocale();
  const t = await getTranslations({ locale: antwortIn, namespace: "kiAssistentAnsicht.fallback" });
  const supabase = await createClient();

  const { error: nutzerFehler } = await supabase
    .from("ki_chat_nachrichten")
    .insert({ profil_id: profil.id, rolle: "nutzer", inhalt: nachricht });
  if (nutzerFehler) return dbFehler(nutzerFehler);

  // 2 + 4. Modellaufruf, vollstaendig gegen Ausnahmen abgesichert - jeder
  // Pfad unten endet in einer eingefuegten Assistenten-Zeile, nie in einem
  // geworfenen Fehler.
  let antwortText: string;
  let anbieterName: string | null = null;
  let fallback = false;
  let werkzeugaufrufe: string[] = [];

  try {
    const anbieter = await ladeAktivenStandardAnbieter();

    if (!anbieter) {
      fallback = true;
      antwortText = t("keinAnbieter");
    } else {
      // Rollenbasierte Wissensgrundlage (Nutzer-Anforderung): welche Themen
      // ueberhaupt im Kontext landen, richtet sich nach denselben
      // Berechtigungen wie ueberall sonst im Projekt (rbac.ts), nicht nach
      // einer Bitte im Prompt - ein Feldarbeiter (brigade) bekommt so nie
      // Preis-/Kundendaten in seinen Kontext, unabhaengig davon, wonach er
      // fragt.
      const quellen = wissensQuellenFuerFaehigkeiten({
        siehtProdukteUndPreise:
          hasPermission(profil.role, "b2b_portal", "view") ||
          hasPermission(profil.role, "sortenkatalog", "view"),
        siehtFeldbetrieb:
          hasPermission(profil.role, "pflueckaufgaben", "view") ||
          hasPermission(profil.role, "kuehlkette", "view"),
      });
      const preislisten = quellen.includes("preisliste") ? await ladeWissensPreislisten() : [];
      const systemPrompt = baueSystemPrompt(baueGesamtWissenskontext(quellen, preislisten), antwortIn);
      const verlaufFuerModell = baueVerlaufFuerModell(systemPrompt, bisherigerVerlauf.nachrichten, nachricht);

      const apiKey = entschluessleApiKey(anbieter.api_key_chiffrat);

      // 'anthropic' laeuft ueber den werkzeugfaehigen Agenten (agent.ts,
      // Vercel AI SDK) - das Modell darf live in Steuer-/Arbeits-/Pruef-
      // Daten nachsehen statt sich nur auf den statischen Wissenskontext zu
      // verlassen. 'openai_kompatibel' bleibt auf dem bisherigen, reinen
      // Text-Anfrage-Pfad (siehe Kommentar in agent.ts, warum das noch nicht
      // vereinheitlicht ist).
      if (anbieter.typ === "anthropic") {
        const antwort = await sendeAgentAnfrage(
          { basisUrl: anbieter.basis_url, modell: anbieter.modell, apiKey },
          profil.role,
          verlaufFuerModell,
        );
        if (antwort.ok) {
          antwortText = antwort.text;
          anbieterName = anbieter.anzeige_name;
          werkzeugaufrufe = antwort.werkzeugaufrufe;
        } else {
          console.error("[damicon] KI-Agent fehlgeschlagen:", antwort.grund);
          fallback = true;
          antwortText = t("antwort");
        }
      } else {
        const antwort = await sendeChatAnfrage(
          { typ: anbieter.typ, basisUrl: anbieter.basis_url, modell: anbieter.modell, apiKey },
          verlaufFuerModell,
        );

        if (antwort.ok) {
          antwortText = antwort.text;
          anbieterName = anbieter.anzeige_name;
        } else {
          console.error("[damicon] KI-Anbieter-Aufruf fehlgeschlagen:", antwort.grund);
          fallback = true;
          antwortText = t("antwort");
        }
      }
    }
  } catch (error) {
    // Defense-in-depth: sendeChatAnfrage() wirft laut eigenem Vertrag nie,
    // aber ein Fehler in der Verschluesselung oder beim Laden der
    // Preisliste soll aus demselben Grund nie bis zum Nutzer durchschlagen.
    console.error("[damicon] KI-Assistent unerwartet fehlgeschlagen:", error);
    fallback = true;
    antwortText = t("antwort");
  }

  const { error: assistentFehler } = await supabase.from("ki_chat_nachrichten").insert({
    profil_id: profil.id,
    rolle: "assistent",
    inhalt: antwortText,
    anbieter_name: anbieterName,
    fallback,
    werkzeugaufrufe: werkzeugaufrufe.length > 0 ? werkzeugaufrufe : null,
  });
  if (assistentFehler) return dbFehler(assistentFehler);

  // Anforderung 5.5: nach wiederholtem Fallback in Folge automatisch
  // eskalieren, statt den Nutzer beliebig oft an einer nicht antwortenden KI
  // abprallen zu lassen.
  const aktuellerVerlauf = [
    ...bisherigerVerlauf.nachrichten,
    { rolle: "assistent" as const, fallback },
  ];
  if (fallback && sollteAutomatischEskalieren(aktuellerVerlauf)) {
    await supabase.from("ki_chat_nachrichten").insert({
      profil_id: profil.id,
      rolle: "system",
      inhalt: await getTranslations("kiAssistentAnsicht").then((tt) => tt("eskalationAutomatisch")),
      eskaliert: true,
    });
  }

  await protokolliere(profil, "ki_chat.nachricht", { fallback, anbieter: anbieterName });
  aktualisiere(formData);
  return ok("ok.kiNachrichtGesendet");
}

export async function kiEskalationAnfordern(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("ki_assistent", "create");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const t = await getTranslations("kiAssistentAnsicht");
  const supabase = await createClient();
  const { error } = await supabase.from("ki_chat_nachrichten").insert({
    profil_id: profil.id,
    rolle: "system",
    inhalt: t("eskalationAngefordert"),
    eskaliert: true,
  });
  if (error) return dbFehler(error);

  await protokolliere(profil, "ki_chat.eskalation_angefordert");
  aktualisiere(formData);
  return ok("ok.kiEskalationAngefordert");
}

// --- Sprachnachricht diktieren (Anforderung 5.4, Ergaenzung) -----------------
// Der Browser nimmt auf, diese Aktion schickt die Datei an Caesar
// (Transkriptionsdienst im Buero-LAN) und gibt den Text zurueck. Der Browser
// spricht bewusst NICHT selbst mit Caesar - dieselbe Begruendung wie bei
// anbieter-client.ts: die Adresse des Dienstes und jeder kuenftige Schluessel
// bleiben auf dem Server, und das RBAC-Gate greift vor dem Aufruf.
//
// Der Text landet im Eingabefeld, nicht im Chat: ein verhoertes Diktat, das
// ungeprueft an die Kundschaft ginge, waere schlimmer als ein Tippfehler.
// Abgeschickt wird weiterhin von Hand, ueber denselben Weg wie eine getippte
// Frage - deshalb braucht dieser Schritt keine eigene Eskalations- oder
// Sicherheitslogik.

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export async function transkribiereSprachnachricht(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("ki_assistent", "create");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const audio = formData.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) return fehler("fehler.eingabe");
  if (audio.size > MAX_AUDIO_BYTES) return fehler("fehler.dateiGross");

  const name = audio instanceof File && audio.name ? audio.name : "aufnahme.webm";

  // Welcher Dienst erkennt? Standard ist Whisper auf der eigenen Maschine;
  // KI_SPRACHERKENNUNG_ANBIETER=soniox schaltet um. Schlaegt Soniox fehl -
  // Stoerung, Zeitueberschreitung, fehlender Schluessel -, uebernimmt Whisper
  // still. Wer diktiert, soll von einem Ausfall beim Dienstleister nichts
  // merken.
  let antwort = null;
  if (spracherkennungAnbieter() === "soniox") {
    const ueberSoniox = await transkribiereMitSoniox(audio, name);
    if (ueberSoniox.ok) antwort = ueberSoniox;
    else console.error("[damicon] Soniox fehlgeschlagen, weiter mit Whisper:", ueberSoniox.grund);
  }
  // Die Oberflaechensprache als Hinweis, welche Sprache zu erwarten ist -
  // ungeprueft weitergereicht, weil transkribiereAudio() nur die
  // unterstuetzten Werte durchlaesst und alles andere still verwirft.
  // (Soniox bekommt bewusst keinen Hinweis, siehe soniox-client.ts.)
  antwort ??= await transkribiereAudio(audio, name, text(formData, "sprache"));

  if (!antwort.ok) {
    console.error("[damicon] Transkription fehlgeschlagen:", antwort.grund);
    return fehler(transkriptionsMeldung(antwort.grund));
  }

  // Der Text selbst wird nicht protokolliert - er steht gleich als Frage im
  // Verlauf, sobald die Nutzerin ihn abschickt. Hier nur, dass diktiert wurde.
  await protokolliere(profil, "ki_chat.diktat", { zeichen: antwort.text.length });

  return ok("ok.transkription", antwort.text);
}

/** Stoesst das Laden des Spracherkennungsmodells an, damit die erste echte
 *  Aufnahme nicht in die kalte Ladezeit laeuft (gemessen 221 s kalt gegen
 *  7,2 s warm). Ergebnis bewusst ohne Rueckmeldung an die Oberflaeche: ein
 *  misslungener Aufwaermversuch darf das Modul nicht stoeren. */
export async function waermeSpracherkennungVor(): Promise<void> {
  try {
    await requirePermission("ki_assistent", "create");
  } catch {
    return;
  }
  await waermeTranskriptionVor().catch(() => false);
}
