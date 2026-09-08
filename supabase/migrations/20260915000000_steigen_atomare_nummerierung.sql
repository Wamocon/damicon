-- Anforderung 2.5, Phase 5: Steige erfassen offline-faehig machen.
--
-- Der bisherige Weg (steigeErfassen() in nachweiskette.ts) ermittelte die
-- Laufnummer per SELECT COUNT(*) und rechnete Code/QR-Token im Client -
-- nicht atomar: zwei fast gleichzeitige Erfassungen (zwei Geraete, oder eine
-- Offline-Warteschlange, die mehrere gepufferte Steigen kurz hintereinander
-- synchronisiert) koennten dieselbe Zaehlung lesen und denselben Code
-- vergeben, was am unique-Constraint auf steigen.code scheitern wuerde.
-- Bewusst NICHT Pilot in Phase 2 (siehe Umsetzungsplan) - erst jetzt geloest.
--
-- Loesung: ein Zaehler direkt an der Pflueckaufgabe
-- (pflueckaufgaben.steigen_zaehler), atomar erhoeht per
-- "UPDATE ... RETURNING" in einem BEFORE INSERT-Trigger auf steigen - der
-- Zeilenlock auf der Pflueckaufgabe waehrend des UPDATE serialisiert
-- konkurrierende Inserts automatisch, ganz ohne eigene Anwendungslogik.
-- Damit wird "Steige erfassen" strukturell zum reinen INSERT wie Kuehlmessung
-- und Arbeitszeit (Phase 2/3) - Code/QR-Token muss der Client gar nicht mehr
-- selbst berechnen, nur noch eine (fuer echte Erfassungen leere) Zeile
-- einfuegen.

alter table public.pflueckaufgaben
  add column steigen_zaehler integer not null default 0;

-- Bestehende Auftraege (Seed-Daten mit direkt vergebenen Demo-Codes wie
-- "STG-2026-000480") duerfen die Zaehlung nicht bei 0 neu beginnen lassen -
-- sonst wuerde die erste echte, neu erfasste Steige eines solchen Auftrags
-- wieder mit "-S001" beginnen, obwohl schon Steigen existieren. Einmaliger
-- Abgleich mit dem tatsaechlichen Bestand.
update public.pflueckaufgaben p
   set steigen_zaehler = (
     select count(*) from public.steigen s where s.pflueckaufgabe_id = p.id
   );

create or replace function public.steige_nummer_vergeben()
returns trigger
language plpgsql
as $$
declare
  v_code text;
  v_nummer integer;
begin
  -- Seed-Daten liefern bewusst gewaehlte Demo-Codes direkt mit - nur ein
  -- leerer Code loest die automatische, atomare Nummerierung aus. So bleibt
  -- die Vorlage fuer bestehende/kuenftige Seed-Zeilen unangetastet, waehrend
  -- jede echte, neu erfasste Steige (online wie ueber die Sync-Warteschlange)
  -- ihre Nummer garantiert kollisionsfrei bekommt.
  if new.code is not null and new.code <> '' then
    return new;
  end if;

  -- Ein BEFORE INSERT-Trigger feuert fuer JEDE Zeile, die Postgres einzufuegen
  -- versucht - auch fuer eine, die anschliessend per ON CONFLICT DO NOTHING
  -- verworfen wird (Sync-Retry mit bereits bekannter aktionId/Zeilen-id). Der
  -- Zaehler-Inkrement innerhalb des Triggers wird von diesem Verwerfen NICHT
  -- zurueckgenommen - ohne diese Pruefung wuerde jeder Retry stillschweigend
  -- eine Nummer verbrauchen, ohne dass je eine zweite Zeile entsteht (kein
  -- Duplikat, aber eine Luecke in der Zaehlung bei jeder verzoegerten
  -- Synchronisierung). Existiert die Zeilen-id schon, wird ON CONFLICT diesen
  -- Versuch ohnehin verwerfen - der genaue Inhalt von NEW spielt dann keine
  -- Rolle mehr, also einfach unveraendert durchreichen.
  if exists (select 1 from public.steigen where id = new.id) then
    return new;
  end if;

  select code into v_code from public.chargen where id = new.charge_id;
  if v_code is null then
    raise exception 'Steige ohne gueltige Charge kann keine Nummer erhalten.' using errcode = '23503';
  end if;

  update public.pflueckaufgaben
     set steigen_zaehler = steigen_zaehler + 1
   where id = new.pflueckaufgabe_id
  returning steigen_zaehler into v_nummer;

  if v_nummer is null then
    raise exception 'Steige ohne gueltige Pflueckaufgabe kann keine Nummer erhalten.' using errcode = '23503';
  end if;

  new.code := v_code || '-S' || lpad(v_nummer::text, 3, '0');
  new.qr_token := 'qr-' || lower(v_code) || '-' || v_nummer;
  return new;
end;
$$;

drop trigger if exists trg_steige_nummer on public.steigen;
create trigger trg_steige_nummer
  before insert on public.steigen
  for each row execute function public.steige_nummer_vergeben();
