"use server";

import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, type SessionProfile } from "@/lib/auth";
import { dbFehler, fehler, fehlerMitWerten, okMitWerten, zugriffsFehler, type AktionsStatus } from "@/lib/actions/status";
import { text, aktualisiere, protokolliere } from "@/lib/actions/formular-helfer";
import { LOGGER_MAX_BYTES, liesLoggerDatei, waehleMesswerte } from "@/lib/domain/logger-import";
import { istUuid } from "@/lib/utils";

// Temperaturlogger-Datei importieren (WMCNL-1517, Stufe 1). Dieselbe
// Berechtigung wie die Handerfassung einer Transportmessung (logistik:update);
// die RLS-Policy transport_messungen_insert_feld prueft dieselben Rollen ein
// zweites Mal, der Trigger transport_kuehlkette_bewerten() bewertet die Werte
// und lehnt Messungen auf stornierten und zugestellten Lieferungen ab. Den
// Messzeitpunkt setzt der Server aus dem Geraetezeitpunkt, hier wird er nicht
// selbst gesetzt.

const MAX_KENNUNG = 60;
/** So viele Zeilen gehen in einem Insert zum Server. */
const PAKET = 500;

export async function transportLoggerImportieren(_status: AktionsStatus, formData: FormData): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("logistik", "update");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const lieferungId = text(formData, "lieferung_id");
  const kennung = text(formData, "logger_kennung") || null;
  const datei = formData.get("datei");
  if (!istUuid(lieferungId) || !(datei instanceof File) || datei.size === 0) return fehler("fehler.eingabe");
  if (kennung && kennung.length > MAX_KENNUNG) return fehler("fehler.eingabe");
  if (datei.size > LOGGER_MAX_BYTES) return fehler("fehler.loggerDateiZuGross");

  const bytes = Buffer.from(await datei.arrayBuffer());
  const gelesen = liesLoggerDatei(bytes.toString("utf8"));
  if (gelesen.messwerte.length === 0) return fehler("fehler.loggerDateiLeer");

  const supabase = await createClient();
  // Was zu dieser Lieferung schon gespeichert ist: ein erneuter Import derselben Datei legt nichts doppelt an.
  const { data: vorhandene, error: ladeFehler } = await supabase
    .from("transport_temperatur_messungen")
    .select("gemessen_am")
    .eq("lieferung_id", lieferungId);
  if (ladeFehler) return dbFehler(ladeFehler);

  const vorhanden = new Set((vorhandene ?? []).map((v) => (v.gemessen_am ? new Date(v.gemessen_am).toISOString() : "")));
  const auswahl = waehleMesswerte(gelesen.messwerte, new Date(), vorhanden);
  const werte = {
    anzahl: auswahl.uebernehmen.length,
    zuAlt: auswahl.zuAlt,
    zukunft: auswahl.inDerZukunft,
    doppelt: auswahl.doppelt,
    unlesbar: gelesen.ungueltig,
  };
  if (auswahl.uebernehmen.length === 0) return fehlerMitWerten("fehler.loggerKeineNeuen", werte);

  for (let i = 0; i < auswahl.uebernehmen.length; i += PAKET) {
    const { error } = await supabase.from("transport_temperatur_messungen").insert(
      auswahl.uebernehmen.slice(i, i + PAKET).map((m) => ({
        lieferung_id: lieferungId,
        temperatur_c: m.temperaturC,
        geraet_zeitpunkt: m.zeitpunkt,
        // Wie bei transportMessungErfassen: der Trigger berechnet den Messzeitpunkt aus dem Geraetezeitpunkt.
        gemessen_am: null as unknown as string,
        quelle: "logger",
        logger_kennung: kennung,
      })),
    );
    // Ein Fehler mitten im Import laesst die schon geschriebenen Pakete stehen: sie sind echte
    // Messwerte, und ein erneuter Import ergaenzt den Rest (Duplikate werden erkannt).
    if (error) return dbFehler(error);
  }

  await protokolliere(profil, "lieferung.logger_import", "logistik", lieferungId, {
    ...werte,
    logger: kennung,
    datei: datei.name.slice(0, 120),
    // Der Fingerabdruck der Datei: wer spaeter fragt, ob die Werte aus genau dieser Datei stammen, kann es pruefen.
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });

  aktualisiere(formData);
  return okMitWerten("ok.loggerImport", werte);
}
