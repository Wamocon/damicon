import type { Pruefbereich } from "@/lib/pruefung/rollen";

// Das Pruefprogramm: welche Fragen je Bereich gestellt werden, woher die Betriebsdaten kommen und
// womit in der Wissensbasis gesucht wird. Das ist bewusst KEIN Modellentscheid: Ein Audit muss bei
// jedem Lauf dieselben Punkte abdecken, sonst ist ein "ohne Befund" nichts wert. Das Modell
// bewertet, was das Programm zusammengetragen hat, es waehlt nicht aus, was geprueft wird.
//
// Die russischen Suchbegriffe sind noetig, weil die Rechtstexte auf Russisch (und Kasachisch)
// vorliegen. Artikelnummern stehen nur dort, wo sie im Korpus belegt sind.

/** Woher Betriebsdaten kommen: Name des Lesewerkzeugs, das die Rolle nutzen darf (sonst gibt es keine Daten). */
export type FaktenQuelle = "mwstStatusAbrufen" | "esutdOffeneFristenAbrufen" | "complianceUebersichtAbrufen" | "kuehlketteAbrufen" | "risikoRadarAbrufen";

export interface Pruefpunkt {
  id: string;
  bereich: Pruefbereich;
  titel: string;
  /** Die Frage an die Wissensbasis, auf Deutsch. */
  frage: string;
  /** Dieselbe Frage mit juristischen Fachbegriffen auf Russisch (sonst findet die Stichwortsuche nichts). */
  russisch: string;
  fakten: FaktenQuelle[];
}

export const PRUEFPUNKTE: Pruefpunkt[] = [
  // ---- Steuer ---------------------------------------------------------------------------
  {
    id: "st-ust",
    bereich: "steuer",
    titel: "Mehrwertsteuer: Registrierung und Schwelle",
    frage: "Ab welchem Umsatz muss sich ein Betrieb in Kasachstan fuer die Mehrwertsteuer registrieren, wie lange hat er dafuer Zeit und wie hoch ist der Satz?",
    russisch: "порог постановки на регистрационный учет по НДС обязательная постановка срок подачи заявления ставка НДС НК РК ст. 99 101",
    fakten: ["mwstStatusAbrufen"],
  },
  {
    id: "st-esf",
    bereich: "steuer",
    titel: "Elektronische Rechnungen (ESF)",
    frage: "Wer muss in Kasachstan elektronische Rechnungen (ESF) ausstellen und welche Pflichten und Fristen gelten?",
    russisch: "электронные счета-фактуры ЭСФ обязанность выписки плательщик НДС порядок и сроки выписки",
    fakten: ["risikoRadarAbrufen"],
  },
  {
    id: "st-esutd",
    bereich: "steuer",
    titel: "Elektronische Transportbegleitung (ESUTD)",
    frage: "Welche Pflichten gelten fuer die elektronische Transportbegleitung ESUTD und welche Strafen drohen bei Verstoessen?",
    russisch: "ЭСУТД электронная сопроводительная накладная на транспортировку товаров обязанность штрафы за нарушение",
    fakten: ["esutdOffeneFristenAbrufen"],
  },
  {
    id: "st-lohn",
    bereich: "steuer",
    titel: "Lohnsteuer und Sozialabgaben",
    frage: "Welche Steuern und Sozialabgaben muss ein Arbeitgeber in Kasachstan auf Loehne abfuehren und bis wann?",
    russisch: "индивидуальный подоходный налог обязательные пенсионные взносы социальные отчисления работодатель удержание сроки уплаты",
    fakten: [],
  },
  // ---- Audit ----------------------------------------------------------------------------
  {
    id: "au-pflicht",
    bereich: "audit",
    titel: "Pflicht zur Abschlusspruefung",
    frage: "Wann ist eine Abschlusspruefung (Audit) der Jahresabschluesse in Kasachstan verpflichtend?",
    russisch: "обязательный аудит финансовой отчетности случаи обязательности аудита закон об аудиторской деятельности",
    fakten: [],
  },
  {
    id: "au-nachweise",
    bereich: "audit",
    titel: "Nachweise, Dokumentation und Aufbewahrung",
    frage: "Welche Unterlagen muss ein Betrieb in Kasachstan fuer Pruefungen vorhalten und wie lange aufbewahren?",
    russisch: "хранение первичных учетных документов срок хранения налоговый учет документы подтверждающие налоговый учет",
    fakten: ["complianceUebersichtAbrufen"],
  },
  {
    id: "au-rueckverfolgung",
    bereich: "audit",
    titel: "Rueckverfolgbarkeit und Kuehlkette",
    frage: "Welche Anforderungen gelten in Kasachstan an die Rueckverfolgbarkeit und die Kuehlkette bei Lebensmitteln wie frischen Beeren?",
    russisch: "прослеживаемость пищевой продукции требования к хранению и перевозке температурный режим безопасность пищевой продукции",
    fakten: ["kuehlketteAbrufen"],
  },
  // ---- Recht ----------------------------------------------------------------------------
  {
    id: "re-datenschutz",
    bereich: "recht",
    titel: "Datenschutz: Vorfaelle und Meldefristen",
    frage: "Welche Pflichten hat ein Betrieb in Kasachstan bei einer Datenpanne oder Verletzung des Schutzes personenbezogener Daten?",
    russisch: "закон о персональных данных и их защите утечка нарушение защиты персональных данных уведомление уполномоченного органа срок",
    fakten: ["complianceUebersichtAbrufen"],
  },
  {
    id: "re-einwilligung",
    bereich: "recht",
    titel: "Einwilligungen und Weitergabe an Dritte",
    frage: "Wann ist in Kasachstan eine Einwilligung zur Verarbeitung personenbezogener Daten noetig und was gilt bei der Weitergabe an Dritte?",
    russisch: "согласие субъекта на сбор и обработку персональных данных передача персональных данных третьим лицам",
    fakten: ["complianceUebersichtAbrufen"],
  },
  {
    id: "re-arbeit",
    bereich: "recht",
    titel: "Arbeitsrecht: Arbeitszeit, Arbeitsschutz, Unterweisung",
    frage: "Welche Pflichten gelten in Kasachstan fuer Arbeitszeit, Arbeitsschutz und Unterweisung von Saisonkraeften?",
    russisch: "трудовой кодекс режим рабочего времени охрана труда инструктаж работников сезонные работники обязанности работодателя",
    fakten: [],
  },
  // ---- Risiko ---------------------------------------------------------------------------
  {
    id: "ri-fristen",
    bereich: "risiko",
    titel: "Ueberfaellige gesetzliche Fristen",
    frage: "Welche Sanktionen drohen in Kasachstan, wenn steuerliche oder gesetzliche Fristen und Meldepflichten versaeumt werden?",
    russisch: "ответственность за нарушение сроков представления налоговой отчетности штраф пеня нарушение налоговых сроков",
    fakten: ["risikoRadarAbrufen"],
  },
  {
    id: "ri-kuehlkette",
    bereich: "risiko",
    titel: "Lebensmittelsicherheit: Temperaturabweichungen",
    frage: "Welche Folgen haben Temperaturabweichungen in der Kuehlkette fuer die Verkehrsfaehigkeit und Haftung bei Lebensmitteln?",
    russisch: "безопасность пищевой продукции ответственность производителя отзыв продукции нарушение температурного режима хранения",
    fakten: ["kuehlketteAbrufen"],
  },
  {
    id: "ri-gesamt",
    bereich: "risiko",
    titel: "Gesamtes Sanktionsrisiko",
    frage: "Welche Bussgelder und Sanktionen drohen einem Betrieb in Kasachstan bei Verstoessen gegen Steuer- und Meldepflichten?",
    russisch: "административная ответственность штрафы нарушение налогового законодательства размер штрафа месячный расчетный показатель",
    fakten: ["risikoRadarAbrufen", "mwstStatusAbrufen"],
  },
];

export const punkteFuer = (bereich: Pruefbereich): Pruefpunkt[] => PRUEFPUNKTE.filter((p) => p.bereich === bereich);
