import { getFormatter, getTranslations } from "next-intl/server";
import { Aufklapper, Card, Section, StatusPill, type Tone } from "@/components/ui/kit";
import { DokumentKnopf } from "@/components/ui/dokument-knopf";
import { TourKarte } from "@/components/db/tour-karte";
import {
  AbholrundeAbschliessenFormular,
  AbholrundePlanenFormular,
  AbholrundeStartenKnopf,
  AbholrundeVerwerfenKnopf,
  AbholungFormular,
  StoppEntfaelltKnopf,
} from "@/components/db/abholrunden-formulare";
import { kuehlErgebnisTon } from "@/components/db/toene";
import { ladeAbholrunden, ladeNachbarbetriebeFuerRunde } from "@/lib/data/abholrunden";
import { auslastung, bewertePlanung, fensterStand, rundenZusammenfassung, type AbholRundeZeile, type AbholStoppZeile } from "@/lib/domain/abholrunden";
import { einstellungWert } from "@/lib/data/einstellungen";
import { getSessionProfile } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { tagInZone, uhrzeitInZone } from "@/lib/domain/tageszeit";

// Abholrunden bei Nachbarbetrieben (WMCNL-1577): die Gegenrichtung zur Tourenplanung. Das Buero plant (Datum, Fahrzeug, Stopps),
// der Fahrer startet die Runde, erfasst je Stopp die Abholung mit der Menge und dem Pflueckbeginn, den der Nachbarbetrieb nennt, und
// meldet die Ankunft im Kuehlhaus. Ab dem Pflueckbeginn gilt die 60-Minuten-Regel der Kuehlkette. Abgeschlossene Runden aendern
// sich nicht mehr: sie sind ein Nachweis.

type Uebersetzer = Awaited<ReturnType<typeof getTranslations>>;
type Format = Awaited<ReturnType<typeof getFormatter>>;

const rundenTon: Record<string, Tone> = { geplant: "neutral", unterwegs: "warning", abgeschlossen: "success" };
const stoppTon: Record<string, Tone> = { geplant: "neutral", abgeholt: "success", entfallen: "neutral" };

/** Geschaetzte Ankunft gegen das Abholfenster des Nachbarbetriebs (nur solange der Stopp offen ist), dazu der Hinweis auf eine zweite Runde am selben Tag. */
function ZeitHinweis({ stopp, t, doppelt }: { stopp: AbholStoppZeile; t: Uebersetzer; doppelt: boolean }) {
  const ankunftUhr = stopp.ankunftGeplant ? uhrzeitInZone(new Date(stopp.ankunftGeplant)) : null;
  const fenster = stopp.abholVon && stopp.abholBis ? { von: stopp.abholVon, bis: stopp.abholBis } : null;
  const stand = stopp.status === "geplant" && ankunftUhr && fenster ? fensterStand(ankunftUhr, fenster.von, fenster.bis) : null;
  if (!ankunftUhr && !fenster && !doppelt) return null;
  return (
    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-muted-foreground">
      {ankunftUhr ? <span>{t("stopp.ankunft", { zeit: ankunftUhr })}</span> : null}
      {fenster ? <span>{t("stopp.fenster", { von: fenster.von, bis: fenster.bis })}</span> : null}
      {stand === "frueh" ? <StatusPill tone="warning">{t("stopp.fensterFrueh")}</StatusPill> : null}
      {stand === "spaet" ? <StatusPill tone="danger">{t("stopp.fensterSpaet")}</StatusPill> : null}
      {stand === "im" ? <StatusPill tone="success">{t("stopp.fensterIm")}</StatusPill> : null}
      {doppelt && stopp.status === "geplant" ? <StatusPill tone="warning">{t("stopp.doppelt")}</StatusPill> : null}
    </p>
  );
}

/** Kapazitaet des Fahrzeugs und Auslastung der geplanten Menge (solange die Runde nicht abgeschlossen ist), dazu die Abfahrt. */
function KapazitaetZeilen({ runde, geplantKg, t, format }: { runde: AbholRundeZeile; geplantKg: number; t: Uebersetzer; format: Format }) {
  const auslast = runde.status === "abgeschlossen" ? null : auslastung(geplantKg, runde.kapazitaetKg ?? null);
  return (
    <>
      {auslast && runde.kapazitaetKg ? (
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <StatusPill tone={auslast.stufe === "ueber" ? "danger" : auslast.stufe === "knapp" ? "warning" : "success"}>
            {auslast.stufe === "ueber" ? t("runde.ueberKapazitaet") : auslast.stufe === "knapp" ? t("runde.knapp") : t("runde.platz")}
          </StatusPill>
          <span>{t("runde.kapazitaet", { kapazitaet: format.number(runde.kapazitaetKg), prozent: auslast.prozent })}</span>
        </p>
      ) : null}
      {runde.startZeit ? <p className="text-xs text-muted-foreground">{t("runde.start", { zeit: runde.startZeit })}</p> : null}
    </>
  );
}

function StoppZeile({ stopp, nummer, t, format, darfErfassen, laeuft, doppelt }: { stopp: AbholStoppZeile; nummer: number; t: Uebersetzer; format: Format; darfErfassen: boolean; laeuft: boolean; doppelt: boolean }) {
  const zeit = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "short", timeStyle: "short" });
  const stoppStatus: Record<string, string> = { geplant: t("stoppStatus.geplant"), abgeholt: t("stoppStatus.abgeholt"), entfallen: t("stoppStatus.entfallen") };
  const ergebnis: Record<string, string> = { ok: t("ergebnis.ok"), warnung: t("ergebnis.warnung"), verstoss: t("ergebnis.verstoss") };
  return (
    <li className="rounded-lg border border-border p-3 text-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">{nummer}</span>
          <div>
            <p className="font-semibold text-foreground">{stopp.nachbarbetrieb}</p>
            <p className="text-muted-foreground">{[stopp.adresse ?? stopp.ort, stopp.kontakt].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusPill tone={stoppTon[stopp.status] ?? "neutral"}>{stoppStatus[stopp.status]}</StatusPill>
          {stopp.ergebnis ? <StatusPill tone={kuehlErgebnisTon[stopp.ergebnis] ?? "neutral"}>{ergebnis[stopp.ergebnis]}</StatusPill> : null}
        </div>
      </div>
      <p className="mt-1.5 text-muted-foreground">
        {t("stopp.plan", { menge: format.number(stopp.mengeGeplantKg) })}
        {stopp.sorte ? ` · ${stopp.sorte}` : ""}
        {stopp.status === "abgeholt" && stopp.mengeIstKg !== null ? ` · ${t("stopp.ist", { menge: format.number(stopp.mengeIstKg) })}` : ""}
      </p>
      <ZeitHinweis stopp={stopp} t={t} doppelt={doppelt} />
      {stopp.status === "abgeholt" ? (
        <p className="mt-0.5 text-muted-foreground">
          {stopp.pflueckbeginn ? t("stopp.pflueckbeginn", { zeit: zeit(stopp.pflueckbeginn) }) : t("stopp.pflueckUnbekannt")}
          {stopp.abgeholtAm ? ` · ${t("stopp.abgeholtAm", { zeit: zeit(stopp.abgeholtAm) })}` : ""}
          {stopp.minutenBisKuehlung !== null ? ` · ${t("stopp.minuten", { minuten: stopp.minutenBisKuehlung })}` : ""}
        </p>
      ) : null}
      {stopp.bemerkung ? <p className="mt-0.5 text-muted-foreground">{stopp.bemerkung}</p> : null}
      {darfErfassen && laeuft && stopp.status === "geplant" ? (
        <div className="mt-2 space-y-2">
          <Aufklapper titel={t("abholung.titel")}>
            <AbholungFormular stopp={stopp} />
          </Aufklapper>
          <StoppEntfaelltKnopf stoppId={stopp.id} />
        </div>
      ) : null}
    </li>
  );
}

function RundeKarte({ runde, t, format, darfPlanen, darfErfassen, mitKarte, doppelt }: { runde: AbholRundeZeile; t: Uebersetzer; format: Format; darfPlanen: boolean; darfErfassen: boolean; mitKarte: boolean; doppelt: ReadonlySet<string> }) {
  const z = rundenZusammenfassung(runde.stopps);
  const planung = bewertePlanung(runde.abErstemStoppMinuten);
  const status: Record<string, string> = { geplant: t("status.geplant"), unterwegs: t("status.unterwegs"), abgeschlossen: t("status.abgeschlossen") };
  const zeit = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "short", timeStyle: "short" });
  const laeuft = runde.status === "unterwegs";
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-black text-card-foreground">{format.dateTime(new Date(`${runde.datum}T00:00:00Z`), { dateStyle: "full", timeZone: "UTC" })}</p>
          <p className="text-xs text-muted-foreground">
            {runde.fahrzeug ?? t("runde.ohneFahrzeug")} · {t("runde.stopps", { anzahl: runde.stopps.length })}
          </p>
        </div>
        <StatusPill tone={rundenTon[runde.status] ?? "neutral"}>{status[runde.status]}</StatusPill>
      </div>

      <p className="text-xs text-muted-foreground">
        {t("runde.plan", { menge: format.number(z.geplantKg) })}
        {z.abgeholt > 0 ? ` · ${t("runde.ist", { menge: format.number(z.istKg) })}` : ""}
        {runde.gestartetAm ? ` · ${t("runde.gestartet", { zeit: zeit(runde.gestartetAm) })}` : ""}
        {runde.kuehlhausAn ? ` · ${t("runde.ankunft", { zeit: zeit(runde.kuehlhausAn) })}` : ""}
      </p>
      <KapazitaetZeilen runde={runde} geplantKg={z.geplantKg} t={t} format={format} />
      {runde.notiz ? <p className="text-xs text-muted-foreground">{runde.notiz}</p> : null}

      {runde.distanzKm !== null ? (
        <p className="text-xs text-muted-foreground">{t("runde.route", { km: format.number(runde.distanzKm), minuten: runde.dauerMinuten ?? 0 })}</p>
      ) : (
        <p className="text-xs text-muted-foreground">{t("runde.keineRoute")}</p>
      )}
      {planung && runde.abErstemStoppMinuten !== null && runde.status !== "abgeschlossen" ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <StatusPill tone={kuehlErgebnisTon[planung] ?? "neutral"}>{planung === "ok" ? t("planung.ok") : planung === "warnung" ? t("planung.knapp") : t("planung.zuLang")}</StatusPill>
          <span className="text-muted-foreground">{t("runde.abErstem", { minuten: runde.abErstemStoppMinuten })}</span>
        </div>
      ) : null}

      {runde.status === "abgeschlossen" && z.schlechtestes ? (
        <p className="flex flex-wrap items-center gap-2 text-xs">
          <StatusPill tone={kuehlErgebnisTon[z.schlechtestes] ?? "neutral"}>
            {z.schlechtestes === "ok" ? t("ergebnis.ok") : z.schlechtestes === "warnung" ? t("ergebnis.warnung") : t("ergebnis.verstoss")}
          </StatusPill>
          <span className="text-muted-foreground">{t("runde.ergebnisse", { ok: z.ergebnisse.ok, warnung: z.ergebnisse.warnung, rot: z.ergebnisse.verstoss })}</span>
        </p>
      ) : null}

      {mitKarte && runde.stopps.some((s) => s.breitengrad !== null) ? (
        <TourKarte
          stopps={runde.stopps.map((s) => ({ lieferungId: s.id, kunde: s.nachbarbetrieb, adresse: s.adresse, breitengrad: s.breitengrad, laengengrad: s.laengengrad, mengeKg: s.mengeGeplantKg, reihenfolge: s.reihenfolge }))}
          geometrie={runde.geometrie}
        />
      ) : null}

      <ol className="space-y-2">
        {runde.stopps.map((s, i) => (
          <StoppZeile key={s.id} stopp={s} nummer={i + 1} t={t} format={format} darfErfassen={darfErfassen} laeuft={laeuft} doppelt={runde.status === "geplant" && doppelt.has(`${runde.datum}|${s.nachbarbetriebId}`)} />
        ))}
      </ol>

      <div className="flex flex-wrap items-start gap-3">
        <DokumentKnopf art="abholauftrag" parameter={{ runde: runde.id }} label={t("runde.auftrag")} klein />
        {darfErfassen && runde.status === "geplant" ? <AbholrundeStartenKnopf id={runde.id} /> : null}
        {darfPlanen && runde.status === "geplant" ? <AbholrundeVerwerfenKnopf id={runde.id} /> : null}
      </div>
      {darfErfassen && laeuft ? (
        <div className="border-t border-border pt-3">
          <p className="mb-1.5 text-xs font-semibold text-card-foreground">{t("abschluss.titel")}</p>
          {/* Der Schluessel haengt an der Zahl offener Stopps: erledigt der Fahrer einen, baut sich das Formular neu auf und eine alte Fehlermeldung verschwindet. */}
          <AbholrundeAbschliessenFormular key={z.offen} id={runde.id} offen={z.offen} />
        </div>
      ) : null}
    </Card>
  );
}

export async function AbholrundenAnsicht() {
  const [t, format, profil, uebersicht] = await Promise.all([getTranslations("abholrundenAnsicht"), getFormatter(), getSessionProfile(), ladeAbholrunden()]);
  if (uebersicht.quelle === "keine") return null;

  const darfPlanen = hasPermission(profil?.role, "logistik", "create");
  const darfErfassen = hasPermission(profil?.role, "logistik", "update");
  const [betriebe, kapazitaetVorgabe] = await Promise.all([darfPlanen ? ladeNachbarbetriebeFuerRunde() : Promise.resolve([]), einstellungWert("abholung.fahrzeug_kapazitaet_kg")]);
  // Ein Betrieb in zwei geplanten Runden am selben Tag: kein Fehler (das zweite Fahrzeug kann noetig sein), aber ein Hinweis an beiden Stopps.
  const jeTagUndBetrieb = new Map<string, number>();
  for (const r of uebersicht.runden.filter((x) => x.status === "geplant")) for (const s of r.stopps) jeTagUndBetrieb.set(`${r.datum}|${s.nachbarbetriebId}`, (jeTagUndBetrieb.get(`${r.datum}|${s.nachbarbetriebId}`) ?? 0) + 1);
  const doppelt = new Set([...jeTagUndBetrieb].filter(([, n]) => n > 1).map(([k]) => k));
  const aktiv = uebersicht.runden.filter((r) => r.status !== "abgeschlossen");
  const fertig = uebersicht.runden.filter((r) => r.status === "abgeschlossen");

  return (
    <Section title={t("titel")} description={t("lead")}>
      <div className="space-y-4">
        <Card ton="innen" className="p-4">
          <p className="schrift-dense text-card-foreground">{t("regel")}</p>
          {!darfPlanen ? <p className="mt-1 schrift-label text-muted-foreground">{t("nurLesen")}</p> : null}
        </Card>

        {uebersicht.runden.length === 0 ? <p className="text-xs text-muted-foreground">{t("leer")}</p> : null}

        {aktiv.map((r) => (
          <RundeKarte key={r.id} runde={r} t={t} format={format} darfPlanen={darfPlanen} darfErfassen={darfErfassen} mitKarte doppelt={doppelt} />
        ))}

        {fertig.length > 0 ? (
          <Aufklapper titel={t("runde.abgeschlossenTitel", { anzahl: fertig.length })} beschreibung={t("runde.abgeschlossenLead")}>
            <div className="space-y-3">
              {fertig.map((r) => (
                <RundeKarte key={r.id} runde={r} t={t} format={format} darfPlanen={darfPlanen} darfErfassen={darfErfassen} mitKarte={false} doppelt={doppelt} />
              ))}
            </div>
          </Aufklapper>
        ) : null}

        {darfPlanen ? <AbholrundePlanenFormular betriebe={betriebe} heute={tagInZone(new Date())} kapazitaetVorgabe={kapazitaetVorgabe} /> : null}
      </div>
    </Section>
  );
}

