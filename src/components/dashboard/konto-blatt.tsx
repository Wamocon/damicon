"use client";

import type { ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { LogOut, ShieldCheck, UserRound } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/components/site/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { PersonaSwitcher, usePersona } from "@/components/dashboard/persona";
import { HandbuchLinkBlatt } from "@/components/dashboard/handbuch-link";
import { abmelden } from "@/app/[locale]/login/actions";

// Inhalt des Konto-Blatts in der unteren Leiste (untere-leiste.tsx).
//
// Hier steht, was am Schreibtisch auf zwei Stellen verteilt ist: die
// angemeldete Person am Fuss der Seitenleiste, und Sprache, Farbschema und
// "Ansicht als" rechts in der Kopfzeile. Auf dem Handy war das letzte Drittel
// davon gar nicht erreichbar - der Rollenumschalter traegt `hidden
// lg:inline-flex` und fehlt unter 1024 px vollstaendig, obwohl gerade die
// Administration Rollen gern am Geraet des Nutzers prueft (Punkt 16 des
// UX-Audits).
//
// Die echte Rolle und die Ansichtsrolle bleiben auseinandergehalten wie am
// Fuss der Seitenleiste: nur die echte entscheidet in der Datenbank ueber
// Schreibrechte, deshalb steht sie unter dem Namen und die umgeschaltete
// darunter als eigene Zeile.

function initialen(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((teil) => teil[0]?.toUpperCase() ?? "")
    .join("");
}

function Zeile({
  titel,
  children,
}: {
  titel: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
      <span className="min-w-0 text-sm font-semibold text-card-foreground">
        {titel}
      </span>
      <span className="shrink-0">{children}</span>
    </div>
  );
}

export function KontoBlatt({ onNavigate }: { onNavigate?: () => void }) {
  const { name, role, echteRolle, darfWechseln, demoModus } = usePersona();
  const nav = useTranslations("nav");
  const t = useTranslations("auth");
  const roleT = useTranslations("roles");
  const common = useTranslations("common");
  const locale = useLocale();

  // Ohne Anmeldung gibt es keine Profilrolle - dann zaehlt die umgeschaltete
  // Demo-Rolle.
  const rolle = roleT(demoModus ? role : echteRolle);
  const kuerzel = name ? initialen(name) : null;

  return (
    <div className="pb-4">
      <div className="flex items-center gap-3 px-4 py-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-black text-primary">
          {kuerzel ?? <UserRound className="h-5 w-5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-bold text-card-foreground">
            {name ?? rolle}
          </span>
          <span className="block truncate text-sm text-muted-foreground">
            {name ? rolle : nav("activePersona")}
          </span>
        </span>
      </div>

      {darfWechseln ? (
        <Zeile titel={roleT(demoModus ? "switcherLabel" : "viewAsLabel")}>
          <PersonaSwitcher />
        </Zeile>
      ) : null}

      <Zeile titel={common("localeSwitcherLabel")}>
        <LocaleSwitcher />
      </Zeile>

      <Zeile titel={common("themeLabel")}>
        <ThemeToggle />
      </Zeile>

      <div className="mt-2 space-y-2 border-t border-border px-4 pt-4">
        {/* Auf dem Telefon gibt es die Seitenleiste nicht - ohne diesen
            Eintrag waere das Handbuch am Geraet nicht erreichbar. Es haengt
            an keiner Sitzung und steht deshalb auch im Demo-Modus. */}
        <HandbuchLinkBlatt />

        {/* Im Demo-Modus gibt es keine Sitzung - Sicherheit und Abmelden
            haetten dort nichts, worauf sie wirken koennten. */}
        {!demoModus ? (
          <>
            <Link
              href="/dashboard/sicherheit"
              onClick={onNavigate}
              className="flex h-12 w-full items-center gap-2.5 rounded-xl border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
            >
              <ShieldCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
              {t("security")}
            </Link>
            <form action={abmelden}>
              <input type="hidden" name="locale" value={locale} />
              <button
                type="submit"
                className="flex h-12 w-full items-center gap-2.5 rounded-xl border border-border px-4 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/5"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                {t("signOut")}
              </button>
            </form>
          </>
        ) : null}
      </div>
    </div>
  );
}
