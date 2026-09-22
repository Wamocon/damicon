-- =============================================================================
-- Damicon - Kennzahlen bekommen ein Gedaechtnis
-- =============================================================================
-- Die Kacheln zeigen seit dem ersten Entwurf einen Trendpfeil. Woher der kam:
-- aus einer Textkonstante in src/lib/domain/kpis.ts, von Hand gepflegt. Ein
-- Pfeil, der nichts misst, ist auf einer Seite, die Entscheidungen
-- beschleunigen soll, schlimmer als kein Pfeil - er behauptet eine Richtung,
-- fuer die es keine Grundlage gibt.
--
-- public.kpi_aktuell() kennt nur das Jetzt. Sie rechnet jedes Mal neu ueber den
-- gesamten Datenbestand und haelt kein Ergebnis fest. Damit laesst sich kein
-- Verlauf bilden, egal wie oft man sie aufruft.
--
-- Diese Migration legt deshalb drei Dinge an:
--   1. public.kpi_verlauf        - ein Messpunkt je Kennzahl und Tag
--   2. public.kpi_verlauf_schreiben() - schreibt den heutigen Stand hinein
--   3. public.kpi_trend          - die Richtung aus den letzten zwei Punkten
--
-- Wichtig an der Sicht: sie liefert eine Kennzahl NUR, wenn es mindestens zwei
-- Messpunkte gibt. Bei einem einzigen Punkt gaebe es keine Richtung, und
-- "gleich geblieben" waere gelogen - verglichen worden ist nichts. Kennzahlen
-- ohne Verlauf bekommen dadurch gar keinen Pfeil statt eines falschen. Das ist
-- dieselbe Haltung wie in kpi_aktuell(), die nicht gerechnete Kennzahlen
-- bewusst gar nicht erst zurueckgibt.
--
-- Zum Zeitplan: ein Scheduler existierte im Projekt bisher nicht, weder
-- vercel.json noch pg_cron. Die Einrichtung unten ist bewusst bedingt. PGlite
-- (npm run db:test:fast) kennt pg_cron nicht, und auf einer frischen Instanz
-- ist die Erweiterung womoeglich noch nicht freigegeben. Fehlt sie, entstehen
-- Tabelle, Funktion und Sicht trotzdem - es laeuft dann nur niemand taeglich
-- dagegen, und der Verlauf bleibt leer. Das ist der ehrlichere Ausgang als
-- eine Migration, die auf halbem Weg abbricht.
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. Der Messpunkt
-- ---------------------------------------------------------------------------
create table if not exists public.kpi_verlauf (
  id          uuid primary key default gen_random_uuid(),
  schluessel  text not null,
  gemessen_am date not null default current_date,
  wert        numeric not null,
  einheit     text,
  basis       text,
  datensaetze integer not null default 0,
  created_at  timestamptz not null default now(),
  -- Ein Punkt je Kennzahl und Tag. Laeuft der Zeitplan zweimal, soll der
  -- zweite Lauf den ersten korrigieren und nicht eine zweite Wahrheit
  -- danebenstellen.
  unique (schluessel, gemessen_am)
);

comment on table public.kpi_verlauf is
  'Taeglicher Messpunkt je Kennzahl, geschrieben aus kpi_aktuell(). Grundlage fuer kpi_trend.';
comment on column public.kpi_verlauf.wert is
  'Der gerechnete Wert am Stichtag. Keine Platzhalter - was kpi_aktuell() nicht liefert, steht hier nicht.';
comment on column public.kpi_verlauf.gemessen_am is
  'Stichtag des Messpunkts, nicht der Schreibzeitpunkt. Ein nachgeholter Lauf traegt den Tag, den er meint.';

create index if not exists kpi_verlauf_schluessel_datum_idx
  on public.kpi_verlauf (schluessel, gemessen_am desc);

alter table public.kpi_verlauf enable row level security;
alter table public.kpi_verlauf force row level security;

-- Lesen: angemeldete Konten. Bewusst nicht anon - anders als kpi_baseline,
-- die den unterschriebenen Ausgangswert traegt, stehen hier gerechnete
-- Betriebszahlen wie Deckungsbeitrag und Verlustquote. Welche Rolle davon
-- welche sieht, entscheidet weiterhin sichtbarFuer in der Anwendung; die
-- Datenbank zieht hier nur die aeussere Grenze.
create policy kpi_verlauf_select_intern on public.kpi_verlauf
  for select to authenticated
  using (true);

-- Schreiben: ausschliesslich service_role. Es gibt keinen Weg, ueber den ein
-- Nutzer einen Messpunkt setzt - ein gesetzter Messpunkt waere eine
-- Behauptung ueber die Vergangenheit.
create policy kpi_verlauf_insert_service on public.kpi_verlauf
  for insert to service_role
  with check (true);

create policy kpi_verlauf_update_service on public.kpi_verlauf
  for update to service_role
  using (true) with check (true);

-- ---------------------------------------------------------------------------
-- 2. Den heutigen Stand festhalten
-- ---------------------------------------------------------------------------
-- security definer, damit der Zeitplan die Zeile schreiben darf, ohne dass
-- pg_cron dafuer eine Anwendungsrolle braucht. Die Funktion nimmt keine
-- Eingabe entgegen: sie schreibt genau das, was kpi_aktuell() gerade liefert.
create or replace function public.kpi_verlauf_schreiben(p_stichtag date default current_date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  geschrieben integer;
begin
  insert into public.kpi_verlauf (schluessel, gemessen_am, wert, einheit, basis, datensaetze)
  select k.schluessel, p_stichtag, k.wert, k.einheit, k.basis, coalesce(k.datensaetze, 0)
    from public.kpi_aktuell() k
   where k.wert is not null
  on conflict (schluessel, gemessen_am) do update
    set wert        = excluded.wert,
        einheit     = excluded.einheit,
        basis       = excluded.basis,
        datensaetze = excluded.datensaetze;

  get diagnostics geschrieben = row_count;
  return geschrieben;
end;
$$;

comment on function public.kpi_verlauf_schreiben is
  'Schreibt den aktuellen Stand aus kpi_aktuell() als Messpunkt. Zweimal am selben Tag korrigiert den Punkt, statt einen zweiten anzulegen.';

revoke all on function public.kpi_verlauf_schreiben(date) from public;
grant execute on function public.kpi_verlauf_schreiben(date) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Die Richtung
-- ---------------------------------------------------------------------------
-- Ob eine Richtung gut oder schlecht ist, entscheidet diese Sicht NICHT. Das
-- haengt an gut_richtung der jeweiligen Kennzahl, und das weiss die Anwendung
-- (eine steigende Verlustquote ist schlecht, eine steigende Liefertreue gut).
-- Hier steht nur, wohin sich die Zahl bewegt hat.
create or replace view public.kpi_trend
with (security_invoker = true) as
with punkte as (
  select schluessel,
         wert,
         gemessen_am,
         row_number() over (partition by schluessel order by gemessen_am desc) as rang
    from public.kpi_verlauf
)
select jetzt.schluessel,
       case
         when jetzt.wert > vorher.wert then 'up'
         when jetzt.wert < vorher.wert then 'down'
         else 'flat'
       end                                as trend,
       jetzt.wert                         as wert_jetzt,
       vorher.wert                        as wert_vorher,
       jetzt.gemessen_am                  as stand,
       vorher.gemessen_am                 as verglichen_mit
  from punkte jetzt
  -- inner join, kein left join: ohne zweiten Punkt gibt es keine Richtung,
  -- und die Kennzahl erscheint hier gar nicht. Die Kachel zeigt dann keinen
  -- Pfeil, statt einen waagerechten zu zeigen, der nichts verglichen hat.
  join punkte vorher
    on vorher.schluessel = jetzt.schluessel
   and vorher.rang = 2
 where jetzt.rang = 1;

comment on view public.kpi_trend is
  'Richtung je Kennzahl aus den letzten zwei Messpunkten. Kennzahlen mit weniger als zwei Punkten fehlen bewusst.';

grant select on public.kpi_trend to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Taeglich schreiben, falls die Instanz das hergibt
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';
    -- 03:10 Uhr UTC: nach Mitternacht in Almaty (UTC+5) ist der Tag dort
    -- schon eine Weile alt, der Messpunkt traegt damit sicher das richtige
    -- Datum, und die Nacht ist die ruhigste Zeit fuer eine Rechnung ueber
    -- den gesamten Bestand.
    perform cron.unschedule('kpi-verlauf-taeglich')
      where exists (select 1 from cron.job where jobname = 'kpi-verlauf-taeglich');
    perform cron.schedule(
      'kpi-verlauf-taeglich',
      '10 3 * * *',
      $cron$select public.kpi_verlauf_schreiben();$cron$
    );
    raise notice 'kpi_verlauf: taeglicher Zeitplan eingerichtet (03:10 UTC).';
  else
    raise notice 'kpi_verlauf: pg_cron nicht verfuegbar - Tabelle, Funktion und Sicht stehen, es schreibt aber niemand automatisch. Auf der gehosteten Instanz die Erweiterung freigeben und diese Migration erneut anwenden.';
  end if;
end;
$$;
