"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CloudOff, RefreshCw, Wifi } from "lucide-react";
import { useOnlineStatus } from "@/lib/offline/use-online-status";
import { alleEintraege } from "@/lib/offline/warteschlange";
import type { AktionTyp, WarteschlangenEintrag } from "@/lib/offline/db";
import { StatusPill, type Tone } from "@/components/ui/kit";

// Anforderung 2.5, Phase 1: der Indikator ist bereits vollstaendig
// funktionsfaehig (Online-/Offline-Erkennung, Warteschlangen-Anzeige) - nur
// die Warteschlange selbst bleibt in dieser Phase strukturell leer, weil noch
// kein Formular in sie einreiht (das beginnt mit dem Pilot-Workflow in
// Phase 2). Kein Service-Worker-Background-Sync (schwache/keine
// Unterstuetzung auf iOS Safari, relevant fuer Feldgeraete) - der Abgleich
// laeuft ueber das online-Ereignis, Fokus/Mount und ein Intervall als
// Sicherheitsnetz.

const AKTUALISIERUNGS_INTERVALL_MS = 30_000;

const statusTon: Record<WarteschlangenEintrag["status"], Tone> = {
  wartend: "neutral",
  wird_gesendet: "info",
  gesendet: "success",
  fehler: "warning",
  konflikt: "danger",
};

export function SyncStatus() {
  const t = useTranslations("sync");
  const online = useOnlineStatus();
  const [eintraege, setEintraege] = useState<WarteschlangenEintrag[]>([]);
  const [offen, setOffen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const neuLaden = useCallback(() => {
    void alleEintraege().then(setEintraege);
  }, []);

  useEffect(() => {
    neuLaden();
    window.addEventListener("online", neuLaden);
    window.addEventListener("focus", neuLaden);
    const intervall = window.setInterval(neuLaden, AKTUALISIERUNGS_INTERVALL_MS);
    return () => {
      window.removeEventListener("online", neuLaden);
      window.removeEventListener("focus", neuLaden);
      window.clearInterval(intervall);
    };
  }, [neuLaden]);

  useEffect(() => {
    if (!offen) return;
    function aufAussenklickSchliessen(ereignis: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(ereignis.target as Node)) {
        setOffen(false);
      }
    }
    document.addEventListener("mousedown", aufAussenklickSchliessen);
    return () => document.removeEventListener("mousedown", aufAussenklickSchliessen);
  }, [offen]);

  const wartend = eintraege.filter((e) => e.status === "wartend" || e.status === "fehler").length;
  const konflikte = eintraege.filter((e) => e.status === "konflikt").length;

  const Icon = !online ? CloudOff : Wifi;
  // Der Rahmen der Auslöse-Schaltflaeche uebernimmt denselben Ton wie das
  // Panel - auffaellig nur, wenn etwas Aufmerksamkeit braucht (offline oder
  // Konflikt), sonst identisch zu den Nachbar-Schaltflaechen in der Topbar.
  const rahmenTon =
    konflikte > 0
      ? "border-destructive/40"
      : !online
        ? "border-warning/40"
        : "border-border";

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        aria-label={t("knopf.label")}
        onClick={() => setOffen((wert) => !wert)}
        className={`relative inline-flex h-9 w-9 items-center justify-center rounded-lg border ${rahmenTon} bg-card text-foreground transition-colors hover:bg-muted`}
      >
        <Icon className={`h-4 w-4 ${!online ? "text-warning" : konflikte > 0 ? "text-destructive" : ""}`} />
        {wartend + konflikte > 0 ? (
          <span
            className={`absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-black text-white ${
              konflikte > 0 ? "bg-destructive" : "bg-primary"
            }`}
          >
            {wartend + konflikte}
          </span>
        ) : null}
      </button>

      {offen ? (
        <div className="absolute right-0 top-11 z-50 w-80 rounded-xl border border-border bg-card p-3 shadow-lg">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-black text-card-foreground">{t("panelTitel")}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {online ? t("online") : t("offline")}
              </p>
            </div>
            <StatusPill tone={online ? "success" : "warning"}>
              {online ? t("online") : t("offline")}
            </StatusPill>
          </div>

          <div className="mt-3 max-h-64 space-y-1.5 overflow-y-auto">
            {eintraege.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-3 text-center text-[11px] text-muted-foreground">
                {t("keineEintraege")}
              </p>
            ) : (
              eintraege
                .slice()
                .sort((a, b) => (a.erstelltAm < b.erstelltAm ? 1 : -1))
                .map((eintrag) => (
                  <div
                    key={eintrag.aktionId}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border p-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-semibold text-card-foreground">
                        {t(`aktionstyp.${eintrag.aktionTyp}` as `aktionstyp.${AktionTyp}`)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(eintrag.geraetZeitpunkt).toLocaleTimeString()}
                      </p>
                    </div>
                    <StatusPill tone={statusTon[eintrag.status]}>
                      {t(`status.${eintrag.status}`)}
                    </StatusPill>
                  </div>
                ))
            )}
          </div>

          {/* Ab Phase 2 ruft dieser Knopf den echten Sync-Endpunkt auf - in
              Phase 1 bleibt die Warteschlange strukturell leer, der Knopf ist
              deshalb immer deaktiviert und neuLaden() dient nur dazu, die
              Anzeige nicht veraltet stehen zu lassen. */}
          <button
            type="button"
            disabled={wartend === 0}
            onClick={neuLaden}
            className="mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-background text-xs font-bold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t("jetztSynchronisieren")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
