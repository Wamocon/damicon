import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Download } from "lucide-react";
import { Section, StatusPill, DataTable } from "@/components/ui/kit";
import {
  EsutdAbschlussFormular,
  EsutdEntfernenKnopf,
  EsutdEreignisFormular,
  EsutdErfassenFormular,
  EsutdOeffnenKnopf,
} from "@/components/db/esutd-formulare";
import { ladeEsutdMeldungen, ladeEsutdOptionen } from "@/lib/data/esutd";
import { esutdTon, meldungUeberfaellig, zaehleMeldungen, type EsutdMeldung } from "@/lib/domain/esutd";
import { tagInZone } from "@/lib/domain/tageszeit";
import { getSessionProfile } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";

// Staatliche Pflichtintegrationen (WMCNL-1447, Stufe 1): der Meldeprozess fuer das Einheitssystem
// ЕСУТД. Damicon meldet nicht selbst, es fuehrt den Stand: was ist zu melden, was ist gemeldet,
// womit belegt. Die automatische Meldung (Stufe 2) braucht den Zugang der Behoerde. Die Meldungen
// enthalten personenbezogene Daten: Lesen darf das Buero (Zeilensicherheit), Schreiben die Leitung.

type Uebersetzer = Awaited<ReturnType<typeof getTranslations>>;

function Detail({ m, t, belegName }: { m: EsutdMeldung; t: Uebersetzer; belegName: string | null }) {
  const zeilen = [
    m.ausweis ? t("liste.ausweis", { ausweis: m.ausweis }) : null,
    m.vertragsnummer ? t("liste.vertrag", { nummer: m.vertragsnummer }) : null,
    m.beschreibung,
  ].filter((z): z is string => Boolean(z));
  return (
    <div className="space-y-0.5">
      <p className="font-semibold text-foreground">{m.pfluecker ?? <span className="font-normal text-muted-foreground">{t("liste.ohneName")}</span>}</p>
      {zeilen.map((z) => (
        <p key={z} className="text-[11px] text-muted-foreground">
          {z}
        </p>
      ))}
      {m.status === "erfasst" ? (
        <p className="text-[11px] text-muted-foreground">
          {[m.bestaetigung ? t("liste.bestaetigung", { nummer: m.bestaetigung }) : null, belegName ? t("liste.beleg", { name: belegName }) : t("liste.keinBeleg")].filter(Boolean).join(" · ")}
        </p>
      ) : null}
    </div>
  );
}

export async function IntegrationenAnsicht() {
  const [meldungen, optionen, profil, t, format, sprache] = await Promise.all([
    ladeEsutdMeldungen(),
    ladeEsutdOptionen(),
    getSessionProfile(),
    getTranslations("esutdAnsicht"),
    getFormatter(),
    getLocale(),
  ]);
  const darfAendern = hasPermission(profil?.role, "personal", "update");
  const heute = tagInZone(new Date());
  const tag = (iso: string) => format.dateTime(new Date(`${iso.slice(0, 10)}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });
  const zaehlung = zaehleMeldungen(meldungen, heute);
  const belegName = new Map(optionen.belege.map((b) => [b.id, b.name]));
  const vertragsAuswahl = optionen.vertraege.map((v) => ({
    id: v.id,
    label: [v.pfluecker ?? t("liste.ohneName"), v.vertragsnummer, v.beginn ? tag(v.beginn) : null].filter(Boolean).join(" · "),
  }));

  return (
    <div className="space-y-6">
      <Section title={t("titel")} description={t("lead")}>
        <div className="flex flex-wrap gap-1.5">
          <StatusPill tone={zaehlung.offen > 0 ? "warning" : "success"}>
            {t("zaehl.offen")} {zaehlung.offen}
          </StatusPill>
          {zaehlung.ueberfaellig > 0 ? (
            <StatusPill tone="danger">
              {t("zaehl.ueberfaellig")} {zaehlung.ueberfaellig}
            </StatusPill>
          ) : null}
          <StatusPill tone="success">
            {t("zaehl.erfasst")} {zaehlung.erfasst}
          </StatusPill>
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">{t("stufeHinweis")}</p>
        {!darfAendern ? <p className="mt-1 text-xs text-muted-foreground">{t("nurLesen")}</p> : null}
        {darfAendern ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <a
              href={`/api/esutd/export?sprache=${sprache}&status=offen`}
              download="damicon-esutd-offen.csv"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-bold text-foreground transition hover:border-primary"
            >
              <Download className="h-3.5 w-3.5" />
              {t("export.knopf")}
            </a>
            <span className="text-[11px] text-muted-foreground">{t("export.hinweis")}</span>
          </div>
        ) : null}
      </Section>

      <Section title={t("liste.titel")}>
        {meldungen.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("liste.leer")}</p>
        ) : (
          <DataTable head={[t("liste.col.person"), t("liste.col.art"), t("liste.col.datum"), t("liste.col.frist"), t("liste.col.status"), ...(darfAendern ? [""] : [])]}>
            {meldungen.map((m) => {
              const ueberfaellig = meldungUeberfaellig(m, heute);
              return (
                <tr key={`${m.quelle}-${m.id}`}>
                  <td className="px-3 py-2.5">
                    <Detail m={m} t={t} belegName={m.belegDokumentId ? (belegName.get(m.belegDokumentId) ?? null) : null} />
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{t(`art.${m.art}`)}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{m.ereignisAm ? tag(m.ereignisAm) : "-"}</td>
                  <td className="px-3 py-2.5">
                    {m.meldefristAm ? (
                      <div>
                        <p className="text-foreground">{t("liste.fristBis", { datum: tag(m.meldefristAm) })}</p>
                        {ueberfaellig ? <StatusPill tone="danger">{t("liste.ueberfaellig")}</StatusPill> : null}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">{m.status === "offen" ? t("liste.keineFrist") : "-"}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusPill tone={esutdTon[m.status]}>{t(`status.${m.status}`)}</StatusPill>
                    {m.erfasstAm ? <p className="mt-0.5 text-[11px] text-muted-foreground">{t("liste.erfasstAm", { datum: tag(m.erfasstAm) })}</p> : null}
                  </td>
                  {darfAendern ? (
                    <td className="px-3 py-2.5">
                      {m.status === "offen" ? (
                        <div className="space-y-1.5">
                          <EsutdErfassenFormular quelle={m.quelle} id={m.id} heute={heute} belege={optionen.belege} />
                          <EsutdEntfernenKnopf quelle={m.quelle} id={m.id} />
                        </div>
                      ) : (
                        <EsutdOeffnenKnopf quelle={m.quelle} id={m.id} />
                      )}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </DataTable>
        )}
      </Section>

      {darfAendern ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <EsutdAbschlussFormular pfluecker={optionen.pfluecker} />
          <EsutdEreignisFormular vertraege={vertragsAuswahl} artLabel={{ aenderung: t("art.aenderung"), beendigung: t("art.beendigung") }} />
        </div>
      ) : null}
    </div>
  );
}
