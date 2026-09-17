-- =============================================================================
-- Damicon - Stammdaten nach Rechtsform mit ИИН oder БИН (Anforderung E.11)
-- =============================================================================
-- Abnahmekriterium: "Betrieb, Nachbarbetriebe und Kunden tragen je nach
-- Rechtsform ИИН oder БИН; ein baeuerlicher Betrieb (КХ/ФХ) ohne БИН laesst
-- sich vollstaendig abbilden."
--
-- Warum das ein P0 ist und kein Formularfeld: Der Betrieb selbst ist ein
-- Krestjanskoje Chosjaistwo. Ein КХ ohne eigene juristische Person hat gar
-- keinen БИН, sondern traegt den ИИН seines Leiters. Ein Schema, das nur ein
-- Feld "БИН" kennt, zwingt seinen eigenen Inhaber zu einem falschen Eintrag -
-- und jeder Beleg, der darauf aufbaut, ist angreifbar.
--
-- Deshalb zwei Spalten statt einer: die Rechtsform entscheidet, welche Art
-- Nummer gilt. Die Nummernart selbst wird nicht gespeichert, sie ist aus der
-- Rechtsform ableitbar (Funktion nummernart_fuer_rechtsform) - eine dritte
-- Spalte koennte der Rechtsform widersprechen.
--
-- Drei Tabellen bekommen dieselben Spalten, eine je Gruppe des Kriteriums:
-- betriebe (der eigene Betrieb), nachbarbetriebe (die Zulieferer, an denen
-- zukauf_positionen haengt) und b2b_kunden (die Abnehmer). Fuer alle drei wird
-- abgerechnet, also braucht jede von ihnen eine belegfaehige Nummer.
-- =============================================================================

set search_path = public;

-- -----------------------------------------------------------------------------
-- Rechtsformen
-- -----------------------------------------------------------------------------
-- Die sechs Formen, die im Umfeld des Betriebs vorkommen. Bewusst keine
-- Sammelposition "sonstige": eine unbekannte Rechtsform ist eine fachliche
-- Luecke, die auffallen soll, keine Zeile mit leerem Belegwert.
--
-- Zuordnung der Nummernart (Steuer- und Belegrecht Kasachstan):
--   ИИН - natuerliche Personen und Gebilde ohne eigene juristische Person:
--         Privatperson, Einzelunternehmer (ИП), baeuerlicher Betrieb (КХ/ФХ).
--   БИН - juristische Personen: ТОО, АО, Produktionsgenossenschaft.
create type public.rechtsform as enum (
  'kh_fh',         -- Крестьянское (фермерское) хозяйство
  'ip',            -- Индивидуальный предприниматель
  'privatperson',  -- Физическое лицо
  'too',           -- Товарищество с ограниченной ответственностью
  'ao',            -- Акционерное общество
  'pk'             -- Производственный кооператив
);

comment on type public.rechtsform is
  'Rechtsform nach kasachischem Recht. Bestimmt, ob ein ИИН oder ein БИН gilt (Anforderung E.11).';

-- -----------------------------------------------------------------------------
-- Welche Nummernart gilt zu welcher Rechtsform
-- -----------------------------------------------------------------------------
create or replace function public.nummernart_fuer_rechtsform(p_rechtsform public.rechtsform)
returns text
language sql
immutable
parallel safe
set search_path = public
as $fn$
  select case p_rechtsform
    when 'kh_fh'        then 'iin'
    when 'ip'           then 'iin'
    when 'privatperson' then 'iin'
    else 'bin'
  end;
$fn$;

comment on function public.nummernart_fuer_rechtsform(public.rechtsform) is
  'Liefert "iin" oder "bin". Einzige Quelle der Zuordnung - Datenbank und Anwendung teilen sie sich (src/lib/domain/rechtsform.ts).';

-- -----------------------------------------------------------------------------
-- Pruefziffer nach dem kasachischen Verfahren
-- -----------------------------------------------------------------------------
-- ИИН und БИН sind beide zwoelfstellig und tragen dieselbe Pruefziffer an der
-- zwoelften Stelle. Gerechnet wird die gewichtete Summe der ersten elf Ziffern
-- modulo 11. Faellt dabei 10 heraus, ist das Ergebnis keine Ziffer; dann greift
-- eine zweite, verschobene Gewichtsreihe. Ergibt auch die 10, existiert keine
-- gueltige Nummer mit diesen elf Ziffern - die Vergabestelle ueberspringt
-- solche Kombinationen.
--
-- Gibt null zurueck, wenn die Eingabe nicht aus genau zwoelf Ziffern besteht;
-- der Aufrufer unterscheidet damit "falsches Format" von "falsche Pruefziffer".
create or replace function public.pruefziffer_stimmt(p_nummer text)
returns boolean
language plpgsql
immutable
parallel safe
set search_path = public
as $fn$
declare
  ziffern smallint[];
  gewicht1 constant smallint[] := array[1,2,3,4,5,6,7,8,9,10,11];
  gewicht2 constant smallint[] := array[3,4,5,6,7,8,9,10,11,1,2];
  summe integer := 0;
  rest smallint;
  i smallint;
begin
  if p_nummer is null or p_nummer !~ '^[0-9]{12}$' then
    return null;
  end if;

  for i in 1..12 loop
    ziffern[i] := substr(p_nummer, i, 1)::smallint;
  end loop;

  for i in 1..11 loop
    summe := summe + ziffern[i] * gewicht1[i];
  end loop;
  rest := summe % 11;

  if rest = 10 then
    summe := 0;
    for i in 1..11 loop
      summe := summe + ziffern[i] * gewicht2[i];
    end loop;
    rest := summe % 11;
    if rest = 10 then
      return false;
    end if;
  end if;

  return rest = ziffern[12];
end;
$fn$;

comment on function public.pruefziffer_stimmt(text) is
  'Prueft die zwoelfte Stelle eines ИИН/БИН. null = nicht zwoelf Ziffern, false = Pruefziffer falsch (Anforderung E.11).';

-- -----------------------------------------------------------------------------
-- Die Spalten
-- -----------------------------------------------------------------------------
-- Beide Spalten sind nullable. Der Altbestand hat keine Rechtsform, und ein
-- not null wuerde den Bestand entweder ablehnen oder ihn mit einem geratenen
-- Wert fuellen - dieselbe Ueberlegung wie bei 2.4 (Aufwandmenge). Erzwungen
-- wird deshalb nicht die Anwesenheit, sondern die Stimmigkeit: wer eine Nummer
-- eintraegt, muss auch die Rechtsform nennen, und die Nummer muss zu ihr passen.
alter table public.betriebe
  add column rechtsform public.rechtsform,
  add column identifikationsnummer text;

alter table public.nachbarbetriebe
  add column rechtsform public.rechtsform,
  add column identifikationsnummer text;

alter table public.b2b_kunden
  add column rechtsform public.rechtsform,
  add column identifikationsnummer text;

comment on column public.betriebe.identifikationsnummer is
  'ИИН oder БИН, zwoelf Ziffern. Welche Art gilt, sagt die Rechtsform (Anforderung E.11).';
comment on column public.nachbarbetriebe.identifikationsnummer is
  'ИИН oder БИН, zwoelf Ziffern. Welche Art gilt, sagt die Rechtsform (Anforderung E.11).';
comment on column public.b2b_kunden.identifikationsnummer is
  'ИИН oder БИН, zwoelf Ziffern. Welche Art gilt, sagt die Rechtsform (Anforderung E.11).';

-- -----------------------------------------------------------------------------
-- Stimmigkeit
-- -----------------------------------------------------------------------------
-- Drei Aussagen in einer Bedingung:
--   1. Ohne Nummer ist alles erlaubt (Altbestand, noch nicht erhoben).
--   2. Mit Nummer muss die Rechtsform stehen - sonst ist nicht entscheidbar,
--      ob die Zahl ein ИИН oder ein БИН sein soll.
--   3. Mit Nummer muss die Pruefziffer stimmen. Ein Zahlendreher im ИИН faellt
--      damit beim Eintragen auf und nicht erst auf der Rechnung.
--
-- Bewusst KEINE Pruefung der fuenften Stelle (bei БИН vier bis sechs): diese
-- Struktur ist uns nicht durch eine gepruefte Primaerquelle belegt. Eine Regel,
-- die eine gueltige Nummer ablehnt, ist schlimmer als eine fehlende Regel - sie
-- blockiert einen echten Geschaeftsvorgang.
--
-- "is true" ist hier nicht schmueckend, sondern traegt die Regel. Bei falschem
-- Format liefert pruefziffer_stimmt() null, damit der Aufrufer "keine zwoelf
-- Ziffern" von "Pruefziffer falsch" unterscheiden kann. Ein check, der zu null
-- auswertet, gilt in Postgres jedoch als erfuellt - "12345" waere ohne "is true"
-- glatt durchgelaufen. Der Abnahmetest E.11 hat genau das gefunden.
alter table public.betriebe
  add constraint betriebe_identifikationsnummer_stimmig check (
    identifikationsnummer is null
    or (rechtsform is not null and public.pruefziffer_stimmt(identifikationsnummer) is true)
  );

alter table public.nachbarbetriebe
  add constraint nachbarbetriebe_identifikationsnummer_stimmig check (
    identifikationsnummer is null
    or (rechtsform is not null and public.pruefziffer_stimmt(identifikationsnummer) is true)
  );

alter table public.b2b_kunden
  add constraint b2b_kunden_identifikationsnummer_stimmig check (
    identifikationsnummer is null
    or (rechtsform is not null and public.pruefziffer_stimmt(identifikationsnummer) is true)
  );

-- Eine Nummer gehoert zu genau einem Gebilde. Teilindex, damit der Altbestand
-- ohne Nummer nicht kollidiert.
--
-- Die Eindeutigkeit gilt je Tabelle, nicht ueber alle drei hinweg: Ein
-- Nachbarbetrieb, der zugleich Kunde ist, steht heute in beiden Tabellen und
-- traegt dann zu Recht zweimal dieselbe Nummer. Eine tabellenuebergreifende
-- Sperre wuerde diesen echten Fall verbieten.
create unique index betriebe_identifikationsnummer_eindeutig
  on public.betriebe (identifikationsnummer)
  where identifikationsnummer is not null;

create unique index nachbarbetriebe_identifikationsnummer_eindeutig
  on public.nachbarbetriebe (identifikationsnummer)
  where identifikationsnummer is not null;

create unique index b2b_kunden_identifikationsnummer_eindeutig
  on public.b2b_kunden (identifikationsnummer)
  where identifikationsnummer is not null;

-- -----------------------------------------------------------------------------
-- Schreibrecht auf den eigenen Betrieb
-- -----------------------------------------------------------------------------
-- betriebe trug bisher ueberhaupt keine Schreib-Policy: die Zeile entstand im
-- Seed und war danach fuer jede Rolle unveraenderlich. Mit E.11 muss der
-- Betrieb seine eigene Rechtsform und seinen ИИН eintragen koennen - sonst
-- fehlt ausgerechnet dem Aussteller die Nummer auf seinen Belegen.
--
-- Nur update, kein insert und kein delete: Wie viele Betriebe es gibt, ist
-- eine Frage der Mandantenstruktur und keine, die eine Stammdatenmaske
-- beantworten sollte. Dieselbe Zurueckhaltung wie bei kontingente
-- (Migration 20261012000000): pflegen ja, anlegen nein.
create policy betriebe_update_leitung on public.betriebe
  for update to authenticated
  using (public.has_role('admin', 'betriebsleitung'))
  with check (public.has_role('admin', 'betriebsleitung'));
