// Reine Nachrichten-, Segmentierungs- und Beschriftungsfunktionen fuer den
// KI-Chat (ki-chat.tsx): kein JSX, keine Seiteneffekte. Wandeln den
// Nachrichtenverlauf des Vercel AI SDK in die Bausteine um, die ki-chat.tsx
// und ki-chat-aktionskarte.tsx darstellen - Schrittlisten, Aktionskarten,
// Markdown-Bloecke sowie die Beschriftung von Werkzeugen und Bereichen.

import { getToolName, isDynamicToolUIPart, isToolUIPart, type UIMessage } from "ai";
import type { useTranslations } from "next-intl";
import { AKTIONS_RECHTE, istAktion, type AktionsName } from "@/lib/ai/aktionen-meta";
import { istClientWerkzeug } from "@/lib/ai/client-werkzeuge-meta";
import type { KiChatNachrichtZeile } from "@/lib/domain/ki-assistent";
import { modules } from "@/lib/modules";
import { hasPermission, type Role } from "@/lib/rbac";
import { belegeAusErgebnis } from "@/lib/wissen/belege";
import type { KiModus } from "@/components/ki/ki-pane-kontext";

export interface Schritt {
  id: string;
  name: string;
  zustand: "laeuft" | "fertig" | "fehler";
  ziel: string | null;
  bereich: string | null;
  tabelle: string | null;
  absicht: string | null;
}

export interface AktionsErgebnis {
  ok: boolean;
  meldungSchluessel: string | null;
  wert: string | null;
  text: string;
  ziel: string | null;
}

export interface AktionsKarte {
  id: string;
  name: AktionsName;
  zustand: "vorbereiten" | "freigabe" | "laeuft" | "erledigt" | "fehlgeschlagen" | "abgelehnt";
  eingabe: Record<string, unknown>;
  approvalId: string | null;
  ergebnis: AktionsErgebnis | null;
}

export type Segment =
  | { art: "text"; text: string }
  | { art: "schritte"; schritte: Schritt[] }
  | { art: "aktion"; karte: AktionsKarte };

const bekannteBereiche = new Set(modules.map((m) => m.key));

export function verlaufZuNachrichten(verlauf: KiChatNachrichtZeile[]): UIMessage[] {
  return verlauf
    .filter((n) => n.rolle !== "system")
    .map((n) => ({
      id: n.id,
      role: n.rolle === "nutzer" ? ("user" as const) : ("assistant" as const),
      parts: [{ type: "text" as const, text: n.inhalt }],
    }));
}

/** Jedes Werkzeug traegt ein "ziel" (ziele.ts) - nur diese Eigenschaften sind
 *  hier typisiert, die Fachdaten stehen bereits im Antworttext. */
export function eigenschaftAusAusgabe(ausgabe: unknown, name: "ziel" | "bereich"): string | null {
  if (typeof ausgabe === "object" && ausgabe !== null && name in ausgabe) {
    const wert = (ausgabe as Record<string, unknown>)[name];
    return typeof wert === "string" ? wert : null;
  }
  return null;
}

/** Ein Client-Werkzeug meldet Erwartbares (abgelehnt, gesperrt, veraltet) als
 *  Ergebnis mit ok: false - im Chat soll das nicht wie ein Erfolg aussehen. */
export function ausgabeAbgelehnt(ausgabe: unknown): boolean {
  return typeof ausgabe === "object" && ausgabe !== null && "ok" in ausgabe && (ausgabe as { ok: unknown }).ok === false;
}

export function alsAktionsErgebnis(ausgabe: unknown): AktionsErgebnis | null {
  if (typeof ausgabe !== "object" || ausgabe === null || !("ok" in ausgabe)) return null;
  const a = ausgabe as Record<string, unknown>;
  return {
    ok: a.ok === true,
    meldungSchluessel: typeof a.meldungSchluessel === "string" ? a.meldungSchluessel : null,
    wert: typeof a.wert === "string" ? a.wert : null,
    text: typeof a.text === "string" ? a.text : "",
    ziel: typeof a.ziel === "string" ? a.ziel : null,
  };
}

function alsKarte(teil: Parameters<typeof getToolName>[0], name: AktionsName): AktionsKarte {
  const eingabe =
    typeof teil.input === "object" && teil.input !== null ? (teil.input as Record<string, unknown>) : {};
  const basis = { id: teil.toolCallId, name, eingabe, approvalId: null as string | null, ergebnis: null as AktionsErgebnis | null };
  switch (teil.state) {
    case "approval-requested":
      return { ...basis, zustand: "freigabe", approvalId: teil.approval.id };
    case "approval-responded":
      return { ...basis, zustand: teil.approval.approved ? "laeuft" : "abgelehnt", approvalId: teil.approval.id };
    case "output-denied":
      return { ...basis, zustand: "abgelehnt" };
    case "output-error":
      return { ...basis, zustand: "fehlgeschlagen" };
    case "output-available": {
      const ergebnis = alsAktionsErgebnis(teil.output);
      return { ...basis, zustand: ergebnis?.ok ? "erledigt" : "fehlgeschlagen", ergebnis };
    }
    default:
      return { ...basis, zustand: "vorbereiten" };
  }
}

/** Alle Belege, die Wissenssuchen dieser Nachricht geliefert haben (Kennungen sind pro Antwort eindeutig). */
export function belegeVonNachricht(nachricht: UIMessage) {
  return nachricht.parts.flatMap((teil) =>
    (isToolUIPart(teil) || isDynamicToolUIPart(teil)) && getToolName(teil) === "wissenSuchen" && teil.state === "output-available"
      ? belegeAusErgebnis(teil.output)
      : [],
  );
}

export function textVonNachricht(nachricht: UIMessage): string {
  return nachricht.parts.map((teil) => (teil.type === "text" ? teil.text : "")).join("\n");
}

/** Ordnet die Teile einer Assistentennachricht in Textbloecke, Schrittlisten
 *  und Aktionskarten in ihrer Reihenfolge - aufeinanderfolgende Werkzeuge
 *  bilden EINE Liste, aufeinanderfolgender Text EINEN Markdown-Block, damit die
 *  Darstellung unabhaengig davon gleich aussieht, wie das Modell seine Schritte
 *  stueckelt. */
export function segmentiere(nachricht: UIMessage): Segment[] {
  const segmente: Segment[] = [];
  for (const teil of nachricht.parts) {
    if (teil.type === "text") {
      if (!teil.text.trim()) continue;
      const letztes = segmente.at(-1);
      if (letztes?.art === "text") letztes.text += `\n\n${teil.text}`;
      else segmente.push({ art: "text", text: teil.text });
      continue;
    }
    if (!isToolUIPart(teil) && !isDynamicToolUIPart(teil)) continue;
    const name = getToolName(teil);
    if (name === "ohneAnsicht") continue;
    if (istAktion(name)) {
      segmente.push({ art: "aktion", karte: alsKarte(teil, name) });
      continue;
    }
    const eingabe = teil.input as { bereich?: unknown; tabelle?: unknown; absicht?: unknown } | undefined;
    const ausgabe = teil.state === "output-available" ? teil.output : undefined;
    const schritt: Schritt = {
      id: teil.toolCallId,
      name,
      zustand:
        teil.state === "output-available"
          ? istClientWerkzeug(name) && ausgabeAbgelehnt(teil.output)
            ? "fehler"
            : "fertig"
          : teil.state === "output-error"
            ? "fehler"
            : "laeuft",
      ziel: eigenschaftAusAusgabe(ausgabe, "ziel"),
      bereich:
        eigenschaftAusAusgabe(ausgabe, "bereich") ??
        (typeof eingabe?.bereich === "string" ? eingabe.bereich : null),
      tabelle: typeof eingabe?.tabelle === "string" ? eingabe.tabelle : null,
      absicht: typeof eingabe?.absicht === "string" ? eingabe.absicht : null,
    };
    const letztes = segmente.at(-1);
    if (letztes?.art === "schritte") letztes.schritte.push(schritt);
    else segmente.push({ art: "schritte", schritte: [schritt] });
  }
  return segmente;
}

// Vorschlaege je Rolle und Modus: nur, was diese Rolle auch tatsaechlich
// kann - ein Kunde sieht keine Lohn-Vorschlaege. Die Rechte kommen direkt aus
// rbac.ts, dieselbe Quelle wie die Werkzeuge auf dem Server.
export function waehleVorschlaege(rolle: Role, modus: KiModus): string[] {
  const darf = (resource: Parameters<typeof hasPermission>[1], verb: Parameters<typeof hasPermission>[2]) =>
    hasPermission(rolle, resource, verb);
  const aktion = (name: AktionsName) => darf(AKTIONS_RECHTE[name].resource, AKTIONS_RECHTE[name].verb);
  const pool: [string, boolean][] =
    modus === "agent"
      ? [
          ["risiko", darf("stammdaten", "view") || darf("personal", "view") || darf("compliance", "view")],
          ["aufgabeAnlegen", aktion("aufgabeAnlegen")],
          ["lohnBerechnen", aktion("lohnPeriodeBerechnen")],
          ["reklamationMelden", aktion("reklamationAnlegen")],
          ["kuehlkette", darf("kuehlkette", "view")],
          ["mwst", darf("stammdaten", "view")],
          ["bereiche", true],
        ]
      : [
          ["risiko", darf("stammdaten", "view") || darf("personal", "view") || darf("compliance", "view")],
          ["mwst", darf("stammdaten", "view")],
          ["kuehlkette", darf("kuehlkette", "view")],
          ["aufgaben", darf("pflueckaufgaben", "view")],
          ["reklamationen", darf("reklamationen", "view")],
          ["bereiche", true],
        ];
  return pool
    .filter(([, erlaubt]) => erlaubt)
    .map(([id]) => `vorschlaege.${modus}.${id}`)
    .slice(0, 4);
}

type Uebersetzer = ReturnType<typeof useTranslations>;

/** Erzeugt bereichTitel/beschriftung fuer den aktuellen Render: beide sind reine
 *  Funktionen ueber den vier Uebersetzern der Chat-Ansicht (kiAssistentAnsicht,
 *  nav, auth, modules) und werden deshalb bei jedem Aufruf frisch gebaut statt
 *  einmalig auf Modulebene zu stehen - wie t/navT/authT/moduleT selbst sind sie
 *  pro Render neue Funktionen (siehe Aufrufstelle in ki-chat.tsx). */
export function erstelleBeschriftungen({
  t,
  navT,
  authT,
  moduleT,
}: {
  t: Uebersetzer;
  navT: Uebersetzer;
  authT: Uebersetzer;
  moduleT: Uebersetzer;
}) {
  function bereichTitel(bereich: string | null): string {
    if (bereich === "uebersicht") return navT("overview");
    if (bereich === "sicherheit") return authT("security");
    // oeffnePruefBereich (route.ts): Kacheln der CEO-Complianceuebersicht sind keine echten
    // App-Module (modules.ts) und stehen deshalb in einer eigenen kleinen Liste.
    if (bereich && t.has(`pruefBereich.${bereich}`)) return t(`pruefBereich.${bereich}`);
    return bereich && bekannteBereiche.has(bereich) ? moduleT(`${bereich}.title`) : t("bereichAllgemein");
  }

  function beschriftung(
    gruppe: "werkzeug" | "laeuft" | "ziel",
    name: string,
    teile: { bereich?: string | null; tabelle?: string | null; absicht?: string | null } = {},
  ): string {
    const schluessel = `${gruppe}.${name}`;
    return t.has(schluessel)
      ? t(schluessel, { bereich: bereichTitel(teile.bereich ?? null), tabelle: teile.tabelle ?? "", absicht: teile.absicht ?? "" })
      : t(`${gruppe}.unbekannt`);
  }

  return { bereichTitel, beschriftung };
}
