"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { useKiPane } from "@/components/ki/ki-pane-kontext";
import { useScrollSperre } from "@/components/ui/scroll-sperre";
import { SprachSpotlight } from "@/components/ki/sprach-spotlight";
import { abonniereSprachBus, chatStandServer, freigabeAnfrageServer, leseChatStand, leseFreigabeAnfrage } from "@/components/ki/sprachmodus-bus";
import { useHaustierStatus } from "@/components/haustier/haustier-kontext";
import { useSprachAblauf, useSprachGedaechtnis } from "@/components/ki/sprachmodus-gedaechtnis";
import { useSprachFragen } from "@/components/ki/sprachmodus-fragen";
import { useLautstaerkeWaechter, useVerdacht } from "@/components/ki/sprachmodus-verdacht";
import { useErkennung } from "@/components/ki/sprachmodus-erkennung";
import { useAbbau, useMikrofon, useSprachOhr } from "@/components/ki/sprachmodus-ohr";
import { useChatKopplung, useTagesbeginn } from "@/components/ki/sprachmodus-chat";
import { useSprachBedienung, useUntertitelWunsch } from "@/components/ki/sprachmodus-bedienung";
import { useDialogFokus, useLeisteUnscharf, useMitlesen, usePlatzVonHimbi } from "@/components/ki/sprachmodus-seite";
import { GespraechsAnzeige, SprachLeiste } from "@/components/ki/sprachmodus-anzeige";
import { cn } from "@/lib/utils";

// Der Sprachmodus: ein Live-Gespraech mit Himbi ohne sichtbaren Chat.
//
// Vollflaechiges Overlay ueber der Seite (dieselbe Grundidee wie die "Buehne"
// des Panels, ki-pane.css: unscharfer Hintergrund, .ki-buehne-*), in der Mitte
// Himbi (sprach-himbi.tsx; bis zum 25.09.2026 eine Kugel). Solange nichts
// hervorgehoben ist und Himbi zuhoert, steht er dort. Denkt oder spricht er oder
// springt der Assistent zu einem Bereich (oeffneBereich/zeigeAuf, ueber
// ki-pane-kontext.tsx und components/ki/hervorhebung.ts gemeldet), rueckt er
// klein nach links ueber die Navigationsleiste und das Ziel bekommt einen Rahmen
// (sprach-spotlight.tsx) - er zeigt weiter den Zustand des Gespraechs, verdeckt
// aber nicht, wovon er spricht.
//
// Die Frage geht ueber sprachmodus-bus.ts an den ganz normalen Chat im
// Seitenpanel (der bleibt dabei UNSICHTBAR, aber gemountet und aktiv - er
// fuehrt Werkzeuge aus, navigiert, speichert den Verlauf). Nach dem Gespraech
// steht alles dort zum Nachlesen, es gibt keinen zweiten, eigenen Weg.
//
// Seit dem 14.10.2026 steht der Ablauf in eigenen Hooks und Teilkomponenten; SprachmodusInhalt ruft sie in der Reihenfolge
// auf, in der ihre Effekte laufen müssen (Mikrofon, Ohr, Wächter, Chat, Tagesbeginn, Abbau, Bedienung, Scroll-Sperre, Fokus,
// Platz, Mitlesen, Leiste). Diese Reihenfolge hält supabase/tests/sprachmodus.tsx fest (Fall effekt-reihenfolge):
//   - sprachmodus-gedaechtnis.ts: Phase, Meldung, mitlaufender Text und die gemeinsamen Refs des Gesprächs.
//   - sprachmodus-fragen.ts, sprachmodus-verdacht.ts, sprachmodus-erkennung.ts: was aus dem Gehörten wird (Frage, Befehl,
//     Freigabe, Nachsatz, Dazwischenreden).
//   - sprachmodus-ohr.ts: Mikrofon, die eine Live-Sitzung, Neuversuche, Stille, Abbau.
//   - sprachmodus-chat.ts: der Stand des Chats und Himbis Frage zum Tagesbeginn.
//   - sprachmodus-bedienung.ts, sprachmodus-seite.ts, sprachmodus-anzeige.tsx: Knöpfe und Tasten, Fokus, Platz,
//     Mitlesen und die unscharfe Leiste auf der Seite, das gerenderte HTML. Die Scroll-Sperre kommt aus ui/scroll-sperre.ts.
export function Sprachmodus() {
  const { sprachmodus } = useKiPane();
  if (!sprachmodus) return null;
  return <SprachmodusInhalt />;
}

function SprachmodusInhalt() {
  const t = useTranslations("kiAssistentAnsicht.sprachmodus");
  const { beendeSprachmodus, nutzerId } = useKiPane();
  const { tagesbeginnAn } = useHaustierStatus();

  const ablauf = useSprachAblauf();
  const { phase, meldung, zwischentext } = ablauf;
  const [untertitelAn, schalteUntertitel] = useUntertitelWunsch();
  const gedaechtnis = useSprachGedaechtnis();

  const chatStand = useSyncExternalStore(abonniereSprachBus, leseChatStand, chatStandServer);
  const freigabeAnfrage = useSyncExternalStore(abonniereSprachBus, leseFreigabeAnfrage, freigabeAnfrageServer);

  // Was aus dem Gehörten wird. Diese Hooks haben keine Effekte; sie stehen vor dem Ohr, weil seine Rückrufe sie brauchen.
  const fragen = useSprachFragen(ablauf, gedaechtnis);
  const verdacht = useVerdacht(ablauf, gedaechtnis, fragen.unterbrecheHimbi);
  const erkennung = useErkennung(ablauf, gedaechtnis, fragen, verdacht);

  // Die Effekte in der bisherigen Reihenfolge (siehe Kopf: der Fall effekt-reihenfolge prüft sie).
  useMikrofon(ablauf, gedaechtnis);
  useSprachOhr(ablauf, gedaechtnis, erkennung, verdacht.beendeVerdacht);
  useLautstaerkeWaechter(ablauf, gedaechtnis, verdacht);
  useChatKopplung(ablauf, gedaechtnis, verdacht.beendeVerdacht);
  useTagesbeginn(phase, tagesbeginnAn, nutzerId, fragen.stelleFrage);
  useAbbau(gedaechtnis, verdacht.beendeVerdacht);
  const { beiFigurKlick, beenden, pausieren } = useSprachBedienung(ablauf, gedaechtnis, fragen.unterbrecheHimbi, beendeSprachmodus);
  // Die Seite scrollt nur noch, wenn Himbi sie scrollt. Ueber die gemeinsame Sperre am
  // <html> (ui/scroll-sperre.ts): eine eigene Sperre am <body> machte ihn zum
  // Scrollcontainer, und Kopfzeile und Seitenleiste scrollten mit.
  useScrollSperre(true);
  const figurKnopfRef = useDialogFokus();
  const { zielRechteck, zielSichtbar, angedockt, spalteRef } = usePlatzVonHimbi(phase, freigabeAnfrage);
  const wurzelRef = useMitlesen(phase);
  useLeisteUnscharf(angedockt);

  // Ist ein Bereich hervorgehoben, sieht Himbi zu seiner Mitte hin.
  const blickziel = zielSichtbar && zielRechteck ? { x: zielRechteck.x + zielRechteck.breite / 2, y: zielRechteck.y + zielRechteck.hoehe / 2 } : null;

  return (
    <div
      ref={wurzelRef}
      role="dialog"
      aria-modal="true"
      aria-label={t("titel")}
      data-untertitel={untertitelAn ? "an" : "aus"}
      className={cn("ki-sprachmodus", angedockt && "ki-sprachmodus--angedockt")}
    >
      <SprachSpotlight rechteck={zielRechteck} />

      <GespraechsAnzeige
        phase={phase}
        chatStand={chatStand}
        freigabeAnfrage={freigabeAnfrage}
        untertitelAn={untertitelAn}
        zwischentext={zwischentext}
        angedockt={angedockt}
        blickziel={blickziel}
        figurKnopfRef={figurKnopfRef}
        spalteRef={spalteRef}
        beiFigurKlick={beiFigurKlick}
      />

      {meldung ? <p className="ki-sprachmodus__meldung">{meldung.text}</p> : null}

      <SprachLeiste phase={phase} untertitelAn={untertitelAn} pausieren={pausieren} schalteUntertitel={schalteUntertitel} beenden={beenden} />
    </div>
  );
}
