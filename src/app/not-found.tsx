import "./globals.css";

// Root-404 fuer Anfragen ohne gueltiges Locale-Praefix. Braucht ein eigenes
// <html>/<body>, weil das Locale-Layout hier nicht greift. Ausserhalb des
// Locale-Kontexts, daher bewusst zweisprachig (Standardsprache + Englisch).
export default function GlobalNotFound() {
  return (
    <html lang="de">
      <body className="flex min-h-svh items-center justify-center bg-background p-6 text-foreground">
        <div className="text-center">
          <p className="text-5xl font-black text-primary">404</p>
          <p className="mt-3 text-sm text-muted-foreground">
            Seite nicht gefunden.
          </p>
          <p className="text-sm text-muted-foreground">Page not found.</p>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Root-Fallback ausserhalb des Locale-Layouts, bewusst harter Reload */}
          <a
            href="/de"
            className="mt-6 inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground"
          >
            Zur Startseite / Home
          </a>
        </div>
      </body>
    </html>
  );
}
