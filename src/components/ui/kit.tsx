import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
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
      // 11 px auf beiden Geraeten, also bewusst ohne `schrift-label`: eine
      // Pille ist keine Beschriftung, die man liest, sondern ein Marker, den
      // man erkennt. Mitgewachsen auf 13 px nahm sie in einer schmalen Karte
      // spuerbar Platz - auf der Rollenseite die halbe Kartenbreite -, ohne
      // dass ein Zustandswort dadurch verstaendlicher wird.
      //
      // `text-[11px]` und nicht das Token: tailwind-merge erkennt es als
      // Schriftgroesse und laesst es neben der Tonfarbe stehen. Genau daran
      // war die Token-Fassung gescheitert.
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
  id,
  children,
  className,
}: {
  /** Sprungziel (Anker) fuer Verweise, z. B. vom KI-Agenten. */
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      id={id}
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
            <p className="mt-0.5 schrift-dense text-muted-foreground">{description}</p>
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
  /** Text oder Brotkrumen-Pfad. Als ReactNode, damit <Brotkrumen /> hier
   *  stehen kann - ein <nav> darf nicht in einem <p> liegen, deshalb ist der
   *  Traeger unten ein <div>. */
  eyebrow?: ReactNode;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <div className="text-xs font-black uppercase tracking-[0.14em] text-primary">
            {eyebrow}
          </div>
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
      <p className="schrift-label font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-1 text-2xl font-black", accent[tone])}>{value}</p>
      {helper ? (
        <p className="mt-1 schrift-dense text-muted-foreground">{helper}</p>
      ) : null}
    </Card>
  );
}

// Beschriftet jede Zelle mit ihrem Spaltenkopf (data-kopf). Sichtbar wird das
// erst unter `md`, wo die Tabelle zu Karten wird und die Kopfzeile wegfaellt -
// ohne Beschriftung stuenden dort nackte Werte untereinander.
//
// Der Baustein macht das selbst, statt es von 29 Aufrufstellen zu verlangen.
// Die Zuordnung geht ueber die Reihenfolge: die n-te Zelle einer Zeile gehoert
// zum n-ten Kopf.
//
// Daran haengt eine Bedingung, und zwar eine, die der Aufrufer einhalten muss:
// Eine Zelle, die nur manchmal gerendert wird, braucht einen Kopf, der unter
// genau derselben Bedingung steht. Drei Tabellen tun das heute - die
// Personenspalte in pflichtschulungen-ansicht.tsx steht hinter `istBuero`, die
// Aktionsspalten in dokumente-ansicht.tsx und reihenbloecke-ansicht.tsx hinter
// einem Recht -, und alle drei fuehren dieselbe Bedingung im head-Array mit
// (`...(istBuero ? [t("col.person")] : [])`).
//
// Faellt eine Zelle weg, deren Kopf stehen bleibt, verschieben sich alle
// Beschriftungen ab dieser Spalte um eins. Sichtbar wird das nur unter `md`
// und nur an einem falschen Namen neben einem richtigen Wert - am Schreibtisch
// faellt es niemandem auf. Deshalb steht der Fall in kit-bausteine.tsx auf dem
// Pruefstand, in beiden Richtungen.
//
// Zellen mit colSpan sind keine Werte, sondern Meldungen ueber die ganze
// Breite ("keine Daten"). Sie bekommen keine Beschriftung und zaehlen ihre
// Spalten weiter, damit eine Zeile danach wieder richtig liegt.
function mitSpaltenkopf(children: ReactNode, head: string[]): ReactNode {
  return Children.map(children, (zeile) => {
    if (!isValidElement(zeile) || zeile.type !== "tr") return zeile;
    const zeilenProps = zeile.props as { children?: ReactNode };

    let spalte = 0;
    const zellen = Children.map(zeilenProps.children, (zelle) => {
      if (!isValidElement(zelle) || zelle.type !== "td") return zelle;
      const zellProps = zelle.props as { colSpan?: number };
      const kopf = head[spalte];
      spalte += zellProps.colSpan ?? 1;
      if (zellProps.colSpan || kopf === undefined) return zelle;
      return cloneElement(zelle as ReactElement<Record<string, unknown>>, {
        "data-kopf": kopf,
      });
    });

    return cloneElement(
      zeile as ReactElement<{ children?: ReactNode }>,
      undefined,
      zellen,
    );
  });
}

export function DataTable({
  head,
  children,
  matrix = false,
}: {
  head: string[];
  children: ReactNode;
  /**
   * Ein Raster aus Ja/Nein statt einer Liste von Werten - etwa die
   * Rechtematrix, Rollen mal Ressourcen. Solche Tabellen bleiben auch auf dem
   * Handy Tabellen: als Karten waeren aus 15 Ressourcen mal 8 Rollen 120
   * Zeilen geworden, und der Vergleich zwischen zwei Spalten, um den es bei
   * einer Matrix allein geht, waere verloren. Stattdessen scrollt sie
   * waagerecht, mit festgehaltener erster Spalte - sonst weiss man nach zwei
   * Spalten nicht mehr, welche Zeile man liest.
   */
  matrix?: boolean;
}) {
  return (
    // `datentabelle` traegt die Kartendarstellung unter `md` (globals.css).
    // Die Mindestbreite und das Querscrollen gelten erst ab `md`: darunter
    // gibt es keine Tabelle mehr, die breiter sein koennte als der Schirm -
    // ausser bei einer Matrix, die genau dafuer ihr eigenes data-Attribut hat.
    <div
      data-matrix={matrix ? "" : undefined}
      className={cn(
        "datentabelle rounded-xl border border-border bg-card md:overflow-x-auto",
        matrix && "overflow-x-auto",
      )}
    >
      <table
        className={cn(
          "w-full text-left text-sm md:min-w-[640px]",
          matrix && "min-w-[640px]",
        )}
      >
        <thead>
          <tr className="border-b border-border bg-muted/40 schrift-label uppercase tracking-wide text-muted-foreground">
            {head.map((cell) => (
              <th key={cell} className="px-3 py-2.5 font-semibold">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {mitSpaltenkopf(children, head)}
        </tbody>
      </table>
    </div>
  );
}

// Platzhalter fuer Inhalte, die noch laden. Die drei loading.tsx des Dashboards
// bauten dasselbe Muster jeweils von Hand nach - eine Aenderung an Farbe,
// Pulsieren oder der Ruecknahme bei "reduzierte Bewegung" waere an drei Stellen
// nachzuziehen gewesen.
//
// Hoehe und Breite bleiben beim Aufrufer: die haengen an dem Element, das der
// Platzhalter vertritt, und sind deshalb nirgends zweimal dieselben.
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded bg-muted motion-reduce:animate-none",
        className,
      )}
      aria-hidden="true"
    />
  );
}

// Platzhalter in Kartenform: gleicher Rahmen und Grund wie <Card>, damit beim
// Einsetzen des Inhalts nichts springt. Den Radius gibt der Aufrufer mit, wo er
// vom Standard abweicht - die Bereichsseite setzt ihre Kacheln runder.
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <Skeleton
      className={cn("rounded-xl border border-border bg-card", className)}
    />
  );
}
