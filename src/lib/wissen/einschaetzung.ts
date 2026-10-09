// Einschaetzung eines Dokuments der Wissensbasis fuer die Entscheidung der Administration (Vier-Augen-Pruefung und Bestandspruefung).
// Reine Funktion ohne Abhaengigkeiten: Sie liest nur, was die Liste ohnehin kennt, und liefert eine Empfehlung mit Gruenden.
//
// Sie ENTSCHEIDET nicht. Die Empfehlung ist ein Hilfsmittel: "freigeben" heisst, dass nichts Auffaelliges gefunden wurde, nicht, dass der
// Inhalt stimmt. Ob ein Buch inhaltlich taugt, liest die pruefende Person in der Vorschau. Was die Funktion pruefen kann, sind die
// mechanischen Dinge, an denen eine Wissensbasis in der Praxis scheitert: ein halb hochgeladenes Buch, eine unlesbare OCR, eine
// fehlende Einordnung, eine Quelle ohne nachpruefbaren Link, eine Quelle, die nur als Notbehelf taugt.
//
// Die Gruende sind Schluessel (Oberflaeche uebersetzt sie), die Stufe je Grund sagt, wie schwer er wiegt:
//   block   = nicht freigeben (Empfehlung ablehnen oder loeschen)
//   pruefen = erst ansehen, dann entscheiden
//   info    = gut zu wissen, aendert die Empfehlung nicht

import type { WissenDokumentZeile } from "@/lib/wissen/dokumente-liste";

export type Empfehlung = "freigeben" | "pruefen" | "ablehnen";
export type GrundGewicht = "block" | "pruefen" | "info";

export type GrundCode =
  | "unvollstaendig"
  | "guteSchlecht"
  | "guetePruefen"
  | "ohneEinordnung"
  | "ohneLink"
  | "linkUngueltig"
  | "sehrKurz"
  | "notbehelf"
  | "hinweis"
  | "ohneStufe";

export interface Grund {
  code: GrundCode;
  gewicht: GrundGewicht;
}

export interface Einschaetzung {
  empfehlung: Empfehlung;
  gruende: Grund[];
}

const GEWICHT: Record<GrundCode, GrundGewicht> = {
  unvollstaendig: "block",
  guteSchlecht: "block",
  guetePruefen: "pruefen",
  ohneEinordnung: "pruefen",
  ohneLink: "pruefen",
  linkUngueltig: "pruefen",
  sehrKurz: "pruefen",
  ohneStufe: "pruefen",
  notbehelf: "info",
  hinweis: "info",
};

/** Ein Link ist brauchbar, wenn er eine absolute http(s)-Adresse mit einem Host mit Punkt ist. */
export function linkBrauchbar(url: string | null): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return (u.protocol === "http:" || u.protocol === "https:") && u.hostname.includes(".");
  } catch {
    return false;
  }
}

/** Wenige Abschnitte bei einem ganzen Dokument sind verdaechtig (ein Inhaltsverzeichnis, eine leere Seite, ein Fehlschlag beim Lesen). */
const MIN_ABSCHNITTE = 3;

export function schaetzeEin(d: WissenDokumentZeile): Einschaetzung {
  const codes = new Set<GrundCode>();
  if (d.unvollstaendig) codes.add("unvollstaendig");
  if (d.guete === "schlecht") codes.add("guteSchlecht");
  else if (d.guete === "pruefen") codes.add("guetePruefen");
  if (!d.quellenart || !d.cluster) codes.add("ohneEinordnung");
  if (d.stufe === null && d.quellenart) codes.add("ohneStufe");
  // Ein Link ist bei Quellen aus dem Netz die einzige Moeglichkeit, die Herkunft nachzupruefen.
  if (d.cluster === "internet") {
    if (!d.url) codes.add("ohneLink");
    else if (!linkBrauchbar(d.url)) codes.add("linkUngueltig");
  } else if (d.url && !linkBrauchbar(d.url)) {
    codes.add("linkUngueltig");
  }
  if (d.chunks < MIN_ABSCHNITTE && !d.unvollstaendig) codes.add("sehrKurz");
  if (d.nutzung === "notfalls") codes.add("notbehelf");
  else if (d.nutzung === "hinweis") codes.add("hinweis");

  const gruende: Grund[] = [...codes].map((code) => ({ code, gewicht: GEWICHT[code] }));
  const reihenfolge: Record<GrundGewicht, number> = { block: 0, pruefen: 1, info: 2 };
  gruende.sort((a, b) => reihenfolge[a.gewicht] - reihenfolge[b.gewicht]);
  const empfehlung: Empfehlung = gruende.some((g) => g.gewicht === "block") ? "ablehnen" : gruende.some((g) => g.gewicht === "pruefen") ? "pruefen" : "freigeben";
  return { empfehlung, gruende };
}
