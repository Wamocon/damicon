import { FileText } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

// Der Knopf zum Dokument im Damicon-Layout (GET /api/dokument/<art>): oeffnet es in einem neuen Tab, dort laesst es sich
// ansehen und ueber "Drucken" als PDF speichern. Laeuft in Server- und Client-Komponenten, ohne eigenen Zustand.

export function DokumentKnopf({
  art,
  parameter = {},
  label,
  klein = false,
  className,
}: {
  art: string;
  parameter?: Record<string, string>;
  /** Beschriftung; ohne Angabe "Als Dokument (PDF)". */
  label?: string;
  klein?: boolean;
  className?: string;
}) {
  const sprache = useLocale();
  const t = useTranslations("dokument.knopf");
  const adresse = `/api/dokument/${art}?${new URLSearchParams({ ...parameter, sprache }).toString()}`;
  return (
    <a
      href={adresse}
      target="_blank"
      rel="noopener"
      title={t("hinweis")}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-border bg-card font-bold text-foreground transition hover:border-primary",
        klein ? "px-2 py-1 text-[11px]" : "px-2.5 py-1.5 text-xs",
        className,
      )}
    >
      <FileText className={klein ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {label ?? t("standard")}
    </a>
  );
}
