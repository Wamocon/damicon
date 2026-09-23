
---

# GitHub Copilot Customisation

<table>
<tr>
<th width="50%">DE Deutsch</th>
<th width="50%">EN English</th>
</tr>
<tr>
<td>Dieses Projekt nutzt GitHub Copilot Agents und Instructions, um eine strukturierte und produktive KI-gestützte Entwicklung zu ermöglichen.</td>
<td>This project uses GitHub Copilot Agents and Instructions to enable a structured and productive AI-assisted development workflow.</td>
</tr>
</table>

---

## Übersicht / Overview

| Typ / Type | Pfad / Path | Beschreibung / Description |
|---|---|---|
| **Global Instructions** | `.github/copilot-instructions.md` | Projektweite Basisregeln für alle Copilot-Interaktionen. / Project-wide baseline rules for all Copilot interactions. |
| **Instructions** | `.github/instructions/*.instructions.md` | Dateimuster-spezifische Coding-Richtlinien. / File-pattern-scoped coding guidelines. |
| **Agents** | `.github/agents/*.agent.md` | Spezialisierte KI-Personas für verschiedene Phasen. / Specialised AI personas for different development phases. |

---

## `copilot-instructions.md` - Globale Basisregeln / Global Baseline Rules

**Pfad / Path:** `.github/copilot-instructions.md`

<table>
<tr>
<th width="50%">DE Was ist das?</th>
<th width="50%">EN What is it?</th>
</tr>
<tr>
<td>Diese Datei wird bei <strong>jeder</strong> Copilot-Interaktion automatisch geladen. Sie definiert den Tech-Stack, kritische Regeln (async APIs, Server Components, Supabase), und Code-Stil-Konventionen für das gesamte Projekt.</td>
<td>This file is automatically loaded on <strong>every</strong> Copilot interaction. It defines the tech stack, critical rules (async APIs, Server Components, Supabase), and code style conventions for the whole project.</td>
</tr>
</table>

<table>
<tr>
<th width="50%">DE Wann bearbeiten?</th>
<th width="50%">EN When to edit?</th>
</tr>
<tr>
<td>
- Tech-Stack ändert sich (z. B. neue Bibliothek wird Standardmuster)<br>
- Neue projektweite Regeln sollen für alle Copilot-Interaktionen gelten<br>
- Team-Konventionen ändern sich<br>
<strong>⚠️ Kurz halten</strong> - diese Datei wird immer in den Kontext geladen.
</td>
<td>
- Tech stack changes (e.g. a new library becomes a standard pattern)<br>
- New project-wide rules need to apply to all Copilot interactions<br>
- Team conventions change<br>
<strong>⚠️ Keep it short</strong> - this file is always loaded into context.
</td>
</tr>
</table>

---

## Instructions - Datei-spezifische Richtlinien / File-Scoped Guidelines

<table>
<tr>
<th width="50%">DE Was sind Instructions?</th>
<th width="50%">EN What are Instructions?</th>
</tr>
<tr>
<td>Instructions sind Richtlinien, die automatisch geladen werden, wenn Copilot an Dateien arbeitet, die dem <code>applyTo</code>-Glob-Muster entsprechen. Sie ergänzen die globalen Regeln mit datei-spezifischen Details.</td>
<td>Instructions are guidelines that are automatically loaded when Copilot works on files matching the <code>applyTo</code> glob pattern. They extend the global rules with file-type-specific details.</td>
</tr>
</table>

### Vorhandene Instructions / Available Instructions

| Datei / File | `applyTo` | Zweck / Purpose |
|---|---|---|
| `nextjs.instructions.md` | `**/*.tsx, **/*.ts, **/*.jsx, **/*.js` | Next.js 16 App Router Patterns, async APIs, Server/Client Components |
| `tailwind.instructions.md` | `**/*.tsx, **/*.jsx, **/*.css` | Tailwind CSS v4 Utility-First Patterns, Responsive Design |
| `typescript.instructions.md` | `**/*.ts, **/*.tsx` | TypeScript Strict Mode, Naming Conventions, Type Safety |
| `supabase.instructions.md` | `**/supabase/**, **/*supabase*` | Supabase Client Setup, RLS, Migrations, Schema Awareness |

### Eigene Instructions erstellen / Creating Custom Instructions

<table>
<tr>
<th width="50%">DE Anleitung</th>
<th width="50%">EN Guide</th>
</tr>
<tr>
<td>Erstelle eine <code>.instructions.md</code>-Datei in <code>.github/instructions/</code> mit YAML-Frontmatter. Das <code>applyTo</code>-Feld akzeptiert Glob-Muster und bestimmt, für welche Dateien die Regeln gelten.</td>
<td>Create a <code>.instructions.md</code> file in <code>.github/instructions/</code> with YAML frontmatter. The <code>applyTo</code> field accepts glob patterns and determines which files the rules apply to.</td>
</tr>
</table>

```yaml
---
applyTo: "**/*.tsx"
---
# Your instructions here
```

---

## Agents - KI-Personas / AI Personas

<table>
<tr>
<th width="50%">DE Was sind Agents?</th>
<th width="50%">EN What are Agents?</th>
</tr>
<tr>
<td>Agents sind spezialisierte KI-Personas. Du rufst sie in VS Code über das Chat-Panel mit <code>@agent-name</code> auf. Jeder Agent hat eine klar definierte Rolle, einen Workflow und Regeln.</td>
<td>Agents are specialised AI personas. You invoke them in VS Code via the Chat panel using <code>@agent-name</code>. Each agent has a clearly defined role, workflow, and rules.</td>
</tr>
</table>

---

### `@planner` - Planer

<table>
<tr>
<th width="50%">DE</th>
<th width="50%">EN</th>
</tr>
<tr>
<td><strong>Zweck:</strong> Technische Planung und Anforderungsanalyse vor dem Coding.</td>
<td><strong>Purpose:</strong> Technical planning and requirements analysis before coding.</td>
</tr>
<tr>
<td><strong>Wann verwenden:</strong><br>- Vor dem Start eines neuen Features<br>- Wenn die Anforderungen unklar sind<br>- Vor Refactoring oder Migrations-Aufgaben</td>
<td><strong>When to use:</strong><br>- Before starting a new feature<br>- When requirements are unclear<br>- Before refactoring or migration tasks</td>
</tr>
<tr>
<td><strong>Was er tut:</strong><br>✔ Codebase erkunden und Kontext sammeln<br>✔ Betroffene Dateien und Module identifizieren<br>✔ Nummerierten Implementierungsplan erstellen<br>✘ <strong>Schreibt keinen Code</strong></td>
<td><strong>What it does:</strong><br>✔ Explore codebase and gather context<br>✔ Identify affected files and modules<br>✔ Create a numbered implementation plan<br>✘ <strong>Does not write code</strong></td>
</tr>
<tr>
<td><strong>Verwendung:</strong> <code>@planner Füge eine Authentifizierungsseite hinzu</code></td>
<td><strong>Usage:</strong> <code>@planner Add an authentication page</code></td>
</tr>
</table>

---

### `@developer` - Entwickler

<table>
<tr>
<th width="50%">DE</th>
<th width="50%">EN</th>
</tr>
<tr>
<td><strong>Zweck:</strong> Strukturierte Feature-Implementierung mit Qualitätsprüfungen.</td>
<td><strong>Purpose:</strong> Structured feature implementation with quality checks.</td>
</tr>
<tr>
<td><strong>Wann verwenden:</strong><br>- Nach der Planung mit <code>@planner</code><br>- Zur Implementierung von Features, Seiten, API-Routen<br>- Für Datenbankänderungen und Migrationen</td>
<td><strong>When to use:</strong><br>- After planning with <code>@planner</code><br>- To implement features, pages, API routes<br>- For database changes and migrations</td>
</tr>
<tr>
<td><strong>Vierphasiger Prozess:</strong><br>1. <strong>Vorbereitung</strong> - Plan lesen, Code verstehen<br>2. <strong>Implementierung</strong> - Schrittweise, Fehler sofort beheben<br>3. <strong>Verifikation (PFLICHT)</strong> - <code>typecheck</code> → <code>lint</code> → <code>build</code> → lokal testen<br>4. <strong>Dokumentation</strong> - Handbook aktualisieren</td>
<td><strong>Four-phase process:</strong><br>1. <strong>Preparation</strong> - Read plan, understand code<br>2. <strong>Implementation</strong> - Step by step, fix errors immediately<br>3. <strong>Verification (MANDATORY)</strong> - <code>typecheck</code> → <code>lint</code> → <code>build</code> → test locally<br>4. <strong>Documentation</strong> - Update handbook</td>
</tr>
<tr>
<td><strong>Verwendung:</strong> <code>@developer Implementiere diesen Plan: [Plan einfügen]</code></td>
<td><strong>Usage:</strong> <code>@developer Implement this plan: [paste plan]</code></td>
</tr>
</table>

---

### `@reviewer` - Code-Reviewer

<table>
<tr>
<th width="50%">DE</th>
<th width="50%">EN</th>
</tr>
<tr>
<td><strong>Zweck:</strong> Code-Review und Qualitätssicherung vor dem PR.</td>
<td><strong>Purpose:</strong> Code review and quality assurance before a PR.</td>
</tr>
<tr>
<td><strong>Wann verwenden:</strong><br>- Bevor ein PR erstellt wird<br>- Nach einer Implementierung zur Qualitätsprüfung<br>- Zur Sicherheits- und Performance-Analyse</td>
<td><strong>When to use:</strong><br>- Before creating a PR<br>- After implementation for quality check<br>- For security and performance audits</td>
</tr>
<tr>
<td><strong>Was er tut:</strong><br>✔ Strukturierte Checkliste (Qualität, Next.js 16, Supabase-Sicherheit, Styling)<br>✔ Alle Checks ausführen (typecheck, lint, build)<br>✔ Review-Bericht mit Status (✅ / ⚠️ / ❌)</td>
<td><strong>What it does:</strong><br>✔ Structured checklist (quality, Next.js 16, Supabase security, styling)<br>✔ Run all checks (typecheck, lint, build)<br>✔ Review report with status (✅ / ⚠️ / ❌)</td>
</tr>
<tr>
<td><strong>Verwendung:</strong> <code>@reviewer Überprüfe die Änderungen in src/app/dashboard/</code></td>
<td><strong>Usage:</strong> <code>@reviewer Review the changes in src/app/dashboard/</code></td>
</tr>
</table>

---

### `@handbook` - Produkthandbuch-Pflege

<table>
<tr>
<th width="50%">DE</th>
<th width="50%">EN</th>
</tr>
<tr>
<td><strong>Zweck:</strong> Das viersprachige Produkthandbuch aktuell halten - es muss immer den aktuellen Stand der Applikation widerspiegeln. Es wird <strong>erzeugt</strong> (<code>npm run handbuch</code>), nicht von Hand geschrieben: Quelle sind <code>scripts/handbuch/</code> und die Anwendung selbst.</td>
<td><strong>Purpose:</strong> Keep the four-language product handbook up to date - it must always reflect the current state of the application. It is <strong>generated</strong> (<code>npm run handbuch</code>), not hand-written: the sources are <code>scripts/handbuch/</code> and the application itself.</td>
</tr>
<tr>
<td><strong>Wann verwenden:</strong><br>- Nach jeder Feature-Implementierung (nicht optional)<br>- Nach dem Anwenden von Supabase-Migrationen<br>- Nach Branding-/Logo-/Farb-Änderungen<br>- Am Anfang jeder Session zur Freshness-Prüfung</td>
<td><strong>When to use:</strong><br>- After every feature implementation (not optional)<br>- After applying Supabase migrations<br>- After any branding/logo/color change<br>- At session start for a freshness check</td>
</tr>
<tr>
<td><strong>Was er tut:</strong><br>✔ <code>npm run handbuch</code> ausführen - Module, Bereiche, Rollen und Rechte kommen automatisch aus der App<br>✔ Prüfen, was die App nicht selbst weiß: Seiten, Schnittstellen, Anleitungen, Glossar<br>✔ <code>scripts/handbuch/texte-*.ts</code> anpassen, in <strong>allen vier Sprachen</strong><br>✔ Erzeugte Dateien mitcommitten<br>✘ <strong>Bearbeitet nie <code>docs/manual/*.html</code> von Hand</strong><br>✘ <strong>Schreibt kein App-Code</strong></td>
<td><strong>What it does:</strong><br>✔ Run <code>npm run handbuch</code> - modules, zones, roles and permissions come from the app automatically<br>✔ Check what the app does not know about itself: pages, endpoints, how-tos, glossary<br>✔ Update <code>scripts/handbuch/texte-*.ts</code> in <strong>all four languages</strong><br>✔ Commit the generated files alongside<br>✘ <strong>Never edits <code>docs/manual/*.html</code> by hand</strong><br>✘ <strong>Does not write app code</strong></td>
</tr>
<tr>
<td><strong>Verwendung:</strong> <code>@handbook Aktualisiere das Handbuch nach der Dashboard-Implementierung</code></td>
<td><strong>Usage:</strong> <code>@handbook Update the handbook after implementing the dashboard</code></td>
</tr>
</table>

---

### `@anforderungsdokument` - Anforderungsdokument

<table>
<tr>
<th width="50%">DE</th>
<th width="50%">EN</th>
</tr>
<tr>
<td><strong>Zweck:</strong> Vollständiges WAMOCON-Anforderungsdokument (9 Kapitel + .docx) für Web-/SaaS-Applikationen erstellen.</td>
<td><strong>Purpose:</strong> Create a complete WAMOCON requirements document (9 chapters + .docx) for web/SaaS applications.</td>
</tr>
<tr>
<td><strong>Wann verwenden:</strong><br>- Vor dem Start eines neuen Projekts<br>- Wenn eine App-Idee dokumentiert werden soll<br>- Bevor die Implementierung beginnt (Freigabe erforderlich)</td>
<td><strong>When to use:</strong><br>- Before starting a new project<br>- When an app idea needs to be documented<br>- Before implementation starts (approval required)</td>
</tr>
<tr>
<td><strong>Was er tut:</strong><br>✔ Marktanalyse, Wettbewerb, Zielgruppe recherchieren<br>✔ 9-Kapitel-Dokument mit echten Daten befüllen<br>✔ Dokument als .docx generieren<br>✘ <strong>Nur Web/SaaS - keine mobilen Apps</strong><br>✘ <strong>Nur Quellen nicht älter als 1 Jahr</strong></td>
<td><strong>What it does:</strong><br>✔ Research market analysis, competition, target audience<br>✔ Fill 9-chapter document with real data<br>✔ Generate document as .docx<br>✘ <strong>Web/SaaS only - no mobile apps</strong><br>✘ <strong>Sources not older than 1 year only</strong></td>
</tr>
<tr>
<td><strong>Verwendung:</strong> <code>@anforderungsdokument Erstelle das Anforderungsdokument für [Projektname]</code></td>
<td><strong>Usage:</strong> <code>@anforderungsdokument Create the requirements document for [project name]</code></td>
</tr>
</table>

#### Schritt-für-Schritt-Anleitung / Step-by-Step Guide

**1.** Fülle `IDEA.md` im Projekt-Root aus.

**2.** Kopiere den Prompt unten und sende ihn im Chat. Die KI liest `IDEA.md` und `SKILL.md` automatisch - nichts einfügen, nichts ersetzen:

```
Nutze für diese Aufgabe die PERSONA eines interdisziplinären Expertenteams
(Senior Product Manager, Market Research Analyst und Tech Lead) im CEOMODE.
Führe die gesamte Analyse im /godmode und auf L99 aus.

1. Vorbereitung
Lies zunächst diese beiden Dateien vollständig, bevor du beginnst:
- .github/skills/anforderungsdokument/SKILL.md
- IDEA.md

2. Projektrahmen & Kontext
Fokus: Entwicklung eines neuen Web-/SaaS-Tools.
Plattform: Ausschließlich browserbasierte Web- und SaaS-Applikationen.
Tech-Stack: Next.js, Tailwind CSS, TypeScript, Supabase, Vercel.
Strukturiere die technische Architektur als ARCHITECT.

3. Kernaufgabe
Durchdenke die Anforderungen mit /deepthink und erstelle ein vollständiges
WAMOCON-Anforderungsdokument. Halte dich strikt an die verbindliche
9-Kapitel-Struktur aus dem SKILL.md. Fülle jedes Kapitel mit echten, belegten
Daten. Verwende keine Platzhalter.

4. Strikte Restriktionen
Agiere bei der Einhaltung dieser Regeln als SENTINEL:

Plattform-Regel: Mobile Apps sind ausgeschlossen. Die Begriffe iOS, Android,
React Native oder Flutter dürfen im Dokument nicht erwähnt werden.

Quellen-Regel (FACTCHECK & /investigate): Nutze ausschließlich Quellen, die
jünger als ein Jahr sind. Ältere Quellen sind verboten. Jede genannte Zahl muss
mit einer exakten Quellenangabe und dem Veröffentlichungsdatum belegt werden.

Tonalität: Analytisch, datengestützt, kritisch und lösungsorientiert.
Professionell, durchgehend auf Deutsch unter Verwendung echter Umlaute (Ä, Ö, Ü, ß).

5. Ausgabe
Skript: scripts/generate-anforderungsdokument.mjs
Datei: public/Anforderungsdokument_[ProjektName].docx
```

**3.** Dokument prüfen und zur Freigabe bei der Geschäftsführung einreichen.

**4.** Nach Freigabe: Implementierung mit `@planner` starten.

---

## Tools

| Tool | Pfad / Path | Zweck / Purpose |
|---|---|---|
| **next-browser** | `.github/skills/next-browser/SKILL.md` | CLI that exposes React DevTools and the Next.js dev overlay as shell commands - component trees, props, errors, performance, screenshots - structured output for AI agents. |
| **anforderungsdokument** | `.github/skills/anforderungsdokument/SKILL.md` | Drei Entwicklungsprompts: Tiefenanalyse, Marketing/UX-Rework und Anforderungsdokument (9 Kapitel + Quellenverzeichnis als .docx). Nur Web/SaaS - keine mobilen Apps. Nur Quellen nicht älter als 1 Jahr. IDEA.md ausfüllen, Prompt 3 aufrufen, .docx generieren, zur Freigabe einreichen. |
| **handbook** | `.github/skills/handbook/SKILL.md` | Produkthandbuch-Wartungsskill. Das Handbuch wird aus `scripts/handbuch/` und der App erzeugt (`npm run handbuch`), in vier Sprachen, und im Portal unter `/{locale}/dashboard/handbuch` ausgeliefert. Nach jeder Feature-Implementierung ausführen. / Product handbook maintenance skill. The handbook is generated from `scripts/handbuch/` and the app (`npm run handbuch`), in four languages, served at `/{locale}/dashboard/handbuch`. Run after every feature implementation. |

### `next-browser` - AI-Driven Browser for Next.js

<table>
<tr>
<th width="50%">DE Was ist das?</th>
<th width="50%">EN What is it?</th>
</tr>
<tr>
<td><code>@vercel/next-browser</code> ist ein CLI-Tool, das React DevTools und das Next.js Dev-Overlay als Shell-Befehle bereitstellt. Agents können den Browser steuern, Komponenten inspizieren, Fehler lesen und Performance prüfen - ohne manuell durch DevTools zu klicken.</td>
<td><code>@vercel/next-browser</code> is a CLI tool that exposes React DevTools and the Next.js dev overlay as shell commands. Agents can drive the browser, inspect components, read errors, and check performance - without manually clicking through DevTools.</td>
</tr>
<tr>
<td><strong>Wann verwenden:</strong><br>- Nach der Implementierung zur visuellen Verifikation<br>- Debugging von Runtime-Fehlern oder Re-Render-Problemen<br>- Performance-Analyse (Core Web Vitals, Hydration)<br>- PPR-Shell-Debugging</td>
<td><strong>When to use:</strong><br>- After implementation for visual verification<br>- Debugging runtime errors or re-render issues<br>- Performance analysis (Core Web Vitals, hydration timing)<br>- PPR shell debugging</td>
</tr>
<tr>
<td><strong>Installation:</strong><br><code>npm install -g @vercel/next-browser</code><br><code>playwright install chromium</code><br>Benötigt Node >= 20</td>
<td><strong>Install:</strong><br><code>npm install -g @vercel/next-browser</code><br><code>playwright install chromium</code><br>Requires Node >= 20</td>
</tr>
<tr>
<td><strong>Wichtigste Befehle:</strong><br><code>next-browser open &lt;url&gt;</code> - Browser starten<br><code>next-browser snapshot</code> - Accessibility-Tree + klickbare Refs<br><code>next-browser errors</code> - Build- und Runtime-Fehler<br><code>next-browser perf</code> - Core Web Vitals + Hydration<br><code>next-browser screenshot</code> - Viewport als PNG<br><code>next-browser tree</code> - React-Komponentenbaum</td>
<td><strong>Key commands:</strong><br><code>next-browser open &lt;url&gt;</code> - launch browser<br><code>next-browser snapshot</code> - accessibility tree + clickable refs<br><code>next-browser errors</code> - build and runtime errors<br><code>next-browser perf</code> - Core Web Vitals + hydration timing<br><code>next-browser screenshot</code> - viewport as PNG<br><code>next-browser tree</code> - React component tree</td>
</tr>
<tr>
<td><strong>Vollständige Dokumentation:</strong> <code>.github/skills/next-browser/SKILL.md</code></td>
<td><strong>Full documentation:</strong> <code>.github/skills/next-browser/SKILL.md</code></td>
</tr>
</table>

---

### `anforderungsdokument` - WAMOCON Entwicklungsprompts

<table>
<tr>
<th width="50%">DE Was ist das?</th>
<th width="50%">EN What is it?</th>
</tr>
<tr>
<td>Der Skill stellt <strong>drei strukturierte Entwicklungsprompts</strong> bereit: (1) Tiefenanalyse und kritische Projektbewertung, (2) Marketing und UX/UI Rework, (3) Anforderungsdokument mit verbindlicher 9-Kapitel-Struktur (Zusammenfassung, Marktanalyse, Wettbewerb, Zielgruppe, Nutzen, Abhängigkeiten, Anforderungen V1, Chancen/Risiken, Umsetzungsplan + Quellenverzeichnis). <strong>Ausschließlich Web/SaaS - keine mobilen Apps. Nur Quellen nicht älter als 1 Jahr.</strong> IDEA.md ausfüllen, Prompt aus <code>@anforderungsdokument</code> kopieren, .docx generieren, zur Freigabe einreichen.</td>
<td>The skill provides <strong>three structured development prompts</strong>: (1) deep analysis and critical assessment, (2) marketing and UX/UI rework, (3) requirements document with a mandatory 9-chapter structure (summary, market analysis, competition, target audience, benefits, dependencies, requirements V1, opportunities/risks, implementation plan + references). <strong>Web/SaaS only - no mobile apps. Sources not older than 1 year only.</strong> Fill in IDEA.md, copy prompt from <code>@anforderungsdokument</code>, generate .docx, submit for approval.</td>
</tr>
</table>

---

## Empfohlener Workflow / Recommended Workflow

<table>
<tr>
<th width="50%">DE Schritt</th>
<th width="50%">EN Step</th>
</tr>
<tr>
<td><strong>Phase 0 - Anforderungen (neues Projekt):</strong><br>
1. <code>IDEA.md</code> im Projekt-Root ausfüllen<br>
2. <strong><code>@anforderungsdokument</code></strong> aufrufen: Prompt kopieren und senden<br>
3. Dokument prüfen und zur Freigabe einreichen<br>
4. Nach Freigabe: Implementierung starten</td>
<td><strong>Phase 0 - Requirements (new project):</strong><br>
1. Fill in <code>IDEA.md</code> in the project root<br>
2. Call <strong><code>@anforderungsdokument</code></strong>: copy prompt and send<br>
3. Review document and submit for approval<br>
4. After approval: start implementation</td>
</tr>
<tr>
<td><strong>Phase 1 - Planung:</strong><br>
<strong><code>@planner</code></strong> - Aufgabe analysieren und Implementierungsplan erstellen</td>
<td><strong>Phase 1 - Planning:</strong><br>
<strong><code>@planner</code></strong> - Analyse the task and create an implementation plan</td>
</tr>
<tr>
<td><strong>Phase 2 - Implementierung:</strong><br>
<strong><code>@developer</code></strong> - Plan entgegennehmen und schrittweise implementieren</td>
<td><strong>Phase 2 - Implementation:</strong><br>
<strong><code>@developer</code></strong> - Receive plan and implement step by step</td>
</tr>
<tr>
<td><strong>Phase 3 - Qualitätsprüfung:</strong><br>
<strong><code>@reviewer</code></strong> - Code prüfen, bevor ein PR erstellt wird</td>
<td><strong>Phase 3 - Quality review:</strong><br>
<strong><code>@reviewer</code></strong> - Review code before creating a PR</td>
</tr>
<tr>
<td><strong>Phase 4 - Handbuch:</strong><br>
<strong><code>@handbook</code></strong> - Produkthandbuch nach jeder Feature-Implementierung aktualisieren</td>
<td><strong>Phase 4 - Handbook:</strong><br>
<strong><code>@handbook</code></strong> - Update the product handbook after every feature implementation</td>
</tr>
</table>

---

## Eigene Agents erstellen / Creating Custom Agents

<table>
<tr>
<th width="50%">DE Anleitung</th>
<th width="50%">EN Guide</th>
</tr>
<tr>
<td>Erstelle eine <code>.agent.md</code>-Datei in <code>.github/agents/</code> mit YAML-Frontmatter. Definiere Rolle, Workflow und Regeln.</td>
<td>Create a <code>.agent.md</code> file in <code>.github/agents/</code> with YAML frontmatter. Define role, workflow, and rules.</td>
</tr>
</table>

```yaml
---
name: MyAgent
description: >
  Description of what this agent does.
---
# Agent: MyAgent

## Role
...

## Workflow
...
```

---

## Wenn ein Agent schlecht antwortet / When an Agent Responds Poorly

<table>
<tr>
<th width="50%">DE Problem & Lösung</th>
<th width="50%">EN Problem & Solution</th>
</tr>
<tr>
<td><strong>Agent ignoriert Regeln aus der Instructions-Datei</strong><br>→ Prüfe das <code>applyTo</code>-Glob-Muster - stimmt es mit der Datei überein, die du bearbeitest? Teste mit: <code>**/*.ts</code> statt <code>src/**/*.ts</code></td>
<td><strong>Agent ignores rules from an Instructions file</strong><br>→ Check the <code>applyTo</code> glob pattern - does it match the file you are editing? Try broader patterns: <code>**/*.ts</code> instead of <code>src/**/*.ts</code></td>
</tr>
<tr>
<td><strong>Agent befolgt den Workflow nicht (z. B. überspringt typecheck)</strong><br>→ Öffne die <code>.agent.md</code>-Datei und mache die Anweisung strikter. Ersetze "sollte" durch "muss". Füge am Ende eine Zusammenfassung hinzu: <em>"Bevor du antwortest, liste alle abgeschlossenen Schritte auf."</em></td>
<td><strong>Agent does not follow the workflow (e.g. skips typecheck)</strong><br>→ Open the <code>.agent.md</code> file and make the instruction stricter. Replace "should" with "must". Add a reminder at the end: <em>"Before responding, list all completed steps."</em></td>
</tr>
<tr>
<td><strong>Agent schreibt schlechten Next.js-Code (z. B. falsche API-Nutzung)</strong><br>→ Füge ein konkretes Beispiel in die <code>nextjs.instructions.md</code> ein. Copilot folgt Beispielen besser als abstrakten Regeln.</td>
<td><strong>Agent writes bad Next.js code (e.g. wrong API usage)</strong><br>→ Add a concrete code example to <code>nextjs.instructions.md</code>. Copilot follows examples better than abstract rules.</td>
</tr>
<tr>
<td><strong>Agent "vergisst" den Kontext nach langen Gesprächen</strong><br>→ Starte ein neues Chat-Fenster. Langer Kontext verdrängt Instructions. Übergib den Plan explizit: <em>"Hier ist der Plan: [Plan]. Bitte implementiere Schritt 3."</em></td>
<td><strong>Agent "forgets" context after long conversations</strong><br>→ Start a new chat window. Long context pushes out instructions. Pass the plan explicitly: <em>"Here is the plan: [plan]. Please implement step 3."</em></td>
</tr>
<tr>
<td><strong>Agent antwortet auf Englisch statt Deutsch (oder umgekehrt)</strong><br>→ Füge in <code>copilot-instructions.md</code> eine Sprachanweisung hinzu: <em>"Antworte immer auf Deutsch."</em> - oder sprich den Agent in der gewünschten Sprache an.</td>
<td><strong>Agent responds in German instead of English (or vice versa)</strong><br>→ Add a language instruction to <code>copilot-instructions.md</code>: <em>"Always respond in English."</em> - or address the agent in your preferred language.</td>
</tr>
<tr>
<td><strong>Agent überschreitet den Plan / macht ungebetene Änderungen</strong><br>→ Füge in der <code>.agent.md</code> unter "Rules" hinzu: <em>"Ändere nur Dateien, die explizit im Plan genannt sind. Keine ungebetenen Refactors."</em></td>
<td><strong>Agent exceeds the plan / makes unrequested changes</strong><br>→ Add to the <code>.agent.md</code> under "Rules": <em>"Only modify files explicitly listed in the plan. No unrequested refactoring."</em></td>
</tr>
</table>

---

## Referenzen / References

- [GitHub Copilot Customisation Docs](https://docs.github.com/en/copilot/customizing-copilot)
- [awesome-copilot](https://github.com/github/awesome-copilot) - Beispiele und Best Practices / Examples and best practices

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
