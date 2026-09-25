import type { HandbuchTexte } from "./typen";

// Englische Fassung. Uebersetzt aus texte-de.ts; Modul-, Zonen- und
// Rollentexte kommen aus src/messages/en.json.

export const en: HandbuchTexte = {
  sprachname: "English",
  htmlLang: "en",

  kopf: {
    untertitel: "Product handbook",
    suchePlatzhalter: "Search the handbook …",
    sucheBeschriftung: "Search the handbook",
    sucheZuruecksetzen: "Clear search (Esc)",
    pdfKnopf: "Save as PDF",
    pdfHinweis: "Save the complete handbook as PDF (Print → Save as PDF)",
    portalKnopf: "Open portal",
    portalHinweis: "Back to the portal overview",
    themaKnopf: "Switch colour scheme",
    spracheBeschriftung: "Language",
    trefferKeine: "0 matches",
    trefferAbZwei: "2 characters min.",
    treffer: "matches",
    ohneFundstelle:
      "Nothing found for {begriff}. Regardless of this, the PDF export always contains the complete handbook.",
    inhalt: "Contents",
  },

  deckblatt: {
    dokumentart: "Product handbook · WAMOCON GmbH",
    titel: "Damicon",
    untertitel: "Farm management for a raspberry operation near Almaty",
    version: "Version",
    versionWert: "0.1.0",
    status: "Status",
    statusWert: "Prototype",
    sprachenLabel: "Languages",
    sprachenWert: "DE · EN · KK · RU",
    datum: "As of",
    datumWert: "23 September 2026",
  },

  kapitel: {
    uebersicht: "Overview",
    bedienung: "Using the portal",
    bereiche: "Areas and modules",
    anleitungen: "How-to guides",
    referenz: "Reference",
    technik: "Technology",
    recht: "Law and data residency",
    glossar: "Glossary",
  },

  uebersicht: {
    einleitung:
      "Damicon runs a raspberry plantation from the row to the invoice: what is ripe where, who picked it, how fast it was cooled, what it cost and what it earned. The portal is divided into four areas that follow the path of the fruit — Field, Yard, Office, Market.",
    kernsatzTitel: "What this is about",
    kernsatz:
      "With raspberries, market leadership does not come from volume but from proof. Cooling curve, batch, block of origin, picker and treatment record have to be complete for every delivery. That is exactly what Damicon records.",
    hinweisTitel: "State of this release",
    hinweis:
      "The portal is a prototype. Its main functions work against a real database: sign-in, role permissions, site management, row block locking, picking tasks with photo evidence, document storage. Two modules are still a menu entry without a view. The figures show baseline values until the first fully measured season is available. Without a database connection the portal runs in demo mode on sample data.",
    zonenTitel: "The four areas",
    zonenEinleitung:
      "Each area has its own landing page showing its modules as tiles. Which of them are visible depends on the role of the account signed in.",
    rollenTitel: "Roles",
    rollenEinleitung:
      "Eight roles. The role of the account signed in decides which modules appear in the navigation and what can be changed — and that is checked not only in the interface but again in the database.",
    spalteRolle: "Role",
    spalteBeschreibung: "Responsibility and permissions",
    bedienhinweisTitel: "Using this handbook",
    bedienhinweisSuche:
      "Search: the field at the top right, or jump there with / or Ctrl+K. The search hides chapters without a match and highlights the hits; Enter moves to the next one, Shift+Enter to the previous one, Esc clears it. Umlauts do not matter — “Kuhlkette” finds “Kühlkette”.",
    bedienhinweisPdf:
      "Save as PDF: the button at the top right, then choose “Save as PDF” in the print dialogue. The export always contains the complete handbook in the language currently selected — an active search filter is cleared beforehand, so you never get an excerpt that does not show what is missing. The same applies to Ctrl+P.",
  },

  bedienung: {
    einleitung:
      "This chapter describes the interface: how to sign in, how the navigation is built and where the settings are. What the individual modules do is covered in the next chapter.",
    anmeldungTitel: "Signing in",
    anmeldung: {
      id: "anmelden",
      titel: "Signing in",
      schritte: [
        "Open the portal. Without a language code in the address you are taken to the German version.",
        "On the start page choose “Open portal”, or go to the sign-in page directly.",
        "Enter your email address and password.",
        "If a second factor is set up for the account, the six-digit code is requested next. Jumping straight to the overview does not help — the check sits in front of the page, not inside it.",
        "After signing in you land on the overview with the four areas and the farm's key figures.",
      ],
    },
    zugaengeTitel: "Accounts for trying it out",
    zugaengeText:
      "For the prototype there is one account per role: admin@damicon.demo, ceo@damicon.demo, leitung@damicon.demo, buchhaltung@damicon.demo, brigade@damicon.demo, pfluecker@damicon.demo, erzeuger@damicon.demo, kunde@damicon.demo.",
    zugaengePasswort:
      "All eight accounts share the same password: DamiconDemo2026! — If the portal runs without a database, sign-in is skipped entirely and it works on sample data. Every view states at the top right which source it is reading from.",
    aufbauTitel: "How the interface is built",
    aufbauEinleitung:
      "On a desktop the sidebar carries the navigation, on a phone the bar along the bottom. Both lead to the same pages.",
    teile: [
      {
        titel: "Sidebar",
        text: "On the left edge, from tablet width upwards. The overview at the top, below it the four areas as collapsible groups with their modules. An area in which the role may not see a single module does not appear at all. The sidebar can be collapsed to a narrow icon column; the toggle for that sits in the header. At the bottom are the handbook, the person signed in, the security page and sign-out.",
      },
      {
        titel: "Header",
        text: "Carries the breadcrumb of the open page, the toggle for the sidebar width, the language selector, the colour scheme and — for administrators — the “View as” field.",
      },
      {
        titel: "Bottom bar (phone)",
        text: "Below tablet width it replaces the sidebar. The menu works in two levels: first the overview and the four areas, then, after a tap on an area, its modules, with the area itself as the first entry. The arrow at the top left leads back to the list of areas. A tree with all 27 entries at once is the right shape for a standing column, not for a surface you open with your thumb; one level at a time is. The bar stays operable while a sheet is open, so a tap on the account button takes you straight on to language, colour scheme, handbook, security and sign-out.",
      },
      {
        titel: "Overview",
        text: "The landing page after signing in. A greeting, then the four areas with their key figures. Management and administrators additionally see “Today's essentials”: maturity, one sentence from the latest audit report, the changes since the previous one, and five tiles for audit, tax, legal, risk and finance.",
      },
      {
        titel: "Area page",
        text: "Each area has its own page showing its modules as tiles with a short description. It is the route to the modules on a phone, where there is no sidebar.",
      },
      {
        titel: "Module page",
        text: "Shows the module's view: tables, forms, figures. The top right states whether the data comes from the database or is sample data. Modules that have not been built yet state in one sentence what they will do.",
      },
    ],
    spracheTitel: "Switching language",
    spracheText:
      "The language selector sits in the header, and on a phone in the account sheet. Four languages are available: German, English, Kazakh and Russian. German and English are translated in full, Kazakh and Russian largely so for the prototype; where a translation is missing, the German text appears. The language is part of the address, so a given language version can be linked to. This handbook follows the language the portal is currently running in and has its own selector at the top right.",
    themaTitel: "Colour scheme",
    themaText:
      "Light and dark, switched in the header. The choice is stored in the browser and applies to this handbook as well. Without an explicit choice the portal follows the operating system setting.",
    rolleTitel: "Changing role",
    rolleText:
      "The effective role is that of the account signed in; it is shown at the bottom of the sidebar. To see a different role, sign in with the matching account. Administrators additionally have the “View as” field: it changes only what appears on screen. Write permissions continue to follow the profile — and they do so in the database, where switching something in the interface has no effect.",
    offlineTitel: "Working without a connection",
    offlineText:
      "Out in the field the network is unreliable. Reports on picking tasks, crates, working hours and cooling measurements therefore go into a queue on the device and are sent later on their own. They pass through the same checks as an entry made at a desk — a report from the queue carries no more permissions than the person who created it.",
  },

  bereiche: {
    einleitung:
      "26 modules across four areas. This chapter describes each one: what it is for, who may see it and who may work in it, and what is still open. The permission details come from the same matrix the portal itself follows in operation.",
    spalteModul: "Module",
    spalteStand: "State",
    spalteRollen: "Visible to",
    standAngebunden: "ready for use",
    standEntwicklung: "in development",
    standAngebundenErklaerung:
      "Works against the database: reads and writes real data, every write is bound to the role and recorded in the audit log.",
    standEntwicklungErklaerung:
      "A visible menu entry without its own view. The module page states in one sentence what the module will do.",
    modulZweck: "Purpose",
    modulKurz: "In short",
    modulOffen: "Still open",
    modulPfad: "Address",
    modulRollen: "Visible to",
    modulRollenLeer: "No role has access.",
    modulSchreiben: "May change",
    modulSchreibenLeer: "Display only — nobody changes anything here.",
  },

  anleitungen: {
    einleitung:
      "Five procedures that cover the core of the operation. The paths refer to the sidebar.",
    liste: [
      {
        id: "wartezeit",
        titel: "Applying and lifting a pre-harvest interval lock",
        einleitung:
          "After a crop protection treatment a row block must not be harvested until the pre-harvest interval has elapsed. The portal applies this lock itself.",
        schritte: [
          "Sign in as farm management and open Field → Row blocks and status.",
          "At the bottom, “Record treatment”: choose the row block and the product. The interval comes from the product catalogue, it is not typed in by hand.",
          "The block is immediately set to locked. The “Lock” column shows product, treatment date, interval, release date and the days remaining.",
          "A status change is now impossible. The rule lives in the database and applies even if someone works around the interface.",
          "Once the interval has elapsed, a “Release” button appears. It lifts the lock and signs off the treatment at the same time.",
          "Clicking the status tiles filters the table; the filtered state can be passed on as a link.",
        ],
      },
      {
        id: "pflueckaufgabe",
        titel: "A picking task with photo evidence",
        schritte: [
          "Open Field → Picking tasks with photo evidence.",
          "Create a new picking task at the bottom. Locked blocks are not offered for selection and are rejected by the database as well.",
          "On the left, pick a task per brigade and row block. Progress is actual against target quantity.",
          "As the brigade, accept the task, start picking and upload photo evidence on the right. On a phone this opens the camera directly. The file goes into a private storage area and is only ever shown through short-lived signed links.",
          "“Report quantity” moves the task to evidence review.",
          "Farm management or administrators review the evidence, enter the quality factor and release the task.",
        ],
      },
      {
        id: "nachweiskette",
        titel: "Showing the chain of evidence for a delivery",
        einleitung:
          "This is the procedure that matters to the customer: from the punnet back to the person who filled it.",
        schritte: [
          "Open Field → Picking tasks with photo evidence and select a task on the left.",
          "On the right, under “Chain of evidence”, the batch is shown: cooling curve with the 60-minute limit, quantity and rejects, the crates with the person who filled them, and the residue record.",
          "“Record crate” assigns a crate to a person. Only then does the chain reach from the customer all the way to the picker.",
          "“Report working time” supplies the denominator for picking performance in kilograms per hour.",
          "“Record cooling measurement”: the database derives minutes and verdict from the time of picking. Above 60 minutes the interface reports a breach and the goods have to be downgraded.",
          "On the overview the figures then show the changed actual value — calculated, not entered.",
        ],
      },
      {
        id: "dokument",
        titel: "Filing a document",
        schritte: [
          "As an office role, open Office → Document management.",
          "Under “File document” enter title, category, reference and date. The file itself — PDF or image — is optional.",
          "Stored files open from the “File” column through a signed link. There is no public direct access.",
        ],
      },
      {
        id: "zugang",
        titel: "Setting up access: invitation and second factor",
        einleitung:
          "New customer accounts are created by invitation. Each person sets up their own second factor.",
        schritte: [
          "As an administrator or farm management, open Office → Roles and permissions.",
          "Under “Invitations” enter the email address and role. This sits here because it is the same matter as the permission matrix above it — only its writing side.",
          "The invited person opens the invitation link and sets their own password. That page is reachable without signing in: whoever lands there does not have an account yet.",
          "An open invitation can be withdrawn as long as it has not been redeemed.",
          "For the second factor: open “Security” at the bottom of the sidebar, or the same entry in the account sheet on a phone.",
          "“Start” shows a QR code and a key — both are handed out only once. Scan it in an authenticator app, enter the six-digit code and confirm. Only then does the factor take effect.",
        ],
      },
    ],
  },

  referenz: {
    routenTitel: "Pages",
    routenEinleitung:
      "All addresses in the portal. {locale} stands for one of the four language codes de, en, kk or ru; without a code you are taken to the German version.",
    routenNachsatz:
      "The pages under /dashboard require signing in. Without a database connection that check is skipped, because there is no session then — this keeps demo mode startable without any setup.",
    spaltePfad: "Address",
    spalteBeschreibung: "Content",
    spalteZugriff: "Access",
    routen: [
      { pfad: "/", beschreibung: "Redirects to the German version.", zugriff: "Everyone" },
      {
        pfad: "/{locale}",
        beschreibung:
          "Public start page: what this is about, why raspberries are demanding, the 60-minute scene, quality benchmark, chain of evidence with a link to the public origin lookup, the areas, key figures.",
        zugriff: "Everyone",
      },
      {
        pfad: "/{locale}/login",
        beschreibung:
          "Sign-in. Without a database connection this shows a note and the direct route into the portal instead.",
        zugriff: "Everyone",
      },
      {
        pfad: "/{locale}/login/mfa",
        beschreibung:
          "Second factor prompt. A session with password alone is not enough when a confirmed second factor is set up for the account.",
        zugriff: "Signed in",
      },
      {
        pfad: "/{locale}/einladung",
        beschreibung:
          "Redeem an invited account and set your own password. Reachable without signing in — whoever lands here does not have an account yet.",
        zugriff: "Everyone",
      },
      {
        pfad: "/{locale}/dashboard",
        beschreibung:
          "Overview with the four areas and their key figures. Management and administrators additionally get the daily block “Today's essentials”.",
        zugriff: "Signed in",
      },
      {
        pfad: "/{locale}/dashboard/{area}",
        beschreibung:
          "Landing page of an area (feld, hof, buero, markt) with its modules as tiles.",
        zugriff: "By role",
      },
      {
        pfad: "/{locale}/dashboard/{area}/{module}",
        beschreibung:
          "A single module. The addresses of all 26 modules are listed in the chapter “Areas and modules”.",
        zugriff: "By role",
      },
      {
        pfad: "/{locale}/dashboard/compliance",
        beschreibung:
          "The most recently stored compliance report in full: findings with an area filter, action plan, notes, seal check and PDF output.",
        zugriff: "Management, administrators",
      },
      {
        pfad: "/{locale}/dashboard/sicherheit",
        beschreibung:
          "Set up, confirm or remove your own second factor. Every role manages only itself here.",
        zugriff: "Signed in",
      },
      {
        pfad: "/{locale}/dashboard/handbuch",
        beschreibung:
          "This handbook, in the portal's language. With full-text search and a complete PDF export.",
        zugriff: "Signed in",
      },
      {
        pfad: "/{locale}/herkunft",
        beschreibung:
          "Entry point to the public origin lookup with a field for typing in the code — for anyone who cannot scan a QR code.",
        zugriff: "Everyone",
      },
      {
        pfad: "/{locale}/herkunft/{code}",
        beschreibung:
          "The lookup for one specific batch. It discloses neither the batch number nor picker, quantity or price details; that is what makes it defensible without signing in.",
        zugriff: "Everyone",
      },
      {
        pfad: "/{locale}/herkunft/aushang",
        beschreibung:
          "A notice for printing. Its QR code points to the code entry page, not to a single batch: a notice hangs by the cold store for weeks, a punnet stands for hours.",
        zugriff: "Everyone",
      },
      { pfad: "/{locale}/impressum", beschreibung: "Legal notice for WAMOCON GmbH.", zugriff: "Everyone" },
      {
        pfad: "/{locale}/datenschutz",
        beschreibung: "Privacy information including details on data residency.",
        zugriff: "Everyone",
      },
    ],

    rechteTitel: "Permissions by role",
    rechteEinleitung:
      "Which role may see and change which module. This table is generated from the same permission matrix the portal follows in operation — so it cannot go stale without the portal changing with it.",
    rechteHinweisTitel: "Two checks, not one",
    rechteHinweis:
      "The interface shows only what the role is allowed to do — that is convenience, not security. What binds is the check in the database: there the profile's role decides every read and write, including direct access. On top of that the application checks again before every write.",
    spalteRessource: "Module",

    schnittstellenTitel: "Interfaces",
    schnittstellenEinleitung:
      "Six endpoints for tasks that have no page of their own. Each checks session and permission itself.",
    spalteAufgabe: "Purpose",
    schnittstellen: [
      {
        pfad: "/api/ki-assistent",
        aufgabe:
          "The AI assistant during a conversation. The answer appears as it is being produced rather than in one piece at the end.",
        zugriff: "AI assistant permission, consent given",
      },
      {
        pfad: "/api/ki-pruefung",
        aufgabe:
          "The compliance run across the four areas audit, tax, legal and risk. Progress arrives continuously so the interface can show the run. Without stored legal sources the run declines — a review without evidence would be worthless. Only one run per person at a time.",
        zugriff: "Role with audit permission",
      },
      {
        pfad: "/api/ki-pruefung/auto",
        aufgabe:
          "The same run, triggered at sign-in. First the cheap check whether anything changed at all; the full run follows only if needed.",
        zugriff: "Management, administrators",
      },
      {
        pfad: "/api/ki-sprachausgabe",
        aufgabe:
          "Reads answers aloud: a stored answer by the identifier of its message, or, when reading aloud while the answer is still being written, single sections that the chat signed as they were created. Never freely supplied text, otherwise the endpoint would be a speech generator for arbitrary content. The voice comes from the configured provider (Soniox or Sokrates); if it fails, Sokrates speaks. A stored answer is streamed: playback starts while the audio is still being generated instead of after the whole file. When Soniox speaks, this endpoint is only the fallback; reading aloud then runs over the stream (next entry).",
        zugriff: "AI assistant permission",
      },
      {
        pfad: "/api/ki-sprachausgabe/schluessel",
        aufgabe:
          "Issues a short-lived key for reading aloud, together with voice, speed and format per language. The browser then talks to the speech service directly: every sentence goes in at once, and the audio plays while it is being generated, without pauses between sections. A key is only issued with proof, that is for the answer currently being written or for one of your own saved answers. It opens exactly one stream, is valid for 60 seconds, and each person gets at most twelve keys per minute. The actual key never leaves the server. If the endpoint declines, the previous path reads aloud in single sections.",
        zugriff: "Permission for the AI assistant, Soniox as speech output",
      },
      {
        pfad: "/api/ki-spracherkennung",
        aufgabe:
          "Issues a short-lived key for live dictation: speech recognition only, single use, one minute to connect. With it the browser sends speech straight to the recognition service, and the text appears in the input field while the person is still speaking. The actual key never leaves the server. If the endpoint declines, the same recording goes to recognition as a file, as before.",
        zugriff: "AI assistant permission, live dictation switched on",
      },
      {
        pfad: "/api/sync",
        aufgabe:
          "Receives the reports from the queue that were created in the field without a connection. They pass through the same checks as the corresponding forms.",
        zugriff: "Signed in, second factor current",
      },
    ],
  },

  technik: {
    stackTitel: "Technology used",
    spalteSchicht: "Layer",
    spalteTechnik: "Technology",
    spalteAufgabe: "Purpose",
    stack: [
      {
        schicht: "Application",
        technik: "Next.js 16",
        aufgabe: "Pages are built on the server; the language is part of the address.",
      },
      {
        schicht: "Language",
        technik: "TypeScript",
        aufgabe: "Type-safe model of the domain terms and the permission matrix.",
      },
      {
        schicht: "Styling",
        technik: "Tailwind CSS v4",
        aufgabe: "Colour and spacing defined in one place, light and dark scheme.",
      },
      {
        schicht: "Languages",
        technik: "next-intl",
        aufgabe: "Four languages; where a translation is missing, the German text appears.",
      },
      {
        schicht: "Database",
        technik: "PostgreSQL on Supabase",
        aufgabe: "Data including permission checks in the database itself, not only in the application.",
      },
      {
        schicht: "Files",
        technik: "Private storage area",
        aufgabe: "Photo evidence and documents, reachable only through short-lived signed links.",
      },
      {
        schicht: "Offline",
        technik: "Queue on the device",
        aufgabe: "Reports from the field are held locally and transmitted later.",
      },
      {
        schicht: "AI",
        technik: "Interchangeable providers",
        aufgabe: "Assistant, compliance review and speech output on a secured data basis.",
      },
    ],
    meilensteineTitel: "Milestones",
    meilensteineEinleitung:
      "Internal preparation. Both dates fall before the on-site analysis week from 24 September to 1 October 2026.",
    spalteMeilenstein: "Milestone",
    spalteTermin: "Date",
    spalteInhalt: "Content",
    meilensteine: [
      {
        name: "A — Prototype",
        stand: "done",
        art: "erledigt",
        termin: "by 6 September 2026",
        inhalt:
          "Colour and spacing foundation, public start page with language switcher, portal skeleton with four areas, first procedures: row block overview and picking task with photo evidence.",
      },
      {
        name: "B — Framework",
        stand: "this release",
        art: "aktuell",
        termin: "by 19 September 2026",
        inhalt:
          "Main functions against a real database: sign-in and role permissions, site management, row block status with pre-harvest interval lock, picking tasks with photo evidence in private storage, document management, key figures from baseline values.",
      },
    ],
    abgrenzungTitel: "Relation to the customer's schedule",
    abgrenzung:
      "This internal schedule is tighter than the date given to the customer for phase one (16 October to 20 December 2026). The prototype is an internal demonstration system and not the contractually agreed scope.",
  },

  recht: {
    einleitung:
      "In 2026 Kazakhstan introduced new obligations in quick succession. The portal's safeguards already meet their intent; notice and consent texts, however, need to be drafted anew under Kazakhstani law rather than merely translated.",
    spalteGrundlage: "Legal basis 2026",
    spalteWirkung: "Effect on Damicon",
    grundlagen: [
      { begriff: "Tax Code 2026", text: "Affects contribution margin and cost allocation." },
      {
        begriff: "Electronic waybill (ЭСФ)",
        text: "Runs through an outbound queue, not through something the accounting department builds itself.",
      },
      { begriff: "AI Act No. 230-VIII", text: "Requires a transparency notice and consent for the AI chat." },
      {
        begriff: "Digital Code No. 255-VIII",
        text: "Data residency: storing certain data outside Kazakhstan is restricted. The location for QR, queue and AI data must be assessed legally before going into production.",
      },
      {
        begriff: "Tightened data protection law (since 24 August 2026)",
        text: "Mainly affects the creation of customer and neighbouring-farm accounts.",
      },
      {
        begriff: "ЕСУТД — employment contract registry",
        text: "Every seasonal contract is registered in the state system through the outbound queue.",
      },
    ],
    prototypTitel: "For the prototype",
    prototyp:
      "The prototype processes no personal data and sets no cookies for behavioural analysis. Colour scheme and demo role live in the browser only.",
  },

  glossar: {
    einleitung: "Terms used in the portal and in this handbook.",
    spalteBegriff: "Term",
    spalteErklaerung: "Explanation",
    eintraege: [
      {
        begriff: "Row block",
        text: "The smallest unit of the site structure: a delimited section of a trellis row. Everything — status, lock, harvest, contribution margin — hangs off it.",
      },
      {
        begriff: "Pre-harvest interval lock",
        text: "State of a row block after a crop protection treatment: harvesting is blocked until the product's interval has elapsed.",
      },
      {
        begriff: "Batch",
        text: "One row block's harvest on one day. Carries the cooling curve, the crates and the residue record.",
      },
      {
        begriff: "Crate",
        text: "Transport container for harvested raspberries, assigned to a batch and a person by QR code.",
      },
      {
        begriff: "Cold chain clock",
        text: "Time measured from picking to pre-cooling. Beyond 60 minutes the goods are only industrial grade the next day.",
      },
      {
        begriff: "Quality-factor pay",
        text: "Base pay plus a quantity component plus a quality factor. Pure piece rate destroys value with raspberries because it leads to fast and rough picking.",
      },
      {
        begriff: "Chain of evidence",
        text: "The unbroken chain from the delivered punnet back to row block, cooling curve, crate and picker.",
      },
      {
        begriff: "Role permissions",
        text: "Which role may see and change which module. It applies in the interface and, bindingly, in the database.",
      },
      {
        begriff: "Second factor",
        text: "An additional six-digit code at sign-in, produced by an authenticator app.",
      },
      {
        begriff: "Demo mode",
        text: "Operation without a database connection. The portal shows sample data, there is no sign-in and nothing is stored.",
      },
      {
        begriff: "ЭСФ / ЕСУТД",
        text: "Kazakhstani mandatory systems for electronic invoices and for registering employment contracts respectively.",
      },
      {
        begriff: "Voice mode",
        text: "A live conversation with the assistant without a visible chat: a bubble reacts to the voice, and the assistant can jump to and highlight a section on its own. Interrupt as in a conversation: just start talking, or tap the bubble. To start: the “Talk” button in the header, or in the chat the send button while the input field is empty. Voice mode can do the same as the chat, including entering data. Before any change is saved, it shows the change clearly outlined on screen, and you approve it by saying “Yes” or decline it with “No”. While it explains, a frame outlines exactly the spot it is talking about, and it expands collapsed sections for that. It also opens the zones Field, Yard, Office and Market and the compliance audit report, filtered by audit, tax, law or risk on request. Say “Stop” to end voice mode, at any time, even while it is speaking or thinking.",
      },
      { begriff: "WAMOCON", text: "WAMOCON GmbH — client and developer of Damicon." },
    ],
  },

  fuss: {
    rechte: "© 2026 WAMOCON GmbH — All rights reserved",
    vermerk: "Damicon product handbook 0.1.0 · Confidential · September 2026",
  },
};
