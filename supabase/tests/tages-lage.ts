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
  kuehlAltlast,
  kuehlkettenPunkte,
  kuehlTermin,
  lueckeFuer,
  nichtGeladeneAufgaben,
  waehleFaelligeAufgaben,
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
import { baueWerkzeuge, radarAntwort, radarRohdaten } from "@/lib/ai/tools";
import { ladeTagesLage } from "@/lib/ai/tages-lage";
import { naechsteLieferungAus } from "@/lib/data/startkarte";
import { zeitraumGrenzen } from "@/lib/listen/zeitraum";
import { demoDrittweitergaben, demoVorfaelle } from "@/lib/domain/compliance";
import type { AufgabenStatus } from "@/lib/domain/pflueckaufgaben";
import type { FilterbareAufgabe } from "@/lib/domain/pflueckaufgaben-liste";

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

// ---- 10a. Funde der Pruefung vom 28.09.2026 -----------------------------------------------

// Ein Test, der wirft (etwa weil eine Funktion fehlt), zaehlt als FAIL statt
// den ganzen Lauf abzubrechen.
function pruefeSicher(name: string, test: () => boolean | [boolean, string]) {
  try {
    const ergebnis = test();
    if (Array.isArray(ergebnis)) pruefe(name, ergebnis[0], ergebnis[1]);
    else pruefe(name, ergebnis);
  } catch (e) {
    pruefe(name, false, String(e));
  }
}

// Fund 7: nicht die 20 juengsten Aufgaben der Listenseite, sondern die
// faelligen (offen, angenommen, in_arbeit) vor morgen, aelteste zuerst, mit
// Gesamtzahl.
const VOR_MORGEN = zeitraumGrenzen("heute", {}, JETZT).vor!;
const vorTagen = (tage: number) => new Date(JETZT.getTime() - tage * 24 * 60 * 60_000).toISOString();
function aufgabeT(id: string, status: AufgabenStatus, faelligkeit: string | null, brigadeId: string | null = null): FilterbareAufgabe {
  return { id, code: id, reihenblock: "", sorte: "", brigadeId, status, faelligkeit, angelegt: null };
}
const aufgabenBestand: FilterbareAufgabe[] = [
  // 25 ueberfaellige, 1 bis 25 Tage
  ...Array.from({ length: 25 }, (_, i) => aufgabeT(`ueber-${String(i + 1).padStart(2, "0")}`, i % 3 === 0 ? "in_arbeit" : "offen", vorTagen(i + 1))),
  // 20 heute faellige in der Belegpruefung (zaehlen nicht) - die fuellten frueher die 20er-Seite
  ...Array.from({ length: 20 }, (_, i) => aufgabeT(`beleg-${i}`, "beleg_pruefung", new Date(JETZT.getTime() + 60 * 60_000).toISOString())),
  aufgabeT("abgeschlossen-alt", "abgeschlossen", vorTagen(40)),
  aufgabeT("morgen", "offen", new Date(JETZT.getTime() + 24 * 60 * 60_000).toISOString()),
  aufgabeT("ohne-faelligkeit", "offen", null),
  aufgabeT("fremde-brigade", "angenommen", vorTagen(30), "b-2"),
];
pruefeSicher("Fund 7: alle faelligen Aufgaben vor morgen, Belegpruefung, Abgeschlossenes und Morgiges fallen heraus", () => {
  const w = waehleFaelligeAufgaben(aufgabenBestand, { brigade: { art: "alle" }, vor: VOR_MORGEN, jetzt: JETZT }, 50);
  return [w.gesamt === 26 && w.ueberfaellig === 26 && w.zeilen.length === 26, `gesamt=${w.gesamt} ueberfaellig=${w.ueberfaellig} zeilen=${w.zeilen.length}`];
});
pruefeSicher("Fund 7: aelteste zuerst, das Limit schneidet die juengsten ab, nicht die aeltesten", () => {
  const w = waehleFaelligeAufgaben(aufgabenBestand, { brigade: { art: "alle" }, vor: VOR_MORGEN, jetzt: JETZT }, 10);
  const ids = w.zeilen.map((a) => a.id);
  return [w.zeilen.length === 10 && ids[0] === "fremde-brigade" && ids[1] === "ueber-25" && ids[9] === "ueber-17" && w.gesamt === 26, ids.join(",")];
});
pruefeSicher("Fund 7: die Brigade sieht eigene und Aufgaben ohne Zuordnung, keine fremden", () => {
  const w = waehleFaelligeAufgaben(aufgabenBestand, { brigade: { art: "eigeneUndOhne", id: "b-1" }, vor: VOR_MORGEN, jetzt: JETZT }, 50);
  return [w.gesamt === 25 && !w.zeilen.some((a) => a.id === "fremde-brigade"), `gesamt=${w.gesamt}`];
});
pruefeSicher("Fund 7: nicht geladene Aufgaben zaehlen im Zaehler und in 'weitere' mit", () => {
  const w = waehleFaelligeAufgaben(aufgabenBestand, { brigade: { art: "alle" }, vor: VOR_MORGEN, jetzt: JETZT }, 10);
  const fehlend = nichtGeladeneAufgaben(w, w.zeilen, JETZT);
  const punkte = w.zeilen.map((a) => roh({ id: `aufgabe-${a.id}`, art: "aufgabe", faelligAm: a.faelligkeit }));
  const lage = waehlePunkte(punkte, { jetzt: JETZT, horizontTage: 7, maxPunkte: 6, nichtGeladen: fehlend });
  return [
    gleich(fehlend, { ueberfaellig: 16, heute: 0, bald: 0 }) && lage.zaehler.ueberfaellig === 26 && lage.weitere === 20 && lage.punkte[0]?.id === "aufgabe-fremde-brigade",
    `${JSON.stringify(fehlend)} zaehler=${JSON.stringify(lage.zaehler)} weitere=${lage.weitere}`,
  ];
});
pruefeSicher("Fund 7: gemischt ueberfaellig und heute, nicht Geladenes wird richtig aufgeteilt", () => {
  const bestand = [
    ...[3, 2, 1].map((t) => aufgabeT(`u${t}`, "offen", vorTagen(t))),
    ...[1, 2, 3, 4].map((h) => aufgabeT(`h${h}`, "offen", new Date(JETZT.getTime() + h * 60 * 60_000).toISOString())),
  ];
  const w = waehleFaelligeAufgaben(bestand, { brigade: { art: "alle" }, vor: VOR_MORGEN, jetzt: JETZT }, 5);
  const fehlend = nichtGeladeneAufgaben(w, w.zeilen, JETZT);
  return [gleich(fehlend, { ueberfaellig: 0, heute: 2, bald: 0 }) && w.ueberfaellig === 3 && w.gesamt === 7, JSON.stringify({ fehlend, w: { g: w.gesamt, u: w.ueberfaellig } })];
});

// Fund 8: nur Chargen der letzten 24 Stunden sind Kuehlketten-Punkte; aeltere
// offene Chargen hoechstens als ein Sammelhinweis.
const TAG_MIN = 24 * 60;
pruefeSicher("Fund 8: eine 26 Tage alte, nie vorgekuehlte Charge ist kein Punkt mit Termin", () => kuehlTermin(gepflueckt(26 * TAG_MIN), JETZT) === null);
pruefeSicher("Fund 8: bis 24 Stunden zaehlt die Charge noch, danach ist sie Altlast", () =>
  kuehlTermin(gepflueckt(23 * 60), JETZT) !== null &&
  !kuehlAltlast(gepflueckt(23 * 60), JETZT) &&
  !kuehlAltlast(gepflueckt(TAG_MIN), JETZT) &&
  kuehlAltlast(gepflueckt(TAG_MIN + 1), JETZT) &&
  kuehlTermin(gepflueckt(TAG_MIN + 1), JETZT) === null,
);
const charge = (id: string, minuten: number) => ({ chargeId: id, chargeCode: id, reihenblockCode: "T-N-A-01", pflueckZeitpunkt: gepflueckt(minuten) });
pruefeSicher("Fund 8: Altlasten verdraengen die heutigen Chargen nicht mehr aus den ersten drei Punkten", () => {
  const punkte = kuehlkettenPunkte(
    {
      chargen: [charge("CH-0902-12", 26 * TAG_MIN + 90), charge("CH-0902-15", 26 * TAG_MIN + 45), charge("CH-HEUTE-1", 70), charge("CH-HEUTE-2", 50), charge("CH-JUNG", 30)],
      aeltere: { anzahl: 0, aeltesterCode: null },
      messungen: [],
    },
    JETZT,
    kurz,
    "/k",
  );
  const lage = waehlePunkte(punkte, { jetzt: JETZT, horizontTage: 7, maxPunkte: 3 });
  const ids = lage.punkte.map((p) => `${p.id}:${p.stufe}`);
  const sammel = lage.punkte.find((p) => p.id === "kuehlkette-altlasten");
  return [
    gleich(ids, ["kuehlkette-CH-HEUTE-1:1", "kuehlkette-CH-HEUTE-2:2", "kuehlkette-altlasten:4"]) &&
      sammel?.anzahl === 2 &&
      sammel.titel === "CH-0902-12" &&
      gleich(lage.zaehler, { ueberfaellig: 1, heute: 1, bald: 0 }),
    `${ids.join(", ")} zaehler=${JSON.stringify(lage.zaehler)}`,
  ];
});
pruefeSicher("Fund 8: nicht geladene aeltere Chargen (Zaehlung der Datenbank) gehen in denselben einen Sammelhinweis", () => {
  const punkte = kuehlkettenPunkte(
    { chargen: [charge("CH-HEUTE-1", 70)], aeltere: { anzahl: 5, aeltesterCode: "CH-0901-01" }, messungen: [] },
    JETZT,
    kurz,
    "/k",
  );
  const sammel = punkte.filter((p) => p.id === "kuehlkette-altlasten");
  return [sammel.length === 1 && sammel[0]!.anzahl === 5 && sammel[0]!.hinweis === true && sammel[0]!.titel === "CH-0901-01", JSON.stringify(sammel)];
});
pruefeSicher("Fund 8: ohne Altlasten kein Sammelhinweis; Verstoesse nur der letzten 24 Stunden", () => {
  const messung = (id: string, minutenHer: number, ergebnis: "ok" | "verstoss") => ({
    id,
    chargeCode: id,
    reihenblockCode: null,
    gemessenAm: gepflueckt(minutenHer),
    temperaturC: 7,
    minutenSeitPfluecken: 65,
    ergebnis,
  });
  const punkte = kuehlkettenPunkte(
    { chargen: [], aeltere: { anzahl: 0, aeltesterCode: null }, messungen: [messung("m-neu", 60, "verstoss"), messung("m-alt", 25 * 60, "verstoss"), messung("m-ok", 30, "ok")] },
    JETZT,
    kurz,
    "/k",
  );
  return [gleich(punkte.map((p) => p.id), ["kuehlmessung-m-neu"]) && punkte[0]!.verstoss === true, punkte.map((p) => p.id).join(",")];
});

// Fund 9: faellt eine Ladefunktion auf Beispieldaten zurueck (quelle "fehler"),
// sind das keine Fristen. Der gewollte Demo-Modus (quelle "demo") bleibt.
const vorfaelleDemo = demoVorfaelle.map((v) => ({ ...v }));
const drittDemo = demoDrittweitergaben.map((d) => ({ ...d }));
pruefeSicher("Fund 9: Compliance und MwSt im Ausfall liefern keine Demo-Fristen, die Quellen stehen als ausgefallen da", () => {
  const { rohdaten, ausgefallen } = radarRohdaten({
    mwst: { quelle: "fehler", status: { registriert: false, meldefristAm: "2026-09-01" } },
    esutdFristen: [{ id: "e1", pfluecker: "Name", meldefristAm: "2026-09-20" }],
    cockpit: { quelle: "fehler", vorfaelle: vorfaelleDemo, drittweitergaben: drittDemo },
  });
  return [
    rohdaten.vorfaelleUeberfaellig.length === 0 &&
      rohdaten.drittweitergabenUeberfaellig.length === 0 &&
      rohdaten.mwstMeldefristAm === null &&
      rohdaten.esutdFristen.length === 1 &&
      gleich(ausgefallen, ["steuer", "datenschutz"]),
    JSON.stringify({ ausgefallen, v: rohdaten.vorfaelleUeberfaellig.length }),
  ];
});
pruefeSicher("Fund 9: der Demo-Modus (quelle 'demo') bleibt, wie er ist", () => {
  const { rohdaten, ausgefallen } = radarRohdaten({
    mwst: { quelle: "demo", status: { registriert: false, meldefristAm: null } },
    esutdFristen: [],
    cockpit: { quelle: "demo", vorfaelle: vorfaelleDemo, drittweitergaben: drittDemo },
  });
  return [
    ausgefallen.length === 0 &&
      rohdaten.vorfaelleUeberfaellig.length === vorfaelleDemo.filter((v) => v.ueberfaellig).length &&
      rohdaten.vorfaelleUeberfaellig.length > 0,
    JSON.stringify(ausgefallen),
  ];
});
pruefeSicher("Fund 9: risikoRadarAbrufen meldet den Ausfall ehrlich, ohne Ausfall kein Fehlerfeld", () => {
  const mit = radarAntwort({ sortiert: [], ueberfaelligAnzahl: 0, ausgefallen: ["datenschutz"] }) as Record<string, unknown>;
  const ohne = radarAntwort({ sortiert: [], ueberfaelligAnzahl: 0, ausgefallen: [] }) as Record<string, unknown>;
  return [mit.fehler === "quelle-ausgefallen" && gleich(mit.ausgefallen, ["datenschutz"]) && !("fehler" in ohne) && !("ausgefallen" in ohne), JSON.stringify(mit)];
});

// Fund 10: die naechste Lieferung ab dem Almaty-Tag, nicht ab dem UTC-Tag.
pruefeSicher("Fund 10: ein gestriger, noch bestaetigter Termin verdraengt nicht den naechsten echten", () => {
  const n = naechsteLieferungAus(
    [
      { liefertermin: "2026-09-27", menge_kg: 10 },
      { liefertermin: "2026-09-30", menge_kg: 5 },
      { liefertermin: "2026-09-30", menge_kg: "7" },
      { liefertermin: null, menge_kg: 3 },
    ],
    tagInZone(kurzNachMitternacht),
  );
  return [gleich(n, { liefertermin: "2026-09-30", mengeKg: 12, posten: 2 }), JSON.stringify(n)];
});
pruefeSicher("Fund 10: ohne Termin ab heute keine Lieferung", () => naechsteLieferungAus([{ liefertermin: "2026-09-27", menge_kg: 10 }], "2026-09-28") === null);

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

  // Fund 7 und 9: eine Quelle kann nicht Geladenes melden und einen Teilausfall.
  try {
    const erg = await sammleQuellen(
      {
        aufgabe: async () => ({ punkte: [roh({ id: "a1", art: "aufgabe", faelligAm: "2026-09-20" })], nichtGeladen: { ueberfaellig: 4, heute: 1 } }),
        frist: async () => ({ punkte: [roh({ id: "f-echt", faelligAm: "2026-09-20" })], teilausfall: true }),
        lohn: async () => [roh({ id: "l1", hinweis: true })],
      },
      50,
    );
    pruefe(
      "Fund 7/9: nicht Geladenes wird summiert, ein Teilausfall steht unter luecken und seine echten Punkte kommen trotzdem",
      gleich(erg.nichtGeladen, { ueberfaellig: 4, heute: 1, bald: 0 }) &&
        gleich(erg.luecken, ["frist:fehler"]) &&
        gleich(erg.roh.map((p) => p.id).sort(), ["a1", "f-echt", "l1"]),
      JSON.stringify({ n: erg.nichtGeladen, l: erg.luecken, r: erg.roh.map((p) => p.id) }),
    );
  } catch (e) {
    pruefe("Fund 7/9: sammleQuellen mit nicht Geladenem und Teilausfall", false, String(e));
  }

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

  // Fund 9: meldet das Risiko-Radar eine ausgefallene Teilquelle, steht die
  // Frist-Quelle unter luecken - die echten Fristen (ESUTD) kommen trotzdem.
  const teilweise = await ladeTagesLage("admin", {
    profil: LEERES_PROFIL,
    vorschau: false,
    ladeFristen: async () => ({
      sortiert: [{ id: "esutd-1", kategorie: "arbeit", label: "ESUTD: Name", faelligkeit: "2026-09-25", ziel: "/dashboard/buero/personal" }],
      ausgefallen: ["datenschutz"],
    }),
    jetzt: JETZT,
  });
  pruefe(
    "Fund 9: Ausfall der Datenschutz-Fristen steht als frist:fehler unter luecken, ESUTD bleibt",
    teilweise.luecken.includes("frist:fehler") && teilweise.punkte.some((p) => p.id === "frist-esutd-1"),
    teilweise.luecken.join(", "),
  );
  pruefe("Fund 9: ohne Ausfall keine Frist-Luecke", !lage.luecken.some((l) => l.startsWith("frist:")), lage.luecken.join(", "));
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

const tagesLageQuelle = readFileSync("src/lib/ai/tages-lage.ts", "utf8");
const startkarteQuelle = readFileSync("src/lib/data/startkarte.ts", "utf8");
pruefe(
  "Fund 7: die Tageslage laedt Aufgaben nicht mehr ueber die 20er-Listenseite, sondern aufsteigend mit Gesamtzahl",
  !tagesLageQuelle.includes("ladeAufgabenSeite(") &&
    /\.in\("status", \[\.\.\.faelligkeitZaehltBei\]\)/.test(tagesLageQuelle) &&
    tagesLageQuelle.includes('.order("faelligkeit", { ascending: true })') &&
    tagesLageQuelle.includes('count: "exact"'),
);
pruefe(
  "Fund 8: Kuehlkette mit Zeitfenster statt der 50 aeltesten offenen Chargen",
  /\.gte\("pflueck_zeitpunkt", ab\)/.test(tagesLageQuelle) && /\.lt\("pflueck_zeitpunkt", ab\)/.test(tagesLageQuelle),
);
pruefe(
  "Fund 9: risikoRadarAbrufen und ladeRadarEintraege nutzen radarRohdaten und radarAntwort",
  toolsQuelle.includes("radarRohdaten({") && toolsQuelle.includes("return radarAntwort(await ladeRadarEintraege(rolle))"),
);
pruefe(
  "Fund 10: die Tageslage fragt ab dem Almaty-Tag, die Startkarte bleibt beim bisherigen Aufruf",
  tagesLageQuelle.includes("ladeNaechsteLieferung(profil.b2bKundeId, heute)") &&
    startkarteQuelle.includes('abTag: string = new Date().toISOString().slice(0, 10)') &&
    readFileSync("src/components/dashboard/startkarte-kunde.tsx", "utf8").includes("ladeNaechsteLieferung(b2bKundeId),"),
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
