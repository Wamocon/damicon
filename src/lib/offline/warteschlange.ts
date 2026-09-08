import { offlineDb } from "@/lib/offline/db";
import type { WarteschlangenEintrag } from "@/lib/offline/db";

// Anforderung 2.5, Phase 1: reine Verwaltungsfunktionen fuer die lokale
// Warteschlange - noch fuellt sie niemand (das kommt ab Phase 2 mit dem
// ersten Pilot-Workflow), aber das Geruest steht bereits vollstaendig und
// lauffaehig.

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
}

export async function alleEintraege(): Promise<WarteschlangenEintrag[]> {
  const db = await offlineDb();
  return db.getAll("warteschlange");
}

export async function anzahlWartend(): Promise<number> {
  const db = await offlineDb();
  return db.countFromIndex("warteschlange", "by-status", "wartend");
}

export async function wartendeEintraege(): Promise<WarteschlangenEintrag[]> {
  const db = await offlineDb();
  return db.getAllFromIndex("warteschlange", "by-status", "wartend");
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
}

export async function eintragEntfernen(aktionId: string): Promise<void> {
  const db = await offlineDb();
  await db.delete("warteschlange", aktionId);
}
