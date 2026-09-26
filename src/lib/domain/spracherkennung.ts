// Wer erkennt die Sprache - und was tun, wenn ein Dienst hakt?
//
// Bis zum 22.09.2026 lief das nacheinander: erst Soniox mit 8 s, bei
// Misserfolg Whisper mit 12 s. An echten Aufnahmen von rund 10 Sekunden ist
// das zweimal in die Grenze gelaufen - 20,3 s Wartezeit und am Ende KEIN
// Text. Nacheinander addieren sich die schlechten Faelle, und die Person
// bezahlt die Summe.
//
// Deshalb ueberlappend ("hedging"):
//
//   0 s   Soniox startet, Zeitlimit 20 s.
//   6 s   laeuft Soniox noch, startet Whisper PARALLEL mit.
//   ...   der erste brauchbare Text gewinnt, der Verlierer wird abgebrochen.
//   40 s  Gesamtdeckel. Danach eine uebersetzte Meldung, nie Vercels Abbruch
//         bei maxDuration = 60.
//
// Scheitert Soniox schnell und nicht durch Zeitueberschreitung (kein
// Schluessel, 401, Dienst weg), wird nicht bis 6 s gewartet: auf einen
// Dienst zu warten, der schon abgesagt hat, ist reine Wartezeit.
//
// "Nichts gehoert" ist dagegen KEIN Ausfall (seit 24.09.2026): meldet Soniox
// "leer", ist die Aufnahme still oder unverstaendlich, und das Ergebnis
// steht. Bis dahin lief dann Whisper auf derselben Datei los - und Whisper
// erfindet auf Stille ganze Saetze ("Untertitel der Amara.org-Gemeinschaft",
// "Продолжение следует..."), die als erster Text gewannen.
//
// Hier steht nur die Logik, ohne die Clients - so laesst sie sich mit
// erfundenen Diensten pruefen, ohne Netz und ohne Next-Laufzeit.

/** Ab hier laeuft Whisper mit. Gemessen liefert Soniox im Regelfall in 2-4 s;
 *  wer laenger braucht, hat meist ein Problem und nicht bloss einen langen
 *  Satz. 6 s lassen dem Regelfall Luft, ohne die Person haengen zu lassen. */
export const HEDGE_AB_MS = 6_000;

/** Nach dieser Zeit ist Schluss, egal was die Dienste tun. */
export const GESAMTDECKEL_MS = 40_000;

export type Dienst = "soniox" | "whisper";
export type Teilergebnis = { ok: true; text: string; sprachen?: string[] } | { ok: false; grund: string };
export type Erkennung =
  /** `sprachen` nur, wenn der Dienst sie kennt - Whisper tut das nicht. */
  | { ok: true; text: string; dienst: Dienst; sprachen: string[] }
  | { ok: false; grund: string };

/** Ein Dienst, der auf Zuruf startet und sich abbrechen laesst. */
export type Starter = (abbruch: AbortSignal) => Promise<Teilergebnis>;

function schlafe(ms: number, signal: AbortSignal): Promise<"zeit"> {
  return new Promise((fertig) => {
    const t = setTimeout(() => fertig("zeit"), ms);
    signal.addEventListener("abort", () => { clearTimeout(t); fertig("zeit"); }, { once: true });
  });
}

/** Grund, mit dem ein Dienst sagt: ich habe zugehoert, da war nichts. */
export const GRUND_LEER = "leer";

/** Der erste Lauf mit brauchbarem Text gewinnt. Liefert keiner etwas, kommt
 *  der zuletzt gemeldete Grund zurueck - nicht der erste, denn der ist oft
 *  nur "zeitueberschreitung", waehrend der zweite sagt, was wirklich fehlt.
 *  Ein "leer" von Soniox entscheidet sofort: dann gibt es nichts zu erkennen,
 *  und ein Text von Whisper waere erfunden. */
function ersterErfolg(laeufe: ReadonlyArray<{ dienst: Dienst; lauf: Promise<Teilergebnis> }>): Promise<Erkennung> {
  return new Promise<Erkennung>((fertig) => {
    let offen = laeufe.length;
    let letzterGrund = "unbekannt";
    for (const { dienst, lauf } of laeufe) {
      const gescheitert = (grund: string) => {
        letzterGrund = grund;
        if (dienst === "soniox" && grund === GRUND_LEER) return fertig({ ok: false, grund: GRUND_LEER });
        if (--offen === 0) fertig({ ok: false, grund: letzterGrund });
      };
      lauf.then(
        (a) => (a.ok ? fertig({ ok: true, text: a.text, dienst, sprachen: a.sprachen ?? [] }) : gescheitert(a.grund)),
        // Beide Clients versprechen, nie zu werfen. Faellt einer doch um,
        // darf er den anderen nicht mitreissen.
        (f: unknown) => gescheitert(f instanceof Error ? f.message : String(f)),
      );
    }
  });
}

/**
 * Erkennt gesprochenen Text mit Rueckfall. Wirft nie - jeder Fehlerpfad endet
 * in { ok: false }, wie bei beiden Clients darunter.
 *
 * @param starteSoniox `null`, wenn der Schalter auf Whisper steht: dann gibt
 *   es nichts zu ueberlappen und nur Whisper laeuft.
 * @param melde Wohin Hinweise gehen (Vorgabe: die Serverkonsole). Der erkannte
 *   Text steht nie darin, nur Gruende.
 */
export async function erkenneMitRueckfall(
  starteSoniox: Starter | null,
  starteWhisper: Starter,
  melde: (zeile: string) => void = (zeile) => console.error(zeile),
): Promise<Erkennung> {
  const deckel = new AbortController();
  const deckelTimer = setTimeout(() => deckel.abort(), GESAMTDECKEL_MS);

  try {
    if (!starteSoniox) {
      const nur = await starteWhisper(deckel.signal);
      return nur.ok ? { ok: true, text: nur.text, dienst: "whisper", sprachen: nur.sprachen ?? [] } : nur;
    }

    const sonioxAbbruch = new AbortController();
    const whisperAbbruch = new AbortController();
    const soniox = starteSoniox(AbortSignal.any([deckel.signal, sonioxAbbruch.signal]));

    // Warten, bis Soniox fertig ist ODER die Hedge-Zeit um ist.
    const zuerst = await Promise.race([
      soniox.then((a) => (a.ok ? ("gewonnen" as const) : ("gescheitert" as const))),
      schlafe(HEDGE_AB_MS, deckel.signal),
    ]);
    if (zuerst === "gewonnen") {
      const a = await soniox;
      if (a.ok) return { ok: true, text: a.text, dienst: "soniox", sprachen: a.sprachen ?? [] };
    }
    if (zuerst === "gescheitert") {
      const a = await soniox;
      // Nichts gehoert ist ein Ergebnis, kein Ausfall - kein Whisper.
      if (!a.ok && a.grund === GRUND_LEER) return { ok: false, grund: GRUND_LEER };
      if (!a.ok) melde(`[damicon] Soniox fehlgeschlagen, weiter mit Whisper: ${a.grund}`);
    } else {
      melde(`[damicon] Soniox braucht laenger als ${HEDGE_AB_MS} ms - Whisper laeuft parallel mit`);
    }

    const whisper = starteWhisper(AbortSignal.any([deckel.signal, whisperAbbruch.signal]));
    const ergebnis = await ersterErfolg([
      { dienst: "soniox", lauf: soniox },
      { dienst: "whisper", lauf: whisper },
    ]);

    // Der Verlierer wird abgebrochen: bei Soniox spart das den offenen Auftrag
    // beim Dienstleister, bei Whisper eine Antwort, die niemand mehr liest.
    if (ergebnis.ok) {
      if (ergebnis.dienst === "soniox") whisperAbbruch.abort();
      else sonioxAbbruch.abort();
    } else if (ergebnis.grund === GRUND_LEER) {
      whisperAbbruch.abort();
    }
    return ergebnis;
  } finally {
    clearTimeout(deckelTimer);
  }
}
