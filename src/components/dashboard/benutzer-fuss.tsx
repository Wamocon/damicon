"use client";

import { useLocale, useTranslations } from "next-intl";
import { LogOut, ShieldCheck, UserRound } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { usePersona } from "@/components/dashboard/persona";
import { abmelden } from "@/app/[locale]/login/actions";

// Angemeldete Person am Fuss der Seitenleiste. Vorher stand dieselbe Angabe
// zweimal auf dem Schirm: die Kachel "Angemeldet als" oben in der Leiste und
// der Benutzerbereich rechts in der Kopfzeile.
//
// Wichtig ist die Unterscheidung, die dabei fast verloren gegangen waere: die
// Kachel oben zeigte die ANSICHTSROLLE, die Kopfzeile die echte Profilrolle.
// Fuer Admins mit "Ansicht als" sind das zwei verschiedene Dinge, und nur die
// echte entscheidet in der Datenbank ueber Schreibrechte. Deshalb steht hier
// die echte Rolle, und die Ansichtsrolle nur dann zusaetzlich, wenn sie
// abweicht - sonst waere der Hinweis blosses Rauschen.

function initialen(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((teil) => teil[0]?.toUpperCase() ?? "")
    .join("");
}

function useBenutzer() {
  const { name, email, role, echteRolle, demoModus } = usePersona();
  const roleT = useTranslations("roles");
  return {
    demoModus,
    // Ein frisch angelegtes Konto hat noch keinen Namen im Profil. Dann traegt
    // die Mailadresse die Zeile - sie benennt die Person genauso eindeutig und
    // steht im DB-Modus immer zur Verfuegung.
    name: name ?? email,
    // Ohne Anmeldung gibt es keine Profilrolle - dann zaehlt die
    // umgeschaltete Demo-Rolle.
    rolle: roleT(demoModus ? role : echteRolle),
    beschreibung: roleT(`descriptions.${demoModus ? role : echteRolle}`),
    ansichtsrolle: !demoModus && role !== echteRolle ? roleT(role) : null,
    kuerzel: name ? initialen(name) : null,
  };
}

// Abmelden ist eine Server Action und braucht deshalb ein Formular mit der
// Sprache im verborgenen Feld. Beide Zustaende der Leiste, die breite Zeile und
// die Symbolleiste, brauchen denselben Knopf und unterscheiden sich nur in der
// Flaeche - der Unterschied ist genau ein className und gehoert nicht in zwei
// Kopien desselben Formulars.
function AbmeldeKnopf({ className }: { className: string }) {
  const t = useTranslations("auth");
  const locale = useLocale();

  return (
    <form action={abmelden}>
      <input type="hidden" name="locale" value={locale} />
      <button
        type="submit"
        aria-label={t("signOut")}
        title={t("signOut")}
        className={className}
      >
        <LogOut className="h-4 w-4" />
      </button>
    </form>
  );
}

const knopfKlassen =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-sidebar-border text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground";

export function BenutzerFuss({ onNavigate }: { onNavigate?: () => void }) {
  const { demoModus, name, rolle, beschreibung, ansichtsrolle, kuerzel } =
    useBenutzer();
  const nav = useTranslations("nav");
  const t = useTranslations("auth");
  const roleT = useTranslations("roles");

  return (
    <div className="mt-2 shrink-0 rounded-xl border border-sidebar-border p-2">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[11px] font-black text-primary">
          {kuerzel ?? <UserRound className="h-4 w-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-sidebar-foreground">
            {name ?? rolle}
          </span>
          {/* Die Rollenbeschreibung stand frueher ausgeschrieben in der Kachel
              oben. Sie ist Beiwerk und wandert in den Hover-Text, statt hier
              eine dritte Zeile zu kosten.

              Der Demo-Hinweis haengt am Demo-Modus, nicht am fehlenden Namen:
              sonst saehe ein echtes Konto ohne Profilnamen "Aktive Rolle
              (Demo)", obwohl gar kein Demo-Modus laeuft. */}
          <span
            className="block truncate text-[11px] text-muted-foreground"
            title={beschreibung}
          >
            {demoModus ? nav("activePersona") : rolle}
          </span>
        </span>
      </div>

      {ansichtsrolle || !demoModus ? (
        <div className="mt-1.5 flex items-center gap-2">
          {ansichtsrolle ? (
            <p
              className="min-w-0 flex-1 truncate rounded-md bg-sidebar-accent px-2 py-1 text-[11px] font-semibold text-muted-foreground"
              title={roleT("viewAsHint")}
            >
              {roleT("viewAsBadge", { role: ansichtsrolle })}
            </p>
          ) : (
            <span className="flex-1" />
          )}
          {/* Im Demo-Modus gibt es keine Sitzung - Sicherheit und Abmelden
              haetten dort nichts, worauf sie wirken koennten. */}
          {!demoModus ? (
            <span className="flex shrink-0 items-center gap-1">
              <Link
                href="/dashboard/sicherheit"
                onClick={onNavigate}
                aria-label={t("security")}
                title={t("security")}
                className={knopfKlassen}
              >
                <ShieldCheck className="h-4 w-4" />
              </Link>
              <AbmeldeKnopf className={knopfKlassen} />
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// Eingeklappt bleibt nur das Kuerzel. Es fuehrt auf die Sicherheitsseite, weil
// das die einzige Kontoseite ist, die es gibt; wer die Person nur wissen will,
// bekommt sie ueber title und aria-label.
export function BenutzerFussSchmal() {
  const { demoModus, name, rolle, kuerzel } = useBenutzer();
  const t = useTranslations("auth");
  const wer = name ? `${name} - ${rolle}` : rolle;

  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5 pt-1.5">
      <div className="h-px w-8 bg-sidebar-border" />
      {demoModus ? (
        <span
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-[11px] font-black text-primary"
          title={wer}
          aria-label={wer}
        >
          <UserRound className="h-4 w-4" />
        </span>
      ) : (
        <>
          <Link
            href="/dashboard/sicherheit"
            title={`${wer} - ${t("security")}`}
            aria-label={`${wer} - ${t("security")}`}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-[11px] font-black text-primary transition-colors hover:bg-primary/20"
          >
            {kuerzel ?? <UserRound className="h-4 w-4" />}
          </Link>
          <AbmeldeKnopf className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground" />
        </>
      )}
    </div>
  );
}
