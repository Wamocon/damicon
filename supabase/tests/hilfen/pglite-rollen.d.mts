// Typen fuer die Test-Grundlage pglite-rollen.mjs, damit .mts-Tests ihre Abfragen ohne Umwege nutzen koennen.

export const ROLLEN: readonly string[];

export interface TestDb {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query<T = any>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
}

export interface Testumgebung {
  db: TestDb;
  check(name: string, ok: boolean, detail?: string): void;
  /** Auth-Id je Rolle. */
  konten: Record<string, string>;
  kundeId: string;
  alsRolle(rolle: string, authUserId?: string | null): Promise<void>;
  alsAdmin(): Promise<void>;
  /** Fuehrt fn als angemeldetes Konto dieser Rolle aus und setzt danach zurueck. */
  als<T>(rolle: string, fn: () => Promise<T>): Promise<T>;
  mussScheitern(name: string, sql: string, params: unknown[], erwarteterCode?: string): Promise<void>;
  ende(meldung: string): void;
}

export function starte(optionen?: { bis?: string }): Promise<Testumgebung>;
