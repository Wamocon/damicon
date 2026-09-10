import { getFormatter, getTranslations } from "next-intl/server";
import { Card, Section, StatusPill, type Tone } from "@/components/ui/kit";
import { DatenquelleBadge } from "@/components/db/datenquelle-badge";
import {
  LieferungAnlegenFormular,
  LieferungStornierenKnopf,
  TransportMessungFormular,
  UebergabeErfassenFormular,
} from "@/components/db/lieferungen-formulare";
import {
  ladeB2bKundeOptionenFuerLieferung,
  ladeChargeOptionenFuerLieferung,
  ladeLieferungen,
} from "@/lib/data/lieferungen";
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

// Digitale Uebergabequittung und Lieferstatus (Anforderung 3.5 Teil 2, 5.2
// Teil 2a) - die interne Arbeitsansicht fuer Buero und Brigade. Die
// kundenseitige Sicht auf dieselben Daten (nur die eigene Firma, ohne
// Erfassungsformulare) liegt in b2b-portal-ansicht.tsx.
export async function LogistikAnsicht() {
  const [uebersicht, profil, t] = await Promise.all([
    ladeLieferungen(),
    getSessionProfile(),
    getTranslations("lieferungenAnsicht"),
  ]);
  const kkT = await getTranslations("nachweiskette");
  const format = await getFormatter();

  const live = uebersicht.quelle === "db";
  const darfAnlegen = live && hasPermission(profil?.role, "logistik", "create");
  const darfErfassen = live && hasPermission(profil?.role, "logistik", "update");

  const [kunden, chargen] = darfAnlegen
    ? await Promise.all([ladeB2bKundeOptionenFuerLieferung(), ladeChargeOptionenFuerLieferung()])
    : [[], []];

  const datum = (iso: string | null) =>
    iso ? format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short" }) : "-";

  return (
    <div className="space-y-6">
      <Section
        title={t("titel")}
        description={t("lead")}
        action={<DatenquelleBadge quelle={uebersicht.quelle} />}
      >
        {uebersicht.lieferungen.length === 0 ? (
          <Card className="text-center text-xs text-muted-foreground">{t("keineLieferungen")}</Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {uebersicht.lieferungen.map((l) => (
              <Card key={l.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-black text-card-foreground">{l.kunde}</p>
                    {l.chargeCode ? (
                      <p className="font-mono text-[11px] text-muted-foreground">{l.chargeCode}</p>
                    ) : null}
                  </div>
                  <StatusPill tone={statusTon[l.status] ?? "neutral"}>
                    {t(`status.${l.status}`)}
                  </StatusPill>
                </div>

                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  <div>
                    <dt className="text-muted-foreground">{t("menge")}</dt>
                    <dd className="font-semibold text-foreground">
                      {format.number(l.mengeKg)} kg
                      {l.bestellteMengeKg !== null && l.bestellteMengeKg !== l.mengeKg ? (
                        <span className="ml-1 text-[11px] text-muted-foreground">
                          ({t("bestellt")}: {format.number(l.bestellteMengeKg)} kg)
                        </span>
                      ) : null}
                    </dd>
                  </div>
                  {l.geliefertAm ? (
                    <div>
                      <dt className="text-muted-foreground">{t("geliefertAm")}</dt>
                      <dd className="font-semibold text-foreground">{datum(l.geliefertAm)}</dd>
                    </div>
                  ) : null}
                  {l.empfaengerName ? (
                    <div className="col-span-2">
                      <dt className="text-muted-foreground">{t("empfaengerName")}</dt>
                      <dd className="font-semibold text-foreground">{l.empfaengerName}</dd>
                    </div>
                  ) : null}
                  {l.letzteKuehlmessung ? (
                    <div className="col-span-2">
                      <dt className="text-muted-foreground">{t("temperatur")}</dt>
                      <dd>
                        <StatusPill tone={kuehlTon[l.letzteKuehlmessung.ergebnis] ?? "neutral"}>
                          {l.letzteKuehlmessung.temperaturC} °C ·{" "}
                          {kkT(`ergebnis.${l.letzteKuehlmessung.ergebnis}`)}
                        </StatusPill>
                      </dd>
                    </div>
                  ) : null}
                </dl>

                {l.transportMessungen.length > 0 ? (
                  <div className="mt-2 border-t border-border pt-2">
                    <p className="text-[11px] font-semibold text-muted-foreground">
                      {t("transportTitel")}
                    </p>
                    <ul className="mt-1 flex flex-wrap gap-1.5">
                      {l.transportMessungen.map((m) => (
                        <li key={m.id}>
                          <StatusPill tone={kuehlTon[m.ergebnis] ?? "neutral"}>
                            {m.temperaturC} °C
                          </StatusPill>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {darfErfassen && l.status !== "storniert" ? (
                  <TransportMessungFormular lieferungId={l.id} />
                ) : null}

                {darfErfassen && l.status === "geplant" ? (
                  <>
                    <UebergabeErfassenFormular lieferungId={l.id} />
                    <LieferungStornierenKnopf lieferungId={l.id} />
                  </>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </Section>

      {darfAnlegen ? <LieferungAnlegenFormular kunden={kunden} chargen={chargen} /> : null}

      <Card className="bg-muted/30 text-xs leading-5 text-muted-foreground">{t("note")}</Card>
    </div>
  );
}
