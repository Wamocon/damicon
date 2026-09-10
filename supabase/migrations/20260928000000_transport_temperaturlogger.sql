-- =============================================================================
-- Damicon - Temperaturlogger fuer die Transportphase, lueckenloser
-- Kuehlkettennachweis bis zum Kunden (Masterplan-Anforderung 3.2)
-- =============================================================================
-- kuehlketten_messungen deckt ausschliesslich die Vorkuehlung am Hof ab: der
-- Trigger kuehlkette_bewerten() (Migration 20260911000000) misst die Minuten
-- seit dem Pflueckzeitpunkt und schreibt chargen.vorkuehlung_zeitpunkt fort -
-- eine Messung waehrend des tatsaechlichen Transports zum Kunden wuerde diese
-- Kennzahl verfaelschen (v_pflueck bliebe derselbe, "Minuten seit Pfluecken"
-- haette fuer eine Transportmessung Stunden spaeter keine sinnvolle Bedeutung
-- mehr) und die 60/45-Minuten-Grenze gilt dort ohnehin nicht. Deshalb eine
-- eigene, schlanke Tabelle statt eines ueberladenen Phasen-Flags auf der
-- bestehenden Tabelle - dieselbe Entscheidung wie bei der Uebergabequittung
-- (eigene lieferungen-Spalten statt Wiederverwendung von pflueckaufgaben).
--
-- Verknuepfung ueber lieferungen (nicht direkt ueber chargen): eine Lieferung
-- ist bereits die fachliche Klammer fuer "eine Fahrt zu einem Kunden"
-- (Anforderung 3.5 Teil 2, Migration 20260926000000) und traegt selbst schon
-- charge_id - damit ist die Kette Charge -> Lieferung -> Transportmessung ->
-- Uebergabe beim Kunden lueckenlos abbildbar, ohne eine zweite, parallele
-- Fremdschluessel-Spur auf chargen zu eroeffnen.
--
-- Wiederverwendete, bereits etablierte Muster statt neuer Konzepte:
--   * Geraet-/Server-Zeitstempel (geraet_zeitpunkt_pruefen(), Migration
--     20260911000000) - dieselbe Funktion, keine Kopie der Pruefgrenzen.
--   * kuehlkette_ergebnis-Enum (ok/warnung/verstoss) - keine neue Skala.
--   * Die reine Temperaturbewertung selbst ist keine neue Geschaeftsregel,
--     sondern liegt bereits in kuehlkette_bewerten() (Migration
--     20260911000000) eingebettet: "temperatur_c > 8" ist dort unabhaengig
--     von der Zeit immer ein Verstoss, "temperatur_c > 4" traegt (neben der
--     Minutengrenze) bereits allein zur Warnung bei. Diese Bandbreite (<=4
--     ok, 4 bis 8 warnung, > 8 verstoss) wird hier unveraendert uebernommen,
--     nicht neu erfunden - eine Transportmessung hat schlicht keinen
--     Pflueckzeitpunkt-Bezug, den man dafuer bewerten koennte.
--   * Append-only ohne UPDATE/DELETE-Policy, wie kuehlketten_messungen und
--     audit_events - eine einmal erfasste Messung wird nicht nachtraeglich
--     veraendert.
--
-- BEWUSST NICHT TEIL DIESER MIGRATION:
--   * Ein tatsaechliches Hardware-Logger-Geraet (automatische Auslesung) -
--     das ist eine Vor-Ort-Beschaffungsfrage, keine Software-Blockade. Wie
--     bei kuehlketten_messungen selbst ist dies eine manuell befuellte
--     Tabelle; sobald ein echtes Geraet angebunden wird, schreibt es in
--     dieselbe Tabelle statt eine neue Kette zu brauchen.
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. Tabelle
-- ---------------------------------------------------------------------------
create table public.transport_temperatur_messungen (
  id                       uuid primary key default gen_random_uuid(),
  lieferung_id             uuid not null references public.lieferungen(id) on delete cascade,
  gemessen_am              timestamptz,
  geraet_zeitpunkt         timestamptz,
  server_eingang_zeitpunkt timestamptz,
  temperatur_c             numeric(4,1) not null,
  ergebnis                 public.kuehlkette_ergebnis not null default 'ok',
  created_at               timestamptz not null default now()
);
comment on table public.transport_temperatur_messungen is
  'Anforderung 3.2: Temperaturlogger-Modell fuer die Transportphase, '
  'lueckenloser Kuehlkettennachweis von der Charge ueber die Lieferung bis '
  'zum Kunden. Manuell befuellt, wie kuehlketten_messungen fuer die '
  'Vorkuehlung - kein Hardware-Ausleseprotokoll angebunden.';
comment on column public.transport_temperatur_messungen.geraet_zeitpunkt is
  'Vom Client mitgegebener Messzeitpunkt (lokale Geraeteuhr). gemessen_am '
  'uebernimmt ihn, wenn plausibel - siehe geraet_zeitpunkt_pruefen().';
comment on column public.transport_temperatur_messungen.server_eingang_zeitpunkt is
  'Wann die Messung tatsaechlich beim Server ankam - unveraendert.';

create index idx_transport_messung_lieferung on public.transport_temperatur_messungen(lieferung_id);

-- ---------------------------------------------------------------------------
-- 2. Trigger: Zeitstempel pruefen/setzen, Ergebnis bewerten, keine Messung
--    auf einer stornierten (nie durchgefuehrten) Lieferung.
-- ---------------------------------------------------------------------------
create or replace function public.transport_kuehlkette_bewerten()
returns trigger
language plpgsql
as $$
declare
  v_status public.lieferung_status;
begin
  select status into v_status from public.lieferungen where id = new.lieferung_id;

  if v_status is null then
    raise exception 'Unbekannte Lieferung.' using errcode = '23503';
  end if;

  if v_status = 'storniert' then
    raise exception
      'Eine stornierte Lieferung fand nicht statt - dafuer laesst sich keine '
      'Transportmessung erfassen.'
      using errcode = '23514';
  end if;

  new.server_eingang_zeitpunkt := coalesce(new.server_eingang_zeitpunkt, now());

  if new.gemessen_am is null then
    new.gemessen_am := public.geraet_zeitpunkt_pruefen(new.geraet_zeitpunkt, new.server_eingang_zeitpunkt);
  end if;

  -- Dieselbe reine Temperaturbandbreite wie in kuehlkette_bewerten()
  -- (Migration 20260911000000) - siehe Migrationskommentar oben.
  new.ergebnis := case
    when new.temperatur_c > 8 then 'verstoss'
    when new.temperatur_c > 4 then 'warnung'
    else 'ok'
  end;

  return new;
end;
$$;

comment on function public.transport_kuehlkette_bewerten is
  'Anforderung 3.2: prueft den Geraete-Zeitstempel, bewertet die '
  'Transporttemperatur (dieselbe Bandbreite wie kuehlkette_bewerten()) und '
  'lehnt Messungen auf stornierten Lieferungen ab.';

create trigger trg_transport_kuehlkette_bewerten before insert on public.transport_temperatur_messungen
  for each row execute function public.transport_kuehlkette_bewerten();

-- ---------------------------------------------------------------------------
-- 3. RLS: dieselbe Rollenaufteilung wie bei lieferungen selbst (Migration
--    20260926000000) - ein Kunde sieht nur die eigenen, Erfassen bleibt
--    Buero/Brigade vorbehalten, append-only (keine UPDATE-/DELETE-Policy).
-- ---------------------------------------------------------------------------
alter table public.transport_temperatur_messungen enable row level security;

create policy transport_messungen_select_kunde_buero on public.transport_temperatur_messungen
  for select to authenticated
  using (
    exists (
      select 1 from public.lieferungen l
       where l.id = transport_temperatur_messungen.lieferung_id
         and (
           public.has_office_access()
           or public.has_role('brigade')
           or l.b2b_kunde_id = public.current_b2b_kunde_id()
         )
    )
  );

create policy transport_messungen_insert_feld on public.transport_temperatur_messungen
  for insert to authenticated
  with check (public.has_role('admin', 'betriebsleitung', 'brigade'));
