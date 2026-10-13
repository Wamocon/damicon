-- =============================================================================
-- Wissensbasis: Original-PDF bis zur Freigabe aufbewahren (Bucket wissen-originale, Tabelle wissen_original)
-- =============================================================================
-- Beim Prüfen eines hochgeladenen Buchs soll die Original-PDF geöffnet werden können. Der Upload liest die Datei bisher nur im Browser und schickt
-- nur den Text. Jetzt legt der Browser die PDF zusätzlich in einen privaten Speicher (Bucket "wissen-originale"); die Anwendung merkt sich in
-- wissen_original, welche Datei zu welchem Dokument gehört. Die Datei bleibt NUR bis zur Freigabe: Bei Freigabe, Ablehnung, Löschen und Entfernen
-- löscht die Anwendung Datei und Verweis (src/lib/wissen/original.ts). Gelesen wird nur über kurzlebige signierte Adressen, die der Server nach der
-- Rechteprüfung (ki_assistent:manage, nur Administration) erzeugt; es gibt bewusst keine Policy für angemeldete Nutzer.
--
-- Keine Datenänderung an vorhandenen Dokumenten: Die Tabelle ist leer, der Bucket neu. Das Größenlimit des Buckets (500 MiB) kann nicht über dem
-- Gesamtlimit des Supabase-Projekts liegen (Einstellung Storage im Dashboard); ist die Datei größer, bleibt der Upload des Textes unberührt und die
-- Oberfläche meldet, dass das Original nicht gespeichert wurde.
-- wissen_liste() liefert zusätzlich original_groesse (null = kein Original); sonst unverändert gegenüber 20261203000000.
-- Der Dateiname endet auf _pgvector.sql: wissen_chunks gibt es in PGlite nicht, die schnellen Tests überspringen ihn.
-- =============================================================================

set search_path = public;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wissen-originale', 'wissen-originale', false, 524288000, array['application/pdf'])
on conflict (id) do nothing;

create table if not exists public.wissen_original (
  quelle_id text primary key,
  pfad text not null,
  dateiname text not null,
  groesse bigint not null check (groesse > 0),
  abgelegt_von uuid references public.profiles(id) on delete set null,
  abgelegt_am timestamptz not null default now()
);

comment on table public.wissen_original is
  'Verweis auf die Original-PDF eines hochgeladenen Buchs im Bucket wissen-originale; nur bis zur Freigabe. Nur service_role.';

alter table public.wissen_original enable row level security;
revoke all on public.wissen_original from anon, authenticated;

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
           z.upload_quelle, z.hochgeladen_von, z.hochgeladen_von_id, z.paket, z.pakete_gesamt, z.guete, z.guete_hinweise, z.guete_prozent, z.original_groesse,
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
             q.prozent as guete_prozent,
             o.groesse as original_groesse
      from public.wissen_chunks c
      left join public.wissen_qualitaet q on q.quelle_id = c.quelle_id
      left join public.wissen_original o on o.quelle_id = c.quelle_id
    ) z
    group by z.quelle_id, z.pfad, z.titel, z.bereich, z.rollen, z.eingelesen_am, z.autoritaetsstufe, z.quellenart, z.cluster, z.textgrundlage,
             z.pruefstatus, z.pruefen_bis, z.url, z.rechtsstelle,
             z.upload_quelle, z.hochgeladen_von, z.hochgeladen_von_id, z.paket, z.pakete_gesamt, z.guete, z.guete_hinweise, z.guete_prozent, z.original_groesse
  ) g
$$;

revoke all on function public.wissen_liste() from public, anon, authenticated;
grant execute on function public.wissen_liste() to service_role;
