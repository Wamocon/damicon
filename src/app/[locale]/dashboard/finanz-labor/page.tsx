import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { ModulePageBody } from "@/components/dashboard/module-page-body";
import { FinanzenAnsichtNeu } from "@/components/db/finanzen-ansicht-neu";
import { moduleByPath } from "@/lib/modules";
import { getSessionProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";

// Finanz-Labor: die Entwurfsfassung der Finanzseite mit Reitern, Zeitraum-
// filter und Zeilenbegrenzung, neben der echten Seite unter
// /dashboard/buero/finanzen. Solange der Entwurf hier steht, bleibt die echte
// Seite unberuehrt und die E2E-Tests laufen unveraendert durch.
//
// Eine Referenzseite fuer die Oberflaeche, kein Fachmodul - deshalb
// ausserhalb von lib/modules.ts und ohne RBAC-Gate auf einer Ressource. Sie
// erscheint auch nicht als Kachel auf der Bereichsseite, sondern nur als
// eigener Eintrag unter den Bereichen in der Seitenleiste.
//
// ModulePageBody kommt trotzdem mit: ohne die Kopf-Card
// haette das Labor einen anderen Rahmen als die echte Seite, und dann liesse
// sich nicht beurteilen, ob die Seite wirklich kuerzer geworden ist.
//
// Sichtbar fuer admin und buchhaltung - die Buchhaltung soll den Entwurf
// begutachten koennen, bevor er die echte Seite ersetzt. Nicht angemeldete
// Besucher faengt schon das Dashboard-Layout ab. Im Demo-Modus (ohne Supabase)
// ist die Seite offen, dort gibt es keine Anmeldung.
//
// GESCHRIEBEN WIRD HIER NICHTS: Die Formulare laufen im Vorschaumodus, der
// Absendeknopf ist gesperrt. Gearbeitet wird gegen die gehostete, geteilte
// Datenbank, und finance_ledger_entries ist nur anfuegbar - eine Probebuchung
// waere fuer immer drin.

const PFAD = "/dashboard/finanz-labor";

export default async function FinanzLaborSeite({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const modul = moduleByPath("buero", "finanzen");
  if (!modul) notFound();

  // Gefiltert wird nach der echten Profilrolle, nicht nach der clientseitig
  // umschaltbaren Persona - die kennt der Server gar nicht.
  const profil = isSupabaseConfigured() ? await getSessionProfile() : null;
  if (profil && profil.role !== "admin" && profil.role !== "buchhaltung") notFound();

  const suche = await searchParams;
  const text = (wert: string | string[] | undefined) =>
    typeof wert === "string" ? wert : undefined;

  return (
    <ModulePageBody module={modul}>
      <FinanzenAnsichtNeu
        pfad={PFAD}
        suche={{
          bereich: text(suche.bereich),
          zeitraum: text(suche.zeitraum),
          typ: text(suche.typ),
          zeilen: text(suche.zeilen),
        }}
      />
    </ModulePageBody>
  );
}
