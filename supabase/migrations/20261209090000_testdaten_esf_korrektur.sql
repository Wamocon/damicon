-- Testdaten ЭСФ, Korrektur (Datenänderung, idempotent).
--
-- Die Migration 20261209050000 verteilt die Belege nach dem Alter der Lieferung zufällig auf die Zustände. Auf der Preview-Datenbank blieben dabei
-- Lieferungen von 114, 377 und 433 Tagen als Entwurf oder abgelehnt liegen, andere warten seit über einem Jahr auf die Bestätigung. Ein Entwurf, der nach
-- über einem Jahr noch auf seine Ausstellung wartet, ist unglaubwürdig und löst Hinweise "ЭСФ überfällig" für Altfälle aus. Diese Migration führt solche Belege der Testdaten (Lieferung
-- älter als 45 Tage zum Stichtag 16.10.2026) zu Ende: bestätigt, in seltenen Fällen auf Papier. Die Migration 20261209050000 bleibt unverändert,
-- weil sie auf der Preview-Datenbank schon angewendet ist.
--
-- Der Weg folgt den erlaubten Statuswechseln: abgelehnt führt über einen neuen Entwurf (Nummer und Daten fallen dabei weg), Entwurf über
-- ausgestellt nach bestätigt; ein ausgestellter Beleg wird gleich bestätigt. Die Einreihung in die Auslieferungswarteschlange ist wie dort abgeschaltet.
--
-- Schutz: nur Belege mit der Kennung 7e57da7a-0000-4000-8000-80... im Zustand Entwurf, abgelehnt oder ausgestellt; ein zweiter Lauf findet keinen mehr.

create temp table _esf_alt as
select b.id as beleg_id, b.status as alt_status, l.id as lieferung_id, (l.geliefert_am at time zone 'Asia/Almaty')::date as liefertag,
       (abs(hashtext('esf:' || l.id))::numeric % 1000) / 1000.0 as u,
       (abs(hashtext('esf2:' || l.id))::numeric % 1000) / 1000.0 as u2,
       row_number() over (order by (l.geliefert_am at time zone 'Asia/Almaty')::date, l.id) as lfd
  from public.esf_belege b
  join public.lieferungen l on l.id = b.lieferung_id
 where b.id::text like '7e57da7a-0000-4000-8000-80%'
   and b.status in ('entwurf', 'abgelehnt', 'ausgestellt')
   and date '2026-10-16' - (l.geliefert_am at time zone 'Asia/Almaty')::date > 45;

alter table public.esf_belege disable trigger trg_esf_beleg_einreihen;

-- Abgelehnte beginnen neu: zurück auf Entwurf, die Angaben des abgelehnten Versuchs entfallen.
update public.esf_belege b
   set status = 'entwurf', esf_nummer = null, ausgestellt_am = null, bestaetigt_am = null,
       bemerkung = 'Nach Klärung der BIN neu ausgestellt, vorher vom Kunden abgelehnt.'
  from _esf_alt a
 where b.id = a.beleg_id and b.status = 'abgelehnt';

-- Auf Papier: wer ohne ISESF-Zugang arbeitet. Der Rest wird ausgestellt und bestätigt; die Nummern setzen die bisherigen fort.
update public.esf_belege b
   set status = 'papier', bemerkung = 'Kunde ohne Zugang zum ISESF, Rechnung und Warenbegleitschein auf Papier übergeben.'
  from _esf_alt a
 where b.id = a.beleg_id and b.status = 'entwurf' and a.u < 0.05;

update public.esf_belege b
   set status = 'ausgestellt',
       esf_nummer = 'ESF-2026-' || lpad(((select coalesce(max(substr(x.esf_nummer, 10)::integer), 240099) from public.esf_belege x where x.esf_nummer ~ '^ESF-2026-[0-9]{6}$') + a.lfd)::integer::text, 6, '0'),
       ausgestellt_am = a.liefertag + 1 + floor(a.u2 * 3)::integer
  from _esf_alt a
 where b.id = a.beleg_id and b.status = 'entwurf';

update public.esf_belege b
   set status = 'bestaetigt', bestaetigt_am = b.ausgestellt_am + 1 + floor(a.u * 2)::integer
  from _esf_alt a
 where b.id = a.beleg_id and b.status = 'ausgestellt';

alter table public.esf_belege enable trigger trg_esf_beleg_einreihen;

-- migration:destruktiv-ok (nur die temporäre Hilfstabelle dieser Migration)
drop table _esf_alt;
