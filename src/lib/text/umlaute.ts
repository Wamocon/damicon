// Deutsche Rechtschreibung mit Umlauten: macht aus der Ersatzschreibung (ae, oe, ue, ss) die richtige Schreibweise,
// aber nur bei Woertern, die sich eindeutig zuordnen lassen. Ein blindes "ue" -> "ü" wuerde "Steuer", "Feuer" oder
// "neue" zerstoeren; deshalb gibt es eine kuratierte Liste von Wortstaemmen, die in korrektem Deutsch nie mit der
// Ersatzschreibung vorkommen ("pruef", "kuehl", "faell" ...). Das Netz fuer Texte, die ein Modell oder eine alte
// ASCII-Quelle geliefert hat; die Anweisung an das Modell und die Quelltexte bleiben der eigentliche Weg.
//
// Sicher fuer fremde Sprachen (Russisch, Kasachisch, Englisch): die Staemme kommen dort nicht vor. Nicht angefasst werden
// Codeabschnitte (`...`), Adressen und Kennungen (Pfade, snake_case, camelCase, Dateinamen).

type Regel = readonly [RegExp, string];

// Staemme, die nur in Ersatzschreibung vorkommen und ueberall im Wort stehen duerfen (Zusammensetzungen).
const STAEMME: ReadonlyArray<readonly [string, string]> = [
  ["pruef", "prüf"],
  ["kuehl", "kühl"],
  ["pflueck", "pflück"],
  ["fuehr", "führ"],
  ["fueg", "füg"],
  ["moegl", "mögl"],
  ["moecht", "möcht"],
  ["koenn", "könn"],
  ["muess", "müss"],
  ["duerf", "dürf"],
  ["wuerd", "würd"],
  ["waehl", "wähl"],
  ["waehr", "währ"],
  ["aender", "änder"],
  ["ergaenz", "ergänz"],
  ["naechst", "nächst"],
  ["schluess", "schlüss"],
  ["luecke", "lücke"],
  ["massnahm", "maßnahm"],
  ["gueltig", "gültig"],
  ["loehn", "löhn"],
  ["betraeg", "beträg"],
  ["spaet", "spät"],
  ["frueh", "früh"],
  ["saetz", "sätz"],
  ["faell", "fäll"],
  ["faehig", "fähig"],
  ["stuetz", "stütz"],
  ["wuensch", "wünsch"],
  ["erfuell", "erfüll"],
  ["natuerlich", "natürlich"],
  ["laeuft", "läuft"],
  ["zaehl", "zähl"],
  ["behoerd", "behörd"],
  ["haeufig", "häufig"],
  ["gehaelt", "gehält"],
  ["erklaer", "erklär"],
  ["itaet", "ität"],
  ["taetig", "tätig"],
  ["bestaetig", "bestätig"],
  ["rueck", "rück"],
  ["drueck", "drück"],
  ["oeffn", "öffn"],
  ["groess", "größ"],
  ["gruend", "gründ"],
  ["gruen", "grün"],
  ["verstoess", "verstöß"],
  ["bussg", "bußg"],
  ["buero", "büro"],
  ["hoech", "höch"],
  ["hoeh", "höh"],
  ["hoefl", "höfl"],
  ["gebaeud", "gebäud"],
  ["raeum", "räum"],
  ["geraet", "gerät"],
  ["waere", "wäre"],
  ["haette", "hätte"],
  ["zuverlaess", "zuverläss"],
  ["verfuegbar", "verfügbar"],
  ["schliess", "schließ"],
  ["gemaess", "gemäß"],
  ["fuell", "füll"],
  ["spraech", "spräch"],
  ["gehoer", "gehör"],
  ["flaech", "fläch"],
  ["faehrt", "fährt"],
  ["kuenft", "künft"],
  ["primaer", "primär"],
  ["sekundaer", "sekundär"],
  ["praezis", "präzis"],
  ["massgeb", "maßgeb"],
  ["laeuter", "läuter"],
  ["gruess", "grüß"],
  ["juengst", "jüngst"],
  ["staend", "ständ"],
  ["haelt", "hält"],
  ["traeg", "träg"],
  ["kaest", "käst"],
  ["schlaeg", "schläg"],
  ["buerg", "bürg"],
  ["genueg", "genüg"],
  ["naeh", "näh"],
  ["schaed", "schäd"],
  ["maengel", "mängel"],
  ["gaest", "gäst"],
  ["laend", "länd"],
  ["oeffentl", "öffentl"],
  ["persoenl", "persönl"],
  ["koerper", "körper"],
  ["woerter", "wörter"],
  ["kuend", "künd"],
  ["ablaeuf", "abläuf"],
  ["gedaecht", "gedächt"],
  ["vertraeg", "verträg"],
  ["unterstuetz", "unterstütz"],
  ["ueberpr", "überpr"],
  ["praefer", "präfer"],
  ["praezed", "präzed"],
  ["ausschliess", "ausschließ"],
];

// Nur am Wortanfang oder als ganzes Wort.
const ANFANG: ReadonlyArray<readonly [string, string]> = [
  ["ueber", "über"],
  ["fuer", "für"],
  ["fuers", "fürs"],
  ["dafuer", "dafür"],
  ["hierfuer", "hierfür"],
  ["wofuer", "wofür"],
  ["darueber", "darüber"],
  ["hierueber", "hierüber"],
  ["worueber", "worüber"],
  ["verstoss", "verstoß"],
  ["heisst", "heißt"],
  ["heissen", "heißen"],
  ["weiss", "weiß"],
  ["strasse", "straße"],
  ["gross", "groß"],
  ["ausser", "außer"],
  ["gruss", "gruß"],
  ["taete", "täte"],
  ["aehnl", "ähnl"],
  ["fuenf", "fünf"],
  ["zwoelf", "zwölf"],
  ["aeusser", "äußer"],
];

const gross = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const versal = (s: string): string => s.toUpperCase().replace(/ß/g, "SS");

function bauen(paare: ReadonlyArray<readonly [string, string]>, anfang: boolean): { klein: Regel[]; versal: Regel[] } {
  const klein: Regel[] = [];
  const grossbuchstaben: Regel[] = [];
  for (const [a, b] of paare) {
    // Wortanfang: nur ganze Woerter bzw. Woerter, die damit beginnen; kein Treffer mitten in einem fremden Wort.
    const vor = anfang ? "^" : "";
    klein.push([new RegExp(`${vor}${a}`, "g"), b]);
    klein.push([new RegExp(`${vor}${gross(a)}`, "g"), gross(b)]);
    grossbuchstaben.push([new RegExp(`${vor}${a.toUpperCase()}`, "g"), versal(b)]);
  }
  return { klein, versal: grossbuchstaben };
}

const STAMM = bauen(STAEMME, false);
const WORTANFANG = bauen(ANFANG, true);
// "loes" nur vor den Endungen, die ein Woerterbuch kennt (Loesung, loesen, loest, loesbar).
const LOESEN: Regel[] = [
  [/loes(?=ung|en\b|t\b|bar)/g, "lös"],
  [/Loes(?=ung|en\b|t\b|bar)/g, "Lös"],
];
const LOESEN_VERSAL: Regel[] = [[/LOES(?=UNG|EN\b|T\b|BAR)/g, "LÖS"]];
// Ein Doppel-s ohne Wortanfang ("Kuehlkette": kein ss) ist hier bewusst nicht dabei: "Abschluss" ist korrekt.

// Woerter wiederholen sich stark (Antworten, Berichte): einmal berechnet, danach nachgeschlagen.
const ZWISCHENSPEICHER = new Map<string, string>();

function alsWort(wort: string): string {
  const bekannt = ZWISCHENSPEICHER.get(wort);
  if (bekannt !== undefined) return bekannt;
  let w = wort;
  const nurGross = w.length > 1 && w === w.toUpperCase();
  for (const [re, ers] of nurGross ? [...WORTANFANG.versal, ...STAMM.versal, ...LOESEN_VERSAL] : [...WORTANFANG.klein, ...STAMM.klein, ...LOESEN]) w = w.replace(re, ers);
  if (ZWISCHENSPEICHER.size > 20000) ZWISCHENSPEICHER.clear();
  ZWISCHENSPEICHER.set(wort, w);
  return w;
}

const WORT = /[A-Za-zÄÖÜäöüß]+/g;
// Zeichen direkt vor oder hinter einem Wort, an denen man erkennt, dass es eine Kennung, ein Pfad oder ein Dateiname ist.
const KENNUNG_DAVOR = /[/_@#\\:=$%&]/;
const KENNUNG_DAHINTER = /[/_@#\\=]/;

function abschnitt(text: string): string {
  return text.replace(WORT, (wort, pos: number, ganz: string) => {
    if (!/(?:ae|oe|ue|ss|Ae|Oe|Ue|AE|OE|UE|SS)/.test(wort)) return wort;
    const davor = pos > 0 ? ganz[pos - 1]! : "";
    const dahinter = ganz[pos + wort.length] ?? "";
    if (KENNUNG_DAVOR.test(davor) || KENNUNG_DAHINTER.test(dahinter)) return wort;
    // Dateiname oder Adresse: Punkt zwischen zwei Buchstaben
    if ((dahinter === "." && /[A-Za-z]/.test(ganz[pos + wort.length + 1] ?? "")) || (davor === "." && /[A-Za-z]/.test(ganz[pos - 2] ?? ""))) return wort;
    // camelCase ("pruefungStarten"): eine Kennung im Code, kein Satzwort
    if (/[a-z][A-Z]/.test(wort)) return wort;
    return alsWort(wort);
  });
}

/** Ersetzt die Ersatzschreibung durch Umlaute. Idempotent; laesst Code, Adressen und Kennungen unberuehrt. */
export function mitUmlauten(text: string): string {
  if (!text || !/(?:ae|oe|ue|ss|Ae|Oe|Ue|AE|OE|UE|SS)/.test(text)) return text;
  return text
    .split(/(```[\s\S]*?```|`[^`\n]*`|https?:\/\/\S+)/g)
    .map((teil, i) => (i % 2 === 1 ? teil : abschnitt(teil)))
    .join("");
}

/** Wendet mitUmlauten nur auf Text an, der auf Deutsch gemeint ist (Oberflaechensprache "de"). */
export function fuerSprache(text: string, sprache: string): string {
  return sprache === "de" ? mitUmlauten(text) : text;
}

/** Die Umkehrung: Umlaute wieder in die Ersatzschreibung, damit Tabellen-, Spalten- und Dateinamen (die ASCII sind) auch dann
 *  gefunden werden, wenn ein Modell oder ein Mensch "Pflücker" statt "pfluecker" schreibt. */
export function ohneUmlaute(text: string): string {
  return text
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/[ÄÖÜ]/g, (z, pos: number, ganz: string) => {
      // In Grossbuchstaben-Woertern (AUSDRÜCKLICH) heisst es UE, sonst Ue.
      const nachbar = /[A-ZÄÖÜ]/.test(ganz[pos + 1] ?? "") || /[A-ZÄÖÜ]/.test(ganz[pos - 1] ?? "");
      const ers = z === "Ä" ? "Ae" : z === "Ö" ? "Oe" : "Ue";
      return nachbar ? ers.toUpperCase() : ers;
    })
    .replace(/ß/g, "ss");
}
