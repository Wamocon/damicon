// Wo das Produkthandbuch liegt. Es ist ein Route Handler mit fertiger
// HTML-Seite und geht in einem neuen Tab auf (dashboard/handbuch-link.tsx).
// Deshalb die volle Adresse mit Sprachpraefix, an der Client-Navigation von
// next-intl vorbei. Genutzt von der Navigation und der globalen Suche.
export function handbuchHref(locale: string): string {
  return `/${locale}/dashboard/handbuch`;
}
