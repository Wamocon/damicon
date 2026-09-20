"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, ListChecks, MessageCircle, Sparkles } from "lucide-react";
import { useKiPane } from "@/components/ki/ki-pane-kontext";
import { checklisteAus, fortschritt, type ChecklistenPunkt } from "@/lib/pruefung/checkliste";
import { berichtKontext } from "@/lib/pruefung/kontext";
import { FRISTEN, type Bericht } from "@/lib/pruefung/typen";

// Nach der Prüfung: "Nächste Schritte". Zwei Dinge, beide AUSSERHALB des Berichts (der bleibt versiegelt und unverändert):
//   1. das Ergebnis im Chat besprechen: der Assistent setzt auf genau diesem Bericht auf (Kontext), kann nachfragen
//      beantworten und mit der Wissensbasis vertiefen
//   2. die Maßnahmen-Checkliste: aus den Befunden abgeleitet, nach Frist geordnet, abhakbar. Der Stand bleibt im Browser
//      (je Bericht), damit man an einem anderen Tag weitermachen kann.

const FRIST_SCHLUESSEL: Record<string, string> = { sofort: "sofort", "7 Tage": "tage7", "30 Tage": "tage30", "90 Tage": "tage90" };
const speicherSchluessel = (berichtId: string) => `damicon-checkliste-${berichtId}`;

function leseErledigt(berichtId: string): ReadonlySet<string> {
  try {
    const roh = window.localStorage.getItem(speicherSchluessel(berichtId));
    const liste: unknown = roh ? JSON.parse(roh) : [];
    return new Set(Array.isArray(liste) ? liste.filter((x): x is string => typeof x === "string") : []);
  } catch {
    // Speicher gesperrt oder beschädigt: die Checkliste gilt dann nur für diese Ansicht.
    return new Set();
  }
}

/** Der Stand je Bericht liegt im Browser. Die Ansicht wird nur im Browser gezeichnet (nach der Prüfung) und je Bericht neu eingehängt (key), deshalb genügt das Lesen beim Start. */
function useErledigt(berichtId: string): readonly [ReadonlySet<string>, (id: string) => void] {
  const [erledigt, setErledigt] = useState<ReadonlySet<string>>(() => leseErledigt(berichtId));
  const umschalten = (id: string) =>
    setErledigt((alt) => {
      const neu = new Set(alt);
      if (neu.has(id)) neu.delete(id);
      else neu.add(id);
      try {
        window.localStorage.setItem(speicherSchluessel(berichtId), JSON.stringify([...neu]));
      } catch {
        // siehe oben
      }
      return neu;
    });
  return [erledigt, umschalten] as const;
}

export function PruefungNachbereitung({ bericht }: { bericht: Bericht }) {
  const t = useTranslations("pruefung");
  const { starteGespraechZurPruefung } = useKiPane();
  const punkte = useMemo(() => checklisteAus(bericht), [bericht]);
  const [erledigt, umschalten] = useErledigt(bericht.id);
  const stand = fortschritt(punkte, erledigt);

  const kontext = useMemo(() => berichtKontext(bericht), [bericht]);
  const besprechen = (frage: string) => starteGespraechZurPruefung({ id: bericht.id, kontext }, frage);
  const frageZu = (p: ChecklistenPunkt) =>
    p.art === "pruefen" ? t("nachbereitung.frageHinweis", { titel: p.titel }) : t("nachbereitung.frageMassnahme", { titel: p.titel, schritt: p.schritt });

  return (
    <section className="pn" aria-label={t("nachbereitung.titel")}>
      <header className="pn-kopf">
        <span className="pn-kopf__zeichen" aria-hidden>
          <ListChecks className="h-4 w-4" />
        </span>
        <div>
          <h3>{t("nachbereitung.titel")}</h3>
          <p>{t("nachbereitung.lead")}</p>
        </div>
      </header>

      <div className="pn-aktionen">
        <button type="button" className="pr-knopf pr-knopf--haupt" onClick={() => besprechen(t("nachbereitung.frageStart"))}>
          <MessageCircle className="h-4 w-4" /> {t("nachbereitung.besprechen")}
        </button>
        {punkte.length > 0 ? (
          <button type="button" className="pr-knopf" onClick={() => besprechen(t("nachbereitung.fragePlan"))}>
            <Sparkles className="h-4 w-4" /> {t("nachbereitung.plan")}
          </button>
        ) : null}
      </div>

      <div className="pn-liste">
        <div className="pn-liste__kopf">
          <h4>{t("nachbereitung.checkliste")}</h4>
          <span className="pn-zahl" aria-live="polite">
            {t("nachbereitung.fortschritt", { erledigt: stand.erledigt, gesamt: stand.gesamt })}
          </span>
        </div>
        <div className="pn-balken" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={stand.prozent} aria-label={t("nachbereitung.checkliste")}>
          <span style={{ transform: `scaleX(${stand.prozent / 100})` }} data-fertig={stand.prozent === 100 ? "ja" : "nein"} />
        </div>

        {punkte.length === 0 ? (
          <p className="pn-leer">
            <CheckCircle2 className="h-4 w-4" aria-hidden /> {t("nachbereitung.leer")}
          </p>
        ) : (
          FRISTEN.map((frist) => {
            const gruppe = punkte.filter((p) => p.frist === frist);
            if (gruppe.length === 0) return null;
            return (
              <div key={frist} className="pn-gruppe">
                <h5>
                  <span className="pr-chip" data-frist={frist}>{t(`frist.${FRIST_SCHLUESSEL[frist]}`)}</span>
                  <small>{gruppe.filter((p) => erledigt.has(p.id)).length} / {gruppe.length}</small>
                </h5>
                <ul>
                  {gruppe.map((p) => (
                    <li key={p.id} className="pn-punkt" data-erledigt={erledigt.has(p.id) ? "ja" : "nein"} data-schwere={p.schwere}>
                      <label>
                        <input type="checkbox" checked={erledigt.has(p.id)} onChange={() => umschalten(p.id)} />
                        <span className="pn-punkt__text">
                          <b>{p.titel}</b>
                          <span>{p.art === "pruefen" ? t("nachbereitung.pruefen") : p.schritt}</span>
                        </span>
                      </label>
                      <div className="pn-punkt__meta">
                        <span className="pr-chip">{t(`rolle.${p.verantwortlich}`)}</span>
                        {p.schwere !== "keine" ? <span className="pr-chip">{t(`schwere.${p.schwere}`)}</span> : null}
                        {p.grundlage.length > 0 ? (
                          <span className="pn-grundlage" title={p.grundlage.join("; ")}>
                            {t("nachbereitung.grundlage")}: {p.grundlage[0]}
                            {p.grundlage.length > 1 ? ` +${p.grundlage.length - 1}` : ""}
                          </span>
                        ) : null}
                        <button type="button" className="pn-punkt__frage" onClick={() => besprechen(frageZu(p))} aria-label={t("nachbereitung.loesung")} title={t("nachbereitung.loesung")}>
                          <MessageCircle className="h-3.5 w-3.5" />
                          <span>{t("nachbereitung.loesung")}</span>
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
        {punkte.length > 0 && stand.prozent === 100 ? <p className="pn-fertig">{t("nachbereitung.fertig")}</p> : null}
      </div>
    </section>
  );
}
