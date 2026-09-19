// Ordnet einen Fehler des KI-Chats ein. Schlaegt die Anfrage mit einem
// HTTP-Fehler fehl, wirft der Transport des AI SDK einen Error, dessen Text die
// Antwort der Route ist (api/ki-assistent/route.ts: "nicht angemeldet" bei 401,
// "keine berechtigung" bei 403). Vorher zeigte der Chat fuer JEDEN Fehler
// "KI-Assistent nicht erreichbar" - eine abgelaufene Sitzung sah dadurch wie
// ein Ausfall der KI aus.

export type ChatFehlerArt = "sitzung" | "berechtigung" | "allgemein";

export function chatFehlerArt(fehler: { message?: string } | null | undefined): ChatFehlerArt | null {
  if (!fehler) return null;
  const text = (fehler.message ?? "").toLowerCase();
  if (text.includes("nicht angemeldet")) return "sitzung";
  if (text.includes("keine berechtigung")) return "berechtigung";
  return "allgemein";
}
