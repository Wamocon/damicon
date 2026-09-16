import { getFormatter, getTranslations } from "next-intl/server";
import { Card, DataTable, Section, StatusPill, type Tone } from "@/components/ui/kit";
import { DatenquelleBadge } from "@/components/db/datenquelle-badge";
import {
  KundeGruppeFormular,
  PreisListeAktivSchaltenKnopf,
  PreisListeErstellenFormular,
  PreislistenPositionHinzufuegenFormular,
  PreislistenPositionLoeschenKnopf,
} from "@/components/db/preislisten-formulare";
import { ladeB2bKundenMitGruppe, ladePreislistenVerwaltung, ladeSortenOptionenFuerPreisliste } from "@/lib/data/preislisten";
import { getSessionProfile } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";

// Preisstaffelung je Kundengruppe (Anforderung 5.1/5.2, Migration
// 20261011000000). Zwei Bausteine: die Preislisten selbst (mit optionaler
// Kundengruppen-Zuordnung, gruppenlos = Standard-Fallback fuer alle) und die
// Zuordnung jedes B2B-Kunden zu genau einer Kundengruppe. Die
// kundenseitige, bereits gefilterte Anzeige derselben Preislisten liegt im
// B2B-Portal (b2b-portal-ansicht.tsx) - dort nur die eigene Gruppe plus
// Standard, hier zur Verwaltung alle Gruppen und auch inaktive Listen.
export async function PreislistenAnsicht() {
  const [preislisten, kunden, sorten, profil, t] = await Promise.all([
    ladePreislistenVerwaltung(),
    ladeB2bKundenMitGruppe(),
    ladeSortenOptionenFuerPreisliste(),
    getSessionProfile(),
    getTranslations("preislistenAnsicht"),
  ]);
  const kg = await getTranslations("kundengruppen");
  const format = await getFormatter();

  const live = preislisten.quelle === "db";
  const darfAnlegen = live && hasPermission(profil?.role, "preislisten", "create");
  const darfVerwalten = live && hasPermission(profil?.role, "preislisten", "update");
  const darfLoeschen = live && hasPermission(profil?.role, "preislisten", "delete");

  const aktivTon: Record<string, Tone> = { aktiv: "success", inaktiv: "neutral" };
  const tag = (iso: string | null) =>
    iso ? format.dateTime(new Date(iso), { dateStyle: "medium" }) : "-";

  return (
    <div className="space-y-6">
      <Section
        title={t("preislistenTitel")}
        description={t("preislistenLead")}
        action={<DatenquelleBadge quelle={preislisten.quelle} />}
      >
        {preislisten.preislisten.length === 0 ? (
          <Card className="text-center text-xs text-muted-foreground">{t("keinePreislisten")}</Card>
        ) : (
          <div className="space-y-3">
            {preislisten.preislisten.map((p) => (
              <Card key={p.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-black text-card-foreground">{p.name}</p>
                  <div className="flex items-center gap-2">
                    {p.kundengruppe ? (
                      <StatusPill tone="info">{kg(p.kundengruppe)}</StatusPill>
                    ) : (
                      <StatusPill tone="neutral">{kg("standard")}</StatusPill>
                    )}
                    <StatusPill tone={aktivTon[p.aktiv ? "aktiv" : "inaktiv"]}>
                      {t(p.aktiv ? "aktiv" : "inaktiv")}
                    </StatusPill>
                    {darfVerwalten ? (
                      <PreisListeAktivSchaltenKnopf preislisteId={p.id} aktiv={p.aktiv} />
                    ) : null}
                  </div>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t("gueltigAb")} {tag(p.gueltigAb)}
                  {p.gueltigBis ? ` · ${t("gueltigBis")} ${tag(p.gueltigBis)}` : ""}
                </p>
                {p.positionen.length === 0 ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">{t("keinePositionen")}</p>
                ) : (
                  <DataTable head={[t("col.sorte"), t("col.preis"), t("col.mindestmenge"), ""]}>
                    {p.positionen.map((pos) => (
                      <tr key={pos.id}>
                        <td className="px-3 py-2.5 font-semibold text-foreground">{pos.sorte}</td>
                        <td className="px-3 py-2.5 text-foreground">
                          {format.number(pos.preisTengeKg)} ₸/kg
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {format.number(pos.minMengeKg)} kg
                        </td>
                        <td className="px-3 py-2.5">
                          {darfLoeschen ? (
                            <PreislistenPositionLoeschenKnopf positionId={pos.id} />
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </DataTable>
                )}
                {darfVerwalten ? (
                  <PreislistenPositionHinzufuegenFormular preislisteId={p.id} sorten={sorten} />
                ) : null}
              </Card>
            ))}
          </div>
        )}
        {darfAnlegen ? <PreisListeErstellenFormular /> : null}
      </Section>

      <Section title={t("kundengruppenTitel")} description={t("kundengruppenLead")}>
        {kunden.kunden.length === 0 ? (
          <Card className="text-center text-xs text-muted-foreground">{t("keineKunden")}</Card>
        ) : (
          <div className="space-y-2.5">
            {kunden.kunden.map((k) => (
              <Card key={k.id} className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{k.name}</p>
                {darfVerwalten ? (
                  <KundeGruppeFormular kundeId={k.id} kundengruppe={k.kundengruppe} />
                ) : k.kundengruppe ? (
                  <StatusPill tone="info">{kg(k.kundengruppe)}</StatusPill>
                ) : (
                  <StatusPill tone="neutral">{kg("standard")}</StatusPill>
                )}
              </Card>
            ))}
          </div>
        )}
      </Section>

      <Card className="bg-muted/30 text-xs leading-5 text-muted-foreground">{t("hinweis")}</Card>
    </div>
  );
}
