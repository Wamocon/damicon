import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

// Zerlegung von Markdown in Bloecke oberster Ebene fuer den KI-Chat
// (components/ki/ki-chat.tsx): jeder Block wird einzeln gerendert und
// gemerkt, damit beim Streamen nur der letzte, noch offene Block neu
// verarbeitet wird.

const PARSER = unified().use(remarkParse).use(remarkGfm);

export interface Zerlegung {
  text: string;
  bloecke: string[];
  /** Anfang jedes Blocks im Gesamttext. */
  anfaenge: number[];
}

/** Zerlegt Markdown in seine Bloecke oberster Ebene (Absatz, Liste, Tabelle,
 *  Ueberschrift, Codeblock ...). Eine Liste oder Tabelle bleibt EIN Block, so
 *  bleiben Nummerierung und Abstaende erhalten.
 *
 *  Beim Streamen wird der Text nur angehaengt: dann sind alle Bloecke ausser
 *  dem letzten fertig, und es genuegt, ab dem Anfang des letzten neu zu
 *  parsen. Das haelt die Kosten je Aktualisierung konstant, statt mit der
 *  Antwortlaenge zu wachsen. Nicht abgedeckt: Referenzdefinitionen und
 *  Fussnoten, die erst spaeter im Text stehen, wirken nicht rueckwirkend auf
 *  fruehere Bloecke (das Modell setzt sie nicht ein). */
export function zerlege(text: string, vorher: Zerlegung | null = null): Zerlegung {
  const behalten = vorher && vorher.bloecke.length > 1 && text.startsWith(vorher.text) ? vorher.bloecke.length - 1 : 0;
  const basis = vorher && behalten > 0 ? vorher.anfaenge[behalten]! : 0;
  const bloecke = vorher && behalten > 0 ? vorher.bloecke.slice(0, behalten) : [];
  const anfaenge = vorher && behalten > 0 ? vorher.anfaenge.slice(0, behalten) : [];
  try {
    const rest = text.slice(basis);
    for (const knoten of PARSER.parse(rest).children) {
      const von = knoten.position?.start.offset;
      const bis = knoten.position?.end.offset;
      if (von === undefined || bis === undefined) return { text, bloecke: [text], anfaenge: [0] };
      bloecke.push(rest.slice(von, bis));
      anfaenge.push(basis + von);
    }
    return { text, bloecke, anfaenge };
  } catch {
    return { text, bloecke: [text], anfaenge: [0] };
  }
}
