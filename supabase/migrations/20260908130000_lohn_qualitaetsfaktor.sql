-- =============================================================================
-- Damicon - Lohnabrechnung mit Qualitaetsfaktor (WMCNL-1444)
-- =============================================================================
-- lohn_abrechnungen/lohn_positionen bestehen bereits seit der Initialmigration
-- (inklusive Qualitaetsfaktor-Spalten), aber ohne jede Rechengrundlage: keine
-- Satztabelle, keine Berechnungsfunktion, keine Schreibrechte (nur eine
-- SELECT-Policy fuer Buero-Rollen) und im Seed hartkodierte Betraege. Diese
-- Migration schliesst das.
--
-- Vorbild ist das Schwesterprojekt Digitalisierung-Himbeerenbetrieb
-- (payroll_rates/calculate_payroll()/quality_factor()), uebersetzt auf Damicons
-- Datenmodell und mit zwei Anpassungen, die sich aus dem tatsaechlichen
-- Datenschnitt hier ergeben:
--
--   1. GRANULARITAET DES AUSSCHUSSES. Ausschuss liegt in Damicon nur je
--      Pflueckaufgabe vor (Brigade-Ebene, siehe pflueckaufgaben.ausschuss_kg
--      aus 20260905200000_kette_haerten.sql), nicht je Steige oder Person. Die
--      Zurechnung auf einen einzelnen Pfluecker ist deshalb zwingend eine
--      Naeherung ueber den kg-Anteil dieser Person an der jeweiligen Aufgabe
--      (dasselbe Umlage-Muster wie public.kpi_aktuell() fuer die
--      Pflueckleistung je Person). Das ist keine gemessene Einzelquote,
--      sondern eine anteilige Zuschreibung - das Dashboard sagt das offen.
--
--   2. VERHAELTNIS ZU pflueckaufgaben.qualitaetsfaktor. Dieses Feld bleibt
--      unangetastet: es ist eine manuelle, subjektive Einschaetzung der
--      Betriebsleitung je Aufgabe bei der Belegpruefung, geschuetzt durch
--      pflueckaufgabe_freigabe_pruefen() (nur Leitung, gesperrt nach
--      Abschluss). Der hier neu berechnete Lohn-Qualitaetsfaktor ist ein
--      eigener, objektiv aus der gemessenen Ausschussquote abgeleiteter Wert
--      fuer GENAU DIESEN Zweck (Lohnberechnung) - beide Werte beantworten
--      unterschiedliche Fragen und bestehen bewusst nebeneinander, keiner
--      ersetzt den anderen.
--
-- Bewusst NICHT uebernommen: die Mindestlohn-Anhebung des Vorbilds
-- (minimum_topup_kzt, gebunden an eine dort hinterlegte gesetzliche Rate).
-- Damicon hat keine Tabelle fuer gesetzliche Saetze und keine bestaetigte Zahl
-- fuer diesen Betrieb - ein erfundener Mindestlohn waere schlimmer als eine
-- offene Frage. Bleibt als Folgearbeit dokumentiert, bis eine belastbare Zahl
-- vorliegt.
--
-- Ebenfalls bewusst NICHT uebernommen: eine eigene payroll_periods-Tabelle.
-- Der Status haengt in Damicon direkt an jeder lohn_abrechnungen-Zeile (Spalte
-- status vom Typ lohn_status), nicht an einem gemeinsamen Periodenobjekt. Ein
-- Berechnungslauf ueber viele Personen kann deshalb inkonsistent aussehen,
-- wenn einzelne bereits freigegeben/ausgezahlt sind und andere noch nicht -
-- das ist gewollt (siehe Punkt 3 unten), nicht uebersehen.
--
-- Enthalten:
--   1. public.lohn_saetze - historisierte Lohnsaetze (gueltig_ab/gueltig_bis
--      wie kostentraeger/preislisten), inklusive Qualitaetsfaktor-Korridor.
--   2. public.lohn_qualitaetsfaktor() - Ausschussquote -> Faktor, linear und
--      symmetrisch um den Zielwert (Begruendung an der Funktion).
--   3. public.lohn_periode_berechnen() - RPC fuer Buchhaltung/Admin: rechnet
--      Grundlohn (Arbeitszeit), Mengenkomponente (Steigen x Qualitaetsfaktor)
--      je Pfluecker und schreibt lohn_abrechnungen/lohn_positionen. Eine
--      bereits freigegebene oder ausgezahlte Abrechnung wird nie
--      stillschweigend ueberschrieben, sondern uebersprungen (RAISE NOTICE).
--   4. Drei neue Transparenz-Spalten an lohn_abrechnungen (stunden, menge_kg,
--      ausschussquote) und eine an lohn_positionen (ausschuss_anteilig_kg) -
--      "ein Lohnzettel, der nur eine Summe nennt, ist nicht nachvollziehbar"
--      (Formulierung aus dem Vorbild, hier ebenso zutreffend).
--   5. lohn_abrechnung_freigabe_pruefen() - analog
--      pflueckaufgabe_freigabe_pruefen(): keine Ruecknahme von 'ausgezahlt',
--      keine stille Aenderung der Betraege nach Freigabe.
--   6. Schreib-Policies fuer lohn_saetze/lohn_abrechnungen/lohn_positionen,
--      beschraenkt auf admin/buchhaltung (rbac.ts: betriebsleitung hat nur
--      view('lohn'), buchhaltung crud('lohn')+lohn:approve).
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. Lohnsaetze - historisiert wie kostentraeger/preislisten
-- ---------------------------------------------------------------------------
create table public.lohn_saetze (
  id                             uuid primary key default gen_random_uuid(),
  gueltig_ab                     date not null default current_date,
  gueltig_bis                    date,
  stundenlohn_tenge              numeric(12,2) not null check (stundenlohn_tenge >= 0),
  kg_satz_tenge                  numeric(10,2) not null check (kg_satz_tenge >= 0),
  -- Ausschussquote in Prozent, bei der der Qualitaetsfaktor genau 1.00
  -- ergibt. Muss echt zwischen 0 und 100 liegen, sonst waere die
  -- Divisionsgrundlage der Funktion unten selbst 0 (siehe deren Kommentar).
  qualitaets_ziel_ausschussquote numeric(5,2) not null default 5.00
    check (qualitaets_ziel_ausschussquote > 0 and qualitaets_ziel_ausschussquote < 100),
  qualitaetsfaktor_min           numeric(4,2) not null default 0.90 check (qualitaetsfaktor_min > 0),
  qualitaetsfaktor_max           numeric(4,2) not null default 1.10 check (qualitaetsfaktor_max > 0),
  notiz                          text,
  created_at                     timestamptz not null default now(),
  updated_at                     timestamptz not null default now(),
  constraint lohn_saetze_zeitraum check (gueltig_bis is null or gueltig_bis > gueltig_ab),
  -- Der Korridor muss 1.00 (= "wie Ziel getroffen") tatsaechlich einschliessen,
  -- sonst waere selbst eine exakt getroffene Zielquote nicht neutral bewertbar.
  constraint lohn_saetze_korridor check (qualitaetsfaktor_min <= 1.0 and qualitaetsfaktor_max >= 1.0)
);
comment on table public.lohn_saetze is
  'Lohnsaetze fuer die Qualitaetsfaktor-Berechnung, historisiert wie kostentraeger/preislisten. Ohne diese Tabelle waren lohn_abrechnungen-Betraege bisher hartkodierte Seed-Werte ohne jede Rechengrundlage.';
comment on column public.lohn_saetze.qualitaets_ziel_ausschussquote is
  'Ausschussquote in Prozent, bei der der Qualitaetsfaktor 1.00 ergibt - darunter Bonus Richtung qualitaetsfaktor_max, darueber Abschlag Richtung qualitaetsfaktor_min.';

-- Eindeutige Historie: zwei Saetze mit identischem Gueltigkeitsbeginn waeren
-- eine nicht aufloesbare Mehrdeutigkeit bei der Suche "welcher Satz gilt".
create unique index idx_lohn_saetze_gueltig_ab on public.lohn_saetze(gueltig_ab);
create index idx_lohn_saetze_lookup on public.lohn_saetze(gueltig_ab desc);

create trigger trg_lohn_saetze_updated before update on public.lohn_saetze
  for each row execute function public.set_updated_at();

-- Ein neuer Satz schliesst automatisch die vorherige offene Gueltigkeit ab -
-- dieselbe Ueberlegung wie bei der Wartezeitsperre: die Regel gehoert in die
-- Datenbank, damit sich Saetze nicht durch einen vergessenen gueltig_bis
-- ueberlappen, auch bei direktem API-Zugriff nicht.
create or replace function public.lohn_satz_vorherigen_schliessen()
returns trigger
language plpgsql
as $$
begin
  update public.lohn_saetze
     set gueltig_bis = new.gueltig_ab
   where gueltig_bis is null
     and gueltig_ab < new.gueltig_ab
     and id <> new.id;
  return new;
end;
$$;
create trigger trg_lohn_satz_vorherigen_schliessen
  after insert on public.lohn_saetze
  for each row execute function public.lohn_satz_vorherigen_schliessen();

-- ---------------------------------------------------------------------------
-- 2. Ausschussquote -> Qualitaetsfaktor
-- ---------------------------------------------------------------------------
-- Gespiegelt zum Vorbild aus dem Schwesterprojekt (dortiges quality_factor(),
-- dort aus der Einstufungstreue): eine hohe Ausschussquote ist schlecht und
-- senkt den Faktor Richtung qualitaetsfaktor_min, eine niedrige hebt ihn
-- Richtung qualitaetsfaktor_max. Ohne Ausschuss- bzw. Mengenangabe gibt es
-- keinen Messwert und damit keine Kuerzung (1.00) - dieselbe Begruendung wie
-- im Vorbild: eine Kuerzung ohne Messgrundlage waere Willkuer.
--
-- Die Skalierung der "schlechter als Ziel"-Seite ist bewusst NICHT auf den
-- vollen 0..100-Bereich gespannt, anders als beim Vorbild (dort fuellt eine
-- 0..100-Prozentpunkte-Einstufungstreue den Bereich tatsaechlich aus). Eine
-- Ausschussquote bewegt sich in der Praxis meist im einstelligen bis
-- niedrigen zweistelligen Prozentbereich - wuerde qualitaetsfaktor_min erst
-- bei 100 % Ausschuss erreicht, waere der Faktor bei jeder realistischen
-- Quote praktisch immer nahe 1.00: eine Kuerzung ohne spuerbare Wirkung, und
-- genau die Falle, vor der die Dashboard-Warnung im Vorbild warnt ("Faktor
-- wirkungslos"). Die Funktion erreicht den Korridor deshalb symmetrisch zum
-- Zielwert: bei der doppelten Zielquote ist qualitaetsfaktor_min bereits
-- vollstaendig erreicht.
create or replace function public.lohn_qualitaetsfaktor(
  p_ausschussquote numeric,
  p_ziel           numeric,
  p_min            numeric,
  p_max            numeric
)
returns numeric
language sql
immutable
as $$
  select case
    when p_ausschussquote is null then 1.00
    when p_ausschussquote <= p_ziel then
      round(least(p_max,
        1.0 + (p_ziel - p_ausschussquote) / nullif(p_ziel, 0) * (p_max - 1.0)), 2)
    else
      round(greatest(p_min,
        1.0 - least(p_ausschussquote - p_ziel, p_ziel) / nullif(p_ziel, 0) * (1.0 - p_min)), 2)
  end;
$$;
comment on function public.lohn_qualitaetsfaktor is
  'Qualitaetsfaktor aus der Ausschussquote, symmetrisch um den Zielwert: bei 0% Ausschuss der Maximalfaktor, ab der doppelten Zielquote bereits der Minimalfaktor. Ohne Messgrundlage 1.00 - keine Kuerzung ohne Messung.';

-- ---------------------------------------------------------------------------
-- 3. Transparenz-Spalten: Grundlagen mitschreiben, nicht nur das Ergebnis
-- ---------------------------------------------------------------------------
alter table public.lohn_abrechnungen
  add column if not exists stunden       numeric(8,2) not null default 0 check (stunden >= 0),
  add column if not exists menge_kg      numeric(10,2) not null default 0 check (menge_kg >= 0),
  add column if not exists ausschussquote numeric(5,2)
    check (ausschussquote is null or (ausschussquote >= 0 and ausschussquote <= 100));

comment on column public.lohn_abrechnungen.stunden is
  'Grundlage der Grundlohn-Komponente, aus arbeitszeiten.minuten der Periode. Mitgeschrieben, damit die Abrechnung nachrechenbar bleibt, statt nur das Ergebnis zu zeigen.';
comment on column public.lohn_abrechnungen.menge_kg is
  'Grundlage der Mengenkomponente, Summe der Steigen-Gewichte der Periode (= Summe von lohn_positionen.menge_kg dieser Abrechnung).';
comment on column public.lohn_abrechnungen.ausschussquote is
  'Ueber die Periode gewichtete Ausschussquote dieser Person in Prozent - Grundlage des hier ausgewiesenen qualitaetsfaktor. Null, wenn keine Menge vorliegt (kein Messwert).';

alter table public.lohn_positionen
  add column if not exists ausschuss_anteilig_kg numeric(8,2) not null default 0 check (ausschuss_anteilig_kg >= 0);

comment on column public.lohn_positionen.ausschuss_anteilig_kg is
  'Anteiliger Ausschuss dieser Person an dieser Pflueckaufgabe, umgelegt nach dem kg-Anteil an den Steigen der Aufgabe (Ausschuss liegt nur je Aufgabe vor, nicht je Person - siehe Migrationskopf, Punkt 1).';

-- Ein (Pfluecker, Zeitraum) hat hoechstens eine Abrechnung - Voraussetzung
-- dafuer, dass ein Neuberechnungslauf eine bestehende Zeile eindeutig
-- wiederfindet statt Duplikate anzulegen.
alter table public.lohn_abrechnungen
  add constraint lohn_abrechnungen_pfluecker_periode_key
  unique (pfluecker_id, periode_start, periode_ende);

-- ---------------------------------------------------------------------------
-- 4. Freigabe-Schutz, analog pflueckaufgabe_freigabe_pruefen()
-- ---------------------------------------------------------------------------
create or replace function public.lohn_abrechnung_freigabe_pruefen()
returns trigger
language plpgsql
as $$
begin
  -- Einmal ausgezahlt bleibt ausgezahlt - die Auszahlung ist ein bereits
  -- vollzogener externer Vorgang, keine Zurueckstufung korrigiert das.
  if old.status = 'ausgezahlt' and new.status <> 'ausgezahlt' then
    raise exception 'Eine ausgezahlte Lohnabrechnung laesst sich nicht zurueckstufen.'
      using errcode = 'check_violation';
  end if;

  -- Nach der Freigabe sind die Betraege ein abgenommener Wert. Eine Korrektur
  -- fuehrt zunaechst ueber einen expliziten Ruecksprung auf 'entwurf' (das
  -- erlaubt dieser Trigger), nicht ueber ein stillschweigendes Ueberschreiben
  -- bei gleichbleibendem freigegebenem Status.
  if old.status in ('freigegeben', 'ausgezahlt')
     and new.status = old.status
     and (
       new.grundlohn_tenge is distinct from old.grundlohn_tenge
       or new.mengen_komponente_tenge is distinct from old.mengen_komponente_tenge
       or new.qualitaetsfaktor is distinct from old.qualitaetsfaktor
       or new.gesamt_tenge is distinct from old.gesamt_tenge
       or new.stunden is distinct from old.stunden
       or new.menge_kg is distinct from old.menge_kg
     ) then
    raise exception 'Die Betraege einer freigegebenen Abrechnung aendern sich nur ueber eine neue Entwurfsfassung.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;
comment on function public.lohn_abrechnung_freigabe_pruefen is
  'Schuetzt eine freigegebene/ausgezahlte Lohnabrechnung vor Ruecknahme und stiller Betragsaenderung - analog pflueckaufgabe_freigabe_pruefen() fuer Pflueckaufgaben.';

create trigger trg_lohn_abrechnung_freigabe before update on public.lohn_abrechnungen
  for each row execute function public.lohn_abrechnung_freigabe_pruefen();

-- ---------------------------------------------------------------------------
-- 5. RPC: Lohnperiode berechnen
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER mit explizitem has_role()-Einstieg (wie
-- charge_zur_aufgabe_anlegen(), reklamation_status_protokollieren() u.a.):
-- die Funktion schreibt fuer viele Pfluecker in einem Lauf, das bildet sich
-- nicht als einfache Row-Bedingung einer RLS-Policy ab. Die Rechte-Pruefung
-- steht deshalb explizit am Anfang der Funktion, RLS bleibt zusaetzlich als
-- zweite Verteidigungslinie fuer den Direktzugriff auf die Tabellen bestehen
-- (siehe Abschnitt 6 unten).
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
    loop
      v_ausschussquote := case
        when (v_position.kg + v_position.anteiliger_ausschuss_kg) > 0
        then round(100.0 * v_position.anteiliger_ausschuss_kg
                   / (v_position.kg + v_position.anteiliger_ausschuss_kg), 2)
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
      when (v_gesamt_kg + v_gesamt_ausschuss_kg) > 0
      then round(100.0 * v_gesamt_ausschuss_kg / (v_gesamt_kg + v_gesamt_ausschuss_kg), 2)
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
  'Berechnet Grundlohn, Mengenkomponente und Qualitaetsfaktor je Pfluecker fuer eine Periode und schreibt lohn_abrechnungen/lohn_positionen. Bereits freigegebene/ausgezahlte Abrechnungen werden uebersprungen, nie ueberschrieben.';

-- ---------------------------------------------------------------------------
-- 6. RLS: lohn_saetze, Schreibrechte lohn_abrechnungen/lohn_positionen
-- ---------------------------------------------------------------------------
alter table public.lohn_saetze enable row level security;
alter table public.lohn_saetze force row level security;

-- Wer nach diesem Satz bezahlt wird, darf ihn sehen - ein Lohn, dessen
-- Grundlage geheim ist, laesst sich nicht nachrechnen (gleiche Begruendung
-- wie im Vorbild). Buero-Rollen umfasst auch die Betriebsleitung
-- (has_office_access), die per rbac.ts nur view("lohn") hat.
create policy lohn_saetze_select_office on public.lohn_saetze
  for select to authenticated
  using (public.has_office_access());

create policy lohn_saetze_insert_buchhaltung on public.lohn_saetze
  for insert to authenticated
  with check (public.has_role('admin', 'buchhaltung'));

create policy lohn_saetze_update_buchhaltung on public.lohn_saetze
  for update to authenticated
  using (public.has_role('admin', 'buchhaltung'))
  with check (public.has_role('admin', 'buchhaltung'));

-- lohn_abrechnungen/lohn_positionen hatten bislang ausschliesslich die
-- SELECT-Policy aus 20260902090100_rls_policies.sql (has_office_access,
-- also inklusive Betriebsleitung). Schreiben ist enger: rbac.ts gibt der
-- Betriebsleitung fuer "lohn" nur view, Schreibrechte hat neben admin
-- ausschliesslich buchhaltung.
create policy lohn_abrechnungen_insert_buchhaltung on public.lohn_abrechnungen
  for insert to authenticated
  with check (public.has_role('admin', 'buchhaltung'));

create policy lohn_abrechnungen_update_buchhaltung on public.lohn_abrechnungen
  for update to authenticated
  using (public.has_role('admin', 'buchhaltung'))
  with check (public.has_role('admin', 'buchhaltung'));

create policy lohn_positionen_insert_buchhaltung on public.lohn_positionen
  for insert to authenticated
  with check (public.has_role('admin', 'buchhaltung'));

create policy lohn_positionen_update_buchhaltung on public.lohn_positionen
  for update to authenticated
  using (public.has_role('admin', 'buchhaltung'))
  with check (public.has_role('admin', 'buchhaltung'));

create policy lohn_positionen_delete_buchhaltung on public.lohn_positionen
  for delete to authenticated
  using (public.has_role('admin', 'buchhaltung'));

grant execute on function public.lohn_qualitaetsfaktor(numeric, numeric, numeric, numeric) to authenticated;
grant execute on function public.lohn_periode_berechnen(date, date) to authenticated;
