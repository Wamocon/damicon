"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import {
  Bell,
  ChevronLeft,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useElternSeite } from "@/components/dashboard/nav-ziele";
import { DamiconLogo } from "@/components/brand/damicon-logo";
import { LocaleSwitcher } from "@/components/site/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { PersonaSwitcher, usePersona } from "@/components/dashboard/persona";
import { useCeoPruefung } from "@/components/dashboard/ceo-pruefung-kontext";
import { Himbeere } from "@/components/ki/himbeere";
import { useKiPane } from "@/components/ki/ki-pane-kontext";
import { cn } from "@/lib/utils";
import { SyncStatus } from "@/components/dashboard/sync-status";
import { TopbarPfad } from "@/components/dashboard/topbar-pfad";
import { TopbarSuche, TopbarSuchknopf } from "@/components/suche/such-ausloeser";
import {
  istSchmal,
  schmalAbonnieren,
  schmalServer,
  schmalSetzen,
} from "@/components/dashboard/sidebar-zustand";

function KiFragenKnopf() {
  const t = useTranslations("dashboard");
  const { verfuegbar, offen, umschalten, modus } = useKiPane();
  if (!verfuegbar) return null;

  return (
    <button
      type="button"
      onClick={umschalten}
      aria-pressed={offen}
      aria-label={t("askAi")}
      title={t("askAiHinweis")}
      className={cn(
        "ki-fragen-knopf inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition-colors",
        offen
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border bg-card text-foreground hover:bg-muted",
        offen && modus === "agent" && "ki-fragen-knopf--agent",
      )}
    >
      <Himbeere groesse={17} />
      {/* Die Beschriftung erst ab lg. Bei 768 px war die Zeile sonst um
          53 px ueberbucht und schnitt rechts die Meldungen ab; das Wort
          kostet davon 68. Der Knopf bleibt ueber aria-label benannt. */}
      <span className="hidden lg:inline">{t("askAi")}</span>
    </button>
  );
}

// Umschalter fuer die Breite der Seitenleiste. Er steht hier und nicht in der
// Leiste selbst, weil er so an derselben Stelle bleibt, ob die Leiste nun
// schmal oder breit ist - in der Leiste waere er einmal neben dem Logo und
// einmal darunter gewandert. Erst ab md, darunter gibt es keine feste Spalte,
// sondern die Schublade.
function MenueUmschalter() {
  const nav = useTranslations("nav");
  const schmal = useSyncExternalStore(
    schmalAbonnieren,
    istSchmal,
    schmalServer,
  );
  const beschriftung = nav(schmal ? "expandMenu" : "collapseMenu");

  return (
    <button
      type="button"
      onClick={() => schmalSetzen(!schmal)}
      aria-label={beschriftung}
      aria-pressed={schmal}
      title={beschriftung}
      className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-muted md:inline-flex"
    >
      {schmal ? (
        <PanelLeftOpen className="h-4 w-4" />
      ) : (
        <PanelLeftClose className="h-4 w-4" />
      )}
    </button>
  );
}

// Sichtbar auf jeder Dashboard-Seite, nicht nur der Startseite (der Live-Strom haengt am
// Layout, siehe ceo-pruefung-kontext.tsx): wer als ceo gerade eine andere Unterseite
// ansieht, soll trotzdem sehen, dass im Hintergrund noch geprueft wird, statt sich zu
// fragen, ob der Wechsel den Lauf abgebrochen hat. Ein Klick fuehrt zur Startseite, wo der
// volle Fortschritt steht.
function CeoPruefungHinweis() {
  const t = useTranslations("ceoUebersicht");
  const stand = useCeoPruefung();
  if (stand?.phase !== "laeuft") return null;

  return (
    <Link
      href="/dashboard"
      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2.5 text-xs font-semibold text-primary"
      title={t("laeuftImHintergrundHinweis")}
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
      <span className="hidden sm:inline">{t("laeuftImHintergrund")}</span>
    </Link>
  );
}

export function DashboardTopbar() {
  const t = useTranslations("dashboard");
  // Null auf der Uebersicht - dort gibt es kein Zurueck, und links steht die
  // Marke statt eines Rueckwegs.
  const eltern = useElternSeite();
  // Anforderung 2.5: der Sync-Indikator ist nur fuer echte, angemeldete
  // Brigade-Sitzungen relevant - im Demo-Modus gibt es keine echte
  // Supabase-Session, die eine Warteschlange fuellen koennte, und andere
  // Rollen erfassen keine Felddaten.
  const { echteRolle, demoModus } = usePersona();
  const zeigeSync = !demoModus && echteRolle === "brigade";

  return (
    <header
      className={cn(
        "sticky top-0 z-40 h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-xl md:flex md:h-16 md:px-6 print:hidden",
        // Sobald links ein Rueckweg steht, ruecken Bildmarke und Name in die
        // Mitte. Dafuer drei Rasterspalten, deren aeussere gleich breit sind -
        // in einer Reihe saesse die Marke nur "irgendwo zwischen den
        // Nachbarn", je nachdem wie lang der Rueckweg gerade ist ("Feld"
        // gegen "Genel bakış").
        //
        // Ausgeblendete Kinder belegen keine Rasterzelle: der Menue-Umschalter
        // ab md und das Suchfeld ab xl verschieben die Aufteilung darunter
        // nicht. Der Suchknopf steht in der rechten Gruppe und braucht keine
        // eigene Zelle.
        eltern
          ? "grid grid-cols-[1fr_auto_1fr]"
          : // Auf der Uebersicht gibt es keinen Rueckweg - dort steht die
            // Marke links, wo sonst nichts waere.
            "flex",
      )}
    >
      {/* Der Weg zurueck, nur unter md und nur auf einer Unterseite.

          Er steht hier und nicht bei den Brotkrumen im Inhalt, weil er dort
          wegscrollt - und gebraucht wird er genau dann, wenn man mitten auf
          einer langen Modulseite steht. Welche Seite die Ebene darueber ist,
          leitet useElternSeite() aus dem Pfad ab.

          Gemessen mit Rueckweg und mittiger Bildmarke: rechts stehen
          Synchronisierung oder CEO-Hinweis, Suche und Meldungen, zusammen
          124 px. Die beiden Aussenspalten sind bei 390 px je 149 px breit,
          bei 360 px je 134 px - beides passt, die Marke steht genau mittig.
          Erst bei 320 px braucht die rechte Gruppe mehr als ihre Spalte, und
          die Marke rueckt 10 px aus der Mitte. Der Rueckweg links hat damit
          auch fuer "Genel bakış" genug Platz. */}
      {eltern ? (
        <Link
          href={eltern.href}
          className="flex min-w-0 items-center gap-1 text-sm font-black uppercase tracking-[0.1em] text-primary md:hidden"
        >
          <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 truncate">{eltern.text}</span>
        </Link>
      ) : null}

      {/* Die Marke steht auf jeder Seite, nur an wechselnder Stelle: links,
          solange links nichts anderes ist, sonst in der Mitte. Ab md traegt
          sie die Seitenleiste, hier waere sie doppelt.

          Der Untertitel entfaellt auf dem Handy - er erklaert die Marke, und
          wer im Dashboard steht, weiss bereits, worin er steht. */}
      <Link
        href="/dashboard"
        aria-label="Damicon"
        className="flex min-w-0 items-center gap-2.5 md:hidden"
      >
        <DamiconLogo className="shadow-lg shadow-primary/20" />
        {/* In der Mitte steht die Bildmarke allein. Der Name daneben schoebe
            sie aus der Mitte, sobald der Rueckweg links laenger wird, und er
            sagt dort auch nichts Neues - wer im Dashboard steht, weiss, in
            welchem. Links auf der Uebersicht bleibt er, dort ist er die
            Ueberschrift der Seite, auf der man ankommt. */}
        {eltern ? null : (
          <span className="min-w-0 truncate text-base font-black leading-tight text-foreground">
            Damicon
          </span>
        )}
      </Link>

      <MenueUmschalter />
      {/* Der Pfad steht zwischen Umschalter und Suche. Anders als die frühere
          Zeile über der Überschrift scrollt er nicht mit dem Inhalt weg. */}
      <TopbarPfad />
      {/* Die Suche beginnt direkt hinter dem Pfad: ab xl als Feld, das die
          Luecke bis zu den Werkzeugen fuellt, darunter als Lupe an derselben
          Stelle - fuer Feld und Pfad nebeneinander reicht die Zeile dort
          nicht. Das Suchfenster geht dort auf, wo sie sitzt
          (suche/such-kontext.tsx). Auf dem Handy steht die Lupe stattdessen
          neben der Glocke, siehe unten. */}
      <TopbarSuchknopf className="hidden md:inline-flex xl:hidden" />
      <TopbarSuche />
      {/* Was unter md in das Konto-Blatt der unteren Leiste gewandert ist -
          "KI fragen", Rollenumschalter, Sprache, Farbschema -, steht hier erst
          ab md wieder. Sichtbar bleibt auf dem Handy nur, was beim Arbeiten
          sichtbar bleiben muss: der Stand der Synchronisierung, die Suche und
          die Meldungen. */}
      {/* md:ml-auto haelt die Gruppe rechts, auch wenn die Suche gerade ein
          Knopf ist und damit kein wachsendes Element mehr in der Zeile steht. */}
      <div className="flex flex-1 items-center justify-end gap-2 md:ml-auto md:flex-none">
        <span className="hidden md:contents">
          <KiFragenKnopf />
          <PersonaSwitcher className="hidden lg:inline-flex" />
          <LocaleSwitcher compact />
          <ThemeToggle />
        </span>
        {zeigeSync ? <SyncStatus /> : null}
        <CeoPruefungHinweis />
        <TopbarSuchknopf className="inline-flex md:hidden" />
        <button
          type="button"
          aria-label={t("notifications")}
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-muted"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" />
        </button>
      </div>
    </header>
  );
}
