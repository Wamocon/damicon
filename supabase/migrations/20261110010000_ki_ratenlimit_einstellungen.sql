-- =============================================================================
-- Damicon - Admin-konfigurierbares Ratenlimit fuer den KI-Assistenten
-- (Vibecode-Cleanup Phase 2, kritische Stabilisierung, Fund 1)
-- =============================================================================
-- Ausgangslage: keine Rolle mit "ki_assistent:create" (auch "kunde", externe
-- Kundschaft) hatte bisher eine Begrenzung, wie oft sie pro Zeiteinheit einen
-- echten, kostenpflichtigen Modell- bzw. Sprachdienstaufruf ausloesen kann -
-- ein Kostenmissbrauchsrisiko (kein Zugriff auf fremde Daten). Ein erster
-- Entwurf haerteten das mit einer fest codierten Konstante, auf ausdruecklichen
-- Wunsch ist die Grenze jetzt stattdessen admin-konfigurierbar, ueber die
-- Oberflaeche, dasselbe Muster wie die KI-Anbieterverwaltung
-- (20260930000000_ki_assistent.sql: ki_anbieter).
--
-- Datenmodell: eine Zeile je Rolle (public.app_role) fuer einen Sonderwert,
-- plus hoechstens eine Zeile mit rolle IS NULL fuer den globalen Standardwert.
-- Aufloesung serverseitig (src/lib/ai/ratenbegrenzung.ts,
-- ladeRatenlimitGrenze()): eigene Rollenzeile zuerst, sonst die globale
-- Zeile, sonst KEIN Limit. Ohne jede Zeile - der Zustand direkt nach dieser
-- Migration, bevor ein Admin etwas einstellt - gilt deshalb ausdruecklich
-- kein Limit: kein stiller Rueckfall auf einen Code-Standardwert.
--
-- Der eigentliche Anfragen-Zaehler (wie oft hat diese Person gerade
-- angefragt) bleibt ein einfacher In-Memory-Zaehler auf Modulebene
-- (src/lib/ai/ratenbegrenzung.ts) - nur der von einem Admin gesetzte
-- GRENZWERT wird hier dauerhaft gespeichert, keine neue Tabelle fuer den
-- Zaehlerstand selbst.
-- =============================================================================

set search_path = public;

create table public.ki_ratenlimit_einstellungen (
  id                 uuid primary key default gen_random_uuid(),
  -- NULL = globale Standardzeile (gilt fuer jede Rolle ohne eigene Zeile
  -- unten). Gesetzt = Sonderwert nur fuer genau diese Rolle, hat beim
  -- Aufloesen Vorrang vor der globalen Zeile.
  rolle              public.app_role,
  -- Anfragen je Nutzer und Minute. NULL bedeutet ausdruecklich "kein Limit"
  -- fuer GENAU DIESE Zeile (z. B. admin bewusst von einem globalen Limit
  -- ausnehmen) - das ist etwas anderes als gar keine Zeile fuer diese Rolle
  -- (dann zaehlt die naechste Ebene, siehe Dateikopf).
  grenze_pro_minute  integer,
  aktualisiert_von   uuid references public.profiles(id) on delete set null,
  aktualisiert_am    timestamptz not null default now(),
  constraint ki_ratenlimit_grenze_positiv
    check (grenze_pro_minute is null or grenze_pro_minute > 0)
);
comment on table public.ki_ratenlimit_einstellungen is
  'Admin-konfigurierbares Ratenlimit fuer kostenpflichtige KI-Aufrufe je Rolle (Vibecode-Cleanup Phase 2, Fund 1). rolle IS NULL ist die globale Standardzeile. Ohne passende Zeile (weder eigene Rolle noch global) gilt kein Limit.';

-- Hoechstens eine Zeile je Rolle, hoechstens eine globale Zeile (rolle IS
-- NULL). NULL-Werte gelten in einem gewoehnlichen unique-Index als paarweise
-- verschieden (mehrere NULL-Zeilen waeren sonst erlaubt) - deshalb zwei
-- partielle Indizes statt eines gemeinsamen. Bewusst OHNE Ausdruck wie
-- coalesce(rolle::text, ...): PGlite/Postgres verlangt fuer einen
-- Ausdrucksindex eine als IMMUTABLE markierte Funktion, und der eingebaute
-- Enum-nach-text-Cast erfuellt das nicht zuverlaessig (live gegen PGlite
-- geprueft: "functions in index expression must be marked IMMUTABLE").
create unique index ki_ratenlimit_einstellungen_rolle_key
  on public.ki_ratenlimit_einstellungen (rolle)
  where rolle is not null;

-- Hoechstens eine globale Zeile: unique-Index auf einer Konstante, beschraenkt
-- auf genau die Zeilen mit rolle IS NULL - Standardmuster in Postgres fuer
-- "hoechstens eine Zeile, die eine Bedingung erfuellt".
create unique index ki_ratenlimit_einstellungen_global_key
  on public.ki_ratenlimit_einstellungen ((true))
  where rolle is null;

alter table public.ki_ratenlimit_einstellungen enable row level security;

-- Dasselbe Muster wie ki_anbieter: ausschliesslich admin darf die
-- Einstellungen lesen und schreiben (auch ceo nicht - dieselbe Begruendung
-- wie beim Ausschluss von "ki_assistent:manage" fuer ceo in rbac.ts: ein
-- IT-Betriebsthema, kein Fuehrungsthema). Die tatsaechliche Durchsetzung
-- (ladeRatenlimitGrenze(), src/lib/ai/ratenbegrenzung.ts) laeuft ueber den
-- service_role-Client, NACH requirePermission()/der Sitzungspruefung im
-- jeweiligen Aufrufer - dieselbe Begruendung wie bei
-- ladeAktivenStandardAnbieter() (lib/ai/lade-anbieter.ts): JEDE anfragende
-- Rolle (auch "kunde") muss ihre eigene Grenze lesen koennen, RLS hier
-- schuetzt ausschliesslich die Verwaltungsoberflaeche.
create policy ki_ratenlimit_einstellungen_admin_alles on public.ki_ratenlimit_einstellungen
  for all to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

-- Setzt/aktualisiert die Zeile einer Rolle (p_rolle null = globale
-- Standardzeile). p_grenze null bedeutet ausdruecklich "kein Limit" fuer
-- GENAU DIESE Zeile (nicht: Zeile loeschen - siehe ki_ratenlimit_entfernen()
-- fuer "wieder auf die naechste Ebene zurueckfallen"). security invoker +
-- has_role()-Pruefung, dasselbe Muster wie ki_anbieter_standard_setzen()
-- (20260930000000_ki_assistent.sql).
create or replace function public.ki_ratenlimit_setzen(p_rolle public.app_role, p_grenze integer)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_aktualisiert_von uuid;
begin
  if not public.has_role('admin') then
    raise exception 'keine-berechtigung' using errcode = '42501';
  end if;
  if p_grenze is not null and p_grenze <= 0 then
    raise exception 'grenze-ungueltig' using errcode = '23514';
  end if;

  v_aktualisiert_von := (select p.id from public.profiles p where p.auth_user_id = auth.uid());

  -- Zwei Zweige statt einer gemeinsamen Anweisung: der Konfliktziel-Index
  -- (Arbiter) muss zur Aufrufzeit feststehen, "rolle" und "(true)" sind zwei
  -- verschiedene partielle Indizes (siehe oben) - ein Platzhalter kann hier
  -- nicht zwischen beiden waehlen.
  if p_rolle is null then
    insert into public.ki_ratenlimit_einstellungen (rolle, grenze_pro_minute, aktualisiert_von, aktualisiert_am)
    values (null, p_grenze, v_aktualisiert_von, now())
    on conflict ((true)) where rolle is null
    do update set
      grenze_pro_minute = excluded.grenze_pro_minute,
      aktualisiert_von = excluded.aktualisiert_von,
      aktualisiert_am = now();
  else
    insert into public.ki_ratenlimit_einstellungen (rolle, grenze_pro_minute, aktualisiert_von, aktualisiert_am)
    values (p_rolle, p_grenze, v_aktualisiert_von, now())
    on conflict (rolle) where rolle is not null
    do update set
      grenze_pro_minute = excluded.grenze_pro_minute,
      aktualisiert_von = excluded.aktualisiert_von,
      aktualisiert_am = now();
  end if;
end;
$$;
comment on function public.ki_ratenlimit_setzen is
  'Setzt oder aktualisiert das Ratenlimit fuer eine Rolle (p_rolle null = globale Standardzeile). p_grenze null = ausdruecklich kein Limit fuer diese Zeile.';

-- Entfernt die Zeile einer Rolle wieder - danach zaehlt fuer diese Rolle
-- wieder die naechste Ebene (globale Zeile bzw. kein Limit), siehe
-- ladeRatenlimitGrenze().
create or replace function public.ki_ratenlimit_entfernen(p_rolle public.app_role)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.has_role('admin') then
    raise exception 'keine-berechtigung' using errcode = '42501';
  end if;

  delete from public.ki_ratenlimit_einstellungen
   where (p_rolle is null and rolle is null) or rolle = p_rolle;
end;
$$;
comment on function public.ki_ratenlimit_entfernen is
  'Entfernt die Ratenlimit-Zeile einer Rolle (p_rolle null = globale Standardzeile) - danach gilt fuer diese Rolle wieder die naechste Ebene bzw. kein Limit.';
