-- =============================================================================
-- Damicon - Nachrichten je Vorbestellung (WMCNL-1472)
-- =============================================================================
-- Die Absprache mit einem Kunden ("kannst du den Termin um einen Tag vorziehen?")
-- lief bisher ausserhalb des Systems, per Telefon oder Messenger, und war damit
-- nicht auffindbar, wenn es um eine spaetere Reklamation ging. Eine
-- Vorbestellung ist die Lieferbeziehung, an der die Absprache haengt: ihr
-- Verlauf steht jetzt an ihr.
--
-- Entscheidungen:
--   * Ein Verlauf je Vorbestellung, nicht je Kunde: eine Absprache gehoert zu
--     einer Menge und einem Termin, und der Kunde sieht nur seine eigene.
--   * Unveraenderlich (append-only), wie das Protokoll und die
--     Reklamationsereignisse: eine versandte Nachricht laesst sich weder
--     aendern noch loeschen, auch nicht durch den Absender. Das schuetzt beide
--     Seiten, denn was zugesagt wurde, steht dann auch so da. Dieselbe
--     Sperrfunktion wie dort (block_ledger_mutation).
--   * Der Autor wird nicht mitgeschickt, sondern von der Datenbank aus der
--     Anmeldung gesetzt (Name und Rolle zum Zeitpunkt der Nachricht): niemand
--     schreibt im Namen eines anderen. Der Name wird festgehalten statt nur
--     verlinkt, damit der Verlauf lesbar bleibt, auch wenn ein Konto
--     entfaellt.
--   * Sichtbarkeit und Schreibrecht folgen der Vorbestellung: wer sie sehen
--     darf (das Buero, und der Kunde fuer seine eigene), sieht ihren Verlauf.
--     Die Policies fragen die Vorbestellung mit den Rechten der aufrufenden
--     Person ab, die Zeilensicherheit von vorbestellungen gilt also durch sie
--     hindurch.
--   * Schreiben duerfen der Kunde (nur zu seinen eigenen Vorbestellungen),
--     admin, betriebsleitung und buchhaltung.
--   * Zu einer stornierten Vorbestellung gibt es keine neuen Nachrichten
--     (DA012): der Verlauf ist mit dem Storno abgeschlossen, was daran noch zu
--     klaeren ist, gehoert in eine neue Bestellung.
--   * Die Obergrenze von 2000 Zeichen haelt den Verlauf lesbar.
-- =============================================================================

set search_path = public;

create table if not exists public.vorbestellung_nachrichten (
  id               uuid primary key default gen_random_uuid(),
  -- restrict: eine Vorbestellung mit Verlauf laesst sich nicht loeschen, der Verlauf waere sonst weg.
  vorbestellung_id uuid not null references public.vorbestellungen(id) on delete restrict,
  -- Ohne Fremdschluessel: die Zeile ist unveraenderlich, ein "on delete set null" waere eine Aenderung.
  autor_profil_id  uuid,
  -- Spalten ohne NOT NULL, aber mit Pruefung darunter: die Datenbank setzt sie im Trigger, der
  -- Aufrufer muss sie nicht mitschicken (das erzeugte Typenmodell macht sie dann optional).
  autor_name       text,
  autor_rolle      public.app_role,
  text             text not null check (char_length(btrim(text)) between 1 and 2000),
  created_at       timestamptz not null default now(),
  constraint vorbestellung_nachrichten_autor_check check (autor_name is not null and autor_rolle is not null)
);

comment on table public.vorbestellung_nachrichten is
  'Nachrichten je Vorbestellung (WMCNL-1472): Absprachen zwischen Kunde und Betrieb. Append-only, Autor und Zeitpunkt setzt die Datenbank.';

create index if not exists idx_vorbestellung_nachrichten_verlauf
  on public.vorbestellung_nachrichten (vorbestellung_id, created_at);

-- ---------------------------------------------------------------------------
-- Autor und Zeitpunkt setzen, Storno pruefen
-- ---------------------------------------------------------------------------
-- security invoker: die Vorbestellung wird mit den Rechten der aufrufenden
-- Person gelesen. Eine fremde Vorbestellung ist fuer sie nicht sichtbar und
-- verhaelt sich wie eine, die es nicht gibt: kein Hinweis darauf, ob die Id
-- existiert.
create or replace function public.vorbestellung_nachricht_vorbereiten()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_status public.vorbestellung_status;
  v_profil record;
begin
  select status into v_status from public.vorbestellungen where id = new.vorbestellung_id;
  if v_status is null then
    raise exception 'Vorbestellung nicht gefunden.' using errcode = '23503';
  end if;
  if v_status = 'storniert' then
    raise exception 'Zu einer stornierten Vorbestellung gibt es keine neuen Nachrichten.' using errcode = 'DA012';
  end if;

  if auth.uid() is not null then
    select id, full_name, role into v_profil from public.profiles where auth_user_id = auth.uid();
    if not found then
      raise exception 'Kein Profil zur Anmeldung.' using errcode = '42501';
    end if;
    new.autor_profil_id := v_profil.id;
    new.autor_name := v_profil.full_name;
    new.autor_rolle := v_profil.role;
  elsif new.autor_name is null or new.autor_rolle is null then
    -- Ohne Anmeldung (service_role, Skripte) muss der Absender angegeben sein.
    raise exception 'Der Autor fehlt.' using errcode = '23502';
  end if;

  new.text := btrim(new.text);
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists trg_vorbestellung_nachricht_vorbereiten on public.vorbestellung_nachrichten;
create trigger trg_vorbestellung_nachricht_vorbereiten
  before insert on public.vorbestellung_nachrichten
  for each row execute function public.vorbestellung_nachricht_vorbereiten();

-- Unveraenderlich: dieselbe Sperre wie bei audit_events und den Reklamationsereignissen.
drop trigger if exists trg_vorbestellung_nachricht_unveraenderlich on public.vorbestellung_nachrichten;
create trigger trg_vorbestellung_nachricht_unveraenderlich
  before update or delete on public.vorbestellung_nachrichten
  for each row execute function public.block_ledger_mutation();

-- ---------------------------------------------------------------------------
-- Zeilensicherheit
-- ---------------------------------------------------------------------------
alter table public.vorbestellung_nachrichten enable row level security;
alter table public.vorbestellung_nachrichten force row level security;

create policy vorbestellung_nachrichten_select on public.vorbestellung_nachrichten
  for select to authenticated
  using (exists (select 1 from public.vorbestellungen v where v.id = vorbestellung_id));

create policy vorbestellung_nachrichten_insert on public.vorbestellung_nachrichten
  for insert to authenticated
  with check (
    exists (select 1 from public.vorbestellungen v where v.id = vorbestellung_id)
    and (public.current_app_role() = 'kunde' or public.has_role('admin', 'betriebsleitung', 'buchhaltung'))
    and autor_profil_id = (select p.id from public.profiles p where p.auth_user_id = auth.uid())
  );

-- Kein Update, kein Delete: weder als Policy noch als Recht. Standardrechte erst
-- entziehen (auch authenticated), damit nur Lesen und Anlegen bleiben.
revoke all on public.vorbestellung_nachrichten from public;
revoke all on public.vorbestellung_nachrichten from anon;
revoke all on public.vorbestellung_nachrichten from authenticated;
grant select, insert on public.vorbestellung_nachrichten to authenticated;
