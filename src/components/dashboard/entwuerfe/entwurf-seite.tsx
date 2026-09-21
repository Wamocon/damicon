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
import { BegruessungsBox, BegruessungsInhalt } from "./begruessung";
import { MeilensteinBox } from "./meilenstein-box";
import { ZonenBox } from "./zonen-karte";
import type { Tageszeit } from "./tageszeit";
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
  tageszeit,
  datum,
  spruch,
}: {
  variante: VariantenSchluessel;
  kpis: Kpi[];
  quelle: Datenquelle;
  tageszeit: Tageszeit;
  datum: string;
  spruch: number;
}) {
  const { role } = usePersona();
  const t = useTranslations("dashboard.entwurf");
  const { kern, erweitert } = kpisFuerRolle(role, kpis);
  const sichtbar = [...kern, ...erweitert];
  const begruessung = { tageszeit, datum, spruch, kpis: sichtbar };

  return (
    <div className="space-y-8">
      <Waehler aktiv={variante} />

      <div className="rounded-2xl border border-border bg-muted/20 p-4 sm:p-6">
        <p className="mb-6 text-xs leading-5 text-muted-foreground">
          <span className="font-semibold text-card-foreground">
            {t(`name.${variante}`)}
          </span>
          {" - "}
          {t(`erklaerung.${variante}`)}
        </p>

        <div className="space-y-6">
          {variante === "ist" ? (
            <>
              <KopfBereich role={role} />
              <KpiAbschnitt
                kern={kern}
                erweitert={erweitert}
                alle={sichtbar}
                quelle={quelle}
              />
              <ZonenAbschnitt role={role} />
              <MeilensteinAbschnitt />
            </>
          ) : null}

          {/* A: drei Boxen, die Zonen darin als eigene Karten. */}
          {variante === "m1" ? (
            <>
              <BegruessungsBox {...begruessung} />
              <ZonenBox role={role} kpis={sichtbar} quelle={quelle} />
              <MeilensteinBox />
            </>
          ) : null}

          {/* B: dieselben drei Boxen, die Zonen darin flach. */}
          {variante === "m2" ? (
            <>
              <BegruessungsBox {...begruessung} />
              <ZonenBox role={role} kpis={sichtbar} quelle={quelle} flach />
              <MeilensteinBox />
            </>
          ) : null}

          {/* C: Begruessung und Zonen in einer Box, die Lage neben der
              Anrede. Auf der Seite bleiben zwei Boxen. */}
          {variante === "m3" ? (
            <>
              <ZonenBox
                role={role}
                kpis={sichtbar}
                quelle={quelle}
                kopf={<BegruessungsInhalt {...begruessung} mitLage />}
              />
              <MeilensteinBox />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
