-- =============================================================================
-- Wissensbasis: Vermerk der prüfenden Person zu fehlenden Scanseiten (Tabelle wissen_seiten_vermerk)
-- =============================================================================
-- Die Seitenverlauf-Prüfung beim Hochladen (src/lib/wissen/seitenverlauf.ts) meldet fehlende Seiten mit Nummer und legt sie in extra.seiten_pruefung ab.
-- Die zweite Person, die ein solches Buch freigibt, soll sie am Original prüfen und mit einem Vermerk bestätigen, zum Beispiel "Leere Seiten im Buch".
-- Ohne Vermerk gibt die Anwendung ein Buch mit Seitenlücken nicht frei (src/lib/wissen/freigabe.ts). Der Vermerk steht in dieser kleinen Tabelle (eine
-- Zeile je Dokument) statt in extra: Ein Wert in extra müsste in jede der tausenden Zeilen eines Buchs geschrieben werden. Er bleibt bei dem Dokument,
-- solange es existiert, und geht mit ihm (Löschen, Entfernen).
--
-- Keine Datenänderung: Die Tabelle ist leer. Nur service_role liest und schreibt.
-- wissen_liste() liefert zusätzlich seiten_fehlend und seiten_stellen (aus extra.seiten_pruefung) und seiten_vermerk; sonst unverändert gegenüber
-- 20261204000000. Der Dateiname endet auf _pgvector.sql: wissen_chunks gibt es in PGlite nicht, die schnellen Tests überspringen ihn.
-- =============================================================================

set search_path = public;

create table if not exists public.wissen_seiten_vermerk (
  quelle_id text primary key,
  vermerk text not null check (char_length(vermerk) between 3 and 300),
  fehlende_seiten text,
  vermerkt_von uuid references public.profiles(id) on delete set null,
  vermerkt_am timestamptz not null default now()
);

comment on table public.wissen_seiten_vermerk is
  'Vermerk der prüfenden Person zu fehlenden Scanseiten eines hochgeladenen Buchs (zum Beispiel "Leere Seiten im Buch"). Nur service_role.';

alter table public.wissen_seiten_vermerk enable row level security;
revoke all on public.wissen_seiten_vermerk from anon, authenticated;

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
           z.seiten_fehlend, z.seiten_stellen, z.seiten_vermerk,
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
             o.groesse as original_groesse,
             c.extra -> 'seiten_pruefung' ->> 'fehlend' as seiten_fehlend,
             c.extra -> 'seiten_pruefung' ->> 'stellen' as seiten_stellen,
             v.vermerk as seiten_vermerk
      from public.wissen_chunks c
      left join public.wissen_qualitaet q on q.quelle_id = c.quelle_id
      left join public.wissen_original o on o.quelle_id = c.quelle_id
      left join public.wissen_seiten_vermerk v on v.quelle_id = c.quelle_id
    ) z
    group by z.quelle_id, z.pfad, z.titel, z.bereich, z.rollen, z.eingelesen_am, z.autoritaetsstufe, z.quellenart, z.cluster, z.textgrundlage,
             z.pruefstatus, z.pruefen_bis, z.url, z.rechtsstelle,
             z.upload_quelle, z.hochgeladen_von, z.hochgeladen_von_id, z.paket, z.pakete_gesamt, z.guete, z.guete_hinweise, z.guete_prozent, z.original_groesse,
             z.seiten_fehlend, z.seiten_stellen, z.seiten_vermerk
  ) g
$$;

revoke all on function public.wissen_liste() from public, anon, authenticated;
grant execute on function public.wissen_liste() to service_role;
