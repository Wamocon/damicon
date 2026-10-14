-- =============================================================================
-- Damicon - Auslieferung der Integrations-Warteschlange (WMCNL-1627, WMCNL-2290; Stufe 2 von ЭСФ und ЕСУТД, soweit ohne
-- Zugang der Behoerde moeglich)
-- =============================================================================
-- Die Tabellen integrationen (Registry) und integration_outbox (Warteschlange) stehen seit der ersten Migration, aber nichts
-- befuellt die Warteschlange und nichts liefert sie aus. Diese Migration legt den Rahmen an, der unabhaengig vom Partner gilt:
--
--   * Die Registry bekommt eine Konfiguration: Adapter (manuell oder webhook), Ziel-Adresse (nur https) und der NAME der Umgebungs-
--     variable, die das gemeinsame Geheimnis haelt. Das Geheimnis selbst steht nie in der Datenbank.
--   * Eine Integration liefert nur aus, wenn sie ausdruecklich aktiv ist. Standard ist aus: ohne Entscheidung des Betreibers verlaesst
--     kein Datensatz das System.
--   * Die Warteschlange bekommt Ereignis, Idempotenzschluessel (dasselbe Ereignis wird nie zweimal eingereiht), naechsten Versuch
--     und die Antwort des Ziels. Status: pending (wartet, auch auf Wiederholung), sent (vom Ziel angenommen), acked (vom Partner
--     bestaetigt, spaeter), failed (endgueltig gescheitert).
--   * integration_einreihen() stellt ein Ereignis ein, aber nur, wenn die Integration aktiv ist. Der ЭСФ-Beleg reiht beim Ausstellen und
--     beim Bestaetigen ein (Trigger), weil das der Moment ist, den ein Buchhaltungssystem braucht. ЕСУТД reiht bewusst nicht
--     selbst ein: die Meldungen tragen Namen und Ausweisnummern, und der Weg dorthin braucht eine Entscheidung zur Rechtsgrundlage.
--   * Schreiben darf die Konfiguration und das Wiederholen nur die Administration (die Geschaeftsfuehrung ueber admin). Die
--     Auslieferung selbst laeuft mit dem Dienstschluessel des Servers (Cron oder Knopf), nicht mit den Rechten einer Person.
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. Konfiguration der Registry
-- ---------------------------------------------------------------------------
alter table public.integrationen
  add column if not exists adapter text not null default 'manuell' check (adapter in ('manuell', 'webhook')),
  add column if not exists ziel_url text check (ziel_url is null or (char_length(ziel_url) <= 500 and ziel_url ~ '^https://[^/@[:space:]]+([/?#]|$)')),
  add column if not exists geheimnis_name text check (geheimnis_name is null or geheimnis_name ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  add column if not exists aktiv boolean not null default false;

-- Aktiv heisst: ein Webhook mit Adresse und Geheimnis. Alles andere ist ein Zustand ohne Auslieferung.
alter table public.integrationen
  drop constraint if exists integrationen_aktiv_vollstaendig;
alter table public.integrationen
  add constraint integrationen_aktiv_vollstaendig
  check (not aktiv or (adapter = 'webhook' and ziel_url is not null and geheimnis_name is not null));

comment on column public.integrationen.adapter is
  'WMCNL-1627: manuell (Stufe 1, Eingabe im Zielsystem von Hand) oder webhook (signierter POST an ziel_url).';
comment on column public.integrationen.geheimnis_name is
  'Name der Umgebungsvariable mit dem gemeinsamen Geheimnis fuer die Signatur. Der Wert steht nie in der Datenbank.';
comment on column public.integrationen.aktiv is
  'Nur eine aktive Integration nimmt Ereignisse an und liefert aus. Standard: aus.';

-- Die Konfiguration pflegt die Administration; die Registry ist sonst unveraendert lesbar fuer das Buero.
drop policy if exists integrationen_update_admin on public.integrationen;
create policy integrationen_update_admin on public.integrationen
  for update to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
-- Nur diese Spalten, nicht name, system oder key: ein Tabellenrecht aus den Standardrechten der Plattform wird zuerst zurueckgenommen.
revoke update on public.integrationen from authenticated;
grant update (adapter, ziel_url, geheimnis_name, aktiv, status) on public.integrationen to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Warteschlange
-- ---------------------------------------------------------------------------
alter table public.integration_outbox
  add column if not exists integration_id uuid references public.integrationen(id) on delete set null,
  add column if not exists ereignis text check (ereignis is null or char_length(ereignis) between 1 and 100),
  add column if not exists idempotenz_schluessel text check (idempotenz_schluessel is null or char_length(idempotenz_schluessel) between 1 and 200),
  add column if not exists naechster_versuch_am timestamptz not null default now(),
  add column if not exists antwort_status integer check (antwort_status is null or antwort_status between 100 and 599);

-- Dasselbe Ereignis einer Integration steht nur einmal in der Warteschlange.
create unique index if not exists uq_outbox_idempotenz
  on public.integration_outbox (integration_id, idempotenz_schluessel)
  where integration_id is not null and idempotenz_schluessel is not null;
create index if not exists idx_outbox_faellig
  on public.integration_outbox (naechster_versuch_am)
  where status = 'pending' and integration_id is not null;

comment on column public.integration_outbox.idempotenz_schluessel is
  'Schluessel des Ereignisses (zum Beispiel esf:<beleg>:ausgestellt). Das Ziel bekommt ihn als Idempotency-Key und kann Wiederholungen erkennen.';
comment on column public.integration_outbox.naechster_versuch_am is
  'Fruehester Zeitpunkt des naechsten Auslieferungsversuchs. Ein laufender Versuch schiebt ihn kurz nach hinten, damit zwei Laeufe nicht dasselbe senden.';

-- Wiederholen darf die Administration: ein gescheiterter Eintrag geht zurueck auf "wartet", die Versuche beginnen von vorn.
drop policy if exists integration_outbox_update_admin on public.integration_outbox;
create policy integration_outbox_update_admin on public.integration_outbox
  for update to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
-- Nur der Zustand des Eintrags, nie die Nutzdaten (payload, ereignis, Schluessel). Anlegen und Loeschen hat niemand ausser dem Server.
revoke insert, update, delete on public.integration_outbox from authenticated;
grant update (status, versuche, letzter_fehler, naechster_versuch_am, antwort_status, verarbeitet_am) on public.integration_outbox to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Einreihen
-- ---------------------------------------------------------------------------
-- Stellt ein Ereignis in die Warteschlange, wenn die Integration aktiv ist. Gibt die Id zurueck, bei einem schon eingereihten
-- Ereignis (derselbe Idempotenzschluessel) oder einer inaktiven Integration null. security definer: die Trigger der Fachtabellen
-- duerfen einreihen, ohne dass die handelnde Person Schreibrechte auf die Warteschlange hat.
create or replace function public.integration_einreihen(
  p_key        text,
  p_ereignis   text,
  p_payload    jsonb,
  p_idempotenz text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_integration public.integrationen%rowtype;
  v_id          uuid;
begin
  select * into v_integration from public.integrationen where key = p_key and aktiv;
  if not found then
    return null;
  end if;

  insert into public.integration_outbox (integration_id, ziel_system, richtung, payload, ereignis, idempotenz_schluessel)
  values (v_integration.id, v_integration.system, 'outbox', coalesce(p_payload, '{}'::jsonb), p_ereignis, p_idempotenz)
  on conflict (integration_id, idempotenz_schluessel) where integration_id is not null and idempotenz_schluessel is not null
  do nothing
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.integration_einreihen(text, text, jsonb, text) from public, anon, authenticated;

comment on function public.integration_einreihen(text, text, jsonb, text) is
  'WMCNL-1627: reiht ein Ereignis ein, wenn die Integration aktiv ist (sonst null). Derselbe Idempotenzschluessel reiht nur einmal ein.';

-- ---------------------------------------------------------------------------
-- 4. ЭСФ-Beleg: Ausstellen und Bestaetigen
-- ---------------------------------------------------------------------------
create or replace function public.esf_beleg_einreihen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('ausgestellt', 'bestaetigt') and new.status is distinct from old.status then
    perform public.integration_einreihen(
      'esf',
      'esf.beleg_' || new.status,
      jsonb_build_object(
        'belegId', new.id,
        'lieferungId', new.lieferung_id,
        'status', new.status,
        'esfNummer', new.esf_nummer,
        'ausgestelltAm', new.ausgestellt_am,
        'bestaetigtAm', new.bestaetigt_am,
        'entwurf', new.entwurf
      ),
      'esf:' || new.id || ':' || new.status
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_esf_beleg_einreihen on public.esf_belege;
create trigger trg_esf_beleg_einreihen
  after update of status on public.esf_belege
  for each row execute function public.esf_beleg_einreihen();
