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
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  leseParameter,
  listenQuery,
  type Parameterwert,
  type SuchParameter,
} from "@/lib/listen/parameter";
import { nachbarn } from "@/lib/listen/seiten";
import { zeitraumGrenzen } from "@/lib/listen/zeitraum";
import {
  brigadeBedingung,
  darfBelegeSehen,
  pflueckFilterSchluessel,
  pflueckListenSchema,
  pflueckRechte,
  pflueckStandard,
  schreibUmfang,
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

  // Was geladen wird, haengt nur am Recht und an der Datenbank; ob sie auch
  // antwortet (live), steht erst danach fest.
  const vorab = pflueckRechte(profil, isSupabaseConfigured());
  const umfang = schreibUmfang(profil);

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
    vorab.anlegen ? ladeReihenbloecke() : Promise.resolve(null),
    werte.aufgabe ? ladeAufgabe(werte.aufgabe) : Promise.resolve(null),
    // Offline-Spiegel (Anforderung 2.5) fuer die Rollen, die im Feld
    // schreiben: alle offenen Aufgaben, unabhaengig vom Filter der Liste.
    vorab.bearbeiten ? ladeAufgabenSpiegel(umfang) : Promise.resolve([]),
    // Die Brigade bekommt nur die Pfluecker der eigenen Brigade, ohne
    // Zuordnung gar keine; Administration und Betriebsleitung alle.
    vorab.bearbeiten && (umfang === null || umfang.brigadeId)
      ? ladePfluecker(umfang?.brigadeId ?? null)
      : Promise.resolve([]),
  ]);

  // Schreiben nur mit echter Datenbank: bei Beispieldaten oder einem
  // Datenbankfehler (Rueckfall auf Beispieldaten) entfallen alle Formulare.
  const live = seite.quelle === "db";
  const aufgabe = detail?.aufgabe ?? null;
  const rechte = pflueckRechte(profil, live, aufgabe);

  // Die Nachweiskette nur, wenn ihr Reiter offen ist - sie ist die teuerste
  // Abfrage der Seite und wird sonst nicht gezeigt.
  const kette =
    live && aufgabe && werte.reiter === "kette" ? await ladeNachweiskette(aufgabe.id) : null;

  const offeneBloecke = (bloecke?.bloecke ?? [])
    .filter((block) => block.status !== "wartezeitgesperrt")
    .map((block) => ({ wert: block.id, text: `${block.code} - ${block.parzelle}` }));

  // Jeder Link der Seite entsteht hier: Standardwerte fallen weg, ein
  // Filterwechsel springt auf Seite 1 (listenQuery).
  const query = (aenderung: Record<string, Parameterwert>) =>
    listenQuery({ werte, standard, aenderung, filterSchluessel: pflueckFilterSchluessel });
  const listenSuche = new URLSearchParams(query({ aufgabe: undefined, reiter: undefined })).toString();

  return (
    <div className="space-y-6">
      {rechte.bearbeiten ? (
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
            query={query}
            seite={seite}
            brigaden={brigaden}
            rolle={rolle}
            belegeSichtbar={darfBelegeSehen(rolle)}
            neuanlage={
              rechte.anlegen && offeneBloecke.length > 0 ? { bloecke: offeneBloecke } : null
            }
          />
        }
        panel={
          werte.aufgabe ? (
            <PflueckaufgabeDetail
              pfad={pfad}
              query={query}
              aufgabe={aufgabe}
              ladefehler={detail?.quelle === "fehler"}
              live={live}
              reiter={werte.reiter}
              nachbarn={nachbarn(
                seite.zeilen.map((zeile) => zeile.id),
                werte.aufgabe,
              )}
              kette={kette}
              pfluecker={pflueckerListe}
              rechte={rechte}
              belegeSichtbar={darfBelegeSehen(rolle)}
            />
          ) : null
        }
      />
    </div>
  );
}
