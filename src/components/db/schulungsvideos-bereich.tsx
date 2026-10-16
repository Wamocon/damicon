import { getLocale, getTranslations } from "next-intl/server";
import { Card, Section, StatusPill } from "@/components/ui/kit";
import { DatenquelleBadge } from "@/components/db/datenquelle-badge";
import { StornoKnopf } from "@/components/db/formular-kit";
import { SchulungsvideoUpload } from "@/components/db/schulungsvideo-upload";
import { SchulungsvideoWiedergabe } from "@/components/db/schulungsvideo-wiedergabe";
import { videoDateiEntfernen } from "@/lib/actions/schulungsvideos";
import { getSessionProfile } from "@/lib/auth";
import { ladeSchulungsvideos } from "@/lib/data/schulungsvideos";
import { dauerAus } from "@/lib/domain/schulungsvideos";
import { hasPermission } from "@/lib/rbac";

// Die Schulungsvideos im Portal: abspielen in der eigenen Sprache, wo die Administration oder Betriebsleitung eine Datei hochgeladen hat; dort auch hochladen,
// ersetzen und entfernen. Ohne Datei zeigt die Karte den Titel und sagt, dass noch kein Video da ist (kein erfundener Inhalt).
export async function SchulungsvideosBereich() {
  const [liste, profil, locale, t] = await Promise.all([ladeSchulungsvideos(), getSessionProfile(), getLocale(), getTranslations("schulungsvideos")]);
  if (liste.quelle !== "db" || liste.videos.length === 0) return null;
  const darfPflegen = hasPermission(profil?.role, "schulungen", "update");

  return (
    <Section title={t("titel")} description={t("lead")} action={<DatenquelleBadge quelle={liste.quelle} />}>
      <div className="grid gap-3 lg:grid-cols-2">
        {liste.videos.map((video) => {
          const dauer = dauerAus(video.dauerSekunden);
          const abspielbar = video.dateien.flatMap((d) => (d.url ? [{ sprache: d.sprache, url: d.url }] : []));
          return (
            <Card key={video.id} className="space-y-3">
              <div>
                <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-card-foreground">
                  {video.titel}
                  {video.pflicht ? <StatusPill tone="warning">{t("pflicht")}</StatusPill> : null}
                </p>
                {video.thema ? <p className="text-xs text-muted-foreground">{video.thema}</p> : null}
                {dauer ? <p className="text-[11px] text-muted-foreground">{t("dauer", { min: dauer.min, sek: dauer.sek })}</p> : null}
              </div>
              {abspielbar.length > 0 ? <SchulungsvideoWiedergabe titel={video.titel} dateien={abspielbar} startSprache={locale} /> : <p className="text-xs text-muted-foreground">{t("nochKeinVideo")}</p>}
              {darfPflegen ? (
                <div className="space-y-2">
                  {video.dateien.length > 0 ? (
                    <ul className="space-y-1">
                      {video.dateien.map((d) => (
                        <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span>
                            {t(`sprache.${d.sprache}`)} · {Math.max(1, Math.round(d.groesseBytes / (1024 * 1024)))} MB
                          </span>
                          <StornoKnopf id={d.id} aktion={videoDateiEntfernen} label={t("entfernen")} />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <SchulungsvideoUpload videoId={video.id} />
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>
    </Section>
  );
}
