// Erzeugt die ausfuellbaren Testfall-Tabellen aus einer einzigen Datenquelle.
//
// Ergebnis in docs/tests/manuell/:
//   damicon-testfaelle.xlsx        alles in einer Mappe, ein Blatt je Rolle
//   testfaelle-<rolle>.xlsx        je Rolle einzeln, fuer paralleles Testen
//
// Die Markdown-Fassungen daneben bleiben als lesbare Vorschau bestehen. Wer
// Testfaelle aendert, aendert sie HIER und erzeugt neu, sonst laufen die
// beiden Fassungen auseinander.
//
// exceljs ist bewusst KEINE Projektabhaengigkeit - das hier ist ein einmaliger
// Dokumentgenerator, kein Teil der Anwendung. Vor dem Lauf einmalig in einem
// beliebigen Verzeichnis ausserhalb des Projekts installieren:
//
//   npm install exceljs
//   node scripts/testfaelle-xlsx-erzeugen.mjs --exceljs <pfad-zu-node_modules/exceljs>

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createRequire } from "node:module";

const ZIEL = "docs/tests/manuell";

const pfadArg = process.argv.indexOf("--exceljs");
const exceljsPfad = pfadArg > -1 ? process.argv[pfadArg + 1] : "exceljs";
const require = createRequire(import.meta.url);
const ExcelJS = require(exceljsPfad);

// --- Inhalte ----------------------------------------------------------------

const SCHRIFT = "Arial";

const ROLLEN = [
  {
    blatt: "Admin",
    datei: "admin",
    titel: "Rolle: Admin",
    konto: "admin@damicon.demo",
    hinweis:
      "Einzige Rolle mit Vollzugriff. Geprueft wird vor allem, ob die Rechteverwaltung selbst stimmt, denn jeder Fehler hier wirkt auf alle anderen Rollen.",
    faelle: [
      ["TF-A1", "Rechtematrix ist vollstaendig und stimmt",
        "1. Buero > Rollen oeffnen\n2. Rechtematrix aufklappen\n3. Zeile \"Lohn\" suchen\n4. Spalten Pfluecker und Brigade vergleichen",
        "keine Eingabe",
        "Alle 7 Rollen sind gelistet. Pfluecker hat bei Lohn nur \"ansehen\", Brigade hat bei Lohn gar kein Recht. Die Matrix zeigt die tatsaechliche Konfiguration, keine feste Grafik."],
      ["TF-A2", "Kundenzugang ausstellen",
        "1. Buero > Rollen > Kundenzugaenge\n2. \"Einladung ausstellen\"\n3. Felder fuellen\n4. Absenden\n5. Angezeigten Code notieren",
        "B2B-Kunde: Almaty Fresh Market\nName: TEST Aigul Sarsenowa\nE-Mail: test.kunde.20092026@example.com",
        "Einladung wird angelegt, ein Code erscheint. Hinweis \"gilt 14 Tage und nur fuer diese Adresse\".\nCODE HIER NOTIEREN, wird in TF-K1 gebraucht."],
      ["TF-A3", "\"Ansicht als\" wirkt auf die Anzeige",
        "1. Oben rechts Rollenumschalter\n2. Auf \"Pfluecker\" umstellen\n3. Navigation ansehen\n4. Zurueck auf Admin",
        "Rolle: Pfluecker",
        "Die Navigation schrumpft sichtbar auf Dashboard, Lohn und Schulungen. Feld, Hof und Markt verschwinden. Nach dem Zuruecksetzen ist wieder alles da."],
      ["TF-A4", "KI-Anbieter verwalten (nur Admin)",
        "1. KI-Bereich oeffnen\n2. Anbieterliste aufrufen\n3. Pruefen, ob Anbieter anlegbar/aenderbar sind",
        "nichts speichern, nur pruefen ob erreichbar",
        "Die Anbieterverwaltung ist erreichbar und bedienbar. Kein Schluessel wird im Klartext angezeigt."],
      ["TF-A5", "Steuernummer mit falscher Pruefziffer wird abgelehnt (NEGATIVTEST)",
        "1. Buero > Stammdaten\n2. Betrieb bearbeiten, Rechtsform KH/FH (Feld heisst dann IIN)\n3. Wert 1 eintragen, speichern\n4. Wert 2 eintragen, speichern\n5. Wert 3 eintragen, speichern",
        "1. zu kurz: 78062130045\n2. Pruefziffer falsch: 780621300451\n3. gueltig: 780621300453",
        "Wert 1 abgelehnt mit Hinweis auf die Stellenzahl. Wert 2 abgelehnt mit Hinweis auf die PRUEFZIFFER, das ist eine andere Meldung als bei Wert 1. Wert 3 wird gespeichert.\nWird Wert 1 oder 2 angenommen: S1."],
      ["TF-A6", "Auditprotokoll und MFA-Status",
        "1. Buero > Compliance\n2. Auditprotokoll oeffnen\n3. Nach dem Eintrag aus TF-A2 suchen\n4. MFA-Status ansehen",
        "Suchzeitraum: heute",
        "Die in TF-A2 ausgestellte Einladung taucht als Eintrag auf, mit Zeit und handelndem Benutzer. Der MFA-Status je Konto ist erkennbar."],
      ["TF-A7", "Admin sieht alle vier Zonen",
        "1. Navigation durchgehen\n2. Je ein Modul aus Feld, Hof, Buero, Markt oeffnen",
        "Feld: Reihenbloecke\nHof: Kuehlkette\nBuero: Finanzen\nMarkt: Preislisten",
        "Alle vier Module oeffnen ohne Zugriffsmeldung und zeigen Inhalte."],
    ],
  },
  {
    blatt: "Betriebsleitung",
    datei: "betriebsleitung",
    titel: "Rolle: Betriebsleitung",
    konto: "leitung@damicon.demo",
    hinweis:
      "Wichtigster Test ist die Wartezeitsperre: nach einer Pflanzenschutzbehandlung darf auf dem Block gesetzlich nicht geerntet werden, und das System muss das von sich aus verhindern. TF-L2 sperrt, TF-L3 prueft die Wirkung, beide gehoeren zusammen.",
    faelle: [
      ["TF-L1", "Pflueckaufgabe anlegen und zuweisen",
        "1. Feld > Pflueckaufgaben\n2. \"Neue Pflueckaufgabe\"\n3. Felder fuellen\n4. \"Aufgabe anlegen\"",
        "Reihenblock: T-N-A-01\nBrigade: Brigade Nord\nZielmenge in kg: 120",
        "Aufgabe erscheint mit Status \"offen\" und Brigade Nord. Wird in TF-B1 gebraucht."],
      ["TF-L2", "Behandlung erfassen sperrt den Block automatisch",
        "1. Feld > Pflanzenschutz\n2. \"Behandlung erfassen\"\n3. Felder fuellen, speichern\n4. Feld > Reihenbloecke oeffnen, Block T-N-A-03 suchen",
        "Reihenblock: T-N-A-03\nMittel: Signum\nBehandelt am: heute\nAufwandmenge: 1,5\nEinheit: kg/ha\nDurchgefuehrt von: TEST Betriebsleitung",
        "Block T-N-A-03 steht danach auf Status \"wartezeitgesperrt\" und zeigt ein \"Frei ab\"-Datum in der Zukunft. Niemand musste den Status von Hand setzen."],
      ["TF-L3", "Gesperrter Block laesst sich nicht bepfluecken (NEGATIVTEST)",
        "1. Feld > Pflueckaufgaben\n2. \"Neue Pflueckaufgabe\"\n3. Auswahlliste Reihenblock oeffnen\n4. Nach T-N-A-03 suchen",
        "Reihenblock T-N-A-03 versuchen",
        "Der gesperrte Block erscheint GAR NICHT in der Auswahl.\nLaesst sich eine Aufgabe darauf anlegen: S1 (Ernte trotz gesetzlicher Wartezeit)."],
      ["TF-L4", "Fotobeleg pruefen und Aufgabe abschliessen",
        "1. Feld > Pflueckaufgaben\n2. Aufgabe im Status \"Belegpruefung\" oeffnen (entsteht in TF-B3)\n3. Fotobeleg ansehen\n4. Aufgabe abschliessen",
        "keine Eingabe, nur Freigabe",
        "Status wechselt auf \"abgeschlossen\". Erst jetzt ist die Aufgabe fuer die Lohnabrechnung (TF-F2) verwertbar. Ohne Foto darf kein Abschluss moeglich sein."],
      ["TF-L5", "Rotationsplan zeigt den naechsten Pfluecktermin",
        "1. Feld > Rotationsplan\n2. Plantage waehlen\n3. Eintrag zu T-N-A-03 suchen",
        "Plantage: Plantage Talgar",
        "Der Plan zeigt je Reihenblock den naechsten Termin im Rhythmus von 2 bis 3 Tagen. Der in TF-L2 gesperrte Block ist als gesperrt gekennzeichnet oder ausgenommen, nicht normal eingeplant."],
      ["TF-L6", "Lohn ist nur lesbar, nicht aenderbar (NEGATIVTEST)",
        "1. Buero > Lohn oeffnen\n2. Nach \"Freigeben\", \"Satz anlegen\" oder \"Periode berechnen\" suchen",
        "keine Eingabe",
        "Abrechnungen sind sichtbar, aber es gibt keine Schaltflaeche zum Anlegen, Berechnen oder Freigeben. Lohn gehoert der Buchhaltung.\nErscheint eine solche Schaltflaeche und funktioniert sie: S1."],
    ],
  },
  {
    blatt: "Buchhaltung",
    datei: "buchhaltung",
    titel: "Rolle: Buchhaltung",
    konto: "buchhaltung@damicon.demo",
    hinweis:
      "Hier entstehen Zahlen, die auf Belegen landen. Jede Abweichung in einem Betrag ist mindestens S2, auch wenn sie klein wirkt. TF-F2 braucht eine abgeschlossene Pflueckaufgabe aus TF-L4.",
    faelle: [
      ["TF-F1", "Lohnsatz anlegen",
        "1. Buero > Lohn\n2. \"Neuen Lohnsatz anlegen\"\n3. Felder fuellen\n4. \"Satz anlegen\"\n5. Gegenprobe: denselben Satz noch einmal anlegen",
        "Gueltig ab: 01.10.2026\nStundenlohn: 900 Tenge\nkg-Satz: 850 Tenge\nZiel-Ausschussquote: 5 %\nFaktor min: 0,90\nFaktor max: 1,10",
        "Satz wird gespeichert und erscheint in der Historie. Ein zweiter Satz mit demselben \"Gueltig ab\" muss ABGELEHNT werden, das ist die Eindeutigkeitsregel."],
      ["TF-F2", "Periode berechnen mit Qualitaetsfaktor",
        "1. Buero > Lohn\n2. \"Periode berechnen\"\n3. Zeitraum waehlen\n4. Berechnen\n5. \"Positionen je Pflueckaufgabe\" oeffnen",
        "Zeitraum: laufender Monat\nBrigade: Brigade Nord",
        "Je Pfluecker entsteht eine Abrechnung. Der Qualitaetsfaktor ist sichtbar und liegt zwischen 0,90 und 1,10. Bei genau 5 % Ausschuss muss er 1,00 sein.\nFehlt der Faktor oder liegt er ausserhalb: S2."],
      ["TF-F3", "Gesetzliche Abzuege Kasachstan rechnen korrekt",
        "1. Buero > Lohn > \"Monatsabzuege berechnen\"\n2. Fall A eingeben, berechnen, vergleichen\n3. Mit Fall B wiederholen\n4. Mit Fall C wiederholen",
        "Fall A Brutto: 250000\nFall B Brutto: 150000\nFall C Brutto: 100000",
        "A: OPV 25.000,00 | VOSMS 5.000,00 | IPN-Grundlage 90.250,00 | IPN 9.025,00 | NETTO 210.975,00 | OPVR 8.750,00\nB: OPV 15.000,00 | VOSMS 3.000,00 | Grundlage 2.250,00 | IPN 225,00 | NETTO 131.775,00\nC: OPV 10.000,00 | VOSMS 2.000,00 | Grundlage 0,00 | IPN 0,00 | NETTO 88.000,00\nFall C ist der wichtige: der Freibetrag von 129.750 Tenge darf nicht ins Minus laufen."],
      ["TF-F4", "Freigabe und Ruecknahme der Freigabe",
        "1. Eine berechnete Abrechnung oeffnen\n2. \"Freigeben\"\n3. Ruecknahme der Freigabe versuchen\n4. \"Als ausgezahlt markieren\"",
        "keine Eingabe",
        "Nach der Freigabe wechselt der Status sichtbar. Die Ruecknahme verlangt eine ZWEITE, eigene Bestaetigung, sie passiert nicht mit einem Klick.\nLaesst sich eine Freigabe mit einem Klick rueckgaengig machen: S2."],
      ["TF-F5", "Steuernummer eines Kunden pflegen",
        "1. Buero > Stammdaten\n2. Kunden Almaty Fresh Market waehlen\n3. Rechtsform TOO setzen (Feld heisst dann BIN)\n4. Nummer eintragen, speichern\n5. Gegenprobe mit ungueltigem Wert",
        "Rechtsform: TOO\nBIN gueltig: 190940001235\nGegenprobe ungueltig: 190940001231",
        "Der gueltige Wert wird gespeichert. Der Gegenprobenwert wird mit Hinweis auf die PRUEFZIFFER abgelehnt. Bei Rechtsform TOO muss das Feld BIN heissen, nicht IIN."],
      ["TF-F6", "Reklamation bearbeiten und schliessen",
        "1. Markt > Reklamationen\n2. Vorgang aus TF-K5 oeffnen\n3. \"In Pruefung nehmen\"\n4. Nachricht hinzufuegen\n5. \"Annehmen\", dann \"Als erledigt abschliessen\"",
        "Nachricht: TEST Gutschrift geprueft, Ware war bei Anlieferung zu warm",
        "Der Status durchlaeuft die Stufen sichtbar. Die Rueckverfolgung zeigt die urspruengliche Charge. Der Verlauf enthaelt die eigene Nachricht mit Zeitstempel."],
      ["TF-F7", "Kein Eingriff in den Feldbetrieb (NEGATIVTEST)",
        "1. Navigation pruefen: erscheint Feld > Pflueckaufgaben?\n2. Adresse aufrufen: /de/dashboard/feld/pflanzenschutz\n3. Falls Pflueckaufgaben lesbar: nach \"Neue Pflueckaufgabe\" suchen",
        "direkter Adressaufruf",
        "Pflueckaufgaben sind hoechstens LESBAR, nicht anlegbar. Pflanzenschutz endet mit einer Zugriffsmeldung. Die Buchhaltung rechnet ab, sie plant keine Ernte.\nLaesst sich eine Aufgabe anlegen oder eine Behandlung erfassen: S2."],
    ],
  },
  {
    blatt: "Brigade",
    datei: "brigade",
    titel: "Rolle: Brigade",
    konto: "brigade@damicon.demo",
    hinweis:
      "Arbeitet im Feld, am Telefon, oft ohne gutes Netz. MINDESTENS TF-B1 bis TF-B3 auf einem Handy oder in einem Browserfenster von etwa 390 px Breite durchgehen. TF-B1 braucht die Aufgabe aus TF-L1.",
    faelle: [
      ["TF-B1", "Aufgabe annehmen und starten",
        "1. Feld > Pflueckaufgaben\n2. Aufgabe zu T-N-A-01 im Status \"offen\" oeffnen\n3. \"Aufgabe annehmen\"\n4. \"Pfluecken starten\"",
        "keine Eingabe",
        "Status wechselt offen > angenommen > in Arbeit. Jeder Schritt ist sofort sichtbar, ohne die Seite neu zu laden."],
      ["TF-B2", "Menge melden",
        "1. Dieselbe Aufgabe oeffnen\n2. Ist-Menge und Ausschuss eintragen\n3. \"Menge melden und zur Belegpruefung geben\"",
        "Ist-Menge in kg: 118,5\nAusschuss in kg: 6\nPfluecker: D. Sarsenbaj",
        "Status wechselt auf \"Belegpruefung\". Die Mengen stehen wie eingegeben da, das Komma wurde nicht verschluckt (118,5 darf nicht zu 1185 werden)."],
      ["TF-B3", "Fotobeleg hochladen (Pflicht)",
        "1. Aufgabe oeffnen\n2. Belegart waehlen\n3. Bild waehlen, Hinweis eintragen\n4. \"Fotobeleg hochladen\"",
        "Belegart: Steige\nFoto: beliebiges Bild vom Geraet\nHinweis: TEST Verkaufsschale 125 g, geschlossene Fruchtdecke",
        "Das Bild erscheint als Beleg bei der Aufgabe, vorher stand dort ein Platzhalter. Ohne Beleg darf die Betriebsleitung in TF-L4 nicht abschliessen koennen."],
      ["TF-B4", "Uebergabequittung erfassen",
        "1. Hof > Logistik\n2. Eine geplante Lieferung oeffnen\n3. Als zugestellt markieren, quittieren",
        "Empfaenger: TEST Gastro-Distributor Almaty\nZeitpunkt: jetzt",
        "Die Lieferung gilt als zugestellt, die Quittung ist gespeichert und im Verlauf sichtbar."],
      ["TF-B5", "Neue Lieferung planen ist nicht erlaubt (NEGATIVTEST)",
        "1. Hof > Logistik\n2. Nach \"Neue Lieferung\", \"Tour anlegen\" o. Ae. suchen",
        "keine Eingabe",
        "Es gibt KEINE Schaltflaeche zum Anlegen einer neuen Lieferung. Die Brigade quittiert nur, geplant wird im Buero.\nLaesst sich eine Lieferung anlegen: S3."],
      ["TF-B6", "Kein Zugriff auf Finanzen und Lohn (NEGATIVTEST)",
        "1. Navigation pruefen: erscheint Buero > Finanzen oder Lohn?\n2. Adresse aufrufen: /de/dashboard/buero/finanzen",
        "direkter Adressaufruf",
        "Die Module tauchen in der Navigation NICHT auf. Der direkte Aufruf endet mit einer Zugriffsmeldung, nicht mit sichtbaren Zahlen.\nWerden Finanzdaten angezeigt: S1."],
    ],
  },
  {
    blatt: "Pfluecker",
    datei: "pfluecker",
    titel: "Rolle: Pfluecker",
    konto: "pfluecker@damicon.demo",
    hinweis:
      "Schmalste Rolle: nur die EIGENE Leistung, der eigene Lohn, die eigene Einarbeitung. TF-P3 ist der wichtigste Test der ganzen Reihe, weil dort Lohndaten anderer Menschen im Spiel sind. Auf dem Handy pruefen, diese Rolle benutzt nie einen Schreibtischrechner.",
    faelle: [
      ["TF-P1", "Nur drei Bereiche sichtbar",
        "1. Anmelden\n2. Navigation vollstaendig durchsehen",
        "keine Eingabe",
        "Sichtbar sind ausschliesslich Dashboard, Lohn und Schulungen. Keine Zone Feld, Hof oder Markt. Jeder zusaetzliche Eintrag ist ein Fund."],
      ["TF-P2", "Eigene Abrechnung einsehen",
        "1. Lohn oeffnen\n2. Eigene Abrechnung oeffnen\n3. Positionen je Pflueckaufgabe ansehen",
        "keine Eingabe",
        "Die eigene Abrechnung ist sichtbar, mit Positionen, Qualitaetsfaktor und Nettobetrag. Die Zahlen sind nachvollziehbar dargestellt, nicht nur eine Endsumme."],
      ["TF-P3", "Fremde Abrechnungen sind unsichtbar (NEGATIVTEST, wichtigster Fall)",
        "1. Lohn oeffnen\n2. Liste zaehlen: wie viele Personen erscheinen?\n3. Nach fremden Namen suchen\n4. Falls Filter/Suche existiert, damit nach anderen Namen suchen",
        "Suchbegriff: Tulegenowa\nzweiter Versuch: Qojschybaj",
        "Es erscheint AUSSCHLIESSLICH die eigene Person. Kein zweiter Name, auch nicht ueber Suche oder Filter.\nErscheint ein fremder Name mit Betrag: S1, sofort melden und NICHT weitertesten."],
      ["TF-P4", "Kurzeinarbeitung abhaken",
        "1. Schulungen oeffnen\n2. Kurzeinarbeitung oeffnen\n3. Einen offenen Punkt abhaken\n4. Seite neu laden",
        "Punkt: Hygiene und Handschuhe",
        "Der Haken bleibt nach dem Neuladen gesetzt, der Fortschritt steigt sichtbar. Zusatz: laesst sich die Einarbeitung auf Russisch oder Kasachisch umstellen?"],
      ["TF-P5", "Kein Zugriff auf Pflueckaufgaben und Personal (NEGATIVTEST)",
        "1. Adresse aufrufen: /de/dashboard/feld/pflueckaufgaben\n2. Adresse aufrufen: /de/dashboard/buero/personal",
        "direkte Adressaufrufe",
        "Beide enden mit einer Zugriffsmeldung. Kein Blick auf Aufgaben anderer Brigaden, keine Personalliste.\nWerden Inhalte angezeigt: S1."],
    ],
  },
  {
    blatt: "Erzeuger",
    datei: "erzeuger",
    titel: "Rolle: Erzeuger (Nachbarbetrieb)",
    konto: "erzeuger@damicon.demo",
    hinweis:
      "Ein Nachbarbetrieb, der seine Ware in den Aggregator verkauft. Er sieht die eigenen Lieferungen und die eigene Abrechnung, nicht den Betrieb der anderen.",
    faelle: [
      ["TF-E1", "Eigene Lieferungen im Dashboard",
        "1. Anmelden\n2. Dashboard ansehen\n3. Navigation durchsehen",
        "keine Eingabe",
        "Sichtbar sind Dashboard, Reihenbloecke, Pflueckaufgaben, Finanzen, Dokumente, Aggregator, B2B-Portal und Schulungen. Kein Lohn, kein Personal, keine Rollen."],
      ["TF-E2", "Nachbarbetrieb aufnehmen",
        "1. Markt > Aggregator\n2. \"Nachbarbetrieb aufnehmen\"\n3. Felder fuellen, absenden",
        "Name: TEST Nachbarbetrieb Talgar\nOrt: Talgar\nAnsprechperson: R. Baitulin",
        "Der Betrieb erscheint in der Liste und steht danach beim Import in TF-E3 zur Auswahl."],
      ["TF-E3", "Zukauf per CSV importieren",
        "1. Markt > Aggregator\n2. \"Zukauf importieren\"\n3. CSV-Daten einfuegen\n4. \"Pruefen und importieren\"",
        "Nachbarbetrieb Kaskelen;Tulameen;140,5;2026-09-20\nNachbarbetrieb Uzynagash;Polka;88,0;2026-09-20\nNachbarbetrieb Kaskelen;Polana;61,25;2026-09-20\n(Trennzeichen und Spaltenfolge an die Vorlage der Seite anpassen)",
        "Es erscheint zuerst eine PRUEFUNG, erst danach wird importiert. Summe 289,75 kg auf drei Chargen."],
      ["TF-E4", "Fehlerhafte CSV wird abgewiesen (NEGATIVTEST)",
        "1. Wie TF-E3, aber mit fehlerhafter Zeile\n2. \"Pruefen und importieren\"\n3. Danach Liste pruefen: wurde die erste Zeile importiert?",
        "Nachbarbetrieb Kaskelen;Tulameen;140,5;2026-09-20\nUnbekannter Betrieb XYZ;Polka;abc;2026-09-20",
        "Der Import wird ABGELEHNT mit Hinweis auf die fehlerhafte Zeile (unbekannter Betrieb, Menge keine Zahl). Die erste, korrekte Zeile darf NICHT importiert worden sein, der Vorgang ist ganz oder gar nicht.\nWurde sie importiert: S2."],
      ["TF-E5", "Kein Zugriff auf Lohn und Personal (NEGATIVTEST)",
        "1. Adresse aufrufen: /de/dashboard/buero/lohn\n2. Adresse aufrufen: /de/dashboard/buero/personal",
        "direkte Adressaufrufe",
        "Beide enden mit einer Zugriffsmeldung. Ein Nachbarbetrieb darf weder Loehne noch Personal des Hauptbetriebs sehen.\nWerden Inhalte angezeigt: S1."],
    ],
  },
  {
    blatt: "Kunde",
    datei: "kunde",
    titel: "Rolle: B2B-Kunde",
    konto: "entsteht in TF-K1, ersatzweise kunde@damicon.demo",
    hinweis:
      "Einzige Rolle, die von aussen kommt und sich ueber eine Einladung selbst anlegt. TF-K1 braucht den Code aus TF-A2. Diese Rolle sieht ein Aussenstehender, Verstaendlichkeit zaehlt hier genauso wie Richtigkeit. TF-K7 laeuft ABGEMELDET.",
    faelle: [
      ["TF-K1", "Einladung einloesen und Konto anlegen",
        "1. /de/einladung oeffnen\n2. Code aus TF-A2 VON HAND eintippen\n3. Passwort vergeben, Konto anlegen, anmelden\n4. Gegenprobe a: Code klein und ohne Bindestriche\n5. Gegenprobe b: denselben Code ein zweites Mal einloesen",
        "Code: aus TF-A2\nE-Mail: test.kunde.20092026@example.com\nPasswort: TestKunde2026!",
        "Konto entsteht, Anmeldung gelingt. Gegenprobe a wird trotzdem angenommen (Schreibweise wird abgefangen). Gegenprobe b wird ABGELEHNT, der Code ist verbraucht.\nZusatz: der Code darf NICHT per ?code= in der Adresszeile vorbelegbar sein. Geht das: S2."],
      ["TF-K2", "Sortenkatalog ansehen",
        "1. Markt > Sortenkatalog\n2. Sorte Tulameen oeffnen",
        "keine Eingabe",
        "Sortenname, Typ, Erntefenster und Schalengroesse sind sichtbar und verstaendlich. Keine internen Kennungen wie Datenbank-IDs."],
      ["TF-K3", "Vorbestellung aufgeben",
        "1. Markt > B2B-Portal\n2. \"Vorbestellung aufgeben\"\n3. Felder fuellen, absenden",
        "Sorte: Tulameen\nMenge: 45 kg\nWunschtermin: in 7 Tagen\nBemerkung: TEST Vorbestellung 20.09.",
        "Die Vorbestellung erscheint mit Status \"angefragt\", nicht automatisch bestaetigt. Das Buero bestaetigt von Hand, das ist so gewollt."],
      ["TF-K4", "Eigene Lieferungen und Rechnungshistorie",
        "1. Markt > B2B-Portal\n2. \"Meine Lieferungen\"\n3. \"Rechnungshistorie (Proforma)\"\n4. \"Preisliste\"",
        "keine Eingabe",
        "Sichtbar sind NUR die eigenen Lieferungen und Rechnungen, keine anderer Kunden. Die Preisliste zeigt die Preise der eigenen Kundengruppe.\nErscheint ein fremder Kundenname: S1."],
      ["TF-K5", "Reklamation melden",
        "1. Markt > Reklamationen\n2. \"Reklamation melden\"\n3. Felder fuellen, absenden",
        "Grund: Ware bei Anlieferung zu warm\nBetreff: TEST Reklamation 20.09.\nBeschreibung: Kerntemperatur bei Anlieferung 11 Grad statt maximal 4 Grad.\nBetroffene Menge: 12 kg\nCharge: eine aus \"Meine Lieferungen\"",
        "Der Vorgang wird angelegt und erscheint im eigenen Verlauf. Eine Frist wird gesetzt (automatisch 5 Tage, falls nichts eingetragen). Wird in TF-F6 weiterbearbeitet."],
      ["TF-K6", "Reklamation nicht selbst schliessen (NEGATIVTEST)",
        "1. Eigene Reklamation aus TF-K5 oeffnen\n2. Nach \"Annehmen\", \"Ablehnen\" oder \"Als erledigt abschliessen\" suchen",
        "keine Eingabe",
        "Diese Schaltflaechen fehlen. Der Kunde meldet und verfolgt, entschieden wird im Buero.\nKann der Kunde die eigene Reklamation selbst schliessen: S2."],
      ["TF-K7", "Herkunft ohne Anmeldung, aber ohne Geheimnisse (ABGEMELDET)",
        "1. Abmelden, privates Fenster oeffnen\n2. /de/herkunft/<Code> aufrufen\n3. Seite vollstaendig durchlesen",
        "Steigen- oder Liefercode aus TF-K4",
        "Sichtbar: WO gewachsen, WANN gepflueckt, ob die Kuehlkette gehalten hat.\nNICHT sichtbar: Name des Pflueckers, Menge, Preis.\nErscheint eines dieser drei: S1."],
    ],
  },
];

const ANLEITUNG = [
  ["Damicon: Manueller Rollentest", ""],
  ["", ""],
  ["Stand", "20.09.2026"],
  ["Umfang", "43 Testfaelle ueber 7 Rollen, davon 11 Negativtests"],
  ["Dauer", "3 bis 4 Stunden ohne Fehlerverfolgung"],
  ["Umgebung", "https://damicon.vercel.app/de/dashboard"],
  ["", ""],
  ["1. VORBEREITUNG", ""],
  ["", "Die Instanz verlangt eine ANMELDUNG. Es gibt keine freie Demo-Ansicht."],
  ["", "Im Projekt sind sieben Demo-Konten vorgesehen (supabase/seed-auth.mjs), Passwort steht im selben Skript."],
  ["", "OB DIESE KONTEN AUF DER VERCEL-INSTANZ EXISTIEREN, IST NICHT GEPRUEFT. Vor Testbeginn klaeren."],
  ["", "Fehlen sie: entweder Admin legt sie an, oder lokal im Demo-Modus testen (npm run dev ohne Supabase)."],
  ["", "ACHTUNG: weder der Demo-Modus noch \"Ansicht als\" beantworten die Negativtests. Beide aendern nur die Anzeige,"],
  ["", "nicht die Rechtepruefung der Datenbank. Dafuer muss man sich echt mit dem jeweiligen Konto anmelden."],
  ["", "Browser: je Rolle ein eigenes privates Fenster, sonst ueberlagern sich die Anmeldungen."],
  ["", "Mobil: Brigade und Pfluecker mindestens je einen Testfall am Handy oder bei 390 px Fensterbreite."],
  ["", ""],
  ["2. REIHENFOLGE (vier Faelle bauen aufeinander auf)", ""],
  ["", "Admin TF-A2 (Kunden einladen) liefert den Code fuer Kunde TF-K1"],
  ["", "Betriebsleitung TF-L1 (Aufgabe anlegen) liefert die Aufgabe fuer Brigade TF-B1 bis TF-B3"],
  ["", "Betriebsleitung TF-L4 (Beleg pruefen) macht sie abrechenbar fuer Buchhaltung TF-F2"],
  ["", "Kunde TF-K5 (Reklamation) liefert den Vorgang fuer Buchhaltung TF-F6"],
  ["", "Alle uebrigen Testfaelle sind unabhaengig."],
  ["", ""],
  ["3. AUSFUELLEN", ""],
  ["", "Spalte Ergebnis: Auswahlliste mit OK / NOK / blockiert / offen. Faerbt sich automatisch."],
  ["", "Spalte Beobachtung: nur bei NOK oder blockiert. Was stand am Bildschirm, nicht die Deutung."],
  ["", "Spalte Datum/Tester: Kuerzel genuegt."],
  ["", "Bei NOK zusaetzlich: Bildschirmfoto als TF-<Nr>.png, Uhrzeit notieren, zweiten Versuch machen."],
  ["", "Explorativ: die Schritte sind die Pflicht, nicht die Grenze. Auffaelliges ins Blatt \"Funde\"."],
  ["", ""],
  ["4. FEHLERKLASSEN", ""],
  ["S1", "Datenverlust, falsche Zahl auf einem Beleg, jemand sieht Fremddaten"],
  ["S2", "Kernfunktion nicht nutzbar, kein Umweg"],
  ["S3", "Funktion nutzbar, aber fehlerhaft oder umstaendlich"],
  ["S4", "Schoenheitsfehler: Tippfehler, Abstand, Farbe"],
  ["", "Falsche Zahlen in Lohn, Rechnung oder Steuer sind IMMER mindestens S2."],
  ["", ""],
  ["5. WAS KEIN FEHLER IST (nicht melden)", ""],
  ["", "Lieferschein-ESF und Integrationen sind Platzhalter, es liest und schreibt sie noch nichts."],
  ["", "Wetter zeigt die Temperatursumme, trifft bewusst keine Vorhersage."],
  ["", "Vorbestellungen bestaetigt das Buero von Hand, es gibt keine Automatik."],
  ["", "QR-Steigen kann nur anzeigen und drucken, Steigen entstehen ueber die Pflueckaufgabe."],
  ["", "Kanaele sind reine Anzeige, keine echte Anbindung an WhatsApp oder Kaspi."],
  ["", "Hinweis \"Beispieldaten\" = keine Datenbank hinterlegt, Meldung der Umgebung."],
  ["", "ABER: Hinweis \"Fehler\" statt \"Beispieldaten\" IST zu melden, dann ist eine Abfrage fehlgeschlagen."],
  ["", ""],
  ["6. TESTDATEN-HYGIENE", ""],
  ["", "Alles selbst Angelegte mit \"TEST\" im Namen versehen."],
  ["", "Nichts loeschen, was vorher schon da war, auch wenn es falsch aussieht."],
  ["", "Freigegebene Lohnabrechnungen und Einladungen bleiben stehen, sie sind nachweispflichtig."],
];

// --- Formatierung -----------------------------------------------------------

const KOPF = ["Nr", "Was geprueft wird", "Schritte", "Testdaten (Eingabe)", "Erwartetes Ergebnis", "Ergebnis", "Beobachtung", "Datum / Tester"];
const BREITE = [10, 30, 46, 38, 52, 14, 38, 16];
const GELB = "FFFFF2CC";

function rand() {
  return { style: "thin", color: { argb: "FFBFBFBF" } };
}
const RAHMEN = { top: rand(), left: rand(), bottom: rand(), right: rand() };

function zeilenhoehe(werte) {
  // exceljs kann nicht automatisch anpassen. Hoehe aus der laengsten Spalte
  // schaetzen: Zeilenumbrueche plus Umbruch durch die Spaltenbreite.
  let max = 1;
  werte.forEach((w, i) => {
    const text = String(w ?? "");
    const breite = BREITE[i] ?? 20;
    const n = text.split("\n").reduce((s, z) => s + Math.max(1, Math.ceil(z.length / (breite - 2))), 0);
    if (n > max) max = n;
  });
  return Math.min(max * 13 + 6, 320);
}

function rollenblattBauen(ws, rolle) {
  ws.views = [{ state: "frozen", xSplit: 1, ySplit: 5 }];
  ws.pageSetup = {
    orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    paperSize: 9, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
  };
  ws.headerFooter = { oddFooter: "&LDamicon Testfaelle - " + rolle.titel + "&RSeite &P von &N" };
  BREITE.forEach((b, i) => { ws.getColumn(i + 1).width = b; });

  ws.mergeCells(1, 1, 1, 8);
  const t = ws.getCell(1, 1);
  t.value = "Damicon Testfaelle - " + rolle.titel;
  t.font = { name: SCHRIFT, size: 14, bold: true, color: { argb: "FFFFFFFF" } };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2F5597" } };
  t.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(1).height = 26;

  ws.mergeCells(2, 1, 2, 8);
  const k = ws.getCell(2, 1);
  k.value = "Anmeldung als: " + rolle.konto;
  k.font = { name: SCHRIFT, size: 10, bold: true };
  k.alignment = { vertical: "middle", indent: 1 };

  ws.mergeCells(3, 1, 3, 8);
  const h = ws.getCell(3, 1);
  h.value = rolle.hinweis;
  h.font = { name: SCHRIFT, size: 10 };
  h.alignment = { vertical: "top", wrapText: true, indent: 1 };
  ws.getRow(3).height = zeilenhoehe([rolle.hinweis.slice(0, 200)]) + 8;

  ws.getRow(4).height = 6;

  const kopf = ws.getRow(5);
  KOPF.forEach((v, i) => {
    const c = kopf.getCell(i + 1);
    c.value = v;
    c.font = { name: SCHRIFT, size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: i >= 5 ? "FFBF8F00" : "FF4472C4" } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.border = RAHMEN;
  });
  kopf.height = 22;

  rolle.faelle.forEach((f, idx) => {
    const r = ws.getRow(6 + idx);
    const werte = [...f, "", "", ""];
    werte.forEach((v, i) => {
      const c = r.getCell(i + 1);
      c.value = v;
      c.font = { name: SCHRIFT, size: 10, bold: i === 0 };
      c.alignment = {
        vertical: "top", wrapText: true,
        horizontal: i === 0 || i === 5 ? "center" : "left",
      };
      c.border = RAHMEN;
      if (i >= 5) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GELB } };
      else if (idx % 2 === 1) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F9FC" } };
    });
    r.height = zeilenhoehe(f);

    // Auswahlliste fuer das Ergebnis - der Tester tippt nichts, er waehlt.
    ws.getCell(6 + idx, 6).dataValidation = {
      type: "list", allowBlank: true, formulae: ['"OK,NOK,blockiert,offen"'],
      showErrorMessage: true, errorTitle: "Nur diese vier Werte",
      error: "Bitte OK, NOK, blockiert oder offen waehlen.",
    };
  });

  const letzte = 5 + rolle.faelle.length;
  ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: letzte, column: 8 } };

  // Farbe nach Ergebnis. Bedingte Formatierung statt fester Farbe, damit sie
  // sich beim Ausfuellen von selbst setzt.
  const bereich = `F6:F${letzte}`;
  ws.addConditionalFormatting({
    ref: bereich,
    rules: [
      { type: "cellIs", operator: "equal", priority: 1, formulae: ['"OK"'],
        style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFC6EFCE" } }, font: { color: { argb: "FF006100" }, bold: true } } },
      { type: "cellIs", operator: "equal", priority: 2, formulae: ['"NOK"'],
        style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFC7CE" } }, font: { color: { argb: "FF9C0006" }, bold: true } } },
      { type: "cellIs", operator: "equal", priority: 3, formulae: ['"blockiert"'],
        style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFEB9C" } }, font: { color: { argb: "FF9C6500" }, bold: true } } },
    ],
  });

  // Zaehlzeile unter der Tabelle, als echte Formeln.
  const z = letzte + 2;
  ws.getCell(z, 5).value = "Zwischenstand:";
  ws.getCell(z, 5).font = { name: SCHRIFT, size: 10, bold: true };
  ws.getCell(z, 5).alignment = { horizontal: "right" };
  const paare = [["OK", "FFC6EFCE"], ["NOK", "FFFFC7CE"], ["blockiert", "FFFFEB9C"]];
  paare.forEach(([wert, farbe], i) => {
    const cl = ws.getCell(z + i, 6);
    cl.value = { formula: `COUNTIF(F6:F${letzte},"${wert}")` };
    cl.font = { name: SCHRIFT, size: 10, bold: true };
    cl.alignment = { horizontal: "center" };
    cl.fill = { type: "pattern", pattern: "solid", fgColor: { argb: farbe } };
    cl.border = RAHMEN;
    const lb = ws.getCell(z + i, 7);
    lb.value = wert + " von " + rolle.faelle.length;
    lb.font = { name: SCHRIFT, size: 10 };
  });

  const f1 = z + 4;
  ws.getCell(f1, 1).value = "Freie Funde (alles Auffaellige ausserhalb der Testfaelle):";
  ws.getCell(f1, 1).font = { name: SCHRIFT, size: 10, bold: true };
  ws.mergeCells(f1 + 1, 1, f1 + 4, 8);
  const ff = ws.getCell(f1 + 1, 1);
  ff.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GELB } };
  ff.border = RAHMEN;
  ff.alignment = { vertical: "top", wrapText: true, indent: 1 };

  const g1 = f1 + 6;
  ws.getCell(g1, 1).value = "Gesamteindruck in zwei Saetzen: Koennte diese Person damit arbeiten?";
  ws.getCell(g1, 1).font = { name: SCHRIFT, size: 10, bold: true };
  ws.mergeCells(g1 + 1, 1, g1 + 3, 8);
  const gg = ws.getCell(g1 + 1, 1);
  gg.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GELB } };
  gg.border = RAHMEN;
  gg.alignment = { vertical: "top", wrapText: true, indent: 1 };
}

function anleitungBauen(ws) {
  ws.getColumn(1).width = 44;
  ws.getColumn(2).width = 104;
  ws.pageSetup = { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  ANLEITUNG.forEach((zeile, i) => {
    const r = ws.getRow(i + 1);
    const ueberschrift = /^[0-9]\./.test(zeile[0]) || i === 0;
    r.getCell(1).value = zeile[0];
    r.getCell(2).value = zeile[1];
    r.getCell(1).font = { name: SCHRIFT, size: i === 0 ? 14 : 10, bold: ueberschrift || zeile[0] !== "" };
    r.getCell(2).font = { name: SCHRIFT, size: 10 };
    r.getCell(1).alignment = { vertical: "top", wrapText: true };
    r.getCell(2).alignment = { vertical: "top", wrapText: true };
    if (ueberschrift && i > 0) {
      r.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E2F3" } };
      r.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E2F3" } };
    }
    if (i === 0) {
      r.getCell(1).font = { name: SCHRIFT, size: 14, bold: true, color: { argb: "FFFFFFFF" } };
      ws.mergeCells(1, 1, 1, 2);
      r.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2F5597" } };
      r.height = 26;
      r.getCell(1).alignment = { vertical: "middle", indent: 1 };
    }
  });
}

function fundeBauen(ws) {
  const kopf = ["Nr", "Testfall", "Rolle", "Klasse S1-S4", "Was passiert ist", "Erwartet war", "Bildschirmfoto", "Status"];
  const br = [8, 14, 18, 14, 50, 44, 20, 16];
  br.forEach((b, i) => { ws.getColumn(i + 1).width = b; });
  ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  ws.mergeCells(1, 1, 1, 8);
  const t = ws.getCell(1, 1);
  t.value = "Fundliste - hier kommen alle NOK und alle freien Funde zusammen";
  t.font = { name: SCHRIFT, size: 14, bold: true, color: { argb: "FFFFFFFF" } };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC00000" } };
  t.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(1).height = 26;

  const k = ws.getRow(3);
  kopf.forEach((v, i) => {
    const c = k.getCell(i + 1);
    c.value = v;
    c.font = { name: SCHRIFT, size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.border = RAHMEN;
  });
  k.height = 22;

  // Eine Beispielzeile, damit das erwartete Format sichtbar ist. Sie ist als
  // Beispiel gekennzeichnet und vor der Abgabe zu loeschen.
  const b = ws.getRow(4);
  ["1", "TF-P3", "Pfluecker", "S1", "BEISPIEL - vor Abgabe loeschen: In der Lohnliste erschien neben der eigenen Zeile auch A. Tulegenowa mit 186.400 Tenge netto.", "Nur die eigene Person darf erscheinen.", "TF-P3.png", "offen"]
    .forEach((v, i) => {
      const c = b.getCell(i + 1);
      c.value = v;
      c.font = { name: SCHRIFT, size: 10, italic: true, color: { argb: "FF808080" } };
      c.alignment = { vertical: "top", wrapText: true };
      c.border = RAHMEN;
    });
  b.height = 46;

  for (let r = 5; r <= 40; r++) {
    const row = ws.getRow(r);
    for (let i = 1; i <= 8; i++) {
      const c = row.getCell(i);
      c.border = RAHMEN;
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GELB } };
      c.alignment = { vertical: "top", wrapText: true };
      c.font = { name: SCHRIFT, size: 10 };
    }
    row.getCell(4).dataValidation = {
      type: "list", allowBlank: true, formulae: ['"S1,S2,S3,S4"'], showErrorMessage: true,
    };
    row.getCell(8).dataValidation = {
      type: "list", allowBlank: true, formulae: ['"offen,in Arbeit,behoben,kein Fehler"'], showErrorMessage: true,
    };
  }
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 40, column: 8 } };
  ws.views = [{ state: "frozen", ySplit: 3 }];
}

function auswertungBauen(ws) {
  ws.getColumn(1).width = 26;
  [2, 3, 4, 5, 6].forEach((i) => { ws.getColumn(i).width = 14; });
  ws.pageSetup = { orientation: "portrait", fitToPage: true, paperSize: 9 };
  ws.mergeCells(1, 1, 1, 6);
  const t = ws.getCell(1, 1);
  t.value = "Auswertung (rechnet sich aus den Rollenblaettern)";
  t.font = { name: SCHRIFT, size: 14, bold: true, color: { argb: "FFFFFFFF" } };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2F5597" } };
  t.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(1).height = 26;

  const kopf = ["Rolle", "Testfaelle", "OK", "NOK", "blockiert", "offen"];
  const k = ws.getRow(3);
  kopf.forEach((v, i) => {
    const c = k.getCell(i + 1);
    c.value = v;
    c.font = { name: SCHRIFT, size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.border = RAHMEN;
  });

  ROLLEN.forEach((rolle, idx) => {
    const r = ws.getRow(4 + idx);
    const letzte = 5 + rolle.faelle.length;
    const bereich = `${rolle.blatt}!F6:F${letzte}`;
    r.getCell(1).value = rolle.titel.replace("Rolle: ", "");
    r.getCell(2).value = rolle.faelle.length;
    r.getCell(3).value = { formula: `COUNTIF(${bereich},"OK")` };
    r.getCell(4).value = { formula: `COUNTIF(${bereich},"NOK")` };
    r.getCell(5).value = { formula: `COUNTIF(${bereich},"blockiert")` };
    r.getCell(6).value = { formula: `B${4 + idx}-C${4 + idx}-D${4 + idx}-E${4 + idx}` };
    for (let i = 1; i <= 6; i++) {
      const c = r.getCell(i);
      c.font = { name: SCHRIFT, size: 10 };
      c.alignment = { horizontal: i === 1 ? "left" : "center" };
      c.border = RAHMEN;
    }
  });

  const s = 4 + ROLLEN.length;
  const r = ws.getRow(s);
  r.getCell(1).value = "Summe";
  for (let i = 2; i <= 6; i++) {
    const sp = String.fromCharCode(64 + i);
    r.getCell(i).value = { formula: `SUM(${sp}4:${sp}${s - 1})` };
  }
  for (let i = 1; i <= 6; i++) {
    const c = r.getCell(i);
    c.font = { name: SCHRIFT, size: 10, bold: true };
    c.alignment = { horizontal: i === 1 ? "left" : "center" };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E2F3" } };
    c.border = RAHMEN;
  }

  ws.getCell(s + 2, 1).value = "Die Zahlen fuellen sich von selbst, sobald in den Rollenblaettern die Spalte";
  ws.getCell(s + 3, 1).value = "\"Ergebnis\" gesetzt wird. Nichts hier von Hand eintragen.";
  [s + 2, s + 3].forEach((z) => {
    ws.getCell(z, 1).font = { name: SCHRIFT, size: 9, italic: true, color: { argb: "FF808080" } };
  });
}

// --- Markdown-Vorschau ------------------------------------------------------
//
// Dieselben Daten noch einmal als Markdown. Nicht zum Ausfuellen, sondern
// damit die Testfaelle in der Codeverwaltung lesbar und vergleichbar bleiben:
// eine xlsx ist eine Binaerdatei, ihre Aenderung sieht man im Diff nicht.
// Beide Fassungen kommen aus derselben Liste oben, sie koennen also nicht
// auseinanderlaufen.

function markdownFuer(rolle) {
  const z = (s) => String(s).replace(/\n/g, "<br>").replace(/\|/g, "\\|");
  const kopf = "| Nr | Was geprueft wird | Schritte | Testdaten (Eingabe) | Erwartetes Ergebnis |";
  const trenn = "|---|---|---|---|---|";
  const zeilen = rolle.faelle.map((f) => "| " + f.map(z).join(" | ") + " |");
  return [
    `# Testfaelle ${rolle.titel}`,
    "",
    "> **Zum Ausfuellen die Excel-Fassung benutzen:** `testfaelle-" + rolle.datei + ".xlsx`",
    "> oder das Blatt \"" + rolle.blatt + "\" in `damicon-testfaelle.xlsx`.",
    "> Diese Datei ist nur die lesbare Vorschau und hat keine Ergebnisspalten.",
    "",
    "Anmeldung als: `" + rolle.konto + "`",
    "",
    rolle.hinweis,
    "",
    kopf, trenn, ...zeilen,
    "",
    "---",
    "",
    "Erzeugt aus `scripts/testfaelle-xlsx-erzeugen.mjs`. Aenderungen dort vornehmen, nicht hier.",
    "",
  ].join("\n");
}

// --- Erzeugen ---------------------------------------------------------------

function mappeAnlegen() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Damicon";
  wb.created = new Date();
  // exceljs schreibt Formeln ohne zwischengespeicherten Wert. Ohne dieses
  // Kennzeichen zeigt Excel die Zaehlfelder beim ersten Oeffnen leer an, bis
  // jemand eine Zelle anfasst. Mit ihm rechnet Excel die Mappe beim Oeffnen
  // durch. Auf diesem Rechner steht kein LibreOffice zum Vorausberechnen
  // bereit, deshalb dieser Weg.
  wb.calcProperties.fullCalcOnLoad = true;
  return wb;
}

async function main() {
  await mkdir(ZIEL, { recursive: true });

  // 1. Gesamtmappe
  const gesamt = mappeAnlegen();
  anleitungBauen(gesamt.addWorksheet("Anleitung", { properties: { tabColor: { argb: "FF2F5597" } } }));
  auswertungBauen(gesamt.addWorksheet("Auswertung", { properties: { tabColor: { argb: "FF548235" } } }));
  for (const rolle of ROLLEN) {
    rollenblattBauen(gesamt.addWorksheet(rolle.blatt), rolle);
  }
  fundeBauen(gesamt.addWorksheet("Funde", { properties: { tabColor: { argb: "FFC00000" } } }));
  const gesamtPfad = join(ZIEL, "damicon-testfaelle.xlsx");
  await gesamt.xlsx.writeFile(gesamtPfad);
  console.log(`geschrieben: ${gesamtPfad}  (${2 + ROLLEN.length + 1} Blaetter)`);

  // 2. Je Rolle eine eigene Mappe, fuer paralleles Testen
  for (const rolle of ROLLEN) {
    const wb = mappeAnlegen();
    anleitungBauen(wb.addWorksheet("Anleitung", { properties: { tabColor: { argb: "FF2F5597" } } }));
    rollenblattBauen(wb.addWorksheet(rolle.blatt), rolle);
    fundeBauen(wb.addWorksheet("Funde", { properties: { tabColor: { argb: "FFC00000" } } }));
    const pfad = join(ZIEL, `testfaelle-${rolle.datei}.xlsx`);
    await wb.xlsx.writeFile(pfad);
    console.log(`geschrieben: ${pfad}  (${rolle.faelle.length} Testfaelle)`);
  }

  // 3. Markdown-Vorschau, aus denselben Daten
  const nummer = { Admin: "01", Betriebsleitung: "02", Buchhaltung: "03", Brigade: "04", Pfluecker: "05", Erzeuger: "06", Kunde: "07" };
  for (const rolle of ROLLEN) {
    const pfad = join(ZIEL, `${nummer[rolle.blatt]}-${rolle.datei}.md`);
    await writeFile(pfad, markdownFuer(rolle), "utf8");
    console.log(`geschrieben: ${pfad}`);
  }

  const summe = ROLLEN.reduce((s, r) => s + r.faelle.length, 0);
  console.log(`\n${summe} Testfaelle ueber ${ROLLEN.length} Rollen.`);
  console.log("Ausfuellen in den xlsx. Die md sind nur Vorschau fuer die Codeverwaltung.");
}

main().catch((f) => { console.error(`Abbruch: ${f.message}`); process.exit(1); });
