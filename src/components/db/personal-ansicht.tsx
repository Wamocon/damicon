import { getFormatter, getTranslations } from "next-intl/server";
import { Card, DataTable, Section, StatusPill } from "@/components/ui/kit";
import { DatenquelleBadge } from "@/components/db/datenquelle-badge";
import { FaelligkeitAnzeige } from "@/components/db/faelligkeit-anzeige";
import {
  PfleuckerBrigadeZuweisenFormular,
  TerminBrigadeZuweisenFormular,
} from "@/components/db/personal-formulare";
import { ladeBrigadeOptionen, ladePersonalUebersicht } from "@/lib/data/personal";
import { getSessionProfile } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";

// Brigadenplanung (Anforderung 2.11): Brigaden/Pfluecker mit echten Daten
// statt PersonalDemo, dazu Schicht-Konzept (Einsatzplan), Bedarfsrechnung
// und Reserveliste. Wetterszenarien bewusst nicht Teil dieser Ansicht -
// Anforderung 2.13 ist im Masterplan-Audit bereits als "bewusst offen,
// Prioritaet P2, 2027" eingestuft.
export async function PersonalAnsicht() {
  const [uebersicht, profil, t] = await Promise.all([
    ladePersonalUebersicht(),
    getSessionProfile(),
    getTranslations("personalAnsicht"),
  ]);
  const format = await getFormatter();

  const live = uebersicht.quelle === "db";
  const darfZuweisen = live && hasPermission(profil?.role, "personal", "update");

  const brigadeOptionen = darfZuweisen ? await ladeBrigadeOptionen() : [];

  const datum = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium" });

  return (
    <div className="space-y-6">
      <Section
        title={t("brigadenTitel")}
        description={t("brigadenLead")}
        action={<DatenquelleBadge quelle={uebersicht.quelle} />}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {uebersicht.brigaden.map((b) => (
            <Card key={b.id}>
              <p className="text-sm font-black text-card-foreground">{b.name}</p>
              {b.vorarbeiter ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("vorarbeiter")}: {b.vorarbeiter}
                </p>
              ) : null}
              <p className="mt-2 text-xs text-muted-foreground">
                {b.staerke} {t("personen")}
                {b.plantage ? ` · ${b.plantage}` : ""}
              </p>
            </Card>
          ))}
        </div>
      </Section>

      <Section title={t("bedarfTitel")} description={t("bedarfLead")}>
        {uebersicht.bedarf.length === 0 ? (
          <Card className="text-center text-xs text-muted-foreground">{t("keinBedarf")}</Card>
        ) : (
          <DataTable head={[t("col.datum"), t("col.bloeckeGesamt"), t("col.bloeckeZugewiesen"), t("col.bloeckeOffen")]}>
            {uebersicht.bedarf.map((b) => (
              <tr key={b.geplantFuer}>
                <td className="px-3 py-2.5 text-foreground">{datum(b.geplantFuer)}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{b.bloeckeGesamt}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{b.bloeckeZugewiesen}</td>
                <td className="px-3 py-2.5">
                  <StatusPill tone={b.bloeckeOffen > 0 ? "warning" : "success"}>
                    {b.bloeckeOffen}
                  </StatusPill>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Section>

      {uebersicht.offeneTermine.length > 0 ? (
        <Section title={t("offeneTermineTitel")} description={t("offeneTermineLead")}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {uebersicht.offeneTermine.map((termin) => (
              <Card key={termin.id}>
                <p className="font-mono text-xs font-semibold text-foreground">
                  {termin.reihenblockCode}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{datum(termin.geplantFuer)}</p>
                {darfZuweisen ? (
                  <TerminBrigadeZuweisenFormular terminId={termin.id} brigaden={brigadeOptionen} />
                ) : null}
              </Card>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title={t("einsatzplanTitel")} description={t("einsatzplanLead")}>
        {uebersicht.einsatzplan.length === 0 ? (
          <Card className="text-center text-xs text-muted-foreground">{t("keinEinsatzplan")}</Card>
        ) : (
          <DataTable head={[t("col.datum"), t("col.brigade"), t("col.staerke"), t("col.bloeckeZugewiesen")]}>
            {uebersicht.einsatzplan.map((e) => (
              <tr key={`${e.geplantFuer}-${e.brigadeId}`}>
                <td className="px-3 py-2.5 text-foreground">{datum(e.geplantFuer)}</td>
                <td className="px-3 py-2.5 font-semibold text-foreground">{e.brigadeName}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{e.staerke}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{e.bloeckeZugewiesen}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </Section>

      <Section title={t("pflueckerTitel")} description={t("pflueckerLead")}>
        <DataTable
          head={[
            t("col.name"),
            t("col.brigade"),
            t("col.ausweis"),
            t("col.esutd"),
            t("col.leistung"),
            t("col.qfaktor"),
          ]}
        >
          {uebersicht.pfluecker.map((p) => (
            <tr key={p.id}>
              <td className="px-3 py-2.5 font-semibold text-foreground">{p.name}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{p.brigadeName ?? "-"}</td>
              <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{p.ausweis}</td>
              <td className="px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusPill tone={p.esutd === "erfasst" ? "success" : "warning"}>
                    {t(`esutd.${p.esutd}`)}
                  </StatusPill>
                  {p.esutd === "offen" ? <FaelligkeitAnzeige faelligkeit={p.esutdFaelligkeit} /> : null}
                </div>
              </td>
              <td className="px-3 py-2.5 text-muted-foreground">
                {p.letzteMengeKg === null ? "-" : `${format.number(p.letzteMengeKg)} kg`}
              </td>
              <td className="px-3 py-2.5 font-semibold text-foreground">
                {p.letzterQualitaetsfaktor === null ? "-" : p.letzterQualitaetsfaktor.toFixed(2)}
              </td>
            </tr>
          ))}
        </DataTable>
      </Section>

      <Section title={t("reservelisteTitel")} description={t("reservelisteLead")}>
        {uebersicht.reserveliste.length === 0 ? (
          <Card className="text-center text-xs text-muted-foreground">{t("keineReserve")}</Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {uebersicht.reserveliste.map((p) => (
              <Card key={p.id}>
                <p className="text-sm font-semibold text-card-foreground">{p.name}</p>
                <p className="font-mono text-xs text-muted-foreground">{p.ausweis}</p>
                {darfZuweisen ? (
                  <PfleuckerBrigadeZuweisenFormular pflueckerId={p.id} brigaden={brigadeOptionen} />
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </Section>

      <Card className="bg-muted/30 text-xs leading-5 text-muted-foreground">{t("note")}</Card>
    </div>
  );
}
