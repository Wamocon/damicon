import { getFormatter, getTranslations } from "next-intl/server";
import { Card, Section } from "@/components/ui/kit";
import { DatenquelleBadge } from "@/components/db/datenquelle-badge";
import { EinstellungFormular } from "@/components/db/einstellung-formular";
import { getSessionProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ladeEinstellungen, ladeEinstellungenVerlauf } from "@/lib/data/einstellungen";
import { bereiche, darfEinstellungAendern, einstellungTextSchluessel } from "@/lib/einstellungen";

// Fachliche Einstellungen: Fristen, Kapazitaeten und Richtwerte, die Administration, Geschaeftsfuehrung und die zustaendigen Fachrollen hier
// pflegen, statt dass sie im Code stehen. Zugriffsrechte gehoeren nicht hierher (sie stehen in der Rechtematrix und in der Datenbank).
export async function EinstellungenAnsicht() {
  const [zeilen, verlauf, profil, t, format] = await Promise.all([
    ladeEinstellungen(),
    ladeEinstellungenVerlauf(),
    getSessionProfile(),
    getTranslations("einstellungen"),
    getFormatter(),
  ]);
  const live = isSupabaseConfigured();
  const zahl = (wert: number | null, einheit: string) => (wert === null ? t("nichtGesetzt") : `${format.number(wert)} ${einheit}`);
  const tag = (iso: string) => format.dateTime(new Date(`${iso.slice(0, 10)}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });

  return (
    <div className="space-y-6">
      <Card className="bg-muted/30 text-xs leading-5 text-muted-foreground">{t("lead")}</Card>
      {bereiche.map((bereich) => {
        const inBereich = zeilen.filter((z) => z.def.bereich === bereich);
        if (inBereich.length === 0) return null;
        return (
          <Section key={bereich} title={t(`bereich.${bereich}.titel`)} description={t(`bereich.${bereich}.lead`)} action={<DatenquelleBadge quelle={live ? "db" : "demo"} />}>
            <div className="space-y-4">
              {inBereich.map((z) => {
                const k = einstellungTextSchluessel(z.def.schluessel);
                const darfAendern = live && darfEinstellungAendern(profil?.role, z.def);
                const einheit = t(`einheit.${z.def.einheit}` as never);
                return (
                  <Card key={z.def.schluessel} className="space-y-2.5">
                    <div>
                      <p className="text-sm font-bold text-foreground">{t(`eintrag.${k}.label` as never)}</p>
                      <p className="text-xs leading-5 text-muted-foreground">{t(`eintrag.${k}.beschreibung` as never)}</p>
                    </div>
                    {darfAendern ? (
                      <EinstellungFormular schluessel={z.def.schluessel} wert={z.wert} einheit={einheit} />
                    ) : (
                      <p className="text-sm text-foreground">
                        <span className="font-semibold">{zahl(z.wert, einheit)}</span>
                        {live ? <span className="ml-2 text-xs text-muted-foreground">{t("nurLesen")}</span> : null}
                      </p>
                    )}
                    <p className="text-[11px] leading-4 text-muted-foreground">
                      {t("standard", { wert: zahl(z.def.standard, einheit) })}
                      {z.stand ? ` · ${t("stand", { datum: tag(z.stand) })}` : ""}
                      {z.aktualisiertAm ? ` · ${t("geaendert", { datum: format.dateTime(new Date(z.aktualisiertAm), { dateStyle: "medium", timeStyle: "short" }) })}` : ""}
                    </p>
                    {z.quelle ? <p className="text-[11px] leading-4 text-muted-foreground">{t("quelle", { quelle: z.quelle })}</p> : null}
                  </Card>
                );
              })}
            </div>
          </Section>
        );
      })}

      {verlauf.length > 0 ? (
        <Section title={t("verlauf.titel")} description={t("verlauf.lead")}>
          <ul className="space-y-1.5">
            {verlauf.map((v) => {
              const def = zeilen.find((z) => z.def.schluessel === v.schluessel)?.def;
              const einheit = def ? t(`einheit.${def.einheit}` as never) : "";
              return (
                <li key={v.id} className="text-xs text-muted-foreground">
                  <span className="text-foreground">{format.dateTime(new Date(v.zeitpunkt), { dateStyle: "medium", timeStyle: "short" })}</span>
                  {" · "}
                  {v.von}
                  {" · "}
                  {def ? t(`eintrag.${einstellungTextSchluessel(def.schluessel)}.label` as never) : v.schluessel}
                  {": "}
                  {zahl(v.altWert, einheit)} {"→"} {zahl(v.neuWert, einheit)}
                  {v.grund ? ` · ${v.grund}` : ""}
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}
