-- =============================================================================
-- Zweites Administrationskonto admin2@damicon.demo: Rolle admin im Profil (DATENAENDERUNG, nachgereicht)
-- =============================================================================
-- Fuer das Vier-Augen-Prinzip der Wissensbasis (ein hochgeladenes Dokument gibt eine ZWEITE Person frei) legte Niko am 09.10.2026 das Konto
-- admin2@damicon.demo an (scripts/admin-konto-anlegen.mjs, Auth-Konto mit bestaetigter E-Mail) und setzte die Rolle admin im Profil, in public
-- und in public_preview. Das lief direkt gegen die gehostete Datenbank und ohne Migrationsdatei; diese Datei reicht den Stand nach (Projektregel
-- "Datenbankmigrationen", Regel 6), damit Dateien und Datenbank wieder uebereinstimmen.
--
-- Wirkung: Nur ein BESTEHENDES Profil mit dieser E-Mail wird auf die Rolle admin gesetzt. Gibt es das Konto nicht (frische lokale Datenbank, CI), aendert sich
-- nichts. Wiederholbar: Ein Profil, das schon admin ist, wird nicht angefasst. Es entsteht kein Konto und kein Passwort.
-- =============================================================================

set search_path = public;

update public.profiles
   set role = 'admin',
       full_name = 'Zweite Administration'
 where lower(email) = 'admin2@damicon.demo'
   and role is distinct from 'admin';
