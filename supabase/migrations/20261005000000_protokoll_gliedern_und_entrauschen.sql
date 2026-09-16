-- =============================================================================
-- Damicon - Protokoll gliedern, indizieren und entrauschen (Anforderung 4.7)
-- =============================================================================
-- Nachtrag zu 20261004000000 aus dem QA-Durchlauf vom 16.09.2026. Drei Punkte,
-- die dort als Befund standen und die zusammengehoeren: alle drei entscheiden,
-- ob das Protokoll nach der ersten Saison noch benutzbar ist.
--
--   1. GLIEDERUNG. audit_events hat heute nur "ressource" als Zeichenkette.
--      Wer fragt "was ist im Bereich Geld passiert", muesste die Tabellennamen
--      auswendig kennen und einzeln aufzaehlen. Eine Spalte "bereich" ordnet
--      jeden Eintrag einer der fuenf Gruppen zu, die das System ohnehin kennt.
--
--   2. INDIZES. Die haeufigste Frage an ein Protokoll lautet "wer hat DIESE
--      Zeile angefasst" - also where ressource_id = ... . Dafuer gab es keinen
--      Index; idx_audit_ressource deckt nur (ressource, created_at) ab. Bei
--      hochgerechnet rund 430.000 Zeilen je Saison wird das ein Scan ueber die
--      halbe Tabelle.
--
--   3. RAUSCHEN. Jede eingefuegte Steige erzeugte bisher ZWEI Protokollzeilen:
--      eine fuer die Steige und eine fuer die Pflueckaufgabe, weil
--      steige_nummer_vergeben() (Migration 20260915000000) dort den Zaehler
--      steigen_zaehler hochsetzt. Bei 216.000 Steigen in einer Saison sind das
--      216.000 Eintraege, die "update auf pflueckaufgaben" behaupten, obwohl
--      fachlich nichts geschehen ist. Das ist nicht nur Platz, sondern es
--      verdeckt die echten Aenderungen an den Erntemengen.
--
-- Bewusst NICHT Teil dieser Migration: eine Loeschregel. Ein Compliance-Log,
-- das aelter als die Aufbewahrungsfrist ist, wird nicht geloescht, sondern
-- ausgelagert - und wohin, entscheidet der Betrieb, nicht diese Datei. Die
-- Gliederung unten ist die Voraussetzung dafuer: ohne sie liesse sich nicht
-- einmal sagen, welcher Teil wie lange aufzubewahren ist.
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. Gliederung nach Bereich
-- ---------------------------------------------------------------------------
-- Ein Enum kennt kein "create type if not exists" - deshalb der do-Block.
-- Die uebrigen Anweisungen dieser Datei sind ohnehin wiederholbar, damit ein
-- zweiter Lauf nicht an der ersten Zeile scheitert.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'audit_bereich') then
    create type public.audit_bereich as enum (
      'nachweiskette',  -- Ernte, Kuehlung, Behandlung: woraus der Nachweis entsteht
      'geld',           -- Lohn, Buchungen, Saetze
      'zugang',         -- Profile, Rollen, Einladungen
      'datenschutz',    -- Einwilligungen, personenbezogene Daten
      'stammdaten'      -- alles uebrige
    );
  end if;
end;
$$;

alter table public.audit_events
  add column if not exists bereich public.audit_bereich;

comment on column public.audit_events.bereich is
  'Gliederung des Protokolls (Anforderung 4.7). Wird beim Schreiben aus der betroffenen Tabelle abgeleitet, damit sich das Log nach Sachgebiet auswerten und spaeter bereichsweise archivieren laesst.';

-- Die Zuordnung Tabelle -> Bereich steht als Funktion, nicht als CASE mitten
-- im Trigger: so laesst sie sich einzeln lesen, testen und erweitern.
create or replace function public.audit_bereich_fuer(p_tabelle text)
returns public.audit_bereich
language sql
immutable
as $$
  select case p_tabelle
    when 'pflueckaufgaben'             then 'nachweiskette'
    when 'steigen'                     then 'nachweiskette'
    when 'chargen'                     then 'nachweiskette'
    when 'pflanzenschutz_behandlungen' then 'nachweiskette'
    when 'kuehlketten_messungen'       then 'nachweiskette'
    when 'reihenbloecke'               then 'nachweiskette'
    when 'media_belege'                then 'nachweiskette'
    when 'finance_ledger_entries'      then 'geld'
    when 'lohn_abrechnungen'           then 'geld'
    when 'lohn_positionen'             then 'geld'
    when 'lohn_saetze'                 then 'geld'
    when 'arbeitszeiten'               then 'geld'
    when 'profiles'                    then 'zugang'
    when 'kundeneinladungen'           then 'zugang'
    when 'einwilligungen'              then 'datenschutz'
    when 'pfluecker'                   then 'datenschutz'
    else 'stammdaten'
  end::public.audit_bereich;
$$;

comment on function public.audit_bereich_fuer is
  'Ordnet eine Tabelle einem Protokollbereich zu (Anforderung 4.7). Unbekannte Tabellen landen in stammdaten - das ist die harmloseste Gruppe, nicht die auffaelligste.';

-- ---------------------------------------------------------------------------
-- 2. Trigger: Bereich mitschreiben, Zaehlerrauschen auslassen
-- ---------------------------------------------------------------------------
create or replace function public.schreibvorgang_protokollieren()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- Rauschunterdrueckung: ein UPDATE auf pflueckaufgaben, das ausser dem
  -- Steigenzaehler und dem Aenderungsstempel nichts beruehrt, ist keine
  -- fachliche Handlung, sondern die Nebenwirkung eines Steigen-INSERT
  -- (steige_nummer_vergeben, Migration 20260915000000). Die Steige selbst
  -- wird protokolliert; ein zweiter Eintrag sagt nichts, verdeckt aber die
  -- echten Mengenaenderungen an derselben Tabelle.
  --
  -- Der Vergleich laeuft ueber to_jsonb, nicht ueber new.steigen_zaehler:
  -- dieselbe Funktion bedient 16 Tabellen, und 15 davon haben diese Spalte
  -- nicht. Ein direkter Feldzugriff wirft dort "record new has no field",
  -- auch wenn die Tabellenpruefung davorsteht - Postgres darf die Operanden
  -- eines and in beliebiger Reihenfolge auswerten. Deshalb verschachtelt
  -- statt verkettet, und ueber jsonb statt ueber den Record.
  if tg_op = 'UPDATE' and tg_table_name = 'pflueckaufgaben' then
    if to_jsonb(new)->>'steigen_zaehler' is distinct from to_jsonb(old)->>'steigen_zaehler'
       and to_jsonb(new) - 'steigen_zaehler' - 'updated_at'
         = to_jsonb(old) - 'steigen_zaehler' - 'updated_at' then
      return new;
    end if;
  end if;

  if tg_op = 'DELETE' then
    v_id := old.id;
  else
    v_id := new.id;
  end if;

  insert into public.audit_events (aktion, ressource, ressource_id, bereich, metadata)
  values (
    lower(tg_op),
    tg_table_name,
    v_id,
    public.audit_bereich_fuer(tg_table_name),
    jsonb_build_object(
      'quelle', 'datenbank-trigger',
      'mit_sitzung', auth.uid() is not null
    )
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

comment on function public.schreibvorgang_protokollieren is
  'Anforderung 4.7: schreibt fuer jeden INSERT/UPDATE/DELETE auf den Tabellen der Nachweiskette einen Audit-Eintrag - auch bei direktem Datenbankzugriff ohne die Anwendung. Den Urheber setzt audit_actor_setzen(), den Zeitpunkt audit_zeitpunkt_setzen(). Reine Fortschreibungen des Steigenzaehlers werden ausgelassen.';

-- ---------------------------------------------------------------------------
-- 3. Bereich auch fuer Eintraege aus den Server Actions
-- ---------------------------------------------------------------------------
-- Die 20 Schreibstellen in src/lib/actions/ setzen "ressource" auf einen
-- fachlichen Namen ("lohn", "finanzen", "kundeneinladungen"). Damit auch diese
-- Eintraege gegliedert sind, ohne 20 Dateien anzufassen, faellt die Zuordnung
-- beim Schreiben - in derselben Funktion, die schon den Urheber setzt.
create or replace function public.audit_zeitpunkt_setzen()
returns trigger
language plpgsql
as $$
begin
  new.created_at := now();
  if new.bereich is null then
    new.bereich := public.audit_bereich_fuer(new.ressource);
  end if;
  return new;
end;
$$;

comment on function public.audit_zeitpunkt_setzen is
  'Anforderung 4.7: setzt created_at und, falls nicht angegeben, den Bereich eines Audit-Eintrags serverseitig. Verhindert rueckdatierte Eintraege ueber audit_events_insert_authenticated und haelt die Gliederung auch fuer Eintraege aus den Server Actions vollstaendig.';

-- Bestandszeilen nachziehen, damit die Spalte von Anfang an ueberall gefuellt
-- ist und eine Auswertung nach Bereich keine Luecke hat.
--
-- Reparatur (Erstfassung scheiterte am ersten echten Deploy): trg_audit_no_update
-- (seit 20260902090000) blockt jedes UPDATE auf audit_events ausnahmslos,
-- auch das dieses Backfills selbst. Lokal fiel das nie auf - die
-- PGlite-Testsuite wendet alle Migrationen auf eine LEERE Datenbank an, bevor
-- ueberhaupt Seed-Daten eingefuegt werden, "where bereich is null" traf dort
-- null Zeilen und der Trigger feuert nie fuer eine Anweisung ohne betroffene
-- Zeile. Gegen das gehostete Projekt mit echten Bestandszeilen aus frueheren
-- Testlaeufen griff der Trigger sofort - genau die Klasse Defekt, vor der
-- Anforderung 7.5 warnt ("Migrationen gegen echtes Postgres testen, nicht
-- gegen Seed-Daten"). Fix: den Trigger fuer die Dauer dieses einen Backfills
-- gezielt abschalten statt die Sperre selbst aufzuweichen.
alter table public.audit_events disable trigger trg_audit_no_update;

update public.audit_events
   set bereich = public.audit_bereich_fuer(ressource)
 where bereich is null;

alter table public.audit_events enable trigger trg_audit_no_update;

-- ---------------------------------------------------------------------------
-- 4. Indizes
-- ---------------------------------------------------------------------------
-- "Wer hat diese Zeile angefasst": die haeufigste Frage an ein Protokoll und
-- bisher ohne Index. Als Teilindex, weil ein guter Teil der Eintraege aus den
-- Server Actions gar keine ressource_id traegt - die gehoeren nicht in den
-- Index und kosten dort nur Platz.
create index if not exists idx_audit_ressource_id
  on public.audit_events (ressource_id, created_at desc)
  where ressource_id is not null;

-- "Was ist im Bereich Geld passiert": die Auswertung, fuer die Punkt 1 da ist.
create index if not exists idx_audit_bereich
  on public.audit_events (bereich, created_at desc);
