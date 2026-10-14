import { getFormatter, getTranslations } from "next-intl/server";
import { Aufklapper, Section, StatusPill } from "@/components/ui/kit";
import { DokumentKnopf } from "@/components/ui/dokument-knopf";
import {
  CheckpunktAnlegenFormular,
  CheckpunktEntfernenKnopf,
  CheckpunktUmschaltenKnopf,
  VorschlagUebernehmenKnopf,
} from "@/components/db/foerder-checkliste-formulare";
import { ladeCheckpunkte } from "@/lib/data/foerder-checkliste";
import { tagInZone } from "@/lib/domain/tageszeit";
import {
  checklistenStand,
  fortschrittProzent,
  sortiereCheckpunkte,
  type Checkpunkt,
} from "@/lib/domain/foerder-checkliste";
import type { FoerderdossierZeile } from "@/lib/domain/foerdermittel";

// Checklisten der Foerderdossiers (WMCNL-1448, Stufe 1), unter der Dossierliste. Die Foerderstelle
// legt fest, was ein Antrag braucht; die Liste pflegt das Buero, das System erinnert an Fristen und
// zeigt den Fortschritt. Kein amtlicher Katalog.

type Uebersetzer = Awaited<ReturnType<typeof getTranslations>>;

function PunktZeile({ punkt, heute, darfAendern, t, tag }: { punkt: Checkpunkt; heute: string; darfAendern: boolean; t: Uebersetzer; tag: (iso: string) => string }) {
  const erledigt = punkt.erledigtAm !== null;
  const ueberfaellig = !erledigt && punkt.fristAm !== null && punkt.fristAm < heute;
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
      <span className={`min-w-0 flex-1 text-sm ${erledigt ? "text-muted-foreground line-through" : "text-foreground"}`}>
        {punkt.vorlageKey ? t(`vorlage.${punkt.vorlageKey}`) : punkt.bezeichnung}
      </span>
      {!punkt.pflicht ? <StatusPill tone="neutral">{t("freiwillig")}</StatusPill> : null}
      {punkt.fristAm ? <StatusPill tone={ueberfaellig ? "danger" : "neutral"}>{tag(punkt.fristAm)}</StatusPill> : null}
      {erledigt ? <StatusPill tone="success">{t("erledigtAm", { datum: tag(punkt.erledigtAm as string) })}</StatusPill> : null}
      {darfAendern ? (
        <span className="flex items-center gap-1.5">
          <CheckpunktUmschaltenKnopf id={punkt.id} erledigt={erledigt} />
          <CheckpunktEntfernenKnopf id={punkt.id} />
        </span>
      ) : null}
    </li>
  );
}

export async function FoerdermittelCheckliste({ dossiers, darfAendern }: { dossiers: readonly FoerderdossierZeile[]; darfAendern: boolean }) {
  const [punkteJeDossier, t, format, dk] = await Promise.all([ladeCheckpunkte(), getTranslations("foerdermittelCheckliste"), getFormatter(), getTranslations("dokument.knopf")]);
  const heute = tagInZone(new Date());
  const tag = (iso: string) => format.dateTime(new Date(`${iso}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });

  return (
    <Section title={t("titel")} description={t("lead")}>
      {dossiers.length === 0 ? <p className="text-xs text-muted-foreground">{t("keineDossiers")}</p> : null}
      <div className="space-y-2">
        {dossiers.map((d) => {
          const punkte = sortiereCheckpunkte(punkteJeDossier[d.id] ?? []);
          const stand = checklistenStand(punkte, heute);
          return (
            <Aufklapper
              key={d.id}
              titel={d.titel}
              beschreibung={
                punkte.length === 0
                  ? t("leer")
                  : `${t("fortschritt", { erledigt: stand.erledigt, gesamt: stand.gesamt, prozent: fortschrittProzent(stand) })}${stand.pflichtOffen > 0 ? ` · ${t("pflichtOffen", { anzahl: stand.pflichtOffen })}` : ""}${stand.ueberfaellig > 0 ? ` · ${t("ueberfaellig", { anzahl: stand.ueberfaellig })}` : ""}`
              }
            >
              <div className="space-y-3 p-4">
                {punkte.length === 0 ? <p className="text-xs text-muted-foreground">{t("vorschlagHinweis")}</p> : null}
                {punkte.length === 0 && darfAendern ? <VorschlagUebernehmenKnopf dossierId={d.id} /> : null}
                <ul className="space-y-1.5">
                  {punkte.map((p) => (
                    <PunktZeile key={p.id} punkt={p} heute={heute} darfAendern={darfAendern} t={t} tag={tag} />
                  ))}
                </ul>
                {stand.vollstaendig ? <p className="text-xs font-semibold text-success">{t("vollstaendig")}</p> : null}
                {darfAendern ? <CheckpunktAnlegenFormular dossierId={d.id} /> : null}
                <DokumentKnopf art="foerderung" parameter={{ dossier: d.id }} label={dk("checkliste")} klein />
              </div>
            </Aufklapper>
          );
        })}
      </div>
    </Section>
  );
}
