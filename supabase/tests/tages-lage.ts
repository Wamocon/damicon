// Tests fuer die Tageslage (Werkzeug tagesLageAbrufen, Rueckmeldung vom 28.09.2026:
// Himbi soll vorschlagen, was heute ansteht, und beim Organisieren des Tages helfen).
//
// Geprueft wird die reine Logik aus lib/domain/tages-lage.ts: welche Quellen eine Rolle
// bekommt (alle acht Rollen), wie ein Punkt eingestuft, sortiert und gekuerzt wird, was
// "heute" in Almaty rund um Mitternacht UTC heisst, und dass die Rollenvorschau keine
// persoenlichen Ids traegt. Dazu ein Durchlauf des Werkzeugs im Demo-Modus (ohne
// Datenbank, die Ladefunktionen liefern dann ihre Beispieldaten) und Quelltextpruefungen
// fuer die Einbindung in tools.ts und route.ts.
//
// Kein Netzwerk, keine Datenbank.
// Aufruf: npx --yes tsx supabase/tests/tages-lage.ts

import { readFileSync } from "node:fs";
import type { Kpi } from "@/lib/domain/kpis";
import {
  LEERES_PROFIL,
  aufgabenBedingung,
  auffaelligeKennzahlen,
  bewertePunkt,
  kuehlTermin,
  lueckeFuer,
  massnahmeTermin,
  mitZeitgrenze,
  normiereEingaben,
  profilFuerTagesLage,
  pruefberichtPunkte,
  quellenFuerRolle,
  sammleQuellen,
  sortierePunkte,
  tagPlus,
  terminTag,
  waehlePunkte,
  Zeitueberschreitung,
  type TagesPunkt,
  type TagesPunktRoh,
  type TagesQuelle,
} from "@/lib/domain/tages-lage";
import { tagInZone } from "@/lib/domain/tageszeit";
import { hasPermission, roles, type Role } from "@/lib/rbac";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { baueWerkzeuge } from "@/lib/ai/tools";
import { ladeTagesLage } from "@/lib/ai/tages-lage";

let gesamt = 0;
let fehler = 0;
function pruefe(name: string, ok: boolean, detail = "") {
  gesamt++;
  if (!ok) fehler++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
}
const gleich = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ---- Bausteine -----------------------------------------------------------------------------

// 28.09.2026, 10:00 Uhr in Almaty (UTC+5).
const JETZT = new Date("2026-09-28T05:00:00Z");

function roh(teil: Partial<TagesPunktRoh> & { id: string }): TagesPunktRoh {
  return { art: "frist", titel: teil.id, detail: null, faelligAm: null, wer: "Betrieb", ziel: null, ...teil };
}

function kpi(teil: Partial<Kpi> & { key: string }): Kpi {
  return {
    zone: "hof",
    wert: "5 %",
    ziel: "< 6 %",
    trend: null,
    gutRichtung: "down",
    stufe: "kern",
    sichtbarFuer: ["admin", "betriebsleitung"],
    gerechnet: { zahl: 5, einheit: "%", basis: "test", datensaetze: 10 },
    ...teil,
  } as Kpi;
}

// ---- 1. Eingaben ---------------------------------------------------------------------------

pruefe("Eingaben: ohne Angabe gelten 7 Tage und 6 Punkte", gleich(normiereEingaben({}), { horizontTage: 7, maxPunkte: 6 }));
pruefe(
  "Eingaben: Werte ausserhalb der Grenzen werden auf 0 bis 14 und 3 bis 10 begrenzt",
  gleich(normiereEingaben({ horizontTage: 30, maxPunkte: 1 }), { horizontTage: 14, maxPunkte: 3 }) &&
    gleich(normiereEingaben({ horizontTage: -2, maxPunkte: 99 }), { horizontTage: 0, maxPunkte: 10 }) &&
    gleich(normiereEingaben({ horizontTage: Number.NaN, maxPunkte: 4.4 }), { horizontTage: 7, maxPunkte: 4 }),
);

// ---- 2. Profil und Rollenvorschau ----------------------------------------------------------

const sitzung = { id: "p-1", brigadeId: "b-1", pflueckerId: "pf-1", b2bKundeId: "k-1" };
pruefe(
  "Profil: der angemeldete Nutzer bringt seine Ids mit",
  gleich(profilFuerTagesLage(sitzung, false), { profilId: "p-1", brigadeId: "b-1", pflueckerId: "pf-1", b2bKundeId: "k-1" }),
);
pruefe(
  "Vorschau: keine persoenliche Id, nur die Rollensicht",
  Object.values(profilFuerTagesLage(sitzung, true)).every((v) => v === null),
  JSON.stringify(profilFuerTagesLage(sitzung, true)),
);
pruefe("Ohne Sitzung: leeres Profil", gleich(profilFuerTagesLage(null, false), LEERES_PROFIL));

// ---- 3. Quellen je Rolle (alle acht) -------------------------------------------------------

const erwartet: Record<Role, TagesQuelle[]> = {
  admin: ["frist", "aufgabe", "kuehlkette", "reklamation", "tour", "lieferung", "schulung", "lohn", "pruefbericht", "kennzahl"],
  ceo: ["frist", "aufgabe", "kuehlkette", "reklamation", "tour", "lieferung", "schulung", "lohn", "pruefbericht", "kennzahl"],
  betriebsleitung: ["frist", "aufgabe", "kuehlkette", "reklamation", "tour", "lieferung", "schulung", "kennzahl"],
  buchhaltung: ["frist", "reklamation", "schulung", "lohn", "kennzahl"],
  brigade: ["aufgabe", "kuehlkette", "lieferung", "schulung", "kennzahl"],
  picker: ["schulung"],
  erzeuger: [],
  kunde: ["reklamation", "naechsteLieferung"],
};
for (const rolle of roles) {
  const ist = quellenFuerRolle(rolle);
  pruefe(`Rollenfilter ${rolle}: ${erwartet[rolle].join(", ") || "keine Quelle"}`, gleich(ist, erwartet[rolle]), ist.join(", "));
}
pruefe("Rollenfilter: ohne Rolle keine Quelle", quellenFuerRolle(null).length === 0);
pruefe(
  "Rollenfilter: der Kunde bekommt keine Fristen, keinen Lohn, keinen Pruefbericht und keine Kennzahlen",
  !quellenFuerRolle("kunde").some((q) => ["frist", "lohn", "pruefbericht", "kennzahl", "kuehlkette", "tour"].includes(q)),
);
pruefe(
  "Rollenfilter: den Pruefbericht sehen nur admin und ceo",
  roles.filter((r) => quellenFuerRolle(r).includes("pruefbericht")).join(",") === "admin,ceo",
);
pruefe(
  "Rollenfilter: jede Quelle nur mit dem passenden Recht (Stichproben)",
  roles.every(
    (r) =>
      quellenFuerRolle(r).includes("kuehlkette") === hasPermission(r, "kuehlkette", "view") &&
      quellenFuerRolle(r).includes("lohn") === hasPermission(r, "lohn", "approve") &&
      quellenFuerRolle(r).includes("reklamation") === hasPermission(r, "reklamationen", "view"),
  ),
);

pruefe(
  "Brigade: eigene Brigade und Aufgaben ohne Zuordnung",
  gleich(aufgabenBedingung("brigade", profilFuerTagesLage(sitzung, false)), { art: "eigeneUndOhne", id: "b-1" }),
);
pruefe("Brigade ohne Brigade-Id (Vorschau): nur Aufgaben ohne Zuordnung", gleich(aufgabenBedingung("brigade", profilFuerTagesLage(sitzung, true)), { art: "ohne" }));
pruefe("Betriebsleitung: alle Aufgaben", gleich(aufgabenBedingung("betriebsleitung", profilFuerTagesLage(sitzung, false)), { art: "alle" }));

// ---- 4. Einstufung -------------------------------------------------------------------------

const stufe = (teil: Partial<TagesPunktRoh>, jetzt = JETZT) => bewertePunkt(roh({ id: "x", ...teil }), jetzt);
pruefe("Stufe: Frist heute (Datum) ist Stufe 2, nicht ueberfaellig", stufe({ faelligAm: "2026-09-28" }).stufe === 2 && !stufe({ faelligAm: "2026-09-28" }).ueberfaellig);
pruefe("Stufe: Frist gestern ist ueberfaellig, Stufe 1", stufe({ faelligAm: "2026-09-27" }).stufe === 1 && stufe({ faelligAm: "2026-09-27" }).ueberfaellig);
pruefe("Stufe: Frist morgen ist bald, Stufe 3", stufe({ faelligAm: "2026-09-29" }).stufe === 3);
pruefe("Stufe: Zeitpunkt heute, schon vorbei, ist ueberfaellig", stufe({ faelligAm: "2026-09-28T04:00:00Z" }).stufe === 1);
pruefe("Stufe: Zeitpunkt heute, noch offen, ist Stufe 2", stufe({ faelligAm: "2026-09-28T12:00:00Z" }).stufe === 2);
pruefe("Stufe: Verstoss ohne Termin ist Stufe 1", stufe({ verstoss: true }).stufe === 1);
pruefe("Stufe: Hinweis ist Stufe 4, auch mit Termin in der Zukunft", stufe({ hinweis: true }).stufe === 4 && stufe({ hinweis: true, faelligAm: "2026-09-30" }).stufe === 4);
pruefe("Stufe: ein ueberfaelliger Hinweis bleibt nicht liegen, er wird Stufe 1", stufe({ hinweis: true, faelligAm: "2026-09-20" }).stufe === 1);
pruefe("Stufe: ohne Termin und ohne Kennzeichen ein Hinweis", stufe({}).stufe === 4 && !stufe({}).ueberfaellig);

// ---- 5. "Heute" in Almaty rund um Mitternacht UTC -------------------------------------------

// 27.09. 19:30 UTC ist in Almaty schon der 28.09., 00:30 Uhr.
const kurzNachMitternacht = new Date("2026-09-27T19:30:00Z");
pruefe("Almaty: 19:30 UTC am 27. ist dort schon der 28.", tagInZone(kurzNachMitternacht) === "2026-09-28");
pruefe(
  "Almaty: eine Frist vom 28. gilt kurz nach Mitternacht als heute, nicht als morgen",
  stufe({ faelligAm: "2026-09-28" }, kurzNachMitternacht).stufe === 2,
);
pruefe(
  "Almaty: die Frist vom 27. ist dann schon ueberfaellig (UTC haette 'heute' gesagt)",
  stufe({ faelligAm: "2026-09-27" }, kurzNachMitternacht).ueberfaellig,
);
pruefe("Almaty: 18:59 UTC ist noch derselbe Tag, 19:00 UTC der naechste", tagInZone(new Date("2026-09-28T18:59:59Z")) === "2026-09-28" && tagInZone(new Date("2026-09-28T19:00:00Z")) === "2026-09-29");
pruefe("Termin-Tag: ein Zeitpunkt kurz nach Mitternacht Almaty zaehlt zum Almaty-Tag", terminTag("2026-09-27T19:10:00Z") === "2026-09-28");
pruefe(
  "Auswahl: 'heute' im Ergebnis ist der Almaty-Tag",
  waehlePunkte([], { jetzt: kurzNachMitternacht, horizontTage: 7, maxPunkte: 6 }).heute === "2026-09-28",
);
pruefe("Kalender: tagPlus rechnet ueber Monatsgrenzen", tagPlus("2026-09-28", 7) === "2026-10-05" && tagPlus("2026-12-31", 1) === "2027-01-01");

// ---- 6. Sortierung ------------------------------------------------------------------------

const bewertet = (liste: TagesPunktRoh[]) => liste.map((r) => bewertePunkt(r, JETZT));
const gemischt = bewertet([
  roh({ id: "hinweis", hinweis: true }),
  roh({ id: "bald-weit", faelligAm: "2026-10-03" }),
  roh({ id: "ueber-jung", faelligAm: "2026-09-26" }),
  roh({ id: "heute", faelligAm: "2026-09-28" }),
  roh({ id: "verstoss", verstoss: true }),
  roh({ id: "bald-nah", faelligAm: "2026-09-29" }),
  roh({ id: "ueber-alt", faelligAm: "2026-09-10" }),
]);
const reihenfolge = sortierePunkte(gemischt).map((p) => p.id);
pruefe(
  "Sortierung: Ueberfaelliges nach Alter, Verstoss ohne Termin dahinter, dann heute, dann bald nach Naehe, Hinweise zuletzt",
  gleich(reihenfolge, ["ueber-alt", "ueber-jung", "verstoss", "heute", "bald-nah", "bald-weit", "hinweis"]),
  reihenfolge.join(" > "),
);
const gleichzeitig: TagesPunkt[] = [
  { ...bewertePunkt(roh({ id: "b", faelligAm: "2026-09-26" }), JETZT) },
  { ...bewertePunkt(roh({ id: "a", faelligAm: "2026-09-26" }), JETZT) },
];
pruefe("Sortierung: bei Gleichstand stabil nach Kennung", gleich(sortierePunkte(gleichzeitig).map((p) => p.id), ["a", "b"]));
pruefe(
  "Sortierung: bei gleicher Zeit entscheidet die Stufe",
  gleich(
    sortierePunkte([
      { ...bewertePunkt(roh({ id: "a-heute", faelligAm: "2026-09-28" }), JETZT) },
      { ...bewertePunkt(roh({ id: "z-verstoss", faelligAm: "2026-09-28", verstoss: true }), JETZT) },
    ]).map((p) => p.id),
    ["z-verstoss", "a-heute"],
  ),
);

// ---- 7. Auswahl: Horizont, Kuerzung, Zaehler ---------------------------------------------

const viele: TagesPunktRoh[] = [
  roh({ id: "u1", faelligAm: "2026-09-20" }),
  roh({ id: "u2", faelligAm: "2026-09-21" }),
  roh({ id: "u3", faelligAm: "2026-09-22" }),
  roh({ id: "h1", faelligAm: "2026-09-28" }),
  roh({ id: "h2", faelligAm: "2026-09-28T15:00:00Z" }),
  roh({ id: "b1", faelligAm: "2026-09-30" }),
  roh({ id: "b2", faelligAm: "2026-10-05" }),
  roh({ id: "weit", faelligAm: "2026-10-06" }),
  roh({ id: "k1", hinweis: true }),
  roh({ id: "u1", faelligAm: "2026-09-20" }),
];
const auswahl = waehlePunkte(viele, { jetzt: JETZT, horizontTage: 7, maxPunkte: 4 });
pruefe("Auswahl: auf maxPunkte gekuerzt, dringendste zuerst", gleich(auswahl.punkte.map((p) => p.id), ["u1", "u2", "u3", "h1"]), auswahl.punkte.map((p) => p.id).join(","));
pruefe("Auswahl: Zaehler ueber alle Punkte im Horizont, nicht nur die gezeigten", gleich(auswahl.zaehler, { ueberfaellig: 3, heute: 2, bald: 2 }), JSON.stringify(auswahl.zaehler));
pruefe("Auswahl: jenseits des Horizonts faellt weg, doppelte Kennung zaehlt einmal, 'weitere' stimmt", auswahl.weitere === 4 && !auswahl.punkte.some((p) => p.id === "weit"), `weitere=${auswahl.weitere}`);
const nurHeute = waehlePunkte(viele, { jetzt: JETZT, horizontTage: 0, maxPunkte: 10 });
pruefe("Auswahl: Horizont 0 laesst nur Ueberfaelliges, Heutiges und Hinweise", gleich(nurHeute.zaehler, { ueberfaellig: 3, heute: 2, bald: 0 }) && nurHeute.punkte.some((p) => p.id === "k1"));
const ueberfaelligWeit = waehlePunkte([roh({ id: "alt", faelligAm: "2025-01-01" })], { jetzt: JETZT, horizontTage: 0, maxPunkte: 3 });
pruefe("Auswahl: Ueberfaelliges bleibt, egal wie alt", ueberfaelligWeit.punkte.length === 1 && ueberfaelligWeit.zaehler.ueberfaellig === 1);

// ---- 8. Kuehlkette ------------------------------------------------------------------------

const gepflueckt = (minuten: number) => new Date(JETZT.getTime() - minuten * 60_000).toISOString();
pruefe("Kuehlkette: 30 Minuten gehoeren noch nicht in die Tageslage", kuehlTermin(gepflueckt(30), JETZT) === null);
const knapp = kuehlTermin(gepflueckt(50), JETZT);
pruefe(
  "Kuehlkette: 50 Minuten sind knapp, Frist ist Pfluecken plus 60 Minuten, Stufe 2",
  knapp !== null && knapp.minuten === 50 && knapp.faelligAm === new Date(JETZT.getTime() + 10 * 60_000).toISOString() && bewertePunkt(roh({ id: "c", faelligAm: knapp.faelligAm }), JETZT).stufe === 2,
);
const drueber = kuehlTermin(gepflueckt(75), JETZT);
pruefe("Kuehlkette: 75 Minuten sind ein Verstoss (ueberfaellig, Stufe 1)", drueber !== null && bewertePunkt(roh({ id: "c", faelligAm: drueber.faelligAm }), JETZT).stufe === 1);
pruefe("Kuehlkette: ein kaputter Zeitpunkt liefert nichts", kuehlTermin("kein datum", JETZT) === null);

// ---- 9. Pruefbericht ---------------------------------------------------------------------

pruefe(
  "Pruefbericht: 'sofort' am Berichtstag, '7 Tage' eine Woche spaeter, laengere Fristen nicht",
  massnahmeTermin("sofort", "2026-09-28T03:00:00Z") === "2026-09-28" &&
    massnahmeTermin("7 Tage", "2026-09-28T03:00:00Z") === "2026-10-05" &&
    massnahmeTermin("30 Tage", "2026-09-28T03:00:00Z") === null,
);
const kurz = (t: string) => t.slice(0, 20);
const berichtPunkte = pruefberichtPunkte(
  {
    id: "r1",
    erstelltAm: "2026-09-28T03:00:00Z",
    bericht: {
      prioritaeten: ["P1", "P2", "P3", "P4", 42],
      massnahmen: [
        { titel: "fremd sofort", schritt: "x", verantwortlich: "buchhaltung", frist: "sofort" },
        { titel: "fremd 30", schritt: "x", verantwortlich: "ceo", frist: "30 Tage" },
        { titel: "eigen 7", schritt: "Ein sehr langer Schritt, der gekuerzt wird", verantwortlich: "ceo", frist: "7 Tage" },
        { titel: "fremd 7", schritt: "x", verantwortlich: "admin", frist: "7 Tage" },
        { titel: "fremd sofort 2", schritt: "x", verantwortlich: "admin", frist: "sofort" },
      ],
    },
  },
  "ceo",
  kurz,
  "/dashboard",
);
const hinweise = berichtPunkte.filter((p) => p.hinweis);
const massnahmen = berichtPunkte.filter((p) => !p.hinweis);
pruefe("Pruefbericht: hoechstens drei Prioritaeten, nur Texte", gleich(hinweise.map((p) => p.titel), ["P1", "P2", "P3"]));
pruefe(
  "Pruefbericht: hoechstens drei Massnahmen mit 'sofort' oder '7 Tage', die eigene Rolle zuerst",
  gleich(massnahmen.map((p) => p.titel), ["eigen 7", "fremd sofort", "fremd 7"]) && massnahmen[0]!.wer === "meine Rolle" && massnahmen[1]!.wer === "Betrieb",
  massnahmen.map((p) => p.titel).join(", "),
);
pruefe("Pruefbericht: Texte werden gekuerzt", massnahmen[0]!.detail === "Ein sehr langer Schr");
pruefe(
  "Pruefbericht: ein kaputter Bericht liefert nichts und wirft nicht",
  pruefberichtPunkte({ id: "r2", erstelltAm: "2026-09-28", bericht: null }, "ceo", kurz, "/dashboard").length === 0 &&
    pruefberichtPunkte({ id: "r3", erstelltAm: "2026-09-28", bericht: { prioritaeten: "x", massnahmen: [null, 1] } }, "ceo", kurz, "/dashboard").length === 0,
);

// ---- 10. Kennzahlen -----------------------------------------------------------------------

const kennzahlen = [
  kpi({ key: "im-ziel", gerechnet: { zahl: 5, einheit: "%", basis: "t", datensaetze: 1 } }),
  kpi({ key: "verfehlt", gerechnet: { zahl: 9, einheit: "%", basis: "t", datensaetze: 1 } }),
  kpi({ key: "knapp", gerechnet: { zahl: 6.3, einheit: "%", basis: "t", datensaetze: 1 } }),
  kpi({ key: "platzhalter", wert: "20 %", gerechnet: null }),
  kpi({ key: "weit-verfehlt", gerechnet: { zahl: 30, einheit: "%", basis: "t", datensaetze: 1 } }),
];
const auffaellig = auffaelligeKennzahlen("admin", kennzahlen).map((k) => k.kpi.key);
pruefe("Kennzahlen: hoechstens zwei, gemessen, am weitesten daneben zuerst, kein Platzhalter", gleich(auffaellig, ["weit-verfehlt", "verfehlt"]), auffaellig.join(","));
pruefe("Kennzahlen: der Kunde bekommt keine", auffaelligeKennzahlen("kunde", kennzahlen).length === 0);

// ---- 11. Laufzeit: Zeitgrenze und Luecken --------------------------------------------------

async function laufzeit() {
  const haengt = new Promise<TagesPunktRoh[]>(() => {});
  let zeitFehler: unknown = null;
  await mitZeitgrenze(haengt, 30).catch((e) => (zeitFehler = e));
  pruefe("Zeitgrenze: eine haengende Quelle wird abgebrochen", zeitFehler instanceof Zeitueberschreitung);

  const beginn = Date.now();
  const { roh: punkte, luecken } = await sammleQuellen(
    {
      frist: async () => [roh({ id: "f1", faelligAm: "2026-09-28" })],
      tour: () => haengt,
      lohn: async () => {
        throw new Error("db weg");
      },
    },
    50,
  );
  pruefe(
    "Luecken: haengende und fehlerhafte Quellen stehen unter luecken, der Rest kommt trotzdem",
    punkte.length === 1 && gleich([...luecken].sort(), ["lohn:fehler", "tour:zeitueberschreitung"]),
    luecken.join(", "),
  );
  pruefe("Luecken: alle Quellen laufen gleichzeitig (eine Zeitgrenze, nicht mehrere nacheinander)", Date.now() - beginn < 1000, `${Date.now() - beginn} ms`);
  pruefe("Luecken: Vorschau und fehlendes Profil als Kennung", lueckeFuer("schulung", "vorschau") === "schulung:vorschau" && lueckeFuer("naechsteLieferung", "ohne-profil") === "naechsteLieferung:ohne-profil");

  // ---- 12. Das Werkzeug im Demo-Modus ---------------------------------------------------
  if (isSupabaseConfigured()) {
    console.log("SKIP  Demo-Durchlauf: eine Datenbank ist konfiguriert, dieser Teil laeuft nur ohne");
    return;
  }
  const fristen = async () => ({
    sortiert: [
      { id: "mwst", kategorie: "steuer", label: "MwSt-Registrierung", faelligkeit: "2026-09-25", ziel: "/dashboard/buero/compliance#mwst-registrierung" },
      { id: "esutd-1", kategorie: "arbeit", label: "ESUTD: Name", faelligkeit: "2026-10-30", ziel: "/dashboard/buero/personal" },
    ],
  });
  const lage = await ladeTagesLage("admin", { profil: LEERES_PROFIL, vorschau: false, maxPunkte: 5, ladeFristen: fristen, jetzt: JETZT });
  pruefe(
    "Werkzeug: liefert heute, stand, rolle, vorschau, zaehler, punkte, luecken",
    lage.heute === "2026-09-28" && lage.stand === JETZT.toISOString() && lage.rolle === "admin" && lage.vorschau === false && Array.isArray(lage.luecken),
  );
  pruefe("Werkzeug: hoechstens maxPunkte, Ueberfaelliges vorn", lage.punkte.length <= 5 && lage.punkte[0]?.stufe === 1 && lage.punkte.some((p) => p.id === "frist-mwst"), lage.punkte.map((p) => p.id).join(", "));
  pruefe("Werkzeug: Fristen jenseits des Horizonts fehlen", !lage.punkte.some((p) => p.id === "frist-esutd-1") && lage.zaehler.ueberfaellig >= 1);
  pruefe("Werkzeug: jeder Punkt hat Stufe 1 bis 4 und ein 'wer' aus der festen Liste", lage.punkte.every((p) => [1, 2, 3, 4].includes(p.stufe) && ["ich", "meine Brigade", "meine Rolle", "Betrieb"].includes(p.wer)));
  pruefe("Werkzeug: ohne Profil steht die eigene Schulung unter luecken", lage.luecken.includes("schulung:ohne-profil"), lage.luecken.join(", "));

  const vorschau = await ladeTagesLage("kunde", {
    profil: profilFuerTagesLage(sitzung, false),
    vorschau: true,
    ladeFristen: fristen,
    jetzt: JETZT,
  });
  pruefe(
    "Werkzeug in der Vorschau: vorschau true, und ein mitgegebenes Profil wird nicht benutzt",
    vorschau.vorschau === true && vorschau.luecken.includes("naechsteLieferung:vorschau") && !vorschau.punkte.some((p) => p.art === "frist"),
    vorschau.luecken.join(", "),
  );
}

// ---- 13. Einbindung ------------------------------------------------------------------------

const mitWerkzeug = roles.filter((r) => "tagesLageAbrufen" in baueWerkzeuge(r));
pruefe(
  "Einbindung: tagesLageAbrufen genau fuer die Rollen mit ki_assistent:create",
  gleich(mitWerkzeug, roles.filter((r) => hasPermission(r, "ki_assistent", "create"))),
  mitWerkzeug.join(", "),
);
pruefe("Einbindung: auch im Weg ohne Aktionen (nurLesen)", "tagesLageAbrufen" in baueWerkzeuge("brigade", { nurLesen: true }));
const werkzeug = baueWerkzeuge("admin").tagesLageAbrufen as unknown as {
  description?: string;
  needsApproval?: unknown;
  inputSchema: { safeParse: (x: unknown) => { success: boolean } };
};
pruefe("Einbindung: keine Freigabe noetig", !werkzeug.needsApproval);
pruefe(
  "Einbindung: Beschreibung nennt Tagesbeginn, 'was steht heute an' und dass es datenLesen-Aufrufe ersetzt",
  Boolean(werkzeug.description?.includes("Tagesbeginn") && werkzeug.description.includes("was steht heute an") && werkzeug.description.includes("datenLesen")),
);
pruefe(
  "Einbindung: Eingaben horizontTage 0 bis 14, maxPunkte 3 bis 10, beide optional",
  werkzeug.inputSchema.safeParse({}).success &&
    werkzeug.inputSchema.safeParse({ horizontTage: 0, maxPunkte: 3 }).success &&
    werkzeug.inputSchema.safeParse({ horizontTage: 14, maxPunkte: 10 }).success &&
    !werkzeug.inputSchema.safeParse({ horizontTage: 15 }).success &&
    !werkzeug.inputSchema.safeParse({ maxPunkte: 2 }).success &&
    !werkzeug.inputSchema.safeParse({ maxPunkte: 11 }).success,
);

const toolsQuelle = readFileSync("src/lib/ai/tools.ts", "utf8");
const routeQuelle = readFileSync("src/app/api/ki-assistent/route.ts", "utf8");
pruefe(
  "tools.ts: Fristen der Tageslage kommen aus derselben Funktion wie das Risiko-Radar",
  toolsQuelle.includes("ladeFristen: () => ladeRadarEintraege(rolle)") && toolsQuelle.includes("await ladeRadarEintraege(rolle)"),
);
pruefe("tools.ts: das Werkzeug haengt am Recht ki_assistent:create", /hasPermission\(rolle, "ki_assistent", "create"\)\s*\?\s*baueTagesLageWerkzeug/.test(toolsQuelle));
const aufruf = routeQuelle.slice(routeQuelle.indexOf("baueWerkzeuge(rolle, {"), routeQuelle.indexOf("baueWerkzeuge(rolle, {") + 600);
pruefe(
  "route.ts: baueWerkzeuge bekommt das Profil, in der Vorschau ohne persoenliche Ids",
  aufruf.includes("profil: profilFuerTagesLage(profil, vorschau)") && routeQuelle.includes('import { profilFuerTagesLage } from "@/lib/domain/tages-lage"'),
);

const sprachen = ["de", "en", "ru", "kk"] as const;
const ohneText = sprachen.flatMap((s) => {
  const t = JSON.parse(readFileSync(`src/messages/${s}.json`, "utf8")) as { kiAssistentAnsicht: Record<string, Record<string, unknown>> };
  return (["werkzeug", "laeuft", "ziel"] as const).filter((b) => typeof t.kiAssistentAnsicht[b]?.tagesLageAbrufen !== "string").map((b) => `${s}:${b}`);
});
pruefe("Beschriftung: tagesLageAbrufen in allen vier Sprachen (werkzeug, laeuft, ziel)", ohneText.length === 0, ohneText.join(", "));

laufzeit()
  .catch((e) => pruefe("Laufzeitpruefungen laufen durch", false, String(e)))
  .then(() => {
    console.log(`\nPruefungen: ${gesamt}   bestanden: ${gesamt - fehler}   fehlgeschlagen: ${fehler}`);
    if (fehler > 0) process.exit(1);
    console.log("Alle Pruefungen bestanden.");
    process.exit(0);
  });
