import Image from "next/image";
import { getFormatter, getTranslations } from "next-intl/server";
import { Camera } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Card, Section, StatusPill, type Tone } from "@/components/ui/kit";
import { DatenquelleBadge } from "@/components/db/datenquelle-badge";
import {
  AufgabeAnlegenFormular,
  AufgabeStatusFormular,
  BelegUploadFormular,
  MengeFormular,
} from "@/components/db/pflueckaufgaben-formulare";
import { NachweiskettenKarte } from "@/components/db/nachweiskette-ansicht";
import { FaelligkeitAnzeige } from "@/components/db/faelligkeit-anzeige";
import { ReferenzCacheSync } from "@/components/db/referenzcache-sync";
import { ladeBrigaden, ladePflueckaufgaben } from "@/lib/data/pflueckaufgaben";
import { ladeNachweiskette, ladePfluecker } from "@/lib/data/nachweiskette";
import { ladeReihenbloecke } from "@/lib/data/reihenbloecke";
import { getSessionProfile } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { aufgabenStatusMeta } from "@/lib/domain/pflueckaufgaben";

// Pflueckaufgaben mit Fotobeleg aus der Datenbank (Meilenstein B).
// Die Auswahl der Aufgabe laeuft ueber die Adresszeile, damit die Ansicht
// serverseitig gerendert bleibt und ein Link auf eine Aufgabe teilbar ist.
export async function PflueckaufgabenAnsicht({
  pfad,
  auswahl,
}: {
  pfad: string;
  auswahl?: string;
}) {
  const [liste, bloecke, brigaden, profil, t] = await Promise.all([
    ladePflueckaufgaben(),
    ladeReihenbloecke(),
    ladeBrigaden(),
    getSessionProfile(),
    getTranslations("pflueckaufgabenDemo"),
  ]);
  const st = await getTranslations("aufgabenStatus");
  const v = await getTranslations("pflueckaufgabenVerwaltung");
  const format = await getFormatter();

  const gewaehlt =
    liste.aufgaben.find((aufgabe) => aufgabe.id === auswahl) ??
    liste.aufgaben.find((aufgabe) => aufgabe.belege.length > 0) ??
    liste.aufgaben[0];

  // Nachweiskette der gewaehlten Aufgabe: Charge, Kuehlkurve, Steigen mit
  // Person, Rueckstandsnachweis. Erst mit Meilenstein C gibt es sie ueberhaupt.
  // Die Pflueckerliste ist fuer die Brigade auf die eigene Brigade beschraenkt
  // - Administration und Betriebsleitung sehen weiterhin alle.
  const [kette, pflueckerListe] = await Promise.all([
    liste.quelle === "db" && gewaehlt
      ? ladeNachweiskette(gewaehlt.id)
      : Promise.resolve(null),
    liste.quelle === "db"
      ? ladePfluecker(profil?.role === "brigade" ? profil.brigadeId : null)
      : Promise.resolve([]),
  ]);

  const live = liste.quelle === "db";
  const darfBearbeiten = live && hasPermission(profil?.role, "pflueckaufgaben", "update");
  const darfAnlegen = live && hasPermission(profil?.role, "pflueckaufgaben", "create");
  const darfAbschliessen =
    live && hasPermission(profil?.role, "pflueckaufgaben", "approve");

  const offeneBloecke = bloecke.bloecke
    .filter((block) => block.status !== "wartezeitgesperrt")
    .map((block) => ({
      wert: block.id,
      text: `${block.code} - ${block.parzelle}`,
    }));

  return (
    <div className="space-y-6">
      {live ? (
        <ReferenzCacheSync
          aufgaben={liste.aufgaben.map((a) => ({
            id: a.id,
            code: a.code,
            reihenblock: a.reihenblock,
            reihenblockId: a.reihenblockId,
            sorte: a.sorte,
            status: a.status,
            zielmengeKg: a.zielmengeKg,
            istMengeKg: a.istMengeKg,
            ausschussKg: a.ausschussKg,
            pflueckerAnzahl: a.pflueckerAnzahl,
          }))}
          pfluecker={pflueckerListe}
          kette={
            kette?.charge
              ? {
                  aufgabeId: gewaehlt!.id,
                  chargeId: kette.charge.id,
                  chargeCode: kette.charge.code,
                }
              : null
          }
        />
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Section
          title={t("listTitle")}
          description={t("listLead")}
          action={<DatenquelleBadge quelle={liste.quelle} />}
        >
          <div className="space-y-2">
            {liste.aufgaben.map((aufgabe) => {
              const aktiv = aufgabe.id === gewaehlt?.id;
              const fortschritt =
                aufgabe.zielmengeKg > 0
                  ? Math.min(
                      100,
                      Math.round((aufgabe.istMengeKg / aufgabe.zielmengeKg) * 100),
                    )
                  : 0;
              return (
                <Link
                  key={aufgabe.id}
                  href={{ pathname: pfad, query: { aufgabe: aufgabe.id } }}
                  scroll={false}
                  className={`block w-full rounded-xl border p-4 text-left transition ${
                    aktiv
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card hover:border-primary/40"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-foreground">
                      {aufgabe.code}
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {aufgabe.status !== "abgeschlossen" ? (
                        <FaelligkeitAnzeige faelligkeit={aufgabe.faelligkeit} />
                      ) : null}
                      <StatusPill tone={aufgabenStatusMeta[aufgabe.status].tone as Tone}>
                        {st(aufgabe.status)}
                      </StatusPill>
                    </div>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-card-foreground">
                    {aufgabe.brigade || v("ohneBrigade")} · {t("block")}{" "}
                    {aufgabe.reihenblock} · {aufgabe.sorte}
                  </p>
                  <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>
                      {aufgabe.istMengeKg} / {aufgabe.zielmengeKg} kg
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Camera className="h-3 w-3" />
                      {aufgabe.belege.length}
                    </span>
                    {aufgabe.qualitaetsfaktor ? (
                      <span>
                        {t("qFactor")} {aufgabe.qualitaetsfaktor.toFixed(2)}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${fortschritt}%` }}
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        </Section>

        <div className="space-y-3">
          <Card>
            <p className="text-sm font-black text-card-foreground">
              {t("proofTitle")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{t("proofLead")}</p>

            <div className="mt-4 space-y-3">
              {!gewaehlt || gewaehlt.belege.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                  {t("noProof")}
                </p>
              ) : (
                gewaehlt.belege.map((beleg, index) => (
                  <figure
                    key={beleg.id}
                    className="overflow-hidden rounded-xl border border-border bg-muted/30"
                  >
                    <div className="relative h-40 w-full">
                      <Image
                        src={beleg.bildUrl}
                        alt={beleg.hinweis}
                        fill
                        sizes="(min-width: 1024px) 360px, 100vw"
                        priority={index === 0}
                        // Signierte Storage-URLs und SVG-Platzhalter laufen
                        // beide nicht durch den Bildoptimierer.
                        unoptimized
                        className="object-cover"
                      />
                    </div>
                    <figcaption className="p-3">
                      <div className="flex items-center justify-between gap-2">
                        <StatusPill tone="info">{t(`art.${beleg.art}`)}</StatusPill>
                        <span className="text-[11px] text-muted-foreground">
                          {format.dateTime(new Date(beleg.aufgenommen), {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs text-foreground">{beleg.hinweis}</p>
                      {!beleg.hochgeladen ? (
                        <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                          {v("platzhalterBild")}
                        </p>
                      ) : null}
                    </figcaption>
                  </figure>
                ))
              )}
            </div>

            {gewaehlt && darfBearbeiten ? (
              <div className="mt-4 border-t border-border pt-4">
                <BelegUploadFormular aufgabeId={gewaehlt.id} />
              </div>
            ) : null}
          </Card>

          {gewaehlt && darfBearbeiten ? (
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-black text-card-foreground">
                    {v("ablauf.titel")}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {v("ablauf.lead")}
                  </p>
                </div>
                {gewaehlt.status !== "abgeschlossen" ? (
                  <FaelligkeitAnzeige faelligkeit={gewaehlt.faelligkeit} />
                ) : null}
              </div>
              <div className="mt-3 space-y-3">
                {gewaehlt.status === "offen" ? (
                  <AufgabeStatusFormular
                    id={gewaehlt.id}
                    ziel="angenommen"
                    label={v("ablauf.annehmen")}
                  />
                ) : null}
                {gewaehlt.status === "angenommen" ? (
                  <AufgabeStatusFormular
                    id={gewaehlt.id}
                    ziel="in_arbeit"
                    label={v("ablauf.starten")}
                  />
                ) : null}
                {gewaehlt.status === "in_arbeit" ||
                gewaehlt.status === "beleg_pruefung" ? (
                  <MengeFormular
                    id={gewaehlt.id}
                    istMenge={gewaehlt.istMengeKg}
                    ausschussKg={gewaehlt.ausschussKg}
                    pflueckerAnzahl={gewaehlt.pflueckerAnzahl}
                  />
                ) : null}
              </div>
            </Card>
          ) : null}

          {kette && gewaehlt ? (
            <NachweiskettenKarte
              kette={kette}
              aufgabeId={gewaehlt.id}
              pfluecker={pflueckerListe}
              darfErfassen={darfBearbeiten}
            />
          ) : null}

          {gewaehlt?.status === "beleg_pruefung" && darfAbschliessen ? (
            <Card className="border-warning/30 bg-warning/[0.06]">
              <p className="text-sm font-black text-warning">{t("reviewTitle")}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {t("reviewLead")}
              </p>
              <div className="mt-3">
                <AufgabeStatusFormular
                  id={gewaehlt.id}
                  ziel="abgeschlossen"
                  label={t("approve")}
                  mitQualitaet
                />
              </div>
            </Card>
          ) : null}

          <Card className="bg-muted/30 text-xs leading-5 text-muted-foreground">
            {t("note")}
          </Card>
        </div>
      </div>

      {darfAnlegen && offeneBloecke.length > 0 ? (
        <AufgabeAnlegenFormular
          bloecke={offeneBloecke}
          brigaden={brigaden.map((brigade) => ({
            wert: brigade.id,
            text: brigade.name,
          }))}
        />
      ) : null}
    </div>
  );
}
