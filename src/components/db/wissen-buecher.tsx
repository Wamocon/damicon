"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useLocale, useTranslations } from "next-intl";
import { StatusPill, type Tone } from "@/components/ui/kit";
import { Auswahl, FormularKarte } from "@/components/db/formular-kit";
import { wissenBuchAbbrechen, wissenBuchAbschliessen, wissenBuchPaket, wissenBuchStarten, wissenKiAnalyse } from "@/lib/actions/wissen";
import { wissenQualitaetBerechnen } from "@/lib/actions/wissen-bestandspflege";
import { wissenOriginalPlatz } from "@/lib/actions/wissen-original";
import { formatiereGroesse } from "@/lib/wissen/groesse";
import { legeOriginalAb } from "@/lib/wissen/original-browser";
import { AnsichtSchalter, AufklappPfeil, useAnsicht, useAufgeklappt, type Ansicht } from "@/components/db/ansicht-schalter";
import { mitWiederholung } from "@/lib/wissen/paket-wiederholung";
import { qualitaetTon } from "@/lib/wissen/qualitaet";
import { uploadQuelleId } from "@/lib/wissen/upload-quelle";
import type { AktionsStatus } from "@/lib/actions/status";
import { analysiereDokument } from "@/lib/wissen/analyse";
import { kiAuszug } from "@/lib/wissen/analyse-ki";
import type { BuchKopf } from "@/lib/wissen/buch-upload";
import {
  angabenFehlen,
  artPasst,
  brauchtAufmerksamkeit,
  buchKopf,
  eintragOk,
  gesamtFortschritt,
  gesperrt,
  istGesetz,
  istLadbar,
  istTextDatei,
  mitEigenemFeld,
  mitKiAntwort,
  nachDemLesen,
  neuerEintrag,
  type Eintrag,
  type Feld,
  type Gelesen,
  type Ladbar,
  type Lauf,
  type Schritt,
} from "@/lib/wissen/buch-eintrag";
import { pdfLesenAusDatei, type PdfFortschritt } from "@/lib/wissen/buch-pdf";
import { normalisiereText, sha256Hex, teileInPakete } from "@/lib/wissen/buch-text";
import { beschreibeArtikelLuecken, pruefeArtikelfolge, pruefeSeitenverlauf, type SeitenLuecke } from "@/lib/wissen/seitenverlauf";
import { bewerteText, type GueteNote } from "@/lib/wissen/textguete";
import { CLUSTER, istCluster, istQuellenart, nutzungFuer, QUELLENART_INFO, QUELLENARTEN, TEXTGRUNDLAGEN, type Cluster } from "@/lib/wissen/quellenart";
import { UPLOAD_BEREICHE, UPLOAD_ROLLEN } from "@/lib/wissen/upload-konstanten";

// Buch-Upload: mehrere lange Dokumente (OCR-PDF, Markdown, Text) in einem Rutsch. Der Browser liest jede Datei selbst, bewertet die Textguete und
// ANALYSIERT den Inhalt: Bereich, Quellenart und Textgrundlage werden je Buch vorgeschlagen (Regeln in analyse.ts, auf Wunsch zusaetzlich durch
// die KI in analyse-ki.ts). Die Administration bestimmt nur den Cluster (er haengt vom Weg ab, nicht vom Text) und prueft die Vorschlaege, jede
// Angabe ist je Buch aenderbar. Die Dateien werden nacheinander hochgeladen, damit der Server nie mehr als ein Paket gleichzeitig einbetten muss.
// Jedes Buch bleibt UNGEPRUEFT, bis eine zweite Person es freigibt.
// Seitenverlauf: Beim Lesen einer PDF vergleicht der Browser die gedruckten Seitenzahlen mit der Reihenfolge in der Datei (seitenverlauf.ts).
// Fehlen Seiten im Scan, steht es am Buch, und das Hochladen verlangt eine ausdrueckliche Bestaetigung; die Luecken gehen zur zweiten Person mit.

const feldKlasse = "w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground disabled:opacity-60";
const SCHRITT_TON: Record<Schritt, Tone> = { wartet: "info", liest: "info", bereit: "info", laedt: "info", fertig: "success", fehler: "danger", abgebrochen: "warning" };
const GUETE_TON: Record<GueteNote, Tone> = { gut: "success", pruefen: "warning", schlecht: "danger" };

// Datei lesen, Qualitaet einschaetzen, Inhalt analysieren (noch nichts zum Server).
async function leseDatei(datei: File, beiSeite: (f: PdfFortschritt) => void, signal: AbortSignal): Promise<Gelesen> {
  const lesung = istTextDatei(datei) ? { text: await datei.text(), raender: null, seiten: null } : await pdfLesenAusDatei(datei, beiSeite, signal);
  const text = normalisiereText(lesung.text);
  const guete = bewerteText(text);
  const verlauf = lesung.raender ? pruefeSeitenverlauf(lesung.raender) : null;
  const artikel = text ? pruefeArtikelfolge(text) : null;
  const hash = text ? await sha256Hex(text) : null;
  const analyse = analysiereDokument(text, datei.name);
  const pakete = text ? teileInPakete(text).length : 0;
  return { text, guete, verlauf, artikel, hash, analyse, pakete, roheSeiten: lesung.seiten };
}

export function WissenBuecher({ beiFertig }: { beiFertig: () => void }) {
  const t = useTranslations("kiAssistentAnsicht.wissensVerwaltung.buecher");
  const tForm = useTranslations("kiAssistentAnsicht.wissensVerwaltung.formular");
  const [ansicht, setzeAnsicht] = useAnsicht("wissen.ansicht.hochladen");
  const auf = useAufgeklappt<number>();

  const [eintraege, setEintraege] = useState<Eintrag[]>([]);
  const [cluster, setCluster] = useState<string>("buecher");
  const [rollen, setRollen] = useState<string[]>([]);
  const [mitKi, setMitKi] = useState(true);
  const abbruchRef = useRef<AbortController | null>(null);
  // Der Cluster beim Abarbeiten eines Lese- oder KI-Ergebnisses (im Updater von setEintraege): wie vor dem Zerlegen im Render nachgeführt. Seit die
  // Funktion klein genug ist, dass der React Compiler sie prüft, meldet er das; das Verhalten bleibt bewusst unverändert.
  const clusterRef = useRef(cluster);
  // eslint-disable-next-line react-hooks/refs
  clusterRef.current = cluster;

  const setze = (id: number, teil: Partial<Eintrag>) => setEintraege((alt) => alt.map((e) => (e.id === id ? { ...e, ...teil } : e)));
  const aendere = (id: number, feld: Feld, wert: string) => setEintraege((alt) => alt.map((e) => (e.id === id ? mitEigenemFeld(e, feld, wert) : e)));
  const waehleDateien = useBuchLesen({ setEintraege, setze, clusterRef, abbruchRef, mitKi });

  // Wechselt der Cluster, muss jede Art dazu passen: Eine nicht passende Art wird durch Fachliteratur ersetzt.
  const wechsleCluster = (neu: string) => {
    setCluster(neu);
    setEintraege((alt) => alt.map((e) => (e.quellenart && !artPasst(e.quellenart, neu) ? { ...e, quellenart: "fachliteratur" } : e)));
  };

  const bereitZumLaden = eintraege.filter((e) => eintragOk(e, cluster));
  const hochladen = useBuchHochladen({ bereit: bereitZumLaden, rollen, cluster, abbruchRef, setze, beiFertig });
  const kannStarten = !hochladen.laeuft && istCluster(cluster) && bereitZumLaden.length > 0 && !eintraege.some((e) => e.ki === "laeuft");

  const stoppe = () => abbruchRef.current?.abort();
  const entferne = (id: number) => setEintraege((alt) => alt.filter((e) => e.id !== id || e.schritt === "laedt"));

  return (
    <FormularKarte titel={t("titel")} beschreibung={t("lead")}>
      <BuchEinstellungen cluster={cluster} beiCluster={wechsleCluster} rollen={rollen} beiRollen={setRollen} mitKi={mitKi} beiKi={setMitKi} laeuft={hochladen.laeuft} beiDateien={waehleDateien} />
      <BuchFortschritt eintraege={eintraege} lauf={hochladen.lauf} jetzt={hochladen.jetzt} />

      {eintraege.length > 0 ? (
        <div className="mt-3">
          <AnsichtSchalter ansicht={ansicht} beiWahl={setzeAnsicht} beiAlle={(offen) => auf.setzeAlle(eintraege.map((x) => x.id), offen)} />
        </div>
      ) : null}
      {eintraege.length > 0 ? (
        <ul className={ansicht === "raster" ? "mt-3 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,24rem),1fr))]" : "mt-3 space-y-2"}>
          {eintraege.map((e) => {
            const braucht = brauchtAufmerksamkeit(e, cluster);
            return (
              <BuchEintrag
                key={e.id}
                e={e}
                ansicht={ansicht}
                offen={ansicht === "raster" || auf.istOffen(e.id, braucht)}
                beiAufklappen={() => auf.schalte(e.id, braucht)}
                cluster={cluster}
                mitKi={mitKi}
                setze={setze}
                aendere={aendere}
                entferne={entferne}
              />
            );
          })}
        </ul>
      ) : null}

      <p className="mt-3 text-[11px] font-semibold text-muted-foreground">{tForm("freigabeHinweis")}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!kannStarten}
          onClick={() => void hochladen.starte()}
          className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          {t("start", { anzahl: bereitZumLaden.length })}
        </button>
        {hochladen.laeuft ? (
          <button type="button" onClick={stoppe} className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs font-semibold">
            {t("stopp")}
          </button>
        ) : null}
      </div>
      {hochladen.platzFehler ? (
        <p role="alert" className="mt-2 rounded-lg border border-destructive/30 bg-destructive/[0.08] p-2 text-xs font-semibold text-destructive">
          {hochladen.platzFehler}
        </p>
      ) : null}
    </FormularKarte>
  );
}

/**
 * Dateien waehlen: Jede Datei wird gelesen und analysiert, nacheinander (PDF.js belegt je Datei viel Speicher, und die Anzeige bleibt so ruhig),
 * danach auf Wunsch die KI-Analyse. Gibt die Funktion fuer die Dateiwahl zurueck.
 */
function useBuchLesen({
  setEintraege,
  setze,
  clusterRef,
  abbruchRef,
  mitKi,
}: {
  setEintraege: (neu: (alt: Eintrag[]) => Eintrag[]) => void;
  setze: (id: number, teil: Partial<Eintrag>) => void;
  clusterRef: RefObject<string>;
  abbruchRef: RefObject<AbortController | null>;
  mitKi: boolean;
}) {
  const t = useTranslations("kiAssistentAnsicht.wissensVerwaltung.buecher");
  const zaehler = useRef(0);

  const lese = async (eintrag: Eintrag, signal: AbortSignal): Promise<{ id: number; dateiname: string; text: string } | null> => {
    setze(eintrag.id, { schritt: "liest", seite: 0, seiten: 0, fehler: null });
    try {
      const g = await leseDatei(eintrag.datei, (f) => setze(eintrag.id, { seite: f.seite, seiten: f.seiten }), signal);
      setEintraege((alt) => alt.map((e) => (e.id === eintrag.id ? nachDemLesen(e, g, clusterRef.current) : e)));
      return g.text ? { id: eintrag.id, dateiname: eintrag.datei.name, text: g.text } : null;
    } catch (fehler) {
      if (signal.aborted) {
        setze(eintrag.id, { schritt: "abgebrochen" });
        return null;
      }
      console.error("[damicon] Buch lesen fehlgeschlagen:", fehler);
      setze(eintrag.id, { schritt: "fehler", fehler: t("fehlerLesen") });
      return null;
    }
  };

  // KI-Analyse: ein Aufruf je 25 Dateien, mit Auszuegen. Ohne Anbieter bleibt es bei den Regeln.
  const analysiereMitKi = async (gelesen: { id: number; dateiname: string; text: string }[]) => {
    const ids = new Set(gelesen.map((g) => g.id));
    setEintraege((alt) => alt.map((e) => (ids.has(e.id) ? { ...e, ki: "laeuft" } : e)));
    for (let i = 0; i < gelesen.length; i += 25) {
      const teil = gelesen.slice(i, i + 25);
      const keine = () => setEintraege((alt) => alt.map((e) => (teil.some((g) => g.id === e.id) ? { ...e, ki: "keine" } : e)));
      try {
        const antwort = await wissenKiAnalyse(teil.map((g) => ({ id: String(g.id), dateiname: g.dateiname, auszug: kiAuszug(g.text) })));
        // Die KI-Antworten in die Eintraege einarbeiten (Heuristik und KI zusammenfuehren, eigene Aenderungen bleiben).
        if (antwort.verfuegbar) setEintraege((alt) => alt.map((e) => mitKiAntwort(e, antwort.ergebnisse.find((x) => x.id === String(e.id)), clusterRef.current)));
        else keine();
      } catch (fehler) {
        console.error("[damicon] KI-Analyse fehlgeschlagen:", fehler);
        keine();
      }
    }
  };

  return async (liste: FileList | null) => {
    if (!liste || liste.length === 0) return;
    const neue = [...liste].map((datei) => neuerEintrag(++zaehler.current, datei));
    setEintraege((alt) => [...alt, ...neue]);
    const steuerung = new AbortController();
    abbruchRef.current = steuerung;
    const gelesen: { id: number; dateiname: string; text: string }[] = [];
    for (const e of neue) {
      if (steuerung.signal.aborted) break;
      const r = await lese(e, steuerung.signal);
      if (r) gelesen.push(r);
    }
    if (mitKi && gelesen.length > 0 && !steuerung.signal.aborted) await analysiereMitKi(gelesen);
  };
}

/**
 * Hochladen der fertigen Buecher, nacheinander, mit dem Lauf fuer Gesamtanzeige und Restzeit. Vorher die Obergrenze fuer die Originale.
 * Ein Fehler beendet nur das betroffene Buch: Es wird wieder entfernt, die uebrigen laufen weiter.
 */
function useBuchHochladen({
  bereit,
  rollen,
  cluster,
  abbruchRef,
  setze,
  beiFertig,
}: {
  bereit: Eintrag[];
  rollen: string[];
  cluster: string;
  abbruchRef: RefObject<AbortController | null>;
  setze: (id: number, teil: Partial<Eintrag>) => void;
  beiFertig: () => void;
}) {
  const locale = useLocale();
  const t = useTranslations("kiAssistentAnsicht.wissensVerwaltung.buecher");
  const tAktion = useTranslations("aktionen");
  const [platzFehler, setPlatzFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [lauf, setLauf] = useState<Lauf | null>(null);
  const [jetzt, setJetzt] = useState(() => Date.now());

  // Die Uhr tickt nur, solange hochgeladen wird: Sie treibt die Restzeit an.
  useEffect(() => {
    if (!laeuft) return;
    const takt = setInterval(() => setJetzt(Date.now()), 1000);
    return () => clearInterval(takt);
  }, [laeuft]);

  const meldung = (status: AktionsStatus): string => {
    if (status.stand !== "fehler") return "";
    const schluessel = status.meldung ?? "fehler.unbekannt";
    if (schluessel.includes(" ")) return schluessel;
    try {
      return (tAktion as (k: string, v?: Record<string, string>) => string)(schluessel, { wert: status.wert ?? "" });
    } catch {
      return tAktion("fehler.unbekannt");
    }
  };

  // Ein Buch hochladen. Ein unerwarteter Fehler (zum Beispiel ein Netzabbruch) beendet nur dieses Buch: Es wird wieder entfernt, die übrigen laufen weiter.
  const lade = async (eintrag: Eintrag, signal: AbortSignal) => {
    try {
      await ladeBuch(eintrag, signal);
    } catch (fehler) {
      console.error("[damicon] Buch hochladen unerwartet fehlgeschlagen:", fehler);
      if (eintrag.hash) await wissenBuchAbbrechen(eintrag.hash).catch(() => undefined);
      setze(eintrag.id, { schritt: "fehler", fehler: t("unerwartet"), versuch: 0, originalProzent: null });
    }
  };

  // Bei einem Fehler wird alles Geschriebene wieder entfernt (wissenBuchAbbrechen).
  const ladeBuch = async (eintrag: Eintrag, signal: AbortSignal) => {
    if (!istLadbar(eintrag)) return;
    const pakete = teileInPakete(eintrag.text);
    const kopf = buchKopf(eintrag, pakete, rollen, cluster);
    setze(eintrag.id, { schritt: "laedt", paket: 0, pakete: pakete.length, fehler: null });
    const start = await wissenBuchStarten(kopf);
    if (start.stand !== "ok") {
      setze(eintrag.id, { schritt: "fehler", fehler: meldung(start) });
      return;
    }
    const geschrieben = await sendePakete(eintrag.id, kopf, pakete, signal);
    if (geschrieben !== null) await schliesseAb(eintrag, kopf, geschrieben);
  };

  // Die Pakete nacheinander; die Zahl der geschriebenen Abschnitte, oder null nach Abbruch oder Fehler (das Buch ist dann wieder entfernt).
  const sendePakete = async (id: number, kopf: BuchKopf, pakete: string[], signal: AbortSignal): Promise<number | null> => {
    let geschrieben = 0;
    for (let i = 0; i < pakete.length; i++) {
      if (signal.aborted) {
        await wissenBuchAbbrechen(kopf.hash);
        setze(id, { schritt: "abgebrochen" });
        return null;
      }
      // Bei einem vorübergehenden Fehler (Einbettungsdienst langsam, Verbindung weg) wird dasselbe Paket bis zu zweimal erneut gesendet: Das Schreiben ist wiederholbar.
      const antwort = await mitWiederholung(() => wissenBuchPaket({ ...kopf, nr: i + 1, text: pakete[i]! }), {
        abbruch: signal,
        beiNeuemVersuch: (nr) => setze(id, { versuch: nr }),
      });
      setze(id, { versuch: 0 });
      if (signal.aborted && antwort.stand !== "ok") {
        await wissenBuchAbbrechen(kopf.hash);
        setze(id, { schritt: "abgebrochen" });
        return null;
      }
      if (antwort.stand !== "ok") {
        await wissenBuchAbbrechen(kopf.hash);
        setze(id, { schritt: "fehler", fehler: `${t("paketFehler", { nr: i + 1, gesamt: pakete.length })} ${meldung(antwort)}`.trim() });
        return null;
      }
      geschrieben += Number(antwort.wert ?? 0);
      setze(id, { paket: i + 1 });
    }
    return geschrieben;
  };

  const schliesseAb = async (eintrag: Ladbar, kopf: BuchKopf, geschrieben: number) => {
    const ende = await wissenBuchAbschliessen(kopf, geschrieben);
    // Die Qualitaet aus dem gespeicherten Text berechnen und ablegen: Die Liste zeigt sie danach an. Ein Fehler ist nicht schlimm, der Knopf "Qualitaet berechnen" holt es nach.
    if (ende.stand === "ok") await wissenQualitaetBerechnen([uploadQuelleId(eintrag.hash)]).catch(() => undefined);
    // Die Original-PDF bis zur Freigabe ablegen, damit die prüfende Person sie öffnen kann. Ein Fehler (zum Beispiel eine Datei über dem Limit des
    // Speichers) lässt das Buch hochgeladen und wird nur gemeldet; "Original nachtragen" im Prüffenster holt es nach.
    let original: Eintrag["original"] = null;
    if (ende.stand === "ok" && !istTextDatei(eintrag.datei)) {
      const abgelegt = await legeOriginalAb(eintrag.datei, uploadQuelleId(eintrag.hash), (prozent) => setze(eintrag.id, { originalProzent: prozent }));
      original = abgelegt.ok ? "ok" : abgelegt.code;
    }
    setze(eintrag.id, ende.stand === "ok" ? { schritt: "fertig", original, originalProzent: null } : { schritt: "fehler", fehler: meldung(ende) });
  };

  // Obergrenze für die Originale: wartende zusammen mit der neuen Auswahl. Wird sie überschritten, startet nichts (der Text der Bücher bliebe ohne
  // Original). Ist die Prüfung selbst nicht möglich, geht es weiter: Das Original scheitert dann je Buch mit eigener Meldung.
  const starte = async () => {
    setPlatzFehler(null);
    const pdfBytes = bereit.filter((e) => !istTextDatei(e.datei)).reduce((summe, e) => summe + e.datei.size, 0);
    if (pdfBytes > 0) {
      const platz = await wissenOriginalPlatz(pdfBytes).catch(() => null);
      if (platz && platz.ok && !platz.passt) {
        setPlatzFehler(t("platz.zuVoll", { grenze: formatiereGroesse(platz.grenze, locale), wartend: formatiereGroesse(platz.wartend, locale), neu: formatiereGroesse(platz.neu, locale) }));
        return;
      }
    }
    setLaeuft(true);
    setLauf({ ids: bereit.map((e) => e.id), start: Date.now(), ende: null });
    const steuerung = new AbortController();
    abbruchRef.current = steuerung;
    try {
      for (const e of bereit) {
        if (steuerung.signal.aborted) break;
        await lade(e, steuerung.signal);
      }
    } finally {
      setLaeuft(false);
      setLauf((alt) => (alt ? { ...alt, ende: Date.now() } : alt));
      beiFertig();
    }
  };

  return { laeuft, lauf, jetzt, platzFehler, starte };
}

/** Die Einstellungen fuer die ganze Auswahl: Cluster, Rollen, KI-Analyse und die Dateiwahl. */
function BuchEinstellungen({
  cluster,
  beiCluster,
  rollen,
  beiRollen,
  mitKi,
  beiKi,
  laeuft,
  beiDateien,
}: {
  cluster: string;
  beiCluster: (neu: string) => void;
  rollen: string[];
  beiRollen: (neu: string[]) => void;
  mitKi: boolean;
  beiKi: (an: boolean) => void;
  laeuft: boolean;
  beiDateien: (liste: FileList | null) => Promise<void>;
}) {
  const t = useTranslations("kiAssistentAnsicht.wissensVerwaltung.buecher");
  const tForm = useTranslations("kiAssistentAnsicht.wissensVerwaltung.formular");
  const tCluster = useTranslations("kiAssistentAnsicht.wissensVerwaltung.cluster");
  const tRolle = useTranslations("roles");
  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      <div className="space-y-1">
        <Auswahl label={tForm("cluster")} name="buch_cluster" value={cluster} onChange={beiCluster} options={CLUSTER.map((c: Cluster) => ({ wert: c, text: tCluster(c) }))} />
        <span className="block text-[11px] text-muted-foreground">{t("clusterHinweis")}</span>
      </div>
      <fieldset className="space-y-1">
        <legend className="text-[11px] font-semibold text-card-foreground">{tForm("rollen")}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {UPLOAD_ROLLEN.map((rolle) => (
            <label key={rolle} className="inline-flex items-center gap-1.5 text-xs text-card-foreground">
              {rolle === "admin" ? (
                <input type="checkbox" checked disabled />
              ) : (
                <input type="checkbox" checked={rollen.includes(rolle)} onChange={(e) => beiRollen(e.target.checked ? [...rollen, rolle] : rollen.filter((r) => r !== rolle))} />
              )}
              {tRolle(rolle)}
            </label>
          ))}
        </div>
        <span className="block text-[11px] text-muted-foreground">{tForm("adminImmer")}</span>
      </fieldset>
      <label className="flex items-start gap-2 text-xs text-card-foreground sm:col-span-2">
        <input type="checkbox" className="mt-0.5" checked={mitKi} onChange={(e) => beiKi(e.target.checked)} disabled={laeuft} />
        <span>
          <span className="font-semibold">{t("kiAn")}</span>
          <span className="block text-[11px] text-muted-foreground">{t("kiHinweis")}</span>
        </span>
      </label>
      <label className="block space-y-1 sm:col-span-2">
        <span className="text-[11px] font-semibold text-card-foreground">{t("dateien")}</span>
        <input
          type="file"
          multiple
          disabled={laeuft}
          accept=".pdf,.md,.txt,application/pdf,text/markdown,text/plain"
          onChange={(e) => {
            void beiDateien(e.currentTarget.files);
            e.currentTarget.value = "";
          }}
          className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground file:mr-2 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs file:font-semibold file:text-foreground"
        />
        <span className="block text-[11px] text-muted-foreground">{t("dateienHinweis")}</span>
      </label>
    </div>
  );
}

/** Der Gesamtfortschritt ueber der Liste: Lesen (nacheinander) und Hochladen (nach Paketen) mit Restzeit; nichts, solange nichts laeuft. */
export function BuchFortschritt({ eintraege, lauf, jetzt }: { eintraege: readonly Eintrag[]; lauf: Lauf | null; jetzt: number }) {
  const t = useTranslations("kiAssistentAnsicht.wissensVerwaltung.buecher");
  const f = gesamtFortschritt(eintraege, lauf, jetzt);
  if (eintraege.length === 0 || !(f.liestNoch || lauf)) return null;
  return (
    <div role="status" aria-live="polite" className="mt-3 space-y-1.5 rounded-lg border border-border bg-muted/30 p-2.5">
      {f.liestNoch ? (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-card-foreground">{t("fortschritt.lesen", { fertig: f.gelesen, gesamt: eintraege.length })}</p>
          <progress className="h-1.5 w-full" max={eintraege.length} value={f.gelesen} aria-label={t("fortschritt.lesenBalken")} />
        </div>
      ) : null}
      {lauf && f.imLauf.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-card-foreground">
            {lauf.ende
              ? f.buecherFehler > 0
                ? t("fortschritt.fertigMitFehlern", { ok: f.buecherFertig, fehler: f.buecherFehler })
                : t("fortschritt.fertig", { ok: f.buecherFertig })
              : t("fortschritt.hochladen", { buch: Math.min(f.buecherFertig + f.buecherFehler + 1, f.imLauf.length), buecher: f.imLauf.length, prozent: f.prozent })}
          </p>
          <progress className="h-2 w-full" max={Math.max(1, f.paketeGesamt)} value={f.paketeErledigt} aria-label={t("fortschritt.gesamtBalken")} />
          <p className="text-[11px] text-muted-foreground">
            {t("fortschritt.pakete", { erledigt: f.paketeErledigt, gesamt: f.paketeGesamt })}
            {f.aktuellesBuch ? ` · ${t("fortschritt.aktuell", { titel: f.aktuellesBuch.titel.slice(0, 60), paket: f.aktuellesBuch.paket, pakete: f.aktuellesBuch.pakete })}` : ""}
            {f.restMinuten !== null ? ` · ${t("fortschritt.rest", { minuten: f.restMinuten })}` : ""}
          </p>
          {!lauf.ende ? <p className="text-[11px] font-semibold text-muted-foreground">{t("fortschritt.nichtSchliessen")}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

/** Ein Eintrag der Auflistung beim Hochladen: Kopf mit Titel und Zustand, darunter (in der Liste aufklappbar) Analyse, Seitenverlauf und Hinweise. */
export function BuchEintrag({
  e,
  ansicht,
  offen,
  beiAufklappen,
  cluster,
  mitKi,
  setze,
  aendere,
  entferne,
}: {
  e: Eintrag;
  ansicht: Ansicht;
  offen: boolean;
  beiAufklappen: () => void;
  cluster: string;
  mitKi: boolean;
  setze: (id: number, teil: Partial<Eintrag>) => void;
  aendere: (id: number, feld: Feld, wert: string) => void;
  entferne: (id: number) => void;
}) {
  const t = useTranslations("kiAssistentAnsicht.wissensVerwaltung.buecher");
  const tAnsicht = useTranslations("kiAssistentAnsicht.wissensVerwaltung.ansicht");

  return (
    <li className="flex flex-col rounded-lg border border-border p-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <input
          type="text"
          value={e.titel}
          disabled={gesperrt(e)}
          onChange={(ev) => setze(e.id, { titel: ev.target.value })}
          aria-label={t("titelFeld")}
          className={`min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-semibold text-foreground ${ansicht === "raster" ? "basis-full" : ""}`}
        />
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <BuchKennzeichen e={e} />
          {ansicht === "liste" ? (
            <button
              type="button"
              aria-expanded={offen}
              aria-controls={`eintrag-${e.id}`}
              aria-label={tAnsicht(offen ? "zuklappen" : "aufklappen", { titel: e.titel })}
              onClick={beiAufklappen}
              className="inline-flex size-6 items-center justify-center rounded-md border border-border"
            >
              <AufklappPfeil offen={offen} />
            </button>
          ) : null}
          {e.schritt !== "laedt" ? (
            <button type="button" onClick={() => entferne(e.id)} className="text-[11px] font-semibold underline">
              {t("entfernen")}
            </button>
          ) : null}
        </div>
      </div>
      <BuchStand e={e} />
      {offen ? (
        <div id={`eintrag-${e.id}`}>
          <BuchAnalyse e={e} ansicht={ansicht} cluster={cluster} mitKi={mitKi} aendere={aendere} setze={setze} />
          <BuchHinweise e={e} setze={setze} />
        </div>
      ) : null}
      {e.fehler ? <p role="alert" className="mt-1 text-[11px] font-semibold text-destructive">{e.fehler}</p> : null}
      {angabenFehlen(e, cluster) ? <p className="mt-1 text-[11px] font-semibold text-warning">{t("angabenFehlen")}</p> : null}
    </li>
  );
}

/** Die Kennzeichen im Kopf eines Eintrags: Schritt, Textguete, Qualitaet und, beim fertigen Buch, ob das Original abgelegt ist. */
function BuchKennzeichen({ e }: { e: Eintrag }) {
  const t = useTranslations("kiAssistentAnsicht.wissensVerwaltung.buecher");
  const tHinweis = useTranslations("kiAssistentAnsicht.wissensVerwaltung.guete");
  return (
    <>
      <StatusPill tone={SCHRITT_TON[e.schritt]}>{t(`schritt.${e.schritt}` as never)}</StatusPill>
      {e.guete ? <StatusPill tone={GUETE_TON[e.guete.note]}>{tHinweis(`note.${e.guete.note}` as never)}</StatusPill> : null}
      {e.qualitaet !== null ? <StatusPill tone={qualitaetTon(e.qualitaet)}>{t("qualitaet", { prozent: e.qualitaet })}</StatusPill> : null}
      {e.schritt === "fertig" && e.original === "ok" ? <StatusPill tone="success">{t("original.abgelegt")}</StatusPill> : null}
      {e.schritt === "fertig" && e.original !== null && e.original !== "ok" ? (
        <StatusPill tone="warning">{t.has(`original.fehler.${e.original}` as never) ? t(`original.fehler.${e.original}` as never) : t("original.fehler.unbekannt")}</StatusPill>
      ) : null}
    </>
  );
}

/** Datei, Groesse und Stand des Eintrags (Seite beim Lesen, Paket oder Original beim Hochladen, Zeichen) mit dem Balken dazu. */
function BuchStand({ e }: { e: Eintrag }) {
  const t = useTranslations("kiAssistentAnsicht.wissensVerwaltung.buecher");
  const liestSeiten = e.schritt === "liest" && e.seiten > 0;
  return (
    <>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {e.datei.name} ({(e.datei.size / 1_048_576).toFixed(1)} MB)
        {liestSeiten ? ` · ${t("seite", { seite: e.seite, seiten: e.seiten })}` : ""}
        {e.schritt === "laedt" ? ` · ${e.versuch > 0 ? t("erneut", { nr: e.paket + 1, gesamt: e.pakete, versuch: e.versuch + 1 }) : e.paket >= e.pakete && e.pakete > 0 ? t("original.fortschritt", { prozent: e.originalProzent ?? 0 }) : t("paket", { nr: e.paket, gesamt: e.pakete })}` : ""}
        {e.text ? ` · ${t("zeichen", { anzahl: e.text.length.toLocaleString() })}` : ""}
      </p>

      {liestSeiten ? <progress className="mt-1 h-1.5 w-full" max={e.seiten} value={e.seite} aria-label={t("fortschritt.lesenBalken")} /> : null}
      {e.schritt === "laedt" && e.pakete > 0 ? <progress className="mt-1 h-1.5 w-full" max={e.pakete} value={e.paket} aria-label={t("fortschritt.buchBalken")} /> : null}
    </>
  );
}

/** Die vorgeschlagene Einordnung eines Eintrags (Bereich, Quellenart, Textgrundlage, Link) mit der Herkunft des Vorschlags. */
function BuchAnalyse({
  e,
  ansicht,
  cluster,
  mitKi,
  aendere,
  setze,
}: {
  e: Eintrag;
  ansicht: Ansicht;
  cluster: string;
  mitKi: boolean;
  aendere: (id: number, feld: Feld, wert: string) => void;
  setze: (id: number, teil: Partial<Eintrag>) => void;
}) {
  const tForm = useTranslations("kiAssistentAnsicht.wissensVerwaltung.formular");
  const tBereich = useTranslations("kiAssistentAnsicht.wissensVerwaltung.bereich");
  const tArt = useTranslations("kiAssistentAnsicht.wissensVerwaltung.quellenart");
  const tText = useTranslations("kiAssistentAnsicht.wissensVerwaltung.textgrundlage");
  const tAnalyse = useTranslations("kiAssistentAnsicht.wissensVerwaltung.analyse");
  const art = istQuellenart(e.quellenart) ? e.quellenart : null;
  const nutzung = art ? nutzungFuer(e.bereich, art) : "ja";
  return (
    <>
      {e.analyse && e.schritt !== "wartet" && e.schritt !== "liest" ? (
        <div className="mt-2 space-y-1.5">
          <div className={`grid gap-2 ${ansicht === "raster" ? "" : "sm:grid-cols-3"}`}>
            <label className="block space-y-0.5">
              <span className="text-[11px] font-semibold text-card-foreground">{tForm("bereich")}</span>
              <select className={feldKlasse} value={e.bereich} disabled={gesperrt(e)} onChange={(ev) => aendere(e.id, "bereich", ev.target.value)}>
                {UPLOAD_BEREICHE.map((b) => (
                  <option key={b} value={b}>
                    {tBereich(b)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-0.5">
              <span className="text-[11px] font-semibold text-card-foreground">{tForm("quellenart")}</span>
              <select className={feldKlasse} value={e.quellenart} disabled={gesperrt(e)} onChange={(ev) => aendere(e.id, "quellenart", ev.target.value)}>
                <option value="">{tForm("bitteWaehlen")}</option>
                {QUELLENARTEN.map((a) => (
                  <option key={a} value={a} disabled={nutzungFuer(e.bereich, a) === "nein" || !artPasst(a, cluster)}>
                    {tArt(a)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-0.5">
              <span className="text-[11px] font-semibold text-card-foreground">{tForm("textgrundlage")}</span>
              <select className={feldKlasse} value={e.textgrundlage} disabled={gesperrt(e)} onChange={(ev) => aendere(e.id, "textgrundlage", ev.target.value)}>
                {TEXTGRUNDLAGEN.map((g) => (
                  <option key={g} value={g}>
                    {tText(g)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {art && QUELLENART_INFO[art].urlPflicht ? (
            <label className="block space-y-0.5">
              <span className="text-[11px] font-semibold text-card-foreground">{tForm("url")}</span>
              <input type="url" className={feldKlasse} placeholder="https://" value={e.url} disabled={gesperrt(e)} onChange={(ev) => setze(e.id, { url: ev.target.value })} />
            </label>
          ) : null}
          <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <StatusPill tone={e.analyse.sicherheit === "hoch" ? "success" : e.analyse.sicherheit === "mittel" ? "info" : "warning"}>
              {tAnalyse(`sicherheit.${e.analyse.sicherheit}` as never)}
            </StatusPill>
            <span>
              {e.ki === "laeuft" ? tAnalyse("kiLaeuft") : e.analyse.quelle === "ki" ? tAnalyse("vonKi") : e.ki === "keine" && mitKi ? tAnalyse("nurRegeln") : tAnalyse("vonRegeln")}
              {e.analyse.hinweis ? `: ${e.analyse.hinweis}` : e.analyse.gruende.length > 0 ? `: ${e.analyse.gruende.map((g) => tAnalyse(`grund.${g}` as never)).join(", ")}` : ""}
            </span>
          </p>
          {nutzung === "hinweis" || nutzung === "notfalls" ? (
            <p className="text-[11px] font-semibold text-warning">{nutzung === "notfalls" ? tForm("nutzungNotfalls") : tForm("nutzungHinweis")}</p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

/** Seitenverlauf, Artikelfolge und Textgüte eines Eintrags; bei Lücken im Scan die Bestätigung, trotzdem hochzuladen. */
function BuchHinweise({ e, setze }: { e: Eintrag; setze: (id: number, teil: Partial<Eintrag>) => void }) {
  const t = useTranslations("kiAssistentAnsicht.wissensVerwaltung.buecher");
  const tHinweis = useTranslations("kiAssistentAnsicht.wissensVerwaltung.guete");
  const stelle = (l: SeitenLuecke): string =>
    l.genau
      ? l.vonGedruckt === l.bisGedruckt
        ? t("seiten.stelleEinzeln", { von: l.vonGedruckt, pdf: l.nachPdfSeite })
        : t("seiten.stelleMehrere", { von: l.vonGedruckt, bis: l.bisGedruckt, pdf: l.nachPdfSeite })
      : t("seiten.stelleUngefaehr", { anzahl: l.anzahl, von: l.vonGedruckt, bis: l.bisGedruckt, pdf: l.nachPdfSeite, pdfBis: l.bisPdfSeite ?? l.nachPdfSeite });
  return (
    <>
      {e.verlauf?.geprueft ? (
        e.verlauf.fehlend > 0 ? (
          <div className="mt-1 space-y-1 rounded-md border border-warning/50 bg-warning/10 p-2">
            <p role="alert" className="text-[11px] font-semibold text-warning">
              {t("seiten.luecken", { anzahl: e.verlauf.fehlend, stellen: e.verlauf.luecken.slice(0, 12).map(stelle).join("; ") + (e.verlauf.luecken.length > 12 ? " ..." : "") })}
            </p>
            <label className="flex items-start gap-2 text-[11px] text-card-foreground">
              <input type="checkbox" className="mt-0.5" checked={e.trotzdem} disabled={gesperrt(e)} onChange={(ev) => setze(e.id, { trotzdem: ev.target.checked })} />
              <span>{t("seiten.trotzdem")}</span>
            </label>
          </div>
        ) : e.verlauf.eingeschraenkt ? (
          <p className="mt-1 text-[11px] text-muted-foreground">{t("seiten.eingeschraenkt", { prozent: Math.round(e.verlauf.abdeckung * 100) })}</p>
        ) : (
          <p className="mt-1 text-[11px] text-muted-foreground">{t("seiten.ok", { seiten: e.verlauf.seiten, prozent: Math.round(e.verlauf.abdeckung * 100) })}</p>
        )
      ) : null}
      {e.verlauf?.geprueft && e.verlauf.ohneText.length > 0 ? (
        <p className="mt-1 text-[11px] text-muted-foreground">{t("seiten.ohneText", { liste: e.verlauf.ohneText.slice(0, 15).join(", ") + (e.verlauf.ohneText.length > 15 ? " ..." : "") })}</p>
      ) : null}
      {e.artikel && e.artikel.fehlend > 0 && istGesetz(e) ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {t("seiten.artikel", { anzahl: e.artikel.fehlend, von: e.artikel.kleinste, bis: e.artikel.groesste, stellen: beschreibeArtikelLuecken(e.artikel.luecken) })}
        </p>
      ) : null}
      {e.guete && e.guete.hinweise.length > 0 ? (
        <p className={`mt-1 text-[11px] ${e.guete.note === "gut" ? "text-muted-foreground" : "font-semibold text-warning"}`}>
          {e.guete.hinweise.map((h) => tHinweis(`hinweis.${h}` as never)).join(" ")}
        </p>
      ) : null}
      {e.guete?.note === "schlecht" ? <p className="mt-1 text-[11px] font-semibold text-destructive">{t("schlechtGesperrt")}</p> : null}
    </>
  );
}
