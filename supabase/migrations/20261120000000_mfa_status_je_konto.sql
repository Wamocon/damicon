-- =============================================================================
-- Damicon - MFA-Status aller Konten fuer die Administration
-- =============================================================================
-- WMCNL-2479, WMCNL-2449. Die einzige MFA-Seite (/dashboard/sicherheit) zeigte
-- jedem nur den eigenen zweiten Faktor. Die Administration konnte nicht erkennen,
-- welche Konten ungeschuetzt sind, obwohl der Testfall genau das verlangt.
--
-- Wer einen zweiten Faktor eingerichtet hat, steht in auth.mfa_factors, einer
-- Tabelle des Auth-Dienstes, die die Rollen der Anwendung nicht lesen duerfen.
-- Diese Funktion liest sie stellvertretend (SECURITY DEFINER) und gibt nur das
-- heraus, was die Uebersicht braucht: Konto, Rolle und ob (und wie viele)
-- bestaetigte Faktoren eingerichtet sind. Weder Geheimnisse noch Codes verlassen
-- die Auth-Tabelle.
--
-- Der Zugriff ist auf admin beschraenkt, geprueft in der Funktion selbst. Wer
-- die Funktion ohne diese Rolle aufruft, bekommt 42501, nicht eine leere Liste:
-- eine leere Liste liesse sich mit "niemand hat MFA" verwechseln.
-- Pruefung: supabase/tests/pglite-fast.mjs, Abschnitt 20.
-- =============================================================================

set search_path = public;

create or replace function public.mfa_status_je_konto()
returns table (
  profil_id   uuid,
  voller_name text,
  email       text,
  rolle       public.app_role,
  faktoren    integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_role('admin') then
    raise exception 'Nur die Administration sieht den MFA-Status aller Konten.'
      using errcode = 'insufficient_privilege';
  end if;

  return query
    select p.id,
           p.full_name,
           p.email,
           p.role,
           (select count(*)::integer
              from auth.mfa_factors m
             where m.user_id = p.auth_user_id
               and m.status = 'verified')
      from public.profiles p
     where p.auth_user_id is not null
     order by 5 asc, p.full_name asc;
end;
$$;

comment on function public.mfa_status_je_konto is
  'WMCNL-2479: Konto, Rolle und Zahl der bestaetigten MFA-Faktoren aller Konten mit Anmeldung. Nur admin; ohne die Rolle 42501 statt einer leeren Liste.';

revoke all on function public.mfa_status_je_konto() from public;
grant execute on function public.mfa_status_je_konto() to authenticated;
