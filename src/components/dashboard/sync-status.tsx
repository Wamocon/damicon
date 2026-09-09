"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { CloudOff, RefreshCw, Wifi, X } from "lucide-react";
import { useOnlineStatus } from "@/lib/offline/use-online-status";
import {
  alleEintraege,
  eintragEntfernen,
  WARTESCHLANGE_GEAENDERT_EREIGNIS,
} from "@/lib/offline/warteschlange";
import { synchronisiere } from "@/lib/offline/sync-engine";
import type { AktionTyp, WarteschlangenEintrag } from "@/lib/offline/db";
import { StatusPill, type Tone } from "@/components/ui/kit";

// Anforderung 2.5: Online-/Offline-Erkennung und Warteschlangen-Anzeige seit
// Phase 1, echter Abgleich gegen /api/sync seit Phase 2. Kein
// Service-Worker-Background-Sync (schwache/keine Unterstuetzung auf iOS
// Safari, relevant fuer Feldgeraete) - der Abgleich laeuft ueber das
// online-Ereignis, Fokus/Mount, ein Intervall als Sicherheitsnetz und den
// manuellen Knopf.

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
  const format = useFormatter();
  const router = useRouter();
  const online = useOnlineStatus();
  const [eintraege, setEintraege] = useState<WarteschlangenEintrag[]>([]);
  const [offen, setOffen] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const laeuftRef = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const neuLaden = useCallback(() => {
    void alleEintraege().then(setEintraege);
  }, []);

  // Ein Sync-Lauf nach dem anderen, nie ueberlappend - laeuftRef statt nur
  // des laeuft-States, weil die Trigger (Intervall, online-Ereignis, Fokus)
  // synchron und schnell hintereinander feuern koennen, bevor der State aus
  // einem vorherigen Aufruf ueberhaupt neu gerendert wurde.
  const synchronisierenUndLaden = useCallback(() => {
    if (laeuftRef.current || !navigator.onLine) {
      neuLaden();
      return;
    }
    laeuftRef.current = true;
    setLaeuft(true);
    void synchronisiere()
      .then((ergebnis) => {
        if (ergebnis.verarbeitet > 0) router.refresh();
      })
      .finally(() => {
        laeuftRef.current = false;
        setLaeuft(false);
        neuLaden();
      });
  }, [neuLaden, router]);

  useEffect(() => {
    // setTimeout statt direktem Aufruf: synchronisierenUndLaden() setzt
    // synchron laeuft=true, bevor der eigentliche (asynchrone) Sync beginnt -
    // ein direkter Aufruf im Effekt-Koerper waere ein synchrones setState
    // waehrend des Effekts (react-hooks/set-state-in-effect). Die Verzoegerung
    // um einen Tick ist fuer einen Mount-Trigger nicht wahrnehmbar.
    const anfangslauf = window.setTimeout(synchronisierenUndLaden, 0);
    window.addEventListener("online", synchronisierenUndLaden);
    window.addEventListener("focus", synchronisierenUndLaden);
    // Ein Formular ausserhalb dieser Komponente (useOfflineFormular) hat
    // gerade in dieselbe IndexedDB geschrieben - ohne dieses Ereignis wuerde
    // das Panel bis zum naechsten Fokus/Intervall "keine wartenden
    // Eintraege" zeigen, obwohl gerade einer entstanden ist. Nur neu laden,
    // nicht synchronisieren - ein aktiver Sync-Lauf stoesst sich daran
    // ohnehin selbst nicht (laeuftRef).
    window.addEventListener(WARTESCHLANGE_GEAENDERT_EREIGNIS, neuLaden);
    const intervall = window.setInterval(synchronisierenUndLaden, AKTUALISIERUNGS_INTERVALL_MS);
    return () => {
      window.clearTimeout(anfangslauf);
      window.removeEventListener("online", synchronisierenUndLaden);
      window.removeEventListener("focus", synchronisierenUndLaden);
      window.removeEventListener(WARTESCHLANGE_GEAENDERT_EREIGNIS, neuLaden);
      window.clearInterval(intervall);
    };
  }, [synchronisierenUndLaden, neuLaden]);

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
                        {format.dateTime(new Date(eintrag.geraetZeitpunkt), { timeStyle: "medium" })}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <StatusPill tone={statusTon[eintrag.status]}>
                        {t(`status.${eintrag.status}`)}
                      </StatusPill>
                      {eintrag.status === "konflikt" ? (
                        // Anforderung 2.5, Phase 4: ein Konflikt (CAS-Guard
                        // fehlgeschlagen, jemand/etwas anderes hat den
                        // Zustand zwischenzeitlich veraendert) wird nicht
                        // automatisch erneut gesendet (siehe
                        // sendbareEintraege()) - ohne diesen Knopf bliebe der
                        // Eintrag dauerhaft in der Warteschlange stehen, ohne
                        // dass die Brigade ihn loswerden kann. Die Aenderung
                        // selbst ist damit verworfen, nicht nachtraeglich
                        // angewendet - die Brigade muss den aktuellen Stand
                        // pruefen und bei Bedarf neu erfassen.
                        <button
                          type="button"
                          aria-label={t("verwerfen")}
                          onClick={() => void eintragEntfernen(eintrag.aktionId)}
                          className="inline-flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))
            )}
          </div>

          <button
            type="button"
            disabled={wartend === 0 || !online || laeuft}
            onClick={synchronisierenUndLaden}
            className="mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-background text-xs font-bold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${laeuft ? "animate-spin" : ""}`} />
            {t("jetztSynchronisieren")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
