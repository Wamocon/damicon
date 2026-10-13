-- =============================================================================
-- Wissensbasis: Bestand dem Cluster "Internet-Quelle" zuordnen (DATENAENDERUNG)
-- =============================================================================
-- Alle Dokumente, die vor der Typisierung in der Wissensbasis standen (Skript und ETL, 320 Dokumente), stammen aus Internetrecherchen.
-- Sie bekommen deshalb den Cluster "internet". Die QUELLENART (und damit Stufe und Nutzung) setzt diese Migration NICHT: Ob ein Text
-- eine Rechtsnorm, Fachliteratur oder eine Behoerdeninformation ist, entscheidet die Administration in der Wissensbasis
-- (Bestand einordnen), weil dort auch der Link und der Inhalt zu sehen sind.
--
-- Was geaendert wird: nur Zeilen ohne Cluster und ohne Quellenart, die NICHT aus dem Upload stammen (extra.quelle <> 'upload').
-- Hochgeladene Dokumente und schon eingeordnete Zeilen bleiben unberuehrt. Die Migration ist idempotent: ein zweiter Lauf findet
-- nichts mehr. Der Waechter (wissen_pruefung_wache) greift nicht, weil weder pruefstatus noch pruefen_bis geaendert werden.
-- Wirkung auf die Suche: keine (der Cluster wirkt nur auf die Anzeige und die Einordnung).
-- Der Dateiname endet auf _pgvector.sql: wissen_chunks gibt es in PGlite nicht, die schnellen Tests ueberspringen ihn.
-- =============================================================================

set search_path = public;

update public.wissen_chunks
   set cluster = 'internet'
 where cluster is null
   and quellenart is null
   and coalesce(extra ->> 'quelle', '') <> 'upload';
