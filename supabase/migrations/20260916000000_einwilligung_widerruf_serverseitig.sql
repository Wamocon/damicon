-- =============================================================================
-- Damicon - Einwilligungswiderruf mit serverseitigem Zeitstempel (Anforderung 4.8)
-- =============================================================================
-- Der bisherige Widerrufspfad (einwilligungWiderrufen() in lib/actions/
-- compliance.ts) hat widerrufen_am clientseitig mit new Date() berechnet und
-- als Wert an die Datenbank geschickt. Der Check-Constraint
-- einwilligung_widerruf_nach_erteilung verlangt widerrufen_am >= erteilt_am,
-- wobei erteilt_am serverseitig per now() beim Anlegen gesetzt wird. Laeuft
-- die Anwendung (Next.js) auf einem anderen Host als die Datenbank, wie beim
-- gehosteten Supabase-Projekt, kann ein geringer Uhrenversatz zwischen beiden
-- Systemen dazu fuehren, dass ein inhaltlich korrekter Widerruf genau an
-- diesem Constraint scheitert. Reproduziert im Integrationstest gegen das
-- gehostete Projekt (siehe supabase/tests/integration.mjs, "Compliance: der
-- Widerruf ist als Update zulaessig"). Das betrifft direkt die
-- Einwilligungsverwaltung aus Anforderung 4.8.
--
-- Diese Migration ersetzt den direkten Update-Aufruf durch eine
-- security-invoker-Funktion, die widerrufen_am ausschliesslich mit dem
-- serverseitigen now() der Datenbank setzt, damit erteilt_am und
-- widerrufen_am garantiert aus derselben Uhr stammen. security invoker
-- sorgt dafuer, dass die RLS-Update-Policy der Basistabelle weiterhin greift
-- (nur admin/betriebsleitung/buchhaltung), die Funktion selbst erweitert
-- keine Rechte. Der bestehende Trigger trg_einwilligung_nur_widerruf greift
-- unveraendert als zweite Verteidigungslinie.
-- =============================================================================

set search_path = public;

create or replace function public.einwilligung_widerrufen(p_id uuid, p_grund text)
returns void
language plpgsql
security invoker
as $$
begin
  if p_grund is null or btrim(p_grund) = '' then
    raise exception 'Ein Widerrufsgrund ist erforderlich.' using errcode = '23514';
  end if;

  update public.einwilligungen
  set widerrufen_am = now(),
      widerruf_grund = p_grund
  where id = p_id;

  if not found then
    raise exception 'Einwilligung % nicht gefunden oder kein Zugriff.', p_id using errcode = 'P0002';
  end if;
end;
$$;

comment on function public.einwilligung_widerrufen is
  'Anforderung 4.8: Widerruf mit garantiert serverseitigem Zeitstempel (now()), damit ein Uhrenversatz zwischen Anwendungs- und Datenbankserver den Widerruf nicht am Check-Constraint einwilligung_widerruf_nach_erteilung scheitern laesst. security invoker: die RLS-Update-Policy der Basistabelle bleibt massgeblich, die Funktion vergibt keine zusaetzlichen Rechte.';

grant execute on function public.einwilligung_widerrufen(uuid, text) to authenticated;
