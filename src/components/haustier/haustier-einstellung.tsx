"use client";

import { useState, useSyncExternalStore, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { useHaustierAktionen, useHaustierStatus } from "@/components/haustier/haustier-kontext";
import { Himbi, TRACHTEN } from "@/components/haustier/himbi";
import { leseBewegung, schreibeBewegung, VORSCHAU_ZUSTAENDE, type HaustierZustand, type Stimmung } from "@/lib/haustier";

// Die Einstellungen zum Begleiter, im Zahnradbereich des Assistenten (ki-pane.tsx).
//
// Der eigentliche Gedanke dahinter: die Figur hat inzwischen acht Zustaende und vier
// Mienen, und man bekommt sie im Betrieb nur einzeln und zufaellig zu sehen. Hier stehen
// sie nebeneinander und zum Anfassen - man versteht, was die Figur einem sagen will,
// bevor sie es im Ernstfall tut. Die Vorschau ist bewusst nur eine Vorschau: sie aendert
// nichts am echten Begleiter in der Ecke.
//
// Geaendert wird genau zweierlei: ob die Figur ueberhaupt da ist und ob sie sich bewegt.

// Der Bewegungsschalter liegt im Browser-Speicher. Als externer Speicher angebunden -
// dasselbe Vorgehen wie bei der Sichtbarkeit in haustier-kontext.tsx: React nimmt beim
// Hydrieren erst den Serverwert und danach den echten, statt nach dem Mounten
// nachzubessern.
const beobachter = new Set<() => void>();
function abonniere(melde: () => void): () => void {
  beobachter.add(melde);
  return () => {
    beobachter.delete(melde);
  };
}
const serverWert = (): boolean => true;

export function HaustierEinstellung() {
  const t = useTranslations("haustier");
  const { an, inventar, tourAn, autoStart } = useHaustierStatus();
  const { setAn, setInventar, setTourAn, setAutoStart } = useHaustierAktionen();

  const bewegung = useSyncExternalStore(abonniere, leseBewegung, serverWert);
  const [zustand, setZustand] = useState<HaustierZustand>("ruhe");
  const [stimmung, setStimmung] = useState<Stimmung>("neutral");

  const setzeBewegung = (neu: boolean) => {
    schreibeBewegung(neu);
    beobachter.forEach((melde) => melde());
  };

  return (
    <section className="ki-einstellung">
      <div className="ki-einstellung__kopf">
        <div className="ki-einstellung__titel">
          <Himbi zustand="ruhe" groesse={18} />
          {t("einstellung.titel")}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={an}
          aria-label={t("einstellung.titel")}
          onClick={() => setAn(!an)}
          className="ki-schalter"
        >
          <span className="ki-schalter__knopf" />
        </button>
      </div>
      <p className="ki-einstellung__text">{t("einstellung.text")}</p>

      <div className="ki-einstellung__kopf hb-einstellung__zeile">
        <div className="ki-einstellung__titel">{t("einstellung.tourTitel")}</div>
        <button
          type="button"
          role="switch"
          aria-checked={tourAn}
          aria-label={t("einstellung.tourTitel")}
          onClick={() => setTourAn(!tourAn)}
          className="ki-schalter"
        >
          <span className="ki-schalter__knopf" />
        </button>
      </div>
      <p className="ki-einstellung__text">{t("einstellung.tourText")}</p>

      <div className="ki-einstellung__kopf hb-einstellung__zeile">
        <div className="ki-einstellung__titel">{t("einstellung.autoTitel")}</div>
        <button
          type="button"
          role="switch"
          aria-checked={autoStart}
          aria-label={t("einstellung.autoTitel")}
          onClick={() => setAutoStart(!autoStart)}
          className="ki-schalter"
        >
          <span className="ki-schalter__knopf" />
        </button>
      </div>
      <p className="ki-einstellung__text">{t("einstellung.autoText")}</p>

      <div className="ki-einstellung__kopf hb-einstellung__zeile">
        <div className="ki-einstellung__titel">{t("einstellung.bewegungTitel")}</div>
        <button
          type="button"
          role="switch"
          aria-checked={bewegung}
          aria-label={t("einstellung.bewegungTitel")}
          onClick={() => setzeBewegung(!bewegung)}
          className="ki-schalter"
        >
          <span className="ki-schalter__knopf" />
        </button>
      </div>
      <p className="ki-einstellung__text">{t("einstellung.bewegungText")}</p>

      <div className="hb-vorschau">
        <div className="hb-vorschau__buehne" data-bewegung={bewegung}>
          <Himbi zustand={zustand} stimmung={stimmung} tracht={inventar.tracht} brille={inventar.brille} groesse={92} />
        </div>
        <div className="hb-vorschau__wahl">
          <p className="hb-vorschau__titel">{t("einstellung.zustandTitel")}</p>
          <div className="hb-vorschau__knoepfe">
            {VORSCHAU_ZUSTAENDE.map((z) => (
              <button
                key={z}
                type="button"
                aria-pressed={zustand === z}
                onClick={() => setZustand(z)}
                className="hb-chip"
              >
                {t(`label.kurz.${z}`)}
              </button>
            ))}
          </div>
          <p className="hb-vorschau__titel">{t("einstellung.stimmungTitel")}</p>
          <div className="hb-vorschau__knoepfe">
            {(["neutral", "gut", "warnung", "frage"] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={stimmung === s}
                onClick={() => setStimmung(s)}
                className="hb-chip hb-chip--stimmung"
              >
                {t(`einstellung.stimmung.${s}`)}
              </button>
            ))}
          </div>
          <p className="hb-vorschau__titel">{t("einstellung.trachtTitel")}</p>
          <div className="hb-vorschau__knoepfe">
            {TRACHTEN.map((tr, i) => (
              <button
                key={tr.name}
                type="button"
                aria-pressed={inventar.tracht === i}
                onClick={() => setInventar({ ...inventar, tracht: i as 0 | 1 | 2 })}
                className="hb-chip hb-chip--tracht"
                style={{ "--hb-chip-farbe": tr.chapanHell } as CSSProperties}
              >
                <span className="hb-chip__farbe" aria-hidden />
                {t(`einstellung.tracht.${tr.name}`)}
              </button>
            ))}
          </div>
          <div className="ki-einstellung__kopf hb-einstellung__zeile">
            <p className="hb-vorschau__titel hb-vorschau__titel--inline">{t("einstellung.brilleTitel")}</p>
            <button
              type="button"
              role="switch"
              aria-checked={inventar.brille}
              aria-label={t("einstellung.brilleTitel")}
              onClick={() => setInventar({ ...inventar, brille: !inventar.brille })}
              className="ki-schalter"
            >
              <span className="ki-schalter__knopf" />
            </button>
          </div>
          <p className="hb-vorschau__hinweis">{t("einstellung.vorschauHinweis")}</p>
        </div>
      </div>
    </section>
  );
}
