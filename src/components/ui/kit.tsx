import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Tone = "success" | "info" | "neutral" | "warning" | "danger";

const toneClasses: Record<Tone, string> = {
  success: "bg-success/10 text-success border-success/25",
  info: "bg-primary/10 text-primary border-primary/25",
  neutral: "bg-muted text-muted-foreground border-border",
  warning: "bg-warning/12 text-warning border-warning/25",
  danger: "bg-destructive/10 text-destructive border-destructive/25",
};

export function StatusPill({
  children,
  tone = "neutral",
  className,
  title,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold leading-4",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card p-5 shadow-sm shadow-black/[0.03]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Section({
  id,
  title,
  description,
  action,
  children,
  className,
}: {
  // Fuer Sprungziele wie das Risiko-Radar (risiko-radar.tsx): ein Link auf
  // dieselbe Seite bewirkt ohne Ankerziel nichts sichtbares, siehe dortiger
  // Kommentar. scroll-mt-20 haelt den Abschnitt unter der fixierten Kopfzeile
  // frei - dasselbe Mass wie die Marketingseiten-Anker (z. B. #zonen).
  id?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("space-y-3", id ? "scroll-mt-20" : undefined, className)}>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-bold text-card-foreground">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-xs font-black uppercase tracking-[0.14em] text-primary">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-1 text-2xl font-black text-foreground md:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {children ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>
      ) : null}
    </header>
  );
}

export function Stat({
  label,
  value,
  helper,
  tone = "neutral",
}: {
  label: string;
  // ReactNode statt string: erlaubt z. B. eine animierte CountUp-Zahl
  // (components/site/count-up.tsx) als Wert, ohne einen zweiten,
  // fast identischen Kachel-Baustein zu erfinden. Ein einfacher String
  // bleibt weiterhin gueltig.
  value: ReactNode;
  helper?: string;
  tone?: Tone;
}) {
  const accent: Record<Tone, string> = {
    success: "text-success",
    info: "text-primary",
    neutral: "text-foreground",
    warning: "text-warning",
    danger: "text-destructive",
  };
  return (
    <Card className="p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-1 text-2xl font-black", accent[tone])}>{value}</p>
      {helper ? (
        <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
      ) : null}
    </Card>
  );
}

export function DataTable({
  head,
  children,
}: {
  head: string[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
            {head.map((cell) => (
              <th key={cell} className="px-3 py-2.5 font-semibold">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}
