import type { ReactNode } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Card, StatusPill, type Tone } from "@/components/ui/kit";
import {
  ReklamationEntscheidungFormular,
  ReklamationInPruefungFormular,
  ReklamationNachrichtFormular,
} from "@/components/db/reklamationen-formulare";
import type { ReklamationDetail } from "@/lib/data/reklamationen";
import {
  istAbschliessbar,
  istOffen,
  istUeberfaellig,
  reklamationStatusMeta,
  type ReklamationsRechte,
  type ReklamationStatus,
} from "@/lib/domain/reklamationen";
import { kuehlErgebnisTon } from "@/components/db/toene";

// Die rechte Spalte der Reklamationsansicht (reklamationen-ansicht.tsx): die
// ausgewählte Reklamation mit Angaben, Rückverfolgung, Bearbeitung und
// Verlauf. Server-Komponenten ohne eigenes Laden: Die Daten und die Rechte
// kommen fertig aus der Ansicht, Texte und Formatierer aus next-intl.

type Formatierer = ReturnType<typeof useFormatter>;

/** Datum und Uhrzeit, ohne Angabe ein Strich. Liste und Detail zeigen Zeitpunkte gleich. */
export function zeitpunkt(format: Formatierer, iso: string | null): string {
  return iso ? format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short" }) : "-";
}

/** Gibt es zur Charge etwas zurückzuverfolgen? Ohne jede Zeile bleibt die Karte weg. */
export function hatRueckverfolgung(detail: ReklamationDetail): boolean {
  return (
    detail.pflueckerListe.length > 0 ||
    detail.kuehlmessungen.length > 0 ||
    detail.transportMessungen.length > 0 ||
    Boolean(detail.nachbarbetrieb)
  );
}

/** Die Karten der gewählten Reklamation: Kopf, Rückverfolgung (nur fürs Büro), Bearbeitung je Status und Recht, Verlauf. */
export function ReklamationDetailKarten({
  detail,
  rechte,
  heuteIso,
}: {
  detail: ReklamationDetail;
  rechte: ReklamationsRechte;
  heuteIso: string;
}) {
  return (
    <>
      <ReklamationKopfKarte detail={detail} heuteIso={heuteIso} />
      {rechte.istBuero && hatRueckverfolgung(detail) ? <RueckverfolgungKarte detail={detail} /> : null}
      <BearbeitungKarten id={detail.id} status={detail.status} rechte={rechte} />
      <VerlaufKarte detail={detail} rechte={rechte} />
    </>
  );
}

function ReklamationKopfKarte({ detail, heuteIso }: { detail: ReklamationDetail; heuteIso: string }) {
  const t = useTranslations("reklamationenAnsicht");
  const st = useTranslations("reklamationStatus");

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <span className="font-mono text-xs font-semibold text-muted-foreground">
            {detail.code}
          </span>
          <p className="mt-0.5 text-sm font-black text-card-foreground">
            {detail.betreff}
          </p>
        </div>
        <StatusPill tone={reklamationStatusMeta[detail.status].tone as Tone}>
          {st(detail.status)}
        </StatusPill>
      </div>

      {detail.beschreibung ? (
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          {detail.beschreibung}
        </p>
      ) : null}

      <ReklamationAngaben detail={detail} heuteIso={heuteIso} />

      {detail.loesung && !istOffen(detail.status) ? (
        <p className="mt-3 rounded-lg border border-border bg-muted/30 p-2.5 text-xs leading-5 text-foreground">
          <span className="font-semibold">{t("loesung")}: </span>
          {detail.loesung}
        </p>
      ) : null}
    </Card>
  );
}

/** Eine Zeile der Angaben: Bezeichnung und Wert, der Wert in der Schriftfarbe `ton`. */
function Angabe({
  titel,
  ton = "text-foreground",
  children,
}: {
  titel: string;
  ton?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <dt className="text-muted-foreground">{titel}</dt>
      <dd className={`font-semibold ${ton}`}>{children}</dd>
    </div>
  );
}

function ReklamationAngaben({ detail, heuteIso }: { detail: ReklamationDetail; heuteIso: string }) {
  const t = useTranslations("reklamationenAnsicht");
  const grundT = useTranslations("reklamationGrund");
  const format = useFormatter();

  return (
    <dl className="mt-3 grid grid-cols-1 gap-x-3 gap-y-2 text-xs sm:grid-cols-2">
      <Angabe titel={t("kunde")}>{detail.kunde}</Angabe>
      <Angabe titel={t("grund")}>{grundT(detail.grund)}</Angabe>
      <Angabe titel={t("charge")}>
        {detail.chargeCode
          ? `${detail.chargeCode}${detail.reihenblock ? ` · ${t("reihenblock")} ${detail.reihenblock}` : ""}`
          : t("ohneCharge")}
      </Angabe>
      {detail.betroffeneMengeKg !== null ? (
        <Angabe titel={t("menge")}>{detail.betroffeneMengeKg} kg</Angabe>
      ) : null}
      <Angabe titel={t("gemeldetAm")}>{zeitpunkt(format, detail.gemeldetAm)}</Angabe>
      {detail.gemeldetVon ? <Angabe titel={t("gemeldetVon")}>{detail.gemeldetVon}</Angabe> : null}
      {istOffen(detail.status) && detail.fristAm ? (
        <Angabe
          titel={t("frist")}
          ton={istUeberfaellig(detail, heuteIso) ? "text-destructive" : "text-foreground"}
        >
          {format.dateTime(new Date(detail.fristAm), { dateStyle: "medium" })}
        </Angabe>
      ) : null}
      {!istOffen(detail.status) ? (
        <Angabe titel={t("erledigtAm")}>{zeitpunkt(format, detail.erledigtAm)}</Angabe>
      ) : null}
      {detail.gutschriftTenge !== null ? (
        <Angabe titel={t("gutschrift")}>{format.number(detail.gutschriftTenge)} ₸</Angabe>
      ) : null}
    </dl>
  );
}

/** Ein Block der Rückverfolgung: Überschrift und Inhalt. */
function RueckverfolgungBlock({
  titel,
  klasse,
  children,
}: {
  titel: string;
  /** Klassen des Inhalts, je nach Block Liste, Zeilen oder ein Text. */
  klasse: string;
  children: ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{titel}</dt>
      <dd className={klasse}>{children}</dd>
    </div>
  );
}

function RueckverfolgungKarte({ detail }: { detail: ReklamationDetail }) {
  const t = useTranslations("reklamationenAnsicht");
  // Wiederverwendung der bestehenden ok/warnung/verstoss-Beschriftungen aus
  // der Nachweiskette statt einer zweiten Übersetzung derselben drei Werte.
  const kkT = useTranslations("nachweiskette");
  const format = useFormatter();

  return (
    <Card className="space-y-3">
      <div>
        <p className="text-sm font-black text-card-foreground">
          {t("rueckverfolgung.titel")}
        </p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {t("rueckverfolgung.lead")}
        </p>
      </div>

      {detail.pflueckerListe.length > 0 ? (
        <RueckverfolgungBlock titel={t("rueckverfolgung.pfluecker")} klasse="mt-1 flex flex-wrap gap-1.5">
          {detail.pflueckerListe.map((p) => (
            <span
              key={p.ausweis}
              className="rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold text-foreground"
            >
              {p.name} · {p.ausweis}
            </span>
          ))}
        </RueckverfolgungBlock>
      ) : null}

      {detail.kuehlmessungen.length > 0 ? (
        <RueckverfolgungBlock titel={t("rueckverfolgung.kuehlkette")} klasse="mt-1 space-y-1">
          {detail.kuehlmessungen.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center gap-1.5 text-xs">
              <StatusPill tone={kuehlErgebnisTon[m.ergebnis] ?? "neutral"}>
                {kkT(`ergebnis.${m.ergebnis}`)}
              </StatusPill>
              <span className="text-foreground">
                {m.minutenSeitPfluecken !== null
                  ? t("rueckverfolgung.minuten", { minuten: m.minutenSeitPfluecken })
                  : t("rueckverfolgung.ohneZeitpunkt")}
              </span>
              <span className="text-muted-foreground">· {zeitpunkt(format, m.gemessenAm)}</span>
            </div>
          ))}
        </RueckverfolgungBlock>
      ) : null}

      {detail.transportMessungen.length > 0 ? (
        <RueckverfolgungBlock titel={t("rueckverfolgung.transport")} klasse="mt-1 space-y-1">
          {detail.transportMessungen.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center gap-1.5 text-xs">
              <StatusPill tone={kuehlErgebnisTon[m.ergebnis] ?? "neutral"}>
                {m.temperaturC} °C · {kkT(`ergebnis.${m.ergebnis}`)}
              </StatusPill>
              <span className="text-muted-foreground">{zeitpunkt(format, m.gemessenAm)}</span>
            </div>
          ))}
        </RueckverfolgungBlock>
      ) : null}

      {detail.nachbarbetrieb ? (
        <RueckverfolgungBlock
          titel={t("rueckverfolgung.nachbarbetrieb")}
          klasse="mt-1 text-xs font-semibold text-foreground"
        >
          {detail.nachbarbetrieb.name}
          {detail.nachbarbetrieb.ort ? ` · ${detail.nachbarbetrieb.ort}` : ""}
        </RueckverfolgungBlock>
      ) : null}
    </Card>
  );
}

/** Kopf der Bearbeitungskarten: Titel und Hinweis auf das Protokoll. */
function AblaufKopf() {
  const t = useTranslations("reklamationenAnsicht");
  return (
    <>
      <p className="text-sm font-black text-card-foreground">{t("ablauf.titel")}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("ablauf.lead")}</p>
    </>
  );
}

function BearbeitungKarten({
  id,
  status,
  rechte,
}: {
  id: string;
  status: ReklamationStatus;
  rechte: ReklamationsRechte;
}) {
  const t = useTranslations("reklamationenAnsicht");

  return (
    <>
      {rechte.darfInPruefungNehmen && status === "offen" ? (
        <Card>
          <AblaufKopf />
          <div className="mt-3">
            <ReklamationInPruefungFormular id={id} />
          </div>
        </Card>
      ) : null}

      {rechte.darfEntscheiden && istAbschliessbar(status) ? (
        <Card className="space-y-3">
          <div>
            <AblaufKopf />
          </div>
          {istOffen(status) ? (
            <ReklamationEntscheidungFormular
              id={id}
              ziel="angenommen"
              label={t("ablauf.annehmenKnopf")}
              mitGutschrift
            />
          ) : null}
          <ReklamationEntscheidungFormular
            id={id}
            ziel="erledigt"
            label={t("ablauf.erledigtKnopf")}
            mitGutschrift
          />
          {istOffen(status) ? (
            <ReklamationEntscheidungFormular
              id={id}
              ziel="abgelehnt"
              label={t("ablauf.ablehnenKnopf")}
              mitGutschrift={false}
            />
          ) : null}
        </Card>
      ) : null}
    </>
  );
}

function VerlaufKarte({ detail, rechte }: { detail: ReklamationDetail; rechte: ReklamationsRechte }) {
  const t = useTranslations("reklamationenAnsicht");
  const format = useFormatter();

  return (
    <Card>
      <p className="text-sm font-black text-card-foreground">{t("verlaufTitel")}</p>
      <div className="mt-3 space-y-2.5">
        {detail.ereignisse.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("verlaufLeer")}</p>
        ) : (
          detail.ereignisse.map((e) => (
            <div key={e.id} className="rounded-lg border border-border p-2.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <span className="font-semibold text-foreground">
                  {e.autor ?? detail.kunde}
                </span>
                <div className="flex items-center gap-1.5">
                  {!e.sichtbarFuerKunde ? (
                    <StatusPill tone="neutral">{t("internMarkierung")}</StatusPill>
                  ) : null}
                  <span className="text-[11px] text-muted-foreground">{zeitpunkt(format, e.erstelltAm)}</span>
                </div>
              </div>
              <p className="mt-1 leading-5 text-foreground">{e.text}</p>
            </div>
          ))
        )}
      </div>
      {rechte.darfAnlegen ? (
        <div className="mt-3 border-t border-border pt-3">
          <ReklamationNachrichtFormular reklamationId={detail.id} istBuero={rechte.istBuero} />
        </div>
      ) : null}
    </Card>
  );
}
