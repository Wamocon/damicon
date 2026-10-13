-- =============================================================================
-- Wissensbasis: Dokumentliste serverseitig zusammenfassen (wissen_liste)
-- =============================================================================
-- Die Liste der Administration (Seite Wissensbasis) las bisher jede Textstelle einzeln, seitenweise zu je 1000 Zeilen, und fasste
-- sie im Server zu Dokumenten zusammen. Mit Buechern (mehrere tausend Abschnitte je Buch) waeren das zehntausende Zeilen je Aufruf.
-- Diese Funktion fasst in der Datenbank zusammen: Zeilen, die in allen Spalten der Liste gleich sind, werden zu einer Zeile mit
-- Anzahl. Ein Buch ergibt so eine Zeile je Paket (die Paketnummer gehoert zu den Spalten), der Bestand etwa eine Zeile je Dokument.
-- Die Anwendung rechnet danach wie bisher (dokumente-liste.ts, chunks += anzahl).
--
-- Die Antwort ist EIN jsonb-Wert: Die Obergrenze von PostgREST (1000 Zeilen je Antwort) gilt damit nicht.
-- Nur fuer den Dienst (service_role) aufrufbar: Die Liste zeigt auch ungepruefte und abgelehnte Dokumente, die niemand sonst sieht.
-- Der Dateiname endet auf _pgvector.sql: wissen_chunks gibt es in PGlite nicht, die schnellen Tests ueberspringen ihn.
-- =============================================================================

set search_path = public;

create or replace function public.wissen_liste()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb)
  from (
    select (array_agg(z.id order by z.id))[1] as id,
           z.quelle_id, z.pfad, z.titel, z.bereich, z.rollen, z.eingelesen_am, z.autoritaetsstufe, z.quellenart, z.cluster,
           z.pruefstatus, z.pruefen_bis, z.url, z.rechtsstelle,
           z.upload_quelle, z.hochgeladen_von, z.hochgeladen_von_id, z.paket, z.pakete_gesamt, z.guete, z.guete_hinweise,
           count(*)::int as anzahl
    from (
      select c.id, c.quelle_id, c.pfad, c.titel, c.bereich, c.rollen, c.eingelesen_am, c.autoritaetsstufe, c.quellenart, c.cluster,
             c.pruefstatus, c.pruefen_bis, c.url, c.rechtsstelle,
             c.extra ->> 'quelle' as upload_quelle,
             c.extra ->> 'hochgeladen_von_name' as hochgeladen_von,
             c.extra ->> 'hochgeladen_von' as hochgeladen_von_id,
             c.extra ->> 'paket' as paket,
             c.extra ->> 'pakete_gesamt' as pakete_gesamt,
             c.extra ->> 'guete' as guete,
             c.extra ->> 'guete_hinweise' as guete_hinweise
      from public.wissen_chunks c
    ) z
    group by z.quelle_id, z.pfad, z.titel, z.bereich, z.rollen, z.eingelesen_am, z.autoritaetsstufe, z.quellenart, z.cluster,
             z.pruefstatus, z.pruefen_bis, z.url, z.rechtsstelle,
             z.upload_quelle, z.hochgeladen_von, z.hochgeladen_von_id, z.paket, z.pakete_gesamt, z.guete, z.guete_hinweise
  ) g
$$;

comment on function public.wissen_liste() is
  'Liste der Administration: Textstellen mit gleichen Listenspalten zu einer Zeile mit Anzahl zusammengefasst, als ein jsonb-Array. Nur service_role.';

revoke all on function public.wissen_liste() from public, anon, authenticated;
grant execute on function public.wissen_liste() to service_role;
