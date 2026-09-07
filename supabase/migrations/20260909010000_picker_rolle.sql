-- =============================================================================
-- Damicon - Siebte Rolle: picker
-- =============================================================================
-- Anforderung 7.1 aus dem Masterplan (P0): "Rollenmodell mit sieben Rollen ...
-- Rolle picker ist neu: sieht nur die eigene Leistung, darf gebuchte Mengen
-- nicht aendern." Die bisherigen sechs Rollen sind das 1Cati-Remapping
-- (admin/manager/accountant/staff/owner/tenant, siehe rbac.ts) - picker hat
-- dort kein Vorbild.
--
-- Loesung: keine neue Ressource, kein neues Modul. Die Rolle bekommt lediglich
-- lesenden Zugriff auf das bestehende Lohn-Modul (rbac.ts: view("lohn")) -
-- welche Zeilen dabei sichtbar werden, entscheidet unten die RLS, nicht die
-- Anwendung ("RLS ist kein Copy-Paste", siehe 20260902090100_rls_policies.sql).
-- Ohne Zuordnung zu einem Pflueckerstamm-Datensatz saehe ein picker dieselbe
-- leere Seite wie ein Kunde ohne Buchungen - deshalb der neue Verweis
-- profiles.pfluecker_id, nach demselben Muster wie profiles.brigade_id und
-- profiles.b2b_kunde_id.
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. Enum-Wert
-- ---------------------------------------------------------------------------
-- Nicht in einem DO-Block: ALTER TYPE ... ADD VALUE darf nicht innerhalb eines
-- Blocks stehen, der den neuen Wert im selben Aufruf verwendet. Als eigene,
-- automatisch committende Anweisung (wie der Rest dieser Datei) ist das kein
-- Problem - die spaeteren Anweisungen unten laufen in eigenen Transaktionen.
alter type public.app_role add value if not exists 'picker' after 'brigade';

-- ---------------------------------------------------------------------------
-- 2. Verknuepfung zum Pflueckerstamm
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists pfluecker_id uuid references public.pfluecker(id) on delete set null;
create index if not exists idx_profiles_pfluecker on public.profiles(pfluecker_id);

comment on column public.profiles.pfluecker_id is
  'Verknuepfung zum Pflueckerstamm fuer die Rolle picker (Anforderung 7.1) - '
  'bestimmt, welche eigene Lohn-/Leistungsdaten sichtbar sind. Nach demselben '
  'Muster wie brigade_id und b2b_kunde_id.';

-- ---------------------------------------------------------------------------
-- 3. Zuordnung vor Selbstbedienung schuetzen
-- ---------------------------------------------------------------------------
-- Bug-Vorstufe, wenn ungeprueft uebernommen: profiles_update_self (Migration
-- 20260902090100) erlaubt jeder Rolle, die eigene Zeile zu aendern, und prueft
-- bisher nur die Spalte role (trg_profil_rolle, Migration 20260905160000).
-- brigade_id/b2b_kunde_id standen also schon vorher offen - mit pfluecker_id
-- waere das ab jetzt nicht mehr nur eine Falschzuordnung, sondern ein Zugriff
-- auf die Lohndaten einer fremden Person ueber einen direkten REST-Aufruf auf
-- profiles. Ein Trigger schuetzt deshalb alle drei Zuordnungsspalten
-- gemeinsam, nicht nur die neue.
create or replace function public.profil_zuordnung_schuetzen()
returns trigger
language plpgsql
as $$
begin
  if (
    new.brigade_id is distinct from old.brigade_id
    or new.b2b_kunde_id is distinct from old.b2b_kunde_id
    or new.pfluecker_id is distinct from old.pfluecker_id
  ) and auth.uid() is not null and not public.has_office_access() then
    raise exception
      'Brigade-, Kunden- und Pfluecker-Zuordnung werden nur vom Buero gesetzt.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profil_zuordnung on public.profiles;
create trigger trg_profil_zuordnung
  before update of brigade_id, b2b_kunde_id, pfluecker_id on public.profiles
  for each row execute function public.profil_zuordnung_schuetzen();

-- ---------------------------------------------------------------------------
-- 4. Eigene Daten lesen: Lohn und der eigene Pfluecker-Stammsatz
-- ---------------------------------------------------------------------------
-- Permissiv, nicht restriktiv: kommt zu lohn_abrechnungen_select_office /
-- lohn_positionen_select_office (Migration 20260908130000) hinzu, ersetzt sie
-- nicht. Postgres verknuepft mehrere permissive Policies je Befehl mit OR -
-- das Buero sieht weiterhin alles, ein picker zusaetzlich die eigene Zeile.
create policy lohn_abrechnungen_select_own on public.lohn_abrechnungen
  for select to authenticated
  using (
    pfluecker_id is not null
    and pfluecker_id = (
      select p.pfluecker_id from public.profiles p where p.auth_user_id = auth.uid()
    )
  );

create policy lohn_positionen_select_own on public.lohn_positionen
  for select to authenticated
  using (
    exists (
      select 1
        from public.lohn_abrechnungen a
        join public.profiles p on p.pfluecker_id = a.pfluecker_id
       where a.id = lohn_positionen.lohn_abrechnung_id
         and p.auth_user_id = auth.uid()
         and p.pfluecker_id is not null
    )
  );

-- pfluecker_select_personal (Migration 20260905160000) deckt admin/
-- betriebsleitung/buchhaltung/brigade ab, nicht picker - ohne diese Policy
-- bliebe name/ausweis im Lohn-Embed leer (siehe lib/data/lohn.ts, join
-- "pfluecker ( name, ausweis )"). Bewusst nur die eigene Zeile, nicht die
-- ganze Belegschaft: picker soll ausschliesslich die eigene Leistung sehen.
create policy pfluecker_select_own on public.pfluecker
  for select to authenticated
  using (
    id = (select p.pfluecker_id from public.profiles p where p.auth_user_id = auth.uid())
  );
