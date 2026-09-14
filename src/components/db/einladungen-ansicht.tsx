import { getFormatter, getTranslations } from "next-intl/server";
import { DataTable, Section, StatusPill } from "@/components/ui/kit";
import { DatenquelleBadge } from "@/components/db/datenquelle-badge";
import {
  EinladungErstellenFormular,
  EinladungZurueckziehenKnopf,
} from "@/components/db/einladungen-formulare";
import { ladeEinladungen } from "@/lib/data/einladungen";
import { anzeigeStatus, einladungStatusMeta } from "@/lib/domain/einladungen";
import { getSessionProfile } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";

// Einladungsverwaltung (Anforderung E.20). Bisher entstanden Kundenkonten
// ausschliesslich ueber supabase/seed-auth.mjs mit dem service_role-Schluessel
// - das Buero hatte keinen Weg, einen neuen B2B-Kunden selbst freizuschalten.
//
// Die Ansicht sitzt im Modul "rollen" (Zone Buero) statt in einem eigenen
// Menuepunkt: es ist Zugangsverwaltung, dieselbe Sache wie die Rechtematrix
// darueber, nur die schreibende Seite davon.
export async function EinladungenAnsicht() {
  const [liste, profil, t] = await Promise.all([
    ladeEinladungen(),
    getSessionProfile(),
    getTranslations("einladungenAnsicht"),
  ]);
  const format = await getFormatter();

  const live = liste.quelle === "db";
  // Das Modul "rollen" sieht auch, wer keine Zugaenge verwalten darf (die
  // Rechtematrix darueber ist reine Anzeige). Die Einladungsliste nennt
  // Namen und Adressen von Kundenansprechpartnern - sie gehoert nur vor die
  // Augen derer, die sie auch ausstellen. Im Demo-Modus bleibt sie sichtbar,
  // dort gibt es keine echten Personen, nur Beispieldaten.
  // Nur im Demo-Modus fuer jede Rolle sichtbar - dort gibt es keine echten
  // Personen. Bei quelle === "fehler" waere !live ebenfalls wahr und die
  // Zugangsverwaltung oeffnete sich fuer jeden, der das Modul aufruft.
  const darfSehen =
    liste.quelle === "demo" || hasPermission(profil?.role, "einladungen", "view");
  // Ausstellen zusaetzlich nur an einer echten Datenbank: im Demo-Modus gibt
  // es keine Anmeldung, ein Formular waere dort eine Attrappe.
  const darfAusstellen = live && hasPermission(profil?.role, "einladungen", "create");

  if (!darfSehen) return null;

  return (
    <Section
      title={t("titel")}
      description={t("lead")}
      action={<DatenquelleBadge quelle={liste.quelle} />}
    >
      {darfAusstellen ? (
        <EinladungErstellenFormular
          kunden={liste.kunden.map((kunde) => ({ wert: kunde.id, text: kunde.name }))}
        />
      ) : null}

      {/* Eine gekuerzte Liste muss sich als gekuerzt zu erkennen geben:
          der Zurueckziehen-Knopf haengt allein an ihr, was hier fehlt, ist
          ueber die Oberflaeche nicht mehr erreichbar. */}
      {liste.gesamt > liste.einladungen.length ? (
        <p className="rounded-xl border border-warning/25 bg-warning/[0.08] p-2.5 text-[11px] leading-4 text-foreground">
          {t("gekuerzt", { gezeigt: liste.einladungen.length, gesamt: liste.gesamt })}
        </p>
      ) : null}

      {liste.einladungen.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-6 text-center text-xs text-muted-foreground">
          {t("leer")}
        </p>
      ) : (
        <DataTable
          head={[
            t("spalte.kunde"),
            t("spalte.person"),
            t("spalte.status"),
            t("spalte.gueltigBis"),
            t("spalte.ausgestellt"),
            "",
          ]}
        >
          {liste.einladungen.map((einladung) => {
            const stand = anzeigeStatus(einladung);
            return (
              <tr key={einladung.id} className="align-top">
                <td className="px-3 py-2.5 font-semibold text-foreground">{einladung.kunde}</td>
                <td className="px-3 py-2.5">
                  <span className="block text-foreground">{einladung.fullName}</span>
                  <span className="block text-[11px] text-muted-foreground">{einladung.email}</span>
                </td>
                <td className="px-3 py-2.5">
                  <StatusPill tone={einladungStatusMeta[stand].tone}>
                    {t(`status.${stand}`)}
                  </StatusPill>
                </td>
                <td className="px-3 py-2.5 text-[11px] text-muted-foreground">
                  {format.dateTime(new Date(einladung.gueltigBis), {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </td>
                <td className="px-3 py-2.5 text-[11px] text-muted-foreground">
                  {format.dateTime(new Date(einladung.erstelltAm), { dateStyle: "short" })}
                  {einladung.erstelltVon ? (
                    <span className="block">{einladung.erstelltVon}</span>
                  ) : null}
                </td>
                <td className="px-3 py-2.5">
                  {/* Zurueckziehen nur bei einer Einladung, die noch etwas
                      bewirken kann. Eine abgelaufene ist bereits wirkungslos,
                      eine eingeloeste laesst sich damit nicht rueckgaengig
                      machen - dafuer braucht es die Kontoverwaltung. */}
                  {darfAusstellen && stand === "offen" ? (
                    <EinladungZurueckziehenKnopf id={einladung.id} />
                  ) : null}
                </td>
              </tr>
            );
          })}
        </DataTable>
      )}
    </Section>
  );
}
