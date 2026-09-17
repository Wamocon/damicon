-- =============================================================================
-- Damicon - Lesezugriff auf Betriebsdaten nach Rolle statt fuer jeden Angemeldeten
-- =============================================================================
-- 20260905160000_haerten.sql hat die Betriebsdaten in einer Schleife von
-- "public" auf "authenticated" gehoben: jede der dort aufgezaehlten Tabellen
-- bekam eine Policy <tabelle>_select_intern mit using (true). Gemeint war "nicht
-- mehr oeffentlich", nicht "fuer jede Rolle". Spaetere Migrationen haben das
-- fuer steigen, kuehlketten_messungen, lieferungen, vorbestellungen und
-- kontingente nachgezogen; der Rest blieb offen.
--
-- Folge: picker und kunde lesen ueber die REST-API Chargen, Pflueckaufgaben,
-- Reihenbloecke, Brigaden, Behandlungen und den Rotationsplan, obwohl rbac.ts
-- ihnen keines dieser Module zeigt. Die Anwendung blendet aus, die Datenbank
-- nicht.
--
-- Diese Migration ersetzt die verbliebenen using(true)-Lesepolicies durch
-- rollenbezogene. Massstab ist rolePermissions in src/lib/rbac.ts:
--   * erzeuger hat view("reihenbloecke"), view("pflueckaufgaben") und
--     crud("aggregator") - behaelt also die Produktionssicht inklusive der
--     Felder, die ReihenbloeckeAnsicht mitliest (Reihengruppe, Feldparzelle,
--     Behandlung, Mittel) und der Chargen des Zukaufs.
--   * kunde hat weder Feld- noch Aufgabensicht. Fuer Chargen bleibt genau der
--     Ausschnitt, den die Anwendung dem Kunden ohnehin zeigt: die Charge
--     hinter der eigenen Reklamation und hinter der eigenen Lieferung
--     (data/reklamationen.ts, data/lieferungen.ts).
--   * picker hat view("lohn") und view("schulungen") - keine Betriebsdaten.
--
-- BEWUSST NICHT TEIL DIESER MIGRATION:
--   * preislisten und preislisten_positionen behalten using(true): der
--     B2B-Kunde braucht die Preisliste, und die Staffelung je Kundengruppe
--     (20261011000000) ist eine eigene fachliche Frage.
--   * Schreibpolicies bleiben unveraendert. Zu weit gefasste Schreibrechte
--     (steigen_update_feld, pflueckaufgaben_update_feld) sind ein eigener
--     Befund und gehoeren in eine eigene Migration.
--
-- Unbedenklich fuer die SECURITY-DEFINER-Pfade: herkunftsauskunft(),
-- steige_nach_abschluss_fest(), lohn_periode_berechnen() und die uebrigen
-- definer-Funktionen laufen als Eigentuemer und haengen nicht an diesen
-- Policies. Der Hinweis in 20261003000000_steigen_nach_abschluss_fest.sql
-- beschreibt genau den Fall ohne definer - die Funktion ist definer, die
-- Sperre bleibt.
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. Produktionssicht: Buero, Feld und Erzeuger
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  produktion text[] := array[
    'reihenbloecke','reihengruppen','feldparzellen',
    'psm_mittel','pflanzenschutz_behandlungen','pflueckaufgaben'
  ];
begin
  foreach t in array produktion loop
    execute format('drop policy if exists %I on public.%I;', t || '_select_intern', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (public.has_role(''admin'', ''betriebsleitung'', ''buchhaltung'', ''brigade'', ''erzeuger''));',
      t || '_select_produktion', t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Nur Buero und Feld
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  intern text[] := array[
    'betriebe','plantagen','brigaden','rotationsplan_eintraege','wetter_messungen'
  ];
begin
  foreach t in array intern loop
    execute format('drop policy if exists %I on public.%I;', t || '_select_intern', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (public.has_role(''admin'', ''betriebsleitung'', ''buchhaltung'', ''brigade''));',
      t || '_select_betrieb', t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Nur Buero: Integrationen (rbac: integrationen nur admin/betriebsleitung/
--    buchhaltung)
-- ---------------------------------------------------------------------------
drop policy if exists integrationen_select_intern on public.integrationen;
create policy integrationen_select_buero on public.integrationen
  for select to authenticated
  using (public.has_office_access());

-- ---------------------------------------------------------------------------
-- 4. Chargen: Betrieb und Erzeuger voll, Kunde nur die eigenen
-- ---------------------------------------------------------------------------
-- Der Kundenausschnitt bildet die beiden Stellen ab, an denen die Anwendung
-- dem Kunden heute eine Charge zeigt: Reklamation (chargen ( code,
-- reihenbloecke ( code ) )) und Lieferung (chargen ( code, ... )). Ohne diese
-- Zweige blieben beide Ansichten beim Kunden leer.
drop policy if exists chargen_select_intern on public.chargen;
create policy chargen_select_betrieb_kunde on public.chargen
  for select to authenticated
  using (
    public.has_role('admin', 'betriebsleitung', 'buchhaltung', 'brigade', 'erzeuger')
    or exists (
      select 1 from public.reklamationen r
       where r.charge_id = chargen.id
         and r.b2b_kunde_id = public.current_b2b_kunde_id()
    )
    or exists (
      select 1 from public.lieferungen l
       where l.charge_id = chargen.id
         and l.b2b_kunde_id = public.current_b2b_kunde_id()
    )
  );

comment on policy chargen_select_betrieb_kunde on public.chargen is
  'Betrieb und Erzeuger lesen alle Chargen; die Rolle kunde nur die Chargen hinter eigener Reklamation oder eigener Lieferung. Ersetzt chargen_select_intern (using(true)) aus 20260905160000_haerten.sql.';
