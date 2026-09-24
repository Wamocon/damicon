import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Aufklapper, type Ziel } from "@/components/ui/kit";
import { AufgabeStatusFormular, MengeFormular } from "@/components/db/pflueckaufgaben-formulare";
import type { AufgabeDetail } from "@/lib/data/pflueckaufgaben";

// "Naechster Schritt" in der Uebersicht der Detailansicht (WMCNL-2488). Eine
// Regel fuer jeden Status: der naechste Handgriff steht hier, nicht irgendwo
// weiter unten. Vorher stand er an zweiter oder vierter Stelle der rechten
// Spalte, unter den Beispielfotos.
//
// Wer was darf, entscheidet der Aufrufer. Die Datenbank prueft ohnehin selbst;
// die Pruefung hier sorgt nur dafuer, dass niemand Knoepfe sieht, die dann
// abgelehnt werden.

const MAX_VORSCHAU = 4;

export async function PflueckaufgabeSchritt({
  aufgabe,
  live,
  darfHandeln,
  fremdeBrigade,
  darfAbschliessen,
  fotoZiel,
}: {
  aufgabe: AufgabeDetail;
  /** Mit Datenbank. Im Demo-Modus gibt es keine Anmeldung und nichts zu speichern. */
  live: boolean;
  /** Recht zum Bearbeiten und, fuer die Brigade, eigene oder freie Aufgabe. */
  darfHandeln: boolean;
  /** Recht zum Bearbeiten, aber die Aufgabe gehoert einer anderen Brigade. */
  fremdeBrigade: boolean;
  /** Belegpruefung und Freigabe (pflueckaufgaben:approve). */
  darfAbschliessen: boolean;
  /** Reiter Fotobelege dieser Aufgabe, fuer die Vorschaubilder. */
  fotoZiel: Ziel;
}) {
  const [s, v, t] = await Promise.all([
    getTranslations("pflueckaufgabenVerwaltung.schritt"),
    getTranslations("pflueckaufgabenVerwaltung"),
    getTranslations("pflueckaufgabenDemo"),
  ]);

  const hinweis = (text: string) => <p className="schrift-dense text-muted-foreground">{text}</p>;
  const ohneRecht = hinweis(fremdeBrigade ? s("fremdeBrigade") : s("nurAnsicht"));

  const mengeKorrigieren = (
    <Aufklapper titel={s("mengeKorrigieren")}>
      <MengeFormular
        id={aufgabe.id}
        istMenge={aufgabe.istMengeKg}
        ausschussKg={aufgabe.ausschussKg}
        pflueckerAnzahl={aufgabe.pflueckerAnzahl}
      />
    </Aufklapper>
  );

  let inhalt;
  if (!live) {
    inhalt = hinweis(s("nurMitDatenbank"));
  } else {
    switch (aufgabe.status) {
      case "offen":
        inhalt = darfHandeln ? (
          <AufgabeStatusFormular id={aufgabe.id} ziel="angenommen" label={v("ablauf.annehmen")} />
        ) : (
          ohneRecht
        );
        break;
      case "angenommen":
        inhalt = darfHandeln ? (
          <AufgabeStatusFormular id={aufgabe.id} ziel="in_arbeit" label={v("ablauf.starten")} />
        ) : (
          ohneRecht
        );
        break;
      case "in_arbeit":
        inhalt = darfHandeln ? (
          <div className="space-y-3">
            {hinweis(s("mengeHinweis"))}
            <MengeFormular
              id={aufgabe.id}
              istMenge={aufgabe.istMengeKg}
              ausschussKg={aufgabe.ausschussKg}
              pflueckerAnzahl={aufgabe.pflueckerAnzahl}
            />
          </div>
        ) : (
          ohneRecht
        );
        break;
      case "beleg_pruefung":
        if (darfAbschliessen) {
          const vorschau = aufgabe.belege.slice(0, MAX_VORSCHAU);
          inhalt = (
            <div className="space-y-3">
              <div className="rounded-xl border border-warning/30 bg-warning/6 p-3">
                <p className="text-sm font-black text-warning">{t("reviewTitle")}</p>
                <p className="mt-1 schrift-dense text-muted-foreground">{s("pruefenLead")}</p>
                {vorschau.length > 0 ? (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {vorschau.map((beleg, index) => (
                      <li key={beleg.id}>
                        <Link
                          href={fotoZiel}
                          replace
                          scroll={false}
                          prefetch={false}
                          aria-label={s("belegAnsehen", { nummer: index + 1 })}
                          className="relative block h-16 w-16 overflow-hidden rounded-lg border border-border bg-muted/30 transition duration-knapp hover:border-primary/40"
                        >
                          <Image
                            src={beleg.bildUrl}
                            alt=""
                            fill
                            sizes="64px"
                            // Signierte Storage-URLs und SVG-Platzhalter laufen
                            // beide nicht durch den Bildoptimierer.
                            unoptimized
                            className="object-cover"
                          />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 schrift-dense font-semibold text-destructive">
                    {s("keinBeleg")}
                  </p>
                )}
              </div>
              <AufgabeStatusFormular
                id={aufgabe.id}
                ziel="abgeschlossen"
                label={t("approve")}
                mitQualitaet
              />
              {darfHandeln ? mengeKorrigieren : null}
            </div>
          );
        } else if (darfHandeln) {
          inhalt = (
            <div className="space-y-3">
              {hinweis(s("warten"))}
              {mengeKorrigieren}
            </div>
          );
        } else {
          inhalt = hinweis(s("warten"));
        }
        break;
      case "abgeschlossen":
        inhalt = hinweis(s("fertig"));
        break;
    }
  }

  return (
    <section aria-labelledby="naechster-schritt" className="rounded-xl border border-border p-4">
      <h3
        id="naechster-schritt"
        className="schrift-label font-semibold uppercase tracking-wide text-muted-foreground"
      >
        {s("titel")}
      </h3>
      <div className="mt-3">{inhalt}</div>
    </section>
  );
}
