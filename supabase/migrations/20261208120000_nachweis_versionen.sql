-- =============================================================================
-- Damicon - Nachweisregister: mehrere Versionen je Nachweis (15.10.2026)
-- =============================================================================
-- Ein Zertifikat läuft ab und wird erneuert. Bisher gab es nur zwei Wege, beide schlecht: das alte Dokument überschreiben (die Geschichte ist weg) oder ein
-- neues anlegen (das alte bleibt als "abgelaufen" stehen und schlägt im Risiko-Radar weiter Alarm, obwohl der Nachweis längst gilt).
--
--   * dokumente.ersetzt_id verweist auf die Version, die dieses Dokument ersetzt. Die alte Version bleibt unverändert stehen (Datei, Zeitraum, Status).
--   * Eine Version hat höchstens einen Nachfolger (eindeutiger Index): die Versionen bilden eine Kette, keinen Baum.
--   * Die Verknüpfung entsteht nur beim Anlegen und ändert sich danach nicht (kein Kreis möglich). Wird die alte Version gelöscht, wird die Verknüpfung
--     leer (on delete set null), der Nachfolger bleibt.
--   * Die neue Version hat dieselbe Kategorie wie die ersetzte.
--   * v_dokumente nennt zusätzlich ersetzt_id und ersetzt_durch_id. Das Register und der Risiko-Radar zählen nur Dokumente ohne Nachfolger.
--
-- Keine Datenänderung. Bestehende Dokumente haben keine Verknüpfung und gelten als aktuell.
-- =============================================================================

set search_path = public;

alter table public.dokumente
  add column if not exists ersetzt_id uuid references public.dokumente(id) on delete set null;

alter table public.dokumente drop constraint if exists dokumente_ersetzt_nicht_selbst;
alter table public.dokumente
  add constraint dokumente_ersetzt_nicht_selbst check (ersetzt_id is null or ersetzt_id <> id);

create unique index if not exists dokumente_ersetzt_id_eindeutig on public.dokumente (ersetzt_id) where ersetzt_id is not null;

comment on column public.dokumente.ersetzt_id is
  'Die Version, die dieses Dokument ersetzt. Gesetzt nur beim Anlegen. Die ersetzte Version bleibt unverändert und zählt im Register nicht mehr als aktuell.';

-- security definer: Die Prüfung liest die Kategorie der Vorversion auch dort, wo die Zeilensicherheit sie der Person nicht zeigt. Sonst käme für eine Rolle ohne
-- Schreibrecht der Fehler dieser Regel (DA020) statt der Ablehnung durch die Zeilensicherheit (42501), weil der Trigger vor der Policy läuft.
create or replace function public.dokument_version_pruefen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kategorie public.dokument_kategorie;
begin
  if tg_op = 'UPDATE' then
    -- Auf null setzen darf die Datenbank selbst (on delete set null der Vorversion), auf einen anderen Wert niemand.
    if new.ersetzt_id is not null and new.ersetzt_id is distinct from old.ersetzt_id then
      raise exception 'Die Vorversion eines Nachweises aendert sich nach dem Anlegen nicht.' using errcode = 'DA020';
    end if;
    return new;
  end if;

  if new.ersetzt_id is not null then
    select kategorie into v_kategorie from public.dokumente where id = new.ersetzt_id;
    if v_kategorie is distinct from new.kategorie then
      raise exception 'Eine neue Version hat dieselbe Kategorie wie die ersetzte.' using errcode = 'DA020';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_dokument_version on public.dokumente;
create trigger trg_dokument_version
  before insert or update of ersetzt_id on public.dokumente
  for each row execute function public.dokument_version_pruefen();

-- ---------------------------------------------------------------------------
-- Die Sicht: zwei Spalten am Ende
-- ---------------------------------------------------------------------------
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
  (select n.id from public.dokumente n where n.ersetzt_id = d.id) as ersetzt_durch_id
from public.dokumente d;

comment on view public.v_dokumente is
  'Nachweisregister (WMCNL-1469): dokumente mit automatisch berechnetem Ablaufstatus (nachweis_status: gueltig, laeuft_ab, abgelaufen, offen), den Tagen bis zum Ablauf und der Versionskette (ersetzt_id, ersetzt_durch_id). security_invoker: RLS von dokumente gilt unveraendert.';
