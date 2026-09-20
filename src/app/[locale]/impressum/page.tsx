import { getTranslations, setRequestLocale } from "next-intl/server";
import { LegalShell } from "@/components/site/legal-shell";

export default async function ImpressumPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "legal" });

  return (
    <LegalShell title={t("imprintTitle")}>
      <p>{t("prototypeDisclaimer")}</p>
      <h2>WAMOCON GmbH</h2>
      <p>
        Mergenthalerallee 79 - 81
        <br />
        65760 Eschborn, {t("country")}
      </p>
      <p>
        <strong>{t("phone")}:</strong> +49 6196 5838311
        <br />
        <strong>{t("email")}:</strong> info@wamocon.com
      </p>
      <h2>{t("managingDirector")}</h2>
      <p>Dipl.-Ing. Waleri Moretz</p>
      <h2>{t("registration")}</h2>
      <p>
        {t("commercialRegister")}: Eschborn HRB 123666
        <br />
        {t("vatId")}: DE344930486
      </p>
      {/* Hier stand die Namensnennung der Piper-Stimmen (KazakhTTS/ISSAI und
          MLS, beide CC BY 4.0). Sie ist entfallen, weil diese Stimmen nicht
          mehr im Einsatz sind: die Sprachausgabe laeuft seit dem 20.09.2026
          ueber die Sokrates-API, deren Stimmen ueber <sprache>-male/-female
          ausgewaehlt werden (src/lib/domain/sprachausgabe.ts, STIMMEN). Eine
          Namensnennung fuer etwas, das gar nicht mehr gesprochen wird, waere
          falsch. Welche Modelle Sokrates verwendet und ob sie eine eigene
          Namensnennung verlangen, ist beim Betreiber der API zu klaeren -
          kommt eine dazu, gehoert sie wieder an diese Stelle. */}
    </LegalShell>
  );
}
