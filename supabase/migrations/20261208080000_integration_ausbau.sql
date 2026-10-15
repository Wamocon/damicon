-- =============================================================================
-- Damicon - Auslieferung, Ausbau: Zugang per Benutzer und Kennwort, Vorlage für das Zielformat, Bestätigung durch den Partner (15.10.2026)
-- =============================================================================
-- Entscheidung zu den offenen Punkten 1C-Konnektor (WMCNL-1627, 2290):
--
--   * Das Zielformat des Partners (zum Beispiel 1C per OData) ist ein Mapping, das die Administration in der Oberfläche pflegt, nicht Code: Jede
--     Integration kann eine Vorlage (JSON mit Platzhaltern wie {{daten.entwurf.kunde.name}}) tragen. Ohne Vorlage geht der Umschlag hinaus, wie bisher.
--   * Zugang: neben der Signatur (HMAC) kennt die Integration den Zugang per Benutzer und Kennwort (HTTP Basic), wie ihn OData und HTTP-Dienste von 1C
--     erwarten. Wie das Geheimnis steht der Wert nie in der Datenbank, nur der NAME der Umgebungsvariable (fester Präfix DAMICON_HOOK_).
--   * Bestätigung: Eine Integration kann eine Rückmeldung des Partners erwarten. Der Status acked (bestätigt) wird über integration_bestaetigen() gesetzt,
--     die nur der Server mit dem Dienstschlüssel aufruft, nachdem er die Signatur des Partners geprüft hat.
--
-- Keine Datenänderung. Alle Integrationen bleiben aus.
-- =============================================================================

set search_path = public;

alter table public.integrationen
  add column if not exists auth_art text not null default 'hmac' check (auth_art in ('hmac', 'basic')),
  add column if not exists zugang_name text check (zugang_name is null or zugang_name ~ '^DAMICON_HOOK_[A-Z0-9_]{1,48}$'),
  add column if not exists vorlage jsonb check (vorlage is null or (jsonb_typeof(vorlage) = 'object' and pg_column_size(vorlage) <= 20000)),
  add column if not exists bestaetigung_erwartet boolean not null default false;

comment on column public.integrationen.auth_art is 'hmac: nur die Signatur. basic: zusätzlich HTTP Basic mit Benutzer und Kennwort aus der Umgebungsvariable zugang_name.';
comment on column public.integrationen.zugang_name is 'Name der Umgebungsvariable mit "Benutzer:Kennwort" für HTTP Basic. Der Wert steht nie in der Datenbank.';
comment on column public.integrationen.vorlage is 'Vorlage für den Körper des Webhooks (JSON mit Platzhaltern). Leer: der Umschlag geht unverändert hinaus.';
comment on column public.integrationen.bestaetigung_erwartet is 'Der Partner meldet den Eingang zurück (Status acked). Ohne Rückmeldung bleibt der Eintrag bei sent.';

alter table public.integrationen drop constraint if exists integrationen_aktiv_vollstaendig;
alter table public.integrationen
  add constraint integrationen_aktiv_vollstaendig
  check (not aktiv or (adapter = 'webhook' and ziel_url is not null and geheimnis_name is not null and (auth_art <> 'basic' or zugang_name is not null)));

-- Die Konfiguration pflegt weiter nur die Administration; die neuen Spalten kommen zu den schreibbaren dazu.
revoke update on public.integrationen from authenticated;
grant update (adapter, ziel_url, geheimnis_name, zugang_name, auth_art, vorlage, bestaetigung_erwartet, aktiv, status) on public.integrationen to authenticated;

-- ---------------------------------------------------------------------------
-- Bestätigung durch den Partner
-- ---------------------------------------------------------------------------
-- Ergebnis: bestaetigt (der Eintrag steht jetzt bei acked), abgelehnt (der Partner hat abgelehnt, der Eintrag steht bei failed), schon (war bestätigt),
-- noch_nicht (der Eintrag ist noch nicht gesendet, eine Bestätigung ohne Sendung gilt nicht), unbekannt (kein solcher Eintrag).
create or replace function public.integration_bestaetigen(p_key text, p_idempotenz text, p_ok boolean, p_hinweis text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id     uuid;
  v_status text;
begin
  select o.id, o.status into v_id, v_status
    from public.integration_outbox o
    join public.integrationen i on i.id = o.integration_id
   where i.key = p_key and o.idempotenz_schluessel = p_idempotenz
   for update of o;
  if not found then
    return 'unbekannt';
  end if;
  if v_status = 'pending' then
    return 'noch_nicht';
  end if;
  if p_ok then
    if v_status = 'acked' then
      return 'schon';
    end if;
    update public.integration_outbox set status = 'acked', letzter_fehler = null, verarbeitet_am = now() where id = v_id;
    return 'bestaetigt';
  end if;
  update public.integration_outbox
     set status = 'failed', letzter_fehler = left('Vom Partner abgelehnt' || coalesce(': ' || nullif(btrim(p_hinweis), ''), ''), 500), verarbeitet_am = now()
   where id = v_id;
  return 'abgelehnt';
end;
$$;

revoke all on function public.integration_bestaetigen(text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.integration_bestaetigen(text, text, boolean, text) to service_role;

comment on function public.integration_bestaetigen(text, text, boolean, text) is
  'Setzt den Eintrag der Warteschlange auf bestätigt (acked) oder abgelehnt (failed), wenn der Partner es zurückmeldet. Nur der Dienstschlüssel des Servers ruft sie auf, nach der Prüfung der Signatur.';
