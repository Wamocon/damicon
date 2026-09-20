"use client";

import { Printer } from "lucide-react";
import { cn } from "@/lib/utils";

// Reine Browser-Druckfunktion (WMCNL-1439): kein PDF-Werkzeug, kein
// Server-Aufruf - jeder Browser druckt bereits nach PDF, wenn die Person das
// moechte. Eigene, isolierte Client-Komponente, damit die umgebende Seite
// (Etiketten/Ausweise, Aushang-Poster) eine Server Component bleiben kann;
// window.print() muss im Browser laufen.
//
// "print:hidden" ist fest in die Komponente eingebaut statt dem Aufrufer
// ueberlassen - der Knopf selbst darf nie mit ausgedruckt werden.
export function PrintButton({ label, className }: { label: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={cn(
        "print:hidden inline-flex h-11 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:bg-muted lg:h-9 lg:text-xs",
        className,
      )}
    >
      <Printer className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
