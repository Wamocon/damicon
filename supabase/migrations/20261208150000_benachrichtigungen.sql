-- =============================================================================
-- Damicon - Benachrichtigungen, Stufe 2 (WMCNL-2486, 15.10.2026)
-- =============================================================================
-- Stufe 1 (WMCNL-2485) gab der Glocke ein Ziel, aber keinen Inhalt. Stufe 2 füllt sie: je Person eine Liste von Hinweisen, die der Betrieb im Alltag braucht,
-- ohne dass jemand jedes Modul öffnet.
--
--   * Tabelle benachrichtigungen: eine Zeile je Empfänger und Hinweis. (empfaenger_id, schluessel) ist eindeutig: derselbe Zustand meldet sich nur einmal,
--     auch wenn die Erzeugung stündlich läuft. Gelesen wird durch ein Datum (gelesen_am), nicht durch Löschen.
--   * benachrichtigungen_erzeugen(): leitet die Hinweise aus dem Stand der Daten ab. Kein zeitgesteuerter Dienst in der Datenbank (pg_cron gibt es nicht): Der Aufruf
--     kommt von außen (GET /api/benachrichtigungen/erzeugen, geplant über den Workflow benachrichtigungen-erzeugen.yml) mit dem Dienstschlüssel. Die Funktion ist für
--     angemeldete Konten nicht aufrufbar.
--   * Quellen und Empfänger:
--       - Nachweise (abgelaufen, läuft ab; ersetzte Versionen zählen nicht): die verantwortliche Person, sonst Administration und Betriebsleitung. Je Nachweis und Zustand einmal.
--       - ЭСФ über der Frist (Einstellung esf.frist_tage): Buchhaltung und Administration, eine Sammelmeldung je Tag.
--       - ЕСУТД-Meldungen über der Frist: Betriebsleitung, Buchhaltung und Administration, eine Sammelmeldung je Tag.
--       - Reihenblöcke mit Stufe hoch (Block-Risiko): Betriebsleitung und Administration, eine Sammelmeldung je Tag.
--     Gesperrte Konten bekommen nichts. Die Geschäftsführung (ceo) bekommt die Hinweise der Administration mit.
--   * Lesen und als gelesen markieren: nur die eigenen Zeilen, und nur gelesen_am ist für angemeldete Konten änderbar. Anlegen und Löschen gibt es für sie nicht.
--   * Gelesene Hinweise verschwinden nach 90 Tagen, ungelesene nach 180.
--
-- Keine Datenänderung an vorhandenen Zeilen. Die Tabelle ist neu und leer.
-- =============================================================================

set search_path = public;

create table if not exists public.benachrichtigungen (
  id            uuid primary key default gen_random_uuid(),
  empfaenger_id uuid not null references public.profiles(id) on delete cascade,
  art           text not null check (art in ('nachweis_abgelaufen', 'nachweis_laeuft_ab', 'esf_ueberfaellig', 'esutd_ueberfaellig', 'block_risiko_hoch')),
  schluessel    text not null check (char_length(schluessel) between 3 and 200),
  -- Platzhalter für den Text (name, anzahl). Der Text selbst steht in den Sprachdateien, nicht hier.
  parameter     jsonb not null default '{}'::jsonb check (jsonb_typeof(parameter) = 'object'),
  -- Der Schlüssel des Moduls, in dem die Person den Hinweis bearbeitet (src/lib/modules.ts).
  modul         text not null check (modul ~ '^[a-z0-9_]{2,40}$'),
  erstellt_am   timestamptz not null default now(),
  gelesen_am    timestamptz,
  unique (empfaenger_id, schluessel)
);

create index if not exists idx_benachrichtigungen_empfaenger on public.benachrichtigungen (empfaenger_id, erstellt_am desc);

comment on table public.benachrichtigungen is 'Hinweise je Person für die Glocke (WMCNL-2486). Erzeugt von benachrichtigungen_erzeugen(), gelesen über gelesen_am.';

alter table public.benachrichtigungen enable row level security;
alter table public.benachrichtigungen force row level security;

create policy benachrichtigungen_select_eigene on public.benachrichtigungen
  for select to authenticated
  using (empfaenger_id = public.current_profil_id());

create policy benachrichtigungen_update_eigene on public.benachrichtigungen
  for update to authenticated
  using (empfaenger_id = public.current_profil_id())
  with check (empfaenger_id = public.current_profil_id());

-- Supabase vergibt auf neue Tabellen volle Rechte an anon und authenticated: erst alles zurücknehmen, dann gezielt vergeben.
revoke all on public.benachrichtigungen from public, anon, authenticated;
grant select on public.benachrichtigungen to authenticated;
grant update (gelesen_am) on public.benachrichtigungen to authenticated;

-- ---------------------------------------------------------------------------
-- Die Erzeugung
-- ---------------------------------------------------------------------------
create or replace function public.benachrichtigungen_erzeugen()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_heute   date := public.heute_almaty();
  v_neu     integer := 0;
  v_anzahl  integer;
  v_zeilen  integer;
  v_frist   numeric;
begin
  -- Nachweise: einmal je Nachweis und Zustand, an die verantwortliche Person (aktiv), sonst an Administration und Betriebsleitung.
  insert into public.benachrichtigungen (empfaenger_id, art, schluessel, parameter, modul)
  select e.id,
         case d.nachweis_status when 'abgelaufen' then 'nachweis_abgelaufen' else 'nachweis_laeuft_ab' end,
         'nachweis:' || d.id || ':' || d.nachweis_status,
         jsonb_build_object('name', d.name),
         'dokumente'
    from public.v_dokumente d
    join lateral (
      select p.id
        from public.profiles p
       where p.gesperrt_am is null
         and (
           (d.verantwortlich_id is not null and p.id = d.verantwortlich_id and exists (select 1 from public.profiles v where v.id = d.verantwortlich_id and v.gesperrt_am is null))
           or ((d.verantwortlich_id is null or not exists (select 1 from public.profiles v where v.id = d.verantwortlich_id and v.gesperrt_am is null)) and p.role in ('admin', 'betriebsleitung'))
         )
    ) e on true
   where d.nachweis_status in ('abgelaufen', 'laeuft_ab')
     and d.ersetzt_durch_id is null
  on conflict (empfaenger_id, schluessel) do nothing;
  get diagnostics v_zeilen = row_count;
  v_neu := v_neu + v_zeilen;

  -- ЭСФ über der Frist: eine Sammelmeldung je Tag an Buchhaltung und Administration.
  v_frist := public.einstellung_zahl('esf.frist_tage');
  if v_frist is not null then
    select count(*)::integer into v_anzahl from public.v_esf_offen o where o.tage_seit_lieferung > v_frist;
    if v_anzahl > 0 then
      insert into public.benachrichtigungen (empfaenger_id, art, schluessel, parameter, modul)
      select p.id, 'esf_ueberfaellig', 'esf:' || v_heute, jsonb_build_object('anzahl', v_anzahl), 'esf'
        from public.profiles p
       where p.gesperrt_am is null and p.role in ('buchhaltung', 'admin')
      on conflict (empfaenger_id, schluessel) do nothing;
      get diagnostics v_zeilen = row_count;
      v_neu := v_neu + v_zeilen;
    end if;
  end if;

  -- ЕСУТД-Meldungen über der Frist: eine Sammelmeldung je Tag.
  select count(*)::integer into v_anzahl from public.v_esutd_meldungen m where m.status = 'offen' and m.meldefrist_am is not null and m.meldefrist_am < v_heute;
  if v_anzahl > 0 then
    insert into public.benachrichtigungen (empfaenger_id, art, schluessel, parameter, modul)
    select p.id, 'esutd_ueberfaellig', 'esutd:' || v_heute, jsonb_build_object('anzahl', v_anzahl), 'integrationen'
      from public.profiles p
     where p.gesperrt_am is null and p.role in ('betriebsleitung', 'buchhaltung', 'admin')
    on conflict (empfaenger_id, schluessel) do nothing;
    get diagnostics v_zeilen = row_count;
    v_neu := v_neu + v_zeilen;
  end if;

  -- Reihenblöcke mit Stufe hoch: eine Sammelmeldung je Tag. Die Rechnung steht in v_block_risiko_roh (alle Eingaben, ohne Zeilensicherheit der Person).
  select count(*)::integer into v_anzahl from public.v_block_risiko_roh r where r.risiko_stufe = 'hoch';
  if v_anzahl > 0 then
    insert into public.benachrichtigungen (empfaenger_id, art, schluessel, parameter, modul)
    select p.id, 'block_risiko_hoch', 'risiko:' || v_heute, jsonb_build_object('anzahl', v_anzahl), 'reihenbloecke'
      from public.profiles p
     where p.gesperrt_am is null and p.role in ('betriebsleitung', 'admin')
    on conflict (empfaenger_id, schluessel) do nothing;
    get diagnostics v_zeilen = row_count;
    v_neu := v_neu + v_zeilen;
  end if;

  -- Die Geschäftsführung bekommt, was die Administration bekommt (ceo gilt in den Rechten als admin).
  insert into public.benachrichtigungen (empfaenger_id, art, schluessel, parameter, modul)
  select c.id, b.art, b.schluessel, b.parameter, b.modul
    from public.benachrichtigungen b
    join public.profiles a on a.id = b.empfaenger_id and a.role = 'admin'
    cross join lateral (select p.id from public.profiles p where p.role = 'ceo' and p.gesperrt_am is null) c
   where b.erstellt_am >= now() - interval '1 day'
  on conflict (empfaenger_id, schluessel) do nothing;
  get diagnostics v_zeilen = row_count;
  v_neu := v_neu + v_zeilen;

  -- Aufräumen: gelesene nach 90 Tagen, ungelesene nach 180.
  delete from public.benachrichtigungen
   where (gelesen_am is not null and gelesen_am < now() - interval '90 days')
      or erstellt_am < now() - interval '180 days';

  return jsonb_build_object('neu', v_neu, 'stichtag', v_heute);
end;
$$;

revoke all on function public.benachrichtigungen_erzeugen() from public, anon, authenticated;
grant execute on function public.benachrichtigungen_erzeugen() to service_role;

comment on function public.benachrichtigungen_erzeugen() is
  'Leitet die Hinweise für die Glocke aus dem Stand der Daten ab (Nachweise, ЭСФ, ЕСУТД, Block-Risiko). Idempotent, nur für den Dienstschlüssel. Gibt die Zahl der neuen Hinweise zurück.';
