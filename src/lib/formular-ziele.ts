// Sprungziele der Anlegen-Formulare. Ein Leerzustand mit Knopf verlinkt
// darauf (components/ui/zum-formular.tsx), das Formular traegt dieselbe id.
//
// Eigene Datei ohne "use client": Die Ansichten sind Server Components, die
// Formulare Client Components. Aus einer Client-Datei bekaeme eine Server
// Component nur Komponenten, keine Werte - eine Konstante kaeme dort nicht
// als Text an.
export const formularZiel = {
  plantage: "anlegen-plantage",
  parzelle: "anlegen-parzelle",
  reihengruppe: "anlegen-reihengruppe",
  pflueckaufgabe: "anlegen-pflueckaufgabe",
  buchung: "anlegen-buchung",
  lohnsatz: "anlegen-lohnsatz",
  zukauf: "anlegen-zukauf",
  lieferung: "anlegen-lieferung",
  tour: "anlegen-tour",
  vorbestellung: "anlegen-vorbestellung",
  preisliste: "anlegen-preisliste",
  sorte: "anlegen-sorte",
  einladung: "anlegen-einladung",
  reklamation: "anlegen-reklamation",
  rotationsplan: "anlegen-rotationsplan",
  kostentraeger: "anlegen-kostentraeger",
  kanal: "anlegen-kanal",
  dossier: "anlegen-dossier",
  kontingent: "anlegen-kontingent",
} as const;
