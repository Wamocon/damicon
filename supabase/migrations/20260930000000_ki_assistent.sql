-- =============================================================================
-- Damicon - KI-Assistent: Anbieterverwaltung und Chatverlauf
-- (Masterplan-Anforderung 5.4/5.5)
-- =============================================================================
-- Status A im Masterplan: aus 1CATI direkt uebernehmbar ueber
-- `api/ai/chat/route.ts`, mit RBAC-Gate vor dem Modellaufruf, deterministischem
-- Fallback, Protokollierung und ohne 5xx bei Ausfall. Bisher nur ein
-- Platzhalter-Chatfenster ohne Modellanbindung (KiAssistentMock).
--
-- Auftrag fuer diese Umsetzung (ueber den reinen Masterplan-Text hinaus):
-- mehrere Anbieter sollen sich per API-Key anbinden lassen, austauschbar durch
-- einen Admin ueber die Oberflaeche - anfangs "Sokrates", spaeter z. B. Claude
-- (Anthropic) oder ein selbst gehostetes Open-Source-Modell. Die Tabelle
-- ki_anbieter bildet deshalb bewusst mehrere Zeilen ab (nicht nur Konfigwerte
-- in Umgebungsvariablen) - der "typ" waehlt die Anfrageform:
--   * 'openai_kompatibel': das De-facto-Standardformat (OpenAI selbst, die
--     meisten Cloud-Gateways, praktisch jedes selbst gehostete Open-Source-
--     Modell ueber vLLM/Ollama/LM Studio). Sokrates ist unter dieser Annahme
--     eingeordnet, mangels eigener API-Dokumentation an dieser Stelle - siehe
--     src/lib/ai/anfrage.ts fuer die Stelle, an der bei Abweichung ein
--     eigener Adapter ergaenzt wird, ohne dass sich am Schema hier etwas
--     aendern muss.
--   * 'anthropic': Claude ueber die Messages-API (eigenes Header-/Body-Format).
--
-- Verschluesselung des API-Keys bewusst NICHT per pgcrypto/pgp_sym_encrypt in
-- der Datenbank: der PGlite-Schnelltest (db:test:fast) laedt keine
-- Postgres-Erweiterungen, und ein zweiter, staerker abweichender Testpfad
-- widerspraeche dem Zweck dieses Tests. Stattdessen verschluesselt/
-- entschluesselt src/lib/ai/schluessel.ts (Node-crypto, AES-256-GCM) mit einem
-- serverseitigen Schluessel aus der Umgebung (KI_ANBIETER_SCHLUESSEL) - die
-- Datenbank sieht nur ein fuer sie bedeutungsloses Chiffrat.
--
-- ki_chat_nachrichten haelt den eigentlichen Gespraechsverlauf (fuer die
-- Chat-Oberflaeche) UND dient zugleich als Protokoll (Masterplan: "jede
-- Antwort protokolliert") - append-only wie die uebrigen Nachweisketten-
-- Tabellen (siehe 20260917000000_erntebuchungen_unveraenderlich.sql): kein
-- Update, kein Delete, weder fuer die Anwendung noch als eigene Policy.
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. ki_anbieter
-- ---------------------------------------------------------------------------
create type public.ki_anbieter_typ as enum ('openai_kompatibel', 'anthropic');

create table public.ki_anbieter (
  id                    uuid primary key default gen_random_uuid(),
  -- interner Schluessel, z. B. "sokrates-prod" - nur fuer Logs/Fehlermeldungen,
  -- nicht das, was im Chat angezeigt wird (das ist anzeige_name).
  name                  text not null unique,
  anzeige_name          text not null,
  typ                   public.ki_anbieter_typ not null,
  basis_url             text not null,
  modell                text not null,
  -- Chiffrat aus src/lib/ai/schluessel.ts (Base64: IV + Ciphertext + AuthTag),
  -- fuer Postgres eine bedeutungslose Zeichenkette.
  api_key_chiffrat      text not null,
  aktiv                 boolean not null default true,
  ist_standard          boolean not null default false,
  erstellt_von          uuid references public.profiles(id) on delete set null,
  erstellt_am           timestamptz not null default now(),
  aktualisiert_am       timestamptz not null default now(),
  constraint ki_anbieter_basis_url_nicht_leer check (basis_url <> ''),
  constraint ki_anbieter_modell_nicht_leer check (modell <> '')
);
comment on table public.ki_anbieter is
  'KI-Chat-Anbieter (Anforderung 5.4/5.5), von einem Admin ueber die Oberflaeche angelegt. API-Key liegt verschluesselt vor (src/lib/ai/schluessel.ts), nicht im Klartext.';

-- Nur ein Standard-Anbieter gleichzeitig - der Chat ruft immer genau diesen auf.
create unique index ki_anbieter_ein_standard
  on public.ki_anbieter (ist_standard)
  where ist_standard;

alter table public.ki_anbieter enable row level security;

-- Ausschliesslich admin: weder betriebsleitung noch kunde duerfen die Liste
-- der Anbieter (und schon gar nicht das Chiffrat) lesen - der Chat selbst
-- liest ueber den service_role-Client in der Server Action, nach eigener
-- requirePermission("ki_assistent","create")-Pruefung (Defense-in-Depth,
-- gleiches Muster wie an anderer Stelle im Projekt: RLS ist die zweite
-- Verteidigungslinie, nicht die einzige).
create policy ki_anbieter_admin_alles on public.ki_anbieter
  for all to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

-- Atomares Umsetzen des Standard-Anbieters (sonst zwei getrennte UPDATEs vom
-- Client aus, mit dem Risiko eines Zwischenzustands ohne oder mit zwei
-- Standard-Anbietern). security invoker: laeuft mit den RLS-Rechten des
-- aufrufenden Admins, has_role() zusaetzlich als eigene Bedingung - dieselbe
-- Doppelung wie in anderen SECURITY-Funktionen dieses Projekts.
create or replace function public.ki_anbieter_standard_setzen(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.has_role('admin') then
    raise exception 'keine-berechtigung' using errcode = '42501';
  end if;

  update public.ki_anbieter set ist_standard = false where ist_standard and id <> p_id;
  update public.ki_anbieter
     set ist_standard = true, aktualisiert_am = now()
   where id = p_id;

  if not found then
    raise exception 'anbieter-nicht-gefunden' using errcode = 'P0002';
  end if;
end;
$$;
comment on function public.ki_anbieter_standard_setzen is
  'Setzt genau einen ki_anbieter als Standard, atomar - loest den vorherigen Standard in derselben Transaktion ab.';

-- ---------------------------------------------------------------------------
-- 2. ki_chat_nachrichten
-- ---------------------------------------------------------------------------
create table public.ki_chat_nachrichten (
  id              uuid primary key default gen_random_uuid(),
  profil_id       uuid not null references public.profiles(id) on delete cascade,
  rolle           text not null check (rolle in ('nutzer', 'assistent', 'system')),
  inhalt          text not null check (inhalt <> ''),
  -- name des ki_anbieter zum Zeitpunkt der Antwort (nicht die id, damit der
  -- Verlauf lesbar bleibt, auch wenn der Anbieter spaeter geloescht wird).
  -- Nur bei rolle = 'assistent' gesetzt.
  anbieter_name   text,
  -- true, wenn eine echte Modellantwort nicht zustande kam (kein Standard-
  -- Anbieter konfiguriert, Zeitueberschreitung, Fehlerantwort) und
  -- stattdessen die deterministische Ausweichantwort gezeigt wurde
  -- (Masterplan: "kein 5xx bei Ausfall").
  fallback        boolean not null default false,
  -- Anforderung 5.5 "Eskalation an Menschen": vom Nutzer angefordert oder vom
  -- System bei wiederholtem Fallback gesetzt, sichtbar fuers Buero.
  eskaliert       boolean not null default false,
  erstellt_am     timestamptz not null default now()
);
comment on table public.ki_chat_nachrichten is
  'Chatverlauf des KI-Assistenten (Anforderung 5.4/5.5) - zugleich Protokoll jeder Antwort. Append-only: keine Update-/Delete-Policy.';

create index ki_chat_nachrichten_profil_idx
  on public.ki_chat_nachrichten (profil_id, erstellt_am);

alter table public.ki_chat_nachrichten enable row level security;

-- Eigene Nachrichten lesen und schreiben.
create policy ki_chat_nachrichten_select_own on public.ki_chat_nachrichten
  for select to authenticated
  using (
    profil_id = (select p.id from public.profiles p where p.auth_user_id = auth.uid())
  );

create policy ki_chat_nachrichten_insert_own on public.ki_chat_nachrichten
  for insert to authenticated
  with check (
    profil_id = (select p.id from public.profiles p where p.auth_user_id = auth.uid())
  );

-- Buero sieht alle Gespraeche mit (Anforderung 5.5: Eskalation an Menschen
-- braucht Sichtbarkeit, nicht erst nach ausdruecklicher Anfrage). Kein
-- Schreibrecht fuers Buero - eine Antwort "im Namen" des Assistenten waere
-- eine andere Funktion (echte Uebernahme durch einen Mitarbeiter), hier nicht
-- gebaut.
create policy ki_chat_nachrichten_select_buero on public.ki_chat_nachrichten
  for select to authenticated
  using (public.has_office_access());
