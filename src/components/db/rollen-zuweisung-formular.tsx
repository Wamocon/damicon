"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { rolleZuweisen } from "@/lib/actions/rollen";
import { leer } from "@/lib/actions/status";
import { AktionsMeldung, PfadFeld } from "@/components/db/formular-kit";
import { ZUWEISBARE_ROLLEN } from "@/lib/domain/rollen-zuweisung";
import type { Role } from "@/lib/rbac";

// Zeilenformular: die Rolle eines Kontos setzen. Eigene Rueckmeldung je Zeile.
// Das Feld traegt die aktuelle Rolle als key: aendert sich sie nach dem
// Speichern, wird die Auswahl neu aufgebaut und zeigt nicht den Stand davor.
export function RolleZuweisenFormular({ profilId, rolle }: { profilId: string; rolle: Role }) {
  const [zustand, action] = useActionState(rolleZuweisen, leer);
  const t = useTranslations("rollenZuweisung");
  const rollenT = useTranslations("roles");

  return (
    <form action={action} className="flex flex-wrap items-center gap-1.5">
      <PfadFeld />
      <input type="hidden" name="profil_id" value={profilId} />
      <select
        key={`rolle-${rolle}`}
        name="rolle"
        defaultValue={rolle}
        aria-label={t("col.rolle")}
        className="h-7 rounded-md border border-border bg-background px-1.5 text-[11px] text-foreground outline-none transition focus:border-primary"
      >
        {ZUWEISBARE_ROLLEN.map((wert) => (
          <option key={wert} value={wert}>
            {rollenT(wert)}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="inline-flex h-7 items-center justify-center rounded-md border border-border bg-card px-2 text-[11px] font-bold text-foreground transition hover:border-primary"
      >
        {t("knopf")}
      </button>
      <AktionsMeldung status={zustand} />
    </form>
  );
}
