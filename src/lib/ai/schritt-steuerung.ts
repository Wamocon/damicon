// Steuerung der Werkzeugwahl je Schritt (Vercel AI SDK: prepareStep + toolChoice).
//
// Problem, das das loest: Fragen zu Recht, Steuer, Compliance und Audit muessen aus der
// Wissensbasis belegt werden. Ein Prompt allein ("rufe ZUERST wissenSuchen auf") ist eine Bitte,
// keine Garantie: das Modell antwortet gelegentlich aus Trainingswissen, und das ist bei
// kasachischem Recht (neuer Steuerkodex 2026) nachweislich falsch. Deshalb erzwingt der Server
// in solchen Faellen im ERSTEN Schritt den Aufruf von wissenSuchen (toolChoice: { type: "tool" }).
// Ab dem zweiten Schritt entscheidet das Modell wieder frei (auto), sodass Nachfragen,
// weitere Suchen und Datenabfragen moeglich bleiben.
//
// Die Erkennung ist absichtlich grosszuegig: eine unnoetige Suche kostet rund eine Sekunde, eine
// unbelegte Rechtsauskunft kostet Vertrauen. Sie ist reine Zeichenkettenpruefung, ohne Modell,
// und damit deterministisch und testbar.

// Wortstaemme in Kleinbuchstaben, sprachuebergreifend (de, en, ru, kk). Absichtlich keine
// Alltagswoerter der Bedienung: "Steuerung", "steuere die Seite" und "Rechte der Rolle" sind
// keine Rechtsfragen.
const STAEMME = [
  // Deutsch
  "mehrwertsteuer", "umsatzsteuer", "lohnsteuer", "einkommensteuer", "steuersatz", "steuerkodex", "steuerrecht",
  "steuerlich", "steuerpflicht", "steuerberater", "steuernummer", "steuererkl", "steuerbeh", "steuerschuld",
  "mwst", "ust-", "ust ", "gesetz", "rechtlich", "rechtsgrund", "rechtsvorschrift", "arbeitsrecht", "handelsrecht",
  "verpflichtend", "gesetzlich", "vorschrift", "verstoss", "verstoß", "sanktion", "bussgeld", "bußgeld", "strafe",
  "abschlusspruef", "abschlussprüf", "audit", "compliance", "datenschutz", "aufbewahrungsfrist", "meldepflicht",
  "meldefrist", "registrierungspflicht", "umsatzschwelle", "umsatzgrenze", "schwellenwert", "anmeldefrist", "anzumelden", "kodex", "fundstelle", "haftung", "zoll", "elektronische rechnung", "esutd", " esf",
  // English
  "tax", "vat", "legal", "statute", "regulation", "penalt", "obligation", "mandatory", "e-invoice", "customs duty",
  "threshold", "labor law", "labour law", "data protection", "law ",
  // Russisch
  "порог", "налог", "ндс", "закон", "кодекс", "штраф", "аудит", "комплаенс", "санкци", "обязательн", "эсф", "эсутд", "таможен",
  "трудово", "персональн", "ответственност", "статья", "ст. ",
  // Kasachisch
  "салық", "қдс", "заң", "кодекс", "айыппұл", "аудит", "тексеру", "міндетті",
];

/** Steht die Nutzerfrage im Bereich Recht, Steuer, Compliance oder Audit? */
export function istRechtsfrage(text: string): boolean {
  const t = ` ${text.toLowerCase().replace(/\s+/g, " ")} `;
  // "Steuer" als Hauptwort (Mehrwertsteuer, Lohnsteuer, "die Steuer"), nicht "Steuerung"/"steuere".
  if (/(?:^|[^\p{L}])(?:\p{L}*steuer|steuern)(?=$|[^\p{L}])/u.test(t) && !/steuer(?:ung|e|t|st)(?=$|[^\p{L}])/u.test(t)) return true;
  return STAEMME.some((s) => t.includes(s));
}

export type ToolChoice = "auto" | "required" | "none" | { type: "tool"; toolName: "wissenSuchen" };

export interface SchrittEingabe {
  stepNumber: number;
  modus: "assistent" | "agent";
  /** Ist die letzte Nachricht eine neue Nutzerfrage (und keine Freigabe-Runde)? */
  neueNutzerFrage: boolean;
  frage: string;
  /** Wird wissenSuchen fuer diese Rolle angeboten (Rollenrecht UND Index vorhanden)? */
  wissenAngeboten: boolean;
  /** Die Anfrage liegt offensichtlich ausserhalb des Auftrags (lib/ai/bereich-schutz.ts): keine Werkzeuge. */
  ausserhalb?: boolean;
}

/** Ergebnis fuer prepareStep, oder undefined = nichts erzwingen. */
export function waehleSchritt(e: SchrittEingabe): { toolChoice: ToolChoice } | undefined {
  // Zweckentfremdung: in JEDEM Schritt ohne Werkzeuge, es wird nur abgelehnt.
  if (e.ausserhalb && e.neueNutzerFrage) return { toolChoice: "none" };
  if (e.stepNumber !== 0 || !e.neueNutzerFrage) return undefined;
  if (e.wissenAngeboten && istRechtsfrage(e.frage)) {
    return { toolChoice: { type: "tool", toolName: "wissenSuchen" } };
  }
  // Agent-Modus, neue Frage: der erste Schritt MUSS ein Werkzeug rufen (siehe route.ts).
  if (e.modus === "agent") return { toolChoice: "required" };
  return undefined;
}
