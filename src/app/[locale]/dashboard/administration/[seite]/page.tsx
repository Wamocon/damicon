import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdministrationSeite } from "@/components/dashboard/administration-seite";
import { KiAnbieterVerwaltung, KiRatenlimitVerwaltung } from "@/components/db/ki-assistent-formulare";
import { WissenVerwaltung } from "@/components/db/wissen-verwaltung";
import { Card } from "@/components/ui/kit";
import { adminSeiteBySlug, darfAdministrieren, type AdminSeiteKey } from "@/lib/administration";
import { getSessionProfile } from "@/lib/auth";
import { ladeKiAnbieterListe, ladeKiRatenlimitEinstellungen } from "@/lib/data/ki-assistent";
import { isSupabaseConfigured } from "@/lib/supabase/config";

// Die Unterseiten der Administration. Dieselben Verwaltungsformulare, die bisher im KI-Seitenpanel steckten, nur auf
// einer eigenen Seite im Hauptbereich. Die Berechtigung (ki_assistent:manage) pruefen die Seite hier und jede Server
// Action dahinter selbst.
async function inhalt(key: AdminSeiteKey) {
  switch (key) {
    case "ki-anbieter": {
      const liste = await ladeKiAnbieterListe();
      return <KiAnbieterVerwaltung anbieter={liste.anbieter} />;
    }
    case "ratenlimit": {
      const liste = await ladeKiRatenlimitEinstellungen();
      return <KiRatenlimitVerwaltung einstellungen={liste.einstellungen} />;
    }
    case "wissensbasis":
      // Laedt ihre Liste selbst beim Oeffnen: Sie zaehlt alle Textstellen der Wissensbasis.
      return <WissenVerwaltung />;
  }
}

export default async function AdministrationUnterseite({
  params,
}: {
  params: Promise<{ locale: string; seite: string }>;
}) {
  const { locale, seite: slug } = await params;
  setRequestLocale(locale);

  const seite = adminSeiteBySlug(slug);
  if (!seite) notFound();

  if (!isSupabaseConfigured()) {
    const t = await getTranslations("administration");
    return (
      <AdministrationSeite seite={seite}>
        <Card ton="box" className="text-center text-xs text-muted-foreground">
          {t("keineUmgebung")}
        </Card>
      </AdministrationSeite>
    );
  }

  const profil = await getSessionProfile();
  if (!darfAdministrieren(profil?.role)) notFound();

  return (
    <AdministrationSeite seite={seite}>
      <Card ton="box" className="max-w-5xl p-5 sm:p-6">
        {await inhalt(seite.key)}
      </Card>
    </AdministrationSeite>
  );
}
