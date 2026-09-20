// Compliance-Pruefung: Himbi plant, Mini-Himbis pruefen je Bereich (Audit, Steuer, Recht, Risiko),
// der Bericht kommt als Strom von Ereignissen (eine JSON-Zeile je Ereignis, application/x-ndjson),
// damit die Oberflaeche den Ablauf live zeigen kann. Ablauf und Regeln: lib/pruefung/agenten.ts.
//
// Zugriff (alles serverseitig, die Oberflaeche versteckt nur):
//   * angemeldet, Recht ki_assistent:create
//   * eine Rolle mit Pruefrecht (lib/pruefung/rollen.ts); angefragte Bereiche werden auf das
//     zugeschnitten, was die Rolle darf, der Rest wird im Bericht als "nicht freigegeben" genannt
//   * eine Wissensbasis muss da sein: ohne Rechtsquellen gaebe es nur Behauptungen, und ein Audit
//     ohne Belege ist wertlos. Dann lieber ehrlich ablehnen.
//   * je Person nur ein Lauf gleichzeitig
// Jeder Lauf steht im Audit-Protokoll (Start und Ende, mit Rolle, Bereichen, Siegel).

import { createAnthropic } from "@ai-sdk/anthropic";
import { getSessionProfile } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { protokolliere } from "@/lib/actions/formular-helfer";
import { ladeAktivenStandardAnbieter, anthropicBasisUrl } from "@/lib/ai/lade-anbieter";
import { entschluessleApiKey } from "@/lib/ai/schluessel";
import { baueWerkzeuge } from "@/lib/ai/tools";
import { fuehrePruefungAus } from "@/lib/pruefung/agenten";
import { darfPruefen, waehleBereiche } from "@/lib/pruefung/rollen";
import type { Ereignis } from "@/lib/pruefung/typen";
import { pruefeWissenGesundheit, sucheWissen } from "@/lib/wissen/suche";

export const maxDuration = 300;

const laufend = new Set<string>();

export async function POST(req: Request) {
  const profil = await getSessionProfile();
  if (!profil) return new Response("nicht angemeldet", { status: 401 });
  if (!hasPermission(profil.role, "ki_assistent", "create") || !darfPruefen(profil.role)) {
    return new Response("keine berechtigung", { status: 403 });
  }

  let body: { bereiche?: unknown; sprache?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response("ungueltige eingabe", { status: 400 });
  }
  const wahl = waehleBereiche(profil.role, body.bereiche);
  if (wahl.erlaubt.length === 0) return new Response("keine berechtigung fuer die angefragten bereiche", { status: 403 });

  if (!(await pruefeWissenGesundheit())) return new Response("wissensbasis nicht verfuegbar", { status: 409 });
  const anbieter = await ladeAktivenStandardAnbieter();
  if (!anbieter || anbieter.typ !== "anthropic") return new Response("kein-anbieter", { status: 409 });
  if (laufend.has(profil.id)) return new Response("pruefung laeuft bereits", { status: 429 });

  const sprache = typeof body.sprache === "string" ? body.sprache : "de";
  const anthropic = createAnthropic({ apiKey: entschluessleApiKey(anbieter.api_key_chiffrat), baseURL: anthropicBasisUrl(anbieter.basis_url) });
  const werkzeuge = baueWerkzeuge(profil.role, { nurLesen: true }) as Record<string, unknown>;

  laufend.add(profil.id);
  const encoder = new TextEncoder();
  const strom = new ReadableStream<Uint8Array>({
    async start(controller) {
      const senden = (e: Ereignis) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
        } catch {
          /* Client ist weg */
        }
      };
      try {
        await protokolliere(profil, "compliance_pruefung_gestartet", "compliance_pruefung", null, {
          bereiche: wahl.erlaubt,
          abgelehnt: wahl.abgelehnt,
          modell: anbieter.modell,
        }).catch(() => {});
        const bericht = await fuehrePruefungAus(
          { rolle: profil.role, ersteller: { name: profil.fullName }, bereiche: wahl.erlaubt, abgelehnt: wahl.abgelehnt, sprache },
          {
            modell: anthropic(anbieter.modell),
            modellName: anbieter.modell,
            werkzeuge,
            suche: (fragen, rolle, opts) => sucheWissen(fragen, rolle, opts),
          },
          senden,
          req.signal,
        );
        let protokolliert = true;
        await protokolliere(profil, "compliance_pruefung_abgeschlossen", "compliance_pruefung", null, {
          bericht: bericht.id,
          siegel: bericht.siegel.wert,
          reife: bericht.kennzahlen.reife,
          befunde: bericht.kennzahlen.anzahl,
          vollstaendig: bericht.vollstaendig,
        }).catch(() => {
          protokolliert = false;
        });
        senden({ t: "bericht", bericht, protokolliert });
      } catch (e) {
        console.error("[damicon] Compliance-Pruefung fehlgeschlagen:", e);
        senden({ t: "fehler", text: "Die Pruefung konnte nicht abgeschlossen werden." });
      } finally {
        laufend.delete(profil.id);
        try {
          controller.close();
        } catch {
          /* schon geschlossen */
        }
      }
    },
    cancel() {
      laufend.delete(profil.id);
    },
  });

  return new Response(strom, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store, no-transform", "x-accel-buffering": "no" },
  });
}
