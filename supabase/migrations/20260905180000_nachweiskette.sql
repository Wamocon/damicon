-- =============================================================================
-- Damicon - Meilenstein C: die Nachweiskette schliessen
-- =============================================================================
-- Befund aus der Pruefung zu Meilenstein B: die Kette traegt sieben Stufen weit
-- und reisst dann. Jede ueber die Oberflaeche angelegte Pflueckaufgabe hatte
-- keine Charge - damit haengen Kuehlkurve, Lieferung und Rueckstandsnachweis an
-- einem Glied, das im laufenden Betrieb nie entstand.
--
-- Diese Migration schliesst die Kette:
--   1. Jede Pflueckaufgabe erzeugt ihre Charge - im Trigger, nicht im UI.
--   2. Die Steige traegt die Person. Damit reicht die Kette bis zum Pfluecker.
--   3. Arbeitszeit je Pfluecker und Aufgabe - Grundlage fuer kg/h und Lohn.
--   4. Der Ist-Erntetermin wird fortgeschrieben, sonst misst der Rotationsplan
--      nichts.
--   5. Die 60-Minuten-Regel der Kuehlkette rechnet und urteilt in der Datenbank.
--   6. Rueckstandsnachweis je Charge statt nur je Reihenblock.
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. Charge: Mengen, Ausschuss und die Rueckbindung an die Pflueckaufgabe
-- ---------------------------------------------------------------------------
alter table public.chargen
  add column if not exists pflueckaufgabe_id uuid
    references public.pflueckaufgaben(id) on delete set null,
  add column if not exists menge_kg numeric(10,2) not null default 0,
  add column if not exists ausschuss_kg numeric(10,2) not null default 0;

comment on column public.chargen.menge_kg is
  'Vermarktungsfaehige Erntemenge. Nenner fuer Verlustquote und Deckungsbeitrag je kg.';
comment on column public.chargen.ausschuss_kg is
  'Aussortierte Menge. Zaehler der Verlustquote.';

create unique index if not exists idx_chargen_aufgabe
  on public.chargen(pflueckaufgabe_id)
  where pflueckaufgabe_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Die Steige traegt die Person
-- ---------------------------------------------------------------------------
alter table public.steigen
  add column if not exists pfluecker_id uuid
    references public.pfluecker(id) on delete set null;

comment on column public.steigen.pfluecker_id is
  'Wer diese Steige gefuellt hat. Ohne diese Spalte endet die Nachweiskette bei der Brigade.';

create index if not exists idx_steigen_pfluecker on public.steigen(pfluecker_id);
create index if not exists idx_steigen_charge on public.steigen(charge_id);
create index if not exists idx_steigen_aufgabe on public.steigen(pflueckaufgabe_id);

-- ---------------------------------------------------------------------------
-- 3. Arbeitszeit je Pfluecker und Aufgabe
-- ---------------------------------------------------------------------------
-- Ohne Arbeitszeit ist "Pflueckleistung je Person und Stunde" strukturell nicht
-- messbar - und damit auch die Mengenkomponente des Lohnmodells nicht.
create table if not exists public.arbeitszeiten (
  id                uuid primary key default gen_random_uuid(),
  pfluecker_id      uuid not null references public.pfluecker(id) on delete cascade,
  pflueckaufgabe_id uuid references public.pflueckaufgaben(id) on delete set null,
  beginn            timestamptz not null,
  ende              timestamptz,
  minuten           integer generated always as (
                      case when ende is null then null
                           else greatest(0, (extract(epoch from (ende - beginn)) / 60)::integer)
                      end
                    ) stored,
  created_at        timestamptz not null default now(),
  constraint arbeitszeit_reihenfolge check (ende is null or ende >= beginn)
);
comment on table public.arbeitszeiten is
  'Arbeitszeit je Pfluecker und Pflueckaufgabe. Nenner der Pflueckleistung in kg/h.';
create index if not exists idx_arbeitszeiten_pfluecker on public.arbeitszeiten(pfluecker_id);
create index if not exists idx_arbeitszeiten_aufgabe on public.arbeitszeiten(pflueckaufgabe_id);

alter table public.arbeitszeiten enable row level security;
alter table public.arbeitszeiten force row level security;

create policy arbeitszeiten_select_intern on public.arbeitszeiten
  for select to authenticated
  using (public.has_role('admin', 'betriebsleitung', 'buchhaltung', 'brigade'));

create policy arbeitszeiten_insert_feld on public.arbeitszeiten
  for insert to authenticated
  with check (public.has_role('admin', 'betriebsleitung', 'brigade'));

create policy arbeitszeiten_update_feld on public.arbeitszeiten
  for update to authenticated
  using (public.has_role('admin', 'betriebsleitung', 'brigade'))
  with check (public.has_role('admin', 'betriebsleitung', 'brigade'));

-- ---------------------------------------------------------------------------
-- 4. Jede Pflueckaufgabe erzeugt ihre Charge
-- ---------------------------------------------------------------------------
-- Im Trigger, nicht in der Anwendung: eine Aufgabe ohne Charge darf es gar
-- nicht geben koennen, egal wer sie anlegt.
create or replace function public.charge_zur_aufgabe_anlegen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_block record;
begin
  -- Wurde die Charge ausdruecklich mitgegeben (Seed, Datenuebernahme), bleibt
  -- sie stehen. Der Trigger fuellt nur die Luecke.
  if new.charge_id is not null then
    return new;
  end if;

  select r.id, r.code, r.sorte_id
    into v_block
    from public.reihenbloecke r
   where r.id = new.reihenblock_id;

  -- Der Code traegt zusaetzlich die ersten Stellen der Aufgaben-Kennung. Ohne
  -- sie kollidieren zwei Aufgaben auf demselben Block in derselben Minute, und
  -- "on conflict do nothing" liesse die zweite Aufgabe still ohne Charge
  -- zurueck - genau der Bruch, den diese Migration beseitigen soll.
  insert into public.chargen (
    code, reihenblock_id, sorte_id, pflueckaufgabe_id, ernte_datum, status
  ) values (
    'CH-' || v_block.code || '-'
      || to_char(coalesce(new.faelligkeit, now()), 'YYMMDDHH24MI')
      || '-' || upper(substr(replace(new.id::text, '-', ''), 1, 4)),
    new.reihenblock_id,
    coalesce(new.sorte_id, v_block.sorte_id),
    new.id,
    coalesce(new.faelligkeit::date, current_date),
    'offen'
  );

  return new;
end;
$$;

drop trigger if exists trg_charge_zur_aufgabe on public.pflueckaufgaben;
create trigger trg_charge_zur_aufgabe
  after insert on public.pflueckaufgaben
  for each row execute function public.charge_zur_aufgabe_anlegen();

-- ---------------------------------------------------------------------------
-- 5. Fortschreibung: Pflueckzeitpunkt, Menge, letzte Ernte
-- ---------------------------------------------------------------------------
-- Der Pflueckzeitpunkt ist der Start der Kuehlkettenuhr. Er entsteht, wenn die
-- Brigade die Arbeit aufnimmt - nicht, wenn jemand im Buero etwas eintraegt.
create or replace function public.aufgabe_fortschreiben()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Arbeitsbeginn startet die Uhr der zugehoerigen Charge.
  if new.status = 'in_arbeit' and old.status <> 'in_arbeit' then
    update public.chargen
       set pflueck_zeitpunkt = coalesce(pflueck_zeitpunkt, now())
     where pflueckaufgabe_id = new.id;
  end if;

  -- Gemeldete Menge wandert in die Charge.
  if new.ist_menge_kg is distinct from old.ist_menge_kg then
    update public.chargen
       set menge_kg = new.ist_menge_kg
     where pflueckaufgabe_id = new.id;
  end if;

  -- Abschluss schreibt den Ist-Erntetermin am Reihenblock fort. Ohne ihn misst
  -- der Rotationsplan nichts und das eingehaltene Pflueckintervall bleibt leer.
  -- Massgeblich ist das Erntedatum der Charge, nicht der Tag der Eingabe - eine
  -- nachgetragene Ernte darf den Termin nicht verfaelschen. Zurueckdatieren
  -- kann der Abschluss den Termin nie.
  if new.status = 'abgeschlossen' and old.status <> 'abgeschlossen' then
    update public.reihenbloecke r
       set letzte_ernte = greatest(
             coalesce(r.letzte_ernte, '-infinity'::date),
             coalesce(
               (select c.ernte_datum from public.chargen c
                 where c.pflueckaufgabe_id = new.id),
               current_date
             )
           )
     where r.id = new.reihenblock_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_aufgabe_fortschreiben on public.pflueckaufgaben;
create trigger trg_aufgabe_fortschreiben
  after update on public.pflueckaufgaben
  for each row execute function public.aufgabe_fortschreiben();

-- ---------------------------------------------------------------------------
-- 6. Die 60-Minuten-Regel rechnet in der Datenbank
-- ---------------------------------------------------------------------------
-- Analyse Kapitel 4: "Wird diese Grenze gerissen, ist jede weitere Massnahme
-- wirkungslos." Also darf das Urteil nicht von der Eingabe abhaengen.
create or replace function public.kuehlkette_bewerten()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pflueck timestamptz;
begin
  select pflueck_zeitpunkt into v_pflueck
    from public.chargen where id = new.charge_id;

  if v_pflueck is not null then
    new.minuten_seit_pfluecken :=
      greatest(0, (extract(epoch from (new.gemessen_am - v_pflueck)) / 60)::integer);
  end if;

  -- Zieltemperatur 0 bis 1 Grad, harte Grenze 60 Minuten.
  new.ergebnis := case
    when new.minuten_seit_pfluecken is null then 'ok'
    when new.minuten_seit_pfluecken > 60 then 'verstoss'
    when new.minuten_seit_pfluecken > 45 or new.temperatur_c > 4 then 'warnung'
    else 'ok'
  end;

  -- Die erste Messung unter 4 Grad gilt als erreichte Vorkuehlung.
  if new.temperatur_c <= 4 then
    update public.chargen
       set vorkuehlung_zeitpunkt = coalesce(vorkuehlung_zeitpunkt, new.gemessen_am),
           status = case when status = 'offen' then 'gekuehlt' else status end
     where id = new.charge_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_kuehlkette_bewerten on public.kuehlketten_messungen;
create trigger trg_kuehlkette_bewerten
  before insert on public.kuehlketten_messungen
  for each row execute function public.kuehlkette_bewerten();

create policy kuehlketten_messungen_insert_hof on public.kuehlketten_messungen
  for insert to authenticated
  with check (public.has_role('admin', 'betriebsleitung', 'brigade'));

create policy steigen_insert_feld on public.steigen
  for insert to authenticated
  with check (public.has_role('admin', 'betriebsleitung', 'brigade'));

create policy steigen_update_feld on public.steigen
  for update to authenticated
  using (public.has_role('admin', 'betriebsleitung', 'brigade'))
  with check (public.has_role('admin', 'betriebsleitung', 'brigade'));

-- ---------------------------------------------------------------------------
-- 7. Rueckstandsnachweis je Charge
-- ---------------------------------------------------------------------------
-- Bisher liess sich der Nachweis nur ueber Reihenblock plus Datumsvergleich von
-- Hand rekonstruieren. Diese Funktion beantwortet die Frage, die Handel und
-- Behoerde stellen: welche Behandlungen betreffen diese Lieferung?
create or replace function public.rueckstandsnachweis(p_charge uuid)
returns table (
  mittel          text,
  wirkstoff       text,
  behandelt_am    date,
  wartezeit_tage  integer,
  freigabe_am     date,
  tage_vor_ernte  integer,
  eingehalten     boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  select m.name,
         m.wirkstoff,
         b.behandelt_am,
         b.wartezeit_tage,
         b.freigabe_am,
         (c.ernte_datum - b.behandelt_am)::integer,
         (b.freigabe_am <= c.ernte_datum)
    from public.chargen c
    join public.pflanzenschutz_behandlungen b on b.reihenblock_id = c.reihenblock_id
    join public.psm_mittel m on m.id = b.psm_mittel_id
   where c.id = p_charge
     and b.behandelt_am <= c.ernte_datum
     and b.behandelt_am >= c.ernte_datum - 90
   order by b.behandelt_am desc;
$$;
comment on function public.rueckstandsnachweis is
  'Alle Behandlungen der letzten 90 Tage vor dem Erntedatum einer Charge, mit Angabe, ob die Wartezeit eingehalten war.';

grant execute on function public.rueckstandsnachweis(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Fehlende Indizes auf Fremdschluesseln
-- ---------------------------------------------------------------------------
-- Bei zwoelf Beispielzeilen egal, ab der ersten echten Saison nicht mehr:
-- jedes on-delete und jeder Join laeuft sonst als Full Scan.
create index if not exists idx_dokumente_block on public.dokumente(reihenblock_id);
create index if not exists idx_dokumente_charge on public.dokumente(charge_id);
create index if not exists idx_chargen_sorte on public.chargen(sorte_id);
create index if not exists idx_lieferungen_charge on public.lieferungen(charge_id);
create index if not exists idx_lieferungen_kunde on public.lieferungen(b2b_kunde_id);
create index if not exists idx_ledger_charge on public.finance_ledger_entries(charge_id);
create index if not exists idx_lohn_positionen_aufgabe on public.lohn_positionen(pflueckaufgabe_id);
create index if not exists idx_esutd_pfluecker on public.esutd_vertraege(pfluecker_id);
create index if not exists idx_profiles_brigade on public.profiles(brigade_id);
create index if not exists idx_behandlungen_dokument on public.pflanzenschutz_behandlungen(dokument_id);
create index if not exists idx_pflueckaufgaben_charge on public.pflueckaufgaben(charge_id);
create index if not exists idx_pflueckaufgaben_brigade on public.pflueckaufgaben(brigade_id);
