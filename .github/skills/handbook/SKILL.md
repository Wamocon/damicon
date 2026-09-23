# Skill: handbook

## Purpose

Keep the product handbook accurate and in sync with the application.

**The handbook is generated, not hand-written.** Editing `docs/manual/*.html` directly is
always wrong: the next `npm run handbuch` overwrites it and the work is lost.

---

## How the handbook is built

```
scripts/handbuch/
  erzeugen.ts        <- generator (reads the app, writes the HTML)
  typen.ts           <- shape of the hand-written texts
  texte-de.ts        <- German texts   (leading version)
  texte-en.ts        <- English texts
  texte-kk.ts        <- Kazakh texts
  texte-ru.ts        <- Russian texts

docs/manual/
  index.html         <- GENERATED (German)
  index-en.html      <- GENERATED
  index-kk.html      <- GENERATED
  index-ru.html      <- GENERATED
```

Two sources feed the generator:

1. **The application itself.** Modules, zones, roles and permissions are read from
   `src/lib/modules.ts`, `src/lib/rbac.ts` and `src/messages/*.json`. Anything that lives
   there appears in the handbook automatically, in all four languages, and cannot go stale.
2. **`scripts/handbuch/texte-*.ts`.** Everything the app does not know about itself:
   introduction, how to operate the portal, how-to guides, page list, technology, law,
   glossary.

Served to users at `/{locale}/dashboard/handbuch` by
`src/app/[locale]/dashboard/handbuch/route.ts`, behind the sign-in check.

---

## What needs no action at all

Because the generator reads the app, these changes reach the handbook by simply running
`npm run handbuch`:

| Change | Handled automatically |
|---|---|
| New module in `src/lib/modules.ts` | Appears in the module table and gets its own section, in four languages |
| Module renamed or re-described in `src/messages/*.json` | Text follows |
| Permissions changed in `src/lib/rbac.ts` | "Visible to" / "May change" and the permission matrix follow |
| Module maturity (`reifegrad`) changed | Pill and explanation follow |
| Zone renamed | Chapter heading and description follow |

---

## What has to be written by hand

Edit `scripts/handbuch/texte-de.ts` first, then carry the change into the other three files.
Every language file implements the same `HandbuchTexte` type, so a missing field is a type
error rather than a silent gap.

| Change | Edit |
|---|---|
| New page / route | `referenz.routen` |
| New API endpoint | `referenz.schnittstellen` |
| New procedure worth documenting | `anleitungen.liste` |
| Changed operation of the UI | `bedienung` |
| New technology in the stack | `technik.stack` |
| New legal obligation | `recht.grundlagen` |
| New domain term | `glossar.eintraege` |
| Version, status or date | `deckblatt` |

---

## Update protocol

1. **Run the generator first.** `npm run handbuch`. If `git status` stays clean, the app-driven
   half is already current.
2. **Compare the hand-written half** against the change at hand, using the table above.
   Only touch what is actually stale.
3. **Edit `texte-de.ts`, then `texte-en.ts`, `texte-kk.ts`, `texte-ru.ts`.** All four or none:
   a half-translated handbook is worse than an untranslated one, because nothing signals
   which half is missing.
4. **Regenerate and verify.**
   ```
   npm run handbuch
   npm run typecheck
   ```
5. **Commit the generated files together with the texts.** They are versioned so the
   deployment does not depend on the generator running.

---

## House rules

- **German with real umlauts** in the text files (ä, ö, ü, ß), not the `ae/oe/ue` spelling.
  That spelling belongs in code comments only.
- **No 1Çatı references.** The migration origin is internal and has no place in a handbook
  written for users of the portal.
- **Colours come from the portal.** The generator's stylesheet mirrors the tokens in
  `src/app/globals.css`. If the palette changes there, pull it across in `stilblatt()` inside
  `scripts/handbuch/stil.ts`.
- **Search and the PDF export must keep working.** The export always contains the complete
  handbook in the selected language; an active search filter is cleared before printing, and
  the print stylesheet restores hidden chapters as a second net. Do not remove either.
- **The handbook is confidential.** It stays behind the sign-in check and must not be moved
  to `public/`.
