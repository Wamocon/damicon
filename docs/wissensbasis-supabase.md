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
2. Sonst in Produktion mit vorhandenem `KI_SOKRATES_API_SCHLUESSEL`: die Sokrates-API (`https://sokrates.test-qualitaetsmanagement.com/api/v1`), Modell `bge-m3:latest`. **Ohne weitere Umgebungsvariable.** Stand 2026-09-20 freigegeben und gemessen: 1024 Dimensionen, Kosinusaehnlichkeit 0,99998 bis 1,0 zum lokalen bge-m3, mit dem der Index gebaut wurde (also derselbe Vektorraum), rund 300 ms je Frage; `input` muss eine Liste sein.
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

## Dokumente hochladen (Admin)

Im KI-Panel, Ansicht "Einstellungen", unter dem Ratenlimit: Abschnitt "Wissensdokumente". Nur mit dem Recht `ki_assistent:manage` (laut `rbac.ts` allein admin), geprüft in der Server Action und noch einmal in der Datenbank (Schreiben in `wissen_chunks` darf nur `service_role`).

| | |
| --- | --- |
| Dateien | `.pdf`, `.md`, `.txt`, höchstens 8 MB (genau 8 MiB minus 64 KiB: Die Server Actions nehmen 8 MiB je Anfrage an, Formularfelder und Multipart-Rahmen brauchen Platz; die Oberfläche stoppt größere Dateien vor dem Absenden), höchstens 400 Abschnitte je Dokument. Lesen und Einbetten dürfen zusammen 45 Sekunden dauern (das Dashboard erlaubt 60); danach bricht der Upload mit einer klaren Meldung ab, bevor irgendetwas geschrieben wurde |
| Bereich | Auswahl `recht`, `steuer`, `compliance`, `audit`, `risiko`. Gespeichert wird **`legal`** für Recht (so heißt der Bereich im Korpus), die anderen vier unverändert. Die Spalte `bereich` hat weder CHECK noch Enum, keine Migration. Angezeigt wird `legal` wieder als "Recht". Die Korpuswerte `amtlich`, `fachquellen`, `kernwissen` und `nk-214-viii` kommen nur vom Skript |
| Autoritätsstufe | bleibt `NULL` (außer ein Markdown-Frontmatter nennt eine). Solche Zeilen erscheinen in der allgemeinen Trefferliste, nicht in den bevorzugten Plätzen für Recht und amtliche Texte (Stufe 1 bis 3). Nennt ein Frontmatter eine Stufe, steht sie im Protokolleintrag `wissen.hochgeladen` (`autoritaetsstufe`): Stufe 1 bis 3 belegt die bevorzugten Plätze und soll nachvollziehbar sein |
| Vorschau | Wohin die App schreibt, bestimmt das Datenbankschema (`SUPABASE_DB_SCHEMA`, `src/lib/supabase/schema.ts`). Eine Vorschau mit `public_preview` arbeitet in der Kopie und darf hochladen. Gesperrt ist nur `VERCEL_ENV=preview` mit Schema `public`: Das würde in die Produktions-Wissensbasis schreiben. `WISSEN_UPLOAD_PREVIEW_OK=true` hebt die Sperre auf (nur setzen, wenn die Vorschau eine eigene Datenbank hat). Die lokale Entwicklung (ohne `VERCEL_ENV`) wird nicht gesperrt: Wer lokal gegen die Produktionsdatenbank arbeitet, schreibt dorthin |
| Rollen | Büro-Rollen (admin, ceo, betriebsleitung, buchhaltung). Admin ist immer dabei. Andere Rollen nutzen die Wissenssuche nicht (`darfWissenNutzen`) |
| Original | wird nicht aufbewahrt, nur der Text liegt in `wissen_chunks` |
| Dublette | derselbe Inhalt (SHA-256 des normalisierten Textes, `quelle_id = upload:<hash>`) wird abgelehnt |

Der Upload nutzt dieselben Funktionen wie das Skript: `chunkiere`, `wissenEinbettung` (bge-m3, 1024 Dimensionen), `sparseDokument`, die Zeilenform des ETL. Er schreibt immer nach Supabase, unabhängig von `WISSEN_BACKEND`. Code: `src/lib/wissen/hochladen.ts`, `src/lib/actions/wissen.ts`.

**Markierung.** Hochgeladene Zeilen tragen `extra.quelle = "upload"` (dazu `inhalts_hash`, `dateiname`, `hochgeladen_von`, `hochgeladen_von_name`). Der ETL im Spiegelmodus (`--bereinigen`) löscht solche Zeilen **nicht**, und ihre Wörter und ihre Anzahl gehen in `wissen_begriffe` (df, N) ein. Ohne diese Markierung würde der nächste Lauf jedes hochgeladene Dokument entfernen, weil es nicht in Qdrant steht.

**Wortgewichte.** Bei jedem Upload werden df und IDF der Wörter des neuen Dokuments fortgeschrieben (Upsert, N = Anzahl aller Textstellen nach dem Einfügen). Die Gewichte aller anderen Wörter ändern sich dadurch minimal und bleiben bis zum nächsten ETL-Lauf unverändert. Zwei gleichzeitige Uploads können sich beim Zählen überschreiben; der nächste ETL-Lauf gleicht das aus.

**Alles oder nichts.** Ein Upload hat keinen Status. Schlägt das Einbetten fehl oder ist das Zeitbudget aufgebraucht, wird nichts geschrieben. Schlägt das Schreiben fehl, werden die Zeilen des Dokuments wieder entfernt. Ein defektes PDF ergibt eine Fehlermeldung, kein hängendes Dokument. Beendet die Plattform die Funktion hart, während die Zeilen geschrieben werden (zum Beispiel bei einem Neustart), kann ein Teil der Abschnitte stehen bleiben. Das Dokument erscheint dann in der Liste, lässt sich löschen, und der nächste ETL-Lauf gleicht die Wortgewichte aus.

**Liste.** Zeigt Titel, Bereich, Rollen, Datum (`eingelesen_am`), Hochgeladen von und Anzahl der Abschnitte. Per Skript eingelesene Dokumente erscheinen mit, gruppiert nach `quelle_id`. Die Liste liest höchstens 50.000 Textstellen (der Korpus hat rund 5.700); wird das Limit erreicht, weist ein roter Hinweis darauf hin, dass die Liste unvollständig ist.

**Löschen.** In der Liste hat jedes **hochgeladene** Dokument einen Löschen-Knopf mit Bestätigungsfenster (Titel, Bereich, Zahl der Abschnitte, Warnung, dass es nicht rückgängig zu machen ist). Löschbar ist nur, was der Upload angelegt hat: alle Zeilen der Quelle haben `extra.quelle = "upload"` **und** eine `quelle_id` der Form `upload:<32 Hex>`. Vom Skript oder ETL geladene Dokumente haben keinen Knopf und werden auch vom Server abgelehnt (Server Action `wissenDokumentLoeschen`: zuerst `requirePermission("ki_assistent","manage")`, dann Vorschau-Schutz, Form der `quelle_id`, Prüfung der Zeilen, und die `DELETE`-Anweisung filtert beide Bedingungen noch einmal selbst). Der Vorschau-Schutz (`WISSEN_UPLOAD_PREVIEW_OK`) gilt auch hier. Code: `src/lib/wissen/loeschen.ts`.

- **Wortgewichte.** Nach dem Löschen werden df und IDF der Wörter des Dokuments zurückgerechnet (sparsevec-Indizes der gelöschten Zeilen, wie beim Upload nur rückwärts); Wörter, die dann in keiner Textstelle mehr vorkommen, verschwinden aus `wissen_begriffe`. Nach **einem** Upload und dem Löschen desselben Dokuments ist `wissen_begriffe` wieder genau wie vorher (Round-Trip-Test). Bei mehreren Uploads dazwischen ist df immer exakt zurück; das IDF der berührten Wörter passt zum aktuellen N, die der übrigen Wörter ändert erst der nächste ETL-Lauf.
- **Ausfall.** Die Zeilen werden in **einer** `DELETE`-Anweisung entfernt: ganz oder gar nicht. Schlägt sie fehl, bleibt alles wie es war. Schlägt danach nur die Rückrechnung der Wortgewichte fehl, ist das Dokument gelöscht und die Gewichte sind etwas zu hoch (unschädlich, der nächste ETL-Lauf gleicht sie aus); die Meldung sagt das ausdrücklich. Ein halbes Dokument bleibt nie zurück.
- **Mehrfach.** Doppelklick oder ein zweites Löschen findet nichts mehr und meldet "bereits gelöscht", ohne die Gewichte noch einmal zu verringern: sie werden nur aus den Zeilen berechnet, die dieser Aufruf wirklich gelöscht hat (`DELETE … RETURNING`).
- **Protokoll.** Wie beim Upload schreibt `protokolliere()` einen Eintrag in `audit_events` (`wissen.geloescht`: Person, Titel, Bereich, `quelle_id`, Zahl der Abschnitte, Zeitpunkt).

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
| `npm run test:wissen-db` | Rollenisolation per RLS, Hybridsuche, IDF, Filter ohne Trefferverlust, Schreibschutz, dazu Admin-Upload und Löschen mit dem echten Adapter (`wissen-upload-db.ts`: Marker- und LIKE-Filter der DELETE-Anweisung, Doppelklick, Rundlauf der Wortgewichte, Listenabfrage mit den Aliasen, Suche, RLS) (echtes Postgres) | PR-Pipeline, nach `supabase start` |
| `npm run test:wissen-backend` | Adapter, Einbettungsclient, Backendwahl, Suche Ende zu Ende (ohne Datenbank) | `npm test` |
| `npm run test:wissen-upload` | Admin-Upload: Rechte, Chunks, Dublette, Wortgewichte, Rollenfilter, Zeitbudget, Vorschau-Schutz je Schema, Suche mit Beleg (ohne Datenbank) | `npm test` |
| `npm run wissen:eval` | Trefferqualität (recall@k, MRR) und Rollensperren | von Hand, vor dem Einschalten |

PGlite kann pgvector nicht. Die schnellen Tests überspringen deshalb Migrationen, die auf `_pgvector.sql` enden; die Migration selbst wird von `supabase start` in der CI und von `test:wissen-db` geprüft.
