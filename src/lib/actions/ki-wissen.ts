"use server";

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { requirePermission, type SessionProfile } from "@/lib/auth";
import { dbFehler, fehler, ok, zugriffsFehler, type AktionsStatus } from "@/lib/actions/status";
import { text, aktualisiere, protokolliere as protokolliereBasis } from "@/lib/actions/formular-helfer";
import { alleRollen, kiWissenKategorien, zerlegeInAbschnitte } from "@/lib/domain/ki-assistent";
import { alsVektorLiteral, erzeugeEinbettung } from "@/lib/ai/einbettung-client";
import type { Json } from "@/lib/database.types";

// Wissensdokumente fuer den KI-Assistenten (RAG-Ergaenzung zu Anforderung
// 5.4/5.5). Verwaltung bleibt admin-only, dieselbe Berechtigung wie die
// Anbieterverwaltung (requirePermission("ki_assistent","manage") - siehe
// Kommentar in rbac.ts: "manage" bleibt admin vorbehalten, nicht
// betriebsleitung).
//
// Angenommen werden .txt, .md und .pdf. Der PDF-Text kommt aus pdf-parse
// (v2: Klasse PDFParse statt der Standardfunktion aus v1, eigene Typen
// mitgeliefert). Eine PDF ohne Textebene - also ein reiner Scan - ergibt
// keinen Text; das faellt in dieselbe Behandlung wie eine leere Textdatei
// ("fehler.leeresDokument"), bewusst ohne OCR: Texterkennung auf Scans waere
// ein eigener Dienst, kein Nebenzug dieser Funktion.
//
// Bewusst offen (wie bei transkribiereSprachnachricht/Caesar): Einbetten
// laeuft hier synchron innerhalb der Server Action, ein Chunk nach dem
// anderen. Fuer ein einzelnes, mittelgrosses Dokument ist das die einfachste
// Umsetzung; bei vielen oder sehr grossen Dokumenten waere eine
// Hintergrundverarbeitung (Queue/Worker) die naechste, hier noch nicht
// gebaute Ausbaustufe - der Admin sieht den Status ("wird_verarbeitet")
// waehrenddessen live in der Liste (ladeKiWissenDokumente(), Aktualisierung
// per aktualisiere()/revalidatePath), es haengt also nichts unsichtbar.

const erlaubteEndungen = ["txt", "md", "pdf"] as const;
const maxDateigroesse = 20 * 1024 * 1024;

function protokolliere(
  profil: SessionProfile,
  aktion: string,
  ressourceId: string | null,
  metadata: Record<string, Json> = {},
) {
  return protokolliereBasis(profil, aktion, "ki_wissen_dokumente", ressourceId, metadata);
}

// Eigene Funktion statt inline: der Aufrufer kennt nur "Datei rein, Text
// raus", egal ob Klartext oder PDF.
async function extrahiereText(datei: File, endung: string): Promise<string> {
  if (endung !== "pdf") return datei.text();

  // Import erst hier statt am Dateikopf: pdf-parse zieht seinen
  // PDF.js-Unterbau mit, den eine .txt-Aufnahme nicht braucht.
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(await datei.arrayBuffer()) });
  try {
    const ergebnis = await parser.getText();
    return ergebnis.text ?? "";
  } finally {
    await parser.destroy();
  }
}

export async function kiWissenDokumentHochladen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("ki_assistent", "manage");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const titel = text(formData, "titel");
  if (!titel) return fehler("fehler.eingabe");

  // Pflichtfeld ohne Standardwert: waehlt niemand etwas aus, ist das ein
  // Eingabefehler und kein stillschweigendes Einsortieren in einen Topf.
  const kategorie = text(formData, "kategorie");
  if (!kategorie || !(kiWissenKategorien as readonly string[]).includes(kategorie)) {
    return fehler("fehler.eingabe");
  }

  const erlaubteRollen = formData
    .getAll("erlaubte_rollen")
    .map(String)
    .filter((r): r is (typeof alleRollen)[number] => (alleRollen as readonly string[]).includes(r));
  if (erlaubteRollen.length === 0) return fehler("fehler.eingabe");

  const datei = formData.get("datei");
  if (!(datei instanceof File) || datei.size === 0) return fehler("fehler.eingabe");
  if (datei.size > maxDateigroesse) return fehler("fehler.zuGross");

  const endung = datei.name.split(".").pop()?.toLowerCase() ?? "";
  if (!(erlaubteEndungen as readonly string[]).includes(endung)) {
    return fehler("fehler.dateityp");
  }

  const supabase = await createClient();
  // Kategorie als Ablageordner, wie in actions/dokumente.ts - so liegt die
  // Datei im Bucket dort, wo die Liste sie anzeigt.
  const storagePfad = `${kategorie}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${datei.name}`;

  const { error: uploadFehler } = await supabase.storage
    .from("wissensdokumente")
    .upload(storagePfad, datei, {
      contentType: datei.type || (endung === "pdf" ? "application/pdf" : "text/plain"),
      upsert: false,
    });
  if (uploadFehler) {
    console.error("[damicon] Wissensdokument-Upload fehlgeschlagen:", uploadFehler.message);
    return fehler("fehler.upload");
  }

  const { data: dokument, error: insertFehler } = await supabase
    .from("ki_wissen_dokumente")
    .insert({
      titel,
      dateiname: datei.name,
      kategorie: kategorie as (typeof kiWissenKategorien)[number],
      storage_pfad: storagePfad,
      erlaubte_rollen: erlaubteRollen,
      hochgeladen_von: profil.id,
    })
    .select("id")
    .single();

  if (insertFehler || !dokument) {
    await supabase.storage.from("wissensdokumente").remove([storagePfad]);
    return dbFehler(insertFehler ?? { message: "insert fehlgeschlagen" });
  }

  // Ab hier der service_role-Client: Einbetten und Einfuegen der Chunks
  // braucht Schreibzugriff auf ki_wissen_chunks, die fuer 'authenticated'
  // komplett verschlossen ist (siehe Migration) - kein Widerspruch zum
  // RBAC-Gate oben, das schon vor jedem weiteren Schritt lief.
  const dienst = createServiceRoleClient();
  const abschnitte = zerlegeInAbschnitte(await extrahiereText(datei, endung));

  if (abschnitte.length === 0) {
    await dienst
      .from("ki_wissen_dokumente")
      .update({ status: "fehler", fehlermeldung: "Datei enthaelt keinen extrahierbaren Text." })
      .eq("id", dokument.id);
    return fehler("fehler.leeresDokument");
  }

  const chunkZeilen: { dokument_id: string; position: number; inhalt: string; embedding: string }[] = [];
  for (let i = 0; i < abschnitte.length; i++) {
    const einbettung = await erzeugeEinbettung(abschnitte[i]);
    if (!einbettung.ok) {
      console.error("[damicon] Einbettung fehlgeschlagen:", einbettung.grund);
      await dienst
        .from("ki_wissen_dokumente")
        .update({ status: "fehler", fehlermeldung: `Einbettung fehlgeschlagen: ${einbettung.grund}` })
        .eq("id", dokument.id);
      return fehler("fehler.einbettung");
    }
    chunkZeilen.push({
      dokument_id: dokument.id,
      position: i,
      inhalt: abschnitte[i],
      embedding: alsVektorLiteral(einbettung.vektor),
    });
  }

  const { error: chunkFehler } = await dienst.from("ki_wissen_chunks").insert(chunkZeilen);
  if (chunkFehler) {
    await dienst
      .from("ki_wissen_dokumente")
      .update({ status: "fehler", fehlermeldung: chunkFehler.message })
      .eq("id", dokument.id);
    return dbFehler(chunkFehler);
  }

  await dienst.from("ki_wissen_dokumente").update({ status: "bereit" }).eq("id", dokument.id);

  await protokolliere(profil, "ki_wissen.hochgeladen", dokument.id, {
    titel,
    abschnitte: abschnitte.length,
  });
  aktualisiere(formData);
  return ok("ok.kiWissenHochgeladen", titel);
}

export async function kiWissenDokumentLoeschen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("ki_assistent", "manage");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const id = text(formData, "id");
  if (!id) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { data: dokument, error: leseFehler } = await supabase
    .from("ki_wissen_dokumente")
    .select("storage_pfad, titel")
    .eq("id", id)
    .maybeSingle();
  if (leseFehler) return dbFehler(leseFehler);
  if (!dokument) return fehler("fehler.eingabe");

  const { error } = await supabase.from("ki_wissen_dokumente").delete().eq("id", id);
  if (error) return dbFehler(error);

  await supabase.storage.from("wissensdokumente").remove([dokument.storage_pfad]);
  await protokolliere(profil, "ki_wissen.geloescht", id, { titel: dokument.titel });
  aktualisiere(formData);
  return ok("ok.kiWissenGeloescht", dokument.titel);
}
