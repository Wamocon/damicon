"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronRight, FileDown, FileJson, ShieldCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import {
  type AufklappbarSteuerung,
  type ComplianceTourSchritt,
  useRegistriereComplianceTour,
} from "@/components/dashboard/compliance-tour-kontext";
import { berichtAlsPdfSpeichern } from "@/components/pruefung/bericht-pdf";
import { BefundKarte, Hinweise, Massnahmenplan, Siegel } from "@/components/pruefung/pruefung-bericht";
import { BEREICH_SYMBOL } from "@/components/pruefung/symbole";
import { Sheet } from "@/components/ui/sheet";
import { bereichskacheln } from "@/lib/domain/tagesbericht";
import { bereichsAuszug } from "@/lib/pruefung/befund";
import { berichtKontext } from "@/lib/pruefung/kontext";
import type { Pruefbereich } from "@/lib/pruefung/rollen";
import type { Bericht, Kennzahlen } from "@/lib/pruefung/typen";

// Die vier Kacheln im Reiter "CEO-Compliance": Audit, Steuern, Recht und Risiko.
//
// Die Finanzen standen hier bis zum 23.09.2026 als fuenfte Kachel und mussten ihre Betraege
// auf 200 px Breite kompakt schreiben. Sie haben jetzt einen eigenen Reiter
// (finanzen-reiter.tsx). Die Reihenfolge der vier Pruefbereiche ist fest (PRUEFBEREICHE,
// siehe bereichskacheln()) - eine Kachel, die taeglich die Position wechselt, macht die Seite
// unlesbar.
//
// Jede Kachel ist ein Link und funktioniert damit ohne JavaScript (DESIGN.md Regel 6):
// die Kacheln fuehren auf /dashboard/compliance. Ist JavaScript da, faengt onClick die vier Pruefkacheln ab und oeffnet
// stattdessen das Blatt mit den Befunden dieses Bereichs - schneller als eine Navigation,
// und der Rest der Seite bleibt sichtbar dahinter. Vorher waren es Knoepfe, die ohne
// JavaScript ins Leere fuehrten.
//
// Massnahmenplan, Hinweise und Siegel stehen darunter zugeklappt (Fassung aus PR #115):
// fuer eine Fuehrungsrolle sind das selten die ersten Zahlen, die zaehlen, und bei einem
// sauberen Bericht ohne Massnahmen fraessen drei leere Abschnitte nur Platz. Ob sie hier
// bleiben oder auf /dashboard/compliance wandern, entscheidet die Geschaeftsfuehrung -
// bis dahin bleibt es bei dieser Fassung.

function Aufklappbar({
  id,
  titel,
  anzahl,
  symbol,
  children,
  offenVonAussen,
  onOffenVonAussen,
}: {
  /** Anker fuer Himbis Tour (compliance-tour-kontext.tsx): springt hierher UND klappt auf, siehe use-compliance-tour.tsx. */
  id?: string;
  titel: string;
  anzahl?: number;
  symbol?: ReactNode;
  children: ReactNode;
  /** Von aussen gesteuert (Himbis Tour oeffnet/schliesst dieses Aufklappbar ueber eine typisierte
   *  Prop statt einer DOM-Suche, siehe AufklappbarSteuerung in compliance-tour-kontext.tsx). Ohne
   *  beide Props verwaltet die Komponente ihren Zustand wie bisher selbst (z. B. das Siegel unten,
   *  kein Tour-Anker). */
  offenVonAussen?: boolean;
  onOffenVonAussen?: (offen: boolean) => void;
}) {
  const [offenIntern, setOffenIntern] = useState(false);
  const offen = offenVonAussen ?? offenIntern;
  const umschalten = onOffenVonAussen ?? setOffenIntern;
  return (
    <div id={id} className="pr-aufklappbar" data-offen={offen}>
      <button type="button" className="pr-aufklappbar__kopf" onClick={() => umschalten(!offen)} aria-expanded={offen}>
        {symbol}
        <span className="pr-aufklappbar__titel">{titel}</span>
        {typeof anzahl === "number" ? <span className="pr-chip">{anzahl}</span> : null}
        <ChevronDown className="pr-aufklappbar__pfeil h-4 w-4" aria-hidden />
      </button>
      <div className="pr-aufklappbar__koerper">
        <div className="pr-aufklappbar__innen">
          <div className="pr-aufklappbar__polster">{children}</div>
        </div>
      </div>
    </div>
  );
}

/** Nur dieser Bereich als eigene JSON-Datei: dieselben Befunde/Massnahmen/Quellen wie im
 *  Sheet (bereichsAuszug() in befund.ts, dieselbe Funktion wie fuer den PDF-Auszug in
 *  bericht-pdf.ts), dazu die Kennung des Gesamtberichts, dessen Siegel gilt (siehe
 *  bericht-pdf.ts fuer die PDF-Fassung desselben Gedankens: das Siegel deckt den
 *  GESAMTBERICHT, kein eigenes Siegel fuer den Auszug vortaeuschen). */
function bereichAlsJson(bericht: Bericht, bereich: Pruefbereich, kz: Kennzahlen): void {
  const { befunde, massnahmen, belege } = bereichsAuszug(bericht, bereich);
  const auszug = {
    bereich,
    kennzahlen: kz,
    befunde,
    massnahmen,
    belege,
    teilVonBericht: { id: bericht.id, erstelltAm: bericht.erstelltAm, siegel: bericht.siegel },
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(auszug, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `compliance-pruefung-${bericht.id}-${bereich}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function Kachel({
  id,
  href,
  stufe,
  bereich,
  symbol,
  name,
  zahl,
  zahlLabel,
  urteil,
  chips,
  fuss,
  titel,
  onClick,
}: {
  id?: string;
  href: string;
  stufe: string;
  bereich?: string;
  symbol: ReactNode;
  name: string;
  zahl: string;
  zahlLabel: string;
  urteil: string;
  chips: ReactNode;
  fuss: string;
  titel?: string;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <Link
      id={id}
      href={href}
      title={titel}
      className="pr-kachel pr-kachel--verweis"
      data-bereich={bereich}
      data-stufe={stufe}
      onClick={onClick}
    >
      <span className="pr-kachel__kopf">
        <span className="pr-kachel__symbol" aria-hidden>
          {symbol}
        </span>
        <span className="pr-kachel__name">{name}</span>
        <ChevronRight className="pr-kachel__pfeil h-4 w-4" aria-hidden />
      </span>
      <span className="pr-kachel__reife">
        <span className="pr-kachel__zahl">{zahl}</span>
        <span className="pr-kachel__label">{zahlLabel}</span>
      </span>
      <span className="pr-kachel__urteil">{urteil}</span>
      <span className="pr-zahlenleiste">{chips}</span>
      <span className="pr-kachel__fuss">{fuss}</span>
    </Link>
  );
}

export function TagesKacheln({ bericht }: { bericht: Bericht | null }) {
  const t = useTranslations("pruefung");
  const tp = useTranslations("pruefungPdf");
  const tc = useTranslations("ceoUebersicht");
  const [offenerBereich, setOffenerBereich] = useState<Pruefbereich | null>(null);

  // Fuer Himbis Tour: welche Aufklappbaren (Massnahmen/Einschraenkungen) offen sind, hier statt
  // in der jeweiligen Aufklappbar-Instanz selbst - nur so kann die Tour eines gezielt oeffnen, um
  // dorthin zu zeigen, und beim Verlassen wieder schliessen, ueber eine typisierte Prop statt
  // einer DOM-Suche (oeffneFallsZugeklappt/schliesseWiederZu in use-compliance-tour.tsx). Ueber
  // eine Ref gespiegelt, damit die Steuerung selbst als Objekt stabil bleibt (siehe unten) und
  // trotzdem immer den aktuellen Stand liest.
  const [aufklappbarOffen, setAufklappbarOffenState] = useState<Record<string, boolean>>({});
  const aufklappbarOffenRef = useRef(aufklappbarOffen);
  useEffect(() => {
    aufklappbarOffenRef.current = aufklappbarOffen;
  }, [aufklappbarOffen]);
  const setAufklappbarOffen = useCallback((anker: string, offen: boolean) => {
    setAufklappbarOffenState((alt) => (alt[anker] === offen ? alt : { ...alt, [anker]: offen }));
  }, []);
  const aufklappbarSteuerung = useMemo<AufklappbarSteuerung>(
    () => ({
      istZu: (anker) => aufklappbarOffenRef.current[anker] !== true,
      setOffen: setAufklappbarOffen,
    }),
    [setAufklappbarOffen],
  );

  // Einmal je Bericht, nicht bei jedem Rendern neu: bereichskacheln() filtert und berechnet die
  // Kennzahlen aller vier Bereiche, vorher bei jedem Rendern neu (z. B. beim Auf-/Zuklappen eines
  // anderen Abschnitts), obwohl sich der Bericht selbst nicht geaendert hatte.
  const kacheln = useMemo(() => bereichskacheln(bericht), [bericht]);
  const aktiv = kacheln.find((k) => k.bereich === offenerBereich) ?? null;
  const aktiveBefunde = aktiv && bericht ? bericht.befunde.filter((b) => b.bereich === aktiv.bereich) : [];
  const AktivSymbol = aktiv ? BEREICH_SYMBOL[aktiv.bereich] : null;
  const hatHinweise = bericht ? bericht.hinweise.length > 0 || !bericht.vollstaendig : false;

  // Himbis Fuehrung durch den Bericht (compliance-tour-kontext.tsx): eine Station fuer das
  // Gesamtbild, dann eine je Bereich, dann Massnahmen und Einschraenkungen, in derselben
  // Reihenfolge, in der sie auf der Seite stehen - use-compliance-tour.tsx klappt die beiden
  // letzten beim Ankommen automatisch auf, sonst zeigte die Hervorhebung auf einen leeren,
  // zugeklappten Kopf.
  //
  // Alle Stationen liegen im selben Reiter "Lage"; der Anker compliance-kopf sitzt oberhalb
  // der Reiterleiste und ist damit immer sichtbar. Wandern Massnahmen und Hinweise spaeter auf
  // /dashboard/compliance, muesste die Tour die Seite wechseln - das ist dann eine eigene
  // Frage und der Grund, warum das hier steht.
  const tourSchritte: ComplianceTourSchritt[] | null = bericht
    ? [
        { anker: "compliance-kopf", titel: tc("tour.kopfTitel"), text: bericht.zusammenfassung },
        ...kacheln
          .filter((k) => k.geprueft && k.kz)
          .map((k) => ({
            anker: `compliance-kachel-${k.bereich}`,
            titel: t(`bereich.${k.bereich}.name`),
            text: tc("tour.bereich", { reife: k.kz!.reife, stufe: t(`stufe.${k.kz!.stufe}`), anzahl: k.anzahl }),
          })),
        ...(bericht.massnahmen.length > 0
          ? [{ anker: "compliance-massnahmen", titel: t("bericht.massnahmen"), text: tc("tour.massnahmen", { anzahl: bericht.massnahmen.length }) }]
          : []),
        ...(hatHinweise
          ? [{ anker: "compliance-einschraenkungen", titel: t("bericht.hinweise"), text: tc("tour.einschraenkungen", { anzahl: bericht.hinweise.length }) }]
          : []),
      ]
    : null;
  // Fuer "Ergebnis besprechen"/"Loesungsplan" am Ende der Tour: derselbe Berichtsbezug, den auch
  // der manuelle Nachbereitungs-Abschnitt (pruefung-nachbereitung.tsx) an den Chat uebergibt.
  // Dritter Parameter aufklappbarSteuerung: damit oeffnet/schliesst die Tour Massnahmen und
  // Einschraenkungen ueber die typisierte Prop oben statt ueber eine DOM-Suche.
  useRegistriereComplianceTour(tourSchritte, bericht ? { id: bericht.id, kontext: berichtKontext(bericht) } : null, aufklappbarSteuerung);

  return (
    <>
      {/* .pr-kacheln-bereich macht den Container "kacheln" auf, auf den sich die Umbruchregeln
          in pruefung.css beziehen. Ohne ihn bliebe das Raster einspaltig, bis eine Fensterbreite
          greift - und es soll von der Breite der SPALTE abhaengen, nicht vom Fenster, weil das
          KI-Panel daneben bis zu 27rem wegnimmt. */}
      <div className="pr-kacheln-bereich">
        <div className="pr-kacheln-bereich__kopf">
          <h3 className="pr-abschnitt__titel">{t("bericht.befunde")}</h3>
          {/* "Tour erneut starten" steht mit "Zusammenfassung im Chat" in der
              Kopfzeile der Uebersicht (CeoTourAktionen in tages-uebersicht.tsx),
              nicht noch einmal hier. */}
        </div>

        <div className="pr-kacheln">
          {kacheln.map((k) => {
            const Symbol = BEREICH_SYMBOL[k.bereich];
            const name = t(`bereich.${k.bereich}.name`);

            // Nicht geprueft, oder fuer jeden Punkt fehlten die Betriebsdaten: dann steht hier
            // kein Reifegrad. Eine 100 waere in beiden Faellen eine erfundene Zahl.
            if (!k.geprueft || k.ohneDaten || !k.kz) {
              return (
                <Kachel
                  key={k.bereich}
                  id={`compliance-kachel-${k.bereich}`}
                  href="/dashboard/compliance"
                  stufe="offen"
                  bereich={k.bereich}
                  symbol={<Symbol className="h-4 w-4" />}
                  name={name}
                  zahl="–"
                  zahlLabel={t("bericht.reife")}
                  urteil={k.geprueft ? tc("ohneDaten") : tc("nichtGeprueft")}
                  chips={null}
                  fuss={tc("vollerBericht")}
                />
              );
            }

            const kz = k.kz;
            return (
              <Kachel
                key={k.bereich}
                id={`compliance-kachel-${k.bereich}`}
                href="/dashboard/compliance"
                stufe={kz.stufe}
                bereich={k.bereich}
                symbol={<Symbol className="h-4 w-4" />}
                name={name}
                zahl={String(kz.reife)}
                zahlLabel={t("bericht.reife")}
                urteil={t(`stufe.${kz.stufe}`)}
                chips={(["verstoss", "luecke", "hinweis", "konform"] as const)
                  .filter((s) => kz.nachStatus[s] > 0)
                  .map((s) => (
                    <span key={s} className="pr-status" data-status={s}>
                      {kz.nachStatus[s]} {t(`status.${s}`)}
                    </span>
                  ))}
                fuss={tc("kachelOeffnen", { anzahl: k.anzahl })}
                onClick={(e) => {
                  e.preventDefault();
                  setOffenerBereich(k.bereich);
                }}
              />
            );
          })}

        </div>
      </div>

      {bericht ? (
        <>
          {bericht.massnahmen.length === 0 ? (
            <p className="pr-leer-hinweis">{tc("keineMassnahmen")}</p>
          ) : (
            <Aufklappbar
              id="compliance-massnahmen"
              titel={t("bericht.massnahmen")}
              anzahl={bericht.massnahmen.length}
              offenVonAussen={aufklappbarOffen["compliance-massnahmen"] ?? false}
              onOffenVonAussen={(offen) => setAufklappbarOffen("compliance-massnahmen", offen)}
            >
              <Massnahmenplan bericht={bericht} />
            </Aufklappbar>
          )}
          {hatHinweise ? (
            <Aufklappbar
              id="compliance-einschraenkungen"
              titel={t("bericht.hinweise")}
              anzahl={bericht.hinweise.length || undefined}
              offenVonAussen={aufklappbarOffen["compliance-einschraenkungen"] ?? false}
              onOffenVonAussen={(offen) => setAufklappbarOffen("compliance-einschraenkungen", offen)}
            >
              <Hinweise bericht={bericht} />
            </Aufklappbar>
          ) : null}
          <Aufklappbar titel={t("siegel.titel")} symbol={<ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden />}>
            <Siegel bericht={bericht} />
          </Aufklappbar>
        </>
      ) : null}

      <Sheet
        offen={aktiv !== null}
        onSchliessen={() => setOffenerBereich(null)}
        titel={aktiv ? t(`bereich.${aktiv.bereich}.name`) : ""}
        position="mitte"
      >
        {aktiv && aktiv.kz && bericht ? (
          <div className="pr-bereich-detail p-4 sm:p-6">
            <div className="pr-bereich-detail__kopf" data-stufe={aktiv.kz.stufe}>
              {AktivSymbol ? (
                <span className="pr-bereich-detail__symbol" data-bereich={aktiv.bereich} aria-hidden>
                  <AktivSymbol className="h-5 w-5" />
                </span>
              ) : null}
              <span className="pr-bereich-detail__zahl">{aktiv.kz.reife}</span>
              <span className="pr-bereich-detail__meta">
                <span className="pr-bereich-detail__urteil">{t(`stufe.${aktiv.kz.stufe}`)}</span>
                <span className="pr-bereich-detail__hinweis">
                  {t("bericht.reife")} {aktiv.kz.reife}/100 · {aktiveBefunde.length} {t("bericht.befunde")}
                </span>
              </span>
              <span className="pr-zahlenleiste pr-bereich-detail__zahlenleiste">
                {(["verstoss", "luecke", "hinweis", "konform"] as const)
                  .filter((s) => aktiv.kz!.nachStatus[s] > 0)
                  .map((s) => (
                    <span key={s} className="pr-status" data-status={s}>
                      {aktiv.kz!.nachStatus[s]} {t(`status.${s}`)}
                    </span>
                  ))}
              </span>
            </div>
            <div className="pr-siegel__aktionen pr-bereich-detail__aktionen">
              <button
                type="button"
                className="pr-knopf"
                onClick={() => berichtAlsPdfSpeichern(bericht, { t: (k, w) => t(k, w), p: (k, w) => tp(k, w) }, { bereich: aktiv.bereich })}
              >
                <FileDown className="h-4 w-4" /> {tc("bereichAlsPdf")}
              </button>
              <button
                type="button"
                className="pr-knopf"
                onClick={() => bereichAlsJson(bericht, aktiv.bereich, aktiv.kz!)}
              >
                <FileJson className="h-4 w-4" /> {tc("bereichAlsJson")}
              </button>
            </div>
            <ul className="pr-befunde">
              {aktiveBefunde.map((b, i) => (
                <BefundKarte key={b.id} b={b} belege={bericht.belege} index={i} />
              ))}
            </ul>
          </div>
        ) : null}
      </Sheet>
    </>
  );
}
