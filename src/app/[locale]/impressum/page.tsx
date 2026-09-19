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
      {/* Namensnennung der Sprachausgabe-Stimmen (CC BY 4.0). Die Zitate bleiben
          bewusst unuebersetzt - Titel, Autoren und Quellen wie von den
          Datensaetzen angegeben. Nur Stimmen, die tatsaechlich im Einsatz sind
          (src/lib/domain/sprachausgabe.ts, STIMMEN); die englische Stimme (cori)
          ist gemeinfrei und braucht keine Namensnennung. */}
      <h2>{t("voiceCreditsTitle")}</h2>
      <p>{t("voiceCreditsIntro")}</p>
      <p>
        <strong>{t("voiceKazakh")}:</strong> Saida Mussakhojayeva, Aigerim Janaliyeva, Almas Mirzakhmetov, Yerbolat
        Khassanov, Huseyin Atakan Varol: &ldquo;KazakhTTS: An Open-Source Kazakh Text-to-Speech Synthesis
        Dataset&rdquo;, Proc. Interspeech 2021, pp. 2786&ndash;2790, doi:10.21437/Interspeech.2021-2124. Institute of
        Smart Systems and Artificial Intelligence (ISSAI), Nazarbayev University.{" "}
        <a href="https://github.com/IS2AI/Kazakh_TTS">github.com/IS2AI/Kazakh_TTS</a>,{" "}
        <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>
      </p>
      <p>
        <strong>{t("voiceGerman")}:</strong> Vineel Pratap, Qiantong Xu, Anuroop Sriram, Gabriel Synnaeve, Ronan
        Collobert: &ldquo;MLS: A Large-Scale Multilingual Dataset for Speech Research&rdquo;, arXiv:2012.03411 (2020).{" "}
        <a href="https://www.openslr.org/94/">openslr.org/94</a>,{" "}
        <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>
      </p>
    </LegalShell>
  );
}
