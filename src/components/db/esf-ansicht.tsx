import type { ReactNode } from "react";
import { getFormatter, getTranslations } from "next-intl/server";
import { Aufklapper, Card, DataTable, Section, StatusPill } from "@/components/ui/kit";
import { EsfEntwurfKnopf, EsfEntwurfVerwerfenKnopf, EsfSchrittFormular } from "@/components/db/esf-formulare";
import { ladeEsfUebersicht, type EsfBelegZeile, type EsfOffeneLieferung } from "@/lib/data/esf";
import { ESF_STATUS, esfTon, zaehleBelege, type EsfEntwurf } from "@/lib/domain/esf";
import { tagInZone } from "@/lib/domain/tageszeit";
import { getSessionProfile } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";

// Belegregister der elektronischen Rechnung (WMCNL-1440, Stufe 1). Das System stellt keine ЭСФ aus:
// es zeigt, welche zugestellte Lieferung noch keinen Beleg hat, bereitet die Angaben fuer das
// staatliche Portal vor und fuehrt den Status bis zur Bestaetigung. Die Anbindung (Stufe 2) braucht
// den Zugang der Behoerde.

type Format = Awaited<ReturnType<typeof getFormatter>>;
type Uebersetzer = Awaited<ReturnType<typeof getTranslations>>;

function Zeile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 border-b border-border/60 py-1.5 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold text-foreground">{children}</dd>
    </div>
  );
}

function EntwurfAngaben({ entwurf, t, format, tag }: { entwurf: EsfEntwurf; t: Uebersetzer; format: Format; tag: (iso: string) => string }) {
  const tenge = (wert: number) => `${format.number(wert, { maximumFractionDigits: 2 })} ₸`;
  const fehlt = <span className="text-destructive">{t("entwurf.fehlt")}</span>;
  return (
    <div className="space-y-3">
      <dl className="rounded-lg border border-border bg-background px-3 py-1 text-xs">
        <Zeile label={t("entwurf.stichtag")}>{tag(entwurf.stichtag)}</Zeile>
        <Zeile label={t("entwurf.kaeufer")}>{entwurf.kunde.name}</Zeile>
        <Zeile label={t("entwurf.identifikationsnummer")}>{entwurf.kunde.identifikationsnummer ?? fehlt}</Zeile>
        <Zeile label={t("entwurf.sorte")}>{entwurf.ware.sorte ?? fehlt}</Zeile>
        {entwurf.ware.chargeCode ? <Zeile label={t("entwurf.charge")}>{entwurf.ware.chargeCode}</Zeile> : null}
        <Zeile label={t("entwurf.menge")}>{format.number(entwurf.ware.mengeKg)} kg</Zeile>
        <Zeile label={t("entwurf.preis")}>{entwurf.ware.preisTengeKg === null ? fehlt : `${format.number(entwurf.ware.preisTengeKg, { maximumFractionDigits: 2 })} ₸/kg`}</Zeile>
        <Zeile label={t("entwurf.betrag")}>{entwurf.ware.betragTenge === null ? fehlt : tenge(entwurf.ware.betragTenge)}</Zeile>
        {entwurf.mwst.registriert ? (
          <>
            <Zeile label={t("entwurf.mwst", { prozent: entwurf.mwst.prozent ?? "-" })}>
              {entwurf.mwst.betragTenge === null ? fehlt : tenge(entwurf.mwst.betragTenge)}
            </Zeile>
            <Zeile label={t("entwurf.gesamt")}>{entwurf.mwst.gesamtTenge === null ? fehlt : tenge(entwurf.mwst.gesamtTenge)}</Zeile>
          </>
        ) : null}
      </dl>
      {!entwurf.mwst.registriert ? <p className="text-xs text-muted-foreground">{t("entwurf.nichtRegistriert")}</p> : null}
      {entwurf.mwst.registriert ? <p className="text-xs text-muted-foreground">{t("entwurf.annahme")}</p> : null}
      {entwurf.luecken.length > 0 ? (
        <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs">
          <p className="font-semibold text-warning">{t("entwurf.lueckenTitel")}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-foreground">
            {entwurf.luecken.map((l) => (
              <li key={l}>{t(`luecke.${l}`)}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function BelegAktionen({ beleg, heute, t }: { beleg: EsfBelegZeile; heute: string; t: Uebersetzer }) {
  switch (beleg.status) {
    case "entwurf":
      return (
        <div className="space-y-2">
          <EsfSchrittFormular belegId={beleg.id} schritt="ausgestellt" heute={heute} />
          <EsfSchrittFormular belegId={beleg.id} schritt="papier" heute={heute} />
          <div className="flex flex-wrap gap-2">
            <EsfEntwurfKnopf lieferungId={beleg.lieferungId} label={t("aktion.entwurfNeu")} />
            <EsfEntwurfVerwerfenKnopf belegId={beleg.id} />
          </div>
        </div>
      );
    case "ausgestellt":
      return (
        <div className="space-y-2">
          <EsfSchrittFormular belegId={beleg.id} schritt="bestaetigt" heute={heute} />
          <EsfSchrittFormular belegId={beleg.id} schritt="abgelehnt" heute={heute} />
        </div>
      );
    case "abgelehnt":
      return (
        <div className="space-y-2">
          <EsfSchrittFormular belegId={beleg.id} schritt="papier" heute={heute} />
          <EsfEntwurfKnopf lieferungId={beleg.lieferungId} label={t("aktion.neuBeginnen")} />
        </div>
      );
    default:
      return null;
  }
}

function offenKnopfLabel(l: EsfOffeneLieferung, t: Uebersetzer): string {
  if (l.belegStatus === "entwurf") return t("aktion.entwurfNeu");
  if (l.belegStatus === "abgelehnt") return t("aktion.neuBeginnen");
  return t("aktion.entwurfErstellen");
}

export async function EsfAnsicht() {
  const [uebersicht, profil, t, format] = await Promise.all([ladeEsfUebersicht(), getSessionProfile(), getTranslations("esfAnsicht"), getFormatter()]);
  const darfAendern = hasPermission(profil?.role, "integrationen", "update");
  const heute = tagInZone(new Date());
  const tag = (iso: string) => format.dateTime(new Date(`${tagInZone(new Date(iso))}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });
  const tagNurDatum = (iso: string) => format.dateTime(new Date(`${iso.slice(0, 10)}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });
  const zaehlung = zaehleBelege(uebersicht.offen.length, uebersicht.belege.map((b) => b.status));

  return (
    <div className="space-y-6">
      <Section title={t("titel")} description={t("lead")}>
        <div className="flex flex-wrap gap-1.5">
          <StatusPill tone={zaehlung.offen > 0 ? "warning" : "success"}>
            {t("zaehlOffen")} {zaehlung.offen}
          </StatusPill>
          {ESF_STATUS.filter((s) => zaehlung[s] > 0).map((s) => (
            <StatusPill key={s} tone={esfTon[s]}>
              {t(`status.${s}`)} {zaehlung[s]}
            </StatusPill>
          ))}
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">{t("stufeHinweis")}</p>
        {!darfAendern ? <p className="mt-1 text-xs text-muted-foreground">{t("nurLesen")}</p> : null}
      </Section>

      <Section title={t("offen.titel")} description={t("offen.lead")}>
        {uebersicht.offen.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("offen.leer")}</p>
        ) : (
          <DataTable head={[t("offen.col.kunde"), t("offen.col.geliefertAm"), t("offen.col.menge"), t("offen.col.alter"), t("offen.col.beleg"), ...(darfAendern ? [""] : [])]}>
            {uebersicht.offen.map((l) => (
              <tr key={l.lieferungId}>
                <td className="px-3 py-2.5 font-semibold text-foreground">{l.kunde}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{tag(l.geliefertAm)}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{format.number(l.mengeKg)} kg</td>
                <td className="px-3 py-2.5 text-muted-foreground">{l.tageSeitLieferung <= 0 ? t("offen.heute") : t("offen.tage", { tage: l.tageSeitLieferung })}</td>
                <td className="px-3 py-2.5">
                  {l.belegStatus ? <StatusPill tone={esfTon[l.belegStatus]}>{t(`status.${l.belegStatus}`)}</StatusPill> : <span className="text-xs text-muted-foreground">{t("offen.keinBeleg")}</span>}
                </td>
                {darfAendern ? (
                  <td className="px-3 py-2.5">
                    <EsfEntwurfKnopf lieferungId={l.lieferungId} label={offenKnopfLabel(l, t)} />
                  </td>
                ) : null}
              </tr>
            ))}
          </DataTable>
        )}
      </Section>

      <Section title={t("belege.titel")} description={t("belege.lead")}>
        {uebersicht.belege.length === 0 ? <p className="text-xs text-muted-foreground">{t("belege.leer")}</p> : null}
        <div className="space-y-2">
          {uebersicht.belege.map((b) => {
            const teile = [t(`status.${b.status}`)];
            if (b.esfNummer) teile.push(t("nummerMit", { nummer: b.esfNummer }));
            if (b.ausgestelltAm) teile.push(t("ausgestelltAm", { datum: tagNurDatum(b.ausgestelltAm) }));
            if (b.bestaetigtAm) teile.push(t("bestaetigtAm", { datum: tagNurDatum(b.bestaetigtAm) }));
            const titel = [b.kunde, b.geliefertAm ? tag(b.geliefertAm) : null, b.mengeKg !== null ? `${format.number(b.mengeKg)} kg` : null].filter(Boolean).join(" · ");
            return (
              <Aufklapper key={b.id} titel={titel} beschreibung={teile.join(" · ")}>
                <div className="space-y-3 p-4">
                  {b.bemerkung ? (
                    <Card className="bg-muted/30 text-xs leading-5 text-foreground">{b.bemerkung}</Card>
                  ) : null}
                  {b.entwurf ? (
                    <div>
                      <p className="mb-1.5 text-xs font-semibold text-card-foreground">{t("entwurf.titel")}</p>
                      <EntwurfAngaben entwurf={b.entwurf} t={t} format={format} tag={tagNurDatum} />
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">{t("entwurf.unlesbar")}</p>
                  )}
                  {darfAendern ? <BelegAktionen beleg={b} heute={heute} t={t} /> : null}
                </div>
              </Aufklapper>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
