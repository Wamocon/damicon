-- =============================================================================
-- Damicon - Transportmessungen: Herkunft der Messwerte (WMCNL-1517, Stufe 1)
-- =============================================================================
-- Transportmessungen entstanden bisher von Hand: eine Temperatur, ein Klick.
-- Mit dem Import der CSV-Datei eines Temperaturloggers kommen hunderte Werte
-- pro Fahrt dazu. Wer spaeter eine Reklamation prueft, muss erkennen, ob ein
-- Wert von Hand eingetippt oder vom Geraet aufgezeichnet wurde: das eine ist
-- eine Aussage der Person, das andere ein Messprotokoll.
--
--   quelle          'manuell' (Vorgabe, wie bisher) oder 'logger'
--   logger_kennung  Bezeichnung des Geraets, wie der Import sie mitgibt
--                   (Seriennummer oder Fahrzeug); frei, hoechstens 60 Zeichen
--
-- Die Pruefregeln des Triggers transport_kuehlkette_bewerten() bleiben
-- unveraendert und gelten auch fuer Logger-Werte: der Server setzt den
-- Messzeitpunkt aus dem Geraetezeitpunkt, wenn er hoechstens 5 Minuten in der
-- Zukunft und hoechstens 24 Stunden in der Vergangenheit liegt, und eine
-- zugestellte Lieferung nimmt keine Messung mehr an. Der Import lehnt aeltere
-- Werte deshalb schon vorher ab und meldet sie, statt den ganzen Import an
-- einer alten Zeile scheitern zu lassen.
-- =============================================================================

set search_path = public;

alter table public.transport_temperatur_messungen
  add column if not exists quelle text not null default 'manuell'
    check (quelle in ('manuell', 'logger')),
  add column if not exists logger_kennung text
    check (logger_kennung is null or char_length(logger_kennung) between 1 and 60);

comment on column public.transport_temperatur_messungen.quelle is
  'manuell: von Hand erfasst. logger: aus der CSV-Datei eines Temperaturloggers importiert (Messprotokoll).';
comment on column public.transport_temperatur_messungen.logger_kennung is
  'Bezeichnung des Loggers beim Import (Seriennummer oder Fahrzeug), nur bei quelle = logger.';
