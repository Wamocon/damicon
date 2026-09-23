"use client";

// Darstellung, wenn die KI eine Dashboard-Aktion (aktionen.ts) vorschlaegt
// oder ausfuehrt: Freigabekarte im Chat, die der Nutzer bestaetigt oder
// ablehnt. Anders als ein Werkzeug-Schritt (ki-chat.tsx, "ki-schritte") ist
// eine Aktion nie ein stiller Schritt - sie veraendert Daten und braucht
// deshalb immer eine ausdrueckliche Entscheidung.

import type { ComponentType } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  Calculator,
  Check,
  ClipboardPlus,
  Landmark,
  LifeBuoy,
  ListChecks,
  Loader2,
  MessageSquareWarning,
  Thermometer,
  X,
} from "lucide-react";
import type { AktionsErgebnis, AktionsKarte } from "@/components/ki/ki-chat-segmente";
import type { AktionsName } from "@/lib/ai/aktionen-meta";
import { cn } from "@/lib/utils";

const aktionsIcon: Record<AktionsName, ComponentType<{ className?: string }>> = {
  mwstSchwellePruefen: Landmark,
  aufgabeAnlegen: ClipboardPlus,
  aufgabeStatusSetzen: ListChecks,
  kuehlmessungErfassen: Thermometer,
  reklamationAnlegen: MessageSquareWarning,
  lohnPeriodeBerechnen: Calculator,
  mitarbeiterEinschalten: LifeBuoy,
};

export function KiChatAktionskarte({
  karte,
  onFreigabe,
  onZielOeffnen,
  beschriftungZiel,
}: {
  karte: AktionsKarte;
  onFreigabe: (karte: AktionsKarte, erlaubt: boolean) => void;
  onZielOeffnen: (ziel: string, label: string) => void;
  /** beschriftung("ziel", name) aus ki-chat.tsx (erstelleBeschriftungen). */
  beschriftungZiel: (name: AktionsName) => string;
}) {
  const t = useTranslations("kiAssistentAnsicht");
  const aktionenT = useTranslations("aktionen");

  function aktionsWert(wert: unknown): string {
    const text = String(wert);
    return typeof wert === "string" && t.has(`aktion.werte.${wert}`) ? t(`aktion.werte.${wert}`) : text;
  }

  function aktionsStatusText(): string {
    switch (karte.zustand) {
      case "vorbereiten":
        return t("aktion.vorbereiten");
      case "freigabe":
        return t("aktion.freigabeNoetig");
      case "laeuft":
        return t("aktion.laeuft");
      case "erledigt":
        return t("aktion.erledigt");
      case "abgelehnt":
        return t("aktion.abgelehnt");
      default:
        return t("aktion.fehlgeschlagen");
    }
  }

  function ergebnisText(ergebnis: AktionsErgebnis): string {
    if (ergebnis.meldungSchluessel && aktionenT.has(ergebnis.meldungSchluessel)) {
      return aktionenT(ergebnis.meldungSchluessel, { wert: ergebnis.wert ?? "" });
    }
    return ergebnis.text;
  }

  const Icon = aktionsIcon[karte.name];
  const felder = Object.entries(karte.eingabe).filter(([, v]) => v !== undefined && v !== null && v !== "");
  const ziel = karte.ergebnis?.ziel ?? null;

  return (
    <div className={cn("ki-aktion", `ki-aktion--${karte.zustand}`)}>
      <div className="ki-aktion__kopf">
        <span className="ki-aktion__icon">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="ki-aktion__titel">{t(`aktion.titel.${karte.name}`)}</p>
          <p className="ki-aktion__status">
            {karte.zustand === "laeuft" || karte.zustand === "vorbereiten" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : karte.zustand === "erledigt" ? (
              <Check className="h-3 w-3" />
            ) : karte.zustand === "freigabe" ? null : (
              <X className="h-3 w-3" />
            )}
            {aktionsStatusText()}
          </p>
        </div>
      </div>
      {felder.length > 0 ? (
        <dl className="ki-aktion__felder">
          {felder.map(([schluessel, wert]) => (
            <div key={schluessel}>
              <dt>{t.has(`aktion.felder.${schluessel}`) ? t(`aktion.felder.${schluessel}`) : schluessel}</dt>
              <dd>{aktionsWert(wert)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {karte.zustand === "freigabe" ? (
        <div className="ki-aktion__knoepfe">
          <button type="button" onClick={() => onFreigabe(karte, false)} className="ki-aktion__ablehnen">
            {t("aktion.ablehnen")}
          </button>
          <button type="button" onClick={() => onFreigabe(karte, true)} className="ki-aktion__bestaetigen">
            <Check className="h-3.5 w-3.5" />
            {t("aktion.bestaetigen")}
          </button>
        </div>
      ) : null}
      {karte.ergebnis ? (
        <p className="ki-aktion__ergebnis">
          {ergebnisText(karte.ergebnis)}
          {karte.zustand === "erledigt" && ziel ? (
            <button type="button" onClick={() => onZielOeffnen(ziel, beschriftungZiel(karte.name))} className="ki-aktion__zeigen">
              {t("aktion.zeigen")}
              <ArrowRight className="h-3 w-3" />
            </button>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
