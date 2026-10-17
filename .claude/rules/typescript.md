---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---
<!-- Erzeugt von scripts/claude-regeln.mjs aus .github/instructions/typescript.instructions.md. Dort bearbeiten, dann npm run claude:regeln. Aenderungen hier gehen verloren. -->

# TypeScript Best Practices

## Type Safety

- Enable `strict` mode in `tsconfig.json` (already configured).
- Use `import type { ... }` for type-only imports - keeps runtime bundles clean.
- Prefer `interface` for object shapes; use `type` for unions, intersections, and mapped types.
- Never use `any`. Use `unknown` when the type is genuinely unknown, then narrow it.

## Patterns

- Use discriminated unions for state management and API responses.
- Prefer `as const` for literal types and const assertions.
- Use `satisfies` operator to validate types without widening.
- Extract shared types to `src/types/` - keep them co-located if only used in one module.

## Naming Conventions

- **Interfaces/Types:** PascalCase (`UserProfile`, `ApiResponse`).
- **Variables/Functions:** camelCase (`getUserById`, `isLoading`).
- **Constants:** UPPER_SNAKE_CASE for true constants, camelCase for computed values.
- **Components:** PascalCase file names matching the export (`UserCard.tsx`).

## Enums

- Avoid `enum` - use `as const` objects or string literal union types instead.
