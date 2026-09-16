import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, type Datenquelle } from "@/lib/supabase/config";
import { einsAus } from "@/lib/data/util";

// Kuehlketten-Cockpit (Anforderung 3.1, Hof-weite Uebersicht). Die eigentliche
// Alarmlogik - live mitzaehlend, bevor die 60-Minuten-Grenze reisst - existiert
// bereits als KuehlkettenAlarm (kuehlketten-alarm.tsx), bisher aber nur
// eingebettet in die Nachweiskette EINER einzelnen Pflueckaufgabe. Diese Datei
// liefert die fehlende, betriebsweite Sicht: alle Chargen, die gerade auf der
// Uhr stehen (gepflueckt, aber noch nicht vorgekuehlt), an einem Ort statt
// aufgeteilt auf einzelne Aufgaben-Detailseiten.

export type KuehlErgebnis = "ok" | "warnung" | "verstoss";

export interface OffeneCharge {
  chargeId: string;
  chargeCode: string;
  reihenblockCode: string | null;
  pflueckZeitpunkt: string;
}

export interface AbgeschlosseneMessung {
  id: string;
  chargeCode: string;
  reihenblockCode: string | null;
  gemessenAm: string;
  temperaturC: number;
  minutenSeitPfluecken: number | null;
  ergebnis: KuehlErgebnis;
}

export interface KuehlkettenUebersicht {
  quelle: Datenquelle;
  offeneChargen: OffeneCharge[];
  letzteMessungen: AbgeschlosseneMessung[];
}

// Relativ zu "jetzt" berechnet, damit die Demo-Ansicht ohne Datenbank
// ebenfalls lebendig wirkt statt eine Charge zu zeigen, die angeblich seit
// drei Tagen auf die Vorkuehlung wartet - dieselbe Ueberlegung wie in
// domain/pflueckaufgaben.ts und supabase/seed.sql. Wird einmal beim Laden
// dieses Moduls (Serverstart bzw. erster Aufruf) berechnet, nicht bei jedem
// Aufruf von ladeKuehlkettenUebersicht() - fuer eine Demo-Anzeige ohne echten
// Nutzer unerheblich.
const vorMinuten = (minuten: number) => new Date(Date.now() - minuten * 60_000).toISOString();

function demoUebersicht(quelle: KuehlkettenUebersicht["quelle"] = "demo"): KuehlkettenUebersicht {
  return {
    quelle,
    offeneChargen: [
      { chargeId: "demo-charge-1", chargeCode: "CH-T-N-A-01-DEMO1", reihenblockCode: "T-N-A-01", pflueckZeitpunkt: vorMinuten(12) },
      { chargeId: "demo-charge-2", chargeCode: "CH-T-O-A-01-DEMO2", reihenblockCode: "T-O-A-01", pflueckZeitpunkt: vorMinuten(52) },
      { chargeId: "demo-charge-3", chargeCode: "CH-T-N-A-03-DEMO3", reihenblockCode: "T-N-A-03", pflueckZeitpunkt: vorMinuten(74) },
    ],
    letzteMessungen: [
      {
        id: "demo-messung-1",
        chargeCode: "CH-T-N-A-01-DEMO0",
        reihenblockCode: "T-N-A-01",
        gemessenAm: vorMinuten(20),
        temperaturC: 3.4,
        minutenSeitPfluecken: 38,
        ergebnis: "ok",
      },
      {
        id: "demo-messung-2",
        chargeCode: "CH-T-O-A-02-DEMO0",
        reihenblockCode: "T-O-A-02",
        gemessenAm: vorMinuten(95),
        temperaturC: 6.8,
        minutenSeitPfluecken: 63,
        ergebnis: "verstoss",
      },
    ],
  };
}

export async function ladeKuehlkettenUebersicht(): Promise<KuehlkettenUebersicht> {
  if (!isSupabaseConfigured()) return demoUebersicht();

  const supabase = await createClient();

  const [{ data: offen, error: offenFehler }, { data: messungen, error: messungenFehler }] =
    await Promise.all([
      supabase
        .from("chargen")
        .select("id, code, pflueck_zeitpunkt, reihenbloecke ( code )")
        .not("pflueck_zeitpunkt", "is", null)
        .is("vorkuehlung_zeitpunkt", null)
        .order("pflueck_zeitpunkt", { ascending: true })
        .limit(50),
      supabase
        .from("kuehlketten_messungen")
        .select(
          "id, gemessen_am, temperatur_c, minuten_seit_pfluecken, ergebnis, chargen ( code, reihenbloecke ( code ) )",
        )
        .order("gemessen_am", { ascending: false })
        .limit(15),
    ]);

  if (offenFehler || messungenFehler || !offen || !messungen) return demoUebersicht("fehler");

  return {
    quelle: "db",
    offeneChargen: offen.map((c) => ({
      chargeId: c.id,
      chargeCode: c.code,
      // Anforderung 3.1 verlangt gerade das Umgekehrte einer Meldung nach dem
      // Ablauf - ohne bekannten Pfluecktzeitpunkt (sollte nie vorkommen, das
      // .not()-Filter oben schliesst null aus) gaebe es nichts anzuzeigen.
      reihenblockCode: einsAus(c.reihenbloecke)?.code ?? null,
      pflueckZeitpunkt: c.pflueck_zeitpunkt as string,
    })),
    letzteMessungen: messungen.map((m) => {
      const charge = einsAus(m.chargen);
      return {
        id: m.id,
        chargeCode: charge?.code ?? "-",
        reihenblockCode: einsAus(charge?.reihenbloecke)?.code ?? null,
        gemessenAm: m.gemessen_am,
        temperaturC: Number(m.temperatur_c),
        minutenSeitPfluecken: m.minuten_seit_pfluecken,
        ergebnis: m.ergebnis as KuehlErgebnis,
      };
    }),
  };
}
