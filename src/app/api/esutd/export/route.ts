import { getTranslations } from "next-intl/server";
import { hasPermission } from "@/lib/rbac";
import { sitzungFuerRoute, textAntwort } from "@/lib/api/sitzung";
import { csvDatei } from "@/lib/domain/csv";
import { ladeEsutdMeldungenStreng } from "@/lib/data/esutd";
import { protokolliereStreng } from "@/lib/actions/formular-helfer";

// Angaben der ЕСУТД-Meldungen als CSV-Datei (WMCNL-1447): GET /api/esutd/export?sprache=ru&status=offen.
//
// Fuer die Eingabe im staatlichen System, solange es keine Anbindung gibt (Stufe 2). Das System
// kennt kein amtliches Importformat, deshalb ist die Datei eine schlichte Tabelle, kein
// erfundenes Format. Sie enthaelt Namen und Ausweisnummern: Anmeldung, Recht und zweiter Faktor
// prueft sitzungFuerRoute() (src/proxy.ts schliesst /api aus), jeder Abruf steht im Protokoll.
// Nur wer Meldungen erfassen darf (personal:update) bekommt die Datei, und sie zeigt nur, was die
// Zeilensicherheit ihr ohnehin zeigt.

export async function GET(request: Request) {
  const sitzung = await sitzungFuerRoute(request, (rolle) => hasPermission(rolle, "personal", "update"));
  if (sitzung instanceof Response) return sitzung;
  const { profil, sprache, parameter } = sitzung;
  const nurOffene = parameter.get("status") !== "alle";

  // Ein Lesefehler ergibt einen Fehler, keine leere Datei mit 200: Wer eine leere Liste für "alles gemeldet" hält, versäumt die Meldefrist.
  let alle;
  try {
    alle = await ladeEsutdMeldungenStreng();
  } catch (error) {
    console.error("[damicon] ЕСУТД-Export: Meldungen lesen fehlgeschlagen:", error instanceof Error ? error.message : error);
    return textAntwort("Die Meldungen konnten nicht geladen werden.", 500);
  }
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

  // Die Datei enthaelt Namen und Ausweisnummern: ohne Eintrag im Protokoll geht sie nicht hinaus.
  if (!(await protokolliereStreng(profil, "esutd.export", "esutd", null, { anzahl: meldungen.length, status: nurOffene ? "offen" : "alle" }))) {
    return textAntwort("Der Zugriff konnte nicht protokolliert werden. Die Datei wird nicht ausgegeben.", 500);
  }

  // Die Kodierungsmarke (BOM) sorgt dafuer, dass Excel kyrillische und kasachische Namen als UTF-8 liest.
  return new Response(`﻿${csvDatei(tabelle)}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="damicon-esutd-${nurOffene ? "offen" : "alle"}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
