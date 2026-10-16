import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Card, DataTable, Section } from "@/components/ui/kit";
import { DatenquelleBadge } from "@/components/db/datenquelle-badge";
import { WetterAktualisierenFormular } from "@/components/db/wetter-formulare";
import { WaermeVerlauf } from "@/components/db/wetter-diagramm";
import { ladeWetterUebersicht, type WetterUebersicht } from "@/lib/data/wetter";
import { getSessionProfile } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { LeererZustand } from "@/components/ui/liste";
import { heuteIso } from "@/lib/data/util";
import { kalendertag } from "@/lib/format/datum";
import {
  GDD_BASIS_TEMPERATUR_C,
  WETTER_BREITENGRAD,
  WETTER_LAENGENGRAD,
  gddBeitrag,
  summeBis,
  tagesMittel,
  waermeStand,
  type WaermeStand,
  type WetterTag,
} from "@/lib/domain/wetter";

// Wetteranbindung mit Temperatursummen-Heuristik (Anforderung 2.13). Reine Beobachtungsgroesse fuer die Mengenprognose, kein Prognosemodell, siehe
// domain/wetter.ts.
//
// Die Seite erklaert die Zahl, statt sie nur zu zeigen (Rueckmeldung vom 16.10.2026: "3.161 °C-Tage" war nicht zu verstehen). Sie nennt die Einheit
// (Gradtage, keine Temperatur), rechnet die Zahl am letzten Tag vor, sagt, warum sie gross ist (sie waechst ueber rund dreihundert Tage), zeigt den Verlauf
// und ordnet sie mit der ersten Ernte des Jahres ein. Eine Vorhersage der Erntemenge ist sie nicht, und die Seite sagt das.

type Uebersetzer = Awaited<ReturnType<typeof getTranslations>>;
type Format = Awaited<ReturnType<typeof getFormatter>>;

/** Texte und Formate, die alle Abschnitte teilen. */
interface Anzeige {
  t: Uebersetzer;
  zahl: (n: number, stellen?: number) => string;
  /** Mit Vorzeichen: +9,5 oder 0. */
  beitrag: (n: number) => string;
  tag: (iso: string) => string;
}

function anzeigeFuer(t: Uebersetzer, format: Format): Anzeige {
  const zahl = (n: number, stellen = 1) => format.number(n, { maximumFractionDigits: stellen });
  return { t, zahl, beitrag: (n) => (n > 0 ? `+${zahl(n)}` : zahl(n)), tag: (iso) => kalendertag(format, iso) };
}

/** Die Zahl, ihre Einheit und was sie gerade tut: gestern, letzte Woche, im Durchschnitt. */
function WaermeKarte({ a, stand, start }: { a: Anzeige; stand: WaermeStand; start: string }) {
  const { t, zahl, beitrag, tag } = a;
  const werte = [
    { schluessel: "letzterTag", label: t("stat.letzterTag"), wert: beitrag(stand.letzterTag.beitrag) },
    { schluessel: "siebenTage", label: t("stat.siebenTage"), wert: beitrag(stand.siebenTage) },
    { schluessel: "schnitt", label: t("stat.schnitt"), wert: zahl(stand.schnittJeTag) },
  ];
  return (
    <Card className="space-y-4 p-5">
      <div>
        <p className="text-3xl font-black text-foreground">
          {zahl(stand.summe, 0)}
          <span className="ml-1.5 text-sm font-semibold text-muted-foreground">{t("einheit")}</span>
        </p>
        <p className="mt-1 schrift-label text-muted-foreground">{t("standSeit", { datum: tag(stand.letzterTag.datum), start: tag(start) })}</p>
      </div>
      <dl className="grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
        {werte.map((w) => (
          <div key={w.schluessel}>
            <dt className="schrift-label font-semibold uppercase tracking-wide text-muted-foreground">{w.label}</dt>
            <dd className="mt-0.5 text-lg font-black text-foreground">
              {w.wert}
              <span className="ml-1 text-xs font-semibold text-muted-foreground">{t("einheit")}</span>
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

/** Die Rechnung in drei Schritten, am letzten Tag der Reihe vorgerechnet, und der Satz, warum die Zahl so gross ist. */
function Erklaerung({ a, stand }: { a: Anzeige; stand: WaermeStand }) {
  const { t, zahl, tag } = a;
  const tagWerte = stand.letzterTag;
  const basis = zahl(GDD_BASIS_TEMPERATUR_C);
  const mittel = tagWerte.mittelC;
  const beispiel =
    mittel === null || tagWerte.tempMinC === null || tagWerte.tempMaxC === null
      ? null
      : mittel > GDD_BASIS_TEMPERATUR_C
        ? t("erklaerung.beispiel", { datum: tag(tagWerte.datum), min: zahl(tagWerte.tempMinC), max: zahl(tagWerte.tempMaxC), mittel: zahl(mittel), basis, beitrag: zahl(tagWerte.beitrag) })
        : t("erklaerung.beispielKalt", { datum: tag(tagWerte.datum), mittel: zahl(mittel), basis });
  return (
    <div className="mt-4">
      <h3 className="text-xs font-bold text-card-foreground">{t("erklaerung.titel")}</h3>
      <ol className="mt-1.5 list-decimal space-y-1 pl-5 schrift-dense text-muted-foreground">
        <li>{t("erklaerung.schritt1")}</li>
        <li>{t("erklaerung.schritt2", { basis })}</li>
        <li>{t("erklaerung.schritt3")}</li>
      </ol>
      {beispiel ? <p className="mt-2 rounded-lg bg-muted/40 px-3 py-2 schrift-dense text-card-foreground">{beispiel}</p> : null}
      <p className="mt-2 schrift-dense text-muted-foreground">{t("erklaerung.hoch", { tage: stand.tage, schnitt: zahl(stand.schnittJeTag) })}</p>
    </div>
  );
}

/** Ein Vergleichspunkt aus den eigenen Daten: die Waermesumme am Tag der ersten Ernte. Ohne Ernte sagt die Seite, dass es ihn noch nicht gibt. */
function Einordnung({ a, ersteErnte }: { a: Anzeige; ersteErnte: WetterUebersicht["ersteErnte"] }) {
  const { t, zahl, tag } = a;
  const satz =
    ersteErnte === null
      ? t("einordnung.keineErnte")
      : ersteErnte.summe === null
        ? t("einordnung.ersteErnteOhneSumme", { datum: tag(ersteErnte.datum) })
        : t("einordnung.ersteErnte", { datum: tag(ersteErnte.datum), summe: zahl(ersteErnte.summe, 0) });
  return (
    <div className="mt-4 space-y-1.5 border-t border-border pt-3">
      <p className="schrift-dense text-card-foreground">{satz}</p>
      <p className="schrift-label text-muted-foreground">{t("einordnung.hinweis")}</p>
    </div>
  );
}

function Tagestabelle({ a, tage }: { a: Anzeige; tage: WetterTag[] }) {
  const { t, zahl, beitrag, tag } = a;
  const grad = (n: number | null) => (n === null ? "-" : `${zahl(n)} °C`);
  return (
    <DataTable head={[t("col.datum"), t("col.min"), t("col.max"), t("col.mittel"), t("col.beitrag"), t("col.summe"), t("col.niederschlag")]}>
      {tage.map((tagWert) => {
        const mittel = tagesMittel(tagWert.tempMinC, tagWert.tempMaxC);
        return (
          <tr key={tagWert.datum}>
            <td className="px-3 py-2.5 font-semibold text-foreground">{tag(tagWert.datum)}</td>
            <td className="px-3 py-2.5 text-muted-foreground">{grad(tagWert.tempMinC)}</td>
            <td className="px-3 py-2.5 text-muted-foreground">{grad(tagWert.tempMaxC)}</td>
            <td className="px-3 py-2.5 text-muted-foreground">{grad(mittel)}</td>
            <td className="px-3 py-2.5 font-semibold text-foreground">{beitrag(gddBeitrag(tagWert.tempMinC, tagWert.tempMaxC))}</td>
            <td className="px-3 py-2.5 text-foreground">{zahl(tagWert.temperatursumme)}</td>
            <td className="px-3 py-2.5 text-muted-foreground">{tagWert.niederschlagMm === null ? "-" : `${zahl(tagWert.niederschlagMm)} mm`}</td>
          </tr>
        );
      })}
    </DataTable>
  );
}

export async function WetterAnsicht() {
  const [uebersicht, profil, t, format, locale] = await Promise.all([ladeWetterUebersicht(), getSessionProfile(), getTranslations("wetterAnsicht"), getFormatter(), getLocale()]);
  const a = anzeigeFuer(t, format);

  const darfAktualisieren = uebersicht.quelle !== "demo" && hasPermission(profil?.role, "rotationsplan", "update");
  const stand = waermeStand(uebersicht.tage);
  const juengsteTage = uebersicht.tage.slice(-14).reverse();

  // Die Messreihe wird von Hand aktualisiert (kein Hintergrundjob): endet sie vor heute, sagt die Seite das, statt einen alten Stand als aktuell erscheinen zu
  // lassen (WMCNL-2389).
  const veraltet = uebersicht.quelle === "db" && stand !== null && stand.letzterTag.datum < heuteIso();
  // Die Marke der ersten Ernte sitzt auf einem Tag der Reihe: dem letzten bis zum Erntetag.
  const marke = uebersicht.ersteErnte ? (summeBis(uebersicht.tage, uebersicht.ersteErnte.datum)?.datum ?? null) : null;

  return (
    <div className="space-y-6">
      <Section title={t("summeTitel")} description={t("summeLead")} action={<DatenquelleBadge quelle={uebersicht.quelle} />}>
        {stand ? (
          <>
            <WaermeKarte a={a} stand={stand} start={uebersicht.tage[0]?.datum ?? stand.letzterTag.datum} />
            <Erklaerung a={a} stand={stand} />
          </>
        ) : (
          <LeererZustand titel={t("keineDaten")} modul="wetter" />
        )}
      </Section>

      {stand ? (
        <Section title={t("verlauf.titel")} description={t("verlauf.lead")}>
          <WaermeVerlauf
            punkte={uebersicht.tage.map((x) => ({ datum: x.datum, summe: x.temperatursumme }))}
            ersteErnte={marke}
            locale={locale}
            texte={{ wert: t("verlauf.wert"), ersteErnte: t("verlauf.ersteErnte") }}
          />
          <Einordnung a={a} ersteErnte={uebersicht.ersteErnte} />
        </Section>
      ) : null}

      <Section title={t("tageTitel")} description={t("tageLead")}>
        {veraltet && stand ? (
          <p className="mb-3 rounded-lg border border-warning/25 bg-warning/[0.08] px-3 py-2 text-xs font-semibold text-warning">{t("veraltet", { datum: a.tag(stand.letzterTag.datum) })}</p>
        ) : null}
        {juengsteTage.length === 0 ? <LeererZustand titel={t("keineDaten")} modul="wetter" /> : <Tagestabelle a={a} tage={juengsteTage} />}
      </Section>

      {darfAktualisieren ? <WetterAktualisierenFormular /> : null}

      <Card className="bg-muted/30 text-xs leading-5 text-muted-foreground">
        {t("grundlagen", { breite: a.zahl(WETTER_BREITENGRAD, 3), laenge: a.zahl(WETTER_LAENGENGRAD, 3), basis: a.zahl(GDD_BASIS_TEMPERATUR_C) })}
      </Card>
    </div>
  );
}
