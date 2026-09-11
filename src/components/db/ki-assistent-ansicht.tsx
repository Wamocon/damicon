import { getTranslations } from "next-intl/server";
import { Section } from "@/components/ui/kit";
import { DatenquelleBadge } from "@/components/db/datenquelle-badge";
import { KiAnbieterVerwaltung, KiChatFenster } from "@/components/db/ki-assistent-formulare";
import { ladeKiAnbieterListe, ladeKiChatVerlauf } from "@/lib/data/ki-assistent";
import { getSessionProfile } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";

// KI-Assistent (Anforderung 5.4/5.5). Ersetzt KiAssistentMock (reines
// Platzhalter-Chatfenster ohne Modellanbindung) durch einen echten,
// anbieteruebergreifenden Chat: RBAC-Gate vor jedem Modellaufruf
// (requirePermission in actions/ki-assistent.ts), deterministischer Fallback
// ohne 5xx, Protokollierung ueber audit_events, Transparenzhinweis und
// Eskalation an einen Menschen unten im Chatfenster.
//
// Ein Admin sieht zusaetzlich die Anbieterverwaltung (KiAnbieterVerwaltung) -
// dort werden Sokrates, Claude (Anthropic) oder ein selbst gehostetes
// Open-Source-Modell jeweils per API-Key angebunden, siehe
// src/lib/domain/ki-assistent.ts fuer die beiden unterstuetzten Anfrageformen.
export async function KiAssistentAnsicht() {
  const [verlauf, profil, t] = await Promise.all([
    ladeKiChatVerlauf(),
    getSessionProfile(),
    getTranslations("kiAssistentAnsicht"),
  ]);

  const istAdmin = hasPermission(profil?.role, "ki_assistent", "manage");
  const anbieterListe = istAdmin ? await ladeKiAnbieterListe() : null;

  return (
    <div className="space-y-6">
      <Section
        title={t("chatTitel")}
        description={t("chatLead")}
        action={<DatenquelleBadge quelle={verlauf.quelle} />}
      >
        <KiChatFenster verlauf={verlauf.nachrichten} />
      </Section>

      {istAdmin && anbieterListe ? (
        <Section
          title={t("anbieterVerwaltung.titel")}
          description={t("anbieterVerwaltung.lead")}
          action={<DatenquelleBadge quelle={anbieterListe.quelle} />}
        >
          <KiAnbieterVerwaltung anbieter={anbieterListe.anbieter} />
        </Section>
      ) : null}
    </div>
  );
}
