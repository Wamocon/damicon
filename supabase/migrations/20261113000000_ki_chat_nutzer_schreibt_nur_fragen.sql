-- =============================================================================
-- KI-Chat: Nutzer schreiben nur ihre eigene Frage (Vibecode-Cleanup, Fund 77)
-- =============================================================================
-- ki_chat_nachrichten_insert_own (20260930000000_ki_assistent.sql) prueft nur
-- die profil_id. Jedes Konto mit Chat-Recht, auch kunde, konnte damit ueber
-- die REST-API eine eigene Zeile mit rolle 'assistent' und frei gewaehltem
-- Text anlegen. api/ki-sprachausgabe liest per Nachrichten-ID und prueft nur
-- rolle = 'assistent', die Route wurde so zum offenen Vorlesegenerator fuer
-- beliebigen Text (je neuer ID eine neue Erzeugung). Nebenbei liess sich das
-- als Protokoll deklarierte Gespraech mit gefaelschtem anbieter_name,
-- fallback und werkzeugaufrufe fuellen, sichtbar fuers Buero.
--
-- Fix (28.09.2026): authenticated legt nur noch die eigene Frage an, ohne die
-- Felder, die nur eine Antwort traegt. Assistenten- und Systemzeilen
-- (Antwort, Ausweichantwort, Eskalation) schreibt nur noch der Server mit
-- service_role, siehe src/app/api/ki-assistent/route.ts (onFinish) und
-- src/lib/actions/ki-assistent.ts. service_role umgeht RLS, auch mit
-- force row level security (20261001000000).
--
-- Den Zeitpunkt setzt die Datenbank (erstellt_am = now(), also der Default
-- derselben Transaktion). Vorher durfte die Sitzung ihn frei waehlen:
-- zurueckdatiert faelschte eine Frage das Protokoll, vordatiert stuende sie
-- fuer immer am Ende des geladenen Verlaufs (ladeKiChatVerlauf sortiert nach
-- erstellt_am). Die App setzt erstellt_am nie selbst.
--
-- Lesen bleibt unveraendert (select_own, select_buero): Verlauf und
-- Einwilligungs-Check vor der ersten Frage laufen weiter mit der Sitzung.
-- Pruefung: supabase/tests/pglite-fast.mjs, Abschnitt 17.
-- =============================================================================

set search_path = public;

drop policy if exists ki_chat_nachrichten_insert_own on public.ki_chat_nachrichten;

create policy ki_chat_nachrichten_insert_own on public.ki_chat_nachrichten
  for insert to authenticated
  with check (
    profil_id = (select p.id from public.profiles p where p.auth_user_id = auth.uid())
    and rolle = 'nutzer'
    and anbieter_name is null
    and fallback = false
    and eskaliert = false
    and werkzeugaufrufe is null
    and erstellt_am = now()
  );

comment on policy ki_chat_nachrichten_insert_own on public.ki_chat_nachrichten is
  'Nur die eigene Frage (rolle nutzer, ohne Antwortfelder, Zeitpunkt von der Datenbank). Assistenten- und Systemzeilen schreibt ausschliesslich der Server mit service_role (Vibecode-Cleanup Fund 77, 28.09.2026).';
