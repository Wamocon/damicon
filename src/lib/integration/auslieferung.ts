import { SPERRE_MINUTEN, baueUmschlag, fortschritt, type Fortschritt, type Umschlag, type Zustellung } from "@/lib/domain/integration-auslieferung";

// Die Auslieferung der Warteschlange (WMCNL-1627): holt die faelligen Eintraege, sperrt jeden fuer die Dauer des Versuchs, sendet ihn ueber
// den Adapter und haelt das Ergebnis fest. Ohne Datenbank und ohne Netz testbar: der Speicher und der Sender kommen von aussen.
//
// Zwei Laeufe zur selben Zeit (Cron und Knopf) senden nichts doppelt: beanspruche() schiebt den naechsten Versuch nach hinten und
// gelingt nur dem Lauf, der den Eintrag in dem Zustand sieht, in dem er ihn gelesen hat. Ein Lauf, der mitten im Versuch stirbt,
// laesst den Eintrag nach SPERRE_MINUTEN wieder faellig werden.

export interface OutboxEintrag {
  id: string;
  ereignis: string | null;
  idempotenzSchluessel: string | null;
  payload: unknown;
  versuche: number;
  erstelltAm: string;
  /** Der Zeitpunkt, wie er gelesen wurde (ISO): Bedingung fuer das Beanspruchen. */
  naechsterVersuchAm: string;
}

export interface IntegrationsZiel {
  id: string;
  key: string;
  adapter: string;
  zielUrl: string | null;
  geheimnisName: string | null;
}

export interface AuslieferungSpeicher {
  faellige(jetzt: Date, limit: number): Promise<{ eintrag: OutboxEintrag; integration: IntegrationsZiel }[]>;
  /** Sperrt den Eintrag bis `bis`. false, wenn ihn ein anderer Lauf schon genommen oder veraendert hat. */
  beanspruche(id: string, erwartet: string, bis: Date): Promise<boolean>;
  speichere(id: string, ergebnis: Fortschritt, jetzt: Date): Promise<void>;
}

export type Sender = (integration: IntegrationsZiel, umschlag: Umschlag) => Promise<Zustellung>;

export interface AuslieferungsErgebnis {
  versucht: number;
  zugestellt: number;
  wiederholen: number;
  gescheitert: number;
  /** Eintraege, die ein anderer Lauf schon genommen hatte. */
  uebersprungen: number;
}

/** Liefert bis zu `limit` faellige Eintraege aus. */
export async function liefereAus(speicher: AuslieferungSpeicher, sender: Sender, jetzt: Date, limit = 20): Promise<AuslieferungsErgebnis> {
  const ergebnis: AuslieferungsErgebnis = { versucht: 0, zugestellt: 0, wiederholen: 0, gescheitert: 0, uebersprungen: 0 };
  const faellig = await speicher.faellige(jetzt, limit);

  for (const { eintrag, integration } of faellig) {
    const bis = new Date(jetzt.getTime() + SPERRE_MINUTEN * 60_000);
    if (!(await speicher.beanspruche(eintrag.id, eintrag.naechsterVersuchAm, bis))) {
      ergebnis.uebersprungen += 1;
      continue;
    }
    const umschlag = baueUmschlag({ id: eintrag.id, ereignis: eintrag.ereignis, idempotenzSchluessel: eintrag.idempotenzSchluessel, erstelltAm: eintrag.erstelltAm, versuche: eintrag.versuche, payload: eintrag.payload });
    let zustellung: Zustellung;
    try {
      zustellung = await sender(integration, umschlag);
    } catch (fehler) {
      // Ein Fehler im Adapter selbst ist ein vorlaeufiger Fehler des Versuchs, nie ein Abbruch des ganzen Laufs.
      zustellung = { art: "wiederholen", grund: fehler instanceof Error ? fehler.message.slice(0, 200) : "Adapter-Fehler", status: null };
    }
    const neu = fortschritt({ versuche: eintrag.versuche }, zustellung, jetzt);
    await speicher.speichere(eintrag.id, neu, jetzt);
    ergebnis.versucht += 1;
    if (neu.status === "sent") ergebnis.zugestellt += 1;
    else if (neu.status === "failed") ergebnis.gescheitert += 1;
    else ergebnis.wiederholen += 1;
  }
  return ergebnis;
}
