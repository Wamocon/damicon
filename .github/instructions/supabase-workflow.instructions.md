---
description: Load these instructions when the user is working with Supabase (Docker setup, migrations, seeding data, or any Supabase-related task).
applyTo: "**/supabase/**,**/docker-compose*,**/.env.local,**/.env"
---

# Supabase-Workflow: lokal entwickeln, gehostet migrieren

Damicon entwickelt gegen eine **lokale** Supabase-Instanz. `.env.local` trägt die
Zugangsdaten des lokalen Stacks (`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`),
nicht die des gehosteten Projekts. Migrationen und Typen laufen dagegen weiterhin
über das verknüpfte gehostete Projekt.

Diese Trennung ist Absicht, aber sie ist auch die Stelle, an der etwas
auseinanderlaufen kann: Wer eine Migration nur pusht, hat sie lokal noch nicht.

## Was wohin zeigt

| Befehl | Ziel |
|---|---|
| `npm run dev` | lokal (`.env.local`) |
| `npm run db:test`, `db:seed-auth`, `db:testdaten`, `db:bestand` | lokal (`--env-file=.env.local`) |
| `npm run db:test:fast` | PGlite im Arbeitsspeicher, weder noch |
| `npm run db:push` | **gehostet** (`supabase db push` auf das verknüpfte Projekt) |
| `npm run db:types` | **gehostet** (`supabase gen types --linked`) |

Ports des lokalen Stacks stehen in `supabase/config.toml`: API 54321, Datenbank
54322. `npx supabase status` zeigt sie jederzeit an.

## Daraus folgt für jede Aufgabe in diesem Bereich

1. **Lokaler Stack ist der Normalfall.** `npx supabase start` bringt ihn hoch,
   `npx supabase db reset` setzt ihn zurück und spielt dabei `supabase/seed.sql`
   ein. Beides ist gefahrlos: die Daten dort gehören niemandem sonst.
2. **Neue Migrationen:** Datei unter `supabase/migrations/` mit
   Zeitstempel-Präfix anlegen. Erst lokal anwenden (`npx supabase db reset` oder
   `npx supabase migration up`), dann `npm run db:push` aufs gehostete Projekt.
   Bei nicht offensichtlich risikofreien Änderungen vorher
   `supabase db push --dry-run` prüfen.
3. **Migrationen absichern, ohne Docker:** `npm run db:test:fast` (PGlite, eine
   eingebettete In-Memory-Postgres) wendet alle Migrationen frisch an und prüft
   grundlegende RLS-/Trigger-Regeln - kein Netzzugriff nötig, in Sekunden fertig.
   Bei RPCs/Funktionen zusätzlich ein Wegwerf-Skript nach demselben Muster
   schreiben (siehe `supabase/tests/pglite-fast.mjs` als Vorlage).
4. **TypeScript-Typen:** `npm run db:types` erzeugt sie aus dem Schema des
   verknüpften gehosteten Projekts. Nach einem `db:push` ausführen, nicht davor -
   sonst beschreiben die Typen einen Stand, den es dort noch nicht gibt.
5. **Vor dem Schreiben nachsehen, wohin.** `supabase/testdaten.mjs` prüft die
   Adresse selbst und verlangt auf einer nicht-lokalen Instanz zusätzlich
   `--ich-weiss-was-ich-tue`. Eigene Ad-hoc-Skripte sollten das genauso halten:
   eine vergessene `--env-file` ist sonst der einzige Unterschied zwischen
   Spielwiese und geteilter Datenbank.
6. **`finance_ledger_entries` ist nur anfügbar.** Ein Trigger verhindert Ändern
   und Löschen, ohne Ausnahme für `service_role`. Und weil
   `finance_ledger_entries.kostentraeger_id` auf `on delete set null` steht -
   was ein UPDATE auf die gesperrte Tabelle wäre -, ist auch ein Kostenträger
   mit Buchung nicht mehr löschbar. Lokal räumt ein `db reset` das weg, auf der
   gehosteten Instanz nichts.

## Nachweiskette dieser Entscheidung

Das Projekt hatte zeitweise die umgekehrte Regel: `.env.local` zeigte auf das
gehostete Projekt, ein lokaler Docker-Workflow galt als überholt. Der Grund
damals war eine Verwechslung, welche Datenbank tatsächlich getestet wurde.

Inzwischen läuft die Entwicklung wieder lokal. Die Lehre von damals gilt
trotzdem: Es muss jederzeit klar sein, wogegen ein Befehl arbeitet. Deshalb die
Tabelle oben und die Selbstprüfung in `testdaten.mjs` - nicht die Rückkehr zu
einer einzigen Zielumgebung.
