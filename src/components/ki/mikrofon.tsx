"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Mic, Square } from "lucide-react";
import { MikrofonWelle } from "@/components/ki/mikrofon-welle";
import { transkribiereSprachnachricht } from "@/lib/actions/ki-assistent";
import { starteHoeren, stoppeHoeren } from "@/lib/hoeren";
import { leer } from "@/lib/actions/status";
import { cn } from "@/lib/utils";

// Diktatknopf fuer beide Chatfenster: das Seitenpanel (ki/ki-chat.tsx, Claude)
// und das aeltere Fenster fuer selbst gehostete Modelle
// (db/ki-assistent-formulare.tsx). Aufnahme im Browser, Erkennung ueber die
// Server Action transkribiereSprachnachricht (Whisper) - der Browser spricht
// nie selbst mit dem Dienst.
//
// Der erkannte Text wird NICHT abgeschickt, sondern nur ins Eingabefeld
// gesetzt (beiText): erst lesen, gegebenenfalls ausbessern, dann senden.
// Gerade fuer Kasachisch wichtig, wo Whisper einzelne Woerter verhoert.
export function MikrofonKnopf({
  beiText,
  className,
  deaktiviert = false,
}: {
  beiText: (text: string) => void;
  className?: string;
  deaktiviert?: boolean;
}) {
  const t = useTranslations("kiAssistentAnsicht.diktat");
  const [zustand, setZustand] = useState<"bereit" | "aufnahme" | "laeuft">("bereit");
  const [meldung, setMeldung] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);

  // Eine laufende Aufnahme darf das Mikrofon nicht behalten, wenn die
  // Komponente verschwindet (Panel zu, Seitenwechsel mitten im Diktat).
  useEffect(() => {
    return () => {
      const r = recorderRef.current;
      if (r && r.state !== "inactive") {
        r.stream.getTracks().forEach((spur) => spur.stop());
        r.stop();
      }
      stoppeHoeren();
    };
  }, []);

  async function starten() {
    setMeldung(null);
    try {
      const strom = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(strom);
      const teile: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) teile.push(e.data);
      };

      recorder.onstop = async () => {
        stoppeHoeren();
        strom.getTracks().forEach((spur) => spur.stop());
        const aufnahme = new Blob(teile, { type: recorder.mimeType || "audio/webm" });
        if (aufnahme.size === 0) {
          setZustand("bereit");
          setMeldung(t("leer"));
          return;
        }

        setZustand("laeuft");
        const daten = new FormData();
        daten.append("audio", aufnahme, "aufnahme.webm");
        const status = await transkribiereSprachnachricht(leer, daten);
        setZustand("bereit");

        // Erfolg traegt den erkannten Text im wert-Feld (siehe ok() in
        // actions/status.ts).
        if (status.stand === "ok" && status.wert) beiText(status.wert);
        else setMeldung(t("fehlgeschlagen"));
      };

      recorder.start();
      recorderRef.current = recorder;
      // Denselben Strom auch mithoeren: daraus speist sich der Streifen neben dem Knopf
      // und die Frequenzkugel hinter der Figur (lib/hoeren.ts). Schlaegt das fehl,
      // aendert sich nur, dass beide weiter nach Uhr schwingen statt nach Stimme.
      starteHoeren(strom);
      setZustand("aufnahme");
    } catch {
      // Kein Mikrofon, keine Erlaubnis, kein HTTPS - fuer die Nutzerin
      // dasselbe Ergebnis: es geht gerade nicht.
      setMeldung(t("keinZugriff"));
    }
  }

  function stoppen() {
    const r = recorderRef.current;
    if (r && r.state !== "inactive") r.stop();
  }

  const beschriftung =
    zustand === "aufnahme" ? t("stoppen") : zustand === "laeuft" ? t("laeuft") : t("starten");

  return (
    <>
      <button
        type="button"
        onClick={zustand === "aufnahme" ? stoppen : starten}
        disabled={deaktiviert || zustand === "laeuft"}
        title={beschriftung}
        aria-label={beschriftung}
        className={cn(className, zustand === "aufnahme" && "ki-mikrofon--aufnahme")}
      >
        {zustand === "laeuft" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : zustand === "aufnahme" ? (
          <Square className="h-3.5 w-3.5 fill-current" />
        ) : (
          <Mic className="h-4 w-4" />
        )}
      </button>
      {zustand === "aufnahme" ? <MikrofonWelle /> : null}
      {meldung ? <span className="ki-mikrofon__meldung">{meldung}</span> : null}
    </>
  );
}
