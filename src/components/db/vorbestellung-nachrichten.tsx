import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Download } from "lucide-react";
import { Aufklapper, Section } from "@/components/ui/kit";
import { NachrichtFormular } from "@/components/db/nachricht-formular";
import { ladeNachrichten } from "@/lib/data/nachrichten";
import type { NachrichtZeile } from "@/lib/domain/nachrichten";
import type { VorbestellungZeile } from "@/lib/domain/vorbestellungen";

// Nachrichten je Vorbestellung und der Lieferplan als Kalenderdatei (WMCNL-1472),
// unter der Liste der Vorbestellungen im B2B-Portal. Wer die Vorbestellung sieht,
// sieht ihren Verlauf: der Kunde seinen eigenen, das Buero alle.

/** So viele Vorbestellungen zeigt der Abschnitt hoechstens: die mit dem juengsten Verlauf zuerst, dann die offenen. */
const ANZEIGE_GRENZE = 30;

function reihenfolge(vorbestellungen: readonly VorbestellungZeile[], nachrichten: Record<string, NachrichtZeile[]>): VorbestellungZeile[] {
  const letzte = (id: string) => nachrichten[id]?.at(-1)?.erstelltAm ?? "";
  return [...vorbestellungen]
    .sort((a, b) => letzte(b.id).localeCompare(letzte(a.id)) || b.erstelltAm.localeCompare(a.erstelltAm))
    .slice(0, ANZEIGE_GRENZE);
}

export async function LieferplanDownload() {
  const [t, sprache] = await Promise.all([getTranslations("nachrichten.download"), getLocale()]);
  return (
    <a
      href={`/api/lieferplan?sprache=${sprache}`}
      download="damicon-lieferplan.ics"
      title={t("hinweis")}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-bold text-foreground transition hover:border-primary"
    >
      <Download className="h-3.5 w-3.5" />
      {t("knopf")}
    </a>
  );
}

export async function VorbestellungNachrichten({
  vorbestellungen,
  darfSchreiben,
  zeigeKunde,
}: {
  vorbestellungen: readonly VorbestellungZeile[];
  darfSchreiben: boolean;
  zeigeKunde: boolean;
}) {
  const [nachrichten, t, rollenT, format] = await Promise.all([
    ladeNachrichten(),
    getTranslations("nachrichten"),
    getTranslations("roles"),
    getFormatter(),
  ]);
  const liste = reihenfolge(vorbestellungen, nachrichten);

  return (
    <Section title={t("titel")} description={t("lead")}>
      {liste.length === 0 ? <p className="text-xs text-muted-foreground">{t("keineVorbestellung")}</p> : null}
      <div className="space-y-2">
        {liste.map((v) => {
          const verlauf = nachrichten[v.id] ?? [];
          return (
            <Aufklapper
              key={v.id}
              titel={`${zeigeKunde ? `${v.kunde}: ` : ""}${v.sorte}, ${format.number(v.mengeKg)} kg`}
              beschreibung={t("anzahl", { anzahl: verlauf.length })}
            >
              <div className="space-y-3 p-4">
                {verlauf.length === 0 ? <p className="text-xs text-muted-foreground">{t("keineNachrichten")}</p> : null}
                <ul className="space-y-2">
                  {verlauf.map((n) => (
                    <li key={n.id} className="rounded-lg border border-border bg-background px-3 py-2">
                      <p className="text-[11px] text-muted-foreground">
                        <span className="font-semibold text-foreground">{n.autor}</span> ({rollenT(n.rolle as never)}) ·{" "}
                        {format.dateTime(new Date(n.erstelltAm), { dateStyle: "medium", timeStyle: "short" })}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{n.text}</p>
                    </li>
                  ))}
                </ul>
                {darfSchreiben && v.status !== "storniert" ? (
                  <NachrichtFormular vorbestellungId={v.id} />
                ) : v.status === "storniert" ? (
                  <p className="text-xs text-muted-foreground">{t("storniert")}</p>
                ) : null}
              </div>
            </Aufklapper>
          );
        })}
      </div>
    </Section>
  );
}
