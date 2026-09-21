"use client";

// Die Zonenkarte der gewaehlten Richtung: Zone, ihre Kennzahlen, ihre Module.
// Die fuenf Weiterentwicklungen schalten je einen Teil davon zu, damit ein
// Vergleichsbild eine Aenderung zeigt und nicht fuenf.
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Icon } from "@/components/icon";
import { kachelVerweis, Section, StatusPill } from "@/components/ui/kit";
import { cn } from "@/lib/utils";
import { hasPermission, type Role } from "@/lib/rbac";
import { modulesForZone, zones, type ModuleDef, type ZoneDef } from "@/lib/modules";
import type { Kpi } from "@/lib/domain/kpis";
import type { Datenquelle } from "@/lib/supabase/config";
import { KennzahlBox } from "./kennzahl-box";
import { nachDringlichkeit, zielAuswerten } from "./zielstand";
import { vorgaengeFuerZone, type Tageslage } from "./tageslage";

export interface KartenOptionen {
  /** 1: Band vom Ist zum Ziel in jeder Kennzahlbox. */
  zielband?: boolean;
  /** 2: Zusammenfassung der Zielstaende im Kopf der Karte. */
  zonenlage?: boolean;
  /** 3: offene Vorgaenge der Zone neben den Kennzahlen. */
  vorgaenge?: boolean;
  /** 4: Modulnamen als Knoepfe, die direkt in das Modul fuehren. */
  moduleAlsWege?: boolean;
  /** 5: Zonen ohne freigegebene Module fallen zusammen. */
  rollengerecht?: boolean;
}

function ZonenLage({ kpis }: { kpis: Kpi[] }) {
  const t = useTranslations("dashboard.entwurf");
  if (kpis.length === 0) {
    return <StatusPill tone="neutral">{t("zonenlage.ohneKennzahl")}</StatusPill>;
  }

  // Gezaehlt wird nur, was wirklich gemessen ist. Ein Platzhalter hat keinen
  // aussagekraeftigen Abstand zum Ziel, und eine Kennzahl ohne Zielwert
  // ("Ausgangswert") laesst sich ohnehin nicht einordnen.
  const gemessen = kpis
    .map((kpi) => zielAuswerten(kpi))
    .filter((auswertung) => !auswertung.platzhalter && auswertung.stand !== "offen");

  if (gemessen.length === 0) {
    return <StatusPill tone="neutral">{t("zonenlage.ohneMessung")}</StatusPill>;
  }

  const daneben = gemessen.filter(
    (auswertung) => auswertung.stand === "verfehlt" || auswertung.stand === "knapp",
  ).length;

  if (daneben === 0) {
    return (
      <StatusPill tone="success">
        {t("zonenlage.alleImZiel", { gesamt: gemessen.length })}
      </StatusPill>
    );
  }

  const verfehlt = gemessen.filter(
    (auswertung) => auswertung.stand === "verfehlt",
  ).length;
  return (
    <StatusPill tone={verfehlt > 0 ? "danger" : "warning"}>
      {t("zonenlage.ausserhalb", { anzahl: daneben, gesamt: gemessen.length })}
    </StatusPill>
  );
}

function Vorgaenge({
  zone,
  role,
  lage,
}: {
  zone: ZoneDef;
  role: Role;
  lage: Tageslage;
}) {
  const t = useTranslations("dashboard.entwurf");
  const sichtbar = vorgaengeFuerZone(zone.key, lage).filter((vorgang) =>
    hasPermission(role, vorgang.resource, "view"),
  );
  if (sichtbar.length === 0) return null;

  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="schrift-label font-semibold uppercase tracking-wide text-muted-foreground">
        {t("vorgaenge.titel")}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {sichtbar.map((vorgang) => (
          <Link
            key={vorgang.key}
            href={vorgang.pfad}
            className={cn(
              "group/vorgang flex min-w-0 items-center gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 transition hover:border-primary/40",
              vorgang.anzahl === 0 && "opacity-60",
            )}
          >
            <span
              className={cn(
                "text-base font-black tabular-nums",
                vorgang.anzahl === 0
                  ? "text-muted-foreground"
                  : vorgang.ton === "danger"
                    ? "text-destructive"
                    : vorgang.ton === "warning"
                      ? "text-warning"
                      : "text-foreground",
              )}
            >
              {vorgang.anzahl}
            </span>
            <span className="min-w-0 text-[11px] leading-4 text-muted-foreground">
              {t(`lage.${vorgang.key}`)}
              {vorgang.zusatzKey ? (
                <span className="block text-warning">
                  {t(`lage.${vorgang.zusatzKey}`, {
                    anzahl: vorgang.zusatzAnzahl ?? 0,
                  })}
                </span>
              ) : null}
            </span>
            <ArrowRight
              aria-hidden
              className="h-3.5 w-3.5 shrink-0 text-primary opacity-0 transition group-hover/vorgang:opacity-100"
            />
          </Link>
        ))}
      </div>
    </div>
  );
}

function ModuleAlsText({ module }: { module: ModuleDef[] }) {
  const moduleT = useTranslations("modules");
  return (
    <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-border pt-3 text-[11px] leading-4 text-muted-foreground @xl:grid-cols-3">
      {module.map((eintrag) => (
        <li key={eintrag.key} className="flex min-w-0 items-center gap-1.5">
          <span
            aria-hidden
            className="h-1 w-1 shrink-0 rounded-full bg-primary/50"
          />
          <span className="truncate">{moduleT(`${eintrag.key}.navTitle`)}</span>
        </li>
      ))}
    </ul>
  );
}

function ModuleAlsWege({
  zone,
  module,
}: {
  zone: ZoneDef;
  module: ModuleDef[];
}) {
  const moduleT = useTranslations("modules");
  const t = useTranslations("dashboard.entwurf");
  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="schrift-label font-semibold uppercase tracking-wide text-muted-foreground">
        {t("module.titel")}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {module.map((eintrag) => (
          <Link
            key={eintrag.key}
            href={`/dashboard/${zone.key}/${eintrag.slug}`}
            className="max-w-full truncate rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px] font-medium leading-4 text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
          >
            {moduleT(`${eintrag.key}.navTitle`)}
          </Link>
        ))}
      </div>
    </div>
  );
}

function ReifegradPillen({ module }: { module: ModuleDef[] }) {
  const t = useTranslations("dashboard");
  const angebunden = module.filter((m) => m.reifegrad === "angebunden").length;
  const demo = module.filter((m) => m.reifegrad === "demo").length;
  const wip = module.filter((m) => m.reifegrad === "in-entwicklung").length;
  return (
    <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
      {angebunden > 0 ? (
        <StatusPill tone="success">
          {t("home.dbCount", { count: angebunden })}
        </StatusPill>
      ) : null}
      {demo > 0 ? (
        <StatusPill tone="info">{t("home.demoCount", { count: demo })}</StatusPill>
      ) : null}
      {wip > 0 ? (
        <StatusPill tone="warning">{t("home.wipCount", { count: wip })}</StatusPill>
      ) : null}
    </div>
  );
}

function ZonenKarte({
  zone,
  role,
  kpis,
  optionen,
  lage,
}: {
  zone: ZoneDef;
  role: Role;
  kpis: Kpi[];
  optionen: KartenOptionen;
  lage: Tageslage | null;
}) {
  const t = useTranslations("dashboard");
  const entwurfT = useTranslations("dashboard.entwurf");
  const zoneT = useTranslations("zones");

  const sichtbareModule = modulesForZone(zone.key).filter((m) =>
    hasPermission(role, m.resource, "view"),
  );
  const zonenKpis = nachDringlichkeit(kpis.filter((kpi) => kpi.zone === zone.key));

  // Eine Karte, die selbst Verweise enthaelt, darf nicht als Ganzes ein
  // Verweis sein - verschachtelte <a> sind ungueltiges HTML, und der Browser
  // bricht die Verschachtelung beim Parsen auf. In diesen beiden Varianten
  // traegt deshalb der Kopf den Verweis auf die Zone, nicht die Karte.
  const innereVerweise = Boolean(optionen.vorgaenge || optionen.moduleAlsWege);

  const kopf = (
    <div className="flex items-center gap-3">
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon name={zone.icon} className="h-5 w-5" />
      </span>
      <h3 className="min-w-0 flex-1 truncate text-base font-black text-card-foreground">
        {zoneT(`${zone.key}.name`)}
      </h3>
      {optionen.zonenlage ? <ZonenLage kpis={zonenKpis} /> : null}
      <span className="sr-only">{t("home.openZone")}</span>
      <ArrowRight
        aria-hidden
        className="h-4 w-4 shrink-0 text-primary transition group-hover:translate-x-0.5"
      />
    </div>
  );

  const inhalt = (
    <>
      {innereVerweise ? (
        <Link
          href={`/dashboard/${zone.key}`}
          title={entwurfT("module.zoneOeffnen")}
          className="group rounded-lg outline-offset-4"
        >
          {kopf}
        </Link>
      ) : (
        kopf
      )}

      <p className="mt-2.5 text-xs leading-5 text-muted-foreground">
        {zoneT(`${zone.key}.tagline`)}
      </p>

      {zonenKpis.length > 0 ? (
        // auto-rows-fr: auch Boxen in verschiedenen Zeilen werden gleich hoch.
        <div className="mt-3 grid auto-rows-fr grid-cols-2 gap-2 @md:grid-cols-3 @xl:grid-cols-4">
          {zonenKpis.map((kpi) => (
            <KennzahlBox key={kpi.key} kpi={kpi} zielband={optionen.zielband} />
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-xl border border-dashed border-border p-3 text-[11px] leading-4 text-muted-foreground">
          {entwurfT("zoneOhneKennzahl")}
        </p>
      )}

      {optionen.vorgaenge && lage ? (
        <Vorgaenge zone={zone} role={role} lage={lage} />
      ) : null}

      {sichtbareModule.length > 0 ? (
        optionen.moduleAlsWege ? (
          <ModuleAlsWege zone={zone} module={sichtbareModule} />
        ) : (
          <ModuleAlsText module={sichtbareModule} />
        )
      ) : null}

      <ReifegradPillen module={sichtbareModule} />
    </>
  );

  if (innereVerweise) {
    return (
      <div
        className={cn(
          "@container flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm",
        )}
      >
        {inhalt}
      </div>
    );
  }

  return (
    <Link
      href={`/dashboard/${zone.key}`}
      className={cn(kachelVerweis, "@container p-5")}
    >
      {inhalt}
    </Link>
  );
}

/** Zonen, in denen die Rolle kein einziges Modul oeffnen darf. */
function LeereZonen({ zonenListe }: { zonenListe: ZoneDef[] }) {
  const t = useTranslations("dashboard.entwurf");
  const zoneT = useTranslations("zones");
  if (zonenListe.length === 0) return null;
  const namen = zonenListe.map((zone) => zoneT(`${zone.key}.name`)).join(", ");
  return (
    <div className="rounded-2xl border border-dashed border-border p-4 sm:col-span-2">
      <p className="text-[11px] leading-4 text-muted-foreground">
        {zonenListe.length === 1
          ? t("rolle.leereZonenEine")
          : t("rolle.leereZonen", { anzahl: zonenListe.length })}
        {": "}
        <span className="font-medium text-card-foreground">{namen}</span>
      </p>
    </div>
  );
}

export function ZonenAbschnittNeu({
  role,
  kpis,
  quelle,
  optionen = {},
  lage = null,
}: {
  role: Role;
  /** Alle fuer die Rolle sichtbaren Kennzahlen, Kern und erweitert. */
  kpis: Kpi[];
  quelle: Datenquelle;
  optionen?: KartenOptionen;
  lage?: Tageslage | null;
}) {
  const t = useTranslations("dashboard.entwurf");
  const quelleT = useTranslations("dashboard.dataSource");

  // Die Reihenfolge der vier Zonen folgt dem Weg der Ware und bleibt deshalb,
  // wie sie ist. Variante 5 raeumt nur weg, was fuer die Rolle leer ist.
  const leer = zones.filter(
    (zone) =>
      modulesForZone(zone.key).filter((m) =>
        hasPermission(role, m.resource, "view"),
      ).length === 0,
  );
  const gezeigt =
    optionen.rollengerecht && leer.length > 0
      ? zones.filter((zone) => !leer.includes(zone))
      : zones;

  return (
    <Section
      title={t("zonenTitel")}
      description={t("zonenBeschreibung")}
      action={
        <StatusPill tone={quelle === "db" ? "success" : "warning"}>
          {quelleT(quelle === "db" ? "db" : "demo")}
        </StatusPill>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {gezeigt.map((zone) => (
          <ZonenKarte
            key={zone.key}
            zone={zone}
            role={role}
            kpis={kpis}
            optionen={optionen}
            lage={lage}
          />
        ))}
        {optionen.rollengerecht ? <LeereZonen zonenListe={leer} /> : null}
      </div>
    </Section>
  );
}
