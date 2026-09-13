import { useTranslations } from "next-intl";
import { SechzigMinutenBuehne } from "@/components/site/sechzig-minuten-buehne";
import { sechzigMinutenSequenz } from "@/lib/site-medien";

// Die erste Stunde nach dem Pfluecken als Scroll-Szene. Texte und Minuten
// kommen hier aus dem Server, die Buehne selbst ist ein Client-Blatt.
//
// Die Minuten sind die des Betriebs: gepflueckt bei 0, im Kuehlraum nach 5
// bis 15 Minuten (farmReality.photo2Text), heruntergekuehlt bis zur harten
// Grenze bei 60 (landing.berryPoints.kuehlung). `minute` ist der Punkt, an
// dem der Schritt auf der Uhr beginnt; `marke` steht sichtbar davor.
const SCHRITTE = [
  { key: "pfluecken", minute: 0, marke: "0" },
  { key: "kuehlraum", minute: 5, marke: "5–15" },
  { key: "vorkuehlung", minute: 15, marke: "15–60" },
  { key: "beleg", minute: 55, marke: "60" },
] as const;

export function SechzigMinuten() {
  const t = useTranslations("erlebnis.sechzig");

  return (
    <SechzigMinutenBuehne
      sequenz={sechzigMinutenSequenz}
      texte={{
        eyebrow: t("eyebrow"),
        title: t("title"),
        lead: t("lead"),
        uhrLabel: t("uhrLabel"),
        minute: t("minute"),
        kurveTitel: t("kurveTitel"),
        achseWarm: t("achseWarm"),
        achseKalt: t("achseKalt"),
        grenze: t("grenze"),
        kuehlraum: t("kuehlraum"),
      }}
      schritte={SCHRITTE.map(({ key, minute, marke }) => ({
        key,
        minute,
        marke,
        title: t(`schritte.${key}.title`),
        text: t(`schritte.${key}.text`),
      }))}
    />
  );
}
