-- =============================================================================
-- Damicon - Eine bereits zugewiesene Brigade laesst sich nicht stillschweigend
-- umbiegen (adversarischer Review-Fund zu Anforderung 2.11)
-- =============================================================================
-- rotationsplanBrigadeZuweisen() (src/lib/actions/rotationsplan.ts) grenzt
-- den Vorzustand jetzt selbst per WHERE-Klausel ein (nur status='geplant'
-- und brigade_id is null), das schuetzt aber ausschliesslich diesen einen
-- Anwendungscodepfad. Ein direkter API-Aufruf (oder ein kuenftiger, anderer
-- Schreibpfad) haette die Brigade eines bereits zugewiesenen Termins ohne
-- jede Pruefung auf eine andere umbiegen koennen - der eigene
-- Funktionskommentar versprach "einen noch offenen Termin", ohne dass die
-- Datenbank das erzwang. Analog zu anderen Absicherungen dieses Projekts
-- (z. B. behandlung_aendern_pruefen()) wird das jetzt als Trigger hart
-- erzwungen, nicht nur im Anwendungscode geprueft.
--
-- Bewusst NICHT blockiert: das Aufheben einer Zuweisung (brigade_id auf
-- null setzen) - das ist eine sichtbare, beabsichtigte Korrektur, kein
-- stillschweigendes Ueberschreiben.
-- =============================================================================

set search_path = public;

create or replace function public.rotationsplan_brigade_aendern_pruefen()
returns trigger
language plpgsql
as $$
begin
  if old.brigade_id is not null
     and new.brigade_id is not null
     and new.brigade_id is distinct from old.brigade_id then
    raise exception
      'Die Brigade eines bereits zugewiesenen Termins laesst sich nicht '
      'stillschweigend umbiegen - zuerst die Zuweisung aufheben (brigade_id '
      'auf leer setzen), dann neu zuweisen.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

comment on function public.rotationsplan_brigade_aendern_pruefen is
  'Anforderung 2.11: verhindert das stillschweigende Umbiegen einer bereits '
  'zugewiesenen Brigade (und damit auch verlorene Updates bei zwei fast '
  'gleichzeitigen Zuweisungsversuchen). Aufheben (auf null setzen) bleibt '
  'erlaubt.';

drop trigger if exists trg_rotationsplan_brigade_aendern on public.rotationsplan_eintraege;
create trigger trg_rotationsplan_brigade_aendern
  before update of brigade_id on public.rotationsplan_eintraege
  for each row execute function public.rotationsplan_brigade_aendern_pruefen();
