"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, UserCog } from "lucide-react";
import { StatusPill } from "@/components/ui/kit";
import { roles, type Role } from "@/lib/rbac";
import { cn } from "@/lib/utils";

// Zwei Betriebsarten (siehe src/lib/supabase/config.ts):
//
//   Demo-Modus  - keine Anmeldung. Die Rolle kommt aus localStorage und laesst
//                 sich frei umschalten, damit die RBAC-Engine vorfuehrbar ist.
//   DB-Modus    - echte Anmeldung. Die wirksame Rolle ist die Profilrolle; nur
//                 Admins duerfen zusaetzlich "Ansicht als" umschalten. Das
//                 wirkt ausschliesslich auf die Darstellung - serverseitig
//                 entscheidet weiterhin RLS anhand der echten Profilrolle.
const STORAGE_KEY = "damicon-persona";
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function readRole(fallback: Role): Role {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && (roles as readonly string[]).includes(stored)) {
      return stored as Role;
    }
  } catch {
    // ignore
  }
  return fallback;
}

interface PersonaWert {
  /** Rolle, die die Oberflaeche gerade zeigt. */
  role: Role;
  /** Rolle laut Profil bzw. Demo-Standard - Basis der RLS-Pruefung. */
  echteRolle: Role;
  name: string | null;
  email: string | null;
  darfWechseln: boolean;
  demoModus: boolean;
  setRole: (role: Role) => void;
}

const PersonaContext = createContext<PersonaWert>({
  role: "admin",
  echteRolle: "admin",
  name: null,
  email: null,
  darfWechseln: true,
  demoModus: true,
  setRole: () => {},
});

export function PersonaProvider({
  children,
  echteRolle = "admin",
  name = null,
  email = null,
  demoModus = true,
}: {
  children: ReactNode;
  echteRolle?: Role;
  name?: string | null;
  email?: string | null;
  demoModus?: boolean;
}) {
  const darfWechseln = demoModus || echteRolle === "admin";
  const gespeichert = useSyncExternalStore(
    subscribe,
    () => readRole(echteRolle),
    () => echteRolle,
  );
  const role = darfWechseln ? gespeichert : echteRolle;

  const setRole = useCallback((next: Role) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
    listeners.forEach((listener) => listener());
  }, []);

  const value = useMemo(
    () => ({ role, echteRolle, name, email, darfWechseln, demoModus, setRole }),
    [role, echteRolle, name, email, darfWechseln, demoModus, setRole],
  );

  return (
    <PersonaContext.Provider value={value}>{children}</PersonaContext.Provider>
  );
}

export function usePersona() {
  return useContext(PersonaContext);
}

export function PersonaSwitcher({ className }: { className?: string }) {
  const { role, setRole, darfWechseln, demoModus } = usePersona();
  const t = useTranslations("roles");

  if (!darfWechseln) {
    return (
      <StatusPill tone="info" className={className}>
        {t(role)}
      </StatusPill>
    );
  }

  const hinweis = demoModus ? t("switcherHint") : t("viewAsHint");

  return (
    <label
      // cn() und nicht die Zeichenkette: die Kopfzeile reicht hier
      // "hidden lg:inline-flex" herein, und in einer Zeichenkette standen
      // danach zwei Anzeigeklassen nebeneinander. Welche gewann, entschied
      // die Reihenfolge im erzeugten Stylesheet und nicht die Absicht des
      // Aufrufers - der Umschalter blieb bei jeder Fensterbreite stehen und
      // schob mit seinen 190 px Sprachwahl, Farbschema und Meldungen aus der
      // Zeile. tailwind-merge behaelt die zuletzt uebergebene Klasse.
      className={cn("relative inline-flex items-center", className)}
      title={hinweis}
    >
      <UserCog className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-muted-foreground" />
      <select
        value={role}
        onChange={(event) => setRole(event.target.value as Role)}
        aria-label={hinweis}
        className="h-9 w-[190px] appearance-none rounded-lg border border-border bg-card pl-7 pr-7 text-xs font-semibold text-foreground shadow-sm transition-colors hover:border-primary focus:border-primary focus:outline-none"
      >
        {roles.map((r) => (
          <option key={r} value={r}>
            {t(r)}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-1.5 h-3.5 w-3.5 text-muted-foreground" />
    </label>
  );
}
