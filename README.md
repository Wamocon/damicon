# Damicon

Interner Prototyp einer Betriebssteuerung für einen **Himbeerbetrieb im Umland Almaty**.
Damicon überträgt das bestehende **1Çatı**-ERP-Ökosystem (Immobilienbranche) identisch,
nur mit anderem fachlichen Fokus, auf den Agrar-Kontext.

> **Status:** Meilenstein C - geschlossene Nachweiskette, vorführbereit.
> Auf Meilenstein B (Anmeldung, Rollenrechte über Row Level Security,
> Standortverwaltung, Reihenblock-Sperre, Fotobeleg, Dokumente) setzt C die
> Kette auf: jede Pflückaufgabe erzeugt ihre Charge, die Steige trägt die
> Person, die Arbeitszeit macht die Pflückleistung messbar, die 60-Minuten-Regel
> der Kühlkette urteilt in der Datenbank, und der Rückstandsnachweis hängt an
> der Charge. **Acht der 14 Baseline-Kennzahlen werden dadurch aus echten Daten
> gerechnet** statt behauptet; die übrigen sechs sagen an der Kachel, welche
> Funktion ihnen fehlt.

## Tech Stack

- **Framework:** Next.js 16 (App Router, `src/app/`)
- **Sprache:** TypeScript (strict)
- **Styling:** Tailwind CSS v4, Design-Tokens in `src/app/globals.css` (Himbeer-Palette)
- **i18n:** next-intl v4 - Deutsch, Englisch, Türkisch, Kasachisch, Russisch (`src/messages/`)
- **Locale-Routing und Session:** `src/proxy.ts` (Next.js 16 Proxy)
- **Datenbank:** Supabase (PostgreSQL, RLS, Auth, Storage) - lokal über die Supabase CLI

## Zwei Betriebsarten

| Modus | Voraussetzung | Verhalten |
|---|---|---|
| **Demo** | keine Supabase-Variablen in `.env.local` | Alle Ansichten zeigen die Beispieldaten aus `src/lib/domain/`, die Rolle ist frei umschaltbar, keine Anmeldung |
| **Datenbank** | `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` gesetzt | Echte Anmeldung, echte Daten, Schreibvorgänge unter RLS |

Jede angebundene Ansicht zeigt oben rechts, aus welcher Quelle sie liest
("Live-Daten" oder "Beispieldaten").

## Quick Start

### Ohne Datenbank (reine Demo)

```bash
npm install
npm run dev
```

[http://localhost:3000](http://localhost:3000) öffnen - leitet auf `/de` weiter.

### Mit Datenbank

```bash
npm install
supabase start          # lokale Supabase-Instanz (Docker)
npm run db:reset        # Migrationen + Seed + Demo-Benutzer
npm run dev
```

Anmeldung unter `/de/login`. Die sieben Demo-Konten werden von `npm run db:seed-auth`
angelegt - je Rolle eines, Passwort für alle `MalinaDemo2026!`:

| Rolle | Konto |
|---|---|
| Administration | `admin@malina.demo` |
| Betriebsleitung | `leitung@malina.demo` |
| Buchhaltung | `buchhaltung@malina.demo` |
| Brigade / Feld | `brigade@malina.demo` |
| Pflücker | `pfluecker@malina.demo` |
| Erzeuger | `erzeuger@malina.demo` |
| Kunde | `kunde@malina.demo` |

Mehrfaktor-Authentifizierung (TOTP) ist optional je Konto - einrichten unter
`/de/dashboard/sicherheit`. Ist ein Faktor aktiv, verlangt sowohl der Login als
auch jeder direkte Aufruf von `/dashboard/*` zusätzlich zum Passwort den
6-stelligen Code (`src/proxy.ts`, AAL-Prüfung über
`supabase.auth.mfa.getAuthenticatorAssuranceLevel()`).

## Struktur

| Pfad | Inhalt |
|---|---|
| `src/app/[locale]/page.tsx` | Öffentliche Landingpage |
| `src/app/[locale]/login/` | Anmeldung und Server Actions für An-/Abmeldung |
| `src/app/[locale]/dashboard/` | Dashboard-Shell + Zonen `feld`, `hof`, `buero`, `markt` |
| `src/lib/modules.ts` | Zonen- und Modul-Registry (Reifegrad, Klassifikation) |
| `src/lib/rbac.ts` | Sieben Kernrollen und Rechtematrix |
| `src/lib/auth.ts` | Session, Profil und Berechtigungsprüfung für Server Actions |
| `src/lib/data/` | Datenbankabfragen mit Rückfall auf die Beispieldaten |
| `src/lib/actions/` | Server Actions (Schreibvorgänge, jeweils RBAC- und RLS-geprüft) |
| `src/lib/domain/` | Beispieldaten (Hierarchie, Reihenblöcke, Pflückaufgaben, KPIs) |
| `src/components/db/` | Datenbankgestützte Modulansichten (Meilenstein B) |
| `src/components/demo/` | Demo-Oberflächen der noch nicht angebundenen Module |
| `supabase/migrations/` | Schema, RLS-Policies, Trigger, Storage-Buckets |

## Regeln, die in der Datenbank liegen

Nicht im UI, sondern als Trigger bzw. Funktion - sie greifen auch bei direktem
API-Zugriff und lassen sich durch kein Formular umgehen:

- **Wartezeitsperre:** Eine neue Pflanzenschutzbehandlung sperrt den Reihenblock
  (`lock_reihenblock_on_behandlung`); ein vorzeitiger Statuswechsel wird abgewiesen
  (`reihenblock_sperre_pruefen`); die reguläre Freigabe läuft über
  `reihenblock_freigeben()`.
- **Kein Pflücken auf gesperrtem Block** - beim Anlegen und bei jedem
  Fortschritt einer laufenden Aufgabe (`pflueckaufgabe_sperre_pruefen`).
- **Vier Augen:** Die Brigade meldet die Menge, abschließen und den
  Qualitätsfaktor setzen darf nur die Leitung
  (`pflueckaufgabe_freigabe_pruefen`). Eine abgeschlossene Aufgabe lässt sich
  nicht zurückdrehen.
- **Jede Aufgabe erzeugt ihre Charge** (`charge_zur_aufgabe_anlegen`), der
  Arbeitsbeginn startet die Kühlkettenuhr, der Abschluss schreibt den
  Ist-Erntetermin fort (`aufgabe_fortschreiben`).
- **60-Minuten-Regel:** Minuten und Urteil einer Kühlmessung rechnet
  `kuehlkette_bewerten` aus dem Pflückzeitpunkt - nicht das Formular.
- **Rollen:** Die Rolle eines neuen Zugangs kommt aus `app_metadata`
  (nur service_role) und lässt sich vom eigenen Profil aus nicht anheben.
  Dasselbe gilt für die Zuordnung zu Brigade, B2B-Kunde und Pflückerstamm
  (`profil_zuordnung_schuetzen`) - nur das Büro darf sie setzen, sonst liesse
  sich fremde Lohn- bzw. Reklamationssicht erschleichen.
- **Append-only:** Finanzjournal und Audit-Protokoll lassen sich weder ändern
  noch löschen (`block_ledger_mutation`); der Urheber im Protokoll wird
  serverseitig gesetzt (`audit_actor_setzen`).
- **Eigene Leistung statt Betriebssicht:** Die Rolle `picker` sieht im
  Lohn-Modul ausschliesslich die eigene Abrechnung
  (`lohn_abrechnungen_select_own`, `lohn_positionen_select_own`) - dieselbe
  Seite wie Betriebsleitung/Buchhaltung, nur RLS-gefiltert auf
  `profiles.pfluecker_id`.
- **Rotationsplan:** `rotationsplan_generieren()` setzt den 2-3-Tage-Zyklus
  je Reihenblock am zuletzt geplanten bzw. tatsaechlichen Erntetermin fort.
  Eine neue Behandlung sperrt betroffene Plantermine automatisch
  (`rotationsplan_sperren`), die Freigabe gibt sie wieder frei
  (`rotationsplan_entsperren`), und die erste passende Pflueckaufgabe
  markiert einen Termin als erledigt (`rotationsplan_erledigen`) - alles
  als Trigger, nicht als Anwendungslogik.

## Kennzahlen

`public.kpi_aktuell()` rechnet die Baseline-Kennzahlen, die sich aus den
vorhandenen Daten ableiten lassen - derzeit acht von 14. Was die Funktion nicht
liefert, bleibt Platzhalter aus `kpi_baseline`, und die Kachel nennt die
fehlende Funktion. `public.rueckstandsnachweis(charge)` beantwortet die Frage
von Handel und Behörde: welche Behandlungen betreffen diese Lieferung, und war
die Wartezeit eingehalten?

## Scripts

| Command | Beschreibung |
|---|---|
| `npm run dev` | Dev-Server (Turbopack) |
| `npm run build` | Produktions-Build |
| `npm run typecheck` | TypeScript-Prüfung |
| `npm run lint` | ESLint |
| `npm run verify` | typecheck + lint + build |
| `npm run db:reset` | Datenbank zurücksetzen: Migrationen, Seed, Demo-Benutzer |
| `npm run db:seed-auth` | Nur die sieben Demo-Benutzer anlegen bzw. auffrischen |
| `npm run db:types` | TypeScript-Typen aus dem lokalen Schema erzeugen |
| `npm run db:test` | Integrationstests: Round-Trip, RLS je Rolle, Sperrlogik (braucht laufendes lokales Supabase) |
| `npm run db:test:fast` | Dieselbe Art Fachregeln gegen PGlite statt Docker - kein `supabase start` nötig, für den schnellen Zwischenstand während der Entwicklung; ersetzt `db:test` nicht |

## Dokumentation

- **[docs/manual/index.html](docs/manual/index.html)** - Produkthandbuch
- Technische Analyse: `WMC_TechnischeAnalyse_1Cati_Himbeerplantage.md` (extern)
