import { getTranslations } from "next-intl/server";
import { LkwLader } from "@/components/site/lkw-lader";

// Ladezustand der oeffentlichen Seiten (Marketingseite, Impressum,
// Herkunftsauskunft, Login). Das Dashboard hat eigene loading.tsx mit
// Platzhalterkacheln und bleibt davon unberuehrt: Wer schon angemeldet ist,
// wartet auf Daten und will sehen, wo sie erscheinen - ein Ladebild waere
// dort der falsche Ton.
//
// role="status" statt einer sichtbaren Ueberschrift: Ein Screenreader liest
// die Zeile, sobald sie erscheint, und die Zeichnung selbst ist aria-hidden.
export default async function SeiteLaedt() {
  const t = await getTranslations("common");
  return (
    <div
      role="status"
      aria-busy="true"
      className="flex min-h-svh flex-col items-center justify-center gap-8 bg-background px-4"
    >
      <LkwLader />
      <p className="text-sm font-bold tracking-wide text-muted-foreground">{t("laedt")}</p>
    </div>
  );
}
