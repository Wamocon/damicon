-- =============================================================================
-- Damicon - Nachweisregister mit automatischem Ablaufstatus (WMCNL-1469)
-- =============================================================================
-- public.dokumente kannte bisher ein einzelnes Datum "stand" und einen von
-- Hand gesetzten Status (gueltig, prueflauf, abgelaufen). Ein Zertifikat, das
-- am 1. Oktober ablief, blieb "gueltig", bis jemand daran dachte. Fuer ein
-- Register von Zertifikaten, Vertraegen, Genehmigungen und Versicherungen ist
-- das die falsche Quelle der Wahrheit: der Status folgt aus dem Datum, nicht
-- aus der Erinnerung.
--
-- Die Erweiterung (nicht 1:1 aus dem Schwesterprojekt, sondern an dieses Schema
-- angepasst; der Modulname "compliance" bleibt dem Datenschutz-Cockpit):
--   gueltig_von, gueltig_bis   Gueltigkeitszeitraum
--   unbefristet                gilt ohne Enddatum (etwa ein unbefristeter Vertrag)
--   warnung_tage               so viele Tage vor Ablauf beginnt die Vorwarnung
--                              (Vorgabe 60, je Dokument aenderbar)
--   verantwortlich_id          wer sich um die Verlaengerung kuemmert
--   rechtsgrundlage            die Fundstelle, die den Nachweis verlangt
--   b2b_kunde_id,              Partnerbezug, neben dem vorhandenen Bezug
--   nachbarbetrieb_id          zu Reihenblock und Charge
--
-- Der Ablaufstatus entsteht in public.nachweis_status() und erscheint in der
-- Sicht public.v_dokumente:
--   gueltig     heute im Zeitraum, mehr als warnung_tage vor dem Ende (oder unbefristet)
--   laeuft_ab   endet in hoechstens warnung_tage Tagen (der letzte Tag zaehlt noch als gueltig)
--   abgelaufen  das Ende liegt vor heute
--   offen       kein Zeitraum erfasst oder noch nicht wirksam (gueltig_von liegt in der Zukunft)
-- "offen" ist bewusst kein Wohlverhalten: ein Dokument ohne Enddatum, das nicht
-- als unbefristet markiert ist, ist eine Luecke im Register und soll auffallen.
--
-- Der Tag ist der Tag in Almaty (public.heute_almaty()), nicht der des
-- Datenbankservers: nach Mitternacht in Almaty (UTC+5) ist der neue Tag dort
-- schon angebrochen, wenn UTC noch beim alten steht.
--
-- Der alte Status (dokumente.status) bleibt als Spalte erhalten, damit nichts
-- bricht, und gilt nicht mehr als Quelle der Anzeige. Es werden keine
-- Gueltigkeitsdaten erfunden: bestehende Dokumente haben nach der Migration
-- keinen Zeitraum und erscheinen als "offen", bis sie gepflegt sind.
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. Der Tag in Almaty
-- ---------------------------------------------------------------------------
create or replace function public.heute_almaty()
returns date
language sql
stable
set search_path = public
as $$
  select (now() at time zone 'Asia/Almaty')::date;
$$;

comment on function public.heute_almaty() is
  'Der heutige Kalendertag in Almaty (UTC+5), Stichtag fuer Fristen und Ablaufstatus.';

grant execute on function public.heute_almaty() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Spalten
-- ---------------------------------------------------------------------------
alter table public.dokumente
  add column if not exists gueltig_von       date,
  add column if not exists gueltig_bis       date,
  add column if not exists unbefristet       boolean not null default false,
  add column if not exists warnung_tage      integer not null default 60,
  add column if not exists verantwortlich_id uuid references public.profiles(id) on delete set null,
  add column if not exists rechtsgrundlage   text,
  add column if not exists b2b_kunde_id      uuid references public.b2b_kunden(id) on delete set null,
  add column if not exists nachbarbetrieb_id uuid references public.nachbarbetriebe(id) on delete set null;

alter table public.dokumente
  add constraint dokumente_warnung_tage_check check (warnung_tage between 1 and 365),
  add constraint dokumente_zeitraum_check check (gueltig_von is null or gueltig_bis is null or gueltig_bis >= gueltig_von),
  -- Ein unbefristetes Dokument hat kein Enddatum: beides zugleich waere ein Widerspruch.
  add constraint dokumente_unbefristet_check check (not (unbefristet and gueltig_bis is not null));

create index if not exists idx_dokumente_gueltig_bis on public.dokumente (gueltig_bis);
create index if not exists idx_dokumente_verantwortlich on public.dokumente (verantwortlich_id);

comment on column public.dokumente.gueltig_bis is
  'Letzter Tag, an dem der Nachweis gilt. Ohne Wert und ohne unbefristet erscheint das Dokument als offen.';
comment on column public.dokumente.warnung_tage is
  'So viele Tage vor gueltig_bis beginnt die Vorwarnung (laeuft_ab). Vorgabe 60.';
comment on column public.dokumente.rechtsgrundlage is
  'Fundstelle, die den Nachweis verlangt (Gesetz, Artikel, Auflage). Freitext.';

-- ---------------------------------------------------------------------------
-- 3. Der Ablaufstatus
-- ---------------------------------------------------------------------------
-- Der Stichtag ist ein Parameter, damit die Regel ohne Uhr pruefbar ist
-- (supabase/tests/nachweisregister.mjs gleicht sie mit src/lib/domain/nachweise.ts ab).
create or replace function public.nachweis_status(
  p_gueltig_von  date,
  p_gueltig_bis  date,
  p_unbefristet  boolean,
  p_warnung_tage integer,
  p_stichtag     date
)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_gueltig_von is not null and p_gueltig_von > p_stichtag then 'offen'
    when coalesce(p_unbefristet, false) then 'gueltig'
    when p_gueltig_bis is null then 'offen'
    when p_gueltig_bis < p_stichtag then 'abgelaufen'
    when p_gueltig_bis - p_stichtag <= coalesce(p_warnung_tage, 60) then 'laeuft_ab'
    else 'gueltig'
  end;
$$;

comment on function public.nachweis_status(date, date, boolean, integer, date) is
  'Ablaufstatus eines Nachweises zu einem Stichtag: gueltig, laeuft_ab, abgelaufen oder offen.';

grant execute on function public.nachweis_status(date, date, boolean, integer, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Die Sicht
-- ---------------------------------------------------------------------------
-- security_invoker: die Zeilensicherheit von dokumente (nur Buero-Rollen) gilt
-- unveraendert durch die Sicht hindurch.
create or replace view public.v_dokumente
with (security_invoker = true)
as
select
  d.id,
  d.name,
  d.kategorie,
  d.bezug,
  d.stand,
  d.status as status_manuell,
  d.storage_path,
  d.reihenblock_id,
  d.charge_id,
  d.foerderdossier_id,
  d.gueltig_von,
  d.gueltig_bis,
  d.unbefristet,
  d.warnung_tage,
  d.verantwortlich_id,
  d.rechtsgrundlage,
  d.b2b_kunde_id,
  d.nachbarbetrieb_id,
  public.nachweis_status(d.gueltig_von, d.gueltig_bis, d.unbefristet, d.warnung_tage, public.heute_almaty())
    as nachweis_status,
  case
    when d.unbefristet or d.gueltig_bis is null then null
    else d.gueltig_bis - public.heute_almaty()
  end as tage_bis_ablauf,
  d.created_at,
  d.updated_at
from public.dokumente d;

comment on view public.v_dokumente is
  'Nachweisregister (WMCNL-1469): dokumente mit automatisch berechnetem Ablaufstatus (nachweis_status: gueltig, laeuft_ab, abgelaufen, offen) und den Tagen bis zum Ablauf. security_invoker: RLS von dokumente gilt unveraendert.';

-- Nur angemeldete Konten. anon bekommt keinen Zugriff auf die Sicht, auch wenn die
-- Zeilensicherheit der Tabelle ihm ohnehin keine Zeile zeigen wuerde.
revoke all on public.v_dokumente from public;
revoke all on public.v_dokumente from anon;
grant select on public.v_dokumente to authenticated;
