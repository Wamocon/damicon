-- =============================================================================
-- Damicon - Fachliche Einstellungen, in der Oberfläche pflegbar (15.10.2026)
-- =============================================================================
-- Fristen, Kapazitäten und Richtwerte stehen nicht mehr fest im Code, sondern in dieser Tabelle. Administration und Geschäftsführung pflegen sie,
-- ebenso die Rolle, die im jeweiligen Fachgebiet zuständig ist (zum Beispiel die Buchhaltung bei den Steuerfristen). Jede Einstellung hat
-- Grenzen, eine Quelle und einen Stand, und jede Änderung steht im Verlauf (unveränderlich).
--
-- NICHT hier: Zugriffsrechte. Wer was lesen oder schreiben darf, bleibt in der Rechtematrix (src/lib/rbac.ts) und in den Policies. Eine
-- Einstellung, die Schutzregeln aufheben könnte, gäbe es sonst per Fehlklick.
--
--   * Eine Einstellung ohne Wert (null) heißt "nicht gesetzt". Die Anwendung wendet dann keine Prüfung an, statt einen Wert zu erfinden.
--   * Gesetzt wird ausschließlich über einstellung_setzen(): prüft die Rolle der Person gegen "bearbeiter", die Grenzen und den Typ.
--   * Der Standardwert steht in der Zeile (standard_wert) und im Code (src/lib/einstellungen.ts). Ein Test hält beide gleich.
-- =============================================================================

set search_path = public;

create table if not exists public.betriebs_einstellungen (
  schluessel        text primary key check (schluessel ~ '^[a-z0-9_]+\.[a-z0-9_]+$'),
  bereich           text not null check (bereich in ('steuer', 'arbeitsrecht', 'abholung', 'finanzen', 'auslieferung', 'sicherheit')),
  typ               text not null check (typ in ('ganzzahl', 'dezimal', 'ja_nein', 'text')),
  wert              numeric,
  wert_text         text check (wert_text is null or char_length(wert_text) <= 500),
  standard_wert     numeric,
  standard_text     text,
  einheit           text,
  min_wert          numeric,
  max_wert          numeric,
  -- Rollen, die diese Einstellung ändern dürfen. admin gilt immer, ceo als admin.
  bearbeiter        public.app_role[] not null default array['admin', 'ceo']::public.app_role[],
  quelle            text not null,
  stand             date not null,
  aktualisiert_von  uuid,
  aktualisiert_am   timestamptz not null default now(),
  constraint betriebs_einstellungen_grenzen check (min_wert is null or max_wert is null or min_wert <= max_wert),
  constraint betriebs_einstellungen_wert_typ check (
    case typ
      when 'ganzzahl' then wert is null or wert = trunc(wert)
      when 'ja_nein'  then wert is null or wert in (0, 1)
      else true
    end
  )
);

comment on table public.betriebs_einstellungen is
  'Fachliche Einstellungen (Fristen, Kapazitäten, Richtwerte), in der Oberfläche pflegbar. Keine Zugriffsrechte. Wert null = nicht gesetzt, dann gilt keine Prüfung.';

create table if not exists public.betriebs_einstellungen_verlauf (
  id             uuid primary key default gen_random_uuid(),
  schluessel     text not null,
  alt_wert       numeric,
  neu_wert       numeric,
  alt_text       text,
  neu_text       text,
  grund          text check (grund is null or char_length(btrim(grund)) between 3 and 300),
  geaendert_von  uuid,
  geaendert_am   timestamptz not null default now()
);

create index if not exists idx_betriebs_einstellungen_verlauf on public.betriebs_einstellungen_verlauf (schluessel, geaendert_am desc);

comment on table public.betriebs_einstellungen_verlauf is
  'Jede Änderung einer Einstellung mit altem und neuem Wert, Person und optionalem Grund. Append-only.';

create or replace function public.betriebs_einstellungen_verlauf_schuetzen()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Der Verlauf der Einstellungen ist unveraenderlich. % nicht erlaubt.', tg_op using errcode = 'DA018';
end;
$$;

drop trigger if exists trg_betriebs_einstellungen_verlauf_schuetzen on public.betriebs_einstellungen_verlauf;
create trigger trg_betriebs_einstellungen_verlauf_schuetzen
  before update or delete on public.betriebs_einstellungen_verlauf
  for each row execute function public.betriebs_einstellungen_verlauf_schuetzen();

-- ---------------------------------------------------------------------------
-- Lesen für die Anwendung und für andere Funktionen
-- ---------------------------------------------------------------------------
create or replace function public.einstellung_zahl(p_schluessel text)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select wert from public.betriebs_einstellungen where schluessel = p_schluessel;
$$;

revoke all on function public.einstellung_zahl(text) from public, anon;
grant execute on function public.einstellung_zahl(text) to authenticated;

comment on function public.einstellung_zahl(text) is
  'Wert einer Einstellung. Null, wenn die Einstellung nicht gesetzt ist oder nicht existiert.';

-- ---------------------------------------------------------------------------
-- Ändern: nur über diese Funktion
-- ---------------------------------------------------------------------------
create or replace function public.einstellung_setzen(p_schluessel text, p_wert numeric, p_text text, p_grund text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  e        public.betriebs_einstellungen%rowtype;
  v_rolle  public.app_role := public.current_app_role();
  v_profil uuid;
  v_grund  text := nullif(btrim(coalesce(p_grund, '')), '');
begin
  select * into e from public.betriebs_einstellungen where schluessel = p_schluessel for update;
  if not found then
    raise exception 'Unbekannte Einstellung.' using errcode = '23503';
  end if;

  -- Rolle: admin und ceo immer, sonst nur die Rollen der Einstellung.
  if v_rolle is null or not (v_rolle in ('admin', 'ceo') or v_rolle = any (e.bearbeiter)) then
    raise exception 'Keine Berechtigung fuer diese Einstellung.' using errcode = '42501';
  end if;

  if e.typ = 'text' then
    if p_wert is not null then
      raise exception 'Diese Einstellung ist ein Text.' using errcode = '23514';
    end if;
    p_text := nullif(btrim(coalesce(p_text, '')), '');
  else
    if p_text is not null and btrim(p_text) <> '' then
      raise exception 'Diese Einstellung ist eine Zahl.' using errcode = '23514';
    end if;
    p_text := null;
    if p_wert is not null then
      if e.typ = 'ganzzahl' and p_wert <> trunc(p_wert) then
        raise exception 'Bitte eine ganze Zahl angeben.' using errcode = '23514';
      end if;
      if e.typ = 'ja_nein' and p_wert not in (0, 1) then
        raise exception 'Bitte ja oder nein waehlen.' using errcode = '23514';
      end if;
      if (e.min_wert is not null and p_wert < e.min_wert) or (e.max_wert is not null and p_wert > e.max_wert) then
        raise exception 'Der Wert liegt ausserhalb der Grenzen (% bis %).', coalesce(e.min_wert::text, '-'), coalesce(e.max_wert::text, '-') using errcode = '23514';
      end if;
    end if;
  end if;

  if e.wert is not distinct from p_wert and e.wert_text is not distinct from p_text then
    return;
  end if;

  select id into v_profil from public.profiles where auth_user_id = auth.uid();

  insert into public.betriebs_einstellungen_verlauf (schluessel, alt_wert, neu_wert, alt_text, neu_text, grund, geaendert_von)
  values (p_schluessel, e.wert, p_wert, e.wert_text, p_text, v_grund, v_profil);

  update public.betriebs_einstellungen
     set wert = p_wert, wert_text = p_text, aktualisiert_von = v_profil, aktualisiert_am = now()
   where schluessel = p_schluessel;
end;
$$;

revoke all on function public.einstellung_setzen(text, numeric, text, text) from public, anon;
grant execute on function public.einstellung_setzen(text, numeric, text, text) to authenticated;

comment on function public.einstellung_setzen(text, numeric, text, text) is
  'Setzt eine Einstellung. Prüft die Rolle gegen bearbeiter, den Typ und die Grenzen, schreibt den Verlauf. Wert null = nicht gesetzt.';

-- ---------------------------------------------------------------------------
-- Zeilensicherheit
-- ---------------------------------------------------------------------------
alter table public.betriebs_einstellungen enable row level security;
alter table public.betriebs_einstellungen force row level security;
alter table public.betriebs_einstellungen_verlauf enable row level security;
alter table public.betriebs_einstellungen_verlauf force row level security;

-- Lesen darf jede angemeldete Person: die Werte sind keine Geheimnisse (Fristen, Richtwerte), die Anwendung braucht sie in jeder Rolle.
create policy betriebs_einstellungen_select on public.betriebs_einstellungen
  for select to authenticated using (true);
create policy betriebs_einstellungen_verlauf_select on public.betriebs_einstellungen_verlauf
  for select to authenticated using (public.has_role('admin', 'betriebsleitung', 'buchhaltung'));

revoke all on public.betriebs_einstellungen from public, anon, authenticated;
revoke all on public.betriebs_einstellungen_verlauf from public, anon, authenticated;
grant select on public.betriebs_einstellungen to authenticated;
grant select on public.betriebs_einstellungen_verlauf to authenticated;

-- ---------------------------------------------------------------------------
-- Startwerte, mit Quelle und Stand (docs/ENTSCHEIDUNGSGRUNDLAGEN.md)
-- ---------------------------------------------------------------------------
insert into public.betriebs_einstellungen
  (schluessel, bereich, typ, wert, standard_wert, einheit, min_wert, max_wert, bearbeiter, quelle, stand)
values
  ('esf.frist_tage', 'steuer', 'ganzzahl', 15, 15, 'Kalendertage', 1, 60,
   array['admin', 'ceo', 'buchhaltung']::public.app_role[],
   'Steuerkodex 214-VIII, Art. 493 Abs. 1: Die ЭСФ wird frühestens am Umsatztag und spätestens 15 Kalendertage danach ausgestellt. Das Fristende wird nicht auf einen Arbeitstag verschoben (vorsichtige Lesart).',
   date '2026-10-15'),
  ('esutd.frist_abschluss_tage', 'arbeitsrecht', 'ganzzahl', 5, 5, 'Arbeitstage', 1, 60,
   array['admin', 'ceo', 'buchhaltung', 'betriebsleitung']::public.app_role[],
   'Erlass des Arbeitsministers Nr. 353 vom 03.09.2020, Pkt. 7: neuer Vertrag, 5 Arbeitstage nach Unterschrift beider Seiten. Saisonverträge haben keine eigene Frist.',
   date '2026-10-15'),
  ('esutd.frist_aenderung_tage', 'arbeitsrecht', 'ganzzahl', 15, 15, 'Kalendertage', 1, 90,
   array['admin', 'ceo', 'buchhaltung', 'betriebsleitung']::public.app_role[],
   'Erlass des Arbeitsministers Nr. 353 vom 03.09.2020, Pkt. 8: Änderung des Vertrags, 15 Kalendertage.',
   date '2026-10-15'),
  ('esutd.frist_beendigung_tage', 'arbeitsrecht', 'ganzzahl', 3, 3, 'Arbeitstage', 1, 60,
   array['admin', 'ceo', 'buchhaltung', 'betriebsleitung']::public.app_role[],
   'Erlass des Arbeitsministers Nr. 353 vom 03.09.2020, Pkt. 12: Beendigung des Vertrags, 3 Arbeitstage.',
   date '2026-10-15'),
  ('abholung.fahrzeug_kapazitaet_kg', 'abholung', 'dezimal', null, null, 'kg', 1, 100000,
   array['admin', 'ceo', 'betriebsleitung']::public.app_role[],
   'Betriebsangabe: Nutzlast des Kühlfahrzeugs. Leer = keine Kapazitätsprüfung. Eine Runde kann eine eigene Kapazität tragen.',
   date '2026-10-15'),
  ('wirtschaftlichkeit.kalkulationszins_richtwert', 'finanzen', 'dezimal', 20, 20, 'Prozent', 1, 60,
   array['admin', 'ceo']::public.app_role[],
   'Eigene Herleitung vom 15.10.2026: risikoloser Satz rund 13,9 % (KASE, 10 Jahre) plus 4 bis 8 Prozentpunkte Betriebsrisiko, Gegenprobe Unternehmenskredite in Tenge (18,9 bis 23,7 %). Basiszins der Nationalbank 16,25 % (seit 04.09.2026). Eine übliche Spanne für Agrarbetriebe ist nicht belegt.',
   date '2026-10-15'),
  ('wirtschaftlichkeit.zins_sensitivitaet_niedrig', 'finanzen', 'dezimal', 16, 16, 'Prozent', 1, 60,
   array['admin', 'ceo']::public.app_role[],
   'Untere Vergleichsrechnung zum Richtwert (Basiszins der Nationalbank 16,25 %).',
   date '2026-10-15'),
  ('wirtschaftlichkeit.zins_sensitivitaet_hoch', 'finanzen', 'dezimal', 24, 24, 'Prozent', 1, 60,
   array['admin', 'ceo']::public.app_role[],
   'Obere Vergleichsrechnung zum Richtwert (Kleinunternehmen-Kredite in Tenge rund 23,7 %).',
   date '2026-10-15'),
  ('auslieferung.zeitbudget_sekunden', 'auslieferung', 'ganzzahl', 40, 40, 'Sekunden', 5, 55,
   array['admin', 'ceo']::public.app_role[],
   'Zeitbudget je Lauf der Auslieferung. Die Funktion der Plattform läuft höchstens 60 Sekunden, ein Lauf bleibt darunter.',
   date '2026-10-15'),
  ('sicherheit.adresssuche_je_stunde', 'sicherheit', 'ganzzahl', 20, 20, 'Anfragen je Person und Stunde', 1, 200,
   array['admin', 'ceo']::public.app_role[],
   'Grenze für die Adresssuche (Geokodierung) je Person. Der Dienst Nominatim erlaubt höchstens eine Anfrage je Sekunde für alle zusammen.',
   date '2026-10-15')
on conflict (schluessel) do nothing;
