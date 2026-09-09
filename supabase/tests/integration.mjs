// =============================================================================
// Damicon - Supabase Integrationstest (lokal)
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
    password: "DamiconDemo2026!",
  });
  if (error) return { client: null, fehler: error.message };
  return { client, fehler: null };
}

const { client: leitung, fehler: leitungFehler } = await anmelden("leitung@damicon.demo");
const { client: brigade, fehler: brigadeFehler } = await anmelden("brigade@damicon.demo");

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

  // Anforderung 2.1: ein bestehender Reihenblock laesst sich umbenennen und
  // im Sortenprofil korrigieren, nicht nur beim Anlegen setzen.
  const urspruenglicherCode = block.code;
  const neuerCode = `${urspruenglicherCode}-IT`;
  const { data: umbenannterBlock, error: umbenennenFehler } = await leitung
    .from("reihenbloecke")
    .update({ code: neuerCode })
    .eq("id", block.id)
    .select("id, code")
    .single();
  check(
    "Anforderung 2.1: Betriebsleitung benennt einen bestehenden Reihenblock um",
    !umbenennenFehler && umbenannterBlock?.code === neuerCode,
    umbenennenFehler?.message ?? "",
  );
  await admin.from("reihenbloecke").update({ code: urspruenglicherCode }).eq("id", block.id);

  const { data: brigadeUmbenennenVersuch, error: brigadeUmbenennenFehler } = await brigade
    .from("reihenbloecke")
    .update({ code: `${urspruenglicherCode}-BR` })
    .eq("id", block.id)
    .select("id");
  check(
    "Anforderung 2.1 RLS: Brigade darf einen Reihenblock nicht umbenennen",
    !brigadeUmbenennenFehler && (brigadeUmbenennenVersuch?.length ?? 0) === 0,
    brigadeUmbenennenFehler?.message ?? `geaenderte Zeilen: ${brigadeUmbenennenVersuch?.length}`,
  );

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

  // Anforderung 2.4: Aufwandmenge und durchfuehrende Person lassen sich
  // strukturiert erfassen, statt als Freitext im Audit-Log zu verschwinden.
  const { data: irgendeinProfil } = await admin
    .from("profiles")
    .select("id")
    .limit(1)
    .single();
  const { data: behandlungMitMenge, error: behandlungMengeFehler } = await leitung
    .from("pflanzenschutz_behandlungen")
    .insert({
      reihenblock_id: block.id,
      psm_mittel_id: mittel.id,
      behandelt_am: new Date().toISOString().slice(0, 10),
      wartezeit_tage: mittel.wartezeit_tage,
      aufwandmenge: 1.5,
      aufwandmenge_einheit: "kg_ha",
      durchgefuehrt_von_profil_id: irgendeinProfil.id,
    })
    .select("id, aufwandmenge, aufwandmenge_einheit, durchgefuehrt_von_profil_id")
    .single();
  check(
    "Anforderung 2.4: Aufwandmenge, Einheit und durchfuehrende Person werden gespeichert",
    !behandlungMengeFehler &&
      Number(behandlungMitMenge?.aufwandmenge) === 1.5 &&
      behandlungMitMenge?.aufwandmenge_einheit === "kg_ha" &&
      behandlungMitMenge?.durchgefuehrt_von_profil_id === irgendeinProfil.id,
    behandlungMengeFehler?.message ?? "",
  );
  if (behandlungMitMenge?.id) {
    await admin.from("pflanzenschutz_behandlungen").delete().eq("id", behandlungMitMenge.id);
  }

  const { error: mengeOhneEinheitFehler } = await admin
    .from("pflanzenschutz_behandlungen")
    .insert({
      reihenblock_id: block.id,
      psm_mittel_id: mittel.id,
      behandelt_am: new Date().toISOString().slice(0, 10),
      wartezeit_tage: mittel.wartezeit_tage,
      aufwandmenge: 1.5,
    });
  check(
    "Anforderung 2.4: Aufwandmenge ohne Einheit wird abgelehnt (Check-Constraint)",
    mengeOhneEinheitFehler?.code === "23514",
    mengeOhneEinheitFehler?.code ?? "kein Fehler",
  );

  // Anforderung 4.1: behandelt_am darf ueber die Anwendung nicht rueckdatiert
  // werden, sonst liesse sich die Wartezeitsperre (freigabe_am = behandelt_am
  // + wartezeit_tage) rueckwirkend unterlaufen.
  const { error: rueckdatierungFehler } = await leitung
    .from("pflanzenschutz_behandlungen")
    .update({ behandelt_am: "2020-01-01" })
    .eq("id", behandlung.id);
  check(
    "Anforderung 4.1: behandelt_am laesst sich ueber die Anwendung nicht rueckdatieren",
    rueckdatierungFehler?.code === "23514",
    rueckdatierungFehler?.code ?? "kein Fehler",
  );

  const { data: behandlungLoeschenVersuch, error: behandlungLoeschenFehler } = await leitung
    .from("pflanzenschutz_behandlungen")
    .delete()
    .eq("id", behandlung.id)
    .select("id");
  check(
    "Anforderung 4.1: eine Behandlung laesst sich ueber die Anwendung nicht loeschen",
    // Blockiert entweder die RLS-Policy still (0 Zeilen, keine Delete-Policy
    // vorgesehen) oder der Trigger mit einer Exception - beides ist ein Pass.
    behandlungLoeschenFehler?.code === "23514" ||
      (behandlungLoeschenVersuch?.length ?? 0) === 0,
    behandlungLoeschenFehler?.code ?? `geloeschte Zeilen: ${behandlungLoeschenVersuch?.length}`,
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

  // Anforderung 2.10: Stichprobenkontrolle je einzelner Steige.
  const { data: neueSteige } = await admin
    .from("steigen")
    .select("id, kontrolliert_am")
    .eq("pflueckaufgabe_id", neueAufgabe.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  check(
    "Anforderung 2.10: eine neu erfasste Steige ist noch nicht kontrolliert",
    neueSteige?.kontrolliert_am === null,
    `kontrolliert_am: ${neueSteige?.kontrolliert_am}`,
  );

  const { data: brigadeKontrollVersuch, error: brigadeKontrollFehler } = await brigade
    .from("steigen")
    .update({ kontrolliert_am: new Date().toISOString() })
    .eq("id", neueSteige.id)
    .select("id");
  check(
    "Anforderung 2.10: die Brigade kontrolliert die eigene Steige nicht selbst",
    !!brigadeKontrollFehler || (brigadeKontrollVersuch?.length ?? 0) === 0,
    brigadeKontrollFehler?.code ?? `geaenderte Zeilen: ${brigadeKontrollVersuch?.length}`,
  );

  const { data: kontrollierteSteige, error: kontrollFehler } = await leitung
    .from("steigen")
    .update({ kontrolliert_am: new Date().toISOString(), kontrolliert_von_profil_id: irgendeinProfil.id })
    .eq("id", neueSteige.id)
    .select("kontrolliert_am, kontrolliert_von_profil_id")
    .single();
  check(
    "Anforderung 2.10: Betriebsleitung kontrolliert eine einzelne Steige",
    !kontrollFehler &&
      !!kontrollierteSteige?.kontrolliert_am &&
      kontrollierteSteige?.kontrolliert_von_profil_id === irgendeinProfil.id,
    kontrollFehler?.message ?? "",
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

  // Anforderung 4.1: eine Kuehlmessung ist ein Zeitpunkt-Fakt, eine Korrektur
  // ist fachlich eine neue Messung, keine Aenderung der alten.
  const { data: messungMitId } = await admin
    .from("kuehlketten_messungen")
    .select("id")
    .eq("charge_id", autoCharge.id)
    .order("gemessen_am", { ascending: false })
    .limit(1)
    .single();
  const { data: messungAendernVersuch, error: messungAendernFehler } = await leitung
    .from("kuehlketten_messungen")
    .update({ temperatur_c: 2 })
    .eq("id", messungMitId.id)
    .select("id");
  check(
    "Anforderung 4.1: eine Kuehlmessung laesst sich ueber die Anwendung nicht aendern",
    // Blockiert entweder die RLS-Policy still (0 Zeilen, keine Update-Policy
    // vorgesehen) oder der Trigger mit einer Exception - beides ist ein Pass.
    messungAendernFehler?.code === "23514" || (messungAendernVersuch?.length ?? 0) === 0,
    messungAendernFehler?.code ?? `geaenderte Zeilen: ${messungAendernVersuch?.length}`,
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

  const { data: kundeSieht } = await (await anmelden("kunde@damicon.demo")).client
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

  // Anforderung 4.1: vor dieser Migration durfte die Betriebsleitung eine
  // abgeschlossene Menge noch ueberschreiben (nur die Brigade war
  // ausgeschlossen). Das war die eigentliche Luecke aus dem Masterplan-Audit.
  const { error: leitungMengeFehler } = await leitung
    .from("pflueckaufgaben")
    .update({ ist_menge_kg: Number(abgeschlosseneAufgabe.ist_menge_kg) + 100 })
    .eq("id", abgeschlosseneAufgabe.id);
  check(
    "Anforderung 4.1: auch die Betriebsleitung aendert die Menge einer abgeschlossenen Aufgabe nicht mehr",
    leitungMengeFehler?.code === "23514",
    leitungMengeFehler?.code ?? "kein Fehler",
  );

  const { error: leitungQualitaetFehler } = await leitung
    .from("pflueckaufgaben")
    .update({ qualitaetsfaktor: 0.5 })
    .eq("id", abgeschlosseneAufgabe.id);
  check(
    "Anforderung 4.1: der Qualitaetsfaktor einer abgeschlossenen Aufgabe ist ebenfalls gesperrt",
    leitungQualitaetFehler?.code === "23514",
    leitungQualitaetFehler?.code ?? "kein Fehler",
  );

  // HOCH: eine Brigade-Anmeldung konnte Arbeitszeit fuer eine Person aus
  // einer fremden Brigade anlegen. Massgeblich ist die tatsaechliche
  // Brigadenzuordnung des Demo-Kontos aus dem Profil, nicht eine Vermutung.
  const { data: eigeneBrigade } = await admin
    .from("profiles")
    .select("brigade_id")
    .eq("email", "brigade@damicon.demo")
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
  const { data: kundeSteigen } = await (await anmelden("kunde@damicon.demo")).client
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

  // Anforderung 4.8: der Widerruf laeuft ueber die RPC, die widerrufen_am
  // serverseitig per now() setzt (siehe Migration 20260916000000) - ein
  // direktes Update mit clientseitigem new Date() koennte bei Uhrenversatz
  // zwischen Testmaschine und gehostetem Datenbankserver am Check-Constraint
  // einwilligung_widerruf_nach_erteilung scheitern, unabhaengig davon, ob
  // der Widerruf inhaltlich korrekt ist.
  const { error: widerrufFehler } = await leitung.rpc("einwilligung_widerrufen", {
    p_id: neueEinwilligung.id,
    p_grund: "Testwiderruf",
  });
  const { data: widerrufen } = await admin
    .from("einwilligungen")
    .select("widerrufen_am, widerruf_grund")
    .eq("id", neueEinwilligung.id)
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

  // --- Anforderung 4.8: benannte verantwortliche Person je Zweck/Vorfall ---
  const { data: verantwortlichesProfil } = await admin
    .from("profiles")
    .select("id")
    .limit(1)
    .single();

  const { data: vorfallMitVerantwortlichem, error: vorfallVerantwortlichFehler } = await leitung
    .from("datenschutzvorfaelle")
    .insert({
      festgestellt_am: new Date().toISOString(),
      art: "sonstiges",
      beschreibung: "Integrationstest-Vorfall mit Verantwortlichem",
      betroffene_anzahl: 1,
      verantwortlich_profil_id: verantwortlichesProfil.id,
    })
    .select("id, verantwortlich_profil_id")
    .single();
  check(
    "Anforderung 4.8: Vorfall speichert die benannte verantwortliche Person",
    !vorfallVerantwortlichFehler &&
      vorfallMitVerantwortlichem?.verantwortlich_profil_id === verantwortlichesProfil.id,
    vorfallVerantwortlichFehler?.message ?? "",
  );
  if (vorfallMitVerantwortlichem?.id) {
    await admin.from("datenschutzvorfaelle").delete().eq("id", vorfallMitVerantwortlichem.id);
  }

  const { data: zweckVorher } = await admin
    .from("verarbeitungszwecke")
    .select("id, verantwortlich_profil_id")
    .eq("code", "personaleinsatz")
    .single();
  const { data: zweckAktualisiert, error: zweckVerantwortlichFehler } = await leitung
    .from("verarbeitungszwecke")
    .update({ verantwortlich_profil_id: verantwortlichesProfil.id })
    .eq("id", zweckVorher.id)
    .select("verantwortlich_profil_id")
    .single();
  check(
    "Anforderung 4.8: verantwortliche Person laesst sich einem Verarbeitungszweck zuweisen",
    !zweckVerantwortlichFehler &&
      zweckAktualisiert?.verantwortlich_profil_id === verantwortlichesProfil.id,
    zweckVerantwortlichFehler?.message ?? "",
  );
  // Ursprungszustand wiederherstellen, damit der Testlauf wiederholbar bleibt.
  await admin
    .from("verarbeitungszwecke")
    .update({ verantwortlich_profil_id: zweckVorher.verantwortlich_profil_id })
    .eq("id", zweckVorher.id);

  const { data: brigadeVerantwortlichUpdate, error: brigadeVerantwortlichFehler } = await brigade
    .from("verarbeitungszwecke")
    .update({ verantwortlich_profil_id: verantwortlichesProfil.id })
    .eq("id", zweckVorher.id)
    .select("id");
  check(
    "Anforderung 4.8 RLS: Brigade darf die verantwortliche Person nicht setzen",
    !brigadeVerantwortlichFehler && (brigadeVerantwortlichUpdate?.length ?? 0) === 0,
    brigadeVerantwortlichFehler?.message ?? `geaenderte Zeilen: ${brigadeVerantwortlichUpdate?.length}`,
  );

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

  const { client: kunde, fehler: kundeFehler } = await anmelden("kunde@damicon.demo");
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
    .eq("email", "kunde@damicon.demo")
    .single();
  check(
    "Reklamation-Setup: kunde@damicon.demo ist Almaty Fresh Market zugeordnet",
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
      .eq("email", "kunde@damicon.demo");
    check(
      "Reklamation-Haertung: Kunde ordnet sich nicht selbst einer fremden Firma zu",
      selbstZuordnungFehler?.code === "42501",
      selbstZuordnungFehler?.code ?? "kein Fehler",
    );
    const { data: profilNachVersuch } = await admin
      .from("profiles")
      .select("b2b_kunde_id")
      .eq("email", "kunde@damicon.demo")
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

  // --- 13. Lohnabrechnung mit Qualitaetsfaktor (WMCNL-1444) ----------------
  // Die Kette liefert seit Meilenstein C echte Arbeitszeiten und Steigen fuer
  // den 01.-02.09. (siehe supabase/seed.sql): D. Sarsenbaj (MAL-0417) und
  // A. Tulegenowa (MAL-0418) teilen sich zwei Pflueckaufgaben zu je gleichen
  // Anteilen (eine davon mit spuerbarem Ausschuss), M. Qojschybaj (MAL-0421)
  // hat eine einzelne, makellose Aufgabe ohne Ausschuss. Die Tests rechnen
  // gegen diese realen Daten nach, statt nur den Vertrag (wer darf was)
  // isoliert zu pruefen - beides faellt hier zusammen.

  const { client: buchhaltung, fehler: buchhaltungFehler } = await anmelden("buchhaltung@damicon.demo");
  check("Auth: Buchhaltung meldet sich an", !!buchhaltung, buchhaltungFehler ?? "");

  const { data: lohnSatzAnon } = await anon.from("lohn_saetze").select("id");
  check(
    "Lohn-RLS: anon liest keinen Lohnsatz",
    (lohnSatzAnon?.length ?? 0) === 0,
    `sichtbare Zeilen: ${lohnSatzAnon?.length}`,
  );

  const { data: lohnSatzLeitung, error: lohnSatzLeitungFehler } = await leitung
    .from("lohn_saetze")
    .select("id");
  check(
    "Lohn-RLS: Betriebsleitung liest den Lohnsatz (view, aber kein Schreibrecht)",
    !lohnSatzLeitungFehler && (lohnSatzLeitung?.length ?? 0) > 0,
    lohnSatzLeitungFehler?.message ?? `${lohnSatzLeitung?.length} Saetze`,
  );

  const { error: lohnSatzLeitungSchreibenFehler } = await leitung.from("lohn_saetze").insert({
    gueltig_ab: "2031-01-01",
    stundenlohn_tenge: 100,
    kg_satz_tenge: 100,
  });
  check(
    "Lohn-RLS: Betriebsleitung legt keinen Lohnsatz an (rbac: nur view('lohn'))",
    lohnSatzLeitungSchreibenFehler?.code === "42501",
    lohnSatzLeitungSchreibenFehler?.code ?? "kein Fehler",
  );

  const { error: lohnBerechnenLeitungFehler } = await leitung.rpc("lohn_periode_berechnen", {
    p_periode_start: "2026-09-01",
    p_periode_ende: "2026-09-02",
  });
  check(
    "Lohn-RPC: Betriebsleitung berechnet keine Periode",
    lohnBerechnenLeitungFehler?.code === "42501",
    lohnBerechnenLeitungFehler?.code ?? "kein Fehler",
  );

  const { error: lohnBerechnenBrigadeFehler } = await brigade.rpc("lohn_periode_berechnen", {
    p_periode_start: "2026-09-01",
    p_periode_ende: "2026-09-02",
  });
  check(
    "Lohn-RPC: Brigade berechnet keine Periode",
    lohnBerechnenBrigadeFehler?.code === "42501",
    lohnBerechnenBrigadeFehler?.code ?? "kein Fehler",
  );

  const { error: lohnKeinSatzFehler } = await buchhaltung.rpc("lohn_periode_berechnen", {
    p_periode_start: "2025-01-01",
    p_periode_ende: "2025-01-02",
  });
  check(
    "Lohn-RPC: ohne hinterlegten Satz wird die Periode abgelehnt",
    lohnKeinSatzFehler?.code === "P0002",
    lohnKeinSatzFehler?.code ?? "kein Fehler",
  );

  const { data: lohnBerechnung, error: lohnBerechnenFehler } = await buchhaltung.rpc(
    "lohn_periode_berechnen",
    { p_periode_start: "2026-09-01", p_periode_ende: "2026-09-02" },
  );
  const lohnBerechnungErgebnis = Array.isArray(lohnBerechnung) ? lohnBerechnung[0] : lohnBerechnung;
  check(
    "Lohn-RPC: Buchhaltung berechnet die Periode 01.-02.09. fuer alle drei erfassten Pfluecker",
    !lohnBerechnenFehler &&
      lohnBerechnungErgebnis?.verarbeitet === 3 &&
      lohnBerechnungErgebnis?.uebersprungen === 0,
    lohnBerechnenFehler?.message ?? JSON.stringify(lohnBerechnungErgebnis),
  );

  const { data: lohnPflueckerMap } = await admin
    .from("pfluecker")
    .select("id, ausweis")
    .in("ausweis", ["MAL-0417", "MAL-0421"]);
  const lohnSarsenbajId = lohnPflueckerMap?.find((p) => p.ausweis === "MAL-0417")?.id;
  const lohnQojschybajId = lohnPflueckerMap?.find((p) => p.ausweis === "MAL-0421")?.id;

  const { data: lohnSarsenbaj } = await admin
    .from("lohn_abrechnungen")
    .select(
      "id, stunden, menge_kg, ausschussquote, grundlohn_tenge, mengen_komponente_tenge, qualitaetsfaktor, gesamt_tenge, status",
    )
    .eq("periode_start", "2026-09-01")
    .eq("periode_ende", "2026-09-02")
    .eq("pfluecker_id", lohnSarsenbajId)
    .single();
  check(
    "Lohn-Berechnung: Grundlohn aus Arbeitszeit (7,2 h x 900 Tenge)",
    Number(lohnSarsenbaj?.grundlohn_tenge) === 6480,
    `grundlohn_tenge: ${lohnSarsenbaj?.grundlohn_tenge}`,
  );
  check(
    "Lohn-Berechnung: Mengenkomponente inklusive Qualitaetsfaktor je Aufgabe",
    Number(lohnSarsenbaj?.mengen_komponente_tenge) === 37659.25,
    `mengen_komponente_tenge: ${lohnSarsenbaj?.mengen_komponente_tenge}`,
  );
  check(
    "Lohn-Berechnung: Gesamt-Qualitaetsfaktor unter 1.00 bei ueberdurchschnittlichem Ausschuss",
    Number(lohnSarsenbaj?.qualitaetsfaktor) === 0.91,
    `qualitaetsfaktor: ${lohnSarsenbaj?.qualitaetsfaktor}, ausschussquote: ${lohnSarsenbaj?.ausschussquote}`,
  );
  check(
    "Lohn-Berechnung: Gesamtbetrag = Grundlohn + Mengenkomponente",
    Number(lohnSarsenbaj?.gesamt_tenge) ===
      Number(lohnSarsenbaj?.grundlohn_tenge) + Number(lohnSarsenbaj?.mengen_komponente_tenge),
    `gesamt_tenge: ${lohnSarsenbaj?.gesamt_tenge}`,
  );

  const { data: lohnPositionenSarsenbaj } = await admin
    .from("lohn_positionen")
    .select("menge_kg, qualitaetsfaktor, ausschuss_anteilig_kg, betrag_tenge")
    .eq("lohn_abrechnung_id", lohnSarsenbaj.id)
    .order("menge_kg", { ascending: false });
  check(
    "Lohn-Positionen: zwei Positionen, Ausschuss ueber den kg-Anteil umgelegt (symmetrischer Seed: 50/50 je Aufgabe)",
    lohnPositionenSarsenbaj?.length === 2 &&
      Number(lohnPositionenSarsenbaj[0].ausschuss_anteilig_kg) === 2.1 &&
      Number(lohnPositionenSarsenbaj[1].ausschuss_anteilig_kg) === 2.95,
    JSON.stringify(lohnPositionenSarsenbaj),
  );

  const { data: lohnQojschybaj } = await admin
    .from("lohn_abrechnungen")
    .select("qualitaetsfaktor, ausschussquote")
    .eq("periode_start", "2026-09-01")
    .eq("periode_ende", "2026-09-02")
    .eq("pfluecker_id", lohnQojschybajId)
    .single();
  check(
    "Lohn-Berechnung: 0% Ausschuss hebt den Qualitaetsfaktor auf das Maximum des Korridors",
    Number(lohnQojschybaj?.qualitaetsfaktor) === 1.1 && Number(lohnQojschybaj?.ausschussquote) === 0,
    `qualitaetsfaktor: ${lohnQojschybaj?.qualitaetsfaktor}, ausschussquote: ${lohnQojschybaj?.ausschussquote}`,
  );

  // Freigabe: die Buchhaltung darf, die Brigade nicht (rbac: lohn:approve nur
  // admin/buchhaltung; RLS lohn_abrechnungen_update_buchhaltung).
  const { error: lohnFreigabeBrigadeFehler, data: lohnFreigabeBrigadeUpdate } = await brigade
    .from("lohn_abrechnungen")
    .update({ status: "freigegeben" })
    .eq("id", lohnSarsenbaj.id)
    .select("id");
  check(
    "Lohn-RLS: Brigade gibt keine Abrechnung frei",
    !lohnFreigabeBrigadeFehler && (lohnFreigabeBrigadeUpdate?.length ?? 0) === 0,
    lohnFreigabeBrigadeFehler?.message ?? `geaenderte Zeilen: ${lohnFreigabeBrigadeUpdate?.length}`,
  );

  const { error: lohnFreigabeFehler } = await buchhaltung
    .from("lohn_abrechnungen")
    .update({ status: "freigegeben" })
    .eq("id", lohnSarsenbaj.id);
  check(
    "Lohn: Buchhaltung gibt die Abrechnung frei",
    !lohnFreigabeFehler,
    lohnFreigabeFehler?.message ?? "",
  );

  // Ein zweiter Rechenlauf ueber dieselbe Periode ueberschreibt die bereits
  // freigegebene Zeile nicht - sie wird uebersprungen und separat gezaehlt.
  const { data: lohnZweiterLauf, error: lohnZweiterLaufFehler } = await buchhaltung.rpc(
    "lohn_periode_berechnen",
    { p_periode_start: "2026-09-01", p_periode_ende: "2026-09-02" },
  );
  const lohnZweiterLaufErgebnis = Array.isArray(lohnZweiterLauf) ? lohnZweiterLauf[0] : lohnZweiterLauf;
  check(
    "Lohn-RPC: ein zweiter Lauf ueberspringt die bereits freigegebene Abrechnung",
    !lohnZweiterLaufFehler &&
      lohnZweiterLaufErgebnis?.verarbeitet === 2 &&
      lohnZweiterLaufErgebnis?.uebersprungen === 1,
    lohnZweiterLaufFehler?.message ?? JSON.stringify(lohnZweiterLaufErgebnis),
  );

  const { data: lohnSarsenbajNachLauf } = await admin
    .from("lohn_abrechnungen")
    .select("status, gesamt_tenge")
    .eq("id", lohnSarsenbaj.id)
    .single();
  check(
    "Lohn: freigegebene Abrechnung bleibt nach dem erneuten Lauf unveraendert",
    lohnSarsenbajNachLauf?.status === "freigegeben" &&
      Number(lohnSarsenbajNachLauf?.gesamt_tenge) === Number(lohnSarsenbaj.gesamt_tenge),
    JSON.stringify(lohnSarsenbajNachLauf),
  );

  // Freigabe-Schutz: Betraege einer freigegebenen Abrechnung sind per
  // direktem Update nicht mehr aenderbar (trg_lohn_abrechnung_freigabe).
  const { error: lohnBetragAendernFehler } = await buchhaltung
    .from("lohn_abrechnungen")
    .update({ gesamt_tenge: 1 })
    .eq("id", lohnSarsenbaj.id);
  check(
    "Lohn-Trigger: Betraege einer freigegebenen Abrechnung sind gesperrt",
    lohnBetragAendernFehler?.code === "23514",
    lohnBetragAendernFehler?.code ?? "kein Fehler",
  );

  // Auszahlen, danach pruefen, dass 'ausgezahlt' nicht mehr zurueckgenommen wird.
  const { error: lohnAuszahlenFehler } = await buchhaltung
    .from("lohn_abrechnungen")
    .update({ status: "ausgezahlt" })
    .eq("id", lohnSarsenbaj.id);
  check(
    "Lohn: Buchhaltung markiert die Abrechnung als ausgezahlt",
    !lohnAuszahlenFehler,
    lohnAuszahlenFehler?.message ?? "",
  );

  const { error: lohnRuecknahmeFehler } = await admin
    .from("lohn_abrechnungen")
    .update({ status: "entwurf" })
    .eq("id", lohnSarsenbaj.id);
  check(
    "Lohn-Trigger: eine ausgezahlte Abrechnung laesst sich nicht zurueckstufen",
    lohnRuecknahmeFehler?.code === "23514",
    lohnRuecknahmeFehler?.code ?? "kein Fehler",
  );

  // Cleanup: die in diesem Testlauf berechneten Lohndaten wieder entfernen,
  // damit ein erneuter Testlauf von denselben Ausgangsdaten startet. lohn_
  // positionen haengt per on-delete-cascade an lohn_abrechnungen, ein
  // Aufraeumen der Positionen zuerst ist trotzdem explizit, nicht implizit.
  const { data: lohnTestAbrechnungen } = await admin
    .from("lohn_abrechnungen")
    .select("id")
    .eq("periode_start", "2026-09-01")
    .eq("periode_ende", "2026-09-02");
  const lohnTestAbrechnungIds = (lohnTestAbrechnungen ?? []).map((a) => a.id);
  if (lohnTestAbrechnungIds.length > 0) {
    await admin.from("lohn_positionen").delete().in("lohn_abrechnung_id", lohnTestAbrechnungIds);
    await admin.from("lohn_abrechnungen").delete().in("id", lohnTestAbrechnungIds);
  }

  // --- 14. Aggregator: Zukauf Nachbarbetriebe & Import-Parser (WMCNL-1453) --
  // Der Parser selbst (reine Funktion, keine Datenbank) hat einen eigenen
  // Test ohne jede Supabase-Verbindung: supabase/tests/zukauf-parser.mjs
  // (npm run test:zukauf-parser). Hier wird ausschliesslich geprueft, was
  // dieser Parsertest nicht pruefen kann: die vorher komplett fehlenden
  // RLS-Schreibrechte, die geoeffnete preis_tenge_kg-Spalte und vor allem die
  // Atomaritaet der Import-RPC public.zukauf_positionen_importieren().

  const { data: nbAnon } = await anon.from("nachbarbetriebe").select("id");
  check(
    "Zukauf-RLS: anon liest keine Nachbarbetriebe",
    (nbAnon?.length ?? 0) === 0,
    `sichtbare Zeilen: ${nbAnon?.length}`,
  );

  const { data: nbLeitung, error: nbLeitungFehler } = await leitung
    .from("nachbarbetriebe")
    .select("id, name");
  check(
    "Zukauf-RLS: Betriebsleitung sieht die Seed-Nachbarbetriebe (Kaskelen, Uzynagash)",
    !nbLeitungFehler && (nbLeitung?.length ?? 0) >= 2,
    nbLeitungFehler?.message ?? `${nbLeitung?.length} Nachbarbetriebe`,
  );

  const { error: nbBrigadeFehler, data: nbBrigadeInsert } = await brigade
    .from("nachbarbetriebe")
    .insert({ name: "IT-Fremdbetrieb (sollte nicht entstehen)" })
    .select("id");
  check(
    "Zukauf-RLS: Brigade legt keinen Nachbarbetrieb an",
    !!nbBrigadeFehler || (nbBrigadeInsert?.length ?? 0) === 0,
    nbBrigadeFehler?.code ?? `eingefuegte Zeilen: ${nbBrigadeInsert?.length}`,
  );

  const { data: nbNeu, error: nbNeuFehler } = await leitung
    .from("nachbarbetriebe")
    .insert({ name: "IT-Nachbarbetrieb WMCNL-1453", ort: "Testort" })
    .select("id, name")
    .single();
  check(
    "Zukauf: Betriebsleitung legt einen Nachbarbetrieb an",
    !nbNeuFehler && !!nbNeu,
    nbNeuFehler?.message ?? "",
  );

  const { data: sortePolka } = await admin.from("sorten").select("id").eq("name", "Polka").single();
  const { data: sortePolana } = await admin.from("sorten").select("id").eq("name", "Polana").single();

  // preis_tenge_kg war bislang "not null" - ein Import ohne Preis (Menge,
  // Sorte, Datum, Nachbarbetrieb - keine der vier Pflichtspalten ist der
  // Preis) haette daran scheitern muessen. Diese Zeile beweist die Oeffnung.
  const { data: zpOhnePreis, error: zpOhnePreisFehler } = await leitung
    .from("zukauf_positionen")
    .insert({ nachbarbetrieb_id: nbNeu.id, sorte_id: sortePolka.id, menge_kg: 42 })
    .select("id, preis_tenge_kg")
    .single();
  check(
    "Zukauf-Schema: preis_tenge_kg ist nullable - Import ohne Preis gelingt",
    !zpOhnePreisFehler && zpOhnePreis?.preis_tenge_kg === null,
    zpOhnePreisFehler?.message ?? `preis_tenge_kg: ${zpOhnePreis?.preis_tenge_kg}`,
  );

  const { error: zpBrigadeFehler, data: zpBrigadeInsert } = await brigade
    .from("zukauf_positionen")
    .insert({ nachbarbetrieb_id: nbNeu.id, sorte_id: sortePolka.id, menge_kg: 10 })
    .select("id");
  check(
    "Zukauf-RLS: Brigade legt keine Zukaufposition an",
    !!zpBrigadeFehler || (zpBrigadeInsert?.length ?? 0) === 0,
    zpBrigadeFehler?.code ?? `eingefuegte Zeilen: ${zpBrigadeInsert?.length}`,
  );

  // HOCH (Vorab-Recherche, Risiko 3): rbac.ts gewaehrt "erzeuger" bereits
  // crud("aggregator"), aber ohne profiles->nachbarbetrieb-Verknuepfung ist
  // kein echtes Self-Service-Szenario erreichbar (siehe Migrationskopf, Punkt
  // 3). Dieser Test dokumentiert die Luecke, statt sie stillschweigend zu
  // uebergehen: die RLS-Policy laesst nur admin/betriebsleitung zu und faengt
  // eine erzeuger-Anmeldung kontrolliert ab, statt fremde Stammdaten zu
  // schreiben.
  const { client: erzeuger, fehler: erzeugerFehler } = await anmelden("erzeuger@damicon.demo");
  check("Auth: Erzeuger meldet sich an", !!erzeuger, erzeugerFehler ?? "");
  if (erzeuger) {
    const { error: zpErzeugerFehler, data: zpErzeugerInsert } = await erzeuger
      .from("zukauf_positionen")
      .insert({ nachbarbetrieb_id: nbNeu.id, sorte_id: sortePolka.id, menge_kg: 10 })
      .select("id");
    check(
      "Zukauf-RLS-Luecke dokumentiert: erzeuger hat laut rbac.ts crud(aggregator), scheitert aber an RLS (kein Self-Service ohne Nachbarbetrieb-Verknuepfung)",
      !!zpErzeugerFehler || (zpErzeugerInsert?.length ?? 0) === 0,
      zpErzeugerFehler?.code ?? `eingefuegte Zeilen: ${zpErzeugerInsert?.length}`,
    );
  }

  const { error: zpMengeNullFehler } = await leitung
    .from("zukauf_positionen")
    .insert({ nachbarbetrieb_id: nbNeu.id, sorte_id: sortePolka.id, menge_kg: 0 });
  check(
    "Zukauf-Schema: Menge 0 wird abgelehnt (check zukauf_positionen_menge_positiv)",
    zpMengeNullFehler?.code === "23514",
    zpMengeNullFehler?.code ?? "kein Fehler",
  );

  const { error: zpPreisNegativFehler } = await leitung
    .from("zukauf_positionen")
    .insert({ nachbarbetrieb_id: nbNeu.id, sorte_id: sortePolka.id, menge_kg: 5, preis_tenge_kg: -1 });
  check(
    "Zukauf-Schema: negativer Preis wird abgelehnt (check zukauf_positionen_preis_positiv)",
    zpPreisNegativFehler?.code === "23514",
    zpPreisNegativFehler?.code ?? "kein Fehler",
  );

  // Preis nachtragen (zukaufPreisNachtragen()): die Betriebsleitung darf,
  // die Brigade nicht - dieselbe Update-Policy wie fuer den Import.
  const { error: zpPreisBrigadeFehler, data: zpPreisBrigadeUpdate } = await brigade
    .from("zukauf_positionen")
    .update({ preis_tenge_kg: 999 })
    .eq("id", zpOhnePreis.id)
    .select("id");
  check(
    "Zukauf-RLS: Brigade traegt keinen Preis nach",
    !!zpPreisBrigadeFehler || (zpPreisBrigadeUpdate?.length ?? 0) === 0,
    zpPreisBrigadeFehler?.code ?? `geaenderte Zeilen: ${zpPreisBrigadeUpdate?.length}`,
  );

  const { error: zpPreisFehler, data: zpPreisUpdate } = await leitung
    .from("zukauf_positionen")
    .update({ preis_tenge_kg: 1500, rechnungsdatum: "2026-09-06" })
    .eq("id", zpOhnePreis.id)
    .select("preis_tenge_kg")
    .single();
  check(
    "Zukauf: Betriebsleitung traegt den Preis nach",
    !zpPreisFehler && Number(zpPreisUpdate?.preis_tenge_kg) === 1500,
    zpPreisFehler?.message ?? "",
  );

  // RPC public.zukauf_positionen_importieren(): SECURITY INVOKER - die
  // RLS-Policies des Aufrufers gelten unveraendert innerhalb der Funktion.
  // Die Brigade darf chargen anlegen (chargen_insert_feld), aber nicht
  // zukauf_positionen (zukauf_positionen_insert_leitung) - die zweite,
  // fehlschlagende INSERT-Anweisung muss die GESAMTE Funktion inklusive der
  // bereits eingefuegten Charge zurueckrollen. Kein Transaktionsrahmen ueber
  // mehrere Aufrufe hinweg noetig: eine einzelne RPC-Ausfuehrung IST bereits
  // eine Transaktion.
  const { count: chargenVorherCount } = await admin
    .from("chargen")
    .select("id", { count: "exact", head: true });

  const { error: importBrigadeFehler } = await brigade.rpc("zukauf_positionen_importieren", {
    p_zeilen: [
      { nachbarbetrieb_id: nbNeu.id, sorte_id: sortePolka.id, menge_kg: 77, ernte_datum: "2026-09-05" },
    ],
  });
  check(
    "Zukauf-RPC: Brigade importiert nicht - RLS auf zukauf_positionen greift auch innerhalb der SECURITY-INVOKER-Funktion",
    importBrigadeFehler?.code === "42501",
    importBrigadeFehler?.code ?? "kein Fehler",
  );

  const { count: chargenNachBrigadeCount } = await admin
    .from("chargen")
    .select("id", { count: "exact", head: true });
  check(
    "Zukauf-RPC: keine Teiluebernahme - der abgelehnte Versuch hinterlaesst keine verwaiste Charge",
    chargenNachBrigadeCount === chargenVorherCount,
    `vorher: ${chargenVorherCount}, nachher: ${chargenNachBrigadeCount}`,
  );

  // Unvollstaendige Zeile (ernte_datum fehlt) wird abgewiesen, bevor
  // irgendetwas geschrieben wird - auch mit vollem Schreibrecht.
  const { error: importUnvollstaendigFehler } = await leitung.rpc("zukauf_positionen_importieren", {
    p_zeilen: [{ nachbarbetrieb_id: nbNeu.id, sorte_id: sortePolka.id, menge_kg: 5 }],
  });
  check(
    "Zukauf-RPC: unvollstaendige Zeile (ernte_datum fehlt) wird abgewiesen",
    importUnvollstaendigFehler?.code === "23502",
    importUnvollstaendigFehler?.code ?? "kein Fehler",
  );

  // Erfolgreicher Import mit zwei Zeilen durch die Betriebsleitung.
  const { data: importAnzahl, error: importFehler } = await leitung.rpc(
    "zukauf_positionen_importieren",
    {
      p_zeilen: [
        { nachbarbetrieb_id: nbNeu.id, sorte_id: sortePolka.id, menge_kg: 88, ernte_datum: "2026-09-05" },
        { nachbarbetrieb_id: nbNeu.id, sorte_id: sortePolana.id, menge_kg: 33, ernte_datum: "2026-09-06" },
      ],
    },
  );
  check(
    "Zukauf-RPC: Betriebsleitung importiert zwei Zeilen atomar",
    !importFehler && importAnzahl === 2,
    importFehler?.message ?? `Rueckgabe: ${importAnzahl}`,
  );

  const { data: importiertePositionen } = await admin
    .from("zukauf_positionen")
    .select("id, menge_kg, preis_tenge_kg, charge_id, chargen ( code, status, reihenblock_id, ernte_datum )")
    .eq("nachbarbetrieb_id", nbNeu.id)
    .in("menge_kg", [88, 33]);
  check(
    "Zukauf-RPC: legt je Zeile eine Zukaufposition ohne Preis an, verknuepft mit einer neuen Charge",
    importiertePositionen?.length === 2 &&
      importiertePositionen.every((p) => p.preis_tenge_kg === null && !!p.charge_id),
    JSON.stringify(importiertePositionen),
  );
  const importierteChargen = (importiertePositionen ?? [])
    .map((p) => (Array.isArray(p.chargen) ? p.chargen[0] : p.chargen))
    .filter(Boolean);
  check(
    "Zukauf-RPC: jede neue Charge ist offen, ohne Reihenblock (eigene Charge je Fremdbetrieb) und mit code-Praefix ZUK-",
    importierteChargen.length === 2 &&
      importierteChargen.every(
        (c) => c.status === "offen" && c.reihenblock_id === null && c.code.startsWith("ZUK-"),
      ),
    JSON.stringify(importierteChargen),
  );
  check(
    "Zukauf-RPC: ernte_datum der Charge entspricht dem CSV-Datum der jeweiligen Zeile",
    importierteChargen.some((c) => c.ernte_datum === "2026-09-05") &&
      importierteChargen.some((c) => c.ernte_datum === "2026-09-06"),
    JSON.stringify(importierteChargen.map((c) => c.ernte_datum)),
  );

  // Cleanup: alles, was dieser Testlauf unter dem Testbetrieb angelegt hat.
  const { data: zukaufTestPositionen } = await admin
    .from("zukauf_positionen")
    .select("id, charge_id")
    .eq("nachbarbetrieb_id", nbNeu.id);
  const zukaufTestChargeIds = (zukaufTestPositionen ?? []).map((p) => p.charge_id).filter(Boolean);
  await admin.from("zukauf_positionen").delete().eq("nachbarbetrieb_id", nbNeu.id);
  if (zukaufTestChargeIds.length > 0) {
    await admin.from("chargen").delete().in("id", zukaufTestChargeIds);
  }
  await admin.from("nachbarbetriebe").delete().eq("id", nbNeu.id);

  // --- 14. Oeffentliche Herkunftsauskunft (WMCNL-1456) ---------------------
  // Kernfrage der Aufgabenstellung: anon darf GENAU die eine Charge lesen, zu
  // der der Code passt - keine andere, und schon gar nicht per fortlaufender
  // ID oder benachbartem Code erraten.

  const { data: herkunftBlock } = await admin
    .from("reihenbloecke")
    .select("id, code")
    .neq("status", "wartezeitgesperrt")
    .limit(1)
    .single();

  // oeffentlicher_code bewusst nicht mitgegeben - der Spalten-Default muss
  // ihn ohne Zutun der Anwendung vergeben ("ganz ohne Backfill-Funktion").
  const { data: herkunftCharge, error: herkunftChargeFehler } = await admin
    .from("chargen")
    .insert({
      code: `CH-IT-HK-${Date.now()}`,
      reihenblock_id: herkunftBlock.id,
      ernte_datum: new Date().toISOString().slice(0, 10),
      pflueck_zeitpunkt: new Date(Date.now() - 30 * 60_000).toISOString(),
      vorkuehlung_zeitpunkt: new Date(Date.now() - 10 * 60_000).toISOString(),
    })
    .select("id, oeffentlicher_code")
    .single();
  check(
    "Herkunft: eine neu angelegte Charge bekommt automatisch einen oeffentlichen Code",
    !herkunftChargeFehler &&
      typeof herkunftCharge?.oeffentlicher_code === "string" &&
      /^hk_[0-9a-f]{16}$/.test(herkunftCharge.oeffentlicher_code),
    herkunftChargeFehler?.message ?? `code: ${herkunftCharge?.oeffentlicher_code}`,
  );

  const { data: herkunftZeilen, error: herkunftFehler } = await anon.rpc(
    "herkunftsauskunft",
    { p_code: herkunftCharge.oeffentlicher_code },
  );
  const herkunftZeile = herkunftZeilen?.[0];
  check(
    "Herkunft: anon liest ueber den korrekten Code genau eine Zeile",
    !herkunftFehler && herkunftZeilen?.length === 1,
    herkunftFehler?.message ?? `${herkunftZeilen?.length} Zeilen`,
  );
  check(
    "Herkunft: die Zeile nennt den richtigen Reihenblock",
    herkunftZeile?.reihenblock_code === herkunftBlock.code,
    `erwartet ${herkunftBlock.code}, erhalten ${herkunftZeile?.reihenblock_code}`,
  );
  check(
    "Herkunft: 20 Minuten bis zur Vorkuehlung werden richtig errechnet und als eingehalten gewertet",
    herkunftZeile?.minuten_bis_vorkuehlung === 20 &&
      herkunftZeile?.kuehlkette_eingehalten === true,
    `minuten: ${herkunftZeile?.minuten_bis_vorkuehlung}, eingehalten: ${herkunftZeile?.kuehlkette_eingehalten}`,
  );
  check(
    "Herkunft: die Wartezeit-Bewertung ist ein Boolean (rueckstandsnachweis wird intern wiederverwendet)",
    typeof herkunftZeile?.wartezeit_eingehalten === "boolean",
    `typeof: ${typeof herkunftZeile?.wartezeit_eingehalten}`,
  );

  const verboteneSpalten = [
    "id", "charge_id", "pflueckaufgabe_id", "reihenblock_id", "sorte_id",
    "menge_kg", "ausschuss_kg", "pfluecker_id", "pfluecker", "name", "preis",
    "preis_tenge_kg", "code",
  ];
  const gefundeneVerboteneSpalten = herkunftZeile
    ? verboteneSpalten.filter((spalte) => spalte in herkunftZeile)
    : verboteneSpalten;
  check(
    "Herkunft: die Auskunft enthaelt keine verbotene Spalte (ID, Pfluecker, Menge, Preis)",
    herkunftZeile !== undefined && gefundeneVerboteneSpalten.length === 0,
    `gefunden: ${gefundeneVerboteneSpalten.join(", ") || "keine"}`,
  );

  // Die eigentliche Sicherheitsfrage: nicht nur "gibt es einen Treffer",
  // sondern "kann ich mir einen Treffer erschleichen". Drei Varianten:
  // ein benachbarter (nur ein Zeichen anderer) Code, ein formal falscher
  // Code, und die reale Chargen-ID direkt statt des oeffentlichen Codes.
  const randChar = herkunftCharge.oeffentlicher_code.slice(-1);
  const ersatzChar = "0123456789abcdef".split("").find((z) => z !== randChar);
  const benachbarterCode = herkunftCharge.oeffentlicher_code.slice(0, -1) + ersatzChar;
  const { data: benachbarteZeilen, error: benachbarterFehler } = await anon.rpc(
    "herkunftsauskunft",
    { p_code: benachbarterCode },
  );
  check(
    "Herkunft: ein benachbarter, geratener Code liefert keine Zeile",
    !benachbarterFehler && (benachbarteZeilen?.length ?? 0) === 0,
    benachbarterFehler?.message ?? `${benachbarteZeilen?.length} Zeilen`,
  );

  const { data: formatZeilen, error: formatFehler } = await anon.rpc("herkunftsauskunft", {
    p_code: "hk_zz",
  });
  check(
    "Herkunft: ein formal falscher Code liefert eine leere Menge statt eines Fehlers",
    !formatFehler && (formatZeilen?.length ?? 0) === 0,
    formatFehler?.message ?? `${formatZeilen?.length} Zeilen`,
  );

  const { data: perIdZeilen, error: perIdFehler } = await anon.rpc("herkunftsauskunft", {
    p_code: herkunftCharge.id,
  });
  check(
    "Herkunft: die interne Chargen-ID funktioniert nicht als Code (kein Durchzaehlen ueber die ID)",
    !perIdFehler && (perIdZeilen?.length ?? 0) === 0,
    perIdFehler?.message ?? `${perIdZeilen?.length} Zeilen`,
  );

  // Regressionsschutz: die Haertungsmigration verriegelt chargen/reihenbloecke
  // fuer anon - das darf diese Migration nicht wieder aufweichen. Der Zugriff
  // bleibt ausschliesslich ueber die RPC-Funktion moeglich, niemals ueber
  // ein direktes SELECT.
  const { data: anonChargenDirekt } = await anon.from("chargen").select("id");
  check(
    "Herkunft-Regression: anon liest chargen weiterhin nicht direkt",
    (anonChargenDirekt?.length ?? 0) === 0,
    `sichtbare Zeilen: ${anonChargenDirekt?.length}`,
  );
  const { data: anonReihenbloeckeDirekt } = await anon.from("reihenbloecke").select("id");
  check(
    "Herkunft-Regression: anon liest reihenbloecke weiterhin nicht direkt",
    (anonReihenbloeckeDirekt?.length ?? 0) === 0,
    `sichtbare Zeilen: ${anonReihenbloeckeDirekt?.length}`,
  );

  await admin.from("chargen").delete().eq("id", herkunftCharge.id);
}

// --- QR-Steigen: Lesezugriff fuer Etiketten und Pfluecker-Ausweise (WMCNL-1439) ---
// Reine Anzeige-/Druckansicht ohne eigenen Schreibpfad (siehe Kommentar an
// src/lib/modules.ts) - geprueft wird deshalb nur Lesezugriff: genau die
// Abfragen aus src/lib/data/qr-steigen.ts muessen fuer brigade/betriebsleitung
// funktionieren und einen gueltigen oeffentlichen Code liefern, waehrend
// kunde/erzeuger weiterhin ausgeschlossen bleiben (Personenbezug ueber
// pfluecker/steigen, siehe 20260905200000_kette_haerten.sql und
// 20260905160000_haerten.sql).
{
  // Etiketten: Steige verknuepft mit dem oeffentlichen Code der Charge - exakt
  // die Abfrage aus ladeSteigenEtiketten().
  const { data: brigadeEtiketten, error: brigadeEtikettenFehler } = await brigade
    .from("steigen")
    .select("id, code, chargen ( oeffentlicher_code )")
    .order("created_at", { ascending: false })
    .limit(5);
  check(
    "QR-Steigen: brigade liest Steigen mit verknuepftem oeffentlichem Code (Etiketten)",
    !brigadeEtikettenFehler && (brigadeEtiketten?.length ?? 0) > 0,
    brigadeEtikettenFehler?.message ?? `${brigadeEtiketten?.length} Zeile(n)`,
  );
  const codeAus = (zeile) =>
    Array.isArray(zeile?.chargen) ? zeile.chargen[0]?.oeffentlicher_code : zeile?.chargen?.oeffentlicher_code;
  const alleCodesGueltig = (brigadeEtiketten ?? []).every((s) =>
    /^hk_[0-9a-f]{16}$/.test(codeAus(s) ?? ""),
  );
  check(
    "QR-Steigen: jeder gelesene oeffentliche Code hat das Format hk_ + 16 Hexstellen",
    alleCodesGueltig,
  );

  // Ausweise: Pfluecker-Stammdaten - exakt die Abfrage aus ladePfleuckerAusweise().
  const { data: leitungAusweise, error: leitungAusweiseFehler } = await leitung
    .from("pfluecker")
    .select("id, name, ausweis")
    .order("name")
    .limit(5);
  check(
    "QR-Steigen: betriebsleitung liest Pfluecker-Stammdaten (Ausweise)",
    !leitungAusweiseFehler && (leitungAusweise?.length ?? 0) > 0,
    leitungAusweiseFehler?.message ?? `${leitungAusweise?.length} Zeile(n)`,
  );

  // Abnahme: kunde und erzeuger duerfen weder Steigen noch Pfluecker lesen.
  const { client: kunde } = await anmelden("kunde@damicon.demo");
  const { client: erzeuger } = await anmelden("erzeuger@damicon.demo");

  const { data: kundeEtiketten } = await kunde
    .from("steigen")
    .select("id, chargen ( oeffentlicher_code )");
  check(
    "QR-Steigen: die Rolle kunde liest keine Steigen (Etiketten-Abfrage)",
    (kundeEtiketten?.length ?? 0) === 0,
    `sichtbare Zeilen: ${kundeEtiketten?.length}`,
  );

  const { data: erzeugerEtiketten } = await erzeuger
    .from("steigen")
    .select("id, chargen ( oeffentlicher_code )");
  check(
    "QR-Steigen: die Rolle erzeuger liest keine Steigen (Etiketten-Abfrage)",
    (erzeugerEtiketten?.length ?? 0) === 0,
    `sichtbare Zeilen: ${erzeugerEtiketten?.length}`,
  );

  const { data: kundeAusweise } = await kunde.from("pfluecker").select("id, name, ausweis");
  check(
    "QR-Steigen: die Rolle kunde liest keine Pfluecker-Stammdaten (Ausweis-Abfrage)",
    (kundeAusweise?.length ?? 0) === 0,
    `sichtbare Zeilen: ${kundeAusweise?.length}`,
  );

  const { data: erzeugerAusweise } = await erzeuger.from("pfluecker").select("id, name, ausweis");
  check(
    "QR-Steigen: die Rolle erzeuger liest keine Pfluecker-Stammdaten (Ausweis-Abfrage)",
    (erzeugerAusweise?.length ?? 0) === 0,
    `sichtbare Zeilen: ${erzeugerAusweise?.length}`,
  );

  // --- Anforderung 4.3: Deckungsbeitrag je Kilogramm --------------------------
  // Eigenstaendiges, isoliertes Testszenario mit einem klar erkennbaren
  // Test-Erntetag (2030-01-01), damit keine Kollision mit der
  // Unique-Constraint (reihenblock_id, sorte_id, erntetag) auf bestehenden
  // Kostentraegern der Demo-/Seed-Daten entstehen kann.
  {
    // WICHTIG: finance_ledger_entries ist fuer niemanden loeschbar
    // (block_ledger_mutation(), bereits im urspruenglichen Schema so
    // angelegt) - dieser Test legt deshalb bewusst KEINE Ledger-Zeilen an,
    // nur Kostentraeger/Charge/Pflueckaufgabe (die sind normal loeschbar).
    // Ohne Ledger-Buchungen liefert coalesce(sum(...),0) korrekt 0, die
    // Rechnung 0 / menge_kg = 0 bleibt trotzdem aussagekraeftig: sie beweist,
    // dass der CASE-Zweig tatsaechlich rechnet (0 statt null), waehrend der
    // Zukauf-Fall unten zeigt, dass ohne Menge korrekt null zurueckkommt.
    const testErntetag = "2030-01-01";
    const { data: dbBlock, error: dbBlockFehler } = await admin
      .from("reihenbloecke")
      .select("id")
      .neq("status", "wartezeitgesperrt")
      .limit(1)
      .single();
    const { data: dbSorte, error: dbSorteFehler } = await admin
      .from("sorten")
      .select("id")
      .limit(1)
      .single();

    const { data: dbCharge, error: dbChargeFehler } = await admin
      .from("chargen")
      .insert({
        code: `__it_dbkg_${Date.now()}`,
        reihenblock_id: dbBlock?.id,
        sorte_id: dbSorte?.id,
        ernte_datum: testErntetag,
      })
      .select("id")
      .single();

    const { data: dbAufgabe, error: dbAufgabeFehler } = await admin
      .from("pflueckaufgaben")
      .insert({
        code: `__it_dbkg_${Date.now()}`,
        reihenblock_id: dbBlock?.id,
        sorte_id: dbSorte?.id,
        charge_id: dbCharge?.id,
        status: "abgeschlossen",
        zielmenge_kg: 100,
        ist_menge_kg: 40,
      })
      .select("id")
      .single();

    const { data: dbKostentraeger, error: dbKostentraegerFehler } = await admin
      .from("kostentraeger")
      .insert({
        reihenblock_id: dbBlock?.id,
        sorte_id: dbSorte?.id,
        erntetag: testErntetag,
        bezeichnung: `__it_dbkg_${Date.now()}`,
      })
      .select("id")
      .single();

    const aufbauFehler =
      dbBlockFehler || dbSorteFehler || dbChargeFehler || dbAufgabeFehler || dbKostentraegerFehler;
    check(
      "Anforderung 4.3: Testaufbau (Charge/Aufgabe/Kostentraeger) gelingt",
      !aufbauFehler,
      aufbauFehler?.message ?? "",
    );

    if (!aufbauFehler) {
      const { data: dbView } = await admin
        .from("deckungsbeitrag_je_kostentraeger")
        .select("menge_kg, deckungsbeitrag_tenge, deckungsbeitrag_je_kg_tenge")
        .eq("kostentraeger_id", dbKostentraeger.id)
        .single();

      check(
        "Anforderung 4.3: die View summiert die tatsaechlich geerntete Menge korrekt",
        Number(dbView?.menge_kg) === 40,
        `menge_kg: ${dbView?.menge_kg}`,
      );
      check(
        "Anforderung 4.3: Deckungsbeitrag je Kilogramm wird berechnet (0 Buchungen -> 0, nicht null)",
        Number(dbView?.deckungsbeitrag_tenge) === 0 &&
          Number(dbView?.deckungsbeitrag_je_kg_tenge) === 0,
        `deckungsbeitrag_tenge: ${dbView?.deckungsbeitrag_tenge}, je_kg: ${dbView?.deckungsbeitrag_je_kg_tenge}`,
      );
    }

    // Zukauf-analoger Fall: Kostentraeger ohne reihenblock_id bekommt keine
    // Menge und keinen Wert je Kilogramm, statt eines falschen 0-Divisors.
    const { data: zukaufKostentraeger, error: zukaufFehler } = await admin
      .from("kostentraeger")
      .insert({
        reihenblock_id: null,
        sorte_id: dbSorte?.id,
        erntetag: testErntetag,
        bezeichnung: `__it_dbkg_zukauf_${Date.now()}`,
      })
      .select("id")
      .single();
    if (!zukaufFehler) {
      const { data: zukaufView } = await admin
        .from("deckungsbeitrag_je_kostentraeger")
        .select("menge_kg, deckungsbeitrag_je_kg_tenge")
        .eq("kostentraeger_id", zukaufKostentraeger.id)
        .single();
      check(
        "Anforderung 4.3: ein Kostentraeger ohne eigenen Reihenblock liefert keinen Wert je Kilogramm",
        zukaufView?.menge_kg === null && zukaufView?.deckungsbeitrag_je_kg_tenge === null,
        `menge_kg: ${zukaufView?.menge_kg}, je_kg: ${zukaufView?.deckungsbeitrag_je_kg_tenge}`,
      );
    }

    // Aufraeumen: nur Kostentraeger/Pflueckaufgabe/Charge, niemals
    // finance_ledger_entries (siehe Hinweis oben).
    const aufzuraeumendeKt = [dbKostentraeger?.id, zukaufKostentraeger?.id].filter(Boolean);
    if (aufzuraeumendeKt.length) {
      await admin.from("kostentraeger").delete().in("id", aufzuraeumendeKt);
    }
    if (dbAufgabe?.id) await admin.from("pflueckaufgaben").delete().eq("id", dbAufgabe.id);
    if (dbCharge?.id) await admin.from("chargen").delete().eq("id", dbCharge.id);
  }

  // --- Anforderung 2.12: Mehrsprachige Kurzeinarbeitung als bebilderte Checkliste --
  {
    const { client: pfluecker, fehler: pflueckerFehler } = await anmelden("pfluecker@damicon.demo");
    check("Auth: Pfluecker meldet sich an", !!pfluecker, pflueckerFehler ?? "");

    const { data: katalog, error: katalogFehler } = await admin
      .from("einarbeitung_schritte")
      .select("id, reihenfolge")
      .order("reihenfolge");
    check(
      "Anforderung 2.12: Katalog enthaelt die sechs Migrations-Schritte",
      !katalogFehler && katalog?.length === 6,
      katalogFehler?.message ?? `Zeilen: ${katalog?.length}`,
    );

    const { data: pflueckerProfil } = await admin
      .from("profiles")
      .select("pfluecker_id")
      .eq("email", "pfluecker@damicon.demo")
      .single();

    if (pfluecker && katalog?.length && pflueckerProfil?.pfluecker_id) {
      const eigenePflueckerId = pflueckerProfil.pfluecker_id;
      const ersterSchritt = katalog[0];

      // Aufraeumen von einem etwaigen Vorlauf, damit der Testlauf wiederholbar
      // bleibt (kein UPDATE-Pfad in der App, nur delete+redo korrigiert ein
      // Haekchen, siehe Migrationskopf).
      await admin
        .from("einarbeitung_fortschritt")
        .delete()
        .eq("pfluecker_id", eigenePflueckerId)
        .eq("schritt_id", ersterSchritt.id);

      const { data: katalogPfluecker, error: katalogPflueckerFehler } = await pfluecker
        .from("einarbeitung_schritte")
        .select("id")
        .order("reihenfolge");
      check(
        "Anforderung 2.12: Picker liest den Einarbeitungskatalog (RLS einarbeitung_schritte_select)",
        !katalogPflueckerFehler && katalogPfluecker?.length === 6,
        katalogPflueckerFehler?.message ?? `Zeilen: ${katalogPfluecker?.length}`,
      );

      const { data: katalogBrigade, error: katalogBrigadeFehler } = await brigade
        .from("einarbeitung_schritte")
        .select("id")
        .order("reihenfolge");
      check(
        "Anforderung 2.12: Brigade liest den Einarbeitungskatalog mit (Nachtrag 20260921010000, rbac.ts view(schulungen))",
        !katalogBrigadeFehler && katalogBrigade?.length === 6,
        katalogBrigadeFehler?.message ?? `Zeilen: ${katalogBrigade?.length}`,
      );

      const { error: abhakenFehler } = await pfluecker
        .from("einarbeitung_fortschritt")
        .insert({ pfluecker_id: eigenePflueckerId, schritt_id: ersterSchritt.id });
      check(
        "Anforderung 2.12: Picker hakt den eigenen Schritt ab (RLS einarbeitung_fortschritt_insert_own)",
        !abhakenFehler,
        abhakenFehler?.message ?? "",
      );

      const { error: doppeltFehler } = await pfluecker
        .from("einarbeitung_fortschritt")
        .insert({ pfluecker_id: eigenePflueckerId, schritt_id: ersterSchritt.id });
      check(
        "Anforderung 2.12: zweites Abhaken desselben Schritts kollidiert mit der Unique-Constraint (kein Duplikat)",
        doppeltFehler?.code === "23505",
        doppeltFehler?.code ?? "kein Fehler",
      );

      // Fremde pfluecker_id: die RLS-WITH-CHECK laesst nur die eigene zu. Ein
      // zweiter, nicht angemeldeter Pfluecker-Stammsatz dient als Fremd-ID,
      // ohne dass dafuer ein eigenes Demo-Login noetig ist.
      const { data: fremderPfluecker } = await admin
        .from("pfluecker")
        .select("id")
        .neq("id", eigenePflueckerId)
        .limit(1)
        .single();
      if (fremderPfluecker && katalog[1]) {
        const { error: fremdFehler } = await pfluecker
          .from("einarbeitung_fortschritt")
          .insert({ pfluecker_id: fremderPfluecker.id, schritt_id: katalog[1].id });
        check(
          "Anforderung 2.12: Picker kann keinen Fortschritt fuer eine fremde pfluecker_id anlegen (RLS-WITH-CHECK)",
          !!fremdFehler,
          fremdFehler?.code ?? "kein Fehler - RLS-Luecke!",
        );
      }

      // Buero-Rolle sieht den Fortschritt jeder Saisonkraft, authentisiert
      // statt ueber den Service-Role-Bypass (RLS
      // einarbeitung_fortschritt_select_buero).
      const { data: leitungSieht, error: leitungSiehtFehler } = await leitung
        .from("einarbeitung_fortschritt")
        .select("id")
        .eq("pfluecker_id", eigenePflueckerId)
        .eq("schritt_id", ersterSchritt.id);
      check(
        "Anforderung 2.12: Betriebsleitung sieht den Fortschritt des Pfluecker (RLS einarbeitung_fortschritt_select_buero)",
        !leitungSiehtFehler && (leitungSieht?.length ?? 0) === 1,
        leitungSiehtFehler?.message ?? `Zeilen: ${leitungSieht?.length}`,
      );

      // Brigade hat kein schulungen:complete und liest laut RLS nur den
      // Katalog, keinen personenbezogenen Fortschritt.
      const { data: brigadeSieht } = await brigade
        .from("einarbeitung_fortschritt")
        .select("id")
        .eq("pfluecker_id", eigenePflueckerId);
      check(
        "Anforderung 2.12: Brigade sieht keinen Einarbeitungsfortschritt (keine select_buero/select_own-Policy greift)",
        (brigadeSieht?.length ?? 0) === 0,
        `Zeilen: ${brigadeSieht?.length}`,
      );

      // Aufraeumen: neue Tabelle ohne Immutability-Trigger, Loeschen ist
      // sicher (anders als finance_ledger_entries, siehe Anforderung 4.3).
      await admin
        .from("einarbeitung_fortschritt")
        .delete()
        .eq("pfluecker_id", eigenePflueckerId)
        .eq("schritt_id", ersterSchritt.id);
    }
  }

  // --- Anforderung 3.4 und 6.3: Rueckverfolgung einer Reklamation ------------
  // bis zur pfleuckenden Person, zur Kuehlmessung und, bei Zukaufware, zum
  // liefernden Nachbarbetrieb. Eigener Erntetag (2030-02-01) fuer
  // Kollisionsfreiheit mit dem 4.3-Testblock (2030-01-01), der ebenfalls einen
  // Kostentraeger-Erntetag verwendet.
  {
    // 1. RLS-Haertung: kuehlketten_messungen war fuer JEDE angemeldete Rolle
    //    lesbar (Migration 20260922000000 schliesst das, analog zu steigen).
    const { data: kkLeitung, error: kkLeitungFehler } = await leitung
      .from("kuehlketten_messungen")
      .select("id")
      .limit(1);
    check(
      "Anforderung 3.4: Betriebsleitung liest kuehlketten_messungen (RLS kuehlketten_messungen_select_feld)",
      !kkLeitungFehler,
      kkLeitungFehler?.message ?? `Zeilen: ${kkLeitung?.length}`,
    );

    const { client: kundeRv, fehler: kundeRvFehler } = await anmelden("kunde@damicon.demo");
    check("Auth: Kunde meldet sich an (Rueckverfolgung)", !!kundeRv, kundeRvFehler ?? "");

    if (kundeRv) {
      const { data: kkKunde } = await kundeRv.from("kuehlketten_messungen").select("id");
      check(
        "Anforderung 3.4: Kunde liest kuehlketten_messungen nicht mehr (vorher jede angemeldete Rolle)",
        (kkKunde?.length ?? 0) === 0,
        `sichtbare Zeilen: ${kkKunde?.length}`,
      );
    }

    const { client: erzeugerRv } = await anmelden("erzeuger@damicon.demo");
    if (erzeugerRv) {
      const { data: kkErzeuger } = await erzeugerRv.from("kuehlketten_messungen").select("id");
      check(
        "Anforderung 3.4: Erzeuger liest kuehlketten_messungen nicht mehr",
        (kkErzeuger?.length ?? 0) === 0,
        `sichtbare Zeilen: ${kkErzeuger?.length}`,
      );
    }

    // 2. Volle Kette bei eigener Ernte: Person + Kuehlzeit.
    const rvErntetag = "2030-02-01";
    const { data: rvBlock, error: rvBlockFehler } = await admin
      .from("reihenbloecke")
      .select("id")
      .neq("status", "wartezeitgesperrt")
      .limit(1)
      .single();
    const { data: rvSorte, error: rvSorteFehler } = await admin
      .from("sorten")
      .select("id")
      .limit(1)
      .single();
    const { data: rvPfluecker, error: rvPflueckerFehler } = await admin
      .from("pfluecker")
      .select("id, name, ausweis")
      .limit(1)
      .single();
    const { data: almatyFreshRv, error: almatyFreshRvFehler } = await admin
      .from("b2b_kunden")
      .select("id")
      .eq("name", "Almaty Fresh Market")
      .single();

    // Fester pflueck_zeitpunkt statt leer: kuehlkette_bewerten() ueberschreibt
    // minuten_seit_pfluecken sonst hart auf null und ergebnis auf "warnung"
    // (Migration 20260905200000, Abschnitt 6 - ein unbekannter Pflueckzeitpunkt
    // gilt seit der Haertung bewusst nicht mehr als "ok").
    const rvPflueckZeitpunkt = "2030-02-01T08:00:00.000Z";
    const rvGemessenAm = "2030-02-01T08:25:00.000Z";
    const { data: rvCharge, error: rvChargeFehler } = await admin
      .from("chargen")
      .insert({
        code: `__it_rv_${Date.now()}`,
        reihenblock_id: rvBlock?.id,
        sorte_id: rvSorte?.id,
        ernte_datum: rvErntetag,
        pflueck_zeitpunkt: rvPflueckZeitpunkt,
      })
      .select("id")
      .single();

    const { data: rvSteige, error: rvSteigeFehler } = await admin
      .from("steigen")
      .insert({
        // Eigener Code + eigenes Token: der Trigger steige_nummer_vergeben()
        // vergibt die atomare Nummer nur bei leerem Code, hier bewusst
        // umgangen, weil diese Steige keine echte Pflueckaufgabe hat.
        code: `__IT-RV-${Date.now()}`,
        qr_token: `__it_rv_token_${Date.now()}`,
        charge_id: rvCharge?.id,
        pfluecker_id: rvPfluecker?.id,
        gewicht_kg: 5,
      })
      .select("id")
      .single();

    const { data: rvMessung, error: rvMessungFehler } = await admin
      .from("kuehlketten_messungen")
      .insert({
        charge_id: rvCharge?.id,
        temperatur_c: 3,
        gemessen_am: rvGemessenAm,
        // minuten_seit_pfluecken wird von kuehlkette_bewerten() aus
        // gemessen_am - chargen.pflueck_zeitpunkt errechnet (hier: genau 25),
        // ein mitgegebener Wert wuerde ohnehin ueberschrieben.
      })
      .select("id")
      .single();

    const { data: rvReklamation, error: rvReklamationFehler } = await admin
      .from("reklamationen")
      .insert({
        code: `REK-IT-RV-${Date.now()}`,
        b2b_kunde_id: almatyFreshRv?.id,
        charge_id: rvCharge?.id,
        grund: "qualitaet",
        betreff: "Integrationstest Rueckverfolgung",
      })
      .select("id")
      .single();

    const rvAufbauFehler =
      rvBlockFehler ||
      rvSorteFehler ||
      rvPflueckerFehler ||
      almatyFreshRvFehler ||
      rvChargeFehler ||
      rvSteigeFehler ||
      rvMessungFehler ||
      rvReklamationFehler;
    check(
      "Anforderung 3.4: Testaufbau (Charge/Steige/Messung/Reklamation) gelingt",
      !rvAufbauFehler,
      rvAufbauFehler?.message ?? "",
    );

    if (!rvAufbauFehler) {
      const rvSelect = `id, chargen (
           steigen ( pfluecker_id, pfluecker ( name, ausweis ) ),
           kuehlketten_messungen ( id, minuten_seit_pfluecken, ergebnis )
         )`;

      const { data: rvDetail, error: rvDetailFehler } = await leitung
        .from("reklamationen")
        .select(rvSelect)
        .eq("id", rvReklamation.id)
        .single();

      const rvChargeEmbed = Array.isArray(rvDetail?.chargen) ? rvDetail.chargen[0] : rvDetail?.chargen;
      const rvSteigenEmbed = rvChargeEmbed?.steigen ?? [];
      const rvPflueckerRoh = rvSteigenEmbed[0]?.pfluecker;
      const rvPflueckerEmbed = Array.isArray(rvPflueckerRoh) ? rvPflueckerRoh[0] : rvPflueckerRoh;

      check(
        "Anforderung 3.4: Betriebsleitung liest ueber die Reklamation bis zur pfleuckenden Person durch",
        !rvDetailFehler && rvPflueckerEmbed?.name === rvPfluecker.name,
        rvDetailFehler?.message ?? `gefunden: ${JSON.stringify(rvPflueckerEmbed)}`,
      );
      check(
        "Anforderung 3.4: Betriebsleitung liest ueber die Reklamation bis zur Kuehlmessung durch",
        (rvChargeEmbed?.kuehlketten_messungen?.length ?? 0) === 1 &&
          Number(rvChargeEmbed.kuehlketten_messungen[0].minuten_seit_pfluecken) === 25,
        JSON.stringify(rvChargeEmbed?.kuehlketten_messungen),
      );

      // Kunde: dieselbe Reklamation (eigene Firma, also per RLS sichtbar),
      // aber steigen/kuehlketten_messungen bleiben ueber die eingebettete
      // Relation leer statt eines Fehlers - RLS wirkt durch den Join hindurch.
      if (kundeRv) {
        const { data: rvKundeDetail, error: rvKundeDetailFehler } = await kundeRv
          .from("reklamationen")
          .select(rvSelect)
          .eq("id", rvReklamation.id)
          .maybeSingle();
        const rvKundeChargeEmbed = Array.isArray(rvKundeDetail?.chargen)
          ? rvKundeDetail.chargen[0]
          : rvKundeDetail?.chargen;
        check(
          "Anforderung 3.4: Kunde sieht ueber dieselbe Reklamation weder Pfluecker noch Kuehlmessung (RLS durch den Join)",
          !rvKundeDetailFehler &&
            !!rvKundeDetail &&
            (rvKundeChargeEmbed?.steigen?.length ?? 0) === 0 &&
            (rvKundeChargeEmbed?.kuehlketten_messungen?.length ?? 0) === 0,
          rvKundeDetailFehler?.message ?? JSON.stringify(rvKundeChargeEmbed),
        );
      }
    }

    // 3. Zukauf-Kette: liefernder Nachbarbetrieb (Anforderung 6.3).
    const { data: rvNachbarbetrieb, error: rvNachbarbetriebFehler } = await admin
      .from("nachbarbetriebe")
      .select("id, name")
      .limit(1)
      .single();

    const { data: rvZukaufCharge, error: rvZukaufChargeFehler } = await admin
      .from("chargen")
      .insert({
        code: `__it_rv_zuk_${Date.now()}`,
        reihenblock_id: null,
        sorte_id: rvSorte?.id,
        ernte_datum: rvErntetag,
      })
      .select("id")
      .single();

    const { data: rvZukaufPosition, error: rvZukaufPositionFehler } = await admin
      .from("zukauf_positionen")
      .insert({
        nachbarbetrieb_id: rvNachbarbetrieb?.id,
        sorte_id: rvSorte?.id,
        charge_id: rvZukaufCharge?.id,
        menge_kg: 10,
      })
      .select("id")
      .single();

    const { data: rvZukaufReklamation, error: rvZukaufReklamationFehler } = await admin
      .from("reklamationen")
      .insert({
        code: `REK-IT-RV-ZUK-${Date.now()}`,
        b2b_kunde_id: almatyFreshRv?.id,
        charge_id: rvZukaufCharge?.id,
        grund: "qualitaet",
        betreff: "Integrationstest Rueckverfolgung Zukauf",
      })
      .select("id")
      .single();

    const rvZukaufAufbauFehler =
      rvNachbarbetriebFehler ||
      rvZukaufChargeFehler ||
      rvZukaufPositionFehler ||
      rvZukaufReklamationFehler;
    check(
      "Anforderung 6.3: Testaufbau Zukauf-Kette (Charge/Zukaufposition/Reklamation) gelingt",
      !rvZukaufAufbauFehler,
      rvZukaufAufbauFehler?.message ?? "",
    );

    if (!rvZukaufAufbauFehler) {
      const { data: rvZukaufDetail, error: rvZukaufDetailFehler } = await leitung
        .from("reklamationen")
        .select(`id, chargen ( zukauf_positionen ( nachbarbetriebe ( name ) ) )`)
        .eq("id", rvZukaufReklamation.id)
        .single();
      const rvZukaufChargeEmbed = Array.isArray(rvZukaufDetail?.chargen)
        ? rvZukaufDetail.chargen[0]
        : rvZukaufDetail?.chargen;
      const rvZukaufPositionRoh = rvZukaufChargeEmbed?.zukauf_positionen;
      const rvZukaufPositionEmbed = Array.isArray(rvZukaufPositionRoh)
        ? rvZukaufPositionRoh[0]
        : rvZukaufPositionRoh;
      const rvNachbarbetriebRoh = rvZukaufPositionEmbed?.nachbarbetriebe;
      const rvNachbarbetriebEmbed = Array.isArray(rvNachbarbetriebRoh)
        ? rvNachbarbetriebRoh[0]
        : rvNachbarbetriebRoh;
      check(
        "Anforderung 6.3: Betriebsleitung liest ueber die Reklamation bis zum liefernden Nachbarbetrieb durch",
        !rvZukaufDetailFehler && rvNachbarbetriebEmbed?.name === rvNachbarbetrieb.name,
        rvZukaufDetailFehler?.message ?? JSON.stringify(rvNachbarbetriebEmbed),
      );
    }

    // 4. Regressionsschutz: eigene Ernte ohne Zukaufbezug liefert keine
    //    zukauf_positionen-Zeile statt einer Fehlinterpretation.
    if (!rvAufbauFehler) {
      const { data: rvEigeneKetteDetail } = await admin
        .from("reklamationen")
        .select(`id, chargen ( zukauf_positionen ( id ) )`)
        .eq("id", rvReklamation.id)
        .single();
      const rvEigeneChargeEmbed = Array.isArray(rvEigeneKetteDetail?.chargen)
        ? rvEigeneKetteDetail.chargen[0]
        : rvEigeneKetteDetail?.chargen;
      check(
        "Anforderung 6.3: eigene Ernte ohne Zukaufbezug liefert keine zukauf_positionen-Zeile",
        (rvEigeneChargeEmbed?.zukauf_positionen?.length ?? 0) === 0,
        JSON.stringify(rvEigeneChargeEmbed?.zukauf_positionen),
      );
    }

    // Aufraeumen (Kind vor Eltern wegen FKs).
    if (rvReklamation?.id) await admin.from("reklamationen").delete().eq("id", rvReklamation.id);
    if (rvZukaufReklamation?.id)
      await admin.from("reklamationen").delete().eq("id", rvZukaufReklamation.id);
    if (rvZukaufPosition?.id)
      await admin.from("zukauf_positionen").delete().eq("id", rvZukaufPosition.id);
    if (rvMessung?.id) await admin.from("kuehlketten_messungen").delete().eq("id", rvMessung.id);
    if (rvSteige?.id) await admin.from("steigen").delete().eq("id", rvSteige.id);
    if (rvCharge?.id) await admin.from("chargen").delete().eq("id", rvCharge.id);
    if (rvZukaufCharge?.id) await admin.from("chargen").delete().eq("id", rvZukaufCharge.id);
  }

  // --- Anforderung 3.3: Deckungsbeitrag je Charge -----------------------------
  // finance_ledger_entries ist unloeschbar (siehe Anforderung 4.3-Zwischenfall
  // oben) - dieser Test legt deshalb KEINE eigenen Buchungen an, sondern liest
  // ausschliesslich das permanente Beispiel aus Migration
  // 20260923010000_deckungsbeitrag_je_charge_beispiel.sql.
  {
    const { data: dbcView, error: dbcViewFehler } = await admin
      .from("deckungsbeitrag_je_charge")
      .select("charge_id, erloes_tenge, kosten_tenge, deckungsbeitrag_tenge, buchungen, menge_kg")
      .eq("charge_code", "CH-BEISPIEL-JE-CHARGE")
      .single();
    check(
      "Anforderung 3.3: Deckungsbeitrag je Charge wird korrekt berechnet (Erloes minus Kosten, direkt an charge_id)",
      !dbcViewFehler &&
        Number(dbcView?.erloes_tenge) === 20000 &&
        Number(dbcView?.kosten_tenge) === 8000 &&
        Number(dbcView?.deckungsbeitrag_tenge) === 12000 &&
        Number(dbcView?.buchungen) === 2,
      dbcViewFehler?.message ?? JSON.stringify(dbcView),
    );
    check(
      "Anforderung 3.3: ohne verknuepfte Pflueckaufgabe bleibt menge_kg korrekt leer statt eines falschen Werts",
      dbcView?.menge_kg === null,
      `menge_kg: ${dbcView?.menge_kg}`,
    );

    if (dbcView?.charge_id) {
      const { data: dbcLeitung } = await leitung
        .from("deckungsbeitrag_je_charge")
        .select("charge_id")
        .eq("charge_id", dbcView.charge_id);
      check(
        "Anforderung 3.3: Betriebsleitung liest die View (RLS der Basistabellen gilt per security_invoker durch)",
        (dbcLeitung?.length ?? 0) === 1,
        `Zeilen: ${dbcLeitung?.length}`,
      );

      const { data: dbcBrigade } = await brigade
        .from("deckungsbeitrag_je_charge")
        .select("charge_id")
        .eq("charge_id", dbcView.charge_id);
      check(
        "Anforderung 3.3: Brigade liest die View nicht (finance_ledger_entries bleibt Buero-only)",
        (dbcBrigade?.length ?? 0) === 0,
        `Zeilen: ${dbcBrigade?.length}`,
      );
    }

    // Regressionsschutz: eine beliebige Charge ohne direkt zugeordnete Buchung
    // taucht in der View nicht auf (INNER JOIN, kein Rauschen aus der Menge an
    // Chargen ohne eigene Buchung).
    const { data: irgendeineCharge } = await admin
      .from("chargen")
      .select("id")
      .neq("code", "CH-BEISPIEL-JE-CHARGE")
      .limit(1)
      .single();
    if (irgendeineCharge?.id) {
      const { data: irgendeineChargeView } = await admin
        .from("deckungsbeitrag_je_charge")
        .select("charge_id")
        .eq("charge_id", irgendeineCharge.id);
      check(
        "Anforderung 3.3: eine Charge ohne direkt zugeordnete Buchung erscheint nicht in der View",
        (irgendeineChargeView?.length ?? 0) === 0,
        `Zeilen: ${irgendeineChargeView?.length}`,
      );
    }
  }

  // --- Anforderung 4.10: Jaehrliche Pflichtschulung mit Nachweis und Fristueberwachung ---
  {
    const { data: pflichtvideo, error: pflichtvideoFehler } = await admin
      .from("schulungsvideos")
      .select("id, pflicht, frist_monate")
      .eq("titel", "Arbeitssicherheit auf der Plantage")
      .single();
    check(
      "Anforderung 4.10: Beispiel-Pflichtschulung ist angelegt (pflicht=true, frist_monate=12)",
      !pflichtvideoFehler && pflichtvideo?.pflicht === true && pflichtvideo?.frist_monate === 12,
      pflichtvideoFehler?.message ?? JSON.stringify(pflichtvideo),
    );

    const { data: leitungProfilRow } = await admin
      .from("profiles")
      .select("id")
      .eq("email", "leitung@damicon.demo")
      .single();
    const { data: brigadeProfilRow } = await admin
      .from("profiles")
      .select("id")
      .eq("email", "brigade@damicon.demo")
      .single();

    if (pflichtvideo?.id && leitungProfilRow?.id && brigadeProfilRow?.id) {
      // Aufraeumen von einem etwaigen Vorlauf, damit der Testlauf wiederholbar
      // bleibt - schulungsteilnahmen ist normal loeschbar (kein Immutability-
      // Trigger, anders als finance_ledger_entries).
      await admin
        .from("schulungsteilnahmen")
        .delete()
        .eq("schulungsvideo_id", pflichtvideo.id)
        .in("profil_id", [leitungProfilRow.id, brigadeProfilRow.id]);

      const { data: vorherView } = await admin
        .from("schulungsteilnahmen_status")
        .select("status")
        .eq("schulungsvideo_id", pflichtvideo.id)
        .eq("profil_id", leitungProfilRow.id)
        .single();
      check(
        "Anforderung 4.10: ohne Teilnahme zeigt die Fristueberwachung 'nie'",
        vorherView?.status === "nie",
        `status: ${vorherView?.status}`,
      );

      // Selbstauskunft: Brigade meldet die eigene Teilnahme.
      const { error: brigadeEigeneFehler } = await brigade
        .from("schulungsteilnahmen")
        .insert({ schulungsvideo_id: pflichtvideo.id, profil_id: brigadeProfilRow.id });
      check(
        "Anforderung 4.10: Brigade meldet die eigene Teilnahme (RLS schulungsteilnahmen_insert_own)",
        !brigadeEigeneFehler,
        brigadeEigeneFehler?.message ?? "",
      );

      // Brigade darf nicht fuer die Betriebsleitung erfassen (fremde profil_id,
      // kein Buero-Recht).
      const { error: brigadeFremdFehler } = await brigade
        .from("schulungsteilnahmen")
        .insert({ schulungsvideo_id: pflichtvideo.id, profil_id: leitungProfilRow.id });
      check(
        "Anforderung 4.10: Brigade kann keine Teilnahme fuer eine fremde profil_id erfassen (RLS-WITH-CHECK)",
        !!brigadeFremdFehler,
        brigadeFremdFehler?.code ?? "kein Fehler - RLS-Luecke!",
      );

      // Betriebsleitung (Buero) meldet die eigene Teilnahme.
      const { error: leitungEigeneFehler } = await leitung
        .from("schulungsteilnahmen")
        .insert({ schulungsvideo_id: pflichtvideo.id, profil_id: leitungProfilRow.id });
      check(
        "Anforderung 4.10: Betriebsleitung meldet die eigene Teilnahme",
        !leitungEigeneFehler,
        leitungEigeneFehler?.message ?? "",
      );

      const { data: nachherView, error: nachherViewFehler } = await admin
        .from("schulungsteilnahmen_status")
        .select("status, faellig_am, letzte_teilnahme_am")
        .eq("schulungsvideo_id", pflichtvideo.id)
        .eq("profil_id", leitungProfilRow.id)
        .single();
      check(
        "Anforderung 4.10: nach der Teilnahme zeigt die Fristueberwachung 'aktuell' mit errechnetem Faelligkeitsdatum",
        !nachherViewFehler &&
          nachherView?.status === "aktuell" &&
          !!nachherView?.faellig_am &&
          !!nachherView?.letzte_teilnahme_am,
        nachherViewFehler?.message ?? JSON.stringify(nachherView),
      );

      // RLS-Sichtbarkeit: Brigade sieht in der Fristueberwachung nur die
      // eigene Zeile, nicht die der Betriebsleitung.
      const { data: brigadeSichtLeitung } = await brigade
        .from("schulungsteilnahmen_status")
        .select("profil_id")
        .eq("schulungsvideo_id", pflichtvideo.id)
        .eq("profil_id", leitungProfilRow.id);
      check(
        "Anforderung 4.10: Brigade sieht die Fristueberwachungszeile der Betriebsleitung nicht (RLS profiles_select_self)",
        (brigadeSichtLeitung?.length ?? 0) === 0,
        `Zeilen: ${brigadeSichtLeitung?.length}`,
      );

      const { data: leitungSichtAlle } = await leitung
        .from("schulungsteilnahmen_status")
        .select("profil_id")
        .eq("schulungsvideo_id", pflichtvideo.id)
        .in("profil_id", [leitungProfilRow.id, brigadeProfilRow.id]);
      check(
        "Anforderung 4.10: Betriebsleitung sieht die Fristueberwachungszeilen beider Personen (Buero-Sicht)",
        (leitungSichtAlle?.length ?? 0) === 2,
        `Zeilen: ${leitungSichtAlle?.length}`,
      );

      await admin
        .from("schulungsteilnahmen")
        .delete()
        .eq("schulungsvideo_id", pflichtvideo.id)
        .in("profil_id", [leitungProfilRow.id, brigadeProfilRow.id]);
    }
  }
}

console.log("");
if (failures > 0) {
  console.error(`${failures} Test(s) fehlgeschlagen.`);
  process.exit(1);
}
console.log("Alle Integrationstests gruen.");
