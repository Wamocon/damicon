# Copilot Global Instructions

You are working on a **Next.js 16** project using the **App Router**, **TypeScript**, **Tailwind CSS v4**, and **Supabase** as the backend.

---

## Tech Stack

- **Framework:** Next.js 16.x (App Router, `src/app/`)
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS v4 (utility-first)
- **Backend/DB:** Supabase (PostgreSQL, Auth, Storage, RLS)
- **Deployment:** Vercel (via GitHub Actions CI/CD)
- **Package Manager:** npm

---

## Critical Rules

1. **Read the docs first.** Next.js 16 has breaking changes. Always check `node_modules/next/dist/docs/` before implementing any Next.js API. Heed deprecation notices.
2. **Server Components by default.** Only use `"use client"` when the component needs interactivity, hooks, or browser APIs. Keep Client Components at the leaves of the component tree.
3. **Async APIs.** In Next.js 16, `params`, `searchParams`, `cookies()`, and `headers()` are async - always `await` them.
4. **No local test data.** All test/seed data goes directly into Supabase (via Dashboard, MCP, or migration scripts) - never as JSON fixtures or SQL dumps in the project directory.
5. **Environment variables.** Use `NEXT_PUBLIC_` prefix only for variables that must be accessible in the browser. Server-only secrets (e.g. `SUPABASE_SERVICE_ROLE_KEY`) must never be prefixed.
6. **Schema awareness.** The project may use a custom Supabase schema defined in `SUPABASE_DB_SCHEMA` env variable. Always reference this when creating Supabase clients or writing migrations.
7. **Supabase Docker creation.** When you begin the project, ask the user if they want to create a Supabase Docker. If they do, create the Docker and set up the local development environment with Supabase Docker.
8. **Correct usage of dashes.** Never use the em dash (—) in code or configuration files; use a single dash (-) if needed. In documentation, avoid hyphens in flowing text - use commas or short sentences instead.
9. **Vercel-Ready app** when deployed. The app must run without errors on Vercel. Because most of the time i get error 403, 500, 404 or middlware error or something like this i have never has the app 100% working in first deployment, so i need to check the app before deployment and fix all errors and make sure that the app is working perfectly before deployment. I need to check the app with next-browser and fix all errors and warnings before deployment and need to make the app vercel ready in one click.
10. **`src/proxy.ts` is the correct and ONLY valid proxy/middleware filename in Next.js 16+.** `middleware.ts` is deprecated since v16.0.0 (official docs: https://nextjs.org/docs/messages/middleware-to-proxy). Using `middleware.ts` emits a deprecation warning on every request. Use `src/proxy.ts` with `export function proxy()` (not `export function middleware()`). Run `npx @next/codemod@canary middleware-to-proxy .` to migrate existing projects. This is non-negotiable.
11. **Supabase env vars must NEVER fall back to empty string.** `?? ''` passes the nullish check but causes `createBrowserClient('', '')` to throw `"supabaseUrl is required"` at module load time, crashing all Vercel SSR routes. Use `|| 'https://placeholder.supabase.co'` for browser clients, or throw a descriptive error for server clients. Verify Vercel project env vars are set BEFORE the first deploy.


## Additional App Creation Rules

When creating a new app or major app surface, always follow these rules:

1. **Mandatory multilingual support (EN + DE) using Next.js App Router and next-intl.**
  - Implement next-intl specifically configured for the Next.js App Router architecture.
	- Always use the `useTranslations` hook for all user-facing text. Never hardcode strings in components.
	- Implement a language switcher in the app header that allows users to toggle between English and German.
	- Store and  maintain translations in dedicated JSON files (e.g. `en.json`, `de.json`) and configure next-intl routing accordingly.
	- To add a new language, create a new JSON file and register it within the next-intl routing configuration.
2. **Mandatory light and dark themes.**
	- Every app must support both light mode and dark mode.
	- Ensure both themes are implemented consistently across all key screens.
3. **Branding and homepage quality.**
	- Create a unique, meaningful, and professional app logo.
	- Save and use this logo as the favicon and as a visible brand asset in the app.
	- Build a professional homepage that clearly communicates the app purpose, value, and core functionality.
4. **Legal content in footer.**
	- Use legal documents from the `legal-docs` folder.
	- Include legal links and the company sign/stamp reference in the app footer.

---

## Workflow Orchestration

### First: Ask the User About Their Database Setup

At the **start of every new project or major feature**, always ask:

> "How do you want to work with Supabase for this project?"
> - **(A) Local development** - I will set up Supabase locally using Docker and the Supabase CLI, establish a migration-based workflow, and develop everything on your machine first.
> - **(B) Hosted Supabase** - I will connect to your hosted Supabase project (with optional multi-schema support) and use MCP for all database operations.

- If the user chooses **(A)**: follow the `supabase-workflow.instructions.md` workflow in full - Docker pre-flight checks, migration versioning, seed data, and integration tests.
- If the user chooses **(B)**: follow the `supabase.instructions.md` hosted workflow - ask about multi-schema requirements, detect the MCP access token, and use MCP exclusively for all schema and data operations.
- If the context makes the choice obvious (e.g. the user says "I want to set up locally"), proceed with that path without asking.
- **Damicon specifically has already answered this: hosted (B).** `.env.local` deliberately points at the hosted project; `supabase-workflow.instructions.md` documents this choice and why local Docker is not part of the dev loop here. Do not re-ask or switch back to local without the user explicitly requesting it.

### Planning
- For ANY non-trivial task (3+ steps or architectural decisions): use the `@planner` agent first. Do not start coding without a plan.
- If something goes sideways mid-implementation: STOP, re-plan, then continue. Do not keep pushing broken code.
- Write detailed specs upfront to reduce ambiguity. Vague requirements produce vague code.

### Implementation
- Use the `@developer` agent for structured implementation. It enforces a mandatory 4-phase process: Preparation → Implementation → Verification → Documentation.
- Keep changes minimal and focused. Only touch what is necessary for the task.
- After each logical step: check for TypeScript errors before moving on. Fix immediately, do not accumulate errors.
- Read files before editing them. Never guess at structure - explore first.
- Avoid creating files longer than 300 lines without a clear need. If a file grows too large, refactor into smaller components or modules.

### Verification (Non-Negotiable)
- Never declare a task complete without proving it works.
- Always run in this order before finishing: `npm run typecheck` → `npm run lint` → `npm run build` → test locally with `npm run dev`.
- Ask yourself: "Would a senior engineer approve this?" If not, fix it first.
- Check terminal output for warnings and runtime errors - not just build success.
- **Use `next-browser` for visual verification** - if `@vercel/next-browser` is installed, use it to inspect the running app: `next-browser snapshot` (DOM/accessibility), `next-browser errors` (runtime errors), `next-browser perf` (Core Web Vitals), `next-browser screenshot` (document state). See `.github/skills/next-browser/SKILL.md` for full usage.

### Pre-Deployment Checklist (run before EVERY deploy - these are the #1 causes of HTTP 500 on Vercel)

Run through every item before declaring the app ready for deployment:

- [ ] **proxy.ts exists at `src/proxy.ts`** - NOT `src/middleware.ts` (deprecated). Confirm with `Test-Path src/proxy.ts` (Windows) or `ls src/proxy.ts`. If `middleware.ts` exists, run `npx @next/codemod@canary middleware-to-proxy .` to migrate.
- [ ] **Proxy manifest is populated** - After `npm run build`, check `.next/server/middleware-manifest.json`. It must contain a non-empty `sortedMiddleware` array (e.g. `["/"]`), NOT an empty array. An empty array means the file name or export is wrong.
- [ ] **No `?? ''` in Supabase client files** - Search with `grep -r "?? ''" src/lib/supabase` or `grep_search`. Replace with fail-fast throws (server) or `|| 'https://placeholder.supabase.co'` (browser).
- [ ] **Vercel env vars are set** - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` must exist in Vercel project Settings -> Environment Variables for Production BEFORE the deploy runs.
- [ ] **`npm run build` succeeds locally** with actual env vars from `.env.local` (not placeholders). If it fails locally it will fail on Vercel.
- [ ] **No hardcoded `localhost` URLs** in production code paths.
- [ ] **Handbook regenerated** (`npm run handbuch`) and the generated files committed.

### Code Review
- Use the `@reviewer` agent before opening a PR. It runs a structured checklist covering code quality, Next.js 16 compliance, Supabase security, styling, and build checks.
- For bugs: diagnose from logs/errors, resolve the root cause. No temporary patches.

### Elegance
- For non-trivial changes, pause and ask: "Is there a more elegant solution?"
- If a fix feels hacky: implement the clean solution instead.
- Skip this for simple, obvious fixes - do not over-engineer.

---

## Mandatory: Check Instructions & Skills on Every Request

Before responding to **every** user request, perform the following steps:

1. **Check applicable instruction files** - Identify which `.instructions.md` files in `.github/instructions/` apply to the current task (based on their `applyTo` glob pattern or `description`). Read and apply their rules before writing any code or plan.
2. **Check available skills** - Review `.github/skills/` for any skill relevant to the task (e.g. `next-browser` for visual verification). Load and apply the skill if applicable.
3. **Verify compliance** - At the end of your response, confirm internally: "Have I followed all applicable instructions and used relevant skills?" If not, correct before responding.

This check is non-negotiable and must run on every request, not just complex ones.

---

## Product Handbook (Non-Negotiable)

The project ships a product handbook in four languages, served to signed-in users at
`/{locale}/dashboard/handbuch`.
**This handbook must always reflect the current state of the application.**

It is **generated**, never hand-written: `scripts/handbuch/` reads the app (modules, zones,
roles, permissions) plus the hand-written texts in `texte-*.ts` and writes
`docs/manual/index*.html`. Editing the HTML directly is always wrong - the next
`npm run handbuch` overwrites it.

### Handbook maintenance rules

1. **Always check freshness first.** Run `npm run handbuch` and look at `git status docs/manual`.
   A clean tree means the app-driven half is current; only the hand-written texts can be stale.
2. **Update after every feature.** After implementing any user-facing feature, route, API, schema change, or branding update,
   update the handbook. This is not optional.
3. **All four languages or none.** Edit `texte-de.ts` first, then `texte-en.ts`, `texte-kk.ts`,
   `texte-ru.ts`. A half-translated handbook is worse than an untranslated one, because nothing
   signals which half is missing. `npm run typecheck` catches a forgotten field.
4. **Brand consistency.** The handbook stylesheet mirrors the tokens in `src/app/globals.css` and
   uses the real Damicon logo. If the palette changes, pull it across in `scripts/handbuch/stil.ts`.
5. **Version and date.** The handbook version must match `package.json`. The date must always be the current month and year.
6. **Search and PDF export.** The handbook has a full-text search and a PDF export that always
   contains the COMPLETE handbook in the selected language - an active search filter is cleared
   before printing, and the print stylesheet restores hidden chapters as a second net. Neither
   may be removed or weakened.

7. **Confidential.** The handbook stays behind the sign-in check at
   `/{locale}/dashboard/handbuch`. It must not be moved to `public/`.

### When to run the @handbook agent

- After `@developer` completes any feature implementation
- After applying Supabase migrations
- After any branding/logo/color change
- At the start of any session if the handbook has not been updated recently

### Handbook file locations

```
scripts/handbuch/texte-de.ts      <- hand-written texts, leading version (EDIT THIS)
scripts/handbuch/texte-{en,kk,ru}.ts  <- the other three languages (EDIT THESE TOO)
scripts/handbuch/erzeugen.ts      <- generator: npm run handbuch
docs/manual/index*.html           <- GENERATED output (never edit by hand)
src/app/[locale]/dashboard/handbuch/route.ts  <- serves it, behind sign-in
.github/skills/handbook/SKILL.md  <- skill definition (read before editing)
.github/agents/handbook.agent.md  <- agent definition
```

---

## Core Principles

- **Simplicity First.** Make every change as simple as possible. Impact minimal code.
- **No Laziness.** Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact.** Only modify what is necessary. Avoid side effects and unrelated changes.
- **No Over-Engineering.** Do not add features, helpers, or abstractions beyond what was requested.
- **Ask When Unclear.** If requirements are ambiguous, ask rather than guess.

---

## Code Style

- Use `import type { ... }` for type-only imports.
- Prefer named exports over default exports for components (except Next.js route files like `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx` which require default exports).
- Use `@/` import alias for project-internal imports.
- Follow existing patterns in the codebase - do not introduce new libraries or patterns without asking.

---

## Commit Message - End of Every Response

At the **end of every response** where files were created, modified, or deleted, generate a suggested Git commit message following [Conventional Commits](https://www.conventionalcommits.org/) format. Present it as:

```
Suggested commit:
<type>(<scope>): <short imperative summary>

<optional body: what changed and why, max 3 bullet points>
```

**Types:** `feat`, `fix`, `chore`, `refactor`, `docs`, `style`, `test`, `perf`, `ci`

**Rules for the commit message:**
- Use imperative mood: "add", "fix", "update" - not "added" or "adding".
- Scope is the module or area affected (e.g. `auth`, `db`, `ui`, `migrations`, `config`).
- Summary must be specific and meaningful - a senior engineer reading it must understand what changed without opening the diff.
- Only generate a commit message when files actually changed. Skip for pure Q&A responses.
