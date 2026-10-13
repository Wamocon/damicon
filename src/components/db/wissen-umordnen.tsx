"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { PfadFeld } from "@/components/db/formular-kit";
import { wissenDokumentUmordnen } from "@/lib/actions/wissen";
import { leer, type AktionsStatus } from "@/lib/actions/status";
import type { WissenDokumentZeile } from "@/lib/wissen/dokumente-liste";
import { CLUSTER, clusterPasst, istCluster, istQuellenart, nutzungFuer, QUELLENART_INFO, QUELLENARTEN, standardStufe, TEXTGRUNDLAGEN } from "@/lib/wissen/quellenart";
import { bereichSchluessel, UPLOAD_BEREICHE } from "@/lib/wissen/upload-konstanten";

// Einordnung eines Dokuments nachtraeglich aendern: Cluster, Bereich, Quellenart und Textgrundlage (hochgeladen und Bestand). Das Fenster zeigt, was die
// Aenderung bewirkt (Stufe, Nutzung im Bereich). Bei einem freigegebenen Upload darf die hochladende Person die wirksamen Angaben nicht aendern
// (Vier-Augen-Prinzip: Server und Datenbank pruefen dasselbe), nur den Cluster.

export function WissenUmordnenKnopf({
  dokument,
  ichId,
  beiErgebnis,
}: {
  dokument: WissenDokumentZeile;
  ichId: string | null;
  beiErgebnis: (status: AktionsStatus) => void;
}) {
  const t = useTranslations("kiAssistentAnsicht.wissensVerwaltung");
  const tU = useTranslations("kiAssistentAnsicht.wissensVerwaltung.umordnen");
  const tBereich = useTranslations("kiAssistentAnsicht.wissensVerwaltung.bereich");
  const tArt = useTranslations("kiAssistentAnsicht.wissensVerwaltung.quellenart");
  const tCluster = useTranslations("kiAssistentAnsicht.wissensVerwaltung.cluster");
  const tText = useTranslations("kiAssistentAnsicht.wissensVerwaltung.textgrundlage");
  const dialog = useRef<HTMLDialogElement>(null);
  const [status, action, laeuft] = useActionState(wissenDokumentUmordnen, leer);
  const zuletzt = useRef(status);

  const start = () => ({
    cluster: dokument.cluster ?? "",
    bereich: bereichSchluessel(dokument.bereich),
    quellenart: dokument.quellenart ?? "",
    textgrundlage: dokument.textgrundlage ?? "original",
  });
  const [wert, setWert] = useState(start);

  // Nach der Antwort: Fenster zu, Meldung und Neuladen beim Eltern-Element.
  useEffect(() => {
    if (status !== zuletzt.current && status.stand !== "leer") {
      if (status.stand === "ok") dialog.current?.close();
      beiErgebnis(status);
    }
    zuletzt.current = status;
  }, [status, beiErgebnis]);

  const art = istQuellenart(wert.quellenart) ? wert.quellenart : null;
  const bereichSteht = (UPLOAD_BEREICHE as readonly string[]).includes(wert.bereich) || wert.bereich === bereichSchluessel(dokument.bereich);
  const nutzung = art && bereichSteht ? nutzungFuer(wert.bereich, art) : "ja";
  const stufe = art ? standardStufe(art) : dokument.stufe;
  const freigegebenerUpload = dokument.herkunft === "upload" && dokument.pruefstatus === "freigegeben";
  const eigener = !!ichId && dokument.hochgeladenVonId === ichId;
  const wirkt = wert.bereich !== bereichSchluessel(dokument.bereich) || wert.quellenart !== (dokument.quellenart ?? "") || wert.textgrundlage !== (dokument.textgrundlage ?? "original");
  const gesperrtDurchVierAugen = freigegebenerUpload && eigener && wirkt;
  const urlFehlt = !!art && QUELLENART_INFO[art].urlPflicht && !/^https?:\/\//i.test(dokument.url ?? "");
  const gueltig = !!art && istCluster(wert.cluster) && clusterPasst(art, wert.cluster) && nutzung !== "nein" && !urlFehlt && bereichSteht;
  const titelId = `umordnen-titel-${dokument.schluessel}`;
  const feld = "w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground disabled:opacity-60";
  const knopfKlasse = "inline-flex h-8 items-center rounded-lg border px-3 text-xs font-semibold disabled:opacity-60";

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setWert(start());
          dialog.current?.showModal();
        }}
        className="inline-flex h-7 items-center rounded-lg border border-border px-2.5 text-[11px] font-semibold text-card-foreground transition hover:border-primary/50"
      >
        {tU("knopf")}
      </button>
      <dialog ref={dialog} aria-labelledby={titelId} className="m-auto w-[min(94vw,32rem)] rounded-xl border border-border bg-card p-0 text-card-foreground backdrop:bg-black/50">
        <form action={action} className="space-y-3 p-4">
          <PfadFeld />
          <input type="hidden" name="schluessel" value={dokument.schluessel} />
          <input type="hidden" name="spalte" value={dokument.schluesselSpalte} />
          <h3 id={titelId} className="text-sm font-black">
            {tU("titel")}
          </h3>
          <p className="break-words text-xs">
            <span className="font-semibold">{t("loeschen.dokument")}: </span>
            {dokument.titel}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block space-y-0.5">
              <span className="text-[11px] font-semibold">{t("formular.cluster")}</span>
              <select className={feld} name="cluster" value={wert.cluster} onChange={(e) => setWert({ ...wert, cluster: e.target.value })}>
                <option value="">{t("formular.bitteWaehlen")}</option>
                {CLUSTER.map((c) => (
                  <option key={c} value={c}>
                    {tCluster(c)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-0.5">
              <span className="text-[11px] font-semibold">{t("formular.bereich")}</span>
              <select className={feld} name="bereich" value={wert.bereich} onChange={(e) => setWert({ ...wert, bereich: e.target.value })}>
                {UPLOAD_BEREICHE.map((b) => (
                  <option key={b} value={b}>
                    {tBereich(b)}
                  </option>
                ))}
                {/* Bestand mit einem Korpusbereich (amtlich, fachquellen ...): bleibt waehlbar, wie er ist */}
                {!(UPLOAD_BEREICHE as readonly string[]).includes(bereichSchluessel(dokument.bereich)) ? <option value={bereichSchluessel(dokument.bereich)}>{dokument.bereich}</option> : null}
              </select>
            </label>
            <label className="block space-y-0.5">
              <span className="text-[11px] font-semibold">{t("formular.quellenart")}</span>
              <select className={feld} name="quellenart" value={wert.quellenart} onChange={(e) => setWert({ ...wert, quellenart: e.target.value })}>
                <option value="">{t("formular.bitteWaehlen")}</option>
                {QUELLENARTEN.map((a) => (
                  <option key={a} value={a} disabled={(bereichSteht && nutzungFuer(wert.bereich, a) === "nein") || (istCluster(wert.cluster) && !clusterPasst(a, wert.cluster))}>
                    {tArt(a)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-0.5">
              <span className="text-[11px] font-semibold">{t("formular.textgrundlage")}</span>
              <select className={feld} name="textgrundlage" value={wert.textgrundlage} onChange={(e) => setWert({ ...wert, textgrundlage: e.target.value })}>
                {TEXTGRUNDLAGEN.map((g) => (
                  <option key={g} value={g}>
                    {tText(g)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {art ? (
            <p className={`text-[11px] ${nutzung === "hinweis" || nutzung === "notfalls" ? "font-semibold text-warning" : "text-muted-foreground"}`}>
              {tU("wirkung", { stufe: stufe ?? 0 })} {nutzung === "notfalls" ? t("formular.nutzungNotfalls") : nutzung === "hinweis" ? t("formular.nutzungHinweis") : ""}
              {freigegebenerUpload && QUELLENART_INFO[art].pruefMonate !== null && art !== dokument.quellenart ? ` ${tU("wiedervorlage", { monate: QUELLENART_INFO[art].pruefMonate ?? 0 })}` : ""}
            </p>
          ) : null}
          {urlFehlt ? <p role="alert" className="text-[11px] font-semibold text-destructive">{tU("urlFehlt")}</p> : null}
          {gesperrtDurchVierAugen ? (
            <p role="alert" className="rounded-lg border border-warning/30 bg-warning/[0.08] p-2 text-xs font-semibold text-warning">
              {tU("vierAugen")}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => dialog.current?.close()} className={`${knopfKlasse} border-border`}>
              {tU("abbrechen")}
            </button>
            <button type="submit" disabled={laeuft || gesperrtDurchVierAugen || !gueltig} className={`${knopfKlasse} border-primary bg-primary text-primary-foreground`}>
              {tU("speichern")}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
