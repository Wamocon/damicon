-- =============================================================================
-- Wissensbasis: Qualität eines Dokuments in Prozent (Tabelle wissen_qualitaet, Spalte guete_prozent in wissen_liste)
-- =============================================================================
-- Die Liste der Wissensdokumente zeigt je Dokument die Textqualität in Prozent ("Qualität 95 %"). Der Wert wird von der Anwendung berechnet
-- (src/lib/wissen/qualitaet.ts: Text in Pakete zu 80.000 Zeichen, je Paket die Kennzahlen von textguete.ts, gewichtet gemittelt, bei einem Buch mit
-- fehlenden Scanseiten um den Anteil der Lücken gemindert) und hier abgelegt. Eine eigene kleine Tabelle statt einer Spalte an wissen_chunks, weil
-- das Schreiben eines Werts je Dokument sonst tausende Zeilen mit ihren Vektoren umschriebe (und den HNSW-Index mit).
--
-- Keine Datenänderung: Die Tabelle ist leer. Gefüllt wird sie von der Administration (Knopf "Qualität berechnen" in der Bestandspflege und
-- automatisch nach dem Hochladen eines Buchs). Nur der Dienst (service_role) liest und schreibt; die Liste (wissen_liste) läuft ohnehin nur für den Dienst.
-- wissen_liste() liefert zusätzlich guete_prozent (null, solange nichts berechnet wurde); sonst unverändert gegenüber 20261129000000.
-- Der Dateiname endet auf _pgvector.sql: wissen_chunks gibt es in PGlite nicht, die schnellen Tests überspringen ihn.
-- =============================================================================

set search_path = public;

create table if not exists public.wissen_qualitaet (
  quelle_id text primary key,
  prozent integer not null check (prozent between 0 and 100),
  berechnet_am timestamptz not null default now()
);

comment on table public.wissen_qualitaet is
  'Textqualität je Wissensdokument in Prozent, von der Anwendung berechnet (qualitaet.ts). Nur service_role.';

alter table public.wissen_qualitaet enable row level security;
revoke all on public.wissen_qualitaet from anon, authenticated;

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
           z.quelle_id, z.pfad, z.titel, z.bereich, z.rollen, z.eingelesen_am, z.autoritaetsstufe, z.quellenart, z.cluster, z.textgrundlage,
           z.pruefstatus, z.pruefen_bis, z.url, z.rechtsstelle,
           z.upload_quelle, z.hochgeladen_von, z.hochgeladen_von_id, z.paket, z.pakete_gesamt, z.guete, z.guete_hinweise, z.guete_prozent,
           count(*)::int as anzahl
    from (
      select c.id, c.quelle_id, c.pfad, c.titel, c.bereich, c.rollen, c.eingelesen_am, c.autoritaetsstufe, c.quellenart, c.cluster, c.textgrundlage,
             c.pruefstatus, c.pruefen_bis, c.url, c.rechtsstelle,
             c.extra ->> 'quelle' as upload_quelle,
             c.extra ->> 'hochgeladen_von_name' as hochgeladen_von,
             c.extra ->> 'hochgeladen_von' as hochgeladen_von_id,
             c.extra ->> 'paket' as paket,
             c.extra ->> 'pakete_gesamt' as pakete_gesamt,
             c.extra ->> 'guete' as guete,
             c.extra ->> 'guete_hinweise' as guete_hinweise,
             q.prozent as guete_prozent
      from public.wissen_chunks c
      left join public.wissen_qualitaet q on q.quelle_id = c.quelle_id
    ) z
    group by z.quelle_id, z.pfad, z.titel, z.bereich, z.rollen, z.eingelesen_am, z.autoritaetsstufe, z.quellenart, z.cluster, z.textgrundlage,
             z.pruefstatus, z.pruefen_bis, z.url, z.rechtsstelle,
             z.upload_quelle, z.hochgeladen_von, z.hochgeladen_von_id, z.paket, z.pakete_gesamt, z.guete, z.guete_hinweise, z.guete_prozent
  ) g
$$;

revoke all on function public.wissen_liste() from public, anon, authenticated;
grant execute on function public.wissen_liste() to service_role;
