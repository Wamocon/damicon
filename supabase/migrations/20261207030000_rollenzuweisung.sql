-- =============================================================================
-- Damicon - Rollenzuweisung in der Oberflaeche: Schutz des letzten Administrators
-- (WMCNL-1441)
-- =============================================================================
-- Die Rolle eines Kontos steht in public.profiles.role. Aendern darf sie nur ein
-- Administrator (profil_rolle_schuetzen(), Migration 20260905160000); die Policy
-- profiles_update_leitung (20261014000000) laesst ihn fremde Profile pflegen.
-- Bisher ging das nur mit SQL oder dem service_role-Schluessel. Jetzt bekommt
-- die Oberflaeche eine Rollenzuweisung, und damit entsteht ein Fall, den es
-- vorher praktisch nicht gab: ein Administrator kann sich per Klick selbst die
-- Rolle nehmen oder den einzigen anderen Administrator herabstufen, und der
-- Betrieb hat niemanden mehr, der Rollen vergeben darf.
--
-- Dieser Trigger schliesst das auf Datenbankebene, nicht nur in der Anwendung:
-- die Rolle admin kann einem Konto nur entzogen werden, solange mindestens ein
-- anderes Konto sie behaelt. Der Fehler hat einen eigenen Code (DA011), damit die
-- Oberflaeche ihn verstaendlich meldet und nicht als Berechtigungsfehler.
--
-- security definer: gezaehlt werden ALLE Administratoren, nicht nur die, die die
-- Zeilensicherheit der aufrufenden Person zeigt. service_role (seed-auth,
-- Administrationsskripte) ist nicht ausgenommen: auch ein Skript soll den Betrieb
-- nicht ohne Administrator zuruecklassen.
-- =============================================================================

set search_path = public;

create or replace function public.profil_letzter_admin_schuetzen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role = 'admin' and new.role <> 'admin'
     and not exists (select 1 from public.profiles p where p.role = 'admin' and p.id <> old.id) then
    raise exception 'Der letzte Administrator behaelt seine Rolle.'
      using errcode = 'DA011';
  end if;
  return new;
end;
$$;

comment on function public.profil_letzter_admin_schuetzen() is
  'Die Rolle admin laesst sich einem Konto nur entziehen, solange mindestens ein anderes Konto sie behaelt (Fehlercode DA011).';

drop trigger if exists trg_profil_letzter_admin on public.profiles;
create trigger trg_profil_letzter_admin
  before update of role on public.profiles
  for each row execute function public.profil_letzter_admin_schuetzen();
