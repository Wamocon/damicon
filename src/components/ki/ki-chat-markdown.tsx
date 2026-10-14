"use client";

// Markdown-Darstellung der Antworten im KI-Chat (ki-chat.tsx) und im Untertitel
// des Sprachmodus (sprachmodus-anzeige.tsx, über den Export in ki-chat.tsx). Fürs
// Streamen optimiert: siehe die zwei Ebenen von memo unten.

import { memo, useState } from "react";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { ZitatMarke } from "@/components/ki/ki-quellen";
import { mitUmlauten } from "@/lib/text/umlaute";
import { zerlege } from "@/lib/markdown-bloecke";
import { verlinkeZitate } from "@/lib/wissen/belege";

// Plugins und Komponenten ausserhalb der Komponente: Wuerden sie bei jedem
// Rendern neu angelegt, sieht React fuer jede Tabelle und jeden Link einen
// neuen Komponententyp und baut sie samt DOM jedes Mal neu auf.
const MARKDOWN_PLUGINS = [remarkGfm];
const MARKDOWN_KOMPONENTEN: Components = {
  table: ({ children }) => (
    <div className="ki-md__tabelle">
      <table>{children}</table>
    </div>
  ),
  a: ({ children, href }) =>
    href?.startsWith("quelle:") ? (
      <ZitatMarke kennung={href.slice("quelle:".length)} />
    ) : (
      <a href={href} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    ),
};

// Das Schema "quelle:" (Zitat-Marke, siehe lib/wissen/belege.ts) darf react-markdown
// nicht als unsicheren Link verwerfen; alles andere behaelt die uebliche Pruefung.
const linkPruefung = (url: string) => (url.startsWith("quelle:S") ? url : defaultUrlTransform(url));

// Zwei Ebenen von memo, weil beim Streamen fast alles gleich bleibt:
// - Markdown: fertige Antworten behalten ihren Text und werden gar nicht neu
//   verarbeitet. Vorher wurde bei jedem Wort der GESAMTE Verlauf neu in Markdown
//   gewandelt, der Hauptthread war Sekunden lang blockiert (Vercel meldete
//   INP-Probleme von ueber 4 s auf Klicks im Chat).
// - MarkdownBlock: innerhalb der laufenden Antwort aendert sich nur der letzte,
//   noch offene Block; alles darueber wird nicht erneut geparst oder abgeglichen.
// - Deutsche Schreibweise: liefert ein Modell (oder eine Datenquelle) Ersatzschreibung (ae, oe, ue), zeigt der Chat Umlaute
//   (lib/text/umlaute.ts; Code, Adressen und Kennungen bleiben unberuehrt). Die Anweisung im Prompt bleibt der erste Weg.
const MarkdownBlock = memo(function MarkdownBlock({ text }: { text: string }) {
  return (
    <ReactMarkdown remarkPlugins={MARKDOWN_PLUGINS} components={MARKDOWN_KOMPONENTEN} urlTransform={linkPruefung}>
      {verlinkeZitate(mitUmlauten(text))}
    </ReactMarkdown>
  );
});

// Exportiert: der Sprachmodus (sprachmodus-anzeige.tsx) zeigt seinen Untertitel damit
// statt roh - "**fett**" und "1. 2. 3." standen sonst als Zeichen da, nicht
// als Formatierung, bei laengeren Antworten kaum lesbar (Rueckmeldung vom
// 25.09.2026). Dieselbe, fuers Streamen schon optimierte Komponente.
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  // Zerlegung des vorigen Renders mitfuehren (React-Muster "Werte aus dem
  // vorigen Render ableiten"), damit zerlege() nur den Zuwachs verarbeitet.
  const [zerlegung, setZerlegung] = useState(() => zerlege(text, null));
  let aktuell = zerlegung;
  if (zerlegung.text !== text) {
    aktuell = zerlege(text, zerlegung);
    setZerlegung(aktuell);
  }
  return (
    <div className="ki-md">
      {aktuell.bloecke.map((block, index) => (
        <MarkdownBlock key={index} text={block} />
      ))}
    </div>
  );
});
