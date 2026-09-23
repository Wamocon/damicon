import { getFormatter, getTranslations } from "next-intl/server";
import { ShieldCheck } from "lucide-react";
import { Card, DataTable, Section, Stat, StatusPill } from "@/components/ui/kit";
import { DatenquelleBadge } from "@/components/db/datenquelle-badge";
import { FaelligkeitAnzeige } from "@/components/db/faelligkeit-anzeige";
import {
  DrittweitergabeBenachrichtigenFormular,
  EinwilligungErfassenFormular,
  EinwilligungWiderrufFormular,
  VorfallErfassenFormular,
  VorfallMeldenFormular,
  VorfallVerantwortlichenFormular,
  ZweckVerantwortlichenFormular,
} from "@/components/db/compliance-formulare";
import { MwstRegistriertMarkierenFormular, MwstSchwellePruefenFormular } from "@/components/db/mwst-formulare";
import { MwstMesser } from "@/components/db/mwst-messer";
import { CountUp } from "@/components/site/count-up";
import { RisikoRadar } from "@/components/db/risiko-radar";
import { ladeBetroffenenOptionen, ladeCompliance } from "@/lib/data/compliance";
import { ladeMwstStatus } from "@/lib/data/mwst";
import { ladeOffeneEsutdFristen } from "@/lib/data/esutd";
import { baueRisikoEintraege } from "@/lib/domain/risikoradar";
import { getSessionProfile } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";

// Compliance-Cockpit aus der Datenbank (WMCNL-1446). Ersetzt die bisherige
// rein statische ComplianceDemo-Ansicht durch die fuenf granularen
// Datenschutz-Tabellen. Lesen und Schreiben bleibt den Buero-Rollen
// vorbehalten (RLS in 20260908000000_datenschutz_granular.sql) - bewusst
// kein Selbstauskunftsrecht der Betroffenen in diesem Schritt.
export async function ComplianceAnsicht() {
  const [cockpit, mwst, esutdFristen, betroffenenOptionen, profil, t] = await Promise.all([
    ladeCompliance(),
    ladeMwstStatus(),
    ladeOffeneEsutdFristen(),
    ladeBetroffenenOptionen(),
    getSessionProfile(),
    getTranslations("complianceAnsicht"),
  ]);
  const rg = await getTranslations("complianceAnsicht.rechtsgrundlage");
  const kanalT = await getTranslations("complianceAnsicht.kanal");
  const artT = await getTranslations("complianceAnsicht.vorfallArt");
  const mwstT = await getTranslations("complianceAnsicht.mwst");
  const format = await getFormatter();

  const live = cockpit.quelle === "db";
  const darfSchreiben = live && hasPermission(profil?.role, "compliance", "create");
  const darfMwstPruefen = live && hasPermission(profil?.role, "stammdaten", "update");
  const geld = (n: number) => `${format.number(Math.round(n))} ₸`;

  const datum = (iso: string | null) =>
    iso ? format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short" }) : "-";

  const k = cockpit.kennzahlen;
  const profilOptionen = betroffenenOptionen.profile.map((p) => ({ wert: p.id, text: p.label }));

  // Risiko-Radar (Migration 20261025000000): fasst Fristen aus drei
  // unabhaengigen Rechtsgrundlagen zusammen. Die eigentliche Zusammenfueh-
  // rungslogik steht in baueRisikoEintraege() (domain/risikoradar.ts) - von
  // hier UND vom KI-Assistenten (src/lib/ai/tools.ts) aufgerufen, damit
  // beide garantiert dieselbe Sicht auf "was ist gerade riskant" zeigen.
  const risikoEintraege = await baueRisikoEintraege({
    mwstMeldefristAm: mwst.status?.meldefristAm ?? null,
    mwstRegistriert: mwst.status?.registriert ?? false,
    esutdFristen,
    vorfaelleUeberfaellig: cockpit.vorfaelle.filter((v) => v.ueberfaellig),
    drittweitergabenUeberfaellig: cockpit.drittweitergaben.filter((d) => d.ueberfaellig),
  });

  return (
    <div className="space-y-6">
      {live ? <RisikoRadar eintraege={risikoEintraege} /> : null}
      <Section
        title={t("cockpitTitle")}
        description={t("cockpitLead")}
        action={<DatenquelleBadge quelle={cockpit.quelle} />}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label={t("stat.einwilligungenAktiv")}
            value={String(k.einwilligungenAktiv)}
            tone="success"
          />
          <Stat
            label={t("stat.einwilligungenWiderrufen")}
            value={String(k.einwilligungenWiderrufen)}
            tone="neutral"
          />
          <Stat
            label={t("stat.vorfaelleUeberfaellig")}
            value={String(k.vorfaelleUeberfaellig)}
            tone={k.vorfaelleUeberfaellig > 0 ? "danger" : "success"}
            helper={t("stat.vorfaelleUeberfaelligHinweis")}
          />
          <Stat
            label={t("stat.drittweitergabenUeberfaellig")}
            value={String(k.drittweitergabenUeberfaellig)}
            tone={k.drittweitergabenUeberfaellig > 0 ? "danger" : "success"}
            helper={t("stat.drittweitergabenUeberfaelligHinweis")}
          />
        </div>
      </Section>

      <Section
        id="mwst-registrierung"
        title={mwstT("titel")}
        description={mwstT("lead")}
        action={<DatenquelleBadge quelle={mwst.quelle} />}
      >
        {mwst.status ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label={mwstT("stat.registriert")}
                value={mwst.status.registriert ? mwstT("ja") : mwstT("nein")}
                tone={mwst.status.registriert ? "success" : "neutral"}
                helper={
                  mwst.status.registriertAm
                    ? `${mwstT("stat.seit")} ${datum(mwst.status.registriertAm)}`
                    : undefined
                }
              />
              <Stat
                label={mwstT("stat.satz")}
                value={`${format.number(mwst.status.standardProzent)} %`}
                helper={mwstT("stat.satzHinweis")}
              />
              <Stat
                label={mwstT("stat.umsatz")}
                value={
                  mwst.status.letzterUmsatzTenge === null ? (
                    "–"
                  ) : (
                    <CountUp wert={geld(mwst.status.letzterUmsatzTenge)} />
                  )
                }
                helper={`${mwstT("stat.schwelle")} ${geld(mwst.status.schwelleTenge)}`}
                tone={
                  mwst.status.letzterUmsatzTenge !== null &&
                  mwst.status.letzterUmsatzTenge >= mwst.status.schwelleTenge
                    ? "danger"
                    : "neutral"
                }
              />
              <Stat
                label={mwstT("stat.letztePruefung")}
                value={mwst.status.letztePruefungAm ? datum(mwst.status.letztePruefungAm) : mwstT("nochNie")}
              />
            </div>

            {mwst.status.letzterUmsatzTenge !== null ? (
              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between text-[11px] text-muted-foreground">
                  <span>{mwstT("messer.label")}</span>
                  <span className="font-semibold text-foreground">
                    {format.number(
                      Math.min(100, (mwst.status.letzterUmsatzTenge / mwst.status.schwelleTenge) * 100),
                      { maximumFractionDigits: 1 },
                    )}
                    %
                  </span>
                </div>
                <MwstMesser anteil={(mwst.status.letzterUmsatzTenge / mwst.status.schwelleTenge) * 100} />
              </div>
            ) : null}

            {mwst.status.schwelleUeberschrittenAm && !mwst.status.registriert ? (
              <Card className="flex flex-wrap items-center justify-between gap-3 border-danger/30 bg-danger/[0.06] text-xs leading-5">
                <span>
                  {mwstT("schwelleUeberschrittenHinweis", { datum: datum(mwst.status.schwelleUeberschrittenAm) })}
                </span>
                <FaelligkeitAnzeige faelligkeit={mwst.status.meldefristAm} />
              </Card>
            ) : null}

            {darfMwstPruefen ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <MwstSchwellePruefenFormular />
              </div>
            ) : null}
            {darfMwstPruefen && mwst.status.schwelleUeberschrittenAm && !mwst.status.registriert ? (
              <MwstRegistriertMarkierenFormular />
            ) : null}
            <p className="text-[11px] leading-4 text-muted-foreground">
              {mwstT("quelle")} {mwst.status.quelle}
            </p>
          </>
        ) : (
          <Card className="text-center text-xs text-muted-foreground">{mwstT("keinSatz")}</Card>
        )}
      </Section>

      <Section
        title={mwstT("horizontalesMonitoring.titel")}
        description={mwstT("horizontalesMonitoring.lead")}
      >
        <Card className="flex gap-3 border-success/30 bg-success/[0.06]">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" />
          <div className="space-y-2 text-xs leading-5">
            <p className="font-semibold text-foreground">{mwstT("horizontalesMonitoring.readinessTitel")}</p>
            <p className="text-muted-foreground">{mwstT("horizontalesMonitoring.readinessText")}</p>
            <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
              <li>{mwstT("horizontalesMonitoring.punktProtokoll")}</li>
              <li>{mwstT("horizontalesMonitoring.punktUnveraenderlich")}</li>
              <li>{mwstT("horizontalesMonitoring.punktKuehlkette")}</li>
            </ul>
            <p className="font-semibold text-foreground">
              {mwstT("horizontalesMonitoring.vorteil", { normal: "1,25×", ermaessigt: "0,65×" })}
            </p>
            <p className="text-[11px] text-muted-foreground">{mwstT("horizontalesMonitoring.hinweis")}</p>
          </div>
        </Card>
      </Section>

      <Section id="pruefprotokoll" title={t("audit.titel")} description={t("audit.lead")}>
        {cockpit.auditEreignisse.length === 0 ? (
          <Card className="text-center text-xs text-muted-foreground">{t("audit.leer")}</Card>
        ) : (
          <DataTable
            head={[t("col.zeitpunkt"), t("col.urheber"), t("col.aktion"), t("col.ressource")]}
          >
            {cockpit.auditEreignisse.map((a) => (
              <tr key={a.id}>
                <td className="px-3 py-2.5 text-muted-foreground">{datum(a.erstelltAm)}</td>
                <td className="px-3 py-2.5 font-semibold text-foreground">{a.actor ?? "-"}</td>
                <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">{a.aktion}</td>
                <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">{a.ressource}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </Section>

      <Section title={t("einwilligungen.titel")} description={t("einwilligungen.lead")}>
        <DataTable
          head={[
            t("col.betroffener"),
            t("col.zweck"),
            t("col.kanal"),
            t("col.erteiltAm"),
            t("col.status"),
          ]}
        >
          {cockpit.einwilligungen.map((e) => (
            <tr key={e.id}>
              <td className="px-3 py-2.5 font-semibold text-foreground">{e.betroffener}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{e.zweck}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{kanalT(e.kanal)}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{datum(e.erteiltAm)}</td>
              <td className="px-3 py-2.5">
                {e.widerrufenAm ? (
                  <div className="space-y-0.5">
                    <StatusPill tone="neutral">{t("status.widerrufen")}</StatusPill>
                    <p className="text-[11px] text-muted-foreground">{e.widerrufGrund}</p>
                  </div>
                ) : darfSchreiben ? (
                  <EinwilligungWiderrufFormular id={e.id} />
                ) : (
                  <StatusPill tone="success">{t("status.aktiv")}</StatusPill>
                )}
              </td>
            </tr>
          ))}
        </DataTable>
      </Section>

      {darfSchreiben ? (
        <EinwilligungErfassenFormular
          zwecke={cockpit.zwecke.map((z) => ({ wert: z.id, text: z.bezeichnung }))}
          pfluecker={betroffenenOptionen.pfluecker.map((p) => ({ wert: p.id, text: p.label }))}
          profile={betroffenenOptionen.profile.map((p) => ({ wert: p.id, text: p.label }))}
          b2bKunden={betroffenenOptionen.b2bKunden.map((b) => ({ wert: b.id, text: b.label }))}
        />
      ) : null}

      <Section id="datenschutzvorfaelle" title={t("vorfaelle.titel")} description={t("vorfaelle.lead")}>
        <DataTable
          head={[
            t("col.festgestelltAm"),
            t("col.art"),
            t("col.beschreibung"),
            t("col.meldefristAm"),
            t("col.verantwortlich"),
            t("col.status"),
          ]}
        >
          {cockpit.vorfaelle.map((v) => (
            <tr key={v.id}>
              <td className="px-3 py-2.5 text-muted-foreground">{datum(v.festgestelltAm)}</td>
              <td className="px-3 py-2.5 font-semibold text-foreground">{artT(v.art)}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{v.beschreibung}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{datum(v.meldefristAm)}</td>
              <td className="px-3 py-2.5 text-muted-foreground">
                {v.verantwortlicher ?? (
                  darfSchreiben ? (
                    <VorfallVerantwortlichenFormular id={v.id} profile={profilOptionen} />
                  ) : (
                    "-"
                  )
                )}
              </td>
              <td className="px-3 py-2.5">
                {v.gemeldetAm ? (
                  <StatusPill tone="success">{t("status.gemeldet")}</StatusPill>
                ) : darfSchreiben ? (
                  <VorfallMeldenFormular id={v.id} />
                ) : (
                  <StatusPill tone={v.ueberfaellig ? "danger" : "warning"}>
                    {v.ueberfaellig ? t("status.ueberfaellig") : t("status.offen")}
                  </StatusPill>
                )}
              </td>
            </tr>
          ))}
        </DataTable>
      </Section>

      {darfSchreiben ? <VorfallErfassenFormular profile={profilOptionen} /> : null}

      <Section id="drittweitergaben" title={t("drittweitergaben.titel")} description={t("drittweitergaben.lead")}>
        <DataTable
          head={[
            t("col.betroffener"),
            t("col.empfaenger"),
            t("col.weitergegebenAm"),
            t("col.benachrichtigungsfristAm"),
            t("col.status"),
          ]}
        >
          {cockpit.drittweitergaben.map((d) => (
            <tr key={d.id}>
              <td className="px-3 py-2.5 font-semibold text-foreground">{d.betroffener}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{d.empfaenger}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{datum(d.weitergegebenAm)}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{datum(d.benachrichtigungsfristAm)}</td>
              <td className="px-3 py-2.5">
                {d.benachrichtigtAm ? (
                  <StatusPill tone="success">{t("status.benachrichtigt")}</StatusPill>
                ) : darfSchreiben ? (
                  <DrittweitergabeBenachrichtigenFormular id={d.id} />
                ) : (
                  <StatusPill tone={d.ueberfaellig ? "danger" : "warning"}>
                    {d.ueberfaellig ? t("status.ueberfaellig") : t("status.offen")}
                  </StatusPill>
                )}
              </td>
            </tr>
          ))}
        </DataTable>
      </Section>

      <Section title={t("zwecke.titel")} description={t("zwecke.lead")}>
        <DataTable
          head={[
            t("col.bezeichnung"),
            t("col.rechtsgrundlage"),
            t("col.aufbewahrung"),
            t("col.automatisiert"),
            t("col.verantwortlich"),
          ]}
        >
          {cockpit.zwecke.map((z) => (
            <tr key={z.id}>
              <td className="px-3 py-2.5 font-semibold text-foreground">{z.bezeichnung}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{rg(z.rechtsgrundlage)}</td>
              <td className="px-3 py-2.5 text-muted-foreground">
                {t("monate", { anzahl: z.aufbewahrungMonate })}
              </td>
              <td className="px-3 py-2.5">
                <StatusPill tone={z.automatisierteEntscheidung ? "warning" : "neutral"}>
                  {z.automatisierteEntscheidung ? t("ja") : t("nein")}
                </StatusPill>
              </td>
              <td className="px-3 py-2.5 text-muted-foreground">
                {z.verantwortlicher ?? (
                  darfSchreiben ? (
                    <ZweckVerantwortlichenFormular id={z.id} profile={profilOptionen} />
                  ) : (
                    "-"
                  )
                )}
              </td>
            </tr>
          ))}
        </DataTable>
      </Section>

      <Card className="bg-muted/30 text-xs leading-5 text-muted-foreground">{t("note")}</Card>
    </div>
  );
}
