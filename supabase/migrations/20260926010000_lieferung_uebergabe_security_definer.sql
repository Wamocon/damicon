-- =============================================================================
-- Damicon - lieferung_uebergabe_pruefen() muss die Vorbestellung unabhaengig
-- von den Rechten des Aufrufers fortschreiben koennen (Fund aus dem
-- Integrationstest zu Anforderung 3.5)
-- =============================================================================
-- Die Funktion lief bisher ohne SECURITY DEFINER: das interne UPDATE auf
-- vorbestellungen wurde deshalb mit den Rechten des Aufrufers ausgefuehrt.
-- Brigade darf Lieferungen als zugestellt erfassen (lieferungen_update_feld),
-- hat aber keine UPDATE-Policy auf vorbestellungen - das Fortschreiben blieb
-- dadurch wirkungslos (0 betroffene Zeilen, RLS filtert eine nicht
-- aktualisierbare Zeile stillschweigend aus, ohne Fehler). Gleiches Prinzip
-- wie kuehlkette_bewerten(), das aus demselben Grund SECURITY DEFINER ist.
-- =============================================================================

set search_path = public;

create or replace function public.lieferung_uebergabe_pruefen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status in ('zugestellt', 'storniert') then
    raise exception 'Eine bereits zugestellte oder stornierte Lieferung ist unveraenderlich.'
      using errcode = '23514';
  end if;

  if new.status = 'zugestellt' then
    if new.empfaenger_name is null or btrim(new.empfaenger_name) = '' then
      raise exception 'Eine Uebergabequittung braucht den Namen der empfangenden Person.'
        using errcode = '23514';
    end if;
    new.server_eingang_zeitpunkt := now();
    new.geliefert_am := public.geraet_zeitpunkt_pruefen(new.geraet_zeitpunkt, new.server_eingang_zeitpunkt);

    if new.vorbestellung_id is not null then
      update public.vorbestellungen
         set status = 'geliefert'
       where id = new.vorbestellung_id
         and status <> 'storniert';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.lieferung_uebergabe_pruefen is
  'Anforderung 3.5: prueft und setzt geliefert_am beim Uebergang auf '
  'zugestellt, sperrt danach jede weitere Aenderung, schreibt den Status der '
  'verknuepften Vorbestellung fort. SECURITY DEFINER: das Fortschreiben von '
  'vorbestellungen darf nicht an den (fehlenden) Schreibrechten der Brigade '
  'auf dieser Tabelle scheitern.';
