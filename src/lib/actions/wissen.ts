"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { DATENBANK_SCHEMA } from "@/lib/supabase/schema";
import { requirePermission, type SessionProfile } from "@/lib/auth";
import { fehler, ok, zugriffsFehler, type AktionsStatus } from "@/lib/actions/status";
import { aktualisiere, protokolliere, text } from "@/lib/actions/formular-helfer";
import { wissenEinbettung } from "@/lib/wissen/embed";
import { entscheideUeberUpload, type FreigabeAktion } from "@/lib/wissen/freigabe";
import { loescheHochgeladenesDokument } from "@/lib/wissen/loeschen";
import { pruefeUploadUmgebung, UploadFehler, verarbeiteUpload } from "@/lib/wissen/hochladen";
import { MAX_DATEI_BYTES } from "@/lib/wissen/upload-konstanten";
import { istUploadQuelleId } from "@/lib/wissen/upload-quelle";
import { supabaseSpeicher } from "@/lib/wissen/speicher-supabase";
import { gruppiereWissenDokumente, LISTE_SPALTEN, type WissenDokumentZeile, type WissenListeZeile } from "@/lib/wissen/dokumente-liste";

// Admin-Upload in die Wissensbasis (Recht, Steuer, Compliance, Audit, Risiko). Dieselbe Berechtigung wie die
// Anbieter- und Ratenlimit-Verwaltung: requirePermission("ki_assistent", "manage") - laut rbac.ts nur admin.
//
// Alles geschieht hier auf dem Server. Der Upload schreibt AUSDRUECKLICH nach Supabase (service_role), egal was
// wissenBackend() fuer die Suche waehlt: wissen_chunks ist der Ort, an dem Dokumente landen. Der Schluessel der
// Einbettung (WISSEN_EMBED_KEY / KI_SOKRATES_API_SCHLUESSEL) bleibt in der Serverumgebung.
//
// Vier-Augen-Prinzip: Ein Upload ist ungeprueft und niemandem sichtbar (auch dem Admin nicht, die Zeilensicherheit zeigt
// nur Freigegebenes), bis eine ZWEITE Person ihn freigibt (wissenDokumentPruefen, freigabe.ts). Die Liste und die
// Pruefung laufen deshalb ueber den Dienst-Client, nach der Rechtepruefung.
//
// Die Einbettung laeuft synchron in dieser Action (ein Aufruf je acht Abschnitte). Das Zeitbudget stellt
// dashboard/layout.tsx (maxDuration = 60); MAX_CHUNKS in lib/wissen/hochladen.ts begrenzt die Laenge so, dass
// ein Dokument in diesen Rahmen passt.

const FEHLER_SCHLUESSEL: Record<UploadFehler["code"], string> = {
  eingabe: "fehler.eingabe",
  vorschau: "fehler.wissenVorschau",
  dateityp: "fehler.wissenDateityp",
  zuGross: "fehler.zuGross",
  lesen: "fehler.wissenLesen",
  pdfDienst: "fehler.wissenPdfDienst",
  leer: "fehler.wissenLeer",
  zuLang: "fehler.wissenZuLang",
  doppelt: "fehler.wissenDoppelt",
  einbettung: "fehler.wissenEinbettung",
  zeit: "fehler.wissenZeit",
  speichern: "fehler.wissenSpeichern",
  quellenartGesperrt: "fehler.wissenQuellenartGesperrt",
  urlFehlt: "fehler.wissenUrlFehlt",
  urlUngueltig: "fehler.wissenUrlUngueltig",
  nichtLoeschbar: "fehler.wissenNichtLoeschbar",
  loeschen: "fehler.wissenLoeschen",
  gewichte: "fehler.wissenGewichte",
  nichtGefunden: "fehler.wissenNichtGefunden",
  nichtFreigebbar: "fehler.wissenNichtFreigebbar",
  nichtPruefbar: "fehler.wissenNichtPruefbar",
  selbstFreigabe: "fehler.wissenSelbstFreigabe",
  freigeben: "fehler.wissenFreigeben",
};

export async function wissenDokumentHochladen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("ki_assistent", "manage");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const datei = formData.get("datei");
  if (!(datei instanceof File) || datei.size === 0) return fehler("fehler.eingabe");
  // Die Groesse steht vor dem Einlesen der Datei in den Speicher fest.
  if (datei.size > MAX_DATEI_BYTES) return fehler("fehler.zuGross");

  try {
    // Vor dem Einlesen der Datei: in einer Vorschau-Umgebung (gemeinsame Datenbank) wird nichts geschrieben.
    pruefeUploadUmgebung();
    const ergebnis = await verarbeiteUpload(
      {
        titel: text(formData, "titel"),
        bereich: text(formData, "bereich"),
        rollen: formData.getAll("rollen").map(String),
        dateiname: datei.name,
        bytes: new Uint8Array(await datei.arrayBuffer()),
        hochgeladenVon: { id: profil.id, name: profil.fullName ?? null },
        quellenart: text(formData, "quellenart"),
        textgrundlage: text(formData, "textgrundlage"),
        url: text(formData, "quelle_url"),
      },
      {
        speicher: supabaseSpeicher(createServiceRoleClient() as unknown as SupabaseClient),
        einbettung: wissenEinbettung(),
      },
    );
    await protokolliere(profil, "wissen.hochgeladen", "wissen_chunks", null, {
      titel: text(formData, "titel"),
      bereich: text(formData, "bereich"),
      quelle_id: ergebnis.quelleId,
      abschnitte: ergebnis.chunks,
      quellenart: ergebnis.quellenart,
      autoritaetsstufe: ergebnis.autoritaetsstufe,
      pruefstatus: "ungeprueft",
    });
    aktualisiere(formData);
    return ok("ok.wissenHochgeladen", text(formData, "titel"));
  } catch (error) {
    if (error instanceof UploadFehler) {
      console.error("[damicon]", error.message);
      return fehler(FEHLER_SCHLUESSEL[error.code], error.wert);
    }
    console.error("[damicon] Wissens-Upload unerwartet fehlgeschlagen:", error);
    return fehler("fehler.unbekannt");
  }
}

export interface WissenDokumenteAntwort {
  dokumente: WissenDokumentZeile[];
  fehler: boolean;
  /** Die Wissensbasis hat mehr Textstellen, als die Liste lesen darf (MAX_SEITEN x SEITE): sie ist unvollstaendig. */
  abgeschnitten: boolean;
  /** profiles.id der angemeldeten Person: die Oberflaeche bietet "Freigeben" nur an, wer nicht selbst hochgeladen hat. */
  ichId: string | null;
  /** Nur bei fehler: Schema und Datenbankmeldung, damit die Verwaltung (nur Admin) die Ursache sieht, ohne ins Server-Log
   *  zu muessen. Typisch: eine Vorschau, die gegen das falsche Schema gebaut wurde (Spalte quellenart fehlt in public). */
  fehlerDetail?: string;
}

const SEITE = 1000;
const MAX_SEITEN = 50; // 50.000 Textstellen; der Korpus hat rund 5.700

/** Liste aller Wissensdokumente (hochgeladen und per Skript eingelesen, auch ungepruefte und abgelehnte). Laeuft nach der
 *  Rechtepruefung ueber den Dienst-Client: Die Zeilensicherheit zeigt ungepruefte Zeilen niemandem, auch dem Admin nicht.
 *  Gelesen werden nur leichte Spalten, nie Text oder Vektoren. */
export async function wissenDokumenteLaden(): Promise<WissenDokumenteAntwort> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("ki_assistent", "manage");
  } catch {
    return { dokumente: [], fehler: true, abgeschnitten: false, ichId: null };
  }
  let ursache: string | null = null;
  try {
    const db = createServiceRoleClient() as unknown as SupabaseClient;
    const zeilen: WissenListeZeile[] = [];
    let abgeschnitten = true; // bleibt wahr, wenn die Schleife ohne letzte (kurze) Seite endet
    for (let seite = 0; seite < MAX_SEITEN; seite++) {
      const { data, error } = await db
        .from("wissen_chunks")
        .select(LISTE_SPALTEN)
        .order("id")
        .range(seite * SEITE, seite * SEITE + SEITE - 1);
      if (error) {
        ursache = `${error.code ? `${error.code}: ` : ""}${error.message}`;
        throw new Error(error.message);
      }
      zeilen.push(...((data ?? []) as unknown as WissenListeZeile[]));
      if (!data || data.length < SEITE) {
        abgeschnitten = false;
        break;
      }
    }
    return { dokumente: gruppiereWissenDokumente(zeilen), fehler: false, abgeschnitten, ichId: profil.id };
  } catch (error) {
    console.error("[damicon] Wissensdokumente laden fehlgeschlagen:", error);
    const detail = ursache ?? (error instanceof Error ? error.message : String(error));
    return { dokumente: [], fehler: true, abgeschnitten: false, ichId: profil.id, fehlerDetail: `Schema ${DATENBANK_SCHEMA}, ${detail}`.slice(0, 400) };
  }
}

const VORSCHAU_ZEICHEN = 1800;

/** Der Anfang des Textes eines hochgeladenen Dokuments, damit die zweite Person weiss, was sie freigibt. */
export async function wissenDokumentVorschau(quelleId: string): Promise<{ text: string; fehler: boolean }> {
  try {
    await requirePermission("ki_assistent", "manage");
  } catch {
    return { text: "", fehler: true };
  }
  // Nur Uploads haben eine Pruefung; fuer alles andere gibt es hier nichts zu lesen.
  if (typeof quelleId !== "string" || !istUploadQuelleId(quelleId)) return { text: "", fehler: true };
  try {
    const speicher = supabaseSpeicher(createServiceRoleClient() as unknown as SupabaseClient);
    return { text: await speicher.ladeVorschau(quelleId, VORSCHAU_ZEICHEN), fehler: false };
  } catch (error) {
    console.error("[damicon] Wissens-Vorschau fehlgeschlagen:", error);
    return { text: "", fehler: true };
  }
}

const PRUEF_PROTOKOLL: Record<FreigabeAktion, string> = {
  freigeben: "wissen.freigegeben",
  ablehnen: "wissen.abgelehnt",
  verlaengern: "wissen.verlaengert",
};
const PRUEF_MELDUNG: Record<FreigabeAktion, string> = {
  freigeben: "ok.wissenFreigegeben",
  ablehnen: "ok.wissenAbgelehnt",
  verlaengern: "ok.wissenVerlaengert",
};

// Freigeben, ablehnen oder verlaengern (Vier-Augen-Prinzip). Die Berechtigung wird zuerst geprueft. Dass die Person, die
// hochgeladen hat, nicht freigibt, prueft freigabe.ts und ein zweites Mal der Waechter der Datenbank. Titel und Art liest
// der Server selbst aus der Datenbank, nicht aus dem Formular.
export async function wissenDokumentPruefen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("ki_assistent", "manage");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const quelleId = text(formData, "quelle_id");
  const aktion = text(formData, "aktion");
  if (!quelleId || (aktion !== "freigeben" && aktion !== "ablehnen" && aktion !== "verlaengern")) return fehler("fehler.eingabe");

  try {
    const ergebnis = await entscheideUeberUpload(aktion, quelleId, {
      speicher: supabaseSpeicher(createServiceRoleClient() as unknown as SupabaseClient),
      pruefer: { id: profil.id },
    });
    await protokolliere(profil, PRUEF_PROTOKOLL[aktion], "wissen_chunks", null, {
      titel: ergebnis.titel,
      bereich: ergebnis.bereich,
      quelle_id: quelleId,
      abschnitte: ergebnis.abschnitte,
      quellenart: ergebnis.quellenart,
      pruefen_bis: ergebnis.pruefenBis,
    });
    aktualisiere(formData);
    return ok(PRUEF_MELDUNG[aktion], ergebnis.titel ?? "");
  } catch (error) {
    if (error instanceof UploadFehler) {
      console.error("[damicon]", error.message);
      return fehler(FEHLER_SCHLUESSEL[error.code], error.wert);
    }
    console.error("[damicon] Wissens-Pruefung unerwartet fehlgeschlagen:", error);
    return fehler("fehler.unbekannt");
  }
}

// Loeschen eines HOCHGELADENEN Dokuments. Die Berechtigung wird zuerst geprueft, danach (in loeschen.ts) der
// Vorschau-Schutz, die Form der quelle_id und, dass wirklich alles unter dieser Quelle aus dem Upload stammt. Vom
// Skript geladene Dokumente lassen sich hier nicht loeschen, auch wenn jemand eine fremde quelle_id sendet.
// Titel und Bereich fuer Meldung und Protokoll liest der Server selbst aus der Datenbank, nicht aus dem Formular.
export async function wissenDokumentLoeschen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("ki_assistent", "manage");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const quelleId = text(formData, "quelle_id");
  if (!quelleId) return fehler("fehler.eingabe");

  try {
    const ergebnis = await loescheHochgeladenesDokument(quelleId, {
      speicher: supabaseSpeicher(createServiceRoleClient() as unknown as SupabaseClient),
    });
    if (ergebnis.schonWeg) {
      aktualisiere(formData);
      return ok("ok.wissenSchonGeloescht");
    }
    await protokolliere(profil, "wissen.geloescht", "wissen_chunks", null, {
      titel: ergebnis.titel,
      bereich: ergebnis.bereich,
      quelle_id: quelleId,
      abschnitte: ergebnis.geloescht,
    });
    aktualisiere(formData);
    return ok("ok.wissenGeloescht", ergebnis.titel ?? "");
  } catch (error) {
    if (error instanceof UploadFehler) {
      console.error("[damicon]", error.message);
      // Bei "gewichte" ist das Dokument schon geloescht: das gehoert ins Protokoll, auch wenn die Meldung ein Fehler ist.
      if (error.code === "gewichte") {
        await protokolliere(profil, "wissen.geloescht", "wissen_chunks", null, { titel: error.wert ?? null, quelle_id: quelleId, wortgewichte_aktualisiert: false });
        aktualisiere(formData);
      }
      return fehler(FEHLER_SCHLUESSEL[error.code], error.wert);
    }
    console.error("[damicon] Wissens-Loeschen unerwartet fehlgeschlagen:", error);
    return fehler("fehler.unbekannt");
  }
}
