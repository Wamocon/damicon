"use client";

// Das Geruest der Vergleichsansicht: oben eine Leiste mit den sechs
// Zustaenden, darunter die Uebersichtsseite so, wie die gewaehlte Variante
// sie baut. Alles ausser dem geaenderten Abschnitt kommt aus gemeinsam.tsx
// und ist damit Zeile fuer Zeile die heutige Seite.
//
// Entwurfsmaterial, keine Produktivroute. Faellt mit der Entscheidung weg.
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { usePersona } from "@/components/dashboard/persona";
import { cn } from "@/lib/utils";
import { kpisFuerRolle, type Kpi } from "@/lib/domain/kpis";
import type { Datenquelle } from "@/lib/supabase/config";
import {
  KopfBereich,
  KpiAbschnitt,
  MeilensteinAbschnitt,
  ZonenAbschnitt,
} from "./gemeinsam";
import { AmpelAbschnitt } from "./variante-1-ampel";
import { TageslageAbschnitt, type Tageslage } from "./variante-2-tageslage";
import { ZonenMitKennzahlen } from "./variante-3-zonenkennzahlen";
import {
  DatenstandAbschnitt,
  KennzahlenOhneBauzustand,
} from "./variante-4-datenstand";
import { KennzahlenAlsZeilen } from "./variante-5-zeilen";
import { varianten, type VariantenSchluessel } from "./varianten";

function Waehler({ aktiv }: { aktiv: VariantenSchluessel }) {
  const t = useTranslations("dashboard.entwurf");
  return (
    <nav
      aria-label={t("navTitel")}
      className="rounded-2xl border border-dashed border-border bg-muted/30 p-4"
    >
      <p className="text-sm font-black text-card-foreground">{t("navTitel")}</p>
      <p className="mt-0.5 schrift-dense text-muted-foreground">
        {t("navHinweis")}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {varianten.map((v) => (
          <Link
            key={v}
            href={`/dashboard/entwurf/${v}`}
            aria-current={v === aktiv ? "page" : undefined}
            className={cn(
              "rounded-md border px-2.5 py-1 text-[11px] font-semibold leading-4 transition",
              v === aktiv
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            {t(`name.${v}`)}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export function EntwurfSeite({
  variante,
  kpis,
  quelle,
  lage,
  stand,
  istAdmin,
}: {
  variante: VariantenSchluessel;
  kpis: Kpi[];
  quelle: Datenquelle;
  /** Nur fuer Variante 2 geladen, sonst null. */
  lage: Tageslage | null;
  stand: string;
  istAdmin: boolean;
}) {
  const { role } = usePersona();
  const t = useTranslations("dashboard.entwurf");
  const { kern, erweitert } = kpisFuerRolle(role, kpis);
  const sichtbar = [...kern, ...erweitert];

  return (
    <div className="space-y-8">
      <Waehler aktiv={variante} />

      <div className="rounded-2xl border border-border bg-card/40 p-4 sm:p-6">
        <p className="mb-6 text-xs leading-5 text-muted-foreground">
          <span className="font-semibold text-card-foreground">
            {t(`name.${variante}`)}
          </span>
          {" - "}
          {t(`erklaerung.${variante}`)}
        </p>

        <div className="space-y-8">
          <KopfBereich role={role} />

          {variante === "v2" && lage ? (
            <TageslageAbschnitt role={role} lage={lage} stand={stand} />
          ) : null}

          {variante === "v1" ? (
            <AmpelAbschnitt
              kern={kern}
              erweitert={erweitert}
              alle={sichtbar}
              quelle={quelle}
            />
          ) : null}

          {variante === "v4" ? (
            <KennzahlenOhneBauzustand
              kern={kern}
              erweitert={erweitert}
              quelle={quelle}
            />
          ) : null}

          {variante === "v5" ? (
            <KennzahlenAlsZeilen
              kern={kern}
              erweitert={erweitert}
              quelle={quelle}
            />
          ) : null}

          {variante === "ist" || variante === "v2" ? (
            <KpiAbschnitt
              kern={kern}
              erweitert={erweitert}
              alle={sichtbar}
              quelle={quelle}
            />
          ) : null}

          {variante === "v3" ? (
            <ZonenMitKennzahlen role={role} kpis={sichtbar} quelle={quelle} />
          ) : (
            <ZonenAbschnitt role={role} />
          )}

          {variante === "v4" ? (
            <DatenstandAbschnitt
              alle={sichtbar}
              quelle={quelle}
              stand={stand}
              istAdmin={istAdmin}
            />
          ) : (
            <MeilensteinAbschnitt />
          )}
        </div>
      </div>
    </div>
  );
}
