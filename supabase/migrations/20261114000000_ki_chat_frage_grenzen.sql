-- =============================================================================
-- KI-Chat: Grenzen fuer die eigene Frage (Gegenpruefung des Cleanups, 29.09.2026)
-- =============================================================================
-- 20261113000000 laesst authenticated nur noch die eigene Frage anlegen. Die
-- Gegenpruefung fand zwei Luecken darin:
--
--   1. inhalt hatte keine Laengengrenze. Eine Frage mit 1 MB ging per REST
--      durch, und kiNachrichtSenden (Server Action) gibt die letzten zehn
--      Verlaufszeilen ungekuerzt ans Modell, im Agentenpfad bis zu sechsmal je
--      Aufruf. MAX_NACHRICHT_LAENGE (2000, domain/ki-assistent.ts) galt nur
--      fuer die neue Frage, nicht fuer das, was schon in der Tabelle stand.
--   2. id war frei waehlbar. Der Browser kennt die ID der kommenden Antwort ab
--      Beginn des Stroms; wer vorher eine eigene Zeile mit dieser ID anlegte,
--      liess das Speichern der Antwort mit 23505 scheitern.
--
-- Fix: authenticated darf beim Anlegen nur noch profil_id, rolle und inhalt
-- setzen (Spaltenrecht, genau die Felder, die route.ts und
-- actions/ki-assistent.ts schreiben). id und erstellt_am setzt die Datenbank.
-- Die Policy begrenzt inhalt auf 2000 Zeichen wie MAX_NACHRICHT_LAENGE.
-- Antworten (service_role) sind davon nicht betroffen.
-- Pruefung: supabase/tests/pglite-fast.mjs, Abschnitt 17.
-- =============================================================================

set search_path = public;

revoke insert on public.ki_chat_nachrichten from authenticated;
grant insert (profil_id, rolle, inhalt) on public.ki_chat_nachrichten to authenticated;

drop policy if exists ki_chat_nachrichten_insert_own on public.ki_chat_nachrichten;

create policy ki_chat_nachrichten_insert_own on public.ki_chat_nachrichten
  for insert to authenticated
  with check (
    profil_id = (select p.id from public.profiles p where p.auth_user_id = auth.uid())
    and rolle = 'nutzer'
    and char_length(inhalt) <= 2000
    and anbieter_name is null
    and fallback = false
    and eskaliert = false
    and werkzeugaufrufe is null
    and erstellt_am = now()
  );

comment on policy ki_chat_nachrichten_insert_own on public.ki_chat_nachrichten is
  'Nur die eigene Frage (rolle nutzer, hoechstens 2000 Zeichen, ohne Antwortfelder, id und Zeitpunkt von der Datenbank). Assistenten- und Systemzeilen schreibt ausschliesslich der Server mit service_role (Vibecode-Cleanup Fund 77 und Gegenpruefung vom 29.09.2026).';
