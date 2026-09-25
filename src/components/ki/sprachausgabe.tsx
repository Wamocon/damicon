"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Square, Volume2, VolumeX } from "lucide-react";
import { stimmeFuerOberflaeche } from "@/lib/domain/sprachausgabe";
import { cn, istUuid } from "@/lib/utils";

// Sprachausgabe im KI-Seitenpanel: je Antwort ein Vorlese-Knopf, dazu ein
// Schalter "Antworten vorlesen" (Standard: aus - reiner Text bleibt der
// Normalfall). Das Audio kommt von api/ki-sprachausgabe, das nur IDs
// gespeicherter Antworten annimmt, nie freien Text.

const SCHALTER_SCHLUESSEL = "damicon.ki.vorlesen";
/** Nur gespeicherte Antworten haben eine Datenbank-ID (UUID) - nur fuer die
 *  gibt es etwas vorzulesen. */
export function istVorlesbar(id: string): boolean {
  return istUuid(id);
}

/** Gibt es fuer die Systemsprache ueberhaupt eine Stimme? Dieselbe Tabelle
 *  wie auf dem Server (api/ki-sprachausgabe), nur vorab: fehlt eine Stimme,
 *  erscheint erst gar kein Knopf statt eines Fehlers nach dem Klick. */
export function stimmeVorhanden(oberflaeche: string): boolean {
  return stimmeFuerOberflaeche(oberflaeche) !== null;
}

type Hinweis = { id: string; art: "keineStimme" | "fehler" } | null;

export function useSprachausgabe(sprache: string) {
  const [vorlesen, setVorlesenZustand] = useState(false);
  const [spielt, setSpielt] = useState<string | null>(null);
  const [laedt, setLaedt] = useState<string | null>(null);
  const [hinweis, setHinweis] = useState<Hinweis>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urls = useRef(new Map<string, string>());

  useEffect(() => {
    try {
      setVorlesenZustand(window.localStorage.getItem(SCHALTER_SCHLUESSEL) === "an");
    } catch {
      // Ohne lesbaren Speicher bleibt der Standard: aus.
    }
    const gespeichert = urls.current;
    return () => {
      audioRef.current?.pause();
      for (const url of gespeichert.values()) URL.revokeObjectURL(url);
    };
  }, []);

  const setVorlesen = useCallback((an: boolean) => {
    setVorlesenZustand(an);
    try {
      window.localStorage.setItem(SCHALTER_SCHLUESSEL, an ? "an" : "aus");
    } catch {
      // nur Komfort - der Schalter wirkt trotzdem fuer diese Sitzung
    }
    if (!an) audioRef.current?.pause();
  }, []);

  const stoppe = useCallback(() => {
    audioRef.current?.pause();
    setSpielt(null);
  }, []);

  const spiele = useCallback(
    async (id: string) => {
      if (!istVorlesbar(id)) return;
      audioRef.current?.pause();
      setHinweis(null);
      let url = urls.current.get(id);
      if (!url) {
        setLaedt(id);
        try {
          // Eine frisch gestreamte Antwort wird serverseitig erst am Ende des
          // Streams gespeichert - ein 404 unmittelbar danach ist meist nur
          // dieser Moment. Deshalb ein zweiter Versuch nach kurzer Pause.
          let antwort: Response | null = null;
          for (const pause of [0, 1200]) {
            if (pause) await new Promise((r) => setTimeout(r, pause));
            antwort = await fetch("/api/ki-sprachausgabe", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ nachrichtId: id, sprache }),
            });
            if (antwort.status !== 404) break;
          }
          if (!antwort?.ok) {
            const grund = await antwort?.json().then((j: { grund?: string }) => j.grund).catch(() => undefined);
            setHinweis({ id, art: grund === "keine-stimme" ? "keineStimme" : "fehler" });
            return;
          }
          url = URL.createObjectURL(await antwort.blob());
          urls.current.set(id, url);
        } catch {
          setHinweis({ id, art: "fehler" });
          return;
        } finally {
          setLaedt(null);
        }
      }
      const audio = audioRef.current ?? new Audio();
      audioRef.current = audio;
      audio.src = url;
      audio.onended = () => setSpielt(null);
      audio.onpause = () => setSpielt((aktuell) => (aktuell === id ? null : aktuell));
      try {
        await audio.play();
        setSpielt(id);
      } catch {
        // Der Browser verweigert Autoplay ohne vorherige Nutzeraktion - dann
        // bleibt der Knopf zum Selbst-Abspielen.
        setSpielt(null);
      }
    },
    [sprache],
  );

  return { vorlesen, setVorlesen, spielt, laedt, hinweis, spiele, stoppe };
}

export function VorlesenKnopf({
  id,
  zustand,
}: {
  id: string;
  zustand: ReturnType<typeof useSprachausgabe>;
}) {
  const t = useTranslations("kiAssistentAnsicht");
  const { spielt, laedt, hinweis, spiele, stoppe } = zustand;
  const aktiv = spielt === id;
  const beschaeftigt = laedt === id;
  const meldung = hinweis?.id === id ? hinweis.art : null;

  return (
    <div className="ki-vorlesen">
      <button
        type="button"
        onClick={() => (aktiv ? stoppe() : void spiele(id))}
        disabled={beschaeftigt}
        aria-label={aktiv ? t("vorlesenStopp") : t("vorlesen")}
        title={aktiv ? t("vorlesenStopp") : t("vorlesen")}
        className={cn("ki-vorlesen__knopf", aktiv && "ki-vorlesen__knopf--aktiv")}
      >
        {beschaeftigt ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : aktiv ? (
          <Square className="h-3 w-3 fill-current" />
        ) : (
          <Volume2 className="h-3.5 w-3.5" />
        )}
      </button>
      {meldung ? (
        <span className="ki-vorlesen__hinweis">
          {meldung === "keineStimme" ? t("vorlesenKeineStimme") : t("vorlesenFehler")}
        </span>
      ) : null}
    </div>
  );
}

export function VorlesenSchalter({
  zustand,
  laedt = false,
  spricht = false,
}: {
  zustand: ReturnType<typeof useSprachausgabe>;
  /** Der erste Abschnitt wird gerade geholt - bis dahin ist es still. */
  laedt?: boolean;
  spricht?: boolean;
}) {
  const t = useTranslations("kiAssistentAnsicht");
  const { vorlesen, setVorlesen } = zustand;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={vorlesen}
      onClick={() => setVorlesen(!vorlesen)}
      className={cn("ki-vorlesen-schalter", vorlesen && "ki-vorlesen-schalter--an", spricht && "ki-vorlesen-schalter--spricht")}
    >
      {vorlesen ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
      <span>{t("vorlesenAuto")}</span>
      {/* Zwischen Absenden und dem ersten Ton vergehen ein bis zwei Sekunden.
          Ohne ein Lebenszeichen haelt man das fuer kaputt und drueckt noch
          einmal - deshalb drei Balken, die sich bewegen. Rein dekorativ: was
          hier passiert, steht als Text schon im Schalter. */}
      {laedt ? (
        <span className="ki-vorlesen-welle" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      ) : null}
    </button>
  );
}
