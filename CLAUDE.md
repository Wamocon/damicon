# CLAUDE.md

Damicon, Next.js 16 mit App Router, TypeScript strict, Tailwind v4, Supabase gehostet, Vercel.

Diese Datei sammelt, was sich beim Arbeiten am Projekt als teuer herausgestellt hat. Die verbindlichen Regeln stehen woanders und gelten unverändert.

## Wo die Regeln stehen

- `.github/copilot-instructions.md` ist der Basissatz. Vor der ersten Änderung lesen.
- `.github/instructions/*.instructions.md` gelten je nach Dateimuster: nextjs, tailwind, typescript, supabase.
- `AGENTS.md` beschreibt die Copilot-Personas und den empfohlenen Ablauf.
- `docs/manual/index.html` ist das Produkthandbuch und muss dem Stand der Anwendung folgen.

Die fünf Regeln, an denen hier erfahrungsgemäß zuerst etwas bricht:

- `src/proxy.ts` ist der einzige gültige Name. `middleware.ts` ist seit Next.js 16 abgekündigt.
- Kein `?? ''` in den Supabase-Clients. Das besteht die Nullprüfung und wirft dann beim Laden des Moduls.
- `params`, `searchParams`, `cookies()` und `headers()` sind asynchron.
- `NEXT_PUBLIC_` nur für Werte, die der Browser sehen darf.
- Keine festen Zeichenketten in Komponenten. `useTranslations`, vier Sprachen: de, en, kk, ru.

## Prüfen vor dem Abschluss

- `npm run typecheck`, dann `npm run lint`, dann `npm run build`. In dieser Reihenfolge.
- `npm run verify` fasst typecheck, lint, test und build zusammen. `npm run test` startet dabei 22 Reihen und braucht Zeit.
- Für reine Oberflächenänderungen reichen meist `test:kit`, `test:agent` und `test:pruefung`.
- Sichtprüfung mit `next-browser`, siehe `.github/skills/next-browser/SKILL.md`. Eine gemessene Zahl ist mehr wert als eine geschätzte.

## Oberfläche

- Setzt eine Komponente eigene Klassen neben eine durchgereichte `className`, läuft das über `cn()` aus `@/lib/utils`. Eine Zeichenkette reiht die Klassen nur aneinander, dann entscheidet die Reihenfolge im Stylesheet statt der Absicht des Aufrufers. Genau so griff ein `hidden lg:inline-flex` an keiner Breite und schnitt in der Kopfzeile drei Bedienelemente ab. Reicht eine Komponente `className` unverändert weiter, gibt es nichts zu mergen und `cn()` ist überflüssig. Stand heute merged keine Komponente mehr per Zeichenkette; Vorlagen für den falschen Weg gibt es also keine.
- `kachelVerweis` in `src/components/ui/kit.tsx` ist die klickbare Karte. Übersicht, Bereichsseiten und Landingpage nutzen sie. Keine vierte Variante erfinden.
- `useSeitenPfad()` in `src/components/dashboard/nav-ziele.ts` leitet als einzige Stelle ab, wo man steht. Pfad in der Kopfzeile und Rückweg auf dem Handy hängen beide daran.
- Was innerhalb einer Karte umbrechen soll, reagiert auf die Kartenbreite und nicht auf die Fensterbreite. Container-Abfragen (`@container`, `@2xs:`), sonst steht bei 1440 px ein abgeschnittener Modulname da, obwohl das Fenster breit ist.
- Die Symbolregistrierung in `src/components/icon.tsx` fällt bei unbekannten Namen stumm auf `Sprout` zurück. Einträge deshalb nicht entfernen, nur weil der Quelltext sie nicht mehr nennt: sie können in Daten stecken.

## Portal-Tests

- `tests/robot/portal.robot`, zehn Tests in drei Geräteprofilen: 1600x1000, 844x390, 390x844.
- Start über `./tests/robot/ausfuehren.ps1`, braucht einen laufenden Entwicklungsserver. Anleitung in `tests/robot/README.md`.
- Vor jedem Merge laufen lassen, der Kopfzeile, Seitenleiste oder Übersichtskarten berührt. Das mittlere Profil deckt den Bereich ab, in dem der bisher schwerste Befund lag.
- Wer die Tests ändert, wiederholt die Gegenprobe: einen behobenen Fehler versuchsweise wieder einbauen und sehen, ob ein Test fehlschlägt. Ein Test, der nicht fehlschlagen kann, sichert nichts ab.

## Fallen, die schon einmal Zeit gekostet haben

- `npm audit fix --omit=dev` entfernt die Entwicklungspakete aus `node_modules`. Danach fehlt `@tailwindcss/postcss` und der Bau bricht ab. Also `npm audit fix` ohne `--omit`.
- Nach Eingriffen an `node_modules` zeigt der Turbopack-Zwischenstand noch auf entfernte Module. `.next` löschen, dann baut es wieder.
- Hält der Entwicklungsserver eine Datei, scheitert `npm install` mit `EBUSY` an `tailwindcss-oxide`. Server beenden, dann erneut.
- `.venv-robot` steht in `.gitignore` und in `eslint.config.mjs`. Fehlt der ESLint-Eintrag, prüft der Linter die Playwright-Dateien der Python-Umgebung mit.

## Sprache

- Dokumentation und Fließtext auf Deutsch mit echten Umlauten.
- Commit-Betreffs und Commit-Texte in ASCII-Umschrift: "Uebersicht", "traegt", "Aenderung". Das ist im ganzen Verlauf so gehalten, über alle Beitragenden hinweg.
- Neue Bezeichner im Portal tragen deutsche Namen, dem Bestand folgend: `nav-ziele.ts`, `untere-leiste.tsx`, `kachelVerweis`, `useSeitenPfad`.
- Commit-Betreff nach Conventional Commits, also `feat(ui):`, `fix(db):`, `refactor(ui):`.
