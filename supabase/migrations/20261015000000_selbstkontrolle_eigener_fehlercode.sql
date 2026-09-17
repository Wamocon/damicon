-- =============================================================================
-- Damicon - eigener Fehlercode fuer die Vier-Augen-Regel (Anforderung 2.10)
-- =============================================================================
-- QA-Ultra-Fund vom 17.09.2026, live im Browser reproduziert: Wer die eigene
-- Steige zu kontrollieren versucht, bekommt "Ihre Rolle darf diesen Vorgang
-- nicht ausfuehren." zu sehen - irrefuehrend, denn genau diese Rolle darf den
-- Vorgang durchfuehren, nur nicht an dieser einen Steige.
--
-- Ursache: steige_kontrolle_pruefen() (Migration 20261014000000) wirft fuer
-- die Vier-Augen-Regel denselben Postgres-Fehlercode ('insufficient_privilege'
-- = SQLSTATE 42501) wie fuer eine fehlende Berechtigung. dbFehler()
-- (src/lib/actions/status.ts) bildet 42501 auf die generische Meldung
-- "fehler.berechtigung" ab - fachlich richtig fuer eine echte
-- Rechteverweigerung, aber falsch fuer die Vier-Augen-Regel. Gleiches Muster
-- wie DA001/DA002 an anderer Stelle: ein eigener Code, wo die Oberflaeche eine
-- eigene Meldung braucht.
-- =============================================================================

set search_path = public;

create or replace function public.steige_kontrolle_pruefen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  eigenes_profil uuid;
  darf boolean;
begin
  if new.erfasst_von_profil_id is distinct from old.erfasst_von_profil_id then
    raise exception 'Wer eine Steige erfasst hat, laesst sich nachtraeglich nicht mehr aendern.'
      using errcode = 'insufficient_privilege';
  end if;

  if old.kontrolliert_am is not null
     and (new.kontrolliert_am is distinct from old.kontrolliert_am
          or new.kontroll_befund is distinct from old.kontroll_befund
          or new.kontroll_begruendung is distinct from old.kontroll_begruendung
          or new.kontrolliert_von_profil_id is distinct from old.kontrolliert_von_profil_id) then
    raise exception 'Eine bereits durchgefuehrte Stichprobenkontrolle laesst sich nicht mehr aendern.'
      using errcode = 'insufficient_privilege';
  end if;

  if new.kontrolliert_am is not distinct from old.kontrolliert_am
     and new.kontroll_befund is not distinct from old.kontroll_befund
     and new.kontroll_begruendung is not distinct from old.kontroll_begruendung
     and new.kontrolliert_von_profil_id is not distinct from old.kontrolliert_von_profil_id then
    return new;
  end if;

  select p.id, p.darf_kontrollieren
    into eigenes_profil, darf
    from public.profiles p
   where p.auth_user_id = auth.uid()
   limit 1;

  -- a) Wer darf ueberhaupt kontrollieren - bleibt der generische Fehlercode,
  --    die Meldung "Ihre Rolle darf diesen Vorgang nicht ausfuehren" trifft
  --    genau zu.
  if not public.has_role('admin', 'betriebsleitung') and coalesce(darf, false) is not true then
    raise exception 'Die Stichprobenkontrolle setzt nur die Betriebsleitung oder ein benannter Vorarbeiter.'
      using errcode = 'insufficient_privilege';
  end if;

  -- b) Vier Augen: eigener Fehlercode DA003, damit die Oberflaeche eine
  --    eigene, zutreffende Meldung zeigen kann statt der generischen
  --    Rechte-Meldung - die Rolle DARF kontrollieren, nur nicht diese Steige.
  if old.erfasst_von_profil_id is not null
     and eigenes_profil is not null
     and old.erfasst_von_profil_id = eigenes_profil then
    raise exception 'Wer eine Steige erfasst hat, kontrolliert sie nicht selbst.'
      using errcode = 'DA003';
  end if;

  if new.kontrolliert_am is not null and new.kontroll_befund is null then
    raise exception 'Zu einer Stichprobenkontrolle gehoert ein Befund.'
      using errcode = 'check_violation';
  end if;

  if new.kontroll_befund = 'abweichung'
     and coalesce(btrim(new.kontroll_begruendung), '') = '' then
    raise exception 'Eine Abweichung verlangt eine Begruendung.'
      using errcode = 'check_violation';
  end if;

  if new.kontroll_befund is not null and new.kontrolliert_am is null then
    raise exception 'Ein Befund ohne Kontrollzeitpunkt ist kein Nachweis.'
      using errcode = 'check_violation';
  end if;

  if new.kontrolliert_am is not null then
    new.kontrolliert_von_profil_id := eigenes_profil;
  end if;

  return new;
end;
$$;

comment on function public.steige_kontrolle_pruefen is
  'Anforderung 2.10: setzt das vollstaendige Abnahmekriterium durch - Kontrollrecht (Betriebsleitung oder benannter Vorarbeiter), Vier-Augen-Regel gegen erfasst_von_profil_id (eigener Fehlercode DA003 fuer eine zutreffende Meldung), Befundpflicht, Begruendungspflicht bei Abweichung. erfasst_von_profil_id ist ab dem Insert unveraenderlich, eine gesetzte Kontrolle ist nach dem ersten Befund unveraenderlich. Ersetzt die Fassung aus 20261014000000.';
