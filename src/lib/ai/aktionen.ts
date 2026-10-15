// Aktionen des KI-Agenten: er kann im Auftrag des Nutzers etwas TUN, nicht nur
// nachschauen. Jede Aktion ruft dieselbe Server Action bzw. Kernfunktion auf,
// die auch das Formular in der Oberflaeche nutzt - damit gelten unveraendert
// dieselbe Validierung, dieselbe requirePermission()-Pruefung, dieselben
// RLS-Regeln und derselbe Audit-Eintrag. Der Agent bekommt keinen eigenen,
// schwaecheren Schreibweg.
//
// Freigabe: JEDE Aktion verlangt eine ausdrueckliche Bestaetigung des Nutzers
// (needsApproval). Das Modell kann also nichts still ausloesen - auch nicht,
// wenn ein Text aus der Datenbank (z. B. eine Reklamationsbeschreibung) versucht,
// ihm eine Anweisung unterzuschieben: die Bestaetigung kommt nur aus der
// Oberflaeche, nie aus dem Modell.
//
// Eine neue Aktion freizuschalten heisst: EINEN Eintrag hier ergaenzen (Schema,
// Recht, Aufruf). Die Lesewege - Navigation (modules.ts) und Datenabfrage
// (datenmodell.ts) - passen sich dagegen ohne jede Aenderung an neue Module und
// Tabellen an. Der Abdeckungstest (supabase/tests/agent-abdeckung.mjs) prueft,
// dass jeder Eintrag hier auf eine existierende Server Action zeigt.

import type { SupabaseClient } from "@supabase/supabase-js";
import { tool } from "ai";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { hasPermission, type Role } from "@/lib/rbac";
import { AKTIONS_RECHTE, type AktionsName } from "@/lib/ai/aktionen-meta";
import { leer, type AktionsStatus } from "@/lib/actions/status";
import { mwstSchwellePruefen } from "@/lib/actions/mwst";
import { aufgabeAnlegen, aufgabeStatusKern } from "@/lib/actions/pflueckaufgaben";
import { DATUM_UHRZEIT } from "@/lib/domain/pflueckaufgaben";
import { kuehlmessungKern } from "@/lib/actions/nachweiskette";
import { reklamationAnlegen } from "@/lib/actions/reklamationen";
import { lohnPeriodeBerechnen } from "@/lib/actions/lohn";
import { kiEskalationAnfordern } from "@/lib/actions/ki-assistent";
import { wissenDokumentUmordnen } from "@/lib/actions/wissen";
import { wissenBestandEntfernen } from "@/lib/actions/wissen-bestandspflege";
import { findeDokument, ladeDokumente } from "@/lib/ai/wissen-verwaltung-werkzeug";
import { MAX_GRUND } from "@/lib/wissen/bestandspflege-entfernen";
import { CLUSTER, QUELLENARTEN, TEXTGRUNDLAGEN } from "@/lib/wissen/quellenart";
import { UPLOAD_BEREICHE } from "@/lib/wissen/upload-konstanten";
import { reklamationGruende } from "@/lib/domain/reklamationen";
import { zielFuerModul, ZIEL_MWST, ZIEL_WISSENSBASIS } from "@/lib/ai/ziele";

const datum = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format JJJJ-MM-TT");
// Datum mit Uhrzeit in Betriebszeit Almaty, wie das Formularfeld datetime-local.
// Dieselbe Regel wie aufgabeAnlegen() (faelligkeitLesen), das auch den
// Abstand zu heute prueft.
const datumUhrzeit = z.string().regex(DATUM_UHRZEIT, "Format JJJJ-MM-TTTHH:MM");

function formular(felder: Record<string, string | number | null | undefined>): FormData {
  const daten = new FormData();
  for (const [name, wert] of Object.entries(felder)) {
    if (wert !== null && wert !== undefined && wert !== "") daten.set(name, String(wert));
  }
  return daten;
}

async function ergebnis(
  status: AktionsStatus,
  ziel: string | null,
  erledigt: boolean = status.stand === "ok",
) {
  const t = await getTranslations({ locale: "de", namespace: "aktionen" });
  return {
    aktion: true as const,
    ok: erledigt,
    meldungSchluessel: status.meldung ?? null,
    wert: status.wert ?? null,
    text: status.meldung ? t(status.meldung, { wert: status.wert ?? "" }) : "",
    ziel,
  };
}

function nichtGefunden(was: string, code: string) {
  return {
    aktion: true as const,
    ok: false,
    meldungSchluessel: null,
    wert: null,
    text: `${was} '${code}' wurde nicht gefunden.`,
    ziel: null,
  };
}

async function idZuCode(tabelle: string, code: string): Promise<string | null> {
  const client = (await createClient()) as unknown as SupabaseClient;
  const { data } = await client.from(tabelle).select("id").eq("code", code).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

function bauePool(rolle: Role | null | undefined) {
const mwstPruefen = tool({
  description:
    "Löst die MwSt-Schwellenprüfung aus: berechnet den rollierenden 12-Monats-Umsatz neu und hält beim ersten Überschreiten der Schwelle das Datum fest. Nutze es nur, wenn der Nutzer die Prüfung ausdrücklich anstoessen will.",
  inputSchema: z.object({}),
  needsApproval: true,
  execute: async () => ergebnis(await mwstSchwellePruefen(leer, formular({})), ZIEL_MWST),
});

const aufgabeAnlegenWerkzeug = tool({
  description:
    "Legt eine Pflückaufgabe für einen Reihenblock an (Status 'offen'). Der Reihenblock wird über seinen Code angegeben (z. B. 'A-03'); schlage den Code per datenLesen nach, wenn der Nutzer ihn nicht nennt. Die Fälligkeit ist Pflicht, mit Datum und Uhrzeit in Betriebszeit Almaty: nennt der Nutzer sie nicht vollständig, frage nach, statt eine Uhrzeit zu erfinden. Blocks in der Wartezeit werden abgelehnt.",
  inputSchema: z.object({
    reihenblockCode: z.string().min(1).max(40),
    zielmengeKg: z.number().positive().max(100000),
    pflueckerAnzahl: z.number().int().min(0).max(500).optional(),
    // Pflicht seit WMCNL-2488, wie im Formular und in der Server-Aktion.
    faelligkeit: datumUhrzeit.describe("Fälligkeit in Betriebszeit Almaty, JJJJ-MM-TTTHH:MM"),
  }),
  needsApproval: true,
  execute: async ({ reihenblockCode, zielmengeKg, pflueckerAnzahl, faelligkeit }) => {
    const blockId = await idZuCode("reihenbloecke", reihenblockCode);
    if (!blockId) return nichtGefunden("Reihenblock", reihenblockCode);
    const status = await aufgabeAnlegen(
      leer,
      formular({
        reihenblock_id: blockId,
        zielmenge_kg: zielmengeKg,
        pfluecker_anzahl: pflueckerAnzahl,
        faelligkeit,
      }),
    );
    // Die neue Aufgabe gleich in der Detailansicht oeffnen, wie nach dem
    // Anlegen im Formular.
    const modul = zielFuerModul("pflueckaufgaben", rolle);
    return ergebnis(status, modul && status.id ? `${modul}?aufgabe=${status.id}` : modul);
  },
});

const aufgabeStatus = tool({
  description:
    "Setzt den Status einer Pflückaufgabe: 'angenommen' (offen -> angenommen) oder 'in_arbeit' (angenommen -> in_arbeit, Arbeitsbeginn jetzt). Die Aufgabe wird über ihren Code angegeben (z. B. 'PA-20260919-XXXXXXXX').",
  inputSchema: z.object({
    aufgabeCode: z.string().min(1).max(60),
    neuerStatus: z.enum(["angenommen", "in_arbeit"]),
  }),
  needsApproval: true,
  execute: async ({ aufgabeCode, neuerStatus }) => {
    const aufgabeId = await idZuCode("pflueckaufgaben", aufgabeCode);
    if (!aufgabeId) return nichtGefunden("Pflueckaufgabe", aufgabeCode);
    const kern = await aufgabeStatusKern({
      aufgabeId,
      neuerStatus,
      arbeitsbeginnGeraetZeitpunkt: neuerStatus === "in_arbeit" ? new Date().toISOString() : null,
    });
    return ergebnis(kern.status, zielFuerModul("pflueckaufgaben", rolle), kern.erledigt);
  },
});

const kuehlmessung = tool({
  description:
    "Erfasst eine Kühlmessung (Temperatur in Grad Celsius) zu einer Pflückaufgabe, mit der aktuellen Uhrzeit. Ein Kühlketten-Verstoß wird trotzdem gespeichert und im Ergebnis als Warnung gemeldet. Nennt der Nutzer eine Charge oder einen Reihenblock statt eines Aufgabencodes, suche ZUERST mit datenLesen die passende Pflückaufgabe (Tabelle pflückaufgaben) und nimm deren Code; frage nur nach, wenn mehrere Aufgaben passen.",
  inputSchema: z.object({
    aufgabeCode: z.string().min(1).max(60),
    temperaturC: z.number().min(-30).max(40),
  }),
  needsApproval: true,
  execute: async ({ aufgabeCode, temperaturC }) => {
    const aufgabeId = await idZuCode("pflueckaufgaben", aufgabeCode);
    if (!aufgabeId) return nichtGefunden("Pflueckaufgabe", aufgabeCode);
    const kern = await kuehlmessungKern({ aufgabeId, temperaturC, geraetZeitpunkt: new Date().toISOString() });
    return ergebnis(kern.status, zielFuerModul("kuehlkette", rolle), kern.erledigt);
  },
});

const reklamation = tool({
  description:
    "Meldet eine Reklamation. Kunden melden immer für die eigene Firma; das Büro gibt zusätzlich 'kundenName' an (Teil des Firmennamens genügt). Optional mit Chargencode und betroffener Menge.",
  inputSchema: z.object({
    grund: z.enum(reklamationGruende),
    betreff: z.string().min(3).max(160),
    beschreibung: z.string().max(1000).optional(),
    betroffeneMengeKg: z.number().min(0).max(100000).optional(),
    chargeCode: z.string().max(60).optional(),
    kundenName: z.string().max(80).optional(),
  }),
  needsApproval: true,
  execute: async ({ grund, betreff, beschreibung, betroffeneMengeKg, chargeCode, kundenName }) => {
    const client = (await createClient()) as unknown as SupabaseClient;
    let chargeId: string | null = null;
    if (chargeCode) {
      chargeId = await idZuCode("chargen", chargeCode);
      if (!chargeId) return nichtGefunden("Charge", chargeCode);
    }
    let kundeId: string | null = null;
    if (kundenName) {
      const { data } = await client
        .from("b2b_kunden")
        .select("id")
        .ilike("name", `%${kundenName.replace(/[%_]/g, "")}%`)
        .limit(2);
      const treffer = (data ?? []) as { id: string }[];
      if (treffer.length !== 1) {
        return { ...nichtGefunden("Kunde", kundenName), text: treffer.length > 1 ? `Der Kundenname '${kundenName}' ist nicht eindeutig.` : `Kunde '${kundenName}' wurde nicht gefunden.` };
      }
      kundeId = treffer[0]!.id;
    }
    const status = await reklamationAnlegen(
      leer,
      formular({
        grund,
        betreff,
        beschreibung,
        betroffene_menge_kg: betroffeneMengeKg,
        charge_id: chargeId,
        b2b_kunde_id: kundeId,
      }),
    );
    return ergebnis(status, zielFuerModul("reklamationen", rolle));
  },
});

const lohnBerechnen = tool({
  description:
    "Berechnet die Lohnabrechnungen (Grundlohn, Menge, Qualitätsfaktor) für einen Zeitraum. Bereits freigegebene oder ausgezahlte Abrechnungen bleiben unverändert. Den Zeitraum leitest du selbst aus dem heutigen Datum ab ('diesen Monat' = erster bis letzter Tag des laufenden Monats, 'letzten Monat' analog): frage nicht danach und leite die Aufgabe nicht an einen Mitarbeiter weiter.",
  inputSchema: z.object({
    periodeStart: datum,
    periodeEnde: datum,
  }),
  needsApproval: true,
  execute: async ({ periodeStart, periodeEnde }) =>
    ergebnis(
      await lohnPeriodeBerechnen(leer, formular({ periode_start: periodeStart, periode_ende: periodeEnde })),
      zielFuerModul("lohn", rolle),
    ),
});

const einschalten = tool({
  description:
    "Gibt das Gespräch an einen Mitarbeiter weiter (Eskalation). Nur wenn der Nutzer AUSDRÜCKLICH einen Menschen sprechen will. Kein Ausweg, wenn dir Angaben fehlen (dann wähle einen sinnvollen Standard oder frage in einem Satz nach) und nie für etwas, das du mit einem anderen Werkzeug oder über die Oberfläche erledigen kannst. Büro-Rollen (Admin, Betriebsleitung, Buchhaltung) SIND das Büro und werden nie an das Büro weitergeleitet.",
  inputSchema: z.object({}),
  needsApproval: true,
  execute: async () => ergebnis(await kiEskalationAnfordern(leer, formular({})), null),
});

const wissenEinordnungAendern = tool({
  description:
    "Ändert die Einordnung EINES Dokuments der Wissensbasis: Bereich, weitere Bereiche (ein Dokument kann in mehreren Bereichen gelten, zum Beispiel ISO 31000 in audit und risiko), Quellenart, Cluster und/oder Textgrundlage (gib nur an, was sich ändern soll). Das Dokument gibst du mit seiner Kennung (schluessel aus wissensbasisAbrufen) an. Nur Administration. Die Stufe folgt der Quellenart. Bei einem freigegebenen Upload darf die Person, die hochgeladen hat, Bereich, weitere Bereiche, Quellenart und Textgrundlage nicht ändern (Vier-Augen-Prinzip); dann sagst du das und bittest eine zweite Person. Prüfe vorher mit wissenDokumentAnalysieren und begründe die Änderung.",
  inputSchema: z.object({
    dokument: z.string().min(2).max(300).describe("Kennung (schluessel) des Dokuments"),
    bereich: z.enum(UPLOAD_BEREICHE).optional().describe("Hauptbereich"),
    weitereBereiche: z
      .array(z.enum(UPLOAD_BEREICHE))
      .max(4)
      .optional()
      .describe("ALLE weiteren Bereiche, in denen das Dokument zusätzlich gilt (zum Beispiel risiko bei ISO 31000 im Bereich audit); ersetzt die bisherigen, leer = keine. Weglassen, wenn sie bleiben sollen."),
    quellenart: z.enum(QUELLENARTEN).optional(),
    cluster: z.enum(CLUSTER).optional(),
    textgrundlage: z.enum(TEXTGRUNDLAGEN).optional(),
  }),
  needsApproval: true,
  execute: async ({ dokument, bereich, weitereBereiche, quellenart, cluster, textgrundlage }) => {
    let liste;
    try {
      liste = await ladeDokumente();
    } catch {
      return { ...nichtGefunden("Dokument", dokument), text: "Die Dokumentliste ist gerade nicht lesbar." };
    }
    const { treffer, kandidaten } = findeDokument(liste, dokument);
    if (!treffer) {
      return { ...nichtGefunden("Dokument", dokument), text: kandidaten.length > 1 ? `Das Dokument '${dokument}' ist nicht eindeutig. Nimm die Kennung aus wissensbasisAbrufen.` : `Dokument '${dokument}' wurde nicht gefunden.` };
    }
    const daten = formular({ schluessel: treffer.schluessel, spalte: treffer.schluesselSpalte, bereich, quellenart, cluster, textgrundlage });
    if (weitereBereiche) {
      daten.set("weitereBereicheGesetzt", "1");
      for (const b of weitereBereiche) daten.append("weitereBereiche", b);
    }
    const status = await wissenDokumentUmordnen(leer, daten);
    return ergebnis(status, ZIEL_WISSENSBASIS);
  },
});

const wissenDokumenteEntfernen = tool({
  description:
    "Entfernt Dokumente endgültig aus der Wissensbasis (Bestandspflege), höchstens zehn je Aufruf. Nur Administration. Die Dokumente gibst du mit ihrer genauen Kennung an (schluessel aus wissensbasisAbrufen oder wissenBestandAnalysieren, kein Titelteil). " +
    "Das Entfernen ist nicht rückgängig zu machen und trifft auch Bestandsdokumente. Rufe es nur auf ausdrücklichen Wunsch des Nutzers auf, nachdem du ihm die Dokumente mit Titel und Grund genannt hast (bei Dubletten und abgedeckten Dokumenten nach dem Vergleich im Wortlaut mit wissenBestandAnalysieren) und er sie bestimmt hat. Der Grund wird im Protokoll festgehalten. Entfernt wird nichts, wenn eine Kennung unbekannt ist.",
  inputSchema: z.object({
    dokumente: z.array(z.string().min(2).max(300)).min(1).max(10).describe("Genaue Kennungen (schluessel) der Dokumente"),
    grund: z.string().min(3).max(MAX_GRUND).describe("Kurzer Grund fürs Protokoll, zum Beispiel 'durch Buch X abgedeckt'"),
  }),
  needsApproval: true,
  execute: async ({ dokumente, grund }) => {
    const antwort = (ok: boolean, text: string) => ({ aktion: true as const, ok, meldungSchluessel: null, wert: null, text, ziel: ZIEL_WISSENSBASIS });
    let liste;
    try {
      liste = await ladeDokumente();
    } catch {
      return antwort(false, "Die Dokumentliste ist gerade nicht lesbar. Es wurde nichts entfernt.");
    }
    const ids = [...new Set(dokumente.map((k) => k.trim()))];
    const titel = new Map<string, string>();
    const unbekannt: string[] = [];
    for (const k of ids) {
      const d = liste.find((x) => x.schluessel === k && x.schluesselSpalte === "quelle_id");
      if (d) titel.set(k, d.titel);
      else unbekannt.push(k);
    }
    if (unbekannt.length > 0) return antwort(false, `Keine genaue Kennung eines Dokuments: ${unbekannt.join(", ")}. Es wurde nichts entfernt. Nimm die Kennung (schluessel) aus wissensbasisAbrufen.`);
    const erg = await wissenBestandEntfernen(ids, grund, String(ids.length));
    if (!erg.zugriff) return antwort(false, "Dafür fehlt die Berechtigung (nur Administration).");
    if (erg.bestaetigungFalsch) return antwort(false, "Die Bestätigung stimmte nicht. Es wurde nichts entfernt.");
    const weg = erg.ergebnisse.filter((e) => e.status === "entfernt");
    const schon = erg.ergebnisse.filter((e) => e.status === "schonWeg");
    const bad = erg.ergebnisse.filter((e) => e.status === "fehler");
    const name = (e: { quelleId: string; titel: string | null }) => e.titel ?? titel.get(e.quelleId) ?? e.quelleId;
    const teile = [
      weg.length > 0 ? `Entfernt: ${weg.map((e) => `${name(e)} (${e.abschnitte} Abschnitte)`).join("; ")}.` : "",
      schon.length > 0 ? `Schon weg: ${schon.map(name).join("; ")}.` : "",
      bad.length > 0 ? `Fehlgeschlagen: ${bad.map((e) => `${name(e)} (${e.code ?? "unbekannt"})`).join("; ")}.` : "",
    ].filter(Boolean);
    return antwort(bad.length === 0, teile.join(" "));
  },
});

return {
  mwstSchwellePruefen: mwstPruefen,
  aufgabeAnlegen: aufgabeAnlegenWerkzeug,
  aufgabeStatusSetzen: aufgabeStatus,
  kuehlmessungErfassen: kuehlmessung,
  reklamationAnlegen: reklamation,
  lohnPeriodeBerechnen: lohnBerechnen,
  mitarbeiterEinschalten: einschalten,
  wissenEinordnungAendern,
  wissenDokumenteEntfernen,
} as const;
}

/** Die Aktionen, die diese Rolle ausfuehren darf - alles andere wird dem
 *  Modell gar nicht erst angeboten. */
export function baueAktionen(rolle: Role | null | undefined) {
  const ALLE_AKTIONEN = bauePool(rolle);
  const darf = (name: AktionsName) =>
    hasPermission(rolle, AKTIONS_RECHTE[name].resource, AKTIONS_RECHTE[name].verb);
  return {
    ...(darf("mwstSchwellePruefen") ? { mwstSchwellePruefen: ALLE_AKTIONEN.mwstSchwellePruefen } : {}),
    ...(darf("aufgabeAnlegen") ? { aufgabeAnlegen: ALLE_AKTIONEN.aufgabeAnlegen } : {}),
    ...(darf("aufgabeStatusSetzen") ? { aufgabeStatusSetzen: ALLE_AKTIONEN.aufgabeStatusSetzen } : {}),
    ...(darf("kuehlmessungErfassen") ? { kuehlmessungErfassen: ALLE_AKTIONEN.kuehlmessungErfassen } : {}),
    ...(darf("reklamationAnlegen") ? { reklamationAnlegen: ALLE_AKTIONEN.reklamationAnlegen } : {}),
    ...(darf("lohnPeriodeBerechnen") ? { lohnPeriodeBerechnen: ALLE_AKTIONEN.lohnPeriodeBerechnen } : {}),
    ...(darf("mitarbeiterEinschalten") ? { mitarbeiterEinschalten: ALLE_AKTIONEN.mitarbeiterEinschalten } : {}),
    // Die Verwaltung der Wissensbasis ist der Administration vorbehalten (ki_assistent:manage), nicht nur jeder Rolle mit update.
    ...(darf("wissenEinordnungAendern") && hasPermission(rolle, "ki_assistent", "manage") ? { wissenEinordnungAendern: ALLE_AKTIONEN.wissenEinordnungAendern } : {}),
    ...(darf("wissenDokumenteEntfernen") && hasPermission(rolle, "ki_assistent", "manage") ? { wissenDokumenteEntfernen: ALLE_AKTIONEN.wissenDokumenteEntfernen } : {}),
  };
}
