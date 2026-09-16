import { offlineDb } from "@/lib/offline/db";
import type { WarteschlangenEintrag } from "@/lib/offline/db";

// Anforderung 2.5, Phase 1/2: Verwaltungsfunktionen fuer die lokale
// Warteschlange.

// Verwaltungsfunktionen hier sind die einzige Schreibstelle fuer die
// Warteschlange - Formulare (useOfflineFormular) und die Sync-Engine sind
// aber jeweils eigene Client-Komponenten mit eigenem React-State, ohne
// gemeinsamen Zustand. Ohne dieses Ereignis wuerde z. B. das
// Sync-Status-Panel nach einer offline gestellten Meldung "keine wartenden
// Eintraege" zeigen, bis der naechste eigene Trigger (Fokus, online-Ereignis,
// 30s-Intervall) es zufaellig neu laedt.
export const WARTESCHLANGE_GEAENDERT_EREIGNIS = "damicon:warteschlange-geaendert";

function aenderungMelden(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(WARTESCHLANGE_GEAENDERT_EREIGNIS));
  }
}

type NeuerEintrag = Pick<
  WarteschlangenEintrag,
  "aktionId" | "aktionTyp" | "nutzlast" | "geraetZeitpunkt" | "datei"
>;

export async function eintragen(eintrag: NeuerEintrag): Promise<void> {
  const db = await offlineDb();
  await db.put("warteschlange", {
    ...eintrag,
    status: "wartend",
    versuche: 0,
    letzterFehler: null,
    verarbeitetAm: null,
    naechsterVersuchAb: null,
    erstelltAm: new Date().toISOString(),
  });
  aenderungMelden();
}

export async function alleEintraege(): Promise<WarteschlangenEintrag[]> {
  const db = await offlineDb();
  return db.getAll("warteschlange");
}

// Leseseite fuer die Anzeige "x Buchungen warten". Noch kein Aufrufer: die
// Warteschlange fuellt sich bereits, ein Zaehler in der Oberflaeche fehlt
// aber noch. Absichtlich vorhanden, kein toter Rest.
export async function anzahlWartend(): Promise<number> {
  const db = await offlineDb();
  return db.countFromIndex("warteschlange", "by-status", "wartend");
}

export async function wartendeEintraege(): Promise<WarteschlangenEintrag[]> {
  const db = await offlineDb();
  return db.getAllFromIndex("warteschlange", "by-status", "wartend");
}

// Anforderung 2.5, Phase 2: fuer die Sync-Engine - sowohl frische
// ("wartend") als auch zuvor fehlgeschlagene ("fehler") Eintraege werden
// erneut versucht. Ein "fehler" ist hier nie endgueltig, sondern nur der
// Stand des letzten Versuchs (typischerweise eine abgelaufene Sitzung oder
// ein kurzzeitiger Serverfehler) - ohne diese Zusammenfuehrung wuerde ein
// einmal fehlgeschlagener Eintrag nie wieder gesendet, obwohl Anzeige und
// "Jetzt synchronisieren"-Knopf ihn weiterhin als offen zaehlen.
// "konflikt" bleibt bewusst aussen vor - braucht ab Phase 4 eine bewusste
// Nutzerentscheidung, kein automatisches Retry.
export async function sendbareEintraege(): Promise<WarteschlangenEintrag[]> {
  const db = await offlineDb();
  const [wartend, fehler] = await Promise.all([
    db.getAllFromIndex("warteschlange", "by-status", "wartend"),
    db.getAllFromIndex("warteschlange", "by-status", "fehler"),
  ]);
  return [...wartend, ...fehler];
}

export async function statusAktualisieren(
  aktionId: string,
  aenderung: Partial<
    Pick<
      WarteschlangenEintrag,
      "status" | "versuche" | "letzterFehler" | "verarbeitetAm" | "naechsterVersuchAb"
    >
  >,
): Promise<void> {
  const db = await offlineDb();
  const bestehend = await db.get("warteschlange", aktionId);
  if (!bestehend) return;
  await db.put("warteschlange", { ...bestehend, ...aenderung });
  aenderungMelden();
}

export async function eintragEntfernen(aktionId: string): Promise<void> {
  const db = await offlineDb();
  await db.delete("warteschlange", aktionId);
  aenderungMelden();
}
