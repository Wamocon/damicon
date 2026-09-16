// Rechnungshistorie fuer Kunden (Masterplan-Anforderung 5.2, Teil 2b). Reine
// Typen/Rechenlogik ohne Server-Import, wie domain/lieferungen.ts.
//
// Fachliche Festlegung (Nutzer-Entscheidung, siehe PR): eine "Rechnung" ist
// hier eine ERRECHNETE PROFORMA aus Liefermenge und der zum Liefertermin
// gueltigen Preisliste - keine rechtsverbindliche Rechnung und kein Ersatz
// fuer die tatsaechlich von der Buchhaltung gebuchte Ledger-Zeile
// (finance_ledger_entries, die davon abweichen kann, siehe
// Migrationskommentar 20260926000000). Deutlich als Proforma auszuweisen,
// nirgends als "Rechnung" ohne diesen Zusatz.

export interface PreislistenPositionEintrag {
  sorteId: string;
  preisTengeKg: number;
}

export interface PreislisteEintrag {
  gueltigAb: string;
  gueltigBis: string | null;
  positionen: PreislistenPositionEintrag[];
}

export interface LieferungFuerProforma {
  id: string;
  geliefertAm: string;
  mengeKg: number;
  sorteId: string | null;
}

export interface ProformaZeile {
  lieferungId: string;
  geliefertAm: string;
  mengeKg: number;
  preisTengeKg: number | null;
  betragTenge: number | null;
}

// Preis zu einem Stichtag: die Preisliste, deren Gueltigkeit den Tag
// einschliesst, mit einer Position fuer die betroffene Sorte. Bei
// ueberlappenden Preislisten (sollte durch fachliche Pflege nicht vorkommen)
// gewinnt die mit dem spaeteren gueltig_ab - dieselbe "je juenger, desto
// massgeblicher"-Regel wie bei ladePreislisten() fuer die aktuell gueltige.
export function preisAmStichtag(
  preislisten: PreislisteEintrag[],
  sorteId: string,
  stichtag: string,
): number | null {
  const tag = stichtag.slice(0, 10);
  const treffer = preislisten
    .filter((p) => p.gueltigAb <= tag && (!p.gueltigBis || p.gueltigBis >= tag))
    .sort((a, b) => b.gueltigAb.localeCompare(a.gueltigAb));

  for (const preisliste of treffer) {
    const position = preisliste.positionen.find((pos) => pos.sorteId === sorteId);
    if (position) return position.preisTengeKg;
  }
  return null;
}

export function berechneProforma(
  lieferungen: LieferungFuerProforma[],
  preislisten: PreislisteEintrag[],
): ProformaZeile[] {
  return lieferungen.map((l) => {
    const preisTengeKg = l.sorteId ? preisAmStichtag(preislisten, l.sorteId, l.geliefertAm) : null;
    return {
      lieferungId: l.id,
      geliefertAm: l.geliefertAm,
      mengeKg: l.mengeKg,
      preisTengeKg,
      betragTenge: preisTengeKg === null ? null : Math.round(preisTengeKg * l.mengeKg * 100) / 100,
    };
  });
}
