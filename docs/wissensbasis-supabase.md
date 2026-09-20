# Wissensbasis in Supabase (pgvector)

Die Wissensbasis für Recht, Steuer, Compliance und Audit (Kasachstan) liegt in Postgres. Der Agent ruft sie über das Werkzeug `wissenSuchen` auf und belegt jede Rechtsaussage mit `[S1]`, `[S2]` …

## Aufbau

| Baustein | Zweck |
| --- | --- |
| `wissen_chunks` | Textstellen mit Belegdaten (Fundstelle, Autoritätsstufe 1 bis 5, Stand, Link), dichtem Vektor `vector(1024)` (bge-m3) und sparsem Vektor `sparsevec` (Wörter, Zahlen, Artikelnummern) |
| `wissen_begriffe` | Dokumenthäufigkeit und IDF je Wort für die lexikalische Suche |
| `wissen_importe` | Protokoll: welcher Korpus, welches Modell, wann, wie viele Stellen |
| `wissen_suche()` | Hybridsuche (dicht + lexikalisch, Reciprocal Rank Fusion, k = 2) mit Rollen-, Stufen- und Aktualitätsfilter |

**Sicherheit.** Die Zeilensicherheit (RLS) entscheidet, wer eine Stelle sieht: die Rolle aus dem Profil muss in `wissen_chunks.rollen` stehen. `wissen_suche()` läuft mit den Rechten der aufrufenden Person (`security invoker`); der Parameter `p_rolle` kann die Ergebnisse nur weiter einschränken, nie erweitern. Schreiben darf allein der Dienst (`service_role`, ETL-Skript). Nutzer und `anon` können weder schreiben noch ändern noch löschen. Getestet in `supabase/tests/wissen-pgvector.mjs`.

## Umgebungsvariablen (Vercel)

| Variable | Wert | Bedeutung |
| --- | --- | --- |
| `WISSEN_BACKEND` | `supabase` | Index liegt in Supabase (statt `qdrant`) |
| `WISSEN_EMBED_ANBIETER` | `openai` | Fragen werden über eine OpenAI-kompatible Schnittstelle eingebettet |
| `WISSEN_EMBED_URL` | zum Beispiel `https://api.deepinfra.com/v1/openai` | Basis-URL (ohne `/embeddings`) |
| `WISSEN_EMBED_MODELL` | `BAAI/bge-m3` | **dasselbe Modell wie im Index**, sonst passen die Vektoren nicht |
| `WISSEN_EMBED_KEY` | geheim | Schlüssel des Anbieters |

Ohne diese Angaben ist die Wissensbasis in Produktion **aus**: `wissenSuchen` wird nicht angeboten, und der Agent beantwortet Rechts- und Steuerfragen bewusst nicht aus Trainingswissen, sondern sagt, dass keine belegte Auskunft möglich ist. Ist `WISSEN_BACKEND=supabase` gesetzt, aber keine erreichbare Einbettung konfiguriert, bleibt sie ebenfalls aus (sonst wäre jede Suche ein Fehler).

Vercel erreicht keinen lokalen Rechner. Deshalb braucht der Betrieb einen Einbettungsanbieter, der **bge-m3** anbietet. Der Index wurde mit bge-m3 gebaut (lokal über Ollama); dasselbe Modell beim Anbieter liefert denselben Vektorraum, es muss nichts neu eingebettet werden.

## Wer bettet die Frage ein? (Vorgabe und Gesundheitspruefung)

Reihenfolge, in der die Anwendung den Anbieter fuer die **Frage** bestimmt:

1. `WISSEN_EMBED_URL` gesetzt: dieser Anbieter (mit `WISSEN_EMBED_MODELL`, `WISSEN_EMBED_KEY`), zum Beispiel DeepInfra.
2. Sonst in Produktion mit vorhandenem `KI_SOKRATES_API_SCHLUESSEL`: die Sokrates-API (`https://sokrates.test-qualitaetsmanagement.com/api/v1`), Modell `bge-m3`. **Ohne weitere Umgebungsvariable**, sobald der Sokrates-Betreiber fuer den Schluessel Einbettungen freigibt und dort bge-m3 laeuft (Stand 2026-09-20: `/embeddings` antwortet 403, der Schluessel gilt bisher nur fuer Sprache).
3. Sonst nichts (lokal: Ollama).

**Gesundheitspruefung:** In Produktion wird das Werkzeug `wissenSuchen` erst angeboten, wenn eine Probe-Einbettung gelang (gemerkt: gut 5 min, schlecht 1 min). Ein konfigurierter, aber nicht erreichbarer Anbieter (zum Beispiel 403) laesst die Wissensbasis also aus, statt jede Rechtsfrage scheitern zu lassen; der Grund steht im Serverprotokoll (`[damicon] Wissensbasis nicht verfuegbar: ...`), die Compliance-Pruefung meldet "Wissensbasis nicht verfuegbar".

## Einlesen (ETL)

```bash
# lokal (Docker): Qdrant -> lokales Supabase
npm run wissen:nach-supabase

# gehostet: ausdrücklich freigeben
NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run wissen:nach-supabase -- --ja
```

Optionen: `--trocken` (nur zählen), `--bereinigen` (Zeilen löschen, die es in der Quelle nicht mehr gibt), `--ja` (erlaubt ein gehostetes Ziel; ohne verweigert das Skript es). Der Lauf ist idempotent (Upsert), ein zweiter Lauf ändert nichts. Die Vektoren werden 1:1 übernommen. Größe: 5.655 Textstellen, 24.738 Wörter, rund 84 MB inklusive Index.

## Ausrollen (gehostet)

1. Migrationen anwenden (`20261102000000_wissen_pgvector.sql`): über den Workflow "Datenbank-Migration" oder `supabase db push --linked` (vorher `--dry-run`).
2. ETL mit `--ja` gegen das gehostete Projekt.
3. Vercel-Variablen setzen (Tabelle oben) und neu deployen.
4. Prüfen: als Admin fragen "Ab welchem Umsatz muss sich ein Betrieb in Kasachstan für die Mehrwertsteuer registrieren?" Es muss "Wissensbasis durchsucht" erscheinen, dazu Zitatmarken und Quellenkarten (НК РК ст. 99 und 101).

**Zurücknehmen:** `WISSEN_BACKEND` in Vercel entfernen. Die Wissensbasis ist dann aus, alles andere bleibt unverändert. Die Tabellen können stehen bleiben.

## Qualität (Vergleich der beiden Suchwege)

Dieselben Fragen, dasselbe Einbettungsmodell, `npm run wissen:eval`:

| | Qdrant | Postgres (pgvector) |
| --- | --- | --- |
| recall@1 | 60 % | 60 % |
| recall@3 | 80 % | 80 % |
| recall@6 | 100 % | 100 % |
| MRR | 0,75 | 0,75 |
| Sperrfragen verletzt | 0 | 0 |

Die Fusionskonstante ist bewusst klein (k = 2). Mit dem Lehrbuchwert 60 fiel eine Frage (ESUTD-Strafen) aus den ersten sechs Treffern, weil die Fusion die Ränge zu stark glättet.

## Tests

| Befehl | Prüft | Läuft in |
| --- | --- | --- |
| `npm run test:wissen-db` | Rollenisolation per RLS, Hybridsuche, IDF, Filter ohne Trefferverlust, Schreibschutz (echtes Postgres) | PR-Pipeline, nach `supabase start` |
| `npm run test:wissen-backend` | Adapter, Einbettungsclient, Backendwahl, Suche Ende zu Ende (ohne Datenbank) | `npm test` |
| `npm run wissen:eval` | Trefferqualität (recall@k, MRR) und Rollensperren | von Hand, vor dem Einschalten |

PGlite kann pgvector nicht. Die schnellen Tests überspringen deshalb Migrationen, die auf `_pgvector.sql` enden; die Migration selbst wird von `supabase start` in der CI und von `test:wissen-db` geprüft.
