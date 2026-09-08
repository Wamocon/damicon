-- Fix zu Migration 20260914000000: pflueckaufgaben.status ist
-- public.pflueckaufgabe_status (enum), kein text - ein Vergleich/eine
-- Zuweisung gegen einen text-Parameter ohne expliziten Cast scheitert mit
-- "operator does not exist: pflueckaufgabe_status = text" (Postgres castet
-- text nicht implizit auf einen Enum-Typ). Beim ersten Live-Test gegen das
-- gehostete Projekt aufgefallen, hier per CREATE OR REPLACE korrigiert statt
-- die bereits angewendete Migration im Nachhinein zu aendern.

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
  v_code text;
  v_bereits_verarbeitet boolean;
begin
  if (p_neuer_status, p_vorzustand) not in (('angenommen', 'offen'), ('in_arbeit', 'angenommen')) then
    raise exception 'Ungueltiger Statusuebergang.' using errcode = '22023';
  end if;

  select true into v_bereits_verarbeitet
    from public.sync_protokoll
   where aktion_id = p_aktion_id;

  if v_bereits_verarbeitet then
    select p.code into v_code from public.pflueckaufgaben p where p.id = p_aufgabe_id;
    return query select 'angewendet'::text, v_code;
    return;
  end if;

  update public.pflueckaufgaben
     set status = p_neuer_status::public.pflueckaufgabe_status,
         arbeitsbeginn_geraet_zeitpunkt =
           coalesce(p_arbeitsbeginn_geraet_zeitpunkt, arbeitsbeginn_geraet_zeitpunkt)
   where id = p_aufgabe_id
     and status = p_vorzustand::public.pflueckaufgabe_status
  returning code into v_code;

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
  v_code text;
  v_bereits_verarbeitet boolean;
begin
  if p_ist_menge_kg is null or p_ist_menge_kg < 0 or coalesce(p_ausschuss_kg, 0) < 0 then
    raise exception 'Ungueltige Menge.' using errcode = '22023';
  end if;

  select true into v_bereits_verarbeitet
    from public.sync_protokoll
   where aktion_id = p_aktion_id;

  if v_bereits_verarbeitet then
    select p.code into v_code from public.pflueckaufgaben p where p.id = p_aufgabe_id;
    return query select 'angewendet'::text, v_code;
    return;
  end if;

  update public.pflueckaufgaben
     set ist_menge_kg = p_ist_menge_kg,
         ausschuss_kg = coalesce(p_ausschuss_kg, 0),
         pfluecker_anzahl = coalesce(p_pfluecker_anzahl, pfluecker_anzahl),
         status = 'beleg_pruefung'::public.pflueckaufgabe_status
   where id = p_aufgabe_id
     and status in ('in_arbeit'::public.pflueckaufgabe_status, 'beleg_pruefung'::public.pflueckaufgabe_status)
  returning code into v_code;

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
