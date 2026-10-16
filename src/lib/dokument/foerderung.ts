import { absatz, definitionen, leerHinweis, marke, tabelle, type DokumentEingabe } from "@/lib/dokument/damicon-dokument";
import { dateinameFuer, kennungFuer, tagText, versiegeln, type DokumentKontext } from "@/lib/dokument/kontext";
import { checklistenStand, fortschrittProzent, sortiereCheckpunkte, type Checkpunkt } from "@/lib/domain/foerder-checkliste";
import type { FoerderdossierZeile } from "@/lib/domain/foerdermittel";

// Checkliste eines Foerderdossiers als Dokument (WMCNL-1448): was der Antrag braucht, was erledigt ist, was ueberfaellig ist.
// Welche Unterlagen ein Antrag verlangt, legt die Foerderstelle fest. Die Checkliste ist kein amtlicher Katalog.

export interface FoerderDokumentDaten {
  dossier: FoerderdossierZeile;
  punkte: Checkpunkt[];
  heute: string;
}

export function baueFoerderDokument(d: FoerderDokumentDaten, x: DokumentKontext): DokumentEingabe {
  const t = x.t("dokument.foerderung");
  const c = x.t("foerdermittelCheckliste");
  const f = x.t("foerdermittelAnsicht");
  const r = x.t("roles");
  const tag = (iso: string | null) => tagText(iso, x.sprache);
  const punkte = sortiereCheckpunkte(d.punkte);
  const stand = checklistenStand(punkte, d.heute);

  const zeilen = punkte.map((p) => {
    const erledigt = p.erledigtAm !== null;
    const ueberfaellig = !erledigt && p.fristAm !== null && p.fristAm < d.heute;
    return [
      p.vorlageKey ? c(`vorlage.${p.vorlageKey}`) : p.bezeichnung,
      p.pflicht ? t("pflicht") : c("freiwillig"),
      p.fristAm ? { html: `${tag(p.fristAm)}${ueberfaellig ? ` ${marke(t("ueberfaellig"), "schlecht").html}` : ""}` } : "-",
      erledigt ? marke(c("erledigtAm", { datum: tag(p.erledigtAm) }), "gut") : marke(t("offen"), "warnung"),
    ];
  });

  return versiegeln({
    kennung: kennungFuer("FOERD", x.jetzt, `${d.dossier.id}|${d.heute}|${punkte.map((p) => `${p.id}:${p.erledigtAm ?? ""}`).join(",")}`),
    dateiname: dateinameFuer(t("dateiname", { titel: d.dossier.titel }), x.jetzt),
    art: t("art"),
    titel: t("titel"),
    untertitel: d.dossier.titel,
    erstelltAm: x.jetzt.toISOString(),
    ersteller: x.ersteller,
    meta: [
      { label: f("col.portal"), wert: d.dossier.portal },
      { label: t("antragsnummer"), wert: d.dossier.antragsnummer ?? "-" },
      { label: f("col.status"), wert: f(`status.${d.dossier.status}`) },
      { label: f("col.fristAm"), wert: tag(d.dossier.fristAm) },
    ],
    kennzahlen: [
      { label: t("fortschritt"), wert: `${fortschrittProzent(stand)} %`, ton: stand.vollstaendig ? "gut" : "neutral" },
      { label: t("pflichtOffen"), wert: String(stand.pflichtOffen), ton: stand.pflichtOffen > 0 ? "warnung" : "gut" },
      { label: t("ueberfaellig"), wert: String(stand.ueberfaellig), ton: stand.ueberfaellig > 0 ? "schlecht" : "gut" },
    ],
    zusammenfassung: c("fortschritt", { erledigt: stand.erledigt, gesamt: stand.gesamt, prozent: fortschrittProzent(stand) }),
    abschnitte: [
      { titel: t("abschnittDossier"), html: definitionen([
        { label: f("col.titel"), wert: d.dossier.titel },
        { label: f("col.portal"), wert: d.dossier.portal },
        { label: f("col.eingereichtAm"), wert: tag(d.dossier.eingereichtAm) },
        { label: t("notizen"), wert: d.dossier.notizen ?? "-" },
      ]) },
      { titel: t("abschnittPunkte"), html: zeilen.length > 0 ? tabelle([t("punkt"), t("verbindlichkeit"), f("col.fristAm"), f("col.status")], zeilen) : leerHinweis(c("leer")) },
      { titel: t("abschnittHinweise"), html: absatz(c("lead")) },
    ],
    freigabe: [r("betriebsleitung"), r("buchhaltung")],
  });
}
