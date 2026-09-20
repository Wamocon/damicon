-- PGLITE-TEST: uebersprungen (storage-Schema gibt es nur in echtem Supabase,
-- siehe pglite-fast.mjs) - npm run db:test ist fuer diese Migration die
-- massgebliche Pruefung.
-- =============================================================================
-- Damicon - Zwischenspeicher fuer die Sprachausgabe der KI-Antworten
-- =============================================================================
-- Eine vorgelesene Antwort klingt beim zweiten Mal genau gleich: derselbe
-- gespeicherte Text, dieselbe Stimme. Trotzdem lief bisher jeder Klick auf
-- "Vorlesen" erneut ueber Caesar. Dieser Bucket haelt das erzeugte Audio fest,
-- damit ein zweiter Klick ohne Netzweg auskommt.
--
-- Schluessel ist der Pfad: <nachricht-id>/<stimme>.mp3 (sprachausgabePfad() in
-- domain/sprachausgabe.ts). Die Stimme steht mit im Pfad - wird eine Sprache
-- auf eine andere Stimme umgestellt, entsteht ein neuer Pfad, und niemand
-- hoert die alte Stimme aus dem Zwischenspeicher. Der Text selbst kann sich
-- nicht aendern: ki_chat_nachrichten hat keine UPDATE-Policy.
--
-- BEWUSST KEINE POLICY, auch nicht fuer admin: der Bucket ist privat und
-- ausschliesslich ueber service_role erreichbar (api/ki-sprachausgabe). Die
-- Berechtigung haengt an der ANTWORT, nicht an der Audiodatei - die Route
-- liest die Antwort zuerst mit der Sitzung des Nutzers (RLS auf
-- ki_chat_nachrichten) und gibt Audio nur heraus, wenn diese Zeile fuer ihn
-- sichtbar ist. Gaebe es eine Lese-Policy fuer authenticated, koennte jemand
-- mit geratener Nachrichten-ID die Audiodatei direkt aus dem Storage ziehen
-- und damit die Pruefung der Route umgehen.
--
-- Aufraeumen: derzeit keines. Die Dateien sind klein (einige zehn Kilobyte je
-- Antwort) und entstehen nur fuer tatsaechlich vorgelesene Antworten. Wenn der
-- Verlauf spaeter eine Aufbewahrungsfrist bekommt (Compliance-Modul, siehe
-- Kommentar in 20261030000000), gehoert das Loeschen der zugehoerigen Audios
-- in denselben Schritt.
-- =============================================================================

set search_path = public;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ki-sprachausgabe', 'ki-sprachausgabe', false, 10485760, array['audio/mpeg', 'audio/mp3'])
on conflict (id) do nothing;
