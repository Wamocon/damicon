"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { StatusPill } from "@/components/ui/kit";
import { Auswahl, FormularKarte } from "@/components/db/formular-kit";
import { wissenBuchAbbrechen, wissenBuchAbschliessen, wissenBuchPaket, wissenBuchStarten, wissenKiAnalyse } from "@/lib/actions/wissen";
import { wissenQualitaetBerechnen } from "@/lib/actions/wissen-bestandspflege";
import { qualitaetTon, vollstaendigkeitsFaktor } from "@/lib/wissen/qualitaet";
import { uploadQuelleId } from "@/lib/wissen/upload-quelle";
import type { AktionsStatus } from "@/lib/actions/status";
import { analysiereDokument, type Analyse } from "@/lib/wissen/analyse";
import { fuehreZusammen, kiAuszug, type KiAntwort } from "@/lib/wissen/analyse-ki";
import { pdfLesenAusDatei } from "@/lib/wissen/buch-pdf";
import { normalisiereText, sha256Hex, teileInPakete, titelAusDateiname } from "@/lib/wissen/buch-text";
import {
  alsSeitenAngabe,
  beschreibeArtikelLuecken,
  pruefeArtikelfolge,
  pruefeSeitenverlauf,
  type ArtikelPruefung,
  type SeitenLuecke,
  type SeitenPruefung,
} from "@/lib/wissen/seitenverlauf";
import { bewerteText, type Guete } from "@/lib/wissen/textguete";
import { CLUSTER, clusterPasst, istCluster, istQuellenart, nutzungFuer, QUELLENART_INFO, QUELLENARTEN, TEXTGRUNDLAGEN, type Cluster } from "@/lib/wissen/quellenart";
import { UPLOAD_BEREICHE, UPLOAD_ROLLEN } from "@/lib/wissen/upload-konstanten";

// Buch-Upload: mehrere lange Dokumente (OCR-PDF, Markdown, Text) in einem Rutsch. Der Browser liest jede Datei selbst, bewertet die Textguete und
// ANALYSIERT den Inhalt: Bereich, Quellenart und Textgrundlage werden je Buch vorgeschlagen (Regeln in analyse.ts, auf Wunsch zusaetzlich durch
// die KI in analyse-ki.ts). Die Administration bestimmt nur den Cluster (er haengt vom Weg ab, nicht vom Text) und prueft die Vorschlaege, jede
// Angabe ist je Buch aenderbar. Die Dateien werden nacheinander hochgeladen, damit der Server nie mehr als ein Paket gleichzeitig einbetten muss.
// Jedes Buch bleibt UNGEPRUEFT, bis eine zweite Person es freigibt.
// Seitenverlauf: Beim Lesen einer PDF vergleicht der Browser die gedruckten Seitenzahlen mit der Reihenfolge in der Datei (seitenverlauf.ts).
// Fehlen Seiten im Scan, steht es am Buch, und das Hochladen verlangt eine ausdrueckliche Bestaetigung; die Luecken gehen zur zweiten Person mit.

type Schritt = "wartet" | "liest" | "bereit" | "laedt" | "fertig" | "fehler" | "abgebrochen";
type Feld = "bereich" | "quellenart" | "textgrundlage";

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
  /** Ergebnis der Pruefung des Seitenverlaufs (nur PDF) und, bei Gesetzen, der Artikelfolge. */
  verlauf: SeitenPruefung | null;
  artikel: ArtikelPruefung | null;
  /** Die Administration nimmt die Luecken im Scan bewusst in Kauf. */
  trotzdem: boolean;
  /** Qualitaet in Prozent (Text und Vollstaendigkeit), vor dem Hochladen im Browser gerechnet; null vor dem Lesen. */
  qualitaet: number | null;
  fehler: string | null;
  text: string | null;
  hash: string | null;
  analyse: Analyse | null;
  ki: "aus" | "laeuft" | "fertig" | "keine";
  bereich: string;
  quellenart: string;
  textgrundlage: string;
  url: string;
  /** Felder, die die Administration selbst geaendert hat: Eine spaetere KI-Antwort ueberschreibt sie nicht. */
  eigene: ReadonlySet<Feld>;
}

function istTextDatei(datei: File): boolean {
  return /\.(md|txt)$/i.test(datei.name);
}

const artPasst = (art: string, cluster: string): boolean => istQuellenart(art) && istCluster(cluster) && clusterPasst(art, cluster);

export function WissenBuecher({ beiFertig }: { beiFertig: () => void }) {
  const t = useTranslations("kiAssistentAnsicht.wissensVerwaltung.buecher");
  const tForm = useTranslations("kiAssistentAnsicht.wissensVerwaltung.formular");
  const tBereich = useTranslations("kiAssistentAnsicht.wissensVerwaltung.bereich");
  const tArt = useTranslations("kiAssistentAnsicht.wissensVerwaltung.quellenart");
  const tCluster = useTranslations("kiAssistentAnsicht.wissensVerwaltung.cluster");
  const tText = useTranslations("kiAssistentAnsicht.wissensVerwaltung.textgrundlage");
  const tRolle = useTranslations("roles");
  const tHinweis = useTranslations("kiAssistentAnsicht.wissensVerwaltung.guete");
  const tAnalyse = useTranslations("kiAssistentAnsicht.wissensVerwaltung.analyse");
  const tAktion = useTranslations("aktionen");

  const [eintraege, setEintraege] = useState<Eintrag[]>([]);
  const [cluster, setCluster] = useState<string>("buecher");
  const [rollen, setRollen] = useState<string[]>([]);
  const [mitKi, setMitKi] = useState(true);
  const [laeuft, setLaeuft] = useState(false);
  // Der Lauf des Hochladens: welche Buecher, wann gestartet, wann zu Ende (fuer Gesamtanzeige und Restzeit)
  const [lauf, setLauf] = useState<{ ids: number[]; start: number; ende: number | null } | null>(null);
  const [jetzt, setJetzt] = useState(() => Date.now());
  const abbruch = useRef<AbortController | null>(null);
  const zaehler = useRef(0);
  const clusterRef = useRef(cluster);
  clusterRef.current = cluster;

  // Die Uhr tickt nur, solange hochgeladen wird: Sie treibt die Restzeit an.
  useEffect(() => {
    if (!laeuft) return;
    const takt = setInterval(() => setJetzt(Date.now()), 1000);
    return () => clearInterval(takt);
  }, [laeuft]);

  const setze = (id: number, teil: Partial<Eintrag>) => setEintraege((alt) => alt.map((e) => (e.id === id ? { ...e, ...teil } : e)));
  const aendere = (id: number, feld: Feld, wert: string) =>
    setEintraege((alt) =>
      alt.map((e) => {
        if (e.id !== id) return e;
        let neu: Eintrag = { ...e, [feld]: wert, eigene: new Set(e.eigene).add(feld) };
        // Der Bereich bestimmt, ob die Art zulaessig ist; ein Wechsel auf eine gesperrte Kombination setzt die Art zurueck.
        if (feld === "bereich" && istQuellenart(e.quellenart) && nutzungFuer(wert, e.quellenart) === "nein") neu = { ...neu, quellenart: "" };
        return neu;
      }),
    );

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

  // Eine Analyse in die Felder eines Buchs uebernehmen: nur, was die Administration nicht selbst geaendert hat. Eine Art, die nicht zum
  // Cluster passt (zum Beispiel Internetquelle im Cluster Buecher), wird durch Fachliteratur ersetzt.
  const uebernimm = (alt: Eintrag, analyse: Analyse): Eintrag => {
    const haben = alt.eigene;
    const art = artPasst(analyse.quellenart, clusterRef.current) ? analyse.quellenart : "fachliteratur";
    return {
      ...alt,
      analyse,
      bereich: haben.has("bereich") ? alt.bereich : analyse.bereich,
      quellenart: haben.has("quellenart") ? alt.quellenart : art,
      textgrundlage: haben.has("textgrundlage") ? alt.textgrundlage : analyse.textgrundlage,
    };
  };

  // Datei lesen, Qualitaet einschaetzen, Inhalt analysieren (noch nichts zum Server).
  const lese = async (eintrag: Eintrag, signal: AbortSignal): Promise<{ id: number; dateiname: string; text: string } | null> => {
    setze(eintrag.id, { schritt: "liest", seite: 0, seiten: 0, fehler: null });
    try {
      const lesung = istTextDatei(eintrag.datei)
        ? { text: await eintrag.datei.text(), raender: null }
        : await pdfLesenAusDatei(eintrag.datei, (f) => setze(eintrag.id, { seite: f.seite, seiten: f.seiten }), signal);
      const text = normalisiereText(lesung.text);
      const guete = bewerteText(text);
      const seitenPruefung = lesung.raender ? pruefeSeitenverlauf(lesung.raender) : null;
      const artikelPruefung = text ? pruefeArtikelfolge(text) : null;
      const hash = text ? await sha256Hex(text) : null;
      const analyse = analysiereDokument(text, eintrag.datei.name);
      const pakete = text ? teileInPakete(text).length : 0;
      setEintraege((alt) => alt.map((e) => (e.id === eintrag.id ? { ...uebernimm(e, analyse), schritt: "bereit", text, guete, verlauf: seitenPruefung, artikel: artikelPruefung, trotzdem: false, qualitaet: Math.round(guete.prozent * vollstaendigkeitsFaktor(seitenPruefung?.geprueft ? { seiten: seitenPruefung.seiten, fehlend: seitenPruefung.fehlend } : null)), hash, pakete, ki: "aus" } : e)));
      return text ? { id: eintrag.id, dateiname: eintrag.datei.name, text } : null;
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

  // Die KI-Antworten in die Eintraege einarbeiten (Heuristik und KI zusammenfuehren, eigene Aenderungen bleiben).
  const wendeKiAn = (antworten: { id: string; ki: KiAntwort | null }[]) =>
    setEintraege((alt) =>
      alt.map((e) => {
        const a = antworten.find((x) => x.id === String(e.id));
        if (!a) return e;
        if (!a.ki || !e.analyse) return { ...e, ki: "keine" };
        const neu = uebernimm(e, fuehreZusammen(e.analyse, a.ki));
        const titel = neu.titel === titelAusDateiname(e.datei.name) && a.ki.titel ? a.ki.titel.trim().slice(0, 200) : neu.titel;
        return { ...neu, ki: "fertig", titel };
      }),
    );

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
      verlauf: null,
      artikel: null,
      trotzdem: false,
      qualitaet: null,
      fehler: null,
      text: null,
      hash: null,
      analyse: null,
      ki: "aus",
      bereich: "recht",
      quellenart: "fachliteratur",
      textgrundlage: "original",
      url: "",
      eigene: new Set<Feld>(),
    }));
    setEintraege((alt) => [...alt, ...neue]);
    const steuerung = new AbortController();
    abbruch.current = steuerung;
    // Das Lesen laeuft nacheinander: PDF.js belegt je Datei viel Speicher, und die Anzeige bleibt so ruhig.
    const gelesen: { id: number; dateiname: string; text: string }[] = [];
    for (const e of neue) {
      if (steuerung.signal.aborted) break;
      const r = await lese(e, steuerung.signal);
      if (r) gelesen.push(r);
    }
    // KI-Analyse: ein Aufruf je 25 Dateien, mit Auszuegen. Ohne Anbieter bleibt es bei den Regeln.
    if (mitKi && gelesen.length > 0 && !steuerung.signal.aborted) {
      const ids = new Set(gelesen.map((g) => g.id));
      setEintraege((alt) => alt.map((e) => (ids.has(e.id) ? { ...e, ki: "laeuft" } : e)));
      for (let i = 0; i < gelesen.length; i += 25) {
        const teil = gelesen.slice(i, i + 25);
        const keine = () => setEintraege((alt) => alt.map((e) => (teil.some((g) => g.id === e.id) ? { ...e, ki: "keine" } : e)));
        try {
          const antwort = await wissenKiAnalyse(teil.map((g) => ({ id: String(g.id), dateiname: g.dateiname, auszug: kiAuszug(g.text) })));
          if (antwort.verfuegbar) wendeKiAn(antwort.ergebnisse);
          else keine();
        } catch (fehler) {
          console.error("[damicon] KI-Analyse fehlgeschlagen:", fehler);
          keine();
        }
      }
    }
  };

  // Wechselt der Cluster, muss jede Art dazu passen: Eine nicht passende Art wird durch Fachliteratur ersetzt.
  const wechsleCluster = (neu: string) => {
    setCluster(neu);
    setEintraege((alt) => alt.map((e) => (e.quellenart && !artPasst(e.quellenart, neu) ? { ...e, quellenart: "fachliteratur" } : e)));
  };

  // Fehlende Seiten im Scan: Das Buch geht nur hoch, wenn die Administration es ausdruecklich bestaetigt.
  const luckenOffen = (e: Eintrag): boolean => (e.verlauf?.fehlend ?? 0) > 0 && !e.trotzdem;
  // Die Artikelfolge zaehlt nur bei Gesetzen (Rechtsnorm, Verwaltungsanweisung): Ein Kommentar oder ein Lehrbuch nennt nur einzelne Artikel.
  const istGesetz = (e: Eintrag): boolean => e.quellenart === "rechtsnorm" || e.quellenart === "verwaltungsanweisung";

  const stelle = (l: SeitenLuecke): string =>
    l.genau
      ? l.vonGedruckt === l.bisGedruckt
        ? t("seiten.stelleEinzeln", { von: l.vonGedruckt, pdf: l.nachPdfSeite })
        : t("seiten.stelleMehrere", { von: l.vonGedruckt, bis: l.bisGedruckt, pdf: l.nachPdfSeite })
      : t("seiten.stelleUngefaehr", { anzahl: l.anzahl, von: l.vonGedruckt, bis: l.bisGedruckt, pdf: l.nachPdfSeite });

  const eintragOk = (e: Eintrag): boolean => {
    if (e.schritt !== "bereit" || !e.guete || e.guete.note === "schlecht" || !e.hash || !e.text) return false;
    if (luckenOffen(e)) return false;
    if (!(UPLOAD_BEREICHE as readonly string[]).includes(e.bereich) || !istQuellenart(e.quellenart) || !artPasst(e.quellenart, cluster)) return false;
    if (nutzungFuer(e.bereich, e.quellenart) === "nein") return false;
    if (!(TEXTGRUNDLAGEN as readonly string[]).includes(e.textgrundlage)) return false;
    if (e.titel.trim().length === 0) return false;
    if (QUELLENART_INFO[e.quellenart].urlPflicht && !/^https?:\/\//i.test(e.url.trim())) return false;
    return true;
  };
  const bereitZumLaden = eintraege.filter(eintragOk);
  const kannStarten = !laeuft && istCluster(cluster) && bereitZumLaden.length > 0 && !eintraege.some((e) => e.ki === "laeuft");

  // Ein Buch hochladen. Bei einem Fehler wird alles Geschriebene wieder entfernt (wissenBuchAbbrechen).
  const lade = async (eintrag: Eintrag, signal: AbortSignal) => {
    if (!eintrag.text || !eintrag.hash || !istQuellenart(eintrag.quellenart)) return;
    const pakete = teileInPakete(eintrag.text);
    const kopf = {
      titel: eintrag.titel.trim(),
      bereich: eintrag.bereich,
      rollen,
      dateiname: eintrag.datei.name,
      hash: eintrag.hash,
      quellenart: eintrag.quellenart,
      cluster,
      textgrundlage: eintrag.textgrundlage,
      url: eintrag.url.trim() || undefined,
      pakete: pakete.length,
      zeichen: eintrag.text.length,
      ...(eintrag.verlauf?.geprueft ? { seiten: alsSeitenAngabe(eintrag.verlauf, istGesetz(eintrag) ? eintrag.artikel : null) } : {}),
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
      const antwort = await wissenBuchPaket({ ...kopf, nr: i + 1, text: pakete[i]! });
      if (antwort.stand !== "ok") {
        await wissenBuchAbbrechen(eintrag.hash);
        setze(eintrag.id, { schritt: "fehler", fehler: `${t("paketFehler", { nr: i + 1, gesamt: pakete.length })} ${meldung(antwort)}`.trim() });
        return;
      }
      geschrieben += Number(antwort.wert ?? 0);
      setze(eintrag.id, { paket: i + 1 });
    }
    const ende = await wissenBuchAbschliessen(kopf, geschrieben);
    // Die Qualitaet aus dem gespeicherten Text berechnen und ablegen: Die Liste zeigt sie danach an. Ein Fehler ist nicht schlimm, der Knopf "Qualitaet berechnen" holt es nach.
    if (ende.stand === "ok") await wissenQualitaetBerechnen([uploadQuelleId(eintrag.hash)]).catch(() => undefined);
    setze(eintrag.id, ende.stand === "ok" ? { schritt: "fertig" } : { schritt: "fehler", fehler: meldung(ende) });
  };

  const starte = async () => {
    setLaeuft(true);
    setLauf({ ids: bereitZumLaden.map((e) => e.id), start: Date.now(), ende: null });
    const steuerung = new AbortController();
    abbruch.current = steuerung;
    try {
      for (const e of bereitZumLaden) {
        if (steuerung.signal.aborted) break;
        await lade(e, steuerung.signal);
      }
    } finally {
      setLaeuft(false);
      setLauf((alt) => (alt ? { ...alt, ende: Date.now() } : alt));
      beiFertig();
    }
  };

  const stoppe = () => abbruch.current?.abort();
  const entferne = (id: number) => setEintraege((alt) => alt.filter((e) => e.id !== id || e.schritt === "laedt"));
  const gesperrt = (e: Eintrag) => e.schritt === "laedt" || e.schritt === "fertig";
  const feldKlasse = "w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground disabled:opacity-60";

  // Gesamtfortschritt: gelesen wird nacheinander, hochgeladen wird nach Paketen. Ein Buch zaehlt mit allen seinen Paketen, sobald es fertig
  // oder gescheitert ist; ein laufendes mit den Paketen, die schon angekommen sind.
  const liestNoch = eintraege.some((e) => e.schritt === "wartet" || e.schritt === "liest");
  const gelesen = eintraege.filter((e) => e.schritt !== "wartet" && e.schritt !== "liest").length;
  const imLauf = lauf ? eintraege.filter((e) => lauf.ids.includes(e.id)) : [];
  const paketeGesamt = imLauf.reduce((s, e) => s + e.pakete, 0);
  const paketeErledigt = imLauf.reduce((s, e) => s + (e.schritt === "fertig" || e.schritt === "fehler" || e.schritt === "abgebrochen" ? e.pakete : e.schritt === "laedt" ? e.paket : 0), 0);
  const buecherFertig = imLauf.filter((e) => e.schritt === "fertig").length;
  const buecherFehler = imLauf.filter((e) => e.schritt === "fehler" || e.schritt === "abgebrochen").length;
  const aktuellesBuch = imLauf.find((e) => e.schritt === "laedt");
  const prozent = paketeGesamt > 0 ? Math.min(100, Math.floor((paketeErledigt * 100) / paketeGesamt)) : 0;
  const vergangen = lauf ? ((lauf.ende ?? jetzt) - lauf.start) / 1000 : 0;
  const restMinuten = lauf && !lauf.ende && paketeErledigt >= 2 && vergangen >= 5 ? Math.max(1, Math.ceil(((vergangen / paketeErledigt) * (paketeGesamt - paketeErledigt)) / 60)) : null;

  return (
    <FormularKarte titel={t("titel")} beschreibung={t("lead")}>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <div className="space-y-1">
          <Auswahl label={tForm("cluster")} name="buch_cluster" value={cluster} onChange={wechsleCluster} options={CLUSTER.map((c: Cluster) => ({ wert: c, text: tCluster(c) }))} />
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
                  <input type="checkbox" checked={rollen.includes(rolle)} onChange={(e) => setRollen(e.target.checked ? [...rollen, rolle] : rollen.filter((r) => r !== rolle))} />
                )}
                {tRolle(rolle)}
              </label>
            ))}
          </div>
          <span className="block text-[11px] text-muted-foreground">{tForm("adminImmer")}</span>
        </fieldset>
        <label className="flex items-start gap-2 text-xs text-card-foreground sm:col-span-2">
          <input type="checkbox" className="mt-0.5" checked={mitKi} onChange={(e) => setMitKi(e.target.checked)} disabled={laeuft} />
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
              void waehleDateien(e.currentTarget.files);
              e.currentTarget.value = "";
            }}
            className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground file:mr-2 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs file:font-semibold file:text-foreground"
          />
          <span className="block text-[11px] text-muted-foreground">{t("dateienHinweis")}</span>
        </label>
      </div>

      {eintraege.length > 0 && (liestNoch || lauf) ? (
        <div role="status" aria-live="polite" className="mt-3 space-y-1.5 rounded-lg border border-border bg-muted/30 p-2.5">
          {liestNoch ? (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-card-foreground">{t("fortschritt.lesen", { fertig: gelesen, gesamt: eintraege.length })}</p>
              <progress className="h-1.5 w-full" max={eintraege.length} value={gelesen} aria-label={t("fortschritt.lesenBalken")} />
            </div>
          ) : null}
          {lauf && imLauf.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-card-foreground">
                {lauf.ende
                  ? buecherFehler > 0
                    ? t("fortschritt.fertigMitFehlern", { ok: buecherFertig, fehler: buecherFehler })
                    : t("fortschritt.fertig", { ok: buecherFertig })
                  : t("fortschritt.hochladen", { buch: Math.min(buecherFertig + buecherFehler + 1, imLauf.length), buecher: imLauf.length, prozent })}
              </p>
              <progress className="h-2 w-full" max={Math.max(1, paketeGesamt)} value={paketeErledigt} aria-label={t("fortschritt.gesamtBalken")} />
              <p className="text-[11px] text-muted-foreground">
                {t("fortschritt.pakete", { erledigt: paketeErledigt, gesamt: paketeGesamt })}
                {aktuellesBuch ? ` · ${t("fortschritt.aktuell", { titel: aktuellesBuch.titel.slice(0, 60), paket: aktuellesBuch.paket, pakete: aktuellesBuch.pakete })}` : ""}
                {restMinuten !== null ? ` · ${t("fortschritt.rest", { minuten: restMinuten })}` : ""}
              </p>
              {!lauf.ende ? <p className="text-[11px] font-semibold text-muted-foreground">{t("fortschritt.nichtSchliessen")}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {eintraege.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {eintraege.map((e) => {
            const art = istQuellenart(e.quellenart) ? e.quellenart : null;
            const nutzung = art ? nutzungFuer(e.bereich, art) : "ja";
            return (
              <li key={e.id} className="rounded-lg border border-border p-2.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <input
                    type="text"
                    value={e.titel}
                    disabled={gesperrt(e)}
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
                    {e.qualitaet !== null ? <StatusPill tone={qualitaetTon(e.qualitaet)}>{t("qualitaet", { prozent: e.qualitaet })}</StatusPill> : null}
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

                {e.schritt === "liest" && e.seiten > 0 ? <progress className="mt-1 h-1.5 w-full" max={e.seiten} value={e.seite} aria-label={t("fortschritt.lesenBalken")} /> : null}
                {e.schritt === "laedt" && e.pakete > 0 ? <progress className="mt-1 h-1.5 w-full" max={e.pakete} value={e.paket} aria-label={t("fortschritt.buchBalken")} /> : null}
                {e.analyse && e.schritt !== "wartet" && e.schritt !== "liest" ? (
                  <div className="mt-2 space-y-1.5">
                    <div className="grid gap-2 sm:grid-cols-3">
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
                {e.fehler ? <p role="alert" className="mt-1 text-[11px] font-semibold text-destructive">{e.fehler}</p> : null}
                {e.schritt === "bereit" && e.guete?.note !== "schlecht" && !luckenOffen(e) && !eintragOk(e) ? <p className="mt-1 text-[11px] font-semibold text-warning">{t("angabenFehlen")}</p> : null}
              </li>
            );
          })}
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
