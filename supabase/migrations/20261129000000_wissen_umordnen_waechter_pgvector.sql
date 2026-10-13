-- =============================================================================
-- Wissensbasis: Einordnung nachträglich ändern (Wächter und Liste)
-- =============================================================================
-- Die Administration kann Cluster, Bereich, Quellenart und Textgrundlage eines Dokuments nachträglich ändern (Seite Wissensbasis, Knopf
-- "Einordnung ändern"; Assistent mit Bestätigung). Quellenart, Bereich und Textgrundlage bestimmen, wie weit die Suche einer Quelle traut. Damit
-- das Vier-Augen-Prinzip nicht über diesen Weg umgangen wird (hochladen als Internetquelle, freigeben lassen, danach allein zur Rechtsnorm
-- aufwerten), erweitert diese Migration den Wächter wissen_pruefung_wache:
--
--   Ändert sich bei einem FREIGEGEBENEN Upload die Quellenart, die Stufe, der Bereich oder die Textgrundlage, muss die Änderung eine ANDERE Person
--   als die hochladende eintragen (geprueft_von und ein NEUES geprueft_am im selben Update; die Freigabe von früher zählt nicht). Dabei darf die Wiedervorlage (pruefen_bis) neu gesetzt werden,
--   weil sie von der Quellenart abhängt. Vor der Freigabe (ungeprüft, abgelehnt) und bei Bestand ohne Upload gibt es keine Einschränkung, und der
--   Cluster ist frei (er wirkt nicht auf die Suche).
--
-- Alles andere im Wächter bleibt wie in 20261124000000 (die Funktion wird vollständig neu geschrieben, der Rumpf ist unverändert bis auf den
-- neuen Block). Dazu erhält die Liste wissen_liste() die Spalte textgrundlage (Anzeige und Änderung in der Verwaltung).
-- Keine Datenänderung. Der Dateiname endet auf _pgvector.sql: wissen_chunks gibt es in PGlite nicht, die schnellen Tests überspringen ihn.
-- =============================================================================

set search_path = public;

create or replace function public.wissen_pruefung_wache()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  hochgeladen_von text;
  ist_upload boolean;
begin
  if tg_op = 'INSERT' then
    -- Ein Upload beginnt immer ungeprueft. Das Skript und der ETL legen freigegebene Zeilen an, aber ohne diesen Marker.
    if new.extra ->> 'quelle' = 'upload' and new.pruefstatus <> 'ungeprueft' then
      raise exception 'Vier-Augen-Prinzip: Ein hochgeladenes Wissensdokument beginnt immer ungeprueft (war: %).', new.pruefstatus
        using errcode = '23514';
    end if;
    return new;
  end if;

  ist_upload := old.extra ->> 'quelle' = 'upload';
  hochgeladen_von := old.extra ->> 'hochgeladen_von';

  -- Neu: Aenderung der Einordnung eines freigegebenen Uploads nur durch eine andere Person als die hochladende.
  if ist_upload
     and old.pruefstatus = 'freigegeben' and new.pruefstatus = 'freigegeben'
     and (new.quellenart is distinct from old.quellenart
          or new.autoritaetsstufe is distinct from old.autoritaetsstufe
          or new.bereich is distinct from old.bereich
          or new.textgrundlage is distinct from old.textgrundlage) then
    -- Die Aenderung muss die aendernde Person frisch eintragen: ein unveraendertes geprueft_am (die Freigabe von frueher) genuegt nicht.
    if new.geprueft_von is null or new.geprueft_am is null or new.geprueft_am is not distinct from old.geprueft_am
       or hochgeladen_von is null or new.geprueft_von::text = hochgeladen_von then
      raise exception 'Vier-Augen-Prinzip: Die Einordnung eines freigegebenen Dokuments aendert nicht die Person, die es hochgeladen hat.'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if new.pruefstatus is distinct from old.pruefstatus then
    -- Entschieden ist entschieden: freigegeben und abgelehnt bleiben so.
    if old.pruefstatus <> 'ungeprueft' then
      raise exception 'Der Pruefstatus eines entschiedenen Dokuments aendert sich nicht mehr (war: %).', old.pruefstatus
        using errcode = '23514';
    end if;
    if new.pruefstatus = 'freigegeben' and ist_upload then
      if new.geprueft_von is null or new.geprueft_am is null then
        raise exception 'Eine Freigabe braucht geprueft_von und geprueft_am.' using errcode = '23514';
      end if;
      if hochgeladen_von is null or new.geprueft_von::text = hochgeladen_von then
        raise exception 'Vier-Augen-Prinzip: Ein Dokument gibt nicht die Person frei, die es hochgeladen hat.'
          using errcode = '23514';
      end if;
    end if;
  elsif ist_upload and new.pruefen_bis is distinct from old.pruefen_bis then
    -- Verlaengerung der Wiedervorlage: nur freigegebene Dokumente, nur nach vorne, nur durch eine zweite Person.
    if new.pruefstatus <> 'freigegeben' or old.pruefen_bis is null or new.pruefen_bis is null or new.pruefen_bis <= old.pruefen_bis then
      raise exception 'Die Wiedervorlage laesst sich nur bei einem freigegebenen Dokument nach hinten verschieben.'
        using errcode = '23514';
    end if;
    if new.geprueft_von is null or hochgeladen_von is null or new.geprueft_von::text = hochgeladen_von then
      raise exception 'Vier-Augen-Prinzip: Ein Dokument verlaengert nicht die Person, die es hochgeladen hat.'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.wissen_pruefung_wache() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Liste der Verwaltung: zusätzlich die Textgrundlage (Gruppierungsspalte und Ausgabe)
-- ---------------------------------------------------------------------------
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
           z.upload_quelle, z.hochgeladen_von, z.hochgeladen_von_id, z.paket, z.pakete_gesamt, z.guete, z.guete_hinweise,
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
             c.extra ->> 'guete_hinweise' as guete_hinweise
      from public.wissen_chunks c
    ) z
    group by z.quelle_id, z.pfad, z.titel, z.bereich, z.rollen, z.eingelesen_am, z.autoritaetsstufe, z.quellenart, z.cluster, z.textgrundlage,
             z.pruefstatus, z.pruefen_bis, z.url, z.rechtsstelle,
             z.upload_quelle, z.hochgeladen_von, z.hochgeladen_von_id, z.paket, z.pakete_gesamt, z.guete, z.guete_hinweise
  ) g
$$;

revoke all on function public.wissen_liste() from public, anon, authenticated;
grant execute on function public.wissen_liste() to service_role;
