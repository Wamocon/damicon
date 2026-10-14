import {
  abwarten,
  ausloesen,
  AudioContextAttrappe,
  beendeUmgebung,
  beobachteKonsole,
  erzeugeNavigation,
  erzeugeStrom,
  ersetzeModule,
  fenster,
  fireEvent,
  installiereUhr,
  IntersectionObserverAttrappe,
  leinwand,
  MediaRecorderAttrappe,
  MediaStreamAttrappe,
  medienAbfragen,
  medienElemente,
  mikrofon,
  modulAufrufe,
  netz,
  NEXT_MODULE,
  objektUrls,
  protokoll,
  pruefer,
  renderHook,
  rendereHookMitTexten,
  rendereMitTexten,
  ResizeObserverAttrappe,
  screen,
  setzeFenster,
  setzeRechteck,
  setzeUmgebungZurueck,
  umgebungsFehler,
  warteBis,
  WebSocketAttrappe,
} from "./hilfen/dom-umgebung";
import type { ReactNode } from "react";
import { KiPaneGriff } from "@/components/ki/ki-pane-griff";
import { useSprachausgabe } from "@/components/ki/sprachausgabe";
import { lesePegel, leseLautstaerke, starteHoeren } from "@/lib/hoeren";

// Beispiel und Selbstprüfung der DOM-Testumgebung (hilfen/dom-umgebung.tsx, seit 14.10.2026), ohne Browser und ohne Netz:
//   1. Das Fenster: window, document, navigator, Speicher, DOM-Ereignisse.
//   2. Die Uhr: Zeitgeber, Intervalle, Bilder, performance.now und Date in zeitlicher Reihenfolge; Abschalten stellt alles zurück;
//      warteBis() mit und ohne Uhr.
//   3. AudioContext mit Zeitachse: Aufzeichnung, Tonende nach Ablauf der Zeit, angehaltener Kontext; lib/hoeren.ts liest den Pegel.
//   4. fetch mit Strom: SSE-Stücke kommen einzeln an, Körper wird mitgeschrieben, ohne Regel und bei Abbruch scheitert fetch.
//   5. Weitere Attrappen kurz: WebSocket, Mikrofon und MediaRecorder, matchMedia, IntersectionObserver, Leinwand.
//   6. KI: KiPaneGriff (Zustand aus ResizeObserver, Tastatur, Ziehen, Fenstergröße, Abbau); ein Update außerhalb von act fällt auf.
//   7. KI: useSprachausgabe (Strom-Weg über zwei Blöcke; Datei-Rückfall mit 404, zweitem Versuch nach 1200 ms und Objekt-URL).
//   8. Haustier: HaustierEinstellung in KiPaneProvider und HaustierProvider, Navigation ersetzt (Schalter, Vorschau, anderer Tab);
//      der Ersatz greift auch über einen relativen Pfad.
//   9. next/dynamic und next/image als Ersatzmodule.
// Am Ende: keine Warnung von React in der Konsole, keine Meldung aus jsdom.
// Aufruf: npm run test:dom-umgebung

const { pruefe, ende } = pruefer();
const json = (wert: unknown) => JSON.stringify(wert);
const ID = "11111111-2222-4333-8444-555555555555";

/** Ende eines Abschnitts: jsdom hat nichts gemeldet (nicht umgesetzte Schnittstelle, Ausnahme in einem Hörer), dann zurücksetzen. */
function naechsterFall(abschnitt: string): void {
  pruefe(`${abschnitt}: keine Meldung aus jsdom`, umgebungsFehler.length === 0, json(umgebungsFehler));
  setzeUmgebungZurueck();
}

// ---- 1. Das Fenster ---------------------------------------------------------------------------------------------------------------
function pruefeFenster(): void {
  pruefe("Fenster: window, document und navigator sind global", typeof window === "object" && window === fenster && document === fenster.document && navigator === fenster.navigator);
  pruefe("Fenster: Adresse /de, Sprache de", location.pathname === "/de" && document.documentElement.lang === "de");
  localStorage.setItem("probe", "1");
  pruefe("Fenster: localStorage gehört zum Fenster", fenster.localStorage.getItem("probe") === "1");
  let gehoert = "";
  document.addEventListener("probe", (e) => (gehoert = (e as CustomEvent<string>).detail));
  document.dispatchEvent(new CustomEvent("probe", { detail: "ja" }));
  pruefe("Fenster: global erzeugte Ereignisse lassen sich am DOM auslösen", gehoert === "ja");
  pruefe("Fenster: React-Testmodus ist an", (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT === true);
  pruefe("Fenster: getUserMedia und AudioContext sind die Attrappen", typeof navigator.mediaDevices.getUserMedia === "function" && new AudioContext() instanceof AudioContextAttrappe);
  setzeUmgebungZurueck();
  pruefe("Fenster: setzeUmgebungZurueck leert Speicher und Protokoll", localStorage.length === 0 && protokoll.eintraege.length === 0 && AudioContextAttrappe.alle.length === 0);
}

// ---- 2. Die Uhr ---------------------------------------------------------------------------------------------------------------------
async function pruefeUhr(): Promise<void> {
  const echt = { setTimeout: globalThis.setTimeout, Date: globalThis.Date, performance: globalThis.performance };
  const uhr = installiereUhr({ datum: "2026-10-14T08:00:00Z" });
  const folge: string[] = [];
  setTimeout(() => folge.push(`zeitgeber@${uhr.jetzt()}`), 100);
  const intervall = setInterval(() => folge.push(`intervall@${uhr.jetzt()}`), 30);
  requestAnimationFrame((t) => folge.push(`bild@${uhr.jetzt()}:${t}`));
  window.setTimeout(() => folge.push(`fenster@${uhr.jetzt()}`), 0);
  setTimeout(async () => {
    await Promise.resolve();
    folge.push(`nach-await@${uhr.jetzt()}`);
  }, 45);
  pruefe("Uhr: vor dem Vorstellen läuft nichts", folge.length === 0 && json(uhr.offen()) === json({ zeitgeber: 3, intervalle: 1, bilder: 1 }), json(uhr.offen()));
  await uhr.vor(100);
  pruefe(
    "Uhr: Zeitgeber, Intervall, Bild und Mikrotask in zeitlicher Reihenfolge",
    json(folge) === json(["fenster@0", "bild@16:1016", "intervall@30", "nach-await@45", "intervall@60", "intervall@90", "zeitgeber@100"]),
    json(folge),
  );
  pruefe("Uhr: performance.now und Date folgen der Uhr", performance.now() === 1100 && Date.now() === Date.parse("2026-10-14T08:00:00.100Z") && new Date().toISOString() === "2026-10-14T08:00:00.100Z");
  pruefe("Uhr: new Date(x) bleibt ein gewöhnliches Datum", new Date(0).toISOString() === "1970-01-01T00:00:00.000Z");
  clearInterval(intervall);
  setTimeout(() => setTimeout(() => folge.push(`innen@${uhr.jetzt()}`), 0), 5);
  await uhr.vor(5);
  pruefe("Uhr: ein Zeitgeber aus einem Zeitgeber läuft im selben Vorstellen", folge.at(-1) === "innen@105", folge.at(-1));
  setTimeout(() => folge.push("spaet"), 5000);
  pruefe("Uhr: zeitgeber() nennt Fälligkeit und Verzögerung", json(uhr.zeitgeber()) === json([{ inMs: 5000, ms: 5000, intervall: false }]));
  await uhr.laufeAlle();
  pruefe("Uhr: laufeAlle arbeitet alle Zeitgeber ab", folge.at(-1) === "spaet" && uhr.jetzt() === 5105 && json(uhr.offen()) === json({ zeitgeber: 0, intervalle: 0, bilder: 0 }));
  uhr.deinstalliere();
  pruefe("Uhr: deinstalliere stellt setTimeout, performance und Date wieder her", globalThis.setTimeout === echt.setTimeout && globalThis.Date === echt.Date && globalThis.performance === echt.performance);

  const zweite = installiereUhr();
  let fertig = false;
  setTimeout(() => (fertig = true), 50);
  const mitUhr = await warteBis(() => fertig, { maxMs: 100 });
  pruefe("warteBis: mit Uhr stellt es in Schritten vor, bis die Bedingung gilt", mitUhr && zweite.jetzt() === 50, String(zweite.jetzt()));
  zweite.deinstalliere();
  let echtFertig = false;
  setTimeout(() => (echtFertig = true), 5);
  pruefe("warteBis: ohne Uhr wartet es echt", await warteBis(() => echtFertig, { maxMs: 500 }));
  pruefe("warteBis: gibt false zurück, wenn die Bedingung nie gilt", !(await warteBis(() => false, { maxMs: 20 })));
  naechsterFall("Uhr");
}

// ---- 3. AudioContext mit Zeitachse ------------------------------------------------------------------------------------------------
async function pruefeAudioContext(): Promise<void> {
  const uhr = installiereUhr();
  const ctx = new AudioContext();
  const ausgang = ctx.createGain();
  ausgang.connect(ctx.destination);
  const quelle = ctx.createBufferSource();
  quelle.buffer = ctx.createBuffer(1, 24000, 48000);
  quelle.connect(ausgang);
  let endeBei = -1;
  quelle.onended = () => (endeBei = uhr.jetzt());
  quelle.start(0.25);
  ausgang.gain.setTargetAtTime(0.2, ctx.currentTime, 0.05);
  await uhr.vor(749);
  pruefe("AudioContext: vor dem Ende kein ended", endeBei === -1 && Math.abs(ctx.currentTime - 0.749) < 1e-9);
  await uhr.vor(1);
  pruefe("AudioContext: ended genau bei Start 0,25 s plus Dauer 0,5 s", endeBei === 750, String(endeBei));
  pruefe(
    "AudioContext: die Aufzeichnung nennt den Graphen in Reihenfolge",
    json(protokoll.von("audio#1")) ===
      json([
        "audio#1 new (running)",
        "audio#1 createGain -> gain#1",
        "audio#1 gain#1 connect destination",
        "audio#1 createBufferSource -> quelle#2",
        "audio#1 createBuffer(1, 24000, 48000)",
        "audio#1 quelle#2 connect gain#1",
        "audio#1 quelle#2 start(0.25)",
        "audio#1 gain#1.gain setTargetAtTime(0.2, 0, 0.05)",
        "audio#1 quelle#2 ended",
      ]),
    json(protokoll.von("audio#1")),
  );
  const zweite = ctx.createBufferSource();
  zweite.buffer = ctx.createBuffer(1, 48000, 48000);
  let zweitesEnde = false;
  zweite.onended = () => (zweitesEnde = true);
  zweite.start();
  await ctx.suspend();
  await uhr.vor(2000);
  pruefe("AudioContext: angehalten steht die Zeit, kein ended", !zweitesEnde && Math.abs(ctx.currentTime - 0.75) < 1e-9);
  await ctx.resume();
  await uhr.vor(1000);
  pruefe("AudioContext: nach resume läuft die Zeit weiter bis zum Ende", zweitesEnde && Math.abs(ctx.currentTime - 1.75) < 1e-9);
  const dekodiert = await ctx.decodeAudioData(new ArrayBuffer(7));
  pruefe("AudioContext: decodeAudioData meldet Dauer und Bytes", dekodiert.duration === 1 && (dekodiert as unknown as { bytes: number }).bytes === 7);

  // Echter Code: lib/hoeren.ts liest den Pegel der Analyser in jeder Bildrunde.
  AudioContextAttrappe.pegel = { zeit: 0.5, frequenz: 102 };
  const strom = await navigator.mediaDevices.getUserMedia({ audio: true });
  const stopp = starteHoeren(strom);
  pruefe("hoeren: vor dem ersten Bild steht der Pegel auf 0", lesePegel() === 0);
  await uhr.bild();
  pruefe("hoeren: nach einem Bild liest es Frequenz und Lautstärke der Attrappe", Math.abs(lesePegel() - 102 / 255) < 1e-9 && leseLautstaerke() > 0.4, `${lesePegel()} ${leseLautstaerke()}`);
  const hoerKontext = AudioContextAttrappe.alle.at(-1)!;
  pruefe(
    "hoeren: Mikrofonquelle an zwei Analyser (256 und 1024)",
    hoerKontext.analyser.map((a) => a.fftSize).join(",") === "256,1024" && protokoll.von(`${hoerKontext.name} mikrofon#1 connect`).length === 2,
  );
  stopp();
  await uhr.vor(100);
  pruefe("hoeren: Stoppen schließt den Kontext und beendet die Bildschleife", hoerKontext.state === "closed" && uhr.offen().bilder === 0 && lesePegel() === 0);
  naechsterFall("AudioContext");
}

// ---- 4. fetch mit Strom -------------------------------------------------------------------------------------------------------------
async function pruefeFetchStrom(): Promise<void> {
  const strom = erzeugeStrom();
  netz.antworte("POST /api/ki-assistent", { strom, kopf: { "content-type": "text/event-stream" } });
  const antwort = await fetch("/api/ki-assistent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ frage: "Wie spät?" }) });
  const leser = antwort.body!.pipeThrough(new TextDecoderStream()).getReader();
  strom.sse({ type: "text-delta", delta: "Hal" });
  const erstes = await leser.read();
  strom.sse({ type: "text-delta", delta: "lo" });
  strom.schreibe("data: [DONE]\n\n");
  strom.ende();
  let rest = "";
  for (let teil = await leser.read(); !teil.done; teil = await leser.read()) rest += teil.value;
  pruefe("fetch-Strom: das erste Stück kommt allein an", erstes.value === `data: ${json({ type: "text-delta", delta: "Hal" })}\n\n`, json(erstes.value));
  pruefe("fetch-Strom: der Rest bis zum Ende", rest === `data: ${json({ type: "text-delta", delta: "lo" })}\n\ndata: [DONE]\n\n`);
  pruefe(
    "fetch-Strom: Aufruf mit Methode, Pfad, Kopf und Körper aufgezeichnet",
    netz.aufrufe.length === 1 && netz.aufrufe[0]!.pfad === "/api/ki-assistent" && json(netz.aufrufe[0]!.json) === json({ frage: "Wie spät?" }) && netz.aufrufe[0]!.kopf["content-type"] === "application/json",
  );
  pruefe("fetch-Strom: Status und Inhaltstyp der Antwort", antwort.status === 200 && antwort.headers.get("content-type") === "text/event-stream");

  const ohneRegel = await fetch("/api/unbekannt").then(() => "ok", (f: Error) => f.name);
  pruefe("fetch: ohne Regel scheitert der Aufruf und steht in unbeantwortet", ohneRegel === "TypeError" && netz.unbeantwortet.length === 1);
  const abbruch = new AbortController();
  netz.halte("/api/langsam");
  const langsam = fetch("/api/langsam", { signal: abbruch.signal }).then(() => "ok", (f: Error) => f.name);
  abbruch.abort();
  pruefe("fetch: ein Abbruch endet mit AbortError", (await langsam) === "AbortError");
  const gehalten = netz.halte("GET /api/spaeter");
  const spaeter = fetch("/api/spaeter?x=1");
  await Promise.resolve();
  pruefe("fetch: halte() hält die Antwort, bis der Test sie gibt", gehalten.aufruf?.suche.get("x") === "1");
  gehalten.gib({ json: { fertig: true } });
  pruefe("fetch: ... und gib() liefert sie", json(await (await spaeter).json()) === json({ fertig: true }));
  naechsterFall("fetch");
}

// ---- 5. Weitere Attrappen -----------------------------------------------------------------------------------------------------------
async function pruefeWeitereAttrappen(): Promise<void> {
  const uhr = installiereUhr();
  const ws = new WebSocket("wss://dienst.example/strom");
  const gehoert: unknown[] = [];
  ws.onmessage = (e) => gehoert.push(e.data);
  let geschlossen = null as number | null;
  ws.onclose = (e) => (geschlossen = e.code);
  pruefe("WebSocket: im Aufbau, bis die Uhr läuft", ws.readyState === WebSocket.CONNECTING);
  await uhr.vor(0);
  ws.send(JSON.stringify({ start: true }));
  (ws as unknown as WebSocketAttrappe).empfange({ audio: "AAAA" });
  ws.close(1000);
  pruefe("WebSocket: offen, gesendet, empfangen, schließend", ws.readyState === WebSocket.CLOSING && json((ws as unknown as WebSocketAttrappe).gesendet) === json([{ start: true }]) && gehoert[0] === json({ audio: "AAAA" }));
  await uhr.vor(0);
  pruefe("WebSocket: das close-Ereignis kommt im nächsten Zeitgeber", geschlossen === 1000 && ws.readyState === WebSocket.CLOSED);
  uhr.deinstalliere();

  mikrofon.verweigerung = "NotAllowedError";
  const verweigert = await navigator.mediaDevices.getUserMedia({ audio: true }).then(() => "ok", (f: Error) => f.name);
  mikrofon.verweigerung = null;
  const strom = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true } });
  const aufnahme = new MediaRecorder(strom);
  const stuecke: number[] = [];
  aufnahme.ondataavailable = (e) => stuecke.push(e.data.size);
  let gestoppt = false;
  aufnahme.onstop = () => (gestoppt = true);
  aufnahme.start(250);
  (aufnahme as unknown as MediaRecorderAttrappe).liefere("abc");
  aufnahme.stop();
  await Promise.resolve();
  strom.getTracks().forEach((s) => s.stop());
  pruefe("Mikrofon: verweigert mit NotAllowedError, sonst ein Strom", verweigert === "NotAllowedError" && strom instanceof MediaStreamAttrappe && json(mikrofon.anfragen.at(-1)) === json({ audio: { echoCancellation: true } }));
  pruefe("MediaRecorder: Stück während der Aufnahme, leerer Rest und stop nach dem Stoppen", json(stuecke) === json([3, 0]) && gestoppt);
  pruefe(
    "MediaRecorder: Aufruffolge im Protokoll",
    json(protokoll.von("aufnahme#1").concat(protokoll.von("mikrofon spur"))) === json(["aufnahme#1 new audio/webm;codecs=opus", "aufnahme#1 start(250)", "aufnahme#1 dataavailable", "aufnahme#1 stop", "mikrofon spur#1 stop"]),
    json(protokoll.von("aufnahme#1").concat(protokoll.von("mikrofon spur"))),
  );

  const abfrage = matchMedia("(prefers-reduced-motion: reduce)");
  const wechsel: boolean[] = [];
  abfrage.addEventListener("change", (e) => wechsel.push(e.matches));
  medienAbfragen.setze("(prefers-reduced-motion:reduce)", true);
  pruefe("matchMedia: passt erst nach setze() und meldet change", abfrage.matches && json(wechsel) === json([true]));

  const ziel = document.createElement("div");
  const sichtbar: number[] = [];
  new IntersectionObserver((eintraege) => sichtbar.push((eintraege[0] as IntersectionObserverEntry).intersectionRatio)).observe(ziel);
  IntersectionObserverAttrappe.alle[0]!.melde(ziel, 0.5);
  pruefe("IntersectionObserver: melde() ruft den Beobachter", json(sichtbar) === json([0.5]));

  const leinwandElement = document.createElement("canvas");
  const k = leinwandElement.getContext("2d")!;
  k.beginPath();
  k.arc(1, 1, 1, 0, Math.PI);
  k.arc(2, 2, 1, 0, Math.PI);
  pruefe("Leinwand: der 2D-Kontext zählt Aufrufe", json(leinwand.aufrufe(leinwandElement)) === json({ beginPath: 1, arc: 2 }) && k.measureText("abc").width === 18);
  naechsterFall("Weitere Attrappen");
}

// ---- 6. KI: KiPaneGriff -------------------------------------------------------------------------------------------------------------
async function pruefeKiPaneGriff(): Promise<void> {
  setzeFenster({ breite: 1600 }, false);
  localStorage.setItem("damicon-ki-breite", "600");
  const breite = () => document.documentElement.style.getPropertyValue("--ki-pane-breite");
  const ansicht = rendereMitTexten(
    <div className="ki-pane-huelle">
      <KiPaneGriff />
    </div>,
  );
  const huelle = ansicht.container.querySelector(".ki-pane-huelle")!;
  const griff = screen.getByRole("separator");
  pruefe("KiPaneGriff: Text und Werte aus den Übersetzungen", griff.getAttribute("aria-label") === "Breite ändern: ziehen oder Pfeiltasten, Doppelklick setzt zurück" && ansicht.textFehler.length === 0);
  pruefe("KiPaneGriff: die gespeicherte Breite gilt nach dem Laden", breite() === "600px", breite());
  pruefe("KiPaneGriff: beobachtet die Hülle, aria-valuenow fehlt noch", ResizeObserverAttrappe.alle[0]?.beobachtet.has(huelle) === true && !griff.hasAttribute("aria-valuenow"));
  setzeRechteck(huelle, { width: 400 });
  await ausloesen(() => ResizeObserverAttrappe.meldeAlle());
  pruefe("KiPaneGriff: eine Größenmeldung setzt den Zustand (aria-valuenow)", griff.getAttribute("aria-valuenow") === "400");
  // Absichtlich ohne ausloesen(): React meldet das Update außerhalb von act, und erst nach dem Durchlaufen steht der neue Wert.
  const probe = beobachteKonsole();
  setzeRechteck(huelle, { width: 410 });
  ResizeObserverAttrappe.meldeAlle();
  const sofort = griff.getAttribute("aria-valuenow");
  await abwarten();
  probe.stoppe();
  const spaeter = griff.getAttribute("aria-valuenow");
  setzeRechteck(huelle, { width: 400 });
  await ausloesen(() => ResizeObserverAttrappe.meldeAlle());
  pruefe(
    "Konsole: ein Update außerhalb von act wird gemeldet und erst später gerendert",
    probe.fehler.some((f) => f.includes("not wrapped in act")) && sofort === "400" && spaeter === "410" && griff.getAttribute("aria-valuenow") === "400",
    `${sofort} ${spaeter} ${json(probe.fehler).slice(0, 120)}`,
  );

  const links = fireEvent.keyDown(griff, { key: "ArrowLeft" });
  pruefe("KiPaneGriff: Pfeil links macht 24 px breiter, ab der gespeicherten Breite, und wird gespeichert", !links && breite() === "624px" && localStorage.getItem("damicon-ki-breite") === "624");
  fireEvent.keyDown(griff, { key: "ArrowRight", shiftKey: true });
  pruefe("KiPaneGriff: Umschalt und Pfeil rechts macht 96 px schmaler", breite() === "528px");
  fireEvent.keyDown(griff, { key: "End" });
  const amEnde = breite();
  fireEvent.keyDown(griff, { key: "Home" });
  pruefe("KiPaneGriff: Ende gibt das Maximum (Fenster 1600 minus 680), Pos1 das Minimum 352", amEnde === "920px" && breite() === "352px", amEnde);
  pruefe("KiPaneGriff: andere Tasten bleiben unbehandelt", fireEvent.keyDown(griff, { key: "x" }) === true && breite() === "352px");

  fireEvent.pointerDown(griff, { button: 0, pointerId: 7, clientX: 1000 });
  const zieht = document.documentElement.hasAttribute("data-ki-zieht") && griff.hasPointerCapture(7);
  fireEvent.pointerMove(griff, { pointerId: 7, clientX: 900 });
  const waehrend = breite();
  const gespeichertWaehrend = localStorage.getItem("damicon-ki-breite");
  setzeRechteck(huelle, { width: 500 });
  fireEvent.pointerUp(griff, { pointerId: 7 });
  pruefe("KiPaneGriff: Ziehen fängt den Zeiger und setzt die Breite live, ohne zu speichern", zieht && waehrend === "500px" && gespeichertWaehrend === "352", `${zieht} ${waehrend} ${gespeichertWaehrend}`);
  pruefe(
    "KiPaneGriff: Loslassen gibt den Zeiger frei und speichert die gemessene Breite",
    !document.documentElement.hasAttribute("data-ki-zieht") && !griff.hasPointerCapture(7) && localStorage.getItem("damicon-ki-breite") === "500",
  );
  fireEvent.pointerDown(griff, { button: 0, pointerId: 8, clientX: 700 });
  fireEvent.pointerUp(griff, { pointerId: 8 });
  pruefe("KiPaneGriff: ein Klick ohne Bewegung speichert nichts Neues", localStorage.getItem("damicon-ki-breite") === "500");

  await ausloesen(() => setzeFenster({ breite: 1100 }));
  const schmal = breite();
  await ausloesen(() => setzeFenster({ breite: 1600 }));
  pruefe("KiPaneGriff: ein schmales Fenster begrenzt nur vorübergehend", schmal === "420px" && breite() === "500px" && localStorage.getItem("damicon-ki-breite") === "500", schmal);
  fireEvent.doubleClick(griff);
  pruefe("KiPaneGriff: Doppelklick setzt zurück", breite() === "" && localStorage.getItem("damicon-ki-breite") === null);
  fireEvent.keyDown(griff, { key: "ArrowLeft" });
  pruefe("KiPaneGriff: nach dem Zurücksetzen gilt die gemessene Breite (400) als Basis", breite() === "424px");
  ansicht.unmount();
  pruefe("KiPaneGriff: beim Abbau trennt er den Beobachter und entfernt die Breite", ResizeObserverAttrappe.alle[0]!.getrennt && breite() === "");
  naechsterFall("KiPaneGriff");
}

// ---- 7. KI: useSprachausgabe ----------------------------------------------------------------------------------------------------
async function pruefeSprachausgabeStrom(): Promise<void> {
  netz.antworte(/plan=1/, { json: { bloecke: 2 } });
  const { result, textFehler } = rendereHookMitTexten(() => useSprachausgabe("de"));
  pruefe("Sprachausgabe: der Hook rendert im Textrahmen", result.current.spielt === null && result.current.einstellung === null && textFehler.length === 0);
  await ausloesen(() => result.current.spiele(ID));
  const element = medienElemente.gespielt[0]!;
  pruefe("Sprachausgabe: Block 0 spielt als Strom, der Knopf ist der Stopp", result.current.spielt === ID && result.current.laedt === null && element.getAttribute("src")!.endsWith("&block=0"));
  await ausloesen(() => medienElemente.beende(element));
  pruefe("Sprachausgabe: nach dem Ende von Block 0 folgt Block 1 im selben Element", result.current.spielt === ID && element.getAttribute("src")!.endsWith("&block=1"));
  await ausloesen(() => medienElemente.beende(element));
  pruefe("Sprachausgabe: nach dem letzten Block ist der Knopf wieder frei", result.current.spielt === null);
  pruefe(
    "Sprachausgabe: genau eine Frage nach der Zahl der Blöcke, zwei Mal play",
    netz.aufrufe.length === 1 && netz.aufrufe[0]!.suche.get("plan") === "1" && protokoll.von("medien play").length === 2,
    json(protokoll.von("medien")),
  );
  naechsterFall("Sprachausgabe Strom");
}

async function pruefeSprachausgabeDatei(): Promise<void> {
  const uhr = installiereUhr();
  medienElemente.playFehler.push("NotSupportedError");
  let posts = 0;
  netz.antworte("POST /api/ki-sprachausgabe", () => (++posts === 1 ? { status: 404, json: { grund: "nicht-gefunden" } } : { bytes: new Uint8Array([1, 2, 3]), kopf: { "content-type": "audio/mpeg" } }));
  netz.antworte(/plan=1/, { json: { bloecke: 1 } });
  const { result, unmount } = renderHook(() => useSprachausgabe("de"));
  await ausloesen(() => result.current.spiele(ID, "ru"));
  const anfragen = () => netz.aufrufe.map((a) => `${a.methode}${a.suche.has("plan") ? " plan" : ""}`);
  pruefe(
    "Sprachausgabe: scheitert der Strom, holt sie die Datei; nach 404 wartet sie 1200 ms",
    json(anfragen()) === json(["GET plan", "POST"]) && result.current.laedt === ID && json(uhr.zeitgeber()) === json([{ inMs: 1200, ms: 1200, intervall: false }]),
    json(anfragen()),
  );
  pruefe("Sprachausgabe: die Datei-Anfrage nennt Nachricht, Sprache der Antwort und Block", json(netz.aufrufe[1]!.json) === json({ nachrichtId: ID, sprache: "ru", block: 0 }));
  await uhr.vor(1199);
  const vorher = netz.aufrufe.length;
  await uhr.vor(1);
  pruefe("Sprachausgabe: der zweite Versuch kommt genau nach 1200 ms", vorher === 2 && netz.aufrufe.length === 3);
  pruefe(
    "Sprachausgabe: die Datei spielt über eine Objekt-URL, der Knopf ist der Stopp",
    result.current.spielt === ID && result.current.laedt === null && objektUrls.erzeugt.length === 1 && medienElemente.gespielt[0]?.getAttribute("src") === "blob:attrappe/1",
  );
  unmount();
  pruefe("Sprachausgabe: beim Abbau hält sie an und gibt die Objekt-URL frei", json(objektUrls.widerrufen) === json(["blob:attrappe/1"]) && protokoll.von("medien pause").length === 1);
  naechsterFall("Sprachausgabe Datei");
}

// ---- 8. Haustier: HaustierEinstellung -------------------------------------------------------------------------------------------
async function pruefeHaustier(): Promise<void> {
  const navigation = erzeugeNavigation("/dashboard");
  ersetzeModule(navigation.module);
  // Erst jetzt laden: ki-pane-kontext.tsx holt usePathname und useRouter aus @/i18n/navigation.
  const { KiPaneProvider } = await import("@/components/ki/ki-pane-kontext");
  const { HaustierProvider } = await import("@/components/haustier/haustier-kontext");
  const { HaustierEinstellung } = await import("@/components/haustier/haustier-einstellung");
  const Rahmen = ({ children }: { children: ReactNode }) => (
    <KiPaneProvider verfuegbar>
      <HaustierProvider>{children}</HaustierProvider>
    </KiPaneProvider>
  );
  const ansicht = rendereMitTexten(<HaustierEinstellung />, { wrapper: Rahmen });
  const schalter = (name: string) => screen.getByRole("switch", { name });
  const knopf = (name: string) => screen.getByRole("button", { name });
  pruefe("Haustier: Voreinstellungen (Tour an, Bewegung an, Vorschau Ruhe)", schalter("Geführte Tour").getAttribute("aria-checked") === "true" && schalter("Bewegung").getAttribute("aria-checked") === "true" && knopf("Ruhe").getAttribute("aria-pressed") === "true");
  fireEvent.click(schalter("Geführte Tour"));
  pruefe("Haustier: der Tour-Schalter geht aus und wird gespeichert", schalter("Geführte Tour").getAttribute("aria-checked") === "false" && localStorage.getItem("damicon-haustier-tour") === "aus");
  fireEvent.click(knopf("Arbeitet"));
  pruefe("Haustier: die Vorschau wechselt den Zustand", knopf("Arbeitet").getAttribute("aria-pressed") === "true" && knopf("Ruhe").getAttribute("aria-pressed") === "false");
  fireEvent.click(schalter("Bewegung"));
  pruefe("Haustier: Bewegung aus setzt data-hb-still und speichert", schalter("Bewegung").getAttribute("aria-checked") === "false" && document.documentElement.hasAttribute("data-hb-still") && localStorage.getItem("damicon-haustier-bewegung") === "aus");
  await ausloesen(() => {
    localStorage.setItem("damicon-haustier-tour", "an");
    window.dispatchEvent(new StorageEvent("storage", { key: "damicon-haustier-tour", newValue: "an" }));
  });
  pruefe("Haustier: eine Änderung aus einem anderen Tab kommt über das storage-Ereignis an", schalter("Geführte Tour").getAttribute("aria-checked") === "true");
  pruefe(
    "Haustier: die Navigation kam aus der Attrappe, ohne Sprung",
    modulAufrufe.some((a) => a.modul === "@/i18n/navigation" && a.name === "usePathname") && navigation.verlauf.length === 0 && ansicht.textFehler.length === 0,
    json(ansicht.textFehler),
  );
  const relativ = await import("../../src/i18n/navigation");
  const ueberAlias = await import("@/i18n/navigation");
  pruefe(
    "Modulersatz: auch über einen relativen Pfad kommt die Attrappe, und ihre Aufrufe sind aufgezeichnet",
    relativ.getPathname === ueberAlias.getPathname && relativ.getPathname({ href: "/lager", locale: "de" }) === "/lager" && modulAufrufe.at(-1)?.name === "getPathname",
  );
  naechsterFall("Haustier");
}

async function pruefeNextModule(): Promise<void> {
  ersetzeModule(NEXT_MODULE);
  const { default: dynamic } = await import("next/dynamic");
  const { default: Image } = await import("next/image");
  const Spaeter = dynamic(async () => ({ default: () => <p>geladen</p> }), { loading: () => <p>lädt</p> });
  const ansicht = rendereMitTexten(
    <div>
      <Spaeter />
      <Image src="/himbi.png" alt="Himbi" width={40} height={40} priority />
    </div>,
  );
  const vorher = ansicht.container.textContent;
  await abwarten();
  pruefe(
    "next/dynamic und next/image: erst der Platzhalter, dann die Komponente; das Bild als schlichtes <img>",
    vorher === "lädt" && ansicht.container.textContent === "geladen" && screen.getByAltText("Himbi").getAttribute("src") === "/himbi.png" && !screen.getByAltText("Himbi").hasAttribute("priority"),
    `${vorher} | ${ansicht.container.innerHTML}`,
  );
  naechsterFall("Next-Module");
}

async function main(): Promise<void> {
  pruefeFenster();
  await pruefeUhr();
  await pruefeAudioContext();
  await pruefeFetchStrom();
  await pruefeWeitereAttrappen();
  const konsole = beobachteKonsole();
  await pruefeKiPaneGriff();
  await pruefeSprachausgabeStrom();
  await pruefeSprachausgabeDatei();
  await pruefeHaustier();
  await pruefeNextModule();
  konsole.stoppe();
  pruefe("Konsole: keine Fehler und Warnungen von React (etwa Updates außerhalb von act)", konsole.fehler.length === 0 && konsole.warnungen.length === 0, json([...konsole.fehler, ...konsole.warnungen]).slice(0, 600));
  beendeUmgebung();
  ende();
}

main().catch((e) => {
  console.error("FAIL  Ausnahme", e);
  process.exit(1);
});
