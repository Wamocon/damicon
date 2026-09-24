import { ReferenzCacheSync } from "@/components/db/referenzcache-sync";
import { PflueckaufgabenListe } from "@/components/db/pflueckaufgaben-liste";
import { PflueckaufgabeDetail } from "@/components/db/pflueckaufgabe-detail";
import { ListeMitDetailpanel } from "@/components/ui/liste";
import {
  ladeAufgabe,
  ladeAufgabenSpiegel,
  ladeBrigaden,
} from "@/lib/data/pflueckaufgaben";
import { ladeAufgabenSeite } from "@/lib/data/pflueckaufgaben-liste";
import { ladeNachweiskette, ladePfluecker } from "@/lib/data/nachweiskette";
import { ladeReihenbloecke } from "@/lib/data/reihenbloecke";
import { getSessionProfile } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { leseParameter, listenQuery, type SuchParameter } from "@/lib/listen/parameter";
import { nachbarn } from "@/lib/listen/seiten";
import { zeitraumGrenzen } from "@/lib/listen/zeitraum";
import {
  brigadeBedingung,
  darfAufgabeBearbeiten,
  pflueckFilterSchluessel,
  pflueckListenSchema,
  pflueckStandard,
} from "@/lib/domain/pflueckaufgaben-liste";

// Pflueckaufgaben mit Fotobeleg (Meilenstein B), seit WMCNL-2488 als Liste
// mit Detailansicht (DESIGN.md Abschnitt 14): links die gefilterte,
// geblaetterte Liste, rechts - oder an ihrer Stelle - die gewaehlte Aufgabe.
//
// Alles steht in der Adresse: Filter, Seite, Auswahl, Reiter. Die Ansicht
// bleibt damit serverseitig gerendert, ein Link auf eine gefilterte Liste
// oder eine offene Aufgabe ist teilbar, und ohne JavaScript bleibt sie
// bedienbar. Ohne ?aufgabe= zeigt die Seite nur die Liste - die
// Detailansicht oeffnet erst auf Klick.
export async function PflueckaufgabenAnsicht({
  pfad,
  suche,
}: {
  pfad: string;
  suche: SuchParameter;
}) {
  const profil = await getSessionProfile();
  const rolle = profil?.role ?? null;
  const standard = pflueckStandard(rolle);
  const roh = leseParameter(pflueckListenSchema, suche);
  const werte = { ...roh, brigade: roh.brigade ?? standard.brigade };
  const jetzt = new Date();

  const mitDatenbank = isSupabaseConfigured();
  const darfBearbeitenRecht = mitDatenbank && hasPermission(rolle, "pflueckaufgaben", "update");
  const darfAnlegenRecht = mitDatenbank && hasPermission(rolle, "pflueckaufgaben", "create");
  const darfAbschliessenRecht =
    mitDatenbank && hasPermission(rolle, "pflueckaufgaben", "approve");

  const [seite, brigaden, bloecke, detail, spiegel, pflueckerListe] = await Promise.all([
    ladeAufgabenSeite(
      {
        status: werte.status,
        suche: werte.suche,
        brigade: brigadeBedingung(werte.brigade, rolle, profil?.brigadeId),
        grenzen: zeitraumGrenzen(werte.zeitraum, { von: werte.von, bis: werte.bis }, jetzt),
      },
      werte.seite,
      jetzt,
    ),
    ladeBrigaden(),
    darfAnlegenRecht ? ladeReihenbloecke() : Promise.resolve(null),
    werte.aufgabe ? ladeAufgabe(werte.aufgabe) : Promise.resolve(null),
    // Offline-Spiegel (Anforderung 2.5) fuer die Rollen, die im Feld
    // schreiben: alle offenen Aufgaben, unabhaengig vom Filter der Liste.
    darfBearbeitenRecht
      ? ladeAufgabenSpiegel(rolle === "brigade" ? { brigadeId: profil?.brigadeId ?? null } : null)
      : Promise.resolve([]),
    // Die Pflueckerliste ist fuer die Brigade auf die eigene Brigade
    // beschraenkt - Administration und Betriebsleitung sehen weiterhin alle.
    darfBearbeitenRecht
      ? ladePfluecker(rolle === "brigade" ? profil?.brigadeId : null)
      : Promise.resolve([]),
  ]);

  // Schreiben nur mit echter Datenbank: bei Beispieldaten oder einem
  // Datenbankfehler (Rueckfall auf Beispieldaten) entfallen alle Formulare.
  const live = seite.quelle === "db";
  const aufgabe = detail?.aufgabe ?? null;
  const darfBearbeiten = live && darfBearbeitenRecht;
  const darfHandeln = Boolean(aufgabe && darfBearbeiten && darfAufgabeBearbeiten(profil, aufgabe));
  const darfAbschliessen = live && darfAbschliessenRecht;
  // Anforderung 2.10: Die Stichprobenkontrolle je Steige ist ein anderes Recht
  // als der Abschluss der ganzen Aufgabe. Sie steht zusaetzlich dem am
  // Sammelpunkt benannten Vorarbeiter offen, der die Rolle "brigade" traegt und
  // damit kein approve hat. Dieselbe Bedingung prueft steigeKontrollieren()
  // (lib/actions/nachweiskette.ts).
  const darfKontrollieren = live && (darfAbschliessen || profil?.darfKontrollieren === true);

  // Die Nachweiskette nur, wenn ihr Reiter offen ist - sie ist die teuerste
  // Abfrage der Seite und wird sonst nicht gezeigt.
  const kette =
    live && aufgabe && werte.reiter === "kette" ? await ladeNachweiskette(aufgabe.id) : null;

  const offeneBloecke = (bloecke?.bloecke ?? [])
    .filter((block) => block.status !== "wartezeitgesperrt")
    .map((block) => ({ wert: block.id, text: `${block.code} - ${block.parzelle}` }));

  const listenQueryOhneAuswahl = listenQuery({
    werte,
    standard,
    aenderung: { aufgabe: undefined, reiter: undefined },
    filterSchluessel: pflueckFilterSchluessel,
  });
  const listenSuche = new URLSearchParams(listenQueryOhneAuswahl).toString();

  return (
    <div className="space-y-6">
      {live && darfBearbeitenRecht ? (
        <ReferenzCacheSync
          aufgaben={spiegel}
          pfluecker={pflueckerListe}
          kette={
            kette?.charge && aufgabe
              ? { aufgabeId: aufgabe.id, chargeId: kette.charge.id, chargeCode: kette.charge.code }
              : null
          }
        />
      ) : null}
      <ListeMitDetailpanel
        auswahlId={werte.aufgabe ?? null}
        listenSchluessel={listenSuche}
        schliessenZiel={listenSuche ? `${pfad}?${listenSuche}` : pfad}
        liste={
          <PflueckaufgabenListe
            pfad={pfad}
            werte={werte}
            standard={standard}
            seite={seite}
            brigaden={brigaden}
            rolle={rolle}
            neuanlage={
              live && darfAnlegenRecht && offeneBloecke.length > 0
                ? { bloecke: offeneBloecke }
                : null
            }
          />
        }
        panel={
          werte.aufgabe ? (
            <PflueckaufgabeDetail
              pfad={pfad}
              werte={werte}
              standard={standard}
              aufgabe={aufgabe}
              live={live}
              reiter={werte.reiter}
              nachbarn={nachbarn(
                seite.zeilen.map((zeile) => zeile.id),
                werte.aufgabe,
              )}
              kette={kette}
              pfluecker={pflueckerListe}
              rechte={{
                darfHandeln,
                fremdeBrigade: Boolean(aufgabe && darfBearbeiten && !darfHandeln),
                darfAbschliessen,
                darfKontrollieren,
              }}
            />
          ) : null
        }
      />
    </div>
  );
}
