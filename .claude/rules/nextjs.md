---
paths:
  - "**/*.tsx"
  - "**/*.ts"
  - "**/*.jsx"
  - "**/*.js"
---
<!-- Erzeugt von scripts/claude-regeln.mjs aus .github/instructions/nextjs.instructions.md. Dort bearbeiten, dann npm run claude:regeln. Aenderungen hier gehen verloren. -->

# Next.js 16 + App Router Instructions

## Server vs. Client Components

- Default to **Server Components** (no directive needed).
- Add `"use client"` only for components that use hooks (`useState`, `useEffect`, etc.), event handlers, or browser APIs.
- Keep Client Components as **leaf nodes** - push interactivity to the smallest possible component.

## Async APIs (Next.js 16 Breaking Change)

In Next.js 16, the following are **async** and must be awaited:

```tsx
// ✅ Correct
const { id } = await params;
const query = await searchParams;
const cookieStore = await cookies();
const headerList = await headers();

// ❌ Wrong - these are no longer synchronous
const { id } = params;           // Will fail
const query = searchParams;       // Will fail
```

## Data Fetching

- Fetch data in Server Components using `async/await`.
- Use Server Actions (`"use server"`) for data mutations.
- Use `Suspense` boundaries with `loading.tsx` for granular loading states.
- Handle errors with `error.tsx` (client-side error boundary).

## Routing

- Use `layout.tsx` for shared UI across routes.
- Use `page.tsx` for route-specific content.
- Use `route.ts` for API routes (Route Handlers).
- Use dynamic routes: `[id]/page.tsx` and catch-all: `[...slug]/page.tsx`.

## Metadata & SEO

- Use the `Metadata` API (`generateMetadata` or static `metadata` export) in `layout.tsx` or `page.tsx`.
- Never use `<Head>` from `next/head` - that is Pages Router only.

## Proxy (formerly Middleware)

> **CRITICAL - Read this before generating any proxy / next-intl code.**
> Source: https://nextjs.org/docs/app/api-reference/file-conventions/proxy

**Since Next.js v16.0.0, `middleware.ts` is deprecated. The correct file is `src/proxy.ts`.**
`middleware.ts` still works but emits a deprecation warning at runtime on every request. All
new code must use `proxy.ts`. Existing projects must migrate.

**Migration codemod (run once per project):**
```bash
npx @next/codemod@canary middleware-to-proxy .
```
This renames the file and changes `export function middleware()` to `export function proxy()`.

**Rules:**
- **ALWAYS** use `src/proxy.ts` as the file name.
- **NEVER** name the file `src/middleware.ts` - it is deprecated and will produce a warning on
  every request. Next.js will eventually remove backward compatibility.
- The function export must be named `proxy` (or be a default export). Do NOT export `middleware`.
- Use `NextProxy` type (not `NextMiddleware`) from `'next/server'`.
- `proxy.ts` defaults to the **Node.js runtime** (not Edge). Do not set `runtime` in proxy files.
- The `config.matcher` export works exactly as before.

**Correct proxy file for a next-intl project:**

```ts
// src/proxy.ts  <-- NON-NEGOTIABLE filename in Next.js 16+
import createMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';

export default createMiddleware(routing);

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
};
```

**Correct proxy file with explicit typing:**

```ts
// src/proxy.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  // proxy logic here
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)'],
};
```

**Verification after generating proxy:**
After `npm run build`, confirm the proxy is registered:
- Check `.next/server/middleware-manifest.json` - it must contain a non-empty `sortedMiddleware` array.
- An empty `sortedMiddleware: []` means the file name is wrong or the export is missing.

## Optimisation

- Use `next/image` for images (automatic optimisation).
- Use `next/font` for fonts (zero layout shift).
- Use `next/link` for client-side navigation.
- Prefer `next/dynamic` for code-splitting heavy Client Components.
