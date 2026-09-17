import { getFormatter, getTranslations } from "next-intl/server";
import { AlertTriangle, CheckCircle2, Snowflake } from "lucide-react";
import { Card, StatusPill, type Tone } from "@/components/ui/kit";
import {
  ArbeitszeitFormular,
  KuehlmessungFormular,
  SteigeFormular,
  SteigeKontrollierenKnopf,
} from "@/components/db/nachweiskette-formulare";
import { KuehlkettenAlarm } from "@/components/db/kuehlketten-alarm";
import { SteigeScanFeld } from "@/components/db/steige-scan-feld";
import type { KuehlMessung, Nachweiskette, PflueckerOption } from "@/lib/data/nachweiskette";

const ergebnisTon: Record<string, Tone> = {
  ok: "success",
  warnung: "warning",
  verstoss: "danger",
};

// Die Kette einer Pflueckaufgabe an einem Ort: Charge, Kuehlkurve mit der
// 60-Minuten-Grenze, Steigen mit Person und der Rueckstandsnachweis.
export async function NachweiskettenKarte({
  kette,
  aufgabeId,
  pfluecker,
  darfErfassen,
  darfKontrollieren,
}: {
  kette: Nachweiskette;
  aufgabeId: string;
  pfluecker: PflueckerOption[];
  darfErfassen: boolean;
  /** Anforderung 2.10: Stichprobenkontrolle je Steige - Buero-/Leitungsrecht. */
  darfKontrollieren: boolean;
}) {
  const t = await getTranslations("nachweiskette");
  const format = await getFormatter();

  if (!kette.charge) {
    return (
      <Card className="bg-muted/30 text-xs leading-5 text-muted-foreground">
        {t("keineCharge")}
      </Card>
    );
  }

  const c = kette.charge;
  // Der Zustand kommt aus dem strengsten Messergebnis, das die Datenbank
  // schon geurteilt hat (public.kuehlkette_bewerten) - nicht aus einer eigenen
  // Minutenschwelle der Oberflaeche. Sonst kann die Karte grün zeigen, wo die
  // Datenbank bereits eine Warnung oder einen Verstoss festgehalten hat, weil
  // seit Meilenstein C auch verspaetete Messungen einen Zeitpunkt bekommen.
  const rang = { verstoss: 2, warnung: 1, ok: 0 } as const;
  const schwerste = kette.messungen.reduce<KuehlMessung["ergebnis"] | null>(
    (schlimmste, m) =>
      schlimmste === null || rang[m.ergebnis] > rang[schlimmste] ? m.ergebnis : schlimmste,
    null,
  );
  const offen = schwerste === null;
  const gerissen = schwerste === "verstoss";
  const warnung = schwerste === "warnung";
  const verstoesse = kette.behandlungen.filter((b) => !b.eingehalten);

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-black text-card-foreground">{t("titel")}</p>
        <span className="font-mono text-xs text-muted-foreground">{c.code}</span>
      </div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("lead")}</p>

      {/* Kühlkette: die Zahl, an der der Preisunterschied hängt.
          Anforderung 3.1: solange noch keine Messung vorliegt, aber die Uhr
          bereits läuft (pflückZeitpunkt gesetzt), zeigt eine live
          mitzählende Warnung die verbleibende Zeit statt nur rückblickend
          "läuft" zu melden. */}
      {offen && c.pflueckZeitpunkt ? (
        <div className="mt-4">
          <KuehlkettenAlarm key={c.pflueckZeitpunkt} pflueckZeitpunkt={c.pflueckZeitpunkt} />
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
            {t("kuehlung.regel")}
          </p>
        </div>
      ) : (
        <div
          className={`mt-4 rounded-xl border p-3 ${
            gerissen
              ? "border-destructive/25 bg-destructive/[0.06]"
              : offen || warnung
                ? "border-warning/25 bg-warning/[0.06]"
                : "border-success/25 bg-success/[0.06]"
          }`}
        >
          <div className="flex items-center gap-2">
            <Snowflake
              className={`h-4 w-4 ${
                gerissen ? "text-destructive" : offen || warnung ? "text-warning" : "text-success"
              }`}
            />
            <p className="text-xs font-black text-foreground">
              {offen
                ? t("kuehlung.offen")
                : t("kuehlung.minuten", { minuten: c.minutenBisVorkuehlung ?? 0 })}
            </p>
            <StatusPill tone={gerissen ? "danger" : offen || warnung ? "warning" : "success"}>
              {gerissen
                ? t("kuehlung.gerissen")
                : offen
                  ? t("kuehlung.laeuft")
                  : warnung
                    ? t("kuehlung.grenzwertig")
                    : t("kuehlung.gehalten")}
            </StatusPill>
          </div>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
            {t("kuehlung.regel")}
          </p>
        </div>
      )}
      {kette.messungen.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {kette.messungen.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground"
            >
              <StatusPill tone={ergebnisTon[m.ergebnis] ?? "neutral"}>
                {t(`ergebnis.${m.ergebnis}`)}
              </StatusPill>
              <span className="font-mono">
                {format.number(m.temperaturC, { maximumFractionDigits: 1 })} °C
              </span>
              {m.minutenSeitPfluecken !== null ? (
                <span>{t("kuehlung.nachMinuten", { minuten: m.minutenSeitPfluecken })}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {/* Menge und Ausschuss */}
      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[
          [t("menge"), `${format.number(c.mengeKg, { maximumFractionDigits: 1 })} kg`],
          [t("ausschuss"), `${format.number(c.ausschussKg, { maximumFractionDigits: 1 })} kg`],
          [t("steigen"), String(kette.steigen.length)],
        ].map(([label, wert]) => (
          <div key={label} className="rounded-lg border border-border bg-muted/30 p-2">
            <dd className="text-sm font-black text-foreground">{wert}</dd>
            <dt className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              {label}
            </dt>
          </div>
        ))}
      </dl>

      {/* Steigen mit Person - hier reicht die Kette bis zum Pflücker */}
      {kette.steigen.length > 0 ? (
        <div className="mt-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            {t("steigenTitel")}
          </p>
          {/* Anforderung 2.7: "ein Scan am Sammelpunkt ruft die Steige auf".
              Steht ueber der Liste, weil er sie ersetzt, sobald am Erntetag
              mehr Steigen zusammenkommen, als sich ueberblicken lassen - die
              Liste selbst zeigt ohnehin nur die ersten sechs. */}
          <div className="mt-1.5">
            <SteigeScanFeld
              steigen={kette.steigen.map((s) => ({
                id: s.id,
                code: s.code,
                pfluecker: s.pfluecker,
                gewichtKg: s.gewichtKg,
                kontrolliertAm: s.kontrolliertAm,
              }))}
              darfKontrollieren={darfKontrollieren}
            />
          </div>
          <ul className="mt-1.5 space-y-1">
            {kette.steigen.slice(0, 6).map((s) => (
              <li
                key={s.id}
                className="flex items-baseline justify-between gap-2 text-[11px]"
              >
                <span className="font-mono text-muted-foreground">{s.code}</span>
                <span className="font-semibold text-foreground">
                  {s.pfluecker ?? t("ohnePerson")}
                </span>
                <span className="text-muted-foreground">
                  {s.gewichtKg !== null
                    ? `${format.number(s.gewichtKg, { maximumFractionDigits: 1 })} kg`
                    : "-"}
                </span>
                {s.kontrolliertAm ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-success">
                    <CheckCircle2 className="h-3 w-3" />
                    {t("steigenKontrolliertLabel")}
                  </span>
                ) : darfKontrollieren ? (
                  <SteigeKontrollierenKnopf id={s.id} code={s.code} />
                ) : null}
              </li>
            ))}
            {kette.steigen.length > 6 ? (
              <li className="text-[11px] text-muted-foreground">
                {t("weitereSteigen", { anzahl: kette.steigen.length - 6 })}
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {/* Rückstandsnachweis je Charge */}
      <div className="mt-4 border-t border-border pt-3">
        <div className="flex items-center gap-2">
          {verstoesse.length > 0 ? (
            <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 text-success" />
          )}
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            {t("rueckstand.titel")}
          </p>
        </div>
        {kette.behandlungen.length === 0 ? (
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {t("rueckstand.keine")}
          </p>
        ) : (
          <ul className="mt-1.5 space-y-1.5">
            {kette.behandlungen.map((b) => (
              <li key={`${b.mittel}-${b.behandeltAm}`} className="text-[11px]">
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusPill tone={b.eingehalten ? "success" : "danger"}>
                    {b.eingehalten ? t("rueckstand.eingehalten") : t("rueckstand.verletzt")}
                  </StatusPill>
                  <span className="font-semibold text-foreground">{b.mittel}</span>
                </div>
                <p className="mt-0.5 leading-4 text-muted-foreground">
                  {t("rueckstand.zeile", {
                    behandelt: b.behandeltAm,
                    wartezeit: b.wartezeitTage,
                    frei: b.freigabeAm,
                    tage: b.tageVorErnte,
                  })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {darfErfassen && pfluecker.length > 0 ? (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          <SteigeFormular aufgabeId={aufgabeId} pfluecker={pfluecker} />
          <ArbeitszeitFormular aufgabeId={aufgabeId} pfluecker={pfluecker} />
          <KuehlmessungFormular aufgabeId={aufgabeId} />
        </div>
      ) : null}
    </Card>
  );
}
