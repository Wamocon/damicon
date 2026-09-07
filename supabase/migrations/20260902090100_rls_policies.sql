-- =============================================================================
-- Damicon - Row Level Security
-- =============================================================================
-- Analyse Kapitel 10: "RLS ist kein Copy-Paste." Policies sind an Rollen und
-- Ressourcen gebunden und werden je Ressource geschrieben, nicht nur umbenannt.
--
-- Prototyp-Stand (ohne echte Auth):
--   * RLS ist auf ALLEN Tabellen aktiv.
--   * Schreibzugriff hat ausschliesslich der service_role-Key (Server) -
--     es gibt bewusst keine INSERT/UPDATE/DELETE-Policy fuer anon/authenticated.
--   * Lesezugriff:
--       - Betriebsdaten (Feld/Markt/Katalog): anon + authenticated
--       - Sensible Daten (Finanzen, Lohn, Audit, Consent, Outbox, Identitaeten,
--         Profile): nur authenticated mit Buero-Rolle (admin/betriebsleitung/
--         buchhaltung), Profile zusaetzlich der eigene Datensatz.
--
-- Mit Meilenstein B (echte Auth) werden je Ressource feinere, rollenabhaengige
-- Schreib-Policies ergaenzt.
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- RLS auf allen Anwendungstabellen aktivieren
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  tables text[] := array[
    'profiles','betriebe','nachbarbetriebe','sorten','plantagen','feldparzellen',
    'reihengruppen','reihenbloecke','brigaden','pfluecker','esutd_vertraege',
    'psm_mittel','pflanzenschutz_behandlungen','chargen','pflueckaufgaben',
    'media_belege','steigen','kuehlketten_messungen','rotationsplan_eintraege',
    'wetter_messungen','b2b_kunden','kontingente','preislisten',
    'preislisten_positionen','vorbestellungen','lieferungen','zukauf_positionen',
    'schulungsvideos','kostentraeger','finance_ledger_entries','lohn_abrechnungen',
    'lohn_positionen','dokumente','foerderdossiers','consent_records',
    'audit_events','integrationen','integration_outbox','kpi_baseline'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('alter table public.%I force row level security;', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Oeffentlich lesbare Betriebsdaten (anon + authenticated)
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  read_tables text[] := array[
    'betriebe','sorten','plantagen','feldparzellen','reihengruppen',
    'reihenbloecke','brigaden','pfluecker','psm_mittel',
    'pflanzenschutz_behandlungen','chargen','pflueckaufgaben','media_belege',
    'steigen','kuehlketten_messungen','rotationsplan_eintraege','wetter_messungen',
    'kontingente','preislisten','preislisten_positionen','vorbestellungen',
    'lieferungen','schulungsvideos','dokumente','integrationen','kpi_baseline'
  ];
begin
  foreach t in array read_tables loop
    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (true);',
      t || '_select_public', t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sensible Daten - nur Buero-Rollen (authenticated)
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  office_tables text[] := array[
    'nachbarbetriebe','esutd_vertraege','b2b_kunden','zukauf_positionen',
    'kostentraeger','finance_ledger_entries','lohn_abrechnungen','lohn_positionen',
    'foerderdossiers','consent_records','audit_events','integration_outbox'
  ];
begin
  foreach t in array office_tables loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.has_office_access());',
      t || '_select_office', t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profile - eigener Datensatz oder Buero-Rolle
-- ---------------------------------------------------------------------------
create policy profiles_select_self on public.profiles
  for select to authenticated
  using (auth_user_id = auth.uid() or public.has_office_access());

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid() and role = public.current_app_role());
