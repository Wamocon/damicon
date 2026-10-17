---
paths:
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/*.css"
---
<!-- Erzeugt von scripts/claude-regeln.mjs aus .github/instructions/tailwind.instructions.md. Dort bearbeiten, dann npm run claude:regeln. Aenderungen hier gehen verloren. -->

# Tailwind CSS v4 Instructions

## Utility-First Approach

- Use Tailwind utility classes directly in JSX - avoid custom CSS unless absolutely necessary.
- Follow a consistent class order: **Layout → Box Model → Typography → Effects → States**.
- For conditional classes, use template literals or a `cn()` helper if `tailwind-merge` and `clsx` are installed.

## Responsive Design

- Use responsive prefixes: `sm:`, `md:`, `lg:`, `xl:`, `2xl:`.
- Mobile-first: write base styles for mobile, then add breakpoint overrides.

## Dark Mode

- Support dark mode with the `dark:` variant.
- Keep colour contrast accessible (WCAG AA minimum).

## Component Patterns

- Create reusable UI components in `src/components/ui/`.
- Prefer standard theme tokens (spacing, colours) over arbitrary values.
- Use only Tailwind v4 syntax - no deprecated Tailwind v3 patterns.
