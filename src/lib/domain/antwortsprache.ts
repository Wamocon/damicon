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
// danach (bestimmeAntwortsprache, seit 28.09.2026 in fuenf Schritten):
//
//   a) diktiert       -> die Sprache, die Soniox erkannt hat (Mehrheit der Token)
//   b) getippt        -> die Sprache der Frage, wenn sie eindeutig ist
//   c) nicht eindeutig -> die Schrift der Frage zusammen mit dem vorigen Zug
//   d) ohne Schrift   -> der vorige Zug
//   e) sonst          -> die Oberflaechensprache
//
// Hier steht nur die Entscheidung, ohne Next-Laufzeit: so laesst sie sich fuer
// alle 16 Kombinationen pruefen. Der hereingereichte Erkenner (die Route:
// erkenneSprache(t, 10)) sagt nur, ob die Frage genug Buchstaben fuer eine
// Entscheidung hat und welche Schrift sie traegt; OB sie eindeutig ist,
// entscheiden die Regeln aus lib/text/sprache-erkennen.ts hier (29.09.2026,
// Cleanup-Fund 42 - bis dahin wurde sein Ergebnis bei Kyrillisch ungeprueft
// uebernommen, siehe Schritt b).
//
// Seit 28.09.2026 faellt die Entscheidung nicht mehr vorschnell auf die
// Oberflaeche zurueck (Rueckmeldung vom 28.09.2026: Oberflaeche Deutsch,
// russischer Text, deutsche Stimme "mit viel Akzent"). Zwei Luecken:
//   - Folgeanfragen (nach seiteLesen, zeigeAuf, einer Freigabe) enden mit der
//     Antwort des Assistenten. Als Frage galt dann "", und die Oberflaeche
//     entschied - mitten in einem russischen Gespraech. Jetzt gilt die letzte
//     Frage des Nutzers (zugAusNachrichten).
//   - Kurze Antworten ("Да", "Иә", "Ja", "OK") liegen unter der
//     Erkennungsschwelle. Ihre Schrift und die Sprache des vorigen Zuges sagen
//     mehr als die Einstellung.

import {
  erkenneSprache,
  erkenneSpracheEindeutig,
  kasachischNachweis,
  klareAbweichung,
  kyrillischeStimme,
  lateinischeSprache,
  schriftVonText,
  zaehleSchrift,
} from "@/lib/text/sprache-erkennen";

export const SPRACHEN = ["de", "en", "ru", "kk"] as const;
export type Sprache = (typeof SPRACHEN)[number];

/** Woher die Entscheidung kam - fuer Protokoll und Fehlersuche, nicht fuer
 *  die Anzeige. "schrift": eine kurze Antwort, entschieden an ihrer Schrift;
 *  "verlauf": die Sprache des vorigen Zuges. */
export type Herkunft = "diktat" | "frage" | "schrift" | "verlauf" | "oberflaeche";

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

/** Kuerzer als das traegt keine Sprachentscheidung - dieselbe Grenze wie bei
 *  einer getippten Frage (siehe unten, "zwei Woerter reichen nicht"). Ohne
 *  sie gewann ein einzelnes, falsch erkanntes Token unwidersprochen: der
 *  allererste Sprachmodus-Start am 25.09.2026 zeichnete vor der eigentlichen
 *  Aeusserung einen Rest Stille bzw. Atmen auf, Soniox taggte das als "kk",
 *  und die ganze Antwort - obwohl deutsch gesprochen - kam auf Kasachisch. */
const MIN_DIKTAT_ZEICHEN = 8;

/**
 * Die Sprache dieses Zuges. Genau eine Stelle entscheidet das, und beide -
 * die Anweisung ans Modell und die Stimme - bekommen dasselbe Ergebnis.
 * Die Schritte a bis e stehen oben im Kopf der Datei.
 *
 * @param erkenner Sagt, ob die Frage lang genug fuer eine Entscheidung ist
 *   (null: nein) und in welcher Schrift sie steht. Die Route reicht
 *   erkenneSprache(t, 10) herein.
 */
export function bestimmeAntwortsprache(
  eingabe: {
    /** Sprachen der Soniox-Token, wenn die Frage diktiert wurde. */
    diktatSprachen?: ReadonlyArray<string | null | undefined> | null;
    /** Der Fragetext, so wie er abgeschickt wurde. */
    frage: string;
    /** Die eingestellte Oberflaechensprache. */
    oberflaeche: string;
    /** Die Sprache des vorigen Zuges (zugAusNachrichten), wenn es einen gibt. */
    vorigeSprache?: string | null;
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
  //
  //    Lateinisch zaehlt seit 28.09.2026 nur ein EINDEUTIGES Ergebnis
  //    (erkenneSpracheEindeutig: zwei Merkwoerter und ein klarer Abstand). Der
  //    Erkenner der Route faellt bei lateinischem Text ohne Merkmal auf "en"
  //    zurueck - "Mach weiter", "Brigade Nord zuerst" oder "Zeig Details"
  //    mitten in einem deutschen Gespraech bekamen so eine englische Antwort und
  //    eine englische Stimme. Seit Himbi als Tagesbegleiter Rueckfragen stellt,
  //    sind solche kurzen Antworten der Normalfall. Nicht eindeutig: weiter mit
  //    dem vorigen Zug (c, d) und erst dann der Oberflaeche (e).
  //
  //    Kyrillisch zaehlt seit 29.09.2026 ebenso nur mit Nachweis (Cleanup-Fund 40):
  //    Kasachisch ab zwei Belegwoertern (Sonderbuchstaben ausserhalb von Namen, oder
  //    kasachische Woerter wie "бар", "туралы", "керек"), Russisch ganz ohne
  //    (kasachischNachweis in lib/text/sprache-erkennen.ts). Bis dahin galt hier die
  //    1-%-Regel, und ein einziger Ortsname entschied - "Сколько клубники отгрузили в
  //    Қостанай сегодня?" bekam mitten in einem russischen Gespraech eine kasachische
  //    Antwort, weil dieser Schritt vor dem Verlauf kommt. Ein einzelner Beleg oder nur
  //    Namen ("offen") entscheiden nichts, dann entscheidet das Gespraech (c).
  const frage = eingabe.frage ?? "";
  const ausFrage = erkenner(frage);
  const kurz = ausFrage === null;
  if (ausFrage === "ru" || ausFrage === "kk") {
    const befund = kasachischNachweis(frage);
    if (befund !== "offen") return { sprache: befund === "kasachisch" ? "kk" : "ru", herkunft: "frage" };
  } else if (istSprache(ausFrage) && erkenneSpracheEindeutig(frage, 1) === ausFrage) {
    return { sprache: ausFrage, herkunft: "frage" };
  }

  // c) Zu kurz oder nicht eindeutig ("Да", "Иә", "Ja", "OK", "Zeig Details"):
  //    die Schrift der Antwort zusammen mit der Sprache des vorigen Zuges.
  //    Passt beides zusammen, bleibt es beim vorigen Zug - ein "Иә" in einem
  //    russischen Gespraech wechselt nicht nach Kasachisch, ein "OK" in einem
  //    englischen nicht nach Deutsch. Kyrillisch ist dabei eindeutig: ein "Да"
  //    wird nie deutsch beantwortet, auch nicht bei deutscher Oberflaeche.
  const vorige = istSprache(eingabe.vorigeSprache) ? eingabe.vorigeSprache : null;
  const { kyrillisch, lateinisch } = zaehleSchrift(frage);
  if (kyrillisch > lateinisch) {
    if (vorige === "ru" || vorige === "kk") return { sprache: vorige, herkunft: "verlauf" };
    // Ohne Verlauf: eine Antwort unter der Entscheidungsschwelle ist schon mit einem
    // Sonderbuchstaben kasachisch ("Иә", "Жоқ"); eine laengere Frage mit nur einem
    // solchen Wort (dem Ortsnamen) nicht. Sonst Russisch, ausser die Einstellung ist
    // ohnehin Kasachisch ("Рахмет" hat keinen Sonderbuchstaben).
    // Russisch mit Gegenbelegen ("Кто пришёл?", "Как дела?") bleibt russisch, auch bei
    // kasachischer Oberflaeche (Gegenpruefung vom 29.09.2026).
    const befund = kasachischNachweis(frage);
    const kasachischeAntwort = kurz && befund !== "russisch";
    if (kasachischeAntwort || (eingabe.oberflaeche === "kk" && befund !== "russisch")) return { sprache: "kk", herkunft: "schrift" };
    return { sprache: "ru", herkunft: "schrift" };
  }
  if (lateinisch > kyrillisch) {
    if (vorige === "de" || vorige === "en") return { sprache: vorige, herkunft: "verlauf" };
    // Ein Umlaut oder ein unterscheidendes Wort ("Danke", "Thanks") reicht hier:
    // ohne lateinischen Verlauf ist es der beste Anhaltspunkt, den es gibt.
    const ausWort = lateinischeSprache(frage);
    if (ausWort === "de" || ausWort === "en") return { sprache: ausWort, herkunft: "schrift" };
  }

  // d) Ohne klare Schrift (Ziffern, "?", ein "OK" nach einem russischen Zug):
  //    die Sprache des vorigen Zuges. Das Gespraech geht weiter, wie es lief.
  if (vorige) return { sprache: vorige, herkunft: "verlauf" };

  // e) Sonst die Einstellung. Eine Frage aus zwei Woertern gibt ohne Verlauf
  //    nicht genug her, um darauf eine Sprache zu gruenden.
  return { sprache: istSprache(eingabe.oberflaeche) ? eingabe.oberflaeche : "de", herkunft: "oberflaeche" };
}

/** Eine Nachricht des Verlaufs, so weit die Sprachwahl sie braucht. */
export interface VerlaufsNachricht {
  rolle: string;
  text: string;
  /** metadata.sprache einer Antwort (api/ki-assistent schickt sie mit). */
  sprache?: unknown;
}

/** So viele Nachrichten vor der Frage werden hoechstens nach ihrer Sprache
 *  gefragt - der vorige Zug, nicht das Gespraech von gestern. */
const VERLAUF_TIEFE = 6;

/**
 * Frage und Sprache des vorigen Zuges aus den Nachrichten einer Anfrage.
 *
 * Die Frage ist die LETZTE NUTZERNACHRICHT, auch wenn die Anfrage mit der
 * Antwort des Assistenten endet (Folgeanfrage nach einem Client-Werkzeug oder
 * einer Freigabe). Bis zum 28.09.2026 war die Frage dann "", und jede
 * Folgeanfrage wurde in der Oberflaechensprache beantwortet und vorgelesen.
 * Erste Anfrage und Folgeanfrage eines Zuges sehen so dieselbe Frage und
 * denselben Verlauf - und kommen zur selben Sprache.
 *
 * Der vorige Zug ist alles vor dieser Frage: zuerst metadata.sprache der
 * letzten Antwort (der Browser schickt die Nachrichten samt Metadaten zurueck),
 * sonst - bei Nachrichten aus dem geladenen Verlauf, die keine Metadaten
 * tragen - der Text der letzten Nachrichten, die genug hergeben.
 */
export function zugAusNachrichten(
  nachrichten: ReadonlyArray<VerlaufsNachricht>,
  verlaufsErkenner: Erkenner,
): { frage: string; vorigeSprache: Sprache | null } {
  let letzteFrage = -1;
  for (let i = nachrichten.length - 1; i >= 0; i--) {
    if (nachrichten[i]!.rolle === "user") {
      letzteFrage = i;
      break;
    }
  }
  const frage = letzteFrage >= 0 ? (nachrichten[letzteFrage]!.text ?? "") : "";
  const davor = nachrichten.slice(0, Math.max(0, letzteFrage));

  let vorigeSprache: Sprache | null = null;
  for (let i = davor.length - 1; i >= 0; i--) {
    if (davor[i]!.rolle !== "assistant") continue;
    if (istSprache(davor[i]!.sprache)) vorigeSprache = davor[i]!.sprache as Sprache;
    break;
  }
  if (!vorigeSprache) {
    for (const n of davor.slice(-VERLAUF_TIEFE).reverse()) {
      const erkannt = verlaufsErkenner(n.text ?? "");
      if (istSprache(erkannt)) {
        vorigeSprache = erkannt;
        break;
      }
    }
  }
  return { frage, vorigeSprache };
}

/** Ab so vielen Buchstaben entscheidet der Text einer Antwort ohne Metadaten. */
const VORLESE_MINDEST_BUCHSTABEN = 40;

/**
 * Die Sprache, in der eine FERTIGE Antwort vorgelesen wird (Knopf an der
 * Nachricht, Antwort ohne Live-Abschnitte). Die einzelnen Saetze koennen davon
 * noch abweichen (satzSprache in lib/text/sprache-erkennen.ts).
 *
 *   1. metadata.sprache der Antwort, wenn sie mitkam - AUSSER der Text steht
 *      lang und klar in einer anderen Sprache (klareAbweichung mit
 *      `ganzerText`, seit 28.09.2026): "Schreib dem Lieferanten eine Mail auf
 *      Englisch" hat die Zugsprache de, der Text ist englisch, und bis dahin
 *      las ihn die deutsche Stimme. Eine deutsche Einleitung vor der Mail
 *      laesst die Metadaten gelten, die Mail wechselt dann satzweise.
 *   2. sonst der Text selbst - Nachrichten aus dem geladenen Verlauf haben
 *      keine Metadaten, und bis zum 28.09.2026 las dann die Stimme der
 *      Oberflaeche jede russische Antwort nach einem Neuladen,
 *   3. erst zuletzt die Oberflaeche.
 */
export function vorleseSprache(metaSprache: unknown, text: string, oberflaeche: string): Sprache {
  if (istSprache(metaSprache)) {
    const ausText = klareAbweichung(text ?? "", metaSprache, { mindestBuchstaben: VORLESE_MINDEST_BUCHSTABEN, ganzerText: true });
    return istSprache(ausText) ? ausText : metaSprache;
  }
  const ober: Sprache = istSprache(oberflaeche) ? oberflaeche : "de";
  const eindeutig = erkenneSpracheEindeutig(text ?? "", VORLESE_MINDEST_BUCHSTABEN);
  if (istSprache(eindeutig)) return eindeutig;
  // Kurzer Text: zuerst die Schrift. Bis zur Gegenpruefung vom 29.09.2026 las nach einem Neuladen
  // (keine Metadaten) die Stimme der Oberflaeche jede kurze Antwort - "Да, всё готово." bei
  // deutscher Oberflaeche deutsch, "Die Lieferung ist da." bei russischer russisch.
  const schrift = schriftVonText(text ?? "");
  if (schrift === "kyrillisch") return kyrillischeStimme(text ?? "", ober);
  if (schrift === "lateinisch") {
    const ausWort = lateinischeSprache(text ?? "");
    if (ausWort) return ausWort;
    if (ober === "ru" || ober === "kk") return "en";
  }
  // Lateinisch, aber ohne Merkmal: erkenneSprache sagt dann "en". Steht die
  // Oberflaeche in derselben Schrift, ist sie der bessere Tipp.
  const grob = erkenneSprache(text ?? "", VORLESE_MINDEST_BUCHSTABEN);
  if (!istSprache(grob)) return ober;
  const lateinisch = (s: Sprache) => s === "de" || s === "en";
  return lateinisch(grob) === lateinisch(ober) ? ober : grob;
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
