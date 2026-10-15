-- =============================================================================
-- Wissensbasis: ein Dokument kann in mehreren Bereichen gelten (weitere_bereiche)
-- =============================================================================
-- Anlass (15.10.2026): Der KI-Assistent sagte, die Wissensbasis habe keine Quellen zum Bereich Risiko, und empfahl, ISO 31000 hochzuladen. Der
-- Bereich "risiko" war leer, weil jedes Dokument genau EINEN Bereich hat. ISO 31000, COSO ERM und das Positionspapier Interne Revision und
-- Risikomanagement standen aber da, unter audit und legal. Ein Dokument, das für mehrere Bereiche gilt, soll in jedem davon erscheinen.
--
-- Änderungen:
--   1. wissen_chunks.weitere_bereiche (text[], Standard leer): die Bereiche, in denen das Dokument ZUSÄTZLICH zu seinem Hauptbereich (bereich)
--      gilt. Erlaubt sind die fünf Werte des Uploads (legal, steuer, compliance, audit, risiko), nie der Hauptbereich selbst. Der Hauptbereich
--      bleibt, was er war: Er bestimmt weiter, wofür die Quelle taugt (nutzungFuer), und die Suche filtert nicht danach.
--   2. wissen_pruefung_wache: Eine Änderung der weiteren Bereiche eines FREIGEGEBENEN Uploads zählt wie eine Änderung des Bereichs und verlangt
--      eine andere Person als die hochladende (Vier-Augen-Prinzip). Sonst unverändert gegenüber 20261129000000.
--   3. wissen_liste(): liefert zusätzlich weitere_bereiche (Gruppierungsspalte und Ausgabe), sonst unverändert gegenüber 20261206000000.
--   4. DATENÄNDERUNG: Die folgenden 13 Dokumente des Bestands (65 Abschnitte, alle freigegeben, alle ohne Upload) gelten zusätzlich im Bereich
--      risiko. Die Auswahl: Titel, die Risikomanagement oder Risikoanalyse zum Thema haben, und die Rahmenwerke ISO 31000 und COSO.
--   Bankengesetz Nr. 258-VIII und Risikomanagementanforderungen (2 Abschnitte)
--   Vergleich COSO ERM und ISO 31000 (1 Abschnitt)
--   ISO 31000: Grundsätze, Rahmen und Prozess (2 Abschnitte)
--   ISO 31000:2018 (1 Abschnitt)
--   COSO Enterprise Risk Management - Integrating (2 Abschnitte)
--   COSO Enterprise Risk Management Framework: Grundlagen (2 Abschnitte)
--   COSO Internal Control - Integrated Framework (2 Abschnitte)
--   KPMG Kaukasus/Zentralasien: KI-gestuetztes Risikomanagement (1 Abschnitt)
--   Positionspapier Interne Revision und Risikomanagement (36 Abschnitte)
--   KGD: Anwendungsbereiche des Risikomanagementsystems (12 Abschnitte)
--   Dokumentiertes Umgehungsrisiko (1 Abschnitt)
--   Interne Korruptionsrisikoanalyse nach Art. 8 (2 Abschnitte)
--   Tax-Compliance-Managementsystem als Referenzmodell (1 Abschnitt)
--      Idempotent (ein zweiter Lauf ändert nichts), nur diese Kennungen, nur Zeilen ohne den Eintrag. In einer Datenbank ohne diese Dokumente
--      (zum Beispiel lokal) ändert sie keine Zeile.
-- Der Dateiname endet auf _pgvector.sql: wissen_chunks gibt es in PGlite nicht, die schnellen Tests überspringen ihn.
-- =============================================================================

set search_path = public;

alter table public.wissen_chunks add column if not exists weitere_bereiche text[] not null default '{}';

alter table public.wissen_chunks drop constraint if exists wissen_chunks_weitere_bereiche_check;
alter table public.wissen_chunks
  add constraint wissen_chunks_weitere_bereiche_check
  check (
    weitere_bereiche <@ array['legal', 'steuer', 'compliance', 'audit', 'risiko']::text[]
    and not (bereich = any (weitere_bereiche))
  );

comment on column public.wissen_chunks.weitere_bereiche is
  'Bereiche, in denen das Dokument zusätzlich zu bereich gilt (legal, steuer, compliance, audit, risiko). Wirkt auf Liste, Filter und Zählung, nicht auf die Suche und nicht auf die Nutzung (die folgt dem Hauptbereich).';

-- ---------------------------------------------------------------------------
-- Wächter: weitere Bereiche zählen zur wirksamen Einordnung
-- ---------------------------------------------------------------------------
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
          or new.weitere_bereiche is distinct from old.weitere_bereiche
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
-- Liste der Verwaltung: zusätzlich die weiteren Bereiche
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
           z.quelle_id, z.pfad, z.titel, z.bereich, z.weitere_bereiche, z.rollen, z.eingelesen_am, z.autoritaetsstufe, z.quellenart, z.cluster, z.textgrundlage,
           z.pruefstatus, z.pruefen_bis, z.url, z.rechtsstelle,
           z.upload_quelle, z.hochgeladen_von, z.hochgeladen_von_id, z.paket, z.pakete_gesamt, z.guete, z.guete_hinweise, z.guete_prozent, z.original_groesse,
           z.seiten_fehlend, z.seiten_stellen, z.seiten_vermerk, z.seiten_bestaetigt, z.seiten_vermerkt, z.seiten_nachgeladen,
           count(*)::int as anzahl
    from (
      select c.id, c.quelle_id, c.pfad, c.titel, c.bereich, c.weitere_bereiche, c.rollen, c.eingelesen_am, c.autoritaetsstufe, c.quellenart, c.cluster, c.textgrundlage,
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
             v.vermerk as seiten_vermerk,
             v.bestaetigte_seiten as seiten_bestaetigt,
             (v.quelle_id is not null) as seiten_vermerkt,
             n.seiten as seiten_nachgeladen
      from public.wissen_chunks c
      left join public.wissen_qualitaet q on q.quelle_id = c.quelle_id
      left join public.wissen_original o on o.quelle_id = c.quelle_id
      left join public.wissen_seiten_vermerk v on v.quelle_id = c.quelle_id
      left join (
        select t.quelle_id, string_agg(t.seiten, ', ' order by t.nr) as seiten
          from public.wissen_seiten_nachtrag t
         group by t.quelle_id
      ) n on n.quelle_id = c.quelle_id
    ) z
    group by z.quelle_id, z.pfad, z.titel, z.bereich, z.weitere_bereiche, z.rollen, z.eingelesen_am, z.autoritaetsstufe, z.quellenart, z.cluster, z.textgrundlage,
             z.pruefstatus, z.pruefen_bis, z.url, z.rechtsstelle,
             z.upload_quelle, z.hochgeladen_von, z.hochgeladen_von_id, z.paket, z.pakete_gesamt, z.guete, z.guete_hinweise, z.guete_prozent, z.original_groesse,
             z.seiten_fehlend, z.seiten_stellen, z.seiten_vermerk, z.seiten_bestaetigt, z.seiten_vermerkt, z.seiten_nachgeladen
  ) g
$$;

revoke all on function public.wissen_liste() from public, anon, authenticated;
grant execute on function public.wissen_liste() to service_role;

-- ---------------------------------------------------------------------------
-- Datenänderung: Risiko-Dokumente des Bestands zusätzlich dem Bereich risiko zuordnen
-- ---------------------------------------------------------------------------
update public.wissen_chunks
   set weitere_bereiche = array_append(weitere_bereiche, 'risiko')
 where quelle_id in (
    'audit/Audit/damicon-audit-kb-kasachstan/quellen/bankengesetz-risikomanagement.md',
    'audit/Audit/damicon-audit-kb-grundlagen/quellen/techtarget-coso-iso31000-vergleich.md',
    'legal/Legal/WAMOCON_Legal_Grundlagenwissen_laenderunabhaengig/legal-grundlagen/legal-funktion-und-grc/iso-31000-risikomanagement-grundsaetze.md',
    'audit/Audit/damicon-audit-kb-grundlagen/quellen/iso-31000-2018-risikomanagement.md',
    'audit/Audit/damicon-audit-kb-grundlagen/quellen/coso-erm-framework-2017.md',
    'legal/Legal/WAMOCON_Legal_Grundlagenwissen_laenderunabhaengig/legal-grundlagen/legal-funktion-und-grc/coso-erm-framework-risikomanagement.md',
    'audit/Audit/damicon-audit-kb-grundlagen/quellen/coso-internal-control-framework-2013.md',
    'audit/Audit/damicon-audit-kb-kasachstan/quellen/kpmg-kaukasus-ki-risikomanagement.md',
    'audit/Audit/01-interne-revision-und-oeffentlicher-sektor/D2-028_Interne_Revision_und_Risikomanagement_Empfehlungen_zum_Zusammenwirken_Positionsp.md',
    'kgd-sur-anwendungsbereiche-offiziell',
    'audit/Audit/damicon-audit-kb-kasachstan/quellen/umgehungsrisiko-beteiligungserwerb-greenasia.md',
    'audit/Audit/damicon-audit-kb-kasachstan/quellen/korruptionsrisikoanalyse-erlass12.md',
    'audit/Audit/damicon-audit-kb-grundlagen/quellen/deloitte-tax-cms-deutschland.md'
  )
   and bereich <> 'risiko'
   and not ('risiko' = any (weitere_bereiche));

notify pgrst, 'reload schema';
