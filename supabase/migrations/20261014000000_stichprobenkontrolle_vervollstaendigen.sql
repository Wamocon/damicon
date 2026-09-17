-- =============================================================================
-- Damicon - Stichprobenkontrolle vervollstaendigen (Anforderung 2.10)
-- =============================================================================
-- Das Abnahmekriterium verlangt vier Dinge. Erfuellt waren zwei davon
-- (Migration 20260919000000: Zeitpunkt und Person; 20260919010000: Schutz des
-- Feldes vor der eigenen Brigade). Diese Migration ergaenzt die fehlenden:
--
--   "Der Vorarbeiter markiert mit einem Klick eine Steige als kontrolliert;
--    Zeitpunkt, Person und BEFUND werden gespeichert, eine Abweichung
--    verlangt eine BEGRUENDUNG. NIEMAND KONTROLLIERT EINE STEIGE, DIE ER
--    SELBST ERFASST HAT."
--
-- 1. Befund und Begruendung fehlten ganz.
-- 2. Die Vier-Augen-Regel war nirgends durchgesetzt.
-- 3. Kontrollieren durfte nur betriebsleitung/admin - beide stehen nicht am
--    Sammelpunkt. Der Vorarbeiter gehoert zur Rolle "brigade" (Stufe 40, die
--    ganze Feldmannschaft), und eine achte Rolle wuerde Anforderung 7.1
--    brechen, die mit genau sieben Rollen abgenommen ist. Deshalb ein
--    Kennzeichen am Profil: die Betriebsleitung benennt einzelne Personen
--    innerhalb der Brigade, die Rollenliste bleibt unveraendert.
--    (Entscheidung des Auftraggebers vom 16.09.2026.)
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. Befund als Enum, nicht als Freitext
-- ---------------------------------------------------------------------------
-- Zwei Auspraegungen genuegen: Die Steige ist in Ordnung, oder sie weicht ab.
-- Ein Enum statt eines Booleans, weil die Anforderungsliste (Q-02) spaeter
-- Abstufungen vorsehen kann und ein Enum sich erweitern laesst, ohne dass
-- bestehende Zeilen ihre Bedeutung wechseln.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'kontroll_befund') then
    create type public.kontroll_befund as enum ('in_ordnung', 'abweichung');
  end if;
end;
$$;

alter table public.steigen
  add column if not exists kontroll_befund public.kontroll_befund,
  add column if not exists kontroll_begruendung text;

comment on column public.steigen.kontroll_befund is
  'Anforderung 2.10: Ergebnis der Stichprobenkontrolle. Null = noch nicht kontrolliert.';
comment on column public.steigen.kontroll_begruendung is
  'Anforderung 2.10: Pflichtangabe bei Befund abweichung, sonst leer.';

-- ---------------------------------------------------------------------------
-- 2. Wer die Steige erfasst hat - Grundlage der Vier-Augen-Regel
-- ---------------------------------------------------------------------------
-- pfluecker_id beantwortet die Frage nicht: Das ist die Person, deren Leistung
-- die Steige zaehlt, nicht die Person, die sie im Geraet angelegt hat. Am
-- Sammelpunkt erfasst die Brigade fuer den Pfluecker. Ohne eigenes Feld liesse
-- sich "selbst erfasst" nicht pruefen.
--
-- Nullable, weil der Altbestand es nicht traegt. Der Trigger unten behandelt
-- diesen Fall ausdruecklich.
alter table public.steigen
  add column if not exists erfasst_von_profil_id uuid references public.profiles(id) on delete set null;

comment on column public.steigen.erfasst_von_profil_id is
  'Anforderung 2.10: Profil, das die Steige angelegt hat. Grundlage der Vier-Augen-Regel; nicht zu verwechseln mit pfluecker_id, der Person, deren Leistung sie zaehlt. Null bei Zeilen aus der Zeit vor dieser Migration.';

-- Beim Anlegen automatisch fuellen. Als Trigger statt als Spalten-Default,
-- weil ein Default die Zeile nicht schuetzt: ein Client koennte eine fremde
-- Profil-Kennung mitschicken und sich damit aus der Vier-Augen-Regel
-- herausschreiben.
create or replace function public.steige_erfasser_setzen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.erfasst_von_profil_id := (
    select p.id from public.profiles p where p.auth_user_id = auth.uid() limit 1
  );
  return new;
end;
$$;

comment on function public.steige_erfasser_setzen is
  'Anforderung 2.10: setzt erfasst_von_profil_id beim Anlegen einer Steige auf das Profil des angemeldeten Nutzers und ueberschreibt einen mitgesendeten Wert.';

drop trigger if exists trg_steige_erfasser_setzen on public.steigen;
create trigger trg_steige_erfasser_setzen before insert on public.steigen
  for each row execute function public.steige_erfasser_setzen();

-- ---------------------------------------------------------------------------
-- 3. Kennzeichen "darf kontrollieren" am Profil
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists darf_kontrollieren boolean not null default false;

comment on column public.profiles.darf_kontrollieren is
  'Anforderung 2.10: benennt einzelne Personen der Rolle brigade als Vorarbeiter mit Kontrollrecht. Vergibt nur die Betriebsleitung (Trigger trg_profil_kontrollrecht_pruefen). Fuer admin und betriebsleitung ohne Bedeutung, sie duerfen ohnehin.';

-- Das Kennzeichen vergibt nur, wer auch Rollen vergibt. Sonst setzte es sich
-- jeder Brigade-Nutzer selbst und das Kontrollrecht waere wertlos - dieselbe
-- Ueberlegung wie in Regel GR-11 fuer Rollen.
create or replace function public.profil_kontrollrecht_pruefen()
returns trigger
language plpgsql
as $$
begin
  if new.darf_kontrollieren is distinct from old.darf_kontrollieren
     and not public.has_role('admin', 'betriebsleitung') then
    raise exception 'Das Kontrollrecht vergibt nur die Betriebsleitung.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

comment on function public.profil_kontrollrecht_pruefen is
  'Anforderung 2.10: nur admin/betriebsleitung setzen profiles.darf_kontrollieren, analog zur Rollenvergabe (GR-11).';

drop trigger if exists trg_profil_kontrollrecht_pruefen on public.profiles;
create trigger trg_profil_kontrollrecht_pruefen before update on public.profiles
  for each row execute function public.profil_kontrollrecht_pruefen();

-- Der Trigger allein genuegt nicht: bisher gab es auf profiles nur die Policy
-- profiles_update_self (Migration 20260902090100), und die laesst jeden
-- ausschliesslich das EIGENE Profil aendern. Die Betriebsleitung konnte damit
-- niemanden benennen - das Kennzeichen waere eine Spalte gewesen, die niemand
-- setzen kann. Der Abnahmetest hat genau das gefunden.
--
-- Bewusst nur admin und betriebsleitung, nicht has_office_access(): das
-- schloesse die Buchhaltung ein, die mit der Feldkontrolle nichts zu tun hat.
-- Die Rolle selbst bleibt geschuetzt, dafuer sorgt unabhaengig von dieser
-- Policy weiterhin profil_rolle_schuetzen() (Anforderung 7.2).
drop policy if exists profiles_update_leitung on public.profiles;
create policy profiles_update_leitung on public.profiles
  for update to authenticated
  using (public.has_role('admin', 'betriebsleitung'))
  with check (public.has_role('admin', 'betriebsleitung'));

comment on policy profiles_update_leitung on public.profiles is
  'Anforderung 2.10: Betriebsleitung und Administration pflegen fremde Profile, um Vorarbeiter zu benennen. Die Rolle bleibt durch profil_rolle_schuetzen() geschuetzt (Anforderung 7.2), das Kennzeichen durch profil_kontrollrecht_pruefen().';

-- ---------------------------------------------------------------------------
-- 4. Die Kontrollpruefung selbst
-- ---------------------------------------------------------------------------
-- Ersetzt steige_kontrolle_pruefen() aus 20260919010000. Die alte Fassung
-- liess nur admin/betriebsleitung zu und pruefte weder Befund noch Begruendung
-- noch die Vier-Augen-Regel.
--
-- security definer, weil die Funktion public.profiles liest: ein Nutzer der
-- Rolle brigade sieht ueber die RLS-Policy nicht zwingend sein eigenes Profil
-- samt Kennzeichen. Ohne definer haengt die Pruefung an der Lesesicht des
-- Aufrufers und liefe ins Leere.
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
  -- Sicherheits-Review vom 17.09.2026 (QA-Ultra zu 2.7/2.8/2.10), empirisch
  -- gegen PGlite bestaetigt: erfasst_von_profil_id war NICHT Teil dieser
  -- Bedingung, liess sich also per direktem UPDATE (unter Umgehung der
  -- Oberflaeche, z. B. via PostgREST mit dem eigenen Session-JWT) auf null
  -- setzen, ohne dass dieser Trigger ueberhaupt auslöste - die Vier-Augen-Pruefung
  -- weiter unten behandelt alte Zeilen ohne Erfasser bewusst als "nicht pruefbar,
  -- also zulassen" (Altbestand-Fall), und genau dieser Fall liess sich damit
  -- durch die eigentliche Erfasserin/den Erfasser selbst herbeifuehren. Die Spalte
  -- ist deshalb ab dem ersten INSERT unveraendert: JEDER Aenderungsversuch wird
  -- abgewiesen, unabhaengig davon, ob sich sonst etwas an der Zeile aendert -
  -- diese Pruefung muss daher VOR dem Kurzschluss unten stehen, sonst wuerde ein
  -- isolierter Aenderungsversuch an nur dieser einen Spalte den Kurzschluss
  -- treffen und ungeprueft durchlaufen.
  if new.erfasst_von_profil_id is distinct from old.erfasst_von_profil_id then
    raise exception 'Wer eine Steige erfasst hat, laesst sich nachtraeglich nicht mehr aendern.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Sicherheits-Review, Zusatzfund: eine bereits gesetzte Kontrolle liess sich
  -- per direktem UPDATE erneut ueberschreiben - auch von der urspruenglich
  -- kontrollierenden Person selbst, ohne zweiten Blick. Die Server Action filtert
  -- das nur ueber .is("kontrolliert_am", null) im Query, was denselben Bypass wie
  -- oben zulaesst. Ab dem ersten gesetzten Befund ist die Kontrolle deshalb
  -- unveraendert - Korrekturen brauchen einen fachlichen Weg (neue Kontrolle
  -- eines Ausschusses o. ae.), keinen stillen Overwrite.
  if old.kontrolliert_am is not null
     and (new.kontrolliert_am is distinct from old.kontrolliert_am
          or new.kontroll_befund is distinct from old.kontroll_befund
          or new.kontroll_begruendung is distinct from old.kontroll_begruendung
          or new.kontrolliert_von_profil_id is distinct from old.kontrolliert_von_profil_id) then
    raise exception 'Eine bereits durchgefuehrte Stichprobenkontrolle laesst sich nicht mehr aendern.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Nichts an der Kontrolle geaendert: durchlassen. Die Brigade pflegt hier
  -- Gewicht, Scan-Zeitpunkt und Pfluecker, das darf sie weiterhin.
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

  -- a) Wer darf ueberhaupt kontrollieren
  if not public.has_role('admin', 'betriebsleitung') and coalesce(darf, false) is not true then
    raise exception 'Die Stichprobenkontrolle setzt nur die Betriebsleitung oder ein benannter Vorarbeiter.'
      using errcode = 'insufficient_privilege';
  end if;

  -- b) Vier Augen: nicht die selbst erfasste Steige. Traegt die Zeile keinen
  --    Erfasser (Altbestand), laesst sich die Regel nicht pruefen; sie wird
  --    dann nicht erfunden, sondern die Kontrolle zugelassen. Seit dem Fix oben
  --    kann alter Bestand ohne Erfasser nicht mehr nachtraeglich herbeigefuehrt
  --    werden - er bleibt nur echter Altbestand aus der Zeit vor dieser Spalte.
  if old.erfasst_von_profil_id is not null
     and eigenes_profil is not null
     and old.erfasst_von_profil_id = eigenes_profil then
    raise exception 'Wer eine Steige erfasst hat, kontrolliert sie nicht selbst.'
      using errcode = 'insufficient_privilege';
  end if;

  -- c) Eine Kontrolle ohne Befund ist keine Kontrolle
  if new.kontrolliert_am is not null and new.kontroll_befund is null then
    raise exception 'Zu einer Stichprobenkontrolle gehoert ein Befund.'
      using errcode = 'check_violation';
  end if;

  -- d) Abweichung ohne Begruendung waere ein Befund ohne Aussage
  if new.kontroll_befund = 'abweichung'
     and coalesce(btrim(new.kontroll_begruendung), '') = '' then
    raise exception 'Eine Abweichung verlangt eine Begruendung.'
      using errcode = 'check_violation';
  end if;

  -- e) Kein Befund ohne Zeitpunkt: sonst stuende ein Ergebnis ohne Nachweis,
  --    wann es entstanden ist.
  if new.kontroll_befund is not null and new.kontrolliert_am is null then
    raise exception 'Ein Befund ohne Kontrollzeitpunkt ist kein Nachweis.'
      using errcode = 'check_violation';
  end if;

  -- f) Die kontrollierende Person wird gesetzt, nicht vom Client erwartet.
  if new.kontrolliert_am is not null then
    new.kontrolliert_von_profil_id := eigenes_profil;
  end if;

  return new;
end;
$$;

comment on function public.steige_kontrolle_pruefen is
  'Anforderung 2.10: setzt das vollstaendige Abnahmekriterium durch - Kontrollrecht (Betriebsleitung oder benannter Vorarbeiter), Vier-Augen-Regel gegen erfasst_von_profil_id, Befundpflicht, Begruendungspflicht bei Abweichung. erfasst_von_profil_id ist ab dem Insert unveraenderlich, eine gesetzte Kontrolle ist nach dem ersten Befund unveraenderlich (Sicherheits-Review 17.09.2026: beides liess sich zuvor per direktem UPDATE umgehen). Ersetzt die Fassung aus 20260919010000.';
