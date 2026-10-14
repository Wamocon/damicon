"use client";

// Die Zustände der Verlaufsfläche im KI-Chat (ki-chat.tsx), jeder eine kleine,
// reine Darstellung: der leere Anfang mit Vorschlägen, die Karte für einen
// Klick, den der Agent freigeben lassen will, die Statuszeile, solange er
// arbeitet, und die Fehlermeldung je Fehlerart (lib/ai/chat-fehler.ts).

import { useMemo, type ReactNode } from "react";
import type { useTranslations } from "next-intl";
import { Check, MousePointerClick } from "lucide-react";
import { Himbeere } from "@/components/ki/himbeere";
import { waehleVorschlaege } from "@/components/ki/ki-chat-segmente";
import type { KlickAnfrageMitEntscheidung } from "@/components/ki/ki-chat-werkzeuge";
import type { KiModus } from "@/components/ki/ki-pane-kontext";
import { AKTIONS_NAMEN, AKTIONS_RECHTE } from "@/lib/ai/aktionen-meta";
import { chatFehlerArt, type ChatFehlerArt } from "@/lib/ai/chat-fehler";
import { modules } from "@/lib/modules";
import { hasPermission, type Role } from "@/lib/rbac";

type Uebersetzer = ReturnType<typeof useTranslations>;

/** Der leere Verlauf: Himbi, was die Rolle hier kann, und Vorschläge zum Anfangen. */
export function KiChatLeer({
  t,
  rolle,
  modus,
  gesperrt,
  onVorschlag,
}: {
  t: Uebersetzer;
  rolle: Role;
  /** Der eingestellte Modus (nicht der Sprachmodus): danach richten sich Text und Vorschläge. */
  modus: KiModus;
  /** Vorschläge gesperrt: die Einwilligung fehlt, oder es läuft gerade etwas. */
  gesperrt: boolean;
  onVorschlag: (vorschlag: string) => void;
}) {
  const vorschlaege = useMemo(() => waehleVorschlaege(rolle, modus), [rolle, modus]);
  const zaehler = useMemo(
    () => ({
      bereiche: modules.filter((m) => hasPermission(rolle, m.resource, "view")).length,
      aktionen: AKTIONS_NAMEN.filter((n) => hasPermission(rolle, AKTIONS_RECHTE[n].resource, AKTIONS_RECHTE[n].verb)).length,
    }),
    [rolle],
  );
  return (
    <div className="ki-leer">
      <span className="ki-leer__zeichen" aria-hidden>
        <Himbeere groesse={78} schweben />
      </span>
      <h3 className="ki-leer__titel">{t("leerTitel")}</h3>
      <p className="ki-leer__text">{t(`modus.${modus}.beschreibung`)}</p>
      <p className="ki-leer__faehigkeiten">{t("leerBereiche", zaehler)}</p>
      <div className="ki-leer__vorschlaege">
        {vorschlaege.map((schluessel, index) => {
          const vorschlag = t(schluessel);
          return (
            <button
              key={schluessel}
              type="button"
              disabled={gesperrt}
              onClick={() => onVorschlag(vorschlag)}
              className="ki-vorschlag"
              style={{ animationDelay: `${index * 70}ms` }}
            >
              {vorschlag}
            </button>
          );
        })}
      </div>
      <p className="ki-leer__hinweis">{t("transparenzHinweisAgent")}</p>
    </div>
  );
}

/** Der Agent möchte etwas anklicken, das Daten sendet, löscht oder hinausführt (ki-chat-werkzeuge.ts). */
export function KiChatKlickKarte({ anfrage, t }: { anfrage: KlickAnfrageMitEntscheidung; t: Uebersetzer }) {
  return (
    <div className="ki-aktion ki-aktion--freigabe">
      <div className="ki-aktion__kopf">
        <span className="ki-aktion__icon">
          <MousePointerClick className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="ki-aktion__titel">{t("klick.titel")}</p>
          <p className="ki-aktion__status">{t(`klick.grund.${anfrage.grund}`)}</p>
        </div>
      </div>
      <dl className="ki-aktion__felder">
        <div>
          <dt>{t("klick.absicht")}</dt>
          <dd>{anfrage.absicht}</dd>
        </div>
        <div>
          <dt>{t("klick.element")}</dt>
          <dd>{anfrage.label}</dd>
        </div>
      </dl>
      <div className="ki-aktion__knoepfe">
        <button type="button" onClick={() => anfrage.entscheide(false)} className="ki-aktion__ablehnen">
          {t("aktion.ablehnen")}
        </button>
        <button type="button" onClick={() => anfrage.entscheide(true)} className="ki-aktion__bestaetigen">
          <Check className="h-3.5 w-3.5" />
          {t("aktion.bestaetigen")}
        </button>
      </div>
    </div>
  );
}

/** Die Statuszeile, solange der Agent arbeitet: was er gerade tut, oder dass er nachdenkt. */
export function KiChatStatus({ text }: { text: string }) {
  return (
    <div className="ki-status" role="status">
      <Himbeere groesse={18} denkt />
      {text}
      <span className="ki-beeren" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    </div>
  );
}

interface FehlerEigenschaften {
  t: Uebersetzer;
  sprache: string;
  onNeuBeginnen: () => void;
}

/** Was je Fehlerart in der Meldung steht. */
const FEHLER_INHALT: Record<ChatFehlerArt, (p: FehlerEigenschaften) => ReactNode> = {
  sitzung: ({ t, sprache }) => (
    <>
      {t("fehler.sitzung")}{" "}
      <a className="ki-fehler__link" href={`/${sprache}/login?weiter=${encodeURIComponent(window.location.pathname)}`}>
        {t("fehler.anmelden")}
      </a>
    </>
  ),
  berechtigung: ({ t }) => t("fehler.berechtigung"),
  zulang: ({ t, onNeuBeginnen }) => (
    <>
      {t("fehler.zuLang")}{" "}
      <button type="button" className="ki-fehler__link" onClick={onNeuBeginnen}>
        {t("fehler.neuBeginnen")}
      </button>
    </>
  ),
  allgemein: ({ t }) => t("fallback.antwort"),
};

/** Die Meldung zum letzten Fehler des Chats. */
export function KiChatFehler({ error, ...eigenschaften }: FehlerEigenschaften & { error: Error }) {
  return (
    <p className="ki-fehler" role="alert">
      {FEHLER_INHALT[chatFehlerArt(error) ?? "allgemein"](eigenschaften)}
    </p>
  );
}
