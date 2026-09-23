// Typen der Handbuch-Texte.
//
// Das Handbuch entsteht nicht mehr als handgepflegte HTML-Datei, sondern wird
// aus zwei Quellen erzeugt (scripts/handbuch/erzeugen.ts):
//
//   1. der Anwendung selbst - Module, Zonen, Rollen und Rechte kommen aus
//      src/lib/modules.ts, src/lib/rbac.ts und den Sprachkatalogen unter
//      src/messages/. Was dort steht, steht damit auch im Handbuch, in allen
//      vier Sprachen und ohne zweite Pflege.
//
//   2. den Texten hier - alles, was die Anwendung nicht selbst weiss:
//      Einleitung, Bedienung, Anleitungen, Technik, Recht, Glossar.
//
// Der Grund fuer den Umbau: das Handbuch soll in vier Sprachen vorliegen. Eine
// Datei je Sprache von Hand zu pflegen hiesse, vier Staende auseinanderlaufen
// zu lassen - und die Modulbeschreibungen stehen ohnehin schon uebersetzt im
// Sprachkatalog der Anwendung.

export const sprachen = ["de", "en", "kk", "ru"] as const;
export type Sprache = (typeof sprachen)[number];

/** Ein Eintrag mit Begriff und Erklaerung - Glossar, Rechtsgrundlagen, Stack. */
export interface Paar {
  begriff: string;
  text: string;
}

/** Eine nummerierte Anleitung. */
export interface Anleitung {
  id: string;
  titel: string;
  /** Optionaler Absatz vor den Schritten. */
  einleitung?: string;
  schritte: string[];
}

/** Eine Zeile der Routentabelle. */
export interface Route {
  pfad: string;
  beschreibung: string;
  zugriff: string;
}

/** Eine Zeile der Schnittstellentabelle. */
export interface Schnittstelle {
  pfad: string;
  aufgabe: string;
  zugriff: string;
}

/** Ein Element der Oberflaeche, im Bedienkapitel erklaert. */
export interface Bedienteil {
  titel: string;
  text: string;
}

/** Ein Meilenstein im Zeitplan. */
export interface Meilenstein {
  name: string;
  stand: string;
  /** "erledigt" | "aktuell" | "offen" - steuert die Farbe der Pille. */
  art: "erledigt" | "aktuell" | "offen";
  termin: string;
  inhalt: string;
}

export interface HandbuchTexte {
  /** Eigenbezeichnung der Sprache, fuer den Sprachumschalter. */
  sprachname: string;
  /** Wert fuer <html lang>. */
  htmlLang: string;

  kopf: {
    untertitel: string;
    suchePlatzhalter: string;
    sucheBeschriftung: string;
    sucheZuruecksetzen: string;
    pdfKnopf: string;
    pdfHinweis: string;
    portalKnopf: string;
    portalHinweis: string;
    themaKnopf: string;
    spracheBeschriftung: string;
    trefferKeine: string;
    trefferAbZwei: string;
    treffer: string;
    ohneFundstelle: string;
    inhalt: string;
  };

  deckblatt: {
    dokumentart: string;
    titel: string;
    untertitel: string;
    version: string;
    versionWert: string;
    status: string;
    statusWert: string;
    sprachenLabel: string;
    sprachenWert: string;
    datum: string;
    datumWert: string;
  };

  /** Kapitelueberschriften, Reihenfolge wie im Dokument. */
  kapitel: {
    uebersicht: string;
    bedienung: string;
    bereiche: string;
    anleitungen: string;
    referenz: string;
    technik: string;
    recht: string;
    glossar: string;
  };

  uebersicht: {
    einleitung: string;
    kernsatzTitel: string;
    kernsatz: string;
    hinweisTitel: string;
    hinweis: string;
    zonenTitel: string;
    zonenEinleitung: string;
    rollenTitel: string;
    rollenEinleitung: string;
    spalteRolle: string;
    spalteBeschreibung: string;
    bedienhinweisTitel: string;
    bedienhinweisSuche: string;
    bedienhinweisPdf: string;
  };

  bedienung: {
    einleitung: string;
    anmeldungTitel: string;
    anmeldung: Anleitung;
    zugaengeTitel: string;
    zugaengeText: string;
    zugaengePasswort: string;
    aufbauTitel: string;
    aufbauEinleitung: string;
    teile: Bedienteil[];
    spracheTitel: string;
    spracheText: string;
    themaTitel: string;
    themaText: string;
    rolleTitel: string;
    rolleText: string;
    offlineTitel: string;
    offlineText: string;
  };

  bereiche: {
    einleitung: string;
    spalteModul: string;
    spalteStand: string;
    spalteRollen: string;
    standAngebunden: string;
    standEntwicklung: string;
    standAngebundenErklaerung: string;
    standEntwicklungErklaerung: string;
    /** Ueberschriften innerhalb eines Modulabschnitts. */
    modulZweck: string;
    modulKurz: string;
    modulOffen: string;
    modulPfad: string;
    modulRollen: string;
    modulRollenLeer: string;
    modulSchreiben: string;
    modulSchreibenLeer: string;
  };

  anleitungen: {
    einleitung: string;
    liste: Anleitung[];
  };

  referenz: {
    routenTitel: string;
    routenEinleitung: string;
    routenNachsatz: string;
    spaltePfad: string;
    spalteBeschreibung: string;
    spalteZugriff: string;
    routen: Route[];

    rechteTitel: string;
    rechteEinleitung: string;
    rechteHinweisTitel: string;
    rechteHinweis: string;
    spalteRessource: string;

    schnittstellenTitel: string;
    schnittstellenEinleitung: string;
    spalteAufgabe: string;
    schnittstellen: Schnittstelle[];
  };

  technik: {
    stackTitel: string;
    spalteSchicht: string;
    spalteTechnik: string;
    spalteAufgabe: string;
    stack: { schicht: string; technik: string; aufgabe: string }[];
    meilensteineTitel: string;
    meilensteineEinleitung: string;
    spalteMeilenstein: string;
    spalteTermin: string;
    spalteInhalt: string;
    meilensteine: Meilenstein[];
    abgrenzungTitel: string;
    abgrenzung: string;
  };

  recht: {
    einleitung: string;
    spalteGrundlage: string;
    spalteWirkung: string;
    grundlagen: Paar[];
    prototypTitel: string;
    prototyp: string;
  };

  glossar: {
    einleitung: string;
    spalteBegriff: string;
    spalteErklaerung: string;
    eintraege: Paar[];
  };

  fuss: {
    rechte: string;
    vermerk: string;
  };
}
