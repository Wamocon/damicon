import { absatz, leerHinweis, marke, tabelle, type DokumentEingabe } from "@/lib/dokument/damicon-dokument";
import { dateinameFuer, kennungFuer, tagText, versiegeln, zahlText, type DokumentKontext } from "@/lib/dokument/kontext";
import { lieferplanEintraege, type LieferplanQuelle } from "@/lib/domain/lieferplan";

// Lieferplan als Dokument (WMCNL-1472): die kommenden Liefertermine auf einem Blatt, daneben die Kalenderdatei (ICS). Dieselben
// Quellen und Regeln wie die Kalenderdatei: fest eingeplante Lieferungen auf einer Tour und Vorbestellungen mit Wunschtermin,
// ohne Doppelungen. Der Kunde bekommt nur seine eigenen Termine (Zeilensicherheit), das Buero alle.

interface Zeile {
  datum: string;
  art: "lieferung" | "vorbestellung";
  status: string;
  kunde: string | null;
  sorte: string | null;
  mengeKg: number;
}

export function lieferplanZeilen(q: LieferplanQuelle, heute: string): Zeile[] {
  // Dieselbe Regel wie die Kalenderdatei (domain/lieferplan.ts): Statusfilter, Tour vor Wunschtermin, nichts Vergangenes.
  return lieferplanEintraege(q, heute)
    .map((e): Zeile => ({ datum: e.tag, art: e.art, status: e.status, kunde: e.kunde, sorte: e.sorte, mengeKg: e.mengeKg }))
    .sort((a, b) => a.datum.localeCompare(b.datum) || (a.kunde ?? "").localeCompare(b.kunde ?? ""));
}

export function baueLieferplanDokument(q: LieferplanQuelle, heute: string, zeigeKunde: boolean, x: DokumentKontext): DokumentEingabe {
  const t = x.t("dokument.lieferplan");
  const p = x.t("lieferplan");
  const r = x.t("roles");
  const zeilen = lieferplanZeilen(q, heute);
  const menge = zeilen.reduce((s, z) => s + z.mengeKg, 0);
  const fest = zeilen.filter((z) => z.art === "lieferung").length;

  const reihen = zeilen.map((z) => [
    tagText(z.datum, x.sprache),
    z.art === "lieferung" ? marke(p("lieferungGeplant"), "gut") : marke(p(`status.${z.status === "bestaetigt" ? "bestaetigt" : "angefragt"}`), z.status === "bestaetigt" ? "gut" : "warnung"),
    ...(zeigeKunde ? [z.kunde ?? "-"] : []),
    z.sorte ?? p("ohneSorte"),
    `${zahlText(z.mengeKg, x.sprache)} kg`,
  ]);

  return versiegeln({
    kennung: kennungFuer("PLAN", x.jetzt, `${heute}|${zeigeKunde}|${zeilen.map((z) => `${z.datum}:${z.art}:${z.mengeKg}`).join(",")}`),
    dateiname: dateinameFuer(t("dateiname"), x.jetzt),
    art: t("art"),
    titel: t("titel"),
    untertitel: t("untertitel", { datum: tagText(heute, x.sprache) }),
    erstelltAm: x.jetzt.toISOString(),
    ersteller: x.ersteller,
    meta: [{ label: t("stand"), wert: tagText(heute, x.sprache) }],
    kennzahlen: [
      { label: t("termine"), wert: String(zeilen.length), ton: "neutral" },
      { label: t("fest"), wert: String(fest), ton: "gut" },
      { label: t("wunsch"), wert: String(zeilen.length - fest), ton: zeilen.length - fest > 0 ? "warnung" : "gut" },
      { label: t("menge"), wert: `${zahlText(menge, x.sprache, 0)} kg`, ton: "neutral" },
    ],
    zusammenfassung: t("zusammenfassung"),
    abschnitte: [
      { titel: t("abschnittTermine"), html: reihen.length > 0 ? tabelle([t("datum"), t("artSpalte"), ...(zeigeKunde ? [t("kunde")] : []), t("sorte"), t("menge")], reihen) : leerHinweis(t("leer")) },
      { titel: t("abschnittHinweise"), html: absatz(t("regel")) },
    ],
    freigabe: zeigeKunde ? [r("betriebsleitung")] : undefined,
  });
}
