"use client";

import { startTransition, useActionState, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Card, StatusPill } from "@/components/ui/kit";
import { AktionsMeldung, Auswahl, Feld, FormularKarte, PfadFeld, SubmitKnopf } from "@/components/db/formular-kit";
import {
  wissenDokumenteLaden,
  wissenDokumentHochladen,
  wissenDokumentLoeschen,
  wissenDokumentPruefen,
  wissenDokumentVorschau,
  wissenDokumenteSammelPruefen,
  type SammelErgebnis,
} from "@/lib/actions/wissen";
import { leer, type AktionsStatus } from "@/lib/actions/status";
import { ohneEinordnung, type WissenDokumentZeile } from "@/lib/wissen/dokumente-liste";
import { stufeSchluessel } from "@/lib/wissen/belege";
import { CLUSTER, clusterPasst, istCluster, istQuellenart, nutzungFuer, QUELLENART_INFO, QUELLENARTEN, TEXTGRUNDLAGEN, typischerClusterVon, type Cluster } from "@/lib/wissen/quellenart";
import { WissenBestandEinordnen } from "@/components/db/wissen-einordnen";
import { WissenBuecher } from "@/components/db/wissen-buecher";
import { WissenUmordnenKnopf } from "@/components/db/wissen-umordnen";
import { linkBrauchbar, schaetzeEin, type Einschaetzung } from "@/lib/wissen/einschaetzung";
import { bereichSchluessel, MAX_DATEI_BYTES, UPLOAD_BEREICHE, UPLOAD_ROLLEN } from "@/lib/wissen/upload-konstanten";

// Wissensverwaltung: Seite "Wissensbasis" im Bereich Administration (/dashboard/administration/wissensbasis). Admin-only:
// Die Seite antwortet ohne ki_assistent:manage mit 404, und alle Server Actions pruefen die Berechtigung noch einmal selbst.
// Die Liste wird erst beim Oeffnen der Ansicht geladen (nicht im Layout): Sie liest alle Textstellen der Wissensbasis.
//
// Vier-Augen-Prinzip: Ein Upload wartet auf die Freigabe durch eine ZWEITE Person. Wer hochgeladen hat, sieht den Hinweis
// "wartet", alle anderen Admins den Knopf "Pruefen" mit dem Anfang des Textes. Den Zwang setzen Server und Datenbank durch,
// nicht diese Oberflaeche.

export function WissenVerwaltung() {
  const t = useTranslations("kiAssistentAnsicht.wissensVerwaltung");
  const [dokumente, setDokumente] = useState<WissenDokumentZeile[] | null>(null);
  const [ichId, setIchId] = useState<string | null>(null);
  const [ladefehler, setLadefehler] = useState(false);
  const [fehlerDetail, setFehlerDetail] = useState<string | null>(null);
  const [abgeschnitten, setAbgeschnitten] = useState(false);
  const [aktionsMeldung, setAktionsMeldung] = useState<AktionsStatus>(leer);
  const [filter, setFilter] = useState<ListenFilter>("alle");
  const [gewaehlt, setGewaehlt] = useState<ReadonlySet<string>>(new Set());
  const [, starte] = useTransition();

  const lade = useCallback(() => {
    starte(async () => {
      const antwort = await wissenDokumenteLaden();
      setDokumente(antwort.dokumente);
      setLadefehler(antwort.fehler);
      setFehlerDetail(antwort.fehlerDetail ?? null);
      setAbgeschnitten(antwort.abgeschnitten);
      setIchId(antwort.ichId);
      // Was nicht mehr wartet, bleibt nicht ausgewaehlt.
      setGewaehlt(new Set());
    });
  }, []);

  useEffect(() => {
    lade();
  }, [lade]);

  const sichtbar = (dokumente ?? []).filter((d) => passtZumFilter(d, filter));
  const pruefbar = (dokumente ?? []).filter((d) => kannIchPruefen(d, ichId));
  const schalte = (schluessel: string) =>
    setGewaehlt((alt) => {
      const neu = new Set(alt);
      if (!neu.delete(schluessel)) neu.add(schluessel);
      return neu;
    });

  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-4 text-muted-foreground">{t("lead")}</p>
      <WissenHochladenFormular beiErfolg={lade} />
      <WissenBuecher beiFertig={lade} />
      {dokumente && !ladefehler && dokumente.some(ohneEinordnung) ? <WissenBestandEinordnen dokumente={dokumente} beiFertig={lade} /> : null}
      <div>
        <p className="mb-2 text-[11px] font-semibold text-card-foreground">{t("liste.titel")}</p>
        <AktionsMeldung status={aktionsMeldung} />
        {abgeschnitten ? <p role="status" className="mb-2 text-[11px] font-semibold text-destructive">{t("liste.abgeschnitten")}</p> : null}
        {ladefehler ? (
          <Card className="space-y-1 text-center text-xs text-destructive">
            <p>{t("liste.fehler")}</p>
            {/* Nur Administration sieht diese Seite. Die Angabe nennt Schema und Datenbankmeldung, damit die Ursache ohne Server-Log erkennbar ist. */}
            {fehlerDetail ? (
              <p className="break-words font-mono text-[11px] text-muted-foreground">
                {t("liste.fehlerDetail")}: {fehlerDetail}
              </p>
            ) : null}
          </Card>
        ) : dokumente === null ? (
          <Card className="text-center text-xs text-muted-foreground">{t("liste.laedt")}</Card>
        ) : dokumente.length === 0 ? (
          <Card className="text-center text-xs text-muted-foreground">{t("liste.leer")}</Card>
        ) : (
          <>
            <ClusterFilter dokumente={dokumente} filter={filter} beiAuswahl={setFilter} />
            {/* Immer eingehaengt: Das Ergebnisfenster der Sammelpruefung soll nach dem Neuladen stehen bleiben, auch wenn danach nichts mehr wartet. */}
            <WissenSammelLeiste
              pruefbar={pruefbar}
              gewaehlt={gewaehlt}
              beiAuswahl={setGewaehlt}
              beiFertig={(status) => {
                setAktionsMeldung(status);
                lade();
              }}
            />
            {sichtbar.length === 0 ? (
              <Card className="text-center text-xs text-muted-foreground">{t("liste.keineTreffer")}</Card>
            ) : (
              <ul className="space-y-2">
                {sichtbar.map((d) => (
                  <WissenDokumentKarte
                    key={d.schluessel}
                    dokument={d}
                    ichId={ichId}
                    gewaehlt={gewaehlt.has(d.schluessel)}
                    beiWahl={() => schalte(d.schluessel)}
                    beiErgebnis={(status) => {
                      setAktionsMeldung(status);
                      lade();
                    }}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Filter der Liste: alles, ein Cluster oder der Bestand ohne Einordnung. Die Zaehler stehen an den Knoepfen, damit man
// sieht, wie viel der Wissensbasis schon eingeordnet ist (Bestand aus der Zeit vor der Typisierung hat keine Quellenart).
type ListenFilter = "alle" | Cluster | "ohne";

function passtZumFilter(dokument: WissenDokumentZeile, filter: ListenFilter): boolean {
  if (filter === "alle") return true;
  return filter === "ohne" ? ohneEinordnung(dokument) : dokument.cluster === filter;
}

function ClusterFilter({
  dokumente,
  filter,
  beiAuswahl,
}: {
  dokumente: WissenDokumentZeile[];
  filter: ListenFilter;
  beiAuswahl: (filter: ListenFilter) => void;
}) {
  const t = useTranslations("kiAssistentAnsicht.wissensVerwaltung");
  const tCluster = useTranslations("kiAssistentAnsicht.wissensVerwaltung.cluster");
  const anzahl = (f: ListenFilter) => dokumente.filter((d) => passtZumFilter(d, f)).length;
  const eintraege: { wert: ListenFilter; text: string }[] = [
    { wert: "alle", text: t("liste.filterAlle") },
    ...CLUSTER.map((c) => ({ wert: c as ListenFilter, text: tCluster(c) })),
    { wert: "ohne", text: t("liste.ohneEinordnung") },
  ];

  return (
    <div className="mb-2 space-y-1.5">
      <div role="group" aria-label={t("liste.filter")} className="flex flex-wrap gap-1.5">
        {eintraege.map((e) => {
          const aktiv = filter === e.wert;
          return (
            <button
              key={e.wert}
              type="button"
              aria-pressed={aktiv}
              onClick={() => beiAuswahl(e.wert)}
              className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold transition ${
                aktiv ? "border-primary bg-primary text-primary-foreground" : "border-border text-card-foreground hover:border-primary/50"
              }`}
            >
              {e.text}
              <span className={`tabular-nums ${aktiv ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{anzahl(e.wert)}</span>
            </button>
          );
        })}
      </div>
      {anzahl("ohne") > 0 ? <p className="text-[11px] leading-4 text-muted-foreground">{t("liste.ohneEinordnungHinweis")}</p> : null}
    </div>
  );
}

/** Eine zweite Person darf pruefen: das Dokument wartet, stammt nicht von mir und ist vollstaendig. Der Server prueft dasselbe noch einmal. */
function kannIchPruefen(d: WissenDokumentZeile, ichId: string | null): boolean {
  return d.herkunft === "upload" && !!ichId && d.hochgeladenVonId !== ichId && !d.unvollstaendig && d.pruefstatus === "ungeprueft";
}

function WissenDokumentKarte({
  dokument,
  ichId,
  gewaehlt,
  beiWahl,
  beiErgebnis,
}: {
  dokument: WissenDokumentZeile;
  ichId: string | null;
  gewaehlt: boolean;
  beiWahl: () => void;
  beiErgebnis: (status: AktionsStatus) => void;
}) {
  const t = useTranslations("kiAssistentAnsicht.wissensVerwaltung");
  const tRolle = useTranslations("roles");
  const tStufe = useTranslations("kiAssistentAnsicht.quellen.stufe");
  const format = useFormatter();
  const datum = dokument.datum && !Number.isNaN(Date.parse(dokument.datum))
    ? format.dateTime(new Date(dokument.datum), { dateStyle: "medium" })
    : t("liste.keinDatum");
  // Gespeichert ist "legal", angezeigt wird die Bezeichnung "Recht".
  const bereichKey = bereichSchluessel(dokument.bereich);
  const bereichName = (UPLOAD_BEREICHE as readonly string[]).includes(bereichKey)
    ? t(`bereich.${bereichKey}` as never)
    : dokument.bereich || t("liste.keinBereich");
  const artName = istQuellenart(dokument.quellenart) ? t(`quellenart.${dokument.quellenart}` as never) : null;
  const cluster = dokument.cluster;
  const clusterName = cluster ? t(`cluster.${cluster}` as never) : null;
  const stufeName = dokument.stufe !== null ? tStufe(stufeSchluessel(dokument.stufe)) : null;
  const ersterEintrag = dokument.herkunft === "upload";
  const eigener = !!ichId && dokument.hochgeladenVonId === ichId;
  const wartetAufMich = !eigener && !dokument.unvollstaendig && (dokument.pruefstatus === "ungeprueft" || dokument.abgelaufen);
  const waehlbar = kannIchPruefen(dokument, ichId);
  const tGuete = useTranslations("kiAssistentAnsicht.wissensVerwaltung.guete");
  const einschaetzung = ersterEintrag && dokument.pruefstatus === "ungeprueft" ? schaetzeEin(dokument) : null;
  const wartetAufAndere = eigener && (dokument.pruefstatus === "ungeprueft" || dokument.abgelaufen);
  const status = dokument.pruefstatus === "ungeprueft" ? "ungeprueft" : dokument.pruefstatus === "abgelehnt" ? "abgelehnt" : dokument.abgelaufen ? "abgelaufen" : "freigegeben";

  return (
    <li>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="flex min-w-0 items-start gap-2 break-words text-sm font-black text-card-foreground">
            {waehlbar ? <input type="checkbox" checked={gewaehlt} onChange={beiWahl} aria-label={t("sammel.waehlen", { titel: dokument.titel })} className="mt-1 shrink-0" /> : null}
            <span className="min-w-0">{dokument.titel}</span>
          </p>
          <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
            <StatusPill tone="info">{bereichName}</StatusPill>
            <StatusPill tone={dokument.herkunft === "upload" ? "success" : "neutral"}>{t(`herkunft.${dokument.herkunft}`)}</StatusPill>
            {ohneEinordnung(dokument) ? <StatusPill tone="warning">{t("liste.ohneEinordnung")}</StatusPill> : null}
            {clusterName ? <StatusPill tone="neutral">{clusterName}</StatusPill> : null}
            {artName ? <StatusPill tone="neutral">{artName}</StatusPill> : null}
            {dokument.nutzung === "hinweis" ? <StatusPill tone="warning">{t("nutzung.hinweis")}</StatusPill> : null}
            {dokument.nutzung === "notfalls" ? <StatusPill tone="danger">{t("nutzung.notfalls")}</StatusPill> : null}
            {dokument.unvollstaendig ? <StatusPill tone="danger">{t("liste.unvollstaendig")}</StatusPill> : null}
            {dokument.guete ? (
              <StatusPill tone={dokument.guete === "gut" ? "success" : dokument.guete === "pruefen" ? "warning" : "danger"}>{tGuete(`note.${dokument.guete}` as never)}</StatusPill>
            ) : null}
            {einschaetzung ? <StatusPill tone={EMPFEHLUNG_TON[einschaetzung.empfehlung]}>{t(`einschaetzung.empfehlung.${einschaetzung.empfehlung}` as never)}</StatusPill> : null}
            {ersterEintrag ? (
              <StatusPill tone={status === "freigegeben" ? "success" : status === "abgelehnt" ? "danger" : "warning"}>{t(`status.${status}`)}</StatusPill>
            ) : null}
          </div>
        </div>
        <dl className="mt-2 grid gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground sm:grid-cols-2">
          {/* Die Einordnung steht immer da, auch beim Bestand ohne Typisierung: dort als "nicht eingeordnet", mit der Stufe, die er hat. */}
          <div className="sm:col-span-2">
            <dt className="inline font-semibold">{t("liste.einordnung")}: </dt>
            <dd className="inline">
              {artName && clusterName ? `${artName}, ${clusterName}` : artName ? artName : t("liste.ohneEinordnung")}
              {dokument.stufe !== null ? `, ${t("liste.stufe")} ${dokument.stufe} (${stufeName})` : ""}
            </dd>
          </div>
          <div>
            <dt className="inline font-semibold">{t("liste.rollen")}: </dt>
            <dd className="inline">{dokument.rollen.map((r) => tRolle(r as never)).join(", ") || "-"}</dd>
          </div>
          <div>
            <dt className="inline font-semibold">{t("liste.datum")}: </dt>
            <dd className="inline">{datum}</dd>
          </div>
          <div>
            <dt className="inline font-semibold">{t("liste.von")}: </dt>
            <dd className="inline">{dokument.hochgeladenVon ?? t("liste.vonSkript")}</dd>
          </div>
          <div>
            <dt className="inline font-semibold">{t("liste.abschnitte")}: </dt>
            <dd className="inline">{dokument.chunks}</dd>
          </div>
          {dokument.pruefenBis ? (
            <div>
              <dt className="inline font-semibold">{t("liste.pruefenBis")}: </dt>
              <dd className="inline">{format.dateTime(new Date(dokument.pruefenBis), { dateStyle: "medium" })}</dd>
            </div>
          ) : null}
          {dokument.url ? (
            <div className="sm:col-span-2">
              <dt className="inline font-semibold">{t("liste.link")}: </dt>
              <dd className="inline break-all">
                <QuellenLink url={dokument.url} />
              </dd>
            </div>
          ) : null}
        </dl>
        {dokument.unvollstaendig ? (
          <p role="alert" className="mt-2 text-[11px] font-semibold text-destructive">
            {t("liste.unvollstaendigHinweis", { da: dokument.paketeDa, gesamt: dokument.paketeGesamt ?? 0 })}
          </p>
        ) : null}
        {dokument.gueteHinweise.length > 0 ? (
          <p className="mt-2 text-[11px] text-muted-foreground">{dokument.gueteHinweise.map((h) => tGuete(`hinweis.${h}` as never)).join(" ")}</p>
        ) : null}
        {einschaetzung ? <EinschaetzungGruende einschaetzung={einschaetzung} /> : null}
        {wartetAufAndere ? <p className="mt-2 text-[11px] font-semibold text-warning">{t("liste.wartet")}</p> : null}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-2.5 empty:hidden">
          <WissenUmordnenKnopf dokument={dokument} ichId={ichId} beiErgebnis={beiErgebnis} />
          {wartetAufMich ? <WissenPruefenKnopf dokument={dokument} bereichName={bereichName} artName={artName} beiErgebnis={beiErgebnis} /> : null}
          {/* Nur Uploads sind loeschbar. Skript-Dokumente haben keinen Knopf (und der Server lehnt sie ohnehin ab). */}
          {dokument.loeschbar ? <WissenLoeschenKnopf dokument={dokument} bereichName={bereichName} beiErgebnis={beiErgebnis} /> : null}
        </div>
      </Card>
    </li>
  );
}

interface Eingaben {
  titel: string;
  bereich: string;
  /** Nur zur Auswahl der Quellenart; gespeichert wird allein die Quellenart, der Cluster folgt aus ihr. */
  cluster: string;
  quellenart: string;
  textgrundlage: string;
  url: string;
  rollen: string[];
}
const LEERE_EINGABEN: Eingaben = { titel: "", bereich: "", cluster: "", quellenart: "", textgrundlage: "original", url: "", rollen: [] };

function WissenHochladenFormular({ beiErfolg }: { beiErfolg: () => void }) {
  const t = useTranslations("kiAssistentAnsicht.wissensVerwaltung.formular");
  const tBereich = useTranslations("kiAssistentAnsicht.wissensVerwaltung.bereich");
  const tArt = useTranslations("kiAssistentAnsicht.wissensVerwaltung.quellenart");
  const tBeispiel = useTranslations("kiAssistentAnsicht.wissensVerwaltung.beispiel");
  const tCluster = useTranslations("kiAssistentAnsicht.wissensVerwaltung.cluster");
  const tClusterBeispiel = useTranslations("kiAssistentAnsicht.wissensVerwaltung.clusterBeispiel");
  const tText = useTranslations("kiAssistentAnsicht.wissensVerwaltung.textgrundlage");
  const tRolle = useTranslations("roles");
  const tAktion = useTranslations("aktionen");
  // Alle Eingaben (ausser der Datei) liegen im Zustand, nicht im Formular: React setzt ein Formular nach jeder Aktion
  // zurueck, auch nach einem Fehler. So bleiben Titel, Bereich, Quellenart und Rollen stehen (nur die Datei muss neu
  // gewaehlt werden) und werden nach einem Erfolg geleert.
  const [werte, setWerte] = useState<Eingaben>(LEERE_EINGABEN);
  const aendere = (teil: Partial<Eingaben>) => setWerte((alt) => ({ ...alt, ...teil }));
  const [status, action] = useActionState(async (vorher: AktionsStatus, formData: FormData) => {
    const antwort = await wissenDokumentHochladen(vorher, formData);
    if (antwort.stand === "ok") startTransition(() => setWerte(LEERE_EINGABEN));
    return antwort;
  }, leer);
  const zuletzt = useRef(status);

  // Nach einem erfolgreichen Upload die Liste neu laden (einmal je Rueckmeldung).
  useEffect(() => {
    if (status !== zuletzt.current && status.stand === "ok") beiErfolg();
    zuletzt.current = status;
  }, [status, beiErfolg]);

  const art = istQuellenart(werte.quellenart) ? werte.quellenart : null;
  const nutzung = art && werte.bereich ? nutzungFuer(werte.bereich, art) : "ja";
  const cluster = istCluster(werte.cluster) ? werte.cluster : null;

  return (
    <FormularKarte titel={t("titel")} beschreibung={t("lead")}>
      <form action={action} className="grid gap-2.5 sm:grid-cols-2">
        <PfadFeld />
        <label className="block space-y-1 sm:col-span-2">
          <span className="text-[11px] font-semibold text-card-foreground">{t("datei")}</span>
          <input
            type="file"
            name="datei"
            required
            accept=".pdf,.md,.txt,application/pdf,text/markdown,text/plain"
            // Eine zu grosse Datei wird schon hier gestoppt (Meldung des Browsers beim Absenden): Ueber dem Limit der Server
            // Actions antwortet der Server nicht mit einer Meldung, sondern mit HTTP 500.
            onChange={(e) => {
              const datei = e.currentTarget.files?.[0];
              e.currentTarget.setCustomValidity(datei && datei.size > MAX_DATEI_BYTES ? tAktion("fehler.zuGross") : "");
            }}
            className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground file:mr-2 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs file:font-semibold file:text-foreground"
          />
          <span className="block text-[11px] text-muted-foreground">{t("dateiHinweis")}</span>
        </label>
        <Feld label={t("titelFeld")} name="titel" required placeholder={t("titelPlatzhalter")} value={werte.titel} onChange={(titel) => aendere({ titel })} />
        <Auswahl
          label={t("bereich")}
          name="bereich"
          required
          value={werte.bereich}
          // Wechselt der Bereich auf einen, in dem die gewaehlte Quellenart nicht zulaessig ist, wird die Art zurueckgesetzt.
          onChange={(bereich) => aendere({ bereich, quellenart: nutzungFuer(bereich, werte.quellenart) === "nein" ? "" : werte.quellenart })}
          options={[
            { wert: "", text: t("bitteWaehlen") },
            ...UPLOAD_BEREICHE.map((b) => ({ wert: b, text: tBereich(b) })),
          ]}
        />
        {/* Cluster (der Weg) und Quellenart (die Art des Textes) sind zwei Achsen: Ein Gesetz von einer Regierungsseite ist eine
            Rechtsnorm aus dem Internet. Nur eine Art, die schon ihrer Natur nach aus dem Netz stammt, schliesst die anderen
            Cluster aus. Waehlt man zuerst die Art, bekommt der Cluster ihren typischen Wert vorgeschlagen. */}
        <div className="space-y-1">
          <Auswahl
            label={t("cluster")}
            name="cluster"
            required
            value={werte.cluster}
            onChange={(neu) => aendere({ cluster: neu, quellenart: art && istCluster(neu) && !clusterPasst(art, neu) ? "" : werte.quellenart })}
            options={[{ wert: "", text: t("bitteWaehlen") }, ...CLUSTER.map((c) => ({ wert: c, text: tCluster(c) }))]}
          />
          {cluster ? <span className="block text-[11px] text-muted-foreground">{tClusterBeispiel(cluster)}</span> : null}
        </div>
        <div className="space-y-1">
          <Auswahl
            label={t("quellenart")}
            name="quellenart"
            required
            value={werte.quellenart}
            onChange={(neu) => {
              // Ohne Cluster oder mit einem, der zur Art nicht passt, bekommt der Cluster den typischen Wert der Art.
              const typisch = typischerClusterVon(neu);
              const passt = istQuellenart(neu) && istCluster(werte.cluster) && clusterPasst(neu, werte.cluster);
              aendere({ quellenart: neu, cluster: passt ? werte.cluster : (typisch ?? werte.cluster) });
            }}
            options={[
              { wert: "", text: t("bitteWaehlen") },
              ...QUELLENARTEN.map((a) => {
                const gesperrt = !!werte.bereich && nutzungFuer(werte.bereich, a) === "nein";
                const passtNicht = !!cluster && !clusterPasst(a, cluster);
                return {
                  wert: a,
                  text: `${tArt(a)} (${gesperrt ? t("nichtZulaessig") : tBeispiel(a)})`,
                  disabled: gesperrt || passtNicht,
                };
              }),
            ]}
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <span className="block text-[11px] text-muted-foreground">
            {t("clusterHinweis")} {t("clusterZwang")} {t("quellenartHinweis")}
          </span>
          {art ? (
            <span className={`block text-[11px] ${nutzung === "hinweis" || nutzung === "notfalls" ? "font-semibold text-warning" : "text-muted-foreground"}`}>
              {nutzung === "notfalls" ? t("nutzungNotfalls") : nutzung === "hinweis" ? t("nutzungHinweis") : t("stufeInfo", { stufe: QUELLENART_INFO[art].stufe })}
            </span>
          ) : null}
        </div>
        <Auswahl
          label={t("textgrundlage")}
          name="textgrundlage"
          value={werte.textgrundlage}
          onChange={(textgrundlage) => aendere({ textgrundlage })}
          options={TEXTGRUNDLAGEN.map((g) => ({ wert: g, text: tText(g) }))}
        />
        <div className="space-y-1">
          <Feld
            label={t("url")}
            name="quelle_url"
            type="url"
            required={!!art && QUELLENART_INFO[art].urlPflicht}
            placeholder="https://"
            value={werte.url}
            onChange={(url) => aendere({ url })}
          />
          <span className="block text-[11px] text-muted-foreground">{t("urlHinweis")}</span>
        </div>
        <fieldset className="space-y-1 sm:col-span-2">
          <legend className="text-[11px] font-semibold text-card-foreground">{t("rollen")}</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {UPLOAD_ROLLEN.map((rolle) => (
              <label key={rolle} className="inline-flex items-center gap-1.5 text-xs text-card-foreground">
                {rolle === "admin" ? (
                  // Der Admin ist immer dabei: ein deaktiviertes Feld wird nicht gesendet, der Server ergaenzt ihn.
                  <input type="checkbox" checked disabled aria-describedby="wissen-admin-immer" />
                ) : (
                  <input
                    type="checkbox"
                    name="rollen"
                    value={rolle}
                    checked={werte.rollen.includes(rolle)}
                    onChange={(e) => aendere({ rollen: e.target.checked ? [...werte.rollen, rolle] : werte.rollen.filter((r) => r !== rolle) })}
                  />
                )}
                {tRolle(rolle)}
              </label>
            ))}
          </div>
          <span id="wissen-admin-immer" className="block text-[11px] text-muted-foreground">
            {t("adminImmer")}
          </span>
        </fieldset>
        <p className="text-[11px] font-semibold text-muted-foreground sm:col-span-2">{t("freigabeHinweis")}</p>
        <div className="flex items-end sm:col-span-2">
          <SubmitKnopf label={t("knopf")} status={status} />
        </div>
        <div className="sm:col-span-2">
          <AktionsMeldung status={status} />
        </div>
      </form>
    </FormularKarte>
  );
}

// Pruefen mit Bestaetigungsfenster (natives <dialog>, modal). Zeigt, was freigegeben wird: Titel, Bereich, Quellenart,
// Link, Rollen und den Anfang des Textes. Dafuer ist die Vorschau da: Wer freigibt, soll gelesen haben, was er freigibt.
function WissenPruefenKnopf({
  dokument,
  bereichName,
  artName,
  beiErgebnis,
}: {
  dokument: WissenDokumentZeile;
  bereichName: string;
  artName: string | null;
  beiErgebnis: (status: AktionsStatus) => void;
}) {
  const t = useTranslations("kiAssistentAnsicht.wissensVerwaltung");
  const tRolle = useTranslations("roles");
  const [status, action, laeuft] = useActionState(wissenDokumentPruefen, leer);
  const dialog = useRef<HTMLDialogElement>(null);
  const zuletzt = useRef(status);
  const [vorschau, setVorschau] = useState<"laedt" | { text: string; fehler: boolean } | null>(null);
  const erneut = dokument.pruefstatus === "freigegeben";

  // Nach der Antwort (Erfolg oder Fehler): Fenster zu, Meldung und Neuladen beim Eltern-Element.
  useEffect(() => {
    if (status !== zuletzt.current && status.stand !== "leer") {
      dialog.current?.close();
      beiErgebnis(status);
    }
    zuletzt.current = status;
  }, [status, beiErgebnis]);

  const oeffnen = () => {
    dialog.current?.showModal();
    setVorschau("laedt");
    wissenDokumentVorschau(dokument.schluessel)
      .then(setVorschau)
      .catch(() => setVorschau({ text: "", fehler: true }));
  };
  const titelId = `pruefen-titel-${dokument.schluessel}`;
  const knopfKlasse = "inline-flex h-8 items-center rounded-lg border px-3 text-xs font-semibold disabled:opacity-60";

  return (
    <>
      <button
        type="button"
        onClick={oeffnen}
        className="inline-flex h-7 items-center rounded-lg border border-primary/40 px-2.5 text-[11px] font-semibold text-primary transition hover:border-primary"
      >
        {erneut ? t("pruefung.knopfErneut") : t("pruefung.knopf")}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={titelId}
        className="m-auto w-[min(94vw,34rem)] rounded-xl border border-border bg-card p-0 text-card-foreground backdrop:bg-black/50"
      >
        <form action={action} className="space-y-3 p-4">
          <PfadFeld />
          <input type="hidden" name="quelle_id" value={dokument.schluessel} />
          <h3 id={titelId} className="text-sm font-black">
            {erneut ? t("pruefung.titelErneut") : t("pruefung.titel")}
          </h3>
          <dl className="space-y-0.5 text-xs">
            <div>
              <dt className="inline font-semibold">{t("loeschen.dokument")}: </dt>
              <dd className="inline break-words">{dokument.titel}</dd>
            </div>
            <div>
              <dt className="inline font-semibold">{t("loeschen.bereich")}: </dt>
              <dd className="inline">{bereichName}</dd>
            </div>
            {artName ? (
              <div>
                <dt className="inline font-semibold">{t("liste.quellenart")}: </dt>
                <dd className="inline">
                  {artName}
                  {dokument.cluster ? `, ${t(`cluster.${dokument.cluster}` as never)}` : ""}
                  {dokument.stufe !== null ? `, ${t("liste.stufe")} ${dokument.stufe}` : ""}
                  {dokument.nutzung === "hinweis" ? `, ${t("nutzung.hinweis")}` : dokument.nutzung === "notfalls" ? `, ${t("nutzung.notfalls")}` : ""}
                </dd>
              </div>
            ) : null}
            <div>
              <dt className="inline font-semibold">{t("liste.rollen")}: </dt>
              <dd className="inline">{dokument.rollen.map((r) => tRolle(r as never)).join(", ") || "-"}</dd>
            </div>
            <div>
              <dt className="inline font-semibold">{t("liste.von")}: </dt>
              <dd className="inline">{dokument.hochgeladenVon ?? t("liste.vonSkript")}</dd>
            </div>
            <div>
              <dt className="inline font-semibold">{t("loeschen.abschnitte")}: </dt>
              <dd className="inline">{dokument.chunks}</dd>
            </div>
            {dokument.url ? (
              <div>
                <dt className="inline font-semibold">{t("liste.link")}: </dt>
                <dd className="inline break-all">
                  <QuellenLink url={dokument.url} />
                </dd>
              </div>
            ) : null}
          </dl>
          {!erneut ? <EinschaetzungGruende einschaetzung={schaetzeEin(dokument)} mitUeberschrift /> : null}
          <div>
            <p className="mb-1 text-[11px] font-semibold">{t("pruefung.vorschau")}</p>
            <div className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/40 p-2 text-[11px] leading-4">
              {vorschau === "laedt" || vorschau === null
                ? t("pruefung.vorschauLaedt")
                : vorschau.fehler
                  ? t("pruefung.vorschauFehler")
                  : vorschau.text}
            </div>
          </div>
          <p role="note" className="rounded-lg border border-warning/30 bg-warning/[0.08] p-2 text-xs font-semibold text-warning">
            {erneut ? t("pruefung.hinweisErneut") : t("pruefung.hinweis")}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => dialog.current?.close()} className={`${knopfKlasse} border-border`}>
              {t("pruefung.abbrechen")}
            </button>
            {erneut ? (
              <button type="submit" name="aktion" value="verlaengern" disabled={laeuft} className={`${knopfKlasse} border-primary bg-primary text-primary-foreground`}>
                {t("pruefung.verlaengern")}
              </button>
            ) : (
              <>
                <button type="submit" name="aktion" value="ablehnen" disabled={laeuft} className={`${knopfKlasse} border-destructive/40 text-destructive`}>
                  {t("pruefung.ablehnen")}
                </button>
                <button type="submit" name="aktion" value="freigeben" disabled={laeuft} className={`${knopfKlasse} border-primary bg-primary text-primary-foreground`}>
                  {t("pruefung.freigeben")}
                </button>
              </>
            )}
          </div>
        </form>
      </dialog>
    </>
  );
}

// Loeschen mit Bestaetigungsfenster (natives <dialog>, modal: Tastatur und Fokus bleiben im Fenster, Esc bricht ab).
// Das Fenster nennt Titel, Bereich und Zahl der Abschnitte und warnt, dass es nicht rueckgaengig zu machen ist.
function WissenLoeschenKnopf({
  dokument,
  bereichName,
  beiErgebnis,
}: {
  dokument: WissenDokumentZeile;
  bereichName: string;
  beiErgebnis: (status: AktionsStatus) => void;
}) {
  const t = useTranslations("kiAssistentAnsicht.wissensVerwaltung.loeschen");
  const [status, action] = useActionState(wissenDokumentLoeschen, leer);
  const dialog = useRef<HTMLDialogElement>(null);
  const zuletzt = useRef(status);

  // Nach der Antwort (Erfolg, "schon geloescht" oder Fehler): Fenster zu, Meldung und Neuladen beim Eltern-Element.
  useEffect(() => {
    if (status !== zuletzt.current && status.stand !== "leer") {
      dialog.current?.close();
      beiErgebnis(status);
    }
    zuletzt.current = status;
  }, [status, beiErgebnis]);

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="inline-flex h-7 items-center rounded-lg border border-destructive/30 px-2.5 text-[11px] font-semibold text-destructive transition hover:border-destructive"
      >
        {t("knopf")}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={`loeschen-titel-${dokument.schluessel}`}
        className="m-auto w-[min(92vw,28rem)] rounded-xl border border-border bg-card p-0 text-card-foreground backdrop:bg-black/50"
      >
        <form action={action} className="space-y-3 p-4">
          <PfadFeld />
          <input type="hidden" name="quelle_id" value={dokument.schluessel} />
          <h3 id={`loeschen-titel-${dokument.schluessel}`} className="text-sm font-black">
            {t("titel")}
          </h3>
          <dl className="space-y-0.5 text-xs">
            <div>
              <dt className="inline font-semibold">{t("dokument")}: </dt>
              <dd className="inline break-words">{dokument.titel}</dd>
            </div>
            <div>
              <dt className="inline font-semibold">{t("bereich")}: </dt>
              <dd className="inline">{bereichName}</dd>
            </div>
            <div>
              <dt className="inline font-semibold">{t("abschnitte")}: </dt>
              <dd className="inline">{dokument.chunks}</dd>
            </div>
          </dl>
          <p role="alert" className="rounded-lg border border-destructive/25 bg-destructive/[0.06] p-2 text-xs font-semibold text-destructive">
            {t("warnung")}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs font-semibold"
            >
              {t("abbrechen")}
            </button>
            <SubmitKnopf label={t("bestaetigen")} variante="leise" />
          </div>
        </form>
      </dialog>
    </>
  );
}

const EMPFEHLUNG_TON = { freigeben: "success", pruefen: "warning", ablehnen: "danger" } as const;

// Einschaetzung (einschaetzung.ts): die Empfehlung steht als Pille an der Karte, die Gruende darunter. Sie ist eine Entscheidungshilfe,
// kein Ersatz fuer das Lesen der Vorschau.
function EinschaetzungGruende({ einschaetzung, mitUeberschrift = false }: { einschaetzung: Einschaetzung; mitUeberschrift?: boolean }) {
  const t = useTranslations("kiAssistentAnsicht.wissensVerwaltung.einschaetzung");
  if (einschaetzung.gruende.length === 0 && !mitUeberschrift) return null;
  return (
    <div className="mt-2 space-y-0.5 text-[11px]">
      {mitUeberschrift ? (
        <p className="font-semibold">
          {t("titel")}: {t(`empfehlung.${einschaetzung.empfehlung}` as never)}
        </p>
      ) : null}
      {einschaetzung.gruende.length === 0 ? <p className="text-muted-foreground">{t("keineBefunde")}</p> : null}
      <ul className="space-y-0.5">
        {einschaetzung.gruende.map((g) => (
          <li key={g.code} className={g.gewicht === "block" ? "font-semibold text-destructive" : g.gewicht === "pruefen" ? "text-warning" : "text-muted-foreground"}>
            {t(`grund.${g.code}` as never)}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Sammelpruefung: mehrere wartende Dokumente auf einmal freigeben oder ablehnen. Das Fenster nennt jedes Dokument mit seiner Empfehlung;
// freigegeben werden kann alles, was ich pruefen darf, die Auswahl "nur Empfohlene" nimmt allein die ohne Befund. Die Ergebnisse je
// Dokument stehen danach im Fenster (zum Beispiel, wenn ein Dokument inzwischen anders entschieden wurde).
function WissenSammelLeiste({
  pruefbar,
  gewaehlt,
  beiAuswahl,
  beiFertig,
}: {
  pruefbar: WissenDokumentZeile[];
  gewaehlt: ReadonlySet<string>;
  beiAuswahl: (neu: ReadonlySet<string>) => void;
  beiFertig: (status: AktionsStatus) => void;
}) {
  const t = useTranslations("kiAssistentAnsicht.wissensVerwaltung.sammel");
  const tAktion = useTranslations("aktionen");
  const dialog = useRef<HTMLDialogElement>(null);
  const [aktion, setAktion] = useState<"freigeben" | "ablehnen">("freigeben");
  const [laeuft, starte] = useTransition();
  const [ergebnis, setErgebnis] = useState<SammelErgebnis | null>(null);
  const [liste, setListe] = useState<WissenDokumentZeile[]>([]);
  const empfohlen = pruefbar.filter((d) => schaetzeEin(d).empfehlung === "freigeben");
  const auswahl = pruefbar.filter((d) => gewaehlt.has(d.schluessel));

  const oeffne = (neu: "freigeben" | "ablehnen") => {
    setAktion(neu);
    setErgebnis(null);
    setListe(auswahl);
    dialog.current?.showModal();
  };
  const bestaetige = () =>
    starte(async () => {
      const antwort = await wissenDokumenteSammelPruefen(aktion, liste.map((d) => d.schluessel));
      setErgebnis(antwort);
      beiFertig({ stand: antwort.stand, meldung: antwort.meldung, wert: antwort.wert });
    });
  const meldungFuer = (m: string | null, wert: string | null) =>
    m ? (tAktion as (k: string, v?: Record<string, string>) => string)(m, { wert: wert ?? "" }) : "";
  const knopf = "inline-flex h-7 items-center rounded-lg border px-2.5 text-[11px] font-semibold disabled:opacity-50";

  return (
    <div className={pruefbar.length > 0 ? "mb-2 space-y-1.5 rounded-lg border border-border p-2.5" : undefined}>
      {pruefbar.length > 0 ? (
        <>
      <p className="text-[11px] font-semibold text-card-foreground">{t("titel", { anzahl: pruefbar.length })}</p>
      <p className="text-[11px] text-muted-foreground">{t("lead")}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className={`${knopf} border-border`} onClick={() => beiAuswahl(new Set(pruefbar.map((d) => d.schluessel)))}>
          {t("alle")}
        </button>
        <button type="button" disabled={empfohlen.length === 0} className={`${knopf} border-border`} onClick={() => beiAuswahl(new Set(empfohlen.map((d) => d.schluessel)))}>
          {t("nurEmpfohlene", { anzahl: empfohlen.length })}
        </button>
        <button type="button" disabled={gewaehlt.size === 0} className={`${knopf} border-border`} onClick={() => beiAuswahl(new Set())}>
          {t("keine")}
        </button>
        <span className="text-[11px] tabular-nums text-muted-foreground">{t("gewaehlt", { anzahl: auswahl.length })}</span>
        <span className="flex-1" />
        <button type="button" disabled={auswahl.length === 0} className={`${knopf} border-destructive/40 text-destructive`} onClick={() => oeffne("ablehnen")}>
          {t("ablehnen")}
        </button>
        <button type="button" disabled={auswahl.length === 0} className={`${knopf} border-primary bg-primary text-primary-foreground`} onClick={() => oeffne("freigeben")}>
          {t("freigeben")}
        </button>
      </div>
        </>
      ) : null}
      <dialog ref={dialog} aria-labelledby="sammel-titel" className="m-auto w-[min(94vw,36rem)] rounded-xl border border-border bg-card p-0 text-card-foreground backdrop:bg-black/50">
        <div className="space-y-3 p-4">
          <h3 id="sammel-titel" className="text-sm font-black">
            {ergebnis ? t("ergebnisTitel") : aktion === "freigeben" ? t("freigebenTitel", { anzahl: liste.length }) : t("ablehnenTitel", { anzahl: liste.length })}
          </h3>
          {ergebnis ? (
            <ul className="max-h-64 space-y-1 overflow-y-auto text-xs">
              {ergebnis.ergebnisse.map((e) => (
                <li key={e.quelleId} className={e.ok ? "text-card-foreground" : "font-semibold text-destructive"}>
                  {liste.find((d) => d.schluessel === e.quelleId)?.titel ?? e.titel ?? e.quelleId}: {e.ok ? t("erledigt") : meldungFuer(e.meldung, e.wert)}
                </li>
              ))}
            </ul>
          ) : (
            <>
              <ul className="max-h-64 space-y-1 overflow-y-auto text-xs">
                {liste.map((d) => {
                  const e = schaetzeEin(d);
                  return (
                    <li key={d.schluessel} className="flex items-start justify-between gap-2">
                      <span className="min-w-0 break-words">{d.titel}</span>
                      <StatusPill tone={EMPFEHLUNG_TON[e.empfehlung]}>{t(`empfehlung.${e.empfehlung}` as never)}</StatusPill>
                    </li>
                  );
                })}
              </ul>
              {aktion === "freigeben" && liste.some((d) => schaetzeEin(d).empfehlung !== "freigeben") ? (
                <p role="alert" className="rounded-lg border border-warning/30 bg-warning/[0.08] p-2 text-xs font-semibold text-warning">
                  {t("mitBefund")}
                </p>
              ) : null}
              <p role="note" className="text-[11px] font-semibold text-muted-foreground">
                {aktion === "freigeben" ? t("hinweisFreigeben") : t("hinweisAblehnen")}
              </p>
            </>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => dialog.current?.close()} className={`${knopf} h-8 border-border px-3 text-xs`}>
              {ergebnis ? t("schliessen") : t("abbrechen")}
            </button>
            {!ergebnis ? (
              <button
                type="button"
                disabled={laeuft}
                onClick={bestaetige}
                className={`${knopf} h-8 px-3 text-xs ${aktion === "freigeben" ? "border-primary bg-primary text-primary-foreground" : "border-destructive/40 text-destructive"}`}
              >
                {laeuft ? t("laeuft") : aktion === "freigeben" ? t("freigebenBestaetigen") : t("ablehnenBestaetigen")}
              </button>
            ) : null}
          </div>
        </div>
      </dialog>
    </div>
  );
}

// Im Bestand steht im Linkfeld oft Freitext oder eine Liste von Quellen ("kodeksy-kz.com ; https://prg.kz/..."). Nur eine gueltige
// Internetadresse wird zum Link; sonst steht der Text da, und ein darin enthaltener https-Link wird zusaetzlich angeboten.
function QuellenLink({ url }: { url: string }) {
  if (linkBrauchbar(url)) {
    return (
      <a href={url} target="_blank" rel="noreferrer noopener" className="underline">
        {url}
      </a>
    );
  }
  const erster = url.match(/https?:\/\/[^\s;,]+/)?.[0];
  return (
    <>
      {url}
      {erster && linkBrauchbar(erster) ? (
        <>
          {" "}
          <a href={erster} target="_blank" rel="noreferrer noopener" className="underline">
            ↗
          </a>
        </>
      ) : null}
    </>
  );
}
