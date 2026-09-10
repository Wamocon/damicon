// Vierstufige Standort-Hierarchie - "die wertvollste einzelne Uebernahme"
// (Analyse Kapitel 4). 1Cati: Company > Site > Block > Floor > Unit.
// Damicon: Betrieb > Plantage > Feldparzelle > Reihengruppe > Reihenblock.

export interface Reihengruppe {
  id: string;
  name: string;
  spalierrichtung: "n_s" | "o_w";
  reihenbloecke: number;
}

export interface Feldparzelle {
  id: string;
  name: string;
  flaecheHa: number;
  sorte: string;
  reihengruppen: Reihengruppe[];
}

export interface Plantage {
  id: string;
  name: string;
  ort: string;
  typ: "eigen" | "nachbarbetrieb";
  parzellen: Feldparzelle[];
}

export interface Betrieb {
  id: string;
  name: string;
  plantagen: Plantage[];
}

export const betrieb: Betrieb = {
  id: "damicon-almaty",
  name: "Damicon Aggregator - Umland Almaty",
  plantagen: [
    {
      id: "p-talgar",
      name: "Plantage Talgar",
      ort: "Talgar, Gebiet Almaty",
      typ: "eigen",
      parzellen: [
        {
          id: "f-t-01",
          name: "Parzelle Nord",
          flaecheHa: 3.2,
          sorte: "Polka (remontierend)",
          reihengruppen: [
            { id: "rg-t-01-a", name: "Reihengruppe A", spalierrichtung: "n_s", reihenbloecke: 8 },
            { id: "rg-t-01-b", name: "Reihengruppe B", spalierrichtung: "n_s", reihenbloecke: 8 },
          ],
        },
        {
          id: "f-t-02",
          name: "Parzelle Ost",
          flaecheHa: 2.5,
          sorte: "Polana (remontierend)",
          reihengruppen: [
            { id: "rg-t-02-a", name: "Reihengruppe A", spalierrichtung: "o_w", reihenbloecke: 6 },
          ],
        },
      ],
    },
    {
      id: "p-issyk",
      name: "Plantage Issyk",
      ort: "Yesik, Gebiet Almaty",
      typ: "eigen",
      parzellen: [
        {
          id: "f-i-01",
          name: "Parzelle Sued",
          flaecheHa: 4.1,
          sorte: "Tulameen (Sommertragend)",
          reihengruppen: [
            { id: "rg-i-01-a", name: "Reihengruppe A", spalierrichtung: "n_s", reihenbloecke: 10 },
            { id: "rg-i-01-b", name: "Reihengruppe B", spalierrichtung: "n_s", reihenbloecke: 9 },
          ],
        },
      ],
    },
    {
      id: "p-kaskelen",
      name: "Nachbarbetrieb Kaskelen",
      ort: "Kaskelen, Gebiet Almaty",
      typ: "nachbarbetrieb",
      parzellen: [
        {
          id: "f-k-01",
          name: "Zukauf-Parzelle",
          flaecheHa: 1.8,
          sorte: "Polka (remontierend)",
          reihengruppen: [
            { id: "rg-k-01-a", name: "Reihengruppe A", spalierrichtung: "o_w", reihenbloecke: 5 },
          ],
        },
      ],
    },
  ],
};

export function hierarchyStats() {
  const plantagen = betrieb.plantagen.length;
  const parzellen = betrieb.plantagen.reduce((sum, p) => sum + p.parzellen.length, 0);
  const reihengruppen = betrieb.plantagen.reduce(
    (sum, p) => sum + p.parzellen.reduce((s, f) => s + f.reihengruppen.length, 0),
    0,
  );
  const reihenbloecke = betrieb.plantagen.reduce(
    (sum, p) =>
      sum +
      p.parzellen.reduce(
        (s, f) => s + f.reihengruppen.reduce((x, rg) => x + rg.reihenbloecke, 0),
        0,
      ),
    0,
  );
  const flaecheHa = betrieb.plantagen.reduce(
    (sum, p) => sum + p.parzellen.reduce((s, f) => s + f.flaecheHa, 0),
    0,
  );
  return { plantagen, parzellen, reihengruppen, reihenbloecke, flaecheHa };
}
