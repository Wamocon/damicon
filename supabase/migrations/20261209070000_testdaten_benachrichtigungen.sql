-- Testdaten Benachrichtigungen (Datenänderung, idempotent).
--
-- Die Glocke füllt der stündliche Lauf von benachrichtigungen_erzeugen() (Workflow benachrichtigungen-erzeugen.yml). Der Workflow
-- läuft erst, wenn er auf main liegt. Damit die Glocke nach den Testdaten dieser Reihe (ЭСФ über der Frist, ЕСУТД-Meldungen, Nachweise,
-- die ablaufen) nicht bis dahin leer bleibt, wird die Erzeugung hier einmal ausgelöst. Sie ist über (empfaenger_id, schluessel)
-- eindeutig: Derselbe Zustand meldet sich nur einmal, der spätere Lauf des Workflows ergänzt nur, was neu ist.
--
-- Schutz: nur mit Betriebsdaten. Eine leere Datenbank (CI, lokaler Stack vor dem Seed) bleibt unverändert.
-- Teil der Testdaten-Reihe (Kennung 7e57da7a-0000-4000-8000-...), legt selbst aber keine Zeile mit dieser Kennung an: die Hinweise leitet
-- die Funktion aus dem Stand der Daten ab und der stündliche Lauf erzeugt sie bei Bedarf neu.

select public.benachrichtigungen_erzeugen()
 where exists (select 1 from public.chargen);
