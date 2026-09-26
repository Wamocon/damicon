// Eine Sprache je Antwort - und die Stimme liest sie, nicht eine andere.
//
// Waleri hat am 22.09.2026 zwei Faelle gemeldet:
//   Oberflaeche ru, Frage deutsch -> Antwort deutsch, Stimme russisch.
//   Oberflaeche en, Frage russisch -> Antwort russisch, Stimme englisch.
//
// Beide Stellen lasen dieselbe Quelle (die Oberflaechensprache), und genau
// daran sieht man die Ursache: die STIMME hielt sich daran, der TEXT nicht.
// Das Modell antwortet in der Sprache, in der gefragt wurde. Die Stimme folgte
// der Einstellung - und las damit den falschen Text vor.
//
// Also wird einmal je Zug entschieden, auf dem Server, und beide richten sich
// danach:
//
//   a) diktiert  -> die Sprache, die Soniox erkannt hat (Mehrheit der Token)
//   b) getippt   -> die Sprache der Frage, wenn sie eindeutig ist
//   c) sonst     -> die Oberflaechensprache
//
// Hier steht nur die Entscheidung, ohne Spracherkenner und ohne Next-Laufzeit:
// so laesst sie sich fuer alle 16 Kombinationen pruefen. Der Erkenner wird
// hereingereicht (erkenneSprache aus lib/wissen/chunker.ts).

export const SPRACHEN = ["de", "en", "ru", "kk"] as const;
export type Sprache = (typeof SPRACHEN)[number];

/** Woher die Entscheidung kam - fuer Protokoll und Fehlersuche, nicht fuer
 *  die Anzeige. */
export type Herkunft = "diktat" | "frage" | "oberflaeche";

export type Erkenner = (text: string) => string | null;

export function istSprache(wert: unknown): wert is Sprache {
  return typeof wert === "string" && (SPRACHEN as readonly string[]).includes(wert);
}

/** Die haeufigste Sprache unter den Token, die wir kennen. Soniox liefert je
 *  Token eine Sprache; ein einzelner Ausrutscher ("New York" mitten im
 *  Kasachischen) soll den Zug nicht umwerfen, die Mehrheit entscheidet.
 *  Bei Gleichstand gewinnt die zuerst genannte - das ist der Anfang des
 *  Satzes, und in der Sprache hat die Person zu sprechen begonnen. */
export function mehrheitsSprache(tokenSprachen: ReadonlyArray<string | null | undefined>): Sprache | null {
  const zaehler = new Map<Sprache, number>();
  const reihenfolge: Sprache[] = [];
  for (const roh of tokenSprachen) {
    const wert = typeof roh === "string" ? roh.trim().toLowerCase().slice(0, 2) : "";
    if (!istSprache(wert)) continue;
    if (!zaehler.has(wert)) reihenfolge.push(wert);
    zaehler.set(wert, (zaehler.get(wert) ?? 0) + 1);
  }
  let beste: Sprache | null = null;
  for (const s of reihenfolge) if (beste === null || (zaehler.get(s) ?? 0) > (zaehler.get(beste) ?? 0)) beste = s;
  return beste;
}

/**
 * Die Sprache dieses Zuges. Genau eine Stelle entscheidet das, und beide -
 * die Anweisung ans Modell und die Stimme - bekommen dasselbe Ergebnis.
 */
/** Kuerzer als das traegt keine Sprachentscheidung - dieselbe Grenze wie bei
 *  einer getippten Frage (siehe unten, "zwei Woerter reichen nicht"). Ohne
 *  sie gewann ein einzelnes, falsch erkanntes Token unwidersprochen: der
 *  allererste Sprachmodus-Start am 25.09.2026 zeichnete vor der eigentlichen
 *  Aeusserung einen Rest Stille bzw. Atmen auf, Soniox taggte das als "kk",
 *  und die ganze Antwort - obwohl deutsch gesprochen - kam auf Kasachisch. */
const MIN_DIKTAT_ZEICHEN = 8;

export function bestimmeAntwortsprache(
  eingabe: {
    /** Sprachen der Soniox-Token, wenn die Frage diktiert wurde. */
    diktatSprachen?: ReadonlyArray<string | null | undefined> | null;
    /** Der Fragetext, so wie er abgeschickt wurde. */
    frage: string;
    /** Die eingestellte Oberflaechensprache. */
    oberflaeche: string;
  },
  erkenner: Erkenner,
): { sprache: Sprache; herkunft: Herkunft } {
  // a) Diktiert: Soniox hat zugehoert, das ist die beste Auskunft, die es
  //    gibt - besser als ein Erkenner, der auf den transkribierten Text
  //    schaut und dessen Fehler miterbt. Nur bei genug erkanntem Text: ein
  //    paar Ausrutscher-Token vor der eigentlichen Aeusserung (Stille,
  //    Atmen, ein Raeuspern) sollen nicht die ganze Antwort umlenken.
  const genugText = (eingabe.frage ?? "").trim().length >= MIN_DIKTAT_ZEICHEN;
  const ausDiktat = eingabe.diktatSprachen?.length && genugText ? mehrheitsSprache(eingabe.diktatSprachen) : null;
  if (ausDiktat) return { sprache: ausDiktat, herkunft: "diktat" };

  // b) Getippt: die Sprache der Frage, wenn sie eindeutig ist.
  const ausFrage = erkenner(eingabe.frage ?? "");
  if (istSprache(ausFrage)) return { sprache: ausFrage, herkunft: "frage" };

  // c) Sonst die Einstellung. Eine Frage aus zwei Woertern gibt nicht genug
  //    her, um darauf eine Sprache zu gruenden.
  return { sprache: istSprache(eingabe.oberflaeche) ? eingabe.oberflaeche : "de", herkunft: "oberflaeche" };
}

/**
 * Gegenprobe am fertigen Text. Hat das Modell trotz Anweisung in einer
 * anderen Sprache geantwortet, liest die Stimme, was WIRKLICH dasteht -
 * lieber die richtige Stimme zum falschen Text als beides falsch.
 *
 * `abweichung` ist zum Zaehlen da: haeuft es sich, stimmt etwas mit der
 * Anweisung nicht. Der Text selbst gehoert nie ins Protokoll.
 */
export function stimmenSprache(
  antwortsprache: Sprache,
  antwortText: string,
  erkenner: Erkenner,
): { sprache: Sprache; abweichung: boolean } {
  const erkannt = erkenner(antwortText ?? "");
  if (istSprache(erkannt) && erkannt !== antwortsprache) return { sprache: erkannt, abweichung: true };
  return { sprache: antwortsprache, abweichung: false };
}

/**
 * Passt ein erzeugter Text zur verlangten Sprache? Fuer Texte, die einmal
 * entstehen und dann gespeichert werden (die Zusammenfassung eines Berichts):
 * ein deutscher Text in einem russischen Bericht wird verworfen und neu
 * erzeugt, statt fuer immer im Bericht zu stehen.
 *
 * Im Zweifel passt er: ist der Text zu kurz oder unklar (kein Erkenner-
 * Ergebnis), wird nichts abgelehnt. Russisch und Kasachisch gelten als
 * zusammengehoerig - sie teilen sich die Schrift, der Erkenner trennt sie nur
 * an einzelnen Sonderbuchstaben, und das reicht nicht, um daran einen Text
 * zu verwerfen.
 */
export function sprachePasst(gewuenscht: string, text: string, erkenner: Erkenner): boolean {
  if (!istSprache(gewuenscht)) return true;
  const erkannt = erkenner(text ?? "");
  if (!istSprache(erkannt) || erkannt === gewuenscht) return true;
  const kyrillisch = (s: string) => s === "ru" || s === "kk";
  return kyrillisch(gewuenscht) && kyrillisch(erkannt);
}

/** Die Anweisung ans Modell. Steht hier, damit Test und Laufzeit denselben
 *  Satz sehen. */
export const SPRACHNAME: Record<Sprache, string> = {
  de: "Deutsch",
  en: "English",
  ru: "Russisch",
  kk: "Kasachisch",
};
