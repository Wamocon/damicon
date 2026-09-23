import type { SessionProfile } from "@/lib/auth";
import { protokolliere } from "@/lib/actions/formular-helfer";
import { ladeAnbieterKette, meldeAnbieterwechsel } from "@/lib/ai/anbieter-kette";
import type { AusweichEreignis } from "@/lib/ai/ausfall-modell";
import { baueWerkzeuge } from "@/lib/ai/tools";
import type { Json } from "@/lib/database.types";
import { letzterCeoBericht } from "@/lib/data/compliance-ceo";
import { fuehreAus, fuehrePruefungAus } from "@/lib/pruefung/agenten";
import { sha256Hex } from "@/lib/pruefung/befund";
import { punkteFuer } from "@/lib/pruefung/felder";
import { darfCeoBericht, erlaubteBereiche, type Pruefbereich } from "@/lib/pruefung/rollen";
import type { BefundAenderung, Bericht, Ereignis } from "@/lib/pruefung/typen";
import { createClient } from "@/lib/supabase/server";
import { pruefeWissenGesundheit, sucheWissen } from "@/lib/wissen/suche";

// Automatischer Compliance-Lauf fuer die Rollen ceo und admin: alle vier
// Pruefbereiche in einem Lauf (fuehrePruefungAus() unterstuetzt das bereits),
// ausgeloest beim Login (route.ts unter app/api/ki-pruefung/auto) oder manuell
// (actions/compliance-ceo.ts). Wer ausloesen darf, steht an genau einer Stelle:
// darfCeoBericht() in lib/pruefung/rollen.ts. Persistiert wird nach
// lib/data/compliance-ceo.ts (compliance_ceo_berichte), append-only, siehe die
// Migrationen 20261108020000_compliance_ceo_berichte.sql (Tabelle) und
// 20261110000000_ceo_bericht_admin.sql (INSERT auch fuer admin).
//
// Aenderungserkennung: dieselben Lesewerkzeuge, die ein Lauf ohnehin fuer
// jedes Pruefungsfeld aufruft, werden hier ausserhalb eines Modellaufrufs
// aufgerufen und ueber sha256Hex() (lib/pruefung/befund.ts, bereits die
// Grundlage der Nachweis-Hashes im Bericht selbst) mit den im letzten Bericht
// gespeicherten Hashes verglichen. Nur bei einer Abweichung - oder ohne
// vorigen Bericht, oder erzwungen ueber den manuellen Knopf - startet der
// eigentliche, mehrere Modellaufrufe teure Lauf.

/** Ein Hash je (Pruefungsfeld, Datenquelle) - dieselbe Granularitaet wie Nachweis.hash in einem Befund. */
export async function aktuelleFaktenHashes(
  bereiche: readonly Pruefbereich[],
  werkzeuge: Record<string, unknown>,
): Promise<Map<string, string>> {
  const punkte = bereiche.flatMap((b) => punkteFuer(b));
  const listen = await Promise.all(
    punkte.map(async (punkt) => {
      const eintraege = await Promise.all(
        punkt.fakten.map(async (quelle): Promise<readonly [string, string] | null> => {
          try {
            const ergebnis = await fuehreAus(werkzeuge[quelle]);
            if (ergebnis === undefined) return null;
            return [`${punkt.id}:${quelle}`, await sha256Hex(JSON.stringify(ergebnis))] as const;
          } catch {
            // Werkzeug fuer diese Rolle nicht verfuegbar oder fehlgeschlagen - zaehlt wie
            // "keine Betriebsdaten", nicht als Aenderung. Der volle Lauf wuerde an derselben
            // Stelle denselben Zustand ("nicht verfuegbar") wieder feststellen.
            return null;
          }
        }),
      );
      return eintraege.filter((e): e is readonly [string, string] => e !== null);
    }),
  );
  return new Map(listen.flat());
}

/** Weicht mindestens einer der aktuellen Hashes von dem im letzten Bericht ab (oder ist neu hinzugekommen)? */
export function berichtHatSichGeaendert(letzter: Bericht, aktuelleHashes: ReadonlyMap<string, string>): boolean {
  for (const befund of letzter.befunde) {
    for (const nachweis of befund.nachweise) {
      if (aktuelleHashes.get(`${befund.feld}:${nachweis.quelle}`) !== nachweis.hash) return true;
    }
  }
  return false;
}

/** Je Befund-Id im neuen Bericht: neu, oder Status/Schwere gegenueber dem vorigen Bericht veraendert. Unveraendertes wird nicht gelistet. */
export function aenderungenBerechnen(alt: Bericht | null, neu: Bericht): BefundAenderung[] {
  const alteBefunde = new Map((alt?.befunde ?? []).map((b) => [b.id, b]));
  const aenderungen: BefundAenderung[] = [];
  for (const b of neu.befunde) {
    const vorher = alteBefunde.get(b.id);
    if (!vorher) {
      aenderungen.push({ befundId: b.id, titel: b.titel, art: "neu", status: b.status, schwere: b.schwere });
    } else if (vorher.status !== b.status) {
      aenderungen.push({ befundId: b.id, titel: b.titel, art: "status_veraendert", status: b.status, schwere: b.schwere, vorherStatus: vorher.status, vorherSchwere: vorher.schwere });
    } else if (vorher.schwere !== b.schwere) {
      aenderungen.push({ befundId: b.id, titel: b.titel, art: "schwere_veraendert", status: b.status, schwere: b.schwere, vorherStatus: vorher.status, vorherSchwere: vorher.schwere });
    }
  }
  return aenderungen;
}

export interface AktualisiereCeoBerichtOptionen {
  profil: SessionProfile;
  /** true: immer neu pruefen (manueller Knopf). false: nur bei Aenderung seit dem letzten Bericht, oder wenn noch keiner existiert. */
  erzwungen: boolean;
  sprache: string;
  /** Fuer den Live-Strom des automatischen Laufs (app/api/ki-pruefung/auto/route.ts). Ohne Angabe laeuft still, wie bisher. */
  emit?: (e: Ereignis) => void;
}

export type AktualisiereCeoBerichtErgebnis =
  /** bericht fehlt nur, wenn eine zweite parallele Anfrage abgewiesen wurde, bevor je ein Bericht existierte. */
  | { status: "uebersprungen"; bericht?: Bericht }
  /** Jemand anderes prueft gerade. Eigener Status, damit der Knopf das sagen kann, statt so zu tun, als sei nichts passiert. */
  | { status: "laeuft-bereits" }
  | { status: "erzeugt"; bericht: Bericht; aenderungen: BefundAenderung[] }
  | { status: "fehler"; grund: "keine-berechtigung" | "wissensbasis" | "kein-anbieter" | "speichern" | "unbekannt" };

// Verhindert einen doppelten Lauf innerhalb derselben Serverinstanz (zwei parallele Tabs,
// oder seit dem 23.09.2026 auch ceo und admin nebeneinander). Die Sperre haengt bewusst am
// BERICHT und nicht mehr an profil.id: es gibt genau einen Bericht je Betrieb, kein Bericht
// je Person - mit zwei ausloesenden Rollen liefen sonst zwei teure Laeufe nebeneinander,
// nur weil die Ids verschieden sind. Kein Schutz ueber mehrere Instanzen hinweg - dieselbe,
// bereits akzeptierte Grenze wie beim manuellen Lauf in app/api/ki-pruefung/route.ts.
let laeuft = false;

// Ein automatischer Lauf startet nicht, wenn der letzte Bericht juenger als dies ist. Der Fall,
// den das abdeckt: der CEO meldet sich um 08:00 an und loest den Lauf aus, der admin um 08:05
// sieht denselben frischen Bericht, ohne ihn ein zweites Mal zu bezahlen. Der manuelle Knopf
// (erzwungen) laeuft trotzdem sofort.
const ABKUEHLZEIT_MS = 15 * 60_000;

export async function aktualisiereCeoBericht({ profil, erzwungen, sprache, emit }: AktualisiereCeoBerichtOptionen): Promise<AktualisiereCeoBerichtErgebnis> {
  if (!darfCeoBericht(profil.role)) return { status: "fehler", grund: "keine-berechtigung" };
  if (laeuft) return { status: "laeuft-bereits" };
  laeuft = true;

  try {
    // erlaubteBereiche() statt [...PRUEFBEREICHE]: fuer ceo und admin sind das dieselben vier,
    // aber die Zeile hoert auf zu behaupten, der Umfang haenge nicht an der Rolle - und passt
    // damit zu baueWerkzeuge(profil.role) in der naechsten Zeile.
    const bereiche = erlaubteBereiche(profil.role);
    if (bereiche.length === 0) return { status: "fehler", grund: "keine-berechtigung" };
    const werkzeuge = baueWerkzeuge(profil.role, { nurLesen: true }) as Record<string, unknown>;
    const letzter = await letzterCeoBericht();
    // Der gespeicherte Bericht ist Text in EINER festen Sprache (von der KI beim Lauf erzeugt,
    // nicht nachtraeglich uebersetzbar wie die Oberflaeche selbst) - weicht die angeforderte
    // Sprache davon ab, reicht ein unveraenderter Datenstand nicht: der Bericht muss trotzdem
    // neu erzeugt werden, diesmal in der angeforderten Sprache.
    const spracheAbweichend = !!letzter && letzter.bericht.sprache !== sprache;

    if (!erzwungen && !spracheAbweichend && letzter) {
      // Vor der Hash-Pruefung, denn auch die kostet schon Lesevorgaenge. Die Sprach-
      // abweichung steht oben in der Bedingung und uebergeht damit auch die Abkuehlzeit:
      // sonst zeigte ein Sprachwechsel bis zu 15 Minuten lang den Bericht in der alten
      // Sprache.
      if (Date.now() - new Date(letzter.erstelltAm).getTime() < ABKUEHLZEIT_MS) {
        return { status: "uebersprungen", bericht: letzter.bericht };
      }
      const aktuelleHashes = await aktuelleFaktenHashes(bereiche, werkzeuge);
      if (!berichtHatSichGeaendert(letzter.bericht, aktuelleHashes)) {
        return { status: "uebersprungen", bericht: letzter.bericht };
      }
    }

    if (!(await pruefeWissenGesundheit())) {
      return { status: "fehler", grund: "wissensbasis" };
    }
    const anbieterwechsel: AusweichEreignis[] = [];
    const kette = await ladeAnbieterKette((e) => {
      anbieterwechsel.push(e);
      meldeAnbieterwechsel(e);
    });
    if (!kette) return { status: "fehler", grund: "kein-anbieter" };
    const anbieter = kette.primaer;
    // "sprachwechsel" zaehlt wie "auto-login" (automatisch, nicht vom Knopf ausgeloest) - eine
    // dritte gespeicherte Quelle wuerde compliance-ceo.ts' engeren Lesetyp aufweiten muessen,
    // fuer eine reine Bookkeeping-Unterscheidung nicht noetig; im Audit-Protokoll (unten) steht
    // die Abweichung ohnehin.
    const quelle: "auto-login" | "manuell" = erzwungen ? "manuell" : "auto-login";

    await protokolliere(profil, "compliance_pruefung_auto_gestartet", "compliance_pruefung", null, {
      bereiche,
      quelle,
      modell: anbieter.modell,
      sprache,
      spracheAbweichend,
    }).catch(() => {});

    const bericht = await fuehrePruefungAus(
      { rolle: profil.role, ersteller: { name: profil.fullName }, bereiche, abgelehnt: [], sprache },
      {
        modell: kette.modell,
        modellName: kette.namen.length > 1 ? `${anbieter.modell} (mit Ausweichanbieter ${kette.namen.slice(1).join(", ")})` : anbieter.modell,
        werkzeuge,
        suche: (fragen, rolle, opts) => sucheWissen(fragen, rolle, opts),
      },
      emit ?? (() => {}),
    );

    const aenderungen = aenderungenBerechnen(letzter?.bericht ?? null, bericht);

    const supabase = await createClient();
    const { error } = await supabase.from("compliance_ceo_berichte").insert({
      quelle,
      bereiche,
      bericht: bericht as unknown as Json,
      voriger_bericht_id: letzter?.id ?? null,
      aenderungen: aenderungen as unknown as Json,
    });

    await protokolliere(profil, "compliance_pruefung_auto_abgeschlossen", "compliance_pruefung", null, {
      bericht: bericht.id,
      siegel: bericht.siegel.wert,
      reife: bericht.kennzahlen.reife,
      aenderungen: aenderungen.length,
      anbieterwechsel: anbieterwechsel.map((w) => `${w.von}->${w.nach ?? "-"}:${w.art}`),
      gespeichert: !error,
    }).catch(() => {});

    if (error) {
      console.error("[damicon] CEO-Bericht konnte nicht gespeichert werden:", error);
      return { status: "fehler", grund: "speichern" };
    }
    return { status: "erzeugt", bericht, aenderungen };
  } catch (e) {
    console.error("[damicon] CEO-Auto-Pruefung fehlgeschlagen:", e);
    return { status: "fehler", grund: "unbekannt" };
  } finally {
    laeuft = false;
  }
}
