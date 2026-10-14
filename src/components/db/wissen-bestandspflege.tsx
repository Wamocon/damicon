"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { StatusPill } from "@/components/ui/kit";
import { FormularKarte } from "@/components/db/formular-kit";
import {
  wissenBestandEntfernen,
  wissenQualitaetBerechnen,
  wissenBestandspflegeNaehe,
  wissenBestandspflegeStart,
  wissenBestandspflegeVergleich,
  type EntfernenAntwort,
  type VergleichPaar,
} from "@/lib/actions/wissen-bestandspflege";
import { baueBefunde, ohneEntfernte, PFLEGE, zaehleBefunde, type Befund, type BefundArt, type BefundStufe, type DokumentBefunde, type DokumentNaehe } from "@/lib/wissen/bestandspflege";

// Bestandspflege: Analysen der Wissensbasis (Arbeitsdokumente, ausdrücklich veraltet, Dubletten, durch Bücher abgedeckt, Wiedervorlage, Herkunft) und das
// Entfernen nach der Prüfung. Die Analyse verändert nichts und läuft in kleinen Schritten mit Fortschritt (die Server Action hat höchstens 60 Sekunden).
// Entfernt wird erst nach ausdrücklicher Bestätigung: Titel prüfen, Grund eintragen, die Zahl der Dokumente eintippen. Der Server prüft das noch einmal.

import type { WissenDokumentZeile } from "@/lib/wissen/dokumente-liste";

type Phase = "bereit" | "laeuft" | "fertig" | "fehler";
const ARTEN: BefundArt[] = ["arbeitsdokument", "veraltet", "dublette", "abgedeckt", "wiedervorlage", "herkunft"];
const STUFEN_TON: Record<BefundStufe, "danger" | "warning" | "info"> = { entfernen: "danger", pruefen: "warning", hinweis: "info" };
const buttonKlasse = "inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs font-semibold disabled:opacity-50";
const prozent = (x: number | undefined) => Math.round((x ?? 0) * 100);
// Entfernen lassen sich nur Dokumente mit quelle_id (die Server Action löscht über sie).
const waehlbar = (b: DokumentBefunde) => b.dokument.schluesselSpalte === "quelle_id";

interface Vergleich {
  laedt: boolean;
  paare: VergleichPaar[];
  titel: string | null;
  fehler: boolean;
}

export function WissenBestandspflege({ dokumente, beiFertig }: { dokumente?: readonly WissenDokumentZeile[] | null; beiFertig: () => void }) {
  const t = useTranslations("kiAssistentAnsicht.wissensVerwaltung.pflege");
  const [artFilter, setArtFilter] = useState<BefundArt | null>(null);
  const [gewaehlt, setGewaehlt] = useState<ReadonlySet<string>>(new Set());
  const [bestaetigen, setBestaetigen] = useState(false);
  const [grund, setGrund] = useState("");
  const [geprueft, setGeprueft] = useState(false);
  const [zahl, setZahl] = useState("");
  const [laeuftEntfernen, setLaeuftEntfernen] = useState(false);
  const [antwort, setAntwort] = useState<EntfernenAntwort | null>(null);
  const vergleich = useVergleiche();
  // Eine neue Analyse beginnt ohne Auswahl, ohne offene Vergleiche, ohne altes Ergebnis und ohne offene Bestätigung.
  const analyse = useBestandsanalyse(() => {
    setGewaehlt(new Set());
    vergleich.leeren();
    setAntwort(null);
    setBestaetigen(false);
  });
  const { phase, befunde } = analyse;

  const sichtbar = artFilter ? befunde.filter((b) => b.befunde.some((x) => x.art === artFilter)) : befunde;
  const schalte = (schluessel: string) =>
    setGewaehlt((alt) => {
      const neu = new Set(alt);
      if (!neu.delete(schluessel)) neu.add(schluessel);
      return neu;
    });

  const ausgewaehlt = befunde.filter((b) => gewaehlt.has(b.dokument.schluessel));
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
      analyse.setBefunde((alt) => ohneEntfernte(alt, weg));
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

  return (
    <FormularKarte titel={t("titel")} beschreibung={t("lead")}>
      <label className="flex items-start gap-2 text-xs text-card-foreground">
        <input type="checkbox" className="mt-0.5" checked={analyse.mitVergleich} disabled={phase === "laeuft"} onChange={(e) => analyse.setMitVergleich(e.target.checked)} />
        <span>
          <span className="font-semibold">{t("mitVergleich")}</span>
          <span className="block text-[11px] text-muted-foreground">{t("mitVergleichHinweis")}</span>
        </span>
      </label>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" disabled={phase === "laeuft"} onClick={() => void analyse.analysiere()} className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50">
          {phase === "fertig" ? t("nochmal") : t("start")}
        </button>
        {phase === "laeuft" ? (
          <button type="button" onClick={analyse.abbrechen} className={buttonKlasse}>
            {t("abbrechen")}
          </button>
        ) : null}
      </div>

      <PflegeQualitaet dokumente={dokumente} beiFertig={beiFertig} />
      <PflegeFortschritt phase={phase} fortschritt={analyse.fortschritt} />
      {antwort ? <PflegeErgebnis antwort={antwort} /> : null}

      {phase === "fertig" ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-semibold text-card-foreground">{befunde.length === 0 ? t("keineBefunde", { anzahl: analyse.anzahlGeprueft }) : t("zusammenfassung", { befunde: befunde.length, gesamt: analyse.anzahlGeprueft })}</p>

          {befunde.length > 0 ? (
            <>
              <ArtFilterLeiste befunde={befunde} artFilter={artFilter} beiWahl={setArtFilter} />
              <AuswahlLeiste sichtbar={sichtbar} anzahl={gewaehlt.size} beiAuswahl={setGewaehlt} beiEntfernen={() => setBestaetigen(true)} />

              {bestaetigen && ausgewaehlt.length > 0 ? (
                <EntfernenBestaetigung
                  ausgewaehlt={ausgewaehlt}
                  formular={{ grund, setGrund, geprueft, setGeprueft, zahl, setZahl }}
                  kannEntfernen={kannEntfernen}
                  laeuft={laeuftEntfernen}
                  beiEntfernen={() => void entferne()}
                  beiZurueck={() => setBestaetigen(false)}
                />
              ) : null}

              <ul className="space-y-2">
                {sichtbar.map((b) => (
                  <BefundEintrag key={b.dokument.schluessel} b={b} gewaehlt={gewaehlt.has(b.dokument.schluessel)} beiWahl={() => schalte(b.dokument.schluessel)} vergleiche={vergleich.vergleiche} beiVergleich={vergleich.schalte} />
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </FormularKarte>
  );
}

/** Die Analyse des Bestands: erst die Liste mit den schnellen Prüfungen, auf Wunsch der inhaltliche Vergleich in Paketen mit Fortschritt. */
function useBestandsanalyse(vorStart: () => void) {
  const [phase, setPhase] = useState<Phase>("bereit");
  const [mitVergleich, setMitVergleich] = useState(true);
  const [fortschritt, setFortschritt] = useState<{ fertig: number; gesamt: number } | null>(null);
  const [befunde, setBefunde] = useState<DokumentBefunde[]>([]);
  const [anzahlGeprueft, setAnzahlGeprueft] = useState(0);
  const abbruch = useRef(false);

  const analysiere = async () => {
    setPhase("laeuft");
    setBefunde([]);
    vorStart();
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
        for (let i = 0; i < start.fuerNaehe.length; i += PFLEGE.naeheJeAufruf) {
          if (abbruch.current) break;
          const teil = start.fuerNaehe.slice(i, i + PFLEGE.naeheJeAufruf);
          const r = await wissenBestandspflegeNaehe(teil);
          if (r.fehler) {
            setPhase("fehler");
            return;
          }
          for (const n of r.naehe) naehe.set(n.schluessel, n);
          setFortschritt({ fertig: Math.min(i + PFLEGE.naeheJeAufruf, start.fuerNaehe.length), gesamt: start.fuerNaehe.length });
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

  const abbrechen = () => {
    abbruch.current = true;
  };
  return { phase, mitVergleich, setMitVergleich, fortschritt, befunde, setBefunde, anzahlGeprueft, analysiere, abbrechen };
}

/** Die Vergleichsansicht je Befund (Dokument und ähnliches Dokument): Der erste Klick lädt sie, der nächste schließt sie wieder. */
function useVergleiche() {
  const [vergleiche, setVergleiche] = useState<Record<string, Vergleich>>({});
  const schalte = async (b: DokumentBefunde, andere: string) => {
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
  return { vergleiche, schalte, leeren: () => setVergleiche({}) };
}

/** Qualität in Prozent: für Dokumente ohne Wert berechnen und ablegen (die Liste zeigt sie danach an). */
function PflegeQualitaet({ dokumente, beiFertig }: { dokumente?: readonly WissenDokumentZeile[] | null; beiFertig: () => void }) {
  const t = useTranslations("kiAssistentAnsicht.wissensVerwaltung.pflege");
  const [qualitaet, setQualitaet] = useState<{ fertig: number; gesamt: number; laeuft: boolean } | null>(null);
  const ohneQualitaet = (dokumente ?? []).filter((d) => d.gueteProzent === null && d.schluesselSpalte === "quelle_id" && d.chunks > 0);

  const berechneQualitaet = async () => {
    const ids = ohneQualitaet.map((d) => d.schluessel);
    setQualitaet({ fertig: 0, gesamt: ids.length, laeuft: true });
    try {
      for (let i = 0; i < ids.length; i += PFLEGE.qualitaetJeAufruf) {
        const r = await wissenQualitaetBerechnen(ids.slice(i, i + PFLEGE.qualitaetJeAufruf));
        if (!r.zugriff) break;
        setQualitaet({ fertig: Math.min(i + PFLEGE.qualitaetJeAufruf, ids.length), gesamt: ids.length, laeuft: true });
      }
    } finally {
      setQualitaet((alt) => (alt ? { ...alt, laeuft: false } : alt));
      beiFertig();
    }
  };

  return (
    <div className="mt-3 space-y-1 border-t border-border pt-2">
      <p className="text-[11px] text-muted-foreground">{t("qualitaet.hinweis", { anzahl: ohneQualitaet.length })}</p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={qualitaet?.laeuft === true || ohneQualitaet.length === 0} onClick={() => void berechneQualitaet()} className={buttonKlasse}>
          {t("qualitaet.knopf")}
        </button>
        {qualitaet ? (
          <span role="status" aria-live="polite" className="text-[11px] font-semibold text-card-foreground">
            {qualitaet.laeuft ? t("qualitaet.fortschritt", { fertig: qualitaet.fertig, gesamt: qualitaet.gesamt }) : t("qualitaet.fertig", { anzahl: qualitaet.gesamt })}
          </span>
        ) : null}
      </div>
      {qualitaet?.laeuft ? <progress className="h-1.5 w-full" max={Math.max(1, qualitaet.gesamt)} value={qualitaet.fertig} aria-label={t("qualitaet.balken")} /> : null}
    </div>
  );
}

/** Während der Analyse der Fortschritt (erst die Liste, dann der Vergleich), danach gegebenenfalls der Fehler. */
export function PflegeFortschritt({ phase, fortschritt }: { phase: Phase; fortschritt: { fertig: number; gesamt: number } | null }) {
  const t = useTranslations("kiAssistentAnsicht.wissensVerwaltung.pflege");
  return (
    <>
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
    </>
  );
}

/** Das Ergebnis des Entfernens: fehlende Berechtigung, falsche Bestätigung, entfernt, schon weg, Wortgewichte offen und jeder Fehler einzeln. */
export function PflegeErgebnis({ antwort }: { antwort: EntfernenAntwort }) {
  const t = useTranslations("kiAssistentAnsicht.wissensVerwaltung.pflege");
  return (
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
  );
}

/** Filter nach Art des Befunds: alle oder eine Art (nur Arten, die vorkommen, mit ihrer Zahl); ein zweiter Klick hebt den Filter auf. */
export function ArtFilterLeiste({ befunde, artFilter, beiWahl }: { befunde: DokumentBefunde[]; artFilter: BefundArt | null; beiWahl: (art: BefundArt | null) => void }) {
  const t = useTranslations("kiAssistentAnsicht.wissensVerwaltung.pflege");
  const zaehlung = zaehleBefunde(befunde);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" aria-pressed={artFilter === null} onClick={() => beiWahl(null)} className={`${buttonKlasse} ${artFilter === null ? "bg-muted" : ""}`}>
        {t("filter.alle", { anzahl: befunde.length })}
      </button>
      {ARTEN.filter((a) => zaehlung.art[a] > 0).map((a) => (
        <button key={a} type="button" aria-pressed={artFilter === a} onClick={() => beiWahl(artFilter === a ? null : a)} className={`${buttonKlasse} ${artFilter === a ? "bg-muted" : ""}`}>
          {t(`art.${a}` as never)} ({zaehlung.art[a]})
        </button>
      ))}
    </div>
  );
}

/** Auswahl: alle Vorschläge zum Entfernen (unter den sichtbaren), keine, die Zahl der gewählten und der Weg zur Bestätigung. */
function AuswahlLeiste({
  sichtbar,
  anzahl,
  beiAuswahl,
  beiEntfernen,
}: {
  sichtbar: DokumentBefunde[];
  anzahl: number;
  beiAuswahl: (neu: ReadonlySet<string>) => void;
  beiEntfernen: () => void;
}) {
  const t = useTranslations("kiAssistentAnsicht.wissensVerwaltung.pflege");
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px]">
      <button
        type="button"
        className="font-semibold underline"
        onClick={() => beiAuswahl(new Set(sichtbar.filter((b) => b.stufe === "entfernen" && waehlbar(b)).map((b) => b.dokument.schluessel)))}
      >
        {t("auswahl.vorschlaege")}
      </button>
      <button type="button" className="font-semibold underline" onClick={() => beiAuswahl(new Set())}>
        {t("auswahl.keine")}
      </button>
      <span className="text-muted-foreground">{t("auswahl.gewaehlt", { anzahl })}</span>
      <button type="button" disabled={anzahl === 0} onClick={beiEntfernen} className="ml-auto inline-flex h-8 items-center rounded-lg border border-destructive px-3 text-xs font-semibold text-destructive disabled:opacity-50">
        {t("auswahl.entfernen", { anzahl })}
      </button>
    </div>
  );
}

/** Die Bestätigung vor dem Entfernen: Liste der Dokumente, Grund, Haken und die eingetippte Zahl der Dokumente. */
export function EntfernenBestaetigung({
  ausgewaehlt,
  formular,
  kannEntfernen,
  laeuft,
  beiEntfernen,
  beiZurueck,
}: {
  ausgewaehlt: DokumentBefunde[];
  formular: { grund: string; setGrund: (wert: string) => void; geprueft: boolean; setGeprueft: (wert: boolean) => void; zahl: string; setZahl: (wert: string) => void };
  kannEntfernen: boolean;
  laeuft: boolean;
  beiEntfernen: () => void;
  beiZurueck: () => void;
}) {
  const t = useTranslations("kiAssistentAnsicht.wissensVerwaltung.pflege");
  const abschnitteGesamt = ausgewaehlt.reduce((s, b) => s + b.dokument.chunks, 0);
  return (
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
        <input type="text" maxLength={300} value={formular.grund} onChange={(e) => formular.setGrund(e.target.value)} placeholder={t("bestaetigung.grundBeispiel")} className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground" />
      </label>
      <label className="flex items-start gap-2 text-[11px] text-card-foreground">
        <input type="checkbox" className="mt-0.5" checked={formular.geprueft} onChange={(e) => formular.setGeprueft(e.target.checked)} />
        <span>{t("bestaetigung.geprueft")}</span>
      </label>
      <label className="block space-y-0.5">
        <span className="text-[11px] font-semibold text-card-foreground">{t("bestaetigung.zahl", { anzahl: ausgewaehlt.length })}</span>
        <input type="text" inputMode="numeric" value={formular.zahl} onChange={(e) => formular.setZahl(e.target.value)} className="w-24 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground" />
      </label>
      <div className="flex gap-2">
        <button type="button" disabled={!kannEntfernen} onClick={beiEntfernen} className="inline-flex h-8 items-center rounded-lg bg-destructive px-3 text-xs font-semibold text-destructive-foreground disabled:opacity-50">
          {laeuft ? t("bestaetigung.laeuft") : t("bestaetigung.los")}
        </button>
        <button type="button" disabled={laeuft} onClick={beiZurueck} className={buttonKlasse}>
          {t("bestaetigung.zurueck")}
        </button>
      </div>
    </div>
  );
}

/** Ein Dokument mit seinen Befunden: Auswahl (nur mit quelle_id), stärkste Stufe, Herkunft, Umfang und jeder Befund mit Begründung. */
export function BefundEintrag({
  b,
  gewaehlt,
  beiWahl,
  vergleiche,
  beiVergleich,
}: {
  b: DokumentBefunde;
  gewaehlt: boolean;
  beiWahl: () => void;
  vergleiche: Record<string, Vergleich>;
  beiVergleich: (b: DokumentBefunde, andere: string) => Promise<void>;
}) {
  const t = useTranslations("kiAssistentAnsicht.wissensVerwaltung.pflege");
  return (
    <li className="rounded-lg border border-border p-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <label className="flex min-w-0 flex-1 items-start gap-2 text-xs font-semibold text-card-foreground">
          <input type="checkbox" className="mt-0.5" disabled={!waehlbar(b)} checked={gewaehlt} onChange={beiWahl} aria-label={t("auswaehlen", { titel: b.dokument.titel })} />
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
          <BefundZeile key={`${f.grund}-${i}`} f={f} vergleich={f.vergleichMit ? vergleiche[`${b.dokument.schluessel}|${f.vergleichMit}`] : undefined} beiVergleich={() => void beiVergleich(b, f.vergleichMit as string)} />
        ))}
      </ul>
    </li>
  );
}

/** Ein Befund: Art und Begründung; bei Dubletten und Abdeckung der Knopf zum Vergleich und der Vergleich selbst. */
function BefundZeile({ f, vergleich, beiVergleich }: { f: Befund; vergleich: Vergleich | undefined; beiVergleich: () => void }) {
  const t = useTranslations("kiAssistentAnsicht.wissensVerwaltung.pflege");
  // Schlüssel mit Platzhaltern, die erst zur Laufzeit feststehen (Art des Befunds): ohne die strenge Schlüsselprüfung der Übersetzung.
  const tt = t as unknown as (schluessel: string, werte?: Record<string, string | number>) => string;
  return (
    <li className="text-[11px] text-card-foreground">
      <span className="font-semibold">{t(`art.${f.art}` as never)}:</span>{" "}
      {tt(`grund.${f.grund}`, { wert: f.wert ?? "", prozent: prozent(f.anteil), minimum: prozent(f.minimum) })}
      {f.vergleichMit ? (
        <>
          {" "}
          <button type="button" className="font-semibold underline" onClick={beiVergleich}>
            {vergleich ? t("vergleich.zu") : t("vergleich.an")}
          </button>
          <VergleichAnzeige v={vergleich} />
        </>
      ) : null}
    </li>
  );
}

/** Der Vergleich im Wortlaut: bis zu zwei Abschnitte dieses Dokuments neben dem ähnlichsten Abschnitt des anderen. */
function VergleichAnzeige({ v }: { v: Vergleich | undefined }) {
  const t = useTranslations("kiAssistentAnsicht.wissensVerwaltung.pflege");
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
}
