"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { leer, type AktionsStatus } from "@/lib/actions/status";
import { Button, feldKlassen } from "@/components/ui/kit";
import { haptikEreignis, haptikTipp } from "@/lib/haptik";

// Kleine Bausteine fuer die Verwaltungsformulare der DB-gestuetzten Module.
// Bewusst schlicht gehalten: gleiche Hoehe, gleiche Radien wie im uebrigen
// Dashboard, keine eigene Formularbibliothek.

// Die Feldklassen stehen seit WMCNL-2488 in ui/kit.tsx, weil auch die
// Filterleiste der Listen (ui/listen-filter.tsx) sie braucht.

// WMC-Vibecode-Cleanup-Fund: bis hierher praktisch wortgleich in rund 15
// *-formulare.tsx-Dateien einzeln neu geschrieben (immer derselbe versteckte
// "pfad"-Pfad, den aktualisiere() in den jeweiligen Server Actions ausliest,
// um gezielt revalidatePath() aufzurufen). Jetzt eine einzige Stelle.
export function PfadFeld() {
  const pfad = usePathname();
  return <input type="hidden" name="pfad" value={pfad} />;
}

// Anforderung 2.6: bei zeitkritischen Aktionen (Pflueckbeginn, Kuehlmessung,
// Steigen-Scan) muss die lokale Geraeteuhr im Moment des Tippens in ein
// verstecktes Feld geschrieben werden - nicht die Serverzeit beim Eintreffen
// der Anfrage, die bei verzoegerter Synchronisierung (kein Netz im Feld) weit
// vom tatsaechlichen Ereignis abweichen kann. onSubmit statt onClick: laeuft
// synchron unmittelbar vor dem Absenden, auch bei Enter-Bestaetigung im
// Formular, nicht nur bei Klick auf den Knopf.
export function mitGeraetZeitstempel(feld: string) {
  return (event: FormEvent<HTMLFormElement>) => {
    const eingabe = event.currentTarget.elements.namedItem(feld);
    if (eingabe instanceof HTMLInputElement) {
      eingabe.value = new Date().toISOString();
    }
  };
}

/**
 * useActionState fuer ein Formular, das seine Eingaben behaelt.
 *
 * React 19 setzt ein Formular mit action={...} nach jedem Absenden auf seine
 * Ausgangswerte zurueck, auch nach einer Fehlermeldung. Wer sich vertippt, muss
 * dann alles neu eintragen (WMCNL-2297, WMCNL-2383), und ein Bearbeiten-Formular
 * zeigt nach dem Speichern wieder den alten Stand (WMCNL-2310).
 *
 * Der Reset ist ein gewoehnliches form.reset() und feuert ein abbrechbares
 * "reset"-Ereignis. Ein onReset-Handler von React hilft nicht: React schaltet
 * seine eigenen Ereignisse waehrend des Commits ab, in dem es zuruecksetzt. Der
 * Listener haengt deshalb nativ am Formular, und die Ref-Funktion ist stabil,
 * sonst haengt React sie im selben Commit vor dem Reset ab.
 *
 * nach "fehler": nur nach einer Fehlermeldung bleiben die Eingaben (Anlegen-
 * Formulare leeren sich nach Erfolg wie bisher). Nach "immer": auch nach
 * Erfolg (Bearbeiten-Formulare, die den gespeicherten Stand zeigen). Eine
 * Funktion entscheidet je Ergebnis selbst; sie muss unveraenderlich sein (eine
 * Konstante oder Modulfunktion), weil die Ref-Funktion stabil bleiben muss.
 * anfang ist der Startwert, wenn der Rueckgabetyp mehr traegt als AktionsStatus.
 * formProps gehoeren auf das form-Element: <form {...formProps}>.
 */
export function useBehalteEingaben<S extends Pick<AktionsStatus, "stand"> = AktionsStatus>(
  aktion: (vorher: S, daten: FormData) => Promise<S>,
  nach: "fehler" | "immer" | ((ergebnis: S) => boolean) = "fehler",
  anfang: S = leer as unknown as S,
) {
  const letztes = useRef<S | null>(null);
  // Awaited<S>: useActionState verlangt den ausgepackten Typ, TypeScript kann
  // bei einem Typparameter nicht wissen, dass S kein Promise ist.
  const [status, formAction, pending] = useActionState(
    async (vorher: Awaited<S>, daten: FormData): Promise<Awaited<S>> => {
      const ergebnis = await aktion(vorher as S, daten);
      letztes.current = ergebnis;
      return ergebnis as Awaited<S>;
    },
    anfang as Awaited<S>,
  );
  const formRef = useCallback(
    (form: HTMLFormElement | null) => {
      if (!form) return;
      const beiReset = (event: Event) => {
        const ergebnis = letztes.current;
        if (!ergebnis) return;
        const behalten =
          typeof nach === "function"
            ? nach(ergebnis)
            : ergebnis.stand === "fehler" || (nach === "immer" && ergebnis.stand === "ok");
        if (behalten) event.preventDefault();
      };
      form.addEventListener("reset", beiReset);
      return () => form.removeEventListener("reset", beiReset);
    },
    [nach],
  );
  return { status, pending, formProps: { action: formAction, ref: formRef } };
}

export function Feld({
  label,
  name,
  type = "text",
  required,
  placeholder,
  defaultValue,
  value,
  onChange,
  inputMode,
  form,
  hinweis,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
  /** Gesteuertes Feld: der Eltern-Zustand bestimmt den Wert (bleibt nach einem Fehler erhalten, wird nach einem Erfolg geleert). */
  value?: string;
  onChange?: (wert: string) => void;
  inputMode?: "text" | "decimal";
  form?: string;
  /** Kurzer Hinweis unter dem Feld, etwa die Zeitzone; Vorlesehilfen lesen ihn mit. */
  hinweis?: string;
}) {
  const hinweisId = useId();
  return (
    <label className="block space-y-1">
      <span className="schrift-label font-semibold text-card-foreground">
        {label}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        {...(value !== undefined ? { value, onChange: (e) => onChange?.(e.target.value) } : { defaultValue })}
        inputMode={inputMode}
        form={form}
        aria-describedby={hinweis ? hinweisId : undefined}
        className={feldKlassen}
      />
      {hinweis ? (
        <span id={hinweisId} className="block schrift-label text-muted-foreground">
          {hinweis}
        </span>
      ) : null}
    </label>
  );
}

export function Auswahl({
  label,
  name,
  options,
  gruppen,
  required,
  defaultValue,
  value,
  onChange,
  beiAenderung,
}: {
  label: string;
  name: string;
  options: { wert: string; text: string; disabled?: boolean }[];
  /**
   * Zusaetzliche Eintraege unter Ueberschriften, hinter den options. Fuer
   * Listen, die zu lang zum Ueberfliegen sind - etwa Kostentraeger nach
   * Erntetag. Ohne gruppen bleibt alles wie zuvor.
   */
  gruppen?: { titel: string; options: { wert: string; text: string }[] }[];
  required?: boolean;
  defaultValue?: string;
  /** Gesteuerte Auswahl, siehe Feld. */
  value?: string;
  onChange?: (wert: string) => void;
  /** Meldet die gewaehlte Option, ohne das Feld selbst zu steuern (es bleibt unkontrolliert). */
  beiAenderung?: (wert: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="schrift-label font-semibold text-card-foreground">
        {label}
      </span>
      <select
        name={name}
        required={required}
        {...(value !== undefined ? { value } : { defaultValue })}
        onChange={
          onChange || beiAenderung
            ? (event) => {
                onChange?.(event.target.value);
                beiAenderung?.(event.target.value);
              }
            : undefined
        }
        className={feldKlassen}
      >
        {options.map((option) => (
          <option key={option.wert} value={option.wert} disabled={option.disabled}>
            {option.text}
          </option>
        ))}
        {gruppen?.map((gruppe, i) => (
          <optgroup key={`${gruppe.titel}-${i}`} label={gruppe.titel}>
            {gruppe.options.map((option) => (
              <option key={option.wert} value={option.wert}>
                {option.text}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

// Was der Knopf vom Ergebnis wissen muss, ist nur der Stand. So passen auch
// Rueckgabewerte, die mehr tragen als AktionsStatus (Zukauf-Import).
type ErgebnisStand = Pick<AktionsStatus, "stand">;

// Wie lange das Haekchen nach dem Speichern steht, bevor der Knopf wieder
// seine Beschriftung zeigt.
const HAEKCHEN_MS = 1400;

/**
 * Rueckmeldung nach dem Absenden: Haekchen im Knopf (K3) und Haptik.
 *
 * Jede Server Action liefert ein neues Objekt, auch bei gleichem Stand. Der
 * Vergleich mit dem zuletzt gesehenen passiert deshalb waehrend des Renderns
 * (React-Doku, "Storing information from previous renders"). Der erste Wert
 * zaehlt nicht als Ergebnis - beim Oeffnen eines Formulars meldet sich nichts.
 */
function useAbsendeErgebnis(status: ErgebnisStand | undefined): boolean {
  const [gesehen, setGesehen] = useState(status);
  const [neu, setNeu] = useState<ErgebnisStand | null>(null);
  const [haekchen, setHaekchen] = useState(false);
  if (status !== gesehen) {
    setGesehen(status);
    setNeu(status ?? null);
    setHaekchen(status?.stand === "ok");
  }

  useEffect(() => {
    if (neu?.stand === "ok") haptikEreignis("erfolg");
    if (neu?.stand === "fehler") haptikEreignis("fehler");
  }, [neu]);

  // neu in den Abhaengigkeiten: ein zweiter Erfolg kurz nach dem ersten
  // startet die Uhr neu, statt das Haekchen zu frueh zu nehmen.
  useEffect(() => {
    if (!haekchen) return;
    const uhr = window.setTimeout(() => setHaekchen(false), HAEKCHEN_MS);
    return () => window.clearTimeout(uhr);
  }, [haekchen, neu]);

  return haekchen;
}

export function SubmitKnopf({
  label,
  variante = "primaer",
  form,
  pending: pendingProp,
  status,
  symbol,
  breit,
  name,
  wert,
}: {
  label?: string;
  variante?: "primaer" | "leise";
  // Nur gesetzt, wenn der Knopf ausserhalb des eigenen <form> steht (per
  // form-Attribut verknuepft) - dann greift useFormStatus() nicht, da es den
  // umschliessenden <form>-Vorfahren im Baum braucht, keine HTML-Verknuepfung
  // per form="...". Ohne form-Prop bleibt das bisherige Verhalten unveraendert.
  form?: string;
  pending?: boolean;
  // Ergebnis der Server Action (useActionState). Mit ihm zeigt der Knopf nach
  // dem Speichern kurz das Haekchen, und das Geraet meldet sich (Haptik).
  status?: ErgebnisStand;
  /** Symbol vor der Beschriftung, etwa in der Nachweiskette. */
  symbol?: ReactNode;
  breit?: boolean;
  /** Name und Wert des Knopfs gehen mit ins Formular: ein Formular, zwei Wege (Pruefen, Importieren). */
  name?: string;
  wert?: string;
}) {
  const { pending: kontextPending } = useFormStatus();
  const pending = pendingProp ?? (form ? false : kontextPending);
  const erledigt = useAbsendeErgebnis(status);
  const t = useTranslations("aktionen");
  const text = label ?? t("anlegen");

  return (
    <Button
      type="submit"
      form={form}
      name={name}
      value={wert}
      laedt={pending}
      erledigt={erledigt}
      variante={variante}
      rundung="schmal"
      groesse="formular"
      breit={breit}
      // iPhone: der Tick muss in der Beruehrung selbst passieren, nach dem
      // Speichern ist es dafuer zu spaet (lib/haptik.ts).
      onClick={haptikTipp}
    >
      {symbol}
      {text}
    </Button>
  );
}

export function AktionsMeldung({ status }: { status: AktionsStatus }) {
  const t = useTranslations("aktionen");
  if (status.stand === "leer" || !status.meldung) return null;

  const gut = status.stand === "ok";
  const Symbol = gut ? CheckCircle2 : AlertCircle;

  return (
    <p
      role="status"
      className={`flex items-start gap-1.5 rounded-lg border p-2 schrift-label font-semibold ${
        gut
          ? "border-success/25 bg-success/[0.08] text-success"
          : "border-destructive/25 bg-destructive/[0.06] text-destructive"
      }`}
    >
      <Symbol className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      {t(status.meldung, { wert: status.wert ?? "" })}
    </p>
  );
}

export function FormularKarte({
  id,
  titel,
  beschreibung,
  children,
}: {
  // Sprungziel fuer "... anlegen" aus einem Leerzustand (LeererZustand mit
  // anlegen, Ziele in lib/formular-ziele.ts).
  // scroll-mt-20 haelt die Karte unter der fixierten Kopfzeile frei, wie bei
  // Section; target: zeigt, bei welchem Formular man gelandet ist.
  id?: string;
  titel: string;
  beschreibung?: string;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      className="scroll-mt-20 rounded-xl border border-border bg-card p-4 target:border-primary/60 target:ring-2 target:ring-primary/20"
    >
      <p className="schrift-dense font-black text-card-foreground">{titel}</p>
      {beschreibung ? (
        <p className="mt-0.5 schrift-label text-muted-foreground">
          {beschreibung}
        </p>
      ) : null}
      <div className="mt-3 space-y-2.5">{children}</div>
    </div>
  );
}
