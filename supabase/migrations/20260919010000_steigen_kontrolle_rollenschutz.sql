-- =============================================================================
-- Damicon - Stichprobenkontrolle nur durch Betriebsleitung/Admin (Anforderung 2.10)
-- =============================================================================
-- steigen_update_feld (Migration 20260905180000) erlaubt admin, betriebsleitung
-- UND brigade das Schreiben auf steigen, aus gutem Grund: die Brigade pflegt
-- ihre eigenen Steigen im Feld (Gewicht, Scan-Zeitpunkt, Pfluecker). Ohne
-- weitere Einschraenkung koennte dieselbe Policy aber auch das neue Feld
-- kontrolliert_am zulassen - eine Brigade koennte die eigene Steige damit
-- selbst "kontrollieren", was den Zweck einer unabhaengigen Stichprobe
-- unterlaeuft.
--
-- Gleiches Muster wie pflueckaufgabe_freigabe_pruefen() fuer den Abschluss
-- einer Pflueckaufgabe: ein Trigger schuetzt das konkrete Feld zusaetzlich
-- zur RLS-Policy, unabhaengig davon, ueber welchen Weg das Update kommt.
-- =============================================================================

set search_path = public;

create or replace function public.steige_kontrolle_pruefen()
returns trigger
language plpgsql
as $$
begin
  if (new.kontrolliert_am is distinct from old.kontrolliert_am
      or new.kontrolliert_von_profil_id is distinct from old.kontrolliert_von_profil_id)
     and not public.has_role('admin', 'betriebsleitung') then
    raise exception 'Die Stichprobenkontrolle einer Steige setzt nur die Betriebsleitung.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

comment on function public.steige_kontrolle_pruefen is
  'Anforderung 2.10: nur admin/betriebsleitung duerfen kontrolliert_am/kontrolliert_von_profil_id setzen, unabhaengig von der breiteren steigen_update_feld-Policy, die der Brigade das Pflegen der eigenen Feldwerte erlaubt.';

create trigger trg_steige_kontrolle_pruefen before update on public.steigen
  for each row execute function public.steige_kontrolle_pruefen();
