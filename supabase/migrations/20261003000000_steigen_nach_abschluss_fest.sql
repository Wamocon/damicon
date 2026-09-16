-- =============================================================================
-- Damicon - Steigen nach Abschluss unveraenderlich (Anforderung 4.1)
-- =============================================================================
-- Abnahmekriterium 4.1: "Nach Abschluss lassen sich Erntemengen, Behandlungen,
-- Kuehlmessungen und Finanzbuchungen von keiner Rolle aendern oder loeschen;
-- Korrekturen entstehen als Gegenbuchung."
--
-- Was bereits geschuetzt ist:
--   * pflueckaufgaben (Menge, Ausschuss, Qualitaetsfaktor) nach 'abgeschlossen'
--     - Migration 20260917000000
--   * pflanzenschutz_behandlungen, ausser der regulaeren Wartezeit-Freigabe
--     - Migrationen 20260917000000 und 20260917010000
--   * kuehlketten_messungen - Migration 20260917000000
--   * finance_ledger_entries, audit_events - seit dem initialen Schema
--
-- Was fehlte: public.steigen. Das ist keine Nebensache, sondern die Zeile, aus
-- der der Lohn rechnet. lohn_periode_berechnen() (Migration 20260908130000)
-- summiert gewicht_kg je pfluecker_id ueber den Abrechnungszeitraum. Solange
-- beide Felder nach Abschluss der Pflueckaufgabe aenderbar bleiben, laesst
-- sich eine bereits abgerechnete Leistung nachtraeglich einer anderen Person
-- zuschreiben oder im Gewicht verschieben - ohne Spur, weil die Aufgabe
-- selbst dann laengst gesperrt ist. Die Nachweiskette endet damit genau an
-- der Stelle, an der es um Geld geht.
--
-- Gesperrt werden die drei Felder, aus denen der Lohn rechnet - Gewicht,
-- Person und Scan-Zeitpunkt - sowie der Aufgabenbezug selbst, und zwar nach
-- Abschluss der zugehoerigen Aufgabe. charge_id und kontrolliert_am bleiben
-- aenderbar: die Zuordnung zur Charge entsteht teils spaeter im Ablauf
-- (Kuehlung, Verladung), und die Stichprobenkontrolle aus Anforderung 2.10
-- soll auch nach Abschluss noch nachgetragen werden koennen. Beides
-- verschiebt keine Leistung.
--
-- BEWUSST NICHT TEIL DIESER MIGRATION:
--   * Die service_role-Ausnahme. block_erntebuchung_mutation() und
--     behandlung_aendern_pruefen() lassen einen Aufruf mit auth.uid() is null
--     durch, und dieser Trigger tut es genauso. Anders ginge es nicht:
--     supabase/seed.sql, seed-auth.mjs und die Integrationstests schreiben
--     ueber genau diesen Weg. Wer den service_role-Schluessel hat, kann die
--     Datenbank ohnehin direkt aendern - das ist eine organisatorische Frage
--     (wer haelt den Schluessel), keine, die ein Trigger beantwortet. Der
--     Abnahmetest haelt das ausdruecklich fest, damit niemand die Luecke
--     fuer geschlossen haelt.
--   * Die Gegenbuchung fuer Erntemengen. Fuer finance_ledger_entries gibt es
--     sie, fuer Steigen nicht. Was eine "Gegensteige" fachlich bedeutet -
--     Storno mit negativem Gewicht, oder eine Korrekturzeile mit Bezug auf
--     die alte - ist eine betriebliche Festlegung, keine technische.
-- =============================================================================

set search_path = public;

-- security definer, mit festem search_path. Die Funktion liest
-- public.pflueckaufgaben, um den Status zu erfahren. Ohne definer haengt der
-- Schutz an der SELECT-Policy der aufrufenden Rolle: sieht sie die Aufgabe
-- nicht, kommt v_status als null zurueck, "is distinct from 'abgeschlossen'"
-- ist wahr, und der Trigger laesst durch - lautlos, ohne Fehlermeldung.
-- Heute traegt pflueckaufgaben_select_intern ein using(true), der Schutz
-- greift also. Wer diese Policy je verengt, wuerde die Sperre aushebeln,
-- ohne es zu merken. Dieselbe Entscheidung wie bei audit_actor_setzen() und
-- schreibvorgang_protokollieren().
create or replace function public.steige_nach_abschluss_fest()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alt   public.pflueckaufgabe_status;
  v_neu   public.pflueckaufgabe_status;
begin
  -- Serverseitiger Aufruf (service_role): derselbe Weg wie in
  -- block_erntebuchung_mutation(). Seed, Integrationstests und eine
  -- Korrektur ausserhalb der Anwendung bleiben moeglich.
  if auth.uid() is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  -- BEIDE Seiten pruefen, nicht nur eine. Ein coalesce(old, new) nimmt bei
  -- einem UPDATE immer die alte Aufgabe - damit liesse sich eine Steige von
  -- einer offenen auf eine abgeschlossene Aufgabe umhaengen: geprueft wuerde
  -- die offene, gelandet waere sie an der fertigen. Herausnehmen war
  -- verboten, Hineinlegen erlaubt.
  if tg_op <> 'INSERT' and old.pflueckaufgabe_id is not null then
    select status into v_alt from public.pflueckaufgaben where id = old.pflueckaufgabe_id;
  end if;
  if tg_op <> 'DELETE' and new.pflueckaufgabe_id is not null then
    select status into v_neu from public.pflueckaufgaben where id = new.pflueckaufgabe_id;
  end if;

  -- INSERT: eine neue Steige an einer abgeschlossenen Aufgabe erzeugt Lohn
  -- aus dem Nichts. lohn_periode_berechnen() summiert ueber pflueckaufgabe_id
  -- und fragt den Aufgabenstatus nicht ab; eine bereits abgerechnete Periode
  -- laesst sich damit nachtraeglich aufblaehen. Am 16.09.2026 gegen PGlite
  -- nachgestellt: eine 500-kg-Steige auf eine fertige Aufgabe, 8 kg wurden zu
  -- 508 kg. Deshalb faengt der Trigger auch den INSERT ab - mit eigener
  -- Meldung, weil "unveraenderlich" fuer einen INSERT der falsche Begriff ist.
  if tg_op = 'INSERT' then
    if v_neu = 'abgeschlossen' then
      raise exception 'Zu einer abgeschlossenen Pflueckaufgabe laesst sich keine Steige mehr hinzufuegen (Anforderung 4.1) - der Lohn ist dann bereits gerechnet.'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if v_alt = 'abgeschlossen' then
      raise exception 'Die Steige gehoert zu einer abgeschlossenen Pflueckaufgabe und laesst sich nicht loeschen (Anforderung 4.1).'
        using errcode = '23514';
    end if;
    return old;
  end if;

  -- UPDATE: gesperrt ist es, sobald EINE der beiden Aufgaben abgeschlossen
  -- ist - die Quelle wie das Ziel.
  if v_alt is distinct from 'abgeschlossen' and v_neu is distinct from 'abgeschlossen' then
    return new;
  end if;

  if new.pflueckaufgabe_id is distinct from old.pflueckaufgabe_id then
    raise exception 'Eine Steige laesst sich nicht zu oder von einer abgeschlossenen Pflueckaufgabe umhaengen (Anforderung 4.1).'
      using errcode = '23514';
  end if;

  -- scan_zeitpunkt gehoert dazu, auch wenn er auf den ersten Blick keine
  -- Leistung verschiebt: lohn_periode_berechnen() (Migration 20260908130000)
  -- waehlt die Steigen einer Abrechnung ueber
  -- "scan_zeitpunkt::date between p_periode_start and p_periode_ende". Wer das
  -- Datum in die Folgeperiode schiebt, laesst dieselbe Leistung zweimal
  -- auszahlen, ohne das Gewicht anzufassen - am 16.09.2026 nachgestellt.
  if new.gewicht_kg is distinct from old.gewicht_kg
     or new.pfluecker_id is distinct from old.pfluecker_id
     or new.scan_zeitpunkt is distinct from old.scan_zeitpunkt then
    raise exception 'Gewicht, Pflueckerzuordnung und Scan-Zeitpunkt einer Steige sind nach Abschluss der Pflueckaufgabe unveraenderlich (Anforderung 4.1) - der Lohn rechnet daraus.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.steige_nach_abschluss_fest is
  'Anforderung 4.1: Gewicht, Pflueckerzuordnung, Scan-Zeitpunkt und Aufgabenbezug einer Steige sind nach Abschluss der Pflueckaufgabe fuer jede angemeldete Rolle unveraenderlich, und es kommt keine Steige mehr hinzu - der Lohn rechnet daraus (lohn_periode_berechnen, Migration 20260908130000). service_role bleibt durchlaessig, wie bei block_erntebuchung_mutation().';

drop trigger if exists trg_steige_nach_abschluss_insert on public.steigen;
create trigger trg_steige_nach_abschluss_insert
  before insert on public.steigen
  for each row execute function public.steige_nach_abschluss_fest();

drop trigger if exists trg_steige_nach_abschluss_update on public.steigen;
create trigger trg_steige_nach_abschluss_update
  before update on public.steigen
  for each row execute function public.steige_nach_abschluss_fest();

-- Der DELETE-Zweig ist heute fuer Anwendungsrollen unerreichbar: steigen hat
-- keine DELETE-Policy, ein Loeschversuch endet ohne Wirkung. Der Trigger
-- bleibt trotzdem - als zweite Linie, falls jemand spaeter eine DELETE-Policy
-- ergaenzt, ohne an diese Regel zu denken.
drop trigger if exists trg_steige_nach_abschluss_delete on public.steigen;
create trigger trg_steige_nach_abschluss_delete
  before delete on public.steigen
  for each row execute function public.steige_nach_abschluss_fest();

-- ---------------------------------------------------------------------------
-- Gewicht kann nicht negativ sein
-- ---------------------------------------------------------------------------
-- steigen trug bisher keinen einzigen Check-Constraint. Eine Steige mit
-- -500 kg war einfuegbar und senkte die Lohnsumme - dieselbe Wirkung wie B1,
-- nur in die andere Richtung. numeric(6,2) deckelt nach oben bei 9999,99 kg;
-- das ist die Typbreite, keine fachliche Regel, reicht hier aber.
alter table public.steigen
  drop constraint if exists steige_gewicht_nicht_negativ;
alter table public.steigen
  add constraint steige_gewicht_nicht_negativ check (gewicht_kg is null or gewicht_kg >= 0);

comment on table public.steigen is
  'QR-Steigenkennung (1Cati Migration 28). QR-pro-Steige statt QR-pro-Zone. Anforderung 4.1: Gewicht und Pflueckerzuordnung sind nach Abschluss der Pflueckaufgabe unveraenderlich.';
