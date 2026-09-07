-- =============================================================================
-- Damicon - Oeffentliche Herkunftsauskunft (WMCNL-1456)
-- =============================================================================
-- Wer eine Schale in der Hand haelt, soll die Herkunft pruefen koennen, ohne
-- sich anzumelden. Seit der Haertungsmigration (20260905160000_haerten.sql)
-- ist chargen aber ausschliesslich fuer authenticated lesbar - aus gutem
-- Grund, die Tabelle traegt auch den Verweis auf die Pflueckaufgabe.
--
-- Diese Migration oeffnet keine einzige Basistabelle fuer anon. Stattdessen
-- bekommt jede Charge einen eigenen, nicht erratbaren Code
-- (oeffentlicher_code, Format hk_ + 16 Hexstellen aus gen_random_uuid() - 64
-- Bit Zufall, praktisch nicht durchprobierbar; eine fortlaufende Chargen-ID
-- waere es sofort), und eine einzelne SECURITY-DEFINER-Funktion liest genau
-- eine Zeile fuer genau diesen Code.
--
-- Bewusst kein View: das Schwesterprojekt "Digitalisierung-Himbeerenbetrieb"
-- loest dieselbe Anforderung ueber eine View mit "grant select ... to anon"
-- (public.v_public_trace). Ein View laesst sich aber ohne Filter abfragen -
-- ein direkter REST-Aufruf ohne ?oeffentlicher_code=eq... laege dort offen
-- und lieferte JEDE Charge mit Code auf einmal. Genau die vollstaendige
-- Aufzaehlung, vor der die Codelaenge eigentlich schuetzen soll. Eine
-- Funktion mit Pflichtparameter macht das strukturell unmoeglich statt nur
-- durch App-Konvention zu vermeiden.
--
-- Ausgegeben werden ausschliesslich Reihenblock-Code, Sortenname, Erntetag,
-- die beiden Kuehlkette-Zeitpunkte samt Minutenwert und zwei Urteile
-- (Kuehlkette/Wartezeit eingehalten). Keine Chargen-ID, kein Pfluecker- oder
-- Mengenbezug, kein Preis - siehe der Integrationstest fuer die
-- Ausschlussliste verbotener Spalten.
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. Oeffentlicher Code je Charge
-- ---------------------------------------------------------------------------
alter table public.chargen
  add column if not exists oeffentlicher_code text;

-- Default zuerst ohne not-null setzen, damit bestehende Zeilen (Seed, bereits
-- angelegte Chargen) ueber das folgende UPDATE denselben Weg bekommen wie neue
-- Zeilen - kein separater Backfill-Algorithmus noetig.
alter table public.chargen
  alter column oeffentlicher_code
    set default ('hk_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));

update public.chargen
   set oeffentlicher_code = 'hk_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)
 where oeffentlicher_code is null;

alter table public.chargen
  alter column oeffentlicher_code set not null;

alter table public.chargen
  drop constraint if exists chargen_oeffentlicher_code_format;
alter table public.chargen
  add constraint chargen_oeffentlicher_code_format
  check (oeffentlicher_code ~ '^hk_[0-9a-f]{16}$');

create unique index if not exists idx_chargen_oeffentlicher_code
  on public.chargen (oeffentlicher_code);

comment on column public.chargen.oeffentlicher_code is
  'Zufaelliger Code fuer die oeffentliche Herkunftsauskunft (Funktion herkunftsauskunft). Nicht die Chargen-ID: eine fortlaufende ID liesse sich durchzaehlen.';

-- ---------------------------------------------------------------------------
-- 2. Die Auskunft selbst
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER, damit die Funktion trotz "force row level security" auf
-- chargen/reihenbloecke/sorten lesen kann, ohne dass anon selbst eine Policy
-- auf diesen Tabellen braucht - derselbe Mechanismus wie bei
-- charge_zur_aufgabe_anlegen() und kuehlkette_bewerten() in
-- 20260905180000_nachweiskette.sql. Der interne Aufruf von
-- rueckstandsnachweis() (SECURITY INVOKER) laeuft dabei im Rechtekontext
-- dieser Funktion weiter, nicht im Rechtekontext von anon - genau deshalb
-- funktioniert die Wiederverwendung hier, obwohl anon rueckstandsnachweis()
-- nicht direkt sinnvoll aufrufen koennte (die Basistabellen bleiben fuer anon
-- verriegelt).
create or replace function public.herkunftsauskunft(p_code text)
returns table (
  reihenblock_code        text,
  sorte_name              text,
  ernte_datum             date,
  pflueck_zeitpunkt       timestamptz,
  vorkuehlung_zeitpunkt   timestamptz,
  minuten_bis_vorkuehlung integer,
  kuehlkette_eingehalten  boolean,
  wartezeit_eingehalten   boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_charge record;
begin
  -- Falsches Format erst gar nicht gegen die Tabelle fragen - spart die
  -- Abfrage und liefert denselben "kein Treffer" wie ein falscher, aber
  -- formal gueltiger Code. Der Format-Constraint oben sorgt ohnehin dafuer,
  -- dass keine gespeicherte Zeile je anders aussehen koennte; das hier ist
  -- zusaetzliche Sorgfalt an einer oeffentlich erreichbaren Stelle.
  if p_code is null or p_code !~ '^hk_[0-9a-f]{16}$' then
    return;
  end if;

  select c.id, c.ernte_datum, c.pflueck_zeitpunkt, c.vorkuehlung_zeitpunkt,
         r.code as reihenblock_code, s.name as sorte_name
    into v_charge
    from public.chargen c
    left join public.reihenbloecke r on r.id = c.reihenblock_id
    left join public.sorten s on s.id = c.sorte_id
   where c.oeffentlicher_code = p_code;

  -- Kein Treffer: leere Ergebnismenge statt Fehler oder Zeile mit NULLs -
  -- ein falscher Code sieht fuer den Aufrufer nicht anders aus als ein
  -- Systemfehler waere, und genau das soll er auch nicht.
  if not found then
    return;
  end if;

  reihenblock_code := v_charge.reihenblock_code;
  sorte_name := v_charge.sorte_name;
  ernte_datum := v_charge.ernte_datum;
  pflueck_zeitpunkt := v_charge.pflueck_zeitpunkt;
  vorkuehlung_zeitpunkt := v_charge.vorkuehlung_zeitpunkt;

  minuten_bis_vorkuehlung := case
    when v_charge.pflueck_zeitpunkt is null or v_charge.vorkuehlung_zeitpunkt is null then null
    else greatest(0, (extract(epoch from (v_charge.vorkuehlung_zeitpunkt - v_charge.pflueck_zeitpunkt)) / 60)::integer)
  end;

  -- Dieselbe 60-Minuten-Grenze wie kuehlkette_bewerten() (Migration
  -- 20260905180000) - die oeffentliche Auskunft darf kein eigenes, laxeres
  -- Urteil erfinden. Ohne beide Zeitpunkte ist die Frage noch offen (null),
  -- nicht schon beantwortet.
  kuehlkette_eingehalten := case
    when minuten_bis_vorkuehlung is null then null
    else minuten_bis_vorkuehlung <= 60
  end;

  -- rueckstandsnachweis() liefert eine Zeile je Behandlung der letzten 90
  -- Tage vor der Ernte. Keine Behandlung in diesem Fenster heisst: nichts zu
  -- verletzen, also eingehalten (coalesce faengt die leere Ergebnismenge ab).
  select coalesce(bool_and(n.eingehalten), true)
    into wartezeit_eingehalten
    from public.rueckstandsnachweis(v_charge.id) n;

  return next;
end;
$$;

comment on function public.herkunftsauskunft(text) is
  'Oeffentliche Herkunftsauskunft zu genau einer Charge, adressiert ueber oeffentlicher_code. Keine Chargen-ID, kein Pfluecker- oder Mengenbezug, kein Preis.';

-- Anders als bei den uebrigen RPCs dieses Projekts (nur "grant ... to
-- authenticated", siehe rueckstandsnachweis/kpi_aktuell) hier ausdruecklich
-- revoke-dann-grant: diese Funktion ist die einzige im Schema, die absichtlich
-- fuer anon gedacht ist, und das soll im Code so stehen, nicht sich aus dem
-- Postgres-Standardverhalten (EXECUTE an PUBLIC) ergeben.
revoke all on function public.herkunftsauskunft(text) from public;
grant execute on function public.herkunftsauskunft(text) to anon, authenticated;
