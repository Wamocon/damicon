"use client";

import { useTranslations } from "next-intl";
import type { WissenDokumentZeile } from "@/lib/wissen/dokumente-liste";
import {
  aktiveFilter,
  HERKUENFTE,
  KEIN_FILTER,
  STATUS_FILTER,
  VERLAESSLICHKEITEN,
  zaehleMit,
  type HerkunftFilter,
  type ListenFilter,
  type StatusFilter,
  type Verlaesslichkeit,
} from "@/lib/wissen/listen-filter";
import { CLUSTER, QUELLENARTEN, type Cluster, type Quellenart } from "@/lib/wissen/quellenart";
import { bereicheVon, UPLOAD_BEREICHE, UPLOAD_ROLLEN } from "@/lib/wissen/upload-konstanten";

// Filter der Dokumentliste (Seite Wissensbasis): Cluster als Schaltflaechen, dazu Suche und Auswahlfelder fuer Bereich, Quellenart, Verlaesslichkeit
// (amtlich, sicher, nur Hinweis, unsicher), Status, Herkunft und Rolle. Die Zahlen an den Eintraegen zeigen, wie viele Dokumente der Filter bei sonst
// gleichen Einstellungen trifft; die Begriffe stehen in lib/wissen/listen-filter.ts, dieselben nutzt der Assistent.

const feld = "w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground";

export function WissenListenFilter({
  dokumente,
  filter,
  beiAenderung,
  anzahlSichtbar,
}: {
  dokumente: WissenDokumentZeile[];
  filter: ListenFilter;
  beiAenderung: (neu: ListenFilter) => void;
  anzahlSichtbar: number;
}) {
  const t = useTranslations("kiAssistentAnsicht.wissensVerwaltung");
  const tF = useTranslations("kiAssistentAnsicht.wissensVerwaltung.filter");
  const tCluster = useTranslations("kiAssistentAnsicht.wissensVerwaltung.cluster");
  const tBereich = useTranslations("kiAssistentAnsicht.wissensVerwaltung.bereich");
  const tArt = useTranslations("kiAssistentAnsicht.wissensVerwaltung.quellenart");
  const tRolle = useTranslations("roles");
  const setze = (teil: Partial<ListenFilter>) => beiAenderung({ ...filter, ...teil });
  const aktiv = aktiveFilter(filter);

  // Bereiche, die es in der Liste gibt: die fuenf des Uploads und die des Bestands (amtlich, fachquellen ...), mit ihrer Bezeichnung
  const vorhandeneBereiche = [...new Set(dokumente.flatMap((d) => bereicheVon(d.bereich, d.weitereBereiche)))];
  const bereiche = [
    ...UPLOAD_BEREICHE.filter((b) => vorhandeneBereiche.includes(b)),
    ...vorhandeneBereiche.filter((b) => !(UPLOAD_BEREICHE as readonly string[]).includes(b)).sort(),
  ];
  const bereichName = (b: string) => ((UPLOAD_BEREICHE as readonly string[]).includes(b) ? tBereich(b as never) : b);
  const arten = QUELLENARTEN.filter((a) => dokumente.some((d) => d.quellenart === a));
  const rollen = UPLOAD_ROLLEN.filter((r) => dokumente.some((d) => d.rollen.includes(r)));
  const mitZahl = (text: string, n: number) => `${text} (${n})`;

  const clusterEintraege: { wert: Cluster | "ohne" | null; text: string }[] = [
    { wert: null, text: t("liste.filterAlle") },
    ...CLUSTER.map((c) => ({ wert: c as Cluster, text: tCluster(c) })),
    { wert: "ohne", text: t("liste.ohneEinordnung") },
  ];
  const ohneEinordnungAnzahl = zaehleMit(dokumente, filter, "cluster", "ohne");

  return (
    <div className="mb-2 space-y-2">
      <div role="group" aria-label={t("liste.filter")} className="flex flex-wrap gap-1.5">
        {clusterEintraege.map((e) => {
          const gewaehlt = filter.cluster === e.wert;
          const n = e.wert === null ? zaehleMit(dokumente, { ...filter, cluster: null }, "cluster", null) : zaehleMit(dokumente, filter, "cluster", e.wert);
          return (
            <button
              key={String(e.wert)}
              type="button"
              aria-pressed={gewaehlt}
              onClick={() => setze({ cluster: e.wert })}
              className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold transition ${
                gewaehlt ? "border-primary bg-primary text-primary-foreground" : "border-border text-card-foreground hover:border-primary/50"
              }`}
            >
              {e.text}
              <span className={`tabular-nums ${gewaehlt ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{n}</span>
            </button>
          );
        })}
      </div>
      {ohneEinordnungAnzahl > 0 ? <p className="text-[11px] leading-4 text-muted-foreground">{t("liste.ohneEinordnungHinweis")}</p> : null}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block space-y-0.5 sm:col-span-2">
          <span className="text-[11px] font-semibold text-card-foreground">{tF("suche")}</span>
          <input type="search" className={feld} value={filter.suche} placeholder={tF("suchePlatzhalter")} onChange={(e) => setze({ suche: e.target.value })} />
        </label>
        <label className="block space-y-0.5">
          <span className="text-[11px] font-semibold text-card-foreground">{tF("bereich")}</span>
          <select className={feld} value={filter.bereich ?? ""} onChange={(e) => setze({ bereich: e.target.value || null })}>
            <option value="">{mitZahl(tF("alle"), zaehleMit(dokumente, filter, "bereich", null))}</option>
            {bereiche.map((b) => (
              <option key={b} value={b}>
                {mitZahl(bereichName(b), zaehleMit(dokumente, filter, "bereich", b))}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-0.5">
          <span className="text-[11px] font-semibold text-card-foreground">{tF("verlaesslichkeit")}</span>
          <select className={feld} value={filter.verlaesslichkeit ?? ""} onChange={(e) => setze({ verlaesslichkeit: (e.target.value || null) as Verlaesslichkeit | null })}>
            <option value="">{mitZahl(tF("alle"), zaehleMit(dokumente, filter, "verlaesslichkeit", null))}</option>
            {VERLAESSLICHKEITEN.map((v) => (
              <option key={v} value={v}>
                {mitZahl(tF(`verlaesslichkeitOption.${v}` as never), zaehleMit(dokumente, filter, "verlaesslichkeit", v))}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-0.5">
          <span className="text-[11px] font-semibold text-card-foreground">{tF("art")}</span>
          <select className={feld} value={filter.art ?? ""} onChange={(e) => setze({ art: (e.target.value || null) as Quellenart | null })}>
            <option value="">{mitZahl(tF("alle"), zaehleMit(dokumente, filter, "art", null))}</option>
            {arten.map((a) => (
              <option key={a} value={a}>
                {mitZahl(tArt(a), zaehleMit(dokumente, filter, "art", a))}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-0.5">
          <span className="text-[11px] font-semibold text-card-foreground">{tF("status")}</span>
          <select className={feld} value={filter.status ?? ""} onChange={(e) => setze({ status: (e.target.value || null) as StatusFilter | null })}>
            <option value="">{mitZahl(tF("alle"), zaehleMit(dokumente, filter, "status", null))}</option>
            {STATUS_FILTER.map((s) => (
              <option key={s} value={s}>
                {mitZahl(tF(`statusOption.${s}` as never), zaehleMit(dokumente, filter, "status", s))}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-0.5">
          <span className="text-[11px] font-semibold text-card-foreground">{tF("herkunft")}</span>
          <select className={feld} value={filter.herkunft ?? ""} onChange={(e) => setze({ herkunft: (e.target.value || null) as HerkunftFilter | null })}>
            <option value="">{mitZahl(tF("alle"), zaehleMit(dokumente, filter, "herkunft", null))}</option>
            {HERKUENFTE.map((h) => (
              <option key={h} value={h}>
                {mitZahl(t(`herkunft.${h}`), zaehleMit(dokumente, filter, "herkunft", h))}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-0.5">
          <span className="text-[11px] font-semibold text-card-foreground">{tF("rolle")}</span>
          <select className={feld} value={filter.rolle ?? ""} onChange={(e) => setze({ rolle: e.target.value || null })}>
            <option value="">{mitZahl(tF("alle"), zaehleMit(dokumente, filter, "rolle", null))}</option>
            {rollen.map((r) => (
              <option key={r} value={r}>
                {mitZahl(tRolle(r), zaehleMit(dokumente, filter, "rolle", r))}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <p role="status" aria-live="polite" className="text-[11px] font-semibold text-card-foreground">
          {tF("ergebnis", { anzahl: anzahlSichtbar, gesamt: dokumente.length })}
        </p>
        {aktiv > 0 ? (
          <button type="button" onClick={() => beiAenderung(KEIN_FILTER)} className="text-[11px] font-semibold underline">
            {tF("zuruecksetzen", { anzahl: aktiv })}
          </button>
        ) : null}
        <span className="text-[11px] text-muted-foreground">{tF("hinweisVerlaesslichkeit")}</span>
      </div>
    </div>
  );
}
