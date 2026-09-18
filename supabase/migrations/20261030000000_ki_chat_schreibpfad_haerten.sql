-- =============================================================================
-- Damicon - Schreibpfad des KI-Chats haerten (Sprint 1, Schritt 1)
-- =============================================================================
-- Zwei Luecken aus der Bestandsaufnahme, beide auf den eigenen Tabellen des
-- KI-Assistenten:
--
-- 1. ki_anbieter und ki_chat_nachrichten tragen "enable row level security",
--    aber nicht "force". Jede andere Tabelle im Projekt hat beides
--    (20260905160000_haerten.sql). Ohne force umgeht der Tabelleneigentuemer
--    die Policies - fuer die Anwendung folgenlos, aber es ist genau die
--    Ausnahme, die bei der naechsten SECURITY-DEFINER-Funktion unbemerkt zur
--    Tuer wird.
--
-- 2. ki_chat_nachrichten_insert_own prueft nur, dass die Zeile dem eigenen
--    Profil gehoert - nicht, WAS drinsteht. Eine angemeldete Person konnte
--    sich damit selbst eine Assistentenantwort in den eigenen Verlauf
--    schreiben ("die KI hat mir 1.800 Tenge zugesagt") oder eine Eskalation
--    vortaeuschen. Das Buero liest denselben Verlauf mit
--    (ki_chat_nachrichten_select_buero) und kann Echtes nicht von Erfundenem
--    unterscheiden.
--
-- Der Schreibpfad der Anwendung laeuft ueber die Sitzung des Nutzers
-- (actions/ki-assistent.ts, createClient()) - die Antwort des Modells wird
-- also von derselben Rolle geschrieben, die auch die Frage stellt. Deshalb
-- genuegt keine Rollenbedingung in der Policy; die privilegierten Felder
-- wandern in zwei SECURITY-DEFINER-Funktionen, und die Policy laesst direkt
-- nur noch das durch, was eine Nutzerin auch wirklich selbst sagt.
--
-- BEWUSST NICHT TEIL DIESER MIGRATION: der Verlauf bleibt loeschbar bzw.
-- unveraenderlich nur insoweit, wie es heute Policies gibt (kein UPDATE, kein
-- DELETE fuer authenticated). Eine Aufbewahrungsfrist oder ein Loeschrecht
-- fuer die betroffene Person ist eine Datenschutz-Festlegung und gehoert zum
-- Compliance-Modul, nicht hierher.
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. force row level security, wie ueberall sonst
-- ---------------------------------------------------------------------------
alter table public.ki_anbieter force row level security;
alter table public.ki_chat_nachrichten force row level security;

-- ---------------------------------------------------------------------------
-- 2. Direkt schreiben darf die Nutzerin nur die eigene Frage
-- ---------------------------------------------------------------------------
drop policy if exists ki_chat_nachrichten_insert_own on public.ki_chat_nachrichten;
create policy ki_chat_nachrichten_insert_own on public.ki_chat_nachrichten
  for insert to authenticated
  with check (
    profil_id = (select p.id from public.profiles p where p.auth_user_id = auth.uid())
    and rolle = 'nutzer'
    and fallback = false
    and eskaliert = false
    and anbieter_name is null
    -- werkzeugaufrufe (20261026000000) ist ebenso ein privilegiertes Feld:
    -- "die KI hat in den Steuerdaten nachgesehen" darf niemand selbst setzen.
    and werkzeugaufrufe is null
  );

comment on policy ki_chat_nachrichten_insert_own on public.ki_chat_nachrichten is
  'Eine angemeldete Person schreibt ausschliesslich ihre eigene Frage (rolle = nutzer, ohne Anbieternamen, ohne Werkzeugaufrufe, ohne Fallback- oder Eskalationskennzeichen). Antworten und Eskalationen entstehen nur ueber ki_chat_antwort_schreiben()/ki_chat_eskalation_schreiben() (20261030000000).';

-- ---------------------------------------------------------------------------
-- 3. Antwort des Modells schreiben
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER, weil die Zeile Felder traegt, die der Aufrufer nicht
-- selbst setzen darf. Die Funktion schreibt ausschliesslich in den Verlauf
-- der aufrufenden Person - ein fremdes profil_id laesst sie nicht zu, auch
-- nicht als Parameter: sie ermittelt es selbst aus auth.uid().
--
-- p_werkzeugaufrufe: Namen der Werkzeuge, die der Agent fuer diese Antwort
-- aufgerufen hat (Spalte aus 20261026000000, KI-Seitenpanel). Optional, damit
-- der Text-Pfad (openai_kompatibel, keine Werkzeuge) ihn weglassen kann. Die
-- alte Drei-Parameter-Fassung wird zuerst entfernt - sonst bliebe sie auf
-- einer Datenbank, die diese Migration schon in der alten Form kennt, als
-- zweite Ueberladung neben der neuen stehen.
drop function if exists public.ki_chat_antwort_schreiben(text, text, boolean);

create or replace function public.ki_chat_antwort_schreiben(
  p_inhalt text,
  p_anbieter_name text,
  p_fallback boolean,
  p_werkzeugaufrufe jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profil uuid;
  v_id     uuid;
begin
  select id into v_profil from public.profiles where auth_user_id = auth.uid();
  if v_profil is null then
    raise exception 'Keine Sitzung - eine Antwort entsteht nur im Verlauf einer angemeldeten Person.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_inhalt is null or length(btrim(p_inhalt)) = 0 then
    raise exception 'Eine Antwort ohne Inhalt wird nicht gespeichert.'
      using errcode = 'check_violation';
  end if;

  -- Leerer Anbietername heisst "kein Anbieter" (Ausweichantwort ohne Modell) -
  -- die Spalte bleibt dann null statt einen leeren Text zu tragen.
  insert into public.ki_chat_nachrichten (profil_id, rolle, inhalt, anbieter_name, fallback, werkzeugaufrufe)
  values (v_profil, 'assistent', p_inhalt, nullif(btrim(coalesce(p_anbieter_name, '')), ''), coalesce(p_fallback, false), p_werkzeugaufrufe)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.ki_chat_antwort_schreiben is
  'Schreibt die Antwort des Modells in den Verlauf der aufrufenden Person. Einziger Weg zu rolle = assistent - die Insert-Policy laesst direkt nur eigene Fragen zu (20261030000000).';

-- ---------------------------------------------------------------------------
-- 4. Eskalation schreiben (automatisch wie manuell)
-- ---------------------------------------------------------------------------
create or replace function public.ki_chat_eskalation_schreiben(p_inhalt text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profil uuid;
  v_id     uuid;
begin
  select id into v_profil from public.profiles where auth_user_id = auth.uid();
  if v_profil is null then
    raise exception 'Keine Sitzung - eine Eskalation entsteht nur im Verlauf einer angemeldeten Person.'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.ki_chat_nachrichten (profil_id, rolle, inhalt, eskaliert)
  values (v_profil, 'system', p_inhalt, true)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.ki_chat_eskalation_schreiben is
  'Vermerkt eine Eskalation im Verlauf der aufrufenden Person - automatisch nach wiederholtem Fallback oder auf Knopfdruck. Einziger Weg zu eskaliert = true (20261030000000).';

revoke all on function public.ki_chat_antwort_schreiben(text, text, boolean, jsonb) from public;
revoke all on function public.ki_chat_eskalation_schreiben(text) from public;
grant execute on function public.ki_chat_antwort_schreiben(text, text, boolean, jsonb) to authenticated;
grant execute on function public.ki_chat_eskalation_schreiben(text) to authenticated;
