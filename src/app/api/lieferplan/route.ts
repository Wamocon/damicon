import { getTranslations } from "next-intl/server";
import { getSessionProfile, requireAal2Aktuell } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { routing } from "@/i18n/routing";
import { icsKalender } from "@/lib/domain/ics";
import { lieferplanTermine } from "@/lib/domain/lieferplan";
import { ladeLieferplanQuelle } from "@/lib/data/lieferplan";

// Lieferplan als Kalenderdatei (WMCNL-1472): GET /api/lieferplan?sprache=ru.
//
// Ein Download an die Sitzung, kein Abo-Link. Ein Kalenderabo braucht eine Adresse,
// die ohne Anmeldung antwortet, und damit ein Geheimnis in der URL, das in Verlaeufen,
// Weiterleitungen und Kalenderservern liegen bleibt. Hier muss die Person angemeldet
// sein, und die Datei zeigt nur, was die Zeilensicherheit ihr ohnehin zeigt (der Kunde
// seine eigenen Termine, das Buero alle). Wer den Plan aktuell halten will, ruft die
// Datei erneut ab; ein Import mit gleichbleibender Kennung (UID) ersetzt die Termine.
//
// src/proxy.ts schliesst /api aus, deshalb prueft dieser Handler Anmeldung, Recht und
// zweiten Faktor selbst.

const DATEINAME = "damicon-lieferplan.ics";

function antwort(text: string, status: number) {
  return new Response(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const profil = await getSessionProfile();
  if (!profil) return antwort("Nicht angemeldet.", 401);
  if (!hasPermission(profil.role, "b2b_portal", "view")) return antwort("Keine Berechtigung.", 403);
  try {
    await requireAal2Aktuell();
  } catch {
    return antwort("Zweiter Faktor erforderlich.", 401);
  }

  // Die Sprache der Texte in der Datei: eine bekannte Oberflaechensprache, sonst Deutsch.
  const gewuenscht = new URL(request.url).searchParams.get("sprache") ?? "";
  const sprache = (routing.locales as readonly string[]).includes(gewuenscht) ? gewuenscht : routing.defaultLocale;

  const geladen = await ladeLieferplanQuelle();
  if (!geladen) return antwort("Der Lieferplan konnte nicht geladen werden.", 500);

  const t = await getTranslations({ locale: sprache, namespace: "lieferplan" });
  const termine = lieferplanTermine(geladen.quelle, geladen.heute, (art, d) => {
    const menge = String(Math.round(d.mengeKg * 100) / 100);
    const sorte = d.sorte ?? t("ohneSorte");
    const zeilen = [
      art === "lieferung" ? t("lieferungGeplant") : t(`status.${d.status}`),
      ...(d.kunde ? [t("kunde", { kunde: d.kunde })] : []),
      t("sorteMenge", { sorte, menge }),
    ];
    return {
      titel: art === "lieferung" ? t("titelLieferung", { menge, sorte }) : t("titelVorbestellung", { menge, sorte }),
      beschreibung: zeilen.join("\n"),
    };
  });

  const datei = icsKalender(termine, {
    jetzt: new Date(),
    name: t("kalenderName"),
    produkt: "-//WAMOCON//Damicon Lieferplan//EN",
  });

  return new Response(datei, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${DATEINAME}"`,
      // Personenbezogene Termine: kein Zwischenspeicher, auch nicht im Browser-Verlauf des Gemeinschaftsrechners.
      "Cache-Control": "no-store",
    },
  });
}
