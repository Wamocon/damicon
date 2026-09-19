// Foerdermitteldossier (Anforderung 4.12). Reine Typen/Konstanten ohne
// Server-Import - wie domain/finanzen.ts getrennt von data/finanzen.ts,
// damit ein Client-Formular (foerdermittel-formulare.tsx) sie importieren
// kann, ohne "next/headers" ueber lib/supabase/server in den Client-Bundle
// zu ziehen.

export const foerderdossierStatus = [
  "entwurf",
  "eingereicht",
  "in_pruefung",
  "bewilligt",
  "abgelehnt",
  "ausgezahlt",
] as const;
export type FoerderdossierStatus = (typeof foerderdossierStatus)[number];

export interface FoerderdossierDokument {
  id: string;
  name: string;
  storagePath: string | null;
  /** Signierte, zeitlich begrenzte URL zur Datei, null ohne hinterlegte
   *  Datei oder im Demo-Modus (dasselbe Muster wie dokumente.dateiUrl). */
  dateiUrl: string | null;
}

export interface FoerderdossierZeile {
  id: string;
  portal: string;
  antragsnummer: string | null;
  titel: string;
  status: FoerderdossierStatus;
  eingereichtAm: string | null;
  fristAm: string | null;
  notizen: string | null;
  dokumente: FoerderdossierDokument[];
}

export const demoDossiers: FoerderdossierZeile[] = [
  {
    id: "demo-dossier-1",
    portal: "gosagro.kz",
    antragsnummer: "2026-114",
    titel: "Foerderung Vorkuehlanlage",
    status: "eingereicht",
    eingereichtAm: "2026-08-30",
    fristAm: "2026-10-15",
    notizen: "Nachweis der Rechnungen steht noch aus.",
    dokumente: [
      {
        id: "demo-doc-1",
        name: "Foerderdossier gosagro.kz - Kuehlhaus",
        storagePath: null,
        dateiUrl: null,
      },
    ],
  },
];
