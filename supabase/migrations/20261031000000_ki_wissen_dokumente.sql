-- PGLITE-TEST: uebersprungen (pgvector-Erweiterung in PGlite nicht verfuegbar,
-- siehe pglite-fast.mjs) - npm run db:test (echtes Postgres) ist fuer diese
-- Migration die massgebliche Pruefung.
-- =============================================================================
-- Damicon - KI-Assistent: Wissensdokumente (RAG)
-- =============================================================================
-- Ergaenzung zu 20260930000000_ki_assistent.sql: bisher bekommt der Chat nur
-- die Preisliste und die statischen Feldregeln in den Kontext
-- (domain/ki-assistent.ts, baueGesamtWissenskontext). Diese Migration legt
-- die Grundlage fuer eine dritte, freitextliche Wissensquelle: vom Buero
-- hochgeladene Dokumente, durchsucht per Vektor-Aehnlichkeit statt komplett
-- in den Prompt gestopft - bei mehr als ein paar Dokumenten waere Volltext im
-- Kontext sowohl zu teuer (Tokens) als auch zu unpraezise.
--
-- Zwei Tabellen:
--   ki_wissen_dokumente - ein Dokument, seine Ablage im Storage-Bucket
--                         "wissensdokumente" und WELCHE ROLLEN es ueberhaupt
--                         sehen duerfen (erlaubte_rollen) - dasselbe Prinzip
--                         wie wissensQuellenFuerFaehigkeiten() in
--                         domain/ki-assistent.ts: ein Dokument ohne
--                         Berechtigung fuer eine Rolle kommt gar nicht erst
--                         in deren Kontext, es wird nicht per Prompt-
--                         Anweisung verboten.
--   ki_wissen_chunks    - die in Abschnitte zerlegten und eingebetteten
--                         Textstuecke eines Dokuments (pgvector).
--
-- Einbettung (Text -> Vektor) laeuft NICHT ueber Claude oder einen
-- Cloud-Anbieter, sondern ueber ein eigenes, kleines Modell auf Sokrates-2
-- (src/lib/ai/einbettung-client.ts) - dieselbe Begruendung wie beim Chat
-- selbst: Dokumente sollen nicht das Buero-Netz verlassen muessen, um
-- durchsuchbar zu sein.
--
-- Modellwahl: bge-m3 (1024 Dimensionen), ein mehrsprachiges Modell. Die
-- Dokumente werden in ihrer Originalsprache abgelegt - Kasachisch, Russisch,
-- Englisch, Deutsch gemischt, nicht uebersetzt (Festlegung des Betriebs,
-- 19.09.2026). Das zuerst gewaehlte nomic-embed-text (768 Dimensionen) ist
-- im Kern auf Englisch trainiert und nicht fuer sprachuebergreifende Suche
-- ausgelegt. bge-m3 ist genau dafuer gebaut: Frage und Dokument muessen
-- nicht dieselbe Sprache haben (Russisch, Deutsch, Englisch gut abgedeckt).
--
-- BEKANNTE GRENZE - Kasachisch: bge-m3 kennt Kasachisch, aber als Sprache mit
-- deutlich weniger Trainingsdaten als Russisch/Deutsch/Englisch. Die
-- Trefferqualitaet fuer kasachische Dokumente und Fragen ist spuerbar
-- schwaecher und hier NICHT gemessen - brauchbar, aber kein Ersatz fuer eine
-- Pruefung mit echten kasachischen Dokumenten, bevor sich der Betrieb bei
-- kasachischen Inhalten darauf verlaesst. Ein kasachisches Dokument, das
-- nicht gefunden wird, faellt still aus dem Kontext (keine Fehlermeldung) -
-- genau deshalb steht es hier und nicht nur im Ticket.
--
-- Vektor-Dimension bewusst als feste Zahl (1024) statt generisch: pgvector
-- braucht die Dimension in der Spaltendefinition fest, ein Wechsel des
-- Einbettungsmodells auf eine andere Dimension braucht ohnehin eine neue
-- Migration (Spalte neu anlegen, alle Chunks neu einbetten) - siehe
-- ERWARTETE_EINBETTUNGS_DIMENSION in einbettung-client.ts. Diese Migration
-- wurde vor dem ersten Merge von 768 auf 1024 umgestellt, an Ort und Stelle
-- statt mit einer Folgemigration - es gab noch keine eingebetteten Daten.
--
-- Gegen echtes Postgres geprueft (19.09.2026, lokale Supabase-Instanz):
-- pgvector liegt im extensions-Schema, der HNSW-Index baut, und der Weg
-- Dokument -> Abschnitte -> Vektoren -> Aehnlichkeitssuche laeuft durch.
-- Ein number[] reicht supabase-js allerdings NICHT in eine vector(1024)-Spalte
-- durch: pgvector erwartet ueber PostgREST seine Textform "[0.1,0.2,...]" -
-- dafuer gibt es alsVektorLiteral() in einbettung-client.ts, benutzt beim
-- Einfuegen der Chunks und als RPC-Parameter.
-- =============================================================================

set search_path = public;

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. ki_wissen_dokumente
-- ---------------------------------------------------------------------------
create type public.ki_wissen_status as enum ('wird_verarbeitet', 'bereit', 'fehler');

-- Vier feste Sachgebiete, kein "sonstiges"-Auffangwert: anders als bei
-- dokumente.kategorie (dort ist "sonstiges" gewollt, weil dort alles landet,
-- was ein Betrieb ablegt) hat die Wissensbasis einen engen Zweck. Ein
-- Auffangwert waere hier die Stelle, an der nach ein paar Monaten die Haelfte
-- der Dokumente liegt und die Gruppierung nichts mehr aussagt. Wer ein
-- fuenftes Gebiet braucht, ergaenzt den Enum-Wert bewusst per Migration.
create type public.ki_wissen_kategorie as enum ('risiko', 'audit', 'recht', 'steuern');

create table public.ki_wissen_dokumente (
  id                uuid primary key default gen_random_uuid(),
  titel             text not null,
  -- Ohne Standardwert: das Sachgebiet waehlt die hochladende Person beim
  -- Upload, genau wie dokumente.kategorie keinen stillen Rueckfall hat. Eine
  -- falsch einsortierte Datei faellt in der gruppierten Uebersicht auf, eine
  -- stillschweigend nach "risiko" gekippte nicht.
  kategorie         public.ki_wissen_kategorie not null,
  dateiname         text not null,
  -- Pfad im Storage-Bucket "wissensdokumente" (siehe unten) - das Original
  -- bleibt erhalten, auch nachdem der Text extrahiert und eingebettet ist,
  -- damit ein Admin die Quelle jederzeit nachlesen kann.
  storage_pfad      text not null,
  -- Dieselben sieben Werte wie public.app_role. Ein leeres Array heisst "fuer
  -- niemanden sichtbar", nicht "fuer alle" - die Formular-Validierung
  -- (actions/ki-wissen.ts) verlangt deshalb mindestens eine Rolle.
  -- Ueberschneidung mit der Rolle der fragenden Person entscheidet
  -- ki_wissen_aehnliche_chunks() unten, nicht RLS allein - dasselbe
  -- Defense-in-Depth-Prinzip wie bei ki_anbieter.api_key_chiffrat.
  erlaubte_rollen   public.app_role[] not null default '{}',
  status            public.ki_wissen_status not null default 'wird_verarbeitet',
  fehlermeldung     text,
  hochgeladen_von   uuid references public.profiles(id) on delete set null,
  hochgeladen_am    timestamptz not null default now(),
  constraint ki_wissen_dokumente_titel_nicht_leer check (titel <> '')
);
comment on table public.ki_wissen_dokumente is
  'Vom Buero hochgeladene Wissensdokumente fuer den KI-Assistenten (RAG-Ergaenzung zu Anforderung 5.4/5.5). erlaubte_rollen filtert, wessen Chat-Kontext ein Dokument ueberhaupt erreichen kann; kategorie gliedert die Ablage in die vier Sachgebiete Risiko, Audit, Recht und Steuern (Anzeige gruppiert danach).';

alter table public.ki_wissen_dokumente enable row level security;

-- Verwaltung (hochladen, loeschen) bleibt admin-only, dieselbe Berechtigung
-- wie die Anbieterverwaltung (rbac.ts: "manage" bleibt admin vorbehalten,
-- nicht betriebsleitung - siehe Kommentar dort ueber ki_assistent:create vs.
-- ki_assistent:manage). Exakt dasselbe Muster wie ki_anbieter_admin_alles.
create policy ki_wissen_dokumente_admin_alles on public.ki_wissen_dokumente
  for all to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

-- ---------------------------------------------------------------------------
-- 2. ki_wissen_chunks
-- ---------------------------------------------------------------------------
create table public.ki_wissen_chunks (
  id            uuid primary key default gen_random_uuid(),
  dokument_id   uuid not null references public.ki_wissen_dokumente(id) on delete cascade,
  -- Reihenfolge im Ursprungsdokument - nur fuer Fehlersuche/Anzeige, nicht
  -- fuer die Suche selbst (die geht rein ueber embedding <=>).
  position      integer not null,
  inhalt        text not null check (inhalt <> ''),
  embedding     extensions.vector(1024) not null,
  erstellt_am   timestamptz not null default now()
);
comment on table public.ki_wissen_chunks is
  'Zerlegte und eingebettete Textabschnitte eines ki_wissen_dokumente-Eintrags. Dimension 1024 passt zum Standardmodell in einbettung-client.ts (bge-m3, mehrsprachig) - ein anderes Modell braucht eine eigene Migration.';

create index ki_wissen_chunks_dokument_idx on public.ki_wissen_chunks (dokument_id);

-- HNSW statt IVFFlat: baut auch ohne vorab bekannte Datenmenge einen
-- brauchbaren Index (IVFFlat braucht eine Trainingsmenge, die bei einer
-- frisch angelegten Tabelle noch fehlt).
create index ki_wissen_chunks_embedding_idx on public.ki_wissen_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

alter table public.ki_wissen_chunks enable row level security;

-- Bewusst KEINE Policy: fuer 'authenticated' bleibt die Tabelle komplett
-- verschlossen, weder lesend noch schreibend. Die Aehnlichkeitssuche filtert
-- nach Rolle (naechster Abschnitt) und muss deshalb ohnehin ueber eine
-- security-definer-Funktion bzw. den service_role-Client (Hochladen, siehe
-- actions/ki-wissen.ts) laufen - dieselbe Begruendung wie bei
-- ki_anbieter.api_key_chiffrat.

-- ---------------------------------------------------------------------------
-- 3. Aehnlichkeitssuche mit Rollenfilter
-- ---------------------------------------------------------------------------
-- security definer, weil der aufrufende authenticated-Client
-- (data/ki-wissen.ts) die Tabellen sonst gar nicht lesen koennte (siehe
-- Policy-Kommentar oben) - die Rollenpruefung steht deshalb IN der Funktion,
-- nicht als RLS-Bedingung.
--
-- SICHERHEIT - warum es KEINEN Rollen-Parameter gibt: Die erste Fassung
-- dieser Funktion nahm die Rolle als Parameter (p_rolle) entgegen und
-- filterte danach. Das war faelschbar. Jede Funktion mit "grant execute ...
-- to authenticated" ist ueber PostgREST direkt aus dem Browser aufrufbar
-- (/rest/v1/rpc/...), nicht nur aus unserem Servercode - "bleibt
-- server-seitig gekapselt" stimmte also nicht. Vor dem Merge nachgestellt
-- (19.09.2026, lokale Instanz): als kunde angemeldet, mit p_rolle = 'admin'
-- aufgerufen, kam der Abschnitt eines reinen Admin-Dokuments zurueck.
--
-- Deshalb bestimmt die Funktion die Rolle jetzt selbst, ueber
-- public.current_app_role() (profiles.role zu auth.uid() - dieselbe Quelle,
-- auf der has_role() und damit jede RLS-Policy im Projekt beruht). Es gibt
-- keinen Weg mehr, eine Rolle mitzugeben: nicht abgewiesen, sondern gar
-- nicht vorhanden. Ohne Sitzung oder ohne Profil liefert current_app_role()
-- null, "null = any(...)" ist nie wahr - also kein Treffer (faellt zu).
-- Bitte NICHT wieder einen Rollen-Parameter einfuehren, auch nicht "nur fuer
-- die Admin-Vorschau": die Vorschau ist eine Darstellungsfrage im Client, der
-- Zugriff auf Dokumente richtet sich nach der echten Rolle.
--
-- Die alte Signatur wird zuerst entfernt, damit auf einer Datenbank, die
-- diese Migration schon in der alten Form kennt, keine faelschbare
-- Ueberladung neben der neuen stehen bleibt.
drop function if exists public.ki_wissen_aehnliche_chunks(extensions.vector, public.app_role, integer);

create or replace function public.ki_wissen_aehnliche_chunks(
  p_embedding extensions.vector(1024),
  p_anzahl integer default 4
)
returns table (
  dokument_titel text,
  inhalt text,
  aehnlichkeit double precision
)
language sql
security definer
set search_path = public, extensions
stable
as $$
  select
    d.titel as dokument_titel,
    c.inhalt,
    1 - (c.embedding <=> p_embedding) as aehnlichkeit
  from public.ki_wissen_chunks c
  join public.ki_wissen_dokumente d on d.id = c.dokument_id
  where d.status = 'bereit'
    and public.current_app_role() = any (d.erlaubte_rollen)
  order by c.embedding <=> p_embedding
  limit greatest(p_anzahl, 0);
$$;
comment on function public.ki_wissen_aehnliche_chunks is
  'Vektor-Aehnlichkeitssuche ueber ki_wissen_chunks, gefiltert auf Dokumente, die die ECHTE Rolle der aufrufenden Person sehen darf (current_app_role(), aus auth.uid()). Bewusst ohne Rollen-Parameter: ein uebergebener Wert war ueber PostgREST faelschbar (20261031000000, Kommentar dort). security definer, weil ki_wissen_chunks/-dokumente sonst fuer authenticated komplett verschlossen sind.';

-- "from public" allein reicht nicht: Supabase vergibt per Default-Privileges
-- EXECUTE auf jede neue Funktion ausdruecklich auch an anon - die erste
-- Fassung war damit sogar ohne Anmeldung aufrufbar. Ohne Sitzung liefert
-- current_app_role() zwar null und damit keinen Treffer; anon hat hier
-- trotzdem nichts verloren (zweite Schicht, falls sich die erste je aendert).
revoke all on function public.ki_wissen_aehnliche_chunks(extensions.vector, integer) from public, anon;
grant execute on function public.ki_wissen_aehnliche_chunks(extensions.vector, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Storage-Bucket fuer die Originaldateien
-- ---------------------------------------------------------------------------
-- Der Bucket laesst genau die Typen zu, die actions/ki-wissen.ts auch
-- auslesen kann (Klartext, Markdown, PDF ueber pdf-parse) - bewusst strenger
-- als noetig, statt eine Datei anzunehmen, die die Anwendung anschliessend
-- nicht verarbeiten kann. Ein PDF ohne Textebene (reiner Scan) wird
-- angenommen, liefert aber keinen Text und landet im Status "fehler".
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('wissensdokumente', 'wissensdokumente', false, 20971520,
   array['text/plain', 'text/markdown', 'application/pdf'])
on conflict (id) do nothing;

create policy wissensdokumente_lesen on storage.objects
  for select to authenticated
  using (bucket_id = 'wissensdokumente' and public.has_role('admin'));

create policy wissensdokumente_hochladen on storage.objects
  for insert to authenticated
  with check (bucket_id = 'wissensdokumente' and public.has_role('admin'));

create policy wissensdokumente_loeschen on storage.objects
  for delete to authenticated
  using (bucket_id = 'wissensdokumente' and public.has_role('admin'));
