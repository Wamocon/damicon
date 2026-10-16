-- =============================================================================
-- Damicon - Übersetzungen der Freitextspalten (16.10.2026)
-- =============================================================================
-- Die Oberfläche gibt es in Deutsch, Englisch, Russisch und Kasachisch. Texte, die in Zeilen stehen (Bezeichnungen, Notizen, Betreffs, Nachrichten), standen
-- bisher nur in der Sprache, in der sie erfasst wurden. Diese Migration legt die Grundlage dafür, dass dieselbe Zeile in jeder Sprache lesbar ist:
--
--   * Eine Spalte i18n (jsonb) an zwölf Tabellen. Sie hält die Übersetzungen der Freitextspalten der Zeile, je Spalte und Sprache:
--       {"bezeichnung": {"en": "...", "ru": "...", "kk": "..."}, "notiz": {...}}
--     Die Spalte mit dem Original bleibt die Quelle (die Sprache, in der die Zeile erfasst wurde, meist Deutsch). Fehlt eine Übersetzung, zeigt die Oberfläche
--     das Original, nie eine leere Stelle.
--   * Die Übersetzungen liegen in der Zeile selbst. So gilt für sie dieselbe Zeilensicherheit wie für das Original: wer die Zeile nicht lesen darf, liest auch
--     ihre Übersetzung nicht. Eine eigene Übersetzungstabelle hätte dieselbe Prüfung ein zweites Mal gebraucht.
--   * Ein Trigger entfernt die Übersetzung einer Spalte, sobald sich ihr Original ändert. Sonst stünde nach einer Änderung des deutschen Textes der alte Text
--     in den anderen Sprachen. Wer Original und Übersetzungen in derselben Anweisung setzt, verantwortet sie selbst (der Trigger greift dann nicht ein).
--
--   * Die Anonymisierung einer Nachricht (Datenschutz) entfernt auch ihre Übersetzungen. Sonst bliebe der Text einer anonymisierten Nachricht in den anderen
--     Sprachen stehen.
--
-- Keine Datenänderung: die Spalte ist überall leer. Die Testdaten bekommen ihre Übersetzungen in der nächsten Migration. Die Zeilensicherheit und die
-- Rechte der Tabellen bleiben unverändert (die Spalte fällt unter die Tabellenrechte).
-- =============================================================================

set search_path = public;

create or replace function public.i18n_veraltet_entfernen()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_feld text;
  v_neu  jsonb := to_jsonb(new);
  v_alt  jsonb := to_jsonb(old);
begin
  -- Wer die Übersetzungen in derselben Anweisung selbst setzt, hat sie auf den neuen Text abgestimmt.
  if new.i18n is distinct from old.i18n then
    return new;
  end if;
  foreach v_feld in array tg_argv loop
    if v_neu -> v_feld is distinct from v_alt -> v_feld then
      new.i18n := new.i18n - v_feld;
    end if;
  end loop;
  return new;
end;
$$;

comment on function public.i18n_veraltet_entfernen() is
  'Trigger: entfernt die Übersetzungen einer Spalte, wenn sich ihr Original ändert. Argumente: die Namen der übersetzbaren Spalten der Tabelle.';

-- ---------------------------------------------------------------------------
-- Die Spalte und ihr Schutz je Tabelle
-- ---------------------------------------------------------------------------
-- Zeilen, die nach dem Anlegen nicht mehr geändert werden dürfen (Buchungen, Verlauf, Nachrichten, Stände), bekommen die Spalte ohne den Trigger: dort ändert
-- sich kein Original.
alter table public.wirtschaftlichkeit_posten    add column i18n jsonb not null default '{}'::jsonb;
alter table public.wirtschaftlichkeit_ist       add column i18n jsonb not null default '{}'::jsonb;
alter table public.wirtschaftlichkeit_staende   add column i18n jsonb not null default '{}'::jsonb;
alter table public.finance_ledger_entries       add column i18n jsonb not null default '{}'::jsonb;
alter table public.reklamationen                add column i18n jsonb not null default '{}'::jsonb;
alter table public.reklamation_ereignisse       add column i18n jsonb not null default '{}'::jsonb;
alter table public.vorbestellung_nachrichten    add column i18n jsonb not null default '{}'::jsonb;
alter table public.preislisten                  add column i18n jsonb not null default '{}'::jsonb;
alter table public.dokumente                    add column i18n jsonb not null default '{}'::jsonb;
alter table public.abholrunden                  add column i18n jsonb not null default '{}'::jsonb;
alter table public.abholstopps                  add column i18n jsonb not null default '{}'::jsonb;
alter table public.esutd_ereignisse             add column i18n jsonb not null default '{}'::jsonb;
alter table public.esutd_vertraege              add column i18n jsonb not null default '{}'::jsonb;

-- Form und Größe: ein Objekt, höchstens 20 KB. Ohne Grenze könnte eine einzelne Zeile beliebig groß werden.
alter table public.wirtschaftlichkeit_posten    add constraint wirtschaftlichkeit_posten_i18n_check    check (jsonb_typeof(i18n) = 'object' and octet_length(i18n::text) <= 20000);
alter table public.wirtschaftlichkeit_ist       add constraint wirtschaftlichkeit_ist_i18n_check       check (jsonb_typeof(i18n) = 'object' and octet_length(i18n::text) <= 20000);
alter table public.wirtschaftlichkeit_staende   add constraint wirtschaftlichkeit_staende_i18n_check   check (jsonb_typeof(i18n) = 'object' and octet_length(i18n::text) <= 20000);
alter table public.finance_ledger_entries       add constraint finance_ledger_entries_i18n_check       check (jsonb_typeof(i18n) = 'object' and octet_length(i18n::text) <= 20000);
alter table public.reklamationen                add constraint reklamationen_i18n_check                check (jsonb_typeof(i18n) = 'object' and octet_length(i18n::text) <= 20000);
alter table public.reklamation_ereignisse       add constraint reklamation_ereignisse_i18n_check       check (jsonb_typeof(i18n) = 'object' and octet_length(i18n::text) <= 20000);
alter table public.vorbestellung_nachrichten    add constraint vorbestellung_nachrichten_i18n_check    check (jsonb_typeof(i18n) = 'object' and octet_length(i18n::text) <= 20000);
alter table public.preislisten                  add constraint preislisten_i18n_check                  check (jsonb_typeof(i18n) = 'object' and octet_length(i18n::text) <= 20000);
alter table public.dokumente                    add constraint dokumente_i18n_check                    check (jsonb_typeof(i18n) = 'object' and octet_length(i18n::text) <= 20000);
alter table public.abholrunden                  add constraint abholrunden_i18n_check                  check (jsonb_typeof(i18n) = 'object' and octet_length(i18n::text) <= 20000);
alter table public.abholstopps                  add constraint abholstopps_i18n_check                  check (jsonb_typeof(i18n) = 'object' and octet_length(i18n::text) <= 20000);
alter table public.esutd_ereignisse             add constraint esutd_ereignisse_i18n_check             check (jsonb_typeof(i18n) = 'object' and octet_length(i18n::text) <= 20000);
alter table public.esutd_vertraege              add constraint esutd_vertraege_i18n_check              check (jsonb_typeof(i18n) = 'object' and octet_length(i18n::text) <= 20000);

-- Veraltete Übersetzungen entfernen, wo sich das Original ändern lässt.
create trigger trg_i18n_veraltet before update on public.wirtschaftlichkeit_posten
  for each row execute function public.i18n_veraltet_entfernen('kategorie', 'bezeichnung', 'notiz');
create trigger trg_i18n_veraltet before update on public.wirtschaftlichkeit_ist
  for each row execute function public.i18n_veraltet_entfernen('notiz');
create trigger trg_i18n_veraltet before update on public.reklamationen
  for each row execute function public.i18n_veraltet_entfernen('betreff', 'beschreibung', 'loesung');
create trigger trg_i18n_veraltet before update on public.preislisten
  for each row execute function public.i18n_veraltet_entfernen('name');
create trigger trg_i18n_veraltet before update on public.dokumente
  for each row execute function public.i18n_veraltet_entfernen('name', 'bezug', 'rechtsgrundlage');
create trigger trg_i18n_veraltet before update on public.abholrunden
  for each row execute function public.i18n_veraltet_entfernen('fahrzeug', 'notiz');
create trigger trg_i18n_veraltet before update on public.abholstopps
  for each row execute function public.i18n_veraltet_entfernen('bemerkung');
create trigger trg_i18n_veraltet before update on public.esutd_ereignisse
  for each row execute function public.i18n_veraltet_entfernen('beschreibung', 'bestaetigung');
create trigger trg_i18n_veraltet before update on public.esutd_vertraege
  for each row execute function public.i18n_veraltet_entfernen('bestaetigung');

comment on column public.wirtschaftlichkeit_posten.i18n is 'Übersetzungen der Freitextspalten: {"spalte": {"en": "...", "ru": "...", "kk": "...", "de": "..."}}. Das Original steht in der Spalte selbst.';
comment on column public.finance_ledger_entries.i18n is 'Übersetzungen der Freitextspalten (kategorie, beschreibung), je Spalte und Sprache. Das Original steht in der Spalte selbst.';
comment on column public.reklamationen.i18n is 'Übersetzungen der Freitextspalten (betreff, beschreibung, loesung), je Spalte und Sprache. Das Original steht in der Spalte selbst.';
comment on column public.reklamation_ereignisse.i18n is 'Übersetzungen der Spalte text, je Sprache. Das Original steht in der Spalte selbst.';
comment on column public.vorbestellung_nachrichten.i18n is 'Übersetzungen der Spalte text, je Sprache. Das Original steht in der Spalte selbst (die Sprache der schreibenden Person).';
comment on column public.preislisten.i18n is 'Übersetzungen der Spalte name, je Sprache. Das Original steht in der Spalte selbst.';
comment on column public.dokumente.i18n is 'Übersetzungen der Freitextspalten (name, bezug, rechtsgrundlage), je Spalte und Sprache. Das Original steht in der Spalte selbst.';
comment on column public.abholrunden.i18n is 'Übersetzungen der Freitextspalten (fahrzeug, notiz), je Spalte und Sprache. Das Original steht in der Spalte selbst.';
comment on column public.abholstopps.i18n is 'Übersetzungen der Spalte bemerkung, je Sprache. Das Original steht in der Spalte selbst.';
comment on column public.esutd_ereignisse.i18n is 'Übersetzungen der Freitextspalten (beschreibung, bestaetigung), je Spalte und Sprache. Das Original steht in der Spalte selbst.';
comment on column public.esutd_vertraege.i18n is 'Übersetzungen der Spalte bestaetigung, je Sprache. Das Original steht in der Spalte selbst.';
comment on column public.wirtschaftlichkeit_ist.i18n is 'Übersetzungen der Spalte notiz, je Sprache. Das Original steht in der Spalte selbst.';
comment on column public.wirtschaftlichkeit_staende.i18n is 'Übersetzungen der Spalte bezeichnung, je Sprache. Das Original steht in der Spalte selbst.';

-- ---------------------------------------------------------------------------
-- Sicht des Nachweisregisters: die Übersetzungen kommen mit
-- ---------------------------------------------------------------------------
-- Dieselbe Sicht wie in 20261208120000_nachweis_versionen, am Ende eine Spalte mehr (i18n). security_invoker bleibt: die Zeilensicherheit von dokumente gilt.
create or replace view public.v_dokumente
with (security_invoker = true)
as
select
  d.id,
  d.name,
  d.kategorie,
  d.bezug,
  d.stand,
  d.status as status_manuell,
  d.storage_path,
  d.reihenblock_id,
  d.charge_id,
  d.foerderdossier_id,
  d.gueltig_von,
  d.gueltig_bis,
  d.unbefristet,
  d.warnung_tage,
  d.verantwortlich_id,
  d.rechtsgrundlage,
  d.b2b_kunde_id,
  d.nachbarbetrieb_id,
  public.nachweis_status(d.gueltig_von, d.gueltig_bis, d.unbefristet, d.warnung_tage, public.heute_almaty())
    as nachweis_status,
  case
    when d.unbefristet or d.gueltig_bis is null then null
    else d.gueltig_bis - public.heute_almaty()
  end as tage_bis_ablauf,
  d.created_at,
  d.updated_at,
  d.ersetzt_id,
  (select n.id from public.dokumente n where n.ersetzt_id = d.id) as ersetzt_durch_id,
  d.i18n
from public.dokumente d;

comment on view public.v_dokumente is
  'Nachweisregister (WMCNL-1469): dokumente mit automatisch berechnetem Ablaufstatus (nachweis_status: gueltig, laeuft_ab, abgelaufen, offen), den Tagen bis zum Ablauf und der Versionskette (ersetzt_id, ersetzt_durch_id), dazu die Übersetzungen der Freitexte (i18n). security_invoker: RLS von dokumente gilt unveraendert.';

-- ---------------------------------------------------------------------------
-- Sicht der ЕСУТД-Meldungen: die Übersetzungen kommen mit
-- ---------------------------------------------------------------------------
-- Dieselbe Sicht wie bisher (Abschluss aus esutd_vertraege, Änderung und Beendigung aus esutd_ereignisse), am Ende eine Spalte mehr (i18n). security_invoker
-- bleibt: die Zeilensicherheit der Tabellen gilt.
create or replace view public.v_esutd_meldungen
with (security_invoker = true)
as
select
  'vertrag'::text as quelle,
  v.id,
  v.pfluecker_id,
  p.name as pfluecker_name,
  p.ausweis as pfluecker_ausweis,
  'abschluss'::text as art,
  v.vertrag_beginn_am as ereignis_am,
  null::text as beschreibung,
  v.vertragsnummer,
  v.status::text as status,
  v.erfasst_am,
  v.bestaetigung,
  v.beleg_dokument_id,
  f.meldefrist_am,
  v.created_at,
  v.i18n
from public.esutd_vertraege v
join public.esutd_vertraege_mit_frist f on f.id = v.id
left join public.pfluecker p on p.id = v.pfluecker_id
union all
select
  'ereignis'::text as quelle,
  e.id,
  v.pfluecker_id,
  p.name as pfluecker_name,
  p.ausweis as pfluecker_ausweis,
  e.art,
  e.ereignis_am,
  e.beschreibung,
  v.vertragsnummer,
  e.status,
  e.erfasst_am,
  e.bestaetigung,
  e.beleg_dokument_id,
  case
    when e.status <> 'offen'::text then null::date
    when e.art = 'aenderung'::text and public.einstellung_zahl('esutd.frist_aenderung_tage'::text) is not null
      then e.ereignis_am + public.einstellung_zahl('esutd.frist_aenderung_tage'::text)::integer
    when e.art = 'beendigung'::text and public.einstellung_zahl('esutd.frist_beendigung_tage'::text) is not null
      then public.werktage_addieren(e.ereignis_am, public.einstellung_zahl('esutd.frist_beendigung_tage'::text)::integer)
    else null::date
  end as meldefrist_am,
  e.created_at,
  e.i18n
from public.esutd_ereignisse e
join public.esutd_vertraege v on v.id = e.vertrag_id
left join public.pfluecker p on p.id = v.pfluecker_id;

-- ---------------------------------------------------------------------------
-- Anonymisierung: Text und Übersetzungen
-- ---------------------------------------------------------------------------
-- Dieselbe Funktion wie in 20261208020000_rechte_und_schutz, mit einer Änderung: i18n wird mit dem Text geleert.
create or replace function public.vorbestellung_nachricht_anonymisieren(p_id uuid, p_grund text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profil uuid;
  v_grund  text := btrim(coalesce(p_grund, ''));
  v_zeilen integer;
begin
  -- coalesce: has_role() ist null, wenn die Person keine App-Rolle hat. "not null" wäre null und liesse die Prüfung durch.
  if not coalesce(public.has_role('admin'), false) then
    raise exception 'Nur die Administration oder die Geschaeftsfuehrung darf eine Nachricht anonymisieren.' using errcode = '42501';
  end if;
  if char_length(v_grund) < 3 or char_length(v_grund) > 300 then
    raise exception 'Der Grund fehlt oder ist zu lang (3 bis 300 Zeichen).' using errcode = '23514';
  end if;
  select id into v_profil from public.profiles where auth_user_id = auth.uid();

  perform set_config('damicon.nachricht_anonymisieren', 'ja', true);
  update public.vorbestellung_nachrichten
     set text = '[entfernt]',
         i18n = '{}'::jsonb,
         autor_name = '[entfernt]',
         autor_profil_id = null,
         anonymisiert_am = now(),
         anonymisiert_von = v_profil,
         anonymisiert_grund = v_grund
   where id = p_id and anonymisiert_am is null;
  -- Vor dem nächsten PERFORM lesen: PERFORM setzt FOUND selbst.
  get diagnostics v_zeilen = row_count;
  perform set_config('damicon.nachricht_anonymisieren', '', true);

  if v_zeilen = 0 then
    raise exception 'Nachricht nicht gefunden oder schon anonymisiert.' using errcode = 'DA018';
  end if;
end;
$$;

revoke all on function public.vorbestellung_nachricht_anonymisieren(uuid, text) from public, anon;
grant execute on function public.vorbestellung_nachricht_anonymisieren(uuid, text) to authenticated;

comment on function public.vorbestellung_nachricht_anonymisieren(uuid, text) is
  'Datenschutz: entfernt Text, Übersetzungen und Namen einer Nachricht, der Verlauf bleibt. Nur Administration und Geschaeftsfuehrung, mit Grund. Die Zeile bleibt danach unveraenderlich.';
