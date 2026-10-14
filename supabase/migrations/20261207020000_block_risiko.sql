-- =============================================================================
-- Damicon - Block-Risiko-Bewertung (WMCNL-1470)
-- =============================================================================
-- reihenbloecke.status ist ein Zustandsautomat mit fuenf Werten, aber keine
-- Aussage darueber, wie gefaehrdet ein Block gerade ist. Die Sicht
-- public.v_block_risiko fasst die Rohdaten, die es schon gibt (Pflueckaufgaben,
-- Rotationsplan, Behandlungen, Chargen, Kuehlmessungen), je Reihenblock zu
-- einem Punktwert von 0 bis 100, einer Stufe (hoch, mittel, niedrig) und einem
-- Hauptgrund zusammen.
--
-- Die Gewichte und Schwellen stammen NICHT aus einem anderen Projekt. Sie sind
-- aus den Regeln dieses Betriebs und den Folgen eines Fehlers abgeleitet und
-- stehen mit Begruendung in public.risiko_parameter, damit sie nachvollziehbar
-- und anpassbar sind. Gerechnet wird mit Anteilen (0 bis 1) je Faktor; das
-- Gewicht sagt, wie schwer der Faktor im Verhaeltnis zu den anderen wiegt.
--
-- Die fuenf Faktoren, nach der Schwere der Folge geordnet:
--
--   1. Versaeumter Pflueckdurchgang (Gewicht 35). Ein ausgelassener Durchgang
--      vernichtet die Ernte des Blocks fuer den Zyklus (Rotationsplan, Pflueck-
--      intervall 2 bis 3 Tage). Gemessen wird, wie lange die aelteste offene
--      Aufgabe oder der aelteste offene Rotationstermin ueberfaellig ist, im
--      Verhaeltnis zum laengsten Intervall (3 Tage). Nach 3 Tagen Verzug gilt
--      der Faktor als voll: ein ganzer Durchgang ist verloren.
--   2. Wartezeitsperre (Gewicht 30). Zwei Faelle. Liegt eine offene Aufgabe vor
--      dem Ende der Sperre, ist das ein Konflikt mit der Erntesperre
--      (Rueckstandsrisiko): Faktor 1 und, unabhaengig vom Punktwert, Stufe
--      hoch. Ohne Konflikt kostet die Sperre Ernte, weil Durchgaenge
--      entfallen: je entfallendem Durchgang ein Drittel, ab drei Durchgaengen
--      voll. Die Sperre selbst ist gesetzlich noetig, ihr Risiko liegt in der
--      verlorenen Erntezeit und im Konflikt mit der Planung.
--   3. Ausschuss (Gewicht 20). Ausschussquote der Chargen der letzten 7 Tage.
--      Null beim Zielwert der Baseline-Kennzahl Verlustquote (6 Prozent), voll
--      beim doppelten Zielwert (12 Prozent).
--   4. Kuehlkette (Gewicht 10). Verstoesse gegen die 60-Minuten-Regel bei
--      Chargen des Blocks in den letzten 7 Tagen; ab 3 Verstoessen voll. Der
--      Verstoss trifft die Ware, nicht den Block selbst, deshalb ein kleineres
--      Gewicht als die Faktoren, die den Block gefaehrden.
--   5. Erfassungsluecke (Gewicht 5). Ein Block, auf dem in den letzten 30 Tagen
--      gearbeitet wurde, hat weder eine offene Aufgabe noch eine in den letzten
--      3 Tagen: es fehlt ein naechster Schritt oder seine Erfassung. Kleines
--      Gewicht, weil es auch bewusste Pausen gibt; die Saison macht aus einer
--      Pause keine Gefahr.
--
-- Schwellen: hoch ab 50 Punkten, mittel ab 25. Ein einzelner Faktor allein kann
-- also nur "mittel" ausloesen (hoechstens 35 Punkte), "hoch" braucht zwei
-- ernste Faktoren oder den Konflikt mit der Sperre. Das ist gewollt: ein
-- einzelner Mangel ist ein Hinweis, mehrere sind eine Gefahr.
--
-- Bewusst KEINE Verrechnung mit gesetzlichen Fristen (Risiko-Radar): der Radar
-- sortiert Fristen verschiedener Rechtsgrundlagen nach Dringlichkeit und
-- verzichtet auf einen Punktwert. Dieser Punktwert gilt einem einzelnen Block
-- und seinen betrieblichen Gefahren, nicht dem Rechtsstand des Betriebs, und
-- die Sicht liefert die Beitraege je Faktor mit, damit man nie nur eine Zahl
-- sieht.
--
-- Die Gewichte sind Anteile am Ganzen: gerechnet wird durch ihre Summe, sie
-- muessen also nicht 100 ergeben. Aendern duerfen sie nur admin und ceo.
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. Parameter
-- ---------------------------------------------------------------------------
create table if not exists public.risiko_parameter (
  schluessel  text primary key,
  wert        numeric not null check (wert >= 0),
  einheit     text not null,
  begruendung text not null,
  updated_at  timestamptz not null default now()
);

comment on table public.risiko_parameter is
  'Gewichte, Grenzen und Schwellen der Block-Risiko-Bewertung (v_block_risiko), je mit Begruendung. Aenderbar nur durch admin und ceo.';

create trigger trg_risiko_parameter_updated before update on public.risiko_parameter
  for each row execute function public.set_updated_at();

insert into public.risiko_parameter (schluessel, wert, einheit, begruendung) values
  ('gewicht_ueberfaellig', 35, 'Gewicht', 'Ein ausgelassener Pflueckdurchgang vernichtet die Ernte des Blocks fuer den Zyklus: die schwerste und haeufigste Folge.'),
  ('gewicht_sperre', 30, 'Gewicht', 'Konflikt zwischen offener Aufgabe und Wartezeitsperre (Rueckstandsrisiko) und Verlust von Erntezeit durch die Sperre. Das Rechtsrisiko schuetzt zusaetzlich die Datenbank, deshalb knapp unter dem Verzug.'),
  ('gewicht_ausschuss', 20, 'Gewicht', 'Ausschuss mindert den Erloes der Ernte, trifft aber nur Teile davon.'),
  ('gewicht_kuehlkette', 10, 'Gewicht', 'Verstoesse gegen die 60-Minuten-Regel treffen die Charge, nicht den Block selbst.'),
  ('gewicht_erfassung', 5, 'Gewicht', 'Eine Erfassungsluecke ist ein Hinweis, kein Schaden: es gibt bewusste Pausen.'),
  ('intervall_max_tage', 3, 'Tage', 'Laengstes Pflueckintervall des Rotationsplans (2 bis 3 Tage). Verzug in dieser Laenge bedeutet einen verlorenen Durchgang.'),
  ('ausschuss_ziel_prozent', 6, 'Prozent', 'Zielwert der Baseline-Kennzahl Verlustquote (unter 6 Prozent).'),
  ('ausschuss_kritisch_prozent', 12, 'Prozent', 'Doppelter Zielwert: ab hier gilt der Ausschuss-Faktor als voll.'),
  ('kuehl_verstoesse_voll', 3, 'Verstoesse', 'Ab dieser Zahl Kuehlketten-Verstoesse in der Betrachtungszeit gilt der Faktor als voll.'),
  ('sperre_durchgaenge_voll', 3, 'Durchgaenge', 'Ab so vielen durch die Sperre entfallenden Durchgaengen gilt der Sperr-Faktor als voll.'),
  ('betrachtung_tage', 7, 'Tage', 'Zeitfenster fuer Ausschuss und Kuehlketten-Verstoesse: eine Erntewoche.'),
  ('aktiv_tage', 30, 'Tage', 'Ein Block gilt als in Arbeit, wenn in dieser Zeit eine Aufgabe auf ihm lag.'),
  ('schwelle_hoch', 50, 'Punkte', 'Ab hier Stufe hoch. Ein einzelner Faktor erreicht hoechstens sein Gewicht (35), hoch braucht also mindestens zwei.'),
  ('schwelle_mittel', 25, 'Punkte', 'Ab hier Stufe mittel.')
on conflict (schluessel) do nothing;

alter table public.risiko_parameter enable row level security;
alter table public.risiko_parameter force row level security;

create policy risiko_parameter_select on public.risiko_parameter
  for select to authenticated
  using (true);

-- Aendern: nur admin und ceo. Anlegen und Loeschen gibt es nicht, die Schluessel
-- gehoeren zur Sicht.
create policy risiko_parameter_update on public.risiko_parameter
  for update to authenticated
  using (public.current_app_role() in ('admin', 'ceo'))
  with check (public.current_app_role() in ('admin', 'ceo'));

revoke all on public.risiko_parameter from public;
revoke all on public.risiko_parameter from anon;
grant select on public.risiko_parameter to authenticated;
grant update (wert) on public.risiko_parameter to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Die Sicht
-- ---------------------------------------------------------------------------
create or replace view public.v_block_risiko
with (security_invoker = true)
as
with p as (
  select
    max(wert) filter (where schluessel = 'gewicht_ueberfaellig')      as w_ueberfaellig,
    max(wert) filter (where schluessel = 'gewicht_sperre')            as w_sperre,
    max(wert) filter (where schluessel = 'gewicht_ausschuss')         as w_ausschuss,
    max(wert) filter (where schluessel = 'gewicht_kuehlkette')        as w_kuehlkette,
    max(wert) filter (where schluessel = 'gewicht_erfassung')         as w_erfassung,
    max(wert) filter (where schluessel = 'intervall_max_tage')        as intervall,
    max(wert) filter (where schluessel = 'ausschuss_ziel_prozent')    as aus_ziel,
    max(wert) filter (where schluessel = 'ausschuss_kritisch_prozent') as aus_kritisch,
    max(wert) filter (where schluessel = 'kuehl_verstoesse_voll')     as kuehl_voll,
    max(wert) filter (where schluessel = 'sperre_durchgaenge_voll')   as sperre_voll,
    max(wert) filter (where schluessel = 'betrachtung_tage')          as fenster,
    max(wert) filter (where schluessel = 'aktiv_tage')                as aktiv,
    max(wert) filter (where schluessel = 'schwelle_hoch')             as s_hoch,
    max(wert) filter (where schluessel = 'schwelle_mittel')           as s_mittel
  from public.risiko_parameter
),
roh as (
  select
    rb.id as reihenblock_id,
    rb.code,
    p.*,
    public.heute_almaty() as heute,
    -- Versaeumt: aelteste offene Aufgabe in Stunden, aeltester offener Rotationstermin in Tagen
    coalesce(auf.ueberfaellig_h, 0) as aufgabe_ueberfaellig_h,
    coalesce(rot.ueberfaellig_tage, 0) as rotation_ueberfaellig_tage,
    -- Sperre
    sp.freigabe_am,
    (rb.status = 'wartezeitgesperrt') as ist_gesperrt,
    coalesce(auf.hat_offene, false) as hat_offene,
    auf.erste_offene_faelligkeit,
    -- Ausschuss und Kuehlkette
    aus.menge_gesamt,
    aus.ausschuss_kg,
    coalesce(kk.verstoesse, 0) as kuehl_verstoesse,
    -- Erfassung
    coalesce(akt.in_arbeit, false) as in_arbeit,
    coalesce(neu.kuerzlich, false) as kuerzlich
  from public.reihenbloecke rb
  cross join p
  left join lateral (
    select
      max(extract(epoch from (now() - a.faelligkeit)) / 3600.0) filter (where a.faelligkeit < now()) as ueberfaellig_h,
      true as hat_offene,
      min(a.faelligkeit) as erste_offene_faelligkeit
    from public.pflueckaufgaben a
    where a.reihenblock_id = rb.id and a.status in ('offen', 'angenommen', 'in_arbeit')
    having count(*) > 0
  ) auf on true
  left join lateral (
    select max(public.heute_almaty() - r.geplant_fuer) as ueberfaellig_tage
    from public.rotationsplan_eintraege r
    where r.reihenblock_id = rb.id and r.status = 'geplant'
      and r.geplant_fuer < public.heute_almaty()
      -- Ein Termin waehrend der Sperre ist nicht versaeumt, er ist gesperrt (WMCNL-2300).
      and rb.status <> 'wartezeitgesperrt'
  ) rot on true
  left join lateral (
    select max(b.freigabe_am) as freigabe_am
    from public.pflanzenschutz_behandlungen b
    where b.reihenblock_id = rb.id and not b.freigegeben and b.freigabe_am > public.heute_almaty()
  ) sp on true
  left join lateral (
    select sum(c.menge_kg + c.ausschuss_kg) as menge_gesamt, sum(c.ausschuss_kg) as ausschuss_kg
    from public.chargen c
    where c.reihenblock_id = rb.id and c.ernte_datum >= public.heute_almaty() - p.fenster::integer
  ) aus on true
  left join lateral (
    select count(*) as verstoesse
    from public.kuehlketten_messungen k
    join public.chargen c on c.id = k.charge_id
    where c.reihenblock_id = rb.id and k.ergebnis = 'verstoss'
      and k.gemessen_am >= now() - make_interval(days => p.fenster::integer)
  ) kk on true
  left join lateral (
    select true as in_arbeit
    from public.pflueckaufgaben a
    where a.reihenblock_id = rb.id
      and coalesce(a.faelligkeit, a.created_at) >= now() - make_interval(days => p.aktiv::integer)
    limit 1
  ) akt on true
  left join lateral (
    select true as kuerzlich
    from public.pflueckaufgaben a
    where a.reihenblock_id = rb.id
      and coalesce(a.faelligkeit, a.created_at) >= now() - make_interval(days => p.intervall::integer)
    limit 1
  ) neu on true
),
faktoren as (
  select
    r.*,
    -- Konflikt: eine offene Aufgabe wird vor dem Ende der laufenden Sperre faellig
    (r.freigabe_am is not null and r.erste_offene_faelligkeit is not null
      and r.erste_offene_faelligkeit::date < r.freigabe_am) as sperre_konflikt,
    least(1, greatest(
      r.aufgabe_ueberfaellig_h / nullif(r.intervall * 24, 0),
      r.rotation_ueberfaellig_tage / nullif(r.intervall, 0),
      0)) as f_ueberfaellig,
    -- entfallende Durchgaenge: Reststage der Sperre geteilt durch das Intervall, mindestens einer, solange gesperrt
    case
      when r.freigabe_am is not null or r.ist_gesperrt
        then greatest(1, ceil(coalesce(r.freigabe_am - r.heute, 0) / nullif(r.intervall, 0)))
      else 0
    end as sperre_durchgaenge,
    case
      when coalesce(r.menge_gesamt, 0) = 0 then 0
      else least(1, greatest(0,
        ((100.0 * r.ausschuss_kg / r.menge_gesamt) - r.aus_ziel) / nullif(r.aus_kritisch - r.aus_ziel, 0)))
    end as f_ausschuss,
    least(1, r.kuehl_verstoesse / nullif(r.kuehl_voll, 0)) as f_kuehlkette,
    case when r.in_arbeit and not r.hat_offene and not r.kuerzlich then 1 else 0 end as f_erfassung
  from roh r
),
beitraege as (
  select
    f.*,
    case when f.sperre_konflikt then 1
         else least(1, f.sperre_durchgaenge / nullif(f.sperre_voll, 0)) end as f_sperre
  from faktoren f
),
punkte as (
  select
    b.*,
    b.w_ueberfaellig * b.f_ueberfaellig as p_ueberfaellig,
    b.w_sperre * b.f_sperre             as p_sperre,
    b.w_ausschuss * b.f_ausschuss       as p_ausschuss,
    b.w_kuehlkette * b.f_kuehlkette     as p_kuehlkette,
    b.w_erfassung * b.f_erfassung       as p_erfassung
  from beitraege b
)
select
  pu.reihenblock_id,
  pu.code,
  round(100.0 * (pu.p_ueberfaellig + pu.p_sperre + pu.p_ausschuss + pu.p_kuehlkette + pu.p_erfassung)
        / nullif(pu.w_ueberfaellig + pu.w_sperre + pu.w_ausschuss + pu.w_kuehlkette + pu.w_erfassung, 0))::integer
    as risiko_score,
  case
    when pu.sperre_konflikt then 'hoch'
    when 100.0 * (pu.p_ueberfaellig + pu.p_sperre + pu.p_ausschuss + pu.p_kuehlkette + pu.p_erfassung)
         / nullif(pu.w_ueberfaellig + pu.w_sperre + pu.w_ausschuss + pu.w_kuehlkette + pu.w_erfassung, 0) >= pu.s_hoch then 'hoch'
    when 100.0 * (pu.p_ueberfaellig + pu.p_sperre + pu.p_ausschuss + pu.p_kuehlkette + pu.p_erfassung)
         / nullif(pu.w_ueberfaellig + pu.w_sperre + pu.w_ausschuss + pu.w_kuehlkette + pu.w_erfassung, 0) >= pu.s_mittel then 'mittel'
    else 'niedrig'
  end as risiko_stufe,
  case
    when pu.sperre_konflikt then 'sperre_konflikt'
    when greatest(pu.p_ueberfaellig, pu.p_sperre, pu.p_ausschuss, pu.p_kuehlkette, pu.p_erfassung) = 0 then null
    when pu.p_ueberfaellig = greatest(pu.p_ueberfaellig, pu.p_sperre, pu.p_ausschuss, pu.p_kuehlkette, pu.p_erfassung) then 'ueberfaellig'
    when pu.p_sperre = greatest(pu.p_ueberfaellig, pu.p_sperre, pu.p_ausschuss, pu.p_kuehlkette, pu.p_erfassung) then 'sperre'
    when pu.p_ausschuss = greatest(pu.p_ueberfaellig, pu.p_sperre, pu.p_ausschuss, pu.p_kuehlkette, pu.p_erfassung) then 'ausschuss'
    when pu.p_kuehlkette = greatest(pu.p_ueberfaellig, pu.p_sperre, pu.p_ausschuss, pu.p_kuehlkette, pu.p_erfassung) then 'kuehlkette'
    else 'erfassung'
  end as hauptgrund,
  pu.sperre_konflikt,
  round(pu.p_ueberfaellig, 1) as beitrag_ueberfaellig,
  round(pu.p_sperre, 1)       as beitrag_sperre,
  round(pu.p_ausschuss, 1)    as beitrag_ausschuss,
  round(pu.p_kuehlkette, 1)   as beitrag_kuehlkette,
  round(pu.p_erfassung, 1)    as beitrag_erfassung
from punkte pu;

comment on view public.v_block_risiko is
  'Block-Risiko-Bewertung (WMCNL-1470): je Reihenblock ein Punktwert 0 bis 100, die Stufe (hoch, mittel, niedrig), der Hauptgrund und die Beitraege der fuenf Faktoren. Gewichte und Schwellen in risiko_parameter. security_invoker: RLS der Basistabellen gilt unveraendert.';

revoke all on public.v_block_risiko from public;
revoke all on public.v_block_risiko from anon;
grant select on public.v_block_risiko to authenticated;
