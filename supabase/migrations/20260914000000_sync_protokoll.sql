-- Anforderung 2.5, Phase 4: Idempotenz und Konfliktauflösung für die drei
-- UPDATE-Workflows (Aufgabe annehmen, Arbeit starten, Menge melden).
--
-- Anders als die reinen INSERTs aus Phase 2/3 (Kühlmessung, Arbeitszeit):
-- dort macht eine vom Client vergebene Zeilen-id den Insert selbst
-- idempotent (ON CONFLICT DO NOTHING). Bei einem UPDATE existiert die
-- Zielzeile bereits - ein Retry nach einer nie angekommenen Antwort lässt
-- sich vom serverseitig hartcodierten CAS-Guard (erwarteter Vorzustand)
-- nicht mehr von einem echten Konflikt unterscheiden: nach dem ersten,
-- erfolgreichen Versuch hat sich der Status schon geändert, ein zweiter
-- Versuch mit demselben (jetzt veralteten) Vorzustand träfe denselben Fehler
-- wie ein echter Konflikt mit einer fremden Änderung.
--
-- sync_protokoll loest das: die client-generierte aktion_id wird beim ersten
-- erfolgreichen Versuch festgehalten. Ein Retry mit derselben aktion_id
-- erkennt "das war schon ich" und meldet Erfolg, ohne erneut zu schreiben -
-- ein neuer aktion_id-Versuch, dessen CAS-Guard fehlschlaegt, ist dagegen ein
-- echter Konflikt.

create table public.sync_protokoll (
  aktion_id     uuid primary key,
  aktion_typ    text not null,
  ressource_id  uuid not null,
  ergebnis      text not null check (ergebnis in ('angewendet', 'konflikt')),
  erstellt_am   timestamptz not null default now()
);
comment on table public.sync_protokoll is
  'Anforderung 2.5: Protokoll bereits verarbeiteter Sync-Aktionen (client-generierte aktion_id als Idempotenzschluessel) fuer die UPDATE-Workflows der Offline-Warteschlange - unterscheidet einen Retry der eigenen Aktion von einem echten Konflikt.';

alter table public.sync_protokoll enable row level security;

-- Kein direkter Zugriff von aussen - geschrieben wird ausschliesslich durch
-- die beiden SECURITY INVOKER-Funktionen unten. Buero/Leitung duerfen zur
-- Nachvollziehbarkeit lesen (z. B. um haeufige Konflikte im Feld zu sehen).
create policy sync_protokoll_lesen_leitung on public.sync_protokoll
  for select to authenticated
  using (public.has_role('admin', 'betriebsleitung'));

-- ---------------------------------------------------------------------------
-- sync_aufgabe_status_setzen: deckt "Aufgabe annehmen" (offen -> angenommen)
-- und "Arbeit starten" (angenommen -> in_arbeit) ab - die beiden im Feld
-- offline ausgeloesten Statusuebergaenge. "abgeschlossen" (Buero/Leitung,
-- braucht Qualitaetsfaktor und die "approve"-Berechtigung) bleibt bewusst
-- aussen vor, das ist kein Feld-Workflow.
--
-- security invoker (nicht definer): die Funktion laeuft mit den Rechten des
-- aufrufenden Nutzers, RLS auf pflueckaufgaben greift exakt wie bei einem
-- direkten Update - keine Rechteausweitung durch die Hintertuer.
-- ---------------------------------------------------------------------------
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
  -- Serverseitig hartcodierte, gueltige Uebergaenge - p_vorzustand ist nur
  -- die erklaerte Absicht des Clients, uebernommen wird er nur, wenn er zu
  -- einem der beiden bekannten Paare passt. Sonst liesse sich der CAS-Guard
  -- durch eine manipulierte Anfrage selbst aushebeln (dieselbe Regel wie
  -- erwarteterVorzustand in pflueckaufgaben.ts).
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
     set status = p_neuer_status,
         arbeitsbeginn_geraet_zeitpunkt =
           coalesce(p_arbeitsbeginn_geraet_zeitpunkt, arbeitsbeginn_geraet_zeitpunkt)
   where id = p_aufgabe_id
     and status = p_vorzustand
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

-- ---------------------------------------------------------------------------
-- sync_menge_melden: deckt "Menge melden" ab. Wie im Online-Pfad
-- (mengeMelden() in pflueckaufgaben.ts) gilt sowohl "in_arbeit" (erste
-- Meldung) als auch "beleg_pruefung" (Korrektur vor der Freigabe) als
-- gueltiger Vorzustand.
-- ---------------------------------------------------------------------------
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
         status = 'beleg_pruefung'
   where id = p_aufgabe_id
     and status in ('in_arbeit', 'beleg_pruefung')
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

grant execute on function public.sync_aufgabe_status_setzen(uuid, uuid, text, text, timestamptz) to authenticated;
grant execute on function public.sync_menge_melden(uuid, uuid, numeric, numeric, integer) to authenticated;
