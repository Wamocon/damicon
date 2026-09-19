# Damicon - Features & Usage Overview

Stand: 18.09.2026. Written to be read top-to-bottom without prior context.

## 1. The problem it solves

A raspberry farm near Almaty currently runs on paper and trust: a picker hands over a crate, someone writes down a weight, someone else hopes the crate reached the cooler in time, and a customer has no way to verify any of it. Small mistakes (a forgotten cold-chain check, picking in a just-sprayed block, an edited harvest number) are invisible until they cause a quality or compliance problem.

**Damicon replaces the paper trail with a database that enforces the rules itself.** It follows one raspberry batch from the moment it's picked, through cooling, storage, and delivery, to the invoice - and lets a customer scan a code on the crate to see that whole journey. Nothing about correctness depends on a person remembering a step; the database rejects the invalid action outright (e.g. you cannot even create a picking task in a block that's still under spray-withdrawal lock).

## 2. Who uses it (7 roles)

Defined in [src/lib/rbac.ts](src/lib/rbac.ts). Each role sees a different, permission-scoped slice of the same app.

| Role | Who they are | What they can do |
|---|---|---|
| `admin` | System owner | Everything: user/role management, all zones, provider keys for the AI assistant |
| `betriebsleitung` | Farm/operations manager | Field, yard, office, market - plans rotations, approves things, reads the cockpit KPIs |
| `buchhaltung` | Accountant/finance | Finance ledger, payroll, invoices, cost centers - no field operations |
| `brigade` | Field team lead | Creates/accepts picking tasks for their own brigade, logs treatments, cannot touch other brigades' work |
| `picker` | Individual field worker (new role, no 1CATI equivalent) | Scans their own ID badge at handoff, sees their own performance/training progress - no write access to booked quantities |
| `erzeuger` | Neighbouring/partner farm ("Nachbarbetrieb"), aggregation source | Sells produce into the aggregator, sees their own deliveries |
| `kunde` | B2B customer | Logs in via an invited account, sees price lists, places pre-orders, tracks deliveries and invoices, files complaints |

Anyone without an account (e.g. an end consumer) can still use the **public traceability page** by scanning a crate code - no login required.

## 3. How the app is structured (4 zones)

The dashboard ([src/app/[locale]/dashboard](src/app/%5Blocale%5D/dashboard)) is organized into four zones that mirror how the business actually thinks about the operation, each a tab in navigation:

- 🌱 **Feld** (Field) - everything before the harvest leaves the row
- ❄️ **Hof** (Yard) - cooling, packaging, transport out
- 🗂️ **Büro** (Office) - people, money, compliance, master data
- 🏪 **Markt** (Market) - customers, pricing, sales channels

Every module lives at `/dashboard/<zone>/<module-slug>` and is defined once in [src/lib/modules.ts](src/lib/modules.ts), which also honestly tags each module's real maturity (fully wired to the database vs. still a placeholder) - see Section 6.

## 4. Feature list by zone

### 🌱 Feld (Field)

| Module | What it actually does |
|---|---|
| **Standort** (Location) | Manage the 4-level field hierarchy: Betrieb → Plantage → Feldparzelle → Reihengruppe → Reihenblock (farm → plantation → field plot → row group → row block) |
| **Reihenblöcke** (Row blocks) | Each row block has a live status: planted, ripe, resting, pruning, or *spray-withdrawal locked* |
| **Pflückaufgaben** (Picking tasks) | A brigade accepts a task for a row block, works it, submits weight + mandatory photo evidence (crate photo, row-block photo); status flow: open → accepted → in progress → evidence review → closed |
| **Pflanzenschutz** (Plant protection) | Log spray treatments per row block; a treatment automatically locks the block until the withdrawal period ends |
| **Rotationsplan** (Rotation plan) | Auto-generates the picking rotation schedule per row block (2–3 day cycles); auto-locks/unlocks on treatment/clearance; auto-completes when a picking task is submitted |
| **Wetter** (Weather) | Live weather + a temperature-sum heuristic per plantation via Open-Meteo (shows the number, doesn't yet forecast/decide anything) |

### ❄️ Hof (Yard)

| Module | What it actually does |
|---|---|
| **Kühlkette** (Cold chain) | Farm-wide live view of every open batch's cold-chain clock - the 60-minute pick-to-precool rule is judged continuously (not just retroactively), status: ok / warning / violation |
| **Logistik** (Logistics) | Route planning with real routing (OSRM/Nominatim) for delivery rounds, plus a digital handover receipt at drop-off |
| **QR-Steigen** (QR crates) | Generates real QR labels for crates, picker ID badges, and a printable poster - deliberately read/print-only (crates are created by the picking-task chain, not here) |
| **Lieferschein-ЭСФ** (e-invoicing outbox) | *Placeholder* - tables exist for Kazakh ЭСФ e-invoicing, nothing reads/writes them yet |

### 🗂️ Büro (Office)

| Module | What it actually does |
|---|---|
| **Rollen** (Roles) | Invite a B2B customer by email (creates a real invitation row, account is created on redemption); rights matrix is a live read-out of the actual RBAC config |
| **Finanzen** (Finance) | Cost centers per row-block, ledger postings, contribution margin per cost center / per kilogram / per batch (computed by DB views) |
| **Personal** (HR/Staffing) | Shift plans per brigade, demand calculation, reserve worker list |
| **Lohn** (Payroll) | Wage calculation with a mandatory quality factor; approval requires a second, separate approval to reverse (no accidental un-approving) |
| **Dokumente** (Documents) | Compliance documents (spray protocols, ЕСУТД labor proof, contracts, certificates) with status (valid / under review / expired) |
| **Compliance** | Consent management, audit log, MFA status |
| **Integrationen** (Integrations) | *Placeholder* |
| **Fördermittel** (Funding) | Track a funding dossier's status/deadline and attach proof documents; actual application forms for gosagro.kz/qoldau.kz are out of scope |
| **Stammdaten** (Master data) | Legal form + tax ID (ИИН/БИН) for the farm, suppliers, and customers, in one place |

### 🏪 Markt (Market)

| Module | What it actually does |
|---|---|
| **Sortenkatalog** (Variety catalog) | Variety master data (name, type, harvest window, punnet size) + per-customer/season quotas + an aggregated availability view |
| **B2B-Portal** | Customer-facing "my deliveries" with real delivery status, price list browsing, and pre-order placement (office confirms manually) |
| **Reklamationen** (Complaints) | Customer opens/tracks a complaint against a specific delivery; traced back to the originating batch |
| **Preislisten** (Price lists) | Tiered pricing per customer group |
| **Aggregator** | CSV import of purchased produce from neighbouring farms, written atomically into batches |
| **Schulungen** (Training) | Multilingual onboarding checklist with progress tracking, replacing a paper induction sheet |
| **Kanäle** (Channels) | Locally-relevant contact/payment channels (WhatsApp, Kaspi QR, etc.), publicly shown in the site footer - display only, no live API |

## 5. The core end-to-end flow: "from field to invoice"

This is the story the whole system is built to tell, and it's the one a customer sees when scanning a crate:

1. A **brigade** accepts a **picking task** for a row block (blocked automatically if that block is still under spray-withdrawal).
2. Pickers work the task; a **picker scans their own ID badge** at handoff instead of being picked from a dropdown - quantity, row block, and time are already fixed by the task.
3. The task closes with **mandatory photo evidence** and a measured weight; a **crate (Steige)** is generated with an atomic, unique number and its own QR label.
4. The crate's temperature is tracked from the moment of picking; the **60-minute rule** judges every reading live - a violation is flagged automatically, farm-wide, without anyone checking.
5. Crates aggregate into a **batch (Charge)**, which moves through cooling → storage → a delivery route (with digital handover receipt) → invoice.
6. Anyone holding the crate/delivery code can open **`/herkunft/[code]`** without logging in and see: where it was grown, when it was picked, and whether the cold chain held - never the picker's identity, quantity, or price (enforced by a database function, not by the page hiding fields).

## 6. Cross-cutting features

- **Offline-first field capture** - picking tasks and evidence work without connectivity ([src/lib/offline](src/lib/offline)); an IndexedDB queue syncs when back online, with device-timestamp vs. server-timestamp kept separate so a delayed sync can't be used to backdate a cold-chain reading.
- **Authentication + MFA** - Supabase Auth login, invitation-based account creation for customers, mandatory MFA enrollment/verification ([src/components/auth](src/components/auth)).
- **RBAC enforced in the database** - every permission check exists twice: once in the UI (so the right buttons even appear) and once in Postgres Row-Level Security, which is the one that actually matters.
- **"Ask AI" side pane (Assistant + Agent)** - a raspberry-branded chat docked beside the main window, opened from the top bar ([src/components/ki](src/components/ki), route: [src/app/api/ki-assistent/route.ts](src/app/api/ki-assistent/route.ts)). Vercel AI SDK, cheapest Claude model only. The gear button in the pane opens the settings: a toggle for Agent mode (off by default, with a hover explanation of the difference) and, for admins, the provider setup.
  - **Assistant mode** - answers with live steps; every source is a click that opens the matching view and highlights the section.
  - **Agent mode** - takes over the main window: it navigates, scrolls and highlights while it answers (a guided tour), with a stop button to take control back.
  - **Scoped to the user's role** - the agent only receives tools its role may use, runs every query under the user's own session (RLS), and an admin previewing another role gets that role's scope.
  - **Adapts to the app by itself** - it can open any module in [src/lib/modules.ts](src/lib/modules.ts) and read any table the database exposes (schema discovered at runtime), so new modules/tables need no agent code. `npm run test:agent` fails if a module or tool lacks its multilingual labels.
  - **Can act, with your approval** - creating a picking task, logging a cooling measurement, filing a complaint, calculating payroll, running the VAT check, handing over to a person. Each goes through the same server action as the form and waits for an explicit Confirm. New actions are one entry in [src/lib/ai/aktionen.ts](src/lib/ai/aktionen.ts).
- **Multilingual UI** - German, English, Russian, Kazakh, Turkish via next-intl; every user-facing string is translated, not hardcoded.
- **Light/dark theme** across the whole app.
- **Public marketing site** - homepage, legal pages (Impressum, Datenschutz), and the public traceability lookup, all reachable without an account.

## 7. Honesty about maturity (as of 18.09.2026)

The module registry itself ([src/lib/modules.ts](src/lib/modules.ts)) tags every module's real state, not just a status badge:

- **24 of 26 modules** are genuinely database-backed with real writes under RLS.
- **2 remain placeholders**: ЭСФ e-invoicing outbox, and general Integrationen.
- Two gaps are *deliberate, not bugs*: QR-Steigen is read/print-only by design, and the AI assistant needs an admin-supplied provider key to function.

## 8. Known limitations (not yet fixed)

- Wastage (`ausschuss_kg`) not yet reaching the batch record in all paths.
- Customers can currently create orders/complaints with an end-status already set (left as-is by team decision).
- REST API read access is broader than what the UI exposes for some tables.
- A handful of lower-severity issues (backdatable timestamps via direct API, payroll reset without second approval, brigade write scope, offline-sync conflict reporting) have fixes ready but not yet merged.
