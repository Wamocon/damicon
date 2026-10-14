import { absatz, esc, kasten, leerHinweis, marke, tabelle, type Ton } from "@/lib/dokument/damicon-dokument";
import type { DokumentEingabe, Zelle } from "@/lib/dokument/damicon-dokument";
import { dateinameFuer, kennungFuer, tagText, versiegeln, zahlText, zeitText, type DokumentKontext } from "@/lib/dokument/kontext";
import { VERSTOSS_AB_MINUTEN, WARNUNG_AB_MINUTEN, bewertePlanung, rundenZusammenfassung, type AbholRundeZeile, type KuehlErgebnis } from "@/lib/domain/abholrunden";

// Der Abholauftrag einer Runde als Dokument (WMCNL-1577): was der Fahrer abholt, wo, in welcher Reihenfolge, und welche Regel gilt.
// Nach dem Abschluss ist es der Nachweis: Menge, Pflueckbeginn, Abholung, Ankunft im Kuehlhaus und das Ergebnis je Stopp.
// Rein: die Runde und die Texte kommen von aussen.

const TON: Record<KuehlErgebnis, Ton> = { ok: "gut", warnung: "warnung", verstoss: "schlecht" };

export function baueAbholauftragDokument(runde: AbholRundeZeile, x: DokumentKontext): DokumentEingabe {
  const t = x.t("dokument.abholauftrag");
  const a = x.t("abholrundenAnsicht");
  const r = x.t("roles");
  const sprache = x.sprache;
  const z = rundenZusammenfassung(runde.stopps);
  const abgeschlossen = runde.status === "abgeschlossen";
  const kg = (v: number | null) => (v === null ? "-" : `${zahlText(v, sprache)} kg`);

  const ergebnisTexte: Record<KuehlErgebnis, string> = { ok: a("ergebnis.ok"), warnung: a("ergebnis.warnung"), verstoss: a("ergebnis.verstoss") };
  const stoppStatus: Record<string, string> = { geplant: a("stoppStatus.geplant"), abgeholt: a("stoppStatus.abgeholt"), entfallen: a("stoppStatus.entfallen") };

  const stoppZeilen: Zelle[][] = runde.stopps.map((s, i) => [
    String(i + 1),
    { html: `${esc(s.nachbarbetrieb)}${s.adresse || s.ort ? `<br><span class="klein">${esc([s.adresse ?? s.ort, s.kontakt].filter(Boolean).join(" · "))}</span>` : ""}` },
    { html: kg(s.mengeGeplantKg), zahl: true },
    s.status === "abgeholt" ? { html: kg(s.mengeIstKg), zahl: true } : { html: "", zahl: true },
    stoppStatus[s.status],
  ]);

  const ergebnisZeilen: Zelle[][] = runde.stopps
    .filter((s) => s.status === "abgeholt")
    .map((s) => [
      s.nachbarbetrieb,
      s.pflueckbeginn ? zeitText(s.pflueckbeginn, sprache) : t("unbekannt"),
      s.abgeholtAm ? zeitText(s.abgeholtAm, sprache) : "-",
      { html: s.minutenBisKuehlung === null ? "-" : String(s.minutenBisKuehlung), zahl: true },
      s.ergebnis ? marke(ergebnisTexte[s.ergebnis], TON[s.ergebnis]) : "-",
    ]);

  const planung = bewertePlanung(runde.abErstemStoppMinuten);
  const planungText =
    planung === null || runde.abErstemStoppMinuten === null
      ? t("planungOffen")
      : planung === "ok"
        ? t("planungOk", { minuten: runde.abErstemStoppMinuten })
        : planung === "warnung"
          ? t("planungKnapp", { minuten: runde.abErstemStoppMinuten })
          : t("planungZuLang", { minuten: runde.abErstemStoppMinuten });

  const abschnitte = [
    { titel: t("abschnittStopps"), html: stoppZeilen.length > 0 ? tabelle([t("col.nr"), t("col.betrieb"), t("col.erwartet"), t("col.abgeholt"), t("col.status")], stoppZeilen, [2, 3]) : leerHinweis(t("keineStopps")) },
    { titel: t("abschnittRegel"), html: absatz(t("regel", { warnung: WARNUNG_AB_MINUTEN, verstoss: VERSTOSS_AB_MINUTEN })) + (abgeschlossen ? "" : absatz(planungText)) },
    ...(abgeschlossen
      ? [
          {
            titel: t("abschnittErgebnis"),
            html:
              ergebnisZeilen.length > 0
                ? tabelle([t("col.betrieb"), t("col.pflueckbeginn"), t("col.abholung"), t("col.minuten"), t("col.ergebnis")], ergebnisZeilen, [3])
                : leerHinweis(t("keineAbholung")),
          },
        ]
      : []),
    ...(z.schlechtestes === "verstoss"
      ? [{ titel: t("abschnittHinweise"), html: kasten(t("verstossTitel"), [t("verstossText", { grenze: VERSTOSS_AB_MINUTEN })], "schlecht") }]
      : []),
  ];

  return versiegeln({
    kennung: kennungFuer("ABHOL", x.jetzt, `${runde.id}|${runde.status}|${runde.stopps.map((s) => `${s.id}:${s.status}:${s.mengeIstKg ?? ""}:${s.pflueckbeginn ?? ""}:${s.abgeholtAm ?? ""}`).join(",")}|${runde.kuehlhausAn ?? ""}`),
    dateiname: dateinameFuer(t("dateiname", { datum: runde.datum }), x.jetzt),
    art: t("art"),
    titel: abgeschlossen ? t("titelNachweis") : t("titel"),
    untertitel: [tagText(runde.datum, sprache), runde.fahrzeug].filter(Boolean).join(" · "),
    erstelltAm: x.jetzt.toISOString(),
    ersteller: x.ersteller,
    meta: [
      { label: t("meta.datum"), wert: tagText(runde.datum, sprache) },
      { label: t("meta.fahrzeug"), wert: runde.fahrzeug ?? "-" },
      { label: t("meta.status"), wert: a(`status.${runde.status}`) },
      { label: t("meta.ankunft"), wert: runde.kuehlhausAn ? zeitText(runde.kuehlhausAn, sprache) : "-" },
    ],
    kennzahlen: [
      { label: t("kennzahl.stopps"), wert: String(runde.stopps.length) },
      { label: t("kennzahl.erwartet"), wert: kg(z.geplantKg) },
      abgeschlossen
        ? { label: t("kennzahl.abgeholt"), wert: kg(z.istKg), ton: z.schlechtestes ? TON[z.schlechtestes] : "neutral" }
        : { label: t("kennzahl.offen"), wert: String(z.offen), ton: z.offen > 0 ? "warnung" : "gut" },
    ],
    zusammenfassung: abgeschlossen ? t("zusammenfassungAbgeschlossen", { abgeholt: z.abgeholt, entfallen: z.entfallen }) : t("zusammenfassungOffen", { anzahl: runde.stopps.length }),
    abschnitte: abschnitte.map((ab) => ({ titel: ab.titel, html: ab.html })),
    freigabe: [t("fahrer"), r("betriebsleitung")],
  });
}
