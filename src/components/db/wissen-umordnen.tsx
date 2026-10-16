"use client";

import { useActionState, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { PfadFeld } from "@/components/db/formular-kit";
import { wissenDokumentUmordnen } from "@/lib/actions/wissen";
import { leer, type AktionsStatus } from "@/lib/actions/status";
import type { WissenDokumentZeile } from "@/lib/wissen/dokumente-liste";
import { CLUSTER, clusterPasst, istCluster, nutzungFuer, QUELLENARTEN, TEXTGRUNDLAGEN } from "@/lib/wissen/quellenart";
import { bereichSchluessel, UPLOAD_BEREICHE } from "@/lib/wissen/upload-konstanten";
import { bewerteUmordnung, weitereVon, type UmordnenWert } from "@/lib/wissen/umordnen-bewertung";

// Einordnung eines Dokuments nachtraeglich aendern: Cluster, Bereich, Quellenart und Textgrundlage (hochgeladen und Bestand). Das Fenster zeigt, was die
// Aenderung bewirkt (Stufe, Nutzung im Bereich). Bei einem freigegebenen Upload darf die hochladende Person die wirksamen Angaben nicht aendern
// (Vier-Augen-Prinzip: Server und Datenbank pruefen dasselbe), nur den Cluster.

const startWert = (dokument: WissenDokumentZeile): UmordnenWert => ({
  cluster: dokument.cluster ?? "",
  bereich: bereichSchluessel(dokument.bereich),
  weitere: weitereVon(dokument),
  quellenart: dokument.quellenart ?? "",
  textgrundlage: dokument.textgrundlage ?? "original",
});

type Bewertung = ReturnType<typeof bewerteUmordnung>;

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
  const dialog = useRef<HTMLDialogElement>(null);
  const [status, action, laeuft] = useActionState(wissenDokumentUmordnen, leer);
  const zuletzt = useRef(status);
  const [wert, setWert] = useState(() => startWert(dokument));

  // Nach der Antwort: Fenster zu, Meldung und Neuladen beim Eltern-Element.
  useEffect(() => {
    if (status !== zuletzt.current && status.stand !== "leer") {
      if (status.stand === "ok") dialog.current?.close();
      beiErgebnis(status);
    }
    zuletzt.current = status;
  }, [status, beiErgebnis]);

  const bewertung = bewerteUmordnung(dokument, wert, ichId);
  const titelId = `umordnen-titel-${dokument.schluessel}`;
  const knopfKlasse = "inline-flex h-8 items-center rounded-lg border px-3 text-xs font-semibold disabled:opacity-60";

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setWert(startWert(dokument));
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
          {/* Ohne Haken sendet ein Kontrollkasten nichts: Die Marke sagt dem Server, dass die weiteren Bereiche mitgeschickt werden (auch keiner). */}
          <input type="hidden" name="weitereBereicheGesetzt" value="1" />
          <h3 id={titelId} className="text-sm font-black">
            {tU("titel")}
          </h3>
          <p className="break-words text-xs">
            <span className="font-semibold">{t("loeschen.dokument")}: </span>
            {dokument.titel}
          </p>
          <UmordnenFelder dokument={dokument} wert={wert} setWert={setWert} bereichSteht={bewertung.bereichSteht} />
          <UmordnenHinweise bewertung={bewertung} />
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => dialog.current?.close()} className={`${knopfKlasse} border-border`}>
              {tU("abbrechen")}
            </button>
            <button type="submit" disabled={laeuft || bewertung.gesperrtDurchVierAugen || !bewertung.gueltig} className={`${knopfKlasse} border-primary bg-primary text-primary-foreground`}>
              {tU("speichern")}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

/** Die vier Auswahlfelder: Cluster, Bereich (beim Bestand auch der eigene Korpusbereich), Quellenart (unzulaessige gesperrt) und Textgrundlage. */
function UmordnenFelder({
  dokument,
  wert,
  setWert,
  bereichSteht,
}: {
  dokument: WissenDokumentZeile;
  wert: UmordnenWert;
  setWert: (neu: UmordnenWert) => void;
  bereichSteht: boolean;
}) {
  const t = useTranslations("kiAssistentAnsicht.wissensVerwaltung");
  const tBereich = useTranslations("kiAssistentAnsicht.wissensVerwaltung.bereich");
  const tArt = useTranslations("kiAssistentAnsicht.wissensVerwaltung.quellenart");
  const tCluster = useTranslations("kiAssistentAnsicht.wissensVerwaltung.cluster");
  const tText = useTranslations("kiAssistentAnsicht.wissensVerwaltung.textgrundlage");
  const feld = "w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground disabled:opacity-60";
  const aendere = (name: Exclude<keyof UmordnenWert, "weitere">) => (e: ChangeEvent<HTMLSelectElement>) => setWert({ ...wert, [name]: e.target.value });
  const schalteWeitere = (bereich: string) => (e: ChangeEvent<HTMLInputElement>) =>
    setWert({ ...wert, weitere: e.target.checked ? [...wert.weitere, bereich] : wert.weitere.filter((w) => w !== bereich) });
  const eigenerBereich = bereichSchluessel(dokument.bereich);

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="block space-y-0.5">
        <span className="text-[11px] font-semibold">{t("formular.cluster")}</span>
        <select className={feld} name="cluster" value={wert.cluster} onChange={aendere("cluster")}>
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
        <select className={feld} name="bereich" value={wert.bereich} onChange={aendere("bereich")}>
          {UPLOAD_BEREICHE.map((b) => (
            <option key={b} value={b}>
              {tBereich(b)}
            </option>
          ))}
          {/* Bestand mit einem Korpusbereich (amtlich, fachquellen ...): bleibt waehlbar, wie er ist */}
          {!(UPLOAD_BEREICHE as readonly string[]).includes(eigenerBereich) ? <option value={eigenerBereich}>{dokument.bereich}</option> : null}
        </select>
      </label>
      <fieldset className="space-y-0.5 sm:col-span-2">
        <legend className="text-[11px] font-semibold">{t("formular.weitereBereiche")}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {UPLOAD_BEREICHE.filter((b) => b !== wert.bereich).map((b) => (
            <label key={b} className="inline-flex items-center gap-1.5 text-xs">
              <input type="checkbox" name="weitereBereiche" value={b} checked={wert.weitere.includes(b)} onChange={schalteWeitere(b)} />
              {tBereich(b)}
            </label>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">{t("formular.weitereBereicheHinweis")}</p>
      </fieldset>
      <label className="block space-y-0.5">
        <span className="text-[11px] font-semibold">{t("formular.quellenart")}</span>
        <select className={feld} name="quellenart" value={wert.quellenart} onChange={aendere("quellenart")}>
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
        <select className={feld} name="textgrundlage" value={wert.textgrundlage} onChange={aendere("textgrundlage")}>
          {TEXTGRUNDLAGEN.map((g) => (
            <option key={g} value={g}>
              {tText(g)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/** Was die Wahl bewirkt (Stufe, Nutzung, neue Wiedervorlage) und was das Speichern sperrt (fehlender Link, Vier-Augen-Prinzip). */
function UmordnenHinweise({ bewertung }: { bewertung: Bewertung }) {
  const t = useTranslations("kiAssistentAnsicht.wissensVerwaltung");
  const tU = useTranslations("kiAssistentAnsicht.wissensVerwaltung.umordnen");
  const { art, nutzung, stufe, wiedervorlage, urlFehlt, gesperrtDurchVierAugen } = bewertung;
  return (
    <>
      {art ? (
        <p className={`text-[11px] ${nutzung === "hinweis" || nutzung === "notfalls" ? "font-semibold text-warning" : "text-muted-foreground"}`}>
          {tU("wirkung", { stufe: stufe ?? 0 })} {nutzung === "notfalls" ? t("formular.nutzungNotfalls") : nutzung === "hinweis" ? t("formular.nutzungHinweis") : ""}
          {wiedervorlage !== null ? ` ${tU("wiedervorlage", { monate: wiedervorlage })}` : ""}
        </p>
      ) : null}
      {urlFehlt ? <p role="alert" className="text-[11px] font-semibold text-destructive">{tU("urlFehlt")}</p> : null}
      {gesperrtDurchVierAugen ? (
        <p role="alert" className="rounded-lg border border-warning/30 bg-warning/[0.08] p-2 text-xs font-semibold text-warning">
          {tU("vierAugen")}
        </p>
      ) : null}
    </>
  );
}
