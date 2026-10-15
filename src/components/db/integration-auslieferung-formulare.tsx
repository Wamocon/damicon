"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { integrationAusliefern, integrationKonfigurieren, outboxWiederholen } from "@/lib/actions/integration-auslieferung";
import { AktionsMeldung, Auswahl, Feld, MiniAktion, PfadFeld, SubmitKnopf, useBehalteEingaben } from "@/components/db/formular-kit";
import type { IntegrationZeile } from "@/lib/data/integration-auslieferung";
import { VORLAGE_BEISPIEL_1C, VORSCHAU_UMSCHLAG, baueKoerper, pruefeVorlage } from "@/lib/domain/integration-vorlage";
import { feldKlassen } from "@/components/ui/kit";

// Die Bedienung der Auslieferung (WMCNL-1627), nur fuer Administration und Geschaeftsfuehrung: eine Integration konfigurieren, einen
// gescheiterten Eintrag wiederholen und jetzt ausliefern. Die Pruefung der Eingaben macht die Server Action, die Datenbank ein zweites Mal.

/**
 * Das Mapping auf das Zielformat des Partners (Vorlage, JSON mit Platzhaltern). Die Vorschau zeigt, was das Ziel bekaeme, an einem Beispiel (ЭСФ ausgestellt);
 * ein Fehler in der Vorlage steht darunter, bevor gespeichert wird. Die Pruefung beim Speichern macht der Server noch einmal.
 */
function VorlageFeld({ anfang }: { anfang: string }) {
  const t = useTranslations("integrationAuslieferung.form.vorlage");
  const [text, setText] = useState(anfang);
  const pruefung = pruefeVorlage(text);
  const vorschau = pruefung.ok ? JSON.stringify(baueKoerper(VORSCHAU_UMSCHLAG, pruefung.vorlage), null, 2) : null;
  return (
    <div className="space-y-1.5 sm:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor="integration-vorlage" className="schrift-label font-semibold text-card-foreground">
          {t("label")}
        </label>
        <button type="button" className="text-[11px] font-semibold text-primary hover:underline" onClick={() => setText(VORLAGE_BEISPIEL_1C)}>
          {t("beispiel")}
        </button>
      </div>
      <textarea
        id="integration-vorlage"
        name="vorlage"
        rows={9}
        spellCheck={false}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className={`${feldKlassen} h-auto min-h-24 py-2 font-mono text-xs`}
        placeholder={t("platzhalter")}
      />
      <p className="schrift-label text-muted-foreground">{t("hinweis")}</p>
      {!pruefung.ok ? (
        <p role="alert" className="text-xs text-destructive">
          {t(`fehler.${pruefung.fehler}`, { wert: pruefung.detail ?? "" })}
        </p>
      ) : vorschau ? (
        <details className="text-xs">
          <summary className="cursor-pointer font-semibold text-card-foreground">{t("vorschau")}</summary>
          <pre className="mt-1 max-h-64 overflow-auto rounded-lg border border-border bg-background p-2 text-[11px]">{vorschau}</pre>
        </details>
      ) : null}
    </div>
  );
}

export function IntegrationKonfigurationFormular({ integration }: { integration: IntegrationZeile }) {
  const t = useTranslations("integrationAuslieferung.form");
  const { status, formProps } = useBehalteEingaben(integrationKonfigurieren, "immer");
  return (
    <form {...formProps} className="grid gap-2 sm:grid-cols-2">
      <PfadFeld />
      <input type="hidden" name="id" value={integration.id} />
      <Auswahl
        label={t("adapter")}
        name="adapter"
        defaultValue={integration.adapter}
        options={[
          { wert: "manuell", text: t("adapterManuell") },
          { wert: "webhook", text: t("adapterWebhook") },
        ]}
      />
      <Feld label={t("url")} name="ziel_url" type="url" defaultValue={integration.zielUrl ?? ""} placeholder="https://" hinweis={t("urlHinweis")} />
      <Feld label={t("geheimnis")} name="geheimnis_name" defaultValue={integration.geheimnisName ?? ""} placeholder="DAMICON_HOOK_ESF" hinweis={t("geheimnisHinweis")} />
      <Auswahl
        label={t("auth")}
        name="auth_art"
        defaultValue={integration.authArt}
        options={[
          { wert: "hmac", text: t("authHmac") },
          { wert: "basic", text: t("authBasic") },
        ]}
      />
      <Feld label={t("zugang")} name="zugang_name" defaultValue={integration.zugangName ?? ""} placeholder="DAMICON_HOOK_ESF_ZUGANG" hinweis={t("zugangHinweis")} />
      <VorlageFeld anfang={integration.vorlage} />
      <label className="flex items-start gap-2 text-xs text-card-foreground sm:col-span-2">
        <input type="checkbox" name="bestaetigung_erwartet" defaultChecked={integration.bestaetigungErwartet} className="mt-0.5" />
        <span>
          <span className="font-semibold">{t("bestaetigung")}</span>
          <span className="block text-muted-foreground">{t("bestaetigungHinweis", { pfad: `/api/integrationen/bestaetigung/${integration.key}` })}</span>
        </span>
      </label>
      <label className="flex items-center gap-2 text-xs font-semibold text-card-foreground sm:self-center">
        <input type="checkbox" name="aktiv" defaultChecked={integration.aktiv} />
        {t("aktiv")}
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <SubmitKnopf label={t("knopf")} status={status} />
        <AktionsMeldung status={status} />
      </div>
    </form>
  );
}

export function OutboxWiederholenKnopf({ id }: { id: string }) {
  const t = useTranslations("integrationAuslieferung.warteschlange");
  return <MiniAktion aktion={outboxWiederholen} felder={{ id }} label={t("wiederholen")} />;
}

export function JetztAusliefernFormular() {
  const t = useTranslations("integrationAuslieferung.warteschlange");
  const { status, formProps } = useBehalteEingaben(integrationAusliefern, "immer");
  return (
    <form {...formProps} className="flex flex-wrap items-center gap-3">
      <PfadFeld />
      <SubmitKnopf label={t("jetzt")} variante="leise" status={status} />
      <AktionsMeldung status={status} />
    </form>
  );
}
