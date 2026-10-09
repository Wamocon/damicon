"use client";

import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Card, StatusPill } from "@/components/ui/kit";
import { AktionsMeldung, PfadFeld } from "@/components/db/formular-kit";
import { wissenBestandEinordnen } from "@/lib/actions/wissen";
import { leer, type AktionsStatus } from "@/lib/actions/status";
import type { WissenDokumentZeile } from "@/lib/wissen/dokumente-liste";
import { schlageVor, type Sicherheit, type Vorschlag } from "@/lib/wissen/einordnung-vorschlag";
import { wirkungVon, type Zuordnung } from "@/lib/wissen/einordnung-wirkung";
import { stufeSchluessel } from "@/lib/wissen/belege";
import { bereichSchluessel, UPLOAD_BEREICHE } from "@/lib/wissen/upload-konstanten";
import {
  CLUSTER,
  clusterPasst,
  istCluster,
  istQuellenart,
  QUELLENARTEN,
  typischerClusterVon,
  type Cluster,
  type Quellenart,
} from "@/lib/wissen/quellenart";

// Bestand einordnen: Dokumente, die vor der Typisierung eingelesen wurden, bekommen Quellenart, Cluster und Stufe.
//
// Die Administration entscheidet. Die Seite macht zu jedem Dokument einen Vorschlag (aus Link, bisheriger Stufe und Rechtsstelle,
// mit Begruendung und Sicherheit), aber nichts wird von allein gespeichert: Sie waehlt aus, aendert Art und Cluster je Dokument,
// sieht im Bestaetigungsfenster, was die Einordnung fuer die Suche bedeutet (welche Dokumente in ihrem Bereich nicht mehr
// gefunden werden, welche nur noch Hinweis sind, wessen Stufe sich aendert), und bestaetigt erst dann. Die Server Action prueft
// alles noch einmal und aendert nur Zeilen ohne Quellenart (src/lib/wissen/einordnen.ts).

const SEITE = 20;
const MAX_LISTE = 10;

interface Wahl {
  art: string;
  cluster: string;
}
type SicherheitFilter = "alle" | Sicherheit;

const auswahlKlasse = "w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground disabled:opacity-60";
const knopfKlasse = "inline-flex h-8 items-center rounded-lg border px-3 text-xs font-semibold transition disabled:opacity-60";
const TON: Record<Sicherheit, "success" | "info" | "warning"> = { hoch: "success", mittel: "info", niedrig: "warning" };

export function WissenBestandEinordnen({ dokumente, beiFertig }: { dokumente: WissenDokumentZeile[]; beiFertig: () => void }) {
  const t = useTranslations("kiAssistentAnsicht.wissensVerwaltung");
  const tStufe = useTranslations("kiAssistentAnsicht.quellen.stufe");
  const tBereich = useTranslations("kiAssistentAnsicht.wissensVerwaltung.bereich");

  // Nur Dokumente ohne Quellenart: Eine schon eingeordnete Quelle fasst dieser Weg nie an.
  const offen = useMemo(() => dokumente.filter((d) => !d.quellenart), [dokumente]);
  const vorschlaege = useMemo(
    () => new Map<string, Vorschlag>(offen.map((d) => [d.schluessel, schlageVor({ url: d.url, stufe: d.stufe, rechtsstelle: d.rechtsstelle })])),
    [offen],
  );

  // Was die Administration geaendert hat; ohne Eintrag gilt der Vorschlag.
  const [geaendert, setGeaendert] = useState<Record<string, Wahl>>({});
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<SicherheitFilter>("alle");
  const [seite, setSeite] = useState(0);

  const wahlVon = (d: WissenDokumentZeile): Wahl => {
    const eigen = geaendert[d.schluessel];
    if (eigen) return eigen;
    const v = vorschlaege.get(d.schluessel);
    return { art: v?.quellenart ?? "", cluster: v?.cluster ?? "" };
  };
  const vollstaendig = (w: Wahl): w is { art: Quellenart; cluster: Cluster } => istQuellenart(w.art) && istCluster(w.cluster) && clusterPasst(w.art, w.cluster);

  const gefiltert = useMemo(() => offen.filter((d) => filter === "alle" || vorschlaege.get(d.schluessel)?.sicherheit === filter), [offen, filter, vorschlaege]);
  const seiten = Math.max(1, Math.ceil(gefiltert.length / SEITE));
  const aktuelleSeite = Math.min(seite, seiten - 1);
  const sichtbar = gefiltert.slice(aktuelleSeite * SEITE, aktuelleSeite * SEITE + SEITE);
  const zaehle = (s: SicherheitFilter) => (s === "alle" ? offen.length : offen.filter((d) => vorschlaege.get(d.schluessel)?.sicherheit === s).length);

  const setzeWahl = (d: WissenDokumentZeile, teil: Partial<Wahl>) => {
    const alt = wahlVon(d);
    let neu: Wahl = { ...alt, ...teil };
    // Art gewaehlt: der Cluster bekommt den typischen Wert, wenn er fehlt oder nicht passt.
    if (teil.art !== undefined && istQuellenart(teil.art) && !(istCluster(neu.cluster) && clusterPasst(teil.art, neu.cluster))) {
      neu = { ...neu, cluster: typischerClusterVon(teil.art) ?? neu.cluster };
    }
    // Cluster gewaehlt: eine Art, die nicht dazu passt, faellt weg.
    if (teil.cluster !== undefined && istQuellenart(neu.art) && istCluster(teil.cluster) && !clusterPasst(neu.art, teil.cluster)) {
      neu = { ...neu, art: "" };
    }
    setGeaendert((g) => ({ ...g, [d.schluessel]: neu }));
    // Ein Dokument ohne vollstaendige Wahl bleibt nicht ausgewaehlt.
    if (!vollstaendig(neu)) setGewaehlt((s) => { const n = new Set(s); n.delete(d.schluessel); return n; });
  };
  const umschalten = (d: WissenDokumentZeile, an: boolean) =>
    setGewaehlt((s) => {
      const n = new Set(s);
      if (an) n.add(d.schluessel);
      else n.delete(d.schluessel);
      return n;
    });
  const waehleAus = (liste: WissenDokumentZeile[]) =>
    setGewaehlt((s) => {
      const n = new Set(s);
      for (const d of liste) if (vollstaendig(wahlVon(d))) n.add(d.schluessel);
      return n;
    });

  // Die Auswahl als Zuordnungen, in der Reihenfolge der Liste.
  const zuordnungen: (Zuordnung & { schluesselSpalte: WissenDokumentZeile["schluesselSpalte"] })[] = [];
  for (const d of offen) {
    if (!gewaehlt.has(d.schluessel)) continue;
    const w = wahlVon(d);
    if (vollstaendig(w)) zuordnungen.push({ schluessel: d.schluessel, schluesselSpalte: d.schluesselSpalte, quellenart: w.art, cluster: w.cluster });
  }
  const wirkung = wirkungVon(offen, zuordnungen);

  const dialog = useRef<HTMLDialogElement>(null);
  // Nach einem Erfolg Auswahl und Aenderungen leeren und das Fenster schliessen, im Wrapper der Action (nicht in einem Effekt).
  const [status, action, laeuft] = useActionState(async (vorher: AktionsStatus, formData: FormData) => {
    const antwort = await wissenBestandEinordnen(vorher, formData);
    if (antwort.stand === "ok") {
      startTransition(() => {
        setGewaehlt(new Set());
        setGeaendert({});
      });
      dialog.current?.close();
    }
    return antwort;
  }, leer);
  // Die Liste neu laden, einmal je Rueckmeldung.
  const zuletzt = useRef(status);
  useEffect(() => {
    if (status !== zuletzt.current && status.stand === "ok") beiFertig();
    zuletzt.current = status;
  }, [status, beiFertig]);

  const gesamt = dokumente.length;
  const bereichName = (b: string) => ((UPLOAD_BEREICHE as readonly string[]).includes(bereichSchluessel(b)) ? tBereich(bereichSchluessel(b) as never) : b);
  const filterEintraege: SicherheitFilter[] = ["alle", "hoch", "mittel", "niedrig"];

  return (
    <Card className="space-y-3">
      <details open>
        <summary className="cursor-pointer text-sm font-black text-card-foreground">
          {t("einordnen.titel")} <span className="ml-1 text-[11px] font-semibold text-muted-foreground">{t("einordnen.zaehler", { offen: offen.length, gesamt })}</span>
        </summary>
        <div className="mt-3 space-y-3">
          <p className="text-[11px] leading-4 text-muted-foreground">{t("einordnen.lead")}</p>

          <div role="group" aria-label={t("einordnen.filter.titel")} className="flex flex-wrap gap-1.5">
            {filterEintraege.map((f) => {
              const aktiv = filter === f;
              return (
                <button
                  key={f}
                  type="button"
                  aria-pressed={aktiv}
                  onClick={() => {
                    setFilter(f);
                    setSeite(0);
                  }}
                  className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold transition ${
                    aktiv ? "border-primary bg-primary text-primary-foreground" : "border-border text-card-foreground hover:border-primary/50"
                  }`}
                >
                  {f === "alle" ? t("einordnen.filter.alle") : t(`einordnen.sicherheit.${f}` as never)}
                  <span className={`tabular-nums ${aktiv ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{zaehle(f)}</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => waehleAus(offen.filter((d) => vorschlaege.get(d.schluessel)?.sicherheit === "hoch"))} className={`${knopfKlasse} border-border`}>
              {t("einordnen.schaltflaeche.sichere")}
            </button>
            <button type="button" onClick={() => waehleAus(sichtbar)} className={`${knopfKlasse} border-border`}>
              {t("einordnen.schaltflaeche.seite")}
            </button>
            <button type="button" onClick={() => setGewaehlt(new Set())} disabled={gewaehlt.size === 0} className={`${knopfKlasse} border-border`}>
              {t("einordnen.schaltflaeche.aufheben")}
            </button>
            <button
              type="button"
              disabled={zuordnungen.length === 0}
              onClick={() => dialog.current?.showModal()}
              className={`${knopfKlasse} border-primary bg-primary text-primary-foreground`}
            >
              {t("einordnen.schaltflaeche.pruefen", { anzahl: zuordnungen.length })}
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">{t("einordnen.unvollstaendig")}</p>

          <ul className="space-y-2">
            {sichtbar.map((d) => {
              const v = vorschlaege.get(d.schluessel)!;
              const w = wahlVon(d);
              const ok = vollstaendig(w);
              const wahlArt = istQuellenart(w.art) ? w.art : null;
              return (
                <li key={d.schluessel} className="rounded-lg border border-border bg-card p-2.5">
                  <div className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      className="mt-1"
                      aria-label={`${t("einordnen.waehlen")}: ${d.titel}`}
                      checked={gewaehlt.has(d.schluessel)}
                      disabled={!ok}
                      onChange={(e) => umschalten(d, e.target.checked)}
                    />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <p className="break-words text-xs font-black text-card-foreground">{d.titel}</p>
                      <p className="break-all text-[11px] text-muted-foreground">
                        {v.host ?? "-"}
                        {d.stufe !== null ? ` · ${t("liste.stufe")} ${d.stufe} (${tStufe(stufeSchluessel(d.stufe))})` : ""}
                        {` · ${bereichName(d.bereich)}`}
                        {d.rechtsstelle ? ` · ${d.rechtsstelle}` : ""}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className="font-semibold">{t("einordnen.spalte.vorschlag")}:</span>
                        <StatusPill tone={TON[v.sicherheit]}>{t(`einordnen.sicherheit.${v.sicherheit}` as never)}</StatusPill>
                        <span>{t(`einordnen.grund.${v.grund}` as never)}</span>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <select
                          aria-label={`${t("einordnen.spalte.art")}: ${d.titel}`}
                          value={w.art}
                          onChange={(e) => setzeWahl(d, { art: e.target.value })}
                          className={auswahlKlasse}
                        >
                          <option value="">{t("einordnen.bitteWaehlen")}</option>
                          {QUELLENARTEN.map((a) => (
                            <option key={a} value={a} disabled={istCluster(w.cluster) && !clusterPasst(a, w.cluster)}>
                              {t(`quellenart.${a}` as never)}
                            </option>
                          ))}
                        </select>
                        <select
                          aria-label={`${t("einordnen.spalte.cluster")}: ${d.titel}`}
                          value={w.cluster}
                          onChange={(e) => setzeWahl(d, { cluster: e.target.value })}
                          className={auswahlKlasse}
                        >
                          <option value="">{t("einordnen.bitteWaehlen")}</option>
                          {CLUSTER.map((c) => (
                            <option key={c} value={c} disabled={!!wahlArt && !clusterPasst(wahlArt, c)}>
                              {t(`cluster.${c}` as never)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">
              {t("einordnen.seite", { seite: aktuelleSeite + 1, seiten })} · {t("einordnen.gewaehlt", { anzahl: gewaehlt.size })}
            </span>
            <div className="flex gap-2">
              <button type="button" disabled={aktuelleSeite === 0} onClick={() => setSeite(aktuelleSeite - 1)} className={`${knopfKlasse} border-border`}>
                {t("einordnen.schaltflaeche.zurueck")}
              </button>
              <button type="button" disabled={aktuelleSeite >= seiten - 1} onClick={() => setSeite(aktuelleSeite + 1)} className={`${knopfKlasse} border-border`}>
                {t("einordnen.schaltflaeche.weiter")}
              </button>
            </div>
          </div>
        </div>
      </details>

      <dialog
        ref={dialog}
        aria-labelledby="einordnen-titel"
        className="m-auto w-[min(94vw,38rem)] rounded-xl border border-border bg-card p-0 text-card-foreground backdrop:bg-black/50"
      >
        <form action={action} className="space-y-3 p-4">
          <PfadFeld />
          <input type="hidden" name="zuordnungen" value={JSON.stringify(zuordnungen)} />
          <h3 id="einordnen-titel" className="text-sm font-black">
            {t("einordnen.dialog.titel")}
          </h3>
          <p className="text-xs font-semibold">{t("einordnen.dialog.lead")}</p>
          <ul className="space-y-1 text-xs">
            <li>{t("einordnen.dialog.dokumente", { anzahl: wirkung.dokumente, abschnitte: wirkung.abschnitte })}</li>
            {wirkung.gesperrt.length > 0 ? <li className="font-semibold text-destructive">{t("einordnen.dialog.gesperrt", { anzahl: wirkung.gesperrt.length })}</li> : null}
            {wirkung.nurHinweis.length > 0 ? <li className="font-semibold text-warning">{t("einordnen.dialog.nurHinweis", { anzahl: wirkung.nurHinweis.length })}</li> : null}
            {wirkung.stufeGeaendert.length > 0 ? <li>{t("einordnen.dialog.stufe", { anzahl: wirkung.stufeGeaendert.length })}</li> : null}
            {wirkung.verlassenPrimaer.length > 0 ? <li>{t("einordnen.dialog.verlassenPrimaer", { anzahl: wirkung.verlassenPrimaer.length })}</li> : null}
            {wirkung.kommenInPrimaer.length > 0 ? <li>{t("einordnen.dialog.kommenInPrimaer", { anzahl: wirkung.kommenInPrimaer.length })}</li> : null}
            {wirkung.gesperrt.length + wirkung.nurHinweis.length + wirkung.stufeGeaendert.length === 0 ? (
              <li className="text-muted-foreground">{t("einordnen.dialog.nichtsBesonderes")}</li>
            ) : null}
          </ul>
          {wirkung.gesperrt.length + wirkung.nurHinweis.length + wirkung.stufeGeaendert.length > 0 ? (
            <div>
              <p className="mb-1 text-[11px] font-semibold">{t("einordnen.dialog.liste")}</p>
              <ul className="max-h-48 space-y-0.5 overflow-y-auto rounded-lg border border-border bg-muted/40 p-2 text-[11px] leading-4">
                {[...wirkung.gesperrt, ...wirkung.nurHinweis, ...wirkung.stufeGeaendert.filter((z) => z.nutzungNeu === "ja")].slice(0, MAX_LISTE).map((z) => (
                  <li key={z.schluessel} className="break-words">
                    {z.titel} ({bereichName(z.bereich)}
                    {z.nutzungNeu === "nein" ? `, ${t("einordnen.dialog.gesperrtKurz")}` : z.nutzungNeu === "hinweis" ? `, ${t("nutzung.hinweis")}` : ""}
                    {z.stufeAlt !== z.stufeNeu ? `, ${t("einordnen.dialog.stufeVonNach", { alt: z.stufeAlt ?? "-", neu: z.stufeNeu })}` : ""})
                  </li>
                ))}
                {wirkung.gesperrt.length + wirkung.nurHinweis.length + wirkung.stufeGeaendert.filter((z) => z.nutzungNeu === "ja").length > MAX_LISTE ? (
                  <li className="text-muted-foreground">
                    {t("einordnen.dialog.weitere", {
                      anzahl: wirkung.gesperrt.length + wirkung.nurHinweis.length + wirkung.stufeGeaendert.filter((z) => z.nutzungNeu === "ja").length - MAX_LISTE,
                    })}
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}
          <p className="text-[11px] text-muted-foreground">{t("einordnen.dialog.hinweisStufe")}</p>
          <p className="text-[11px] text-muted-foreground">{t("einordnen.dialog.hinweisProtokoll")}</p>
          <AktionsMeldung status={status} />
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => dialog.current?.close()} className={`${knopfKlasse} border-border`}>
              {t("einordnen.dialog.abbrechen")}
            </button>
            <button type="submit" disabled={laeuft || zuordnungen.length === 0} className={`${knopfKlasse} border-primary bg-primary text-primary-foreground`}>
              {t("einordnen.dialog.speichern")}
            </button>
          </div>
        </form>
      </dialog>
    </Card>
  );
}
