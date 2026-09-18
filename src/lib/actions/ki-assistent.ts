"use server";

import { getTranslations } from "next-intl/server";
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

  const t = await getTranslations("kiAssistentAnsicht.fallback");
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
      const systemPrompt = baueSystemPrompt(baueGesamtWissenskontext(quellen, preislisten));
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

  // Antwort und Eskalation schreibt die Datenbank, nicht dieser Aufruf: die
  // Insert-Policy laesst direkt nur die eigene Frage durch, sonst koennte
  // sich jede angemeldete Person eine Assistentenantwort in den eigenen
  // Verlauf schreiben (Migration 20261030000000). Die Werkzeugaufrufe des
  // Agenten (Spalte aus 20261026000000) laufen deshalb ebenfalls ueber die
  // Funktion statt ueber ein direktes Insert.
  const { error: assistentFehler } = await supabase.rpc("ki_chat_antwort_schreiben", {
    p_inhalt: antwortText,
    p_anbieter_name: anbieterName ?? "",
    p_fallback: fallback,
    p_werkzeugaufrufe: werkzeugaufrufe.length > 0 ? werkzeugaufrufe : undefined,
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
    await supabase.rpc("ki_chat_eskalation_schreiben", {
      p_inhalt: await getTranslations("kiAssistentAnsicht").then((tt) =>
        tt("eskalationAutomatisch"),
      ),
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
  const { error } = await supabase.rpc("ki_chat_eskalation_schreiben", {
    p_inhalt: t("eskalationAngefordert"),
  });
  if (error) return dbFehler(error);

  await protokolliere(profil, "ki_chat.eskalation_angefordert");
  aktualisiere(formData);
  return ok("ok.kiEskalationAngefordert");
}
