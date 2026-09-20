"use client";

import { useSyncExternalStore } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { AlertTriangle, Clock } from "lucide-react";
import { StatusPill, type Tone } from "@/components/ui/kit";

// Lebendige Fälligkeitsanzeige: zeigt "Fällig in 2 Stunden" bzw. "Überfällig
// seit 5 Minuten" und aktualisiert sich selbst, ohne dass die Seite neu laedt -
// fuer eine Vorfuehrung, in der ein Beobachter dem Status tatsaechlich beim
// Wandern zusehen kann.
//
// Die Dauer wird bewusst NICHT ueber Intl.RelativeTimeFormat erzeugt: dessen
// Sprachdaten sind fuer Kasachisch in gaengigen Browsern unvollstaendig und
// fallen auf ein rohes "-16 min" zurueck statt auf einen Satz. Stattdessen
// wird die Zahl-plus-Einheit ueber ICU-Pluralregeln uebersetzt
// (Intl.PluralRules, fuer alle vier Sprachen zuverlaessig verfuegbar) und in
// eine je Sprache passende Richtungsformulierung eingesetzt.

const AKTUALISIERUNG_MS = 15_000;
const BALD_FAELLIG_MINUTEN = 30;

// Ein einziger gemeinsamer Takt fuer alle Kacheln der Seite statt eines
// Timers je Instanz. Nach dem Muster von persona.tsx/theme-toggle.tsx:
// useSyncExternalStore statt setState-im-Effekt, damit das Server- und das
// erste Client-Rendering exakt uebereinstimmen (auf dem Server gibt es kein
// "jetzt") und React die Aktualisierung selbst orchestriert, statt sie durch
// einen synchronen setState-Aufruf im Effekt zu erzwingen.
const listeners = new Set<() => void>();
let taktGeber: ReturnType<typeof setInterval> | null = null;
let letzterTakt = Date.now();

function abonnieren(callback: () => void) {
  listeners.add(callback);
  if (!taktGeber) {
    taktGeber = setInterval(() => {
      letzterTakt = Date.now();
      listeners.forEach((listener) => listener());
    }, AKTUALISIERUNG_MS);
  }
  return () => {
    listeners.delete(callback);
    if (listeners.size === 0 && taktGeber) {
      clearInterval(taktGeber);
      taktGeber = null;
    }
  };
}

const clientTakt = () => letzterTakt;
const serverTakt = () => null;

type Einheit = "minuten" | "stunden" | "tage";

function einheitUndAnzahl(minutenAbsolut: number): { einheit: Einheit; anzahl: number } {
  const minuten = Math.max(1, Math.round(minutenAbsolut));
  if (minuten < 60) return { einheit: "minuten", anzahl: minuten };
  if (minuten < 60 * 24) return { einheit: "stunden", anzahl: Math.round(minuten / 60) };
  return { einheit: "tage", anzahl: Math.round(minuten / (60 * 24)) };
}

export function FaelligkeitAnzeige({
  faelligkeit,
  className,
}: {
  faelligkeit: string | null;
  className?: string;
}) {
  const takt = useSyncExternalStore<number | null>(abonnieren, clientTakt, serverTakt);
  const format = useFormatter();
  const t = useTranslations("faelligkeit");

  if (!faelligkeit || takt === null) return null;

  const jetzt = new Date(takt);
  const ziel = new Date(faelligkeit);
  const minutenBisFaellig = (ziel.getTime() - jetzt.getTime()) / 60_000;
  const ueberfaellig = minutenBisFaellig < 0;
  const baldFaellig = !ueberfaellig && minutenBisFaellig <= BALD_FAELLIG_MINUTEN;

  const { einheit, anzahl } = einheitUndAnzahl(Math.abs(minutenBisFaellig));
  const dauer = t(`einheit.${einheit}`, { anzahl });
  const tone: Tone = ueberfaellig ? "danger" : baldFaellig ? "warning" : "neutral";

  return (
    <StatusPill
      tone={tone}
      className={className}
      title={format.dateTime(ziel, { dateStyle: "short", timeStyle: "short" })}
    >
      {ueberfaellig ? (
        <AlertTriangle className="h-3 w-3" />
      ) : (
        <Clock className="h-3 w-3" />
      )}
      {ueberfaellig ? t("ueberfaellig", { dauer }) : t("faellig", { dauer })}
    </StatusPill>
  );
}
