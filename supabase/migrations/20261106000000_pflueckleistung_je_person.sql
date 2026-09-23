-- =============================================================================
-- Damicon - Pflueckleistung je Person, mit demselben Rechenweg wie die Kennzahl
-- =============================================================================
-- Die Bereichsseite Feld zeigt die Pflueckleistung als Rangliste: Name, Balken,
-- Wert. Die Werte dafuer hat die Anwendung bis hierher selbst aus steigen und
-- arbeitszeiten zusammengerechnet - und kam auf etwas anderes als die Kennzahl
-- darueber. In der Kachel stand 6,3 kg/h, darunter fuenf Personen zwischen 2,38
-- und 2,58. Eine Verteilung, die ihrer eigenen Kopfzahl widerspricht, ist
-- schlimmer als gar keine.
--
-- Zwei Ursachen, beide hier behoben:
--
--   1. kpi_aktuell() paart Menge und Zeit je (Pfluecker, Pflueckaufgabe). Die
--      Anwendung summierte dagegen alles je Person - also auch Arbeitszeiten
--      ohne zugehoerige Steigen. Der Nenner wurde zu gross, die Leistung zu
--      klein.
--   2. Die REST-Abfrage liefert hoechstens 1000 Zeilen. Genau so viele Steigen
--      gab es beim Nachsehen, der Schnitt lag also womoeglich schon mitten im
--      Bestand. Eine Kennzahl, die von der Seitengroesse einer Abfrage
--      abhaengt, ist keine.
--
-- Der Rechenweg unten ist wortgleich die CTE aus 20260905190000 (dort fuer
-- pflueckleistung und pflueckStreuung). Er steht bewusst zweimal statt in einer
-- gemeinsamen Funktion: kpi_aktuell() ist die Kennzahlenquelle und bleibt
-- unberuehrt, bis der Katalog steht. Weicht der Weg hier je ab, faellt es
-- sofort auf - die Kachel zeigt beides nebeneinander.
-- =============================================================================

set search_path = public;

create or replace function public.pflueckleistung_je_person()
returns table (
  name text,
  kg_h numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with je_person as (
    select m.pfluecker_id,
           sum(m.kg) / nullif(sum(z.minuten) / 60.0, 0) as kg_h
      from (
        select pfluecker_id, pflueckaufgabe_id, sum(gewicht_kg) as kg
          from public.steigen
         where pfluecker_id is not null and pflueckaufgabe_id is not null
         group by 1, 2
      ) m
      join (
        select pfluecker_id, pflueckaufgabe_id, sum(minuten) as minuten
          from public.arbeitszeiten
         where minuten is not null and pflueckaufgabe_id is not null
         group by 1, 2
      ) z on z.pfluecker_id = m.pfluecker_id
         and z.pflueckaufgabe_id = m.pflueckaufgabe_id
     group by m.pfluecker_id
    having sum(z.minuten) > 0
  )
  select p.name, round(j.kg_h, 2)
    from je_person j
    join public.pfluecker p on p.id = j.pfluecker_id
   order by j.kg_h desc;
$$;

comment on function public.pflueckleistung_je_person is
  'Pflueckleistung in kg/h je Person, gleicher Rechenweg wie kpi_aktuell(). Grundlage der Rangliste auf der Bereichsseite Feld.';

-- security invoker: RLS auf steigen, arbeitszeiten und pfluecker entscheidet
-- weiter, wer was sieht. Die Funktion oeffnet keinen Weg an ihr vorbei.
grant execute on function public.pflueckleistung_je_person() to authenticated;
