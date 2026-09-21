import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { PageHeader, Card } from "@/components/ui/kit";
import { MfaVerwaltung } from "@/components/auth/mfa-verwaltung";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

// Sicherheit/MFA (Anforderung 4.9, P0). Kontoseite, kein Zonen-Modul - jede
// angemeldete Rolle verwaltet hier ausschliesslich den eigenen zweiten
// Faktor, deshalb ausserhalb von lib/modules.ts und ohne rbac-Gate.
export default async function SicherheitPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "mfa" });

  if (!isSupabaseConfigured()) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("title")} description={t("description")} />
        <Card ton="box" className="text-center text-xs text-muted-foreground">
          {t("keineUmgebung")}
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: faktoren } = await supabase.auth.mfa.listFactors();
  const totpFaktoren = (faktoren?.totp ?? []).filter((f) => f.status === "verified");

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} />
      <MfaVerwaltung bestehend={totpFaktoren.map((f) => ({ id: f.id, name: f.friendly_name ?? f.id }))} />
    </div>
  );
}
