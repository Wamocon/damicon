import { absatz, definitionen, esc, kasten, leerHinweis, marke, tabelle, type DokumentEingabe, type Ton } from "@/lib/dokument/damicon-dokument";
import { dateinameFuer, kennungFuer, tagText, tengeText, versiegeln, zahlText, type DokumentKontext } from "@/lib/dokument/kontext";
import { zaehleBelege, type EsfStatus } from "@/lib/domain/esf";
import type { EsfBelegZeile, EsfUebersicht } from "@/lib/data/esf";

// Belegregister und einzelner Beleg der elektronischen Rechnung (ЭСФ) als Dokument (WMCNL-1440). Das Dokument ersetzt die
// ЭСФ nicht: ausgestellt wird sie im staatlichen Portal. Es haelt die Angaben dafuer und den Stand des Belegs fest.

const STATUS_TON: Record<EsfStatus, Ton> = { entwurf: "neutral", ausgestellt: "neutral", bestaetigt: "gut", abgelehnt: "schlecht", papier: "warnung" };

export function baueEsfRegisterDokument(u: EsfUebersicht, x: DokumentKontext): DokumentEingabe {
  const t = x.t("dokument.esf");
  const a = x.t("esfAnsicht");
  const r = x.t("roles");
  const tag = (iso: string | null) => tagText(iso, x.sprache);
  const z = zaehleBelege(u.offen.length, u.belege.map((b) => b.status));

  const offen = u.offen.map((l) => [
    l.kunde,
    tag(l.geliefertAm),
    `${zahlText(l.mengeKg, x.sprache)} kg`,
    l.tageSeitLieferung <= 0 ? a("offen.heute") : a("offen.tage", { tage: l.tageSeitLieferung }),
    l.belegStatus ? marke(a(`status.${l.belegStatus}`), STATUS_TON[l.belegStatus]) : a("offen.keinBeleg"),
  ]);
  const belege = u.belege.map((b) => [
    b.kunde,
    tag(b.geliefertAm),
    b.mengeKg === null ? "-" : `${zahlText(b.mengeKg, x.sprache)} kg`,
    marke(a(`status.${b.status}`), STATUS_TON[b.status]),
    [b.esfNummer, b.ausgestelltAm ? a("ausgestelltAm", { datum: tag(b.ausgestelltAm) }) : null, b.bestaetigtAm ? a("bestaetigtAm", { datum: tag(b.bestaetigtAm) }) : null].filter(Boolean).join(", ") || "-",
  ]);

  return versiegeln({
    kennung: kennungFuer("ESF", x.jetzt, `register|${u.offen.map((o) => o.lieferungId).join(",")}|${u.belege.map((b) => `${b.id}:${b.status}`).join(",")}`),
    dateiname: dateinameFuer(t("dateinameRegister"), x.jetzt),
    art: t("art"),
    titel: t("titelRegister"),
    untertitel: t("untertitelRegister"),
    erstelltAm: x.jetzt.toISOString(),
    ersteller: x.ersteller,
    meta: [{ label: t("umfang"), wert: t("umfangWert", { offen: u.offen.length, belege: u.belege.length }) }],
    kennzahlen: [
      { label: a("zaehlOffen"), wert: String(z.offen), ton: z.offen > 0 ? "warnung" : "gut" },
      { label: a("status.ausgestellt"), wert: String(z.ausgestellt), ton: "neutral" },
      { label: a("status.bestaetigt"), wert: String(z.bestaetigt), ton: "gut" },
      { label: a("status.abgelehnt"), wert: String(z.abgelehnt), ton: z.abgelehnt > 0 ? "schlecht" : "gut" },
    ],
    zusammenfassung: t("zusammenfassungRegister"),
    abschnitte: [
      { titel: a("offen.titel"), html: u.offen.length > 0 ? tabelle([a("offen.col.kunde"), a("offen.col.geliefertAm"), a("offen.col.menge"), a("offen.col.alter"), a("offen.col.beleg")], offen) : leerHinweis(a("offen.leer")) },
      { titel: a("belege.titel"), html: u.belege.length > 0 ? tabelle([a("offen.col.kunde"), a("offen.col.geliefertAm"), a("offen.col.menge"), t("status"), t("nummerDaten")], belege) : leerHinweis(a("belege.leer")) },
      { titel: t("abschnittHinweise"), html: absatz(a("stufeHinweis")) + absatz(t("keinErsatz")) },
    ],
    freigabe: [r("buchhaltung"), r("ceo")],
  });
}

export function baueEsfBelegDokument(b: EsfBelegZeile, x: DokumentKontext): DokumentEingabe {
  const t = x.t("dokument.esf");
  const a = x.t("esfAnsicht");
  const r = x.t("roles");
  const tag = (iso: string | null) => tagText(iso, x.sprache);
  const e = b.entwurf;
  const fehlt = { html: `<span style="color:#b23a3a">${esc(a("entwurf.fehlt"))}</span>` };

  const angaben = e
    ? definitionen([
        { label: a("entwurf.stichtag"), wert: tag(e.stichtag) },
        { label: a("entwurf.kaeufer"), wert: e.kunde.name },
        { label: a("entwurf.identifikationsnummer"), wert: e.kunde.identifikationsnummer ?? fehlt },
        { label: a("entwurf.sorte"), wert: e.ware.sorte ?? fehlt },
        ...(e.ware.chargeCode ? [{ label: a("entwurf.charge"), wert: e.ware.chargeCode }] : []),
        { label: a("entwurf.menge"), wert: `${zahlText(e.ware.mengeKg, x.sprache)} kg` },
        { label: a("entwurf.preis"), wert: e.ware.preisTengeKg === null ? fehlt : `${zahlText(e.ware.preisTengeKg, x.sprache)} ₸/kg` },
        { label: a("entwurf.betrag"), wert: e.ware.betragTenge === null ? fehlt : tengeText(e.ware.betragTenge, x.sprache) },
        ...(e.mwst.registriert
          ? [
              { label: a("entwurf.mwst", { prozent: e.mwst.prozent ?? "-" }), wert: e.mwst.betragTenge === null ? fehlt : tengeText(e.mwst.betragTenge, x.sprache) },
              { label: a("entwurf.gesamt"), wert: e.mwst.gesamtTenge === null ? fehlt : tengeText(e.mwst.gesamtTenge, x.sprache) },
            ]
          : []),
      ])
    : leerHinweis(a("entwurf.unlesbar"));

  const stand = definitionen([
    { label: t("status"), wert: marke(a(`status.${b.status}`), STATUS_TON[b.status]) },
    { label: a("aktion.ausgestellt.nummer"), wert: b.esfNummer ?? "-" },
    { label: a("aktion.ausgestellt.datum"), wert: tag(b.ausgestelltAm) },
    { label: a("aktion.bestaetigt.datum"), wert: tag(b.bestaetigtAm) },
    { label: t("bemerkung"), wert: b.bemerkung ?? "-" },
  ]);

  const hinweise: string[] = [];
  if (e && !e.mwst.registriert) hinweise.push(a("entwurf.nichtRegistriert"));
  if (e?.mwst.registriert) hinweise.push(a(e.mwst.annahme === "brutto" ? "entwurf.annahmeBrutto" : "entwurf.annahme"));
  const luecken = e && e.luecken.length > 0 ? kasten(a("entwurf.lueckenTitel"), e.luecken.map((l) => a(`luecke.${l}`)), "warnung") : "";

  return versiegeln({
    kennung: kennungFuer("ESF", x.jetzt, `beleg|${b.id}|${b.status}|${b.esfNummer ?? ""}`),
    dateiname: dateinameFuer(t("dateinameBeleg", { kunde: b.kunde }), x.jetzt),
    art: t("art"),
    titel: t("titelBeleg"),
    untertitel: b.kunde,
    erstelltAm: x.jetzt.toISOString(),
    ersteller: x.ersteller,
    meta: [
      { label: a("offen.col.kunde"), wert: b.kunde },
      { label: a("offen.col.geliefertAm"), wert: tag(b.geliefertAm) },
      { label: a("offen.col.menge"), wert: b.mengeKg === null ? "-" : `${zahlText(b.mengeKg, x.sprache)} kg` },
    ],
    kennzahlen: [
      { label: t("status"), wert: a(`status.${b.status}`), ton: STATUS_TON[b.status] },
      ...(e?.ware.betragTenge !== null && e ? [{ label: e.mwst.registriert ? a("entwurf.gesamt") : a("entwurf.betrag"), wert: tengeText(e.mwst.registriert ? e.mwst.gesamtTenge : e.ware.betragTenge, x.sprache), ton: "neutral" as Ton }] : []),
    ],
    zusammenfassung: t("zusammenfassungBeleg"),
    abschnitte: [
      { titel: a("entwurf.titel"), html: angaben + luecken },
      { titel: t("abschnittStand"), html: stand },
      { titel: t("abschnittHinweise"), html: absatz(t("keinErsatz")) },
    ],
    freigabe: [r("buchhaltung"), r("ceo")],
    hinweise,
  });
}
