-- =============================================================================
-- Damicon - lieferung_uebergabe_pruefen() prueft die Zugehoerigkeit der
-- Vorbestellung zum Kunden der Lieferung (adversarischer Review-Fund zu
-- Anforderung 3.5)
-- =============================================================================
-- lieferungen_update_feld erlaubt admin/betriebsleitung/brigade das Aendern
-- JEDER Spalte einer JEDEN Lieferung, ohne Kundeneinschraenkung - das ist so
-- beabsichtigt (interne Erfassung, kein Self-Service). Der SECURITY DEFINER-
-- Trigger schrieb bisher aber jede uebergebene vorbestellung_id blind auf
-- "geliefert" fort, ohne zu pruefen, ob diese Vorbestellung ueberhaupt zur
-- b2b_kunde_id derselben Lieferung gehoert. Ein direkter API-Aufruf (nicht
-- ueber die ausgelieferte Oberflaeche, die vorbestellung_id nirgends setzt)
-- haette so die Vorbestellung eines VOELLIG ANDEREN Kunden faelschlich als
-- geliefert markieren koennen. Analog zur Absicherung an anderen Stellen
-- dieses Projekts (z. B. current_b2b_kunde_id() bei Reklamationen) wird die
-- Zugehoerigkeit jetzt hart erzwungen, nicht nur stillschweigend erwartet.
-- =============================================================================

set search_path = public;

create or replace function public.lieferung_uebergabe_pruefen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vorbestellung_kunde uuid;
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
      select b2b_kunde_id into v_vorbestellung_kunde
        from public.vorbestellungen
       where id = new.vorbestellung_id;

      if v_vorbestellung_kunde is distinct from new.b2b_kunde_id then
        raise exception 'Die verknuepfte Vorbestellung gehoert zu einem anderen Kunden als die Lieferung.'
          using errcode = '23514';
      end if;

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
  'verknuepften Vorbestellung fort - nur wenn deren b2b_kunde_id zur '
  'Lieferung passt. SECURITY DEFINER: das Fortschreiben von vorbestellungen '
  'darf nicht an den (fehlenden) Schreibrechten der Brigade auf dieser '
  'Tabelle scheitern, braucht dafuer aber die eigene Zugehoerigkeitspruefung.';
