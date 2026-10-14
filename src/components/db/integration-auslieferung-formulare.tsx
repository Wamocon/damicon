"use client";

import { useTranslations } from "next-intl";
import { integrationAusliefern, integrationKonfigurieren, outboxWiederholen } from "@/lib/actions/integration-auslieferung";
import { AktionsMeldung, Auswahl, Feld, MiniAktion, PfadFeld, SubmitKnopf, useBehalteEingaben } from "@/components/db/formular-kit";
import type { IntegrationZeile } from "@/lib/data/integration-auslieferung";

// Die Bedienung der Auslieferung (WMCNL-1627), nur fuer Administration und Geschaeftsfuehrung: eine Integration konfigurieren, einen
// gescheiterten Eintrag wiederholen und jetzt ausliefern. Die Pruefung der Eingaben macht die Server Action, die Datenbank ein zweites Mal.

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
