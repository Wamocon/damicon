"use server";

import { createClient } from "@/lib/supabase/server";
import { requirePermission, type SessionProfile } from "@/lib/auth";
import type { Json } from "@/lib/database.types";
import { heuteIso } from "@/lib/data/util";
import { ladeNachbarbetriebe } from "@/lib/data/zukauf";
import { ladeSorten } from "@/lib/data/standort";
import { parseZukauf } from "@/lib/import/zukauf-parser";
import {
  zukaufDbFehler,
  zukaufImportFehler,
  zukaufImportOk,
  zukaufZugriffsFehler,
  type ZukaufImportStatus,
} from "@/lib/actions/zukauf-status";
import { dbFehler, fehler, ok, zugriffsFehler, type AktionsStatus } from "@/lib/actions/status";
import { text, zahl, aktualisiere, protokolliere as protokolliereBasis } from "@/lib/actions/formular-helfer";

// Aggregator / Zukauf von Nachbarbetrieben (WMCNL-1453). Die Vorpruefung
// steht in src/lib/import/zukauf-parser.ts (reine Funktion, kein
// Datenbankzugriff) - diese Datei laedt nur die Referenzlisten, ruft den
// Parser auf und schreibt bei bestandener Pruefung ueber die atomare RPC
// public.zukauf_positionen_importieren() (siehe Migration
// 20260908140000_aggregator_zukauf.sql). requirePermission() ist die erste,
// die RLS-Schreib-Policy der Migration (admin/betriebsleitung) die zweite
// Verteidigungslinie - deren Kopf, Punkt 3, begruendet auch, warum eine
// "erzeuger"-Anmeldung hier trotz crud("aggregator") in rbac.ts kontrolliert
// an der RLS-Policy scheitert statt still Erfolg vorzutaeuschen.
//
// leerZukaufImport (Startwert fuer useActionState) kommt in der Client-
// Komponente direkt aus zukauf-status.ts, nicht von hier: eine "use server"-
// Datei darf ausschliesslich async Functions exportieren, ein Re-Export
// dieser Konstante wuerde den Build brechen.

function protokolliere(
  profil: SessionProfile,
  aktion: string,
  ressourceId: string | null,
  metadata: Record<string, Json> = {},
) {
  return protokolliereBasis(profil, aktion, "aggregator", ressourceId, metadata);
}

// Prueft die eingefuegte Eingabe und schreibt nur, wenn KEIN Fehlerbefund
// vorliegt (keine Teiluebernahme) - Warnungen und Hinweise blockieren nicht,
// bleiben aber in der Rueckgabe sichtbar, auch nach einem erfolgreichen Lauf.
export async function zukaufImportieren(
  _status: ZukaufImportStatus,
  formData: FormData,
): Promise<ZukaufImportStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("aggregator", "create");
  } catch (error) {
    return zukaufZugriffsFehler(error);
  }

  const eingabe = text(formData, "csv");
  if (!eingabe) return zukaufImportFehler("fehler.eingabe");

  const [nachbarbetriebe, sorten] = await Promise.all([
    ladeNachbarbetriebe(),
    ladeSorten(),
  ]);

  const ergebnis = parseZukauf(eingabe, { nachbarbetriebe, sorten }, heuteIso());
  const fehlerBefunde = ergebnis.befunde.filter((b) => b.stufe === "fehler");

  if (fehlerBefunde.length > 0) {
    return zukaufImportFehler(
      "fehler.zukaufBefunde",
      ergebnis.befunde,
      0,
      String(fehlerBefunde.length),
    );
  }
  if (ergebnis.zeilen.length === 0) {
    return zukaufImportFehler("fehler.eingabe", ergebnis.befunde);
  }

  const supabase = await createClient();
  const { data: anzahl, error } = await supabase.rpc("zukauf_positionen_importieren", {
    p_zeilen: ergebnis.zeilen.map((zeile) => ({
      nachbarbetrieb_id: zeile.nachbarbetriebId,
      sorte_id: zeile.sorteId,
      menge_kg: zeile.mengeKg,
      ernte_datum: zeile.datumIso,
    })),
  });

  if (error) return zukaufDbFehler(error, ergebnis.befunde);

  const uebernommen = anzahl ?? ergebnis.zeilen.length;
  await protokolliere(profil, "zukauf.importiert", null, { zeilen: uebernommen });
  aktualisiere(formData);
  return zukaufImportOk(ergebnis.befunde, uebernommen, "ok.zukaufImport", String(uebernommen));
}

// Preis nachtragen, sobald die Rechnung des Nachbarbetriebs vorliegt - beim
// Import ist preis_tenge_kg bewusst noch leer (siehe Migrationskopf, Punkt 2).
export async function zukaufPreisNachtragen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("aggregator", "update");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const id = text(formData, "id");
  const preis = zahl(formData, "preis_tenge_kg");
  if (!id || preis === null || preis < 0) return fehler("fehler.eingabe");

  const rechnungsdatum = text(formData, "rechnungsdatum") || null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("zukauf_positionen")
    .update({ preis_tenge_kg: preis, rechnungsdatum })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return dbFehler(error);
  if (!data) return fehler("fehler.berechtigung");

  await protokolliere(profil, "zukauf.preisNachgetragen", id, { preis });
  aktualisiere(formData);
  return ok("ok.zukaufPreis");
}
