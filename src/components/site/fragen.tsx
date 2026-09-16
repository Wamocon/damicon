import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Reveal } from "@/components/site/reveal";
import { modules } from "@/lib/modules";

// Häufige Fragen als aufklappbare Liste. Bewusst mit <details> und <summary>
// statt einer eigenen Aufklapp-Logik: Das bringt Tastaturbedienung,
// Vorlesbarkeit und die Browsersuche im zugeklappten Text mit, ohne eine
// Zeile JavaScript. Die Antworten stehen mit denselben Zahlen wie der Rest
// der Seite - keine Frage ohne Beleg weiter oben.
const FRAGEN = ["sechzig", "durchgang", "beleg", "rollen", "stand", "daten"] as const;

// Die Antwort zum Projektstand nennt Zahlen. Sie werden hier aus modules.ts
// gezaehlt statt in fuenf Sprachdateien von Hand gepflegt: die fest
// eingetragene Fassung stand am 13.09.2026 bei 14/3/8, waehrend die
// Modulliste 18/1/6 hergab - eine oeffentliche Seite, die dem eigenen
// Dashboard widerspricht. next-intl ignoriert Werte, die ein Text nicht
// verwendet, deshalb koennen sie an jede Antwort gehen.
function standZahlen() {
  return {
    gesamt: modules.length,
    angebunden: modules.filter((m) => m.reifegrad === "angebunden").length,
    demo: modules.filter((m) => m.reifegrad === "demo").length,
    entwicklung: modules.filter((m) => m.reifegrad === "in-entwicklung").length,
  };
}

export function Fragen() {
  const s = useTranslations("landing");
  const zahlen = standZahlen();

  return (
    <section id="fragen" className="container scroll-mt-20 py-16 md:py-24">
      <Reveal art="wisch">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-primary">
          {s("faqEyebrow")}
        </p>
        <h2 className="mt-2 max-w-2xl text-3xl font-black text-foreground md:text-4xl">
          {s("faqTitle")}
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{s("faqLead")}</p>
      </Reveal>

      <Reveal staffel className="mt-10 grid max-w-3xl gap-3">
        {FRAGEN.map((frage) => (
          <details key={frage} className="frage rounded-2xl border border-border bg-card">
            <summary className="frage__kopf">
              <span className="text-sm font-black text-card-foreground md:text-base">
                {s(`faqItems.${frage}.q`)}
              </span>
              <Plus aria-hidden className="frage__zeichen h-4 w-4 shrink-0 text-primary" />
            </summary>
            <p className="frage__text px-5 pb-5 text-sm leading-6 text-muted-foreground">
              {s(`faqItems.${frage}.a`, zahlen)}
            </p>
          </details>
        ))}
      </Reveal>
    </section>
  );
}
