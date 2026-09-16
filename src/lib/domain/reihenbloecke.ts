// Reihenblock-Zustandsautomat. Jeder Reihenblock am Spalier hat genau einen
// Status. Der Pflückplan zeigt einen wartezeitgesperrten Block schlicht nicht
// an - das ist der am einfachsten prüfbare Nutzen des gesamten Systems.

// Reihenfolge wie im Datenbank-Enum public.reihenblock_status.
export const reihenblockStatus = [
  "bepflanzt", // trägt, in normaler Pflege
  "erntereif", // für die nächste Rotation eingeplant
  "ruhend", // abgetragen / Winterruhe
  "rueckschnitt", // Ruten-/Formschnitt läuft
  "wartezeitgesperrt", // Ernte gesperrt bis Ablauf der Wartezeit
] as const;

export type ReihenblockStatus = (typeof reihenblockStatus)[number];

export interface Reihenblock {
  id: string;
  parzelle: string;
  reihengruppe: string;
  sorte: string;
  status: ReihenblockStatus;
  laengeM: number;
  letzteErnte: string | null;
  // nur bei wartezeitgesperrt gesetzt
  sperre?: {
    mittel: string;
    behandeltAm: string;
    wartezeitTage: number;
    freigabeAm: string;
  };
}

export const statusMeta: Record<
  ReihenblockStatus,
  { hintKey: string; tone: "success" | "info" | "neutral" | "warning" | "danger" }
> = {
  bepflanzt: { hintKey: "bepflanzt", tone: "success" },
  erntereif: { hintKey: "erntereif", tone: "info" },
  ruhend: { hintKey: "ruhend", tone: "neutral" },
  rueckschnitt: { hintKey: "rueckschnitt", tone: "warning" },
  wartezeitgesperrt: { hintKey: "wartezeitgesperrt", tone: "danger" },
};

export const reihenbloecke: Reihenblock[] = [
  { id: "T-N-A-01", parzelle: "Parzelle Nord", reihengruppe: "Reihengruppe A", sorte: "Polka", status: "erntereif", laengeM: 42, letzteErnte: "2026-08-30" },
  { id: "T-N-A-02", parzelle: "Parzelle Nord", reihengruppe: "Reihengruppe A", sorte: "Polka", status: "bepflanzt", laengeM: 42, letzteErnte: "2026-08-28" },
  { id: "T-N-A-03", parzelle: "Parzelle Nord", reihengruppe: "Reihengruppe A", sorte: "Polka", status: "bepflanzt", laengeM: 42, letzteErnte: "2026-08-29" },
  {
    id: "T-N-A-04",
    parzelle: "Parzelle Nord",
    reihengruppe: "Reihengruppe A",
    sorte: "Polka",
    status: "wartezeitgesperrt",
    laengeM: 42,
    letzteErnte: "2026-08-27",
    sperre: {
      mittel: "Signum (Boscalid + Pyraclostrobin)",
      behandeltAm: "2026-09-01",
      wartezeitTage: 3,
      freigabeAm: "2026-09-04",
    },
  },
  {
    id: "T-N-B-01",
    parzelle: "Parzelle Nord",
    reihengruppe: "Reihengruppe B",
    sorte: "Polka",
    status: "wartezeitgesperrt",
    laengeM: 40,
    letzteErnte: "2026-08-26",
    sperre: {
      mittel: "SpinTor (Spinosad)",
      behandeltAm: "2026-08-31",
      wartezeitTage: 3,
      freigabeAm: "2026-09-03",
    },
  },
  { id: "T-N-B-02", parzelle: "Parzelle Nord", reihengruppe: "Reihengruppe B", sorte: "Polka", status: "rueckschnitt", laengeM: 40, letzteErnte: "2026-08-20" },
  { id: "T-O-A-01", parzelle: "Parzelle Ost", reihengruppe: "Reihengruppe A", sorte: "Polana", status: "erntereif", laengeM: 38, letzteErnte: "2026-08-31" },
  { id: "T-O-A-02", parzelle: "Parzelle Ost", reihengruppe: "Reihengruppe A", sorte: "Polana", status: "bepflanzt", laengeM: 38, letzteErnte: "2026-08-30" },
  { id: "I-S-A-01", parzelle: "Parzelle Sued", reihengruppe: "Reihengruppe A", sorte: "Tulameen", status: "ruhend", laengeM: 45, letzteErnte: "2026-07-18" },
  { id: "I-S-A-02", parzelle: "Parzelle Sued", reihengruppe: "Reihengruppe A", sorte: "Tulameen", status: "ruhend", laengeM: 45, letzteErnte: "2026-07-19" },
  { id: "I-S-B-01", parzelle: "Parzelle Sued", reihengruppe: "Reihengruppe B", sorte: "Tulameen", status: "rueckschnitt", laengeM: 44, letzteErnte: "2026-07-15" },
  { id: "K-A-01", parzelle: "Zukauf-Parzelle", reihengruppe: "Reihengruppe A", sorte: "Polka", status: "erntereif", laengeM: 36, letzteErnte: "2026-08-30" },
];
