-- =============================================================================
-- Damicon - Schreibrechte der Brigade auf die eigenen, offenen Aufgaben begrenzen
-- =============================================================================
-- pflueckaufgaben_update_feld (20260905120000) und steigen_update_feld
-- (20260905180000) fragen nur nach der Rolle: has_role('admin',
-- 'betriebsleitung', 'brigade'). Jede Brigade-Anmeldung durfte damit jede
-- Aufgabe und jede Steige im Betrieb aendern - auch die einer fremden Brigade.
-- Fuer arbeitszeiten war genau das schon einmal ein Befund und wurde in
-- 20260905200000_kette_haerten.sql ueber profiles.brigade_id eingegrenzt;
-- Aufgaben und Steigen blieben offen.
--
-- Was bereits zu ist und hier NICHT wiederholt wird:
--   * Nach Abschluss einer Aufgabe sind Gewicht, Pflueckerzuordnung,
--     Scan-Zeitpunkt und Aufgabenbezug einer Steige fuer jede Rolle fest, und
--     es kommt keine Steige mehr hinzu (steige_nach_abschluss_fest(),
--     20261003000000).
--   * Menge, Ausschuss und Qualitaetsfaktor einer abgeschlossenen Aufgabe sind
--     unveraenderlich, abschliessen darf nur die Betriebsleitung
--     (pflueckaufgabe_freigabe_pruefen(), 20260917000000).
--   * kontrolliert_am/kontrolliert_von_profil_id setzt nur das Buero
--     (20260919010000).
-- Offen war die Ebene davor: WELCHE Aufgabe eine Brigade ueberhaupt anfassen
-- darf, und welche Felder daran.
--
-- Diese Migration:
--   1. begrenzt beide Update-Policies auf die eigene Brigade
--      (profiles.brigade_id), fuer Steigen ueber die Aufgabe dahinter,
--   2. laesst die Brigade an der eigenen Aufgabe nur die Felder aendern, die
--      der Feldablauf braucht (Status vorwaerts, Ist-Menge, Ausschuss,
--      Pflueckerzahl, Arbeitsbeginn-Zeitstempel) - Planungsfelder wie
--      zielmenge_kg, faelligkeit, reihenblock_id oder brigade_id bleiben der
--      Betriebsleitung vorbehalten,
--   3. verbietet der Brigade den Ruecksprung in einen frueheren Status.
--
-- BEWUSST NICHT TEIL DIESER MIGRATION:
--   * pflueckaufgaben_insert_feld: die Brigade hat crud("pflueckaufgaben") in
--     rbac.ts und legt im Feld auch Aufgaben fuer eine andere Brigade an (das
--     Formular bietet die Auswahl an). Ob das so bleiben soll, ist eine
--     betriebliche Festlegung, kein Fehler im Rechteschnitt.
--   * steigen_insert_feld prueft weiterhin nicht, ob der gewaehlte Pfluecker
--     zur Brigade gehoert (anders als arbeitszeiten_insert_feld). Die
--     Einschraenkung auf die eigene Aufgabe deckt den Hauptweg ab; die
--     Pflueckerbindung ist ein eigener, kleinerer Schnitt.
--   * Eine Aufgabe ohne Brigade (brigade_id is null) bleibt fuer jede Brigade
--     bearbeitbar - sonst liesse sich eine noch nicht zugeteilte Aufgabe im
--     Feld nicht annehmen. Das Zuteilen selbst bleibt der Betriebsleitung.
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. Eigene Brigade der angemeldeten Person
-- ---------------------------------------------------------------------------
create or replace function public.current_brigade_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select brigade_id from public.profiles where auth_user_id = auth.uid() limit 1;
$$;

comment on function public.current_brigade_id is
  'Brigade der aktuell angemeldeten Person (profiles.brigade_id), null ohne Zuordnung oder bei einem serverseitigen Aufruf. Grundlage der Eingrenzung in pflueckaufgaben_update_feld und steigen_update_feld (20261018000000).';

-- ---------------------------------------------------------------------------
-- 2. Pflueckaufgaben: nur die eigene Brigade
-- ---------------------------------------------------------------------------
drop policy if exists pflueckaufgaben_update_feld on public.pflueckaufgaben;
create policy pflueckaufgaben_update_feld on public.pflueckaufgaben
  for update to authenticated
  using (
    public.has_role('admin', 'betriebsleitung')
    or (
      public.has_role('brigade')
      and (brigade_id is null or brigade_id = public.current_brigade_id())
    )
  )
  with check (
    public.has_role('admin', 'betriebsleitung')
    or (
      public.has_role('brigade')
      and (brigade_id is null or brigade_id = public.current_brigade_id())
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Steigen: nur Steigen an der eigenen Aufgabe
-- ---------------------------------------------------------------------------
-- Eine Steige ohne Aufgabenbezug (pflueckaufgabe_id is null) gehoert keinem
-- Feldablauf an - sie bleibt dem Buero vorbehalten.
drop policy if exists steigen_update_feld on public.steigen;
create policy steigen_update_feld on public.steigen
  for update to authenticated
  using (
    public.has_role('admin', 'betriebsleitung')
    or (
      public.has_role('brigade')
      and exists (
        select 1 from public.pflueckaufgaben a
         where a.id = steigen.pflueckaufgabe_id
           and (a.brigade_id is null or a.brigade_id = public.current_brigade_id())
      )
    )
  )
  with check (
    public.has_role('admin', 'betriebsleitung')
    or (
      public.has_role('brigade')
      and exists (
        select 1 from public.pflueckaufgaben a
         where a.id = steigen.pflueckaufgabe_id
           and (a.brigade_id is null or a.brigade_id = public.current_brigade_id())
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Welche Felder die Brigade an einer Aufgabe aendern darf
-- ---------------------------------------------------------------------------
-- Eine Policy entscheidet ueber Zeilen, nicht ueber Spalten. Der Schnitt
-- zwischen Feldablauf (Status, gemeldete Mengen) und Planung (Zielmenge,
-- Frist, Block, Brigade) braucht deshalb einen Trigger - gleiches Muster wie
-- steigen_kontrolle_rollenschutz (20260919010000).
create or replace function public.pflueckaufgabe_brigade_umfang_pruefen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rang constant text[] := array['offen', 'angenommen', 'in_arbeit', 'beleg_pruefung', 'abgeschlossen'];
begin
  -- Serverseitig (service_role) und fuer das Buero unveraendert.
  if auth.uid() is null or public.has_role('admin', 'betriebsleitung') then
    return new;
  end if;

  if not public.has_role('brigade') then
    return new;
  end if;

  if new.code is distinct from old.code
     or new.reihenblock_id is distinct from old.reihenblock_id
     or new.brigade_id is distinct from old.brigade_id
     or new.sorte_id is distinct from old.sorte_id
     or new.charge_id is distinct from old.charge_id
     or new.zielmenge_kg is distinct from old.zielmenge_kg
     or new.faelligkeit is distinct from old.faelligkeit then
    raise exception
      'Zielmenge, Frist, Reihenblock, Sorte, Charge und Brigadenzuteilung einer Pflueckaufgabe plant die Betriebsleitung - die Brigade meldet Status und Mengen.'
      using errcode = 'insufficient_privilege';
  end if;

  if array_position(v_rang, new.status::text) < array_position(v_rang, old.status::text) then
    raise exception
      'Eine Pflueckaufgabe geht nicht in einen frueheren Status zurueck (% -> %).', old.status, new.status
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.pflueckaufgabe_brigade_umfang_pruefen is
  'Begrenzt die Rolle brigade an einer Pflueckaufgabe auf den Feldablauf: Status nur vorwaerts, Planungsfelder unveraendert. Buero und service_role bleiben unberuehrt (20261018000000).';

drop trigger if exists trg_pflueckaufgabe_brigade_umfang on public.pflueckaufgaben;
create trigger trg_pflueckaufgabe_brigade_umfang
  before update on public.pflueckaufgaben
  for each row execute function public.pflueckaufgabe_brigade_umfang_pruefen();
