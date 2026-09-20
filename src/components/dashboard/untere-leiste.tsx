"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ChevronRight, LayoutGrid, UserRound } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Icon } from "@/components/icon";
import { useNavZiele } from "@/components/dashboard/nav-ziele";
import { KontoBlatt } from "@/components/dashboard/konto-blatt";
import { useHaustierStatus } from "@/components/haustier/haustier-kontext";
import { Himbi } from "@/components/haustier/himbi";
import { Himbeere } from "@/components/ki/himbeere";
import { useKiPane } from "@/components/ki/ki-pane-kontext";
import { Sheet } from "@/components/ui/sheet";
import { haustierZustand } from "@/lib/haustier";
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

// Himbi als KI-Knopf. Auf dem Handy steht er hier statt frei im Bild: dort
// deckte er Karteninhalt zu, und direkt daneben trug die Leiste noch einmal
// dieselbe Himbeere - zwei Zeichen fuer dieselbe Sache, eines davon im Weg.
// Ein Tipp darauf oeffnet den Assistenten, also genau das, was ein Tipp auf
// die schwebende Figur auch tat.
//
// Was er zeigt, ist die Phase des Agenten: denkt, wartet auf eine Freigabe,
// etwas ging schief. Der Punkt daneben macht es auch dann sichtbar, wenn die
// Figur bei 30 px klein ist.
//
// Ist Himbi abgeschaltet oder weggeschickt (Einstellung im Panel), bleibt es
// bei der schlichten Himbeere - die Entscheidung gilt auf beiden Geraeten.
function HimbiKnopf() {
  const { phase, an, weg } = useHaustierStatus();

  if (!an || weg) return <Himbeere groesse={20} />;

  const zustand = haustierZustand({ phase, fertigUngelesen: false, schlaeft: false });
  const meldet = phase !== "ruhe";

  // 28 px breit ergeben 42 px Hoehe (die Figur ist 96 x 144) und bleiben damit
  // im 44-px-Knopf. Der Schlagschatten der Figur (.hb-svg) sitzt ausserhalb
  // des Umrisses, deshalb overflow-visible.
  return (
    <span className="relative inline-flex items-center justify-center overflow-visible">
      <Himbi zustand={zustand} groesse={28} />
      {meldet ? (
        <span
          className={cn(
            "absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full",
            phase === "fehler" ? "bg-destructive" : "bg-primary",
          )}
          aria-hidden="true"
        />
      ) : null}
    </span>
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
                <HimbiKnopf />
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
