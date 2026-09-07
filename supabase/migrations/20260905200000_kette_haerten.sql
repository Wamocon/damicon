-- =============================================================================
-- Damicon - Abnahmepruefung von Meilenstein C: 19 bestaetigte Befunde
-- =============================================================================
-- Eine adversarische Pruefung vor dem Kundentermin hat 19 Befunde bestaetigt,
-- vier davon kritisch. Diese Migration schliesst die, die sich als Regel in
-- der Datenbank ausdruecken lassen. Ergaenzend siehe die Anwendungsaenderungen
-- fuer die Erfassung von Ausschuss.
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. KRITISCH: Die Brigade konnte Chargen direkt beschreiben
-- ---------------------------------------------------------------------------
-- chargen_update_feld erlaubte admin/betriebsleitung/brigade schreibend auf
-- ALLE Spalten - auch pflueck_zeitpunkt, vorkuehlung_zeitpunkt und
-- ausschuss_kg, also genau die Felder, an denen die 60-Minuten-Regel und die
-- Verlustquote gemessen werden. Kein App-Code nutzt diesen Weg (alle
-- Chargen-Felder werden ueber die SECURITY-DEFINER-Trigger auf
-- pflueckaufgaben, steigen und kuehlketten_messungen gepflegt) - die Policy
-- war ausschliesslich ein Einfallstor.
drop policy if exists chargen_update_feld on public.chargen;
create policy chargen_update_leitung on public.chargen
  for update to authenticated
  using (public.has_role('admin', 'betriebsleitung'))
  with check (public.has_role('admin', 'betriebsleitung'));

-- ---------------------------------------------------------------------------
-- 2. KRITISCH: Menge einer abgeschlossenen Aufgabe war nach Freigabe aenderbar
-- ---------------------------------------------------------------------------
-- pflueckaufgabe_freigabe_pruefen schuetzte Status und Qualitaetsfaktor, nicht
-- aber die Menge. Der Trigger aufgabe_fortschreiben schreibt jede
-- Mengenaenderung ungeprueft in die Charge fort - eine Brigade konnte die
-- eigene, bereits abgenommene Ernte nachtraeglich veraendern.
create or replace function public.pflueckaufgabe_freigabe_pruefen()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'abgeschlossen' and old.status <> 'abgeschlossen'
     and not public.has_role('admin', 'betriebsleitung') then
    raise exception 'Nur die Betriebsleitung schliesst eine Pflueckaufgabe ab.'
      using errcode = 'insufficient_privilege';
  end if;

  if new.qualitaetsfaktor is distinct from old.qualitaetsfaktor
     and not public.has_role('admin', 'betriebsleitung') then
    raise exception 'Der Qualitaetsfaktor wird von der Betriebsleitung gesetzt.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Nach der Freigabe sind Mengen und Ausschuss ein abgenommener Wert - eine
  -- Korrektur ist danach nur noch der Leitung vorbehalten.
  if old.status = 'abgeschlossen'
     and (new.ist_menge_kg is distinct from old.ist_menge_kg
          or new.ausschuss_kg is distinct from old.ausschuss_kg)
     and not public.has_role('admin', 'betriebsleitung') then
    raise exception 'Menge und Ausschuss einer abgeschlossenen Aufgabe aendert nur die Betriebsleitung.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Eine abgeschlossene Aufgabe bleibt abgeschlossen.
  if old.status = 'abgeschlossen' and new.status <> 'abgeschlossen' then
    raise exception 'Eine abgeschlossene Pflueckaufgabe laesst sich nicht zurueckdrehen.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Ausschuss bekommt einen Erfassungsweg (schliesst zugleich die
--    Verlustquote an echte Daten an, statt sie gegen 0 laufen zu lassen)
-- ---------------------------------------------------------------------------
alter table public.pflueckaufgaben
  add column if not exists ausschuss_kg numeric(8,2) not null default 0;

comment on column public.pflueckaufgaben.ausschuss_kg is
  'Aussortierte Menge dieser Aufgabe. Wandert beim Melden in chargen.ausschuss_kg - Zaehler der Verlustquote.';

create or replace function public.aufgabe_fortschreiben()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'in_arbeit' and old.status <> 'in_arbeit' then
    update public.chargen
       set pflueck_zeitpunkt = coalesce(pflueck_zeitpunkt, now())
     where pflueckaufgabe_id = new.id;
  end if;

  if new.ist_menge_kg is distinct from old.ist_menge_kg
     or new.ausschuss_kg is distinct from old.ausschuss_kg then
    update public.chargen
       set menge_kg = new.ist_menge_kg,
           ausschuss_kg = new.ausschuss_kg
     where pflueckaufgabe_id = new.id;
  end if;

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

-- ---------------------------------------------------------------------------
-- 4. HOCH: Arbeitszeiten waren fuer jede Brigade-Anmeldung frei fuer jede
--    Person schreibbar, ohne Bezug zur eigenen Brigade
-- ---------------------------------------------------------------------------
drop policy if exists arbeitszeiten_insert_feld on public.arbeitszeiten;
drop policy if exists arbeitszeiten_update_feld on public.arbeitszeiten;

create policy arbeitszeiten_insert_feld on public.arbeitszeiten
  for insert to authenticated
  with check (
    public.has_role('admin', 'betriebsleitung')
    or (
      public.has_role('brigade')
      and exists (
        select 1 from public.pfluecker p
          join public.profiles me on me.brigade_id = p.brigade_id
         where p.id = arbeitszeiten.pfluecker_id
           and me.auth_user_id = auth.uid()
      )
    )
  );

create policy arbeitszeiten_update_feld on public.arbeitszeiten
  for update to authenticated
  using (
    public.has_role('admin', 'betriebsleitung')
    or (
      public.has_role('brigade')
      and ende is null -- eine bereits abgeschlossene Zeit korrigiert nur die Leitung
      and exists (
        select 1 from public.pfluecker p
          join public.profiles me on me.brigade_id = p.brigade_id
         where p.id = arbeitszeiten.pfluecker_id
           and me.auth_user_id = auth.uid()
      )
    )
  )
  with check (public.has_role('admin', 'betriebsleitung', 'brigade'));

-- ---------------------------------------------------------------------------
-- 5. HOCH: Steigen mit Personenbezug waren fuer alle angemeldeten Rollen
--    lesbar - Kunde und Erzeuger haetten daraus Anwesenheitsprofile bauen
--    koennen
-- ---------------------------------------------------------------------------
drop policy if exists steigen_select_intern on public.steigen;
create policy steigen_select_feld on public.steigen
  for select to authenticated
  using (public.has_role('admin', 'betriebsleitung', 'buchhaltung', 'brigade'));

-- ---------------------------------------------------------------------------
-- 6. KRITISCH: Kuehlmessung ohne bekannten Pflueckzeitpunkt galt als "ok"
--    KRITISCH: Eine Messung vor dem Pflueckzeitpunkt ergab 0 Minuten statt
--    eines Fehlers
--    HOCH: vorkuehlung_zeitpunkt haing an der Einfuegereihenfolge, nicht am
--    fruehesten Messzeitpunkt - und war ausserdem an die Temperaturschwelle
--    gekoppelt. Das erzeugte einen Ueberlebenden-Fehler in der Kennzahl
--    "Zeit bis zur Vorkuehlung": genau die Chargen, die die 60-Minuten-Regel
--    gerissen haben, blieben ohne vorkuehlung_zeitpunkt und fielen aus dem
--    Mittelwert heraus - die Kennzahl zeigte nur die guten Faelle.
-- ---------------------------------------------------------------------------
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

  if v_pflueck is not null and new.gemessen_am < v_pflueck then
    raise exception 'Kuehlmessung kann nicht vor dem Pflueckzeitpunkt liegen.'
      using errcode = 'check_violation';
  end if;

  if v_pflueck is not null then
    new.minuten_seit_pfluecken :=
      greatest(0, (extract(epoch from (new.gemessen_am - v_pflueck)) / 60)::integer);
  else
    new.minuten_seit_pfluecken := null;
  end if;

  -- Eine deutlich zu warme Probe ist unabhaengig von der Zeitmessung ein
  -- Verstoss. Ohne bekannten Pflueckzeitpunkt laesst sich die Zeit nicht
  -- beurteilen - das ist eine Warnung, kein "ok".
  new.ergebnis := case
    when new.temperatur_c > 8 then 'verstoss'
    when v_pflueck is null then 'warnung'
    when new.minuten_seit_pfluecken > 60 then 'verstoss'
    when new.minuten_seit_pfluecken > 45 or new.temperatur_c > 4 then 'warnung'
    else 'ok'
  end;

  -- vorkuehlung_zeitpunkt ist der fruehesten gemessene Zeitpunkt ueberhaupt -
  -- unabhaengig davon, ob die Zieltemperatur schon erreicht wurde. Nur so
  -- zaehlen auch die Chargen, die zu spaet oder zu warm ankamen, in die
  -- Kennzahl "Zeit bis zur Vorkuehlung" hinein statt lautlos zu fehlen.
  update public.chargen
     set vorkuehlung_zeitpunkt =
           least(coalesce(vorkuehlung_zeitpunkt, new.gemessen_am), new.gemessen_am),
         status = case
           when status = 'offen' and new.temperatur_c <= 4 then 'gekuehlt'
           else status
         end
   where id = new.charge_id;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. HOCH: Ein geloeschter Reihenblock riss den Rueckstandsnachweis seiner
--    Chargen ab, ohne Fehlermeldung (SET NULL) bzw. loeschte die zugehoerigen
--    Pflueckaufgaben mit (CASCADE). Es gibt noch keine Loeschfunktion in der
--    Oberflaeche - das schliesst die Luecke, bevor sie gebraucht wird.
-- ---------------------------------------------------------------------------
alter table public.chargen
  drop constraint if exists chargen_reihenblock_id_fkey,
  add constraint chargen_reihenblock_id_fkey
    foreign key (reihenblock_id) references public.reihenbloecke(id)
    on delete restrict;

alter table public.pflueckaufgaben
  drop constraint if exists pflueckaufgaben_reihenblock_id_fkey,
  add constraint pflueckaufgaben_reihenblock_id_fkey
    foreign key (reihenblock_id) references public.reihenbloecke(id)
    on delete restrict;

comment on constraint chargen_reihenblock_id_fkey on public.chargen is
  'Absichtlich restriktiv: ein Reihenblock mit Ernte- oder Behandlungshistorie darf nicht geloescht werden. Stilllegen statt loeschen.';

-- ---------------------------------------------------------------------------
-- 8. GERING: pflueckaufgaben.charge_id blieb bei automatisch erzeugten
--    Chargen leer - die Spalte war nur in eine Richtung gepflegt
-- ---------------------------------------------------------------------------
create or replace function public.charge_zur_aufgabe_anlegen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_block   record;
  v_charge  uuid;
begin
  if new.charge_id is not null then
    return new;
  end if;

  select r.id, r.code, r.sorte_id
    into v_block
    from public.reihenbloecke r
   where r.id = new.reihenblock_id;

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
  )
  returning id into v_charge;

  update public.pflueckaufgaben set charge_id = v_charge where id = new.id;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Kennzahlen: pflueckintervall mass den Plan (Faelligkeit), nicht die
--    tatsaechliche Ernte, und liess Planungs-Chargen ohne Ernte mitzaehlen.
--    pflueckStreuung konnte eine Zeile mit wert NULL liefern.
--    deckungsbeitrag: Nenner und Zaehler sind noch nicht auf denselben
--    Gegenstand bezogen (alle Buchungen gegen alle Erntemengen, ohne
--    Zeitfenster) - siehe Kommentar an der Basis-Spalte; das ist eine
--    Geschaeftsentscheidung, die die Buchhaltung treffen muss, keine
--    Datenbankkorrektur. Der Text macht den Umfang jetzt ehrlich.
--    zeitBisVorkuehlung: durch Fix 6 zaehlen jetzt auch die Verstoesse mit;
--    ein einzelner extremer Ausreisser (z. B. eine Messung Tage nach dem
--    Pfluecken) soll die Leitkennzahl trotzdem nicht verzerren.
-- ---------------------------------------------------------------------------
create or replace function public.kpi_aktuell()
returns table (
  schluessel text,
  wert       numeric,
  einheit    text,
  basis      text,
  datensaetze integer
)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  return query
  select 'verlustquote',
         round(100.0 * sum(c.ausschuss_kg) / nullif(sum(c.menge_kg + c.ausschuss_kg), 0), 1),
         '%',
         'Ausschuss gegen Gesamtmenge über alle Chargen',
         count(*)::integer
    from public.chargen c
   where c.menge_kg + c.ausschuss_kg > 0
  having count(*) > 0;

  -- Bewusst inklusive der Chargen, die die 60-Minuten-Grenze gerissen haben -
  -- sonst zeigt die Kennzahl nur die guten Faelle. Ausreisser ueber einem Tag
  -- gelten als Datenfehler (z. B. eine sehr spaet nachgetragene Messung) und
  -- werden von der Durchschnittsbildung ausgenommen, tauchen aber weiter in
  -- der Datensatzzahl auf.
  return query
  select 'zeitBisVorkuehlung',
         round(avg(extract(epoch from (c.vorkuehlung_zeitpunkt - c.pflueck_zeitpunkt)) / 60)
               filter (where c.vorkuehlung_zeitpunkt - c.pflueck_zeitpunkt < interval '1 day')
               ::numeric, 0),
         'min',
         'Mittel über alle gemessenen Chargen, inklusive Grenzverletzungen',
         count(*)::integer
    from public.chargen c
   where c.pflueck_zeitpunkt is not null
     and c.vorkuehlung_zeitpunkt is not null
  having count(*) > 0;

  return query
  with je_person as (
    select m.pfluecker_id,
           sum(m.kg) as kg,
           sum(z.minuten) / 60.0 as stunden
      from (
        select pfluecker_id, pflueckaufgabe_id, sum(gewicht_kg) as kg
          from public.steigen
         where pfluecker_id is not null and pflueckaufgabe_id is not null
         group by 1, 2
      ) m
      join (
        select pfluecker_id, pflueckaufgabe_id, sum(minuten) as minuten
          from public.arbeitszeiten
         where minuten is not null and pflueckaufgabe_id is not null
         group by 1, 2
      ) z on z.pfluecker_id = m.pfluecker_id
         and z.pflueckaufgabe_id = m.pflueckaufgabe_id
     group by m.pfluecker_id
    having sum(z.minuten) > 0
  )
  select 'pflueckleistung',
         round(sum(kg) / nullif(sum(stunden), 0), 1),
         'kg/h',
         'Erntemenge je Steige gegen erfasste Arbeitszeit',
         count(*)::integer
    from je_person
  having count(*) > 0;

  return query
  with je_person as (
    select m.pfluecker_id,
           sum(m.kg) / nullif(sum(z.minuten) / 60.0, 0) as kg_h
      from (
        select pfluecker_id, pflueckaufgabe_id, sum(gewicht_kg) as kg
          from public.steigen
         where pfluecker_id is not null and pflueckaufgabe_id is not null
         group by 1, 2
      ) m
      join (
        select pfluecker_id, pflueckaufgabe_id, sum(minuten) as minuten
          from public.arbeitszeiten
         where minuten is not null and pflueckaufgabe_id is not null
         group by 1, 2
      ) z on z.pfluecker_id = m.pfluecker_id
         and z.pflueckaufgabe_id = m.pflueckaufgabe_id
     group by m.pfluecker_id
    having sum(z.minuten) > 0
  )
  select 'pflueckStreuung',
         round(max(kg_h) / nullif(min(kg_h), 0), 1),
         'x',
         'Beste gegen schwächste Kraft, mindestens zwei Personen nötig',
         count(*)::integer
    from je_person
  having count(*) > 1 and min(kg_h) > 0;

  -- Massgeblich ist der tatsaechliche Pflueckzeitpunkt, nicht die geplante
  -- Faelligkeit - sonst misst die Kennzahl den Plan, nicht die Ernte. Rein
  -- geplante Chargen ohne Pflueckzeitpunkt zaehlen nicht mit, ebenso wenig
  -- zwei Ernten am selben Tag (Abstand 0 ist keine Erntefolge).
  return query
  with echte_ernten as (
    select c.reihenblock_id, c.pflueck_zeitpunkt::date as datum
      from public.chargen c
     where c.reihenblock_id is not null and c.pflueck_zeitpunkt is not null
  ),
  folge as (
    select reihenblock_id, datum,
           lag(datum) over (partition by reihenblock_id order by datum) as vorher
      from echte_ernten
  ),
  abstand as (
    select (datum - vorher) as tage from folge where vorher is not null and datum <> vorher
  )
  select 'pflueckintervall',
         round(100.0 * count(*) filter (where tage <= 3) / nullif(count(*), 0), 0),
         '%',
         'Anteil der tatsächlichen Erntefolgen im Abstand von höchstens drei Tagen',
         count(*)::integer
    from abstand
  having count(*) > 0;

  return query
  with bewertet as (
    select b.id,
           not exists (
             select 1 from public.chargen c
              where c.reihenblock_id = b.reihenblock_id
                and c.ernte_datum >= b.behandelt_am
                and c.ernte_datum < b.freigabe_am
           ) as eingehalten
      from public.pflanzenschutz_behandlungen b
     where b.freigabe_am is not null
  )
  select 'behandlungenWartezeit',
         round(100.0 * count(*) filter (where eingehalten) / nullif(count(*), 0), 0),
         '%',
         'Behandlungen ohne Ernte im Sperrzeitraum',
         count(*)::integer
    from bewertet
  having count(*) > 0;

  return query
  select 'esutdAbdeckung',
         round(100.0 * count(*) filter (where p.esutd = 'erfasst') / nullif(count(*), 0), 0),
         '%',
         'Pflücker mit erfasstem Arbeitsvertrag',
         count(*)::integer
    from public.pfluecker p
  having count(*) > 0;

  -- Umfang bewusst offen benannt: alle Buchungen gegen alle Erntemengen der
  -- Saison, noch ohne Zeitfenster und ohne Chargenbezug in der Buchung (das
  -- Feld finance_ledger_entries.charge_id steht bereit, ist aber noch nicht
  -- befuellt). Eine engere Definition ist eine Entscheidung der Buchhaltung,
  -- keine Korrektur der Abfrage.
  return query
  with buchungen as (
    select sum(case when l.typ = 'erloes' then l.betrag_tenge else -l.betrag_tenge end) as db
      from public.finance_ledger_entries l
  ),
  mengen as (
    select sum(c.menge_kg) as kg from public.chargen c
  )
  select 'deckungsbeitrag',
         round((select db from buchungen) / nullif((select kg from mengen), 0), 0),
         '₸/kg',
         'Alle Erlös- und Kostenbuchungen gegen die gesamte Erntemenge - noch ohne Zeitfenster oder Chargenbezug je Buchung',
         (select count(*)::integer from public.finance_ledger_entries)
   where (select kg from mengen) > 0
     and (select db from buchungen) is not null;
end;
$$;
