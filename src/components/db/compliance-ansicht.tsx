import { getFormatter, getTranslations } from "next-intl/server";
import { Card, DataTable, Section, Stat, StatusPill } from "@/components/ui/kit";
import { DatenquelleBadge } from "@/components/db/datenquelle-badge";
import {
  DrittweitergabeBenachrichtigenFormular,
  EinwilligungErfassenFormular,
  EinwilligungWiderrufFormular,
  VorfallErfassenFormular,
  VorfallMeldenFormular,
  VorfallVerantwortlichenFormular,
  ZweckVerantwortlichenFormular,
} from "@/components/db/compliance-formulare";
import { ladeBetroffenenOptionen, ladeCompliance } from "@/lib/data/compliance";
import { getSessionProfile } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";

// Compliance-Cockpit aus der Datenbank (WMCNL-1446). Ersetzt die bisherige
// rein statische ComplianceDemo-Ansicht durch die fuenf granularen
// Datenschutz-Tabellen. Lesen und Schreiben bleibt den Buero-Rollen
// vorbehalten (RLS in 20260908000000_datenschutz_granular.sql) - bewusst
// kein Selbstauskunftsrecht der Betroffenen in diesem Schritt.
export async function ComplianceAnsicht() {
  const [cockpit, betroffenenOptionen, profil, t] = await Promise.all([
    ladeCompliance(),
    ladeBetroffenenOptionen(),
    getSessionProfile(),
    getTranslations("complianceAnsicht"),
  ]);
  const rg = await getTranslations("complianceAnsicht.rechtsgrundlage");
  const kanalT = await getTranslations("complianceAnsicht.kanal");
  const artT = await getTranslations("complianceAnsicht.vorfallArt");
  const format = await getFormatter();

  const live = cockpit.quelle === "db";
  const darfSchreiben = live && hasPermission(profil?.role, "compliance", "create");

  const datum = (iso: string | null) =>
    iso ? format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short" }) : "-";

  const k = cockpit.kennzahlen;
  const profilOptionen = betroffenenOptionen.profile.map((p) => ({ wert: p.id, text: p.label }));

  return (
    <div className="space-y-6">
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

      <Section title={t("vorfaelle.titel")} description={t("vorfaelle.lead")}>
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

      <Section title={t("drittweitergaben.titel")} description={t("drittweitergaben.lead")}>
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
