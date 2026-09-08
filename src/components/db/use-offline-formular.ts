"use client";

import { useActionState, useState, type FormEvent } from "react";
import { leer, ok, type AktionsStatus } from "@/lib/actions/status";
import { eintragen } from "@/lib/offline/warteschlange";
import type { AktionTyp } from "@/lib/offline/db";
import { mitGeraetZeitstempel } from "@/components/db/formular-kit";

type AktionsFunktion = (status: AktionsStatus, formData: FormData) => Promise<AktionsStatus>;

// Anforderung 2.5, Phase 2: Bruecke zwischen einem bestehenden
// useActionState-Formular (bisher immer online) und der Offline-
// Warteschlange - ohne die Formulare selbst umzubauen.
//
// dispatch() aus useActionState laesst sich, wie jede normale Funktion, auch
// ausserhalb von <form action={dispatch}> gar nicht direkt aufrufen - der
// Online-Fall aendert sich hier deshalb nicht: onSubmit tut nichts
// Besonderes, React loest die an action={dispatch} gebundene Aktion wie
// gewohnt aus. Im Offline-Fall verhindert event.preventDefault() innerhalb
// eines regulaeren onSubmit-Handlers auf einem Formular, das zugleich
// action={dispatch} gesetzt hat, dass React diese Aktion ueberhaupt erst
// ausloest (bestaetigtes React-19-Verhalten) - stattdessen wird der Eintrag
// direkt in IndexedDB gepuffert und ein lokaler Status angezeigt, ohne dass
// dispatch() je aufgerufen wurde.
export function useOfflineFormular(
  aktion: AktionsFunktion,
  aktionTyp: AktionTyp,
  geraetZeitpunktFeld: string,
  nutzlastFelder: readonly string[],
) {
  const [status, dispatch] = useActionState(aktion, leer);
  const [lokalerStatus, setLokalerStatus] = useState<AktionsStatus | null>(null);
  const zeitstempeln = mitGeraetZeitstempel(geraetZeitpunktFeld);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    // Zeitstempel immer setzen, online wie offline - der Trigger auf
    // Datenbankseite braucht ihn so oder so (Anforderung 2.6).
    zeitstempeln(event);
    setLokalerStatus(null);

    // navigator.onLine direkt gelesen statt useOnlineStatus(): im
    // Submit-Handler zaehlt der Wert im exakten Moment des Absendens, nicht
    // der zuletzt gerenderte Hook-Zustand.
    if (typeof navigator === "undefined" || navigator.onLine) {
      return;
    }

    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const nutzlast: Record<string, unknown> = {};
    for (const feld of nutzlastFelder) {
      nutzlast[feld] = formData.get(feld);
    }
    const geraetZeitpunkt = String(formData.get(geraetZeitpunktFeld) ?? "");

    void eintragen({
      aktionId: crypto.randomUUID(),
      aktionTyp,
      nutzlast,
      geraetZeitpunkt,
    }).then(() => {
      setLokalerStatus(ok("ok.offlineEingereiht"));
      form.reset();
    });
  }

  return { status: lokalerStatus ?? status, action: dispatch, onSubmit };
}
