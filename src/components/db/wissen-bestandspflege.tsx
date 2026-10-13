"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { StatusPill } from "@/components/ui/kit";
import { FormularKarte } from "@/components/db/formular-kit";
import {
  wissenBestandEntfernen,
  wissenBestandspflegeNaehe,
  wissenBestandspflegeStart,
  wissenBestandspflegeVergleich,
  type EntfernenAntwort,
  type VergleichPaar,
} from "@/lib/actions/wissen-bestandspflege";
import { baueBefunde, ohneEntfernte, zaehleBefunde, type BefundArt, type BefundStufe, type DokumentBefunde, type DokumentNaehe } from "@/lib/wissen/bestandspflege";

// Bestandspflege: Analysen der Wissensbasis (Arbeitsdokumente, ausdrücklich veraltet, Dubletten, durch Bücher abgedeckt, Wiedervorlage, Herkunft) und das
// Entfernen nach der Prüfung. Die Analyse verändert nichts und läuft in kleinen Schritten mit Fortschritt (die Server Action hat höchstens 60 Sekunden).
// Entfernt wird erst nach ausdrücklicher Bestätigung: Titel prüfen, Grund eintragen, die Zahl der Dokumente eintippen. Der Server prüft das noch einmal.

import type { WissenDokumentZeile } from "@/lib/wissen/dokumente-liste";

type Phase = "bereit" | "laeuft" | "fertig" | "fehler";
const ARTEN: BefundArt[] = ["arbeitsdokument", "veraltet", "dublette", "abgedeckt", "wiedervorlage", "herkunft"];
const STUFEN_TON: Record<BefundStufe, "danger" | "warning" | "info"> = { entfernen: "danger", pruefen: "warning", hinweis: "info" };
const SCHRITT = 5; // Dokumente je Aufruf des Vektorvergleichs (muss zu NAEHE_JE_AUFRUF in der Action passen)

interface Vergleich {
  laedt: boolean;
  paare: VergleichPaar[];
  titel: string | null;
  fehler: boolean;
}

export function WissenBestandspflege({ beiFertig }: { dokumente?: readonly WissenDokumentZeile[] | null; beiFertig: () => void }) {
  const t = useTranslations("kiAssistentAnsicht.wissensVerwaltung.pflege");
  // Schlüssel mit Platzhaltern, die erst zur Laufzeit feststehen (Art des Befunds): ohne die strenge Schlüsselprüfung der Übersetzung.
  const tt = t as unknown as (schluessel: string, werte?: Record<string, string | number>) => string;
  const [phase, setPhase] = useState<Phase>("bereit");
  const [mitVergleich, setMitVergleich] = useState(true);
  const [fortschritt, setFortschritt] = useState<{ fertig: number; gesamt: number } | null>(null);
  const [befunde, setBefunde] = useState<DokumentBefunde[]>([]);
  const [anzahlGeprueft, setAnzahlGeprueft] = useState(0);
  const [artFilter, setArtFilter] = useState<BefundArt | null>(null);
  const [gewaehlt, setGewaehlt] = useState<ReadonlySet<string>>(new Set());
  const [vergleiche, setVergleiche] = useState<Record<string, Vergleich>>({});
  const [bestaetigen, setBestaetigen] = useState(false);
  const [grund, setGrund] = useState("");
  const [geprueft, setGeprueft] = useState(false);
  const [zahl, setZahl] = useState("");
  const [laeuftEntfernen, setLaeuftEntfernen] = useState(false);
  const [antwort, setAntwort] = useState<EntfernenAntwort | null>(null);
  const abbruch = useRef(false);

  const zaehlung = zaehleBefunde(befunde);
  const sichtbar = artFilter ? befunde.filter((b) => b.befunde.some((x) => x.art === artFilter)) : befunde;
  const waehlbar = (b: DokumentBefunde) => b.dokument.schluesselSpalte === "quelle_id";

  const analysiere = async () => {
    setPhase("laeuft");
    setBefunde([]);
    setGewaehlt(new Set());
    setVergleiche({});
    setAntwort(null);
    setBestaetigen(false);
    abbruch.current = false;
    setFortschritt(null);
    try {
      const start = await wissenBestandspflegeStart();
      if (start.fehler) {
        setPhase("fehler");
        return;
      }
      const naehe = new Map<string, DokumentNaehe>();
      if (mitVergleich) {
        setFortschritt({ fertig: 0, gesamt: start.fuerNaehe.length });
        for (let i = 0; i < start.fuerNaehe.length; i += SCHRITT) {
          if (abbruch.current) break;
          const teil = start.fuerNaehe.slice(i, i + SCHRITT);
          const r = await wissenBestandspflegeNaehe(teil);
          if (r.fehler) {
            setPhase("fehler");
            return;
          }
          for (const n of r.naehe) naehe.set(n.schluessel, n);
          setFortschritt({ fertig: Math.min(i + SCHRITT, start.fuerNaehe.length), gesamt: start.fuerNaehe.length });
        }
      }
      setAnzahlGeprueft(start.dokumente.length);
      setBefunde(baueBefunde(start.dokumente, naehe, start.heute));
      setPhase("fertig");
    } catch (fehler) {
      console.error("[damicon] Bestandspflege fehlgeschlagen:", fehler);
      setPhase("fehler");
    }
  };

  const schalte = (schluessel: string) =>
    setGewaehlt((alt) => {
      const neu = new Set(alt);
      if (!neu.delete(schluessel)) neu.add(schluessel);
      return neu;
    });

  const vergleiche_laden = async (b: DokumentBefunde, andere: string) => {
    const schluessel = `${b.dokument.schluessel}|${andere}`;
    if (vergleiche[schluessel]) {
      setVergleiche((alt) => {
        const rest = { ...alt };
        delete rest[schluessel];
        return rest;
      });
      return;
    }
    setVergleiche((alt) => ({ ...alt, [schluessel]: { laedt: true, paare: [], titel: null, fehler: false } }));
    const r = await wissenBestandspflegeVergleich(b.dokument.schluessel, andere);
    setVergleiche((alt) => ({ ...alt, [schluessel]: { laedt: false, paare: r.paare, titel: r.titel, fehler: r.fehler } }));
  };

  const ausgewaehlt = befunde.filter((b) => gewaehlt.has(b.dokument.schluessel));
  const abschnitteGesamt = ausgewaehlt.reduce((s, b) => s + b.dokument.chunks, 0);
  const kannEntfernen = geprueft && grund.trim().length > 0 && zahl.trim() === String(ausgewaehlt.length) && !laeuftEntfernen;

  const entferne = async () => {
    setLaeuftEntfernen(true);
    try {
      const r = await wissenBestandEntfernen(
        ausgewaehlt.map((b) => b.dokument.schluessel),
        grund.trim(),
        zahl.trim(),
      );
      setAntwort(r);
      const weg = new Set(r.ergebnisse.filter((e) => e.status !== "fehler").map((e) => e.quelleId));
      setBefunde((alt) => ohneEntfernte(alt, weg));
      setGewaehlt(new Set());
      setBestaetigen(false);
      setGeprueft(false);
      setZahl("");
      setGrund("");
      if (weg.size > 0) beiFertig();
    } finally {
      setLaeuftEntfernen(false);
    }
  };

  const prozent = (x: number | undefined) => Math.round((x ?? 0) * 100);
  const buttonKlasse = "inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs font-semibold disabled:opacity-50";

  return (
    <FormularKarte titel={t("titel")} beschreibung={t("lead")}>
      <label className="flex items-start gap-2 text-xs text-card-foreground">
        <input type="checkbox" className="mt-0.5" checked={mitVergleich} disabled={phase === "laeuft"} onChange={(e) => setMitVergleich(e.target.checked)} />
        <span>
          <span className="font-semibold">{t("mitVergleich")}</span>
          <span className="block text-[11px] text-muted-foreground">{t("mitVergleichHinweis")}</span>
        </span>
      </label>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" disabled={phase === "laeuft"} onClick={() => void analysiere()} className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50">
          {phase === "fertig" ? t("nochmal") : t("start")}
        </button>
        {phase === "laeuft" ? (
          <button type="button" onClick={() => (abbruch.current = true)} className={buttonKlasse}>
            {t("abbrechen")}
          </button>
        ) : null}
      </div>

      {phase === "laeuft" ? (
        <div role="status" aria-live="polite" className="mt-2 space-y-1">
          <p className="text-xs font-semibold text-card-foreground">{fortschritt ? t("fortschritt", { fertig: fortschritt.fertig, gesamt: fortschritt.gesamt }) : t("ladeListe")}</p>
          {fortschritt ? <progress className="h-1.5 w-full" max={Math.max(1, fortschritt.gesamt)} value={fortschritt.fertig} aria-label={t("fortschrittBalken")} /> : null}
        </div>
      ) : null}
      {phase === "fehler" ? (
        <p role="alert" className="mt-2 text-xs font-semibold text-destructive">
          {t("fehler")}
        </p>
      ) : null}

      {antwort ? (
        <div role="status" className="mt-3 space-y-1 rounded-lg border border-border bg-muted/30 p-2.5 text-xs">
          {!antwort.zugriff ? <p className="font-semibold text-destructive">{t("ergebnis.zugriff")}</p> : null}
          {antwort.bestaetigungFalsch ? <p className="font-semibold text-destructive">{t("ergebnis.bestaetigungFalsch")}</p> : null}
          {antwort.ergebnisse.length > 0 ? (
            <p className="font-semibold text-card-foreground">
              {t("ergebnis.entfernt", {
                anzahl: antwort.ergebnisse.filter((e) => e.status === "entfernt").length,
                abschnitte: antwort.ergebnisse.reduce((s, e) => s + (e.status === "entfernt" ? e.abschnitte : 0), 0),
              })}
            </p>
          ) : null}
          {antwort.ergebnisse.some((e) => e.status === "schonWeg") ? <p className="text-muted-foreground">{t("ergebnis.schonWeg", { anzahl: antwort.ergebnisse.filter((e) => e.status === "schonWeg").length })}</p> : null}
          {antwort.ergebnisse.some((e) => e.gewichteOffen) ? <p className="text-muted-foreground">{t("ergebnis.gewichteOffen")}</p> : null}
          {antwort.ergebnisse
            .filter((e) => e.status === "fehler")
            .map((e) => (
              <p key={e.quelleId || e.code} className="font-semibold text-destructive">
                {t("ergebnis.fehler", { titel: e.quelleId.slice(0, 60) || "-", grund: t(`ergebnis.code.${e.code ?? "unbekannt"}` as never) })}
              </p>
            ))}
        </div>
      ) : null}

      {phase === "fertig" ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-semibold text-card-foreground">{befunde.length === 0 ? t("keineBefunde", { anzahl: anzahlGeprueft }) : t("zusammenfassung", { befunde: befunde.length, gesamt: anzahlGeprueft })}</p>

          {befunde.length > 0 ? (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                <button type="button" aria-pressed={artFilter === null} onClick={() => setArtFilter(null)} className={`${buttonKlasse} ${artFilter === null ? "bg-muted" : ""}`}>
                  {t("filter.alle", { anzahl: befunde.length })}
                </button>
                {ARTEN.filter((a) => zaehlung.art[a] > 0).map((a) => (
                  <button key={a} type="button" aria-pressed={artFilter === a} onClick={() => setArtFilter(artFilter === a ? null : a)} className={`${buttonKlasse} ${artFilter === a ? "bg-muted" : ""}`}>
                    {t(`art.${a}` as never)} ({zaehlung.art[a]})
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <button
                  type="button"
                  className="font-semibold underline"
                  onClick={() => setGewaehlt(new Set(sichtbar.filter((b) => b.stufe === "entfernen" && waehlbar(b)).map((b) => b.dokument.schluessel)))}
                >
                  {t("auswahl.vorschlaege")}
                </button>
                <button type="button" className="font-semibold underline" onClick={() => setGewaehlt(new Set())}>
                  {t("auswahl.keine")}
                </button>
                <span className="text-muted-foreground">{t("auswahl.gewaehlt", { anzahl: gewaehlt.size })}</span>
                <button type="button" disabled={gewaehlt.size === 0} onClick={() => setBestaetigen(true)} className="ml-auto inline-flex h-8 items-center rounded-lg border border-destructive px-3 text-xs font-semibold text-destructive disabled:opacity-50">
                  {t("auswahl.entfernen", { anzahl: gewaehlt.size })}
                </button>
              </div>

              {bestaetigen && ausgewaehlt.length > 0 ? (
                <div role="alertdialog" aria-label={t("bestaetigung.titel")} className="space-y-2 rounded-lg border border-destructive/60 bg-destructive/5 p-3">
                  <p className="text-xs font-semibold text-destructive">{t("bestaetigung.titel")}</p>
                  <p className="text-[11px] text-card-foreground">{t("bestaetigung.warnung", { dokumente: ausgewaehlt.length, abschnitte: abschnitteGesamt })}</p>
                  <ul className="max-h-40 list-disc space-y-0.5 overflow-auto pl-5 text-[11px] text-card-foreground">
                    {ausgewaehlt.map((b) => (
                      <li key={b.dokument.schluessel}>
                        {b.dokument.titel} <span className="text-muted-foreground">({b.dokument.chunks})</span>
                      </li>
                    ))}
                  </ul>
                  <label className="block space-y-0.5">
                    <span className="text-[11px] font-semibold text-card-foreground">{t("bestaetigung.grund")}</span>
                    <input type="text" maxLength={300} value={grund} onChange={(e) => setGrund(e.target.value)} placeholder={t("bestaetigung.grundBeispiel")} className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground" />
                  </label>
                  <label className="flex items-start gap-2 text-[11px] text-card-foreground">
                    <input type="checkbox" className="mt-0.5" checked={geprueft} onChange={(e) => setGeprueft(e.target.checked)} />
                    <span>{t("bestaetigung.geprueft")}</span>
                  </label>
                  <label className="block space-y-0.5">
                    <span className="text-[11px] font-semibold text-card-foreground">{t("bestaetigung.zahl", { anzahl: ausgewaehlt.length })}</span>
                    <input type="text" inputMode="numeric" value={zahl} onChange={(e) => setZahl(e.target.value)} className="w-24 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground" />
                  </label>
                  <div className="flex gap-2">
                    <button type="button" disabled={!kannEntfernen} onClick={() => void entferne()} className="inline-flex h-8 items-center rounded-lg bg-destructive px-3 text-xs font-semibold text-destructive-foreground disabled:opacity-50">
                      {laeuftEntfernen ? t("bestaetigung.laeuft") : t("bestaetigung.los")}
                    </button>
                    <button type="button" disabled={laeuftEntfernen} onClick={() => setBestaetigen(false)} className={buttonKlasse}>
                      {t("bestaetigung.zurueck")}
                    </button>
                  </div>
                </div>
              ) : null}

              <ul className="space-y-2">
                {sichtbar.map((b) => (
                  <li key={b.dokument.schluessel} className="rounded-lg border border-border p-2.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <label className="flex min-w-0 flex-1 items-start gap-2 text-xs font-semibold text-card-foreground">
                        <input type="checkbox" className="mt-0.5" disabled={!waehlbar(b)} checked={gewaehlt.has(b.dokument.schluessel)} onChange={() => schalte(b.dokument.schluessel)} aria-label={t("auswaehlen", { titel: b.dokument.titel })} />
                        <span className="break-words">{b.dokument.titel}</span>
                      </label>
                      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                        <StatusPill tone={STUFEN_TON[b.stufe]}>{t(`stufe.${b.stufe}` as never)}</StatusPill>
                        <StatusPill tone="neutral">{b.dokument.herkunft === "upload" ? t("herkunft.upload") : t("herkunft.bestand")}</StatusPill>
                      </div>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">{t("umfang", { abschnitte: b.dokument.chunks })}</p>
                    <ul className="mt-1.5 space-y-1">
                      {b.befunde.map((f, i) => (
                        <li key={`${f.grund}-${i}`} className="text-[11px] text-card-foreground">
                          <span className="font-semibold">{t(`art.${f.art}` as never)}:</span>{" "}
                          {tt(`grund.${f.grund}`, { wert: f.wert ?? "", prozent: prozent(f.anteil), minimum: prozent(f.minimum) })}
                          {f.vergleichMit ? (
                            <>
                              {" "}
                              <button type="button" className="font-semibold underline" onClick={() => void vergleiche_laden(b, f.vergleichMit as string)}>
                                {vergleiche[`${b.dokument.schluessel}|${f.vergleichMit}`] ? t("vergleich.zu") : t("vergleich.an")}
                              </button>
                              {(() => {
                                const v = vergleiche[`${b.dokument.schluessel}|${f.vergleichMit}`];
                                if (!v) return null;
                                if (v.laedt) return <span className="ml-1 text-muted-foreground">{t("vergleich.laedt")}</span>;
                                if (v.fehler || v.paare.length === 0) return <span className="ml-1 text-destructive">{t("vergleich.keine")}</span>;
                                return (
                                  <div className="mt-1 space-y-2">
                                    {v.paare.map((p, k) => (
                                      <div key={k} className="grid gap-2 rounded-md border border-border p-2 sm:grid-cols-2">
                                        <div>
                                          <p className="text-[11px] font-semibold">{t("vergleich.dieses")}</p>
                                          <p className="whitespace-pre-wrap break-words text-[11px] text-muted-foreground">{p.bestand}</p>
                                        </div>
                                        <div>
                                          <p className="text-[11px] font-semibold">{t("vergleich.gegenueber", { titel: v.titel ?? "", prozent: Math.round(p.aehnlichkeit * 100) })}</p>
                                          <p className="whitespace-pre-wrap break-words text-[11px] text-muted-foreground">{p.gegenueber}</p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                );
                              })()}
                            </>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </FormularKarte>
  );
}
