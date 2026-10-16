// Ergänzungen und Berichtigungen der Anleitungen (Stand 15.10.2026).
//
// Neue Abläufe und Zusatzschritte stehen hier statt in texte-<sprache>.ts, damit die vier Sprachen nebeneinander gepflegt werden und die Pfade zu den
// Modulen aus den Sprachkatalogen der Anwendung kommen (Zone → Modul), nicht von Hand abgeschrieben. Der Generator wendet die Ergänzungen auf die Liste
// aus texte-<sprache>.ts an (wendeErgaenzungenAn): ein Eintrag mit "neu" fügt eine Anleitung nach der Anleitung "nach" ein, ein Eintrag mit
// "zusatzSchritte" hängt Schritte an eine vorhandene Anleitung an.
//
// Schreibweise: kein Gedankenstrich im Fließtext, echte Umlaute.

import { modules } from "@/lib/modules";
import de from "@/messages/de.json";
import en from "@/messages/en.json";
import kk from "@/messages/kk.json";
import ru from "@/messages/ru.json";
import type { Anleitung, Sprache } from "./typen";

export interface Ergaenzung {
  id: string;
  /** Neue Anleitung, eingefügt nach der Anleitung mit dieser Kennung (sonst am Ende). */
  neu?: Anleitung;
  nach?: string;
  /** Schritte, die an das Ende einer vorhandenen Anleitung kommen. */
  zusatzSchritte?: string[];
}

type Katalog = {
  zones: Record<string, { name: string }>;
  modules: Record<string, { navTitle?: string; title: string }>;
};
const kataloge: Record<Sprache, Katalog> = {
  de: de as unknown as Katalog,
  en: en as unknown as Katalog,
  kk: kk as unknown as Katalog,
  ru: ru as unknown as Katalog,
};

/** "Büro → Einstellungen": Zone und Modul in der Sprache, genau wie die Seitenleiste sie nennt. */
function pfadVon(sprache: Sprache, key: string): string {
  const modul = modules.find((m) => m.key === key);
  if (!modul) throw new Error(`Handbuch: Modul ${key} gibt es nicht`);
  const katalog = kataloge[sprache];
  const name = katalog.modules[key];
  return `${katalog.zones[modul.zone].name} → ${name?.navTitle ?? name?.title ?? key}`;
}

export const einleitungen: Record<Sprache, string> = {
  de: "Die Abläufe, die den Kern des Betriebs abdecken. Die Pfade beziehen sich auf die Seitenleiste.",
  en: "The workflows that cover the core of the operation. The paths refer to the sidebar.",
  ru: "Процессы, которые охватывают ядро работы хозяйства. Пути относятся к боковой панели.",
  kk: "Шаруашылық жұмысының өзегін қамтитын процестер. Жолдар бүйір тақтаға қатысты.",
};

function deutsch(p: (key: string) => string): Ergaenzung[] {
  return [
    {
      id: "blockrisiko",
      nach: "wartezeit",
      neu: {
        id: "blockrisiko",
        titel: "Das Risiko eines Reihenblocks lesen",
        einleitung:
          "Die Spalte „Risiko“ fasst fünf Faktoren zu einem Wert von 0 bis 100 zusammen: versäumter Pflückdurchgang, Wartezeitsperre, Ausschuss, Kühlkette und Erfassungslücke. Sie nennt immer auch den Hauptgrund, nie nur eine Zahl.",
        schritte: [
          `${p("reihenbloecke")} öffnen. Jeder Block trägt eine Stufe (niedrig, mittel, hoch), den Wert „x von 100“ und den Hauptgrund. Ein Block ohne Mangel steht auf „kein Mangel“.`,
          "Die Stufe hoch heißt: mindestens zwei ernste Faktoren, oder eine offene Aufgabe, die vor dem Ende der Wartezeitsperre fällig wird. Ein einzelner Mangel ergibt höchstens „mittel“.",
          "„So entsteht der Risikowert“ unter der Tabelle nennt je Faktor die Regel, das Gewicht und die aktuellen Grenzen.",
          "Die Bewertung sehen Administration, Betriebsleitung und Brigade. Rollen, die nicht alle Eingaben sehen (Rotationsplan, Behandlungen, Kühlketten), bekommen keinen Wert, statt eines zu niedrigen.",
          `Gewichte, Grenzen und Schwellen pflegen Administration und Geschäftsführung unter ${p("einstellungen")}, Abschnitt „Block-Risiko: Gewichte und Schwellen“. Das Portal lehnt Werte ab, bei denen die Schwelle für „hoch“ nicht über der für „mittel“ liegt oder alle Gewichte null wären. Jede Änderung steht im Verlauf.`,
          "Stündlich prüft das Portal die Blöcke mit Stufe hoch und meldet sie in der Glocke.",
        ],
      },
    },
    {
      id: "datensuche",
      nach: "pflueckaufgabe",
      neu: {
        id: "datensuche",
        titel: "Einen Datensatz finden (Datensuche)",
        einleitung:
          "Die Suche in der Kopfzeile findet nicht nur Seiten und Module, sondern auch Datensätze: Steigen, Chargen, Pflückaufgaben, Pflücker, Reihenblöcke, Dokumente und Kunden.",
        schritte: [
          "Auf den Suchknopf links neben der Glocke tippen. Der Suchdialog öffnet oben in der Mitte.",
          "Mindestens zwei Zeichen eingeben, zum Beispiel eine Chargen-Nummer oder einen Teil eines Namens. Unter „Seiten und Module“ stehen die Seiten, „In Daten suchen“ startet die Suche in den Datensätzen.",
          "Die Treffer nennen den Typ (Steige, Charge, Pflückaufgabe, Pflücker, Reihenblock, Dokument, Kunde), den Code und den Zusammenhang. Die Pfeiltasten wählen einen Treffer, die Eingabetaste öffnet ihn, Esc schließt die Suche.",
          "Die Suche zeigt nur, was die eigene Rolle ohnehin lesen darf: Ein Kunde findet keine Pflücker, ein Erzeuger keine Kunden. Sie verlangt eine Anmeldung und liefert höchstens 50 Treffer. Ein „%“ oder „_“ in der Eingabe zählt als Zeichen, nicht als Platzhalter.",
        ],
      },
    },
    {
      id: "foerdercheckliste",
      nach: "nachweis",
      neu: {
        id: "foerdercheckliste",
        titel: "Fördermittel: die Checkliste eines Dossiers führen",
        einleitung:
          "Das Portal bindet kein Förderportal an. Es führt zu jedem Dossier eine Checkliste und erinnert an Fristen. Was ein Antrag braucht, legt die Förderstelle fest, die Liste ist kein amtliches Formular.",
        schritte: [
          `${p("foerdermittel")} öffnen. Unter „Checklisten der Dossiers“ steht je Dossier der Fortschritt („x von y erledigt“), die Zahl der offenen Pflichtpunkte und die Zahl der überschrittenen Fristen.`,
          "Bei einem Dossier ohne Punkte „Allgemeinen Vorschlag übernehmen“ wählen: fünf Punkte (Antragsformular, Rechtsform und Identifikationsnummer, Kosten- und Investitionsaufstellung mit Angeboten, Nachweis der Flächen, Zahlungsbelege). Der Vorschlag ist kein amtlicher Katalog: mit den Vorgaben der Förderstelle abgleichen und anpassen.",
          "„Punkt hinzufügen“: Bezeichnung, optional eine Frist, und ob es ein Pflichtpunkt ist. „Erledigt“ hakt einen Punkt ab, „Wieder öffnen“ nimmt das zurück, „Entfernen“ löscht ihn.",
          "Ein Dossier gilt als vollständig, wenn alle Pflichtpunkte erledigt sind. Punkte mit verstrichener Frist zählt das Portal als „Frist überschritten“.",
        ],
      },
    },
    {
      id: "konten",
      nach: "rollen",
      neu: {
        id: "konten",
        titel: "Konten für Mitarbeitende anlegen, sperren und das Passwort ändern",
        einleitung:
          "Konten für Mitarbeitende legt die Administration an. Wer den Betrieb verlässt, wird gesperrt statt gelöscht: Der Name bleibt in Protokollen und Verläufen sichtbar, aber das Konto hat keine Rechte mehr.",
        schritte: [
          `Als Administration ${p("rollen")} öffnen. Unter „Konto für Mitarbeitende anlegen“ Name, E-Mail-Adresse und Rolle wählen und „Konto anlegen“. Das Portal zeigt das vorläufige Passwort einmal an: sicher weitergeben, danach steht es nirgends mehr.`,
          "Die Person meldet sich an und setzt ein eigenes Passwort auf der Seite Sicherheit (im Konto-Menü, „Passwort ändern“). Es braucht mindestens 12 Zeichen. Nicht erlaubt sind die eigene E-Mail-Adresse und Passwörter aus weniger als vier verschiedenen Zeichen.",
          "Zum Sperren in der Zeile des Kontos „Konto sperren“ aufklappen, einen Grund eintragen (3 bis 300 Zeichen) und „Sperren“. Ein gesperrtes Konto hat sofort keine Rolle mehr und kann sich nicht anmelden. Die Zeile nennt Datum und Grund.",
          "„Entsperren“ stellt das Konto mit seiner Rolle wieder her. Das eigene Konto und der letzte aktive Administrator lassen sich nicht sperren, die Datenbank weist beides ab.",
          "Anlegen, Sperren und Entsperren stehen im Protokoll.",
        ],
      },
    },
    {
      id: "einstellungen",
      nach: "konten",
      neu: {
        id: "einstellungen",
        titel: "Fristen, Kapazitäten und Richtwerte in den Einstellungen pflegen",
        einleitung:
          "Fachliche Werte stehen nicht im Programm, sondern in den Einstellungen: Fristen der ЭСФ und des ЕСУТД, die Kapazität der Fahrzeuge, die Richtwerte der Investitionsrechnung und die Gewichte der Block-Risiko-Bewertung. Zugriffsrechte gehören nicht dazu, die regeln die Rollen und die Datenbank.",
        schritte: [
          `${p("einstellungen")} öffnen. Die Werte stehen nach Bereichen: Steuer, Arbeitsrecht, Abholrunden, Finanzen, Auslieferung, Sicherheit und Block-Risiko.`,
          "Jede Einstellung nennt Beschreibung, Einheit, Standardwert und Quelle mit Stand. Ändern dürfen Administration und Geschäftsführung, bei Steuer und Arbeitsrecht auch die zuständige Fachrolle (Buchhaltung, Betriebsleitung). Wer nicht ändern darf, sieht den Wert.",
          "Den neuen Wert eintragen, optional einen Grund, und „Speichern“. Das Portal prüft Typ und Grenzen. Ein leeres Feld heißt „nicht gesetzt“: Dann gilt keine Prüfung, statt dass ein Wert erfunden wird.",
          "Unten steht der Verlauf: wer wann welchen Wert geändert hat, von wo nach wo, mit dem Grund. Der Verlauf lässt sich nicht ändern.",
        ],
      },
    },
    {
      id: "schulungsvideos",
      nach: "nachrichten",
      neu: {
        id: "schulungsvideos",
        titel: "Schulungsvideos abspielen, hochladen und ersetzen",
        einleitung:
          "Die Kurzvideos zur Einarbeitung spielt das Portal in der Sprache der Person ab, wo es das Video in dieser Sprache gibt. Hochladen dürfen Administration und Betriebsleitung.",
        schritte: [
          `${p("schulungen")} öffnen. Unter „Schulungsvideos“ steht je Video Titel, Thema, Dauer und, wenn es verpflichtend ist, die Marke „Pflicht“.`,
          "Das Video im Fenster abspielen. Es lädt erst beim Abspielen, das schont das Mobilnetz. Gibt es mehrere Sprachen, wechseln die Knöpfe unter dem Video die Sprache. Fehlt die eigene, nimmt das Portal Russisch, dann Kasachisch, Deutsch und Englisch.",
          "Zum Hochladen unter dem Video „Videodatei hochladen oder ersetzen“: Sprache und Datei (MP4 oder WebM, höchstens 500 MB) wählen und „Hochladen“. Der Upload läuft in Stücken und lässt sich nach einem Abbruch fortsetzen. Eine vorhandene Datei in derselben Sprache wird ersetzt.",
          "„Datei entfernen“ löscht eine Sprachfassung.",
        ],
      },
    },
    {
      id: "benachrichtigungen",
      nach: "schulungsvideos",
      neu: {
        id: "benachrichtigungen",
        titel: "Die Glocke: Hinweise lesen",
        einleitung:
          "Die Glocke in der Kopfzeile sammelt, was Aufmerksamkeit braucht, ohne dass jemand jedes Modul öffnet. Sie ist für Administration, Geschäftsführung, Betriebsleitung, Buchhaltung, Brigade und Erzeuger sichtbar.",
        schritte: [
          "Die Zahl an der Glocke nennt die ungelesenen Hinweise. Ein Tipp auf die Glocke öffnet die Liste.",
          "Das Portal erzeugt stündlich Hinweise zu abgelaufenen und bald ablaufenden Nachweisen (an die verantwortliche Person, sonst an Administration und Betriebsleitung), zu ЭСФ über der Frist (Buchhaltung, Administration), zu überfälligen ЕСУТД-Meldungen (Betriebsleitung, Buchhaltung, Administration) und zu Reihenblöcken mit Risikostufe hoch (Betriebsleitung, Administration). Die Geschäftsführung bekommt, was die Administration bekommt.",
          "Ein Zustand meldet sich nur einmal: Wird aus „läuft ab“ später „abgelaufen“, kommt ein neuer Hinweis. Bei ЭСФ, ЕСУТД und Block-Risiko gibt es eine Sammelmeldung je Tag.",
          "Ein Tipp auf einen Hinweis markiert ihn als gelesen und öffnet das Modul. „Alle als gelesen markieren“ räumt die Liste auf. Gelesene Hinweise verschwinden nach 90 Tagen.",
          "Voraussetzung ist der Aufruf der Erzeugung durch einen Zeitplan (Workflow benachrichtigungen-erzeugen). Ohne ihn bleibt die Glocke leer. Das richtet der Betreiber ein.",
        ],
      },
    },
    {
      id: "nachweis",
      zusatzSchritte: [
        "Wird ein Zertifikat erneuert, „Neue Version“ aufklappen statt das alte Dokument zu überschreiben. Die Felder sind vorbelegt, Zeitraum und Datei der neuen Version werden eingetragen. Die alte Version bleibt unter dem Namen als „frühere Version“ erhalten, zählt aber nicht mehr als aktuell und schlägt im Risiko-Radar keinen Alarm mehr.",
      ],
    },
    {
      id: "logger",
      zusatzSchritte: [
        "Weitere Schreibweisen liest das Portal ebenfalls: Dateien in Windows-1251 und Windows-1252, Zeiten wie 14.10.26 08:15 oder 8:15 PM, Excel-Zeitwerte in der Zeitspalte, Temperaturen in Kelvin oder Fahrenheit (laut Spaltenkopf, sie werden in Grad Celsius umgerechnet), eine Zeitzone im Spaltenkopf („Time (UTC+6)“) und das JSON-Format von elproCLOUD (Felder value, timeStamp in UTC und unit).",
      ],
    },
    {
      id: "wirtschaftlichkeit",
      zusatzSchritte: [
        "Der Abschnitt „Schwund-Nutzen aus den Betriebsdaten“ leitet den Nutzen aus der Verlustquote her: Rückgang gegenüber der Baseline mal Jahresmenge mal Vollkosten je Kilogramm. „Als Nutzen-Posten übernehmen“ legt den Posten an (Herkunft geschätzt) und schreibt ihn beim erneuten Klick fort. Bei weniger als zehn Chargen oder ohne Besserung bleibt die Herleitung offen.",
        `Der Kalkulationszins hat einen Richtwert (Standard 20 Prozent) und zwei Vergleichszinsen (16 und 24 Prozent), die die Seite als Zins-Check neben dem Kapitalwert zeigt. Alle drei Werte stehen unter ${p("einstellungen")}.`,
      ],
    },
    {
      id: "abholrunde",
      zusatzSchritte: [
        `Die Fahrzeugkapazität steht als Standard unter ${p("einstellungen")} und lässt sich je Runde überschreiben. Plant eine Runde mehr als die Nutzlast, warnt die Planung. Jeder Stopp kann ein Abholfenster tragen (von, bis). Die geschätzte Ankunft je Stopp rechnet mit der Fahrzeit und der Zeit je Stopp (Einstellung), und ein Fenster, das die Ankunft verfehlt, ist markiert.`,
      ],
    },
    {
      id: "auslieferung",
      zusatzSchritte: [
        "Für ein Partnersystem mit eigenem Format hinterlegt die Administration unter „Zielformat“ eine Vorlage mit Platzhaltern, die den Umschlag abbildet (zum Beispiel 1C per OData). Zugangsdaten für die Basic-Authentifizierung kommen wie das Geheimnis aus einer Umgebungsvariable des Servers, nie aus dem Portal.",
        "Der Partner kann den Empfang über die Rückmeldeadresse des Portals bestätigen (mit Signatur und Zeitstempel). Dann steht der Eintrag auf „bestätigt“. Einen regelmäßigen Aufruf der Auslieferung stellt der Betreiber über den Workflow integrationen-ausliefern ein.",
      ],
    },
    {
      id: "nachrichten",
      zusatzSchritte: [
        "Für Datenschutzfälle gibt es „Anonymisieren“ (Administration, Geschäftsführung): Text und Name der Nachricht werden entfernt, der Verlauf bleibt. Ein Grund ist Pflicht und steht im Protokoll.",
      ],
    },
  ];
}

function english(p: (key: string) => string): Ergaenzung[] {
  return [
    {
      id: "blockrisiko",
      nach: "wartezeit",
      neu: {
        id: "blockrisiko",
        titel: "Reading the risk of a row block",
        einleitung:
          "The “Risk” column combines five factors into a score from 0 to 100: missed picking round, waiting-period block, rejects, cold chain and recording gap. It always names the main reason too, never just a number.",
        schritte: [
          `Open ${p("reihenbloecke")}. Every block carries a level (low, medium, high), the score “x of 100” and the main reason. A block without a shortcoming reads “no shortcoming”.`,
          "Level high means at least two serious factors, or an open task that falls due before the waiting-period block ends. A single shortcoming gives “medium” at most.",
          "“How the risk score arises” below the table names the rule, the weight and the current limits for each factor.",
          "Administration, farm management and field crews see the rating. Roles that do not see all inputs (rotation plan, treatments, cold chains) get no score rather than one that is too low.",
          `Administration and CEO maintain weights, limits and thresholds under ${p("einstellungen")}, section “Block risk: weights and thresholds”. The portal rejects values where the threshold for “high” is not above the one for “medium”, or where all weights would be zero. Every change appears in the history.`,
          "Every hour the portal checks the blocks with level high and reports them in the bell.",
        ],
      },
    },
    {
      id: "datensuche",
      nach: "pflueckaufgabe",
      neu: {
        id: "datensuche",
        titel: "Finding a record (data search)",
        einleitung:
          "The search in the header finds not only pages and modules but also records: crates, batches, picking tasks, pickers, row blocks, documents and customers.",
        schritte: [
          "Tap the search button to the left of the bell. The search dialog opens at the top centre.",
          "Enter at least two characters, for example a batch number or part of a name. “Pages and modules” lists the pages, “Search in data” starts the search in the records.",
          "Hits name the type (crate, batch, picking task, picker, row block, document, customer), the code and the context. The arrow keys select a hit, Enter opens it, Esc closes the search.",
          "The search shows only what your role may read anyway: a customer finds no pickers, a producer no customers. It requires a login and returns at most 50 hits. A “%” or “_” in the input counts as a character, not a wildcard.",
        ],
      },
    },
    {
      id: "foerdercheckliste",
      nach: "nachweis",
      neu: {
        id: "foerdercheckliste",
        titel: "Grants: keeping the checklist of a dossier",
        einleitung:
          "The portal does not connect to a grant portal. It keeps a checklist for every dossier and reminds you of deadlines. What an application needs is set by the funding body; the list is not an official form.",
        schritte: [
          `Open ${p("foerdermittel")}. Under “Dossier checklists” each dossier shows its progress (“x of y done”), the number of open mandatory items and the number of missed deadlines.`,
          "For a dossier without items choose “Adopt general suggestion”: five items (application form, legal form and identification number, cost and investment statement with quotes, proof of land, payment receipts). The suggestion is not an official catalogue: compare it with the funding body's requirements and adapt it.",
          "“Add item”: description, an optional deadline, and whether it is mandatory. “Done” ticks an item off, “Reopen” undoes that, “Remove” deletes it.",
          "A dossier counts as complete when all mandatory items are done. Items past their deadline count as “Deadline passed”.",
        ],
      },
    },
    {
      id: "konten",
      nach: "rollen",
      neu: {
        id: "konten",
        titel: "Creating and blocking staff accounts, changing the password",
        einleitung:
          "Administration creates accounts for staff. Whoever leaves the farm is blocked rather than deleted: the name stays visible in logs and histories, but the account has no rights any more.",
        schritte: [
          `As administration open ${p("rollen")}. Under “Create staff account” enter name, e-mail address and role and choose “Create account”. The portal shows the temporary password once: pass it on securely, it appears nowhere afterwards.`,
          "The person logs in and sets their own password on the Security page (account menu, “Change password”). It needs at least 12 characters. Not allowed are your own e-mail address and passwords of fewer than four different characters.",
          "To block, open “Block account” in the account's row, enter a reason (3 to 300 characters) and choose “Block”. A blocked account has no role at once and cannot log in. The row shows date and reason.",
          "“Unblock” restores the account with its role. Your own account and the last active administrator cannot be blocked, the database rejects both.",
          "Creating, blocking and unblocking appear in the log.",
        ],
      },
    },
    {
      id: "einstellungen",
      nach: "konten",
      neu: {
        id: "einstellungen",
        titel: "Maintaining deadlines, capacities and benchmarks in the settings",
        einleitung:
          "Business values are not in the program but in the settings: deadlines for ЭСФ and ЕСУТД, vehicle capacity, benchmarks of the investment calculation and the weights of the block-risk rating. Access rights are not part of it, roles and the database govern those.",
        schritte: [
          `Open ${p("einstellungen")}. The values are grouped by area: tax, labour law, collection rounds, finance, delivery, security and block risk.`,
          "Each setting names description, unit, default value and source with date. Administration and CEO may change them; for tax and labour law the responsible specialist role (accounting, farm management) may too. Whoever may not change a value still sees it.",
          "Enter the new value, optionally a reason, and choose “Save”. The portal checks type and limits. An empty field means “not set”: then no check applies, instead of a value being invented.",
          "The history below shows who changed which value when, from what to what, with the reason. The history cannot be changed.",
        ],
      },
    },
    {
      id: "schulungsvideos",
      nach: "nachrichten",
      neu: {
        id: "schulungsvideos",
        titel: "Playing, uploading and replacing training videos",
        einleitung:
          "The portal plays the short onboarding videos in the person's language where the video exists in that language. Administration and farm management may upload.",
        schritte: [
          `Open ${p("schulungen")}. Under “Training videos” each video shows title, topic, duration and, if mandatory, the mark “Required”.`,
          "Play the video in the window. It loads only when played, which spares the mobile network. If there are several languages, the buttons below the video switch the language. If yours is missing, the portal takes Russian, then Kazakh, German and English.",
          "To upload, use “Upload or replace video file” below the video: choose language and file (MP4 or WebM, up to 500 MB) and “Upload”. The upload runs in chunks and can be resumed after an interruption. An existing file in the same language is replaced.",
          "“Remove file” deletes one language version.",
        ],
      },
    },
    {
      id: "benachrichtigungen",
      nach: "schulungsvideos",
      neu: {
        id: "benachrichtigungen",
        titel: "The bell: reading notifications",
        einleitung:
          "The bell in the header collects what needs attention, without anyone opening every module. It is visible to administration, CEO, farm management, accounting, field crews and producers.",
        schritte: [
          "The number on the bell shows the unread notifications. Tapping the bell opens the list.",
          "Every hour the portal creates notifications about expired and soon expiring proofs (to the responsible person, otherwise to administration and farm management), about ЭСФ past the deadline (accounting, administration), about overdue ЕСУТД reports (farm management, accounting, administration) and about row blocks with risk level high (farm management, administration). The CEO receives what administration receives.",
          "A state reports only once: if “expires soon” later becomes “expired”, a new notification arrives. For ЭСФ, ЕСУТД and block risk there is one summary per day.",
          "Tapping a notification marks it as read and opens the module. “Mark all as read” tidies the list. Read notifications disappear after 90 days.",
          "The prerequisite is that a schedule calls the generation (workflow benachrichtigungen-erzeugen). Without it the bell stays empty. The operator sets this up.",
        ],
      },
    },
    {
      id: "nachweis",
      zusatzSchritte: [
        "When a certificate is renewed, open “New version” instead of overwriting the old document. The fields are prefilled; enter period and file of the new version. The old version stays under the name as an “earlier version”, but no longer counts as current and no longer raises an alarm in the risk radar.",
      ],
    },
    {
      id: "logger",
      zusatzSchritte: [
        "The portal also reads other notations: files in Windows-1251 and Windows-1252, times like 14.10.26 08:15 or 8:15 PM, Excel time values in the time column, temperatures in Kelvin or Fahrenheit (per column header, converted to degrees Celsius), a time zone in the column header (“Time (UTC+6)”) and the JSON format of elproCLOUD (fields value, timeStamp in UTC and unit).",
      ],
    },
    {
      id: "wirtschaftlichkeit",
      zusatzSchritte: [
        "The section “Loss benefit from operating data” derives the benefit from the loss rate: decline against the baseline times annual volume times full cost per kilogram. “Adopt as benefit item” creates the item (origin estimated) and updates it on a repeated click. With fewer than ten batches or no improvement the derivation stays open.",
        `The calculation rate has a benchmark (default 20 percent) and two comparison rates (16 and 24 percent), which the page shows as a rate check next to the net present value. All three values are set under ${p("einstellungen")}.`,
      ],
    },
    {
      id: "abholrunde",
      zusatzSchritte: [
        `The vehicle capacity is a default under ${p("einstellungen")} and can be overridden per round. If a round plans more than the payload, the planning warns. Each stop can carry a collection window (from, to). The estimated arrival per stop uses the travel time and the time per stop (setting), and a window that the arrival misses is marked.`,
      ],
    },
    {
      id: "auslieferung",
      zusatzSchritte: [
        "For a partner system with its own format, administration stores a template with placeholders under “Target format” that maps the envelope (for example 1C via OData). Credentials for basic authentication come, like the secret, from an environment variable of the server, never from the portal.",
        "The partner can confirm receipt through the portal's feedback address (with signature and timestamp). The entry then reads “confirmed”. The operator sets up a regular call of the delivery through the workflow integrationen-ausliefern.",
      ],
    },
    {
      id: "nachrichten",
      zusatzSchritte: [
        "For data protection cases there is “Anonymise” (administration, CEO): text and name of the message are removed, the history stays. A reason is mandatory and appears in the log.",
      ],
    },
  ];
}

function russisch(p: (key: string) => string): Ergaenzung[] {
  return [
    {
      id: "blockrisiko",
      nach: "wartezeit",
      neu: {
        id: "blockrisiko",
        titel: "Как читать риск рядного блока",
        einleitung:
          "Столбец «Риск» сводит пять факторов в оценку от 0 до 100: пропущенный проход сбора, срок ожидания, брак, холодовая цепь и пробел в учёте. Он всегда называет и главную причину, а не только число.",
        schritte: [
          `Откройте ${p("reihenbloecke")}. У каждого блока есть уровень (низкий, средний, высокий), оценка «x из 100» и главная причина. У блока без недостатков написано «нет недостатков».`,
          "Высокий уровень означает: как минимум два серьёзных фактора или открытая задача, срок которой наступает до конца срока ожидания. Один недостаток даёт самое большее «средний».",
          "Раздел «Как складывается оценка риска» под таблицей называет для каждого фактора правило, вес и действующие границы.",
          "Оценку видят администрирование, руководство хозяйства и бригада. Роли, которые видят не все исходные данные (план ротации, обработки, холодовые цепи), не получают оценку вместо заниженной.",
          `Веса, границы и пороги ведут администрирование и генеральный директор в разделе ${p("einstellungen")}, блок «Риск блока: веса и пороги». Портал отклоняет значения, при которых порог «высокий» не выше порога «средний» или все веса равны нулю. Каждое изменение попадает в журнал.`,
          "Каждый час портал проверяет блоки с высоким уровнем и сообщает о них в колокольчике.",
        ],
      },
    },
    {
      id: "datensuche",
      nach: "pflueckaufgabe",
      neu: {
        id: "datensuche",
        titel: "Найти запись (поиск по данным)",
        einleitung:
          "Поиск в шапке находит не только страницы и модули, но и записи: ящики, партии, задачи сбора, сборщиков, рядные блоки, документы и клиентов.",
        schritte: [
          "Нажмите кнопку поиска слева от колокольчика. Окно поиска открывается вверху по центру.",
          "Введите не менее двух символов, например номер партии или часть имени. В разделе «Страницы и модули» стоят страницы, «Искать в данных» запускает поиск по записям.",
          "Результаты называют тип (ящик, партия, задача сбора, сборщик, рядный блок, документ, клиент), код и контекст. Стрелки выбирают результат, Enter открывает его, Esc закрывает поиск.",
          "Поиск показывает только то, что ваша роль и так может читать: клиент не найдёт сборщиков, производитель не найдёт клиентов. Нужен вход в систему, результатов не больше 50. Символы «%» и «_» в запросе считаются обычными символами, а не шаблоном.",
        ],
      },
    },
    {
      id: "foerdercheckliste",
      nach: "nachweis",
      neu: {
        id: "foerdercheckliste",
        titel: "Субсидии: ведение чек-листа досье",
        einleitung:
          "Портал не подключается к порталу субсидий. Он ведёт чек-лист по каждому досье и напоминает о сроках. Что нужно для заявки, определяет орган субсидирования, список не является официальной формой.",
        schritte: [
          `Откройте ${p("foerdermittel")}. В разделе «Чек-листы досье» у каждого досье указаны прогресс («выполнено x из y»), число открытых обязательных пунктов и число просроченных сроков.`,
          "Для досье без пунктов выберите «Принять общее предложение»: пять пунктов (форма заявки, организационно-правовая форма и идентификационный номер, смета затрат и инвестиций с предложениями, подтверждение площадей, платёжные документы). Предложение не является официальным перечнем: сверьте его с требованиями органа и доработайте.",
          "«Добавить пункт»: название, при желании срок и признак обязательности. «Выполнено» отмечает пункт, «Открыть снова» отменяет отметку, «Удалить» убирает пункт.",
          "Досье считается полным, когда выполнены все обязательные пункты. Пункты с истёкшим сроком портал считает как «срок превышен».",
        ],
      },
    },
    {
      id: "konten",
      nach: "rollen",
      neu: {
        id: "konten",
        titel: "Учётные записи сотрудников: создать, заблокировать, сменить пароль",
        einleitung:
          "Учётные записи сотрудников создаёт администрирование. Кто покидает хозяйство, тот блокируется, а не удаляется: имя остаётся в журналах и историях, но у записи больше нет прав.",
        schritte: [
          `Под ролью администрирования откройте ${p("rollen")}. В разделе «Создать учётную запись сотрудника» введите имя, адрес электронной почты и роль и выберите «Создать запись». Портал один раз показывает временный пароль: передайте его безопасно, потом он нигде не виден.`,
          "Сотрудник входит и задаёт собственный пароль на странице «Безопасность» (меню учётной записи, «Сменить пароль»). Нужно не менее 12 символов. Недопустимы собственный адрес электронной почты и пароли, где меньше четырёх разных символов.",
          "Чтобы заблокировать, в строке записи раскройте «Заблокировать запись», укажите причину (от 3 до 300 символов) и выберите «Заблокировать». Заблокированная запись сразу теряет роль и не может войти. В строке указаны дата и причина.",
          "«Разблокировать» возвращает запись с её ролью. Собственную запись и последнего активного администратора заблокировать нельзя, база данных отклоняет оба случая.",
          "Создание, блокировка и разблокировка попадают в журнал.",
        ],
      },
    },
    {
      id: "einstellungen",
      nach: "konten",
      neu: {
        id: "einstellungen",
        titel: "Сроки, мощности и ориентиры в настройках",
        einleitung:
          "Рабочие значения хранятся не в программе, а в настройках: сроки ЭСФ и ЕСУТД, грузоподъёмность автомобилей, ориентиры инвестиционного расчёта и веса оценки риска блока. Права доступа сюда не входят, ими управляют роли и база данных.",
        schritte: [
          `Откройте ${p("einstellungen")}. Значения сгруппированы по областям: налоги, трудовое право, рейсы вывоза, финансы, доставка, безопасность и риск блока.`,
          "У каждой настройки указаны описание, единица, значение по умолчанию и источник с датой. Менять могут администрирование и генеральный директор, по налогам и трудовому праву также ответственная роль (бухгалтерия, руководство хозяйства). Кто менять не может, всё равно видит значение.",
          "Введите новое значение, при желании причину, и выберите «Сохранить». Портал проверяет тип и границы. Пустое поле означает «не задано»: тогда проверка не применяется, а значение не придумывается.",
          "Внизу стоит история: кто и когда изменил значение, с какого на какое, с причиной. Историю изменить нельзя.",
        ],
      },
    },
    {
      id: "schulungsvideos",
      nach: "nachrichten",
      neu: {
        id: "schulungsvideos",
        titel: "Обучающие видео: воспроизведение, загрузка и замена",
        einleitung:
          "Короткие видео для вводного обучения портал воспроизводит на языке пользователя, если видео на этом языке есть. Загружать могут администрирование и руководство хозяйства.",
        schritte: [
          `Откройте ${p("schulungen")}. В разделе «Обучающие видео» у каждого видео указаны название, тема, длительность и, если оно обязательное, метка «Обязательно».`,
          "Воспроизведите видео в окне. Оно загружается только при воспроизведении, это бережёт мобильную сеть. Если языков несколько, кнопки под видео переключают язык. Если вашего языка нет, портал берёт русский, затем казахский, немецкий и английский.",
          "Чтобы загрузить, под видео выберите «Загрузить или заменить видеофайл»: укажите язык и файл (MP4 или WebM, не более 500 МБ) и нажмите «Загрузить». Загрузка идёт частями и после обрыва может быть продолжена. Существующий файл на том же языке заменяется.",
          "«Удалить файл» удаляет одну языковую версию.",
        ],
      },
    },
    {
      id: "benachrichtigungen",
      nach: "schulungsvideos",
      neu: {
        id: "benachrichtigungen",
        titel: "Колокольчик: чтение уведомлений",
        einleitung:
          "Колокольчик в шапке собирает то, что требует внимания, чтобы не открывать каждый модуль. Он виден администрированию, генеральному директору, руководству хозяйства, бухгалтерии, бригаде и производителю.",
        schritte: [
          "Число на колокольчике показывает непрочитанные уведомления. Нажатие открывает список.",
          "Каждый час портал создаёт уведомления о просроченных и скоро истекающих документах (ответственному лицу, иначе администрированию и руководству хозяйства), о ЭСФ сверх срока (бухгалтерия, администрирование), о просроченных уведомлениях ЕСУТД (руководство хозяйства, бухгалтерия, администрирование) и о рядных блоках с высоким уровнем риска (руководство хозяйства, администрирование). Генеральный директор получает то же, что и администрирование.",
          "Состояние сообщается один раз: если «скоро истекает» позже станет «просрочено», придёт новое уведомление. По ЭСФ, ЕСУТД и риску блока приходит одно сводное уведомление в день.",
          "Нажатие на уведомление отмечает его прочитанным и открывает модуль. «Отметить все как прочитанные» убирает список. Прочитанные уведомления исчезают через 90 дней.",
          "Условие: создание запускается по расписанию (workflow benachrichtigungen-erzeugen). Без него колокольчик остаётся пустым. Это настраивает оператор.",
        ],
      },
    },
    {
      id: "nachweis",
      zusatzSchritte: [
        "При продлении сертификата раскройте «Новая версия» вместо перезаписи старого документа. Поля уже заполнены, укажите срок и файл новой версии. Старая версия остаётся под названием как «прежняя версия», но больше не считается актуальной и не вызывает тревогу в радаре рисков.",
      ],
    },
    {
      id: "logger",
      zusatzSchritte: [
        "Портал читает и другие записи: файлы в Windows-1251 и Windows-1252, время вида 14.10.26 08:15 или 8:15 PM, значения времени Excel в столбце времени, температуру в кельвинах или градусах Фаренгейта (по заголовку столбца, пересчитывается в градусы Цельсия), часовой пояс в заголовке столбца («Time (UTC+6)») и формат JSON elproCLOUD (поля value, timeStamp в UTC и unit).",
      ],
    },
    {
      id: "wirtschaftlichkeit",
      zusatzSchritte: [
        "Раздел «Выгода от снижения потерь по данным хозяйства» выводит выгоду из доли потерь: снижение относительно базовой линии, умноженное на годовой объём и на полную себестоимость килограмма. «Принять как статью выгоды» создаёт статью (происхождение «оценка») и при повторном нажатии обновляет её. При менее чем десяти партиях или без улучшения расчёт остаётся открытым.",
        `У ставки дисконтирования есть ориентир (по умолчанию 20 процентов) и две сравнительные ставки (16 и 24 процента), которые страница показывает как проверку ставки рядом с чистой приведённой стоимостью. Все три значения заданы в разделе ${p("einstellungen")}.`,
      ],
    },
    {
      id: "abholrunde",
      zusatzSchritte: [
        `Грузоподъёмность автомобиля задана по умолчанию в разделе ${p("einstellungen")} и может быть изменена для рейса. Если рейс планирует больше грузоподъёмности, планирование предупреждает. У каждой остановки может быть окно забора (с, до). Расчётное прибытие на остановку учитывает время в пути и время на остановку (настройка), а окно, которое прибытие не попадает, отмечено.`,
      ],
    },
    {
      id: "auslieferung",
      zusatzSchritte: [
        "Для партнёрской системы с собственным форматом администрирование в разделе «Целевой формат» задаёт шаблон с подстановками, который отображает конверт (например, 1С через OData). Данные для базовой аутентификации, как и секрет, берутся из переменной окружения сервера, а не из портала.",
        "Партнёр может подтвердить получение через адрес обратной связи портала (с подписью и меткой времени). Тогда запись получает статус «подтверждено». Регулярный вызов доставки настраивает оператор через workflow integrationen-ausliefern.",
      ],
    },
    {
      id: "nachrichten",
      zusatzSchritte: [
        "Для случаев защиты данных есть «Обезличить» (администрирование, генеральный директор): текст и имя в сообщении удаляются, история остаётся. Причина обязательна и записывается в журнал.",
      ],
    },
  ];
}

function kasachisch(p: (key: string) => string): Ergaenzung[] {
  return [
    {
      id: "blockrisiko",
      nach: "wartezeit",
      neu: {
        id: "blockrisiko",
        titel: "Қатар блогының тәуекелін оқу",
        einleitung:
          "«Тәуекел» бағанасы бес факторды 0-ден 100-ге дейінгі бағаға біріктіреді: жіберілген жинау айналымы, күту мерзімі, ақау, суыту тізбегі және тіркеу олқылығы. Ол әрқашан негізгі себепті де атайды, тек санды емес.",
        schritte: [
          `${p("reihenbloecke")} бөлімін ашыңыз. Әр блокта деңгей (төмен, орташа, жоғары), «100-ден x» бағасы және негізгі себеп тұрады. Кемшілігі жоқ блокта «кемшілік жоқ» деп жазылады.`,
          "Жоғары деңгей кемінде екі ауыр фактор немесе күту мерзімі аяқталғанға дейін мерзімі келетін ашық тапсырма дегенді білдіреді. Бір кемшілік ең көбі «орташа» береді.",
          "Кесте астындағы «Тәуекел бағасы қалай құралады» бөлімі әр фактор үшін ережені, салмақты және қолданыстағы шектерді атайды.",
          "Бағаны әкімшілік, шаруашылық басшылығы және бригада көреді. Барлық бастапқы деректерді көрмейтін рөлдер (ротация жоспары, өңдеулер, суыту тізбектері) төмен бағаның орнына баға алмайды.",
          `Салмақтарды, шектерді және табалдырықтарды әкімшілік пен бас директор ${p("einstellungen")} бөлімінде, «Блок тәуекелі: салмақтар мен шектер» тарауында жүргізеді. Портал «жоғары» табалдырығы «орташа» табалдырығынан жоғары емес немесе барлық салмақ нөл болатын мәндерді қабылдамайды. Әр өзгеріс журналға жазылады.`,
          "Портал әр сағат сайын жоғары деңгейлі блоктарды тексеріп, қоңырауда хабарлайды.",
        ],
      },
    },
    {
      id: "datensuche",
      nach: "pflueckaufgabe",
      neu: {
        id: "datensuche",
        titel: "Жазбаны табу (деректер бойынша іздеу)",
        einleitung:
          "Тақырыптағы іздеу беттер мен модульдерді ғана емес, жазбаларды да табады: жәшіктер, партиялар, жинау тапсырмалары, жинаушылар, қатар блоктары, құжаттар және клиенттер.",
        schritte: [
          "Қоңыраудың сол жағындағы іздеу түймесін басыңыз. Іздеу терезесі жоғарыда ортада ашылады.",
          "Кемінде екі таңба енгізіңіз, мысалы партия нөмірін немесе атаудың бір бөлігін. «Беттер мен модульдер» астында беттер тұрады, «Деректерден іздеу» жазбалардан іздеуді бастайды.",
          "Нәтижелер түрін (жәшік, партия, жинау тапсырмасы, жинаушы, қатар блогы, құжат, клиент), кодын және байланысын атайды. Көрсеткі пернелері нәтижені таңдайды, Enter ашады, Esc іздеуді жабады.",
          "Іздеу рөліңіз оқи алатын нәрсені ғана көрсетеді: клиент жинаушыларды таппайды, өндіруші клиенттерді таппайды. Кіру қажет, нәтиже 50-ден аспайды. Енгізудегі «%» немесе «_» таңбасы үлгі емес, қарапайым таңба болып саналады.",
        ],
      },
    },
    {
      id: "foerdercheckliste",
      nach: "nachweis",
      neu: {
        id: "foerdercheckliste",
        titel: "Субсидиялар: іс бойынша тексеру тізімін жүргізу",
        einleitung:
          "Портал субсидия порталына қосылмайды. Ол әр іс бойынша тексеру тізімін жүргізеді және мерзімдерді еске салады. Өтінімге не керегін субсидия беруші орган анықтайды, тізім ресми нысан емес.",
        schritte: [
          `${p("foerdermittel")} бөлімін ашыңыз. «Істердің тексеру тізімдері» астында әр іс үшін барысы («y-тің x-і орындалды»), ашық міндетті тармақтар саны және асып кеткен мерзімдер саны көрсетіледі.`,
          "Тармағы жоқ іс үшін «Жалпы ұсынысты қабылдау» таңдаңыз: бес тармақ (өтінім нысаны, құқықтық нысаны мен сәйкестендіру нөмірі, ұсыныстармен шығын мен инвестиция есебі, алқаптарды растау, төлем құжаттары). Ұсыныс ресми каталог емес: органның талаптарымен салыстырып, түзетіңіз.",
          "«Тармақ қосу»: атауы, қалауыңызша мерзімі және міндетті ме. «Орындалды» тармақты белгілейді, «Қайта ашу» белгіні қайтарады, «Жою» тармақты өшіреді.",
          "Барлық міндетті тармақ орындалса, іс толық болып саналады. Мерзімі өткен тармақтарды портал «мерзім асты» деп санайды.",
        ],
      },
    },
    {
      id: "konten",
      nach: "rollen",
      neu: {
        id: "konten",
        titel: "Қызметкерлердің есептік жазбаларын жасау, бұғаттау, құпиясөзді өзгерту",
        einleitung:
          "Қызметкерлердің есептік жазбаларын әкімшілік жасайды. Шаруашылықтан кеткен адам жойылмайды, бұғатталады: аты хаттамалар мен тарихта көрініп тұрады, бірақ жазбаның құқығы болмайды.",
        schritte: [
          `Әкімшілік ретінде ${p("rollen")} бөлімін ашыңыз. «Қызметкердің есептік жазбасын жасау» астында атын, электрондық пошта мекенжайын және рөлін енгізіп, «Жазба жасау» түймесін басыңыз. Портал уақытша құпиясөзді бір рет көрсетеді: оны қауіпсіз тапсырыңыз, кейін ол еш жерде тұрмайды.`,
          "Адам кіріп, өз құпиясөзін «Қауіпсіздік» бетінде орнатады (есептік жазба мәзірі, «Құпиясөзді өзгерту»). Кемінде 12 таңба керек. Өз электрондық пошта мекенжайыңыз және төрттен аз әртүрлі таңбадан тұратын құпиясөздер рұқсат етілмейді.",
          "Бұғаттау үшін жазба жолында «Жазбаны бұғаттау» бөлімін ашып, себебін (3-тен 300 таңбаға дейін) енгізіп, «Бұғаттау» түймесін басыңыз. Бұғатталған жазбаның рөлі дереу жоғалады және кіре алмайды. Жолда күні мен себебі көрсетіледі.",
          "«Бұғатты алу» жазбаны рөлімен қайтарады. Өз жазбаңызды және соңғы белсенді әкімшіні бұғаттау мүмкін емес, дерекқор екеуін де қабылдамайды.",
          "Жасау, бұғаттау және бұғатты алу хаттамада тұрады.",
        ],
      },
    },
    {
      id: "einstellungen",
      nach: "konten",
      neu: {
        id: "einstellungen",
        titel: "Мерзімдерді, қуаттарды және бағдарларды баптауларда жүргізу",
        einleitung:
          "Жұмыс мәндері бағдарламада емес, баптауларда тұрады: ЭСФ және ЕСУТД мерзімдері, көліктердің жүк көтергіштігі, инвестициялық есептің бағдарлары және блок тәуекелін бағалаудың салмақтары. Қолжетімділік құқықтары бұған кірмейді, оларды рөлдер мен дерекқор реттейді.",
        schritte: [
          `${p("einstellungen")} бөлімін ашыңыз. Мәндер салалар бойынша топтастырылған: салық, еңбек құқығы, жинау рейстері, қаржы, жеткізу, қауіпсіздік және блок тәуекелі.`,
          "Әр баптауда сипаттама, өлшем бірлігі, әдепкі мән және күні бар дереккөз көрсетіледі. Өзгертуді әкімшілік пен бас директор жасай алады, салық пен еңбек құқығы бойынша жауапты рөл де (бухгалтерия, шаруашылық басшылығы). Өзгерте алмайтын адам мәнді көреді.",
          "Жаңа мәнді, қалауыңызша себепті енгізіп, «Сақтау» түймесін басыңыз. Портал түрі мен шектерін тексереді. Бос өріс «берілмеген» дегенді білдіреді: онда мән ойлап табылмайды, тексеру қолданылмайды.",
          "Төменде тарих тұрады: кім қашан қай мәнді қайдан қайға өзгертті, себебімен. Тарихты өзгерту мүмкін емес.",
        ],
      },
    },
    {
      id: "schulungsvideos",
      nach: "nachrichten",
      neu: {
        id: "schulungsvideos",
        titel: "Оқыту бейнелерін ойнату, жүктеу және ауыстыру",
        einleitung:
          "Бастапқы оқытуға арналған қысқа бейнелерді портал, егер бейне сол тілде болса, адамның тілінде ойнатады. Жүктеуді әкімшілік пен шаруашылық басшылығы жасай алады.",
        schritte: [
          `${p("schulungen")} бөлімін ашыңыз. «Оқыту бейнелері» астында әр бейне үшін атауы, тақырыбы, ұзақтығы және міндетті болса «Міндетті» белгісі көрсетіледі.`,
          "Бейнені терезеде ойнатыңыз. Ол тек ойнату кезінде жүктеледі, бұл мобильді желіні үнемдейді. Тілдер бірнешеу болса, бейне астындағы түймелер тілді ауыстырады. Өз тіліңіз жоқ болса, портал орыс, содан кейін қазақ, неміс және ағылшын тілін алады.",
          "Жүктеу үшін бейне астында «Бейне файлды жүктеу немесе ауыстыру» бөлімін таңдаңыз: тілі мен файлды (MP4 немесе WebM, 500 МБ-қа дейін) таңдап, «Жүктеу» түймесін басыңыз. Жүктеу бөліктеп жүреді және үзілістен кейін жалғастырылады. Сол тілдегі бар файл ауыстырылады.",
          "«Файлды жою» бір тіл нұсқасын жояды.",
        ],
      },
    },
    {
      id: "benachrichtigungen",
      nach: "schulungsvideos",
      neu: {
        id: "benachrichtigungen",
        titel: "Қоңырау: хабарламаларды оқу",
        einleitung:
          "Тақырыптағы қоңырау назар аударуды қажет ететінді жинайды, әр модульді ашудың қажеті жоқ. Ол әкімшілікке, бас директорға, шаруашылық басшылығына, бухгалтерияға, бригадаға және өндірушіге көрінеді.",
        schritte: [
          "Қоңыраудағы сан оқылмаған хабарламаларды көрсетеді. Қоңырауды басу тізімді ашады.",
          "Портал әр сағат сайын мерзімі өткен және жақында аяқталатын құжаттар (жауапты адамға, болмаса әкімшілік пен шаруашылық басшылығына), мерзімнен асқан ЭСФ (бухгалтерия, әкімшілік), мерзімі өткен ЕСУТД хабарламалары (шаруашылық басшылығы, бухгалтерия, әкімшілік) және тәуекел деңгейі жоғары қатар блоктары (шаруашылық басшылығы, әкімшілік) туралы хабарламалар жасайды. Бас директор әкімшілік алатынды алады.",
          "Күй бір рет хабарланады: «аяқталады» кейін «мерзімі өтті» болса, жаңа хабарлама келеді. ЭСФ, ЕСУТД және блок тәуекелі бойынша күніне бір жиынтық хабарлама болады.",
          "Хабарламаны басу оны оқылған деп белгілеп, модульді ашады. «Барлығын оқылған деп белгілеу» тізімді тазалайды. Оқылған хабарламалар 90 күннен кейін жойылады.",
          "Шарт: жасауды кесте бойынша шақыру (workflow benachrichtigungen-erzeugen). Онсыз қоңырау бос қалады. Мұны оператор баптайды.",
        ],
      },
    },
    {
      id: "nachweis",
      zusatzSchritte: [
        "Сертификат жаңартылғанда, ескі құжатты қайта жазудың орнына «Жаңа нұсқа» бөлімін ашыңыз. Өрістер алдын ала толтырылған, жаңа нұсқаның мерзімі мен файлын енгізіңіз. Ескі нұсқа атауының астында «бұрынғы нұсқа» ретінде сақталады, бірақ енді өзекті болып саналмайды және тәуекел радарында дабыл қақпайды.",
      ],
    },
    {
      id: "logger",
      zusatzSchritte: [
        "Портал басқа жазбаларды да оқиды: Windows-1251 және Windows-1252 файлдары, 14.10.26 08:15 немесе 8:15 PM сияқты уақыт, уақыт бағанасындағы Excel уақыт мәндері, Кельвин немесе Фаренгейт температурасы (баған тақырыбы бойынша, Цельсий градусына айналдырылады), баған тақырыбындағы уақыт белдеуі («Time (UTC+6)») және elproCLOUD JSON пішімі (value, UTC уақыттағы timeStamp және unit өрістері).",
      ],
    },
    {
      id: "wirtschaftlichkeit",
      zusatzSchritte: [
        "«Шаруашылық деректерінен шығынды азайту пайдасы» бөлімі пайданы шығын үлесінен шығарады: базалық сызықпен салыстырғандағы төмендеу, жылдық көлем және бір килограмның толық өзіндік құнына көбейтіледі. «Пайда бабы ретінде қабылдау» бапты жасайды (шығу тегі «бағалау») және қайта басқанда жаңартады. Он партиядан аз немесе жақсару болмаса, есеп ашық қалады.",
        `Дисконттау мөлшерлемесінің бағдары (әдепкі бойынша 20 пайыз) және екі салыстыру мөлшерлемесі (16 және 24 пайыз) бар, оларды бет таза келтірілген құнның жанында мөлшерлеме тексеруі ретінде көрсетеді. Үш мән де ${p("einstellungen")} бөлімінде тұрады.`,
      ],
    },
    {
      id: "abholrunde",
      zusatzSchritte: [
        `Көліктің жүк көтергіштігі ${p("einstellungen")} бөлімінде әдепкі мән ретінде тұрады және рейс үшін өзгертіледі. Рейс жүк көтергіштігінен көп жоспарласа, жоспарлау ескертеді. Әр аялдамада алу терезесі (қашан, қашанға дейін) болуы мүмкін. Аялдамаға болжамды келу жол уақытын және аялдама уақытын (баптау) ескереді, ал келу сәйкес келмейтін терезе белгіленеді.`,
      ],
    },
    {
      id: "auslieferung",
      zusatzSchritte: [
        "Өз пішімі бар серіктес жүйе үшін әкімшілік «Мақсатты пішім» астында конвертті бейнелейтін орын толтырғыштары бар үлгіні береді (мысалы, OData арқылы 1C). Негізгі аутентификацияның тіркелгі деректері құпия сияқты порталдан емес, сервердің орта айнымалысынан алынады.",
        "Серіктес алуды порталдың кері байланыс мекенжайы арқылы растай алады (қолтаңбамен және уақыт белгісімен). Сонда жазба «расталды» күйін алады. Жеткізуді тұрақты шақыруды оператор integrationen-ausliefern workflow арқылы баптайды.",
      ],
    },
    {
      id: "nachrichten",
      zusatzSchritte: [
        "Деректерді қорғау жағдайлары үшін «Иесіздендіру» бар (әкімшілік, бас директор): хабарламаның мәтіні мен аты жойылады, тарих қалады. Себебі міндетті және хаттамада тұрады.",
      ],
    },
  ];
}

const ergaenzungenFuer = (sprache: Sprache): Ergaenzung[] => {
  const p = (key: string) => pfadVon(sprache, key);
  switch (sprache) {
    case "de":
      return deutsch(p);
    case "en":
      return english(p);
    case "ru":
      return russisch(p);
    case "kk":
      return kasachisch(p);
  }
};

export const ergaenzungen: Record<Sprache, Ergaenzung[]> = {
  de: ergaenzungenFuer("de"),
  en: ergaenzungenFuer("en"),
  kk: ergaenzungenFuer("kk"),
  ru: ergaenzungenFuer("ru"),
};

/**
 * Wendet die Ergänzungen auf die Liste einer Sprache an: neue Anleitungen nach der genannten (sonst am Ende), Zusatzschritte am Ende einer vorhandenen.
 * Eine Ergänzung zu einer Kennung, die es nicht gibt, ist ein Fehler (sie würde still wirkungslos).
 */
export function wendeErgaenzungenAn(liste: readonly Anleitung[], zusaetze: readonly Ergaenzung[]): Anleitung[] {
  const aus: Anleitung[] = liste.map((a) => ({ ...a, schritte: [...a.schritte] }));
  for (const z of zusaetze) {
    if (z.neu) {
      if (aus.some((a) => a.id === z.neu!.id)) throw new Error(`Handbuch: Anleitung ${z.neu.id} gibt es schon`);
      const index = z.nach ? aus.findIndex((a) => a.id === z.nach) : aus.length - 1;
      if (z.nach && index < 0) throw new Error(`Handbuch: ${z.neu.id} soll nach ${z.nach} stehen, die gibt es nicht`);
      aus.splice(index + 1, 0, { ...z.neu, schritte: [...z.neu.schritte] });
    }
    if (z.zusatzSchritte) {
      const ziel = aus.find((a) => a.id === z.id);
      if (!ziel) throw new Error(`Handbuch: Zusatzschritte für ${z.id}, die Anleitung gibt es nicht`);
      ziel.schritte.push(...z.zusatzSchritte);
    }
  }
  return aus;
}
