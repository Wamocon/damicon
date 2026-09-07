-- =============================================================================
-- Damicon - Rotationsplan-Engine
-- =============================================================================
-- Anforderung 2.2 aus dem Masterplan (P1): "Rotationsplan mit Pflueckintervall
-- von zwei bis drei Tagen je Reihenblock ... Zyklische Planung ueber Wochen,
-- Sperrlogik, Wetterszenarien. Die erste Funktion, die gebaut wird."
--
-- Die Tabelle rotationsplan_eintraege stand bereits seit dem initialen Schema
-- (reihenblock_id, brigade_id, geplant_fuer, intervall_tage, status als freier
-- Text), war aber ohne Erzeuger-Funktion, ohne Verknuepfung zur tatsaechlichen
-- Pflueckaufgabe und ohne Sperrlogik - genau der in der Reifegrad-Registry
-- (modules.ts) dokumentierte Stand "in-entwicklung".
--
-- Wetterszenarien (der dritte Teil der Anforderung) bleiben bewusst aussen
-- vor: die Wetteranbindung (Anforderung 2.13) ist selbst noch nicht gebaut
-- (P2) - ohne echte Temperatursummendaten gaebe es nichts, worauf ein
-- Wetterszenario aufbauen koennte. Die zyklische Planung und die Sperrlogik
-- (die beiden anderen Teile) stehen hier vollstaendig; ein spaeterer Ausbau
-- kann v_start unten um einen Temperatursummen-Faktor verschieben, ohne die
-- Struktur zu aendern.
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. Status als Enum statt freier Text - konsistent mit allen anderen
--    Statusspalten im Schema (pflueckaufgabe_status, charge_status usw.).
--    Die Tabelle traegt bisher nur die drei Seed-Zeilen (alle 'geplant'), der
--    Cast ist deshalb unkritisch.
-- ---------------------------------------------------------------------------
create type public.rotationsplan_status as enum (
  'geplant',       -- geplant, noch offen
  'gesperrt',      -- faellt in eine laufende Wartezeitsperre
  'erledigt',      -- eine Pflueckaufgabe hat den Termin erfuellt
  'uebersprungen'  -- manuell uebersprungen (z. B. Rueckschnitt eingeschoben)
);

alter table public.rotationsplan_eintraege alter column status drop default;
alter table public.rotationsplan_eintraege
  alter column status type public.rotationsplan_status using status::public.rotationsplan_status;
alter table public.rotationsplan_eintraege alter column status set default 'geplant';

-- ---------------------------------------------------------------------------
-- 2. Verknuepfung zur erfuellenden Pflueckaufgabe
-- ---------------------------------------------------------------------------
alter table public.rotationsplan_eintraege
  add column if not exists pflueckaufgabe_id uuid references public.pflueckaufgaben(id) on delete set null;
create index if not exists idx_rotationsplan_aufgabe on public.rotationsplan_eintraege(pflueckaufgabe_id);

-- Ein Termin je Block und Tag - verhindert doppelte Eintraege bei wiederholtem
-- Lauf des Erzeugers (bisher nur durch ein "where not exists" im Seed
-- behelfsmaessig gesichert, nicht durch die Datenbank selbst).
alter table public.rotationsplan_eintraege
  add constraint rotationsplan_eintraege_block_datum_key unique (reihenblock_id, geplant_fuer);

comment on table public.rotationsplan_eintraege is
  'Rotationsplan-Engine (Anforderung 2.2): zyklische Pfluecktermine je Reihenblock. '
  'Erzeugt durch public.rotationsplan_generieren(), automatisch gesperrt/entsperrt '
  'durch Behandlungs- bzw. Freigabe-Trigger, automatisch erledigt durch die erste '
  'passende Pflueckaufgabe.';

-- ---------------------------------------------------------------------------
-- 3. Erzeuger: naechste Termine je aktivem Reihenblock
-- ---------------------------------------------------------------------------
-- security invoker (wie reihenblock_freigeben): die RLS-Policies des
-- Aufrufers gelten weiter, die Funktion buendelt nur die Zyklusrechnung.
create or replace function public.rotationsplan_generieren(
  p_wochen integer default 4,
  p_ab     date default current_date
)
-- OUT-Parameter bewusst NICHT reihenblock_id/status genannt: PL/pgSQL loest
-- Bezeichner in SQL-Anweisungen gegen Variablen UND Spalten auf, ein
-- gleichlautender OUT-Parameter macht dann jede Verwendung des Spaltennamens
-- im Funktionskoerper mehrdeutig - auch dort, wo ein Tabellenalias nicht
-- greift (z. B. im Zielspalten-Tupel von ON CONFLICT). Live gegen Postgres
-- gefunden, siehe Kommentare unten.
returns table (betroffener_block_id uuid, neue_termine integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_block       record;
  v_letzter     date;
  v_intervall   integer;
  v_naechster   date;
  v_bis         date;
  v_angelegt    integer;
begin
  if p_wochen is null or p_wochen < 1 or p_wochen > 12 then
    raise exception 'p_wochen muss zwischen 1 und 12 liegen.' using errcode = 'check_violation';
  end if;

  v_bis := p_ab + (p_wochen * 7);

  -- Nur Bloecke, die tatsaechlich in der Rotation stehen. 'ruhend' und
  -- 'rueckschnitt' werden nicht geerntet, 'wartezeitgesperrt' bekommt seine
  -- Termine automatisch ueber den Sperr-Trigger (Abschnitt 4) - ein aktuell
  -- gesperrter Block braucht keine neue Planung, bis er wieder freigegeben ist.
  for v_block in
    select rb.id, rb.letzte_ernte
      from public.reihenbloecke rb
     where rb.status in ('bepflanzt', 'erntereif')
  loop
    -- Anschluss an den zuletzt geplanten Termin dieses Blocks, sonst an die
    -- letzte tatsaechliche Ernte, sonst an p_ab. Das eigene Intervall der
    -- letzten Planungszeile wandert mit - so bleibt ein bewusst auf zwei
    -- Tage verkuerzter Zyklus (z. B. bei Hitze) fuer die Folgetermine
    -- erhalten, statt beim naechsten Lauf stillschweigend auf drei
    -- zurueckzufallen.
    select r.geplant_fuer, r.intervall_tage
      into v_letzter, v_intervall
      from public.rotationsplan_eintraege r
     where r.reihenblock_id = v_block.id
     order by r.geplant_fuer desc
     limit 1;

    if v_intervall is null then
      v_intervall := 3;
    end if;

    v_naechster := coalesce(v_letzter, v_block.letzte_ernte, p_ab - v_intervall) + v_intervall;
    if v_naechster < p_ab then
      v_naechster := p_ab;
    end if;

    v_angelegt := 0;
    while v_naechster <= v_bis loop
      insert into public.rotationsplan_eintraege (reihenblock_id, geplant_fuer, intervall_tage)
      values (v_block.id, v_naechster, v_intervall)
      on conflict (reihenblock_id, geplant_fuer) do nothing;
      if found then
        v_angelegt := v_angelegt + 1;
      end if;
      v_naechster := v_naechster + v_intervall;
    end loop;

    if v_angelegt > 0 then
      betroffener_block_id := v_block.id;
      neue_termine := v_angelegt;
      return next;
    end if;
  end loop;
end;
$$;

comment on function public.rotationsplan_generieren is
  'Erzeugt Rotationstermine fuer alle aktiven Reihenbloecke fuer die naechsten '
  'p_wochen Wochen. Setzt den Zyklus am zuletzt geplanten bzw. tatsaechlichen '
  'Erntetermin fort - kein Neustart bei jedem Lauf.';

grant execute on function public.rotationsplan_generieren(integer, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Sperrlogik: eine neue Behandlung sperrt betroffene Plantermine
-- ---------------------------------------------------------------------------
-- security definer wie charge_zur_aufgabe_anlegen/aufgabe_fortschreiben: das
-- ist automatische Buchfuehrung als Reaktion auf ein Ereignis, kein direkter
-- Schreibwunsch der aufrufenden Rolle - die Brigade darf keine
-- Rotationsplan-Zeilen schreiben, soll die Sperre aber trotzdem auf dem Plan
-- sehen, sobald die Betriebsleitung eine Behandlung erfasst.
create or replace function public.rotationsplan_sperren()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.rotationsplan_eintraege
     set status = 'gesperrt'
   where reihenblock_id = new.reihenblock_id
     and status = 'geplant'
     and geplant_fuer between new.behandelt_am and new.freigabe_am;
  return new;
end;
$$;

drop trigger if exists trg_rotationsplan_sperren on public.pflanzenschutz_behandlungen;
create trigger trg_rotationsplan_sperren
  after insert on public.pflanzenschutz_behandlungen
  for each row execute function public.rotationsplan_sperren();

-- Freigabe (ueber reihenblock_freigeben() oder jeden direkten Statuswechsel
-- weg von wartezeitgesperrt) gibt die gesperrten Termine wieder frei. Bereits
-- verstrichene Termine erscheinen dem Lesepfad danach als ueberfaellig statt
-- weiter als gesperrt - das ist die ehrlichere Aussage.
create or replace function public.rotationsplan_entsperren()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'wartezeitgesperrt' and new.status <> 'wartezeitgesperrt' then
    update public.rotationsplan_eintraege
       set status = 'geplant'
     where reihenblock_id = new.id
       and status = 'gesperrt';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_rotationsplan_entsperren on public.reihenbloecke;
create trigger trg_rotationsplan_entsperren
  after update of status on public.reihenbloecke
  for each row execute function public.rotationsplan_entsperren();

-- ---------------------------------------------------------------------------
-- 5. Geschlossener Kreis: eine neue Pflueckaufgabe erledigt den Plantermin
-- ---------------------------------------------------------------------------
create or replace function public.rotationsplan_erledigen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eintrag_id uuid;
begin
  select id into v_eintrag_id
    from public.rotationsplan_eintraege
   where reihenblock_id = new.reihenblock_id
     and status = 'geplant'
   order by geplant_fuer
   limit 1;

  if v_eintrag_id is not null then
    update public.rotationsplan_eintraege
       set status = 'erledigt', pflueckaufgabe_id = new.id
     where id = v_eintrag_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_rotationsplan_erledigen on public.pflueckaufgaben;
create trigger trg_rotationsplan_erledigen
  after insert on public.pflueckaufgaben
  for each row execute function public.rotationsplan_erledigen();

-- ---------------------------------------------------------------------------
-- 6. Schreibrechte
-- ---------------------------------------------------------------------------
-- rbac.ts vergibt crud("rotationsplan") an admin/betriebsleitung, view() an
-- brigade - diese Policy spiegelt genau das. Lesen ist bereits ueber die
-- bestehende "intern"-Policy (Migration 20260905160000) fuer alle
-- angemeldeten Rollen offen.
create policy rotationsplan_eintraege_insert_planung on public.rotationsplan_eintraege
  for insert to authenticated
  with check (public.has_role('admin', 'betriebsleitung'));

create policy rotationsplan_eintraege_update_planung on public.rotationsplan_eintraege
  for update to authenticated
  using (public.has_role('admin', 'betriebsleitung'))
  with check (public.has_role('admin', 'betriebsleitung'));
