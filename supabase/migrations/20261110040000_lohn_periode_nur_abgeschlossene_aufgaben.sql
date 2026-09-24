-- =============================================================================
-- Lohnberechnung nur fuer abgeschlossene Pflueckaufgaben (WMCNL-2473)
-- =============================================================================
-- lohn_periode_berechnen() (zuletzt 20261109020000_lohn_ausschussquote_
-- korrektur.sql) summiert Steigen je Pflueckaufgabe fuer die Mengenkomponente
-- und den Qualitaetsfaktor, ohne den Status der Aufgabe zu pruefen. Eine
-- Aufgabe, die den Abschluss durch die Betriebsleitung (Freigeben +
-- Qualitaetsfaktor, siehe pflueckaufgabe_freigabe_pruefen()) nie durchlaufen
-- hat und weiterhin in Belegpruefung haengt, erscheint deshalb trotzdem mit
-- einem ausbezahlten Betrag in der gespeicherten Tabelle "Positionen je
-- Pflueckaufgabe", inklusive eines automatisch aus der Ausschussquote
-- berechneten Qualitaetsfaktors, den nie jemand bestaetigt hat.
--
-- Gefunden in Testfall [Buchhaltung]-E2E-Lohn und Deckungsbeitrag abrechnen
-- (WMCNL-2405), Testausfuehrung WMCNL-2467 am 23.09.2026. Direkte Folge von
-- WMCNL-2472 (die Aufgabe blieb dort an der Wartezeitsperre des Reihenblocks
-- haengen, siehe 20261110030000) - unabhaengig von dessen Ursache darf eine
-- nicht abgeschlossene Aufgabe aber ohnehin nie in die Lohnberechnung
-- einfliessen, das ist der eigentliche Befund dieser Migration.
--
-- Fix: die Steigen-Aggregation je Aufgabe (sp) wird nur noch fuer Aufgaben im
-- Status 'abgeschlossen' gebildet. Grundlohn aus Arbeitszeit (v_grundlohn,
-- unveraendert oben in der Funktion) ist davon nicht betroffen - Arbeitszeit
-- ist keine Ernte- oder Qualitaetsfreigabe und braucht keine Aufgaben-
-- Freigabe. Eine Aufgabe, die erst nach dieser Periodenberechnung
-- abgeschlossen wird, wird bei der naechsten Neuberechnung derselben
-- Entwurfs-Periode automatisch nachgezogen (bestehendes Entwurf/Freigabe-
-- Verhalten, siehe Migrationskopf von 20260908130000).
-- =============================================================================

set search_path = public;

create or replace function public.lohn_periode_berechnen(
  p_periode_start date,
  p_periode_ende  date
)
returns table (verarbeitet integer, uebersprungen integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_satz                 public.lohn_saetze;
  v_pfluecker            record;
  v_position             record;
  v_abrechnung_id        uuid;
  v_bestehender_status    public.lohn_status;
  -- FOUND wird von JEDER folgenden SELECT INTO ueberschrieben (etwa der
  -- Stunden-Aggregation gleich danach) - das Ergebnis der Bestandssuche muss
  -- deshalb sofort in eine eigene Variable gesichert werden, statt sich
  -- spaeter erneut auf FOUND zu verlassen.
  v_hat_bestehende        boolean;
  v_stunden               numeric;
  v_grundlohn             numeric;
  v_mengen_komponente     numeric;
  v_gesamt_kg             numeric;
  v_gesamt_ausschuss_kg   numeric;
  v_ausschussquote        numeric;
  v_qualitaetsfaktor      numeric;
  v_verarbeitet           integer := 0;
  v_uebersprungen         integer := 0;
begin
  if not public.has_role('admin', 'buchhaltung') then
    raise exception 'Nur Buchhaltung oder Admin berechnen eine Lohnperiode.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_periode_start is null or p_periode_ende is null then
    raise exception 'periode_start und periode_ende sind Pflichtfelder.'
      using errcode = 'not_null_violation';
  end if;

  if p_periode_ende < p_periode_start then
    raise exception 'periode_ende muss auf oder nach periode_start liegen.'
      using errcode = 'check_violation';
  end if;

  select * into v_satz
    from public.lohn_saetze
   where gueltig_ab <= p_periode_start
     and (gueltig_bis is null or gueltig_bis > p_periode_start)
   order by gueltig_ab desc
   limit 1;

  if not found then
    raise exception 'Fuer den Zeitraum ab % ist kein Lohnsatz hinterlegt.', p_periode_start
      using errcode = 'no_data_found';
  end if;

  -- Jeder Pfluecker mit Arbeitszeit ODER Steigen in der Periode - wer in
  -- keiner der beiden Quellen vorkommt, bekommt keine Abrechnung (kein
  -- Nulllohn-Datensatz fuer jemanden, der in der Periode gar nicht erfasst
  -- wurde).
  for v_pfluecker in
    select p.id
      from public.pfluecker p
     where exists (
             select 1 from public.arbeitszeiten a
              where a.pfluecker_id = p.id
                and a.minuten is not null
                and a.beginn::date between p_periode_start and p_periode_ende
           )
        or exists (
             select 1 from public.steigen s
              where s.pfluecker_id = p.id
                and s.pflueckaufgabe_id is not null
                and s.gewicht_kg is not null
                and s.scan_zeitpunkt::date between p_periode_start and p_periode_ende
           )
     order by p.name
  loop
    -- Eine bereits freigegebene oder ausgezahlte Abrechnung ist ein
    -- abgenommener Wert - ein neuer Rechenlauf ueberschreibt sie nicht
    -- stillschweigend, sondern laesst die Person aus und zaehlt sie separat.
    select id, status into v_abrechnung_id, v_bestehender_status
      from public.lohn_abrechnungen
     where pfluecker_id = v_pfluecker.id
       and periode_start = p_periode_start
       and periode_ende = p_periode_ende;
    v_hat_bestehende := found;

    if v_hat_bestehende and v_bestehender_status <> 'entwurf' then
      raise notice 'Pfluecker % uebersprungen: Abrechnung fuer % bis % ist bereits %.',
        v_pfluecker.id, p_periode_start, p_periode_ende, v_bestehender_status;
      v_uebersprungen := v_uebersprungen + 1;
      continue;
    end if;

    -- Grundlohn aus Arbeitszeit. Zeiten ohne Aufgabenbezug (pflueckaufgabe_id
    -- ist nullable) zaehlen bewusst mit - sie tragen nur nicht zur
    -- Mengenkomponente bei, siehe unten.
    select coalesce(sum(minuten), 0) / 60.0 into v_stunden
      from public.arbeitszeiten
     where pfluecker_id = v_pfluecker.id
       and minuten is not null
       and beginn::date between p_periode_start and p_periode_ende;

    v_grundlohn := round(v_stunden * v_satz.stundenlohn_tenge, 2);

    if v_hat_bestehende then
      update public.lohn_abrechnungen
         set grundlohn_tenge = v_grundlohn,
             stunden = v_stunden,
             status = 'entwurf'
       where id = v_abrechnung_id;
      -- Positionen werden neu geschrieben (Delete+Insert je Periode, gleiches
      -- Muster wie im Vorbild calculate_payroll()).
      delete from public.lohn_positionen where lohn_abrechnung_id = v_abrechnung_id;
    else
      insert into public.lohn_abrechnungen (
        pfluecker_id, periode_start, periode_ende, grundlohn_tenge, stunden, status
      ) values (
        v_pfluecker.id, p_periode_start, p_periode_ende, v_grundlohn, v_stunden, 'entwurf'
      )
      returning id into v_abrechnung_id;
    end if;

    -- Mengenkomponente je Pflueckaufgabe: der Ausschuss liegt nur je Aufgabe
    -- vor, nicht je Person - er wird ueber den kg-Anteil dieser Person an den
    -- Steigen der Aufgabe umgelegt (gleiches Muster wie kpi_aktuell() fuer
    -- die Pflueckleistung je Person). Zaehler UND Nenner kommen bewusst aus
    -- derselben, periodengefilterten Steigen-Menge, damit der Anteil in sich
    -- konsistent bleibt; bei einer Aufgabe, die ueber zwei Abrechnungsperioden
    -- laeuft, ist das eine bewusste Vereinfachung (siehe Migrationskopf).
    v_mengen_komponente := 0;
    v_gesamt_kg := 0;
    v_gesamt_ausschuss_kg := 0;

    for v_position in
      select sp.pflueckaufgabe_id,
             sp.kg,
             pa.ausschuss_kg,
             case when ag.kg_gesamt > 0
                  then pa.ausschuss_kg * sp.kg / ag.kg_gesamt
                  else 0 end as anteiliger_ausschuss_kg
        from (
              select pflueckaufgabe_id, sum(gewicht_kg) as kg
                from public.steigen
               where pfluecker_id = v_pfluecker.id
                 and pflueckaufgabe_id is not null
                 and gewicht_kg is not null
                 and scan_zeitpunkt::date between p_periode_start and p_periode_ende
               group by pflueckaufgabe_id
             ) sp
        join public.pflueckaufgaben pa on pa.id = sp.pflueckaufgabe_id
        join (
              -- Gesamtmenge der Aufgabe in der Periode ueber ALLE Pfluecker
              -- (nicht nur die mit bekannter pfluecker_id) - der Anteil
              -- dieser Person soll gegen die tatsaechliche Gesamternte der
              -- Aufgabe gerechnet werden, nicht nur gegen den zugeordneten Teil.
              select pflueckaufgabe_id, sum(gewicht_kg) as kg_gesamt
                from public.steigen
               where pflueckaufgabe_id is not null
                 and gewicht_kg is not null
                 and scan_zeitpunkt::date between p_periode_start and p_periode_ende
               group by pflueckaufgabe_id
             ) ag on ag.pflueckaufgabe_id = sp.pflueckaufgabe_id
       -- WMCNL-2473: nur Aufgaben, die die Betriebsleitung tatsaechlich
       -- abgeschlossen hat (Freigeben + Qualitaetsfaktor). Eine Aufgabe in
       -- Belegpruefung (oder jedem fruaeheren Status) hat die
       -- Qualitaetsfreigabe nie durchlaufen und darf nicht bezahlt werden,
       -- unabhaengig davon, warum sie dort haengt.
       where pa.status = 'abgeschlossen'
    loop
      -- WMCNL-2381: Nenner ist die Menge allein (Ausschuss ist eine separate
      -- Messgroesse, keine bereits in kg enthaltene Teilmenge), gedeckelt auf
      -- 100 wegen des Check-Constraints auf lohn_abrechnungen.ausschussquote.
      v_ausschussquote := case
        when v_position.kg > 0
        then least(100.0, round(100.0 * v_position.anteiliger_ausschuss_kg
                   / v_position.kg, 2))
        else null
      end;
      v_qualitaetsfaktor := public.lohn_qualitaetsfaktor(
        v_ausschussquote, v_satz.qualitaets_ziel_ausschussquote,
        v_satz.qualitaetsfaktor_min, v_satz.qualitaetsfaktor_max
      );

      insert into public.lohn_positionen (
        lohn_abrechnung_id, pflueckaufgabe_id, menge_kg, qualitaetsfaktor,
        ausschuss_anteilig_kg, betrag_tenge
      ) values (
        v_abrechnung_id, v_position.pflueckaufgabe_id, v_position.kg, v_qualitaetsfaktor,
        round(v_position.anteiliger_ausschuss_kg, 2),
        round(v_satz.kg_satz_tenge * v_position.kg * v_qualitaetsfaktor, 2)
      );

      v_mengen_komponente := v_mengen_komponente
        + round(v_satz.kg_satz_tenge * v_position.kg * v_qualitaetsfaktor, 2);
      v_gesamt_kg := v_gesamt_kg + v_position.kg;
      v_gesamt_ausschuss_kg := v_gesamt_ausschuss_kg + v_position.anteiliger_ausschuss_kg;
    end loop;

    -- Gesamt-Qualitaetsfaktor der Abrechnung: aus der ueber die gesamte
    -- Periode gewichteten Ausschussquote dieser Person, nicht aus dem Mittel
    -- der Einzelfaktoren - sonst zaehlte eine kleine Aufgabe genauso stark
    -- wie eine grosse.
    v_ausschussquote := case
      when v_gesamt_kg > 0
      then least(100.0, round(100.0 * v_gesamt_ausschuss_kg / v_gesamt_kg, 2))
      else null
    end;
    v_qualitaetsfaktor := public.lohn_qualitaetsfaktor(
      v_ausschussquote, v_satz.qualitaets_ziel_ausschussquote,
      v_satz.qualitaetsfaktor_min, v_satz.qualitaetsfaktor_max
    );

    update public.lohn_abrechnungen
       set mengen_komponente_tenge = v_mengen_komponente,
           menge_kg = v_gesamt_kg,
           ausschussquote = v_ausschussquote,
           qualitaetsfaktor = v_qualitaetsfaktor,
           gesamt_tenge = v_grundlohn + v_mengen_komponente
     where id = v_abrechnung_id;

    v_verarbeitet := v_verarbeitet + 1;
  end loop;

  return query select v_verarbeitet, v_uebersprungen;
end;
$$;
comment on function public.lohn_periode_berechnen is
  'Berechnet Grundlohn, Mengenkomponente und Qualitaetsfaktor je Pfluecker fuer eine Periode und schreibt lohn_abrechnungen/lohn_positionen. Bereits freigegebene/ausgezahlte Abrechnungen werden uebersprungen, nie ueberschrieben. Ausschussquote = Ausschuss / Menge (WMCNL-2381). Nur Pflueckaufgaben im Status abgeschlossen fliessen in die Mengenkomponente ein (WMCNL-2473, korrigiert aus: jeder Status floss ein, auch ohne Qualitaetsfreigabe durch die Betriebsleitung).';
