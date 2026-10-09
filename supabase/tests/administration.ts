import { existsSync, readFileSync } from "node:fs";
import {
  adminSeiteBySlug,
  adminSeiteHref,
  ADMINISTRATION,
  ADMINISTRATION_HREF,
  adminSeiten,
  darfAdministrieren,
  sichtbareAdminSeiten,
} from "../../src/lib/administration";
import { hasPermission, roles } from "../../src/lib/rbac";
import { modules, zones } from "../../src/lib/modules";

// Der Bereich Administration (lib/administration.ts): eigene Gruppe in der Seitenleiste nach den vier Zonen, mit den
// Seiten KI-Anbieter, Ratenlimit und Wissensbasis im Hauptbereich. Geprueft werden die Regeln (wer sieht ihn), die
// Vollstaendigkeit (Texte in vier Sprachen, Routen, Symbole) und dass die Navigation ihn an allen Stellen kennt. Die
// Darstellung der Leiste selbst laeuft im Browser; hier steht, was ohne Browser pruefbar ist.

let bestanden = 0;
let fehlgeschlagen = 0;

function pruefe(name: string, bedingung: boolean, zusatz = "") {
  if (bedingung) {
    bestanden++;
    console.log(`PASS  ${name}${zusatz ? "  - " + zusatz : ""}`);
  } else {
    fehlgeschlagen++;
    console.log(`FAIL  ${name}${zusatz ? "  - " + zusatz : ""}`);
  }
}

const lies = (pfad: string) => readFileSync(pfad, "utf8");

// --- 1. Regeln ----------------------------------------------------------------------------------
pruefe("Bereich: drei Seiten (KI-Anbieter, Ratenlimit, Wissensbasis) in dieser Reihenfolge", adminSeiten.map((s) => s.key).join() === "ki-anbieter,ratenlimit,wissensbasis");
pruefe("Bereich: Schluessel und Pfadstuecke sind eindeutig, der Pfad ist /dashboard/administration/<seite>", new Set(adminSeiten.map((s) => s.slug)).size === adminSeiten.length && adminSeiten.every((s) => adminSeiteHref(s) === `/dashboard/administration/${s.slug}`) && ADMINISTRATION_HREF === "/dashboard/administration");
pruefe("Bereich: adminSeiteBySlug findet jede Seite, eine unbekannte nicht", adminSeiten.every((s) => adminSeiteBySlug(s.slug) === s) && adminSeiteBySlug("gibt-es-nicht") === undefined && adminSeiteBySlug("") === undefined);

const sehenAdmin = roles.filter((r) => darfAdministrieren(r));
pruefe("Rechte: nur die Administration sieht den Bereich (ki_assistent:manage), keine andere der Rollen", sehenAdmin.join() === "admin", sehenAdmin.join());
pruefe("Rechte: dieselbe Regel wie bisher die Verwaltung im KI-Panel (ki_assistent:manage)", roles.every((r) => darfAdministrieren(r) === hasPermission(r, "ki_assistent", "manage")));
pruefe("Rechte: die Geschaeftsfuehrung (ceo) sieht ihn nicht, obwohl sie sonst fast alles sieht", !darfAdministrieren("ceo"));
pruefe("Rechte: ohne Rolle (nicht angemeldet) sieht niemand den Bereich", !darfAdministrieren(null) && !darfAdministrieren(undefined));
pruefe("Sichtbar: die Administration bekommt alle drei Seiten, jede andere Rolle keine", sichtbareAdminSeiten("admin").length === 3 && roles.filter((r) => r !== "admin").every((r) => sichtbareAdminSeiten(r).length === 0) && sichtbareAdminSeiten(null).length === 0);

// --- 2. Keine fuenfte Zone ----------------------------------------------------------------------
pruefe("Zonen: bleiben vier (Feld, Hof, Buero, Markt), Administration ist keine Zone", zones.map((z) => z.key).join() === "feld,hof,buero,markt" && !zones.some((z) => (z.key as string) === ADMINISTRATION));
pruefe("Zonen: kein Modul gehoert zur Administration, sie taucht also nicht auf der oeffentlichen Seite, im Handbuch und in den KI-Zielen auf", !modules.some((m) => (m.zone as string) === ADMINISTRATION));

// --- 3. Symbole und Texte -----------------------------------------------------------------------
const symbole = new Set([...lies("src/components/icon.tsx").matchAll(/^\s+"?([a-z0-9-]+)"?: [A-Z][A-Za-z0-9]+,?$/gm)].map((m) => m[1]!));
pruefe("Symbole: jede Seite und der Bereich haben ein Symbol in der Ablage (sonst steht der Rueckfall Sprout)", adminSeiten.every((s) => symbole.has(s.icon)) && symbole.has("shield-check"), adminSeiten.filter((s) => !symbole.has(s.icon)).map((s) => s.icon).join());

for (const loc of ["de", "en", "ru", "kk"]) {
  const m = JSON.parse(lies(`src/messages/${loc}.json`)) as {
    zones: Record<string, Record<string, string>>;
    administration: Record<string, string | Record<string, Record<string, string>>>;
    roles: Record<string, string>;
  };
  const a = m.administration;
  const seiten = a.seiten as Record<string, Record<string, string>>;
  pruefe(`Texte ${loc}: Name, Zeile und Beschreibung des Bereichs unter zones.administration (Menue, Mobilmenue, KI-Typen)`, ["name", "tagline", "description"].every((k) => !!m.zones.administration?.[k]));
  pruefe(`Texte ${loc}: Titel, Beschreibung, Oeffnen und Hinweis ohne Datenbank`, ["title", "description", "oeffnen", "keineUmgebung"].every((k) => typeof a[k] === "string" && !!a[k]));
  pruefe(`Texte ${loc}: jede Seite mit Kurzname, Titel und Beschreibung`, adminSeiten.every((s) => ["navTitle", "title", "description"].every((k) => !!seiten?.[s.key]?.[k])));
  pruefe(`Texte ${loc}: der Kurzname passt in die Spalte der Leiste (hoechstens 24 Zeichen, sonst wird er abgeschnitten)`, adminSeiten.every((s) => seiten[s.key]!.navTitle!.length <= 24), adminSeiten.map((s) => `${seiten[s.key]!.navTitle}=${seiten[s.key]!.navTitle!.length}`).join(" "));
}

// --- 4. Routen ----------------------------------------------------------------------------------
const uebersicht = "src/app/[locale]/dashboard/administration/page.tsx";
const unterseite = "src/app/[locale]/dashboard/administration/[seite]/page.tsx";
pruefe("Routen: Uebersicht und Unterseite sind da, ausserhalb von [zone] (feste Route vor der dynamischen)", existsSync(uebersicht) && existsSync(unterseite));
{
  const u = lies(uebersicht);
  const s = lies(unterseite);
  pruefe("Routen: beide Seiten pruefen das Recht auf dem Server und antworten sonst mit 404", /darfAdministrieren\(profil\?\.role\)/.test(u) && /notFound\(\)/.test(u) && /darfAdministrieren\(profil\?\.role\)/.test(s) && /notFound\(\)/.test(s));
  pruefe("Routen: die Unterseite prueft das Recht, BEVOR sie die Daten der Verwaltung laedt", s.indexOf("darfAdministrieren(profil?.role)") > 0 && s.indexOf("darfAdministrieren(profil?.role)") < s.indexOf("await inhalt(seite.key)"));
  pruefe("Routen: eine unbekannte Seite ist ein 404, jede der drei Seiten hat ihren Inhalt", /adminSeiteBySlug\(slug\)/.test(s) && /if \(!seite\) notFound\(\)/.test(s) && adminSeiten.every((x) => new RegExp(`case "${x.key}"`).test(s)));
  pruefe("Routen: die Seiten zeigen im Demo-Modus (ohne Datenbank) einen Hinweis statt der Formulare", /keineUmgebung/.test(s) && /isSupabaseConfigured\(\)/.test(s));
  pruefe("Routen: Verwaltungsformulare sind dieselben Komponenten wie vorher im Panel (kein zweiter Satz Formulare)", /KiAnbieterVerwaltung/.test(s) && /KiRatenlimitVerwaltung/.test(s) && /WissenVerwaltung/.test(s));
}

// --- 5. Navigation kennt den Bereich ------------------------------------------------------------
{
  const leiste = lies("src/components/dashboard/sidebar.tsx");
  pruefe("Seitenleiste: die Administration steht als letzte Gruppe, nach den Zonen", leiste.indexOf("for (const zone of zones)") > 0 && leiste.indexOf("key: ADMINISTRATION") > leiste.indexOf("for (const zone of zones)"));
  pruefe("Seitenleiste: die Gruppe erscheint nur mit sichtbaren Seiten (also nur fuer die Administration)", /const adminSeiten = sichtbareAdminSeiten\(role\);\s*if \(adminSeiten\.length > 0\)/.test(leiste));
  pruefe("Seitenleiste: Zonen und Administration laufen ueber dieselbe Gruppenkomponente (aufklappbar, gleiches Aussehen)", /gruppen\.map\(\(gruppe\)/.test(leiste) && (leiste.match(/<ZonenGruppe/g) ?? []).length === 1);

  const ziele = lies("src/components/dashboard/nav-ziele.ts");
  pruefe("Navigationsziele: die schmale Leiste und das Mobilmenue bekommen die Administration (nur mit Recht)", /darfAdministrieren\(role\)/.test(ziele) && /key: ADMINISTRATION/.test(ziele));
  pruefe("Navigationsziele: das Mobilmenue listet ihre Seiten als zweite Ebene", /zone === ADMINISTRATION/.test(ziele) && /sichtbareAdminSeiten\(role\)/.test(ziele));
  pruefe("Brotkrumen: Uebersicht > Administration > Seite, gebaut wie Zone und Modul", /segmente\[1\] === ADMINISTRATION/.test(ziele) && /adminSeiteBySlug\(segmente\[2\]\)/.test(ziele));

  const zustand = lies("src/components/dashboard/sidebar-zustand.ts");
  pruefe("Zustand: der Bereich der offenen Seite und der gemerkte Auf-/Zuklappzustand kennen die Administration", /if \(segment === ADMINISTRATION\) return ADMINISTRATION/.test(zustand) && /wert === ADMINISTRATION \|\|/.test(zustand));

  const mobil = lies("src/components/dashboard/untere-leiste.tsx");
  pruefe("Mobilmenue: der Zustand der zwei Ebenen traegt BereichKey statt nur ZoneKey", /useState<BereichKey \| null>/.test(mobil) && !/\bZoneKey\b/.test(mobil));

  const proxy = lies("src/proxy.ts");
  pruefe("Proxy: eine unbekannte Seite unter /dashboard/administration antwortet mit echtem 404 (wie ein unbekanntes Modul)", /zone === ADMINISTRATION\) return !adminSeiteBySlug\(slug\)/.test(proxy));
}

// --- 6. Das KI-Panel hat die Verwaltung abgegeben -----------------------------------------------
{
  const pane = lies("src/components/ki/ki-pane.tsx");
  const layout = lies("src/app/[locale]/dashboard/layout.tsx");
  pruefe("KI-Panel: Anbieter, Ratenlimit und Wissensdokumente stehen nicht mehr in den Einstellungen des Panels", !/ratenlimitVerwaltung|wissenVerwaltung/.test(pane) && !/anbieterVerwaltung\.titel|wissensVerwaltung\.titel/.test(pane));
  pruefe("KI-Panel: die Einstellungen (Haustier) bleiben fuer die Administration erreichbar, auch ohne Agent-Anbieter", /einstellungenZeigen/.test(pane) && /einstellungenZeigen=\{istKiAdmin\}/.test(layout));
  pruefe("Layout: laedt die Listen der Verwaltung nicht mehr bei jeder Seite (nur noch die Unterseiten der Administration)", !/ladeKiAnbieterListe|ladeKiRatenlimitEinstellungen|WissenVerwaltung|KiAnbieterVerwaltung/.test(layout));
}

console.log(`\nPruefungen: ${bestanden + fehlgeschlagen}   bestanden: ${bestanden}   fehlgeschlagen: ${fehlgeschlagen}`);
if (fehlgeschlagen > 0) process.exit(1);
console.log("Alle Pruefungen bestanden.");
