import { getTranslations } from "next-intl/server";
import { sitzungFuerRoute, textAntwort } from "@/lib/api/sitzung";
import { dokumentAlsHtml } from "@/lib/dokument/damicon-dokument";
import { RAHMEN_NAMENSRAUM, rahmenTexte, type DokumentKontext, type Uebersetzer } from "@/lib/dokument/kontext";
import { DOKUMENT_ARTEN } from "@/lib/dokument/arten";
import { protokolliere } from "@/lib/actions/formular-helfer";

// Dokumente im Damicon-Layout: GET /api/dokument/<art>?sprache=ru&...
//
// Ein eigenstaendiges HTML-Dokument mit Deckblatt, Kopf- und Fusszeile, nummerierten Abschnitten und Siegel, das der Browser
// ueber "Drucken" zur PDF-Datei macht (wie der Compliance-Pruefbericht). Gebunden an die Sitzung: Anmeldung, Recht je Art und
// zweiter Faktor prueft sitzungFuerRoute() (src/proxy.ts schliesst /api aus), die Daten kommen mit den Rechten der Person
// (Zeilensicherheit). Jeder Abruf steht mit der Pruefsumme im Protokoll: so laesst sich spaeter zeigen, was herausgegeben wurde.
// Die Arten und ihre Parameter stehen in lib/dokument/arten.ts.

export async function GET(request: Request, { params }: { params: Promise<{ art: string }> }) {
  const { art } = await params;
  const definition = Object.hasOwn(DOKUMENT_ARTEN, art) ? DOKUMENT_ARTEN[art] : undefined;
  // Eine unbekannte Art laesst die Rechtepruefung durch, damit sie erst nach der Anmeldung mit 404 antwortet (nicht mit 403).
  const sitzung = await sitzungFuerRoute(request, (rolle) => !definition || definition.erlaubt(rolle));
  if (sitzung instanceof Response) return sitzung;
  if (!definition) return textAntwort("Unbekannte Dokumentart.", 404);
  const { profil, sprache, parameter } = sitzung;

  const uebersetzer = new Map<string, Uebersetzer>();
  for (const namensraum of new Set([RAHMEN_NAMENSRAUM, "roles", ...definition.namensraeume])) {
    uebersetzer.set(namensraum, (await getTranslations({ locale: sprache, namespace: namensraum })) as unknown as Uebersetzer);
  }
  const t = (namensraum: string): Uebersetzer => {
    const u = uebersetzer.get(namensraum);
    if (!u) throw new Error(`Namensraum ${namensraum} nicht geladen`);
    return u;
  };

  const x: DokumentKontext = {
    sprache,
    jetzt: new Date(),
    ersteller: { name: profil.fullName, rolle: t("roles")(profil.role) },
    t,
  };
  const eingabe = await definition.baue({ profil, parameter, x });
  if (!eingabe) return textAntwort("Nicht gefunden.", 404);

  await protokolliere(profil, "dokument.erzeugt", "dokumente", null, { art, kennung: eingabe.kennung, siegel: eingabe.siegel, sprache });

  return new Response(dokumentAlsHtml(eingabe, rahmenTexte(x)), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Personenbezogene Inhalte: kein Zwischenspeicher, auch nicht im Verlauf eines Gemeinschaftsrechners.
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
