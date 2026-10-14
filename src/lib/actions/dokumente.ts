"use server";

import { createClient } from "@/lib/supabase/server";
import { bucket } from "@/lib/supabase/buckets";
import { requirePermission, type SessionProfile } from "@/lib/auth";
import {
  dbFehler,
  fehler,
  ok,
  zugriffsFehler,
  type AktionsStatus,
} from "@/lib/actions/status";
import { text, aktualisiere, protokolliere } from "@/lib/actions/formular-helfer";
import { partnerAusWert, warnungTageAus, zeitraumFehler } from "@/lib/domain/nachweise";
import { istUuid } from "@/lib/utils";

// Nachweisregister (Meilenstein B, WMCNL-1469). Die Datei ist optional: ein
// Dokument darf zuerst als Eintrag entstehen und die Datei spaeter bekommen -
// so arbeitet das Buero auch, wenn der Scan noch fehlt. Der Status eines
// Dokuments wird nicht mehr gesetzt, er folgt aus dem Gueltigkeitszeitraum
// (public.nachweis_status, Sicht v_dokumente).

const kategorien = [
  "spritzmittelprotokoll",
  "esutd_nachweis",
  "liefervertrag",
  "foerderdossier",
  "zertifikat",
  "sonstiges",
] as const;

const maxDateigroesse = 16 * 1024 * 1024;
const MAX_RECHTSGRUNDLAGE = 300;

// Die Felder des Registers, die beim Anlegen und beim Aendern gleich sind.
// Eine Stelle fuer die Pruefung, damit beide Wege dieselben Eingaben
// annehmen und dieselben ablehnen.
function leseNachweisfelder(
  formData: FormData,
):
  | { ok: true; felder: NachweisFelder }
  | { ok: false; status: AktionsStatus } {
  const name = text(formData, "name");
  const gueltigVon = text(formData, "gueltig_von") || null;
  const gueltigBis = text(formData, "gueltig_bis") || null;
  const unbefristet = formData.get("unbefristet") === "on";
  const warnungTage = warnungTageAus(text(formData, "warnung_tage"));
  const verantwortlichId = text(formData, "verantwortlich_id") || null;
  const rechtsgrundlage = text(formData, "rechtsgrundlage") || null;
  const partner = partnerAusWert(text(formData, "partner"));

  if (!name || warnungTage === null || partner === null) return { ok: false, status: fehler("fehler.eingabe") };
  if (verantwortlichId && !istUuid(verantwortlichId)) return { ok: false, status: fehler("fehler.eingabe") };
  if (rechtsgrundlage && rechtsgrundlage.length > MAX_RECHTSGRUNDLAGE) {
    return { ok: false, status: fehler("fehler.eingabe") };
  }
  const zeitraum = zeitraumFehler({ gueltigVon, gueltigBis, unbefristet });
  if (zeitraum) return { ok: false, status: fehler(`fehler.${zeitraum}`) };

  return {
    ok: true,
    felder: {
      name,
      bezug: text(formData, "bezug") || null,
      stand: text(formData, "stand") || null,
      gueltig_von: gueltigVon,
      gueltig_bis: gueltigBis,
      unbefristet,
      warnung_tage: warnungTage,
      verantwortlich_id: verantwortlichId,
      rechtsgrundlage,
      b2b_kunde_id: partner !== "keiner" && partner.art === "kunde" ? partner.id : null,
      nachbarbetrieb_id: partner !== "keiner" && partner.art === "nachbar" ? partner.id : null,
    },
  };
}

interface NachweisFelder {
  name: string;
  bezug: string | null;
  stand: string | null;
  gueltig_von: string | null;
  gueltig_bis: string | null;
  unbefristet: boolean;
  warnung_tage: number;
  verantwortlich_id: string | null;
  rechtsgrundlage: string | null;
  b2b_kunde_id: string | null;
  nachbarbetrieb_id: string | null;
}

export async function dokumentAnlegen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("dokumente", "create");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const kategorie = text(formData, "kategorie");
  const gelesen = leseNachweisfelder(formData);
  if (!gelesen.ok) return gelesen.status;
  if (!(kategorien as readonly string[]).includes(kategorie)) return fehler("fehler.eingabe");
  const { felder } = gelesen;

  const supabase = await createClient();
  const datei = formData.get("datei");
  let storagePfad: string | null = null;

  if (datei instanceof File && datei.size > 0) {
    if (datei.size > maxDateigroesse) return fehler("fehler.zuGross");

    const endung = datei.name.split(".").pop()?.toLowerCase() ?? "pdf";
    storagePfad = `${kategorie}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${endung}`;

    const { error: uploadFehler } = await supabase.storage
      .from(bucket("dokumente"))
      .upload(storagePfad, datei, { contentType: datei.type, upsert: false });

    if (uploadFehler) {
      console.error("[damicon] Upload fehlgeschlagen:", uploadFehler.message);
      return fehler("fehler.upload");
    }
  }

  // Anforderung 4.12: ein Nachweis kann direkt an ein Foerderdossier haengen.
  // Die Spalte samt Fremdschluessel gibt es seit 20260925000000, gefuellt hat
  // sie bisher nur der einmalige Backfill, ueber die Anwendung liess sich
  // kein Nachweis anhaengen.
  const dossierId = text(formData, "foerderdossier_id") || null;

  const { data, error } = await supabase
    .from("dokumente")
    .insert({
      ...felder,
      kategorie: kategorie as (typeof kategorien)[number],
      storage_path: storagePfad,
      foerderdossier_id: dossierId,
    })
    .select("id, name")
    .single();

  if (error) {
    if (storagePfad) await supabase.storage.from(bucket("dokumente")).remove([storagePfad]);
    return dbFehler(error);
  }

  await protokolliere(profil, "dokument.angelegt", "dokumente", data.id, {
    name: data.name,
    kategorie,
    gueltig_bis: felder.gueltig_bis,
    unbefristet: felder.unbefristet,
    datei: Boolean(storagePfad),
    foerderdossier_id: dossierId,
  });

  aktualisiere(formData);

  return ok("ok.dokument", data.name);
}

// Metadaten und Gueltigkeit eines Dokuments nachfuehren. Die UPDATE-Policy
// dokumente_update_buero (20260905120000) gab es von Anfang an, nur rief sie
// niemand auf: bis hierher liess sich ein einmal aufgenommenes Dokument weder
// umbenennen noch verlaengern. Die Datei selbst bleibt unangetastet
// (Ersetzen ist ein eigener Vorgang, siehe Modulnotiz).
export async function dokumentAendern(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("dokumente", "update");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const id = text(formData, "id");
  const gelesen = leseNachweisfelder(formData);
  if (!id || !istUuid(id)) return fehler("fehler.eingabe");
  if (!gelesen.ok) return gelesen.status;
  const { felder } = gelesen;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dokumente")
    .update(felder)
    .eq("id", id)
    .select("id, name")
    .maybeSingle();

  if (error) return dbFehler(error);
  // Keine Zeile getroffen: die Policy laesst diese Rolle nicht an das Dokument.
  if (!data) return fehler("fehler.berechtigung");

  await protokolliere(profil, "dokument.geaendert", "dokumente", data.id, {
    name: data.name,
    gueltig_bis: felder.gueltig_bis,
    unbefristet: felder.unbefristet,
  });

  aktualisiere(formData);
  return ok("ok.dokumentGeaendert", data.name);
}
