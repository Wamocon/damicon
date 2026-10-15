-- =============================================================================
-- Damicon - Härtung aus der Prüfung des Pull Requests #156 (15.10.2026): Doppelklick, atomare Abholrunde, Adresssuche, Auslieferung, Block-Risiko
-- =============================================================================
-- Keine Datenänderung außer dem Entfernen doppelter Ist-Werte (nur Zeilen mit gleichem Monat, gleicher Kategorie und gleicher Währung, die jüngeren
-- fallen weg; die Tabelle gibt es erst mit diesem Pull Request).
--
--   1. Ist-Werte der Wirtschaftlichkeit: ein Wert je Monat, Kategorie und Währung (Unique-Index). Ein zweiter Klick trifft den Index.
--   2. Modellwerte und Checklisten-Vorschlag übernehmen: eine Funktion zählt und fügt unter einer Sperre ein. Ein Doppelklick fügt nicht doppelt ein.
--   3. Abholrunde anlegen: Runde und Stopps in einer Transaktion (abholrunde_anlegen), kein Rest einer Runde ohne Stopps.
--   4. Adresssuche: Grenze je Person und Stunde aus der Einstellung sicherheit.adresssuche_je_stunde (adresssuche_zulassen).
--   5. Auslieferung: das Geheimnis hat ein festes Präfix (DAMICON_HOOK_), sonst könnte die Administration CRON_SECRET oder den Schlüssel der
--      KI-Anbieter als Signaturschlüssel eintragen.
--   6. Block-Risiko: Plausibilität der Parameter (Schwelle hoch über Schwelle mittel, kritisch über Ziel) und die Sicht nur für Rollen, die alle
--      Eingaben sehen (Administration, Betriebsleitung, Brigade). Für die übrigen lieferte sie zu niedrige Werte.
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. Ist-Werte: ein Wert je Monat, Kategorie und Währung
-- ---------------------------------------------------------------------------
delete from public.wirtschaftlichkeit_ist w
 using (
   select id, row_number() over (partition by monat, kategorie, waehrung order by created_at, id) as rn
     from public.wirtschaftlichkeit_ist
 ) d
 where d.id = w.id and d.rn > 1;

create unique index if not exists uq_wirtschaftlichkeit_ist_monat_kategorie
  on public.wirtschaftlichkeit_ist (monat, kategorie, waehrung);

-- ---------------------------------------------------------------------------
-- 2. Modellwerte und Checklisten-Vorschlag: zählen und einfügen unter einer Sperre
-- ---------------------------------------------------------------------------
-- security invoker: die Zeilensicherheit der Tabellen gilt, die handelnde Person braucht das Schreibrecht wie bisher.
-- Rückgabe: Zahl der eingefügten Zeilen, 0 wenn schon Zeilen da waren (ein zweiter Klick).
create or replace function public.wirtschaftlichkeit_posten_uebernehmen(p_posten jsonb, p_profil uuid)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_anzahl integer;
begin
  perform pg_advisory_xact_lock(hashtext('wirtschaftlichkeit_posten_uebernehmen'));
  if exists (select 1 from public.wirtschaftlichkeit_posten) then
    return 0;
  end if;
  insert into public.wirtschaftlichkeit_posten (art, kategorie, bezeichnung, betrag, waehrung, datum, herkunft, notiz, erfasst_von_profil_id)
  select p->>'art', p->>'kategorie', p->>'bezeichnung', (p->>'betrag')::numeric, p->>'waehrung', (p->>'datum')::date, p->>'herkunft', nullif(p->>'notiz', ''), p_profil
    from jsonb_array_elements(p_posten) p;
  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end;
$$;

revoke all on function public.wirtschaftlichkeit_posten_uebernehmen(jsonb, uuid) from public, anon;
grant execute on function public.wirtschaftlichkeit_posten_uebernehmen(jsonb, uuid) to authenticated;

create or replace function public.foerder_checkliste_vorschlag_uebernehmen(p_dossier uuid, p_punkte text[])
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_anzahl integer;
begin
  perform pg_advisory_xact_lock(hashtext('foerder_checkliste_' || p_dossier::text));
  if exists (select 1 from public.foerder_checkpunkte where dossier_id = p_dossier) then
    return 0;
  end if;
  insert into public.foerder_checkpunkte (dossier_id, vorlage_key, pflicht, reihenfolge)
  select p_dossier, k.key, true, k.ordinality - 1
    from unnest(p_punkte) with ordinality as k(key, ordinality);
  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end;
$$;

revoke all on function public.foerder_checkliste_vorschlag_uebernehmen(uuid, text[]) from public, anon;
grant execute on function public.foerder_checkliste_vorschlag_uebernehmen(uuid, text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Abholrunde atomar anlegen
-- ---------------------------------------------------------------------------
create or replace function public.abholrunde_anlegen(
  p_datum        date,
  p_fahrzeug     text,
  p_notiz        text,
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
  insert into public.abholrunden (datum, fahrzeug, notiz, distanz_km, dauer_minuten, ab_erstem_stopp_minuten, routen_geometrie, erstellt_von_profil_id)
  values (p_datum, nullif(btrim(coalesce(p_fahrzeug, '')), ''), nullif(btrim(coalesce(p_notiz, '')), ''), p_distanz_km, p_dauer_min, p_ab_erstem, p_geometrie, v_profil)
  returning id into v_id;

  insert into public.abholstopps (runde_id, nachbarbetrieb_id, reihenfolge, menge_geplant_kg)
  select v_id, (s->>'nachbarbetrieb_id')::uuid, (s->>'reihenfolge')::integer, (s->>'menge_geplant_kg')::numeric
    from jsonb_array_elements(p_stopps) s;
  return v_id;
end;
$$;

revoke all on function public.abholrunde_anlegen(date, text, text, numeric, integer, integer, jsonb, jsonb) from public, anon;
grant execute on function public.abholrunde_anlegen(date, text, text, numeric, integer, integer, jsonb, jsonb) to authenticated;

comment on function public.abholrunde_anlegen(date, text, text, numeric, integer, integer, jsonb, jsonb) is
  'Legt eine Abholrunde mit ihren Stopps in einer Transaktion an. Scheitert ein Stopp, gibt es auch die Runde nicht. Zeilensicherheit und Trigger gelten wie beim Direktinsert.';

-- ---------------------------------------------------------------------------
-- 4. Adresssuche: Grenze je Person und Stunde
-- ---------------------------------------------------------------------------
create table if not exists public.adresssuche_protokoll (
  id          uuid primary key default gen_random_uuid(),
  profil_id   uuid not null,
  zeitpunkt   timestamptz not null default now()
);

create index if not exists idx_adresssuche_protokoll on public.adresssuche_protokoll (profil_id, zeitpunkt desc);

alter table public.adresssuche_protokoll enable row level security;
alter table public.adresssuche_protokoll force row level security;
revoke all on public.adresssuche_protokoll from public, anon, authenticated;

-- Zählt die Anfragen der Person in der letzten Stunde. Unter dem Limit: trägt die Anfrage ein und gibt true zurück. Sonst false, ohne Eintrag.
-- Die Einstellung null heißt: keine Grenze. Einträge, die älter als ein Tag sind, werden mit aufgeräumt.
create or replace function public.adresssuche_zulassen()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profil uuid;
  v_grenze numeric := public.einstellung_zahl('sicherheit.adresssuche_je_stunde');
  v_zahl   integer;
begin
  select id into v_profil from public.profiles where auth_user_id = auth.uid();
  if v_profil is null then
    return false;
  end if;
  perform pg_advisory_xact_lock(hashtext('adresssuche_' || v_profil::text));
  delete from public.adresssuche_protokoll where zeitpunkt < now() - interval '1 day';
  if v_grenze is not null then
    select count(*) into v_zahl from public.adresssuche_protokoll where profil_id = v_profil and zeitpunkt > now() - interval '1 hour';
    if v_zahl >= v_grenze then
      return false;
    end if;
  end if;
  insert into public.adresssuche_protokoll (profil_id) values (v_profil);
  return true;
end;
$$;

revoke all on function public.adresssuche_zulassen() from public, anon;
grant execute on function public.adresssuche_zulassen() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Auslieferung: festes Präfix für den Namen des Geheimnisses
-- ---------------------------------------------------------------------------
-- Wer die Integration pflegt (Administration), wählt nur den Teil hinter dem Präfix. Der Name einer anderen Umgebungsvariable (CRON_SECRET,
-- KI_ANBIETER_SCHLUESSEL, SUPABASE_SERVICE_ROLE_KEY) lässt sich damit nicht als Signaturschlüssel eintragen und über die Signatur nicht erraten.
alter table public.integrationen drop constraint if exists integrationen_geheimnis_name_check;
alter table public.integrationen drop constraint if exists integrationen_geheimnis_praefix;
alter table public.integrationen
  add constraint integrationen_geheimnis_praefix check (geheimnis_name is null or geheimnis_name ~ '^DAMICON_HOOK_[A-Z0-9_]{1,48}$');

-- ---------------------------------------------------------------------------
-- 6. Block-Risiko
-- ---------------------------------------------------------------------------
create or replace function public.risiko_parameter_pruefen()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_hoch    numeric;
  v_mittel  numeric;
  v_ziel    numeric;
  v_krit    numeric;
begin
  select coalesce(max(wert) filter (where schluessel = 'schwelle_hoch'), 0),
         coalesce(max(wert) filter (where schluessel = 'schwelle_mittel'), 0),
         coalesce(max(wert) filter (where schluessel = 'ausschuss_ziel_prozent'), 0),
         coalesce(max(wert) filter (where schluessel = 'ausschuss_kritisch_prozent'), 0)
    into v_hoch, v_mittel, v_ziel, v_krit
    from public.risiko_parameter
   where schluessel <> new.schluessel;
  if new.schluessel = 'schwelle_hoch' then v_hoch := new.wert; end if;
  if new.schluessel = 'schwelle_mittel' then v_mittel := new.wert; end if;
  if new.schluessel = 'ausschuss_ziel_prozent' then v_ziel := new.wert; end if;
  if new.schluessel = 'ausschuss_kritisch_prozent' then v_krit := new.wert; end if;

  if v_hoch <= v_mittel then
    raise exception 'Die Schwelle "hoch" muss ueber der Schwelle "mittel" liegen.' using errcode = '23514';
  end if;
  if v_krit <= v_ziel then
    raise exception 'Der kritische Ausschuss muss ueber dem Zielwert liegen.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_risiko_parameter_pruefen on public.risiko_parameter;
create trigger trg_risiko_parameter_pruefen
  before update on public.risiko_parameter
  for each row execute function public.risiko_parameter_pruefen();

-- Die Sicht rechnet mit den Zeilen, die die aufrufende Person sehen darf (security invoker). Für Rollen, die Rotationsplan, Behandlungen oder
-- Kühlketten nicht sehen, fehlen Eingaben, und die Werte fielen zu niedrig aus. Deshalb: die Rechenfassung bekommt einen neuen Namen, die Sicht
-- unter dem alten Namen liefert nur den Rollen etwas, die alle Eingaben sehen.
do $$
begin
  if to_regclass('public.v_block_risiko_roh') is null then
    alter view public.v_block_risiko rename to v_block_risiko_roh;
  end if;
end;
$$;

create or replace view public.v_block_risiko
with (security_invoker = true) as
select * from public.v_block_risiko_roh
where public.has_role('admin', 'betriebsleitung', 'brigade');

revoke all on public.v_block_risiko from public, anon;
revoke all on public.v_block_risiko_roh from public, anon;
grant select on public.v_block_risiko to authenticated;
grant select on public.v_block_risiko_roh to authenticated;

comment on view public.v_block_risiko is
  'Block-Risiko-Bewertung (WMCNL-1470) nur für Administration, Betriebsleitung und Brigade, die alle Eingaben sehen. Die Rechnung steht in v_block_risiko_roh.';
