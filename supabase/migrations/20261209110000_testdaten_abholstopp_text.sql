-- Testdaten Abholstopp, Bemerkung ohne Wetterbezug (Datenänderung, idempotent).
--
-- Die Bemerkung zum Stopp bei Kaskelen am 10.10.2026 nannte einen Frost in der Nacht. Das Wetter der Testdaten ist erfunden und wird beim ersten
-- "Jetzt aktualisieren" auf der Wetterseite durch die Werte des Wetterdienstes ersetzt (am 10.10.2026 lag das Minimum bei 9,5 Grad). Eine Bemerkung,
-- die vom Wetter abhängt, widerspräche dann den Messwerten. Der neue Text sagt nur, was der Stopp ergab.
--
-- Der Stopp gehört zu einer abgeschlossenen Runde. Die Prüfung dafür ist nur für diese eine Anweisung abgeschaltet.

alter table public.abholstopps disable trigger trg_abholstopp_pruefen;

update public.abholstopps
   set bemerkung = 'Etwas weniger Ware als geplant, kleinere Früchte.'
 where id = '7e57da7a-0000-4000-8000-390003000001'::uuid
   and bemerkung = 'Weniger Ware nach dem Frost in der Nacht.';

alter table public.abholstopps enable trigger trg_abholstopp_pruefen;
