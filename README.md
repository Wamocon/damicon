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
- **Styling:** Tailwind CSS v4, Design-Tokens in `src/app/globals.css` (Palette „Kök & Altyn“ – Landesfarben Kasachstans), Schriften Manrope und Inter über `next/font`
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
cp .env.example .env.local   # Zugangsdaten des gehosteten Supabase-Projekts eintragen
npm run db:seed-auth         # Demo-Benutzer im gehosteten Projekt anlegen/auffrischen
npm run dev
```

Damicon läuft entwicklungsseitig gegen das gehostete Supabase-Projekt (Zugangsdaten in
`.env.local`), nicht gegen eine lokale Docker-Instanz - `npm run dev`, `npm run db:test`
und `npm run db:seed-auth` sprechen alle direkt mit dem gehosteten Projekt. Neue
Migrationen werden mit `npm run db:push` dorthin übertragen. Einzige Ausnahme:
`npm run db:test:fast` läuft vollständig isoliert gegen eine eingebettete PGlite-Instanz
und braucht keine Netzverbindung.

Anmeldung unter `/de/login`. Die sieben Demo-Konten werden von `npm run db:seed-auth`
angelegt - je Rolle eines, Passwort für alle `DamiconDemo2026!`:

| Rolle | Konto |
|---|---|
| Administration | `admin@damicon.demo` |
| Betriebsleitung | `leitung@damicon.demo` |
| Buchhaltung | `buchhaltung@damicon.demo` |
| Brigade / Feld | `brigade@damicon.demo` |
| Pflücker | `pfluecker@damicon.demo` |
| Erzeuger | `erzeuger@damicon.demo` |
| Kunde | `kunde@damicon.demo` |

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
- **Geräte- statt Servereingang-Zeitstempel:** Arbeitsbeginn, Kühlmessung,
  Steigen-Scan, Arbeitszeitmeldung und Fotobeleg tragen den Zeitpunkt des
  Geräts, nicht die Serverankunft (`geraet_zeitpunkt_pruefen`) - sonst
  verschiebt eine Synchronisierung ohne Netz auf der Fläche die
  Kühlkettenuhr bzw. die gemeldete Arbeitszeit um genau die Verzögerung. Der
  Servereingang wird zusätzlich, unverändert mitgeschrieben statt überschrieben.
  Ein unplausibler Geräte-Zeitstempel (Zukunft, mehr als 24 Stunden Abweichung)
  wird abgelehnt statt stillschweigend übernommen.
- **Statusübergänge nur aus dem erwarteten Vorzustand:** Eine Pflückaufgabe
  lässt sich nicht mehr blind umschreiben - `aufgabeStatusSetzen()` und
  `mengeMelden()` prüfen den bisherigen Status mit (`offen→angenommen→
  in_arbeit→beleg_pruefung→abgeschlossen` ist eine strikte Kette), bevor sie
  schreiben. Ein verzögert synchronisierter, veralteter Schreibvorgang trifft
  dadurch keine Zeile mehr statt eine längst fortgeschrittene Aufgabe
  stillschweigend zurückzudrehen - Vorstufe zu Anforderung 2.5.
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
- **Benannte Verantwortliche (Anforderung 4.8):** Jeder Verarbeitungszweck
  und jeder Datenschutzvorfall trägt eine verantwortliche Person
  (`verantwortlich_profil_id`, Bezug auf `profiles`). Ein neu erfasster
  Vorfall verlangt sie schon beim Anlegen (`vorfallErfassen()` in
  `lib/actions/compliance.ts`); bestehende Einträge ohne Zuordnung lassen
  sich im Compliance-Cockpit nachträglich zuweisen.

## Offline-first (Anforderung 2.5, im Aufbau)

Brigade-Mitarbeitende müssen auf der Plantage ohne Netzverbindung
weiterarbeiten können - dafür entsteht schrittweise eine lokale
Warteschlange in `src/lib/offline/` (IndexedDB über die Bibliothek `idb`):

- `db.ts` - Schema für die Warteschlange (`warteschlange`) und den
  Referenzdaten-Cache (`referenz_aufgaben`, `referenz_pfluecker`,
  `referenz_ketten`).
- `warteschlange.ts` / `referenzcache.ts` - Lese-/Schreibzugriff. Jede
  Änderung an der Warteschlange löst das Fenster-Ereignis
  `damicon:warteschlange-geaendert` aus, damit unabhängige
  Client-Komponenten (Formular und Sync-Panel) ohne gemeinsamen React-State
  synchron bleiben.
- `use-online-status.ts` - Online-/Offline-Erkennung über
  `useSyncExternalStore`.
- `sync-engine.ts` - `synchronisiere()` sendet wartende (und zuvor
  fehlgeschlagene) Einträge sequenziell an `/api/sync`.
- `<SyncStatus />` (Topbar, nur Rolle `brigade`) synchronisiert automatisch
  bei Mount, Fokus, `online`-Ereignis und im 30-Sekunden-Intervall, zusätzlich
  über einen manuellen Knopf; `<ReferenzCacheSync />` spiegelt die ohnehin
  serverseitig geladenen Pflückaufgaben/Pflücker/Ketten in den Cache, kein
  zusätzlicher Netzwerk-Pfad.

**Pilot-Workflows (Phase 2/3): Kühlmessung und Arbeitszeit erfassen.**
Beide Server Actions in `src/lib/actions/nachweiskette.ts` sind in eine
Kernfunktion (`kuehlmessungKern()`/`arbeitszeitKern()`, ruft
`requirePermission()` selbst auf) und einen dünnen FormData-Wrapper
aufgeteilt. `src/app/api/sync/route.ts` - der erste Route Handler des
Projekts - ruft dieselbe Kernfunktion wie das Formular auf, inklusive
eigener AAL2-Prüfung (`requireAal2Aktuell()` in `lib/auth.ts`), da
`src/proxy.ts`s `config.matcher` `/api` ausdrücklich ausschließt. Die
Kernfunktionen unterscheiden `erledigt` (wurde die Zeile geschrieben, ggf.
schon bei einem früheren Versuch) von `status.stand` (fachlicher
Anzeige-Status) - eine Kühlmessung mit Kühlketten-Verstoß ist erfolgreich
geschrieben, obwohl die Meldung ein Alarm ist.

Der Hook `useOfflineFormular()` (`src/components/db/use-offline-formular.ts`)
verbindet ein bestehendes `useActionState`-Formular mit der Warteschlange,
ohne das Formular selbst umzubauen: online läuft `dispatch()` wie bisher,
offline verhindert `event.preventDefault()` in einem regulären
`onSubmit`-Handler auf demselben Formular das Auslösen der Server Action
(React-19-Verhalten) und puffert stattdessen den Eintrag lokal.

Idempotenz bei den vier reinen INSERT-Workflows (Steige, Kühlmessung,
Arbeitszeit, Fotobeleg): der Client generiert die künftige Zeilen-`id`
bereits beim Einreihen, der Sync-Endpunkt schreibt
`upsert(..., {onConflict:"id", ignoreDuplicates:true})` statt `.insert()` -
ein erneut gesendeter Eintrag (z. B. nach einer nie angekommenen Antwort)
legt keine zweite Zeile an.

**Die drei UPDATE-Workflows (Phase 4): Aufgabe annehmen, Pflücken starten,
Menge melden.** Anders als bei den reinen INSERTs existiert die Zielzeile
hier schon vor der Aktion - ein Retry nach einer nie angekommenen Antwort
lässt sich vom serverseitig hartcodierten CAS-Guard (erwarteter Vorzustand)
nicht mehr von einem echten Konflikt unterscheiden. Neue Tabelle
`sync_protokoll` (client-generierte `aktion_id`) plus zwei
`SECURITY INVOKER`-RPCs (`sync_aufgabe_status_setzen`, `sync_menge_melden`)
lösen beides: ein Retry der eigenen `aktion_id` meldet Erfolg ohne erneut zu
schreiben, ein neuer `aktion_id`-Versuch mit fehlgeschlagenem CAS-Guard ist
ein echter Konflikt - im Sync-Panel sichtbar mit einem "Verwerfen"-Knopf.

**Steige erfassen (Phase 5).** Die Laufnummer/den Code berechnete bisher der
Client per `SELECT COUNT(*)` - nicht atomar, zwei nahezu gleichzeitige
Erfassungen (zwei Geräte, oder mehrere gepufferte Steigen einer
Offline-Warteschlange kurz hintereinander synchronisiert) könnten denselben
Code vergeben. Jetzt übernimmt ein `BEFORE INSERT`-Trigger
(`steige_nummer_vergeben()`, Migration `20260915000000`) die Nummerierung
atomar über einen Zähler an der Pflückaufgabe
(`pflueckaufgaben.steigen_zaehler`, per `UPDATE ... RETURNING` erhöht - der
Zeilenlock serialisiert konkurrierende Inserts von selbst). Damit ist "Steige
erfassen" strukturell ein reiner INSERT wie Kühlmessung/Arbeitszeit; der
Client berechnet Code/QR-Token gar nicht mehr selbst. Der Trigger erkennt
einen bereits durch `ON CONFLICT DO NOTHING` verworfenen Sync-Retry (gleiche
Zeilen-`id` existiert schon) und überspringt die Nummerierung dafür - sonst
würde jeder Retry stillschweigend eine Nummer verbrauchen, ohne dass je eine
zweite Zeile entsteht. Offline zeigt die Warteschlange bewusst keine
vorläufige Nummer - der echte Code ist erst nach der Synchronisierung
bekannt, dieselbe Erfahrung wie bei Kühlmessung/Arbeitszeit.

**Fotobeleg (Phase 6).** Passt nicht in `useOfflineFormular()` - eine
Bilddatei ist weder JSON-serialisierbar noch ohne Weiteres puffergerecht
(Handyfotos oft 5-15 MB), `BelegUploadFormular` hat deshalb eine eigene
Offline-Verzweigung. Vor dem Einreihen verkleinert
`bildFuerWarteschlangeVerkleinern()` (`src/lib/offline/bild.ts`,
Canvas-basiert, max. 1600 px Kantenlänge, JPEG-Qualität 0,8) das Bild - nicht
nur wegen IndexedDB-Speicherplatz, sondern weil der Sync-Endpunkt ein Route
Handler ist: Vercels Serverless-Payload-Grenze (~4,5 MB) gilt dort, anders
als bei Server Actions (eigene, höhere Grenze aus `next.config.ts`). Fällt
die JPEG-Neukodierung größer aus als das Original (z. B. bei einem bereits
kleinen Bild), bleibt das Original erhalten. Der Sync-Versand läuft über
`multipart/form-data` statt JSON (keine Base64-Aufblähung), der
Speicherpfad ist deterministisch aus der `aktionId` abgeleitet statt aus
`Date.now()` - ein Sync-Retry berechnet denselben Pfad, der erneute
Storage-Upload überschreibt ihn dann harmlos, statt eine zweite Datei
anzulegen.

**App-Shell-Service-Worker (Phase 7).** Ein von Hand geschriebener, bewusst
minimaler Service Worker (`public/sw.js`, kein next-pwa/Workbox) - ein
separates Anliegen von der eigentlichen Offline-Synchronisierung oben, die
ohne Service Worker auskommt. Zweck: eine Brigade, die eine bereits besuchte
Seite offline neu lädt, soll den letzten Stand sehen statt eines
Browser-Fehlers. `/_next/static/`-Dateien (inhaltsadressiert, unveränderlich)
werden Cache-First bedient; Seitenaufrufe laufen Network-First, ein
erfolgreich geladenes Dokument wird zusätzlich zwischengespeichert; schlägt
beides fehl, greift eine statische Fallback-Seite (`public/offline.html`).
Nur GET-Anfragen werden überhaupt betrachtet - Server Actions und
`/api/sync` laufen unverändert direkt gegen das Netz.

Versionierung: `ServiceWorkerRegistrierung` (`src/components/site/`) hängt
die aktuelle App-Version (`VERCEL_GIT_COMMIT_SHA`, lokal `"dev"`) als
Query-Parameter an die Skript-URL, der Service Worker liest sie über
`self.location.search` aus und bildet daraus seinen Cache-Namen - bei jedem
neuen Deployment entsteht so ein neuer Cache, `activate()` räumt alle
älteren auf. Ohne das könnte eine gecachte Seite einer alten Version auf
inzwischen nicht mehr existierende, inhaltsadressierte Asset-Dateien
verweisen.

Damit ist der Umsetzungsplan für Anforderung 2.5 vollständig.

## Kennzahlen

`public.kpi_aktuell()` rechnet die Baseline-Kennzahlen, die sich aus den
vorhandenen Daten ableiten lassen - derzeit acht von 14. Was die Funktion nicht
liefert, bleibt Platzhalter aus `kpi_baseline`, und die Kachel nennt die
fehlende Funktion. `public.rueckstandsnachweis(charge)` beantwortet die Frage
von Handel und Behörde: welche Behandlungen betreffen diese Lieferung, und war
die Wartezeit eingehalten?

Das Cockpit auf der Startseite zeigt höchstens zwölf Kern-Kennzahlen je Rolle
(Anforderung 4.11, `kpisFuerRolle()` in `lib/domain/kpis.ts`) - die übrigen
zwei bleiben Teil der unterschriebenen Baseline, stehen aber in einem
zweiten, weniger prominenten Abschnitt. Rollen ohne betriebsweite Sicht
(`picker`, `erzeuger`, `kunde`) sehen hier bewusst keine Kachel, da keine der
14 Kennzahlen eine persönliche Leistungszahl ist.

## Scripts

| Command | Beschreibung |
|---|---|
| `npm run dev` | Dev-Server (Turbopack) |
| `npm run build` | Produktions-Build |
| `npm run typecheck` | TypeScript-Prüfung |
| `npm run lint` | ESLint |
| `npm run verify` | typecheck + lint + build |
| `npm run db:push` | Neue Migrationen aufs gehostete Supabase-Projekt übertragen |
| `npm run db:seed-auth` | Die sieben Demo-Benutzer im gehosteten Projekt anlegen bzw. auffrischen |
| `npm run db:types` | TypeScript-Typen aus dem Schema des verlinkten (gehosteten) Projekts erzeugen |
| `npm run db:test` | Integrationstests: Round-Trip, RLS je Rolle, Sperrlogik (läuft gegen das gehostete Projekt aus `.env.local`) |
| `npm run db:test:fast` | Dieselbe Art Fachregeln gegen eine eingebettete PGlite-Instanz statt gegen das gehostete Projekt - keine Netzverbindung nötig, für den schnellen Zwischenstand während der Entwicklung; ersetzt `db:test` nicht |

## Dokumentation

- **[docs/manual/index.html](docs/manual/index.html)** - Produkthandbuch
- Technische Analyse: `WMC_TechnischeAnalyse_1Cati_Himbeerplantage.md` (extern)
