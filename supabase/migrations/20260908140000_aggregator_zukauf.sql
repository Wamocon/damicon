-- =============================================================================
-- Damicon - Aggregator: Zukauf Nachbarbetriebe & Import-Parser (WMCNL-1453)
-- =============================================================================
-- nachbarbetriebe und zukauf_positionen bestehen bereits seit der
-- Initialmigration, aber ohne jedes Schreibrecht: 20260902090100_rls_policies.sql
-- legt fuer beide Tabellen nur eine SELECT-Policy fuer Buero-Rollen an, eine
-- INSERT/UPDATE-Policy fehlt komplett. Jeder Schreibversuch - egal wie gut der
-- Parser prueft - waere bisher an 42501 gescheitert. Diese Migration schliesst
-- die Luecke und ergaenzt eine atomare Import-Funktion.
--
-- FACHLICHE ENTSCHEIDUNGEN:
--
--   1. DAS CSV-FELD "DATUM" WIRD chargen.ernte_datum, KEINE NEUE SPALTE.
--      Das Ticket nennt vier Pflichtspalten: Menge, Sorte, Datum, Nachbarbetrieb.
--      zukauf_positionen hat bereits ein Datumsfeld - rechnungsdatum -, das
--      semantisch etwas anderes ist (Rechnungseingang, meist spaeter als die
--      Anlieferung). "Charge = Herkunftsblock + Sorte + Erntetag" (siehe
--      Kommentar an public.chargen) gilt fuer zugekaufte Ware genauso wie fuer
--      eigene: jede Importzeile bekommt eine eigene chargen-Zeile mit
--      reihenblock_id = null (strukturell bereits moeglich, das Feld ist
--      nullable) und ernte_datum = CSV-Datum. Das ist zugleich die "eigene
--      Charge je Fremdbetrieb"-Nachweiskette, die die Vorab-Recherche verlangt,
--      und braucht keine elfte Spalte an zukauf_positionen.
--
--   2. preis_tenge_kg WIRD NULLABLE.
--      Die vier CSV-Pflichtspalten enthalten keinen Preis - der wird in der
--      Praxis erst mit der Rechnung des Nachbarbetriebs bekannt, oft Tage nach
--      der Anlieferung (rechnungsdatum ist bereits nullable, genau aus diesem
--      Grund). preis_tenge_kg war bislang "not null" und haette jeden Import
--      blind erzwingen muessen, einen Preis zu erfinden. Die Spalte wird
--      geoeffnet, mit einer Wertebereichspruefung (>= 0) statt der bisherigen
--      Pflicht - eine zweite Aktion (zukaufPreisNachtragen, siehe
--      src/lib/actions/zukauf.ts) traegt den Preis nach, sobald die Rechnung da
--      ist. Bestehende Zeilen (z. B. der Seed) behalten ihren Wert unveraendert.
--
--   3. SCHREIBRECHTE NUR admin/betriebsleitung - DIE erzeuger-LUECKE BLEIBT
--      BEWUSST OFFEN, NICHT STILLSCHWEIGEND UEBERGANGEN.
--      src/lib/rbac.ts gibt der Rolle "erzeuger" bereits seit einer frueheren
--      Aenderung crud("aggregator"). Ein echtes Self-Service-Szenario, in dem
--      sich ein Nachbarbetrieb selbst anmeldet und die eigene Anlieferung
--      eintraegt, braeuchte dafuer aber eine profiles->nachbarbetrieb_id-
--      Verknuepfung samt RLS-Eingrenzung auf die eigene Firma - analog
--      profiles.b2b_kunde_id/current_b2b_kunde_id() aus
--      20260908120000_reklamationen.sql fuer Reklamationen. Diese Verknuepfung
--      existiert nicht und wird hier NICHT nachgebaut: ohne eine bestaetigte
--      Anforderung, wie sich ein Nachbarbetrieb ueberhaupt anmeldet (eigener
--      Auth-User? Zugang ueber das Buero?), waere jede RLS-Regel dafuer
--      Spekulation. Das MVP traegt deshalb ausschliesslich admin/
--      betriebsleitung ("das Buero laedt die CSV hoch") - eine "erzeuger"-
--      Anmeldung bekommt ueber requirePermission() zwar gruenes Licht von
--      rbac.ts, scheitert dann aber kontrolliert an dieser RLS-Policy (42501,
--      zweite Verteidigungslinie), statt unbemerkt fremde Nachbarbetrieb-
--      Stammdaten schreiben zu koennen. Folgearbeit, sobald die
--      Self-Service-Anforderung feststeht.
--
--   4. IMPORT ALS EINE ATOMARE RPC, NICHT ALS SCHLEIFE AUS DER SERVER ACTION.
--      "Keine Teiluebernahme" (Vorab-Recherche) heisst mehr als "brich vor dem
--      ersten Schreiben ab, wenn die Vorpruefung einen Fehlerbefund hat" - ein
--      reiner JS-Loop mit N einzelnen INSERT-Aufrufen koennte bei einem
--      Verbindungsabbruch mitten im Lauf trotzdem einen Teil der Zeilen
--      committet haben. public.zukauf_positionen_importieren() buendelt eine
--      ganze Zeilenliste in einer einzigen PL/pgSQL-Funktion = eine
--      Transaktion: entweder alle Zeilen oder keine. SECURITY INVOKER wie
--      public.reihenblock_freigeben() - die Funktion buendelt nur mehrere
--      Schreibvorgaenge, die RLS-Policies des Aufrufers (siehe Abschnitt 3
--      dieser Migration) gelten unveraendert weiter, es braucht keine
--      Rechteausweitung wie bei public.lohn_periode_berechnen().
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. preis_tenge_kg oeffnen, Wertebereiche absichern
-- ---------------------------------------------------------------------------
alter table public.zukauf_positionen
  alter column preis_tenge_kg drop not null;

alter table public.zukauf_positionen
  add constraint zukauf_positionen_menge_positiv check (menge_kg > 0),
  add constraint zukauf_positionen_preis_positiv
    check (preis_tenge_kg is null or preis_tenge_kg >= 0);

comment on column public.zukauf_positionen.preis_tenge_kg is
  'Rechnungspreis je kg. Bewusst nullable (WMCNL-1453): beim Import per CSV ist der Preis meist noch nicht bekannt, er wird per zukaufPreisNachtragen() nachgetragen, sobald die Rechnung des Nachbarbetriebs vorliegt.';

create index if not exists idx_zukauf_positionen_nachbarbetrieb
  on public.zukauf_positionen(nachbarbetrieb_id);
create index if not exists idx_zukauf_positionen_charge
  on public.zukauf_positionen(charge_id);

-- ---------------------------------------------------------------------------
-- 2. Schreib-Policies: nachbarbetriebe, zukauf_positionen
-- ---------------------------------------------------------------------------
-- Nachbarbetrieb-Stammdaten pflegt die Leitung, analog sorten_insert_leitung.
create policy nachbarbetriebe_insert_leitung on public.nachbarbetriebe
  for insert to authenticated
  with check (public.has_role('admin', 'betriebsleitung'));
create policy nachbarbetriebe_update_leitung on public.nachbarbetriebe
  for update to authenticated
  using (public.has_role('admin', 'betriebsleitung'))
  with check (public.has_role('admin', 'betriebsleitung'));

-- Zukaufpositionen: Anlegen (Import) und Aendern (Preis-/Rechnungsnachtrag)
-- beide auf admin/betriebsleitung beschraenkt - siehe Migrationskopf Punkt 3
-- fuer die bewusst offen gelassene erzeuger-Luecke.
create policy zukauf_positionen_insert_leitung on public.zukauf_positionen
  for insert to authenticated
  with check (public.has_role('admin', 'betriebsleitung'));
create policy zukauf_positionen_update_leitung on public.zukauf_positionen
  for update to authenticated
  using (public.has_role('admin', 'betriebsleitung'))
  with check (public.has_role('admin', 'betriebsleitung'));

-- ---------------------------------------------------------------------------
-- 3. RPC: Import atomar schreiben
-- ---------------------------------------------------------------------------
-- p_zeilen ist ein JSON-Array bereits gepruefter, aufgeloester Zeilen
-- (src/lib/import/zukauf-parser.ts hat Pflichtfelder, Wertebereiche und
-- Referenzen gegen sorten/nachbarbetriebe schon validiert - diese Funktion
-- vertraut der aufrufenden Server Action, prueft aber trotzdem die
-- Feldform, bevor sie schreibt):
--   [{ "nachbarbetrieb_id": "<uuid>", "sorte_id": "<uuid>",
--      "menge_kg": <number>, "ernte_datum": "YYYY-MM-DD" }, ...]
-- Je Zeile entsteht eine offene Charge ohne Reihenblock (Code "ZUK-...", damit
-- im Nachweisprotokoll sofort erkennbar ist: diese Charge stammt aus einem
-- Zukauf-Import, nicht aus der eigenen Ernte) und eine zukauf_positionen-Zeile
-- ohne Preis/Rechnungsdatum (siehe Migrationskopf Punkt 2).
create or replace function public.zukauf_positionen_importieren(p_zeilen jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_zeile     record;
  v_code      text;
  v_charge_id uuid;
  v_anzahl    integer := 0;
begin
  if p_zeilen is null or jsonb_typeof(p_zeilen) <> 'array' then
    raise exception 'p_zeilen muss ein JSON-Array sein.'
      using errcode = 'invalid_parameter_value';
  end if;

  for v_zeile in
    select value as daten, ordinality as idx
      from jsonb_array_elements(p_zeilen) with ordinality as t(value, ordinality)
  loop
    if (v_zeile.daten ->> 'nachbarbetrieb_id') is null
       or (v_zeile.daten ->> 'sorte_id') is null
       or (v_zeile.daten ->> 'menge_kg') is null
       or (v_zeile.daten ->> 'ernte_datum') is null then
      raise exception 'Zeile %: nachbarbetrieb_id, sorte_id, menge_kg und ernte_datum sind Pflichtfelder.', v_zeile.idx
        using errcode = 'not_null_violation';
    end if;

    -- clock_timestamp() statt now(): now() bliebe fuer die gesamte Transaktion
    -- gleich, der Sekundenanteil des Codes waere dann bei allen Zeilen eines
    -- Laufs identisch. Die laufende Nummer idx haengt zusaetzlich an, falls
    -- zwei Zeilen dieselbe Sekunde treffen.
    v_code := 'ZUK-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISS')
              || '-' || lpad(v_zeile.idx::text, 3, '0');

    insert into public.chargen (code, sorte_id, ernte_datum, status)
    values (
      v_code,
      (v_zeile.daten ->> 'sorte_id')::uuid,
      (v_zeile.daten ->> 'ernte_datum')::date,
      'offen'
    )
    returning id into v_charge_id;

    insert into public.zukauf_positionen (nachbarbetrieb_id, charge_id, sorte_id, menge_kg)
    values (
      (v_zeile.daten ->> 'nachbarbetrieb_id')::uuid,
      v_charge_id,
      (v_zeile.daten ->> 'sorte_id')::uuid,
      (v_zeile.daten ->> 'menge_kg')::numeric
    );

    v_anzahl := v_anzahl + 1;
  end loop;

  return v_anzahl;
end;
$$;
comment on function public.zukauf_positionen_importieren is
  'Schreibt eine bereits gepruefte Liste von Zukauf-Importzeilen atomar (chargen + zukauf_positionen je Zeile). SECURITY INVOKER: die RLS-Schreibrechte des Aufrufers (admin/betriebsleitung) gelten unveraendert. Schlaegt eine Zeile fehl, wird die gesamte Transaktion zurueckgerollt - keine Teiluebernahme.';

grant execute on function public.zukauf_positionen_importieren(jsonb) to authenticated;
