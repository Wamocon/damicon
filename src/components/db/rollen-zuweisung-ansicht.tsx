import { getFormatter, getTranslations } from "next-intl/server";
import { DataTable, Section, StatusPill } from "@/components/ui/kit";
import { DatenquelleBadge } from "@/components/db/datenquelle-badge";
import { RolleZuweisenFormular } from "@/components/db/rollen-zuweisung-formular";
import { KontoAnlegenFormular, KontoSperreFormular } from "@/components/db/konto-formulare";
import { ladeKonten } from "@/lib/data/rollen";
import { darfRollenVergeben } from "@/lib/domain/rollen-zuweisung";
import { getSessionProfile } from "@/lib/auth";

// Konten und ihre Rollen (WMCNL-1441), unter der Rechtematrix im Modul "rollen".
// Die Matrix zeigt, was eine Rolle darf, diese Liste, wer welche Rolle hat. Die
// Rolle aendern darf nur die Administration, und nur an einer echten Datenbank:
// im Demo-Modus gibt es keine Konten.
export async function RollenZuweisungAnsicht() {
  const [liste, profil, t, rollenT, format] = await Promise.all([
    ladeKonten(),
    getSessionProfile(),
    getTranslations("rollenZuweisung"),
    getTranslations("roles"),
    getFormatter(),
  ]);

  // Nur an einer echten Datenbank: im Demo-Modus gibt es keine Konten, und bei
  // einem Ladefehler zeigte die Liste sonst "keine Konten" als gaebe es keine.
  if (liste.quelle === "demo") return null;

  const darfVergeben = liste.quelle === "db" && darfRollenVergeben(profil?.role);

  return (
    <Section title={t("titel")} description={t("lead")} action={<DatenquelleBadge quelle={liste.quelle} />}>
      <DataTable head={[t("col.name"), t("col.email"), t("col.rolle"), t("col.aendern")]}>
        {liste.konten.map((konto) => (
          <tr key={konto.id}>
            <td className="px-3 py-2.5 font-semibold text-foreground">
              {konto.name}
              {konto.gesperrtAm ? (
                <span className="ml-2">
                  <StatusPill tone="danger">{t("gesperrtSeit", { datum: format.dateTime(new Date(konto.gesperrtAm), { dateStyle: "medium" }) })}</StatusPill>
                </span>
              ) : null}
            </td>
            <td className="px-3 py-2.5 text-muted-foreground">{konto.email ?? "-"}</td>
            <td className="px-3 py-2.5">
              <StatusPill tone={konto.rolle === "admin" ? "warning" : "neutral"}>{rollenT(konto.rolle)}</StatusPill>
            </td>
            <td className="space-y-1.5 px-3 py-2.5 text-xs text-muted-foreground">
              {!darfVergeben ? (
                t("nurAdministration")
              ) : konto.kundenkonto ? (
                t("kundeHinweis")
              ) : konto.id === profil?.id ? (
                t("eigenesKonto")
              ) : (
                <RolleZuweisenFormular profilId={konto.id} rolle={konto.rolle} />
              )}
              {darfVergeben && konto.id !== profil?.id ? (
                <>
                  {konto.gesperrtGrund ? <p className="text-[11px]">{t("sperrgrund", { grund: konto.gesperrtGrund })}</p> : null}
                  <KontoSperreFormular profilId={konto.id} gesperrt={konto.gesperrtAm !== null} />
                </>
              ) : null}
            </td>
          </tr>
        ))}
      </DataTable>
      {liste.konten.length === 0 ? <p className="text-xs text-muted-foreground">{t("leer")}</p> : null}
      <p className="text-xs text-muted-foreground">{t("hinweis")}</p>
      {darfVergeben ? <KontoAnlegenFormular /> : null}
    </Section>
  );
}
