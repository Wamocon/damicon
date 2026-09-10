import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Card, Section, StatusPill, type Tone } from "@/components/ui/kit";
import { DatenquelleBadge } from "@/components/db/datenquelle-badge";
import {
  ReklamationAnlegenFormular,
  ReklamationEntscheidungFormular,
  ReklamationInPruefungFormular,
  ReklamationNachrichtFormular,
} from "@/components/db/reklamationen-formulare";
import {
  ladeB2bKundenOptionen,
  ladeChargenOptionen,
  ladeReklamation,
  ladeReklamationen,
} from "@/lib/data/reklamationen";
import { getSessionProfile } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { reklamationStatusMeta } from "@/lib/domain/reklamationen";

// Dieselbe Zuordnung wie nachweiskette-ansicht.tsx (dort nicht exportiert,
// nur drei Zeilen - eine eigene kleine Kopie ist hier zumutbarer als eine
// gemeinsame Utility fuer eine Drei-Werte-Tabelle.
const ergebnisTon: Record<string, Tone> = {
  ok: "success",
  warnung: "warning",
  verstoss: "danger",
};

// Reklamationsmanagement (WMCNL-1455). Liste + Detail wie bei
// pflueckaufgaben-ansicht.tsx: die Auswahl laeuft ueber die Adresszeile, damit
// die Ansicht serverseitig bleibt und ein Link auf eine Reklamation teilbar
// ist. Wer was sieht, entscheidet RLS (Buero alles, ein Kunde nur die eigene
// Firma) - diese Komponente filtert nicht zusaetzlich selbst.
export async function ReklamationenAnsicht({
  pfad,
  auswahl,
}: {
  pfad: string;
  auswahl?: string;
}) {
  const [liste, profil, t] = await Promise.all([
    ladeReklamationen(),
    getSessionProfile(),
    getTranslations("reklamationenAnsicht"),
  ]);
  const st = await getTranslations("reklamationStatus");
  const grundT = await getTranslations("reklamationGrund");
  // Wiederverwendung der bestehenden ok/warnung/verstoss-Beschriftungen aus
  // der Nachweiskette statt einer zweiten Uebersetzung derselben drei Werte.
  const kkT = await getTranslations("nachweiskette");
  const format = await getFormatter();

  const gewaehlt = liste.reklamationen.find((r) => r.id === auswahl) ?? liste.reklamationen[0];

  const live = liste.quelle === "db";
  // "approve" ist in rbac.ts ausschliesslich den Buero-Rollen vorbehalten -
  // damit laesst sich hier zuverlaessig zwischen Kunde und Buero unterscheiden,
  // ohne die Rolle selbst abzufragen.
  const istBuero = hasPermission(profil?.role, "reklamationen", "approve");
  const darfAnlegen = live && hasPermission(profil?.role, "reklamationen", "create");
  const darfInPruefungNehmen = live && hasPermission(profil?.role, "reklamationen", "update");
  const darfEntscheiden = live && hasPermission(profil?.role, "reklamationen", "approve");

  const [b2bKunden, chargen, detail] = await Promise.all([
    darfAnlegen && istBuero ? ladeB2bKundenOptionen() : Promise.resolve([]),
    darfAnlegen ? ladeChargenOptionen(istBuero ? null : (profil?.b2bKundeId ?? null)) : Promise.resolve([]),
    gewaehlt ? ladeReklamation(gewaehlt.id) : Promise.resolve(null),
  ]);

  const heuteIso = new Date().toISOString().slice(0, 10);
  const istOffen = (statusWert: string) => statusWert === "offen" || statusWert === "in_pruefung";
  const istUeberfaellig = (r: { status: string; fristAm: string | null }) =>
    istOffen(r.status) && !!r.fristAm && r.fristAm < heuteIso;

  const datum = (iso: string | null) =>
    iso ? format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short" }) : "-";

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Section
          title={t("listTitle")}
          description={t("listLead")}
          action={<DatenquelleBadge quelle={liste.quelle} />}
        >
          <div className="space-y-2">
            {liste.reklamationen.length === 0 ? (
              <Card className="text-center text-xs text-muted-foreground">{t("empty")}</Card>
            ) : (
              liste.reklamationen.map((r) => {
                const aktiv = r.id === gewaehlt?.id;
                return (
                  <Link
                    key={r.id}
                    href={{ pathname: pfad, query: { reklamation: r.id } }}
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
                          <StatusPill tone={istUeberfaellig(r) ? "danger" : "neutral"}>
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
                      <span>{datum(r.gemeldetAm)}</span>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </Section>

        <div className="space-y-3">
          {!detail ? (
            <Card className="text-center text-xs text-muted-foreground">{t("detailEmpty")}</Card>
          ) : (
            <>
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

                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                  <div>
                    <dt className="text-muted-foreground">{t("kunde")}</dt>
                    <dd className="font-semibold text-foreground">{detail.kunde}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t("grund")}</dt>
                    <dd className="font-semibold text-foreground">{grundT(detail.grund)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t("charge")}</dt>
                    <dd className="font-semibold text-foreground">
                      {detail.chargeCode
                        ? `${detail.chargeCode}${detail.reihenblock ? ` · ${t("reihenblock")} ${detail.reihenblock}` : ""}`
                        : t("ohneCharge")}
                    </dd>
                  </div>
                  {detail.betroffeneMengeKg !== null ? (
                    <div>
                      <dt className="text-muted-foreground">{t("menge")}</dt>
                      <dd className="font-semibold text-foreground">{detail.betroffeneMengeKg} kg</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="text-muted-foreground">{t("gemeldetAm")}</dt>
                    <dd className="font-semibold text-foreground">{datum(detail.gemeldetAm)}</dd>
                  </div>
                  {detail.gemeldetVon ? (
                    <div>
                      <dt className="text-muted-foreground">{t("gemeldetVon")}</dt>
                      <dd className="font-semibold text-foreground">{detail.gemeldetVon}</dd>
                    </div>
                  ) : null}
                  {istOffen(detail.status) && detail.fristAm ? (
                    <div>
                      <dt className="text-muted-foreground">{t("frist")}</dt>
                      <dd
                        className={`font-semibold ${istUeberfaellig(detail) ? "text-destructive" : "text-foreground"}`}
                      >
                        {format.dateTime(new Date(detail.fristAm), { dateStyle: "medium" })}
                      </dd>
                    </div>
                  ) : null}
                  {!istOffen(detail.status) ? (
                    <div>
                      <dt className="text-muted-foreground">{t("erledigtAm")}</dt>
                      <dd className="font-semibold text-foreground">{datum(detail.erledigtAm)}</dd>
                    </div>
                  ) : null}
                  {detail.gutschriftTenge !== null ? (
                    <div>
                      <dt className="text-muted-foreground">{t("gutschrift")}</dt>
                      <dd className="font-semibold text-foreground">
                        {format.number(detail.gutschriftTenge)} ₸
                      </dd>
                    </div>
                  ) : null}
                </dl>

                {detail.loesung && !istOffen(detail.status) ? (
                  <p className="mt-3 rounded-lg border border-border bg-muted/30 p-2.5 text-xs leading-5 text-foreground">
                    <span className="font-semibold">{t("loesung")}: </span>
                    {detail.loesung}
                  </p>
                ) : null}
              </Card>

              {istBuero &&
              (detail.pflueckerListe.length > 0 ||
                detail.kuehlmessungen.length > 0 ||
                detail.nachbarbetrieb) ? (
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
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        {t("rueckverfolgung.pfluecker")}
                      </dt>
                      <dd className="mt-1 flex flex-wrap gap-1.5">
                        {detail.pflueckerListe.map((p) => (
                          <span
                            key={p.ausweis}
                            className="rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold text-foreground"
                          >
                            {p.name} · {p.ausweis}
                          </span>
                        ))}
                      </dd>
                    </div>
                  ) : null}

                  {detail.kuehlmessungen.length > 0 ? (
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        {t("rueckverfolgung.kuehlkette")}
                      </dt>
                      <dd className="mt-1 space-y-1">
                        {detail.kuehlmessungen.map((m) => (
                          <div key={m.id} className="flex flex-wrap items-center gap-1.5 text-xs">
                            <StatusPill tone={ergebnisTon[m.ergebnis] ?? "neutral"}>
                              {kkT(`ergebnis.${m.ergebnis}`)}
                            </StatusPill>
                            <span className="text-foreground">
                              {m.minutenSeitPfluecken !== null
                                ? t("rueckverfolgung.minuten", { minuten: m.minutenSeitPfluecken })
                                : t("rueckverfolgung.ohneZeitpunkt")}
                            </span>
                            <span className="text-muted-foreground">· {datum(m.gemessenAm)}</span>
                          </div>
                        ))}
                      </dd>
                    </div>
                  ) : null}

                  {detail.nachbarbetrieb ? (
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        {t("rueckverfolgung.nachbarbetrieb")}
                      </dt>
                      <dd className="mt-1 text-xs font-semibold text-foreground">
                        {detail.nachbarbetrieb.name}
                        {detail.nachbarbetrieb.ort ? ` · ${detail.nachbarbetrieb.ort}` : ""}
                      </dd>
                    </div>
                  ) : null}
                </Card>
              ) : null}

              {darfInPruefungNehmen && detail.status === "offen" ? (
                <Card>
                  <p className="text-sm font-black text-card-foreground">{t("ablauf.titel")}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("ablauf.lead")}</p>
                  <div className="mt-3">
                    <ReklamationInPruefungFormular id={detail.id} />
                  </div>
                </Card>
              ) : null}

              {darfEntscheiden && istOffen(detail.status) ? (
                <Card className="space-y-3">
                  <div>
                    <p className="text-sm font-black text-card-foreground">{t("ablauf.titel")}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("ablauf.lead")}</p>
                  </div>
                  <ReklamationEntscheidungFormular
                    id={detail.id}
                    ziel="angenommen"
                    label={t("ablauf.annehmenKnopf")}
                    mitGutschrift
                  />
                  <ReklamationEntscheidungFormular
                    id={detail.id}
                    ziel="erledigt"
                    label={t("ablauf.erledigtKnopf")}
                    mitGutschrift
                  />
                  <ReklamationEntscheidungFormular
                    id={detail.id}
                    ziel="abgelehnt"
                    label={t("ablauf.ablehnenKnopf")}
                    mitGutschrift={false}
                  />
                </Card>
              ) : null}

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
                            <span className="text-[11px] text-muted-foreground">{datum(e.erstelltAm)}</span>
                          </div>
                        </div>
                        <p className="mt-1 leading-5 text-foreground">{e.text}</p>
                      </div>
                    ))
                  )}
                </div>
                {darfAnlegen ? (
                  <div className="mt-3 border-t border-border pt-3">
                    <ReklamationNachrichtFormular reklamationId={detail.id} istBuero={istBuero} />
                  </div>
                ) : null}
              </Card>
            </>
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
