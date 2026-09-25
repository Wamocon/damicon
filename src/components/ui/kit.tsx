import {
  Children,
  cloneElement,
  isValidElement,
  type ButtonHTMLAttributes,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export type Tone = "success" | "info" | "neutral" | "warning" | "danger";

/**
 * Eingabefeld und Auswahl: 44 px und 16 px Schrift bis lg (Beruehrung, kein
 * iOS-Zoom beim Fokus), darueber die dichte Schreibtischmaske. DESIGN.md
 * Abschnitt 10.
 */
export const feldKlassen =
  "h-11 w-full rounded-lg border border-border bg-background px-3 text-base text-foreground outline-none transition focus:border-primary lg:h-9 lg:px-2.5 lg:text-xs";

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

/**
 * Die Klassen einer Karte, die als Ganzes ein Verweis ist. Sie stand dreimal
 * fast gleich im Code: Zonenkarte der Uebersicht, Modulkarte der
 * Bereichsseite und Zonenkarte der Landingpage. Unterschiedlich war daran nur
 * der Innenabstand - die Landingkarte hat keinen, weil ihr Bild bis an den
 * Rand laeuft.
 *
 * Bewusst eine Klassenkette und keine Komponente: die drei Stellen setzen
 * unterschiedliche Elemente (Link mit und ohne Bild) und brauchen den
 * Gruppennamen `group` fuer ihre eigenen Hover-Regeln im Inneren.
 */
export const kachelVerweis =
  "group flex flex-col rounded-2xl border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40";

/**
 * Die drei Ebenen des Boxensystems, so wie die Uebersichtsseite sie gesetzt
 * hat:
 *
 *   "box"   - die Abschnittsbox. Kartengrund, Schatten. Traegt einen ganzen
 *             Abschnitt der Seite.
 *   "innen" - alles, was innerhalb einer Abschnittsbox eine eigene Einheit
 *             ist: eine Zonenkarte, ein Meilenstein, eine Modulkachel.
 *             Gedaempfter Grund, kein Schatten.
 *   "daten" - die kleinste Einheit, etwa eine Kennzahlbox: voller
 *             Kartengrund, damit die Zahl sich vom gedaempften Traeger
 *             abhebt, aber ebenfalls ohne Schatten.
 *
 * Die Regel dahinter: Grund und Schatten nehmen nach innen ab, der Rahmen
 * bleibt. Zwei Flaechen mit Schatten uebereinander sehen aus wie ein Fehler.
 */
export type Kartenton = "box" | "innen" | "daten";

const kartenTon: Record<Kartenton, string> = {
  box: "bg-card shadow-sm shadow-black/[0.03]",
  innen: "bg-muted/20",
  daten: "bg-card",
};

export function Card({
  id,
  children,
  className,
  ton = "innen",
}: {
  /** Sprungziel (Anker) fuer Verweise, z. B. vom KI-Agenten. */
  id?: string;
  children: ReactNode;
  className?: string;
  ton?: Kartenton;
}) {
  return (
    <div
      id={id}
      className={cn(
        "rounded-2xl border border-border p-5",
        kartenTon[ton],
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
  // Der Abschnitt ist die Box. Vorher stand er rahmenlos auf dem
  // Seitengrund, und jede Ansicht setzte ihre eigenen Karten frei darauf -
  // die Uebersichtsseite hat das als Erste anders gemacht und ihre Boxen von
  // Hand gebaut. Seitdem gab es zwei Muster fuer dasselbe. Jetzt gibt es
  // eins, und die 60 Abschnitte der Modulansichten ziehen mit.
  //
  // Der Anker bleibt an der aeusseren Box: ein Verweis darauf soll vor dem
  // Rahmen halten, nicht darin.
  return (
    <section
      id={id}
      className={cn(
        "rounded-2xl border border-border bg-card p-5 shadow-sm shadow-black/[0.03] sm:p-6",
        id ? "scroll-mt-20" : undefined,
        className,
      )}
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-bold text-card-foreground">{title}</h2>
          {description ? (
            <p className="mt-0.5 schrift-dense text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
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

/**
 * Aufklappbarer Abschnitt.
 *
 * <details> statt eines eigenen Zustands: Der Inhalt soll den Blick auf das
 * Wesentliche nicht verstellen, aber die Seite bleibt Server Component, und
 * ohne JavaScript muss das Aufklappen trotzdem gehen (DESIGN.md Regel 6). Das
 * Sidebar-Muster mit aria-expanded braucht beides nicht zu leisten, es laeuft
 * ohnehin im Browser.
 *
 * Lag urspruenglich privat in finanzen-ansicht.tsx. Hochgezogen, als die
 * Wirtschaftlichkeitsseite denselben Baustein brauchte - zwei Kopien
 * derselben Zeile laufen auseinander, ohne dass eine von beiden falsch
 * aussieht (DESIGN.md Regel 2).
 */
export function Aufklapper({
  titel,
  beschreibung,
  symbol,
  variante = "standard",
  ref,
  children,
}: {
  titel: string;
  beschreibung?: string;
  /** Vor dem Titel, etwa ein Plus fuer "+ Neu ..." (DESIGN.md Abschnitt 14). */
  symbol?: ReactNode;
  /** "aktion": Titel in Primaerfarbe - der Knopf zum Anlegen ueber einer Liste. */
  variante?: "standard" | "aktion";
  /** Wer das Formular nach dem Speichern zuklappen will, braucht das <details>. */
  ref?: Ref<HTMLDetailsElement>;
  children: ReactNode;
}) {
  return (
    <details ref={ref} className="group rounded-xl border border-border bg-card">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition duration-knapp hover:bg-muted/30 lg:min-h-9 [&::-webkit-details-marker]:hidden">
        <span>
          <span
            className={cn(
              variante === "aktion"
                ? "inline-flex items-center gap-2 text-sm font-bold text-primary lg:text-xs"
                : "schrift-dense font-black text-card-foreground",
            )}
          >
            {symbol}
            {titel}
          </span>
          {beschreibung ? (
            <span className="mt-0.5 block schrift-label text-muted-foreground">
              {beschreibung}
            </span>
          ) : null}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-muted-foreground transition duration-knapp group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="border-t border-border p-4">{children}</div>
    </details>
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
// faellt es niemandem auf. Deshalb steht der Fall in
// supabase/tests/kit-bausteine.tsx auf dem Pruefstand, in beiden Richtungen.
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
        // Die Tabelle steht in einer Abschnittsbox und darf deren Flaeche
        // nicht wiederholen - sonst liegt Karte auf Karte. Der Rahmen bleibt,
        // er grenzt die Tabelle nach aussen ab.
        "datentabelle rounded-xl border border-border bg-muted/20 md:overflow-x-auto",
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

// ---------------------------------------------------------------------------
// Knopf
//
// WMC-Vibecode-Cleanup-Fund: Es gab keine Knopf-Komponente. Die Klassenkette
// des Primaerknopfes stand in 13 Dateien einzeln geschrieben, in sieben
// Varianten, die sich in Kleinigkeiten unterscheiden - mal rounded-xl, mal
// rounded-lg, mal font-bold, mal font-semibold, mal hover:brightness-110, mal
// hover:bg-primary/90. Zwei Dateien (die beiden 404-Seiten) hatten gar kein
// transition, weil beim Kopieren ein Stueck fehlte.
//
// Drei Dinge, die dadurch nirgends standen:
//
//   1. Ein Druckzustand. `active:` kam im gesamten src/ kein einziges Mal vor.
//      Auf dem Handy loest hover nicht aus - dort gab es also beim Tippen
//      ueberhaupt keine Rueckmeldung, bis die naechste Seite kam.
//   2. Eine Ladeanzeige ohne Sprung. Der Formularknopf tauschte seinen Text
//      gegen aktionen.laeuft, und das ist in de.json "..." - aus "Anlegen"
//      wurden drei Punkte, der Knopf sprang mitten im Klick auf ein Drittel
//      seiner Breite.
//   3. Eine Stelle, an der sich das aendern laesst.
//
// Die Ladeanzeige liegt deshalb UEBER dem Inhalt statt an seiner Stelle: der
// Text bleibt stehen und wird nur durchsichtig, die Breite bleibt exakt, wie
// sie war. opacity-0 und nicht invisible - visibility: hidden nimmt das
// Element auch aus dem Baum fuer Screenreader, und dann haette der Knopf
// waehrend des Ladens keinen Namen mehr.
//
// Groesse und Radius bleiben Eingaben statt Vorgaben: die Masse gehen im
// Bestand wirklich auseinander (h-9 in der Kopfzeile, h-11 im Formular), und
// diese Komponente soll das Verhalten vereinheitlichen, nicht das Layout
// umbauen. Einzelfaelle - der Schatten am Portalknopf, px-5 auf den
// Marketingseiten - kommen weiter ueber className; cn() setzt tailwind-merge
// ein, die spaetere Angabe gewinnt also verlaesslich.
// ---------------------------------------------------------------------------

export type KnopfVariante = "primaer" | "leise";
export type KnopfRundung = "kante" | "schmal" | "pille";
export type KnopfGroesse = "schlank" | "mittel" | "gross" | "formular";

// duration-knapp (120 ms, globals.css) statt der 200 ms, die sonst gelten:
// Ein Druck soll sofort sichtbar sein. Der Standardwert ist auf Wege
// ausgelegt, die man verfolgt - hier geht es um eine Bestaetigung.
const knopfBasis =
  "relative inline-flex items-center justify-center gap-2 text-sm font-bold transition duration-knapp active:scale-[0.97]";

const knopfVariante: Record<KnopfVariante, string> = {
  // active nach hover: Tailwind sortiert die Varianten in dieser Reihenfolge,
  // die spaetere Regel gewinnt also beim gleichzeitigen Zeigen und Druecken.
  primaer:
    "bg-primary text-primary-foreground hover:brightness-110 active:brightness-95",
  leise:
    "border border-border bg-card text-foreground hover:border-primary active:bg-muted",
};

const knopfRundung: Record<KnopfRundung, string> = {
  kante: "rounded-xl",
  schmal: "rounded-lg",
  pille: "rounded-full",
};

const knopfGroesse: Record<KnopfGroesse, string> = {
  schlank: "h-9 px-4",
  mittel: "h-10 px-4",
  gross: "h-11 px-4",
  // Die Formularknoepfe des Dashboards werden ab lg schmaler, damit in die
  // zweispaltigen Masken mehr Zeilen passen.
  formular: "h-11 px-4 lg:h-9 lg:px-3 lg:text-xs",
};

/**
 * Die Klassenkette eines Knopfes, fuer alles, was kein <button> ist: <Link>,
 * <a>. Der Druckzustand haengt an der Klasse, gilt dort also mit.
 */
export function knopfKlassen({
  variante = "primaer",
  rundung = "kante",
  groesse = "gross",
  breit,
  className,
}: {
  variante?: KnopfVariante;
  rundung?: KnopfRundung;
  groesse?: KnopfGroesse;
  breit?: boolean;
  className?: string;
} = {}) {
  return cn(
    knopfBasis,
    knopfVariante[variante],
    knopfRundung[rundung],
    knopfGroesse[groesse],
    breit && "w-full",
    className,
  );
}

export function Button({
  variante = "primaer",
  rundung = "kante",
  groesse = "gross",
  breit,
  laedt,
  disabled,
  className,
  children,
  ...rest
}: {
  variante?: KnopfVariante;
  rundung?: KnopfRundung;
  groesse?: KnopfGroesse;
  breit?: boolean;
  /** Laeuft gerade: Anzeige ueber dem Inhalt, Knopf gesperrt, Breite bleibt. */
  laedt?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      disabled={disabled || laedt}
      aria-busy={laedt ? true : undefined}
      className={knopfKlassen({
        variante,
        rundung,
        groesse,
        breit,
        className: cn(
          // Waehrend des Ladens nicht abblenden: der Knopf ist nicht
          // ausgegraut, er arbeitet. Das unterscheidet ihn von einem Knopf,
          // der gerade nicht darf.
          laedt
            ? "cursor-wait"
            : "disabled:cursor-not-allowed disabled:opacity-60",
          className,
        ),
      })}
    >
      <span className={cn("inline-flex items-center gap-2", laedt && "opacity-0")}>
        {children}
      </span>
      {laedt ? (
        <span
          className="absolute inset-0 inline-flex items-center justify-center"
          aria-hidden="true"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
        </span>
      ) : null}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Reiter, Filterpillen, Tabellenfuss
//
// Drei Bausteine fuer Seiten, die zu lang geworden sind: die Inhalte auf
// Reiter verteilen, den Ausschnitt ueber Filter begrenzen, den Rest
// nachladen. Alles laeuft ueber die Adresszeile und wird serverseitig
// gerendert - dasselbe Vorgehen wie beim Statusfilter in
// reihenbloecke-ansicht.tsx und pflanzenschutz-ansicht.tsx.
//
// Warum die Reiter KEIN role="tablist" tragen, obwohl sie so aussehen: Das
// ARIA-Reitermuster verspricht Bedienung mit den Pfeiltasten und Reiter, die
// nichts anfassen ausser dem Sichtbaren. Hier sind es Verweise, die die Seite
// neu laden - die Adresse aendert sich, der Zurueck-Knopf wirkt, ein Link auf
// einen Reiter ist teilbar. Waeren sie als Reiter ausgezeichnet, wuerde die
// Rolle Pfeiltasten ankuendigen, die es ohne JavaScript nicht gibt, und die
// Ankuendigung "Reiter 2 von 3" stuende vor einem Seitenwechsel. Ein <nav> mit
// aria-current sagt beides richtig. DESIGN.md Regel 6 verlangt ausserdem, dass
// die Oberflaeche ohne JavaScript benutzbar bleibt.
// ---------------------------------------------------------------------------

export type Ziel = ComponentProps<typeof Link>["href"];

/**
 * Knopf nur mit Symbol: Pfeile und Schliessen im Kopf der Detailansicht.
 * relative, weil ein LadeMelder darin stehen kann.
 */
export const symbolKnopfKlassen =
  "relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition duration-knapp hover:bg-muted hover:text-foreground lg:h-9 lg:w-9";

/** Verweis als Text in Primaerfarbe, etwa "Zuruecksetzen" neben Filtern. */
export const textVerweisKlassen =
  "inline-flex min-h-11 items-center text-sm font-semibold text-primary lg:min-h-9 lg:text-xs";

export interface LeistenEintrag {
  wert: string;
  text: string;
  /** Trefferzahl hinter dem Text, etwa bei Status-Pillen ueber einer Liste. */
  anzahl?: string;
}

// Masse nach DESIGN.md Abschnitt 10: 44 px Tippflaeche bis lg, darueber 36 px.
const leistenMass = "min-h-11 lg:min-h-9";

// Drei Schalter fuer Reiter und Pillen, die in einer Liste mit Detailansicht
// stehen (DESIGN.md Abschnitt 14). Ohne sie verhalten sich beide wie bisher.
interface LeistenVerhalten {
  /**
   * Ersetzt den Verlaufseintrag statt einen neuen anzulegen. Fuer Reiter der
   * Detailansicht: Zurueck soll sie schliessen, nicht jeden Reiter abschreiten.
   */
  ersetzen?: boolean;
  /** false: kein Vorladen. Dann zeigt ein Melder verlaesslich, dass geladen wird. */
  vorladen?: boolean;
  /** Steht in jedem Link, etwa ein LadeMelder (ui/lade-status.tsx). */
  melder?: ReactNode;
}

export function Reiter({
  label,
  eintraege,
  aktiv,
  ziel,
  ersetzen,
  vorladen,
  melder,
  dicht,
}: {
  /** Beschriftung der Navigation fuer Screenreader. */
  label: string;
  eintraege: LeistenEintrag[];
  aktiv: string;
  ziel: (wert: string) => Ziel;
  /**
   * Schmalere Mindestbreite je Reiter, fuer enge Flaechen wie die
   * Detailansicht (mindestens 26rem): drei Reiter passen dort sonst nicht in
   * eine Zeile.
   */
  dicht?: boolean;
} & LeistenVerhalten) {
  return (
    <nav
      aria-label={label}
      className="flex flex-wrap gap-1 rounded-xl border border-border bg-muted/20 p-1"
    >
      {eintraege.map((eintrag) => {
        const ist = eintrag.wert === aktiv;
        return (
          <Link
            key={eintrag.wert}
            href={ziel(eintrag.wert)}
            scroll={false}
            replace={ersetzen}
            prefetch={vorladen === false ? false : undefined}
            aria-current={ist ? "page" : undefined}
            className={cn(
              // basis-32 statt fester Breiten: auf schmalen Schirmen brechen
              // lange Beschriftungen in eine zweite Reihe, statt abgeschnitten
              // zu werden. Ein gekuerzter Reitername ist kein Reitername mehr.
              "relative inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-center text-sm font-semibold transition duration-knapp lg:text-xs",
              dicht ? "basis-24" : "basis-32",
              leistenMass,
              ist
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-card hover:text-foreground",
            )}
          >
            {eintrag.text}
            {eintrag.anzahl ? (
              <span className="tabular-nums opacity-80">{eintrag.anzahl}</span>
            ) : null}
            {melder}
          </Link>
        );
      })}
    </nav>
  );
}

// Pillen sind Filter: jeder Wechsel legt einen Verlaufseintrag an, Zurueck
// fuehrt zum vorigen Filter. Deshalb kein "ersetzen" wie bei den Reitern.
export function FilterPillen({
  label,
  eintraege,
  aktiv,
  ziel,
  rollen,
  vorladen,
  melder,
}: {
  label: string;
  eintraege: LeistenEintrag[];
  aktiv: string;
  ziel: (wert: string) => Ziel;
  /**
   * Auf dem Handy eine Reihe zum Wischen statt mehrerer Zeilen: fuenf Pillen
   * mit Zahlen braechen bei 390 px in drei Zeilen um und schoeben die Liste
   * nach unten.
   */
  rollen?: boolean;
} & Omit<LeistenVerhalten, "ersetzen">) {
  return (
    <nav
      aria-label={label}
      className={cn(
        "flex flex-wrap gap-2",
        rollen && "max-md:-mx-1 max-md:flex-nowrap max-md:overflow-x-auto max-md:px-1 max-md:pb-1",
      )}
    >
      {eintraege.map((eintrag) => {
        const ist = eintrag.wert === aktiv;
        return (
          <Link
            key={eintrag.wert}
            href={ziel(eintrag.wert)}
            scroll={false}
            prefetch={vorladen === false ? false : undefined}
            aria-current={ist ? "true" : undefined}
            className={cn(
              "relative inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition duration-knapp",
              leistenMass,
              ist
                ? "border-primary bg-primary/5 text-foreground"
                : "border-border bg-card text-muted-foreground hover:border-primary/40",
            )}
          >
            {eintrag.text}
            {eintrag.anzahl ? (
              <span
                className={cn(
                  "rounded-full px-1.5 tabular-nums",
                  ist ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                )}
              >
                {eintrag.anzahl}
              </span>
            ) : null}
            {melder}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Nachladezeile unter einer Tabelle. Steht als letztes Kind in DataTable.
 *
 * colSpan ueber alle Spalten: mitSpaltenkopf() laesst solche Zellen bewusst
 * ohne data-kopf, sie sind Meldungen und keine Werte. Unter md rendert
 * globals.css sie einspaltig und ohne Beschriftung.
 */
export function TabellenFuss({
  spalten,
  text,
  ziel,
}: {
  spalten: number;
  text: string;
  ziel: Ziel;
}) {
  return (
    <tr>
      <td colSpan={spalten} className="px-3 py-2">
        <Link
          href={ziel}
          scroll={false}
          className={knopfKlassen({
            variante: "leise",
            rundung: "schmal",
            groesse: "formular",
            breit: true,
          })}
        >
          {text}
        </Link>
      </td>
    </tr>
  );
}
