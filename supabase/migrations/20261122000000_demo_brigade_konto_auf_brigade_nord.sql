-- =============================================================================
-- Damicon - Demo-Konto der Brigade auf die Brigade mit den Feldaufgaben setzen
-- =============================================================================
-- WMCNL-2414, WMCNL-2298. "Aufgabe annehmen" und "Menge melden" scheiterten fuer
-- brigade@damicon.demo mit "Ihre Rolle darf diesen Vorgang nicht ausfuehren".
-- pflueckaufgaben_update_feld (20261018000000_brigade_schreibumfang.sql) laesst
-- die Rolle brigade nur an der eigenen Brigade schreiben. seed-auth.mjs hatte dem
-- Konto per order("name").limit(1) die alphabetisch erste Brigade zugewiesen,
-- "Brigade Nachbarbetrieb", und die hat keine eigenen Feldaufgaben.
--
-- Der Seed ist seit 91c78b77 korrigiert (Brigade Nord). Das bereits angelegte Profil
-- auf der gemeinsamen Datenbank behielt aber die falsche Zuordnung, bis jemand
-- npm run db:seed-auth erneut ausfuehrt. Diese Migration holt das nach, genau
-- fuer dieses eine Demo-Konto:
--   * nur das Profil brigade@damicon.demo mit der Rolle brigade,
--   * nur wenn es heute an "Brigade Nachbarbetrieb" haengt,
--   * nur wenn "Brigade Nord" existiert.
-- Jedes andere Konto, jede andere Zuordnung und eine frische Datenbank (der Seed
-- setzt Brigade Nord schon) bleiben unberuehrt. Sie ist beliebig oft ausfuehrbar.
-- Pruefung: supabase/tests/pglite-fast.mjs, Abschnitt 21.
-- =============================================================================

set search_path = public;

update public.profiles p
   set brigade_id = nord.id
  from public.brigaden nord
 where nord.name = 'Brigade Nord'
   and p.email = 'brigade@damicon.demo'
   and p.role = 'brigade'
   and p.brigade_id = (select b.id from public.brigaden b where b.name = 'Brigade Nachbarbetrieb');
