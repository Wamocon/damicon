-- =============================================================================
-- Damicon - Ein wiederholter Sync meldet das urspruengliche Ergebnis
-- =============================================================================
-- sync_aufgabe_status_setzen() und sync_menge_melden()
-- (20260914020000_sync_protokoll_ambiguous_code_fix.sql) fragen beim Replay
-- einer aktion_id nur, OB die Aktion schon im Protokoll steht - nicht, WIE sie
-- ausgegangen ist:
--
--   select true into v_bereits_verarbeitet from public.sync_protokoll
--    where aktion_id = p_aktion_id;
--   if v_bereits_verarbeitet then ... return 'angewendet' ...
--
-- Ein Konflikt wird aber in dieselbe Tabelle geschrieben (ergebnis =
-- 'konflikt'). Geht die Konfliktantwort auf dem Rueckweg verloren - genau der
-- Fall, fuer den die Warteschlange gebaut ist (sync-engine.ts stellt den
-- Eintrag zurueck auf "wartend") -, liefert der naechste Versuch
-- 'angewendet'. Der Eintrag verschwindet aus der Warteschlange, die Oberflaeche
-- meldet Erfolg, und geschrieben wurde nie etwas: die Aufgabe stand beim
-- ersten Versuch schon in einem anderen Status.
--
-- Diese Migration gibt beim Replay das gespeicherte Ergebnis zurueck. Damit
-- bleibt die Idempotenz erhalten (dieselbe Aktion schreibt nie zweimal), aber
-- ein Konflikt bleibt ein Konflikt, so oft er auch nachgefragt wird.
--
-- BEWUSST NICHT TEIL DIESER MIGRATION: sync_protokoll_einfuegen_feld
-- (20260914020000) laesst die Rolle brigade weiterhin direkt Protokollzeilen
-- schreiben - die Funktionen laufen als SECURITY INVOKER und brauchen dieses
-- Recht. Wer eine aktion_id vorab mit ergebnis 'angewendet' einfuegt, bekommt
-- beim Sync weiterhin "angewendet" zurueck, ohne dass etwas geschrieben wird.
-- Das sauber zu schliessen hiesse, die beiden Funktionen auf SECURITY DEFINER
-- umzustellen und die RLS-Pruefung der Aufgabe selbst zu uebernehmen - ein
-- groesserer Umbau mit eigenem Testbedarf, kein Nebenzug dieser Korrektur.
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
begin
  if (p_neuer_status, p_vorzustand) not in (('angenommen', 'offen'), ('in_arbeit', 'angenommen')) then
    raise exception 'Ungueltiger Statusuebergang.' using errcode = '22023';
  end if;

  -- Replay: das gespeicherte Ergebnis entscheidet, nicht die blosse Existenz
  -- der Zeile.
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

  update public.pflueckaufgaben t
     set status = p_neuer_status::public.pflueckaufgabe_status,
         arbeitsbeginn_geraet_zeitpunkt =
           coalesce(p_arbeitsbeginn_geraet_zeitpunkt, t.arbeitsbeginn_geraet_zeitpunkt)
   where t.id = p_aufgabe_id
     and t.status = p_vorzustand::public.pflueckaufgabe_status
  returning t.code into v_code;

  if v_code is null then
    insert into public.sync_protokoll (aktion_id, aktion_typ, ressource_id, ergebnis)
    values (p_aktion_id, 'aufgabe_status_' || p_neuer_status, p_aufgabe_id, 'konflikt')
    on conflict (aktion_id) do nothing;
    return query select 'konflikt'::text, null::text;
    return;
  end if;

  insert into public.sync_protokoll (aktion_id, aktion_typ, ressource_id, ergebnis)
  values (p_aktion_id, 'aufgabe_status_' || p_neuer_status, p_aufgabe_id, 'angewendet');

  insert into public.audit_events (aktion, ressource, ressource_id, metadata)
  values ('aufgabe.status', 'pflueckaufgaben', p_aufgabe_id,
          jsonb_build_object('code', v_code, 'status', p_neuer_status, 'via', 'sync'));

  return query select 'angewendet'::text, v_code;
end;
$$;

comment on function public.sync_aufgabe_status_setzen is
  'Anforderung 2.5: idempotenter Statuswechsel aus der Offline-Warteschlange. Ein Replay derselben aktion_id liefert das gespeicherte Ergebnis - ein Konflikt bleibt ein Konflikt (20261019000000).';

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

  update public.pflueckaufgaben t
     set ist_menge_kg = p_ist_menge_kg,
         ausschuss_kg = coalesce(p_ausschuss_kg, 0),
         pfluecker_anzahl = coalesce(p_pfluecker_anzahl, t.pfluecker_anzahl),
         status = 'beleg_pruefung'::public.pflueckaufgabe_status
   where t.id = p_aufgabe_id
     and t.status in ('in_arbeit'::public.pflueckaufgabe_status, 'beleg_pruefung'::public.pflueckaufgabe_status)
  returning t.code into v_code;

  if v_code is null then
    insert into public.sync_protokoll (aktion_id, aktion_typ, ressource_id, ergebnis)
    values (p_aktion_id, 'menge_melden', p_aufgabe_id, 'konflikt')
    on conflict (aktion_id) do nothing;
    return query select 'konflikt'::text, null::text;
    return;
  end if;

  insert into public.sync_protokoll (aktion_id, aktion_typ, ressource_id, ergebnis)
  values (p_aktion_id, 'menge_melden', p_aufgabe_id, 'angewendet');

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
  'Anforderung 2.5: idempotente Mengenmeldung aus der Offline-Warteschlange. Ein Replay derselben aktion_id liefert das gespeicherte Ergebnis - ein Konflikt bleibt ein Konflikt (20261019000000).';
