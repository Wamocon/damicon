"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, Mic, Square } from "lucide-react";
import { MikrofonWelle } from "@/components/ki/mikrofon-welle";
import { transkribiereSprachnachricht } from "@/lib/actions/ki-assistent";
import { starteHoeren, stoppeHoeren } from "@/lib/hoeren";
import { leer } from "@/lib/actions/status";
import {
  aufnahmeDateiname,
  diktatEinstellungen,
  erzeugeStilleWaechter,
  pegelAusZeitbereich,
  type StilleErgebnis,
} from "@/lib/domain/diktat";
import { cn } from "@/lib/utils";

// Diktatknopf fuer beide Chatfenster: das Seitenpanel (ki/ki-chat.tsx, Claude)
// und das aeltere Fenster fuer selbst gehostete Modelle
// (db/ki-assistent-formulare.tsx). Aufnahme im Browser, Erkennung ueber die
// Server Action transkribiereSprachnachricht - der Browser spricht nie selbst
// mit dem Dienst.
//
// Die Aufnahme endet von selbst, wenn jemand aufhoert zu sprechen
// (domain/diktat.ts). Der Stopp-Knopf bleibt trotzdem stehen: die
// Stilleerkennung ist eine Schaetzung, kein Versprechen - in lauter Umgebung
// kann sie danebenliegen, und dann muss man sie uebergehen koennen.
//
// Der erkannte Text landet IMMER nur im Eingabefeld, nie direkt im Chat.
// Bis zum 22.09.2026 gab es dafuer eine Rueckgabe "beiSenden", die ihn sofort
// abschickte - das erspart einen Klick, nimmt aber die Gelegenheit, ein
// verhoertes Wort zu berichtigen. Bei Kasachisch, wo die Erkennung Laute
// verschluckt, ist das ein echter Unterschied; deshalb ist sie entfallen.
export function MikrofonKnopf({
  beiText,
  beiAufnahme,
  className,
  deaktiviert = false,
}: {
  beiText: (text: string) => void;
  /** Meldet, ob gerade aufgenommen wird - fuer eine Welle ausserhalb dieses Knopfs. */
  beiAufnahme?: (an: boolean) => void;
  className?: string;
  deaktiviert?: boolean;
}) {
  const t = useTranslations("kiAssistentAnsicht.diktat");
  // Die Server Action sagt genau, WORAN es lag (Dienst nicht erreichbar,
  // Zeitueberschreitung, Erkennung ohne Ergebnis). Diese Meldung wird hier
  // gezeigt, statt jeden Fehlschlag zu "Spracherkennung nicht moeglich" zu
  // verkuerzen - das las sich wie ein Fehler der Aufnahme, obwohl in
  // Produktion schlicht der Dienst fehlte.
  const tAktion = useTranslations("aktionen");
  const sprache = useLocale();
  const [zustand, setZustand] = useState<"bereit" | "oeffnet" | "aufnahme" | "laeuft">("bereit");
  const [meldung, setMeldung] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const tonRef = useRef<{ kontext: AudioContext; bild: number } | null>(null);
  const balkenRef = useRef<(HTMLSpanElement | null)[]>([]);
  // Warum die Aufnahme endete - gesetzt von der Stilleerkennung, gelesen in
  // recorder.onstop. Ueber ein Ref, weil onstop sonst den Stand von damals
  // saehe.
  const grundRef = useRef<StilleErgebnis>("weiter");

  /** Mikrofon, Tonanalyse und Bildschleife freigeben. Mehrfach aufrufbar. */
  function raeumeAuf() {
    const ton = tonRef.current;
    if (ton) {
      cancelAnimationFrame(ton.bild);
      void ton.kontext.close().catch(() => {});
      tonRef.current = null;
    }
    recorderRef.current?.stream.getTracks().forEach((spur) => spur.stop());
  }

  useEffect(() => {
    beiAufnahme?.(zustand === "aufnahme");
  }, [zustand, beiAufnahme]);

  // Eine laufende Aufnahme darf das Mikrofon nicht behalten, wenn die
  // Komponente verschwindet (Panel zu, Seitenwechsel mitten im Diktat).
  useEffect(() => {
    return () => {
      const r = recorderRef.current;
      if (r && r.state !== "inactive") r.stop();
      stoppeHoeren();
      raeumeAuf();
      beiAufnahme?.(false);
    };
    // beiAufnahme nur beim Aufraeumen lesen, nicht bei jeder Aenderung neu binden.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Pegel messen, Balken bewegen, Stille erkennen - eine Schleife im
   *  Bildtakt des Browsers, bewusst ohne React dazwischen: ein setState je
   *  Bild waere sechzig Durchlaeufe des ganzen Chatfensters je Sekunde. */
  function beobachte(strom: MediaStream, recorder: MediaRecorder) {
    const kontext = new AudioContext();
    const quelle = kontext.createMediaStreamSource(strom);
    const analyse = kontext.createAnalyser();
    analyse.fftSize = 1024;
    analyse.smoothingTimeConstant = 0.6;
    // Bewusst NICHT mit kontext.destination verbunden: sonst hoert sich die
    // sprechende Person selbst, mit Verzoegerung.
    quelle.connect(analyse);

    const zeitbereich = new Uint8Array(analyse.fftSize);
    const frequenzen = new Uint8Array(analyse.frequencyBinCount);
    const waechter = erzeugeStilleWaechter(diktatEinstellungen(umgebung()));
    // Wer Bewegung im Bild abgestellt hat, bekommt keine zappelnden Balken.
    // Die Stilleerkennung laeuft davon unberuehrt weiter.
    const ruhig =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

    const schritt = () => {
      analyse.getByteTimeDomainData(zeitbereich);
      const pegel = pegelAusZeitbereich(zeitbereich);

      if (!ruhig) {
        analyse.getByteFrequencyData(frequenzen);
        // Die unteren zwei Drittel des Spektrums decken Sprache ab; der Rest
        // ist Zischen und liesse die Balken nur flimmern.
        const breite = Math.max(1, Math.floor((frequenzen.length * 0.66) / BALKEN));
        for (let i = 0; i < BALKEN; i++) {
          let summe = 0;
          for (let j = i * breite; j < (i + 1) * breite; j++) summe += frequenzen[j];
          const mittel = summe / breite / 255;
          const balken = balkenRef.current[i];
          // Untergrenze, damit die Anzeige bei Stille nicht zu einem
          // unsichtbaren Strich zusammenfaellt.
          if (balken) balken.style.transform = `scaleY(${Math.max(0.12, Math.min(1, mittel * 2.2))})`;
        }
      }

      const ergebnis = waechter.melde(pegel, performance.now());
      if (ergebnis !== "weiter") {
        grundRef.current = ergebnis;
        if (recorder.state !== "inactive") recorder.stop();
        return;
      }
      const ton = tonRef.current;
      if (ton) ton.bild = requestAnimationFrame(schritt);
    };

    tonRef.current = { kontext, bild: requestAnimationFrame(schritt) };
  }

  async function starten() {
    setMeldung(null);
    grundRef.current = "weiter";
    try {
      // Das Oeffnen des Mikrofons dauert - bis dahin zeigt der Knopf, dass
      // er daran ist, aber NICHT "hoert zu". Wer zu frueh spricht, verliert
      // sonst die ersten Worte, bevor ueberhaupt aufgenommen wird.
      setZustand("oeffnet");
      const strom = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(strom);
      const teile: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) teile.push(e.data);
      };

      recorder.onstop = async () => {
        stoppeHoeren();
        raeumeAuf();
        const typ = recorder.mimeType || "audio/webm";
        const aufnahme = new Blob(teile, { type: typ });
        // "stopp-leer": die Stilleerkennung hat nie Sprache gehoert. Diese
        // Aufnahme gar nicht erst zur Erkennung schicken - sie ergaebe
        // bestenfalls erfundene Woerter aus Umgebungsgeraeusch.
        if (aufnahme.size === 0 || grundRef.current === "stopp-leer") {
          setZustand("bereit");
          setMeldung(t("leer"));
          return;
        }

        setZustand("laeuft");
        const daten = new FormData();
        // Name MUSS zum Inhalt passen: Safari auf iOS nimmt audio/mp4 auf.
        // Bis zum 22.09.2026 hiess die Datei immer "aufnahme.webm" - der
        // Erkennungsdienst bekam also MP4 unter WebM-Namen. Wer die Endung
        // auswertet statt den Inhalt, verarbeitet dann Unsinn oder lehnt ab.
        daten.append("audio", aufnahme, aufnahmeDateiname(typ));
        // Die Sprache der Oberflaeche als Hinweis fuer die Erkennung: sie
        // trennt vor allem Kasachisch von Russisch, die sich die Schrift
        // teilen. Nicht unterstuetzte Werte verwirft der Client selbst.
        daten.append("sprache", sprache);
        const status = await transkribiereSprachnachricht(leer, daten);
        setZustand("bereit");

        // Erfolg traegt den erkannten Text im wert-Feld (siehe ok() in
        // actions/status.ts).
        // Der erkannte Text landet NUR im Eingabefeld. Abgeschickt wird von
        // Hand: ein verhoertes Diktat, das ungeprueft rausgeht, ist schlimmer
        // als ein Tippfehler - besonders auf Kasachisch.
        if (status.stand === "ok" && status.wert) {
          beiText(status.wert);
        } else {
          setMeldung(status.meldung ? tAktion(status.meldung) : t("fehlgeschlagen"));
        }
      };

      recorder.start();
      recorderRef.current = recorder;
      // Denselben Strom auch mithoeren: daraus speist sich der Streifen neben dem Knopf
      // und die Frequenzkugel hinter der Figur (lib/hoeren.ts). Schlaegt das fehl,
      // aendert sich nur, dass beide weiter nach Uhr schwingen statt nach Stimme.
      starteHoeren(strom);
      setZustand("aufnahme");
      beobachte(strom, recorder);
    } catch {
      // Kein Mikrofon, keine Erlaubnis, kein HTTPS - fuer die Nutzerin
      // dasselbe Ergebnis: es geht gerade nicht.
      raeumeAuf();
      setZustand("bereit");
      setMeldung(t("keinZugriff"));
    }
  }

  function stoppen() {
    // Von Hand beendet: die Aufnahme zaehlt, auch wenn die Stilleerkennung
    // noch nichts gehoert zu haben glaubt.
    grundRef.current = "weiter";
    const r = recorderRef.current;
    if (r && r.state !== "inactive") r.stop();
  }

  const beschriftung =
    zustand === "aufnahme" ? t("stoppen")
      : zustand === "laeuft" ? t("laeuft")
      : zustand === "oeffnet" ? t("oeffnet")
      : t("starten");

  return (
    <>
      <span className="ki-mikrofon__huelle">
        {zustand === "aufnahme" ? <MikrofonWelle /> : null}
        <button
          type="button"
          onClick={zustand === "aufnahme" ? stoppen : starten}
          disabled={deaktiviert || zustand === "laeuft" || zustand === "oeffnet"}
          title={beschriftung}
          aria-label={beschriftung}
          className={cn(className, zustand === "aufnahme" && "ki-mikrofon--aufnahme")}
        >
          {zustand === "laeuft" || zustand === "oeffnet" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : zustand === "aufnahme" ? (
            <Square className="h-3.5 w-3.5 fill-current" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
        </button>
      </span>
      {zustand === "aufnahme" ? (
        // Rein dekorativ: was hier zu sehen ist, steht als Text schon im
        // Knopf ("Aufnahme beenden"). Vorlesegeraete sollen nicht fuenf
        // namenlose Balken ansagen.
        <span className="ki-mikrofon__pegel" aria-hidden="true">
          {Array.from({ length: BALKEN }, (_, i) => (
            <span
              key={i}
              ref={(el) => {
                balkenRef.current[i] = el;
              }}
              className="ki-mikrofon__balken"
            />
          ))}
        </span>
      ) : null}
      {meldung ? <span className="ki-mikrofon__meldung">{meldung}</span> : null}
    </>
  );
}

/** Anzahl der Balken in der Pegelanzeige. Fuenf genuegen, um Sprechen von
 *  Stille zu unterscheiden, und passen in die Eingabezeile. */
const BALKEN = 5;

/** Die im Browser verfuegbaren NEXT_PUBLIC_-Werte. Next ersetzt sie beim
 *  Uebersetzen durch feste Zeichenketten - deshalb hier einzeln benannt und
 *  nicht ueber process.env durchgereicht. */
function umgebung(): Record<string, string | undefined> {
  return {
    NEXT_PUBLIC_DIKTAT_STILLE_PEGEL: process.env.NEXT_PUBLIC_DIKTAT_STILLE_PEGEL,
    NEXT_PUBLIC_DIKTAT_STILLE_MS: process.env.NEXT_PUBLIC_DIKTAT_STILLE_MS,
  };
}
