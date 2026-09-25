// Titel der Pruefungsfelder in allen Oberflaechensprachen. Die deutschen Titel stehen zugleich in felder.ts (Pruefprogramm);
// hier stehen die Uebersetzungen, damit Ablauf, Bericht, PDF und der Ersatzbefund des Servers dieselben Woerter benutzen und
// ein englischer oder russischer Bericht kein deutsches Feld enthaelt.

const TITEL: Record<string, Record<string, string>> = {
  de: {
    "st-ust": "Mehrwertsteuer: Registrierung und Schwelle",
    "st-esf": "Elektronische Rechnungen (ESF)",
    "st-esutd": "Elektronische Transportbegleitung (ESUTD)",
    "st-lohn": "Lohnsteuer und Sozialabgaben",
    "au-pflicht": "Pflicht zur Abschlussprüfung",
    "au-nachweise": "Nachweise, Dokumentation und Aufbewahrung",
    "au-rueckverfolgung": "Rückverfolgbarkeit und Kühlkette",
    "re-datenschutz": "Datenschutz: Vorfälle und Meldefristen",
    "re-einwilligung": "Einwilligungen und Weitergabe an Dritte",
    "re-arbeit": "Arbeitsrecht: Arbeitszeit, Arbeitsschutz, Unterweisung",
    "ri-fristen": "Überfällige gesetzliche Fristen",
    "ri-kuehlkette": "Lebensmittelsicherheit: Temperaturabweichungen",
    "ri-gesamt": "Gesamtes Sanktionsrisiko",
  },
  en: {
    "st-ust": "VAT: registration and threshold",
    "st-esf": "Electronic invoices (ESF)",
    "st-esutd": "Electronic transport documents (ESUTD)",
    "st-lohn": "Payroll tax and social contributions",
    "au-pflicht": "Statutory audit obligation",
    "au-nachweise": "Evidence, documentation and retention",
    "au-rueckverfolgung": "Traceability and cold chain",
    "re-datenschutz": "Data protection: incidents and notification deadlines",
    "re-einwilligung": "Consents and disclosure to third parties",
    "re-arbeit": "Labour law: working time, safety, instruction",
    "ri-fristen": "Overdue statutory deadlines",
    "ri-kuehlkette": "Food safety: temperature deviations",
    "ri-gesamt": "Overall sanction risk",
  },
  ru: {
    "st-ust": "НДС: постановка на учёт и порог",
    "st-esf": "Электронные счета-фактуры (ЭСФ)",
    "st-esutd": "Электронная сопроводительная накладная (ЭСУТД)",
    "st-lohn": "Подоходный налог и социальные отчисления",
    "au-pflicht": "Обязательный аудит",
    "au-nachweise": "Подтверждающие документы, документация и хранение",
    "au-rueckverfolgung": "Прослеживаемость и холодовая цепь",
    "re-datenschutz": "Защита данных: инциденты и сроки уведомления",
    "re-einwilligung": "Согласия и передача третьим лицам",
    "re-arbeit": "Трудовое право: рабочее время, охрана труда, инструктаж",
    "ri-fristen": "Просроченные установленные сроки",
    "ri-kuehlkette": "Безопасность пищевых продуктов: отклонения температуры",
    "ri-gesamt": "Общий риск санкций",
  },
  kk: {
    "st-ust": "ҚҚС: тіркеу және шек",
    "st-esf": "Электрондық шот-фактуралар (ЭШФ)",
    "st-esutd": "Электрондық тасымалдау ілеспе жүкқұжаты (ЭСУТД)",
    "st-lohn": "Жеке табыс салығы және әлеуметтік аударымдар",
    "au-pflicht": "Міндетті аудит",
    "au-nachweise": "Растайтын құжаттар, құжаттама және сақтау",
    "au-rueckverfolgung": "Іздеу мүмкіндігі және суық тізбек",
    "re-datenschutz": "Деректерді қорғау: оқиғалар және хабарлау мерзімдері",
    "re-einwilligung": "Келісімдер және үшінші тұлғаларға беру",
    "re-arbeit": "Еңбек құқығы: жұмыс уақыты, еңбек қорғау, нұсқама",
    "ri-fristen": "Мерзімі өткен заңды мерзімдер",
    "ri-kuehlkette": "Тағам қауіпсіздігі: температура ауытқулары",
    "ri-gesamt": "Санкциялардың жалпы қаупі",
  },
};

/** Titel eines Pruefungsfelds in der Sprache; unbekannte Felder oder Sprachen fallen auf den mitgelieferten Titel zurueck. */
export function feldTitel(id: string, sprache: string, standard: string): string {
  return TITEL[sprache]?.[id] ?? standard;
}

const DEUTSCHE_WOERTER = /(?:^|[^\p{L}])(?:und|der|die|das|bei|im|mit|für|zur|zum|von|des)(?![\p{L}])/iu;
const ENGLISCHE_WOERTER = /(?:^|[^\p{L}])(?:and|the|of|with|for|to|in)(?![\p{L}])/iu;

/** Passt ein Befund-Titel zur Sprache? Grob und ohne Modell: das Schriftsystem
 *  (Russisch und Kasachisch kyrillisch, sonst lateinisch) und fuer Deutsch und
 *  Englisch Umlaute und haeufige Woerter. Im Zweifel ja. */
export function titelPasstZurSprache(titel: string, sprache: string): boolean {
  const kyrillisch = (titel.match(/\p{Script=Cyrillic}/gu) ?? []).length;
  const lateinisch = (titel.match(/\p{Script=Latin}/gu) ?? []).length;
  if (sprache === "ru" || sprache === "kk") return kyrillisch > 0;
  if (kyrillisch > lateinisch) return false;
  if (sprache === "en") return !/[äöüß]/i.test(titel) && !DEUTSCHE_WOERTER.test(titel);
  if (sprache === "de") return /[äöüß]/i.test(titel) || !ENGLISCHE_WOERTER.test(titel);
  return true;
}

/** Der Titel eines Befunds in der gewuenschten Sprache: der Titel des Modells, wenn er
 *  passt, sonst der uebersetzte Feldtitel. Das Modell schreibt trotz Anweisung
 *  gelegentlich einen deutschen Titel in einen russischen Bericht (Rueckmeldung vom
 *  25.09.2026: "ich habe Russisch eingestellt, aber da steht etwas auf Deutsch"). */
export function titelInSprache(titel: string, feld: string, sprache: string): string {
  return titelPasstZurSprache(titel, sprache) ? titel : feldTitel(feld, sprache, titel);
}
