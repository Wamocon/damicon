-- =============================================================================
-- Damicon - Nachbesserung an vorbestellungen (adversarischer Review-Fund zu
-- Anforderung 5.1)
-- =============================================================================
-- Zwei echte Funde, beide behoben:
--
-- 1. vorbestellungen_update_kunde_storno prueft per WITH CHECK nur
--    b2b_kunde_id und status, nicht die uebrigen Spalten. Ein direkter
--    API-Aufruf (nicht ueber die Server-Action) haette beim "Stornieren"
--    gleichzeitig menge_kg/sorte_id/liefertermin beliebig mitaendern
--    koennen - RLS allein kann das nicht verhindern, weil WITH CHECK keinen
--    Zugriff auf die alte Zeile hat. Neuer Trigger erzwingt das jetzt hart,
--    dieselbe Vorgehensweise wie bei lieferung_uebergabe_pruefen()
--    (Migration 20260926000000) und rotationsplan_brigade_aendern_pruefen()
--    (Migration 20260927010000): RLS ist die erste, ein Trigger die zweite,
--    vom Aufrufer unabhaengige Schutzschicht.
--
-- 2. vorbestellungen_update_buero prueft nur die Rolle, nicht den
--    Vorzustand. Anders als bei lieferungen (dort sperrt
--    lieferung_uebergabe_pruefen() jede Aenderung nach "zugestellt"/
--    "storniert" explizit) liess sich eine bereits automatisch auf
--    "geliefert" fortgeschriebene Vorbestellung (durch
--    lieferung_uebergabe_pruefen() selbst) versehentlich wieder auf
--    "bestaetigt"/"storniert" zuruecksetzen - ein Widerspruch zur bereits
--    zugestellten Lieferung. Die USING-Klausel grenzt den Vorzustand jetzt
--    auf die beiden noch offenen Stufen ein.
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. Kunden-Storno darf ausschliesslich den Status aendern.
-- ---------------------------------------------------------------------------
create or replace function public.vorbestellung_kunde_aendern_pruefen()
returns trigger
language plpgsql
as $$
begin
  if not public.has_role('admin', 'betriebsleitung')
     and (
       new.menge_kg is distinct from old.menge_kg
       or new.sorte_id is distinct from old.sorte_id
       or new.liefertermin is distinct from old.liefertermin
       or new.b2b_kunde_id is distinct from old.b2b_kunde_id
     ) then
    raise exception
      'Ein Kunden-Storno darf ausschliesslich den Status aendern, nicht '
      'Menge, Sorte, Liefertermin oder Firmenbezug.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

comment on function public.vorbestellung_kunde_aendern_pruefen is
  'Anforderung 5.1: zweite, vom Aufrufer unabhaengige Schutzschicht neben '
  'vorbestellungen_update_kunde_storno - deren WITH CHECK prueft nur '
  'b2b_kunde_id/status, nicht die uebrigen Spalten.';

create trigger trg_vorbestellung_kunde_aendern before update on public.vorbestellungen
  for each row execute function public.vorbestellung_kunde_aendern_pruefen();

-- ---------------------------------------------------------------------------
-- 2. Buero-Statuspflege nur noch aus einem der beiden offenen Vorzustaende -
--    eine bereits automatisch auf "geliefert" fortgeschriebene oder
--    stornierte Vorbestellung bleibt unveraendert.
-- ---------------------------------------------------------------------------
drop policy if exists vorbestellungen_update_buero on public.vorbestellungen;

create policy vorbestellungen_update_buero on public.vorbestellungen
  for update to authenticated
  using (public.has_role('admin', 'betriebsleitung') and status in ('angefragt', 'bestaetigt'))
  with check (public.has_role('admin', 'betriebsleitung'));
