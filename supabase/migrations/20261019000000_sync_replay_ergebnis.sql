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
--
-- QA-Nachbesserung (zwei weitere Funde vor dem Merge):
--   * Der "angewendet"-Insert hatte, anders als der "konflikt"-Insert
--     daneben, kein ON CONFLICT DO NOTHING - eine Asymmetrie ohne
--     fachlichen Grund, jetzt in beiden Funktionen angeglichen.
--   * 0 betroffene Zeilen beim UPDATE bedeuteten bisher immer "konflikt",
--     auch wenn nur die Schreibberechtigung fehlte (RLS aus
--     20261018000000_brigade_schreibumfang.sql, z. B. nach einer
--     Brigade-Umzuweisung waehrend eine Aktion noch in der Warteschlange
--     stand). Ein solcher permanenter "konflikt"-Eintrag haette einen
--     spaeteren, nach Korrektur der Zuweisung eigentlich erfolgreichen
--     Versuch fuer immer blockiert. Beide Funktionen stellen den Ist-Status
--     jetzt vorab per SELECT fest (breitere RLS als das UPDATE) und
--     unterscheiden echten Zustandskonflikt (weiterhin dauerhaft als
--     'konflikt' protokolliert) von reiner Schreibsperre (neues Ergebnis
--     'berechtigung', bewusst nicht protokolliert, damit ein Retry nach
--     korrigierter Zuweisung greifen kann).
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

  -- QA-Fund: der Ist-Status vorab per SELECT (breitere RLS als das folgende
  -- UPDATE, siehe pflueckaufgaben_select_* vs. pflueckaufgaben_update_feld in
  -- 20261018000000_brigade_schreibumfang.sql) - damit laesst sich unten
  -- unterscheiden, ob 0 betroffene Zeilen einen echten Zustandskonflikt
  -- bedeuten oder nur eine fehlende Schreibberechtigung (z. B. Aufgabe
  -- zwischenzeitlich einer anderen Brigade zugewiesen). Nur ein echter
  -- Zustandskonflikt wird dauerhaft im Sync-Protokoll festgehalten, sonst
  -- bliebe ein spaeterer Versuch nach einer korrigierten Zuweisung fuer
  -- immer an demselben aktion_id-Replay haengen.
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
      insert into public.sync_protokoll (aktion_id, aktion_typ, ressource_id, ergebnis)
      values (p_aktion_id, 'aufgabe_status_' || p_neuer_status, p_aufgabe_id, 'konflikt')
      on conflict (aktion_id) do nothing;
      return query select 'konflikt'::text, null::text;
      return;
    end if;
    -- Zustand passte, nur die Schreibberechtigung fehlte (RLS) - bewusst
    -- nicht im Protokoll festgehalten, damit ein Retry nach einer
    -- korrigierten Zuweisung greifen kann.
    return query select 'berechtigung'::text, null::text;
    return;
  end if;

  -- QA-Fund: der Konflikt-Zweig oben hatte bereits ON CONFLICT DO NOTHING,
  -- dieser Zweig nicht - eine Asymmetrie ohne fachlichen Grund. v_code kommt
  -- aus dem eigenen, bereits erfolgreichen UPDATE dieser Transaktion, der
  -- Rueckgabewert bleibt also auch dann richtig, wenn das Protokoll die
  -- Zeile schon (von anderswo) traegt.
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
  'Anforderung 2.5: idempotenter Statuswechsel aus der Offline-Warteschlange. Ein Replay derselben aktion_id liefert das gespeicherte Ergebnis - ein echter Zustandskonflikt bleibt ein Konflikt, eine reine Schreibsperre (RLS, z. B. nach Brigade-Umzuweisung) liefert stattdessen "berechtigung" und wird nicht dauerhaft protokolliert (20261019000000, QA-Nachbesserung).';

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

  -- QA-Fund: siehe sync_aufgabe_status_setzen() oben - Ist-Status vorab
  -- feststellen, um einen echten Zustandskonflikt von einer reinen
  -- Schreibsperre (RLS, z. B. nach Brigade-Umzuweisung) zu unterscheiden.
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
      insert into public.sync_protokoll (aktion_id, aktion_typ, ressource_id, ergebnis)
      values (p_aktion_id, 'menge_melden', p_aufgabe_id, 'konflikt')
      on conflict (aktion_id) do nothing;
      return query select 'konflikt'::text, null::text;
      return;
    end if;
    return query select 'berechtigung'::text, null::text;
    return;
  end if;

  -- QA-Fund: dieselbe Asymmetrie wie in sync_aufgabe_status_setzen() oben.
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
  'Anforderung 2.5: idempotente Mengenmeldung aus der Offline-Warteschlange. Ein Replay derselben aktion_id liefert das gespeicherte Ergebnis - ein echter Zustandskonflikt bleibt ein Konflikt, eine reine Schreibsperre (RLS, z. B. nach Brigade-Umzuweisung) liefert stattdessen "berechtigung" und wird nicht dauerhaft protokolliert (20261019000000, QA-Nachbesserung).';
