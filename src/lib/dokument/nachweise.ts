import { absatz, esc, leerHinweis, marke, tabelle, type DokumentEingabe, type Ton } from "@/lib/dokument/damicon-dokument";
import { dateinameFuer, kennungFuer, tagText, versiegeln, type DokumentKontext } from "@/lib/dokument/kontext";
import { NACHWEIS_STATUS, nachweisZaehlung, type NachweisStatus } from "@/lib/domain/nachweise";

// Nachweisregister als Dokument (WMCNL-1469): Zertifikate, Genehmigungen, Vertraege und Protokolle mit Gueltigkeit und
// Ablaufstatus, zum Weitergeben an Pruefer, Handel und Behoerden. Der Status folgt aus dem Zeitraum, er ist nicht von Hand gesetzt.

export interface NachweisZeile {
  id: string;
  name: string;
  kategorie: string;
  bezug: string;
  gueltigVon: string | null;
  gueltigBis: string | null;
  unbefristet: boolean;
  nachweisStatus: NachweisStatus;
  tageBisAblauf: number | null;
  verantwortlich: string | null;
  rechtsgrundlage: string | null;
  partner: string | null;
}

const TON: Record<NachweisStatus, Ton> = { gueltig: "gut", laeuft_ab: "warnung", abgelaufen: "schlecht", offen: "neutral" };

/** Reihenfolge: abgelaufen, laeuft ab, offen, gueltig; darin das naechste Ende zuerst. */
const RANG: Record<NachweisStatus, number> = { abgelaufen: 0, laeuft_ab: 1, offen: 2, gueltig: 3 };

export function baueNachweiseDokument(zeilen: NachweisZeile[], heute: string, x: DokumentKontext): DokumentEingabe {
  const t = x.t("dokument.nachweise");
  const n = x.t("nachweisregister");
  const k = x.t("dokumentKategorie");
  const d = x.t("dokumenteDemo");
  const v = x.t("dokumenteVerwaltung");
  const r = x.t("roles");
  const tag = (iso: string | null) => tagText(iso, x.sprache);
  const z = nachweisZaehlung(zeilen.map((s) => s.nachweisStatus));

  const sortiert = [...zeilen].sort((a, b) => RANG[a.nachweisStatus] - RANG[b.nachweisStatus] || (a.gueltigBis ?? "9999").localeCompare(b.gueltigBis ?? "9999") || a.name.localeCompare(b.name));
  const reihen = sortiert.map((s) => {
    const name = `<strong>${esc(s.name)}</strong>${s.rechtsgrundlage ? `<br><span class="klein">${esc(s.rechtsgrundlage)}</span>` : ""}`;
    const gueltigBis = s.unbefristet
      ? n("unbefristet")
      : s.gueltigBis
        ? `${tag(s.gueltigBis)}${s.tageBisAblauf === null ? "" : s.tageBisAblauf < 0 ? ` (${n("vorTagen", { tage: -s.tageBisAblauf })})` : s.tageBisAblauf === 0 ? ` (${n("heute")})` : ` (${n("inTagen", { tage: s.tageBisAblauf })})`}`
        : n("keinZeitraum");
    return [{ html: name }, k(s.kategorie), s.bezug || "-", gueltigBis, marke(n(`status.${s.nachweisStatus}`), TON[s.nachweisStatus]), s.verantwortlich ?? "-"];
  });

  return versiegeln({
    kennung: kennungFuer("NACHW", x.jetzt, `${heute}|${zeilen.map((s) => `${s.id}:${s.nachweisStatus}:${s.gueltigBis ?? ""}`).join(",")}`),
    dateiname: dateinameFuer(t("dateiname"), x.jetzt),
    art: t("art"),
    titel: t("titel"),
    untertitel: t("untertitel"),
    erstelltAm: x.jetzt.toISOString(),
    ersteller: x.ersteller,
    meta: [
      { label: t("stand"), wert: tag(heute) },
      { label: t("umfang"), wert: t("umfangWert", { anzahl: zeilen.length }) },
    ],
    kennzahlen: NACHWEIS_STATUS.map((s) => ({ label: n(`status.${s}`), wert: String(z[s]), ton: TON[s] })),
    zusammenfassung: t("zusammenfassung"),
    abschnitte: [
      { titel: t("abschnittRegister"), html: reihen.length > 0 ? tabelle([d("col.name"), d("col.kategorie"), d("col.bezug"), n("col.gueltigBis"), d("col.status"), v("feld.verantwortlich")], reihen) : leerHinweis(t("leer")) },
      { titel: t("abschnittHinweise"), html: absatz(t("regelStatus")) + absatz(t("regelOffen")) },
    ],
    freigabe: [r("betriebsleitung"), r("buchhaltung")],
  });
}
