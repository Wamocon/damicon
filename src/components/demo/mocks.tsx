"use client";

import { useFormatter, useTranslations } from "next-intl";
import { ThermometerSnowflake } from "lucide-react";
import { Card, Section, StatusPill } from "@/components/ui/kit";
import { ModulePlaceholder } from "@/components/dashboard/module-meta";
import type { ModuleDef } from "@/lib/modules";

// Kuehlketten-Uhr: im Prototyp ein statischer Ableseblock. Analyse: harte
// 60-Minuten-Grenze zwischen Pfluecken und Vorkuehlung, Zieltemperatur 0-1 C.
export function KuehlketteMock({ module }: { module: ModuleDef }) {
  const t = useTranslations("kuehlketteMock");
  const format = useFormatter();
  const chargen = [
    { id: "CH-0902-14", block: "T-N-A-01", minuten: 41, temp: 3.8 },
    { id: "CH-0902-15", block: "T-O-A-01", minuten: 58, temp: 6.1 },
    { id: "CH-0902-12", block: "T-N-A-03", minuten: 72, temp: 8.4 },
  ];

  return (
    <div className="space-y-6">
      <Section title={t("clockTitle")} description={t("clockLead")}>
        <div className="grid gap-3 sm:grid-cols-3">
          {chargen.map((charge) => {
            const tone =
              charge.minuten <= 45
                ? "success"
                : charge.minuten <= 60
                  ? "warning"
                  : "danger";
            const pct = Math.min(100, Math.round((charge.minuten / 60) * 100));
            return (
              <Card key={charge.id}>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-foreground">
                    {charge.id}
                  </span>
                  <StatusPill tone={tone}>
                    {charge.minuten} / 60 min
                  </StatusPill>
                </div>
                <p className="mt-2 text-3xl font-black text-foreground">
                  {format.number(charge.temp, { minimumFractionDigits: 1 })} °C
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("block")} {charge.block}
                </p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${
                      tone === "danger"
                        ? "bg-destructive"
                        : tone === "warning"
                          ? "bg-warning"
                          : "bg-success"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </Card>
            );
          })}
        </div>
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <ThermometerSnowflake className="h-4 w-4" />
          {t("hint")}
        </p>
      </Section>
      <ModulePlaceholder module={module} />
    </div>
  );
}

// QrSteigenMock entfaellt (WMCNL-1439): das Modul "qr_steigen" laeuft jetzt
// ueber die datenbankgestuetzte Ansicht in
// src/components/db/qr-steigen-ansicht.tsx, analog zu
// dokumente/standort/pflueckaufgaben/reihenbloecke/compliance. Die
// Scan-Oberflaeche am Ausgabepunkt (Server-Abgleich beim Abgeben) bleibt
// offen - dieser Ausbauschritt deckt Erzeugung/Anzeige/Druck ab, siehe
// modules.ts.

// KiAssistentMock entfaellt (Anforderung 5.4/5.5): das Modul "ki_assistent"
// laeuft jetzt ueber die datenbankgestuetzte Ansicht in
// src/components/db/ki-assistent-ansicht.tsx, mit echter Anbindung an einen
// per Admin konfigurierten KI-Anbieter statt eines reinen, lokal
// nachgestellten Chatfensters ohne Modellaufruf.
