-- =============================================================================
-- Damicon - Ausschuss wandert wieder in die Charge (Verlustquote)
-- =============================================================================
-- 20260905200000_kette_haerten.sql hat aufgabe_fortschreiben() so gebaut, dass
-- eine Mengenmeldung Menge UND Ausschuss in die Charge schreibt:
-- pflueckaufgaben.ausschuss_kg -> chargen.ausschuss_kg ist der Zaehler der
-- Verlustquote in kpi_aktuell().
--
-- 20260911000000_geraete_zeitstempel.sql hat die Funktion fuer den Geraete-
-- Zeitstempel neu definiert und dabei die Ausschuss-Fortschreibung verloren -
-- sowohl die Spalte im Update als auch die Bedingung "oder der Ausschuss hat
-- sich geaendert". Seitdem bleibt chargen.ausschuss_kg bei jeder neu
-- gemeldeten Charge 0 (sync_menge_melden() schreibt den Ausschuss nur in die
-- Aufgabe), und die Verlustquote rechnet fuer diese Chargen null Verlust.
--
-- Diese Migration stellt die Fortschreibung wieder her, ohne den
-- Geraete-Zeitstempel aus 20260911000000 anzutasten, und traegt den
-- verlorenen Ausschuss fuer bestehende Chargen nach.
-- =============================================================================

set search_path = public;

create or replace function public.aufgabe_fortschreiben()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'in_arbeit' and old.status <> 'in_arbeit' then
    update public.chargen
       set pflueck_zeitpunkt = coalesce(
             pflueck_zeitpunkt,
             public.geraet_zeitpunkt_pruefen(
               new.arbeitsbeginn_geraet_zeitpunkt,
               coalesce(new.arbeitsbeginn_server_eingang, now())
             )
           )
     where pflueckaufgabe_id = new.id;
  end if;

  if new.ist_menge_kg is distinct from old.ist_menge_kg
     or new.ausschuss_kg is distinct from old.ausschuss_kg then
    update public.chargen
       set menge_kg = new.ist_menge_kg,
           ausschuss_kg = new.ausschuss_kg
     where pflueckaufgabe_id = new.id;
  end if;

  if new.status = 'abgeschlossen' and old.status <> 'abgeschlossen' then
    update public.reihenbloecke r
       set letzte_ernte = greatest(
             coalesce(r.letzte_ernte, '-infinity'::date),
             coalesce(
               (select c.ernte_datum from public.chargen c
                 where c.pflueckaufgabe_id = new.id),
               current_date
             )
           )
     where r.id = new.reihenblock_id;
  end if;

  return new;
end;
$$;

-- Nachtrag fuer Chargen, die seit 20260911000000 gemeldet wurden. Bewusst nur
-- dort, wo die Charge 0 traegt und die Aufgabe einen Ausschuss hat: genau das
-- Muster des verlorenen Werts. Eine Charge mit einem von 0 verschiedenen
-- Ausschuss kann eine gewollte Korrektur der Betriebsleitung sein (siehe
-- Integrationstest "Abnahme: Betriebsleitung darf Chargenfelder korrigieren")
-- und bleibt unangetastet.
update public.chargen c
   set ausschuss_kg = p.ausschuss_kg
  from public.pflueckaufgaben p
 where c.pflueckaufgabe_id = p.id
   and c.ausschuss_kg = 0
   and p.ausschuss_kg > 0;
