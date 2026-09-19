# Damicon architecture

Damicon is a raspberry farm traceability and operations platform for Kazakhstan. This folder documents the system and, in depth, the "Ask AI" agent.

| Artifact | What it is |
| --- | --- |
| [`damicon-agent.drawio`](damicon-agent.drawio) | Editable source, 3 pages (open in diagrams.net or the VS Code draw.io extension) |
| [`1-ecosystem.png`](1-ecosystem.png) | Level 1 and 2: people, Damicon, Supabase, external systems |
| [`2-agent-architecture.png`](2-agent-architecture.png) | Level 3: components of the agent |
| [`3-agent-turn.png`](3-agent-turn.png) | Level 4: one agent turn, end to end |
| This file | The same content as Mermaid, rendered natively by GitHub |

Structure follows the C4 model: context, containers, components, then one dynamic view.

## Level 1 and 2: ecosystem

```mermaid
flowchart LR
  subgraph People["People (7 roles, one permission model)"]
    admin["Administrator"]
    mgmt["Farm management"]
    crew["Field crew / pickers"]
    b2b["B2B customers"]
    pub["Public (QR scan)"]
    acc["Accounting, producer<br/>(no AI by role)"]
  end

  subgraph Damicon["Damicon (Next.js 16, React 19, Vercel, de en ru kk tr)"]
    web["Web app: 26 modules<br/>Field, Yard, Office, Market"]
    ai["Ask AI (docked pane)<br/>Assistant and Agent mode"]
    sa["Server Actions<br/>requirePermission, validate, RLS write, audit"]
    route["Route Handler<br/>/api/ki-assistent"]
    kern["Domain logic (pure TS)<br/>KZ payroll, VAT, deadlines, risk radar"]
  end

  subgraph Supabase["Supabase (one project per environment)"]
    pg[("Postgres + RLS")]
    auth["Auth + MFA"]
    store["Storage"]
    keys[("ki_anbieter<br/>encrypted API key")]
  end

  subgraph External
    claude["Anthropic API<br/>Claude Haiku 4.5"]
    gha["GitHub Actions"]
    vercel["Vercel"]
  end

  People --> web
  web --> ai
  web --> sa
  ai --> route
  sa --> kern
  route --> kern
  sa -->|user session, RLS| pg
  route -->|user session, RLS| pg
  web --> auth
  web --> store
  route -.->|service role, key row only| keys
  route ==>|stream| claude
```

## Level 3: the agent

```mermaid
flowchart LR
  subgraph Browser["Browser (React 19, useChat)"]
    direction TB
    pane["KiPane + KiChat<br/>streamed markdown, auto-scroll, live steps"]
    ctools["Client tools<br/>seiteLesen, klicke, fuelleFeld,<br/>scrolleZu, zeigeAuf"]
    gate{{"Safety gate<br/>blocked: sign-out, password, off-site<br/>confirm: submit, delete"}}
    tour["Agent cursor + guided tour"]
    card{{"Approval card<br/>human in the loop"}}
    pane --> ctools --> gate --> tour
    pane --> card
  end

  subgraph Route["Route Handler /api/ki-assistent"]
    direction TB
    guard{{"Guardrails<br/>session, RBAC, consent, history caps,<br/>admin-only role preview"}}
    prompt["Prompt composer<br/>4 sources, role scope, language, evidence rule"]
    st["AI SDK v7 streamText<br/>toolChoice required on agent step 0<br/>stopWhen 12 / 28 steps"]
    reg["Tool registry, only what RBAC allows<br/>L1 Domain, L2 Navigation, L3 Data,<br/>L4 Actions (needsApproval), L5 Client tools"]
    persist["Persist + audit"]
    guard --> prompt --> st --> reg
    st --> persist
  end

  subgraph Trust["Data and trust boundary"]
    direction TB
    anth["Anthropic API<br/>Claude Haiku 4.5"]
    keys[("ki_anbieter<br/>API key, AES-256-GCM")]
    pg[("Postgres + RLS<br/>user session")]
    sa["Server Actions<br/>same code as the forms"]
    hist[("ki_chat_nachrichten<br/>own rows only")]
  end

  pane -->|"1 messages + mode, role, page, language"| guard
  st <-->|"2 prompt + tools, tool calls stream back"| anth
  prompt -.->|"service role"| keys
  reg -->|"4 server tools read as the user"| pg
  reg -->|"5 approved actions"| sa --> pg
  reg -->|"6 client tools stream to the browser"| ctools
  ctools -->|"7 addToolOutput, next round automatic"| pane
  reg -.->|"ask"| card
  card -.->|"9 response with next request"| pane
  persist -->|"8"| hist
```

### Tool layers

| Layer | Tools | Runs | Adapts automatically |
| --- | --- | --- | --- |
| L1 Domain | VAT, ESUTD, compliance, cold chain, risk radar | Server, user session | Per-source permission check |
| L2 Navigation | `oeffneBereich` | Server, result opens the main window | Derived from `modules.ts`, so a new module is reachable and described |
| L3 Data | `datenmodellErkunden`, `datenLesen` | Server, user session under RLS | Schema discovered from PostgREST, so a new table is readable. Denylist for keys, audit, chat history, queues |
| L4 Actions | 7 actions (task, cooling reading, complaint, payroll, VAT check, task status, hand-over) | Server, after approval | One registry entry per action, wrapping the same Server Action as the form |
| L5 Client | `seiteLesen`, `klicke`, `fuelleFeld`, `scrolleZu`, `zeigeAuf` | Browser (`onToolCall`, `addToolOutput`) | Works on any page through a page snapshot with element refs |

### Guarantees

| Principle | How it is enforced |
| --- | --- |
| Security by absence | A tool the role may not use is never offered to the model |
| RLS is the boundary | The agent acts with the user's own session, it sees what the user sees |
| Human in the loop | Every action needs approval. In the browser, submit and delete need confirmation, sign-out and password fields are blocked |
| Evidence before claims | Success is reported only after proof. An unsent or invalid form is never reported as success |
| Self-adapting | New module: reachable. New table: readable. New action: one registry entry. `npm run test:agent` checks all of it |
| Private history | `ki_chat_nachrichten` has RLS plus an explicit profile filter, the agent cannot read it |
| Key handling | Provider key encrypted with AES-256-GCM, read only by the service-role client, never in the repository |

## Level 4: one agent turn

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant B as Browser (KiChat)
  participant R as Route /api/ki-assistent
  participant S as Supabase (RLS)
  participant C as Claude

  U->>B: question or task
  B->>R: POST messages + mode, role, page, language
  R->>R: guardrails, prompt, tool set for this role and mode
  R->>C: prompt + tools (Agent: step 0 must call a tool)
  loop until the answer is backed by evidence (max 12 steps, Agent 28)
    C-->>R: tool call
    alt A. data or navigation (server tool)
      R->>S: query as the user
      S-->>R: rows this role may see
      R-->>B: step + link, main window opens the page
    else B. operate the page (client tool)
      R-->>B: tool call streams to the browser
      B->>B: read, click, fill, cursor moves, safety gate
      opt submit or delete
        B->>U: confirm first
        U-->>B: yes / no
      end
      B->>R: addToolOutput, next round starts
    else C. act (server tool with approval)
      R-->>B: approval requested, nothing runs
      B->>U: approval card
      U-->>B: confirm or decline
      B->>R: approval response with next request
      R->>S: Server Action (RBAC, validation, RLS write, audit)
    end
    R->>C: tool result
  end
  C-->>R: final answer, sources labelled (data or general knowledge)
  R->>S: save reply for this user only, one audit event
  R-->>B: streamed word by word
  B-->>U: answer, clickable steps, the page shows the change
```

## Regenerating the draw.io file

The `.drawio` is plain mxGraph XML and can be edited by hand in diagrams.net. Keep the PNGs and the Mermaid blocks in sync when you change it.

Colour legend: blue is browser, green is server, purple is AI provider, yellow is database and secrets, red is a safety or trust boundary, grey is external.
