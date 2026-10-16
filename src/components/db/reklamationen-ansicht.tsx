import { getTranslations } from "next-intl/server";
import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Card, Section, StatusPill, type Tone } from "@/components/ui/kit";
import { DatenquelleBadge } from "@/components/db/datenquelle-badge";
import { ReklamationAnlegenFormular } from "@/components/db/reklamationen-formulare";
import { ReklamationDetailKarten, zeitpunkt } from "@/components/db/reklamation-detail";
import {
  ladeB2bKundenOptionen,
  ladeChargenOptionen,
  ladeReklamation,
  ladeReklamationen,
  type ReklamationListenEintrag,
} from "@/lib/data/reklamationen";
import { getSessionProfile } from "@/lib/auth";
import {
  istOffen,
  istUeberfaellig,
  reklamationsRechte,
  reklamationStatusMeta,
} from "@/lib/domain/reklamationen";
import { Blaettern, LeererZustand } from "@/components/ui/liste";
import { formularZiel } from "@/lib/formular-ziele";

// Reklamationsmanagement (WMCNL-1455). Liste und Detail wie bei
// pflueckaufgaben-ansicht.tsx: Die Auswahl läuft über die Adresszeile, damit
// die Ansicht serverseitig bleibt und ein Link auf eine Reklamation teilbar
// ist. Wer was sieht, entscheidet RLS (Büro alles, ein Kunde nur die eigene
// Firma). Diese Komponente filtert nicht zusätzlich selbst. Die rechte Spalte
// mit dem Detail steht in reklamation-detail.tsx, die Rechte und Statusregeln
// in lib/domain/reklamationen.ts.
export async function ReklamationenAnsicht({
  pfad,
  auswahl,
  rseite,
}: {
  pfad: string;
  auswahl?: string;
  /** Seite der Liste aus der Adresse (rseite); unlesbar heisst Seite 1. */
  rseite?: string;
}) {
  const [liste, profil, t] = await Promise.all([
    ladeReklamationen(Number(rseite) || 1),
    getSessionProfile(),
    getTranslations("reklamationenAnsicht"),
  ]);

  const gewaehlt = liste.reklamationen.find((r) => r.id === auswahl) ?? liste.reklamationen[0];
  // Ein geteilter Link auf eine Reklamation, die nicht auf der angezeigten Seite steht, oeffnet trotzdem ihr Detail (die Liste springt nicht mit).
  const detailId = !liste.reklamationen.some((r) => r.id === auswahl) && liste.seiten > 1 && auswahl ? auswahl : gewaehlt?.id;

  const rechte = reklamationsRechte(profil?.role, liste.quelle === "db");
  const { istBuero, darfAnlegen } = rechte;

  const [b2bKunden, chargen, detail] = await Promise.all([
    darfAnlegen && istBuero ? ladeB2bKundenOptionen() : Promise.resolve([]),
    darfAnlegen ? ladeChargenOptionen(istBuero ? null : (profil?.b2bKundeId ?? null)) : Promise.resolve([]),
    detailId ? ladeReklamation(detailId) : Promise.resolve(null),
  ]);

  const heuteIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Section
          id="liste"
          title={t("listTitle")}
          description={t("listLead")}
          action={<DatenquelleBadge quelle={liste.quelle} />}
        >
          <div className="space-y-2">
            {liste.reklamationen.length === 0 ? (
              <LeererZustand
                titel={t("empty")}
                modul="reklamationen"
                anlegen={
                  darfAnlegen
                    ? { ziel: formularZiel.reklamation, label: t("formular.anlegen.titel") }
                    : undefined
                }
              />
            ) : (
              liste.reklamationen.map((r) => (
                <ReklamationsEintrag
                  key={r.id}
                  r={r}
                  aktiv={r.id === gewaehlt?.id}
                  pfad={pfad}
                  seite={liste.seite}
                  istBuero={istBuero}
                  heuteIso={heuteIso}
                />
              ))
            )}
          </div>
          <Blaettern
            seite={liste.seite}
            seiten={liste.seiten}
            ziel={(s) => ({ pathname: pfad, query: s > 1 ? { rseite: String(s) } : {}, hash: "liste" })}
          />
        </Section>

        <div className="space-y-3">
          {!detail ? (
            <LeererZustand titel={t("detailEmpty")} modul="reklamationen" />
          ) : (
            <ReklamationDetailKarten detail={detail} rechte={rechte} heuteIso={heuteIso} />
          )}

          <Card className="bg-muted/30 text-xs leading-5 text-muted-foreground">{t("note")}</Card>
        </div>
      </div>

      {darfAnlegen ? (
        <ReklamationAnlegenFormular
          istBuero={istBuero}
          b2bKunden={b2bKunden.map((k) => ({ wert: k.id, text: k.label }))}
          chargen={chargen.map((c) => ({ wert: c.id, text: c.label }))}
        />
      ) : null}
    </div>
  );
}

/** Ein Eintrag der Liste, verlinkt über die Adresszeile. */
function ReklamationsEintrag({
  r,
  aktiv,
  pfad,
  seite,
  istBuero,
  heuteIso,
}: {
  r: ReklamationListenEintrag;
  aktiv: boolean;
  pfad: string;
  /** Die angezeigte Seite bleibt beim Oeffnen eines Eintrags stehen. */
  seite: number;
  istBuero: boolean;
  heuteIso: string;
}) {
  const t = useTranslations("reklamationenAnsicht");
  const st = useTranslations("reklamationStatus");
  const grundT = useTranslations("reklamationGrund");
  const format = useFormatter();

  return (
    <Link
      href={{ pathname: pfad, query: seite > 1 ? { reklamation: r.id, rseite: String(seite) } : { reklamation: r.id } }}
      scroll={false}
      className={`block w-full rounded-xl border p-4 text-left transition ${
        aktiv
          ? "border-primary bg-primary/5"
          : "border-border bg-card hover:border-primary/40"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-xs font-semibold text-foreground">
          {r.code}
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {istOffen(r.status) && r.fristAm ? (
            <StatusPill tone={istUeberfaellig(r, heuteIso) ? "danger" : "neutral"}>
              {t("frist")}: {format.dateTime(new Date(r.fristAm), { dateStyle: "short" })}
            </StatusPill>
          ) : null}
          <StatusPill tone={reklamationStatusMeta[r.status].tone as Tone}>
            {st(r.status)}
          </StatusPill>
        </div>
      </div>
      <p className="mt-1 text-sm font-semibold text-card-foreground">
        {istBuero ? `${r.kunde} · ` : ""}
        {r.betreff}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>{grundT(r.grund)}</span>
        {r.chargeCode ? <span>{t("charge")} {r.chargeCode}</span> : null}
        <span>{zeitpunkt(format, r.gemeldetAm)}</span>
      </div>
    </Link>
  );
}
