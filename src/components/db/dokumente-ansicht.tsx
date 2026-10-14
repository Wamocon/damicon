import { getFormatter, getTranslations } from "next-intl/server";
import { Download } from "lucide-react";
import { Aufklapper, Card, DataTable, Section, StatusPill } from "@/components/ui/kit";
import { DatenquelleBadge } from "@/components/db/datenquelle-badge";
import { DokumentAendernFormular, DokumentFormular } from "@/components/db/dokumente-formular";
import { ladeDokumente, ladeNachweisOptionen, type DokumentZeile } from "@/lib/data/dokumente";
import { ladeDossierOptionen } from "@/lib/data/foerdermittel";
import { NACHWEIS_STATUS, nachweisTon, nachweisZaehlung } from "@/lib/domain/nachweise";
import { getSessionProfile } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";

// Nachweisregister (Meilenstein B, WMCNL-1469): Zertifikate, Vertraege,
// Genehmigungen und Protokolle mit Gueltigkeitszeitraum. Der Status
// (gueltig, laeuft ab, abgelaufen, offen) wird aus dem Zeitraum berechnet und
// nicht gesetzt. Dateien liegen im privaten Bucket "dokumente" und werden ueber
// kurzlebige signierte Links ausgeliefert - kein oeffentlicher Direktzugriff.

type Format = Awaited<ReturnType<typeof getFormatter>>;
type Uebersetzer = Awaited<ReturnType<typeof getTranslations>>;

/** Das Ende der Gueltigkeit mit dem Abstand zu heute: "12.10.2026" und "in 5 Tagen". */
function GueltigBisZelle({ doc, format, t }: { doc: DokumentZeile; format: Format; t: Uebersetzer }) {
  if (doc.unbefristet) return <span className="text-muted-foreground">{t("unbefristet")}</span>;
  if (!doc.gueltigBis || doc.tageBisAblauf === null) {
    return <span className="text-xs text-muted-foreground">{t("keinZeitraum")}</span>;
  }
  const tage = doc.tageBisAblauf;
  return (
    <div>
      <p className="text-foreground">{format.dateTime(new Date(`${doc.gueltigBis}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" })}</p>
      <p className="text-[11px] text-muted-foreground">
        {tage < 0 ? t("vorTagen", { tage: -tage }) : tage === 0 ? t("heute") : t("inTagen", { tage })}
      </p>
    </div>
  );
}

function DateiZelle({ doc, oeffnen, keineDatei, keinLink }: { doc: DokumentZeile; oeffnen: string; keineDatei: string; keinLink: string }) {
  if (doc.dateiUrl) {
    return (
      <a
        href={doc.dateiUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
      >
        <Download className="h-3.5 w-3.5" />
        {oeffnen}
      </a>
    );
  }
  return <span className="text-xs text-muted-foreground">{doc.hatDatei ? keinLink : keineDatei}</span>;
}

/** Name mit Rechtsgrundlage darunter, Bezug mit Partner darunter: die Zeile bleibt schmal. */
function Zusatz({ text }: { text: string | null }) {
  return text ? <p className="text-[11px] text-muted-foreground">{text}</p> : null;
}

export async function DokumenteAnsicht() {
  const [liste, profil, t, dossiers] = await Promise.all([
    ladeDokumente(),
    getSessionProfile(),
    getTranslations("dokumenteDemo"),
    // Anforderung 4.12: Auswahl, an welches Foerderdossier der Nachweis haengt.
    ladeDossierOptionen(),
  ]);
  const [k, v, n, format] = await Promise.all([
    getTranslations("dokumentKategorie"),
    getTranslations("dokumenteVerwaltung"),
    getTranslations("nachweisregister"),
    getFormatter(),
  ]);

  const live = liste.quelle === "db";
  const darfAnlegen = live && hasPermission(profil?.role, "dokumente", "create");
  const darfAendern = live && hasPermission(profil?.role, "dokumente", "update");
  const optionen = darfAnlegen || darfAendern ? await ladeNachweisOptionen() : { verantwortliche: [], partner: [] };
  const zaehlung = nachweisZaehlung(liste.dokumente.map((d) => d.nachweisStatus));

  return (
    <div className="space-y-6">
      <Section title={t("listTitle")} description={t("listLead")} action={<DatenquelleBadge quelle={liste.quelle} />}>
        <div className="mb-3 flex flex-wrap gap-1.5" aria-label={n("zaehlung")}>
          {NACHWEIS_STATUS.filter((s) => zaehlung[s] > 0).map((s) => (
            <StatusPill key={s} tone={nachweisTon[s]}>
              {zaehlung[s]} {n(`status.${s}`)}
            </StatusPill>
          ))}
        </div>
        <DataTable
          head={[
            t("col.name"),
            t("col.kategorie"),
            t("col.bezug"),
            n("col.gueltigBis"),
            t("col.status"),
            n("col.verantwortlich"),
            v("col.datei"),
            ...(darfAendern ? [v("col.aendern")] : []),
          ]}
        >
          {liste.dokumente.map((doc) => (
            <tr key={doc.id}>
              <td className="px-3 py-2.5">
                <p className="font-semibold text-foreground">{doc.name}</p>
                <Zusatz text={doc.rechtsgrundlage} />
              </td>
              <td className="px-3 py-2.5 text-muted-foreground">{k(doc.kategorie)}</td>
              <td className="px-3 py-2.5 text-muted-foreground">
                {doc.bezug}
                <Zusatz text={doc.partner} />
              </td>
              <td className="px-3 py-2.5">
                <GueltigBisZelle doc={doc} format={format} t={n} />
              </td>
              <td className="px-3 py-2.5">
                <StatusPill tone={nachweisTon[doc.nachweisStatus]}>{n(`status.${doc.nachweisStatus}`)}</StatusPill>
              </td>
              <td className="px-3 py-2.5 text-muted-foreground">{doc.verantwortlich ?? "-"}</td>
              <td className="px-3 py-2.5">
                <DateiZelle doc={doc} oeffnen={v("oeffnen")} keineDatei={v("keineDatei")} keinLink={v("linkNichtVerfuegbar")} />
              </td>
              {darfAendern ? (
                <td className="px-3 py-2.5">
                  <Aufklapper titel={n("bearbeiten")}>
                    <div className="p-3">
                      <DokumentAendernFormular dokument={doc} optionen={optionen} />
                    </div>
                  </Aufklapper>
                </td>
              ) : null}
            </tr>
          ))}
        </DataTable>
      </Section>

      {darfAnlegen ? <DokumentFormular dossiers={dossiers} optionen={optionen} /> : null}

      <Card className="bg-muted/30 text-xs leading-5 text-muted-foreground">{t("note")}</Card>
    </div>
  );
}
