-- =============================================================================
-- Wissensbasis: Textgüte dreier Bücher nach der verbesserten Bewertung nachziehen (DATENÄNDERUNG)
-- =============================================================================
-- Beim Hochladen am 09.10.2026 bekam jedes Paket eines Buchs eine Güte-Note (extra.guete) und Hinweise (extra.guete_hinweise). Ein Paket, das nur aus
-- einem Inhaltsverzeichnis mit Punktlinien oder einem Sachregister mit Zahlenreihen bestand, fiel dabei auf "prüfen" oder "schlecht" (Hinweis
-- "vieleSonderzeichen"), obwohl der Text sauber ist. Die Bewertung rechnet seit dem 13.10.2026 ohne diese Zeilen (textguete.ts, ohneVerzeichnisse).
-- Die Note, die beim Hochladen abgelegt wurde, ändert sich nicht rückwirkend. Diese Migration zieht sie für genau drei Bücher nach, deren Text am
-- 12./13.10.2026 neu bewertet wurde (alle Seiten vorhanden, kein Zeichenmüll, nur Verzeichnis oder Register als Auslöser):
--   upload:614b1d85705276abc70d616807e07604  Kommentar Zivilgesetzbuch Buch 4          (36 Abschnitte "prüfen")
--   upload:c2bc2a68be06e92abc369347c65e1a7c  Zivilgesetzbuch, Besonderer Teil          (5 Abschnitte "schlecht")
--   upload:4729805f600d7efc9e22c76cc46c7139  Zivilgesetzbuch, Allgemeiner Teil         (7 Abschnitte "prüfen")
--
-- Was geändert wird: nur Zeilen dieser drei Kennungen mit extra.quelle = 'upload', Note "prüfen" oder "schlecht" und Hinweisen, die nur aus
-- "vieleSonderzeichen" und "wiederholteZeilen" bestehen. Dort wird die Note "gut", und "vieleSonderzeichen" fällt aus den Hinweisen weg
-- ("wiederholteZeilen" bleibt). Alles andere (Text, Vektoren, Einordnung, Prüfstatus, Freigabe) bleibt unverändert; der Wächter
-- (wissen_pruefung_wache) greift nicht, weil weder Prüfstatus noch Quellenart, Stufe, Bereich oder Textgrundlage berührt werden.
-- Idempotent: ein zweiter Lauf findet keine Zeile mehr. Wo es die Bücher nicht gibt (frische Datenbank, public vor dem Abgleich), ändert sich nichts.
-- Der Dateiname endet auf _pgvector.sql: wissen_chunks gibt es in PGlite nicht, die schnellen Tests überspringen ihn.
-- =============================================================================

set search_path = public;

update public.wissen_chunks
   set extra = jsonb_set(
         jsonb_set(extra, '{guete}', '"gut"'::jsonb),
         '{guete_hinweise}',
         to_jsonb(array_to_string(array_remove(string_to_array(extra ->> 'guete_hinweise', ','), 'vieleSonderzeichen'), ','))
       )
 where quelle_id in (
         'upload:614b1d85705276abc70d616807e07604',
         'upload:c2bc2a68be06e92abc369347c65e1a7c',
         'upload:4729805f600d7efc9e22c76cc46c7139'
       )
   and extra ->> 'quelle' = 'upload'
   and extra ->> 'guete' in ('pruefen', 'schlecht')
   and string_to_array(extra ->> 'guete_hinweise', ',') <@ array['vieleSonderzeichen', 'wiederholteZeilen']
   and 'vieleSonderzeichen' = any (string_to_array(extra ->> 'guete_hinweise', ','));
