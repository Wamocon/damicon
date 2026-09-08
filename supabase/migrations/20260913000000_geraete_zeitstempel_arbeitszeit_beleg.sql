-- =============================================================================
-- Damicon - Geraete-Zeitstempel fuer Arbeitszeit und Fotobeleg (Vorstufe 2.5)
-- =============================================================================
-- Migration 20260911000000 brachte die Geraete-/Servereingang-Trennung fuer
-- pflueckaufgaben, kuehlketten_messungen und steigen - arbeitszeiten und
-- media_belege blieben aussen vor. Bei arbeitszeiten war das bisher sogar
-- funktional kaputt fuer eine verzoegerte Synchronisierung: arbeitszeitErfassen()
-- berechnete beginn/ende aus new Date() im Moment der Serverausfuehrung, nicht
-- aus einem Client-Feld - eine verzoegert synchronisierte Meldung haette die
-- SYNC-Zeit statt der tatsaechlichen Arbeitszeit aufgezeichnet.
--
-- arbeitszeiten passt nicht in das bestehende Muster der anderen drei Tabellen
-- (Trigger berechnet die Zielspalte aus geraet_zeitpunkt, wenn NULL): beginn
-- ist not null ohne Spaltenvorgabe, minuten ist eine generierte Spalte aus
-- ende - beginn. Die Anwendung berechnet beginn/ende deshalb weiterhin selbst
-- (siehe lib/actions/nachweiskette.ts), jetzt aber aus dem geprueften
-- Geraete-Zeitpunkt statt aus der Serverzeit. Der Trigger hier uebernimmt
-- ausschliesslich die Plausibilitaetspruefung (Seiteneffekt: raise exception
-- bei unplausiblem Wert), keine Wertzuweisung - dasselbe Muster, mit dem
-- steige_zeitpunkt_stempeln() geraet_zeitpunkt_pruefen() bereits ohne eigenes
-- GRANT EXECUTE aus einem SECURITY-INVOKER-Trigger heraus aufruft.
--
-- media_belege.aufgenommen_am folgt dagegen dem etablierten Muster: seed.sql
-- setzt es an mehreren Stellen explizit (historische Belege) - der Trigger
-- respektiert einen bereits gesetzten Wert und berechnet nur, wenn er fehlt,
-- exakt wie bei kuehlketten_messungen.gemessen_am und steigen.scan_zeitpunkt.
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. arbeitszeiten: Plausibilitaetspruefung, keine Wertzuweisung
-- ---------------------------------------------------------------------------
alter table public.arbeitszeiten
  add column if not exists geraet_zeitpunkt timestamptz,
  add column if not exists server_eingang_zeitpunkt timestamptz;

comment on column public.arbeitszeiten.geraet_zeitpunkt is
  'Vom Client mitgegebener Zeitpunkt der Meldung (lokale Geraeteuhr). beginn/ende werden bereits in der Anwendung daraus berechnet - dieser Trigger prueft nur die Plausibilitaet, siehe geraet_zeitpunkt_pruefen().';
comment on column public.arbeitszeiten.server_eingang_zeitpunkt is
  'Wann die Meldung tatsaechlich beim Server ankam - unveraendert.';

create or replace function public.arbeitszeit_zeitpunkt_pruefen()
returns trigger
language plpgsql
as $$
begin
  new.server_eingang_zeitpunkt := coalesce(new.server_eingang_zeitpunkt, now());

  -- Reine Plausibilitaetspruefung als Seiteneffekt (raise exception bei
  -- unplausiblem Wert, SQLSTATE DA001) - beginn/ende kommen bereits geprueft
  -- aus der Anwendung, geraet_zeitpunkt_pruefen() setzt hier nichts.
  if new.geraet_zeitpunkt is not null then
    perform public.geraet_zeitpunkt_pruefen(new.geraet_zeitpunkt, new.server_eingang_zeitpunkt);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_arbeitszeit_zeitpunkt on public.arbeitszeiten;
create trigger trg_arbeitszeit_zeitpunkt
  before insert on public.arbeitszeiten
  for each row execute function public.arbeitszeit_zeitpunkt_pruefen();

-- ---------------------------------------------------------------------------
-- 2. media_belege: etabliertes Muster (Trigger berechnet nur, wenn NULL)
-- ---------------------------------------------------------------------------
alter table public.media_belege
  add column if not exists geraet_zeitpunkt timestamptz,
  add column if not exists server_eingang_zeitpunkt timestamptz;

comment on column public.media_belege.geraet_zeitpunkt is
  'Vom Client mitgegebener Aufnahmezeitpunkt (lokale Geraeteuhr). aufgenommen_am uebernimmt ihn, wenn plausibel - siehe geraet_zeitpunkt_pruefen().';
comment on column public.media_belege.server_eingang_zeitpunkt is
  'Wann der Beleg tatsaechlich beim Server ankam - unveraendert.';

-- Wie bei kuehlketten_messungen.gemessen_am (Migration 20260911000000): der
-- bisherige "not null default now()" wuerde aufgenommen_am schon vor dem
-- Trigger fuellen - dann liesse sich "bewusst mitgegeben" (Seed-Daten mit
-- historischen Zeitpunkten) nicht mehr von "einfach nicht gesetzt"
-- unterscheiden.
alter table public.media_belege alter column aufgenommen_am drop default;

create or replace function public.beleg_zeitpunkt_stempeln()
returns trigger
language plpgsql
as $$
begin
  new.server_eingang_zeitpunkt := coalesce(new.server_eingang_zeitpunkt, now());

  -- Ein ausdruecklich mitgegebener aufgenommen_am-Wert (Seed-Daten mit
  -- historischen Zeitpunkten, siehe seed.sql) bleibt unangetastet - nur ein
  -- fehlender Wert wird aus dem Geraete-Zeitstempel berechnet.
  if new.aufgenommen_am is null then
    new.aufgenommen_am := public.geraet_zeitpunkt_pruefen(new.geraet_zeitpunkt, new.server_eingang_zeitpunkt);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_beleg_zeitpunkt on public.media_belege;
create trigger trg_beleg_zeitpunkt
  before insert on public.media_belege
  for each row execute function public.beleg_zeitpunkt_stempeln();
