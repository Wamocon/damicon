import { getTranslations } from "next-intl/server";
import { Aufklapper, StatusPill } from "@/components/ui/kit";
import {
  gewichtSchluessel,
  parameterWert,
  RISIKO_FAKTOREN,
  risikoTon,
  type BlockRisiko,
  type RisikoFaktor,
  type RisikoParameter,
} from "@/lib/domain/block-risiko";

// Die Risikobewertung eines Reihenblocks in der Tabelle der Bloecke (WMCNL-1470): Stufe und
// Punktwert in einer Pille, der Hauptgrund darunter. Dazu die Erklaerung, wie der Wert
// entsteht, mit den Gewichten aus der Datenbank.

type Uebersetzer = Awaited<ReturnType<typeof getTranslations>>;

export function RisikoZelle({ risiko, t }: { risiko: BlockRisiko | undefined; t: Uebersetzer }) {
  if (!risiko) return <span className="text-muted-foreground">-</span>;
  return (
    <div className="space-y-0.5">
      <StatusPill tone={risikoTon[risiko.stufe]}>
        {t(`stufe.${risiko.stufe}`)} · {t("punkte", { punkte: risiko.punkte })}
      </StatusPill>
      <p className="text-[11px] text-muted-foreground">
        {risiko.hauptgrund ? t(`grund.${risiko.hauptgrund}`) : t("keinMangel")}
      </p>
    </div>
  );
}

/** Die Werte, die in den Regeltext eines Faktors eingesetzt werden. */
function regelWerte(faktor: RisikoFaktor, p: readonly RisikoParameter[]): Record<string, number> {
  const w = (schluessel: string) => parameterWert(p, schluessel);
  switch (faktor) {
    case "ueberfaellig":
      return { tage: w("intervall_max_tage") };
    case "sperre":
      return { durchgaenge: w("sperre_durchgaenge_voll") };
    case "ausschuss":
      return { tage: w("betrachtung_tage"), ziel: w("ausschuss_ziel_prozent"), kritisch: w("ausschuss_kritisch_prozent") };
    case "kuehlkette":
      return { tage: w("betrachtung_tage"), anzahl: w("kuehl_verstoesse_voll") };
    case "erfassung":
      return { aktiv: w("aktiv_tage"), tage: w("intervall_max_tage") };
  }
}

export async function RisikoErklaerung({ parameter }: { parameter: readonly RisikoParameter[] }) {
  const t = await getTranslations("blockRisiko");
  return (
    <Aufklapper titel={t("erklaerung.titel")} beschreibung={t("erklaerung.lead")}>
      <div className="space-y-3 p-4 text-xs leading-5 text-muted-foreground">
        <ul className="space-y-2">
          {RISIKO_FAKTOREN.map((faktor) => (
            <li key={faktor}>
              <p className="font-semibold text-foreground">
                {t(`erklaerung.faktor.${faktor}.name`)}{" "}
                <span className="font-normal text-muted-foreground">
                  ({t("erklaerung.gewicht", { gewicht: parameterWert(parameter, gewichtSchluessel(faktor)) })})
                </span>
              </p>
              <p>{t(`erklaerung.faktor.${faktor}.regel`, regelWerte(faktor, parameter))}</p>
            </li>
          ))}
        </ul>
        <p>
          {t("erklaerung.schwellen", {
            hoch: parameterWert(parameter, "schwelle_hoch"),
            mittel: parameterWert(parameter, "schwelle_mittel"),
          })}
        </p>
      </div>
    </Aufklapper>
  );
}
