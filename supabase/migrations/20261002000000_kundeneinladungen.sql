-- =============================================================================
-- Damicon - Kundenzugang ueber Einladung (Anforderung E.20)
-- =============================================================================
-- Abnahmekriterium: "Ein Kundenkonto entsteht nur ueber eine Einladung mit
-- einmaligem Code, der nur als Pruefsumme gespeichert wird; ohne Einladung
-- sieht niemand Kundendaten."
--
-- Bisher legte ausschliesslich supabase/seed-auth.mjs Kundenkonten an - mit dem
-- service_role-Schluessel, also ohne jeden Weg fuer das Buero, einen neuen
-- B2B-Kunden selbst freizuschalten. Diese Migration bringt die Tabelle dafuer.
--
-- Der Klartext-Code steht NIRGENDS in der Datenbank. Gespeichert wird nur sein
-- SHA-256-Hexdigest; die Anwendung zeigt den Code genau einmal beim Anlegen an.
-- Geht er verloren, wird die Einladung zurueckgezogen und eine neue erzeugt -
-- derselbe Umgang wie mit einem Passwort-Reset, nicht mit einem Merkzettel.
--
-- BEWUSST NICHT TEIL DIESER MIGRATION:
--   * Kein Status 'abgelaufen'. Ablauf ergibt sich aus gueltig_bis < now() und
--     wird bei jeder Abfrage berechnet. Ein eigener Status muesste von einem
--     Cron-Lauf fortgeschrieben werden, den es hier nicht gibt - und ein
--     Status, den niemand pflegt, luegt frueher oder spaeter.
--   * Kein Versand. Wie die Einladung den Kunden erreicht (Messenger, E-Mail,
--     Ausdruck), ist Anforderung 5.6 und wartet auf Workshop 3. Das Buero gibt
--     den Code heute selbst weiter.
--   * Keine Einladung fuer interne Rollen. Die Tabelle fuehrt bewusst kein
--     Rollenfeld: sie legt ausschliesslich Kundenkonten an. Eine Einladung, die
--     eine beliebige Rolle vergeben kann, waere ein Rechteausweitungspfad -
--     interne Konten bleiben beim service_role-Weg, bis es dafuer eine eigene,
--     eng gefasste Anforderung gibt.
--
-- Das Einloesen laeuft NICHT ueber RLS: Wer einloest, ist zu diesem Zeitpunkt
-- noch gar nicht angemeldet, hat also keine Rolle, gegen die eine Policy
-- pruefen koennte. Massgeblich ist stattdessen public.einladung_abschliessen()
-- weiter unten - eine Funktion, die Kennung, Adresse, Status und Frist in
-- derselben Anweisung prueft, die die Einladung verbraucht, und die
-- Profilzuordnung in derselben Transaktion erledigt.
-- src/lib/actions/einladungen.ts prueft davor noch einmal lesend, damit ein
-- falscher Code nicht erst ein Konto anlegt; das ist ein frueher Ausstieg,
-- keine Absicherung.
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. Status einer Einladung
-- ---------------------------------------------------------------------------
create type public.einladung_status as enum ('offen', 'eingeloest', 'zurueckgezogen');

-- ---------------------------------------------------------------------------
-- 2. public.kundeneinladungen
-- ---------------------------------------------------------------------------
create table public.kundeneinladungen (
  id                    uuid primary key default gen_random_uuid(),
  -- SHA-256-Hexdigest des Klartext-Codes, 64 Zeichen. Unique, damit derselbe
  -- Code nie zweimal existiert - und damit das Einloesen ihn eindeutig findet.
  code_digest           text not null unique,
  b2b_kunde_id          uuid not null references public.b2b_kunden(id) on delete cascade,
  -- Die Einladung ist an genau diese Adresse gebunden: der Code allein genuegt
  -- nicht. Immer klein geschrieben gespeichert (Constraint unten), weil
  -- Postgres sonst "Kunde@x" und "kunde@x" als verschieden ansieht.
  email                 text not null,
  full_name             text not null,
  status                public.einladung_status not null default 'offen',
  gueltig_bis           timestamptz not null,
  erstellt_von_profil_id uuid references public.profiles(id) on delete set null,
  eingeloest_am         timestamptz,
  eingeloest_profil_id  uuid references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint einladung_email_klein check (email = lower(email)),
  -- Die Form, nicht nur die Anwesenheit von @ und Punkt. Die LIKE-Fassung
  -- allein liess unter anderem "a@b.cd nochwas", "kunde@@x.de", zwei durch
  -- einen Zeilenumbruch getrennte Adressen in einem Feld und "_@_.__" durch
  -- - geprueft gegen 38 Adressen. Ein
  -- Zeilenumbruch im Adressfeld ist die Form, in der Header-Injektion
  -- beginnt, sobald jemand spaeter Post verschickt. Die Anwendung prueft
  -- strenger (src/lib/actions/einladungen.ts), aber eine Zugangstabelle
  -- soll auch dann tragen, wenn jemand direkt ueber die Schnittstelle
  -- schreibt.
  constraint einladung_email_form check (
    email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'
  ),
  constraint einladung_digest_form check (code_digest ~ '^[0-9a-f]{64}$'),
  -- Eine eingeloeste Einladung traegt immer ihren Zeitpunkt, eine offene nie.
  -- Ohne diese Bedingung kann eine Zeile "eingeloest" heissen, ohne dass
  -- irgendwo steht, wann - und die Nachweiskette hat ein Loch.
  constraint einladung_eingeloest_zeitpunkt check (
    (status = 'eingeloest' and eingeloest_am is not null)
    or (status <> 'eingeloest' and eingeloest_am is null)
  )
);

comment on table public.kundeneinladungen is
  'Einladungen fuer B2B-Kundenkonten (Anforderung E.20). Der Klartext-Code wird nie gespeichert, nur sein SHA-256-Digest; die Anwendung zeigt ihn einmalig beim Anlegen.';
comment on column public.kundeneinladungen.code_digest is
  'SHA-256-Hexdigest des Einladungscodes. Der Klartext existiert nur einmal, im Moment der Anzeige.';
comment on column public.kundeneinladungen.email is
  'Adresse, auf die die Einladung ausgestellt ist. Das Einloesen prueft sie mit - ein abgefangener Code allein reicht nicht.';
comment on column public.kundeneinladungen.gueltig_bis is
  'Ablauf. Es gibt keinen Status "abgelaufen": eine offene Einladung mit gueltig_bis < now() ist abgelaufen, berechnet statt fortgeschrieben.';

create index idx_kundeneinladungen_kunde on public.kundeneinladungen(b2b_kunde_id);
-- Fuer die Buero-Liste: offene zuerst, neueste oben.
create index idx_kundeneinladungen_status on public.kundeneinladungen(status, created_at desc);

create trigger trg_kundeneinladungen_updated before update on public.kundeneinladungen
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. RLS - die Tabelle gehoert dem Buero, sonst niemandem
-- ---------------------------------------------------------------------------
-- Bewusst enger als has_office_access(): die Buchhaltung verwaltet keine
-- Zugaenge. Ein Kunde sieht seine eigene Einladung nicht - er hat den Code, das
-- ist alles, was er braucht, und die Zeile nennt zusaetzlich den Digest und
-- wer sie ausgestellt hat.
alter table public.kundeneinladungen enable row level security;
-- force, nicht nur enable: sonst umgeht der Tabelleneigentuemer die Policies.
-- Bei einer Zugangstabelle ist das der Unterschied zwischen "geschuetzt" und
-- "geschuetzt, ausser man kommt als postgres" - etwa aus Studio oder aus einer
-- spaeter hinzugefuegten security-definer-Funktion, die dem Eigentuemer
-- gehoert. Dieselbe Entscheidung wie bei reklamationen (20260908120000).
alter table public.kundeneinladungen force row level security;

create policy kundeneinladungen_select_buero on public.kundeneinladungen
  for select to authenticated
  using (public.has_role('admin', 'betriebsleitung'));

create policy kundeneinladungen_insert_buero on public.kundeneinladungen
  for insert to authenticated
  with check (public.has_role('admin', 'betriebsleitung'));

-- Die einzige Aenderung, die eine angemeldete Rolle vornehmen darf, ist der
-- Rueckzug einer noch offenen Einladung. Das steht hier als Bedingung, nicht
-- nur als Kommentar: eine Policy, die jede Spalte jeder Zeile freigibt,
-- erlaubt es, eine eingeloeste Einladung wieder auf 'offen' zu setzen oder
-- code_digest und email nachtraeglich umzuschreiben. Damit waere die fehlende
-- DELETE-Policy wertlos - Ueberschreiben leistet dasselbe wie Loeschen.
create policy kundeneinladungen_update_buero on public.kundeneinladungen
  for update to authenticated
  using (public.has_role('admin', 'betriebsleitung') and status = 'offen')
  with check (public.has_role('admin', 'betriebsleitung') and status = 'zurueckgezogen');

-- Die Policy allein sichert nur den Statusuebergang. Dieser Trigger sichert
-- den Inhalt: die Kennung, die Adresse, der Kunde und die Frist einer
-- ausgestellten Einladung sind unveraenderlich. Ohne ihn liesse sich eine
-- Einladung im Moment des Rueckzugs auf eine andere Adresse umschreiben.
-- Greift nur bei angemeldeten Aufrufern (auth.uid() is not null) - das
-- Einloesen laeuft ueber den service_role-Weg und muss durch, genau wie bei
-- trg_profil_b2b_kunde (20260908120000).
create or replace function public.einladung_unveraenderlich()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null and (
       new.code_digest is distinct from old.code_digest
       or new.b2b_kunde_id is distinct from old.b2b_kunde_id
       or new.email is distinct from old.email
       or new.gueltig_bis is distinct from old.gueltig_bis
       or new.erstellt_von_profil_id is distinct from old.erstellt_von_profil_id
       or new.created_at is distinct from old.created_at
     ) then
    raise exception 'Eine ausgestellte Einladung wird nicht umgeschrieben, nur zurueckgezogen.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
comment on function public.einladung_unveraenderlich is
  'Haelt Kennung, Adresse, Kunde und Frist einer ausgestellten Einladung fest. Der service_role-Weg des Einloesens bleibt frei (auth.uid() ist dort null).';

drop trigger if exists trg_einladung_unveraenderlich on public.kundeneinladungen;
create trigger trg_einladung_unveraenderlich
  before update on public.kundeneinladungen
  for each row execute function public.einladung_unveraenderlich();

-- Kein DELETE. Eine ausgestellte Einladung bleibt nachvollziehbar; sie wird
-- zurueckgezogen, nicht entfernt.

-- ---------------------------------------------------------------------------
-- 3b. Einloesen als eine einzige Transaktion
-- ---------------------------------------------------------------------------
-- Das Einloesen besteht fachlich aus zwei untrennbaren Teilen: die Einladung
-- verbrauchen und das Profil zum Kundenkonto machen. Liefe das als zwei
-- Anweisungen aus der Anwendung, gaebe es einen Zustand dazwischen - eine
-- verbrauchte Einladung ohne zugeordnetes Profil, aus der niemand mehr
-- herauskommt: zurueckziehen geht nicht (verlangt 'offen'), noch einmal
-- einloesen auch nicht, und geloescht werden kann sie ohnehin nicht.
--
-- Deshalb hier, in einer Funktion. PostgREST fuehrt jeden RPC-Aufruf in einer
-- eigenen Transaktion aus; ein raise in der Mitte rollt alles zurueck.
--
-- security definer, weil der Aufrufer im Moment des Einloesens noch keine
-- Rolle hat, gegen die eine Policy pruefen koennte. Die Berechtigung ist der
-- Code selbst - und der wird hier geprueft, in derselben Anweisung, die ihn
-- verbraucht.
create or replace function public.einladung_abschliessen(
  p_code_digest  text,
  p_email        text,
  p_auth_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_einladung public.kundeneinladungen%rowtype;
  v_profil_id uuid;
begin
  -- Verbrauchen und pruefen in einem Zug: Kennung, Adresse, Status und Frist
  -- stehen als WHERE-Bedingung derselben Anweisung. Zwei gleichzeitige
  -- Einloesungen koennen sich damit nicht ueberholen - die zweite trifft
  -- keine Zeile mehr.
  update public.kundeneinladungen
     set status = 'eingeloest', eingeloest_am = now()
   where code_digest = p_code_digest
     and email = lower(p_email)
     and status = 'offen'
     and gueltig_bis > now()
  returning * into v_einladung;

  if not found then
    return null;
  end if;

  -- Der Profil-Trigger handle_new_auth_user() hat das Profil beim Anlegen des
  -- Auth-Kontos bereits erzeugt und ihm die Rolle aus raw_app_meta_data
  -- gegeben. Was ihm fehlt, ist der Kundenbezug.
  --
  -- brigade_id und pfluecker_id werden ausdruecklich geleert: derselbe Trigger
  -- uebernimmt ein bereits vorhandenes Profil, wenn es dieselbe Adresse traegt
  -- und noch kein Konto hat. Traegt dieses Profil eine Pflueckerzuordnung,
  -- erbt das Kundenkonto sie - und lohn_abrechnungen_select_own sowie
  -- pfluecker_select_own (20260909010000) fragen ausschliesslich
  -- profiles.pfluecker_id ab, ohne die Rolle zu pruefen. Ein Kunde saehe damit
  -- fremde Lohndaten.
  update public.profiles
     set role         = 'kunde',
         b2b_kunde_id = v_einladung.b2b_kunde_id,
         brigade_id   = null,
         pfluecker_id = null,
         full_name    = v_einladung.full_name,
         email        = lower(p_email)
   where auth_user_id = p_auth_user_id
  returning id into v_profil_id;

  if v_profil_id is null then
    -- Kein Profil zum Konto: der Trigger hat nicht gegriffen. Alles zurueck,
    -- die Einladung bleibt offen. Ein Kundenkonto ohne Kundenbezug saehe
    -- keine einzige Zeile - ein stiller Halbzustand waere schlimmer als gar
    -- kein Konto.
    raise exception 'Zum angelegten Konto existiert kein Profil.'
      using errcode = 'DA010';
  end if;

  update public.kundeneinladungen
     set eingeloest_profil_id = v_profil_id
   where id = v_einladung.id;

  return v_einladung.id;
end;
$$;

comment on function public.einladung_abschliessen is
  'Verbraucht eine Einladung und macht das zugehoerige Profil zum Kundenkonto - beides in einer Transaktion. Gibt die Einladungs-ID zurueck, oder null, wenn Kennung, Adresse, Status oder Frist nicht passen.';

-- Aufrufbar nur ueber den service_role-Weg der Anwendung. Ein angemeldeter
-- Nutzer hat hier nichts zu suchen: er koennte sonst ein beliebiges
-- auth_user_id uebergeben.
revoke all on function public.einladung_abschliessen(text, text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Ein Kundenprofil braucht seinen B2B-Kunden
-- ---------------------------------------------------------------------------
-- Der zweite Teil des Abnahmekriteriums ("ohne Einladung sieht niemand
-- Kundendaten") haengt daran, dass eine 'kunde'-Anmeldung ohne b2b_kunde_id
-- nichts sieht. Das ist heute wahr, aber nur implizit: current_b2b_kunde_id()
-- liefert dann null, und die Policies vergleichen gegen null, was nie zutrifft.
-- Festgeschrieben wird das hier NICHT - ein Kommentar erzwingt nichts. Was es
-- festhaelt, ist der Test: supabase/tests/einladungen.mjs prueft, dass ein
-- Kundenkonto ohne Zuordnung weder Reklamationen noch Lieferungen noch
-- Kontingente sieht. Wer die Policies umbaut, merkt es dort.
comment on function public.current_b2b_kunde_id is
  'B2B-Kunde der aktuell angemeldeten "kunde"-Rolle, fuer RLS-Policies, die eine Reklamation auf den eigenen Kunden beschraenken. Null fuer jede Rolle ohne Kundenbezug - ein Vergleich gegen null trifft nie zu, eine Anmeldung ohne Zuordnung sieht deshalb keine Kundendaten (Anforderung E.20).';
