"use client";

import type { ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { BookOpen } from "lucide-react";

// Zugang zum Produkthandbuch, in der Navigation direkt ueber dem
// Benutzerbereich. Es steht dort und nicht bei den vier Bereichen, weil es
// kein Modul ist: es fuehrt aus der Anwendung heraus in ein Dokument, genau
// wie Sicherheit und Abmelden darunter auch aus dem Betrieb herausfuehren.
//
// Drei Formen fuer die drei Zustaende der Navigation - breite Leiste, schmale
// Schiene, Konto-Blatt auf dem Telefon -, aufgebaut wie BenutzerFuss und
// BenutzerFussSchmal daneben. Sie unterscheiden sich nur in Flaeche und
// Beschriftung; Ziel, Fenster und Hinweistext sind dieselben und stehen
// deshalb genau einmal in HandbuchAnker.

function useHandbuch() {
  const locale = useLocale();
  const nav = useTranslations("nav");
  return {
    href: `/${locale}/dashboard/handbuch`,
    name: nav("handbook"),
    hinweis: nav("handbookHint"),
  };
}

/**
 * Der Anker selbst, in allen drei Formen gleich.
 *
 * Bewusst ein natives <a> statt Link aus @/i18n/navigation: das Ziel ist ein
 * Route Handler, der eine fertige HTML-Seite ausliefert, keine React-Seite.
 * Client-Navigation und Prefetch haetten darauf nichts zu suchen - Next.js
 * wuerde eine RSC-Antwort erwarten und bekaeme das Handbuch.
 *
 * Neuer Tab, weil das Handbuch zum Nachschlagen neben der Arbeit offen bleibt:
 * wer mitten in einer Pflueckaufgabe etwas nachliest, soll nicht zurueck
 * navigieren muessen. Der Hinweistext sagt das an, damit es niemanden
 * ueberrascht - auch nicht am Vorleseprogramm.
 */
function HandbuchAnker({
  className,
  ariaLabel,
  children,
}: {
  className: string;
  ariaLabel?: string;
  children: ReactNode;
}) {
  const { href, hinweis } = useHandbuch();

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      title={hinweis}
      aria-label={ariaLabel}
      className={className}
    >
      {children}
    </a>
  );
}

export function HandbuchLink() {
  const { name } = useHandbuch();

  // Dieselbe Flaeche wie "Uebersicht" und die vier Bereichsgruppen darueber:
  // Rahmen aussen, Link innen. Ohne sie haengt die Zeile lose zwischen den
  // umrandeten Karten und dem umrandeten Benutzerbereich darunter.
  return (
    <div className="mt-2 shrink-0 rounded-xl border border-sidebar-border px-1 py-0.5">
      <HandbuchAnker className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center">
          <BookOpen className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1 truncate">{name}</span>
      </HandbuchAnker>
    </div>
  );
}

// Eingeklappt bleibt das Symbol. Gleiche 36-px-Flaeche wie die Ziele darueber
// und der Benutzer darunter, sonst bricht die Spur der Schiene.
export function HandbuchLinkSchmal() {
  const { name, hinweis } = useHandbuch();

  return (
    <HandbuchAnker
      ariaLabel={`${name} - ${hinweis}`}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
    >
      <BookOpen className="h-4 w-4" />
    </HandbuchAnker>
  );
}

// Im Konto-Blatt der unteren Leiste, in derselben Form wie Sicherheit und
// Abmelden dort. Auf dem Telefon gibt es die Seitenleiste nicht - ohne diesen
// Eintrag waere das Handbuch am Geraet gar nicht erreichbar.
export function HandbuchLinkBlatt() {
  const { name } = useHandbuch();

  return (
    <HandbuchAnker className="flex h-12 w-full items-center gap-2.5 rounded-xl border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted">
      <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
      {name}
    </HandbuchAnker>
  );
}
