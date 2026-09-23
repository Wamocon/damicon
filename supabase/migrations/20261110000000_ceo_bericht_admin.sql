-- =============================================================================
-- Damicon - Die Rolle admin darf Compliance-Berichte ausloesen
-- =============================================================================
-- Bisher durfte nur ceo einen automatischen Compliance-Bericht schreiben
-- (20261108020000_compliance_ceo_berichte.sql). Lesen durfte admin schon immer
-- mit, die SELECT-Policy steht auf has_role('ceo', 'admin') und bleibt
-- unveraendert.
--
-- Auftrag vom 23.09.2026: Die Tages-Zusammenfassung auf der Uebersichtsseite
-- gilt fuer ceo UND admin, und beide sollen sie ausloesen koennen - ueber den
-- Knopf "Jetzt neu pruefen" und ueber den automatischen Lauf beim Login.
--
-- Warum die Policy wirklich angefasst werden muss: 20261108010000_ceo_rechte.sql
-- erweitert has_role() so, dass ceo ueberall dort gilt, wo admin erlaubt ist.
-- Die umgekehrte Richtung gibt es NICHT - has_role('ceo') bleibt fuer einen
-- admin falsch. has_role() noch einmal zu erweitern waere hier das falsche
-- Werkzeug: das setzte die Rollen global gleich, gewollt ist eine Aenderung an
-- genau dieser einen Tabelle.
--
-- Beide Rollen stehen ausgeschrieben, obwohl has_role('admin') allein genuegen
-- wuerde (ceo gilt ueber die erweiterte Funktion mit). Drei Gruende:
--   1. Die SELECT-Policy nennt beide. Zwei Policies auf derselben Tabelle, die
--      dieselbe Zielgruppe verschieden schreiben, liest man beim naechsten Mal
--      falsch.
--   2. Der ceo->admin-Alias ist eine kuratierte Entscheidung, die jemand
--      plausibel wieder verengt. Dann sperrte eine Policy mit has_role('admin')
--      ausgerechnet den CEO aus seinem eigenen Bericht aus, und zwar lautlos.
--   3. has_role ist variadisch, die zweite Rolle kostet nichts.
-- =============================================================================

set search_path = public;

drop policy if exists compliance_ceo_berichte_insert on public.compliance_ceo_berichte;

create policy compliance_ceo_berichte_insert on public.compliance_ceo_berichte
  for insert to authenticated
  with check (public.has_role('ceo', 'admin'));

comment on table public.compliance_ceo_berichte is
  'Automatisch beim Login von ceo oder admin erzeugte Compliance-Berichte (alle vier Pruefbereiche in einem Lauf) sowie manuell ueber den Aktualisieren-Knopf. Append-only.';
