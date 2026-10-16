-- Testdaten Benachrichtigungen nach der ЭСФ-Korrektur neu erzeugen (Datenänderung, idempotent).
--
-- Die Erzeugung der Hinweise (Migration 20261209070000) lief vor der Korrektur der Altbelege (20261209090000) und meldete "ЭСФ überfällig" für
-- Lieferungen, die inzwischen bestätigt sind. Hinweise sind aus dem Stand der Daten abgeleitet, der stündliche Lauf des Workflows erzeugt sie bei
-- Bedarf neu. Hier fallen die ЭСФ-Hinweise weg, solange keine Lieferung mehr über der Frist offen ist (Einstellung esf.frist_tage, sonst 15 Tage),
-- danach läuft die Erzeugung einmal, damit sich der Rest nicht ändert. Gelesen-Stände anderer Hinweisarten bleiben unberührt.
--
-- Schutz: nur mit den Testdaten dieser Reihe (ЭСФ-Belege mit der Kennung 7e57da7a-0000-4000-8000-...). Eine leere Datenbank bleibt unverändert.

delete from public.benachrichtigungen
 where art = 'esf_ueberfaellig'
   and exists (select 1 from public.esf_belege where id::text like '7e57da7a-0000-4000-8000-%')
   and not exists (
     select 1 from public.v_esf_offen o
      where o.tage_seit_lieferung > coalesce(public.einstellung_zahl('esf.frist_tage'), 15)
   );

select public.benachrichtigungen_erzeugen()
 where exists (select 1 from public.esf_belege where id::text like '7e57da7a-0000-4000-8000-%');
