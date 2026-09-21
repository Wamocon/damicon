import { getFormatter, getTranslations } from "next-intl/server";
import { Card, DataTable, Section, StatusPill, type Tone } from "@/components/ui/kit";
import { DatenquelleBadge } from "@/components/db/datenquelle-badge";
import {
  KontingentErstellenFormular,
  KontingentMengeFormular,
  SorteBearbeitenFormular,
  SorteErstellenFormular,
} from "@/components/db/sortenkatalog-formulare";
import { ladeSorten, ladeVerfuegbarkeit } from "@/lib/data/sortenkatalog";
import {
  ladeB2bKundeOptionenFuerVorbestellung,
  ladeKontingente,
  ladeSortenOptionenFuerVorbestellung,
} from "@/lib/data/vorbestellungen";
import { getSessionProfile } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";

const typTon: Record<string, Tone> = {
  remontierend: "info",
  sommertragend: "neutral",
};

// Sorten- und Kontingentkatalog: Sorten-Stammdaten (name/typ/erntefenster/
// schale_g, RLS seit Migration 20260905120000), eine aggregierte
// Verfuegbarkeits-Uebersicht je Sorte/Saison (Summe ueber alle Kunden, ohne
// Kundenzuordnung - kontingent_verfuegbarkeit_je_sorte(), Migration
// 20261012000000) fuer jede angemeldete Rolle, und die eigentliche
// Kontingent-Verwaltung (Menge je Kunde/Sorte/Saison) nur fuers Buero.
export async function SortenkatalogAnsicht() {
  const [sorten, verfuegbarkeit, profil, t] = await Promise.all([
    ladeSorten(),
    ladeVerfuegbarkeit(),
    getSessionProfile(),
    getTranslations("sortenkatalogAnsicht"),
  ]);
  const st = await getTranslations("sorteTypen");
  const format = await getFormatter();

  const live = sorten.quelle === "db";
  const darfAnlegen = live && hasPermission(profil?.role, "sortenkatalog", "create");
  const darfVerwalten = live && hasPermission(profil?.role, "sortenkatalog", "update");

  const [kontingente, kunden, sortenOptionen] = darfVerwalten
    ? await Promise.all([
        ladeKontingente(),
        ladeB2bKundeOptionenFuerVorbestellung(),
        ladeSortenOptionenFuerVorbestellung(),
      ])
    : [null, [], []];

  return (
    <div className="space-y-6">
      <Section
        title={t("sortenTitel")}
        description={t("sortenLead")}
        action={<DatenquelleBadge quelle={sorten.quelle} />}
      >
        {sorten.sorten.length === 0 ? (
          <Card className="text-center text-xs text-muted-foreground">{t("keineSorten")}</Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {sorten.sorten.map((s) => (
              <Card key={s.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-black text-card-foreground">{s.name}</p>
                  <StatusPill tone={typTon[s.typ] ?? "neutral"}>{st(s.typ)}</StatusPill>
                </div>
                <dl className="mt-2 grid grid-cols-1 gap-x-3 gap-y-1 text-xs sm:grid-cols-2">
                  {s.erntefenster ? (
                    <div className="col-span-2">
                      <dt className="text-muted-foreground">{t("erntefenster")}</dt>
                      <dd className="font-semibold text-foreground">{s.erntefenster}</dd>
                    </div>
                  ) : null}
                  {s.schaleG !== null ? (
                    <div>
                      <dt className="text-muted-foreground">{t("schaleG")}</dt>
                      <dd className="font-semibold text-foreground">{format.number(s.schaleG)} g</dd>
                    </div>
                  ) : null}
                </dl>
                {darfVerwalten ? <SorteBearbeitenFormular sorte={s} /> : null}
              </Card>
            ))}
          </div>
        )}
        {darfAnlegen ? <SorteErstellenFormular /> : null}
      </Section>

      <Section title={t("verfuegbarkeitTitel")} description={t("verfuegbarkeitLead")}>
        {verfuegbarkeit.zeilen.length === 0 ? (
          <Card className="text-center text-xs text-muted-foreground">{t("keineVerfuegbarkeit")}</Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {verfuegbarkeit.zeilen.map((z) => {
              const auslastung = z.mengeKgGesamt > 0 ? Math.round((z.reserviertKgGesamt / z.mengeKgGesamt) * 100) : 0;
              return (
                <Card key={`${z.sorteId}-${z.saison}`}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-black text-card-foreground">{z.sorte}</p>
                    {z.saison ? <span className="text-[11px] text-muted-foreground">{z.saison}</span> : null}
                  </div>
                  <div className="mt-2">
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span>{t("vergeben")}</span>
                      <span>
                        {format.number(z.reserviertKgGesamt)} / {format.number(z.mengeKgGesamt)} kg
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${auslastung >= 100 ? "bg-destructive" : auslastung >= 85 ? "bg-warning" : "bg-primary"}`}
                        style={{ width: `${Math.min(100, auslastung)}%` }}
                      />
                    </div>
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    {t("verfuegbar")}: {format.number(Math.max(0, z.mengeKgGesamt - z.reserviertKgGesamt))} kg
                  </p>
                </Card>
              );
            })}
          </div>
        )}
        <p className="text-[11px] leading-4 text-muted-foreground">{t("verfuegbarkeitHinweis")}</p>
      </Section>

      {darfVerwalten && kontingente ? (
        <Section title={t("kontingenteTitel")} description={t("kontingenteLead")}>
          {kontingente.kontingente.length === 0 ? (
            <Card className="text-center text-xs text-muted-foreground">{t("keineKontingente")}</Card>
          ) : (
            <DataTable head={[t("col.kunde"), t("col.sorte"), t("col.saison"), t("col.menge"), t("col.reserviert"), ""]}>
              {kontingente.kontingente.map((k) => (
                <tr key={k.id}>
                  <td className="px-3 py-2.5 font-semibold text-foreground">{k.kunde}</td>
                  <td className="px-3 py-2.5 text-foreground">{k.sorte}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{k.saison ?? "-"}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{format.number(k.mengeKg)} kg</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{format.number(k.reserviertKg)} kg</td>
                  <td className="px-3 py-2.5">
                    <KontingentMengeFormular kontingentId={k.id} mengeKg={k.mengeKg} />
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
          <KontingentErstellenFormular kunden={kunden} sorten={sortenOptionen} />
        </Section>
      ) : null}

      <Card className="bg-muted/30 text-xs leading-5 text-muted-foreground">{t("hinweis")}</Card>
    </div>
  );
}
