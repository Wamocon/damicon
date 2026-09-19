"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ExternalLink, FileText, TriangleAlert } from "lucide-react";
import { stufeSchluessel } from "@/lib/wissen/belege";
import type { Beleg } from "@/lib/wissen/suche";
import { cn } from "@/lib/utils";

// Belege im Chat: die Zitat-Marke im Text ([S1] wird zu einem kleinen Knopf "1") und
// unter der Antwort die Karten der zitierten Quellen mit der genauen Textstelle.
// So laesst sich jede Aussage bis zum Artikel, zum Stand und zum Original
// zurueckverfolgen. Eine Marke OHNE Beleg (das Modell zitiert eine Kennung, die das
// Werkzeug nie geliefert hat) wird sichtbar als "nicht belegt" gezeichnet, statt
// wie ein echter Verweis auszusehen.

interface BelegKontextWert {
  nachrichtId: string;
  belege: Map<string, Beleg>;
}

const BelegKontext = createContext<BelegKontextWert>({ nachrichtId: "", belege: new Map() });

export function BelegAnbieter({
  nachrichtId,
  belege,
  children,
}: {
  nachrichtId: string;
  belege: Beleg[];
  children: ReactNode;
}) {
  const wert = { nachrichtId, belege: new Map(belege.map((b) => [b.id, b])) };
  return <BelegKontext.Provider value={wert}>{children}</BelegKontext.Provider>;
}

const kartenId = (nachrichtId: string, kennung: string) => `quelle-${nachrichtId}-${kennung}`;

/** Die Marke im Fliesstext. */
export function ZitatMarke({ kennung }: { kennung: string }) {
  const t = useTranslations("kiAssistentAnsicht");
  const { nachrichtId, belege } = useContext(BelegKontext);
  const beleg = belege.get(kennung);
  if (!beleg) {
    return (
      <span className="ki-zitat ki-zitat--unbelegt" title={t("quellen.unbelegt")}>
        ?
      </span>
    );
  }
  return (
    <button
      type="button"
      className="ki-zitat"
      title={beleg.fundstelle}
      onClick={() => {
        const karte = document.getElementById(kartenId(nachrichtId, kennung));
        if (!karte) return;
        karte.scrollIntoView({ block: "nearest", behavior: "smooth" });
        karte.classList.remove("ki-quelle--blinkt");
        void karte.offsetWidth;
        karte.classList.add("ki-quelle--blinkt");
      }}
    >
      {kennung.slice(1)}
    </button>
  );
}

function Quellenkarte({ nachrichtId, beleg }: { nachrichtId: string; beleg: Beleg }) {
  const t = useTranslations("kiAssistentAnsicht");
  const [offen, setOffen] = useState(false);
  const stufe = stufeSchluessel(beleg.stufe);
  const nurAuskunft = beleg.stufe !== null && beleg.stufe >= 4;
  const lang = beleg.text.length > 360;
  return (
    <li id={kartenId(nachrichtId, beleg.id)} className={cn("ki-quelle", nurAuskunft && "ki-quelle--auskunft")}>
      <div className="ki-quelle__kopf">
        <span className="ki-quelle__nr">{beleg.id.slice(1)}</span>
        <div className="min-w-0 flex-1">
          <p className="ki-quelle__stelle">{beleg.fundstelle}</p>
          <p className="ki-quelle__meta">
            <span>{t(`quellen.stufe.${stufe}`)}</span>
            {beleg.sprache ? <span>{beleg.sprache.toUpperCase()}</span> : null}
            {beleg.gueltigAb ? <span>{t("quellen.gueltigAb", { datum: beleg.gueltigAb })}</span> : null}
            {beleg.abgerufenAm ? <span>{t("quellen.stand", { datum: beleg.abgerufenAm })}</span> : null}
          </p>
        </div>
      </div>
      {beleg.ueberholt ? (
        <p className="ki-quelle__warnung">
          <TriangleAlert className="h-3 w-3" /> {t("quellen.ueberholt")}
        </p>
      ) : null}
      {nurAuskunft ? <p className="ki-quelle__hinweis">{t("quellen.auskunft")}</p> : null}
      <blockquote className={cn("ki-quelle__text", !offen && lang && "ki-quelle__text--gekuerzt")}>{beleg.text}</blockquote>
      <div className="ki-quelle__fuss">
        {lang ? (
          <button type="button" onClick={() => setOffen((v) => !v)} className="ki-quelle__mehr">
            {offen ? t("quellen.weniger") : t("quellen.mehr")}
          </button>
        ) : (
          <span />
        )}
        {beleg.url ? (
          <a href={beleg.url} target="_blank" rel="noreferrer noopener" className="ki-quelle__link">
            {t("quellen.original")} <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <span className="ki-quelle__link ki-quelle__link--intern">
            <FileText className="h-3 w-3" /> {t("quellen.intern")}
          </span>
        )}
      </div>
    </li>
  );
}

/** Die Karten der zitierten Quellen unter der Antwort. Nur zitierte werden gezeigt,
 *  die uebrigen Treffer blieben ohne Aussage im Text und wuerden nur ablenken. */
export function QuellenListe({ nachrichtId, belege, zitiert }: { nachrichtId: string; belege: Beleg[]; zitiert: string[] }) {
  const t = useTranslations("kiAssistentAnsicht");
  const anzuzeigen = zitiert.map((k) => belege.find((b) => b.id === k)).filter((b): b is Beleg => !!b);
  if (anzuzeigen.length === 0) return null;
  return (
    <section className="ki-quellen" aria-label={t("quellen.titel")}>
      <h4 className="ki-quellen__titel">{t("quellen.titel")}</h4>
      <ol className="ki-quellen__liste">
        {anzuzeigen.map((b) => (
          <Quellenkarte key={b.id} nachrichtId={nachrichtId} beleg={b} />
        ))}
      </ol>
    </section>
  );
}
