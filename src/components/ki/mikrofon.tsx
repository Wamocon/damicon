"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, Mic, Square } from "lucide-react";
import { MikrofonWelle } from "@/components/ki/mikrofon-welle";
import { meldeLiveDiktat, transkribiereSprachnachricht } from "@/lib/actions/ki-assistent";
import { liveDiktatMoeglich, starteLiveSitzung, type LiveSitzung } from "@/components/ki/diktat-live";
import { starteHoeren, stoppeHoeren } from "@/lib/hoeren";
import { leer } from "@/lib/actions/status";
import {
  aufnahmeDateiname,
  AUFNAHME_VORGABEN,
  AUFNAHME_STUECK_MS,
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
// Zwei Wege, derselbe Knopf (seit 24.09.2026):
//
//   - LIVE (Schalter KI_DIKTAT_LIVE): der Browser streamt direkt zu Soniox
//     (components/ki/diktat-live.ts). Der Text erscheint waehrend des
//     Sprechens im Feld (beiZwischentext), das Ende der Aeusserung erkennt
//     das Modell selbst.
//   - DATEI: die ganze Aufnahme geht am Ende ueber die Server Action - der
//     bisherige Weg, und zugleich der Rueckfall fuer jedes Problem im
//     Live-Weg. Die Audiostuecke werden deshalb immer mitgesammelt.
//
// Der erkannte Text landet IMMER nur im Eingabefeld, nie direkt im Chat.
// Bis zum 22.09.2026 gab es dafuer eine Rueckgabe "beiSenden", die ihn sofort
// abschickte - das erspart einen Klick, nimmt aber die Gelegenheit, ein
// verhoertes Wort zu berichtigen. Bei Kasachisch, wo die Erkennung Laute
// verschluckt, ist das ein echter Unterschied; deshalb ist sie entfallen.
export function MikrofonKnopf({
  beiText,
  beiAufnahme,
  beiStart,
  beiZwischentext,
  className,
  deaktiviert = false,
}: {
  /** Der erkannte Text. `sprachen` sind die Sprachen, die der Dienst
   *  GEHOERT hat - sie entscheiden ueber die Sprache der Antwort, denn aus
   *  einem verhoerten Text laesst sie sich nicht mehr erraten. */
  beiText: (text: string, sprachen?: string[]) => void;
  /** Meldet, ob gerade aufgenommen wird - fuer eine Welle ausserhalb dieses Knopfs. */
  beiAufnahme?: (an: boolean) => void;
  /** Sofort beim Klick, noch bevor das Mikrofon offen ist: der Moment, in
   *  dem jede Wiedergabe verstummen muss - sonst landet die Stimme des
   *  Assistenten in der Aufnahme. */
  beiStart?: () => void;
  /** Nur im Live-Weg: was das Modell bis jetzt gehoert hat. Ein leerer Text
   *  heisst "nichts mehr anzeigen" (Abbruch, Rueckfall auf den Datei-Weg). */
  beiZwischentext?: (text: string) => void;
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
  const liveRef = useRef<LiveSitzung | null>(null);

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
      liveRef.current?.abbrechen();
      liveRef.current = null;
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
    // Entsteht der Kontext nach dem await auf getUserMedia, gilt er auf dem
    // iPhone womoeglich nicht mehr als Folge der Geste und startet
    // "suspended" - dann misst er nur Stille, und die Aufnahme endete nach
    // 4 s als "leer", obwohl gesprochen wurde.
    if (kontext.state === "suspended") void kontext.resume().catch(() => {});
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

      const ergebnis = beachte(waechter.melde(pegel, performance.now()));
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

  /** Solange der Live-Weg traegt, entscheidet das Modell ueber das Ende der
   *  Aeusserung (Endpunkt), nicht die Lautstaerkeregel - die verwirft leise
   *  Sprechende und schneidet Denkpausen ab. Die Regel bleibt nur Gurt:
   *  die Hoechstdauer gilt immer, und "leer" nur, wenn auch das Modell
   *  nichts gehoert hat. Faellt der Live-Weg aus, gilt sie wieder ganz. */
  function beachte(ergebnis: StilleErgebnis): StilleErgebnis {
    const live = liveRef.current;
    if (!live || !live.traegt()) return ergebnis;
    if (ergebnis === "stopp-stille") return "weiter";
    if (ergebnis === "stopp-leer" && live.hatGehoert()) return "weiter";
    return ergebnis;
  }

  async function starten() {
    setMeldung(null);
    grundRef.current = "weiter";
    beiStart?.();
    // Der Live-Weg startet SOFORT beim Klick: Schluessel und Verbindung
    // laufen, waehrend der Browser noch nach der Mikrofon-Erlaubnis fragt.
    // Was bis dahin aufgenommen wird, puffert die Sitzung.
    liveRef.current?.abbrechen();
    const live = liveDiktatMoeglich()
      ? starteLiveSitzung({
          sprache,
          beiStand: (stand) => beiZwischentext?.(stand.anzeige),
          beiEndpunkt: () => {
            // Das Modell hat das Ende gehoert - wie eine Stille, nur klueger.
            const r = recorderRef.current;
            if (r && r.state !== "inactive") r.stop();
          },
        })
      : null;
    liveRef.current = live;
    try {
      // Das Oeffnen des Mikrofons dauert - bis dahin zeigt der Knopf, dass
      // er daran ist, aber NICHT "hoert zu". Wer zu frueh spricht, verliert
      // sonst die ersten Worte, bevor ueberhaupt aufgenommen wird.
      setZustand("oeffnet");
      const strom = await navigator.mediaDevices.getUserMedia({ audio: AUFNAHME_VORGABEN });
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(strom);
      } catch (fehler) {
        // Ohne Recorder kein Diktat - aber das Mikrofon darf nicht offen
        // bleiben (rote Anzeige im Browser, ohne dass jemand aufnimmt).
        strom.getTracks().forEach((spur) => spur.stop());
        throw fehler;
      }
      const teile: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size === 0) return;
        teile.push(e.data);
        // Dasselbe Stueck auch live - die Sammlung oben bleibt fuer den
        // Rueckfall liegen.
        liveRef.current?.sende(e.data);
      };

      recorder.onstop = async () => {
        stoppeHoeren();
        raeumeAuf();
        const typ = recorder.mimeType || "audio/webm";
        const aufnahme = new Blob(teile, { type: typ });
        const sitzung = liveRef.current;
        liveRef.current = null;

        // Erst der Live-Weg: traegt er, ist der Text schon fast fertig.
        if (sitzung) {
          setZustand("laeuft");
          const ergebnis = await sitzung.beende();
          if (ergebnis.ok) {
            setZustand("bereit");
            if (ergebnis.text) {
              beiText(ergebnis.text, ergebnis.sprachen);
              void meldeLiveDiktat(ergebnis.text.length, ergebnis.sprachen).catch(() => {});
            } else {
              beiZwischentext?.("");
              setMeldung(tAktion("fehler.transkriptionLeer"));
            }
            return;
          }
          // Live gescheitert: Anzeige zuruecksetzen, dieselbe Aufnahme als
          // Datei. Der Grund steht nur in der Konsole - fuer die Person
          // zaehlt, dass ihr Diktat ankommt.
          console.warn("[damicon] Live-Diktat nicht moeglich, weiter als Datei:", ergebnis.grund);
          beiZwischentext?.("");
        }

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
          beiText(status.wert, status.sprachen);
        } else {
          setMeldung(status.meldung ? tAktion(status.meldung) : t("fehlgeschlagen"));
        }
      };

      // In kurzen Stuecken statt am Stueck: nur so kann der Live-Weg
      // mitlaufen. Fuer den Datei-Weg aendert das nichts - die Stuecke
      // ergeben zusammen dieselbe Datei.
      recorder.start(AUFNAHME_STUECK_MS);
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
      liveRef.current?.abbrechen();
      liveRef.current = null;
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
