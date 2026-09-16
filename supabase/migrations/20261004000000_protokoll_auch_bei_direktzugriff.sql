-- =============================================================================
-- Damicon - Protokollierung auch bei direktem Datenbankzugriff (Anforderung 4.7)
-- =============================================================================
-- Abnahmekriterium 4.7, erster Satz:
--   "Jede schreibende Aktion erzeugt einen unveraenderlichen Audit-Eintrag mit
--    serverseitig gesetztem Urheber, AUCH BEI DIREKTEM DATENBANKZUGRIFF."
--
-- Bis hierher entstanden alle Audit-Eintraege in den Server Actions - an 20
-- Stellen in src/lib/actions/. Das erfuellt den ersten Halbsatz, aber nicht den
-- zweiten: Wer ueber PostgREST, das Studio oder psql schreibt, hinterlaesst
-- keine Spur. Genau dieser Weg ist der interessante, wenn jemand etwas
-- verbergen will - ueber die Anwendung wird ohnehin protokolliert.
--
-- Ein Protokoll, das sich umgehen laesst, indem man die Anwendung umgeht, ist
-- als Nachweis wertlos. Deshalb gehoert der Eintrag in die Datenbank.
--
-- ENTWURFSENTSCHEIDUNGEN
--
-- 1. after-Trigger, nicht before. Ein before-Trigger, der schreibt, wuerde
--    bei jedem abgewiesenen Schreibvorgang einen Eintrag hinterlassen und
--    beim Rollback wieder verlieren. after heisst: protokolliert wird, was
--    tatsaechlich passiert ist.
--
-- 2. Alphabetische Trigger-Reihenfolge beachtet. Postgres feuert Trigger
--    gleicher Art alphabetisch. Die Schutztrigger aus Anforderung 4.1
--    (trg_steige_nach_abschluss_*, trg_behandlung_*, trg_kuehlmessung_*)
--    sind before-Trigger und werfen - danach laeuft kein after-Trigger mehr.
--    Das ist richtig so: eine abgewiesene Aenderung IST nicht passiert.
--
-- 3. Der Urheber kommt aus audit_actor_setzen() (Migration 20260905160000),
--    das auf audit_events bereits als before-insert-Trigger haengt. Diese
--    Migration schreibt actor deshalb NICHT selbst - sonst gaebe es zwei
--    Quellen fuer dieselbe Angabe. Bei einem Direktzugriff ohne Sitzung
--    setzt jene Funktion 'system', was den Fall korrekt beschreibt.
--
-- 4. Nur die Tabellen der Nachweiskette und der Finanzen. Eine Protokollierung
--    JEDER Tabelle waere teuer und unlesbar: jede Stammdatenpflege, jeder
--    Seed-Lauf, jeder Testaufbau erzeugte Eintraege. Die Auswahl folgt dem
--    Abnahmekriterium von 4.1 (Erntemengen, Behandlungen, Kuehlmessungen,
--    Finanzbuchungen) plus den Tabellen, an denen Geld und Zugang haengen.
--
-- 5. Doppelte Eintraege sind moeglich und in Kauf genommen: Schreibt eine
--    Server Action, protokolliert sie selbst UND dieser Trigger. Das ist der
--    bewusst gewaehlte Preis. Die Alternative - Erkennen, ob der Aufruf aus
--    der Anwendung kam - liesse sich nur ueber eine Sitzungsvariable bauen,
--    die jeder setzen kann, der direkt schreibt. Ein Protokoll, dessen
--    Vollstaendigkeit vom Wohlverhalten des Schreibenden abhaengt, ist keins.
--    Die Metadaten kennzeichnen die Herkunft (quelle: 'datenbank-trigger'),
--    sodass sich beide Eintraege auseinanderhalten lassen. Ein Cockpit, das
--    audit_events liest, gibt es allerdings noch nicht - heute liest die
--    Anwendung diese Tabelle an keiner Stelle.
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 0. Der Protokoll-Insert muss durchkommen - sonst faellt alles aus
-- ---------------------------------------------------------------------------
-- audit_events steht unter "force row level security" (Migration
-- 20260902090100, Zeile 43). "force" gilt ausdruecklich AUCH fuer den
-- Tabelleneigentuemer. schreibvorgang_protokollieren() laeuft als security
-- definer, also als Eigentuemer - und trifft damit auf dieselben Policies.
--
-- Bestehende Policies auf audit_events: genau eine, fuer "authenticated"
-- (Migration 20260905120000, Zeile 189). Fuer den Eigentuemer gibt es keine.
-- Ob der Insert durchkommt, haengt damit allein daran, ob die Rolle, unter der
-- diese Migration laeuft, BYPASSRLS besitzt. Auf der gehosteten Instanz ist
-- das nicht zugesichert.
--
-- Die Folge waere nicht ein fehlendes Protokoll, sondern ein Totalausfall:
-- der Insert laeuft in derselben Transaktion wie der fachliche Vorgang.
-- Scheitert er, rollt alles zurueck - jeder Schreibvorgang auf den 16
-- Tabellen unten, einschliesslich des Profil-Inserts bei jeder Kontoanlage
-- (handle_new_auth_user schreibt nach public.profiles).
--
-- In PGlite faellt das nie auf, weil dort alles als Superuser laeuft. Deshalb
-- steht die Bedingung hier ausdruecklich, statt sich auf eine Rollen-
-- eigenschaft der Zielinstanz zu verlassen.
drop policy if exists audit_events_insert_protokoll on public.audit_events;
create policy audit_events_insert_protokoll on public.audit_events
  for insert to public
  with check (true);

comment on policy audit_events_insert_protokoll on public.audit_events is
  'Anforderung 4.7: laesst den Insert aus schreibvorgang_protokollieren() durch, unabhaengig davon, unter welcher Rolle die Funktion laeuft. Ohne diese Policy koennte force row level security den Protokoll-Insert blockieren und damit jeden fachlichen Schreibvorgang mitreissen.';

-- ---------------------------------------------------------------------------
-- 0b. Ein Protokolleintrag traegt die Zeit seines Entstehens
-- ---------------------------------------------------------------------------
-- audit_events_insert_authenticated erlaubt jeder angemeldeten Rolle mit
-- "with check (true)" beliebige Eintraege - auch kunde und picker. Der actor
-- wird zwar serverseitig gesetzt (audit_actor_setzen), created_at aber nicht:
-- ein Eintrag liess sich auf ein beliebiges Datum zurueckdatieren und damit
-- eine Auswertung unbrauchbar machen. Seit dieser Migration ist audit_events
-- die alleinige Nachweisquelle fuer Anforderung 4.7, deshalb wird der
-- Zeitpunkt hier mitgehaertet.
create or replace function public.audit_zeitpunkt_setzen()
returns trigger
language plpgsql
as $$
begin
  new.created_at := now();
  return new;
end;
$$;

comment on function public.audit_zeitpunkt_setzen is
  'Anforderung 4.7: setzt created_at eines Audit-Eintrags serverseitig. Verhindert, dass ein angemeldeter Aufrufer ueber audit_events_insert_authenticated rueckdatierte Eintraege einschleust.';

drop trigger if exists trg_audit_zeitpunkt on public.audit_events;
create trigger trg_audit_zeitpunkt
  before insert on public.audit_events
  for each row execute function public.audit_zeitpunkt_setzen();

create or replace function public.schreibvorgang_protokollieren()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- Die betroffene Zeile: bei DELETE gibt es nur old, sonst new.
  if tg_op = 'DELETE' then
    v_id := old.id;
  else
    v_id := new.id;
  end if;

  insert into public.audit_events (aktion, ressource, ressource_id, metadata)
  values (
    lower(tg_op),
    tg_table_name,
    v_id,
    jsonb_build_object(
      -- Woran man einen Eintrag aus diesem Trigger erkennt. Eine Server
      -- Action schreibt zusaetzlich ihren eigenen, fachlich benannten
      -- Eintrag ("pflueckaufgabe.menge_gemeldet"); dieser hier ist der
      -- technische Zwilling, der auch dann entsteht, wenn niemand die
      -- Anwendung benutzt hat.
      'quelle', 'datenbank-trigger',
      -- Ob der Vorgang eine Sitzung hatte. false heisst: service_role,
      -- Studio, psql oder ein Seed-Lauf - also genau der Weg, den das
      -- Abnahmekriterium meint.
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
  'Anforderung 4.7: schreibt fuer jeden INSERT/UPDATE/DELETE auf den Tabellen der Nachweiskette einen Audit-Eintrag - auch bei direktem Datenbankzugriff ohne die Anwendung. Den Urheber setzt audit_actor_setzen() (Migration 20260905160000).';

-- ---------------------------------------------------------------------------
-- Trigger je Tabelle
-- ---------------------------------------------------------------------------
-- Namensschema trg_zzz_protokoll_*: das zzz sorgt dafuer, dass dieser Trigger
-- alphabetisch HINTER allen fachlichen Triggern derselben Tabelle laeuft.
-- Bei after-Triggern ist die Reihenfolge fachlich zwar gleichgueltig, aber ein
-- Protokolleintrag soll nach den Fortschreibungen entstehen, nicht zwischen
-- ihnen.
do $$
declare
  t text;
  tabellen text[] := array[
    -- Nachweiskette (Anforderung 4.1)
    'pflueckaufgaben', 'steigen', 'chargen', 'pflanzenschutz_behandlungen',
    'kuehlketten_messungen',
    -- Geld. arbeitszeiten gehoert hierher, auch wenn der Name harmlos klingt:
    -- lohn_periode_berechnen() (Migration 20260908130000) zieht daraus den
    -- Grundlohn, genau wie die Menge aus steigen. Eine Lohnquelle ohne
    -- Protokoll waere dieselbe Luecke wie eine Erntebuchung ohne Protokoll.
    'finance_ledger_entries', 'lohn_abrechnungen', 'lohn_positionen',
    'arbeitszeiten', 'lohn_saetze',
    -- Zugang und Rollen
    'profiles', 'kundeneinladungen',
    -- Personenbezogene Daten. pfluecker nennt Anforderung 4.7 im zweiten Satz
    -- ausdruecklich ("Pflueckerstamm"); wer dort Namen oder Ausweis aendert,
    -- aendert die Zuordnung der gesamten Nachweiskette.
    'einwilligungen', 'pfluecker',
    -- Die Erntesperre selbst. reihenbloecke.status traegt den Wert
    -- 'wartezeitgesperrt', an dem Anforderung 2.3 haengt. Weder
    -- lock_reihenblock_on_behandlung() noch reihenblock_freigeben()
    -- hinterliessen bisher eine Spur - eine vorzeitige Freigabe war damit
    -- nicht nachweisbar.
    'reihenbloecke',
    -- Der Fotobeleg ist der Nachweis zur Pflueckaufgabe (Anforderung 2.9).
    'media_belege'
  ];

-- Die Auswahl folgt einer Regel, nicht einem Bauchgefuehl: protokolliert wird,
-- woraus Geld, Sperren oder Zugang gerechnet werden - Ergebnisse UND die
-- Eingaben, aus denen sie entstehen. Eine Lohnabrechnung zu protokollieren und
-- den Lohnsatz nicht, schuetzt die falsche Haelfte: wer manipulieren will,
-- aendert nicht die Abrechnung, sondern ihre Grundlage.
--
-- Bewusst draussen: reine Stammdaten ohne Geld- oder Sperrwirkung (sorten,
-- plantagen, schulungsvideos, psm_mittel) und die Katalogtabellen der
-- oeffentlichen Seite. Sie erzeugten Rauschen ohne Nachweiswert.
begin
  foreach t in array tabellen loop
    -- to_regclass statt einer Annahme: einwilligungen und kundeneinladungen
    -- entstehen in spaeteren Migrationen, und diese Datei soll auch dann
    -- durchlaufen, wenn eine davon in einem Zweig fehlt.
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format(
      'drop trigger if exists trg_zzz_protokoll_%I on public.%I;', t, t
    );
    execute format(
      'create trigger trg_zzz_protokoll_%I after insert or update or delete on public.%I
         for each row execute function public.schreibvorgang_protokollieren();', t, t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Selbstschutz: der Trigger darf sich nicht selbst protokollieren
-- ---------------------------------------------------------------------------
-- audit_events steht bewusst NICHT in der Liste oben. Ein Protokoll-Trigger
-- auf der Protokolltabelle erzeugte eine Endlosschleife: jeder Eintrag loeste
-- den naechsten aus. Dieser Kommentar steht hier, damit niemand die Tabelle
-- spaeter "der Vollstaendigkeit halber" nachtraegt.

comment on table public.audit_events is
  '1Cati ai_action_logs / audit_events / access_events - append-only Compliance-Log. Anforderung 4.7: Eintraege entstehen sowohl in den Server Actions (fachlich benannt) als auch ueber schreibvorgang_protokollieren() bei direktem Datenbankzugriff (metadata.quelle = datenbank-trigger). Diese Tabelle traegt selbst KEINEN Protokoll-Trigger - das waere eine Endlosschleife.';
