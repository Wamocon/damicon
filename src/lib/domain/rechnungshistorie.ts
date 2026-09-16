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
  // Anforderung 5.1/5.2: null = Standard-Preisliste (Fallback fuer alle
  // Kundengruppen), gesetzt = gilt nur fuer diese Kundengruppe.
  kundengruppe: string | null;
  positionen: PreislistenPositionEintrag[];
}

export interface LieferungFuerProforma {
  id: string;
  geliefertAm: string;
  mengeKg: number;
  sorteId: string | null;
  kundengruppe: string | null;
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
//
// Anforderung 5.1/5.2 (Preisstaffelung je Kundengruppe): eine zur
// Kundengruppe passende Preisliste geht einer gruppenlosen Standardliste
// vor, unabhaengig vom jeweiligen gueltig_ab - eine gezielt fuer "handel"
// hinterlegte Liste soll nicht von einer juengeren, aber gruppenlosen
// Standardliste verdraengt werden. Erst innerhalb derselben Spezifitaet
// (gruppengleich bzw. beide gruppenlos) entscheidet gueltig_ab.
export function preisAmStichtag(
  preislisten: PreislisteEintrag[],
  sorteId: string,
  stichtag: string,
  kundengruppe: string | null = null,
): number | null {
  const tag = stichtag.slice(0, 10);
  const gueltig = preislisten.filter(
    (p) => p.gueltigAb <= tag && (!p.gueltigBis || p.gueltigBis >= tag),
  );

  const sortiertNachDatum = (liste: PreislisteEintrag[]) =>
    [...liste].sort((a, b) => b.gueltigAb.localeCompare(a.gueltigAb));

  // "== null" bewusst statt "=== null": aeltere Aufrufer (u. a. bestehende
  // Tests) kennen das Feld kundengruppe noch nicht und liefern dann
  // "undefined" statt "null" - beides soll als gruppenlose Standardliste
  // gelten, nicht stillschweigend gar keine Preisliste mehr finden.
  const gruppenspezifisch = kundengruppe
    ? sortiertNachDatum(gueltig.filter((p) => p.kundengruppe === kundengruppe))
    : [];
  const standard = sortiertNachDatum(gueltig.filter((p) => p.kundengruppe == null));

  for (const preisliste of [...gruppenspezifisch, ...standard]) {
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
    const preisTengeKg = l.sorteId
      ? preisAmStichtag(preislisten, l.sorteId, l.geliefertAm, l.kundengruppe)
      : null;
    return {
      lieferungId: l.id,
      geliefertAm: l.geliefertAm,
      mengeKg: l.mengeKg,
      preisTengeKg,
      betragTenge: preisTengeKg === null ? null : Math.round(preisTengeKg * l.mengeKg * 100) / 100,
    };
  });
}
