"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { StatusPill } from "@/components/ui/kit";
import { Auswahl, FormularKarte } from "@/components/db/formular-kit";
import { wissenBuchAbbrechen, wissenBuchAbschliessen, wissenBuchPaket, wissenBuchStarten } from "@/lib/actions/wissen";
import type { AktionsStatus } from "@/lib/actions/status";
import { pdfTextAusDatei } from "@/lib/wissen/buch-pdf";
import { normalisiereText, sha256Hex, teileInPakete, titelAusDateiname } from "@/lib/wissen/buch-text";
import { bewerteText, type Guete } from "@/lib/wissen/textguete";
import {
  CLUSTER,
  clusterPasst,
  istCluster,
  istQuellenart,
  nutzungFuer,
  QUELLENART_INFO,
  QUELLENARTEN,
  TEXTGRUNDLAGEN,
  typischerClusterVon,
} from "@/lib/wissen/quellenart";
import { UPLOAD_BEREICHE, UPLOAD_ROLLEN } from "@/lib/wissen/upload-konstanten";

// Buch-Upload: mehrere lange Dokumente (OCR-PDF, Markdown, Text) in einem Rutsch. Der Browser liest jede Datei selbst, bildet die Textguete
// und schickt den Text in Paketen (buch-upload.ts). Die Dateien werden nacheinander verarbeitet, damit der Server nie mehr als ein Paket
// gleichzeitig einbetten muss. Jedes Buch bleibt UNGEPRUEFT, bis eine zweite Person es freigibt.

type Schritt = "wartet" | "liest" | "bereit" | "laedt" | "fertig" | "fehler" | "abgebrochen";

interface Eintrag {
  id: number;
  datei: File;
  titel: string;
  schritt: Schritt;
  seite: number;
  seiten: number;
  paket: number;
  pakete: number;
  guete: Guete | null;
  fehler: string | null;
  text: string | null;
  hash: string | null;
}

function istTextDatei(datei: File): boolean {
  return /\.(md|txt)$/i.test(datei.name);
}

export function WissenBuecher({ beiFertig }: { beiFertig: () => void }) {
  const t = useTranslations("kiAssistentAnsicht.wissensVerwaltung.buecher");
  const tForm = useTranslations("kiAssistentAnsicht.wissensVerwaltung.formular");
  const tBereich = useTranslations("kiAssistentAnsicht.wissensVerwaltung.bereich");
  const tArt = useTranslations("kiAssistentAnsicht.wissensVerwaltung.quellenart");
  const tCluster = useTranslations("kiAssistentAnsicht.wissensVerwaltung.cluster");
  const tText = useTranslations("kiAssistentAnsicht.wissensVerwaltung.textgrundlage");
  const tRolle = useTranslations("roles");
  const tHinweis = useTranslations("kiAssistentAnsicht.wissensVerwaltung.guete");
  const tAktion = useTranslations("aktionen");

  const [eintraege, setEintraege] = useState<Eintrag[]>([]);
  const [bereich, setBereich] = useState("");
  const [cluster, setCluster] = useState("buecher");
  const [quellenart, setQuellenart] = useState("fachliteratur");
  const [textgrundlage, setTextgrundlage] = useState("original");
  const [rollen, setRollen] = useState<string[]>([]);
  const [laeuft, setLaeuft] = useState(false);
  const abbruch = useRef<AbortController | null>(null);
  const zaehler = useRef(0);

  const art = istQuellenart(quellenart) ? quellenart : null;
  const nutzung = art && bereich ? nutzungFuer(bereich, art) : "ja";

  const setze = (id: number, teil: Partial<Eintrag>) => setEintraege((alt) => alt.map((e) => (e.id === id ? { ...e, ...teil } : e)));

  const meldung = (status: AktionsStatus): string => {
    if (status.stand !== "fehler") return "";
    // Schluessel wie "fehler.wissenDoppelt" aus den Actions; eine Meldung mit Leerzeichen ist schon Text.
    const schluessel = status.meldung ?? "fehler.unbekannt";
    if (schluessel.includes(" ")) return schluessel;
    const name = schluessel.replace(/^fehler\./, "");
    try {
      return (tAktion as (k: string, v?: Record<string, string>) => string)(`fehler.${name}`, { wert: status.wert ?? "" });
    } catch {
      return tAktion("fehler.unbekannt");
    }
  };

  // Datei lesen und Qualitaet einschaetzen (noch nichts zum Server).
  const lese = async (eintrag: Eintrag, signal: AbortSignal) => {
    setze(eintrag.id, { schritt: "liest", seite: 0, seiten: 0, fehler: null });
    try {
      const roh = istTextDatei(eintrag.datei)
        ? await eintrag.datei.text()
        : await pdfTextAusDatei(eintrag.datei, (f) => setze(eintrag.id, { seite: f.seite, seiten: f.seiten }), signal);
      const text = normalisiereText(roh);
      const guete = bewerteText(text);
      const hash = text ? await sha256Hex(text) : null;
      setze(eintrag.id, { schritt: "bereit", text, guete, hash });
    } catch (fehler) {
      if (signal.aborted) {
        setze(eintrag.id, { schritt: "abgebrochen" });
        return;
      }
      console.error("[damicon] Buch lesen fehlgeschlagen:", fehler);
      setze(eintrag.id, { schritt: "fehler", fehler: t("fehlerLesen") });
    }
  };

  const waehleDateien = async (liste: FileList | null) => {
    if (!liste || liste.length === 0) return;
    const neue: Eintrag[] = [...liste].map((datei) => ({
      id: ++zaehler.current,
      datei,
      titel: titelAusDateiname(datei.name),
      schritt: "wartet",
      seite: 0,
      seiten: 0,
      paket: 0,
      pakete: 0,
      guete: null,
      fehler: null,
      text: null,
      hash: null,
    }));
    setEintraege((alt) => [...alt, ...neue]);
    const steuerung = new AbortController();
    abbruch.current = steuerung;
    // Das Lesen laeuft nacheinander: PDF.js belegt je Datei viel Speicher, und die Anzeige bleibt so ruhig.
    for (const e of neue) {
      if (steuerung.signal.aborted) break;
      await lese(e, steuerung.signal);
    }
  };

  const bereitZumLaden = eintraege.filter((e) => e.schritt === "bereit" && e.guete && e.guete.note !== "schlecht" && e.hash && e.text);
  const kannStarten =
    !laeuft && !!bereich && !!art && istCluster(cluster) && clusterPasst(art, cluster) && nutzung !== "nein" && bereitZumLaden.length > 0;

  // Ein Buch hochladen. Bei einem Fehler wird alles Geschriebene wieder entfernt (wissenBuchAbbrechen).
  const lade = async (eintrag: Eintrag, signal: AbortSignal) => {
    if (!eintrag.text || !eintrag.hash || !art) return;
    const pakete = teileInPakete(eintrag.text);
    const kopf = {
      titel: eintrag.titel.trim(),
      bereich,
      rollen,
      dateiname: eintrag.datei.name,
      hash: eintrag.hash,
      quellenart: art,
      cluster,
      textgrundlage,
      pakete: pakete.length,
      zeichen: eintrag.text.length,
    };
    setze(eintrag.id, { schritt: "laedt", paket: 0, pakete: pakete.length, fehler: null });
    const start = await wissenBuchStarten(kopf);
    if (start.stand !== "ok") {
      setze(eintrag.id, { schritt: "fehler", fehler: meldung(start) });
      return;
    }
    let geschrieben = 0;
    for (let i = 0; i < pakete.length; i++) {
      if (signal.aborted) {
        await wissenBuchAbbrechen(eintrag.hash);
        setze(eintrag.id, { schritt: "abgebrochen" });
        return;
      }
      const antwort = await wissenBuchPaket({ ...kopf, nr: i + 1, text: pakete[i] });
      if (antwort.stand !== "ok") {
        await wissenBuchAbbrechen(eintrag.hash);
        setze(eintrag.id, { schritt: "fehler", fehler: `${t("paketFehler", { nr: i + 1, gesamt: pakete.length })} ${meldung(antwort)}`.trim() });
        return;
      }
      geschrieben += Number(antwort.wert ?? 0);
      setze(eintrag.id, { paket: i + 1 });
    }
    const ende = await wissenBuchAbschliessen(kopf, geschrieben);
    setze(eintrag.id, ende.stand === "ok" ? { schritt: "fertig" } : { schritt: "fehler", fehler: meldung(ende) });
  };

  const starte = async () => {
    setLaeuft(true);
    const steuerung = new AbortController();
    abbruch.current = steuerung;
    try {
      for (const e of bereitZumLaden) {
        if (steuerung.signal.aborted) break;
        await lade(e, steuerung.signal);
      }
    } finally {
      setLaeuft(false);
      beiFertig();
    }
  };

  const stoppe = () => abbruch.current?.abort();
  const entferne = (id: number) => setEintraege((alt) => alt.filter((e) => e.id !== id || e.schritt === "laedt"));

  return (
    <FormularKarte titel={t("titel")} beschreibung={t("lead")}>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Auswahl
          label={tForm("bereich")}
          name="buch_bereich"
          required
          value={bereich}
          onChange={setBereich}
          options={[{ wert: "", text: tForm("bitteWaehlen") }, ...UPLOAD_BEREICHE.map((b) => ({ wert: b, text: tBereich(b) }))]}
        />
        <Auswahl
          label={tForm("cluster")}
          name="buch_cluster"
          value={cluster}
          onChange={(neu) => {
            setCluster(neu);
            if (art && istCluster(neu) && !clusterPasst(art, neu)) setQuellenart("");
          }}
          options={CLUSTER.map((c) => ({ wert: c, text: tCluster(c) }))}
        />
        <Auswahl
          label={tForm("quellenart")}
          name="buch_quellenart"
          value={quellenart}
          onChange={(neu) => {
            setQuellenart(neu);
            const typisch = typischerClusterVon(neu);
            if (typisch && !(istQuellenart(neu) && istCluster(cluster) && clusterPasst(neu, cluster))) setCluster(typisch);
          }}
          options={[
            { wert: "", text: tForm("bitteWaehlen") },
            ...QUELLENARTEN.map((a) => ({
              wert: a,
              text: tArt(a),
              disabled: (!!bereich && nutzungFuer(bereich, a) === "nein") || (istCluster(cluster) && !clusterPasst(a, cluster)),
            })),
          ]}
        />
        <Auswahl
          label={tForm("textgrundlage")}
          name="buch_textgrundlage"
          value={textgrundlage}
          onChange={setTextgrundlage}
          options={TEXTGRUNDLAGEN.map((g) => ({ wert: g, text: tText(g) }))}
        />
        {art ? (
          <span className={`block text-[11px] sm:col-span-2 ${nutzung === "hinweis" || nutzung === "notfalls" ? "font-semibold text-warning" : "text-muted-foreground"}`}>
            {nutzung === "notfalls" ? tForm("nutzungNotfalls") : nutzung === "hinweis" ? tForm("nutzungHinweis") : tForm("stufeInfo", { stufe: QUELLENART_INFO[art].stufe })}
          </span>
        ) : null}
        <fieldset className="space-y-1 sm:col-span-2">
          <legend className="text-[11px] font-semibold text-card-foreground">{tForm("rollen")}</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {UPLOAD_ROLLEN.map((rolle) => (
              <label key={rolle} className="inline-flex items-center gap-1.5 text-xs text-card-foreground">
                {rolle === "admin" ? (
                  <input type="checkbox" checked disabled />
                ) : (
                  <input
                    type="checkbox"
                    checked={rollen.includes(rolle)}
                    onChange={(e) => setRollen(e.target.checked ? [...rollen, rolle] : rollen.filter((r) => r !== rolle))}
                  />
                )}
                {tRolle(rolle)}
              </label>
            ))}
          </div>
          <span className="block text-[11px] text-muted-foreground">{tForm("adminImmer")}</span>
        </fieldset>
        <label className="block space-y-1 sm:col-span-2">
          <span className="text-[11px] font-semibold text-card-foreground">{t("dateien")}</span>
          <input
            type="file"
            multiple
            disabled={laeuft}
            accept=".pdf,.md,.txt,application/pdf,text/markdown,text/plain"
            onChange={(e) => {
              void waehleDateien(e.currentTarget.files);
              e.currentTarget.value = "";
            }}
            className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground file:mr-2 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs file:font-semibold file:text-foreground"
          />
          <span className="block text-[11px] text-muted-foreground">{t("dateienHinweis")}</span>
        </label>
      </div>

      {eintraege.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {eintraege.map((e) => (
            <li key={e.id} className="rounded-lg border border-border p-2.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <input
                  type="text"
                  value={e.titel}
                  disabled={e.schritt === "laedt" || e.schritt === "fertig"}
                  onChange={(ev) => setze(e.id, { titel: ev.target.value })}
                  aria-label={t("titelFeld")}
                  className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-semibold text-foreground"
                />
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <StatusPill tone={e.schritt === "fertig" ? "success" : e.schritt === "fehler" ? "danger" : e.schritt === "abgebrochen" ? "warning" : "info"}>
                    {t(`schritt.${e.schritt}` as never)}
                  </StatusPill>
                  {e.guete ? (
                    <StatusPill tone={e.guete.note === "gut" ? "success" : e.guete.note === "pruefen" ? "warning" : "danger"}>{tHinweis(`note.${e.guete.note}` as never)}</StatusPill>
                  ) : null}
                  {e.schritt !== "laedt" ? (
                    <button type="button" onClick={() => entferne(e.id)} className="text-[11px] font-semibold underline">
                      {t("entfernen")}
                    </button>
                  ) : null}
                </div>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {e.datei.name} ({(e.datei.size / 1_048_576).toFixed(1)} MB)
                {e.schritt === "liest" && e.seiten > 0 ? ` · ${t("seite", { seite: e.seite, seiten: e.seiten })}` : ""}
                {e.schritt === "laedt" ? ` · ${t("paket", { nr: e.paket, gesamt: e.pakete })}` : ""}
                {e.text ? ` · ${t("zeichen", { anzahl: e.text.length.toLocaleString() })}` : ""}
              </p>
              {e.schritt === "laedt" && e.pakete > 0 ? (
                <progress className="mt-1 h-1.5 w-full" max={e.pakete} value={e.paket} aria-label={t("fortschritt")} />
              ) : null}
              {e.guete && e.guete.hinweise.length > 0 ? (
                <p className={`mt-1 text-[11px] ${e.guete.note === "gut" ? "text-muted-foreground" : "font-semibold text-warning"}`}>
                  {e.guete.hinweise.map((h) => tHinweis(`hinweis.${h}` as never)).join(" ")}
                </p>
              ) : null}
              {e.guete?.note === "schlecht" ? <p className="mt-1 text-[11px] font-semibold text-destructive">{t("schlechtGesperrt")}</p> : null}
              {e.fehler ? <p role="alert" className="mt-1 text-[11px] font-semibold text-destructive">{e.fehler}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-3 text-[11px] font-semibold text-muted-foreground">{tForm("freigabeHinweis")}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!kannStarten}
          onClick={() => void starte()}
          className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          {t("start", { anzahl: bereitZumLaden.length })}
        </button>
        {laeuft ? (
          <button type="button" onClick={stoppe} className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs font-semibold">
            {t("stopp")}
          </button>
        ) : null}
      </div>
    </FormularKarte>
  );
}
