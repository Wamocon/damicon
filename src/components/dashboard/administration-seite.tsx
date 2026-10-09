import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Card, PageHeader } from "@/components/ui/kit";
import type { AdminSeite } from "@/lib/administration";

// Rahmen der Seiten im Bereich Administration, gebaut wie ModulePageBody der Zonenseiten: der Kopf sitzt in einer
// Box, darunter steht der Inhalt. Titel und Beschreibung kommen aus den Sprachdateien (administration.*); ohne Seite
// ist es die Uebersicht des Bereichs.
//
// Serverkomponente: Die Berechtigung pruefen die Seiten selbst, bevor sie hier ankommen. Der Rahmen zeigt nur an.
export async function AdministrationSeite({
  seite,
  children,
}: {
  seite?: AdminSeite;
  children?: ReactNode;
}) {
  const t = await getTranslations("administration");

  return (
    <div className="space-y-6">
      <Card ton="box" className="p-5 sm:p-6">
        <PageHeader
          title={seite ? t(`seiten.${seite.key}.title`) : t("title")}
          description={seite ? t(`seiten.${seite.key}.description`) : t("description")}
        />
      </Card>
      {children}
    </div>
  );
}
