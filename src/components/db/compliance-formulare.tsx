"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { ShieldAlert, Undo2 } from "lucide-react";
import {
  drittweitergabeBenachrichtigen,
  einwilligungErfassen,
  einwilligungWiderrufen,
  vorfallErfassen,
  vorfallMelden,
  vorfallVerantwortlichenSetzen,
  zweckVerantwortlichenSetzen,
} from "@/lib/actions/compliance";
import { leer } from "@/lib/actions/status";
import {
  AktionsMeldung,
  Auswahl,
  Feld,
  FormularKarte,
  PfadFeld,
  SubmitKnopf,
} from "@/components/db/formular-kit";
import type { AuswahlOption } from "@/components/db/standort-formulare";

// Formulare des Compliance-Cockpits (WMCNL-1446): eine Einwilligung erfassen
// bzw. widerrufen, einen Datenschutzvorfall erfassen bzw. melden, eine
// Drittweitergabe als benachrichtigt markieren.

const kanaele = ["papier", "app", "web", "sms"] as const;
const sprachen = ["de", "en", "ru", "kk"] as const;
const vorfallArten = ["unbefugter_zugriff", "verlust", "offenlegung", "sonstiges"] as const;

export function EinwilligungErfassenFormular({
  zwecke,
  pfluecker,
  profile,
  b2bKunden,
}: {
  zwecke: AuswahlOption[];
  pfluecker: AuswahlOption[];
  profile: AuswahlOption[];
  b2bKunden: AuswahlOption[];
}) {
  const [status, action] = useActionState(einwilligungErfassen, leer);
  const t = useTranslations("complianceAnsicht.formular.einwilligung");
  const k = useTranslations("complianceAnsicht.kanal");
  const s = useTranslations("complianceAnsicht.sprache");
  const ohne = { wert: "", text: t("keineAuswahl") };

  return (
    <FormularKarte titel={t("titel")} beschreibung={t("lead")}>
      <form action={action} className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        <PfadFeld />
        <Auswahl label={t("feld.pfluecker")} name="betroffener_pfluecker_id" options={[ohne, ...pfluecker]} />
        <Auswahl label={t("feld.profil")} name="betroffener_profil_id" options={[ohne, ...profile]} />
        <Auswahl label={t("feld.b2bKunde")} name="betroffener_b2b_kunde_id" options={[ohne, ...b2bKunden]} />
        <p className="sm:col-span-2 lg:col-span-3 text-[11px] text-muted-foreground">
          {t("hinweisGenauEiner")}
        </p>
        <Auswahl label={t("feld.zweck")} name="zweck_id" options={zwecke} required />
        <Auswahl
          label={t("feld.kanal")}
          name="kanal"
          options={kanaele.map((wert) => ({ wert, text: k(wert) }))}
        />
        <Auswahl
          label={t("feld.sprache")}
          name="sprache"
          defaultValue="ru"
          options={sprachen.map((wert) => ({ wert, text: s(wert) }))}
        />
        <Feld
          label={t("feld.textfassung")}
          name="textfassung"
          required
          placeholder={t("textfassungPlatzhalter")}
        />
        <Feld
          label={t("feld.nachweis")}
          name="nachweis_referenz"
          placeholder={t("nachweisPlatzhalter")}
        />
        <div className="flex items-end">
          <SubmitKnopf label={t("knopf")} />
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <AktionsMeldung status={status} />
        </div>
      </form>
    </FormularKarte>
  );
}

// Inline in der Tabellenzeile: der Widerruf ist die einzige zulaessige
// Aenderung an einer erteilten Einwilligung (siehe trg_einwilligung_nur_widerruf).
export function EinwilligungWiderrufFormular({ id }: { id: string }) {
  const [status, action] = useActionState(einwilligungWiderrufen, leer);
  const t = useTranslations("complianceAnsicht.formular.widerruf");

  return (
    <form action={action} className="flex flex-wrap items-center gap-1.5">
      <PfadFeld />
      <input type="hidden" name="id" value={id} />
      <input
        name="grund"
        required
        placeholder={t("platzhalter")}
        className="h-7 w-36 rounded-md border border-border bg-background px-2 text-[11px] text-foreground outline-none focus:border-primary"
      />
      <button
        type="submit"
        className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] font-semibold text-foreground transition hover:border-primary"
      >
        <Undo2 className="h-3 w-3" />
        {t("knopf")}
      </button>
      <AktionsMeldung status={status} />
    </form>
  );
}

export function VorfallErfassenFormular({ profile }: { profile: AuswahlOption[] }) {
  const [status, action] = useActionState(vorfallErfassen, leer);
  const t = useTranslations("complianceAnsicht.formular.vorfall");
  const a = useTranslations("complianceAnsicht.vorfallArt");

  return (
    <FormularKarte titel={t("titel")} beschreibung={t("lead")}>
      <form action={action} className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <PfadFeld />
        <Feld label={t("feld.festgestellt")} name="festgestellt_am" type="datetime-local" required />
        <Auswahl
          label={t("feld.art")}
          name="art"
          options={vorfallArten.map((wert) => ({ wert, text: a(wert) }))}
        />
        <Feld label={t("feld.betroffeneAnzahl")} name="betroffene_anzahl" inputMode="decimal" placeholder="1" />
        <Feld label={t("feld.beschreibung")} name="beschreibung" required placeholder={t("beschreibungPlatzhalter")} />
        {/* Anforderung 4.8: benannte verantwortliche Person - Pflichtfeld
            schon beim Erfassen, nicht erst nachtraeglich. */}
        <Auswahl
          label={t("feld.verantwortlich")}
          name="verantwortlich_profil_id"
          options={profile}
          required
        />
        <div className="flex items-end">
          <SubmitKnopf label={t("knopf")} />
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <AktionsMeldung status={status} />
        </div>
      </form>
    </FormularKarte>
  );
}

// Anforderung 4.8: verantwortliche Person nachtragen bzw. neu zuweisen -
// dieselbe kompakte Inline-Form fuer Zweck und Vorfall, nur die Server
// Action unterscheidet sich.
export function ZweckVerantwortlichenFormular({
  id,
  profile,
}: {
  id: string;
  profile: AuswahlOption[];
}) {
  const [status, action] = useActionState(zweckVerantwortlichenSetzen, leer);
  const t = useTranslations("complianceAnsicht.formular.verantwortlich");

  return (
    <form action={action} className="flex flex-wrap items-center gap-1.5">
      <PfadFeld />
      <input type="hidden" name="id" value={id} />
      <select
        name="verantwortlich_profil_id"
        required
        aria-label={t("label")}
        defaultValue=""
        className="h-7 rounded-md border border-border bg-background px-2 text-[11px] text-foreground outline-none focus:border-primary"
      >
        <option value="" disabled>
          {t("platzhalter")}
        </option>
        {profile.map((p) => (
          <option key={p.wert} value={p.wert}>
            {p.text}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] font-semibold text-foreground transition hover:border-primary"
      >
        {t("knopf")}
      </button>
      <AktionsMeldung status={status} />
    </form>
  );
}

export function VorfallVerantwortlichenFormular({
  id,
  profile,
}: {
  id: string;
  profile: AuswahlOption[];
}) {
  const [status, action] = useActionState(vorfallVerantwortlichenSetzen, leer);
  const t = useTranslations("complianceAnsicht.formular.verantwortlich");

  return (
    <form action={action} className="flex flex-wrap items-center gap-1.5">
      <PfadFeld />
      <input type="hidden" name="id" value={id} />
      <select
        name="verantwortlich_profil_id"
        required
        aria-label={t("label")}
        defaultValue=""
        className="h-7 rounded-md border border-border bg-background px-2 text-[11px] text-foreground outline-none focus:border-primary"
      >
        <option value="" disabled>
          {t("platzhalter")}
        </option>
        {profile.map((p) => (
          <option key={p.wert} value={p.wert}>
            {p.text}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] font-semibold text-foreground transition hover:border-primary"
      >
        {t("knopf")}
      </button>
      <AktionsMeldung status={status} />
    </form>
  );
}

// Inline: ein offener Vorfall wird gemeldet - die Meldereferenz ist Pflicht
// (siehe Constraint vorfall_meldung_braucht_referenz).
export function VorfallMeldenFormular({ id }: { id: string }) {
  const [status, action] = useActionState(vorfallMelden, leer);
  const t = useTranslations("complianceAnsicht.formular.vorfallMelden");

  return (
    <form action={action} className="flex flex-wrap items-center gap-1.5">
      <PfadFeld />
      <input type="hidden" name="id" value={id} />
      <input
        name="meldereferenz"
        required
        placeholder={t("platzhalter")}
        className="h-7 w-32 rounded-md border border-border bg-background px-2 text-[11px] text-foreground outline-none focus:border-primary"
      />
      <button
        type="submit"
        className="inline-flex h-7 items-center gap-1 rounded-md border border-warning/40 bg-warning/10 px-2 text-[11px] font-semibold text-warning transition hover:border-warning"
      >
        <ShieldAlert className="h-3 w-3" />
        {t("knopf")}
      </button>
      <AktionsMeldung status={status} />
    </form>
  );
}

// Inline: eine faellige Drittweitergabe als benachrichtigt markieren.
export function DrittweitergabeBenachrichtigenFormular({ id }: { id: string }) {
  const [status, action] = useActionState(drittweitergabeBenachrichtigen, leer);
  const t = useTranslations("complianceAnsicht.formular.drittweitergabe");

  return (
    <form action={action} className="flex flex-wrap items-center gap-1.5">
      <PfadFeld />
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] font-semibold text-foreground transition hover:border-primary"
      >
        {t("knopf")}
      </button>
      <AktionsMeldung status={status} />
    </form>
  );
}
