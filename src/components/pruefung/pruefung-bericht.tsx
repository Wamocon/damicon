"use client";

import { Fragment, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Database, FileDown, FileJson, FileWarning, ShieldCheck, TriangleAlert } from "lucide-react";
import { berichtAlsPdfSpeichern } from "@/components/pruefung/bericht-pdf";
import { BEREICH_SYMBOL } from "@/components/pruefung/symbole";
import { BelegAnbieter, QuellenListe, ZitatMarke } from "@/components/ki/ki-quellen";
import { siegelGueltig } from "@/lib/pruefung/befund";
import { PRUEFBEREICHE, type Pruefbereich } from "@/lib/pruefung/rollen";
import { FRISTEN, type Befund, type Bericht } from "@/lib/pruefung/typen";
import { cn } from "@/lib/utils";

// Der Bericht: Pruefungsreife auf einen Blick, dann jeder Befund mit Zitatmarken, Quellenkarten und
// den Betriebsdaten, auf denen er beruht, der Massnahmenplan nach Frist und das Siegel. Wer das Siegel
// pruefen will, rechnet die Pruefsumme im Browser neu: jede nachtraegliche Aenderung faellt auf.

const FRIST_SCHLUESSEL: Record<string, string> = { sofort: "sofort", "7 Tage": "tage7", "30 Tage": "tage30", "90 Tage": "tage90" };

/** Text mit [S12]-Kennungen: jede Kennung wird zur Zitatmarke mit Vorschau. */
function MitZitaten({ text }: { text: string }) {
  const teile = text.split(/(\[S\d{1,3}\])/g);
  return (
    <>
      {teile.map((teil, i) => {
        const m = /^\[(S\d{1,3})\]$/.exec(teil);
        return m ? <ZitatMarke key={i} kennung={m[1]!} /> : <Fragment key={i}>{teil}</Fragment>;
      })}
    </>
  );
}

export function BefundKarte({ b, belege, index }: { b: Befund; belege: Bericht["belege"]; index: number }) {
  const t = useTranslations("pruefung");
  const [erledigt, setErledigt] = useState<ReadonlySet<number>>(new Set());
  const eigene = belege.filter((x) => b.belege.includes(x.id));
  return (
    <li className="pr-befund" data-status={b.status} style={{ ["--i" as string]: index }}>
      <div className="pr-befund__kopf" data-bereich={b.bereich}>
        <span className="pr-status" data-status={b.status}>
          {b.status === "konform" ? <CheckCircle2 className="h-3 w-3" /> : <TriangleAlert className="h-3 w-3" />}
          {t(`status.${b.status}`)}
        </span>
        {b.schwere !== "keine" ? <span className="pr-chip">{t(`schwere.${b.schwere}`)}</span> : null}
        <h4 className="pr-befund__titel">{b.titel}</h4>
        <span className="pr-bereichsmarke">{t(`bereich.${b.bereich}.name`)}</span>
      </div>
      <BelegAnbieter nachrichtId={b.id} belege={eigene}>
        <p className="pr-befund__text">
          <MitZitaten text={b.befund} />
          {b.belege
            .filter((id) => !b.befund.includes(`[${id}]`))
            .map((id) => (
              <ZitatMarke key={id} kennung={id} />
            ))}
        </p>
        {b.ohneRechtsbeleg ? (
          <p className="pr-warnzeile">
            <FileWarning className="h-3.5 w-3.5" /> {t("bericht.ohneRechtsbeleg")}
          </p>
        ) : null}
        {b.ohneDaten ? (
          <p className="pr-warnzeile">
            <Database className="h-3.5 w-3.5" /> {t("bericht.ohneDaten")}
          </p>
        ) : null}
        {b.nachweise.length > 0 ? (
          <ul className="pr-nachweise" aria-label={t("bericht.nachweise")}>
            {b.nachweise.map((n) => (
              <li key={n.quelle}>
                <Database className="mr-1 inline h-3 w-3" />
                {t("bericht.betriebsdaten")}: <code>{n.quelle}</code> · SHA-256 <code>{n.hash.slice(0, 12)}</code>
              </li>
            ))}
          </ul>
        ) : null}
        {b.massnahmen.length > 0 ? (
          <ul className="pr-massnahmen">
            {b.massnahmen.map((m, i) => (
              <li key={i}>
                <label className="pr-massnahme" data-erledigt={erledigt.has(i) ? "ja" : "nein"}>
                  <input
                    type="checkbox"
                    checked={erledigt.has(i)}
                    onChange={() => setErledigt((v) => { const n = new Set(v); if (n.has(i)) n.delete(i); else n.add(i); return n; })}
                  />
                  <span>
                    {m.schritt}
                    <span className="pr-chip" data-frist={m.frist}>{t(`frist.${FRIST_SCHLUESSEL[m.frist]}`)}</span>
                    <span className="pr-chip">{t(`rolle.${m.verantwortlich}`)}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        ) : null}
        <QuellenListe nachrichtId={b.id} belege={eigene} zitiert={b.belege} />
      </BelegAnbieter>
    </li>
  );
}

/** Reife-Kachel, Urteil, Zusammenfassung und Status-Zeile - fuer sich lesbar, deshalb eigens exportiert
 *  (wiederverwendet von der CEO-Bereichsuebersicht, ceo-bereichs-kacheln.tsx). */
export function Kopfkarte({ bericht }: { bericht: Bericht }) {
  const t = useTranslations("pruefung");
  const kz = bericht.kennzahlen;
  const ziel = 301.6 * (1 - kz.reife / 100);
  return (
    <div className="pr-kopfkarte" data-stufe={kz.stufe}>
      <div className="pr-messer" style={{ ["--ziel" as string]: ziel }}>
        <svg viewBox="0 0 110 110" aria-hidden>
          <circle className="pr-messer__spur" cx="55" cy="55" r="48" />
          <circle className="pr-messer__wert" cx="55" cy="55" r="48" />
        </svg>
        <div className="pr-messer__mitte">
          <span className="pr-messer__zahl">{kz.reife}</span>
          <span className="pr-messer__label">{t("bericht.reife")}</span>
        </div>
      </div>
      <div>
        <p className="pr-urteil">{t(`stufe.${kz.stufe}`)}</p>
        <p className="pr-zusammenfassung">{bericht.zusammenfassung}</p>
        <div className="pr-zahlenleiste">
          {(["verstoss", "luecke", "hinweis", "konform"] as const).map((s) => (
            <span key={s} className="pr-status" data-status={s}>
              {kz.nachStatus[s]} {t(`status.${s}`)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Prioritaeten({ bericht }: { bericht: Bericht }) {
  const t = useTranslations("pruefung");
  if (bericht.prioritaeten.length === 0) return null;
  return (
    <div>
      <h3 className="pr-abschnitt__titel">{t("bericht.prioritaeten")}</h3>
      <ol className="pr-prioritaeten">
        {bericht.prioritaeten.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ol>
    </div>
  );
}

export function Massnahmenplan({ bericht }: { bericht: Bericht }) {
  const t = useTranslations("pruefung");
  const [nurMeine, setNurMeine] = useState(false);
  const plan = useMemo(() => bericht.massnahmen.filter((m) => !nurMeine || m.verantwortlich === bericht.ersteller.rolle), [bericht.massnahmen, bericht.ersteller.rolle, nurMeine]);
  return (
    <div>
      <h3 className="pr-abschnitt__titel">{t("bericht.massnahmen")}</h3>
      <div className="pr-filter">
        <button type="button" aria-pressed={!nurMeine} onClick={() => setNurMeine(false)}>{t("bericht.alle")}</button>
        <button type="button" aria-pressed={nurMeine} onClick={() => setNurMeine(true)}>{t("bericht.nurMeine")}</button>
      </div>
      <div className="pr-plan">
        {FRISTEN.map((f) => {
          const liste = plan.filter((m) => m.frist === f);
          return (
            <div key={f} className="pr-plan__spalte">
              <h4 className="pr-abschnitt__titel">
                {t(`frist.${FRIST_SCHLUESSEL[f]}`)} ({liste.length})
              </h4>
              <ul className="pr-massnahmen">
                {liste.map((m, i) => (
                  <li key={i} className="pr-massnahme">
                    <span>
                      {m.schritt}
                      <span className="pr-chip">{t(`rolle.${m.verantwortlich}`)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Hinweise({ bericht }: { bericht: Bericht }) {
  const t = useTranslations("pruefung");
  if (bericht.hinweise.length === 0 && bericht.vollstaendig) return null;
  return (
    <div>
      <h3 className="pr-abschnitt__titel">{t("bericht.hinweise")}</h3>
      <ul className="pr-nachweise">
        {!bericht.vollstaendig ? <li>{t("bericht.unvollstaendig")}</li> : null}
        {bericht.hinweise.map((h, i) => (
          <li key={i}>{h}</li>
        ))}
      </ul>
    </div>
  );
}

export function Siegel({ bericht }: { bericht: Bericht }) {
  const t = useTranslations("pruefung");
  const tp = useTranslations("pruefungPdf");
  const [siegel, setSiegel] = useState<"offen" | "ja" | "nein">("offen");

  const pruefen = async () => setSiegel((await siegelGueltig(bericht)) ? "ja" : "nein");
  const alsPdf = () => berichtAlsPdfSpeichern(bericht, { t: (k, w) => t(k, w), p: (k, w) => tp(k, w) });
  const exportieren = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(bericht, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `compliance-pruefung-${bericht.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="pr-siegel">
      <h3 className="pr-abschnitt__titel" style={{ margin: 0 }}>
        <ShieldCheck className="mr-1 inline h-4 w-4" /> {t("siegel.titel")}
      </h3>
      <dl>
        <dt>{t("siegel.id")}</dt>
        <dd><code>{bericht.id}</code></dd>
        <dt>{t("siegel.erstellt")}</dt>
        <dd>{new Date(bericht.erstelltAm).toLocaleString()} · {bericht.ersteller.name} ({t(`rolle.${bericht.ersteller.rolle}`)})</dd>
        <dt>{t("siegel.modell")}</dt>
        <dd>{bericht.modell}</dd>
        <dt>{t("siegel.pruefsumme")}</dt>
        <dd><code>{bericht.siegel.algorithmus} {bericht.siegel.wert}</code></dd>
      </dl>
      <div className="pr-siegel__aktionen">
        <button type="button" className="pr-knopf" onClick={pruefen}>
          <ShieldCheck className="h-4 w-4" /> {t("siegel.pruefen")}
        </button>
        <button type="button" className="pr-knopf pr-knopf--haupt" onClick={alsPdf}>
          <FileDown className="h-4 w-4" /> {tp("speichern")}
        </button>
        <button type="button" className="pr-knopf" onClick={exportieren}>
          <FileJson className="h-4 w-4" /> {tp("json")}
        </button>
      </div>
      <p className="pr-tipp">{tp("tipp")}</p>
      {siegel !== "offen" ? (
        <p className={cn("pr-siegel__urteil")} data-ok={siegel} role="status">
          {siegel === "ja" ? t("siegel.gueltig") : t("siegel.ungueltig")}
        </p>
      ) : null}
    </div>
  );
}

export function PruefungBericht({ bericht }: { bericht: Bericht }) {
  const t = useTranslations("pruefung");
  const [filter, setFilter] = useState<Pruefbereich | "alle">("alle");
  const bereiche = PRUEFBEREICHE.filter((b) => bericht.bereiche.includes(b));
  const befunde = useMemo(() => bericht.befunde.filter((b) => filter === "alle" || b.bereich === filter), [bericht.befunde, filter]);

  return (
    <section className="pr-bericht" aria-label={t("bericht.titel")}>
      <Kopfkarte bericht={bericht} />
      <Prioritaeten bericht={bericht} />

      <div>
        <h3 className="pr-abschnitt__titel">{t("bericht.befunde")}</h3>
        <div className="pr-filter" role="group" aria-label={t("bericht.befunde")}>
          <button type="button" aria-pressed={filter === "alle"} onClick={() => setFilter("alle")}>
            {t("bericht.alle")} ({bericht.befunde.length})
          </button>
          {bereiche.map((b) => {
            const Symbol = BEREICH_SYMBOL[b];
            return (
              <button key={b} type="button" data-bereich={b} aria-pressed={filter === b} onClick={() => setFilter(b)}>
                <Symbol className="mr-1 inline h-3 w-3" />
                {t(`bereich.${b}.name`)} ({bericht.befunde.filter((x) => x.bereich === b).length})
              </button>
            );
          })}
        </div>
        <ul className="pr-befunde">
          {befunde.map((b, i) => (
            <BefundKarte key={b.id} b={b} belege={bericht.belege} index={i} />
          ))}
        </ul>
      </div>

      <Massnahmenplan bericht={bericht} />
      <Hinweise bericht={bericht} />
      <Siegel bericht={bericht} />
    </section>
  );
}
