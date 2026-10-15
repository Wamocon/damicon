import type { SessionProfile } from "@/lib/auth";
import { hasPermission, type Role } from "@/lib/rbac";
import { istUuid } from "@/lib/utils";
import type { DokumentEingabe } from "@/lib/dokument/damicon-dokument";
import type { DokumentKontext } from "@/lib/dokument/kontext";
import { baueEsutdDokument } from "@/lib/dokument/esutd";
import { baueEsfBelegDokument, baueEsfRegisterDokument } from "@/lib/dokument/esf";
import { baueFoerderDokument } from "@/lib/dokument/foerderung";
import { baueLieferungDokument } from "@/lib/dokument/lieferung";
import { baueNachweiseDokument } from "@/lib/dokument/nachweise";
import { baueLieferplanDokument } from "@/lib/dokument/lieferplan";
import { baueWirtschaftlichkeitDokument } from "@/lib/dokument/wirtschaftlichkeit";
import { baueAbholauftragDokument } from "@/lib/dokument/abholauftrag";
import { ladeEsutdMeldungen, ladeEsutdOptionen } from "@/lib/data/esutd";
import { ladeEsfUebersicht } from "@/lib/data/esf";
import { ladeFoerdermittel } from "@/lib/data/foerdermittel";
import { ladeCheckpunkte } from "@/lib/data/foerder-checkliste";
import { ladeLieferungen } from "@/lib/data/lieferungen";
import { ladeDokumente } from "@/lib/data/dokumente";
import { aktuelleVersionen } from "@/lib/domain/nachweise";
import { ladeLieferplanQuelle } from "@/lib/data/lieferplan";
import { ladeStand, ladeWirtschaftlichkeit } from "@/lib/data/wirtschaftlichkeit";
import { ladeAbholrunde } from "@/lib/data/abholrunden";
import { tagInZone } from "@/lib/domain/tageszeit";

// Die Dokumente, die das System im Damicon-Layout herausgibt: je Art ein Recht, die Namensraeume der Texte und das Laden der
// Daten. Die Vorlagen selbst (lib/dokument/*.ts) sind rein; hier wird geladen, mit den Rechten der abrufenden Person
// (Zeilensicherheit): ein Kunde bekommt nur seine eigenen Lieferungen, das Buero alle.

export interface LadeKontext {
  profil: SessionProfile;
  parameter: URLSearchParams;
  x: DokumentKontext;
}

export interface DokumentArt {
  /** Namensraeume der Texte, die die Vorlage zusaetzlich zum Rahmen und zu "roles" braucht. */
  namensraeume: string[];
  erlaubt: (rolle: Role) => boolean;
  /** null: das Gesuchte gibt es nicht (oder die Person darf es nicht sehen), die Route antwortet mit 404. */
  baue: (k: LadeKontext) => Promise<DokumentEingabe | null>;
}

const parameterId = (p: URLSearchParams, name: string): string | null => {
  const wert = p.get(name) ?? "";
  return istUuid(wert) ? wert : null;
};

export const DOKUMENT_ARTEN: Record<string, DokumentArt> = {
  esutd: {
    namensraeume: ["dokument.esutd", "esutdAnsicht"],
    // Wer Meldungen erfassen darf, bekommt auch ihre Liste (wie die CSV-Datei).
    erlaubt: (rolle) => hasPermission(rolle, "personal", "update"),
    baue: async ({ parameter, x }) => {
      const [meldungen, optionen] = await Promise.all([ladeEsutdMeldungen(), ladeEsutdOptionen()]);
      return baueEsutdDokument(
        { meldungen, nurOffene: parameter.get("status") !== "alle", heute: tagInZone(x.jetzt), belegNamen: new Map(optionen.belege.map((b) => [b.id, b.name])) },
        x,
      );
    },
  },
  esf: {
    namensraeume: ["dokument.esf", "esfAnsicht"],
    erlaubt: (rolle) => hasPermission(rolle, "integrationen", "view"),
    baue: async ({ parameter, x }) => {
      const uebersicht = await ladeEsfUebersicht();
      if (!parameter.has("beleg")) return baueEsfRegisterDokument(uebersicht, x);
      const id = parameterId(parameter, "beleg");
      const beleg = id ? uebersicht.belege.find((b) => b.id === id) : undefined;
      return beleg ? baueEsfBelegDokument(beleg, x) : null;
    },
  },
  foerderung: {
    namensraeume: ["dokument.foerderung", "foerdermittelCheckliste", "foerdermittelAnsicht"],
    erlaubt: (rolle) => hasPermission(rolle, "foerdermittel", "view"),
    baue: async ({ parameter, x }) => {
      const id = parameterId(parameter, "dossier");
      if (!id) return null;
      const [uebersicht, punkte] = await Promise.all([ladeFoerdermittel(), ladeCheckpunkte()]);
      const dossier = uebersicht.dossiers.find((d) => d.id === id);
      return dossier ? baueFoerderDokument({ dossier, punkte: punkte[id] ?? [], heute: tagInZone(x.jetzt) }, x) : null;
    },
  },
  lieferung: {
    namensraeume: ["dokument.lieferung", "lieferungenAnsicht", "nachweiskette"],
    // Das Buero und die Brigade sehen Lieferungen, der Kunde seine eigenen (Zeilensicherheit von lieferungen).
    erlaubt: (rolle) => hasPermission(rolle, "logistik", "view") || hasPermission(rolle, "b2b_portal", "view"),
    baue: async ({ parameter, x }) => {
      const id = parameterId(parameter, "lieferung");
      if (!id) return null;
      const lieferung = (await ladeLieferungen()).lieferungen.find((l) => l.id === id);
      return lieferung ? baueLieferungDokument(lieferung, x) : null;
    },
  },
  nachweise: {
    namensraeume: ["dokument.nachweise", "nachweisregister", "dokumentKategorie", "dokumenteDemo", "dokumenteVerwaltung"],
    erlaubt: (rolle) => hasPermission(rolle, "dokumente", "view"),
    baue: async ({ x }) => {
      const liste = await ladeDokumente();
      return baueNachweiseDokument(
        aktuelleVersionen(liste.dokumente).map((d) => ({
          id: d.id,
          name: d.name,
          kategorie: d.kategorie,
          bezug: d.bezug,
          gueltigVon: d.gueltigVon,
          gueltigBis: d.gueltigBis,
          unbefristet: d.unbefristet,
          nachweisStatus: d.nachweisStatus,
          tageBisAblauf: d.tageBisAblauf,
          verantwortlich: d.verantwortlich,
          rechtsgrundlage: d.rechtsgrundlage,
          partner: d.partner,
        })),
        tagInZone(x.jetzt),
        x,
      );
    },
  },
  abholauftrag: {
    namensraeume: ["dokument.abholauftrag", "abholrundenAnsicht"],
    // Wie die Abholrunden selbst: das Buero und die Brigade (Matrix: logistik, die Brigade nur lesend und erfassend).
    erlaubt: (rolle) => hasPermission(rolle, "logistik", "update"),
    baue: async ({ parameter, x }) => {
      const id = parameterId(parameter, "runde");
      const runde = id ? await ladeAbholrunde(id) : null;
      return runde ? baueAbholauftragDokument(runde, x) : null;
    },
  },
  wirtschaftlichkeit: {
    namensraeume: ["dokument.wirtschaftlichkeit", "wirtschaftlichkeitAnsicht", "wirtschaftlichkeitErfassung"],
    erlaubt: (rolle) => hasPermission(rolle, "wirtschaftlichkeit", "view"),
    baue: async ({ parameter, x }) => {
      const heute = tagInZone(x.jetzt);
      // Ein Stand ist ein eigenes Dokument: mit seinem Kurs, seinen Posten, seinen Ist-Werten.
      if (parameter.has("stand")) {
        const id = parameterId(parameter, "stand");
        const festgehalten = id ? await ladeStand(id) : null;
        if (!festgehalten) return null;
        const s = festgehalten.snapshot;
        return baueWirtschaftlichkeitDokument(
          { posten: s.posten, ist: s.ist, annahmen: s.annahmen, menge: s.mengeAbgeleitet, quelle: "stand", stand: { name: festgehalten.kopf.bezeichnung, standAm: festgehalten.kopf.standAm }, heute, standId: festgehalten.kopf.id },
          x,
        );
      }
      const daten = await ladeWirtschaftlichkeit();
      return baueWirtschaftlichkeitDokument(
        { posten: daten.posten, ist: daten.ist, annahmen: daten.annahmen, menge: daten.menge, quelle: daten.quelle === "modell" ? "modell" : "erfasst", heute },
        x,
      );
    },
  },
  lieferplan: {
    namensraeume: ["dokument.lieferplan", "lieferplan"],
    erlaubt: (rolle) => hasPermission(rolle, "b2b_portal", "view"),
    baue: async ({ profil, x }) => {
      const geladen = await ladeLieferplanQuelle();
      return geladen ? baueLieferplanDokument(geladen.quelle, geladen.heute, profil.role !== "kunde", x) : null;
    },
  },
};
