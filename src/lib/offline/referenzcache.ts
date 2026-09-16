import { offlineDb } from "@/lib/offline/db";
import type { ReferenzAufgabe, ReferenzKette, ReferenzPfluecker } from "@/lib/offline/db";

// Anforderung 2.5, Phase 1: Lese-/Schreibzugriff auf den Referenzdaten-Cache.
// Befuellt wird er von ReferenzCacheSync (Client-Komponente, spiegelt die
// ohnehin serverseitig geladenen Daten) - kein zusaetzlicher Netzwerk-Pfad.

export async function aufgabenSpiegeln(
  aufgaben: Omit<ReferenzAufgabe, "zwischengespeichertAm">[],
): Promise<void> {
  const db = await offlineDb();
  const tx = db.transaction("referenz_aufgaben", "readwrite");
  const jetzt = new Date().toISOString();
  await Promise.all([
    ...aufgaben.map((a) => tx.store.put({ ...a, zwischengespeichertAm: jetzt })),
    tx.done,
  ]);
}

export async function pflueckerSpiegeln(
  pfluecker: Omit<ReferenzPfluecker, "zwischengespeichertAm">[],
): Promise<void> {
  const db = await offlineDb();
  const tx = db.transaction("referenz_pfluecker", "readwrite");
  const jetzt = new Date().toISOString();
  await Promise.all([
    ...pfluecker.map((p) => tx.store.put({ ...p, zwischengespeichertAm: jetzt })),
    tx.done,
  ]);
}

export async function ketteSpiegeln(
  eintrag: Omit<ReferenzKette, "zwischengespeichertAm">,
): Promise<void> {
  const db = await offlineDb();
  await db.put("referenz_ketten", { ...eintrag, zwischengespeichertAm: new Date().toISOString() });
}

// Leseseite des Caches. Sie wird noch von keiner Ansicht aufgerufen: Phase 1
// spiegelt die Daten nur hinein, gelesen wird weiterhin vom Server. Die drei
// Funktionen stehen hier, damit die Offline-Ansicht sie nur noch aufrufen
// muss - absichtlich vorhanden, kein toter Rest.
export async function gespiegelteAufgaben(): Promise<ReferenzAufgabe[]> {
  const db = await offlineDb();
  return db.getAll("referenz_aufgaben");
}

export async function gespiegeltePfluecker(): Promise<ReferenzPfluecker[]> {
  const db = await offlineDb();
  return db.getAll("referenz_pfluecker");
}

export async function gespiegelteKette(aufgabeId: string): Promise<ReferenzKette | undefined> {
  const db = await offlineDb();
  return db.get("referenz_ketten", aufgabeId);
}
