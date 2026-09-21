"use client";

// Das Geruest der Vergleichsansicht: oben eine Leiste mit den Zustaenden,
// darunter die Uebersichtsseite so, wie der gewaehlte sie baut.
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
import { BegruessungsKopf } from "./begruessung";
import { ZonenAbschnittNeu, type KartenOptionen } from "./zonen-karte";
import type { Tageslage } from "./tageslage";
import type { Tageszeit } from "./tageszeit";
import { varianten, type VariantenSchluessel } from "./varianten";

// Je Variante genau ein Schalter. Die Basis hat keinen.
const optionenJeVariante: Record<VariantenSchluessel, KartenOptionen> = {
  ist: {},
  basis: {},
  w1: { zielband: true },
  w2: { zonenlage: true },
  w3: { vorgaenge: true },
  w4: { moduleAlsWege: true },
  w5: { rollengerecht: true },
};

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
  tageszeit,
  datum,
}: {
  variante: VariantenSchluessel;
  kpis: Kpi[];
  quelle: Datenquelle;
  /** Nur fuer w3 geladen, sonst null. */
  lage: Tageslage | null;
  tageszeit: Tageszeit;
  datum: string;
}) {
  const { role } = usePersona();
  const t = useTranslations("dashboard.entwurf");
  const { kern, erweitert } = kpisFuerRolle(role, kpis);
  const sichtbar = [...kern, ...erweitert];
  const istHeutigeSeite = variante === "ist";

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
          {istHeutigeSeite ? (
            <>
              <KopfBereich role={role} />
              <KpiAbschnitt
                kern={kern}
                erweitert={erweitert}
                alle={sichtbar}
                quelle={quelle}
              />
              <ZonenAbschnitt role={role} />
            </>
          ) : (
            <>
              <BegruessungsKopf tageszeit={tageszeit} datum={datum} />
              <ZonenAbschnittNeu
                role={role}
                kpis={sichtbar}
                quelle={quelle}
                optionen={optionenJeVariante[variante]}
                lage={lage}
              />
            </>
          )}

          {/* Der Meilensteinblock steht in allen Zustaenden, damit der
              Vergleich fair bleibt. Ob er ueberhaupt auf der Startseite
              bleibt, ist eine eigene Entscheidung (Runde 1, Variante 4). */}
          <MeilensteinAbschnitt />
        </div>
      </div>
    </div>
  );
}
