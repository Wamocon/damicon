// Lokale Kontaktkanaele und Zahlungswege (Anforderung 5.6). Reine
// Anzeige/Verwaltung, keine echte API-Integration (Nutzer-Entscheidung).

export const kontaktkanalTypen = ["whatsapp", "telegram", "instagram", "kaspi_qr", "sonstiges"] as const;
export type KontaktkanalTyp = (typeof kontaktkanalTypen)[number];

export interface KontaktkanalZeile {
  id: string;
  typ: KontaktkanalTyp;
  bezeichnung: string;
  wert: string | null;
  aktiv: boolean;
  reihenfolge: number;
}

export const demoKanaele: KontaktkanalZeile[] = [
  { id: "demo-kanal-1", typ: "whatsapp", bezeichnung: "WhatsApp Business", wert: null, aktiv: false, reihenfolge: 1 },
  { id: "demo-kanal-2", typ: "kaspi_qr", bezeichnung: "Kaspi QR", wert: null, aktiv: false, reihenfolge: 2 },
  { id: "demo-kanal-3", typ: "telegram", bezeichnung: "Telegram", wert: null, aktiv: false, reihenfolge: 3 },
];
