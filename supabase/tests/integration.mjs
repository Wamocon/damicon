// =============================================================================
// Malina - Supabase Integrationstest (lokal)
// =============================================================================
// Ausfuehren:  node --env-file=.env.local supabase/tests/integration.mjs
//
// Prueft gegen die laufende lokale Supabase-Instanz:
//   1. Round-Trip (INSERT + SELECT + Assert + Cleanup) auf einer Kerntabelle
//   2. RLS: anon darf Katalogdaten lesen, sensible Finanzdaten nicht
//   3. Trigger: Pflanzenschutz-Behandlung sperrt den Reihenblock (wartezeitgesperrt)
// =============================================================================

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  console.error("Fehlende Env-Variablen. Aufruf: node --env-file=.env.local supabase/tests/integration.mjs");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false } });

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures += 1;
}

// --- 1. Round-Trip -----------------------------------------------------------
{
  const titel = `__it_${Date.now()}`;
  const { data: inserted, error: insErr } = await admin
    .from("schulungsvideos")
    .insert({ titel, thema: "Test", dauer_sekunden: 1, sprachen: ["de"] })
    .select()
    .single();
  check("Round-Trip INSERT", !insErr && inserted?.titel === titel, insErr?.message);

  const { data: read, error: readErr } = await admin
    .from("schulungsvideos")
    .select("id, titel")
    .eq("titel", titel)
    .single();
  check("Round-Trip SELECT stimmt ueberein", !readErr && read?.titel === titel, readErr?.message);

  if (inserted?.id) {
    const { error: delErr } = await admin.from("schulungsvideos").delete().eq("id", inserted.id);
    check("Round-Trip CLEANUP", !delErr, delErr?.message);
  }
}

// --- 2. RLS ----------------------------------------------------------------
{
  const { data: sorten, error: sErr } = await anon.from("sorten").select("id").limit(5);
  check("RLS: anon liest Katalog (sorten)", !sErr && (sorten?.length ?? 0) > 0, sErr?.message);

  const { data: ledger, error: lErr } = await anon
    .from("finance_ledger_entries")
    .select("id")
    .limit(5);
  // RLS liefert bei fehlender Policy leere Menge (kein Fehler).
  check(
    "RLS: anon sieht keine Finanzdaten",
    !lErr && (ledger?.length ?? 0) === 0,
    lErr?.message ?? `sichtbare Zeilen: ${ledger?.length}`,
  );
}

// --- 3. Trigger: Behandlung sperrt Reihenblock ----------------------------
{
  // Einen aktuell nicht gesperrten Block waehlen.
  const { data: block } = await admin
    .from("reihenbloecke")
    .select("id, code, status")
    .neq("status", "wartezeitgesperrt")
    .limit(1)
    .single();

  const { data: mittel } = await admin.from("psm_mittel").select("id").limit(1).single();

  const { data: behandlung, error: bErr } = await admin
    .from("pflanzenschutz_behandlungen")
    .insert({
      reihenblock_id: block.id,
      psm_mittel_id: mittel.id,
      behandelt_am: "2026-09-02",
      wartezeit_tage: 3,
    })
    .select()
    .single();
  check("Trigger: Behandlung angelegt", !bErr && !!behandlung?.freigabe_am, bErr?.message);

  const { data: afterBlock } = await admin
    .from("reihenbloecke")
    .select("status")
    .eq("id", block.id)
    .single();
  check(
    "Trigger: Reihenblock ist jetzt wartezeitgesperrt",
    afterBlock?.status === "wartezeitgesperrt",
    `Status: ${afterBlock?.status}`,
  );

  // Cleanup: Testbehandlung entfernen, Ursprungsstatus wiederherstellen.
  if (behandlung?.id) {
    await admin.from("pflanzenschutz_behandlungen").delete().eq("id", behandlung.id);
    await admin.from("reihenbloecke").update({ status: block.status }).eq("id", block.id);
  }
}

// --- 4. Auth: Anmeldung und Profilrolle ------------------------------------
// Voraussetzung: `npm run db:seed-auth` hat die sechs Demo-Konten angelegt.
async function anmelden(email) {
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({
    email,
    password: "MalinaDemo2026!",
  });
  if (error) return { client: null, fehler: error.message };
  return { client, fehler: null };
}

const { client: leitung, fehler: leitungFehler } = await anmelden("leitung@malina.demo");
const { client: brigade, fehler: brigadeFehler } = await anmelden("brigade@malina.demo");

check("Auth: Betriebsleitung meldet sich an", !!leitung, leitungFehler ?? "");
check("Auth: Brigade meldet sich an", !!brigade, brigadeFehler ?? "");

if (leitung && brigade) {
  const {
    data: { user: leitungUser },
  } = await leitung.auth.getUser();
  const { data: profil } = await leitung
    .from("profiles")
    .select("full_name, role")
    .eq("auth_user_id", leitungUser.id)
    .maybeSingle();
  check(
    "Auth: Profil traegt die Rolle betriebsleitung",
    profil?.role === "betriebsleitung",
    `Rolle: ${profil?.role}`,
  );

  // --- 5. RLS-Schreibrechte je Rolle ---------------------------------------
  const { data: block } = await admin
    .from("reihenbloecke")
    .select("id, code, status")
    .neq("status", "wartezeitgesperrt")
    .limit(1)
    .single();

  const { data: brigadeUpdate, error: brigadeUpdateFehler } = await brigade
    .from("reihenbloecke")
    .update({ status: "ruhend" })
    .eq("id", block.id)
    .select("id");
  check(
    "RLS: Brigade darf den Reihenblockstatus nicht aendern",
    !brigadeUpdateFehler && (brigadeUpdate?.length ?? 0) === 0,
    brigadeUpdateFehler?.message ?? `geaenderte Zeilen: ${brigadeUpdate?.length}`,
  );

  const zielStatus = block.status === "erntereif" ? "bepflanzt" : "erntereif";
  const { data: leitungUpdate, error: leitungUpdateFehler } = await leitung
    .from("reihenbloecke")
    .update({ status: zielStatus })
    .eq("id", block.id)
    .select("id, status");
  check(
    "RLS: Betriebsleitung darf den Reihenblockstatus aendern",
    !leitungUpdateFehler && leitungUpdate?.[0]?.status === zielStatus,
    leitungUpdateFehler?.message ?? "",
  );
  await admin.from("reihenbloecke").update({ status: block.status }).eq("id", block.id);

  const { data: mittel } = await admin
    .from("psm_mittel")
    .select("id, wartezeit_tage")
    .limit(1)
    .single();

  const { error: brigadeBehandlungFehler } = await brigade
    .from("pflanzenschutz_behandlungen")
    .insert({
      reihenblock_id: block.id,
      psm_mittel_id: mittel.id,
      behandelt_am: new Date().toISOString().slice(0, 10),
      wartezeit_tage: mittel.wartezeit_tage,
    });
  check(
    "RLS: Brigade darf keine Behandlung erfassen",
    brigadeBehandlungFehler?.code === "42501",
    brigadeBehandlungFehler?.code ?? "kein Fehler",
  );

  // --- 6. Sperrlogik in der Datenbank --------------------------------------
  const { data: behandlung, error: behandlungFehler } = await leitung
    .from("pflanzenschutz_behandlungen")
    .insert({
      reihenblock_id: block.id,
      psm_mittel_id: mittel.id,
      behandelt_am: new Date().toISOString().slice(0, 10),
      wartezeit_tage: mittel.wartezeit_tage,
    })
    .select("id, freigabe_am")
    .single();
  check(
    "Sperre: Betriebsleitung erfasst eine Behandlung",
    !behandlungFehler && !!behandlung?.freigabe_am,
    behandlungFehler?.message ?? "",
  );

  const { error: entsperrFehler } = await leitung
    .from("reihenbloecke")
    .update({ status: "erntereif" })
    .eq("id", block.id)
    .select("id");
  check(
    "Sperre: vorzeitiger Statuswechsel wird abgelehnt",
    entsperrFehler?.code === "23514",
    entsperrFehler?.code ?? "kein Fehler",
  );

  const { error: aufgabeFehler } = await leitung.from("pflueckaufgaben").insert({
    code: `__it_${Date.now()}`,
    reihenblock_id: block.id,
    zielmenge_kg: 10,
  });
  check(
    "Sperre: keine Pflueckaufgabe auf gesperrtem Reihenblock",
    aufgabeFehler?.code === "23514",
    aufgabeFehler?.code ?? "kein Fehler",
  );

  const { error: rpcFehler } = await leitung.rpc("reihenblock_freigeben", {
    p_block: block.id,
    p_status: "erntereif",
  });
  check(
    "Sperre: Freigabe vor Ablauf der Wartezeit wird abgelehnt",
    rpcFehler?.code === "23514",
    rpcFehler?.code ?? "kein Fehler",
  );

  // Wartezeit rueckdatieren, damit die regulaere Freigabe pruefbar wird.
  await admin
    .from("pflanzenschutz_behandlungen")
    .update({ behandelt_am: "2026-01-01" })
    .eq("id", behandlung.id);

  const { error: freigabeFehler } = await leitung.rpc("reihenblock_freigeben", {
    p_block: block.id,
    p_status: "erntereif",
  });
  const { data: nachFreigabe } = await admin
    .from("reihenbloecke")
    .select("status")
    .eq("id", block.id)
    .single();
  check(
    "Sperre: Freigabe nach Ablauf der Wartezeit setzt den Status zurueck",
    !freigabeFehler && nachFreigabe?.status === "erntereif",
    freigabeFehler?.message ?? `Status: ${nachFreigabe?.status}`,
  );

  // --- 7. Haertung nach dem Sicherheitsaudit vom 05.09.2026 ---------------
  // Jeder dieser Faelle war vor der Migration 20260905160000_haerten.sql offen.

  const { data: personal } = await anon.from("pfluecker").select("name, ausweis");
  check(
    "Haertung: anon liest keine Pflueckernamen",
    (personal?.length ?? 0) === 0,
    `sichtbare Zeilen: ${personal?.length}`,
  );

  const { data: nachweise } = await anon.from("dokumente").select("name");
  check(
    "Haertung: anon liest keine Dokumente",
    (nachweise?.length ?? 0) === 0,
    `sichtbare Zeilen: ${nachweise?.length}`,
  );

  const { data: aufgabe } = await admin
    .from("pflueckaufgaben")
    .select("id, code, status, qualitaetsfaktor")
    .eq("status", "beleg_pruefung")
    .limit(1)
    .maybeSingle();

  if (aufgabe) {
    const { error: abschlussFehler } = await brigade
      .from("pflueckaufgaben")
      .update({ status: "abgeschlossen" })
      .eq("id", aufgabe.id);
    check(
      "Haertung: Brigade schliesst die eigene Aufgabe nicht ab",
      !!abschlussFehler,
      abschlussFehler?.code ?? "kein Fehler",
    );

    const { error: faktorFehler } = await brigade
      .from("pflueckaufgaben")
      .update({ qualitaetsfaktor: 1.5 })
      .eq("id", aufgabe.id);
    check(
      "Haertung: Brigade setzt keinen Qualitaetsfaktor",
      !!faktorFehler,
      faktorFehler?.code ?? "kein Fehler",
    );
  }

  // Nachtraeglich gespritzt: die laufende Aufgabe darf nicht weiterlaufen.
  const { data: laufend } = await admin
    .from("pflueckaufgaben")
    .select("id, reihenblock_id, ist_menge_kg, status")
    .neq("status", "abgeschlossen")
    .limit(1)
    .maybeSingle();

  if (laufend) {
    const { data: sperrBehandlung } = await admin
      .from("pflanzenschutz_behandlungen")
      .insert({
        reihenblock_id: laufend.reihenblock_id,
        psm_mittel_id: mittel.id,
        behandelt_am: new Date().toISOString().slice(0, 10),
        wartezeit_tage: mittel.wartezeit_tage,
      })
      .select("id")
      .single();

    const { error: weiterFehler } = await leitung
      .from("pflueckaufgaben")
      .update({ ist_menge_kg: Number(laufend.ist_menge_kg) + 5 })
      .eq("id", laufend.id);
    check(
      "Haertung: laufende Aufgabe stoppt bei nachtraeglicher Behandlung",
      weiterFehler?.code === "23514",
      weiterFehler?.code ?? "kein Fehler",
    );

    if (sperrBehandlung?.id) {
      await admin.from("pflanzenschutz_behandlungen").delete().eq("id", sperrBehandlung.id);
      await admin
        .from("reihenbloecke")
        .update({ status: "erntereif" })
        .eq("id", laufend.reihenblock_id);
    }
  }

  const { data: gefaelscht } = await leitung
    .from("audit_events")
    .insert({ actor: "Jemand ganz anderes", aktion: "__it_test", ressource: "test" })
    .select("actor")
    .maybeSingle();
  check(
    "Haertung: Audit-Urheber wird gesetzt, nicht uebernommen",
    !!gefaelscht && gefaelscht.actor !== "Jemand ganz anderes",
    `actor: ${gefaelscht?.actor}`,
  );

  // --- 8. Meilenstein C: die Nachweiskette --------------------------------
  // Jede dieser Zusagen wird dem Kunden in der Analysewoche gezeigt.

  const { data: freierBlock } = await admin
    .from("reihenbloecke")
    .select("id, code")
    .neq("status", "wartezeitgesperrt")
    .limit(1)
    .single();

  const testCode = `PA-IT-${Date.now().toString().slice(-8)}`;
  const { data: neueAufgabe, error: aufgabeAnlegenFehler } = await leitung
    .from("pflueckaufgaben")
    .insert({ code: testCode, reihenblock_id: freierBlock.id, zielmenge_kg: 20 })
    .select("id, code")
    .single();
  check(
    "Kette: Pflueckaufgabe angelegt",
    !aufgabeAnlegenFehler && !!neueAufgabe,
    aufgabeAnlegenFehler?.message ?? "",
  );

  const { data: autoCharge } = await admin
    .from("chargen")
    .select("id, code, pflueck_zeitpunkt")
    .eq("pflueckaufgabe_id", neueAufgabe.id)
    .maybeSingle();
  check(
    "Kette: Charge entsteht automatisch zur Aufgabe",
    !!autoCharge,
    autoCharge?.code ?? "keine Charge",
  );

  // Arbeitsbeginn startet die Uhr der Kuehlkette.
  await leitung
    .from("pflueckaufgaben")
    .update({ status: "angenommen" })
    .eq("id", neueAufgabe.id);
  await leitung
    .from("pflueckaufgaben")
    .update({ status: "in_arbeit" })
    .eq("id", neueAufgabe.id);

  const { data: chargeGestartet } = await admin
    .from("chargen")
    .select("pflueck_zeitpunkt")
    .eq("id", autoCharge.id)
    .single();
  check(
    "Kette: Arbeitsbeginn setzt den Pflueckzeitpunkt",
    !!chargeGestartet?.pflueck_zeitpunkt,
    chargeGestartet?.pflueck_zeitpunkt ?? "leer",
  );

  // Die Steige traegt die Person - hier endet die Kette nicht mehr bei der Brigade.
  const { data: einPfluecker } = await admin
    .from("pfluecker")
    .select("id, name")
    .limit(1)
    .single();

  const { error: steigeFehler } = await brigade.from("steigen").insert({
    code: `STG-IT-${Date.now().toString().slice(-8)}`,
    qr_token: `qr-it-${Date.now()}`,
    charge_id: autoCharge.id,
    pflueckaufgabe_id: neueAufgabe.id,
    pfluecker_id: einPfluecker.id,
    gewicht_kg: 2,
    scan_zeitpunkt: new Date().toISOString(),
  });
  check(
    "Kette: Brigade erfasst eine Steige mit Person",
    !steigeFehler,
    steigeFehler?.message ?? "",
  );

  // Die 60-Minuten-Regel urteilt in der Datenbank, nicht im Formular.
  await admin
    .from("chargen")
    .update({
      pflueck_zeitpunkt: new Date(Date.now() - 75 * 60_000).toISOString(),
    })
    .eq("id", autoCharge.id);

  const { data: messung, error: messungFehler } = await brigade
    .from("kuehlketten_messungen")
    .insert({
      charge_id: autoCharge.id,
      gemessen_am: new Date().toISOString(),
      temperatur_c: 7.5,
    })
    .select("minuten_seit_pfluecken, ergebnis")
    .single();
  check(
    "Kuehlkette: 75 Minuten werden als Verstoss erkannt",
    !messungFehler &&
      messung?.ergebnis === "verstoss" &&
      messung.minuten_seit_pfluecken >= 74,
    messungFehler?.message ?? `${messung?.minuten_seit_pfluecken} min, ${messung?.ergebnis}`,
  );

  // Abschluss schreibt den Ist-Erntetermin fort - Grundlage des Rotationsplans.
  await admin
    .from("pflueckaufgaben")
    .update({ status: "beleg_pruefung", ist_menge_kg: 18.5 })
    .eq("id", neueAufgabe.id);
  await leitung
    .from("pflueckaufgaben")
    .update({ status: "abgeschlossen" })
    .eq("id", neueAufgabe.id);

  const { data: blockNachher } = await admin
    .from("reihenbloecke")
    .select("letzte_ernte")
    .eq("id", freierBlock.id)
    .single();
  const heute = new Date().toISOString().slice(0, 10);
  check(
    "Kette: Abschluss schreibt die letzte Ernte fort",
    blockNachher?.letzte_ernte === heute,
    `letzte_ernte: ${blockNachher?.letzte_ernte}`,
  );

  const { data: chargeMenge } = await admin
    .from("chargen")
    .select("menge_kg")
    .eq("id", autoCharge.id)
    .single();
  check(
    "Kette: gemeldete Menge landet in der Charge",
    Number(chargeMenge?.menge_kg) === 18.5,
    `menge_kg: ${chargeMenge?.menge_kg}`,
  );

  const { data: nachweis, error: nachweisFehler } = await leitung.rpc(
    "rueckstandsnachweis",
    { p_charge: autoCharge.id },
  );
  check(
    "Kette: Rueckstandsnachweis je Charge ist abrufbar",
    !nachweisFehler && Array.isArray(nachweis),
    nachweisFehler?.message ?? `${nachweis?.length} Eintraege`,
  );

  // Zwei Aufgaben auf demselben Block in derselben Minute: ohne die
  // Aufgaben-Kennung im Chargencode bekaeme die zweite still keine Charge.
  const kollisionCodes = [];
  for (const nummer of [1, 2]) {
    const { data: aufgabe } = await leitung
      .from("pflueckaufgaben")
      .insert({
        code: `PA-IT-KOLL-${Date.now().toString().slice(-7)}-${nummer}`,
        reihenblock_id: freierBlock.id,
        zielmenge_kg: 5,
        faelligkeit: "2026-09-10T10:00:00+06",
      })
      .select("id")
      .single();
    const { data: ch } = await admin
      .from("chargen")
      .select("code")
      .eq("pflueckaufgabe_id", aufgabe.id)
      .maybeSingle();
    kollisionCodes.push({ aufgabe: aufgabe.id, code: ch?.code ?? null });
  }
  check(
    "Kette: gleiche Minute, gleicher Block - beide Aufgaben bekommen eine Charge",
    kollisionCodes.every((k) => k.code) &&
      kollisionCodes[0].code !== kollisionCodes[1].code,
    kollisionCodes.map((k) => k.code ?? "KEINE").join(" | "),
  );
  for (const k of kollisionCodes) {
    await admin.from("chargen").delete().eq("pflueckaufgabe_id", k.aufgabe);
    await admin.from("pflueckaufgaben").delete().eq("id", k.aufgabe);
  }

  // --- 9. Kennzahlen rechnen ----------------------------------------------
  const { data: kennzahlen, error: kennzahlenFehler } = await leitung.rpc("kpi_aktuell");
  const schluessel = new Set((kennzahlen ?? []).map((k) => k.schluessel));
  check(
    "Kennzahlen: mindestens acht werden aus Daten gerechnet",
    !kennzahlenFehler && (kennzahlen?.length ?? 0) >= 8,
    kennzahlenFehler?.message ?? `${kennzahlen?.length} Kennzahlen`,
  );
  check(
    "Kennzahlen: Pflueckleistung wird ohne Mehrfachzaehlung gerechnet",
    schluessel.has("pflueckleistung") &&
      (kennzahlen.find((k) => k.schluessel === "pflueckleistung")?.wert ?? 0) > 3,
    `kg/h: ${kennzahlen?.find((k) => k.schluessel === "pflueckleistung")?.wert}`,
  );

  const { data: kundeSieht } = await (await anmelden("kunde@malina.demo")).client
    .from("arbeitszeiten")
    .select("id");
  check(
    "Haertung: die Rolle kunde sieht keine Arbeitszeiten",
    (kundeSieht?.length ?? 0) === 0,
    `sichtbare Zeilen: ${kundeSieht?.length}`,
  );

  // --- 10. Abnahmepruefung vor dem Kundentermin: 19 bestaetigte Befunde ----

  // KRITISCH: die Brigade konnte Chargenfelder direkt umschreiben und damit
  // die 60-Minuten-Regel und die Verlustquote selbst setzen.
  const { data: brigadeChargeUpdate, error: brigadeChargeFehler } = await brigade
    .from("chargen")
    .update({ ausschuss_kg: 0 })
    .eq("id", autoCharge.id)
    .select("id");
  check(
    "Abnahme: Brigade schreibt keine Chargenfelder direkt",
    !brigadeChargeFehler && (brigadeChargeUpdate?.length ?? 0) === 0,
    brigadeChargeFehler?.message ?? `geaenderte Zeilen: ${brigadeChargeUpdate?.length}`,
  );
  const { error: leitungChargeFehler } = await leitung
    .from("chargen")
    .update({ ausschuss_kg: autoCharge.ausschuss_kg ?? 0 })
    .eq("id", autoCharge.id);
  check(
    "Abnahme: Betriebsleitung darf Chargenfelder korrigieren",
    !leitungChargeFehler,
    leitungChargeFehler?.message ?? "",
  );

  // KRITISCH: die Menge einer abgeschlossenen Aufgabe war fuer die Brigade
  // weiterhin aenderbar.
  const { data: abgeschlosseneAufgabe } = await admin
    .from("pflueckaufgaben")
    .select("id, ist_menge_kg")
    .eq("status", "abgeschlossen")
    .limit(1)
    .single();
  const { data: brigadeMengeUpdate, error: brigadeMengeFehler } = await brigade
    .from("pflueckaufgaben")
    .update({ ist_menge_kg: Number(abgeschlosseneAufgabe.ist_menge_kg) + 100 })
    .eq("id", abgeschlosseneAufgabe.id)
    .select("id");
  check(
    "Abnahme: Brigade aendert die Menge einer abgeschlossenen Aufgabe nicht",
    // Blockiert entweder die RLS-Policy still (0 Zeilen) oder der Trigger
    // pflueckaufgabe_freigabe_pruefen mit einer Exception - beides ist ein Pass.
    !!brigadeMengeFehler || (brigadeMengeUpdate?.length ?? 0) === 0,
    brigadeMengeFehler?.message ?? `geaenderte Zeilen: ${brigadeMengeUpdate?.length}`,
  );

  // HOCH: eine Brigade-Anmeldung konnte Arbeitszeit fuer eine Person aus
  // einer fremden Brigade anlegen. Massgeblich ist die tatsaechliche
  // Brigadenzuordnung des Demo-Kontos aus dem Profil, nicht eine Vermutung.
  const { data: eigeneBrigade } = await admin
    .from("profiles")
    .select("brigade_id")
    .eq("email", "brigade@malina.demo")
    .single();
  const { data: fremderPfluecker } = await admin
    .from("pfluecker")
    .select("id, brigade_id")
    .neq("brigade_id", eigeneBrigade.brigade_id)
    .limit(1)
    .single();
  const { data: fremdeZeitInsert, error: fremdeZeitFehler } = await brigade
    .from("arbeitszeiten")
    .insert({
      pfluecker_id: fremderPfluecker.id,
      pflueckaufgabe_id: neueAufgabe.id,
      beginn: new Date(Date.now() - 60_000).toISOString(),
      ende: new Date().toISOString(),
    })
    .select("id");
  check(
    "Abnahme: Brigade erfasst keine Arbeitszeit fuer eine fremde Brigade",
    !!fremdeZeitFehler || (fremdeZeitInsert?.length ?? 0) === 0,
    fremdeZeitFehler?.message ?? `eingefuegte Zeilen: ${fremdeZeitInsert?.length}`,
  );
  if (fremdeZeitInsert?.length) {
    await admin.from("arbeitszeiten").delete().in("id", fremdeZeitInsert.map((z) => z.id));
  }

  // HOCH: Steigen mit Personenbezug waren fuer kunde/erzeuger lesbar.
  const { data: kundeSteigen } = await (await anmelden("kunde@malina.demo")).client
    .from("steigen")
    .select("id");
  check(
    "Abnahme: die Rolle kunde liest keine Steigen",
    (kundeSteigen?.length ?? 0) === 0,
    `sichtbare Zeilen: ${kundeSteigen?.length}`,
  );

  // KRITISCH: eine Messung vor dem Pflueckzeitpunkt wurde als 0 Minuten / "ok"
  // gewertet statt abgelehnt zu werden.
  const { error: messungZuFruehFehler } = await admin
    .from("kuehlketten_messungen")
    .insert({
      charge_id: autoCharge.id,
      gemessen_am: new Date(Date.now() - 999 * 24 * 60 * 60_000).toISOString(),
      temperatur_c: 3,
    });
  check(
    "Abnahme: Messung vor dem Pflueckzeitpunkt wird abgelehnt",
    messungZuFruehFehler?.code === "23514",
    messungZuFruehFehler?.code ?? "kein Fehler",
  );

  // KRITISCH: eine deutlich zu warme Probe ohne bekannten Pflueckzeitpunkt
  // galt als "ok".
  const { data: planungsAufgabe } = await admin
    .from("pflueckaufgaben")
    .insert({
      code: `PA-IT-PLAN-${Date.now().toString().slice(-7)}`,
      reihenblock_id: freierBlock.id,
      zielmenge_kg: 5,
    })
    .select("id")
    .single();
  const { data: planungsCharge } = await admin
    .from("chargen")
    .select("id")
    .eq("pflueckaufgabe_id", planungsAufgabe.id)
    .single();
  const { data: heisseMessung, error: heisseMessungFehler } = await admin
    .from("kuehlketten_messungen")
    .insert({ charge_id: planungsCharge.id, gemessen_am: new Date().toISOString(), temperatur_c: 26 })
    .select("ergebnis")
    .single();
  check(
    "Abnahme: eine 26-Grad-Probe ohne Pflueckzeitpunkt gilt nicht als ok",
    !heisseMessungFehler && heisseMessung?.ergebnis !== "ok",
    heisseMessungFehler?.message ?? `ergebnis: ${heisseMessung?.ergebnis}`,
  );
  await admin.from("kuehlketten_messungen").delete().eq("charge_id", planungsCharge.id);
  await admin.from("chargen").delete().eq("id", planungsCharge.id);
  await admin.from("pflueckaufgaben").delete().eq("id", planungsAufgabe.id);

  // KRITISCH: zeitBisVorkuehlung blendete genau die Chargen aus, die die
  // 60-Minuten-Regel gerissen haben (Ueberlebenden-Fehler).
  const { data: verstossMessung, error: verstossMessungFehler } = await admin
    .from("kuehlketten_messungen")
    .insert({
      charge_id: autoCharge.id,
      gemessen_am: new Date().toISOString(),
      temperatur_c: 9,
    })
    .select("ergebnis")
    .single();
  const { data: chargeNachVerstoss } = await admin
    .from("chargen")
    .select("vorkuehlung_zeitpunkt")
    .eq("id", autoCharge.id)
    .single();
  check(
    "Abnahme: auch eine zu warme Probe setzt den Vorkuehlungszeitpunkt (zaehlt in der Kennzahl mit)",
    !verstossMessungFehler &&
      verstossMessung?.ergebnis === "verstoss" &&
      !!chargeNachVerstoss?.vorkuehlung_zeitpunkt,
    verstossMessungFehler?.message ?? `ergebnis: ${verstossMessung?.ergebnis}`,
  );

  // HOCH: ein geloeschter Reihenblock riss den Rueckstandsnachweis seiner
  // Chargen ab (SET NULL) bzw. loeschte Aufgaben mit (CASCADE).
  const { error: blockLoeschenFehler } = await admin
    .from("reihenbloecke")
    .delete()
    .eq("id", freierBlock.id);
  check(
    "Abnahme: ein Reihenblock mit Ernte-Historie laesst sich nicht loeschen",
    blockLoeschenFehler?.code === "23503",
    blockLoeschenFehler?.code ?? "kein Fehler - Loeschen war erlaubt",
  );

  // GERING: pflueckaufgaben.charge_id blieb bei automatisch erzeugten Chargen
  // leer.
  const { data: aufgabeMitCharge } = await admin
    .from("pflueckaufgaben")
    .select("charge_id")
    .eq("id", neueAufgabe.id)
    .single();
  check(
    "Abnahme: pflueckaufgaben.charge_id wird von der automatisch erzeugten Charge gefuellt",
    !!aufgabeMitCharge?.charge_id,
    `charge_id: ${aufgabeMitCharge?.charge_id}`,
  );

  // --- 11. Compliance-Cockpit: granulares Datenschutz-Schema (WMCNL-1446) --
  // Loest das bisherige public.consent_records ab: verarbeitungszwecke,
  // einwilligungen, personenbezogene_zugriffe, datenschutzvorfaelle,
  // drittweitergaben. Nur Buero-Rollen lesen/schreiben.

  const { data: zweckeAnon } = await anon.from("verarbeitungszwecke").select("id");
  check(
    "Compliance-RLS: anon liest keine Verarbeitungszwecke",
    (zweckeAnon?.length ?? 0) === 0,
    `sichtbare Zeilen: ${zweckeAnon?.length}`,
  );

  const { data: einwilligungenBrigade } = await brigade.from("einwilligungen").select("id");
  check(
    "Compliance-RLS: Brigade liest keine Einwilligungen",
    (einwilligungenBrigade?.length ?? 0) === 0,
    `sichtbare Zeilen: ${einwilligungenBrigade?.length}`,
  );

  const { data: zweckeLeitung, error: zweckeLeitungFehler } = await leitung
    .from("verarbeitungszwecke")
    .select("id, code");
  check(
    "Compliance-RLS: Betriebsleitung liest Verarbeitungszwecke",
    !zweckeLeitungFehler && (zweckeLeitung?.length ?? 0) > 0,
    zweckeLeitungFehler?.message ?? `${zweckeLeitung?.length} Zwecke`,
  );

  const { data: testPfluecker } = await admin.from("pfluecker").select("id").limit(1).single();
  const { data: zweckFuerTest } = await admin
    .from("verarbeitungszwecke")
    .select("id")
    .eq("code", "personaleinsatz")
    .single();

  // Genau ein Betroffener wird per Check-Constraint erzwungen (kein
  // Subjekt-Freitext mehr wie bei der abgeloesten consent_records-Tabelle).
  // Ueber admin getestet (bypasst RLS), damit ausschliesslich der
  // Check-Constraint geprueft wird, nicht das Rollen-Recht der Schreib-Policy.
  const { error: keinBetroffenerFehler } = await admin.from("einwilligungen").insert({
    zweck_id: zweckFuerTest.id,
    textfassung: "Test ohne Betroffenen",
    kanal: "papier",
  });
  check(
    "Compliance-Schema: Einwilligung ohne Betroffenen wird abgelehnt",
    keinBetroffenerFehler?.code === "23514",
    keinBetroffenerFehler?.code ?? "kein Fehler",
  );

  const { data: einB2bKunde } = await admin.from("b2b_kunden").select("id").limit(1).single();
  const { error: zweiBetroffeneFehler } = await admin.from("einwilligungen").insert({
    betroffener_pfluecker_id: testPfluecker.id,
    betroffener_b2b_kunde_id: einB2bKunde.id,
    zweck_id: zweckFuerTest.id,
    textfassung: "Test mit zwei Betroffenen",
    kanal: "papier",
  });
  check(
    "Compliance-Schema: Einwilligung mit zwei Betroffenen wird abgelehnt",
    zweiBetroffeneFehler?.code === "23514",
    zweiBetroffeneFehler?.code ?? "kein Fehler",
  );

  const { error: brigadeEinwilligungFehler } = await brigade.from("einwilligungen").insert({
    betroffener_pfluecker_id: testPfluecker.id,
    zweck_id: zweckFuerTest.id,
    textfassung: "Von der Brigade versucht",
    kanal: "papier",
  });
  check(
    "Compliance-RLS: Brigade darf keine Einwilligung erfassen",
    brigadeEinwilligungFehler?.code === "42501",
    brigadeEinwilligungFehler?.code ?? "kein Fehler",
  );

  const { data: neueEinwilligung, error: einwilligungAnlegenFehler } = await leitung
    .from("einwilligungen")
    .insert({
      betroffener_pfluecker_id: testPfluecker.id,
      zweck_id: zweckFuerTest.id,
      textfassung: "Einwilligungstext Integrationstest",
      kanal: "papier",
    })
    .select("id, widerrufen_am")
    .single();
  check(
    "Compliance: Betriebsleitung erfasst eine Einwilligung",
    !einwilligungAnlegenFehler && !!neueEinwilligung && neueEinwilligung.widerrufen_am === null,
    einwilligungAnlegenFehler?.message ?? "",
  );

  const { error: einwilligungAendernFehler } = await admin
    .from("einwilligungen")
    .update({ textfassung: "nachtraeglich geaendert" })
    .eq("id", neueEinwilligung.id);
  check(
    "Compliance: eine erteilte Einwilligung ist unveraenderlich",
    einwilligungAendernFehler?.code === "23514",
    einwilligungAendernFehler?.code ?? "kein Fehler",
  );

  const { data: widerrufen, error: widerrufFehler } = await leitung
    .from("einwilligungen")
    .update({ widerrufen_am: new Date().toISOString(), widerruf_grund: "Testwiderruf" })
    .eq("id", neueEinwilligung.id)
    .select("widerrufen_am, widerruf_grund")
    .single();
  check(
    "Compliance: der Widerruf ist als Update zulaessig",
    !widerrufFehler && !!widerrufen?.widerrufen_am,
    widerrufFehler?.message ?? "",
  );

  const { error: einwilligungLoeschenFehler } = await admin
    .from("einwilligungen")
    .delete()
    .eq("id", neueEinwilligung.id);
  check(
    "Compliance: eine Einwilligung wird nicht geloescht, sondern widerrufen",
    einwilligungLoeschenFehler?.code === "23514",
    einwilligungLoeschenFehler?.code ?? "kein Fehler",
  );
  // Der Trigger blockt DELETE endgueltig - die Testzeile bleibt bewusst stehen,
  // wie schon der bestehende Audit-Test (aktion "__it_test") es fuer die
  // gleichermassen unveraenderliche audit_events-Tabelle tut.

  // --- Datenschutzvorfaelle: Meldefrist automatisch, Meldung braucht Referenz
  const { data: neuerVorfall, error: vorfallAnlegenFehler } = await leitung
    .from("datenschutzvorfaelle")
    .insert({
      festgestellt_am: new Date().toISOString(),
      art: "sonstiges",
      beschreibung: "Integrationstest-Vorfall",
      betroffene_anzahl: 1,
    })
    .select("id, festgestellt_am, meldefrist_am")
    .single();
  check(
    "Compliance: Meldefrist eines Vorfalls wird automatisch gesetzt",
    !vorfallAnlegenFehler && !!neuerVorfall?.meldefrist_am,
    vorfallAnlegenFehler?.message ??
      `festgestellt: ${neuerVorfall?.festgestellt_am}, meldefrist: ${neuerVorfall?.meldefrist_am}`,
  );

  const { error: meldungOhneReferenzFehler } = await leitung
    .from("datenschutzvorfaelle")
    .update({ gemeldet_am: new Date().toISOString() })
    .eq("id", neuerVorfall.id);
  check(
    "Compliance: eine Meldung ohne Meldereferenz wird abgelehnt",
    meldungOhneReferenzFehler?.code === "23514",
    meldungOhneReferenzFehler?.code ?? "kein Fehler",
  );

  const { data: gemeldeterVorfall, error: meldungFehler } = await leitung
    .from("datenschutzvorfaelle")
    .update({ gemeldet_am: new Date().toISOString(), meldereferenz: "IT-TEST-001" })
    .eq("id", neuerVorfall.id)
    .select("gemeldet_am")
    .single();
  check(
    "Compliance: eine Meldung mit Referenz wird angenommen",
    !meldungFehler && !!gemeldeterVorfall?.gemeldet_am,
    meldungFehler?.message ?? "",
  );
  await admin.from("datenschutzvorfaelle").delete().eq("id", neuerVorfall.id);

  // --- Drittweitergaben: Benachrichtigungsfrist automatisch (14 Tage) ------
  const { data: neueDrittweitergabe, error: drittweitergabeFehler } = await leitung
    .from("drittweitergaben")
    .insert({
      betroffener_pfluecker_id: testPfluecker.id,
      empfaenger: "Integrationstest-Empfaenger",
      weitergegeben_am: "2026-01-01T00:00:00+06:00",
    })
    .select("weitergegeben_am, benachrichtigungsfrist_am")
    .single();
  const erwarteteFrist = new Date("2026-01-15T00:00:00+06:00").getTime();
  check(
    "Compliance: Benachrichtigungsfrist einer Drittweitergabe wird auf +14 Tage gesetzt",
    !drittweitergabeFehler &&
      new Date(neueDrittweitergabe?.benachrichtigungsfrist_am ?? 0).getTime() === erwarteteFrist,
    drittweitergabeFehler?.message ?? `frist: ${neueDrittweitergabe?.benachrichtigungsfrist_am}`,
  );
  await admin
    .from("drittweitergaben")
    .delete()
    .eq("betroffener_pfluecker_id", testPfluecker.id)
    .eq("empfaenger", "Integrationstest-Empfaenger");

  // --- personenbezogene_zugriffe: append-only Zugriffsprotokoll -----------
  const { data: zugriffAnon } = await anon.from("personenbezogene_zugriffe").select("id");
  check(
    "Compliance-RLS: anon liest keine personenbezogenen Zugriffe",
    (zugriffAnon?.length ?? 0) === 0,
    `sichtbare Zeilen: ${zugriffAnon?.length}`,
  );

  const { data: neuerZugriff, error: zugriffAnlegenFehler } = await leitung
    .from("personenbezogene_zugriffe")
    .insert({
      betroffener_pfluecker_id: testPfluecker.id,
      zweck_id: zweckFuerTest.id,
      aktion: "export",
      entitaet: "lohn_abrechnungen",
      client_info: "Integrationstest",
    })
    .select("id")
    .single();
  check(
    "Compliance: ein Zugriff auf personenbezogene Daten wird protokolliert",
    !zugriffAnlegenFehler && !!neuerZugriff,
    zugriffAnlegenFehler?.message ?? "",
  );

  const { error: zugriffAendernFehler } = await admin
    .from("personenbezogene_zugriffe")
    .update({ aktion: "lesen" })
    .eq("id", neuerZugriff.id);
  check(
    "Compliance: das Zugriffsprotokoll ist append-only (kein Update)",
    zugriffAendernFehler?.code === "P0001",
    zugriffAendernFehler?.code ?? "kein Fehler",
  );

  const { error: zugriffLoeschenFehler } = await admin
    .from("personenbezogene_zugriffe")
    .delete()
    .eq("id", neuerZugriff.id);
  check(
    "Compliance: das Zugriffsprotokoll ist append-only (kein Delete)",
    zugriffLoeschenFehler?.code === "P0001",
    zugriffLoeschenFehler?.code ?? "kein Fehler",
  );

  // --- 12. Reklamationsmanagement (WMCNL-1455) -----------------------------
  // Groesstes Risiko laut Vorab-Recherche: ohne profiles.b2b_kunde_id liesse
  // sich "Kunde sieht nur eigene Reklamation" nicht RLS-sauber pruefen. Die
  // Tests decken deshalb sowohl die Sichtbarkeit als auch den Selbstschutz der
  // Zuordnung (trg_profil_b2b_kunde) ab, nicht nur die beiden neuen Tabellen.

  const { data: reklamationenAnon } = await anon.from("reklamationen").select("id");
  check(
    "Reklamation-RLS: anon liest keine Reklamationen",
    (reklamationenAnon?.length ?? 0) === 0,
    `sichtbare Zeilen: ${reklamationenAnon?.length}`,
  );

  const { data: reklamationenBrigade } = await brigade.from("reklamationen").select("id");
  check(
    "Reklamation-RLS: Brigade liest keine Reklamationen",
    (reklamationenBrigade?.length ?? 0) === 0,
    `sichtbare Zeilen: ${reklamationenBrigade?.length}`,
  );

  const { data: reklamationenLeitung, error: reklamationenLeitungFehler } = await leitung
    .from("reklamationen")
    .select("id, code");
  check(
    "Reklamation-RLS: Betriebsleitung sieht alle drei Seed-Reklamationen",
    !reklamationenLeitungFehler && (reklamationenLeitung?.length ?? 0) >= 3,
    reklamationenLeitungFehler?.message ?? `${reklamationenLeitung?.length} Reklamationen`,
  );

  const { client: kunde, fehler: kundeFehler } = await anmelden("kunde@malina.demo");
  check("Auth: Kunde meldet sich an", !!kunde, kundeFehler ?? "");

  const { data: handelskette } = await admin
    .from("b2b_kunden")
    .select("id")
    .eq("name", "Handelskette A")
    .single();
  const { data: almatyFresh } = await admin
    .from("b2b_kunden")
    .select("id")
    .eq("name", "Almaty Fresh Market")
    .single();
  const { data: kundeProfil } = await admin
    .from("profiles")
    .select("b2b_kunde_id")
    .eq("email", "kunde@malina.demo")
    .single();
  check(
    "Reklamation-Setup: kunde@malina.demo ist Almaty Fresh Market zugeordnet",
    kundeProfil?.b2b_kunde_id === almatyFresh?.id,
    `b2b_kunde_id: ${kundeProfil?.b2b_kunde_id}`,
  );

  if (kunde) {
    const { data: reklamationenKunde, error: reklamationenKundeFehler } = await kunde
      .from("reklamationen")
      .select("id, b2b_kunde_id");
    check(
      "Reklamation-RLS: Kunde sieht mindestens die eigene Reklamation",
      !reklamationenKundeFehler && (reklamationenKunde?.length ?? 0) >= 1,
      reklamationenKundeFehler?.message ?? `${reklamationenKunde?.length} Reklamationen`,
    );
    check(
      "Reklamation-RLS: Kunde sieht ausschliesslich die eigene Firma",
      (reklamationenKunde ?? []).every((r) => r.b2b_kunde_id === almatyFresh.id),
      `fremde b2b_kunde_id dabei: ${(reklamationenKunde ?? [])
        .filter((r) => r.b2b_kunde_id !== almatyFresh.id)
        .map((r) => r.b2b_kunde_id)
        .join(", ") || "keine"}`,
    );

    // KRITISCH: ein Kunde darf keine Reklamation fuer eine fremde Firma anlegen.
    const { data: fremdeReklamation, error: fremdeReklamationFehler } = await kunde
      .from("reklamationen")
      .insert({
        code: `REK-IT-FREMD-${Date.now()}`,
        b2b_kunde_id: handelskette.id,
        grund: "sonstiges",
        betreff: "Integrationstest - fremde Firma",
      })
      .select("id");
    check(
      "Reklamation-RLS: Kunde legt keine Reklamation fuer eine fremde Firma an",
      !!fremdeReklamationFehler || (fremdeReklamation?.length ?? 0) === 0,
      fremdeReklamationFehler?.code ?? `eingefuegte Zeilen: ${fremdeReklamation?.length}`,
    );

    // Aber die eigene Firma funktioniert - und die Frist wird automatisch gesetzt.
    const { data: eigeneReklamation, error: eigeneReklamationFehler } = await kunde
      .from("reklamationen")
      .insert({
        code: `REK-IT-EIGEN-${Date.now()}`,
        b2b_kunde_id: almatyFresh.id,
        grund: "qualitaet",
        betreff: "Integrationstest - eigene Firma",
      })
      .select("id, frist_am, gemeldet_am")
      .single();
    check(
      "Reklamation: Kunde legt eine Reklamation fuer die eigene Firma an",
      !eigeneReklamationFehler && !!eigeneReklamation,
      eigeneReklamationFehler?.message ?? "",
    );
    // frist_am ist ein reines Datum (kein Zeitstempel) - der Vergleich laeuft
    // deshalb ueber das Kalenderdatum, nicht ueber eine Millisekunden-Distanz,
    // die an der Uhrzeitkomponente von gemeldet_am vorbeilaufen wuerde.
    const erwarteteFrist = eigeneReklamationFehler
      ? null
      : new Date(new Date(eigeneReklamation.gemeldet_am).getTime() + 5 * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);
    check(
      "Reklamation: Frist wird automatisch auf +5 Tage gesetzt",
      !eigeneReklamationFehler && eigeneReklamation.frist_am === erwarteteFrist,
      `gemeldet: ${eigeneReklamation?.gemeldet_am}, frist: ${eigeneReklamation?.frist_am}, erwartet: ${erwarteteFrist}`,
    );

    // HOCH: der groesste Befund aus der Vorab-Recherche - ein Kunde darf sich
    // nicht selbst einer anderen Firma zuordnen und damit deren Reklamationen
    // lesen (trg_profil_b2b_kunde).
    const { error: selbstZuordnungFehler } = await kunde
      .from("profiles")
      .update({ b2b_kunde_id: handelskette.id })
      .eq("email", "kunde@malina.demo");
    check(
      "Reklamation-Haertung: Kunde ordnet sich nicht selbst einer fremden Firma zu",
      selbstZuordnungFehler?.code === "42501",
      selbstZuordnungFehler?.code ?? "kein Fehler",
    );
    const { data: profilNachVersuch } = await admin
      .from("profiles")
      .select("b2b_kunde_id")
      .eq("email", "kunde@malina.demo")
      .single();
    check(
      "Reklamation-Haertung: b2b_kunde_id bleibt unveraendert",
      profilNachVersuch?.b2b_kunde_id === almatyFresh.id,
      `b2b_kunde_id: ${profilNachVersuch?.b2b_kunde_id}`,
    );

    if (eigeneReklamation?.id) {
      await admin.from("reklamationen").delete().eq("id", eigeneReklamation.id);
    }
  }

  // Check-Constraint: eine Entscheidung braucht Loesung + Abschlusszeitpunkt.
  const { data: neueTestReklamation } = await admin
    .from("reklamationen")
    .insert({
      code: `REK-IT-CHECK-${Date.now()}`,
      b2b_kunde_id: handelskette.id,
      grund: "sonstiges",
      betreff: "Integrationstest - Check-Constraints",
    })
    .select("id")
    .single();

  const { error: erledigtOhneLoesungFehler } = await admin
    .from("reklamationen")
    .update({ status: "erledigt" })
    .eq("id", neueTestReklamation.id);
  check(
    "Reklamation-Schema: 'erledigt' ohne Loesung wird abgelehnt",
    erledigtOhneLoesungFehler?.code === "23514",
    erledigtOhneLoesungFehler?.code ?? "kein Fehler",
  );

  // KRITISCH: eine abgelehnte Reklamation darf keine Gutschrift bekommen.
  const { error: gutschriftBeiAblehnungFehler } = await admin
    .from("reklamationen")
    .update({ status: "abgelehnt", loesung: "Kein Anspruch nach Pruefung.", gutschrift_tenge: 5000 })
    .eq("id", neueTestReklamation.id);
  check(
    "Reklamation-Schema: Gutschrift bei Ablehnung wird abgelehnt",
    gutschriftBeiAblehnungFehler?.code === "23514",
    gutschriftBeiAblehnungFehler?.code ?? "kein Fehler",
  );

  // Trigger: der Abschlusszeitpunkt wird automatisch gesetzt, auch wenn die
  // Anwendung ihn vergisst - und der Statuswechsel schreibt sich selbst in
  // reklamation_ereignisse fort.
  const { data: angenommeneReklamation, error: annahmeFehler } = await leitung
    .from("reklamationen")
    .update({ status: "angenommen", loesung: "Reklamation anerkannt.", gutschrift_tenge: 12000 })
    .eq("id", neueTestReklamation.id)
    .select("erledigt_am")
    .single();
  check(
    "Reklamation: Annahme mit Gutschrift wird angenommen",
    !annahmeFehler && !!angenommeneReklamation,
    annahmeFehler?.message ?? "",
  );
  check(
    "Reklamation-Trigger: erledigt_am wird automatisch gesetzt",
    !!angenommeneReklamation?.erledigt_am,
    `erledigt_am: ${angenommeneReklamation?.erledigt_am}`,
  );

  const { data: ereignisNachAnnahme } = await admin
    .from("reklamation_ereignisse")
    .select("id, neuer_status, text")
    .eq("reklamation_id", neueTestReklamation.id)
    .eq("neuer_status", "angenommen");
  check(
    "Reklamation-Trigger: Statuswechsel protokolliert sich automatisch im Verlauf",
    (ereignisNachAnnahme?.length ?? 0) === 1 && ereignisNachAnnahme[0].text === "Reklamation anerkannt.",
    JSON.stringify(ereignisNachAnnahme),
  );

  // Append-only: der Verlauf laesst sich nicht nachtraeglich umschreiben oder loeschen.
  if (ereignisNachAnnahme?.[0]?.id) {
    const { error: ereignisUpdateFehler } = await admin
      .from("reklamation_ereignisse")
      .update({ text: "nachtraeglich geaendert" })
      .eq("id", ereignisNachAnnahme[0].id);
    check(
      "Reklamation: der Verlauf ist append-only (kein Update)",
      ereignisUpdateFehler?.code === "P0001",
      ereignisUpdateFehler?.code ?? "kein Fehler",
    );

    const { error: ereignisDeleteFehler } = await admin
      .from("reklamation_ereignisse")
      .delete()
      .eq("id", ereignisNachAnnahme[0].id);
    check(
      "Reklamation: der Verlauf ist append-only (kein Delete)",
      ereignisDeleteFehler?.code === "P0001",
      ereignisDeleteFehler?.code ?? "kein Fehler",
    );
  }

  // KRITISCH: die Brigade darf weder eine Reklamation bearbeiten noch anlegen -
  // "reklamationen" taucht in rolePermissions fuer brigade gar nicht auf.
  const { data: brigadeReklamationUpdate, error: brigadeReklamationUpdateFehler } = await brigade
    .from("reklamationen")
    .update({ status: "in_pruefung" })
    .eq("id", neueTestReklamation.id)
    .select("id");
  check(
    "Reklamation-RLS: Brigade bearbeitet keine Reklamation",
    !!brigadeReklamationUpdateFehler || (brigadeReklamationUpdate?.length ?? 0) === 0,
    brigadeReklamationUpdateFehler?.code ?? `geaenderte Zeilen: ${brigadeReklamationUpdate?.length}`,
  );

  // Kein Cleanup fuer neueTestReklamation: sie traegt inzwischen einen
  // Verlaufseintrag, und reklamation_ereignisse ist append-only - ein Loeschen
  // der Reklamation wuerde per on-delete-cascade denselben Trigger treffen,
  // der genau das verhindern soll. Die Testzeile bleibt bewusst stehen, wie
  // schon der Einwilligungs-Testfall in Abschnitt 11 fuer dieselbe Situation.

  // Cleanup: Testaufgabe samt Kette entfernen, Ursprungsstatus wiederherstellen.
  await admin.from("steigen").delete().eq("pflueckaufgabe_id", neueAufgabe.id);
  await admin.from("kuehlketten_messungen").delete().eq("charge_id", autoCharge.id);
  await admin.from("chargen").delete().eq("id", autoCharge.id);
  await admin.from("pflueckaufgaben").delete().eq("id", neueAufgabe.id);
  await admin.from("pflanzenschutz_behandlungen").delete().eq("id", behandlung.id);
  await admin.from("reihenbloecke").update({ status: block.status }).eq("id", block.id);
}

console.log("");
if (failures > 0) {
  console.error(`${failures} Test(s) fehlgeschlagen.`);
  process.exit(1);
}
console.log("Alle Integrationstests gruen.");
