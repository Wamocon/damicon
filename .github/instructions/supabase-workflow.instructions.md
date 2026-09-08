---
description: Load these instructions when the user is working with Supabase (Docker setup, migrations, seeding data, or any Supabase-related task).
applyTo: "**/supabase/**,**/docker-compose*,**/.env.local,**/.env"
---

# Supabase-Workflow: gehostetes Projekt, nicht lokal

Damicon läuft entwicklungsseitig gegen das **gehostete** Supabase-Projekt, nicht gegen
eine lokale Docker-Instanz. `.env.local` trägt bewusst die Zugangsdaten des gehosteten
Projekts (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`) - das
ist keine Fehlkonfiguration, sondern die vom Projekt gewählte Arbeitsweise.

Daraus folgt für jede Aufgabe in diesem Bereich:

1. **Kein `supabase start` / `supabase db reset --local`.** Es gibt keinen aktiven
   lokalen Docker-Stack im normalen Entwicklungsablauf. `npm run dev`,
   `npm run db:test` und `npm run db:seed-auth` sprechen alle direkt mit dem
   gehosteten Projekt (über `--env-file=.env.local`).
2. **Neue Migrationen:** Datei unter `supabase/migrations/` mit
   Zeitstempel-Präfix anlegen, dann `npm run db:push`
   (`supabase db push`) direkt aufs gehostete Projekt. Bei nicht offensichtlich
   risikofreien Änderungen vorher kurz mit `supabase db push --dry-run` prüfen,
   was angewendet würde.
3. **Migrationen vor dem Push absichern**, ohne Docker: `npm run db:test:fast`
   (PGlite, eine eingebettete In-Memory-Postgres) wendet alle Migrationen frisch
   an und prüft grundlegende RLS-/Trigger-Regeln - kein Netzzugriff nötig, in
   Sekunden fertig. Bei RPCs/Funktionen zusätzlich ein Wegwerf-Skript nach
   demselben Muster schreiben (siehe `supabase/tests/pglite-fast.mjs` als
   Vorlage) und die Funktion dort direkt aufrufen, bevor sie das gehostete
   Projekt erreicht - jede SQL-Änderung, die nur "gegen die Cloud ausprobiert"
   wird, kostet einen echten Round-Trip auf einer geteilten Datenbank.
4. **TypeScript-Typen:** `npm run db:types` (`supabase gen types typescript
   --linked`) erzeugt sie aus dem Schema des verlinkten (gehosteten) Projekts.
5. **Schreibende Tests/Skripte gegen das gehostete Projekt** (z. B. ein
   Ad-hoc-Node-Skript mit dem Service-Role-Key) sind reguläre Arbeit an diesem
   Projekt, keine Ausnahme - aber es ist eine geteilte Datenbank: erzeugte
   Testzeilen nach der Verifikation wieder löschen, nicht liegen lassen.

Nachweiskette dieser Entscheidung: das Projekt hatte zeitweise fälschlich einen
lokalen Docker-Workflow parallel gepflegt (`supabase/config.toml`,
`supabase db reset --local`), obwohl `.env.local` nie auf die lokale Instanz
zeigte - das führte zu einer Verwechslung, welche Datenbank tatsächlich getestet
wurde. Seither gilt: eine einzige Zielumgebung, das gehostete Projekt.
