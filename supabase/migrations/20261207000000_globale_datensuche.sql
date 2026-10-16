-- =============================================================================
-- Damicon - Globale Datensuche (WMCNL-1467, Stufe 2 der Suche)
-- =============================================================================
-- Die Suche in der Kopfzeile kennt seit Stufe 1 Seiten und Module. Wer eine
-- Chargen-Nummer, eine Steige, einen Pfluecker oder ein Dokument sucht, fand
-- bisher nichts. Diese Funktion macht Datensaetze auffindbar: eine einzige
-- SQL-Funktion, die per UNION ALL ueber die wichtigsten Tabellen sucht.
--
-- Bewusste Entscheidungen:
--   * KEINE Postgres-Volltextsuche (to_tsvector). Fuer Kasachisch gibt es
--     keinen Stemmer, der Betrieb arbeitet in vier Sprachen, und die haeufigsten
--     Suchbegriffe sind ohnehin Codes (Chargen-Nummer, Steige, Ausweis), keine
--     Woerter. Ein Teilstring-Vergleich mit ILIKE trifft diese Faelle genauer.
--   * security invoker: die Funktion laeuft mit den Rechten der aufrufenden
--     Person. Jede Tabelle wendet ihre eigene Zeilensicherheit (RLS) an, die
--     Suche kann also nichts zeigen, was die Person nicht ohnehin lesen darf.
--     Es gibt keine RLS-Umgehung, auch nicht fuer die Rangfolge.
--   * Mindestlaenge 2 Zeichen nach dem Kuerzen von Leerraum. Ohne sie wuerde
--     ein leeres Muster '%%' jede Zeile treffen und die Suche zum Vollzugriff
--     auf eine ganze Tabelle machen.
--   * Das Muster wird maskiert: Backslash, Prozentzeichen und Unterstrich in
--     der Eingabe sind Zeichen, keine Platzhalter. Wer "50%" sucht, bekommt
--     genau das, nicht alles.
--   * Obergrenze fuer die Trefferzahl (hoechstens 50), damit eine kurze
--     Eingabe keine ganze Tabelle ueber das Netz schickt.
--   * Nur fuer angemeldete Konten (authenticated). anon hat keinen Zugriff,
--     auch wenn einzelne Tabellen anon lesbar sind: die Suche ist ein
--     Werkzeug der Anwendung, keine oeffentliche Schnittstelle.
--
-- Rueckgabe: je Treffer ein Typ (steige, charge, aufgabe, pfluecker, block,
-- dokument, kunde), die Id, ein Titel (das, wonach man meist sucht, etwa der
-- Code) und ein Untertitel (Zusammenhang, damit man Treffer unterscheiden
-- kann). Rangfolge: genau gleich, dann Anfang, dann irgendwo enthalten. Die
-- Anwendung entscheidet anhand von rbac.ts, welche Typen die Rolle sehen darf
-- und wohin ein Treffer verlinkt; die Datenbank zieht die aeussere Grenze.
-- =============================================================================

set search_path = public;

create or replace function public.search_everything(q text, max_rows integer default 20)
returns table (
  treffer_typ        text,
  treffer_id         uuid,
  treffer_titel      text,
  treffer_untertitel text,
  treffer_rang       integer
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  suchtext text := left(btrim(coalesce(q, '')), 60);
  maskiert text;
  grenze   integer := least(greatest(coalesce(max_rows, 20), 1), 50);
begin
  -- Zu kurz: gar nicht erst suchen (siehe Kopf, Vollzugriff durch '%%').
  if char_length(suchtext) < 2 then
    return;
  end if;

  -- Backslash zuerst, sonst wuerde die Maskierung der anderen Zeichen
  -- ihrerseits maskiert.
  maskiert := replace(replace(replace(suchtext, '\', '\\'), '%', '\%'), '_', '\_');

  return query
  with kandidaten as (
    select 'steige'::text as typ, s.id as id, s.code as titel,
           nullif(concat_ws(' / ', c.code, rb.code), '') as untertitel,
           array[s.code] as felder
      from public.steigen s
      left join public.chargen c on c.id = s.charge_id
      left join public.reihenbloecke rb on rb.id = c.reihenblock_id
     where s.code ilike '%' || maskiert || '%' escape '\'
    union all
    select 'charge', c.id, c.code,
           nullif(concat_ws(' / ', rb.code, so.name, c.ernte_datum::text), ''),
           array[c.code]
      from public.chargen c
      left join public.reihenbloecke rb on rb.id = c.reihenblock_id
      left join public.sorten so on so.id = c.sorte_id
     where c.code ilike '%' || maskiert || '%' escape '\'
    union all
    select 'aufgabe', a.id, a.code,
           nullif(concat_ws(' / ', rb.code, a.status::text), ''),
           array[a.code]
      from public.pflueckaufgaben a
      left join public.reihenbloecke rb on rb.id = a.reihenblock_id
     where a.code ilike '%' || maskiert || '%' escape '\'
    union all
    select 'pfluecker', p.id, p.name, p.ausweis, array[p.name, p.ausweis]
      from public.pfluecker p
     where p.name ilike '%' || maskiert || '%' escape '\'
        or p.ausweis ilike '%' || maskiert || '%' escape '\'
    union all
    select 'block', rb.id, rb.code,
           nullif(concat_ws(' / ', so.name, rb.status::text), ''),
           array[rb.code]
      from public.reihenbloecke rb
      left join public.sorten so on so.id = rb.sorte_id
     where rb.code ilike '%' || maskiert || '%' escape '\'
    union all
    select 'dokument', d.id, d.name,
           nullif(concat_ws(' / ', d.kategorie::text, d.bezug), ''),
           array[d.name, coalesce(d.bezug, '')]
      from public.dokumente d
     where d.name ilike '%' || maskiert || '%' escape '\'
        or d.bezug ilike '%' || maskiert || '%' escape '\'
    union all
    select 'kunde', k.id, k.name, null::text, array[k.name]
      from public.b2b_kunden k
     where k.name ilike '%' || maskiert || '%' escape '\'
  )
  select k.typ, k.id, k.titel, k.untertitel,
         case
           when exists (select 1 from unnest(k.felder) f where lower(f) = lower(suchtext)) then 0
           when exists (select 1 from unnest(k.felder) f where f ilike maskiert || '%' escape '\') then 1
           else 2
         end as rang
    from kandidaten k
   order by rang, k.typ, k.titel
   limit grenze;
end;
$$;

comment on function public.search_everything(text, integer) is
  'Globale Datensuche (WMCNL-1467): ILIKE-Teilstring ueber Steigen, Chargen, Pflueckaufgaben, Pfluecker, Reihenbloecke, Dokumente und B2B-Kunden. security invoker, also mit der RLS der aufrufenden Person. Mindestens 2 Zeichen, maskiertes Muster, hoechstens 50 Treffer.';

-- Nur angemeldete Konten. Postgres gibt Funktionen standardmaessig an PUBLIC
-- frei, daher erst alles entziehen.
revoke all on function public.search_everything(text, integer) from public;
revoke all on function public.search_everything(text, integer) from anon;
grant execute on function public.search_everything(text, integer) to authenticated;
