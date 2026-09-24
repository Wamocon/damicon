// Schalter, mit denen sich neue Funktionen ohne neuen Code abstellen lassen.
//
// Jeder von ihnen ist ein Notausgang: geht etwas in Produktion schief, setzt
// der Betrieb den Wert auf "aus" und es gilt wieder das alte Verhalten - kein
// Zurueckrollen, kein Deployment, keine Wartezeit.
//
// Deshalb ist die Voreinstellung immer AUS. Wer einen Schalter vergisst,
// bekommt den Stand von vorher, nicht ein halb fertiges Verhalten.

/** "an", "on", "true", "1" schalten ein. Alles andere - auch ein Tippfehler
 *  und eine fehlende Variable - bedeutet aus. */
export function schalterAn(wert: string | undefined): boolean {
  const gesetzt = wert?.trim().toLowerCase();
  return gesetzt === "an" || gesetzt === "on" || gesetzt === "true" || gesetzt === "1";
}

/** Antwort schon waehrend des Schreibens vorlesen (Teil B).
 *
 *  Zusaetzlich zur Einstellung muss das Signatur-Geheimnis stehen: ohne das
 *  waere die Abschnitts-Route ein offenes Vorlese-Werkzeug. Lieber die
 *  Funktion aus als ungeschuetzt an - geprueft wird das hier und nicht erst
 *  in der Route, damit es nur eine Stelle gibt, die es entscheidet. */
export function sprachausgabeLiveAn(): boolean {
  if (!schalterAn(process.env.KI_SPRACHAUSGABE_LIVE)) return false;
  const geheimnis = process.env.KI_SPRACHAUSGABE_SIGNATUR?.trim();
  if (!geheimnis || geheimnis.length < 16) {
    console.error("[damicon] KI_SPRACHAUSGABE_LIVE steht auf an, aber KI_SPRACHAUSGABE_SIGNATUR fehlt - Live-Sprachausgabe bleibt aus");
    return false;
  }
  return true;
}

/** Der Agent wechselt in die Seitenansicht und bleibt dort (Teil C). */
export function agentSeitenansichtAn(): boolean {
  return schalterAn(process.env.KI_AGENT_SEITENANSICHT);
}

/** Live-Diktat: der Browser streamt direkt zu Soniox (stt-rt-v5), der Text
 *  erscheint waehrend des Sprechens. Aus heisst: der Datei-Weg wie bisher.
 *  Zusaetzlich muessen SONIOX_API_KEY und SONIOX_API_URL stehen - das prueft
 *  die Schluessel-Route (api/ki-spracherkennung), die ohne beides absagt; der
 *  Browser faellt dann still auf den Datei-Weg zurueck. */
export function diktatLiveAn(): boolean {
  return schalterAn(process.env.KI_DIKTAT_LIVE);
}
