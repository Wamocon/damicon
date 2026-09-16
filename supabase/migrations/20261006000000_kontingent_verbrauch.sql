-- =============================================================================
-- Damicon - Automatischer Kontingent-Verbrauch (Masterplan-Anforderung 5.1)
-- =============================================================================
-- Die B2B-Portal-Migration (20260929000000) hatte den Kontingent-Verbrauch
-- bewusst offen gelassen: "wie reserviert_kg verbraucht/zurueckgesetzt wird,
-- ist keine technische, sondern eine betriebliche Entscheidung." Die
-- Entscheidung ist inzwischen gefallen: automatisch bei Bestaetigung, mit
-- Ruecknahme bei Storno.
--
-- Regel, dieselbe Fortschreiben-Philosophie wie aufgabe_fortschreiben()/
-- kuehlkette_bewerten()/lieferung_uebergabe_pruefen():
--   * angefragt -> bestaetigt: kontingente.reserviert_kg um die bestellte
--     Menge erhoehen. Erst hier ist die Anfrage wirklich verbindlich.
--   * bestaetigt -> storniert: reserviert_kg wieder um dieselbe Menge senken
--     (nicht unter 0, falls der Kontingent-Stand zwischenzeitlich von Hand
--     korrigiert wurde).
--   * angefragt -> storniert: keine Aenderung. Eine nie bestaetigte Anfrage
--     hat nie etwas verbraucht (siehe vorbestellungStornieren()).
--   * bestaetigt -> geliefert (lieferung_uebergabe_pruefen, Migration
--     20260926000000): keine Aenderung hier. Die Ware hat den Betrieb
--     verlassen, das Kontingent bleibt verbraucht - genau deshalb ist eine
--     bereits 'geliefert' fortgeschriebene Vorbestellung auch nicht mehr auf
--     'storniert' zuruecksetzbar (RLS, siehe vorbestellungen_update_buero).
--
-- Zuordnung Vorbestellung -> Kontingent ueber (b2b_kunde_id, sorte_id) - eine
-- Vorbestellung traegt keine eigene Saison. Existiert kein passendes
-- Kontingent (noch nicht angelegt, oder Kunde/Sorte ohne Kontingentpflicht),
-- bleibt der Verbrauch stumm aus: das Buero sieht die fehlende Zuordnung
-- ohnehin im Kontingent-Uebersichtsbildschirm und legt bei Bedarf eines an -
-- eine fehlende Zuordnung darf eine Bestaetigung nicht blockieren, dafuer
-- existiert der manuelle Bestaetigungsschritt selbst schon als Kontrolle.
-- Existieren mehrere Kontingente fuer denselben Kunden/Sorte (verschiedene
-- Saisons), zaehlt das zuletzt angelegte als das aktuelle.
-- =============================================================================

set search_path = public;

create or replace function public.vorbestellung_kontingent_abgleichen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kontingent_id uuid;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'bestaetigt' and old.status = 'angefragt' then
    select id into v_kontingent_id
      from public.kontingente
     where b2b_kunde_id = new.b2b_kunde_id
       and sorte_id = new.sorte_id
     order by created_at desc
     limit 1;

    if v_kontingent_id is not null then
      update public.kontingente
         set reserviert_kg = reserviert_kg + new.menge_kg
       where id = v_kontingent_id;
    end if;

  elsif new.status = 'storniert' and old.status = 'bestaetigt' then
    select id into v_kontingent_id
      from public.kontingente
     where b2b_kunde_id = new.b2b_kunde_id
       and sorte_id = new.sorte_id
     order by created_at desc
     limit 1;

    if v_kontingent_id is not null then
      update public.kontingente
         set reserviert_kg = greatest(0, reserviert_kg - new.menge_kg)
       where id = v_kontingent_id;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.vorbestellung_kontingent_abgleichen is
  'Anforderung 5.1: schreibt kontingente.reserviert_kg automatisch fort - '
  'erhoeht bei angefragt->bestaetigt, senkt bei bestaetigt->storniert.';

create trigger trg_vorbestellung_kontingent_abgleichen
  after update on public.vorbestellungen
  for each row execute function public.vorbestellung_kontingent_abgleichen();
