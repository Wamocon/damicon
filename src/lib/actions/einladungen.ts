"use server";

import { createHash, randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { requirePermission, type SessionProfile } from "@/lib/auth";
import {
  dbFehler,
  fehler,
  ok,
  zugriffsFehler,
  type AktionsStatus,
} from "@/lib/actions/status";
import type { Database, Json } from "@/lib/database.types";
import {
  codeNormalisieren,
  einladungAlphabet,
  einladungGruppen,
  einladungGruppenLaenge,
  einladungGueltigkeitTage,
} from "@/lib/domain/einladungen";

// Kundenzugang ueber Einladung (Anforderung E.20).
//
// Drei Vorgaenge, zwei Vertrauensstufen:
//   * erstellen / zurueckziehen laufen als das angemeldete Buero, RLS greift
//     (Migration 20261002000000).
//   * einloesen laeuft mit dem service_role-Schluessel, weil der Einloesende
//     noch gar nicht angemeldet ist - es gibt keine Rolle, gegen die eine
//     Policy pruefen koennte. Die gesamte Pruefung findet deshalb hier und in
//     public.einladung_abschliessen() statt. Genau deshalb ist diese Datei die
//     empfindlichste im Kundenportal: jede Aenderung an einladungEinloesen()
//     ist eine Aenderung am Zugangsweg.

const MINDEST_PASSWORT = 12;

function text(formData: FormData, feld: string): string {
  return String(formData.get(feld) ?? "").trim();
}

/**
 * Adresse in eine vergleichbare Form bringen. Klein geschrieben, und in
 * Unicode-Normalform C: "jörg@..." laesst sich als ein Zeichen (NFC) oder als
 * o plus Trema (NFD) schreiben. Beides sieht gleich aus, Postgres vergleicht
 * aber byteweise. Traegt das Buero die Adresse an einem Mac ein und tippt der
 * Kunde sie unter Windows, faende .eq("email", ...) sonst nichts - und der
 * Kunde laese "Code oder Adresse stimmt nicht" vor einer Adresse, die
 * Zeichen fuer Zeichen dieselbe ist.
 */
function adresse(formData: FormData, feld: string): string {
  return text(formData, feld).toLowerCase().normalize("NFC");
}

function digest(code: string): string {
  return createHash("sha256").update(code, "utf8").digest("hex");
}

/**
 * Einladungscode aus kryptografisch sicherem Zufall. `randomInt` statt
 * `Math.random`, und Modulo-freie Auswahl, damit kein Zeichen des Alphabets
 * haeufiger vorkommt als ein anderes.
 */
function codeErzeugen(): string {
  const gruppen: string[] = [];
  for (let g = 0; g < einladungGruppen; g += 1) {
    let gruppe = "";
    for (let z = 0; z < einladungGruppenLaenge; z += 1) {
      gruppe += einladungAlphabet[randomInt(einladungAlphabet.length)];
    }
    gruppen.push(gruppe);
  }
  return gruppen.join("-");
}

/**
 * Protokolleintrag ins Compliance-Log. Wirft nie: ein fehlgeschlagener
 * Protokolleintrag darf den Vorgang nicht mitreissen - beim Ausstellen haengt
 * daran der Klartext-Code, der nur einmal existiert und mit einer geworfenen
 * Ausnahme verloren waere.
 *
 * Der Client wird uebergeben statt hier erzeugt: beim Ausstellen und
 * Zurueckziehen gibt es eine Sitzung, und dann setzt audit_actor_setzen()
 * (Migration 20260905160000) den Urheber selbst, statt den mitgeschickten
 * String zu glauben. Nur beim Einloesen gibt es keine Sitzung - dort bleibt
 * der service_role-Weg, weil ein Kontoanlage-Vorgang ohne Protokolleintrag
 * als Nachweis wertlos waere.
 */
async function protokolliere(
  supabase: SupabaseClient<Database>,
  actor: string,
  aktion: string,
  ressourceId: string | null,
  metadata: Record<string, Json> = {},
) {
  try {
    const { error } = await supabase.from("audit_events").insert({
      actor,
      aktion,
      ressource: "kundeneinladungen",
      ressource_id: ressourceId,
      metadata,
    });
    if (error) {
      console.error("[damicon] Einladung: Protokolleintrag fehlgeschlagen:", error.message);
    }
  } catch (error) {
    console.error(
      "[damicon] Einladung: Protokolleintrag nicht moeglich:",
      error instanceof Error ? error.message : String(error),
    );
  }
}

function aktualisiere(formData: FormData) {
  const pfad = text(formData, "pfad");
  if (pfad.startsWith("/")) {
    revalidatePath(pfad);
    return;
  }
  // Ohne Pfad bliebe die Liste stehen, obwohl die Aktion Erfolg meldet. Der
  // feste Rueckfall trifft dieselbe Seite in der Standardsprache.
  revalidatePath("/de/dashboard/buero/rollen");
}

// ---------------------------------------------------------------------------
// 1. Einladung ausstellen (Buero)
// ---------------------------------------------------------------------------
export async function einladungErstellen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("einladungen", "create");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const kundeId = text(formData, "kundeId");
  const email = adresse(formData, "email");
  const fullName = text(formData, "fullName");

  if (!kundeId || !email || !fullName) {
    return fehler("fehler.eingabe");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return fehler("einladungen.fehler.email");
  }

  const supabase = await createClient();

  // Vorabpruefung: gibt es zu dieser Adresse schon ein Profil? Dann kann die
  // Einladung niemals eingeloest werden (createUser scheitert an der bereits
  // vergebenen Adresse). Der Fehlschlag gehoert hierhin, wo das Buero ihn
  // beheben kann - nicht zum Kunden, der zwei Wochen spaeter davorsteht und
  // nur "wenden Sie sich an die Administration" liest.
  // limit(1) statt maybeSingle(): profiles.email traegt keine
  // Eindeutigkeitsbedingung, bei zwei Treffern lieferte maybeSingle() null -
  // die Schutzpruefung meldete dann ausgerechnet im auffaelligsten Fall
  // "frei". Und ein Abfragefehler sperrt, statt durchzulassen: eine Pruefung,
  // die im Zweifel oeffnet, ist keine.
  const { data: vorhanden, error: pruefFehler } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .limit(1);
  if (pruefFehler) return dbFehler(pruefFehler);
  if (vorhanden && vorhanden.length > 0) return fehler("einladungen.fehler.adresseVergeben");

  const code = codeErzeugen();
  const gueltigBis = new Date();
  gueltigBis.setDate(gueltigBis.getDate() + einladungGueltigkeitTage);

  const { data, error } = await supabase
    .from("kundeneinladungen")
    .insert({
      // Ueber codeNormalisieren gehasht, nicht ueber den rohen Code. Beides
      // ergibt heute dasselbe, weil das Alphabet die vier ersetzten Zeichen
      // gar nicht enthaelt - aber damit haengt die Gleichheit an einer
      // Eigenschaft des Alphabets statt an dieser Zeile. Wer spaeter das
      // Alphabet aendert, soll nicht Ausstellen und Einloesen still
      // auseinanderlaufen lassen.
      code_digest: digest(codeNormalisieren(code)),
      b2b_kunde_id: kundeId,
      email,
      full_name: fullName,
      gueltig_bis: gueltigBis.toISOString(),
      erstellt_von_profil_id: profil.id,
    })
    .select("id")
    .single();

  if (error) return dbFehler(error);

  await protokolliere(
    supabase,
    `${profil.fullName} (${profil.role})`,
    "einladung.erstellt",
    data.id,
    { email, kunde_id: kundeId },
  );

  aktualisiere(formData);

  // Der Klartext-Code verlaesst den Server genau hier, ein einziges Mal. Die
  // Oberflaeche zeigt ihn zum Abschreiben an; danach existiert er nur noch
  // beim Kunden. Ein zweiter Aufruf kann ihn nicht wiederholen - dafuer gibt
  // es das Zurueckziehen und eine neue Einladung.
  return ok("einladungen.erfolg.erstellt", code);
}

// ---------------------------------------------------------------------------
// 2. Einladung zurueckziehen (Buero)
// ---------------------------------------------------------------------------
export async function einladungZurueckziehen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("einladungen", "update");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const id = text(formData, "id");
  if (!id) return fehler("fehler.eingabe");

  const supabase = await createClient();
  // Nur eine offene Einladung laesst sich zurueckziehen. Eine bereits
  // eingeloeste zurueckzuziehen wuerde suggerieren, dass damit auch der Zugang
  // erlischt - das tut es nicht, dafuer braucht es die Kontoverwaltung.
  const { data, error } = await supabase
    .from("kundeneinladungen")
    .update({ status: "zurueckgezogen" })
    .eq("id", id)
    .eq("status", "offen")
    .select("id");

  if (error) return dbFehler(error);
  if (!data || data.length === 0) return fehler("einladungen.fehler.nichtOffen");

  await protokolliere(
    supabase,
    `${profil.fullName} (${profil.role})`,
    "einladung.zurueckgezogen",
    id,
  );

  aktualisiere(formData);

  return ok("einladungen.erfolg.zurueckgezogen");
}

// ---------------------------------------------------------------------------
// 3. Einladung einloesen (oeffentlich, ohne Anmeldung)
// ---------------------------------------------------------------------------
// Reihenfolge mit Absicht: erst pruefen, dann anlegen, dann in EINER
// Transaktion verbrauchen und zuordnen.
//
// Umgekehrt herum - erst verbrauchen, dann anlegen - verbraucht der
// haeufigste Fehlerfall (die Adresse hat schon ein Konto) die Einladung,
// bevor er scheitert, und braucht dafuer eine Kompensation, die selbst
// scheitern kann. Bleibt sie aus, ist die Einladung tot: zurueckziehen
// verlangt 'offen', ein zweites Einloesen findet nichts mehr, und geloescht
// werden kann sie ohnehin nicht.
export async function einladungEinloesen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  // Nicht nur isSupabaseConfigured(): das prueft die beiden oeffentlichen
  // Variablen, dieser Pfad braucht aber zwingend den service_role-Schluessel.
  // Ohne ihn wuerde createServiceRoleClient() werfen und der Kunde saehe eine
  // nackte Fehlerseite statt einer Meldung.
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return fehler("einladungen.fehler.demoModus");
  }

  const code = codeNormalisieren(text(formData, "code"));
  const email = adresse(formData, "email");
  const passwort = String(formData.get("passwort") ?? "");
  const passwortWdh = String(formData.get("passwortWdh") ?? "");

  if (!code || !email || !passwort) return fehler("fehler.eingabe");
  if (passwort !== passwortWdh) return fehler("einladungen.fehler.passwortUngleich");
  if (passwort.length < MINDEST_PASSWORT) return fehler("einladungen.fehler.passwortKurz");

  const admin = createServiceRoleClient();
  const codeDigest = digest(code);

  // --- Schritt 1: Ist die Einladung ueberhaupt gueltig? --------------------
  // Nur lesen, noch nicht verbrauchen. Sonst legt jeder falsche Code ein
  // Konto an, das gleich wieder geloescht wird.
  const { data: einladung, error: leseFehler } = await admin
    .from("kundeneinladungen")
    .select("id, full_name")
    .eq("code_digest", codeDigest)
    .eq("email", email)
    .eq("status", "offen")
    .gt("gueltig_bis", new Date().toISOString())
    .maybeSingle();

  if (leseFehler) return dbFehler(leseFehler);

  // Bewusst eine einzige Meldung fuer jeden Grund: falscher Code, falsche
  // Adresse, abgelaufen, schon eingeloest, zurueckgezogen. Wer den Code raet,
  // soll nicht erfahren, welcher Teil davon gestimmt hat. Fehlversuche werden
  // protokolliert - ohne sie waere ein Angriff auf den einzigen
  // unauthentifizierten Schreibpfad des Systems spurlos.
  if (!einladung) {
    await protokolliere(admin, "unbekannt", "einladung.einloesen.fehlgeschlagen", null, {
      // Nicht die Adresse selbst: das Protokoll ist fuer das Buero lesbar und
      // soll kein Verzeichnis der Rateversuche werden. Der Digest genuegt, um
      // wiederholte Versuche auf dieselbe Adresse zu erkennen.
      email_digest: digest(email).slice(0, 16),
    });
    return fehler("einladungen.fehler.ungueltig");
  }

  // --- Schritt 2: Ist die Adresse frei? ------------------------------------
  // Zwei Faelle, ein Abbruch. Erstens ein bereits vergebenes Konto: createUser
  // wuerde scheitern. Zweitens - und gefaehrlicher - ein Profil OHNE Konto:
  // handle_new_auth_user() (Migration 20260905160000) uebernimmt ein solches
  // Profil, wenn die Adresse uebereinstimmt, statt ein neues anzulegen. Das
  // frische Kundenkonto uebernaehme damit eine fremde Profilzeile samt allem,
  // was darauf zeigt - und ein spaeteres Aufraeumen per deleteUser wuerde sie
  // ueber die Kaskade loeschen. Aus einer fehlgeschlagenen Einladung wuerde
  // ein geloeschter Personendatensatz.
  const { data: profilVorhanden, error: profilPruefFehler } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .limit(1);

  // Fail-closed, aus demselben Grund wie beim Ausstellen: lieber abbrechen
  // als ein Konto anlegen, dessen Profil einem anderen gehoert.
  if (profilPruefFehler) return dbFehler(profilPruefFehler);

  if (profilVorhanden && profilVorhanden.length > 0) {
    await protokolliere(admin, "unbekannt", "einladung.einloesen.adresse_vergeben", einladung.id);
    return fehler("einladungen.fehler.kontoVorhanden");
  }

  // --- Schritt 3: Konto anlegen --------------------------------------------
  const { data: angelegt, error: authFehler } = await admin.auth.admin.createUser({
    email,
    password: passwort,
    // Die Einladung IST der Nachweis, dass die Adresse stimmt - das Buero hat
    // sie ausgestellt. Eine zweite Bestaetigungsmail waere eine Huerde ohne
    // zusaetzliche Sicherheit.
    email_confirm: true,
    // Die Rolle steht in app_metadata, nicht in user_metadata: nur der
    // service_role-Schluessel darf sie setzen, sonst waere sie vom
    // Anmeldenden frei waehlbar. handle_new_auth_user() liest genau dieses
    // Feld (Migration 20260905160000) und faellt ohne Angabe auf 'kunde'
    // zurueck, die schwaechste Rolle - ein Konto mit mehr Rechten als
    // beabsichtigt kann hier also auch dann nicht entstehen, wenn GoTrue die
    // app_metadata erst nach dem INSERT schreibt.
    app_metadata: { role: "kunde" },
    // Der Name kommt aus der Einladung, nicht aus dem Formular: das Buero hat
    // ihn eingetragen, der Einloesende soll ihn nicht frei waehlen.
    user_metadata: { full_name: einladung.full_name },
  });

  if (authFehler || !angelegt?.user) {
    console.error("[damicon] Einladung: Konto konnte nicht angelegt werden:", authFehler?.message);
    // Die Einladung ist unberuehrt - sie wurde noch nicht verbraucht. Der
    // Kunde kann es erneut versuchen, sein Code gilt weiter.
    return fehler("einladungen.fehler.kontoAnlegen");
  }

  // --- Schritt 4: Verbrauchen und zuordnen, in einer Transaktion -----------
  // public.einladung_abschliessen() prueft Kennung, Adresse, Status und Frist
  // noch einmal - diesmal in derselben Anweisung, die sie verbraucht. Die
  // Pruefung aus Schritt 1 ist nur ein frueher Ausstieg, massgeblich ist
  // diese hier: zwischen beiden koennte die Einladung zurueckgezogen worden
  // sein oder ein zweiter Versuch sie verbraucht haben.
  const { data: abgeschlossen, error: abschlussFehler } = await admin.rpc(
    "einladung_abschliessen",
    { p_code_digest: codeDigest, p_email: email, p_auth_user_id: angelegt.user.id },
  );

  if (abschlussFehler || !abgeschlossen) {
    // Das Konto steht, die Zuordnung nicht. Ein Kundenkonto ohne Kundenbezug
    // saehe keine einzige Zeile - es zurueckzunehmen ist ehrlicher, als es
    // stehen zu lassen. Scheitert auch das, bleibt ein totes Konto: es hat
    // Rolle 'kunde' ohne b2b_kunde_id und damit keinerlei Sicht, aber es
    // blockiert die Adresse. Deshalb hier eine Protokollzeile, an der das
    // Buero es findet.
    const { error: loeschFehler } = await admin.auth.admin.deleteUser(angelegt.user.id);
    if (loeschFehler) {
      console.error(
        "[damicon] Einladung: verwaistes Konto konnte nicht entfernt werden:",
        angelegt.user.id,
        loeschFehler.message,
      );
      await protokolliere(admin, "system", "einladung.konto_verwaist", einladung.id, {
        auth_user_id: angelegt.user.id,
      });
    }
    console.error(
      "[damicon] Einladung: Abschluss fehlgeschlagen:",
      abschlussFehler?.message ?? "Einladung zwischenzeitlich nicht mehr offen",
    );
    return fehler("einladungen.fehler.kontoAnlegen");
  }

  await protokolliere(admin, `${email} (kunde)`, "einladung.eingeloest", einladung.id);

  return ok("einladungen.erfolg.eingeloest");
}
