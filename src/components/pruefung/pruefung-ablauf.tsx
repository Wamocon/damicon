"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { BookOpen, Check, ChevronDown, Database, Sparkles, type LucideIcon } from "lucide-react";
import { Himbi } from "@/components/haustier/himbi";
import "@/components/haustier/haustier.css";
import { BEREICH_SYMBOL } from "@/components/pruefung/symbole";
import type { AgentStand, FeldStand, LogZeile, PruefungStand } from "@/components/pruefung/use-pruefung";
import type { HaustierZustand } from "@/lib/haustier";
import type { Pruefbereich } from "@/lib/pruefung/rollen";
import type { Befund } from "@/lib/pruefung/typen";
import { cn } from "@/lib/utils";

// Der Ablauf einer Pruefung im KI-Panel, als Arbeitsablauf gezeichnet:
//   Himbi (Orchestrator) -> Strang -> je Bereich eine Spur (Mini-Himbi), alle gleichzeitig -> Zusammenfuehren
// Jede Spur zeigt ihre Pruefungsfelder mit drei Schritten (Betriebsdaten, Recht, Bewertung), die Fundstelle
// erscheint, sobald die Suche sie gefunden hat, und das Ergebnis, sobald bewertet ist. Fertige Spuren feiern,
// loesen sich auf und klappen zu. Alles im normalen Fluss (Grid), nichts wird absolut ueber anderes gelegt,
// bewegt werden nur transform und opacity.

const ZUSTAND: Record<AgentStand["phase"], HaustierZustand> = { wartet: "schlaeft", spawn: "denkt", sammelt: "denkt", denkt: "denkt", fertig: "fertig", fehler: "traurig" };
const FUNKEN = Array.from({ length: 10 }, (_, i) => i * 36);

function useTakt(aktiv: boolean): number {
  const [jetzt, setJetzt] = useState(() => Date.now());
  useEffect(() => {
    if (!aktiv) return;
    const id = setInterval(() => setJetzt(Date.now()), 500);
    return () => clearInterval(id);
  }, [aktiv]);
  return jetzt;
}

const sekunden = (ms: number) => `${Math.max(0, Math.round(ms / 1000))} s`;
function uhr(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
const kurz = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}...` : text);

type SchrittZustand = "offen" | "aktiv" | "fertig";

function Schritt({ symbol: Symbol, name, zustand, zahl }: { symbol: LucideIcon; name: string; zustand: SchrittZustand; zahl: number | null }) {
  return (
    <li className="pa-schritt" data-zustand={zustand}>
      <span className="pa-schritt__zeichen" aria-hidden>
        {zustand === "fertig" ? <Check className="h-3 w-3" /> : zustand === "aktiv" ? <span className="pa-dreher" /> : <Symbol className="h-3 w-3" />}
      </span>
      <span>{name}</span>
      {zustand === "fertig" && zahl !== null ? <b>{zahl}</b> : null}
    </li>
  );
}

function FeldZeile({ f, befund }: { f: FeldStand; befund: Befund | undefined }) {
  const t = useTranslations("pruefung");
  const ta = useTranslations("pruefungAblauf");
  const datenFertig = f.daten !== null;
  const rechtFertig = f.quellen !== null;
  const zDaten: SchrittZustand = !f.gestartet ? "offen" : datenFertig ? "fertig" : "aktiv";
  const zRecht: SchrittZustand = !f.gestartet ? "offen" : rechtFertig ? "fertig" : "aktiv";
  const zBewertung: SchrittZustand = f.bewertet ? "fertig" : f.gestartet && datenFertig && rechtFertig ? "aktiv" : "offen";
  return (
    <li className="pa-feld" data-fertig={f.bewertet ? "ja" : "nein"} data-status={befund?.status}>
      <div className="pa-feld__kopf">
        <span className="pa-feld__titel">{f.titel}</span>
        {befund ? <span className="pr-status" data-status={befund.status}>{t(`status.${befund.status}`)}</span> : null}
      </div>
      <ul className="pa-schritte">
        <Schritt symbol={Database} name={ta("schritt.daten")} zustand={zDaten} zahl={f.daten} />
        <Schritt symbol={BookOpen} name={ta("schritt.recht")} zustand={zRecht} zahl={f.quellen} />
        <Schritt symbol={Sparkles} name={ta("schritt.bewertung")} zustand={zBewertung} zahl={null} />
      </ul>
      {f.stelle && rechtFertig ? (
        <p className="pa-stelle">
          <BookOpen className="h-3 w-3" aria-hidden /> {kurz(f.stelle, 90)}
        </p>
      ) : null}
      {befund ? <p className="pa-feld__befund">{befund.titel}</p> : null}
    </li>
  );
}

function Lane({ bereich, a, befunde, jetzt, laeuft }: { bereich: Pruefbereich; a: AgentStand; befunde: Befund[]; jetzt: number; laeuft: boolean }) {
  const t = useTranslations("pruefung");
  const ta = useTranslations("pruefungAblauf");
  const [manuell, setManuell] = useState<boolean | null>(null);
  const wartet = a.phase === "wartet";
  const fertig = a.phase === "fertig";
  const fehler = a.phase === "fehler";
  const aktiv = a.phase === "spawn" || a.phase === "sammelt" || a.phase === "denkt";
  const lebt = !wartet;
  // Fertige Spuren feiern kurz und klappen dann von selbst zu; wartende bleiben zu, bis sie losgeschickt werden.
  const zuAuto = wartet || ((fertig || fehler) && (!laeuft || (a.ende !== null && jetzt - a.ende > 2600)));
  const zu = manuell ?? zuAuto;
  const Symbol = BEREICH_SYMBOL[bereich];
  const felder = a.reihenfolge.map((id) => ({ id, f: a.felder[id]! }));
  const quellen = felder.reduce((s, x) => s + (x.f.quellen ?? 0), 0);
  const dauer = a.seit ? (a.ende ?? jetzt) - a.seit : 0;

  let untertitel = t("agent.wartet");
  if (a.phase === "spawn" || a.phase === "sammelt") {
    const stelle = [...felder].reverse().find((x) => x.f.stelle)?.f.stelle;
    untertitel = stelle ? t("agent.fand", { stelle: kurz(stelle, 44) }) : t("agent.sammelt");
  } else if (a.phase === "denkt") {
    const offen = felder.find((x) => !x.f.bewertet);
    untertitel = offen ? t("agent.bewertet", { feld: kurz(offen.f.titel, 38) }) : t("agent.denkt");
  } else if (fertig) untertitel = ta("lane.fertig", { n: a.befunde, q: quellen });
  else if (fehler) untertitel = t("agent.fehler");

  return (
    <li className="pa-lane" data-phase={a.phase} data-lebt={lebt ? "ja" : "nein"} data-zu={zu ? "ja" : "nein"}>
      <button type="button" className="pa-lane__kopf" onClick={() => setManuell(!zu)} aria-expanded={!zu}>
        <span className="pa-lane__avatar" aria-hidden>
          {(fertig || fehler) && zu ? (
            <span className="pa-lane__haken" data-fehler={fehler ? "ja" : "nein"}>{fehler ? "!" : <Check className="h-4 w-4" />}</span>
          ) : (
            <Himbi zustand={ZUSTAND[a.phase]} groesse={26} />
          )}
          {fertig && !zu ? (
            <span className="pa-funken">
              {FUNKEN.map((w) => (
                <i key={w} style={{ ["--w" as string]: `${w}deg` }} />
              ))}
            </span>
          ) : null}
        </span>
        <span className="pa-lane__titel">
          <span className="pa-lane__name">
            <Symbol className="h-3.5 w-3.5" aria-hidden /> {t(`agent.name.${bereich}`)}
          </span>
          <small key={`${a.phase}-${untertitel}`}>{untertitel}</small>
        </span>
        <span className="pa-lane__zeit">{lebt ? sekunden(dauer) : ""}</span>
        <ChevronDown className="pa-lane__pfeil h-4 w-4" aria-hidden />
      </button>
      <div className="pa-fortschritt" aria-hidden data-aktiv={aktiv ? "ja" : "nein"}>
        {felder.map(({ id, f }) => (
          <span key={id} data-zustand={f.bewertet ? "fertig" : f.daten !== null && f.quellen !== null ? "daten" : "offen"} />
        ))}
      </div>
      <div className="pa-lane__koerper">
        <div className="pa-lane__innen">
          <ul className="pa-felder">
            {felder.map(({ id, f }) => (
              <FeldZeile key={id} f={f} befund={befunde.find((b) => b.feld === id)} />
            ))}
          </ul>
        </div>
      </div>
    </li>
  );
}

type Stufe = "wartet" | "sammelt" | "denkt" | "fertig";

const STUFE_ZUSTAND: Record<Stufe, HaustierZustand> = { wartet: "schlaeft", sammelt: "denkt", denkt: "denkt", fertig: "fertig" };

function stufeVon(f: FeldStand): Stufe {
  if (f.bewertet) return "fertig";
  if (f.denkt || (f.daten !== null && f.quellen !== null)) return "denkt";
  return f.gestartet ? "sammelt" : "wartet";
}

/** Drei Stationen je Feld: Sammler (Betriebsdaten), Jurist (Recht), Pruefer (Bewertung). Sammler und Jurist arbeiten zugleich, dann uebergeben beide. */
function Stationen({ f, stufe }: { f: FeldStand; stufe: Stufe }) {
  const sammler: SchrittZustand = f.daten !== null ? "fertig" : f.gestartet ? "aktiv" : "offen";
  const jurist: SchrittZustand = f.quellen !== null ? "fertig" : f.gestartet ? "aktiv" : "offen";
  const pruefer: SchrittZustand = stufe === "fertig" ? "fertig" : stufe === "denkt" ? "aktiv" : "offen";
  return (
    <span className="pa-stationen" aria-hidden>
      <i data-zustand={sammler}><Database className="h-2 w-2" /></i>
      <i data-zustand={jurist}><BookOpen className="h-2 w-2" /></i>
      <i key={pruefer} data-zustand={pruefer} data-uebergabe={pruefer === "aktiv" ? "ja" : "nein"}><Sparkles className="h-2 w-2" /></i>
    </span>
  );
}

/** Alle Mini-Himbis auf einen Blick: je Bereich eine Zeile, je Pruefungsfeld ein Team mit sichtbarer Uebergabe. */
function Schwarm({ stand }: { stand: PruefungStand }) {
  const t = useTranslations("pruefung");
  const ta = useTranslations("pruefungAblauf");
  const zeilen = stand.reihenfolge.flatMap((bereich) => {
    const a = stand.agenten[bereich];
    return a ? [{ bereich, a }] : [];
  });
  const teams = zeilen.flatMap(({ a }) => a.reihenfolge.map((id) => a.felder[id]!));
  const fertig = teams.filter((f) => f.bewertet).length;
  const aktiv = teams.filter((f) => f.gestartet && !f.bewertet).length;
  if (teams.length === 0) return null;
  return (
    <section className="pa-schwarm" aria-label={ta("schwarm.titel")}>
      <header>
        <strong>{ta("schwarm.titel")}</strong>
        <span aria-live="polite">{ta("schwarm.aktiv", { n: aktiv, fertig })}</span>
      </header>
      {zeilen.map(({ bereich, a }) => {
        const Symbol = BEREICH_SYMBOL[bereich];
        return (
          <div key={bereich} className="pa-schwarm__zeile" data-bereich={bereich} data-phase={a.phase}>
            <span className="pa-schwarm__bereich">
              <Symbol className="h-3.5 w-3.5" aria-hidden /> {t(`agent.name.${bereich}`)}
            </span>
            <ul>
              {a.reihenfolge.map((id) => {
                const f = a.felder[id]!;
                const stufe = stufeVon(f);
                const befund = stand.befunde.find((b) => b.feld === id);
                const rolle = stufe === "sammelt" ? ta("schwarm.sammler") : stufe === "denkt" ? ta("schwarm.pruefer") : stufe === "fertig" ? ta("schwarm.fertig") : ta("schwarm.wartet");
                return (
                  <li key={id} className="pa-agent" data-stufe={stufe} data-status={befund?.status} title={`${f.titel} - ${rolle}`}>
                    <span className="pa-agent__figur" aria-hidden>
                      <Himbi zustand={STUFE_ZUSTAND[stufe]} groesse={22} />
                    </span>
                    <Stationen f={f} stufe={stufe} />
                    <span className="sr-only">{`${f.titel}: ${rolle}`}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

function protokollText(z: LogZeile, stand: PruefungStand, t: ReturnType<typeof useTranslations>): string {
  const feld = z.bereich && z.feld ? (stand.agenten[z.bereich]?.felder[z.feld]?.titel ?? z.feld) : "";
  const agent = z.bereich ? t(`agent.name.${z.bereich}`) : "Himbi";
  if (z.art === "fakten") return t("log.fakten", { agent, feld, n: z.anzahl ?? 0 });
  if (z.art === "recht") return t("log.recht", { agent, feld, n: z.anzahl ?? 0, stelle: z.text ?? "-" });
  if (z.art === "uebergabe") return t("log.uebergabe", { agent, feld });
  if (z.art === "befund") return t("log.befund", { agent, titel: z.text ?? "" });
  if (z.art === "synthese") return z.text === "start" ? t("log.synthese") : t("log.syntheseFertig");
  return z.text === "spawn" ? t("log.spawn", { agent }) : t("log.fertig", { agent });
}

export function PruefungAblauf({ stand }: { stand: PruefungStand }) {
  const t = useTranslations("pruefung");
  const ta = useTranslations("pruefungAblauf");
  const laeuft = stand.phase === "laeuft";
  const jetzt = useTakt(laeuft);
  const fertigAnzahl = stand.reihenfolge.filter((b) => stand.agenten[b]?.phase === "fertig" || stand.agenten[b]?.phase === "fehler").length;
  const aktiveSpuren = stand.reihenfolge.filter((b) => ["spawn", "sammelt", "denkt"].includes(stand.agenten[b]?.phase ?? "")).length;
  const quellen = stand.reihenfolge.reduce((s, b) => s + Object.values(stand.agenten[b]?.felder ?? {}).reduce((x, f) => x + (f.quellen ?? 0), 0), 0);
  const gesamt = stand.beginn ? (stand.ende ?? jetzt) - stand.beginn : 0;
  // Agenten: Himbi selbst, je Bereich ein Bereichs-Himbi und je Pruefungsfeld ein Pruefer (eigener Modellaufruf); Sammler und Jurist sind ihre Helfer.
  const agentenZahl = stand.reihenfolge.length === 0 ? 1 : 1 + stand.reihenfolge.length + stand.reihenfolge.reduce((n, b) => n + (stand.agenten[b]?.reihenfolge.length ?? 0), 0);

  let text = t("phase.plant");
  if (stand.phase === "fehler") text = t("phase.fehler");
  else if (stand.phase === "fertig") text = t("phase.fertig");
  else if (stand.synthese === "laeuft") text = t("phase.synthese");
  else if (stand.reihenfolge.length > 0) text = t("phase.arbeit", { fertig: fertigAnzahl, gesamt: stand.reihenfolge.length });
  const zustand: HaustierZustand = stand.phase === "fehler" ? "traurig" : stand.phase === "fertig" ? "fertig" : "denkt";
  const zeilen = stand.log.filter((z) => z.art !== "agent" || z.text === "spawn" || z.text === "fertig").slice(-3);

  return (
    <section className="pa-ablauf" data-phase={stand.phase} data-synthese={stand.synthese}>
      <div className="pa-mitte">
        <div className="pa-mitte__figur" aria-hidden>
          <span className="pa-glut" />
          <span className="pa-orbit" />
          <Himbi zustand={zustand} groesse={44} />
        </div>
        <div className="pa-mitte__text">
          <strong>Himbi</strong>
          <span aria-live="polite">{text}</span>
        </div>
        <dl className="pa-mitte__zahlen">
          <div>
            <dt>{ta("zahl.agenten")}</dt>
            <dd>{agentenZahl}</dd>
          </div>
          <div>
            <dt>{ta("zahl.befunde")}</dt>
            <dd key={stand.befunde.length} className="pa-zahl">{stand.befunde.length}</dd>
          </div>
          <div>
            <dt>{ta("zahl.quellen")}</dt>
            <dd>{quellen}</dd>
          </div>
          <div>
            <dt>{ta("zahl.zeit")}</dt>
            <dd>{uhr(gesamt)}</dd>
          </div>
        </dl>
        {laeuft && zeilen.length > 0 ? (
          <ul className="pa-feed" aria-hidden>
            {zeilen.map((z) => (
              <li key={z.id} data-art={z.art}>
                {protokollText(z, stand, t)}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <Schwarm stand={stand} />

      <div className="pa-lanes" data-fluss={aktiveSpuren > 0 ? "ja" : "nein"}>
        <span className="pa-strang" aria-hidden />
        <ul>
          {stand.reihenfolge.map((bereich) => {
            const a = stand.agenten[bereich];
            return a ? <Lane key={bereich} bereich={bereich} a={a} befunde={stand.befunde.filter((b) => b.bereich === bereich)} jetzt={jetzt} laeuft={laeuft} /> : null;
          })}
        </ul>
      </div>

      {stand.synthese !== "aus" ? (
        <div className={cn("pa-synthese")} data-phase={stand.synthese}>
          <span className="pa-synthese__zeichen" aria-hidden>{stand.synthese === "fertig" ? <Check className="h-3.5 w-3.5" /> : <span className="pa-dreher" />}</span>
          <span>{stand.synthese === "fertig" ? t("log.syntheseFertig") : t("log.synthese")}</span>
          <span className="pa-synthese__balken" aria-hidden />
        </div>
      ) : null}
    </section>
  );
}
