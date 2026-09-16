import { getTranslations } from "next-intl/server";
import { ladeOeffentlicheKanaele } from "@/lib/data/kanaele";

// Anforderung 5.6: lokal etablierte Kontaktkanaele/Zahlungswege oeffentlich
// auf der Website. Reine Anzeige (Nutzer-Entscheidung, keine echte
// API-Integration) - RLS liefert anon ausschliesslich aktive, vom Buero
// bereits gepflegte Kanaele (kontaktkanaele_select_public), ein Platzhalter
// ohne echten Wert erscheint hier nie. ladeOeffentlicheKanaele() nutzt bewusst
// einen cookie-freien Client (siehe dort), damit dieser im Seitenfuss jeder
// Marketing-Seite eingebundene Aufruf die Seite nicht in dynamisches
// Rendering zwingt.
export async function KontaktkanaeleFooter() {
  const [uebersicht, t] = await Promise.all([ladeOeffentlicheKanaele(), getTranslations("kanaeleAnsicht")]);
  const aktive = uebersicht.kanaele.filter((k) => k.aktiv && k.wert);

  if (aktive.length === 0) return null;

  return (
    <div>
      <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
        {t("footerHeading")}
      </p>
      <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
        {aktive.map((k) => (
          <li key={k.id}>
            {t(`typ.${k.typ}`)}: {k.wert}
          </li>
        ))}
      </ul>
    </div>
  );
}
