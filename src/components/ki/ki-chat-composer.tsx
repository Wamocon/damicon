"use client";

// Composer des KI-Chats: Bezug-Pill/-Kacheln der Compliance-Pruefung,
// Einwilligung fuer die erste Nachricht, Eingabefeld mit Mikrofon, Sende-/
// Stopp-Knopf und die Vorlesen-Optionen darunter. Reine Darstellung - Zustand
// und Handlungen kommen als Props aus ki-chat.tsx, das die Hooks (Chat,
// Client-Werkzeuge, Sprache) haelt.

import type { FormEvent, KeyboardEvent, RefObject } from "react";
import type { useTranslations } from "next-intl";
import { ArrowUp, AudioLines, Scale, Square, X } from "lucide-react";
import { MikrofonKnopf } from "@/components/ki/mikrofon";
import { DiktatWelle } from "@/components/ki/diktat-welle";
import { VorlesenSchalter } from "@/components/ki/sprachausgabe";
import type { Vorlesen } from "@/components/ki/ki-chat-sprache";
import type { PruefBezug } from "@/components/ki/ki-pane-kontext";
import { MAX_NACHRICHT_LAENGE } from "@/lib/domain/ki-assistent";
import { BEREICH_SYMBOL, PRUEF_BEREICH_ANKER } from "@/components/pruefung/symbole";
import { PRUEFBEREICHE } from "@/lib/pruefung/rollen";

/** Reihenfolge der immer sichtbaren Kachel-Links unter dem Bezug-Pill - dieselben
 *  sechs Ziele wie oeffnePruefBereich (api/ki-assistent/route.ts) und Himbis
 *  gefuehrte Tour, unabhaengig davon anzeigen, ob das Modell selbst darauf verweist. */
const PRUEF_BEZUG_KACHELN = [...PRUEFBEREICHE, "massnahmen", "einschraenkungen"] as const;

export function KiChatComposer({
  t,
  onSubmit,
  pruefBezug,
  onBezugEntfernen,
  onZielOeffnen,
  bereichTitel,
  istErsteNachricht,
  einwilligung,
  onEinwilligungChange,
  eingabeRef,
  eingabe,
  onEingabeChange,
  onKeyDown,
  beschaeftigt,
  einwilligungFehlt,
  diktiert,
  onMikrofonAufnahme,
  onMikrofonStart,
  onMikrofonZwischentext,
  onMikrofonText,
  onStop,
  vorlesen,
  sprachmodusMoeglich,
  onSprachmodus,
}: {
  t: ReturnType<typeof useTranslations>;
  onSubmit: (e: FormEvent) => void;
  pruefBezug: PruefBezug | null;
  onBezugEntfernen: () => void;
  onZielOeffnen: (ziel: string, label: string) => void;
  bereichTitel: (bereich: string | null) => string;
  istErsteNachricht: boolean;
  einwilligung: boolean;
  onEinwilligungChange: (an: boolean) => void;
  eingabeRef: RefObject<HTMLTextAreaElement | null>;
  eingabe: string;
  onEingabeChange: (wert: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  beschaeftigt: boolean;
  einwilligungFehlt: boolean;
  diktiert: boolean;
  onMikrofonAufnahme: (an: boolean) => void;
  onMikrofonStart: () => void;
  onMikrofonZwischentext: (text: string) => void;
  onMikrofonText: (text: string, sprachen?: string[]) => void;
  onStop: () => void;
  vorlesen: Vorlesen;
  /** Anbieter mit Werkzeugen und Live-Diktat: der Sprachmodus steht bereit. */
  sprachmodusMoeglich: boolean;
  onSprachmodus: () => void;
}) {
  return (
    <form onSubmit={onSubmit} className="ki-composer">
      {pruefBezug ? (
        <div className="ki-bezug" role="status">
          <Scale className="h-3.5 w-3.5" aria-hidden />
          <span>{t("pruefBezug", { id: pruefBezug.id.slice(0, 8) })}</span>
          <button type="button" onClick={onBezugEntfernen} aria-label={t("pruefBezugEntfernen")} title={t("pruefBezugEntfernen")}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
      {pruefBezug ? (
        <div className="ki-bezug-kacheln" role="note" aria-label={t("pruefBezugKacheln")}>
          {PRUEF_BEZUG_KACHELN.map((bereich) => {
            const Symbol = (BEREICH_SYMBOL as Record<string, typeof BEREICH_SYMBOL.audit>)[bereich];
            return (
              <button
                key={bereich}
                type="button"
                className="ki-bezug-kacheln__knopf"
                onClick={() => onZielOeffnen(`/dashboard#${PRUEF_BEREICH_ANKER[bereich]}`, bereichTitel(bereich))}
              >
                {Symbol ? <Symbol className="h-3 w-3" aria-hidden /> : null}
                {bereichTitel(bereich)}
              </button>
            );
          })}
        </div>
      ) : null}
      {istErsteNachricht ? (
        <label className="ki-composer__einwilligung">
          <input type="checkbox" checked={einwilligung} onChange={(e) => onEinwilligungChange(e.target.checked)} />
          {t("einwilligungText")}
        </label>
      ) : null}
      <div className="ki-composer__feld">
        <textarea
          ref={eingabeRef}
          value={eingabe}
          rows={1}
          maxLength={MAX_NACHRICHT_LAENGE}
          placeholder={t("inputPlaceholder")}
          onChange={(e) => onEingabeChange(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {/* Diktat: die Aufnahme endet von selbst, sobald jemand aufhoert zu
            sprechen. Der erkannte Text landet NUR im Eingabefeld - seit dem
            22.09.2026 wird er nicht mehr automatisch abgeschickt: was die
            Erkennung verhoert hat, ginge sonst ungeprueft an die Kundschaft,
            und gerade auf Kasachisch passiert das. Abgeschickt wird von Hand. */}
        <MikrofonKnopf
          className="ki-composer__knopf ki-composer__knopf--still"
          deaktiviert={beschaeftigt || einwilligungFehlt}
          beiAufnahme={onMikrofonAufnahme}
          beiStart={onMikrofonStart}
          beiZwischentext={onMikrofonZwischentext}
          beiText={onMikrofonText}
        />
        {beschaeftigt ? (
          <button type="button" onClick={onStop} aria-label={t("stopp")} className="ki-composer__knopf">
            <Square className="h-3.5 w-3.5 fill-current" />
          </button>
        ) : !eingabe.trim() && sprachmodusMoeglich ? (
          /* Leeres Feld: der Senden-Knopf ist der Einstieg in den Sprachmodus
             (components/ki/sprachmodus.tsx) - dort, wo man spricht, wie in
             anderen Sprachassistenten. Sobald etwas im Feld steht, ist er
             wieder Senden. Bis zum 24.09.2026 gab es nur einen unbeschrifteten
             Knopf in der Kopfzeile, und auf dem Handy gar keinen. */
          <button
            type="button"
            onClick={onSprachmodus}
            disabled={einwilligungFehlt}
            aria-label={t("sprachmodus.starten")}
            title={t("sprachmodus.hinweis")}
            className="ki-composer__knopf ki-composer__knopf--sprachmodus"
          >
            <AudioLines className="h-4 w-4" />
          </button>
        ) : (
          <button type="submit" aria-label={t("senden")} disabled={!eingabe.trim() || einwilligungFehlt} className="ki-composer__knopf">
            <ArrowUp className="h-4 w-4" />
          </button>
        )}
      </div>
      {diktiert ? <DiktatWelle /> : null}
      <div className="ki-composer__optionen">
        <VorlesenSchalter vorlesen={vorlesen} />
      </div>
    </form>
  );
}
