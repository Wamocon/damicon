-- =============================================================================
-- Damicon - Sync-Funktionen: fehlendes Protokollrecht ergibt "berechtigung"
-- =============================================================================
-- WMCNL-2452. sync_aufgabe_status_setzen() und sync_menge_melden()
-- (20261019000000_sync_replay_ergebnis.sql) laufen als SECURITY INVOKER. Eine
-- Rolle ohne Leserecht auf pflueckaufgaben und ohne Schreibrecht auf
-- sync_protokoll (zum Beispiel picker) liest den Ist-Status als NULL, nimmt
-- deshalb den Konfliktzweig und scheitert dort am INSERT in sync_protokoll
-- (RLS, 42501). Der Aufrufer bekommt einen rohen HTTP 403 statt der im Code
-- vorgesehenen, sauberen Antwort.
--
-- Die Mengenmeldung selbst war nie gefaehrdet: das UPDATE auf pflueckaufgaben
-- trifft unter RLS keine Zeile, die Menge bleibt unveraendert. Es geht nur um
-- die Antwortform, auf die sich ein Offline-Sync-Client verlaesst.
--
-- Fix: Das Protokollieren des Konflikts steht in einem eigenen Block. Fehlt der
-- Rolle dafuer das Recht (insufficient_privilege), lautet die Antwort
-- 'berechtigung' und es wird, wie bei jeder reinen Schreibsperre, nichts
-- protokolliert. Alles andere bleibt unveraendert, auch der Replay.
-- Pruefung: supabase/tests/pglite-fast.mjs, Abschnitt 12.
-- =============================================================================

set search_path = public;

create or replace function public.sync_aufgabe_status_setzen(
  p_aktion_id uuid,
  p_aufgabe_id uuid,
  p_neuer_status text,
  p_vorzustand text,
  p_arbeitsbeginn_geraet_zeitpunkt timestamptz default null
) returns table(ergebnis text, code text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_code             text;
  v_frueher_ergebnis text;
  v_ist_status       public.pflueckaufgabe_status;
begin
  if (p_neuer_status, p_vorzustand) not in (('angenommen', 'offen'), ('in_arbeit', 'angenommen')) then
    raise exception 'Ungueltiger Statusuebergang.' using errcode = '22023';
  end if;

  select sp.ergebnis into v_frueher_ergebnis
    from public.sync_protokoll sp
   where sp.aktion_id = p_aktion_id;

  if v_frueher_ergebnis = 'konflikt' then
    return query select 'konflikt'::text, null::text;
    return;
  end if;

  if v_frueher_ergebnis = 'angewendet' then
    select p.code into v_code from public.pflueckaufgaben p where p.id = p_aufgabe_id;
    return query select 'angewendet'::text, v_code;
    return;
  end if;

  select t.status into v_ist_status from public.pflueckaufgaben t where t.id = p_aufgabe_id;

  update public.pflueckaufgaben t
     set status = p_neuer_status::public.pflueckaufgabe_status,
         arbeitsbeginn_geraet_zeitpunkt =
           coalesce(p_arbeitsbeginn_geraet_zeitpunkt, t.arbeitsbeginn_geraet_zeitpunkt)
   where t.id = p_aufgabe_id
     and t.status = p_vorzustand::public.pflueckaufgabe_status
  returning t.code into v_code;

  if v_code is null then
    if v_ist_status is distinct from p_vorzustand::public.pflueckaufgabe_status then
      begin
        insert into public.sync_protokoll (aktion_id, aktion_typ, ressource_id, ergebnis)
        values (p_aktion_id, 'aufgabe_status_' || p_neuer_status, p_aufgabe_id, 'konflikt')
        on conflict (aktion_id) do nothing;
      exception when insufficient_privilege then
        -- Die Rolle darf weder die Aufgabe lesen noch das Protokoll schreiben:
        -- reine Schreibsperre, nichts festhalten.
        return query select 'berechtigung'::text, null::text;
        return;
      end;
      return query select 'konflikt'::text, null::text;
      return;
    end if;
    return query select 'berechtigung'::text, null::text;
    return;
  end if;

  insert into public.sync_protokoll (aktion_id, aktion_typ, ressource_id, ergebnis)
  values (p_aktion_id, 'aufgabe_status_' || p_neuer_status, p_aufgabe_id, 'angewendet')
  on conflict (aktion_id) do nothing;

  insert into public.audit_events (aktion, ressource, ressource_id, metadata)
  values ('aufgabe.status', 'pflueckaufgaben', p_aufgabe_id,
          jsonb_build_object('code', v_code, 'status', p_neuer_status, 'via', 'sync'));

  return query select 'angewendet'::text, v_code;
end;
$$;

comment on function public.sync_aufgabe_status_setzen is
  'Anforderung 2.5: idempotenter Statuswechsel aus der Offline-Warteschlange. Ein Replay derselben aktion_id liefert das gespeicherte Ergebnis. Ein echter Zustandskonflikt bleibt ein Konflikt, eine reine Schreibsperre (RLS, z. B. nach Brigade-Umzuweisung oder fehlendes Protokollrecht) liefert stattdessen "berechtigung" und wird nicht dauerhaft protokolliert (20261019000000, 20261115000000).';

create or replace function public.sync_menge_melden(
  p_aktion_id uuid,
  p_aufgabe_id uuid,
  p_ist_menge_kg numeric,
  p_ausschuss_kg numeric default 0,
  p_pfluecker_anzahl integer default null
) returns table(ergebnis text, code text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_code             text;
  v_frueher_ergebnis text;
  v_ist_status       public.pflueckaufgabe_status;
begin
  if p_ist_menge_kg is null or p_ist_menge_kg < 0 or coalesce(p_ausschuss_kg, 0) < 0 then
    raise exception 'Ungueltige Menge.' using errcode = '22023';
  end if;

  select sp.ergebnis into v_frueher_ergebnis
    from public.sync_protokoll sp
   where sp.aktion_id = p_aktion_id;

  if v_frueher_ergebnis = 'konflikt' then
    return query select 'konflikt'::text, null::text;
    return;
  end if;

  if v_frueher_ergebnis = 'angewendet' then
    select p.code into v_code from public.pflueckaufgaben p where p.id = p_aufgabe_id;
    return query select 'angewendet'::text, v_code;
    return;
  end if;

  select t.status into v_ist_status from public.pflueckaufgaben t where t.id = p_aufgabe_id;

  update public.pflueckaufgaben t
     set ist_menge_kg = p_ist_menge_kg,
         ausschuss_kg = coalesce(p_ausschuss_kg, 0),
         pfluecker_anzahl = coalesce(p_pfluecker_anzahl, t.pfluecker_anzahl),
         status = 'beleg_pruefung'::public.pflueckaufgabe_status
   where t.id = p_aufgabe_id
     and t.status in ('in_arbeit'::public.pflueckaufgabe_status, 'beleg_pruefung'::public.pflueckaufgabe_status)
  returning t.code into v_code;

  if v_code is null then
    if v_ist_status is null or v_ist_status not in ('in_arbeit', 'beleg_pruefung') then
      begin
        insert into public.sync_protokoll (aktion_id, aktion_typ, ressource_id, ergebnis)
        values (p_aktion_id, 'menge_melden', p_aufgabe_id, 'konflikt')
        on conflict (aktion_id) do nothing;
      exception when insufficient_privilege then
        -- Siehe sync_aufgabe_status_setzen(): reine Schreibsperre.
        return query select 'berechtigung'::text, null::text;
        return;
      end;
      return query select 'konflikt'::text, null::text;
      return;
    end if;
    return query select 'berechtigung'::text, null::text;
    return;
  end if;

  insert into public.sync_protokoll (aktion_id, aktion_typ, ressource_id, ergebnis)
  values (p_aktion_id, 'menge_melden', p_aufgabe_id, 'angewendet')
  on conflict (aktion_id) do nothing;

  insert into public.audit_events (aktion, ressource, ressource_id, metadata)
  values ('aufgabe.menge', 'pflueckaufgaben', p_aufgabe_id,
          jsonb_build_object(
            'code', v_code,
            'ist_menge_kg', p_ist_menge_kg,
            'ausschuss_kg', p_ausschuss_kg,
            'via', 'sync'
          ));

  return query select 'angewendet'::text, v_code;
end;
$$;

comment on function public.sync_menge_melden is
  'Anforderung 2.5: idempotente Mengenmeldung aus der Offline-Warteschlange. Ein Replay derselben aktion_id liefert das gespeicherte Ergebnis. Ein echter Zustandskonflikt bleibt ein Konflikt, eine reine Schreibsperre (RLS, z. B. nach Brigade-Umzuweisung oder fehlendes Protokollrecht) liefert stattdessen "berechtigung" und wird nicht dauerhaft protokolliert (20261019000000, 20261115000000).';
