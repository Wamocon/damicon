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
import type { AuswahlOption } from "@/components/db/standort-formulare";
import { MwstRegistriertMarkierenFormular, MwstSchwellePruefenFormular } from "@/components/db/mwst-formulare";
import { MwstMesser } from "@/components/db/mwst-messer";
import { CountUp } from "@/components/site/count-up";
import { RisikoRadar } from "@/components/db/risiko-radar";
import { ladeBetroffenenOptionen, ladeCompliance } from "@/lib/data/compliance";
import { ladeMwstStatus, type MwstUebersicht } from "@/lib/data/mwst";
import { ladeOffeneEsutdFristen } from "@/lib/data/esutd";
import { ladeNachweisFristen } from "@/lib/data/dokumente";
import type { Datenquelle } from "@/lib/supabase/config";
import type {
  AuditEreignisZeile,
  ComplianceKennzahlen,
  DrittweitergabeZeile,
  EinwilligungZeile,
  VerarbeitungszweckZeile,
  VorfallZeile,
} from "@/lib/domain/compliance";
import type { MwstStatus } from "@/lib/domain/mwst";
import { baueRisikoEintraege } from "@/lib/domain/risikoradar";
import { getSessionProfile } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { LeererZustand } from "@/components/ui/liste";

// Compliance-Cockpit aus der Datenbank (WMCNL-1446). Ersetzt die bisherige
// rein statische ComplianceDemo-Ansicht durch die fuenf granularen
// Datenschutz-Tabellen. Lesen und Schreiben bleibt den Buero-Rollen
// vorbehalten (RLS in 20260908000000_datenschutz_granular.sql) - bewusst
// kein Selbstauskunftsrecht der Betroffenen in diesem Schritt.
//
// Aufbau: ComplianceAnsicht lädt alles, prüft die Rechte und entscheidet,
// welche Formulare zwischen den Abschnitten stehen. Die Abschnitte darunter
// bekommen ihre Zeilen und das Schreibrecht und zeigen je Zeile Formular oder
// Stand.

type Formatierer = Awaited<ReturnType<typeof getFormatter>>;

function complianceFormate(format: Formatierer) {
  return {
    geld: (n: number) => `${format.number(Math.round(n))} ₸`,
    datum: (iso: string | null) =>
      iso ? format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short" }) : "-",
  };
}

export async function ComplianceAnsicht() {
  const [cockpit, mwst, esutdFristen, nachweise, betroffenenOptionen, profil, t] = await Promise.all([
    ladeCompliance(),
    ladeMwstStatus(),
    ladeOffeneEsutdFristen(),
    ladeNachweisFristen(),
    ladeBetroffenenOptionen(),
    getSessionProfile(),
    getTranslations("complianceAnsicht"),
  ]);

  const live = cockpit.quelle === "db";
  const darfSchreiben = live && hasPermission(profil?.role, "compliance", "create");
  const darfMwstPruefen = live && hasPermission(profil?.role, "stammdaten", "update");

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
    nachweise: nachweise.fristen,
  });

  return (
    <div className="space-y-6">
      {live ? <RisikoRadar eintraege={risikoEintraege} /> : null}
      <CockpitKennzahlen quelle={cockpit.quelle} kennzahlen={cockpit.kennzahlen} />
      <MwstAbschnitt mwst={mwst} darfPruefen={darfMwstPruefen} />
      <HorizontalesMonitoring />
      <Pruefprotokoll ereignisse={cockpit.auditEreignisse} />
      <EinwilligungenAbschnitt einwilligungen={cockpit.einwilligungen} darfSchreiben={darfSchreiben} />

      {darfSchreiben ? (
        <EinwilligungErfassenFormular
          zwecke={cockpit.zwecke.map((z) => ({ wert: z.id, text: z.bezeichnung }))}
          pfluecker={betroffenenOptionen.pfluecker.map((p) => ({ wert: p.id, text: p.label }))}
          profile={betroffenenOptionen.profile.map((p) => ({ wert: p.id, text: p.label }))}
          b2bKunden={betroffenenOptionen.b2bKunden.map((b) => ({ wert: b.id, text: b.label }))}
        />
      ) : null}

      <VorfaelleAbschnitt vorfaelle={cockpit.vorfaelle} profile={profilOptionen} darfSchreiben={darfSchreiben} />

      {darfSchreiben ? <VorfallErfassenFormular profile={profilOptionen} /> : null}

      <DrittweitergabenAbschnitt drittweitergaben={cockpit.drittweitergaben} darfSchreiben={darfSchreiben} />
      <ZweckeAbschnitt zwecke={cockpit.zwecke} profile={profilOptionen} darfSchreiben={darfSchreiben} />

      <Card className="bg-muted/30 text-xs leading-5 text-muted-foreground">{t("note")}</Card>
    </div>
  );
}

/** Die vier Kennzahlen des Cockpits; überfällige Fristen rot, sobald es eine gibt. */
async function CockpitKennzahlen({
  quelle,
  kennzahlen: k,
}: {
  quelle: Datenquelle;
  kennzahlen: ComplianceKennzahlen;
}) {
  const t = await getTranslations("complianceAnsicht");

  return (
    <Section
      title={t("cockpitTitle")}
      description={t("cockpitLead")}
      action={<DatenquelleBadge quelle={quelle} />}
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
  );
}

/** MwSt-Registrierung: Stand gegen die Schwelle oder, ohne gesetzlichen Satz, ein Leerzustand. */
async function MwstAbschnitt({ mwst, darfPruefen }: { mwst: MwstUebersicht; darfPruefen: boolean }) {
  const mwstT = await getTranslations("complianceAnsicht.mwst");

  return (
    <Section
      id="mwst-registrierung"
      title={mwstT("titel")}
      description={mwstT("lead")}
      action={<DatenquelleBadge quelle={mwst.quelle} />}
    >
      {mwst.status ? (
        <MwstStand status={mwst.status} darfPruefen={darfPruefen} />
      ) : (
        <LeererZustand titel={mwstT("keinSatz")} modul="compliance" />
      )}
    </Section>
  );
}

/** Kacheln, Messer, Hinweis auf eine überschrittene Schwelle und die beiden Formulare. */
async function MwstStand({ status, darfPruefen }: { status: MwstStatus; darfPruefen: boolean }) {
  const [mwstT, format] = await Promise.all([getTranslations("complianceAnsicht.mwst"), getFormatter()]);
  const { datum } = complianceFormate(format);
  const registrierungOffen = status.schwelleUeberschrittenAm && !status.registriert;

  return (
    <>
      <MwstKacheln status={status} />

      {status.letzterUmsatzTenge !== null ? (
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between text-[11px] text-muted-foreground">
            <span>{mwstT("messer.label")}</span>
            <span className="font-semibold text-foreground">
              {format.number(
                Math.min(100, (status.letzterUmsatzTenge / status.schwelleTenge) * 100),
                { maximumFractionDigits: 1 },
              )}
              %
            </span>
          </div>
          <MwstMesser anteil={(status.letzterUmsatzTenge / status.schwelleTenge) * 100} />
        </div>
      ) : null}

      {registrierungOffen ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-danger/30 bg-danger/[0.06] text-xs leading-5">
          <span>
            {mwstT("schwelleUeberschrittenHinweis", { datum: datum(status.schwelleUeberschrittenAm) })}
          </span>
          <FaelligkeitAnzeige faelligkeit={status.meldefristAm} />
        </Card>
      ) : null}

      {darfPruefen ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <MwstSchwellePruefenFormular />
        </div>
      ) : null}
      {darfPruefen && registrierungOffen ? <MwstRegistriertMarkierenFormular /> : null}
      <p className="text-[11px] leading-4 text-muted-foreground">
        {mwstT("quelle")} {status.quelle}
      </p>
    </>
  );
}

/** Registriert, Satz, Umsatz der letzten zwölf Monate gegen die Schwelle, letzte Prüfung. */
async function MwstKacheln({ status }: { status: MwstStatus }) {
  const [mwstT, format] = await Promise.all([getTranslations("complianceAnsicht.mwst"), getFormatter()]);
  const { geld, datum } = complianceFormate(format);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat
        label={mwstT("stat.registriert")}
        value={status.registriert ? mwstT("ja") : mwstT("nein")}
        tone={status.registriert ? "success" : "neutral"}
        helper={
          status.registriertAm
            ? `${mwstT("stat.seit")} ${datum(status.registriertAm)}`
            : undefined
        }
      />
      <Stat
        label={mwstT("stat.satz")}
        value={`${format.number(status.standardProzent)} %`}
        helper={mwstT("stat.satzHinweis")}
      />
      <Stat
        label={mwstT("stat.umsatz")}
        value={
          status.letzterUmsatzTenge === null ? (
            "–"
          ) : (
            <CountUp wert={geld(status.letzterUmsatzTenge)} />
          )
        }
        helper={`${mwstT("stat.schwelle")} ${geld(status.schwelleTenge)}`}
        tone={
          status.letzterUmsatzTenge !== null &&
          status.letzterUmsatzTenge >= status.schwelleTenge
            ? "danger"
            : "neutral"
        }
      />
      <Stat
        label={mwstT("stat.letztePruefung")}
        value={status.letztePruefungAm ? datum(status.letztePruefungAm) : mwstT("nochNie")}
      />
    </div>
  );
}

/** Feste Erklärung, warum die Datenstruktur für das horizontale Monitoring bereit ist. */
async function HorizontalesMonitoring() {
  const mwstT = await getTranslations("complianceAnsicht.mwst");

  return (
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
  );
}

async function Pruefprotokoll({ ereignisse }: { ereignisse: AuditEreignisZeile[] }) {
  const [t, format] = await Promise.all([getTranslations("complianceAnsicht"), getFormatter()]);
  const { datum } = complianceFormate(format);

  return (
    <Section id="pruefprotokoll" title={t("audit.titel")} description={t("audit.lead")}>
      {ereignisse.length === 0 ? (
        <LeererZustand titel={t("audit.leer")} modul="compliance" />
      ) : (
        <DataTable
          head={[t("col.zeitpunkt"), t("col.urheber"), t("col.aktion"), t("col.ressource")]}
        >
          {ereignisse.map((a) => (
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
  );
}

/** Einwilligungen: widerrufen mit Grund, sonst Widerruf-Formular oder, ohne Schreibrecht, aktiv. */
async function EinwilligungenAbschnitt({
  einwilligungen,
  darfSchreiben,
}: {
  einwilligungen: EinwilligungZeile[];
  darfSchreiben: boolean;
}) {
  const [t, kanalT, format] = await Promise.all([
    getTranslations("complianceAnsicht"),
    getTranslations("complianceAnsicht.kanal"),
    getFormatter(),
  ]);
  const { datum } = complianceFormate(format);

  return (
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
        {einwilligungen.map((e) => (
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
  );
}

/** Offene Frist, wie sie ohne Schreibrecht erscheint: rot, sobald sie abgelaufen ist, sonst gelb. */
async function FristPille({ ueberfaellig }: { ueberfaellig: boolean }) {
  const t = await getTranslations("complianceAnsicht");

  return (
    <StatusPill tone={ueberfaellig ? "danger" : "warning"}>
      {ueberfaellig ? t("status.ueberfaellig") : t("status.offen")}
    </StatusPill>
  );
}

/** Datenschutzvorfälle: Verantwortliche zuweisen, solange keiner steht; melden, solange nicht gemeldet. */
async function VorfaelleAbschnitt({
  vorfaelle,
  profile,
  darfSchreiben,
}: {
  vorfaelle: VorfallZeile[];
  profile: AuswahlOption[];
  darfSchreiben: boolean;
}) {
  const [t, artT, format] = await Promise.all([
    getTranslations("complianceAnsicht"),
    getTranslations("complianceAnsicht.vorfallArt"),
    getFormatter(),
  ]);
  const { datum } = complianceFormate(format);

  return (
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
        {vorfaelle.map((v) => (
          <tr key={v.id}>
            <td className="px-3 py-2.5 text-muted-foreground">{datum(v.festgestelltAm)}</td>
            <td className="px-3 py-2.5 font-semibold text-foreground">{artT(v.art)}</td>
            <td className="px-3 py-2.5 text-muted-foreground">{v.beschreibung}</td>
            <td className="px-3 py-2.5 text-muted-foreground">{datum(v.meldefristAm)}</td>
            <td className="px-3 py-2.5 text-muted-foreground">
              {v.verantwortlicher ?? (
                darfSchreiben ? (
                  <VorfallVerantwortlichenFormular id={v.id} profile={profile} />
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
                <FristPille ueberfaellig={v.ueberfaellig} />
              )}
            </td>
          </tr>
        ))}
      </DataTable>
    </Section>
  );
}

/** Drittweitergaben: als benachrichtigt markieren, solange die Benachrichtigung aussteht. */
async function DrittweitergabenAbschnitt({
  drittweitergaben,
  darfSchreiben,
}: {
  drittweitergaben: DrittweitergabeZeile[];
  darfSchreiben: boolean;
}) {
  const [t, format] = await Promise.all([getTranslations("complianceAnsicht"), getFormatter()]);
  const { datum } = complianceFormate(format);

  return (
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
        {drittweitergaben.map((d) => (
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
                <FristPille ueberfaellig={d.ueberfaellig} />
              )}
            </td>
          </tr>
        ))}
      </DataTable>
    </Section>
  );
}

/** Verarbeitungszwecke mit Rechtsgrundlage, Aufbewahrung, Automatik und Verantwortlichen. */
async function ZweckeAbschnitt({
  zwecke,
  profile,
  darfSchreiben,
}: {
  zwecke: VerarbeitungszweckZeile[];
  profile: AuswahlOption[];
  darfSchreiben: boolean;
}) {
  const [t, rg] = await Promise.all([
    getTranslations("complianceAnsicht"),
    getTranslations("complianceAnsicht.rechtsgrundlage"),
  ]);

  return (
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
        {zwecke.map((z) => (
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
                  <ZweckVerantwortlichenFormular id={z.id} profile={profile} />
                ) : (
                  "-"
                )
              )}
            </td>
          </tr>
        ))}
      </DataTable>
    </Section>
  );
}
