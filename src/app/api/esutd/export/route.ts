import { getTranslations } from "next-intl/server";
import { getSessionProfile, requireAal2Aktuell } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { routing } from "@/i18n/routing";
import { csvDatei } from "@/lib/domain/csv";
import { ladeEsutdMeldungen } from "@/lib/data/esutd";
import { protokolliere } from "@/lib/actions/formular-helfer";

// Angaben der ЕСУТД-Meldungen als CSV-Datei (WMCNL-1447): GET /api/esutd/export?sprache=ru&status=offen.
//
// Fuer die Eingabe im staatlichen System, solange es keine Anbindung gibt (Stufe 2). Das System
// kennt kein amtliches Importformat, deshalb ist die Datei eine schlichte Tabelle, kein
// erfundenes Format. Sie enthaelt Namen und Ausweisnummern: Anmeldung, Recht und zweiter Faktor
// werden hier selbst geprueft (src/proxy.ts schliesst /api aus), jeder Abruf steht im Protokoll.
// Nur wer Meldungen erfassen darf (personal:update) bekommt die Datei, und sie zeigt nur, was die
// Zeilensicherheit ihr ohnehin zeigt.

function antwort(text: string, status: number) {
  return new Response(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const profil = await getSessionProfile();
  if (!profil) return antwort("Nicht angemeldet.", 401);
  if (!hasPermission(profil.role, "personal", "update")) return antwort("Keine Berechtigung.", 403);
  try {
    await requireAal2Aktuell();
  } catch {
    return antwort("Zweiter Faktor erforderlich.", 401);
  }

  const parameter = new URL(request.url).searchParams;
  const gewuenscht = parameter.get("sprache") ?? "";
  const sprache = (routing.locales as readonly string[]).includes(gewuenscht) ? gewuenscht : routing.defaultLocale;
  const nurOffene = parameter.get("status") !== "alle";

  const alle = await ladeEsutdMeldungen();
  const meldungen = nurOffene ? alle.filter((m) => m.status === "offen") : alle;

  const t = await getTranslations({ locale: sprache, namespace: "esutdAnsicht" });
  const kopf = ["person", "ausweis", "art", "vertrag", "datum", "frist", "beschreibung", "status", "erfasstAm", "bestaetigung"].map((s) => t(`export.spalte.${s}`));
  const tabelle = [
    kopf,
    ...meldungen.map((m) => [
      m.pfluecker ?? "",
      m.ausweis ?? "",
      t(`art.${m.art}`),
      m.vertragsnummer ?? "",
      m.ereignisAm ?? "",
      m.meldefristAm ?? "",
      m.beschreibung ?? "",
      t(`status.${m.status}`),
      m.erfasstAm ?? "",
      m.bestaetigung ?? "",
    ]),
  ];

  await protokolliere(profil, "esutd.export", "esutd", null, { anzahl: meldungen.length, status: nurOffene ? "offen" : "alle" });

  // Die Kodierungsmarke (BOM) sorgt dafuer, dass Excel kyrillische und kasachische Namen als UTF-8 liest.
  return new Response(`﻿${csvDatei(tabelle)}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="damicon-esutd-${nurOffene ? "offen" : "alle"}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
