"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ChevronRight, LayoutGrid, UserRound } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Icon } from "@/components/icon";
import { useNavZiele } from "@/components/dashboard/nav-ziele";
import { KontoBlatt } from "@/components/dashboard/konto-blatt";
import { Himbeere } from "@/components/ki/himbeere";
import { useKiPane } from "@/components/ki/ki-pane-kontext";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

// Untere Leiste, nur unter `md`. Drei Knoepfe: Menue, KI-Assistent, Konto.
//
// Die erste Fassung trug die fuenf Navigationsziele der eingeklappten
// Seitenleiste (Uebersicht und die vier Bereiche). Damit war die Leiste zwar
// bedienbar, aber nicht vollstaendig: die 26 Module erreichte man nur ueber
// den Umweg Bereichsseite, und alles, was nicht Navigation ist - KI,
// angemeldete Person, Sprache, Farbschema, Abmelden - hing weiterhin an der
// Kopfzeile oder an der Schublade, also wieder am oberen Rand.
//
// Jetzt fuehrt jeder der drei Knoepfe eine eigene Flaeche von unten herauf.
// Die Kopfzeile traegt darunter nur noch Bildmarke, Name und die Anzeigen, die
// beim Arbeiten sichtbar bleiben muessen (Synchronisierung, Meldungen).
//
// Ohne Beschriftung, wie die erste Fassung. Anders als bei den Bereichen
// ("Schneeflocke" fuer den Hof) sind diese drei Zeichen gelaeufig; jedes
// traegt zusaetzlich aria-label und title.

type Blatt = "menue" | "konto" | null;

function LeistenKnopf({
  label,
  aktiv,
  onClick,
  children,
}: {
  label: string;
  aktiv: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-expanded={aktiv}
      className={cn(
        "flex h-11 w-full items-center justify-center rounded-full transition-colors",
        aktiv
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

// Inhalt des Menue-Blatts: die oberste Ebene, also "Uebersicht" und die vier
// Bereiche - mehr nicht.
//
// Die Module stehen bewusst nicht darin. Sie stehen als Kacheln auf der
// Bereichsseite, mit Titel, Kurzbeschreibung und Reifegrad, und dort hat jede
// Kachel Platz. Der aufklappbare Baum aus der Seitenleiste bringt auf dem
// Handy 26 Eintraege in eine Flaeche, die man mit dem Daumen aufzieht: man
// scrollt, klappt auf, verliert die Uebersicht und trifft daneben. Zwei
// kurze Schritte (Bereich, dann Modul) sind hier besser als ein langer.
//
// Entscheidung des Auftraggebers vom 20.09.2026.
function BereichsListe({ onNavigate }: { onNavigate: () => void }) {
  const ziele = useNavZiele();

  return (
    <ul className="space-y-1.5 p-4">
      {ziele.map((ziel) => (
        <li key={ziel.key}>
          <Link
            href={ziel.href}
            onClick={onNavigate}
            aria-current={
              ziel.aktuelleSeite ? "page" : ziel.imZiel ? "true" : undefined
            }
            className={cn(
              "flex h-14 items-center gap-3 rounded-xl border px-3 transition-colors",
              ziel.imZiel
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-border text-foreground hover:bg-muted",
            )}
          >
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                ziel.imZiel ? "bg-primary/15" : "bg-muted",
              )}
            >
              <Icon name={ziel.icon} className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1 truncate text-base font-bold">
              {ziel.name}
            </span>
            <ChevronRight
              className="h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function UntereLeiste() {
  const nav = useTranslations("nav");
  const t = useTranslations("dashboard");
  const [blatt, setBlatt] = useState<Blatt>(null);
  // Der KI-Knopf schaltet kein eigenes Blatt, sondern dasselbe Panel wie der
  // Knopf in der Kopfzeile am Schreibtisch (ki-pane-kontext.tsx). Ohne
  // Datenbank oder ohne das Recht dazu gibt es das Panel nicht - dann traegt
  // die Leiste zwei Knoepfe statt drei.
  const ki = useKiPane();

  const umschalten = (ziel: Exclude<Blatt, null>) =>
    setBlatt((aktuell) => (aktuell === ziel ? null : ziel));

  return (
    <>
      <nav
        aria-label={nav("mainNav")}
        className="fixed inset-x-0 bottom-0 z-50 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:hidden print:hidden"
      >
        <ul className="flex items-center justify-around gap-1 rounded-full border border-border bg-card/95 p-1.5 shadow-lg shadow-black/10 backdrop-blur-xl">
          <li className="flex-1">
            <LeistenKnopf
              label={nav("openMenu")}
              aktiv={blatt === "menue"}
              onClick={() => umschalten("menue")}
            >
              <LayoutGrid className="h-5 w-5" />
            </LeistenKnopf>
          </li>

          {ki.verfuegbar ? (
            <li className="flex-1">
              <LeistenKnopf
                label={t("askAi")}
                aktiv={ki.offen}
                onClick={() => {
                  // Ein offenes Blatt zuerst schliessen: sonst legt sich das
                  // Panel darueber und das Menue bleibt unsichtbar offen.
                  setBlatt(null);
                  ki.umschalten();
                }}
              >
                <Himbeere groesse={20} />
              </LeistenKnopf>
            </li>
          ) : null}

          <li className="flex-1">
            <LeistenKnopf
              label={nav("account")}
              aktiv={blatt === "konto"}
              onClick={() => umschalten("konto")}
            >
              <UserRound className="h-5 w-5" />
            </LeistenKnopf>
          </li>
        </ul>
      </nav>

      <Sheet
        offen={blatt === "menue"}
        onSchliessen={() => setBlatt(null)}
        titel={nav("menu")}
      >
        <BereichsListe onNavigate={() => setBlatt(null)} />
      </Sheet>

      <Sheet
        offen={blatt === "konto"}
        onSchliessen={() => setBlatt(null)}
        titel={nav("account")}
      >
        <KontoBlatt onNavigate={() => setBlatt(null)} />
      </Sheet>
    </>
  );
}
