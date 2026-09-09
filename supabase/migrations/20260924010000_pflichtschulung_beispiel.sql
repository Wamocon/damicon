-- =============================================================================
-- Damicon - Beispiel-Pflichtschulung (Anforderung 4.10)
-- =============================================================================
-- Die vier bestehenden Videos sind allesamt optional (Ernte/Feld/Hof/
-- Qualitaet, siehe Migrationskopf 20260924000000 zur Abgrenzung gegenueber
-- Anforderung 2.12). Ein Betrieb ohne mindestens eine echte Pflichtschulung
-- wuerde die neue Fristueberwachung nie sichtbar demonstrieren - dieses
-- Beispiel deckt den klassischen Fall ab (Arbeitssicherheit, jaehrlich
-- aufzufrischen).
-- =============================================================================

insert into public.schulungsvideos (titel, thema, dauer_sekunden, sprachen, pflicht, frist_monate)
select 'Arbeitssicherheit auf der Plantage', 'Sicherheit', 480, array['de','en','tr','kk','ru'], true, 12
where not exists (
  select 1 from public.schulungsvideos where titel = 'Arbeitssicherheit auf der Plantage'
);
