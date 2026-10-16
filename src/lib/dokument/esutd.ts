import { absatz, esc, leerHinweis, marke, tabelle, type DokumentEingabe } from "@/lib/dokument/damicon-dokument";
import { dateinameFuer, kennungFuer, tagText, versiegeln, type DokumentKontext } from "@/lib/dokument/kontext";
import { esutdTon, meldungUeberfaellig, zaehleMeldungen, type EsutdMeldung } from "@/lib/domain/esutd";
import { uebersetztOderNull } from "@/lib/i18n-daten";

// Meldeliste fuer das Einheitssystem ЕСУТД als Dokument (WMCNL-1447): wer ist zu melden, was ist gemeldet, womit belegt.
// Die CSV-Datei bleibt fuer die Eingabe im staatlichen System, das Dokument ist die Fassung zum Weitergeben und Ablegen.

export interface EsutdDokumentDaten {
  meldungen: EsutdMeldung[];
  nurOffene: boolean;
  /** Tag in Almaty, "JJJJ-MM-TT": gegen ihn wird die Frist geprueft. */
  heute: string;
  /** Name des verlinkten Belegs je Dokument-ID. */
  belegNamen: Map<string, string>;
}

export function baueEsutdDokument(d: EsutdDokumentDaten, x: DokumentKontext): DokumentEingabe {
  const text = (m: EsutdMeldung, spalte: "beschreibung" | "bestaetigung") => uebersetztOderNull(m.i18n, spalte, x.sprache, m[spalte]);
  const t = x.t("dokument.esutd");
  const a = x.t("esutdAnsicht");
  const r = x.t("roles");
  const z = zaehleMeldungen(d.meldungen, d.heute);
  const liste = d.nurOffene ? d.meldungen.filter((m) => m.status === "offen") : d.meldungen;
  const tag = (iso: string | null) => tagText(iso, x.sprache);

  const zeilen = liste.map((m) => {
    const person = [
      `<strong>${esc(m.pfluecker ?? a("liste.ohneName"))}</strong>`,
      ...[m.ausweis ? a("liste.ausweis", { ausweis: m.ausweis }) : null, m.vertragsnummer ? a("liste.vertrag", { nummer: m.vertragsnummer }) : null, text(m, "beschreibung")]
        .filter((s): s is string => Boolean(s))
        .map((s) => `<span class="klein">${esc(s)}</span>`),
    ].join("<br>");
    const frist = m.meldefristAm
      ? { html: `${esc(a("liste.fristBis", { datum: tag(m.meldefristAm) }))}${meldungUeberfaellig(m, d.heute) ? `<br>${marke(a("liste.ueberfaellig"), "schlecht").html}` : ""}` }
      : m.status === "offen"
        ? { html: `<span class="klein">${esc(a("liste.keineFrist"))}</span>` }
        : "-";
    const belegName = m.belegDokumentId ? d.belegNamen.get(m.belegDokumentId) : undefined;
    const bestaetigung = text(m, "bestaetigung");
    const statusZeilen =
      m.status === "erfasst"
        ? [a("liste.erfasstAm", { datum: tag(m.erfasstAm) }), bestaetigung ? a("liste.bestaetigung", { nummer: bestaetigung }) : null, belegName ? a("liste.beleg", { name: belegName }) : a("liste.keinBeleg")]
            .filter((s): s is string => Boolean(s))
            .map((s) => `<br><span class="klein">${esc(s)}</span>`)
            .join("")
        : "";
    return [
      { html: person },
      a(`art.${m.art}`),
      tag(m.ereignisAm),
      frist,
      { html: `${marke(a(`status.${m.status}`), esutdTon[m.status] === "success" ? "gut" : "warnung").html}${statusZeilen}` },
    ];
  });

  const titel = t("titel");
  return versiegeln({
    kennung: kennungFuer("ESUTD", x.jetzt, `${d.nurOffene}|${d.heute}|${liste.map((m) => m.id).join(",")}`),
    dateiname: dateinameFuer(t("dateiname"), x.jetzt),
    art: t("art"),
    titel,
    untertitel: d.nurOffene ? t("untertitelOffen") : t("untertitelAlle"),
    erstelltAm: x.jetzt.toISOString(),
    ersteller: x.ersteller,
    meta: [
      { label: t("stand"), wert: tag(d.heute) },
      { label: t("umfang"), wert: t("umfangWert", { anzahl: liste.length }) },
    ],
    kennzahlen: [
      { label: a("zaehl.offen"), wert: String(z.offen), ton: z.offen > 0 ? "warnung" : "gut" },
      { label: a("zaehl.ueberfaellig"), wert: String(z.ueberfaellig), ton: z.ueberfaellig > 0 ? "schlecht" : "gut" },
      { label: a("zaehl.erfasst"), wert: String(z.erfasst), ton: "gut" },
    ],
    zusammenfassung: t("zusammenfassung"),
    abschnitte: [
      { titel: t("abschnittMeldungen"), html: zeilen.length > 0 ? tabelle([a("liste.col.person"), a("liste.col.art"), a("liste.col.datum"), a("liste.col.frist"), a("liste.col.status")], zeilen) : leerHinweis(t("leer")) },
      { titel: t("abschnittHinweise"), html: absatz(a("stufeHinweis")) + absatz(t("personenbezug")) },
    ],
    freigabe: [r("betriebsleitung"), r("ceo")],
    hinweise: [t("keinAmtlichesFormat")],
  });
}
