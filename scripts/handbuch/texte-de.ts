import type { HandbuchTexte } from "./typen";

// Deutsche Fassung - die Leitfassung, von der die drei anderen Sprachen
// abgeleitet sind. Modul-, Zonen- und Rollentexte stehen bewusst NICHT hier:
// die holt der Generator aus src/messages/de.json, damit Handbuch und
// Oberfläche dieselben Worte benutzen.

export const de: HandbuchTexte = {
  sprachname: "Deutsch",
  htmlLang: "de",

  kopf: {
    untertitel: "Produkthandbuch",
    suchePlatzhalter: "Handbuch durchsuchen …",
    sucheBeschriftung: "Handbuch durchsuchen",
    sucheZuruecksetzen: "Suche zurücksetzen (Esc)",
    pdfKnopf: "PDF speichern",
    pdfHinweis:
      "Vollständiges Handbuch als PDF speichern (Drucken → Als PDF speichern)",
    portalKnopf: "Zum Portal",
    portalHinweis: "Zurück zur Übersicht des Portals",
    themaKnopf: "Farbschema wechseln",
    spracheBeschriftung: "Sprache",
    trefferKeine: "0 Treffer",
    trefferAbZwei: "ab 2 Zeichen",
    treffer: "Treffer",
    ohneFundstelle:
      "Keine Fundstelle für {begriff}. Der PDF-Export enthält davon unabhängig immer das vollständige Handbuch.",
    inhalt: "Inhalt",
  },

  deckblatt: {
    dokumentart: "Produkthandbuch · WAMOCON GmbH",
    titel: "Damicon",
    untertitel:
      "Betriebssteuerung für einen Himbeerbetrieb im Umland von Almaty",
    version: "Version",
    versionWert: "0.1.0",
    status: "Status",
    statusWert: "Prototyp",
    sprachenLabel: "Sprachen",
    sprachenWert: "DE · EN · KK · RU",
    datum: "Stand",
    datumWert: "23. September 2026",
  },

  kapitel: {
    uebersicht: "Überblick",
    bedienung: "Das Portal bedienen",
    bereiche: "Bereiche und Module",
    anleitungen: "Anleitungen",
    referenz: "Referenz",
    technik: "Technik",
    recht: "Recht und Datenhaltung",
    glossar: "Glossar",
  },

  uebersicht: {
    einleitung:
      "Damicon steuert den Betrieb einer Himbeerplantage von der Reihe bis zur Rechnung: wo was reif ist, wer gepflückt hat, wie schnell die Ware gekühlt wurde, was sie gekostet und was sie eingebracht hat. Das Portal ist in vier Bereiche geteilt, die dem Weg der Frucht folgen — Feld, Hof, Büro, Markt.",
    kernsatzTitel: "Worum es geht",
    kernsatz:
      "Marktführerschaft entsteht bei der Himbeere nicht über die Menge, sondern über den Nachweis. Kühlkurve, Charge, Herkunftsblock, Pflücker und Behandlungsnachweis müssen für jede Lieferung lückenlos stehen. Genau das hält Damicon fest.",
    hinweisTitel: "Stand dieser Fassung",
    hinweis:
      "Das Portal ist ein Prototyp. Die Hauptfunktionen arbeiten mit einer echten Datenbank: Anmeldung, Rollenrechte, Standortverwaltung, Reihenblock-Sperre, Pflückaufgabe mit Fotobeleg, Dokumentenablage. Zwei Module sind noch Menüpunkt ohne Ansicht. Die Kennzahlen zeigen Ausgangswerte, bis die erste vollständig gemessene Saison vorliegt. Ohne Datenbankverbindung läuft das Portal im Demo-Modus mit Beispieldaten.",
    zonenTitel: "Die vier Bereiche",
    zonenEinleitung:
      "Jeder Bereich hat eine eigene Startseite mit seinen Modulen als Kacheln. Welche davon sichtbar sind, hängt an der Rolle des angemeldeten Kontos.",
    rollenTitel: "Rollen",
    rollenEinleitung:
      "Acht Rollen. Die Rolle des angemeldeten Kontos entscheidet, welche Module in der Navigation erscheinen und was sich davon ändern lässt — geprüft wird das nicht nur in der Oberfläche, sondern noch einmal in der Datenbank.",
    spalteRolle: "Rolle",
    spalteBeschreibung: "Aufgabe und Rechte",
    bedienhinweisTitel: "Dieses Handbuch bedienen",
    bedienhinweisSuche:
      "Suchen: Feld oben rechts, oder mit / beziehungsweise Strg+K dorthin springen. Die Suche blendet Kapitel ohne Fundstelle aus und hebt die Treffer hervor; Eingabe springt zum nächsten, Umschalt+Eingabe zum vorherigen, Esc setzt zurück. Umlaute sind dabei gleichgültig — „Kuhlkette“ findet die Kühlkette.",
    bedienhinweisPdf:
      "Als PDF speichern: Schaltfläche oben rechts, dann im Druckdialog „Als PDF speichern“ wählen. Der Export enthält immer das vollständige Handbuch in der gerade gewählten Sprache — ein aktiver Suchfilter wird vorher zurückgesetzt, damit kein Ausschnitt entsteht, dem man das Fehlende nicht ansieht. Das gilt auch für Strg+P.",
  },

  bedienung: {
    einleitung:
      "Dieses Kapitel beschreibt die Oberfläche: wie man sich anmeldet, wie die Navigation aufgebaut ist und wo die Einstellungen liegen. Was die einzelnen Module tun, steht im nächsten Kapitel.",
    anmeldungTitel: "Anmelden",
    anmeldung: {
      id: "anmelden",
      titel: "Anmelden",
      schritte: [
        "Das Portal öffnen. Ohne Sprachkürzel in der Adresse führt der Weg automatisch auf die deutsche Fassung.",
        "Auf der Startseite „Zum Portal“ wählen oder direkt die Anmeldeseite aufrufen.",
        "Mailadresse und Passwort eingeben.",
        "Ist für das Konto ein zweiter Faktor hinterlegt, folgt die Abfrage des sechsstelligen Codes. Ein Sprung direkt auf die Übersicht hilft nicht — die Prüfung liegt vor der Seite, nicht in ihr.",
        "Nach der Anmeldung steht die Übersicht mit den vier Bereichen und den Kennzahlen des Betriebs.",
      ],
    },
    zugaengeTitel: "Zugänge zum Ausprobieren",
    zugaengeText:
      "Für den Prototyp ist je Rolle ein Konto eingerichtet: admin@damicon.demo, ceo@damicon.demo, leitung@damicon.demo, buchhaltung@damicon.demo, brigade@damicon.demo, pfluecker@damicon.demo, erzeuger@damicon.demo, kunde@damicon.demo.",
    zugaengePasswort:
      "Das Passwort ist für alle acht Konten dasselbe: DamiconDemo2026! — Läuft das Portal ohne Datenbank, entfällt die Anmeldung ganz und es arbeitet mit Beispieldaten. Jede Ansicht zeigt oben rechts an, aus welcher Quelle sie liest.",
    aufbauTitel: "Aufbau der Oberfläche",
    aufbauEinleitung:
      "Am Schreibtisch trägt die Seitenleiste die Navigation, auf dem Telefon die Leiste am unteren Rand. Beide führen zu denselben Seiten.",
    teile: [
      {
        titel: "Seitenleiste",
        text: "Am linken Rand, ab Tabletbreite. Oben die Übersicht, darunter die vier Bereiche als aufklappbare Gruppen mit ihren Modulen. Ein Bereich, in dem die Rolle kein einziges Modul sehen darf, erscheint gar nicht. Die Leiste lässt sich auf eine schmale Symbolspalte einklappen; der Umschalter dafür sitzt in der Kopfzeile. Unten stehen das Handbuch, die angemeldete Person, der Zugang zur Sicherheitsseite und das Abmelden.",
      },
      {
        titel: "Kopfzeile",
        text: "Trägt den Navigationspfad der geöffneten Seite, den Umschalter für die Breite der Seitenleiste, die Sprachauswahl, das Farbschema und — für die Administration — das Feld „Ansicht als“.",
      },
      {
        titel: "Untere Leiste (Telefon)",
        text: "Unter Tabletbreite ersetzt sie die Seitenleiste. Das Menü führt in zwei Ebenen: zuerst Übersicht und die vier Bereiche, nach einem Tipp auf einen Bereich dessen Module, mit dem Bereich selbst als erstem Eintrag. Der Pfeil links oben führt zurück zur Bereichsliste. Ein Baum mit allen 27 Einträgen auf einmal ist die Form für eine stehende Spalte, nicht für eine Fläche, die man mit dem Daumen aufzieht; eine Ebene nach der anderen schon. Die Leiste bleibt dabei bedienbar, ein Tipp auf den Kontoknopf führt also direkt weiter zu Sprache, Farbschema, Handbuch, Sicherheit und Abmelden.",
      },
      {
        titel: "Übersicht",
        text: "Die Startseite nach der Anmeldung. Begrüßung, die vier Bereiche mit ihren Kennzahlen. Geschäftsführung und Administration sehen darüber „Das Wichtigste heute“: Reifegrad, ein Satz aus dem letzten Prüfbericht, die Änderungen seit dem Bericht davor und fünf Kacheln für Audit, Steuern, Recht, Risiko und Finanzen.",
      },
      {
        titel: "Bereichsseite",
        text: "Jeder Bereich hat eine eigene Seite mit seinen Modulen als Kacheln, samt Kurzbeschreibung. Sie ist der Weg zu den Modulen auf dem Telefon, wo die Seitenleiste fehlt.",
      },
      {
        titel: "Modulseite",
        text: "Zeigt die Ansicht des Moduls: Tabellen, Formulare, Kennzahlen. Oben rechts steht, ob die Daten aus der Datenbank kommen oder Beispieldaten sind. Module, die noch nicht gebaut sind, nennen in einem Satz, was sie können werden.",
      },
    ],
    spracheTitel: "Sprache umschalten",
    spracheText:
      "Die Sprachauswahl sitzt in der Kopfzeile, auf dem Telefon im Konto-Blatt. Vier Sprachen stehen zur Wahl: Deutsch, Englisch, Kasachisch und Russisch. Deutsch und Englisch sind vollständig übersetzt, Kasachisch und Russisch für den Prototyp in weiten Teilen; wo eine Übersetzung fehlt, erscheint der deutsche Text. Die Sprache steht in der Adresse, ein Sprachstand lässt sich also verlinken. Dieses Handbuch folgt der Sprache, in der das Portal gerade läuft, und hat oben rechts einen eigenen Umschalter.",
    themaTitel: "Farbschema",
    themaText:
      "Hell und Dunkel, umschaltbar in der Kopfzeile. Die Wahl bleibt im Browser gespeichert und gilt auch für dieses Handbuch. Ohne eigene Wahl richtet sich das Portal nach der Einstellung des Betriebssystems.",
    rolleTitel: "Rolle wechseln",
    rolleText:
      "Die wirksame Rolle ist die des angemeldeten Kontos; sie steht unten in der Seitenleiste. Um eine andere Rolle zu sehen, meldet man sich mit dem passenden Konto an. Die Administration hat zusätzlich das Feld „Ansicht als“: es ändert nur, was auf dem Schirm erscheint. Die Schreibrechte richten sich weiterhin nach dem Profil — und zwar in der Datenbank, wo ein Umschalten in der Oberfläche nichts bewirkt.",
    offlineTitel: "Ohne Netz arbeiten",
    offlineText:
      "Im Feld ist das Netz unzuverlässig. Meldungen zu Pflückaufgaben, Steigen, Arbeitszeiten und Kühlmessungen wandern deshalb in eine Warteschlange im Gerät und gehen später von selbst hinaus. Sie laufen dabei über dieselbe Prüfung wie eine Eingabe am Schreibtisch — eine Meldung aus der Warteschlange hat keine weiteren Rechte als die Person, die sie erfasst hat.",
  },

  bereiche: {
    einleitung:
      "26 Module in vier Bereichen. Dieses Kapitel beschreibt jedes einzelne: wozu es da ist, wer es sehen und wer darin arbeiten darf, und was noch offen ist. Die Angaben zu Rechten stammen aus derselben Rechtematrix, nach der sich das Portal im Betrieb richtet.",
    spalteModul: "Modul",
    spalteStand: "Stand",
    spalteRollen: "Sichtbar für",
    standAngebunden: "einsatzbereit",
    standEntwicklung: "in Entwicklung",
    standAngebundenErklaerung:
      "Arbeitet mit der Datenbank: liest und schreibt echte Daten, jeder Schreibvorgang ist an die Rolle gebunden und wird im Protokoll festgehalten.",
    standEntwicklungErklaerung:
      "Sichtbarer Menüpunkt ohne eigene Ansicht. Die Modulseite nennt in einem Satz, was das Modul können wird.",
    modulZweck: "Wozu",
    modulKurz: "Kurz gesagt",
    modulOffen: "Noch offen",
    modulPfad: "Aufruf",
    modulRollen: "Sichtbar für",
    modulRollenLeer: "Keine Rolle hat Zugriff.",
    modulSchreiben: "Ändern dürfen",
    modulSchreibenLeer: "Reine Anzeige — niemand ändert hier etwas.",
  },

  anleitungen: {
    einleitung:
      "Fünf Abläufe, die den Kern des Betriebs abdecken. Die Pfade beziehen sich auf die Seitenleiste.",
    liste: [
      {
        id: "wartezeit",
        titel: "Wartezeitsperre auslösen und aufheben",
        einleitung:
          "Nach einer Pflanzenschutzbehandlung darf ein Reihenblock bis zum Ablauf der Wartezeit nicht beerntet werden. Das Portal setzt diese Sperre selbst.",
        schritte: [
          "Als Betriebsleitung anmelden und Feld → Reihenblöcke und Status öffnen.",
          "Unten „Behandlung erfassen“: Reihenblock und Mittel wählen. Die Wartezeit kommt aus dem Mittelkatalog, sie wird nicht von Hand eingetragen.",
          "Der Block steht sofort auf wartezeitgesperrt. Die Spalte „Sperre“ zeigt Mittel, Behandlungsdatum, Wartezeit, Freigabedatum und die verbleibenden Tage.",
          "Ein Statuswechsel ist jetzt nicht mehr möglich. Die Regel liegt in der Datenbank und greift auch dann, wenn jemand an der Oberfläche vorbei arbeitet.",
          "Ist die Wartezeit abgelaufen, erscheint die Schaltfläche „Freigeben“. Sie hebt die Sperre auf und quittiert zugleich die Behandlung.",
          "Ein Klick auf die Statuskacheln filtert die Tabelle; der gefilterte Stand lässt sich als Link weitergeben.",
        ],
      },
      {
        id: "pflueckaufgabe",
        titel: "Pflückaufgabe mit Fotobeleg",
        schritte: [
          "Feld → Pflückaufgaben mit Fotobeleg öffnen.",
          "Unten eine neue Pflückaufgabe anlegen. Gesperrte Blöcke stehen nicht zur Auswahl und werden von der Datenbank zusätzlich abgewiesen.",
          "Links eine Aufgabe je Brigade und Reihenblock wählen. Der Fortschritt ist Istmenge gegen Zielmenge.",
          "Als Brigade die Aufgabe annehmen, das Pflücken starten und rechts einen Fotobeleg hochladen. Auf dem Telefon öffnet sich dafür direkt die Kamera. Die Datei liegt in einem privaten Ablagebereich und wird nur über kurzlebige, signierte Links angezeigt.",
          "„Menge melden“ setzt die Aufgabe auf Belegprüfung.",
          "Betriebsleitung oder Administration prüfen den Beleg, tragen den Qualitätsfaktor ein und geben die Aufgabe frei.",
        ],
      },
      {
        id: "nachweiskette",
        titel: "Die Nachweiskette einer Lieferung zeigen",
        einleitung:
          "Das ist der Ablauf, auf den es beim Kunden ankommt: von der Schale zurück bis zur Person, die sie gefüllt hat.",
        schritte: [
          "Feld → Pflückaufgaben mit Fotobeleg öffnen und links eine Aufgabe wählen.",
          "Rechts unter „Nachweiskette“ steht die Charge: Kühlkurve mit der 60-Minuten-Grenze, Menge und Ausschuss, die Steigen mit der Person, die sie gefüllt hat, und der Rückstandsnachweis.",
          "„Steige erfassen“ ordnet eine Steige einer Person zu. Erst damit reicht die Kette vom Kunden bis zum Pflücker.",
          "„Arbeitszeit melden“ liefert den Nenner der Pflückleistung in Kilogramm je Stunde.",
          "„Kühlmessung erfassen“: Minuten und Urteil rechnet die Datenbank aus dem Pflückzeitpunkt. Über 60 Minuten meldet die Oberfläche einen Verstoß, und die Ware ist abzuwerten.",
          "Auf der Übersicht zeigen die Kennzahlen danach den geänderten Istwert — gerechnet, nicht gesetzt.",
        ],
      },
      {
        id: "dokument",
        titel: "Ein Dokument aufnehmen",
        schritte: [
          "Als Bürorolle Büro → Dokumentenverwaltung öffnen.",
          "Unter „Dokument aufnehmen“ Bezeichnung, Kategorie, Bezug und Stand erfassen. Die Datei selbst — PDF oder Bild — ist dabei nicht zwingend.",
          "Hinterlegte Dateien öffnen sich über die Spalte „Datei“ per signiertem Link. Einen öffentlichen Direktzugriff gibt es nicht.",
        ],
      },
      {
        id: "zugang",
        titel: "Zugang einrichten: Einladung und zweiter Faktor",
        einleitung:
          "Neue Kundenkonten entstehen über eine Einladung. Den zweiten Faktor richtet jede Person für sich selbst ein.",
        schritte: [
          "Als Administration oder Betriebsleitung Büro → Rollen und Rechte öffnen.",
          "Unter „Einladungen“ Mailadresse und Rolle erfassen. Die Verwaltung sitzt hier, weil sie dieselbe Sache ist wie die Rechtematrix darüber — nur deren schreibende Seite.",
          "Die eingeladene Person öffnet den Einladungslink und vergibt ihr Passwort. Diese Seite ist ohne Anmeldung erreichbar: wer dort landet, hat noch kein Konto.",
          "Eine offene Einladung lässt sich zurückziehen, solange sie nicht eingelöst ist.",
          "Für den zweiten Faktor: unten in der Seitenleiste „Sicherheit“ öffnen, auf dem Telefon denselben Punkt im Konto-Blatt.",
          "„Starten“ zeigt QR-Code und Schlüssel — beides wird nur ein einziges Mal herausgegeben. In einer Authenticator-App scannen, den sechsstelligen Code eingeben und bestätigen. Erst damit gilt der Faktor.",
        ],
      },
    ],
  },

  referenz: {
    routenTitel: "Seiten",
    routenEinleitung:
      "Alle Adressen des Portals. {locale} steht für eines der vier Sprachkürzel de, en, kk oder ru; ohne Kürzel führt der Weg auf die deutsche Fassung.",
    routenNachsatz:
      "Die Seiten unter /dashboard verlangen eine Anmeldung. Ohne Datenbankverbindung entfällt diese Prüfung, weil es dann keine Sitzung gibt — der Demo-Modus bleibt so ohne Einrichtung startbar.",
    spaltePfad: "Adresse",
    spalteBeschreibung: "Inhalt",
    spalteZugriff: "Zugriff",
    routen: [
      {
        pfad: "/",
        beschreibung: "Leitet auf die deutsche Fassung weiter.",
        zugriff: "Alle",
      },
      {
        pfad: "/{locale}",
        beschreibung:
          "Öffentliche Startseite: worum es geht, warum die Himbeere besondere Anforderungen stellt, die 60-Minuten-Szene, Qualitätsmaßstab, Nachweiskette mit Link zur Herkunftsauskunft, Bereiche, Kennzahlen.",
        zugriff: "Alle",
      },
      {
        pfad: "/{locale}/login",
        beschreibung:
          "Anmeldung. Ohne Datenbankverbindung steht hier stattdessen ein Hinweis und der direkte Weg ins Portal.",
        zugriff: "Alle",
      },
      {
        pfad: "/{locale}/login/mfa",
        beschreibung:
          "Abfrage des zweiten Faktors. Eine Sitzung mit bloßem Passwort reicht nicht, wenn für das Konto ein bestätigter zweiter Faktor hinterlegt ist.",
        zugriff: "Angemeldet",
      },
      {
        pfad: "/{locale}/einladung",
        beschreibung:
          "Einen eingeladenen Zugang einlösen und das eigene Passwort vergeben. Ohne Anmeldung erreichbar — wer hier landet, hat noch kein Konto.",
        zugriff: "Alle",
      },
      {
        pfad: "/{locale}/dashboard",
        beschreibung:
          "Übersicht mit den vier Bereichen und ihren Kennzahlen. Für Geschäftsführung und Administration zusätzlich der Tagesblock „Das Wichtigste heute“.",
        zugriff: "Angemeldet",
      },
      {
        pfad: "/{locale}/dashboard/{bereich}",
        beschreibung:
          "Startseite eines Bereichs (feld, hof, buero, markt) mit seinen Modulen als Kacheln.",
        zugriff: "Nach Rolle",
      },
      {
        pfad: "/{locale}/dashboard/{bereich}/{modul}",
        beschreibung:
          "Ein einzelnes Modul. Die Adressen der 26 Module stehen im Kapitel „Bereiche und Module“.",
        zugriff: "Nach Rolle",
      },
      {
        pfad: "/{locale}/dashboard/compliance",
        beschreibung:
          "Der zuletzt gespeicherte Compliance-Bericht in voller Länge: Befunde mit Bereichsfilter, Maßnahmenplan, Hinweise, Siegelprüfung und PDF-Ausgabe.",
        zugriff: "Geschäftsführung, Administration",
      },
      {
        pfad: "/{locale}/dashboard/sicherheit",
        beschreibung:
          "Den eigenen zweiten Faktor einrichten, bestätigen oder entfernen. Jede Rolle verwaltet hier ausschließlich sich selbst.",
        zugriff: "Angemeldet",
      },
      {
        pfad: "/{locale}/dashboard/handbuch",
        beschreibung:
          "Dieses Handbuch, in der Sprache des Portals. Mit Volltextsuche und vollständigem PDF-Export.",
        zugriff: "Angemeldet",
      },
      {
        pfad: "/{locale}/herkunft",
        beschreibung:
          "Eingang zur öffentlichen Herkunftsauskunft mit Feld zum Abtippen des Codes — für alle, die keinen QR-Code scannen können.",
        zugriff: "Alle",
      },
      {
        pfad: "/{locale}/herkunft/{code}",
        beschreibung:
          "Die Auskunft zu genau einer Charge. Sie gibt weder die Chargennummer noch Pflücker-, Mengen- oder Preisangaben heraus; deshalb ist sie ohne Anmeldung vertretbar.",
        zugriff: "Alle",
      },
      {
        pfad: "/{locale}/herkunft/aushang",
        beschreibung:
          "Aushang zum Ausdrucken. Der QR-Code darauf zeigt auf die Codeeingabe, nicht auf eine einzelne Charge: ein Aushang hängt wochenlang am Kühlraum, eine Schale steht nur Stunden.",
        zugriff: "Alle",
      },
      {
        pfad: "/{locale}/impressum",
        beschreibung: "Impressum der WAMOCON GmbH.",
        zugriff: "Alle",
      },
      {
        pfad: "/{locale}/datenschutz",
        beschreibung: "Datenschutzhinweise samt Angaben zur Datenhaltung.",
        zugriff: "Alle",
      },
    ],

    rechteTitel: "Rechte je Rolle",
    rechteEinleitung:
      "Welche Rolle welches Modul sehen und ändern darf. Die Tabelle ist aus derselben Rechtematrix erzeugt, nach der sich das Portal im Betrieb richtet — sie kann also nicht veralten, ohne dass sich das Portal mit ihr ändert.",
    rechteHinweisTitel: "Zwei Prüfungen, nicht eine",
    rechteHinweis:
      "Die Oberfläche zeigt nur, was die Rolle darf — das ist Bequemlichkeit, keine Sicherheit. Verbindlich ist die Prüfung in der Datenbank: dort entscheidet die Rolle des Profils über jeden Lese- und Schreibvorgang, auch bei direktem Zugriff. Zusätzlich prüft die Anwendung vor jedem Schreibvorgang noch einmal selbst.",
    spalteRessource: "Modul",

    schnittstellenTitel: "Schnittstellen",
    schnittstellenEinleitung:
      "Sechs Endpunkte für Aufgaben, die keine eigene Seite haben. Jeder prüft Sitzung und Recht selbst.",
    spalteAufgabe: "Aufgabe",
    schnittstellen: [
      {
        pfad: "/api/ki-assistent",
        aufgabe:
          "Der KI-Assistent im laufenden Gespräch. Die Antwort erscheint, während sie entsteht, statt erst am Ende in einem Stück.",
        zugriff: "Recht am KI-Assistenten, erteilte Einwilligung",
      },
      {
        pfad: "/api/ki-pruefung",
        aufgabe:
          "Der Compliance-Lauf über die vier Prüfbereiche Audit, Steuer, Recht und Risiko. Der Fortschritt kommt laufend, damit die Oberfläche den Ablauf zeigen kann. Ohne hinterlegte Rechtsquellen lehnt der Lauf ab — eine Prüfung ohne Belege wäre wertlos. Je Person läuft nur eine Prüfung gleichzeitig.",
        zugriff: "Rolle mit Prüfrecht",
      },
      {
        pfad: "/api/ki-pruefung/auto",
        aufgabe:
          "Derselbe Lauf, ausgelöst beim Anmelden. Zuerst die günstige Prüfung, ob sich überhaupt etwas geändert hat; der vollständige Lauf folgt nur bei Bedarf.",
        zugriff: "Geschäftsführung, Administration",
      },
      {
        pfad: "/api/ki-sprachausgabe",
        aufgabe:
          "Liest Antworten vor: eine gespeicherte Antwort über die Kennung ihrer Nachricht, oder beim Vorlesen während des Schreibens einzelne Abschnitte, die der Chat beim Entstehen signiert hat. Nie frei übergebener Text, sonst wäre der Endpunkt ein Sprachgenerator für beliebige Inhalte. Die Stimme kommt vom eingestellten Anbieter (Soniox oder Sokrates); fällt er aus, spricht Sokrates. Eine gespeicherte Antwort kommt als Strom: Der Ton beginnt, während er noch erzeugt wird, statt erst nach der ganzen Datei.",
        zugriff: "Recht am KI-Assistenten",
      },
      {
        pfad: "/api/ki-spracherkennung",
        aufgabe:
          "Stellt für das Live-Diktat einen kurzlebigen Schlüssel aus: nur für die Spracherkennung, nur einmal, eine Minute zum Verbinden. Damit schickt der Browser das Gesprochene direkt an den Erkennungsdienst, und der Text erscheint schon während des Sprechens im Eingabefeld. Der eigentliche Schlüssel verlässt den Server nie. Sagt der Endpunkt ab, geht dieselbe Aufnahme wie bisher als Datei zur Erkennung.",
        zugriff: "Recht am KI-Assistenten, Live-Diktat eingeschaltet",
      },
      {
        pfad: "/api/sync",
        aufgabe:
          "Nimmt die Meldungen aus der Warteschlange entgegen, die im Feld ohne Netz entstanden sind. Sie laufen durch dieselbe Prüfung wie die zugehörigen Formulare.",
        zugriff: "Angemeldet, zweiter Faktor aktuell",
      },
    ],
  },

  technik: {
    stackTitel: "Verwendete Technik",
    spalteSchicht: "Schicht",
    spalteTechnik: "Technik",
    spalteAufgabe: "Aufgabe",
    stack: [
      {
        schicht: "Anwendung",
        technik: "Next.js 16",
        aufgabe:
          "Seiten werden auf dem Server gebaut; die Sprache steht in der Adresse.",
      },
      {
        schicht: "Sprache",
        technik: "TypeScript",
        aufgabe: "Typsicheres Modell der Fachbegriffe und der Rechtematrix.",
      },
      {
        schicht: "Gestaltung",
        technik: "Tailwind CSS v4",
        aufgabe:
          "Farb- und Maßvorgaben an einer Stelle, Hell- und Dunkelschema.",
      },
      {
        schicht: "Sprachen",
        technik: "next-intl",
        aufgabe:
          "Vier Sprachen; fehlt eine Übersetzung, erscheint der deutsche Text.",
      },
      {
        schicht: "Datenbank",
        technik: "PostgreSQL bei Supabase",
        aufgabe:
          "Daten samt Rechteprüfung in der Datenbank selbst, nicht nur in der Anwendung.",
      },
      {
        schicht: "Dateien",
        technik: "Privater Ablagebereich",
        aufgabe:
          "Fotobelege und Dokumente, erreichbar nur über kurzlebige signierte Links.",
      },
      {
        schicht: "Ohne Netz",
        technik: "Warteschlange im Gerät",
        aufgabe:
          "Meldungen aus dem Feld werden zwischengespeichert und später übertragen.",
      },
      {
        schicht: "KI",
        technik: "Austauschbare Anbieter",
        aufgabe:
          "Assistent, Compliance-Prüfung und Sprachausgabe auf gesicherter Datenbasis.",
      },
    ],
    meilensteineTitel: "Meilensteine",
    meilensteineEinleitung:
      "Interne Vorbereitung. Beide Termine liegen vor der Analysewoche vor Ort vom 24. September bis 1. Oktober 2026.",
    spalteMeilenstein: "Meilenstein",
    spalteTermin: "Termin",
    spalteInhalt: "Inhalt",
    meilensteine: [
      {
        name: "A — Prototyp",
        stand: "erledigt",
        art: "erledigt",
        termin: "bis 6. September 2026",
        inhalt:
          "Farb- und Maßfundament, öffentliche Startseite mit Sprachumschalter, Portalgerüst mit vier Bereichen, erste Abläufe: Reihenblock-Übersicht und Pflückaufgabe mit Fotobeleg.",
      },
      {
        name: "B — Grundgerüst",
        stand: "dieser Stand",
        art: "aktuell",
        termin: "bis 19. September 2026",
        inhalt:
          "Hauptfunktionen mit echter Datenbank: Anmeldung und Rollenrechte, Standortverwaltung, Reihenblock-Status mit Wartezeitsperre, Pflückaufgaben mit Fotobeleg im privaten Ablagebereich, Dokumentenverwaltung, Kennzahlen aus den Ausgangswerten.",
      },
    ],
    abgrenzungTitel: "Abgrenzung zum Zeitplan des Kunden",
    abgrenzung:
      "Dieser interne Zeitplan ist enger als der Termin, der dem Kunden für die erste Phase genannt wurde (16. Oktober bis 20. Dezember 2026). Der Prototyp ist ein internes Demonstrationssystem und nicht der vertraglich zugesicherte Leistungsumfang.",
  },

  recht: {
    einleitung:
      "Kasachstan hat 2026 in kurzer Folge neue Pflichten gesetzt. Die Sicherheitsvorkehrungen des Portals erfüllen deren Anspruch bereits; Hinweis- und Einwilligungstexte müssen nach kasachstanischem Recht jedoch neu formuliert und nicht bloß übersetzt werden.",
    spalteGrundlage: "Rechtsgrundlage 2026",
    spalteWirkung: "Bedeutung für Damicon",
    grundlagen: [
      {
        begriff: "Steuergesetzbuch 2026",
        text: "Wirkt auf Deckungsbeitrag und Kostenzuordnung.",
      },
      {
        begriff: "Elektronischer Warenbegleitschein (ЭСФ)",
        text: "Läuft über eine Ausgangswarteschlange, nicht über einen Eigenbau der Buchhaltung.",
      },
      {
        begriff: "KI-Gesetz Nr. 230-VIII",
        text: "Verlangt Transparenzhinweis und Einwilligung für den KI-Chat.",
      },
      {
        begriff: "Digitalkodex Nr. 255-VIII",
        text: "Datenhaltung: Die Speicherung bestimmter Daten außerhalb Kasachstans ist eingeschränkt. Der Standort für QR-, Warteschlangen- und KI-Daten ist vor dem Produktivbetrieb rechtlich zu prüfen.",
      },
      {
        begriff: "Verschärftes Datenschutzrecht (seit 24. August 2026)",
        text: "Betrifft vor allem das Anlegen von Kunden- und Nachbarbetriebskonten.",
      },
      {
        begriff: "ЕСУТД — Arbeitsvertragserfassung",
        text: "Jeder Saisonvertrag wird über die Ausgangswarteschlange im staatlichen System erfasst.",
      },
    ],
    prototypTitel: "Für den Prototyp",
    prototyp:
      "Der Prototyp verarbeitet keine personenbezogenen Daten und setzt keine Cookies zur Auswertung des Verhaltens. Farbschema und Demo-Rolle liegen ausschließlich im Browser.",
  },

  glossar: {
    einleitung: "Begriffe, die im Portal und in diesem Handbuch vorkommen.",
    spalteBegriff: "Begriff",
    spalteErklaerung: "Erklärung",
    eintraege: [
      {
        begriff: "Reihenblock",
        text: "Kleinste Einheit der Standortgliederung: ein abgegrenzter Abschnitt einer Spalierreihe. Alles — Status, Sperre, Ernte, Deckungsbeitrag — hängt an ihm.",
      },
      {
        begriff: "Wartezeitsperre",
        text: "Zustand eines Reihenblocks nach einer Pflanzenschutzbehandlung: Ernte gesperrt, bis die Wartezeit des Mittels abgelaufen ist.",
      },
      {
        begriff: "Charge",
        text: "Die Ernte eines Reihenblocks an einem Tag. Trägt die Kühlkurve, die Steigen und den Rückstandsnachweis.",
      },
      {
        begriff: "Steige",
        text: "Transportgebinde für geerntete Himbeeren, über einen QR-Code einer Charge und einer Person zugeordnet.",
      },
      {
        begriff: "Kühlketten-Uhr",
        text: "Zeitmessung vom Pflücken bis zur Vorkühlung. Über 60 Minuten ist die Ware am nächsten Tag nur noch Industrieware.",
      },
      {
        begriff: "Qualitätsfaktor-Lohn",
        text: "Grundvergütung plus Mengenanteil plus Qualitätsfaktor. Reiner Stücklohn ist bei der Himbeere wertvernichtend, weil er zu schnellem und grobem Pflücken führt.",
      },
      {
        begriff: "Nachweiskette",
        text: "Die lückenlose Kette von der ausgelieferten Schale zurück zu Reihenblock, Kühlkurve, Steige und Pflücker.",
      },
      {
        begriff: "Rollenrechte",
        text: "Die Zuordnung, welche Rolle welches Modul sehen und ändern darf. Sie gilt in der Oberfläche und, verbindlich, in der Datenbank.",
      },
      {
        begriff: "Zweiter Faktor",
        text: "Zusätzlicher sechsstelliger Code beim Anmelden, erzeugt von einer Authenticator-App.",
      },
      {
        begriff: "Demo-Modus",
        text: "Betrieb ohne Datenbankverbindung. Das Portal zeigt Beispieldaten, es gibt keine Anmeldung und nichts wird gespeichert.",
      },
      {
        begriff: "ЭСФ / ЕСУТД",
        text: "Kasachstanische Pflichtsysteme für elektronische Rechnungen beziehungsweise für die Erfassung von Arbeitsverträgen.",
      },
      {
        begriff: "WAMOCON",
        text: "WAMOCON GmbH — Auftraggeber und Entwickler von Damicon.",
      },
    ],
  },

  fuss: {
    rechte: "© 2026 WAMOCON GmbH — Alle Rechte vorbehalten",
    vermerk: "Damicon Produkthandbuch 0.1.0 · Vertraulich · September 2026",
  },
};
