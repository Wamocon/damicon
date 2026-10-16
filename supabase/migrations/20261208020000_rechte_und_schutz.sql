-- =============================================================================
-- Damicon - Rechte und Schutz: die Entscheidungen aus OFFENE-PUNKTE.md, Kapitel 1 (15.10.2026)
-- =============================================================================
-- Die Datenbank folgt ab jetzt der Rechtematrix (src/lib/rbac.ts), wo beide bisher auseinanderliefen. Maßstab ist das geringste Recht, das die
-- Anwendung für ihre Abläufe braucht. Keine Datenänderung an vorhandenen Zeilen.
--
--   1. Preislisten lesen: Büro (Administration, Geschäftsführung, Betriebsleitung, Buchhaltung) alle, ein Kunde nur die Listen seiner eigenen
--      Kundengruppe und die gruppenlosen Standardlisten. Brigade, Pflücker und Erzeuger lesen keine Preislisten (die Anwendung zeigt sie ihnen
--      nirgends). Vorher las jede angemeldete Rolle alle Preislisten, ein Kunde also auch die der anderen Kundengruppen.
--   2. Preislisten schreiben: Administration, Geschäftsführung und Betriebsleitung, wie in der Matrix. Die Buchhaltung liest nur. Eine
--      Preisliste selbst wird nicht mehr gelöscht (sie ist Grundlage bereits berechneter Beträge), nur ihre Positionen.
--   3. Pflanzenschutz lesen: Behandlungen und Mittel sehen Administration, Geschäftsführung, Betriebsleitung und Brigade. Buchhaltung und
--      Erzeuger sehen in der Blockliste nur die Sperre (bis wann, wie viele Tage), nicht Mittel und Wirkstoff: Sicht v_block_sperre.
--   4. Abholrunden: Planen und Löschen nur Administration, Geschäftsführung, Betriebsleitung (wie "logistik" in der Matrix). Die Brigade fährt
--      die Runde (Start, Abholung, Abschluss), ändert aber weder Datum, Fahrzeug, Strecke noch geplante Mengen (DA015).
--   5. Nachrichten zu Vorbestellungen schreiben: Kunde, Administration, Geschäftsführung, Betriebsleitung. Die Buchhaltung liest (Matrix:
--      b2b_portal nur "sehen"). Neu: Anonymisieren auf Anweisung der Administration (Datenschutz), der Verlauf bleibt, Text und Name werden
--      entfernt, wer es wann warum tat steht an der Zeile (DA018).
--   6. Messprotokoll: Die Herkunft "logger" setzt nur noch die Funktion transport_logger_messungen_importieren(). Ein Direktinsert mit
--      quelle = logger lehnt die Datenbank ab (DA018). Die Kennzeichnung wird damit ein Nachweis der Importstrecke.
--   7. Konten löschen: Die Fremdschlüssel der Urheber an unveränderlichen Zeilen (ЭСФ-Beleg, Stand der Wirtschaftlichkeit, Abholrunde) entfallen
--      wie schon bei den Nachrichten. Eine Person lässt sich löschen, die Urheberkennung bleibt als Zahl ohne Namen stehen.
--   8. ЕСУТД: Jedes Erfassen und jedes Wiederöffnen einer Meldung steht im Verlauf esutd_meldeverlauf (unveränderlich), mit den Angaben, die
--      beim Wiederöffnen aus der Meldung verschwinden.
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. Preislisten lesen
-- ---------------------------------------------------------------------------
create or replace function public.current_kundengruppe()
returns public.kundengruppe
language sql
stable
security definer
set search_path = public
as $$
  select k.kundengruppe from public.b2b_kunden k where k.id = public.current_b2b_kunde_id();
$$;

revoke all on function public.current_kundengruppe() from public, anon;
grant execute on function public.current_kundengruppe() to authenticated;

comment on function public.current_kundengruppe() is
  'Kundengruppe des B2B-Kunden der angemeldeten Person, für Policies der Preislisten. Null ohne Kundenbezug oder ohne zugeordnete Gruppe.';

drop policy if exists preislisten_select_intern on public.preislisten;
create policy preislisten_select_rollen on public.preislisten
  for select to authenticated
  using (
    public.has_role('admin', 'betriebsleitung', 'buchhaltung')
    or (
      public.current_app_role() = 'kunde'
      and (kundengruppe is null or kundengruppe = public.current_kundengruppe())
    )
  );

drop policy if exists preislisten_positionen_select_intern on public.preislisten_positionen;
create policy preislisten_positionen_select_rollen on public.preislisten_positionen
  for select to authenticated
  using (exists (select 1 from public.preislisten p where p.id = preislisten_positionen.preisliste_id));

-- ---------------------------------------------------------------------------
-- 2. Preislisten schreiben
-- ---------------------------------------------------------------------------
drop policy if exists preislisten_write_buero on public.preislisten;
create policy preislisten_insert_leitung on public.preislisten
  for insert to authenticated with check (public.has_role('admin', 'betriebsleitung'));
create policy preislisten_update_leitung on public.preislisten
  for update to authenticated
  using (public.has_role('admin', 'betriebsleitung'))
  with check (public.has_role('admin', 'betriebsleitung'));

drop policy if exists preislisten_positionen_write_buero on public.preislisten_positionen;
create policy preislisten_positionen_insert_leitung on public.preislisten_positionen
  for insert to authenticated with check (public.has_role('admin', 'betriebsleitung'));
create policy preislisten_positionen_update_leitung on public.preislisten_positionen
  for update to authenticated
  using (public.has_role('admin', 'betriebsleitung'))
  with check (public.has_role('admin', 'betriebsleitung'));
create policy preislisten_positionen_delete_leitung on public.preislisten_positionen
  for delete to authenticated using (public.has_role('admin', 'betriebsleitung'));

-- ---------------------------------------------------------------------------
-- 3. Pflanzenschutz lesen
-- ---------------------------------------------------------------------------
drop policy if exists pflanzenschutz_behandlungen_select_produktion on public.pflanzenschutz_behandlungen;
create policy pflanzenschutz_behandlungen_select_leitung on public.pflanzenschutz_behandlungen
  for select to authenticated
  using (public.has_role('admin', 'betriebsleitung', 'brigade'));

drop policy if exists psm_mittel_select_produktion on public.psm_mittel;
create policy psm_mittel_select_leitung on public.psm_mittel
  for select to authenticated
  using (public.has_role('admin', 'betriebsleitung', 'brigade'));

-- Die Sperre eines Blocks (Wartezeit nach der Behandlung) braucht jede Rolle, die die Blockliste sieht. Mittel und Wirkstoff dagegen nur
-- die, die Behandlungen ausführt oder prüft. Die Sicht läuft mit den Rechten des Eigentümers und prüft die Rolle selbst.
create or replace view public.v_block_sperre as
select
  b.reihenblock_id,
  b.behandelt_am,
  b.wartezeit_tage,
  b.freigabe_am,
  case when public.has_role('admin', 'betriebsleitung', 'brigade') then m.name end      as mittel_name,
  case when public.has_role('admin', 'betriebsleitung', 'brigade') then m.wirkstoff end as mittel_wirkstoff
from public.pflanzenschutz_behandlungen b
join public.psm_mittel m on m.id = b.psm_mittel_id
where not b.freigegeben
  and public.has_role('admin', 'betriebsleitung', 'buchhaltung', 'brigade', 'erzeuger');

revoke all on public.v_block_sperre from public, anon;
grant select on public.v_block_sperre to authenticated;

comment on view public.v_block_sperre is
  'Offene Erntesperren je Block (noch nicht quittierte Behandlungen). Mittel und Wirkstoff nur für Administration, Betriebsleitung und Brigade; Buchhaltung und Erzeuger sehen bis wann der Block gesperrt ist.';

-- ---------------------------------------------------------------------------
-- 4. Abholrunden: planen nur die Leitung, die Brigade fährt
-- ---------------------------------------------------------------------------
drop policy if exists abholrunden_select on public.abholrunden;
drop policy if exists abholrunden_insert on public.abholrunden;
drop policy if exists abholrunden_update on public.abholrunden;
drop policy if exists abholrunden_delete on public.abholrunden;
create policy abholrunden_select on public.abholrunden
  for select to authenticated using (public.has_role('admin', 'betriebsleitung', 'brigade'));
create policy abholrunden_insert on public.abholrunden
  for insert to authenticated with check (public.has_role('admin', 'betriebsleitung'));
create policy abholrunden_update on public.abholrunden
  for update to authenticated
  using (public.has_role('admin', 'betriebsleitung', 'brigade'))
  with check (public.has_role('admin', 'betriebsleitung', 'brigade'));
create policy abholrunden_delete on public.abholrunden
  for delete to authenticated using (public.has_role('admin', 'betriebsleitung'));

drop policy if exists abholstopps_select on public.abholstopps;
drop policy if exists abholstopps_insert on public.abholstopps;
drop policy if exists abholstopps_update on public.abholstopps;
drop policy if exists abholstopps_delete on public.abholstopps;
create policy abholstopps_select on public.abholstopps
  for select to authenticated using (public.has_role('admin', 'betriebsleitung', 'brigade'));
create policy abholstopps_insert on public.abholstopps
  for insert to authenticated with check (public.has_role('admin', 'betriebsleitung'));
create policy abholstopps_update on public.abholstopps
  for update to authenticated
  using (public.has_role('admin', 'betriebsleitung', 'brigade'))
  with check (public.has_role('admin', 'betriebsleitung', 'brigade'));
create policy abholstopps_delete on public.abholstopps
  for delete to authenticated using (public.has_role('admin', 'betriebsleitung'));

-- Die Nachbarbetriebe der Runde: Leitung alle, Brigade nur die Betriebe in einem Stopp (wie bisher), die Buchhaltung gar nicht.
create or replace function public.abholrunde_nachbarbetriebe()
returns table (id uuid, name text, ort text, adresse text, kontakt text, breitengrad numeric, laengengrad numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.has_role('admin', 'betriebsleitung') then
    return query
      select n.id, n.name, n.ort, n.adresse, n.kontakt, n.breitengrad, n.laengengrad
        from public.nachbarbetriebe n;
  elsif public.current_app_role() = 'brigade' then
    return query
      select n.id, n.name, n.ort, n.adresse, n.kontakt, n.breitengrad, n.laengengrad
        from public.nachbarbetriebe n
       where exists (select 1 from public.abholstopps s where s.nachbarbetrieb_id = n.id);
  end if;
end;
$$;

-- Was die Brigade an einer Runde und an ihren Stopps ändern darf: den Ablauf. Planung und Strecke gehören der Leitung.
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
       or new.sorte_id is distinct from old.sorte_id then
      raise exception 'Reihenfolge und geplante Menge eines Stopps plant die Betriebsleitung.'
        using errcode = 'DA015';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_abholrunde_brigade_grenzen on public.abholrunden;
create trigger trg_abholrunde_brigade_grenzen
  before update on public.abholrunden
  for each row execute function public.abholrunde_brigade_grenzen();

drop trigger if exists trg_abholstopp_brigade_grenzen on public.abholstopps;
create trigger trg_abholstopp_brigade_grenzen
  before update on public.abholstopps
  for each row execute function public.abholrunde_brigade_grenzen();

-- ---------------------------------------------------------------------------
-- 5. Nachrichten zu Vorbestellungen
-- ---------------------------------------------------------------------------
drop policy if exists vorbestellung_nachrichten_insert on public.vorbestellung_nachrichten;
create policy vorbestellung_nachrichten_insert on public.vorbestellung_nachrichten
  for insert to authenticated
  with check (
    exists (select 1 from public.vorbestellungen v where v.id = vorbestellung_id)
    and (public.current_app_role() = 'kunde' or public.has_role('admin', 'betriebsleitung'))
    and autor_profil_id = (select p.id from public.profiles p where p.auth_user_id = auth.uid())
  );

alter table public.vorbestellung_nachrichten
  add column if not exists anonymisiert_am timestamptz,
  add column if not exists anonymisiert_von uuid,
  add column if not exists anonymisiert_grund text
    check (anonymisiert_grund is null or char_length(btrim(anonymisiert_grund)) between 3 and 300);

comment on column public.vorbestellung_nachrichten.anonymisiert_am is
  'Zeitpunkt der Anonymisierung auf Anweisung der Administration (Datenschutz). Text und Name der Zeile sind dann entfernt, der Verlauf bleibt.';
comment on column public.vorbestellung_nachrichten.anonymisiert_von is
  'Profil der Person, die anonymisiert hat. Ohne Fremdschlüssel, die Zeile bleibt unveränderlich.';

-- Unveränderlich bleibt die Zeile weiter. Die einzige Änderung ist die Anonymisierung durch die Funktion unten, die dafür eine
-- transaktionslokale Markierung setzt. Von außen (PostgREST) lässt sich diese Markierung nicht setzen.
create or replace function public.vorbestellung_nachricht_schuetzen()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Nachrichten zu Vorbestellungen sind unveraenderlich. Loeschen nicht erlaubt.' using errcode = 'DA018';
  end if;
  if coalesce(current_setting('damicon.nachricht_anonymisieren', true), '') <> 'ja' then
    raise exception 'Nachrichten zu Vorbestellungen sind unveraenderlich. Aendern nicht erlaubt.' using errcode = 'DA018';
  end if;
  if old.anonymisiert_am is not null then
    raise exception 'Diese Nachricht ist schon anonymisiert.' using errcode = 'DA018';
  end if;
  if new.id is distinct from old.id
     or new.vorbestellung_id is distinct from old.vorbestellung_id
     or new.autor_rolle is distinct from old.autor_rolle
     or new.created_at is distinct from old.created_at then
    raise exception 'Die Anonymisierung ersetzt nur Text und Namen.' using errcode = 'DA018';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_vorbestellung_nachricht_unveraenderlich on public.vorbestellung_nachrichten;
create trigger trg_vorbestellung_nachricht_unveraenderlich
  before update or delete on public.vorbestellung_nachrichten
  for each row execute function public.vorbestellung_nachricht_schuetzen();

create or replace function public.vorbestellung_nachricht_anonymisieren(p_id uuid, p_grund text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profil uuid;
  v_grund  text := btrim(coalesce(p_grund, ''));
  v_zeilen integer;
begin
  -- coalesce: has_role() ist null, wenn die Person keine App-Rolle hat. "not null" wäre null und liesse die Prüfung durch.
  if not coalesce(public.has_role('admin'), false) then
    raise exception 'Nur die Administration oder die Geschaeftsfuehrung darf eine Nachricht anonymisieren.' using errcode = '42501';
  end if;
  if char_length(v_grund) < 3 or char_length(v_grund) > 300 then
    raise exception 'Der Grund fehlt oder ist zu lang (3 bis 300 Zeichen).' using errcode = '23514';
  end if;
  select id into v_profil from public.profiles where auth_user_id = auth.uid();

  perform set_config('damicon.nachricht_anonymisieren', 'ja', true);
  update public.vorbestellung_nachrichten
     set text = '[entfernt]',
         autor_name = '[entfernt]',
         autor_profil_id = null,
         anonymisiert_am = now(),
         anonymisiert_von = v_profil,
         anonymisiert_grund = v_grund
   where id = p_id and anonymisiert_am is null;
  -- Vor dem nächsten PERFORM lesen: PERFORM setzt FOUND selbst.
  get diagnostics v_zeilen = row_count;
  perform set_config('damicon.nachricht_anonymisieren', '', true);

  if v_zeilen = 0 then
    raise exception 'Nachricht nicht gefunden oder schon anonymisiert.' using errcode = 'DA018';
  end if;
end;
$$;

revoke all on function public.vorbestellung_nachricht_anonymisieren(uuid, text) from public, anon;
grant execute on function public.vorbestellung_nachricht_anonymisieren(uuid, text) to authenticated;

comment on function public.vorbestellung_nachricht_anonymisieren(uuid, text) is
  'Datenschutz: entfernt Text und Namen einer Nachricht, der Verlauf bleibt. Nur Administration und Geschaeftsfuehrung, mit Grund. Die Zeile bleibt danach unveraenderlich.';

-- ---------------------------------------------------------------------------
-- 6. Messprotokoll: die Herkunft "logger" nur über die Importfunktion
-- ---------------------------------------------------------------------------
create or replace function public.transport_logger_quelle_pruefen()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Innerhalb der Importfunktion (security definer) ist current_user ihr Eigentümer. Eine Person mit der Datenbankrolle authenticated
  -- trägt die Herkunft nicht von Hand ein.
  if new.quelle = 'logger' and current_user in ('authenticated', 'anon') then
    raise exception 'Die Herkunft "logger" setzt nur der Import einer Loggerdatei.' using errcode = 'DA018';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_transport_logger_quelle_pruefen on public.transport_temperatur_messungen;
create trigger trg_transport_logger_quelle_pruefen
  before insert on public.transport_temperatur_messungen
  for each row execute function public.transport_logger_quelle_pruefen();

create or replace function public.transport_logger_messungen_importieren(p_lieferung_id uuid, p_logger_kennung text, p_messwerte jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anzahl integer;
  v_kennung text := nullif(btrim(coalesce(p_logger_kennung, '')), '');
begin
  if not coalesce(public.has_role('admin', 'betriebsleitung', 'brigade'), false) then
    raise exception 'Keine Berechtigung fuer den Import einer Loggerdatei.' using errcode = '42501';
  end if;
  if p_messwerte is null or jsonb_typeof(p_messwerte) <> 'array' or jsonb_array_length(p_messwerte) not between 1 and 1000 then
    raise exception 'Ein Import umfasst 1 bis 1000 Messwerte.' using errcode = '23514';
  end if;
  if v_kennung is not null and char_length(v_kennung) > 60 then
    raise exception 'Die Kennung des Loggers hat hoechstens 60 Zeichen.' using errcode = '23514';
  end if;

  insert into public.transport_temperatur_messungen (lieferung_id, temperatur_c, geraet_zeitpunkt, gemessen_am, quelle, logger_kennung)
  select p_lieferung_id, w.temperatur_c, w.geraet_zeitpunkt, null, 'logger', v_kennung
    from jsonb_to_recordset(p_messwerte) as w(temperatur_c numeric, geraet_zeitpunkt timestamptz);
  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end;
$$;

revoke all on function public.transport_logger_messungen_importieren(uuid, text, jsonb) from public, anon;
grant execute on function public.transport_logger_messungen_importieren(uuid, text, jsonb) to authenticated;

comment on function public.transport_logger_messungen_importieren(uuid, text, jsonb) is
  'Import einer Loggerdatei (WMCNL-1517): schreibt Messwerte mit der Herkunft logger. Die Regeln des Triggers transport_kuehlkette_bewerten() gelten weiter (Geraetezeit, Status der Lieferung). Nur Administration, Betriebsleitung und Brigade.';

-- ---------------------------------------------------------------------------
-- 7. Konten löschen: Urheberkennung ohne Fremdschlüssel an unveränderlichen Zeilen
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select c.conrelid::regclass as tabelle, c.conname
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
     where c.contype = 'f'
       and c.confrelid = 'public.profiles'::regclass
       and ((c.conrelid = 'public.esf_belege'::regclass and a.attname = 'erstellt_von_profil_id')
         or (c.conrelid = 'public.wirtschaftlichkeit_staende'::regclass and a.attname = 'erstellt_von_profil_id')
         or (c.conrelid = 'public.abholrunden'::regclass and a.attname = 'erstellt_von_profil_id'))
  loop
    execute format('alter table %s drop constraint %I;', r.tabelle, r.conname);
  end loop;
end;
$$;

comment on column public.esf_belege.erstellt_von_profil_id is
  'Profil der Person, die den Beleg angelegt hat. Ohne Fremdschlüssel: Der Beleg wird unveränderlich, ein "on delete set null" wäre eine Änderung. Nach dem Löschen eines Kontos bleibt die Kennung als Zahl ohne Namen stehen.';
comment on column public.wirtschaftlichkeit_staende.erstellt_von_profil_id is
  'Profil der Person, die den Stand festgehalten hat. Ohne Fremdschlüssel aus demselben Grund wie bei esf_belege.';
comment on column public.abholrunden.erstellt_von_profil_id is
  'Profil der Person, die die Runde geplant hat. Ohne Fremdschlüssel: Eine abgeschlossene Runde ändert sich nicht mehr.';

-- ---------------------------------------------------------------------------
-- 8. ЕСУТД: Verlauf der Meldungen
-- ---------------------------------------------------------------------------
create table if not exists public.esutd_meldeverlauf (
  id                 uuid primary key default gen_random_uuid(),
  -- Ohne Fremdschlüssel: Der Verlauf überlebt das Löschen einer offenen Meldung, und die Zeile bleibt unveränderlich.
  vertrag_id         uuid not null,
  ereignis_id        uuid,
  art                text not null check (art in ('abschluss', 'aenderung', 'beendigung')),
  pfluecker_id       uuid not null,
  aktion             text not null check (aktion in ('erfasst', 'geoeffnet')),
  erfasst_am         date,
  bestaetigung       text,
  beleg_dokument_id  uuid,
  von_profil_id      uuid,
  created_at         timestamptz not null default now()
);

comment on table public.esutd_meldeverlauf is
  'Verlauf der ЕСУТД-Meldungen: jedes Erfassen und jedes Wiederöffnen, beim Wiederöffnen mit den Angaben, die aus der Meldung verschwinden. Append-only.';
create index if not exists idx_esutd_meldeverlauf_vertrag on public.esutd_meldeverlauf (vertrag_id, created_at);

create or replace function public.esutd_meldeverlauf_schreiben()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profil uuid;
  v_art    text;
  v_ereignis uuid;
  v_vertrag uuid;
  v_pfluecker uuid;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  select id into v_profil from public.profiles where auth_user_id = auth.uid();

  if tg_table_name = 'esutd_vertraege' then
    v_art := 'abschluss';
    v_vertrag := new.id;
    v_pfluecker := new.pfluecker_id;
  else
    v_art := new.art;
    v_ereignis := new.id;
    v_vertrag := new.vertrag_id;
    select pfluecker_id into v_pfluecker from public.esutd_vertraege where id = new.vertrag_id;
  end if;

  if new.status = 'erfasst' then
    insert into public.esutd_meldeverlauf (vertrag_id, ereignis_id, art, pfluecker_id, aktion, erfasst_am, bestaetigung, beleg_dokument_id, von_profil_id)
    values (v_vertrag, v_ereignis, v_art, v_pfluecker, 'erfasst', new.erfasst_am, new.bestaetigung, new.beleg_dokument_id, v_profil);
  else
    -- Wiederöffnen: festgehalten wird, was die Meldung vorher trug.
    insert into public.esutd_meldeverlauf (vertrag_id, ereignis_id, art, pfluecker_id, aktion, erfasst_am, bestaetigung, beleg_dokument_id, von_profil_id)
    values (v_vertrag, v_ereignis, v_art, v_pfluecker, 'geoeffnet', old.erfasst_am, old.bestaetigung, old.beleg_dokument_id, v_profil);
  end if;
  return new;
end;
$$;

revoke all on function public.esutd_meldeverlauf_schreiben() from public, anon, authenticated;

-- AFTER-Trigger: Wenn die Prüf-Trigger (BEFORE) die Angaben beim Wiederöffnen leeren, steht in OLD noch der alte Stand.
drop trigger if exists trg_esutd_vertrag_verlauf on public.esutd_vertraege;
create trigger trg_esutd_vertrag_verlauf
  after update on public.esutd_vertraege
  for each row execute function public.esutd_meldeverlauf_schreiben();

drop trigger if exists trg_esutd_ereignis_verlauf on public.esutd_ereignisse;
create trigger trg_esutd_ereignis_verlauf
  after update on public.esutd_ereignisse
  for each row execute function public.esutd_meldeverlauf_schreiben();

create or replace function public.esutd_meldeverlauf_unveraenderlich()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Der Verlauf der ЕСУТД-Meldungen ist unveraenderlich. % nicht erlaubt.', tg_op using errcode = 'DA018';
end;
$$;

drop trigger if exists trg_esutd_meldeverlauf_unveraenderlich on public.esutd_meldeverlauf;
create trigger trg_esutd_meldeverlauf_unveraenderlich
  before update or delete on public.esutd_meldeverlauf
  for each row execute function public.esutd_meldeverlauf_unveraenderlich();

alter table public.esutd_meldeverlauf enable row level security;
alter table public.esutd_meldeverlauf force row level security;

create policy esutd_meldeverlauf_select on public.esutd_meldeverlauf
  for select to authenticated using (public.has_role('admin', 'betriebsleitung', 'buchhaltung'));

revoke all on public.esutd_meldeverlauf from public, anon, authenticated;
grant select on public.esutd_meldeverlauf to authenticated;
