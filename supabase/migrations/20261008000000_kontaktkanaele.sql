-- =============================================================================
-- Damicon - Lokale Kontaktkanaele und Zahlungswege (Masterplan-Anforderung 5.6)
-- =============================================================================
-- Nutzer-Entscheidung: nur anzeigen, keine echte API-Integration (kein
-- WhatsApp-Business-API-Versand, kein Kaspi-Zahlungsabgleich). Diese Tabelle
-- traegt ausschliesslich Anzeige-/Kontaktdaten, die das Buero pflegt und die
-- oeffentlich auf der Website erscheinen - Platzhalterwerte bis echte Konten
-- eingetragen werden (siehe Seed unten).
-- =============================================================================

set search_path = public;

create type public.kontaktkanal_typ as enum (
  'whatsapp', 'telegram', 'instagram', 'kaspi_qr', 'sonstiges'
);

create table public.kontaktkanaele (
  id           uuid primary key default gen_random_uuid(),
  typ          public.kontaktkanal_typ not null,
  bezeichnung  text not null,
  wert         text,
  aktiv        boolean not null default true,
  reihenfolge  integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.kontaktkanaele is
  'Anforderung 5.6: lokal etablierte Kontaktkanaele/Zahlungswege, reine Anzeige, keine API-Integration. wert bleibt bis zur Pflege durch das Buero ein Platzhalter.';

create trigger trg_kontaktkanaele_updated before update on public.kontaktkanaele
  for each row execute function public.set_updated_at();

alter table public.kontaktkanaele enable row level security;
alter table public.kontaktkanaele force row level security;

-- Oeffentlich (Website, anon): nur aktive Kanaele.
create policy kontaktkanaele_select_public on public.kontaktkanaele
  for select to anon
  using (aktiv = true);

-- Angemeldet: auch inaktive/noch nicht gepflegte Entwuerfe sichtbar, damit
-- das Buero sieht, was noch aussteht.
create policy kontaktkanaele_select_intern on public.kontaktkanaele
  for select to authenticated
  using (true);

create policy kontaktkanaele_write_leitung on public.kontaktkanaele
  for all to authenticated
  using (public.has_role('admin', 'betriebsleitung'))
  with check (public.has_role('admin', 'betriebsleitung'));

-- Platzhalter-Seed: als solche erkennbar (wert ist null), keine erfundenen
-- Nummern/Links. aktiv=false, bis das Buero echte Werte eintraegt und den
-- Kanal freischaltet - so erscheint auf der oeffentlichen Seite nichts
-- Unfertiges. Keine Unique-Constraint auf "typ" (mehrere Konten desselben
-- Kanaltyps sind denkbar, z. B. zwei WhatsApp-Nummern) - die
-- Wiederholbarkeit der Migration sichert stattdessen ein expliziter
-- Existenz-Check.
insert into public.kontaktkanaele (typ, bezeichnung, wert, aktiv, reihenfolge)
select v.typ::public.kontaktkanal_typ, v.bezeichnung, null, false, v.reihenfolge
from (values
  ('whatsapp', 'WhatsApp Business', 1),
  ('kaspi_qr', 'Kaspi QR', 2),
  ('telegram', 'Telegram', 3)
) as v(typ, bezeichnung, reihenfolge)
where not exists (select 1 from public.kontaktkanaele k where k.bezeichnung = v.bezeichnung);
