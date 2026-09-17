-- =============================================================================
-- Damicon - Ruecknahme einer freigegebenen Lohnabrechnung nur im Vier-Augen-Prinzip
-- =============================================================================
-- lohn_abrechnung_freigabe_pruefen() (20260908130000_lohn_qualitaetsfaktor.sql)
-- sperrt bisher nur den Weg aus 'ausgezahlt' heraus. Der Ruecksprung
-- 'freigegeben' -> 'entwurf' ist ausdruecklich erlaubt - gedacht als Weg fuer
-- eine Korrektur. Wer ihn geht, ist aber niemand anderes als die Person, die
-- freigegeben hat: lohn_abrechnungen_update_buchhaltung erlaubt admin und
-- buchhaltung, und dieselbe Rolle rechnet die Periode auch neu
-- (lohn_periode_berechnen ueberschreibt jede Zeile im Status 'entwurf').
-- Freigabe, Ruecknahme und Neuberechnung lagen damit in einer Hand, und
-- src/lib/actions/lohn.ts behauptete im Kommentar das Gegenteil ("blockt jede
-- Ruecknahme").
--
-- Diese Migration laesst den Korrekturweg bestehen, verlangt dafuer aber eine
-- zweite Person:
--   * Wer freigibt, wird mitgeschrieben (freigegeben_von_profil_id,
--     freigegeben_am) - vorher stand nirgends, wer freigegeben hat.
--   * Die Ruecknahme muss von einer anderen Person kommen als die Freigabe.
--   * Mit der Ruecknahme fallen beide Felder zurueck auf null, die naechste
--     Freigabe schreibt sie neu.
--   * 'entwurf' -> 'ausgezahlt' direkt ist nicht mehr moeglich: eine
--     Auszahlung ohne Freigabe war bisher ein zulaessiger Statuswechsel.
--
-- Serverseitige Aufrufe (auth.uid() is null: Seed, Fixtures, Testaufbau)
-- bleiben aussen vor - dasselbe Muster wie block_erntebuchung_mutation().
--
-- BEWUSST NICHT TEIL DIESER MIGRATION: dass auch die Freigabe selbst eine
-- zweite Person verlangt (die Buchhaltung rechnet und gibt frei). Das ist
-- eine betriebliche Festlegung ueber Zustaendigkeiten, keine technische, und
-- gehoert mit dem Betrieb abgestimmt. Der Befund ist damit nicht geschlossen,
-- nur die stille Selbst-Ruecknahme ist es.
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. Wer hat freigegeben?
-- ---------------------------------------------------------------------------
alter table public.lohn_abrechnungen
  add column if not exists freigegeben_von_profil_id uuid references public.profiles(id) on delete set null,
  add column if not exists freigegeben_am timestamptz;

comment on column public.lohn_abrechnungen.freigegeben_von_profil_id is
  'Profil, das diese Abrechnung freigegeben hat. Grundlage des Vier-Augen-Prinzips: die Ruecknahme auf entwurf muss von einer anderen Person kommen (20261017000000).';
comment on column public.lohn_abrechnungen.freigegeben_am is
  'Zeitpunkt der Freigabe, serverseitig gesetzt.';

create or replace function public.current_profil_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.profiles where auth_user_id = auth.uid() limit 1;
$$;

comment on function public.current_profil_id is
  'Profil-ID der aktuell angemeldeten Person, oder null bei einem serverseitigen Aufruf (service_role).';

-- ---------------------------------------------------------------------------
-- 2. Statuswechsel pruefen
-- ---------------------------------------------------------------------------
create or replace function public.lohn_abrechnung_freigabe_pruefen()
returns trigger
language plpgsql
as $$
declare
  v_profil uuid;
begin
  -- Einmal ausgezahlt bleibt ausgezahlt - die Auszahlung ist ein bereits
  -- vollzogener externer Vorgang, keine Zurueckstufung korrigiert das.
  if old.status = 'ausgezahlt' and new.status <> 'ausgezahlt' then
    raise exception 'Eine ausgezahlte Lohnabrechnung laesst sich nicht zurueckstufen.'
      using errcode = 'check_violation';
  end if;

  -- Nach der Freigabe sind die Betraege ein abgenommener Wert. Eine Korrektur
  -- fuehrt ueber den Ruecksprung auf 'entwurf' (Abschnitt unten), nicht ueber
  -- ein stillschweigendes Ueberschreiben bei gleichbleibendem Status.
  if old.status in ('freigegeben', 'ausgezahlt')
     and new.status = old.status
     and (
       new.grundlohn_tenge is distinct from old.grundlohn_tenge
       or new.mengen_komponente_tenge is distinct from old.mengen_komponente_tenge
       or new.qualitaetsfaktor is distinct from old.qualitaetsfaktor
       or new.gesamt_tenge is distinct from old.gesamt_tenge
       or new.stunden is distinct from old.stunden
       or new.menge_kg is distinct from old.menge_kg
     ) then
    raise exception 'Die Betraege einer freigegebenen Abrechnung aendern sich nur ueber eine neue Entwurfsfassung.'
      using errcode = 'check_violation';
  end if;

  -- Eine Auszahlung ohne vorherige Freigabe ist kein zulaessiger Weg.
  if old.status = 'entwurf' and new.status = 'ausgezahlt' then
    raise exception 'Eine Abrechnung wird erst freigegeben und dann ausgezahlt.'
      using errcode = 'check_violation';
  end if;

  v_profil := public.current_profil_id();

  -- Freigabe: festhalten, wer sie erteilt hat.
  if old.status = 'entwurf' and new.status = 'freigegeben' then
    new.freigegeben_von_profil_id := coalesce(v_profil, new.freigegeben_von_profil_id);
    new.freigegeben_am := now();
  end if;

  -- Ruecknahme: nur durch jemand anderen als die freigebende Person.
  if old.status = 'freigegeben' and new.status = 'entwurf' then
    if auth.uid() is not null
       and old.freigegeben_von_profil_id is not null
       and v_profil is not distinct from old.freigegeben_von_profil_id then
      raise exception
        'Die Ruecknahme einer Freigabe braucht eine zweite Person - wer freigegeben hat, nimmt nicht selbst zurueck.'
        using errcode = 'insufficient_privilege';
    end if;
    new.freigegeben_von_profil_id := null;
    new.freigegeben_am := null;
  end if;

  return new;
end;
$$;

comment on function public.lohn_abrechnung_freigabe_pruefen is
  'Schuetzt eine freigegebene/ausgezahlte Lohnabrechnung: keine stille Betragsaenderung, keine Auszahlung ohne Freigabe, keine Ruecknahme durch die freigebende Person selbst (Vier-Augen-Prinzip, 20261017000000).';
