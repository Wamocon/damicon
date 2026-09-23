import { readFile } from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { getSessionProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";

// Das Produkthandbuch liegt als fertige HTML-Datei unter docs/manual/, je eine
// Fassung pro Sprache. Erzeugt werden sie aus scripts/handbuch/ mit
// `npm run handbuch`; diese Route liefert nur aus, sie baut nichts nach.
//
// Warum eine Route und nicht public/: auf dem Deckblatt steht "Vertraulich".
// Unter public/ waere das Handbuch fuer jeden im Netz lesbar, denn der Matcher
// in src/proxy.ts nimmt Pfade mit Dateiendung ausdruecklich aus. Als
// /dashboard/handbuch faellt es dagegen unter dieselbe Anmeldepflicht wie das
// uebrige Dashboard - ohne Sitzung leitet der Proxy auf die Anmeldung um, im
// Demo-Modus ohne Supabase bleibt es wie das Dashboard offen.
//
// Der Pfad steht als statisches Segment neben [zone]. Next.js bevorzugt das
// statische Segment, "handbuch" wird also nie als Zone missverstanden -
// dasselbe Muster wie bei /dashboard/compliance und /dashboard/sicherheit.

const VERZEICHNIS = path.join(process.cwd(), "docs", "manual");

// Deutsch traegt index.html, weil das die Datei ist, die auch beim direkten
// Oeffnen des Ordners erscheint.
function dateiFuer(locale: string): string {
  return locale === routing.defaultLocale ? "index.html" : `index-${locale}.html`;
}

// Die Dateien liegen ausserhalb von src/ und werden zur Laufzeit gelesen.
// Damit sie im Deployment vorhanden sind, zieht next.config.ts sie ueber
// outputFileTracingIncludes in die Ablaufumgebung dieser Route.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string }> },
) {
  // Zweite Verteidigungslinie. Der Proxy leitet Unangemeldete bereits auf die
  // Anmeldung um, aber er tut das ueber einen Pfad-Ausdruck in einer anderen
  // Datei - faellt dieser Pfad einmal aus dem Ausdruck, gaebe die Route ein
  // als vertraulich gekennzeichnetes Dokument ungeprueft heraus. Dieselbe
  // Prueflogik wie in den Geschwisterseiten (compliance/page.tsx): ohne
  // Supabase gibt es keine Sitzung, dann bleibt es wie das uebrige Dashboard
  // im Demo-Modus offen.
  if (isSupabaseConfigured() && !(await getSessionProfile())) notFound();

  const { locale } = await params;

  // Der Parameter kommt aus der Adresse. Ohne diese Pruefung liesse sich ueber
  // einen erfundenen Sprachcode am Dateinamen drehen - das Locale-Routing
  // faengt das zwar bereits ab, aber ein Pfad aus Nutzereingabe gehoert
  // gegen eine feste Liste geprueft, nicht gegen eine Annahme.
  const gueltig = (routing.locales as readonly string[]).includes(locale)
    ? locale
    : routing.defaultLocale;

  let html: string;
  try {
    html = await readFile(path.join(VERZEICHNIS, dateiFuer(gueltig)), "utf8");
  } catch {
    // Lieber eine lesbare Auskunft als ein 500er: faellt eine Fassung einmal
    // aus dem Deployment, soll erkennbar sein, woran es liegt.
    return new Response(
      '<!doctype html><html lang="de"><meta charset="utf-8">' +
        "<title>Handbuch nicht verfuegbar</title>" +
        '<p style="font-family:system-ui;padding:2rem">Das Produkthandbuch ist in dieser Umgebung nicht hinterlegt. ' +
        "Erwartet unter <code>docs/manual/</code>; erzeugen mit <code>npm run handbuch</code>.</p>",
      { status: 404, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Vertraulich: keine Zwischenspeicher auf dem Weg, und der Browser holt
      // nach einer Handbuch-Aktualisierung den neuen Stand statt des alten.
      "cache-control": "private, no-store",
    },
  });
}
