-- =============================================================================
-- Damicon - Abholrunden, Ausbau: Fahrzeugkapazität, Abholfenster der Nachbarbetriebe, geplante Ankunft (15.10.2026)
-- =============================================================================
-- Entscheidung vom 15.10.2026 zu den offenen Punkten der Abholrunden (WMCNL-1577):
--
--   * Fahrzeugkapazität: Eine Runde trägt ihre Kapazität in kg (Vorgabe aus der Einstellung abholung.fahrzeug_kapazitaet_kg, leer = keine Prüfung).
--     Die Planung warnt, wenn die geplante Menge die Kapazität übersteigt. Sie sperrt nicht: das Fahrzeug kann zweimal fahren, und die Entscheidung
--     gehört der Betriebsleitung.
--   * Zeitfenster der Nachbarbetriebe: Jeder Nachbarbetrieb kann ein Abholfenster tragen (von, bis, Ortszeit Almaty). Die Runde schätzt die Ankunft
--     je Stopp aus der Abfahrtszeit, den Teilstrecken der Routenberechnung und der Zeit je Stopp (Einstellung abholung.aufenthalt_minuten) und zeigt,
--     wenn sie außerhalb des Fensters liegt.
--   * Mehrere Fahrzeuge je Tag: Waren schon möglich (mehrere Runden je Datum). Neu ist nur der Hinweis, wenn ein Betrieb am selben Tag in zwei
--     geplanten Runden steht.
--
-- abholrunde_anlegen() bekommt die neuen Angaben, abholrunde_nachbarbetriebe() liefert die Fenster mit. Keine Datenänderung.
-- =============================================================================

set search_path = public;

alter table public.nachbarbetriebe
  add column if not exists abhol_von time,
  add column if not exists abhol_bis time;

alter table public.nachbarbetriebe drop constraint if exists nachbarbetriebe_abholfenster;
alter table public.nachbarbetriebe
  add constraint nachbarbetriebe_abholfenster check (
    (abhol_von is null and abhol_bis is null) or (abhol_von is not null and abhol_bis is not null and abhol_von < abhol_bis)
  );

comment on column public.nachbarbetriebe.abhol_von is 'Beginn des Abholfensters (Ortszeit Almaty). Nur zusammen mit abhol_bis.';
comment on column public.nachbarbetriebe.abhol_bis is 'Ende des Abholfensters (Ortszeit Almaty), nach abhol_von.';

alter table public.abholrunden
  add column if not exists kapazitaet_kg numeric(10, 2) check (kapazitaet_kg is null or (kapazitaet_kg > 0 and kapazitaet_kg <= 100000)),
  add column if not exists start_zeit time;

comment on column public.abholrunden.kapazitaet_kg is 'Nutzlast des Fahrzeugs dieser Runde in kg. Leer = keine Kapazitätsprüfung.';
comment on column public.abholrunden.start_zeit is 'Geplante Abfahrt am Betrieb (Ortszeit Almaty), Grundlage der geschätzten Ankunft je Stopp.';

alter table public.abholstopps
  add column if not exists ankunft_geplant timestamptz;

comment on column public.abholstopps.ankunft_geplant is 'Geschätzte Ankunft beim Nachbarbetrieb, gerechnet bei der Planung aus Abfahrt, Teilstrecken und Zeit je Stopp. Eine Schätzung, kein Nachweis.';

-- ---------------------------------------------------------------------------
-- Einstellung: Zeit je Stopp
-- ---------------------------------------------------------------------------
insert into public.betriebs_einstellungen
  (schluessel, bereich, typ, wert, standard_wert, einheit, min_wert, max_wert, bearbeiter, quelle, stand)
values
  ('abholung.aufenthalt_minuten', 'abholung', 'ganzzahl', 10, 10, 'Minuten', 0, 120,
   array['admin', 'ceo', 'betriebsleitung']::public.app_role[],
   'Planungsannahme vom 15.10.2026: Zeit für Wiegen, Verladen und Übergabe je Stopp. Nach den ersten Runden mit den gemessenen Zeiten der Betriebsleitung abgleichen.',
   date '2026-10-15')
on conflict (schluessel) do nothing;

-- ---------------------------------------------------------------------------
-- Nachbarbetriebe der Runde mit Abholfenster
-- ---------------------------------------------------------------------------
drop function if exists public.abholrunde_nachbarbetriebe();
create function public.abholrunde_nachbarbetriebe()
returns table (id uuid, name text, ort text, adresse text, kontakt text, breitengrad numeric, laengengrad numeric, abhol_von time, abhol_bis time)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.has_role('admin', 'betriebsleitung') then
    return query
      select n.id, n.name, n.ort, n.adresse, n.kontakt, n.breitengrad, n.laengengrad, n.abhol_von, n.abhol_bis
        from public.nachbarbetriebe n;
  elsif public.current_app_role() = 'brigade' then
    return query
      select n.id, n.name, n.ort, n.adresse, n.kontakt, n.breitengrad, n.laengengrad, n.abhol_von, n.abhol_bis
        from public.nachbarbetriebe n
       where exists (select 1 from public.abholstopps s where s.nachbarbetrieb_id = n.id);
  end if;
end;
$$;

revoke all on function public.abholrunde_nachbarbetriebe() from public, anon;
grant execute on function public.abholrunde_nachbarbetriebe() to authenticated;

comment on function public.abholrunde_nachbarbetriebe() is
  'Nachbarbetriebe der Abholrunde ohne Stammdaten wie identifikationsnummer, mit Abholfenster: Leitung alle, Brigade nur die Betriebe in einem Abholstopp.';

-- ---------------------------------------------------------------------------
-- Runde anlegen mit den neuen Angaben
-- ---------------------------------------------------------------------------
drop function if exists public.abholrunde_anlegen(date, text, text, numeric, integer, integer, jsonb, jsonb);
create function public.abholrunde_anlegen(
  p_datum        date,
  p_fahrzeug     text,
  p_notiz        text,
  p_kapazitaet   numeric,
  p_start_zeit   time,
  p_distanz_km   numeric,
  p_dauer_min    integer,
  p_ab_erstem    integer,
  p_geometrie    jsonb,
  p_stopps       jsonb
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id     uuid;
  v_profil uuid;
begin
  select id into v_profil from public.profiles where auth_user_id = auth.uid();
  insert into public.abholrunden (datum, fahrzeug, notiz, kapazitaet_kg, start_zeit, distanz_km, dauer_minuten, ab_erstem_stopp_minuten, routen_geometrie, erstellt_von_profil_id)
  values (p_datum, nullif(btrim(coalesce(p_fahrzeug, '')), ''), nullif(btrim(coalesce(p_notiz, '')), ''), p_kapazitaet, p_start_zeit, p_distanz_km, p_dauer_min, p_ab_erstem, p_geometrie, v_profil)
  returning id into v_id;

  insert into public.abholstopps (runde_id, nachbarbetrieb_id, reihenfolge, menge_geplant_kg, ankunft_geplant)
  select v_id, (s->>'nachbarbetrieb_id')::uuid, (s->>'reihenfolge')::integer, (s->>'menge_geplant_kg')::numeric, nullif(s->>'ankunft_geplant', '')::timestamptz
    from jsonb_array_elements(p_stopps) s;
  return v_id;
end;
$$;

revoke all on function public.abholrunde_anlegen(date, text, text, numeric, time, numeric, integer, integer, jsonb, jsonb) from public, anon;
grant execute on function public.abholrunde_anlegen(date, text, text, numeric, time, numeric, integer, integer, jsonb, jsonb) to authenticated;

comment on function public.abholrunde_anlegen(date, text, text, numeric, time, numeric, integer, integer, jsonb, jsonb) is
  'Legt eine Abholrunde mit ihren Stopps in einer Transaktion an. Scheitert ein Stopp, gibt es auch die Runde nicht. Zeilensicherheit und Trigger gelten wie beim Direktinsert.';

-- Das Planen (Fahrzeug, Kapazität, Abfahrt, Strecke) bleibt Sache der Leitung: die Brigade ändert diese Spalten nicht (DA015, wie bisher für Datum und Fahrzeug).
create or replace function public.abholrunde_brigade_grenzen()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.current_app_role() is distinct from 'brigade' then
    return new;
  end if;

  if tg_table_name = 'abholrunden' then
    if new.datum is distinct from old.datum
       or new.fahrzeug is distinct from old.fahrzeug
       or new.notiz is distinct from old.notiz
       or new.kapazitaet_kg is distinct from old.kapazitaet_kg
       or new.start_zeit is distinct from old.start_zeit
       or new.distanz_km is distinct from old.distanz_km
       or new.dauer_minuten is distinct from old.dauer_minuten
       or new.ab_erstem_stopp_minuten is distinct from old.ab_erstem_stopp_minuten
       or new.routen_geometrie is distinct from old.routen_geometrie
       or new.erstellt_von_profil_id is distinct from old.erstellt_von_profil_id then
      raise exception 'Datum, Fahrzeug und Strecke einer Abholrunde plant die Betriebsleitung. Die Brigade fährt die Runde.'
        using errcode = 'DA015';
    end if;
  else
    if new.reihenfolge is distinct from old.reihenfolge
       or new.menge_geplant_kg is distinct from old.menge_geplant_kg
       or new.sorte_id is distinct from old.sorte_id
       or new.ankunft_geplant is distinct from old.ankunft_geplant then
      raise exception 'Reihenfolge und geplante Menge eines Stopps plant die Betriebsleitung.'
        using errcode = 'DA015';
    end if;
  end if;
  return new;
end;
$$;
