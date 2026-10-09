"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { DATENBANK_SCHEMA } from "@/lib/supabase/schema";
import { requirePermission, type SessionProfile } from "@/lib/auth";
import { fehler, ok, zugriffsFehler, type AktionsStatus } from "@/lib/actions/status";
import { aktualisiere, protokolliere, text } from "@/lib/actions/formular-helfer";
import { wissenEinbettung } from "@/lib/wissen/embed";
import { type BuchKopf, ladePaket, type PaketEingabe, pruefeBuchKopf, starteBuch } from "@/lib/wissen/buch-upload";
import { ordneBestandEin, pruefeZuordnungen } from "@/lib/wissen/einordnen";
import { entscheideUeberUpload, type FreigabeAktion } from "@/lib/wissen/freigabe";
import { loescheHochgeladenesDokument } from "@/lib/wissen/loeschen";
import { pruefeUploadUmgebung, UploadFehler, verarbeiteUpload } from "@/lib/wissen/hochladen";
import { standardStufe } from "@/lib/wissen/quellenart";
import { MAX_DATEI_BYTES } from "@/lib/wissen/upload-konstanten";
import { istUploadQuelleId, uploadQuelleId } from "@/lib/wissen/upload-quelle";
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
  clusterPasstNicht: "fehler.wissenClusterPasstNicht",
  urlFehlt: "fehler.wissenUrlFehlt",
  urlUngueltig: "fehler.wissenUrlUngueltig",
  nichtLoeschbar: "fehler.wissenNichtLoeschbar",
  loeschen: "fehler.wissenLoeschen",
  gewichte: "fehler.wissenGewichte",
  nichtGefunden: "fehler.wissenNichtGefunden",
  nichtFreigebbar: "fehler.wissenNichtFreigebbar",
  nichtPruefbar: "fehler.wissenNichtPruefbar",
  selbstFreigabe: "fehler.wissenSelbstFreigabe",
  unvollstaendig: "fehler.wissenUnvollstaendig",
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
        cluster: text(formData, "cluster"),
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
      cluster: ergebnis.cluster,
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
    // Bevorzugt die Zusammenfassung in der Datenbank (Migration 20261127000000): ein Buch hat tausende Abschnitte, die Liste
    // soll nicht jeden einzeln lesen. Fehlt die Funktion noch (Code vor Migration), faellt es auf das seitenweise Lesen zurueck.
    const { data: gesamt, error: listeFehler } = await db.rpc("wissen_liste");
    if (!listeFehler && Array.isArray(gesamt)) {
      return { dokumente: gruppiereWissenDokumente(gesamt as unknown as WissenListeZeile[]), fehler: false, abgeschnitten: false, ichId: profil.id };
    }
    if (listeFehler) console.error("[damicon] wissen_liste nicht verfuegbar, lese seitenweise:", listeFehler.message);
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

// Bestand einordnen (Quellenart, Cluster und Stufe gemeinsam). Die Administration waehlt je Dokument und bestaetigt, nachdem die
// Oberflaeche die Wirkung auf die Suche gezeigt hat; nichts passiert von allein. Die Berechtigung wird zuerst geprueft, die
// Eingabe Stueck fuer Stueck (nur bekannte Arten und Cluster, Cluster muss zur Art passen, hoechstens 400 Dokumente), und geaendert
// werden nur Zeilen ohne Quellenart: eine schon eingeordnete Quelle ueberschreibt dieser Weg nie (einordnen.ts). Das Protokoll
// haelt je Dokument Art, Cluster und die Stufe vorher und nachher fest.
export async function wissenBestandEinordnen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("ki_assistent", "manage");
  } catch (error) {
    return zugriffsFehler(error);
  }

  let roh: unknown;
  try {
    roh = JSON.parse(text(formData, "zuordnungen"));
  } catch {
    return fehler("fehler.eingabe");
  }
  const { gueltig, ungueltig } = pruefeZuordnungen(roh);
  if (gueltig.length === 0) return fehler("fehler.wissenEinordnenLeer");

  try {
    // Wie der Upload: in einer Vorschau gegen das Produktionsschema wird nichts geschrieben.
    pruefeUploadUmgebung();
    const ergebnis = await ordneBestandEin(createServiceRoleClient() as unknown as SupabaseClient, gueltig);
    await protokolliere(profil, "wissen.eingeordnet", "wissen_chunks", null, {
      dokumente: ergebnis.dokumente,
      abschnitte: ergebnis.abschnitte,
      uebersprungen: ergebnis.uebersprungen,
      ungueltig,
      zuordnungen: ergebnis.protokoll,
    });
    aktualisiere(formData);
    return ok("ok.wissenEingeordnet", String(ergebnis.dokumente));
  } catch (error) {
    if (error instanceof UploadFehler) {
      console.error("[damicon]", error.message);
      return fehler(FEHLER_SCHLUESSEL[error.code], error.wert);
    }
    console.error("[damicon] Wissens-Einordnung unerwartet fehlgeschlagen:", error);
    return fehler("fehler.wissenEinordnen");
  }
}

// ---- Buch-Upload (lange Dokumente in Paketen, buch-upload.ts) -------------------------------------------------------------
// Der Browser liest die Datei selbst (PDF.js), bildet den Hash des ganzen Textes und schickt Kopf und Pakete nacheinander. Jede dieser
// Actions prueft das Recht zuerst und wiederholt die Pruefung des Kopfes, denn der Browser ist nie die Instanz, der man glaubt.
// Die Antwort ist ein AktionsStatus: bei Erfolg traegt id die Kennung des Dokuments und wert die Zahl der geschriebenen Abschnitte.

async function buchProfil(): Promise<SessionProfile | AktionsStatus> {
  try {
    return await requirePermission("ki_assistent", "manage");
  } catch (error) {
    return zugriffsFehler(error);
  }
}

function buchFehler(error: unknown, was: string): AktionsStatus {
  if (error instanceof UploadFehler) {
    console.error("[damicon]", error.message);
    return fehler(FEHLER_SCHLUESSEL[error.code], error.wert);
  }
  console.error("[damicon] Buch-Upload unerwartet fehlgeschlagen:", was, error);
  return fehler("fehler.unbekannt");
}

const buchAbhaengigkeiten = () => ({
  speicher: supabaseSpeicher(createServiceRoleClient() as unknown as SupabaseClient),
  einbettung: wissenEinbettung(),
});

/** Beginn eines Buchs: prueft Kopf und Umgebung und erkennt Dubletten. Schreibt nichts. */
export async function wissenBuchStarten(kopf: BuchKopf): Promise<AktionsStatus> {
  const profil = await buchProfil();
  if ("stand" in profil) return profil;
  try {
    const { quelleId } = await starteBuch(kopf, { id: profil.id, name: profil.fullName ?? null }, buchAbhaengigkeiten());
    return { stand: "ok", id: quelleId };
  } catch (error) {
    return buchFehler(error, "starten");
  }
}

/** Ein Paket eines Buchs: zerlegen, einbetten, schreiben. Bei einem Fehler bleiben die Pakete davor stehen (wissenBuchAbbrechen raeumt auf). */
export async function wissenBuchPaket(paket: PaketEingabe): Promise<AktionsStatus> {
  const profil = await buchProfil();
  if ("stand" in profil) return profil;
  try {
    const erg = await ladePaket(paket, { id: profil.id, name: profil.fullName ?? null }, buchAbhaengigkeiten());
    return { stand: "ok", id: erg.quelleId, wert: String(erg.chunks) };
  } catch (error) {
    return buchFehler(error, `Paket ${paket?.nr}`);
  }
}

/** Ende eines Buchs: Eintrag im Protokoll (Person, Titel, Zahlen). Die Zeilen selbst sind mit dem letzten Paket geschrieben. */
export async function wissenBuchAbschliessen(kopf: BuchKopf, abschnitte: number): Promise<AktionsStatus> {
  const profil = await buchProfil();
  if ("stand" in profil) return profil;
  try {
    const { meta, quelleId } = pruefeBuchKopf(kopf, { id: profil.id, name: profil.fullName ?? null }, new Date());
    await protokolliere(profil, "wissen.hochgeladen", "wissen_chunks", null, {
      titel: meta.titel,
      bereich: kopf.bereich,
      quelle_id: quelleId,
      abschnitte: Number.isFinite(abschnitte) ? abschnitte : 0,
      pakete: kopf.pakete,
      zeichen: kopf.zeichen,
      quellenart: meta.quellenart,
      cluster: meta.cluster,
      autoritaetsstufe: standardStufe(meta.quellenart),
      pruefstatus: "ungeprueft",
      buch: true,
    });
    return ok("ok.wissenHochgeladen", meta.titel);
  } catch (error) {
    return buchFehler(error, "abschliessen");
  }
}

/** Bricht ein Buch ab und entfernt alles, was davon geschrieben wurde, samt Wortgewichten (wie Loeschen). */
export async function wissenBuchAbbrechen(hash: string): Promise<AktionsStatus> {
  const profil = await buchProfil();
  if ("stand" in profil) return profil;
  if (typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash)) return fehler("fehler.eingabe");
  try {
    const erg = await loescheHochgeladenesDokument(uploadQuelleId(hash), { speicher: supabaseSpeicher(createServiceRoleClient() as unknown as SupabaseClient) });
    return { stand: "ok", wert: String(erg.geloescht) };
  } catch (error) {
    return buchFehler(error, "abbrechen");
  }
}

// ---- Sammelpruefung -----------------------------------------------------------------------------------------------------
// Viele Dokumente auf einmal freigeben oder ablehnen (nach einem Buch-Upload). Jedes Dokument geht einzeln durch dieselbe Pruefung wie
// die Einzelpruefung (entscheideUeberUpload: Vier-Augen-Prinzip, unvollstaendige Buecher, Skript-Quellen) und wird einzeln protokolliert.
// Ein Fehler bei einem Dokument stoppt die anderen nicht; die Antwort nennt je Dokument, was geschah.
export interface SammelErgebnis extends AktionsStatus {
  ergebnisse: Array<{ quelleId: string; titel: string | null; ok: boolean; meldung: string | null; wert: string | null }>;
}

const SAMMEL_MAX = 50;

export async function wissenDokumenteSammelPruefen(aktion: "freigeben" | "ablehnen", quelleIds: string[]): Promise<SammelErgebnis> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("ki_assistent", "manage");
  } catch (error) {
    return { ...zugriffsFehler(error), ergebnisse: [] };
  }
  if ((aktion !== "freigeben" && aktion !== "ablehnen") || !Array.isArray(quelleIds)) return { ...fehler("fehler.eingabe"), ergebnisse: [] };
  const ids = [...new Set(quelleIds.filter((i): i is string => typeof i === "string"))];
  if (ids.length === 0 || ids.length > SAMMEL_MAX) return { ...fehler("fehler.eingabe"), ergebnisse: [] };

  const speicher = supabaseSpeicher(createServiceRoleClient() as unknown as SupabaseClient);
  const ergebnisse: SammelErgebnis["ergebnisse"] = [];
  for (const quelleId of ids) {
    try {
      const erg = await entscheideUeberUpload(aktion, quelleId, { speicher, pruefer: { id: profil.id } });
      await protokolliere(profil, PRUEF_PROTOKOLL[aktion], "wissen_chunks", null, {
        titel: erg.titel,
        bereich: erg.bereich,
        quelle_id: quelleId,
        abschnitte: erg.abschnitte,
        quellenart: erg.quellenart,
        pruefen_bis: erg.pruefenBis,
        sammel: true,
      });
      ergebnisse.push({ quelleId, titel: erg.titel, ok: true, meldung: null, wert: null });
    } catch (error) {
      if (error instanceof UploadFehler) {
        console.error("[damicon]", error.message);
        ergebnisse.push({ quelleId, titel: null, ok: false, meldung: FEHLER_SCHLUESSEL[error.code], wert: error.wert ?? null });
      } else {
        console.error("[damicon] Sammelpruefung unerwartet fehlgeschlagen:", error);
        ergebnisse.push({ quelleId, titel: null, ok: false, meldung: "fehler.unbekannt", wert: null });
      }
    }
  }
  revalidatePath("/", "layout");
  const gut = ergebnisse.filter((e) => e.ok).length;
  return { stand: gut > 0 ? "ok" : "fehler", meldung: aktion === "freigeben" ? "ok.wissenSammelFreigegeben" : "ok.wissenSammelAbgelehnt", wert: String(gut), ergebnisse };
}
