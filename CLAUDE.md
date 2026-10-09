## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec

## Datenbankmigrationen

**Keine Migration ohne Migrationsdatei.** Jede Änderung an der Datenbank (Tabellen, Spalten, Funktionen, Policies, Trigger, Indizes, Rechte, produktive Stammdaten) wird als Datei unter `supabase/migrations/` geschrieben und im selben Branch gepusht. Die Migrations-Workflows springen nur an, wenn die Datei im Repository liegt:

- `datenbank-migration-preview.yml` wendet sie beim Push in den Pull Request auf `public_preview` an.
- `datenbank-migration.yml` wendet sie nach dem Merge auf `public` an.
- `datenbank-drift.yml` meldet täglich jede Abweichung zwischen Dateien, `public` und `public_preview`.

Regeln:

1. **Nie direkt gegen die Cloud-Datenbank.** Kein `supabase db push`, kein `supabase db query --linked` mit schreibendem SQL, kein MCP `apply_migration` oder `execute_sql` mit Schreibzugriff, kein SQL im Dashboard. Ein Hook (`.claude/hooks/cloud-datenbank-sperre.mjs`) sperrt das. Getestet wird lokal: `npm run db:test:fast` und der lokale Supabase-Stack.
2. **Schon gemergte Migrationen nie ändern oder umbenennen.** Eine Korrektur ist eine neue Migration.
3. **Versionsnummer:** 14 Stellen, größer als jede Migration auf `main` und größer als die Migrationen in anderen offenen Pull Requests. Vor dem Vergeben nachsehen: `gh pr list --state open --json number,files`. Eine doppelte Nummer lässt den Preview-Lauf des zweiten Pull Requests scheitern.
4. **Datenänderungen** (UPDATE, DELETE) idempotent schreiben, nur die genau gemeinten Zeilen treffen und im Pull Request ausdrücklich als Datenänderung nennen. Die CI pusht Migrationen nach dem Merge automatisch auf die gemeinsame Cloud-Datenbank.
5. **Vor dem Push** `npm run db:migrationen-pruefen` und `npm run test:migrationen`.
6. **Ist doch etwas ohne Datei gelaufen** (Notfall, nur auf Anweisung von Niko): sofort die Migrationsdatei mit dem ausgeführten SQL nachreichen. Sonst meldet der Drift-Check es täglich.
