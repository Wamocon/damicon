-- =============================================================================
-- Damicon - Achte Rolle: ceo (2/2, Rechte auf Datenbankebene)
-- =============================================================================
-- Rechteumfang (kuratiert, nicht 1:1 admin): ceo bekommt in der Anwendung
-- (src/lib/rbac.ts) alle Rechte von admin ausser ki_assistent:manage (KI-
-- Provider-Schluesselverwaltung, ein IT-Betriebsthema, kein Fuehrungsthema,
-- und ein zusaetzliches Risiko an einem haeufig per Phishing angegriffenen
-- Konto). Der Rollen-Vorschau-Debug-Schalter (persona.tsx, ki-assistent/
-- route.ts) bleibt bewusst admin-only und wird hier nicht angefasst.
--
-- Auf Datenbankebene laeuft praktisch jede RLS-Policy ueber die zentrale
-- Funktion has_role(variadic erlaubt app_role[]) (158 Aufrufstellen in 35
-- Migrationsdateien, Stand dieser Migration). Statt jede einzelne Policy
-- anzufassen, wird ceo hier zentral als admin-gleichwertig aliasiert: ueberall
-- dort, wo eine Policy 'admin' erlaubt, gilt das ab jetzt auch fuer ceo. Das
-- deckt sich mit der kuratierten Rechteentscheidung, weil die beiden bewusst
-- ausgenommenen Faehigkeiten (Provider-Schluessel, Rollenvorschau) ausschliesslich
-- in der Anwendung liegen, nicht in RLS-Policies.
-- =============================================================================

set search_path = public;

-- Ersetzt NICHT die 158 einzelnen has_role('admin', ...)-Aufrufe, sondern
-- erweitert die eine Funktion, durch die sie alle laufen. Risikoaermer als 35
-- Migrationsdateien anzufassen, und automatisch vollstaendig: jede bestehende
-- und jede kuenftige admin-Policy gilt fuer ceo mit, ohne separate Pflege.
create or replace function public.has_role(variadic erlaubt public.app_role[])
returns boolean
language sql
stable
as $$
  select public.current_app_role() = any(erlaubt)
    or (public.current_app_role() = 'ceo' and 'admin' = any(erlaubt));
$$;
comment on function public.has_role is
  'Prueft die App-Rolle des angemeldeten Nutzers gegen eine Liste erlaubter Rollen. '
  'ceo gilt zusaetzlich ueberall dort als erlaubt, wo admin erlaubt ist (kuratierte '
  'Rechteentscheidung, Anforderung 7.1-Abweichung, siehe 20261103020000_ceo_rolle.sql).';

-- has_office_access() ist keine Verwendung von has_role() (eigener in-Vergleich),
-- deshalb separat erweitert.
create or replace function public.has_office_access()
returns boolean
language sql
stable
as $$
  select public.current_app_role() in ('admin', 'ceo', 'betriebsleitung', 'buchhaltung');
$$;
