"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { requirePermission, type SessionProfile } from "@/lib/auth";
import { dbFehler, fehler, ok, zugriffsFehler, type AktionsStatus } from "@/lib/actions/status";
import { ladeKiChatVerlauf, ladeWissensPreislisten } from "@/lib/data/ki-assistent";
import {
  baueGesamtWissenskontext,
  baueSystemPrompt,
  sollteAutomatischEskalieren,
  wissensQuellenFuerFaehigkeiten,
} from "@/lib/domain/ki-assistent";
import { hasPermission } from "@/lib/rbac";
import { sendeChatAnfrage } from "@/lib/ai/anbieter-client";
import { entschluessleApiKey } from "@/lib/ai/schluessel";
import type { ChatNachricht } from "@/lib/ai/anfrage";
import type { Json } from "@/lib/database.types";

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

const MAX_NACHRICHT_LAENGE = 2000;
const MAX_VERLAUF_FUER_MODELL = 10;

function text(formData: FormData, feld: string): string {
  return String(formData.get(feld) ?? "").trim();
}

function aktualisiere(formData: FormData) {
  const pfad = text(formData, "pfad");
  if (pfad.startsWith("/")) revalidatePath(pfad);
}

async function protokolliere(
  profil: SessionProfile,
  aktion: string,
  metadata: Record<string, Json> = {},
) {
  const supabase = await createClient();
  await supabase.from("audit_events").insert({
    actor: `${profil.fullName} (${profil.role})`,
    aktion,
    ressource: "ki_chat_nachrichten",
    ressource_id: profil.id,
    metadata,
  });
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

  try {
    const dienst = createServiceRoleClient();
    const { data: anbieter } = await dienst
      .from("ki_anbieter")
      .select("name, anzeige_name, typ, basis_url, modell, api_key_chiffrat")
      .eq("aktiv", true)
      .eq("ist_standard", true)
      .maybeSingle();

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

      const verlaufFuerModell: ChatNachricht[] = [
        { rolle: "system", inhalt: systemPrompt },
        // Nur echte Gespraechsbeitraege, keine system-Zeilen aus dem Verlauf
        // (Eskalationshinweise u. Ae.) - sonst mischten sich die bei
        // baueAnthropicAnfrage() alle in dasselbe system-Feld wie der
        // eigentliche Systemprompt.
        ...bisherigerVerlauf.nachrichten
          .filter((n) => n.rolle !== "system")
          .slice(-MAX_VERLAUF_FUER_MODELL)
          .map((n) => ({ rolle: n.rolle, inhalt: n.inhalt })),
        { rolle: "nutzer", inhalt: nachricht },
      ];

      const apiKey = entschluessleApiKey(anbieter.api_key_chiffrat);
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
