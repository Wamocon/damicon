-- =============================================================================
-- Plausibilitaetsgrenze fuer Kuehlketten- und Transporttemperaturen (WMCNL-2376)
-- =============================================================================
-- kuehlketten_messungen.temperatur_c und transport_temperatur_messungen.
-- temperatur_c sind beide nur numeric(4,1) not null - keine
-- Wertebereichspruefung. Im Bestand stehen dadurch 85 Grad und -60 Grad an
-- einer Charge sowie 60 Grad an einer Lieferung; der B2B-Kunde sieht einen
-- dieser Werte im Portal voellig unkommentiert als Kuehlkettennachweis.
--
-- Zu unterscheiden vom bestehenden 4/8-Grad-Schwellenwert
-- (kuehlkette_bewerten()/transport_kuehlkette_bewerten(),
-- temperaturband_bewerten()): jener bewertet die QUALITAET einer plausiblen
-- Messung (ok/warnung/verstoss), diese Migration prueft nur die PHYSIKALISCHE
-- PLAUSIBILITAET der Eingabe selbst - ein Tippfehler wie "85" statt "8,5"
-- rutscht sonst unbemerkt durch beide Bewertungsfunktionen.
--
-- Bereich -30 bis 50 Grad Celsius: deckt jede realistische Kuehlketten-/
-- Transportmessung ab (von einer funktionierenden Kuehlung nahe 0 Grad bis
-- zu einem sonnenexponierten, ungekuehlten Sensor im kasachstanischen
-- Sommer), schliesst aber die gemeldeten Ausreisser (85, -60, 60) sicher aus.
--
-- NOT VALID bewusst: ein normaler ALTER TABLE ... ADD CONSTRAINT wuerde
-- SOFORT jede Bestandszeile validieren und mangels der drei genannten
-- Ausreisser fehlschlagen - eine fehlschlagende Migration blockiert jede
-- nachfolgende. NOT VALID erzwingt die Grenze ab sofort fuer jeden neuen
-- Insert/Update, laesst historische Zeilen aber unangetastet stehen (kein
-- stilles Aendern/Loeschen von Messwerten, siehe Unveraenderlichkeits-
-- Prinzip dieser Tabellen). Eine spaetere VALIDATE CONSTRAINT ist Folgearbeit,
-- sobald die drei konkreten Ausreisser fachlich geklaert sind (echte
-- Fehlmessung vs. Tippfehler - das ist keine technische, sondern eine
-- Datenentscheidung).
-- =============================================================================

set search_path = public;

alter table public.kuehlketten_messungen
  add constraint kuehlketten_messungen_temperatur_plausibel
  check (temperatur_c between -30 and 50) not valid;

alter table public.transport_temperatur_messungen
  add constraint transport_temperatur_messungen_temperatur_plausibel
  check (temperatur_c between -30 and 50) not valid;

comment on constraint kuehlketten_messungen_temperatur_plausibel on public.kuehlketten_messungen is
  'WMCNL-2376: physikalische Plausibilitaetsgrenze (-30 bis 50 Grad), unabhaengig vom 4/8-Grad-Qualitaetsurteil in kuehlkette_bewerten(). NOT VALID - gilt fuer neue Zeilen, bestehende Ausreisser bleiben bis zu einer fachlichen Klaerung unangetastet stehen.';
comment on constraint transport_temperatur_messungen_temperatur_plausibel on public.transport_temperatur_messungen is
  'WMCNL-2376: physikalische Plausibilitaetsgrenze (-30 bis 50 Grad), unabhaengig vom 4/8-Grad-Qualitaetsurteil in transport_kuehlkette_bewerten()/temperaturband_bewerten(). NOT VALID - gilt fuer neue Zeilen, bestehende Ausreisser bleiben bis zu einer fachlichen Klaerung unangetastet stehen.';
