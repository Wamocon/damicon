// Das Stilblatt des Handbuchs.
//
// Getrennt von erzeugen.ts, weil dort sonst drei Sprachen in einer Datei
// stuenden - TypeScript, CSS und das Skript der Seite. Wer die Farben des
// Portals nachzieht, sucht sie hier und nicht zwischen HTML-Bausteinen.
//
// Die Werte sind die Design-Tokens aus src/app/globals.css. Sie stehen hier
// als eigene Kopie, weil das Handbuch eine eigenstaendige Datei ist und ohne
// die Anwendung geoeffnet werden koennen muss - aendert sich die Palette
// dort, gehoert sie hier nachgezogen.

export function stilblatt(): string {
  return `/* Farben, Radien und Schriften sind die des Portals (src/app/globals.css).
   Sie stehen hier als eigene Werte, weil das Handbuch eine eigenstaendige
   Datei ist und ohne die Anwendung geoeffnet werden koennen muss - aendert
   sich die Palette dort, gehoert sie hier nachgezogen. */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  color-scheme: light;
  --hintergrund: #f6fafb;
  --vordergrund: #0b1e26;
  --karte: #ffffff;
  --primaer: #00768f;
  --primaer-auf: #ffffff;
  --zweit: #e3f2f6;
  --gedaempft: #eaf2f4;
  --gedaempft-text: #5a7078;
  --akzent: #8c6209;
  --gut: #297956;
  --warnung: #945d0c;
  --gefahr: #c23b4e;
  --rand: #dbe8ec;
  --ring: #0095ac;
  --leiste: #ffffff;
  --leiste-rand: #dceaee;
  --leiste-akzent: #eaf4f7;
  --radius: 0.625rem;
  --schrift: "Inter", "Segoe UI", system-ui, -apple-system, sans-serif;
  --schrift-titel: "Manrope", "Inter", "Segoe UI", system-ui, sans-serif;
  --markierung: rgba(0, 149, 172, 0.28);
}

.dark {
  color-scheme: dark;
  --hintergrund: #04161c;
  --vordergrund: #e6f4f8;
  --karte: #081e26;
  --primaer: #3fd0e6;
  --primaer-auf: #01222b;
  --zweit: #0d2f3a;
  --gedaempft: #0c2933;
  --gedaempft-text: #9ab8c1;
  --akzent: #f2c14b;
  --gut: #5ecfa0;
  --warnung: #e8b34a;
  --gefahr: #fb7185;
  --rand: rgba(255, 255, 255, 0.09);
  --ring: #5fdcef;
  --leiste: #051b22;
  --leiste-rand: rgba(255, 255, 255, 0.09);
  --leiste-akzent: #0c2b35;
  --markierung: rgba(63, 208, 230, 0.26);
}

html { scroll-behavior: smooth; }

/* Das hidden-Attribut wirkt ueber display: none aus dem Browser-Stylesheet -
   und verliert damit gegen jede eigene display-Regel. Der Weg zurueck ins
   Portal traegt .knopf mit display: inline-flex und stand deshalb sichtbar da,
   obwohl er ausserhalb des Portals ins Leere zeigt. */
[hidden] { display: none !important; }

body {
  font-family: var(--schrift);
  background: var(--hintergrund);
  color: var(--vordergrund);
  line-height: 1.7;
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
}

a { color: var(--primaer); text-decoration: none; }
a:hover { text-decoration: underline; }

:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; border-radius: 4px; }

/* ── Kopfzeile ─────────────────────────────────────────────────────────── */
/* 64 px hoch wie die Kopfzeile des Portals (md:h-16). */
.kopf {
  position: sticky; top: 0; z-index: 50;
  height: 64px;
  display: flex; align-items: center; justify-content: space-between;
  gap: 1rem; padding: 0 1.25rem;
  background: var(--leiste);
  border-bottom: 1px solid var(--leiste-rand);
}

.marke { display: flex; align-items: center; gap: 0.7rem; color: inherit; }
.marke:hover { text-decoration: none; }

.marke-zeichen { width: 36px; height: 36px; flex-shrink: 0; display: block; }

.marke-text { display: flex; flex-direction: column; line-height: 1.25; }
.marke-name { font-family: var(--schrift-titel); font-weight: 800; font-size: 1.05rem; }
.marke-unter { font-size: 0.7rem; font-weight: 600; color: var(--gedaempft-text); }

.kopf-werkzeuge { display: flex; align-items: center; gap: 0.6rem; }

.knopf {
  display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem;
  height: 36px; padding: 0 0.85rem;
  border-radius: calc(var(--radius) * 0.8);
  font-family: inherit; font-size: 0.82rem; font-weight: 700;
  cursor: pointer; border: 1px solid transparent; white-space: nowrap;
  transition: background-color 0.15s, color 0.15s, border-color 0.15s;
}
.knopf-voll { background: var(--primaer); color: var(--primaer-auf); }
.knopf-voll:hover { filter: brightness(1.08); text-decoration: none; }
.knopf-rand { background: transparent; color: var(--gedaempft-text); border-color: var(--rand); }
.knopf-rand:hover { color: var(--vordergrund); border-color: var(--primaer); text-decoration: none; }

/* ── Suche ─────────────────────────────────────────────────────────────── */
.suche {
  display: flex; align-items: center; gap: 0.5rem;
  height: 36px; padding: 0 0.7rem;
  background: var(--gedaempft);
  border: 1px solid var(--rand);
  border-radius: calc(var(--radius) * 0.8);
}
.suche:focus-within { border-color: var(--primaer); }
.suche-zeichen { color: var(--gedaempft-text); font-size: 1rem; line-height: 1; }

.suche-feld {
  background: none; border: none; outline: none;
  color: var(--vordergrund); font-family: inherit; font-size: 0.85rem;
  width: 200px; padding: 0;
}
.suche-feld::placeholder { color: var(--gedaempft-text); }
.suche-feld::-webkit-search-cancel-button { display: none; }

/* Haelt seine Breite auch leer, sonst wackelt die Kopfzeile bei jedem
   Tastendruck. */
.suche-zaehler {
  font-size: 0.72rem; color: var(--gedaempft-text);
  font-variant-numeric: tabular-nums; min-width: 4.5rem; text-align: right;
}
.suche-zaehler.leer { color: var(--warnung); font-weight: 700; }

.suche-loeschen {
  background: none; border: none; cursor: pointer; padding: 0 0 0 0.2rem;
  color: var(--gedaempft-text); font-size: 1.15rem; line-height: 1;
}
.suche-loeschen:hover { color: var(--vordergrund); }

/* ── Sprachumschalter ──────────────────────────────────────────────────── */
.sprachen {
  display: flex; align-items: center; gap: 2px;
  padding: 3px; background: var(--gedaempft);
  border: 1px solid var(--rand); border-radius: calc(var(--radius) * 0.8);
}
.sprache {
  border: none; background: none; cursor: pointer;
  font-family: inherit; font-size: 0.72rem; font-weight: 800;
  color: var(--gedaempft-text);
  padding: 0.25rem 0.45rem; border-radius: calc(var(--radius) * 0.5);
  transition: background-color 0.15s, color 0.15s;
}
.sprache:hover { color: var(--vordergrund); }
.sprache-aktiv { background: var(--primaer); color: var(--primaer-auf); }
.sprache-aktiv:hover { color: var(--primaer-auf); }

/* ── Raster ────────────────────────────────────────────────────────────── */
.raster {
  display: grid; grid-template-columns: 300px minmax(0, 1fr);
  max-width: 1500px; margin: 0 auto;
  min-height: calc(100vh - 64px);
}

#toc {
  position: sticky; top: 64px; align-self: start;
  height: calc(100vh - 64px); overflow-y: auto;
  padding: 1.75rem 1.25rem 3rem;
  border-right: 1px solid var(--rand);
}

.toc-titel {
  font-size: 0.68rem; font-weight: 800; text-transform: uppercase;
  letter-spacing: 0.14em; color: var(--gedaempft-text); margin-bottom: 0.9rem;
}

.toc-link {
  display: block; color: var(--gedaempft-text); font-size: 0.82rem;
  padding: 0.3rem 0.5rem; border-radius: calc(var(--radius) * 0.6);
  border-left: 2px solid transparent;
}
.toc-link:hover { background: var(--leiste-akzent); color: var(--vordergrund); text-decoration: none; }
.toc-link.aktiv { color: var(--primaer); border-left-color: var(--primaer); font-weight: 700; }

.toc-1 {
  font-weight: 700; color: var(--vordergrund); font-size: 0.85rem;
  margin-top: 0.9rem; padding-top: 0.6rem; border-top: 1px solid var(--rand);
}
.toc-1:first-of-type { margin-top: 0; border-top: none; }
.toc-2 { padding-left: 1rem; }
.toc-3 { padding-left: 1.9rem; font-size: 0.78rem; }

main { padding: 2.5rem 3rem 6rem; max-width: 62rem; min-width: 0; }

/* ── Deckblatt ─────────────────────────────────────────────────────────── */
.deckblatt {
  background: var(--karte);
  border: 1px solid var(--rand);
  border-radius: calc(var(--radius) * 2);
  padding: 3rem; margin-bottom: 3.5rem;
}
.deckblatt-zeichen { width: 64px; height: 64px; display: block; margin-bottom: 1.5rem; }
.deckblatt-art {
  font-size: 0.68rem; font-weight: 800; text-transform: uppercase;
  letter-spacing: 0.16em; color: var(--primaer); margin-bottom: 0.9rem;
}
.deckblatt h1 {
  font-family: var(--schrift-titel); font-size: 3rem; font-weight: 800;
  line-height: 1.1; letter-spacing: -0.02em; margin-bottom: 0.6rem;
}
.deckblatt-unter { color: var(--gedaempft-text); font-size: 1.05rem; max-width: 46rem; }
.deckblatt-daten {
  display: flex; flex-wrap: wrap; gap: 2.5rem;
  margin-top: 2.25rem; padding-top: 1.75rem; border-top: 1px solid var(--rand);
}
.dt-name {
  display: block; font-size: 0.66rem; font-weight: 800; text-transform: uppercase;
  letter-spacing: 0.1em; color: var(--gedaempft-text); margin-bottom: 0.3rem;
}
.dt-wert { font-weight: 700; font-size: 0.95rem; }

/* ── Ueberschriften ────────────────────────────────────────────────────── */
section { margin-bottom: 3.5rem; }

h2 {
  font-family: var(--schrift-titel); font-size: 1.85rem; font-weight: 800;
  letter-spacing: -0.015em; margin-bottom: 1.25rem;
  padding-bottom: 0.7rem; border-bottom: 2px solid var(--primaer);
  display: flex; align-items: baseline; gap: 0.7rem;
}
h2 .nr { color: var(--primaer); font-size: 1.1rem; font-weight: 800; }

h3 {
  font-family: var(--schrift-titel); font-size: 1.3rem; font-weight: 700;
  margin: 2.25rem 0 0.9rem;
}

h4 {
  font-family: var(--schrift-titel); font-size: 1.02rem; font-weight: 700;
  margin: 1.85rem 0 0.5rem;
  display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;
}

p { margin-bottom: 0.9rem; }
p:last-child { margin-bottom: 0; }
.abstand-oben { margin-top: 0.8rem; }

ol, ul { margin: 0 0 1rem 1.3rem; }
li { margin-bottom: 0.45rem; }

code {
  font-family: ui-monospace, "Cascadia Code", "Consolas", monospace;
  font-size: 0.86em; background: var(--gedaempft);
  padding: 0.1rem 0.35rem; border-radius: 4px;
  border: 1px solid var(--rand); white-space: nowrap;
}

/* ── Kaesten ───────────────────────────────────────────────────────────── */
.kasten {
  border: 1px solid var(--rand); border-left-width: 3px;
  border-radius: var(--radius); padding: 1.1rem 1.35rem;
  margin: 1.25rem 0; background: var(--karte);
}
.kasten-titel { font-weight: 800; margin-bottom: 0.5rem; font-size: 0.95rem; }
.kasten-info { border-left-color: var(--primaer); }
.kasten-info .kasten-titel { color: var(--primaer); }
.kasten-wichtig { border-left-color: var(--gut); }
.kasten-wichtig .kasten-titel { color: var(--gut); }
.kasten-warnung { border-left-color: var(--warnung); }
.kasten-warnung .kasten-titel { color: var(--warnung); }

/* ── Karten ────────────────────────────────────────────────────────────── */
.karten-raster {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  gap: 1rem; margin: 1.25rem 0;
}
.karte-klein {
  background: var(--karte); border: 1px solid var(--rand);
  border-radius: var(--radius); padding: 1.1rem 1.25rem;
}
.karte-klein-titel { font-family: var(--schrift-titel); font-weight: 700; margin-bottom: 0.2rem; }
.karte-klein-zeile {
  font-size: 0.72rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.07em; color: var(--primaer); margin-bottom: 0.6rem;
}
.karte-klein p { font-size: 0.89rem; color: var(--gedaempft-text); }

/* ── Merkmale eines Moduls ─────────────────────────────────────────────── */
.merkmale {
  border: 1px solid var(--rand); border-radius: var(--radius);
  background: var(--karte); margin: 0.9rem 0 1.5rem; overflow: hidden;
}
.merkmal {
  display: grid; grid-template-columns: 11rem minmax(0, 1fr);
  gap: 1rem; padding: 0.6rem 1.1rem;
  border-top: 1px solid var(--rand); font-size: 0.89rem;
}
.merkmal:first-child { border-top: none; }
.merkmal-name { font-weight: 700; color: var(--gedaempft-text); }

/* ── Tabellen ──────────────────────────────────────────────────────────── */
.tabelle {
  margin: 1.25rem 0; overflow-x: auto;
  border: 1px solid var(--rand); border-radius: var(--radius);
  background: var(--karte);
}
table { width: 100%; border-collapse: collapse; font-size: 0.89rem; }
th {
  text-align: left; font-weight: 800; font-size: 0.72rem;
  text-transform: uppercase; letter-spacing: 0.07em;
  color: var(--gedaempft-text); background: var(--gedaempft);
  padding: 0.7rem 1rem; border-bottom: 1px solid var(--rand);
  white-space: nowrap;
}
td { padding: 0.7rem 1rem; border-bottom: 1px solid var(--rand); vertical-align: top; }
tbody tr:last-child td { border-bottom: none; }

/* Die Rechtematrix ist breit: neun Spalten. Die erste bleibt stehen. */
.tabelle-matrix table { font-size: 0.82rem; }
.tabelle-matrix th:not(:first-child), .tabelle-matrix td:not(:first-child) {
  text-align: center; white-space: normal;
}
.tabelle-matrix th:first-child, .tabelle-matrix td:first-child {
  position: sticky; left: 0; background: var(--karte); z-index: 1;
}
.tabelle-matrix th:first-child { background: var(--gedaempft); }

.recht { font-size: 1rem; line-height: 1; }
.recht-schreiben { color: var(--primaer); }
.recht-lesen { color: var(--gedaempft-text); }
.recht-keins { color: var(--rand); }
.legende { font-size: 0.82rem; color: var(--gedaempft-text); }

/* ── Pillen ────────────────────────────────────────────────────────────── */
.pille {
  display: inline-block; padding: 0.15rem 0.6rem;
  border-radius: 999px; font-size: 0.68rem; font-weight: 800;
  text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap;
}
.pille-gut { background: color-mix(in srgb, var(--gut) 14%, transparent); color: var(--gut); }
.pille-offen { background: color-mix(in srgb, var(--warnung) 14%, transparent); color: var(--warnung); }
.pille-jetzt { background: color-mix(in srgb, var(--primaer) 14%, transparent); color: var(--primaer); }

/* ── Suche: Treffer und Filter ─────────────────────────────────────────── */
mark.treffer { background: var(--markierung); color: inherit; border-radius: 3px; padding: 0 2px; }
mark.treffer-aktiv {
  background: var(--akzent); color: var(--hintergrund);
  font-weight: 700; box-shadow: 0 0 0 3px color-mix(in srgb, var(--akzent) 30%, transparent);
}

.ausgeblendet { display: none; }

.such-hinweis {
  display: none; margin-bottom: 1.5rem;
  background: var(--karte); border: 1px solid var(--rand);
  border-left: 3px solid var(--warnung); border-radius: var(--radius);
  padding: 1.1rem 1.35rem; color: var(--gedaempft-text); font-size: 0.92rem;
}
.such-hinweis.sichtbar { display: block; }
.such-hinweis strong { color: var(--vordergrund); }

/* ── Fuss ──────────────────────────────────────────────────────────────── */
.fuss {
  border-top: 1px solid var(--rand); padding: 1.75rem 3rem;
  display: flex; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem;
  font-size: 0.8rem; color: var(--gedaempft-text);
}

/* ── Schmale Schirme ───────────────────────────────────────────────────── */
@media (max-width: 1180px) {
  .raster { grid-template-columns: 1fr; }
  #toc { display: none; }
  main { padding: 2rem 1.5rem 4rem; }
  .fuss { padding: 1.5rem; }
  .suche-feld { width: 130px; }
  .marke-unter { display: none; }
}

@media (max-width: 820px) {
  .kopf { height: auto; padding: 0.7rem 1rem; flex-wrap: wrap; position: static; }
  .kopf-werkzeuge { width: 100%; flex-wrap: wrap; }
  .suche { flex: 1 1 100%; }
  .suche-feld { width: 100%; flex: 1; }
  .deckblatt { padding: 1.75rem; }
  .deckblatt h1 { font-size: 2.1rem; }
  .deckblatt-daten { gap: 1.25rem; }
  .merkmal { grid-template-columns: 1fr; gap: 0.15rem; }
  h2 { font-size: 1.5rem; }
}

/* ── Druck ─────────────────────────────────────────────────────────────── */
@media print {
  .kein-druck, .kopf, #toc, .fuss { display: none !important; }
  .raster { display: block; max-width: none; }
  main { padding: 0; max-width: none; }

  /* Der PDF-Export ist immer das vollstaendige Handbuch, nie der gerade
     gefilterte Ausschnitt. Das Skript setzt die Suche vor dem Druck zurueck;
     diese Regeln sind das zweite Netz, falls JavaScript abgeschaltet ist oder
     der Druck ueber Strg+P am Skript vorbeilaeuft. Ohne sie druckte eine
     Suche nach "Kuehlkette" ein Handbuch aus drei Absaetzen - und niemand
     saehe dem PDF an, dass etwas fehlt. */
  .ausgeblendet { display: revert !important; }
  .such-hinweis { display: none !important; }
  mark.treffer, mark.treffer-aktiv {
    background: none !important; color: inherit !important;
    box-shadow: none !important; font-weight: inherit !important; padding: 0 !important;
  }

  body { background: #fff; color: #000; font-size: 10.5pt; }
  :root {
    --hintergrund: #fff; --vordergrund: #000; --karte: #fff;
    --gedaempft: #f4f4f4; --gedaempft-text: #444; --rand: #bbb;
    --primaer: #005f74; --gut: #1f5e43; --warnung: #7a4c09;
  }

  section { break-before: page; }
  section:first-of-type { break-before: auto; }
  .deckblatt { break-after: page; border: none; padding: 0; }
  h2, h3, h4 { break-after: avoid; }
  table, .kasten, .karte-klein, .merkmale { break-inside: avoid; }
  thead { display: table-header-group; }
  .tabelle, .tabelle-matrix { overflow: visible; }
  .tabelle-matrix th:first-child, .tabelle-matrix td:first-child { position: static; }
  a { color: #000; text-decoration: none; }
  @page { margin: 16mm 14mm; }
}`;
}
