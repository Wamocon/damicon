"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { LayoutGrid, UserRound } from "lucide-react";
import { MenueBaum } from "@/components/dashboard/sidebar";
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
        hoch
      >
        {/* Derselbe Baum wie in der Seitenleiste: Uebersicht, die vier
            Bereiche mit ihren Modulen, Rechte und aufgeklappte Gruppen
            inbegriffen. Ein Klick auf ein Ziel schliesst das Blatt. */}
        <MenueBaum onNavigate={() => setBlatt(null)} className="p-4" />
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
