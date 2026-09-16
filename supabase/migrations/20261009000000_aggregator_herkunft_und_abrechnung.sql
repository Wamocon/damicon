-- =============================================================================
-- Damicon - Aggregation: getrennte Herkunftsfuehrung und Abrechnung gegenueber
-- Lieferbetrieben (Masterplan-Anforderungen 6.1 und 6.4)
-- =============================================================================
-- 6.1: Zukauf-Ware traegt strukturell bereits eine eigene Herkunft (chargen
-- aus zukauf_positionen_importieren() haben reihenblock_id = null, siehe
-- Migration 20260908140000) - die OEFFENTLICHE Herkunftsauskunft
-- (herkunftsauskunft(), Migration 20260908150000) hat das aber nie
-- ausgewertet: bei einer Zukauf-Charge kam reihenblock_code einfach leer
-- zurueck, ohne zu sagen, dass es sich um zugekaufte Ware handelt. Genau das
-- verlangt die Anforderung woertlich: "wer fremde Ware unter eigener Marke
-- verkauft, haftet fuer sie" - die Auskunft muss die Herkunft also auch
-- wirklich offenlegen, nicht nur technisch trennen.
--
-- 6.4: Abrechnung gegenueber den liefernden Nachbarbetrieben mit einer
-- Spanne. Nutzer-Entscheidung: eine einzige, global konfigurierbare
-- Prozent-Spanne, keine Klassenabzuege (dafuer fehlt eine
-- Qualitaetsklassifizierung fuer Zukaufware, siehe Anforderung 1.4 im
-- Fundament, selbst noch offen). Spanne startet bei 0 - keine erfundene
-- Marge, das Buero traegt den echten Wert ein.
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. Herkunftsauskunft: Zukauf-Ware offenlegen (Anforderung 6.1)
-- ---------------------------------------------------------------------------
-- Neue Ausgabespalten - CREATE OR REPLACE allein reicht bei einer geaenderten
-- RETURNS TABLE nicht, Postgres verlangt dafuer einen DROP.
drop function if exists public.herkunftsauskunft(text);

create function public.herkunftsauskunft(p_code text)
returns table (
  reihenblock_code        text,
  sorte_name              text,
  ernte_datum             date,
  pflueck_zeitpunkt       timestamptz,
  vorkuehlung_zeitpunkt   timestamptz,
  minuten_bis_vorkuehlung integer,
  kuehlkette_eingehalten  boolean,
  wartezeit_eingehalten   boolean,
  herkunft_typ            text,
  nachbarbetrieb_name     text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_charge record;
begin
  if p_code is null or p_code !~ '^hk_[0-9a-f]{16}$' then
    return;
  end if;

  select c.id, c.ernte_datum, c.pflueck_zeitpunkt, c.vorkuehlung_zeitpunkt,
         r.code as reihenblock_code, s.name as sorte_name,
         nb.name as nachbarbetrieb_name
    into v_charge
    from public.chargen c
    left join public.reihenbloecke r on r.id = c.reihenblock_id
    left join public.sorten s on s.id = c.sorte_id
    left join public.zukauf_positionen zp on zp.charge_id = c.id
    left join public.nachbarbetriebe nb on nb.id = zp.nachbarbetrieb_id
   where c.oeffentlicher_code = p_code;

  if not found then
    return;
  end if;

  reihenblock_code := v_charge.reihenblock_code;
  sorte_name := v_charge.sorte_name;
  ernte_datum := v_charge.ernte_datum;
  pflueck_zeitpunkt := v_charge.pflueck_zeitpunkt;
  vorkuehlung_zeitpunkt := v_charge.vorkuehlung_zeitpunkt;

  minuten_bis_vorkuehlung := case
    when v_charge.pflueck_zeitpunkt is null or v_charge.vorkuehlung_zeitpunkt is null then null
    else greatest(0, (extract(epoch from (v_charge.vorkuehlung_zeitpunkt - v_charge.pflueck_zeitpunkt)) / 60)::integer)
  end;

  kuehlkette_eingehalten := case
    when minuten_bis_vorkuehlung is null then null
    else minuten_bis_vorkuehlung <= 60
  end;

  select coalesce(bool_and(n.eingehalten), true)
    into wartezeit_eingehalten
    from public.rueckstandsnachweis(v_charge.id) n;

  -- Anforderung 6.1: Herkunftstyp offenlegen statt nur stillschweigend ein
  -- leeres reihenblock_code zu zeigen. nachbarbetrieb_name ist bereits ueber
  -- den Join oben ermittelt, wenn die Charge aus einem Zukauf stammt.
  herkunft_typ := case
    when v_charge.nachbarbetrieb_name is not null then 'zukauf'
    else 'eigene_ernte'
  end;
  nachbarbetrieb_name := v_charge.nachbarbetrieb_name;

  return next;
end;
$$;

comment on function public.herkunftsauskunft(text) is
  'Oeffentliche Herkunftsauskunft zu genau einer Charge, adressiert ueber oeffentlicher_code. Keine Chargen-ID, kein Pfluecker- oder Mengenbezug, kein Preis. Weist seit Anforderung 6.1 zugekaufte Ware explizit als solche aus (herkunft_typ, nachbarbetrieb_name).';

revoke all on function public.herkunftsauskunft(text) from public;
grant execute on function public.herkunftsauskunft(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Abrechnung gegenueber Lieferbetrieben mit Spanne (Anforderung 6.4)
-- ---------------------------------------------------------------------------
create table public.aggregator_einstellungen (
  id             uuid primary key default gen_random_uuid(),
  spanne_prozent numeric(5,2) not null default 0,
  updated_at     timestamptz not null default now()
);
comment on table public.aggregator_einstellungen is
  'Anforderung 6.4: einzige, global konfigurierbare Spanne fuer die Abrechnung gegenueber Lieferbetrieben. Genau eine Zeile. Start bei 0 - keine erfundene Marge, siehe Migrationskopf.';

create trigger trg_aggregator_einstellungen_updated before update on public.aggregator_einstellungen
  for each row execute function public.set_updated_at();

alter table public.aggregator_einstellungen enable row level security;
alter table public.aggregator_einstellungen force row level security;

create policy aggregator_einstellungen_select_buero on public.aggregator_einstellungen
  for select to authenticated
  using (public.has_role('admin', 'betriebsleitung', 'buchhaltung'));

create policy aggregator_einstellungen_update_leitung on public.aggregator_einstellungen
  for update to authenticated
  using (public.has_role('admin', 'betriebsleitung'))
  with check (public.has_role('admin', 'betriebsleitung'));

insert into public.aggregator_einstellungen (spanne_prozent)
select 0
where not exists (select 1 from public.aggregator_einstellungen);

-- Abrechnungssumme je Nachbarbetrieb. Eigene SECURITY-DEFINER-Funktion statt
-- einer View: zukauf_positionen/nachbarbetriebe tragen bislang nur die
-- breite "jede angemeldete Rolle liest"-Politik aus der ersten Haertung
-- (20260905160000) - eine View mit security_invoker waere genauso breit
-- lesbar, eine Abrechnungssumme gehoert aber ausschliesslich dem Buero. Der
-- Rollen-Check steht deshalb in der Funktion selbst, derselbe Aufbau wie bei
-- lohn_periode_berechnen().
create or replace function public.abrechnung_je_nachbarbetrieb()
returns table (
  nachbarbetrieb_id   uuid,
  nachbarbetrieb_name text,
  menge_kg_gesamt     numeric,
  einkaufswert_tenge  numeric,
  spanne_prozent      numeric,
  auszahlung_tenge    numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_role('admin', 'betriebsleitung', 'buchhaltung') then
    raise exception 'keine-berechtigung' using errcode = '42501';
  end if;

  return query
  select
    n.id,
    n.name,
    sum(z.menge_kg),
    sum(z.menge_kg * z.preis_tenge_kg),
    coalesce(e.spanne_prozent, 0),
    round(sum(z.menge_kg * z.preis_tenge_kg) * (1 - coalesce(e.spanne_prozent, 0) / 100), 2)
  from public.nachbarbetriebe n
  join public.zukauf_positionen z
    on z.nachbarbetrieb_id = n.id and z.preis_tenge_kg is not null
  left join public.aggregator_einstellungen e on true
  group by n.id, n.name, e.spanne_prozent
  order by n.name;
end;
$$;

comment on function public.abrechnung_je_nachbarbetrieb is
  'Anforderung 6.4: Auszahlungssumme je Lieferbetrieb (Einkaufswert abzueglich der global konfigurierten Spanne), nur fuer Buero/Buchhaltung/Admin - Rollenpruefung in der Funktion selbst, da die zugrundeliegenden Tabellen breiter lesbar sind.';

revoke all on function public.abrechnung_je_nachbarbetrieb() from public;
grant execute on function public.abrechnung_je_nachbarbetrieb() to authenticated;
