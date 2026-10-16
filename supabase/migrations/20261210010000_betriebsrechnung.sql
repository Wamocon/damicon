-- =============================================================================
-- Damicon - Wirtschaftlichkeit des Betriebs (16.10.2026)
-- =============================================================================
-- Die Seite Wirtschaftlichkeit rechnete bisher nur die Investition ins System (Amortisation, Rendite, Kapitalwert). Im Mittelpunkt steht jetzt der Betrieb:
-- Erlöse und Kosten über drei bis fünf Jahre bis zum Betriebsergebnis. Die Rechnung des Systems folgt darunter als zweiter Teil. Diese Migration legt
-- die Grundlage für den ersten Teil:
--
--   * Eine vierte Art von Posten: "fixkosten" (Kosten des Betriebs, die nicht an der Erntemenge hängen: festes Personal, Pacht, Fahrzeuge, Versicherung).
--     Sie steht in derselben Tabelle wie die Posten des Systems, denn Erfassung, Herkunft (belegt oder geschätzt), Währung und Rechte sind dieselben.
--   * Sieben Spalten an wirtschaftlichkeit_annahmen für die Planung des Betriebs: Verkaufspreis und variable Kosten je Kilogramm im ersten Jahr, die
--     jährliche Entwicklung von Menge, Preis, variablen Kosten und Fixkosten, und die Jahre der Abschreibung des Systems. Leer heißt "nicht gesetzt";
--     die Seite zeigt dann "offen" und erfindet nichts. Die Jahresmenge des ersten Jahres steht schon in vermarktete_menge_kg.
--   * Die Funktion betrieb_ist_zwoelf_monate(): Erlöse, Kosten und Erntemenge der letzten zwölf Monate aus dem Finanzjournal und den Chargen. Sie gibt der
--     Planung einen Vergleichswert aus dem Betrieb (Preis und Kosten je Kilogramm), ohne selbst etwas zu setzen. SECURITY INVOKER: wer das Journal nicht
--     lesen darf, bekommt Nullen und die Seite zeigt "offen".
--   * Die Funktion wirtschaftlichkeit_posten_uebernehmen() (Modellwerte übernehmen) zählt nur noch die Posten des Systems. Mit Fixkosten in der Tabelle
--     bliebe sonst der Knopf "Modellwerte übernehmen" für immer gesperrt, obwohl für das System noch nichts erfasst ist.
--
-- Keine Datenänderung an vorhandenen Zeilen: die neuen Spalten sind leer. Die Zeilensicherheit der Tabellen gilt unverändert (Lesen: Administration,
-- Geschäftsführung, Betriebsleitung, Buchhaltung; Schreiben: Administration, Geschäftsführung, Buchhaltung).
-- =============================================================================

set search_path = public;

alter table public.wirtschaftlichkeit_posten drop constraint wirtschaftlichkeit_posten_art_check;
alter table public.wirtschaftlichkeit_posten
  add constraint wirtschaftlichkeit_posten_art_check check (art = any (array['investition', 'betrieb', 'nutzen', 'fixkosten']));

alter table public.wirtschaftlichkeit_annahmen
  add column plan_preis_tenge_kg            numeric(12, 2),
  add column plan_variable_kosten_tenge_kg  numeric(12, 2),
  add column plan_menge_entwicklung         numeric(6, 4),
  add column plan_preis_entwicklung         numeric(6, 4),
  add column plan_kosten_entwicklung        numeric(6, 4),
  add column plan_fixkosten_entwicklung     numeric(6, 4),
  add column plan_abschreibung_jahre        smallint;

alter table public.wirtschaftlichkeit_annahmen
  add constraint wirtschaftlichkeit_annahmen_plan_check check (
    (plan_preis_tenge_kg is null or plan_preis_tenge_kg > 0)
    and (plan_variable_kosten_tenge_kg is null or plan_variable_kosten_tenge_kg >= 0)
    and (plan_menge_entwicklung is null or (plan_menge_entwicklung >= -0.5 and plan_menge_entwicklung <= 1))
    and (plan_preis_entwicklung is null or (plan_preis_entwicklung >= -0.5 and plan_preis_entwicklung <= 1))
    and (plan_kosten_entwicklung is null or (plan_kosten_entwicklung >= -0.5 and plan_kosten_entwicklung <= 1))
    and (plan_fixkosten_entwicklung is null or (plan_fixkosten_entwicklung >= -0.5 and plan_fixkosten_entwicklung <= 1))
    and (plan_abschreibung_jahre is null or (plan_abschreibung_jahre >= 1 and plan_abschreibung_jahre <= 20))
  );

comment on column public.wirtschaftlichkeit_annahmen.plan_preis_tenge_kg is
  'Planung des Betriebs: durchschnittlicher Verkaufspreis je kg im ersten Jahr (Tenge). Leer = nicht gesetzt.';
comment on column public.wirtschaftlichkeit_annahmen.plan_variable_kosten_tenge_kg is
  'Planung des Betriebs: variable Kosten je kg im ersten Jahr (Lohn, Verpackung, Kühlung, Transport, Dünger, Pflanzenschutz). Tenge. Leer = nicht gesetzt.';
comment on column public.wirtschaftlichkeit_annahmen.plan_menge_entwicklung is
  'Planung des Betriebs: jährliche Veränderung der Menge als Anteil (0,05 = 5 Prozent mehr).';
comment on column public.wirtschaftlichkeit_annahmen.plan_abschreibung_jahre is
  'Planung des Betriebs: Jahre, über die die Investition ins System abgeschrieben wird (linear).';

create or replace function public.betrieb_ist_zwoelf_monate()
returns table (erloes_tenge numeric, kosten_tenge numeric, menge_kg numeric, buchungen integer, von date, bis date)
language sql
stable
security invoker
set search_path = public
as $$
  with fenster as (
    select public.heute_almaty() - 365 as von, public.heute_almaty() as bis
  ), journal as (
    select coalesce(sum(l.betrag_tenge) filter (where l.typ = 'erloes'), 0) as erloes,
           coalesce(sum(l.betrag_tenge) filter (where l.typ = 'kosten'), 0) as kosten,
           count(*)::integer as n
      from public.finance_ledger_entries l, fenster f
     where l.buchungsdatum > f.von and l.buchungsdatum <= f.bis
  ), ernte as (
    select coalesce(sum(c.menge_kg), 0) as kg
      from public.chargen c, fenster f
     where c.ernte_datum > f.von and c.ernte_datum <= f.bis
  )
  select j.erloes, j.kosten, e.kg, j.n, f.von + 1, f.bis
    from journal j, ernte e, fenster f;
$$;

comment on function public.betrieb_ist_zwoelf_monate() is
  'Erlöse, Kosten (Finanzjournal, nach Buchungsdatum) und Erntemenge (Chargen) der letzten 365 Tage. Vergleichswert für die Planung des Betriebs. SECURITY INVOKER.';

revoke all on function public.betrieb_ist_zwoelf_monate() from public, anon;
grant execute on function public.betrieb_ist_zwoelf_monate() to authenticated;

-- Modellwerte des Systems nur übernehmen, wenn noch kein Posten des Systems erfasst ist; Fixkosten des Betriebs zählen nicht mit.
create or replace function public.wirtschaftlichkeit_posten_uebernehmen(p_posten jsonb, p_profil uuid)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_anzahl integer;
begin
  perform pg_advisory_xact_lock(hashtext('wirtschaftlichkeit_posten_uebernehmen'));
  if exists (select 1 from public.wirtschaftlichkeit_posten where art <> 'fixkosten') then
    return 0;
  end if;
  insert into public.wirtschaftlichkeit_posten (art, kategorie, bezeichnung, betrag, waehrung, datum, herkunft, notiz, erfasst_von_profil_id)
  select p->>'art', p->>'kategorie', p->>'bezeichnung', (p->>'betrag')::numeric, p->>'waehrung', (p->>'datum')::date, p->>'herkunft', nullif(p->>'notiz', ''), p_profil
    from jsonb_array_elements(p_posten) p;
  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end;
$$;

revoke all on function public.wirtschaftlichkeit_posten_uebernehmen(jsonb, uuid) from public, anon;
grant execute on function public.wirtschaftlichkeit_posten_uebernehmen(jsonb, uuid) to authenticated;
