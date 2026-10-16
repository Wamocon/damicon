import { absatz, definitionen, leerHinweis, marke, tabelle, type DokumentEingabe, type Ton } from "@/lib/dokument/damicon-dokument";
import { dateinameFuer, kennungFuer, tagText, versiegeln, zahlText, zeitText, type DokumentKontext } from "@/lib/dokument/kontext";
import { kuehlketteGesamturteil, type LieferungZeile } from "@/lib/domain/lieferungen";

// Uebergabequittung und Kuehlkette einer Lieferung als Dokument (WMCNL-1517 und Anforderung 3.5): was geliefert wurde, wer es
// entgegengenommen hat und welche Temperaturen unterwegs gemessen wurden, mit Herkunft jedes Werts (Handmessung oder Logger).
// Das Dokument ist auch fuer den Kunden gedacht: er bekommt es fuer seine eigenen Lieferungen.

const ERGEBNIS_TON: Record<string, Ton> = { ok: "gut", warnung: "warnung", verstoss: "schlecht" };

export function baueLieferungDokument(l: LieferungZeile, x: DokumentKontext): DokumentEingabe {
  const t = x.t("dokument.lieferung");
  const a = x.t("lieferungenAnsicht");
  const k = x.t("nachweiskette");
  const r = x.t("roles");
  const urteil = kuehlketteGesamturteil(l);
  const logger = l.transportMessungen.filter((m) => m.quelle === "logger");

  const messungen = l.transportMessungen.map((m) => [
    zeitText(m.gemessenAm, x.sprache),
    `${zahlText(m.temperaturC, x.sprache, 1)} °C`,
    marke(k(`ergebnis.${m.ergebnis}`), ERGEBNIS_TON[m.ergebnis] ?? "neutral"),
    m.quelle === "logger" ? t("quelleLogger") : t("quelleManuell"),
    m.loggerKennung ?? "-",
  ]);

  return versiegeln({
    kennung: kennungFuer("LIEF", x.jetzt, `${l.id}|${l.status}|${l.transportMessungen.map((m) => m.id).join(",")}`),
    dateiname: dateinameFuer(t("dateiname", { kunde: l.kunde }), x.jetzt),
    art: t("art"),
    titel: t("titel"),
    untertitel: l.kunde,
    erstelltAm: x.jetzt.toISOString(),
    ersteller: x.ersteller,
    meta: [
      { label: a("formular.anlegen.kunde"), wert: l.kunde },
      { label: t("charge"), wert: l.chargeCode ?? "-" },
      { label: a("menge"), wert: `${zahlText(l.mengeKg, x.sprache)} kg` },
      { label: a("geliefertAm"), wert: zeitText(l.geliefertAm, x.sprache) },
    ],
    kennzahlen: [
      { label: t("status"), wert: a(`status.${l.status}`), ton: l.status === "zugestellt" ? "gut" : l.status === "storniert" ? "schlecht" : "neutral" },
      { label: t("hoechstwert"), wert: urteil ? `${zahlText(urteil.temperaturC, x.sprache, 1)} °C` : "-", ton: urteil ? (ERGEBNIS_TON[urteil.ergebnis] ?? "neutral") : "neutral" },
      { label: t("messungen"), wert: String(l.transportMessungen.length), ton: "neutral" },
      { label: t("vomLogger"), wert: String(logger.length), ton: "neutral" },
    ],
    zusammenfassung: urteil ? t("zusammenfassungMitUrteil", { urteil: k(`ergebnis.${urteil.ergebnis}`) }) : t("zusammenfassungOhneUrteil"),
    abschnitte: [
      { titel: t("abschnittLieferung"), html: definitionen([
        { label: a("formular.anlegen.kunde"), wert: l.kunde },
        { label: t("charge"), wert: l.chargeCode ?? "-" },
        { label: a("menge"), wert: `${zahlText(l.mengeKg, x.sprache)} kg` },
        ...(l.bestellteMengeKg !== null ? [{ label: a("bestellt"), wert: `${zahlText(l.bestellteMengeKg, x.sprache)} kg` }] : []),
        { label: t("status"), wert: a(`status.${l.status}`) },
      ]) },
      { titel: t("abschnittUebergabe"), html: l.status === "zugestellt" ? definitionen([
        { label: a("geliefertAm"), wert: zeitText(l.geliefertAm, x.sprache) },
        { label: a("empfaengerName"), wert: l.empfaengerName ?? "-" },
        { label: t("tag"), wert: tagText(l.geliefertAm, x.sprache) },
      ]) : leerHinweis(t("nochNichtUebergeben")) },
      { titel: t("abschnittKuehlkette"), html: l.transportMessungen.length > 0
        ? tabelle([t("zeitpunkt"), t("temperatur"), t("bewertung"), t("herkunft"), t("kennung")], messungen) + absatz(t("regel"), "klein")
        : leerHinweis(t("keineMessungen")) },
    ],
    freigabe: [r("betriebsleitung"), t("empfaenger")],
  });
}
