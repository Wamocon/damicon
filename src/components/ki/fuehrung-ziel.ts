// Entscheidung der Fuehrung (ki-pane-kontext.tsx): muss fuer die naechste
// Station navigiert werden, oder steht die Seite schon da? Ohne window und
// ohne React, damit sie sich mit echten Pfaden pruefen laesst
// (supabase/tests/chat-eingaben.ts).

/** Sprachpraefix der Adresse ("/de", "/kk" ...), die Ziele der Fuehrung tragen keins. */
const SPRACHPRAEFIX = /^\/[a-z]{2}(?=\/|$|\?)/;

/** Steht die Seite (aktuell: Pfad und Abfrage) schon auf dem Ziel? Verglichen
 *  wird der Pfad ohne Sprachpraefix auf Gleichheit. Bis zum 28.09.2026 reichte
 *  ein passendes Ende (endsWith), dann galt auch "/de/andere/dashboard/lohn"
 *  als "/dashboard/lohn" (Vibecode-Cleanup, Fund 46). */
export function stehtAufZiel(aktuell: string, ziel: string): boolean {
  const ohneAnker = ziel.split("#")[0]!;
  const ohnePraefix = aktuell.replace(SPRACHPRAEFIX, "") || "/";
  return ohnePraefix === ohneAnker;
}

export interface NavigationsMerker {
  /** Naechste Station: true heisst router.push(ziel). */
  station(aktuell: string, ziel: string): boolean;
  /** Die Seite einer Station steht (fokussiere hat sie gefunden). */
  angekommen(aktuell: string): void;
  /** Fuehrung beendet: eine offene Navigation zaehlt nicht mehr. */
  beenden(): void;
}

/** Merkt sich das zuletzt per router.push angesteuerte Ziel. Solange es nicht
 *  erreicht ist, laeuft eine Navigation: dann zaehlt "steht schon auf dem
 *  Ziel" nicht, sonst bliebe man auf der Zwischenseite stehen (Pruefung vom
 *  25.09.2026).
 *
 *  Seit dem 28.09.2026 (Fund 46) wird der Merker geleert, sobald das Ziel
 *  erreicht ist oder die Fuehrung endet. Vorher blieb er fuer immer gesetzt:
 *  endete eine Fuehrung auf /dashboard/lohn und ging die Person danach selbst
 *  nach /dashboard/feld, lud die naechste Fuehrung dorthin dieselbe Seite neu
 *  und sprang nach oben. */
export function erzeugeNavigationsMerker(): NavigationsMerker {
  let letzterPush: string | null = null;
  const angekommen = (aktuell: string) => {
    if (letzterPush !== null && stehtAufZiel(aktuell, letzterPush)) letzterPush = null;
  };
  return {
    station(aktuell, ziel) {
      angekommen(aktuell);
      const navigationLaeuft = letzterPush !== null;
      if (!navigationLaeuft && stehtAufZiel(aktuell, ziel)) return false;
      letzterPush = ziel;
      return true;
    },
    angekommen,
    beenden() {
      letzterPush = null;
    },
  };
}
