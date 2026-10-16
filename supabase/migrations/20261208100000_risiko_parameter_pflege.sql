-- =============================================================================
-- Damicon - Risiko-Gewichte in der Oberfläche pflegen (15.10.2026)
-- =============================================================================
-- Die Gewichte, Grenzen und Schwellen der Block-Risiko-Bewertung (WMCNL-1470) stehen in public.risiko_parameter und waren bisher nur per SQL
-- änderbar. Administration und Geschäftsführung pflegen sie jetzt in der Oberfläche (Modul Einstellungen), und zwar so:
--
--   * Jede Änderung steht im Verlauf (betriebs_einstellungen_verlauf, Schlüssel "risiko.<schluessel>"), mit altem und neuem Wert, Person und optionalem
--     Grund. Ein Trigger schreibt den Eintrag, egal auf welchem Weg der Wert geändert wird.
--   * Jeder Schlüssel hat Grenzen (zum Beispiel Gewichte 0 bis 100, Tage ganzzahlig). Die Gewichte dürfen nicht alle null sein: die Sicht teilt durch ihre Summe.
--   * Der Standardwert steht in der Zeile (standard_wert), damit die Oberfläche ihn nennen kann.
--   * risiko_parameter_setzen() ist der Weg der Anwendung: prüft die Rolle (Administration, Geschäftsführung), den Grund und die Grenzen.
--
-- Datenänderung: nur die neue Spalte standard_wert wird gefüllt (Startwerte der Migration 20261207020000). Kein Wert ändert sich.
-- =============================================================================

set search_path = public;

alter table public.risiko_parameter add column if not exists standard_wert numeric;

update public.risiko_parameter p
   set standard_wert = s.wert
  from (values
    ('gewicht_ueberfaellig', 35), ('gewicht_sperre', 30), ('gewicht_ausschuss', 20), ('gewicht_kuehlkette', 10), ('gewicht_erfassung', 5),
    ('intervall_max_tage', 3), ('ausschuss_ziel_prozent', 6), ('ausschuss_kritisch_prozent', 12), ('kuehl_verstoesse_voll', 3),
    ('sperre_durchgaenge_voll', 3), ('betrachtung_tage', 7), ('aktiv_tage', 30), ('schwelle_hoch', 50), ('schwelle_mittel', 25)
  ) as s(schluessel, wert)
 where p.schluessel = s.schluessel and p.standard_wert is null;

comment on column public.risiko_parameter.standard_wert is 'Startwert der Migration. Die Oberfläche nennt ihn neben dem aktuellen Wert.';

-- ---------------------------------------------------------------------------
-- Grenzen je Schlüssel (derselbe Satz steht in src/lib/domain/block-risiko.ts, ein Test hält beide gleich)
-- ---------------------------------------------------------------------------
create or replace function public.risiko_parameter_grenzen(p_schluessel text)
returns table (min_wert numeric, max_wert numeric, ganzzahl boolean)
language sql
immutable
set search_path = public
as $$
  select g.min_wert, g.max_wert, g.ganzzahl
    from (values
      ('gewicht_ueberfaellig', 0, 100, false),
      ('gewicht_sperre', 0, 100, false),
      ('gewicht_ausschuss', 0, 100, false),
      ('gewicht_kuehlkette', 0, 100, false),
      ('gewicht_erfassung', 0, 100, false),
      ('intervall_max_tage', 1, 30, true),
      ('ausschuss_ziel_prozent', 0, 100, false),
      ('ausschuss_kritisch_prozent', 0, 100, false),
      ('kuehl_verstoesse_voll', 1, 50, true),
      ('sperre_durchgaenge_voll', 1, 20, true),
      ('betrachtung_tage', 1, 90, true),
      ('aktiv_tage', 1, 365, true),
      ('schwelle_hoch', 0, 100, false),
      ('schwelle_mittel', 0, 100, false)
    ) as g(schluessel, min_wert, max_wert, ganzzahl)
   where g.schluessel = p_schluessel;
$$;

comment on function public.risiko_parameter_grenzen(text) is 'Erlaubter Bereich je Parameter der Block-Risiko-Bewertung. Leer, wenn der Schlüssel unbekannt ist.';

-- ---------------------------------------------------------------------------
-- Prüfung vor jeder Änderung: Grenzen, Reihenfolge der Schwellen, Gewichte nicht alle null
-- ---------------------------------------------------------------------------
create or replace function public.risiko_parameter_pruefen()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_hoch     numeric;
  v_mittel   numeric;
  v_ziel     numeric;
  v_krit     numeric;
  v_summe    numeric;
  g          record;
begin
  select * into g from public.risiko_parameter_grenzen(new.schluessel);
  if found then
    if new.wert < g.min_wert or new.wert > g.max_wert then
      raise exception 'Der Wert fuer % liegt ausserhalb der Grenzen (% bis %).', new.schluessel, g.min_wert, g.max_wert using errcode = '23514';
    end if;
    if g.ganzzahl and new.wert <> trunc(new.wert) then
      raise exception 'Der Wert fuer % muss eine ganze Zahl sein.', new.schluessel using errcode = '23514';
    end if;
  end if;

  select coalesce(max(wert) filter (where schluessel = 'schwelle_hoch'), 0),
         coalesce(max(wert) filter (where schluessel = 'schwelle_mittel'), 0),
         coalesce(max(wert) filter (where schluessel = 'ausschuss_ziel_prozent'), 0),
         coalesce(max(wert) filter (where schluessel = 'ausschuss_kritisch_prozent'), 0),
         coalesce(sum(wert) filter (where schluessel like 'gewicht\_%'), 0)
    into v_hoch, v_mittel, v_ziel, v_krit, v_summe
    from public.risiko_parameter
   where schluessel <> new.schluessel;
  if new.schluessel = 'schwelle_hoch' then v_hoch := new.wert; end if;
  if new.schluessel = 'schwelle_mittel' then v_mittel := new.wert; end if;
  if new.schluessel = 'ausschuss_ziel_prozent' then v_ziel := new.wert; end if;
  if new.schluessel = 'ausschuss_kritisch_prozent' then v_krit := new.wert; end if;
  if new.schluessel like 'gewicht\_%' then v_summe := v_summe + new.wert; end if;

  if v_hoch <= v_mittel then
    raise exception 'Die Schwelle "hoch" muss ueber der Schwelle "mittel" liegen.' using errcode = '23514';
  end if;
  if v_krit <= v_ziel then
    raise exception 'Der kritische Ausschuss muss ueber dem Zielwert liegen.' using errcode = '23514';
  end if;
  if v_summe <= 0 then
    raise exception 'Mindestens ein Gewicht muss ueber null liegen.' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Verlauf: jede Änderung des Werts, auf welchem Weg auch immer
-- ---------------------------------------------------------------------------
create or replace function public.risiko_parameter_verlauf_schreiben()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profil uuid;
  v_grund  text := nullif(btrim(coalesce(current_setting('damicon.risiko_grund', true), '')), '');
begin
  if new.wert is not distinct from old.wert then
    return new;
  end if;
  select id into v_profil from public.profiles where auth_user_id = auth.uid();
  insert into public.betriebs_einstellungen_verlauf (schluessel, alt_wert, neu_wert, grund, geaendert_von)
  values ('risiko.' || new.schluessel, old.wert, new.wert, v_grund, v_profil);
  return new;
end;
$$;

drop trigger if exists trg_risiko_parameter_verlauf on public.risiko_parameter;
create trigger trg_risiko_parameter_verlauf
  after update on public.risiko_parameter
  for each row execute function public.risiko_parameter_verlauf_schreiben();

-- ---------------------------------------------------------------------------
-- Der Weg der Anwendung
-- ---------------------------------------------------------------------------
create or replace function public.risiko_parameter_setzen(p_schluessel text, p_wert numeric, p_grund text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grund text := nullif(btrim(coalesce(p_grund, '')), '');
begin
  if not coalesce(public.has_role('admin'), false) then
    raise exception 'Die Risiko-Gewichte aendern nur Administration und Geschaeftsfuehrung.' using errcode = '42501';
  end if;
  if v_grund is not null and char_length(v_grund) not between 3 and 300 then
    raise exception 'Der Grund braucht 3 bis 300 Zeichen.' using errcode = '23514';
  end if;
  if p_wert is null then
    raise exception 'Der Wert fehlt.' using errcode = '23514';
  end if;
  if not exists (select 1 from public.risiko_parameter where schluessel = p_schluessel) then
    raise exception 'Unbekannter Parameter.' using errcode = '23503';
  end if;

  perform set_config('damicon.risiko_grund', coalesce(v_grund, ''), true);
  update public.risiko_parameter set wert = p_wert where schluessel = p_schluessel;
  perform set_config('damicon.risiko_grund', '', true);
end;
$$;

revoke all on function public.risiko_parameter_setzen(text, numeric, text) from public, anon;
grant execute on function public.risiko_parameter_setzen(text, numeric, text) to authenticated;
revoke all on function public.risiko_parameter_grenzen(text) from public, anon;
grant execute on function public.risiko_parameter_grenzen(text) to authenticated;

comment on function public.risiko_parameter_setzen(text, numeric, text) is
  'Setzt einen Parameter der Block-Risiko-Bewertung (nur Administration und Geschäftsführung). Prüft Grenzen und Plausibilität, der Verlauf entsteht durch den Trigger.';
