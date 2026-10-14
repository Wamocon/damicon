-- =============================================================================
-- Damicon - Meldeprozess fuer das Einheitssystem ЕСУТД, Stufe 1 (WMCNL-1447)
-- =============================================================================
-- Abschluss, Aenderung und Beendigung jedes Saisonvertrags gehoeren in das staatliche
-- Einheitssystem ЕСУТД. Bisher kannte Damicon nur den Abschluss (esutd_vertraege mit Beginn
-- und berechneter Meldefrist) und keine Oberflaeche, um ihn zu erfassen oder als erledigt zu
-- markieren. Eine Anbindung an das System (Stufe 2) braucht den Zugang der Behoerde. Stufe 1
-- fuehrt den Meldeprozess im Betrieb: was ist zu melden, was ist gemeldet, womit belegt.
--
-- Entscheidungen:
--   * esutd_vertraege bleibt die Abschluss-Meldung (Fristberechnung, Risiko-Radar und
--     Personal-Ansicht haengen daran). Neu sind Bestaetigung und Beleg an dieser Zeile und die
--     Tabelle esutd_ereignisse fuer Aenderung und Beendigung eines Vertrags.
--   * Fuer Aenderung und Beendigung ist keine Frist hinterlegt: die Meldefrist des Abschlusses
--     (5 Werktage ab Vertragsbeginn) steht seit 20261025000000 im System, fuer die anderen Faelle
--     ist keine belegt, und eine erfundene Frist waere schlimmer als keine.
--   * Erledigt heisst: Meldedatum (nicht in der Zukunft), optional die Bestaetigungsnummer des
--     Systems und ein Beleg aus dem Nachweisregister (dokumente, Kategorie ЕСУТД-Nachweis). Der
--     Beleg wird verlinkt, nicht neu hochgeladen: eine Ablage, ein Ort.
--   * Wird eine Meldung wieder geoeffnet (Korrektur), leert die Datenbank Meldedatum,
--     Bestaetigung und Beleg. Offene Meldungen tragen nie die Angaben einer erledigten.
--   * pfluecker.esutd ist der Status, den die Personal-Ansicht zeigt. Er folgt jetzt den
--     Meldungen: "offen", solange mindestens eine Meldung der Person offen ist, sonst
--     "erfasst". Ohne Meldung bleibt er, wie er ist. Die Fortschreibung laeuft als Trigger mit
--     den Rechten des Eigentuemers, damit auch die Geschaeftsfuehrung sie ausloesen kann.
--   * Schreiben duerfen admin, ceo und betriebsleitung (rbac: personal:update). Die beiden
--     bestehenden Policies von esutd_vertraege kannten die Geschaeftsfuehrung nicht und
--     werden dafuer ersetzt. Geloescht wird nur, was noch offen ist.
--   * Die Sicht v_esutd_meldungen legt Abschluss, Aenderung und Beendigung in eine Liste.
--     Wer pfluecker nicht lesen darf (ceo, heute), sieht die Meldung ohne Namen.
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. Abschluss: Bestaetigung und Beleg
-- ---------------------------------------------------------------------------
alter table public.esutd_vertraege
  add column if not exists bestaetigung text,
  add column if not exists beleg_dokument_id uuid references public.dokumente(id) on delete set null;

alter table public.esutd_vertraege
  drop constraint if exists esutd_vertraege_bestaetigung_laenge;
alter table public.esutd_vertraege
  add constraint esutd_vertraege_bestaetigung_laenge
  check (bestaetigung is null or char_length(btrim(bestaetigung)) between 1 and 100);

comment on column public.esutd_vertraege.bestaetigung is
  'Bestaetigungsnummer des staatlichen Systems, von Hand uebernommen (optional).';
comment on column public.esutd_vertraege.beleg_dokument_id is
  'Beleg der Meldung aus dem Nachweisregister (dokumente, Kategorie ESUTD-Nachweis).';

-- ---------------------------------------------------------------------------
-- 2. Aenderung und Beendigung
-- ---------------------------------------------------------------------------
create table if not exists public.esutd_ereignisse (
  id                 uuid primary key default gen_random_uuid(),
  vertrag_id         uuid not null references public.esutd_vertraege(id) on delete cascade,
  art                text not null check (art in ('aenderung', 'beendigung')),
  -- Aenderung: ab wann sie gilt. Beendigung: das Ende des Vertrags.
  ereignis_am        date not null,
  beschreibung       text check (beschreibung is null or char_length(btrim(beschreibung)) between 3 and 300),
  status             text not null default 'offen' check (status in ('offen', 'erfasst')),
  erfasst_am         date,
  bestaetigung       text check (bestaetigung is null or char_length(btrim(bestaetigung)) between 1 and 100),
  beleg_dokument_id  uuid references public.dokumente(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- Eine Aenderung sagt, was sich aendert; bei einer Beendigung ist der Grund freiwillig.
  constraint esutd_ereignisse_aenderung_beschreibt check (art <> 'aenderung' or beschreibung is not null)
);

comment on table public.esutd_ereignisse is
  'Aenderungen und Beendigungen eines Saisonvertrags, die ins ЕСУТД gemeldet werden muessen (WMCNL-1447). Der Abschluss steht in esutd_vertraege.';

create index if not exists idx_esutd_ereignisse_vertrag on public.esutd_ereignisse (vertrag_id);
create index if not exists idx_esutd_ereignisse_status on public.esutd_ereignisse (status);

-- ---------------------------------------------------------------------------
-- 3. Erledigt heisst: Meldedatum. Offen heisst: ohne die Angaben einer erledigten.
-- ---------------------------------------------------------------------------
create or replace function public.esutd_meldung_pruefen()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'offen' then
    new.erfasst_am := null;
    new.bestaetigung := null;
    new.beleg_dokument_id := null;
  elsif tg_op = 'INSERT' or old.status is distinct from 'erfasst' then
    -- Nur beim Wechsel nach "erfasst": bestehende erfasste Zeilen aus der Zeit vor diesem
    -- Meldeprozess tragen manchmal kein Datum und bleiben unberuehrt.
    if new.erfasst_am is null then
      raise exception 'Eine erfasste Meldung braucht das Datum der Meldung.' using errcode = '23514';
    end if;
    if new.erfasst_am > public.heute_almaty() then
      raise exception 'Das Meldedatum liegt in der Zukunft.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_esutd_vertrag_pruefen on public.esutd_vertraege;
create trigger trg_esutd_vertrag_pruefen
  before insert or update on public.esutd_vertraege
  for each row execute function public.esutd_meldung_pruefen();

drop trigger if exists trg_esutd_ereignis_updated on public.esutd_ereignisse;
create trigger trg_esutd_ereignis_updated
  before update on public.esutd_ereignisse
  for each row execute function public.set_updated_at();

drop trigger if exists trg_esutd_ereignis_pruefen on public.esutd_ereignisse;
create trigger trg_esutd_ereignis_pruefen
  before insert or update on public.esutd_ereignisse
  for each row execute function public.esutd_meldung_pruefen();

-- ---------------------------------------------------------------------------
-- 4. pfluecker.esutd folgt den Meldungen
-- ---------------------------------------------------------------------------
create or replace function public.esutd_status_abgleichen(p_pfluecker uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_pfluecker is null or not exists (select 1 from public.esutd_vertraege where pfluecker_id = p_pfluecker) then
    return;
  end if;
  update public.pfluecker
     set esutd = case
       when exists (select 1 from public.esutd_vertraege v where v.pfluecker_id = p_pfluecker and v.status = 'offen')
         or exists (
           select 1 from public.esutd_ereignisse e join public.esutd_vertraege v on v.id = e.vertrag_id
            where v.pfluecker_id = p_pfluecker and e.status = 'offen'
         )
       then 'offen'::public.esutd_status
       else 'erfasst'::public.esutd_status
     end
   where id = p_pfluecker;
end;
$$;

create or replace function public.esutd_vertrag_nachziehen()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.esutd_status_abgleichen(old.pfluecker_id);
    return old;
  end if;
  perform public.esutd_status_abgleichen(new.pfluecker_id);
  return new;
end;
$$;

create or replace function public.esutd_ereignis_nachziehen()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_pfluecker uuid;
begin
  select pfluecker_id into v_pfluecker from public.esutd_vertraege where id = case when tg_op = 'DELETE' then old.vertrag_id else new.vertrag_id end;
  perform public.esutd_status_abgleichen(v_pfluecker);
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_esutd_vertrag_nachziehen on public.esutd_vertraege;
create trigger trg_esutd_vertrag_nachziehen
  after insert or update of status, pfluecker_id or delete on public.esutd_vertraege
  for each row execute function public.esutd_vertrag_nachziehen();

drop trigger if exists trg_esutd_ereignis_nachziehen on public.esutd_ereignisse;
create trigger trg_esutd_ereignis_nachziehen
  after insert or update of status or delete on public.esutd_ereignisse
  for each row execute function public.esutd_ereignis_nachziehen();

-- ---------------------------------------------------------------------------
-- 5. Zeilensicherheit
-- ---------------------------------------------------------------------------
drop policy if exists esutd_vertraege_insert_leitung on public.esutd_vertraege;
drop policy if exists esutd_vertraege_update_leitung on public.esutd_vertraege;
create policy esutd_vertraege_insert_leitung on public.esutd_vertraege
  for insert to authenticated with check (public.has_role('admin', 'ceo', 'betriebsleitung'));
create policy esutd_vertraege_update_leitung on public.esutd_vertraege
  for update to authenticated
  using (public.has_role('admin', 'ceo', 'betriebsleitung'))
  with check (public.has_role('admin', 'ceo', 'betriebsleitung'));
create policy esutd_vertraege_delete_offen on public.esutd_vertraege
  for delete to authenticated using (status = 'offen' and public.has_role('admin', 'ceo', 'betriebsleitung'));

alter table public.esutd_ereignisse enable row level security;
alter table public.esutd_ereignisse force row level security;

create policy esutd_ereignisse_select_buero on public.esutd_ereignisse
  for select to authenticated using (public.has_office_access());
create policy esutd_ereignisse_insert_leitung on public.esutd_ereignisse
  for insert to authenticated with check (public.has_role('admin', 'ceo', 'betriebsleitung'));
create policy esutd_ereignisse_update_leitung on public.esutd_ereignisse
  for update to authenticated
  using (public.has_role('admin', 'ceo', 'betriebsleitung'))
  with check (public.has_role('admin', 'ceo', 'betriebsleitung'));
create policy esutd_ereignisse_delete_offen on public.esutd_ereignisse
  for delete to authenticated using (status = 'offen' and public.has_role('admin', 'ceo', 'betriebsleitung'));

revoke all on public.esutd_ereignisse from public;
revoke all on public.esutd_ereignisse from anon;
revoke all on public.esutd_ereignisse from authenticated;
grant select, insert, update, delete on public.esutd_ereignisse to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Eine Liste aus Abschluss, Aenderung und Beendigung
-- ---------------------------------------------------------------------------
-- security invoker: die Zeilensicherheit der Tabellen gilt durch die Sicht hindurch. Die
-- Meldefrist kommt aus esutd_vertraege_mit_frist (die einzige Stelle der Regel). Dass diese
-- Sicht mit "e.*" gebaut wurde und deshalb die neuen Spalten nicht kennt, ist hier unerheblich:
-- gelesen werden nur Fristspalte und Schluessel, der Rest kommt aus der Tabelle.
create or replace view public.v_esutd_meldungen
with (security_invoker = true) as
select
  'vertrag'::text                                   as quelle,
  v.id,
  v.pfluecker_id,
  p.name                                            as pfluecker_name,
  p.ausweis                                         as pfluecker_ausweis,
  'abschluss'::text                                 as art,
  v.vertrag_beginn_am                               as ereignis_am,
  null::text                                        as beschreibung,
  v.vertragsnummer,
  v.status::text                                    as status,
  v.erfasst_am,
  v.bestaetigung,
  v.beleg_dokument_id,
  f.meldefrist_am,
  v.created_at
from public.esutd_vertraege v
join public.esutd_vertraege_mit_frist f on f.id = v.id
left join public.pfluecker p on p.id = v.pfluecker_id
union all
select
  'ereignis'::text,
  e.id,
  v.pfluecker_id,
  p.name,
  p.ausweis,
  e.art,
  e.ereignis_am,
  e.beschreibung,
  v.vertragsnummer,
  e.status,
  e.erfasst_am,
  e.bestaetigung,
  e.beleg_dokument_id,
  null::date,
  e.created_at
from public.esutd_ereignisse e
join public.esutd_vertraege v on v.id = e.vertrag_id
left join public.pfluecker p on p.id = v.pfluecker_id;

comment on view public.v_esutd_meldungen is
  'Abschluss, Aenderung und Beendigung der Saisonvertraege als eine Liste (WMCNL-1447). Die Meldefrist gibt es nur fuer den offenen Abschluss.';

revoke all on public.v_esutd_meldungen from public;
revoke all on public.v_esutd_meldungen from anon;
grant select on public.v_esutd_meldungen to authenticated;
