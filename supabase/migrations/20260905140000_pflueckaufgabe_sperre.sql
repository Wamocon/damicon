-- =============================================================================
-- Damicon - Meilenstein B: keine Pflueckaufgabe auf gesperrtem Reihenblock
-- =============================================================================
-- "Der Pflueckplan zeigt einen wartezeitgesperrten Block schlicht nicht an."
-- Das darf keine reine Anzeigeregel sein: die Datenbank verweigert das Anlegen
-- oder Umhaengen einer Pflueckaufgabe auf einem gesperrten Block.
-- =============================================================================

set search_path = public;

create or replace function public.pflueckaufgabe_sperre_pruefen()
returns trigger
language plpgsql
as $$
declare
  v_status public.reihenblock_status;
  v_code   text;
begin
  select status, code
    into v_status, v_code
    from public.reihenbloecke
   where id = new.reihenblock_id;

  if v_status = 'wartezeitgesperrt' then
    raise exception
      'Reihenblock % ist wartezeitgesperrt - keine Pflueckaufgabe moeglich.', v_code
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_pflueckaufgabe_sperre on public.pflueckaufgaben;
create trigger trg_pflueckaufgabe_sperre
  before insert or update of reihenblock_id on public.pflueckaufgaben
  for each row execute function public.pflueckaufgabe_sperre_pruefen();
