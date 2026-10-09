-- =============================================================================
-- Wissensbasis: Cluster (Buecher, Publikationen, Internet-Quelle)
-- =============================================================================
-- Der Cluster ist der WEG, auf dem ein Text zum Betrieb kam, und eine eigene Achse neben der Quellenart: Ein Gesetz von
-- einer Regierungsseite ist eine Rechtsnorm (Quellenart) und kommt aus dem Internet (Cluster). Die Quellenart bestimmt
-- Stufe und Nutzung je Bereich, der Cluster sagt nur, woher der Text stammt. Er wirkt nicht auf die Suche.
--
-- Wie quellenart und bereich ohne CHECK, damit ein weiterer Cluster keine Migration braucht. Erlaubt sind heute
-- buecher, publikationen und internet (Liste und Regeln: src/lib/wissen/quellenart.ts).
--
-- Rueckwaertskompatibel: alle bestehenden Zeilen bleiben ohne Cluster (NULL). Den Bestand ordnet die Administration in der
-- Seite Wissensbasis ein ("Bestand einordnen"); dabei setzt die Anwendung Quellenart, Cluster und Stufe gemeinsam.
-- Pruefung: supabase/tests/wissen-upload-db.ts (echtes Postgres) und supabase/tests/wissen-upload.ts.
-- Der Dateiname endet auf _pgvector.sql: wissen_chunks gibt es in PGlite nicht, die schnellen Tests ueberspringen ihn.
-- =============================================================================

set search_path = public;

alter table public.wissen_chunks
  add column if not exists cluster text;

comment on column public.wissen_chunks.cluster is
  'Weg, auf dem der Text zum Betrieb kam: buecher, publikationen oder internet (src/lib/wissen/quellenart.ts). Unabhaengig von quellenart. NULL = noch nicht eingeordnet.';
