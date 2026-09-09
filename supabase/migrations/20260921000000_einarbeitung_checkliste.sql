-- =============================================================================
-- Damicon - Mehrsprachige Kurzeinarbeitung als bebilderte Checkliste (Anforderung 2.12)
-- =============================================================================
-- Bisher nur eine Video-Bibliothek (schulungsvideos), keine bebilderte
-- Checkliste, kein DB-gestuetztes Onboarding - das Modul "schulungen" galt
-- noch als Demo. Diese Migration ergaenzt zwei Tabellen:
--
--   1. einarbeitung_schritte - der Katalog selbst (Schritt, Icon, Titel und
--      Beschreibung je Sprache als JSONB statt fuenf einzelner Spalten pro
--      Feld, da es sich um echten fachlichen Inhalt handelt, nicht um
--      Oberflaechentexte aus den messages/*.json-Dateien. "Bebildert" ueber
--      ein Lucide-Icon je Schritt, dieselbe Design-Sprache wie modules.ts
--      (Feld icon dort), keine eigenen Bilddateien noetig - damit
--      automatisch offline verfuegbar, gleiches Prinzip wie die
--      Qualitaetsreferenz aus Anforderung 2.9.
--   2. einarbeitung_fortschritt - wer welchen Schritt wann abgehakt hat, je
--      pfluecker_id (Saisonkraft), nicht je profiles.id: nicht jede
--      Saisonkraft hat zwingend eine eigene Anmeldung (Rolle picker ist
--      optional, siehe 20260909010000_picker_rolle.sql), die Betriebsleitung
--      kann den Fortschritt auch ohne Picker-Login abhaken.
-- =============================================================================

set search_path = public;

create table public.einarbeitung_schritte (
  id           uuid primary key default gen_random_uuid(),
  reihenfolge  integer not null,
  icon         text not null,
  -- {"de": "...", "en": "...", "tr": "...", "kk": "...", "ru": "..."}
  titel        jsonb not null,
  beschreibung jsonb not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (reihenfolge)
);
comment on table public.einarbeitung_schritte is
  'Anforderung 2.12: Katalog der bebilderten Kurzeinarbeitung, Titel/Beschreibung je Sprache als JSONB.';
create trigger trg_einarbeitung_schritte_updated before update on public.einarbeitung_schritte
  for each row execute function public.set_updated_at();

create table public.einarbeitung_fortschritt (
  id           uuid primary key default gen_random_uuid(),
  pfluecker_id uuid not null references public.pfluecker(id) on delete cascade,
  schritt_id   uuid not null references public.einarbeitung_schritte(id) on delete cascade,
  erledigt_am  timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  unique (pfluecker_id, schritt_id)
);
comment on table public.einarbeitung_fortschritt is
  'Anforderung 2.12: welche Saisonkraft welchen Einarbeitungsschritt wann abgehakt hat.';
create index idx_einarbeitung_fortschritt_pfluecker on public.einarbeitung_fortschritt(pfluecker_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.einarbeitung_schritte enable row level security;
alter table public.einarbeitung_schritte force row level security;
alter table public.einarbeitung_fortschritt enable row level security;
alter table public.einarbeitung_fortschritt force row level security;

-- Katalog: alle mit Zugriff auf das Modul "schulungen" lesen (admin,
-- betriebsleitung, erzeuger, picker - siehe rbac.ts), nur admin/
-- betriebsleitung pflegen ihn.
create policy einarbeitung_schritte_select on public.einarbeitung_schritte
  for select to authenticated
  using (public.has_role('admin', 'betriebsleitung', 'erzeuger', 'picker'));

create policy einarbeitung_schritte_write on public.einarbeitung_schritte
  for all to authenticated
  using (public.has_role('admin', 'betriebsleitung'))
  with check (public.has_role('admin', 'betriebsleitung'));

-- Fortschritt: Buero sieht/pflegt alles, ein picker sieht und setzt
-- ausschliesslich den eigenen (permissiv zusaetzlich zur Buero-Policy,
-- gleiches Verknuepfungsmuster wie lohn_abrechnungen_select_own).
create policy einarbeitung_fortschritt_select_buero on public.einarbeitung_fortschritt
  for select to authenticated
  using (public.has_role('admin', 'betriebsleitung'));

create policy einarbeitung_fortschritt_write_buero on public.einarbeitung_fortschritt
  for all to authenticated
  using (public.has_role('admin', 'betriebsleitung'))
  with check (public.has_role('admin', 'betriebsleitung'));

create policy einarbeitung_fortschritt_select_own on public.einarbeitung_fortschritt
  for select to authenticated
  using (
    pfluecker_id = (
      select p.pfluecker_id from public.profiles p where p.auth_user_id = auth.uid()
    )
  );

create policy einarbeitung_fortschritt_insert_own on public.einarbeitung_fortschritt
  for insert to authenticated
  with check (
    pfluecker_id is not null
    and pfluecker_id = (
      select p.pfluecker_id from public.profiles p where p.auth_user_id = auth.uid()
    )
  );

-- Ein Schritt bleibt abgehakt: kein Update-Pfad fuer irgendjemanden vorgesehen
-- (weder Buero- noch Own-Policy erlauben UPDATE), eine Korrektur ist nur
-- Loeschen und neu Abhaken durchs Buero.
create policy einarbeitung_fortschritt_delete_buero on public.einarbeitung_fortschritt
  for delete to authenticated
  using (public.has_role('admin', 'betriebsleitung'));

-- Acht Startschritte, fachlich aus den bereits umgesetzten Anforderungen
-- dieses Projekts abgeleitet (Nachweiskette, Kuehlkette, Qualitaetsstandard).
insert into public.einarbeitung_schritte (reihenfolge, icon, titel, beschreibung) values
(1, 'qr-code',
 '{"de":"Ausweis am Sammelpunkt zeigen","en":"Show your badge at the collection point","tr":"Toplama noktasında kimliğini göster","kk":"Жинау пунктінде куәлікті көрсету","ru":"Показать пропуск на пункте сбора"}',
 '{"de":"Der Pflückerausweis wird bei jeder Steige gescannt, so bleibt jede Menge einer Person zuordenbar.","en":"The picker badge is scanned for every crate so each quantity can be traced back to one person.","tr":"Hasatçı kimliği her kasada okutulur, böylece her miktar bir kişiye bağlanabilir.","kk":"Терімші куәлігі әр жәшікте оқылады, осылайша әр мөлшер бір адамға тіркеледі.","ru":"Пропуск сборщика сканируется на каждом ящике, поэтому каждый объём можно проследить до конкретного человека."}'
),
(2, 'package',
 '{"de":"Steige richtig füllen","en":"Fill the crate correctly","tr":"Kasayı doğru doldur","kk":"Жәшікті дұрыс толтыру","ru":"Правильно заполнять ящик"}',
 '{"de":"Nicht über den Rand füllen. Eine überfüllte Schale drückt auf die untere Lage, die dann Saft verliert.","en":"Do not fill above the rim. An overfilled punnet presses on the bottom layer, which then loses juice.","tr":"Kenarın üzerine doldurma. Aşırı dolu bir kap alt katmana baskı yapar ve alt katman su kaybeder.","kk":"Жиегінен асырып толтырмаңыз. Шамадан тыс толтырылған науа астыңғы қабатты басады, ол шырынын жоғалтады.","ru":"Не наполнять выше края. Переполненный лоток давит на нижний слой, и тот теряет сок."}'
),
(3, 'snowflake',
 '{"de":"Kühlkette: 60 Minuten bis zur Vorkühlung","en":"Cold chain: 60 minutes until pre-cooling","tr":"Soğuk zincir: ön soğutmaya kadar 60 dakika","kk":"Салқындату тізбегі: алдын ала салқындатуға дейін 60 минут","ru":"Холодильная цепь: 60 минут до предварительного охлаждения"}',
 '{"de":"Ab dem Pflücken zählt die Uhr. Nach 60 Minuten ohne Vorkühlung gilt die Charge als Verstoß.","en":"The clock starts at picking. After 60 minutes without pre-cooling, the batch counts as a violation.","tr":"Saat toplamayla başlar. Ön soğutma olmadan 60 dakika sonra parti ihlal sayılır.","kk":"Есеп теруден басталады. Алдын ала салқындатусыз 60 минуттан кейін топтама бұзушылық болып саналады.","ru":"Отсчёт начинается со сбора. Через 60 минут без предварительного охлаждения партия считается нарушением."}'
),
(4, 'sprout',
 '{"de":"Reife erkennen","en":"Recognise ripeness","tr":"Olgunluğu tanı","kk":"Пісуін тану","ru":"Распознавать спелость"}',
 '{"de":"Eine reife Himbeere löst sich leicht vom Strauch, der Blütenboden bleibt dort zurück.","en":"A ripe raspberry comes off the cane easily, the white core stays behind on the plant.","tr":"Olgun ahududu daldan kolayca ayrılır, çekirdek dalda kalır.","kk":"Пісіп жетілген таңқурай бұтадан оңай бөлінеді, оның ортасы бұтада қалады.","ru":"Спелая малина легко отделяется от куста, а плодоложе остаётся на растении."}'
),
(5, 'shield-alert',
 '{"de":"Gesperrte Blöcke nicht betreten","en":"Do not enter locked blocks","tr":"Kilitli bloklara girme","kk":"Бұғатталған блоктарға кірмеу","ru":"Не заходить на заблокированные участки"}',
 '{"de":"Nach einer Pflanzenschutzbehandlung ist ein Block bis zum Ablauf der Wartezeit gesperrt, das System verhindert die Aufgabe automatisch.","en":"After a plant protection treatment a block is locked until the waiting period ends, the system blocks the task automatically.","tr":"Bitki koruma uygulamasından sonra blok, bekleme süresi bitene kadar kilitlenir, sistem görevi otomatik olarak engeller.","kk":"Өсімдікті қорғау өңдеуінен кейін блок күту мерзімі аяқталғанша бұғатталады, жүйе тапсырманы автоматты түрде тоқтатады.","ru":"После обработки средством защиты растений участок заблокирован до истечения срока ожидания, система автоматически блокирует задачу."}'
),
(6, 'clock',
 '{"de":"Arbeitszeit korrekt melden","en":"Report working time correctly","tr":"Çalışma süresini doğru bildir","kk":"Жұмыс уақытын дұрыс тіркеу","ru":"Правильно отмечать рабочее время"}',
 '{"de":"Arbeitsbeginn und -ende werden im Moment der Erfassung festgehalten, nicht nachträglich - Grundlage der Lohnberechnung.","en":"Start and end of work are recorded at the actual moment, not afterwards - this is the basis for wage calculation.","tr":"Çalışmanın başlangıcı ve bitişi, kaydedildiği anda tutulur, sonradan değil - ücret hesaplamasının temeli budur.","kk":"Жұмыстың басталуы мен аяқталуы кейін емес, тіркелген сәтте белгіленеді, бұл жалақыны есептеудің негізі.","ru":"Начало и конец работы фиксируются в момент отметки, а не задним числом, это основа расчёта зарплаты."}'
);
