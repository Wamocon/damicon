import { getFormatter, getTranslations } from "next-intl/server";
import { Card, DataTable, Section, StatusPill, type Tone } from "@/components/ui/kit";
import { DatenquelleBadge } from "@/components/db/datenquelle-badge";
import {
  VorbestellungAnlegenFormular,
  VorbestellungStatusFormular,
  VorbestellungStornierenKnopf,
} from "@/components/db/vorbestellungen-formulare";
import { ladeLieferungen } from "@/lib/data/lieferungen";
import {
  ladeB2bKundeOptionenFuerVorbestellung,
  ladeKontingente,
  ladePreislisten,
  ladeSortenOptionenFuerVorbestellung,
  ladeVorbestellungen,
} from "@/lib/data/vorbestellungen";
import { getSessionProfile } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";

const statusTon: Record<string, Tone> = {
  geplant: "neutral",
  zugestellt: "success",
  storniert: "danger",
};

const kuehlTon: Record<string, Tone> = {
  ok: "success",
  warnung: "warning",
  verstoss: "danger",
};

const vorbestellungTon: Record<string, Tone> = {
  angefragt: "warning",
  bestaetigt: "success",
  geliefert: "success",
  storniert: "danger",
};

// B2B-Portal (Anforderung 5.1/5.2). "Meine Lieferungen" (5.2 Teil 2a) zeigt
// RLS-gefiltert (lieferungen_select_kunde_buero) nur die eigene Firma bzw.
// fuers Buero alle. Preisliste + Vorbestellung (5.1, Teil 2 von 2) ergaenzen
// das um den zweiten fehlenden Baustein. Kontingent-Verbrauch (ebenfalls
// Anforderung 5.1) schreibt seit Migration 20261006000000 automatisch fort -
// diese Ansicht zeigt den so entstehenden Stand, eine Vorbestellung bleibt
// trotzdem eine Anfrage, die das Buero manuell bestaetigt.
export async function B2bPortalAnsicht() {
  const [uebersicht, vorbestellungen, kontingente, preislisten, profil, t] = await Promise.all([
    ladeLieferungen(),
    ladeVorbestellungen(),
    ladeKontingente(),
    ladePreislisten(),
    getSessionProfile(),
    getTranslations("b2bPortalAnsicht"),
  ]);
  const lt = await getTranslations("lieferungenAnsicht");
  const kkT = await getTranslations("nachweiskette");
  const format = await getFormatter();

  const live = uebersicht.quelle === "db";
  const darfAnlegen = live && hasPermission(profil?.role, "b2b_portal", "create");
  const istKunde = profil?.role === "kunde";
  // "kunde" hat laut rbac.ts dieselbe crud("b2b_portal")-Berechtigungsmenge
  // wie betriebsleitung (view/create/update) - ohne den Ausschluss wuerde
  // ein Kunde hier zusaetzlich die fuers Buero gedachten Bestaetigen-/
  // Ablehnen-Knoepfe sehen (adversarischer Review-Fund). RLS
  // (vorbestellungen_update_buero) blockt den Serveraufruf zwar zuverlaessig,
  // die Knoepfe haben dort aber nie etwas verloren.
  const darfVerwalten = live && hasPermission(profil?.role, "b2b_portal", "update") && !istKunde;
  const fuerBuero = darfAnlegen && !istKunde;

  const [kunden, sorten] = darfAnlegen
    ? await Promise.all([
        fuerBuero ? ladeB2bKundeOptionenFuerVorbestellung() : Promise.resolve([]),
        ladeSortenOptionenFuerVorbestellung(),
      ])
    : [[], []];

  const datum = (iso: string | null) =>
    iso ? format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short" }) : "-";
  const tag = (iso: string | null) =>
    iso ? format.dateTime(new Date(iso), { dateStyle: "medium" }) : "-";

  return (
    <div className="space-y-6">
      <Section
        title={t("lieferungenTitel")}
        description={t("lieferungenLead")}
        action={<DatenquelleBadge quelle={uebersicht.quelle} />}
      >
        {uebersicht.lieferungen.length === 0 ? (
          <Card className="text-center text-xs text-muted-foreground">{t("keineLieferungen")}</Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {uebersicht.lieferungen.map((l) => (
              <Card key={l.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm font-black text-card-foreground">
                    {format.number(l.mengeKg)} kg
                  </p>
                  <StatusPill tone={statusTon[l.status] ?? "neutral"}>
                    {lt(`status.${l.status}`)}
                  </StatusPill>
                </div>
                {l.geliefertAm ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {lt("geliefertAm")}: {datum(l.geliefertAm)}
                  </p>
                ) : null}
                {l.empfaengerName ? (
                  <p className="text-xs text-muted-foreground">
                    {lt("empfaengerName")}: {l.empfaengerName}
                  </p>
                ) : null}
                {l.letzteKuehlmessung || l.transportMessungen.length > 0 ? (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
                    <span className="text-[11px] text-muted-foreground">{lt("temperatur")}:</span>
                    {l.letzteKuehlmessung ? (
                      <StatusPill tone={kuehlTon[l.letzteKuehlmessung.ergebnis] ?? "neutral"}>
                        {l.letzteKuehlmessung.temperaturC} °C ·{" "}
                        {kkT(`ergebnis.${l.letzteKuehlmessung.ergebnis}`)}
                      </StatusPill>
                    ) : null}
                    {l.transportMessungen.map((m) => (
                      <StatusPill key={m.id} tone={kuehlTon[m.ergebnis] ?? "neutral"}>
                        {m.temperaturC} °C
                      </StatusPill>
                    ))}
                  </div>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </Section>

      <Section title={t("kontingenteTitel")} description={t("kontingenteLead")}>
        {kontingente.kontingente.length === 0 ? (
          <Card className="text-center text-xs text-muted-foreground">{t("keineKontingente")}</Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {kontingente.kontingente.map((k) => {
              const auslastung = k.mengeKg > 0 ? Math.round((k.reserviertKg / k.mengeKg) * 100) : 0;
              return (
                <Card key={k.id}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-black text-card-foreground">{k.sorte}</p>
                    {k.saison ? (
                      <span className="text-[11px] text-muted-foreground">{k.saison}</span>
                    ) : null}
                  </div>
                  {fuerBuero ? (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{k.kunde}</p>
                  ) : null}
                  <div className="mt-2">
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span>{t("col.reserviert")}</span>
                      <span>
                        {format.number(k.reserviertKg)} / {format.number(k.mengeKg)} kg
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
                    {t("col.verfuegbar")}: {format.number(Math.max(0, k.mengeKg - k.reserviertKg))} kg
                  </p>
                </Card>
              );
            })}
          </div>
        )}
      </Section>

      <Section title={t("preislisteTitel")} description={t("preislisteLead")}>
        {preislisten.length === 0 ? (
          <Card className="text-center text-xs text-muted-foreground">{t("keinePreisliste")}</Card>
        ) : (
          preislisten.map((p) => (
            <Card key={p.id} className="mb-3">
              <p className="text-sm font-black text-card-foreground">{p.name}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {t("gueltigAb")} {tag(p.gueltigAb)}
                {p.gueltigBis ? ` · ${t("gueltigBis")} ${tag(p.gueltigBis)}` : ""}
              </p>
              <DataTable
                head={[t("col.sorte"), t("col.preis"), t("col.mindestmenge")]}
              >
                {p.positionen.map((pos) => (
                  <tr key={pos.id}>
                    <td className="px-3 py-2.5 font-semibold text-foreground">{pos.sorte}</td>
                    <td className="px-3 py-2.5 text-foreground">
                      {format.number(pos.preisTengeKg)} ₸/kg
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {format.number(pos.minMengeKg)} kg
                    </td>
                  </tr>
                ))}
              </DataTable>
            </Card>
          ))
        )}
      </Section>

      <Section title={t("vorbestellungenTitel")} description={t("vorbestellungenLead")}>
        {vorbestellungen.vorbestellungen.length === 0 ? (
          <Card className="text-center text-xs text-muted-foreground">{t("keineVorbestellungen")}</Card>
        ) : (
          <DataTable
            head={
              fuerBuero
                ? [t("col.kunde"), t("col.sorte"), t("col.menge"), t("col.liefertermin"), t("col.status"), ""]
                : [t("col.sorte"), t("col.menge"), t("col.liefertermin"), t("col.status"), ""]
            }
          >
            {vorbestellungen.vorbestellungen.map((v) => (
              <tr key={v.id}>
                {fuerBuero ? (
                  <td className="px-3 py-2.5 font-semibold text-foreground">{v.kunde}</td>
                ) : null}
                <td className="px-3 py-2.5 text-foreground">{v.sorte}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{format.number(v.mengeKg)} kg</td>
                <td className="px-3 py-2.5 text-muted-foreground">{tag(v.liefertermin)}</td>
                <td className="px-3 py-2.5">
                  <StatusPill tone={vorbestellungTon[v.status] ?? "neutral"}>
                    {t(`status.${v.status}`)}
                  </StatusPill>
                </td>
                <td className="px-3 py-2.5">
                  {darfVerwalten && v.status === "angefragt" ? (
                    <VorbestellungStatusFormular vorbestellungId={v.id} />
                  ) : null}
                  {istKunde && v.status === "angefragt" ? (
                    <VorbestellungStornierenKnopf vorbestellungId={v.id} />
                  ) : null}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Section>

      {darfAnlegen ? (
        <VorbestellungAnlegenFormular kunden={kunden} sorten={sorten} fuerBuero={fuerBuero} />
      ) : null}

      <Card className="bg-muted/30 text-xs leading-5 text-muted-foreground">{t("note")}</Card>
    </div>
  );
}
