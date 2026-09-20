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
import { kuehlmessungKern } from "@/lib/actions/nachweiskette";
import { reklamationAnlegen } from "@/lib/actions/reklamationen";
import { lohnPeriodeBerechnen } from "@/lib/actions/lohn";
import { kiEskalationAnfordern } from "@/lib/actions/ki-assistent";
import { reklamationGruende } from "@/lib/domain/reklamationen";
import { zielFuerModul, ZIEL_MWST } from "@/lib/ai/ziele";

const datum = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format JJJJ-MM-TT");

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
    "Loest die MwSt-Schwellenpruefung aus: berechnet den rollierenden 12-Monats-Umsatz neu und haelt beim ersten Ueberschreiten der Schwelle das Datum fest. Nutze es nur, wenn der Nutzer die Pruefung ausdruecklich anstoessen will.",
  inputSchema: z.object({}),
  needsApproval: true,
  execute: async () => ergebnis(await mwstSchwellePruefen(leer, formular({})), ZIEL_MWST),
});

const aufgabeAnlegenWerkzeug = tool({
  description:
    "Legt eine Pflueckaufgabe fuer einen Reihenblock an (Status 'offen'). Der Reihenblock wird ueber seinen Code angegeben (z. B. 'A-03'); schlage den Code per datenLesen nach, wenn der Nutzer ihn nicht nennt. Blocks in der Wartezeit werden abgelehnt.",
  inputSchema: z.object({
    reihenblockCode: z.string().min(1).max(40),
    zielmengeKg: z.number().positive().max(100000),
    pflueckerAnzahl: z.number().int().min(0).max(500).optional(),
    faelligkeit: datum.optional().describe("Faelligkeitsdatum JJJJ-MM-TT"),
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
    return ergebnis(status, zielFuerModul("pflueckaufgaben", rolle));
  },
});

const aufgabeStatus = tool({
  description:
    "Setzt den Status einer Pflueckaufgabe: 'angenommen' (offen -> angenommen) oder 'in_arbeit' (angenommen -> in_arbeit, Arbeitsbeginn jetzt). Die Aufgabe wird ueber ihren Code angegeben (z. B. 'PA-20260919-XXXXXXXX').",
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
    "Erfasst eine Kuehlmessung (Temperatur in Grad Celsius) zu einer Pflueckaufgabe, mit der aktuellen Uhrzeit. Ein Kuehlketten-Verstoss wird trotzdem gespeichert und im Ergebnis als Warnung gemeldet. Nennt der Nutzer eine Charge oder einen Reihenblock statt eines Aufgabencodes, suche ZUERST mit datenLesen die passende Pflueckaufgabe (Tabelle pflueckaufgaben) und nimm deren Code; frage nur nach, wenn mehrere Aufgaben passen.",
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
    "Meldet eine Reklamation. Kunden melden immer fuer die eigene Firma; das Buero gibt zusaetzlich 'kundenName' an (Teil des Firmennamens genuegt). Optional mit Chargencode und betroffener Menge.",
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
    "Berechnet die Lohnabrechnungen (Grundlohn, Menge, Qualitaetsfaktor) fuer einen Zeitraum. Bereits freigegebene oder ausgezahlte Abrechnungen bleiben unveraendert. Den Zeitraum leitest du selbst aus dem heutigen Datum ab ('diesen Monat' = erster bis letzter Tag des laufenden Monats, 'letzten Monat' analog): frage nicht danach und leite die Aufgabe nicht an einen Mitarbeiter weiter.",
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
    "Gibt das Gespraech an einen Mitarbeiter weiter (Eskalation). Nur wenn der Nutzer AUSDRUECKLICH einen Menschen sprechen will. Kein Ausweg, wenn dir Angaben fehlen (dann waehle einen sinnvollen Standard oder frage in einem Satz nach) und nie fuer etwas, das du mit einem anderen Werkzeug oder ueber die Oberflaeche erledigen kannst. Buero-Rollen (Admin, Betriebsleitung, Buchhaltung) SIND das Buero und werden nie an das Buero weitergeleitet.",
  inputSchema: z.object({}),
  needsApproval: true,
  execute: async () => ergebnis(await kiEskalationAnfordern(leer, formular({})), null),
});

return {
  mwstSchwellePruefen: mwstPruefen,
  aufgabeAnlegen: aufgabeAnlegenWerkzeug,
  aufgabeStatusSetzen: aufgabeStatus,
  kuehlmessungErfassen: kuehlmessung,
  reklamationAnlegen: reklamation,
  lohnPeriodeBerechnen: lohnBerechnen,
  mitarbeiterEinschalten: einschalten,
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
  };
}
