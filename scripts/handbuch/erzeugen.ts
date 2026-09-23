// Erzeugt das Produkthandbuch als eigenstaendige HTML-Datei, je eine Datei pro
// Sprache. Aufruf: npm run handbuch
//
// Warum generiert statt handgepflegt:
//
//   * Vier Sprachen. Vier Dateien von Hand zu pflegen hiesse, vier Staende
//     auseinanderlaufen zu lassen.
//   * Module, Zonen, Rollen und Rechte stehen bereits in der Anwendung, und
//     zwar uebersetzt. Sie hier noch einmal abzuschreiben hiesse, eine zweite
//     Wahrheit zu fuehren, die beim naechsten neuen Modul veraltet. Der
//     Generator liest stattdessen src/lib/modules.ts, src/lib/rbac.ts und die
//     Sprachkataloge - das Handbuch kann damit gar nicht anders aussehen als
//     das Portal.
//
// Von Hand gepflegt wird nur das, was die Anwendung nicht selbst weiss:
// scripts/handbuch/texte-*.ts.

import { writeFileSync } from "node:fs";
import path from "node:path";
import { modules, zones, type ModuleDef } from "@/lib/modules";
import { roles, hasPermission, type Role } from "@/lib/rbac";
import de from "@/messages/de.json";
import en from "@/messages/en.json";
import kk from "@/messages/kk.json";
import ru from "@/messages/ru.json";
import { sprachen, type HandbuchTexte, type Sprache, type Anleitung } from "./typen";
import { de as textDe } from "./texte-de";
import { en as textEn } from "./texte-en";
import { kk as textKk } from "./texte-kk";
import { ru as textRu } from "./texte-ru";

const texte: Record<Sprache, HandbuchTexte> = {
  de: textDe,
  en: textEn,
  kk: textKk,
  ru: textRu,
};

// Die Sprachkataloge der Anwendung. Der Typ ist bewusst weich: hier wird nur
// gelesen, und jede Sprache traegt dieselben Schluessel.
type Katalog = Record<string, Record<string, Record<string, string> | string>>;
const kataloge: Record<Sprache, Katalog> = {
  de: de as unknown as Katalog,
  en: en as unknown as Katalog,
  kk: kk as unknown as Katalog,
  ru: ru as unknown as Katalog,
};

// ── Hilfen ────────────────────────────────────────────────────────────────

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Holt einen Text aus dem Sprachkatalog der Anwendung. Faellt eine Uebersetzung
 * aus, greift Deutsch - dasselbe Verhalten wie next-intl im Portal, damit das
 * Handbuch keine leeren Stellen zeigt, wo die Oberflaeche deutschen Text zeigt.
 */
function ausKatalog(sprache: Sprache, pfad: string): string {
  const lesen = (k: Katalog) =>
    pfad.split(".").reduce<unknown>(
      (wert, teil) =>
        wert && typeof wert === "object"
          ? (wert as Record<string, unknown>)[teil]
          : undefined,
      k,
    );
  const wert = lesen(kataloge[sprache]) ?? lesen(kataloge.de);
  return typeof wert === "string" ? wert : "";
}

/** Rollen, die dieses Modul ueberhaupt sehen duerfen. */
function sehendeRollen(modul: ModuleDef): Role[] {
  return roles.filter((rolle) => hasPermission(rolle, modul.resource, "view"));
}

/** Rollen, die in diesem Modul etwas aendern duerfen - in irgendeiner Form. */
const schreibAktionen = [
  "create",
  "update",
  "delete",
  "manage",
  "approve",
  "assign",
  "complete",
] as const;

function schreibendeRollen(modul: ModuleDef): Role[] {
  return roles.filter((rolle) =>
    schreibAktionen.some((aktion) => hasPermission(rolle, modul.resource, aktion)),
  );
}

function rollenNamen(sprache: Sprache, liste: Role[]): string {
  return liste.map((rolle) => ausKatalog(sprache, `roles.${rolle}`)).join(", ");
}

// ── Bausteine ─────────────────────────────────────────────────────────────

// Die Bildmarke von Damicon - das Sonnensiegel aus
// src/components/brand/damicon-logo.tsx. Dort traegt das SVG
// Tailwind-Klassen; hier stehen dieselben Farben als CSS-Variablen, weil das
// Handbuch eine eigenstaendige Datei ohne Tailwind ist. Gold und Himbeerrot
// gelten in beiden Farbschemata unveraendert, deshalb als feste Werte.
const STRAHLEN = [
  "M43 68 L34 68",
  "M44 61.5 L35.5 58.7",
  "M47 55.7 L39.7 50.4",
  "M51.7 51 L46.4 43.7",
  "M57.5 48 L54.7 39.5",
  "M64 47 L64 38",
  "M70.5 48 L73.3 39.5",
  "M76.3 51 L81.6 43.7",
  "M81 55.7 L88.3 50.4",
  "M84 61.5 L92.5 58.7",
  "M85 68 L94 68",
];

const ALTYN = "#f2c14b";
const HIMBEERE = "#ff5c7a";

function logo(klasse: string, titel: string): string {
  const strahlen = STRAHLEN.map((d) => `<path d="${d}" />`).join("");
  return `<svg class="${klasse}" viewBox="0 0 128 128" role="img" aria-label="${esc(titel)}">
      <rect width="128" height="128" rx="28" fill="var(--primaer)" />
      <circle cx="64" cy="64" r="46" fill="none" stroke="var(--primaer-auf)" stroke-opacity="0.85" stroke-width="4.5" />
      <g fill="none" stroke="${ALTYN}" stroke-width="4.5" stroke-linecap="round">${strahlen}</g>
      <circle cx="64" cy="68" r="15" fill="${HIMBEERE}" />
      <path d="M32 92H96" fill="none" stroke="var(--primaer-auf)" stroke-opacity="0.85" stroke-width="5.5" stroke-linecap="round" />
    </svg>`;
}

/**
 * Dasselbe Zeichen als Favicon. Eine data-URI, weil das Handbuch als einzelne
 * Datei weitergegeben und offline geoeffnet werden koennen muss - eine
 * Bilddatei daneben ginge dabei verloren. CSS-Variablen gibt es in diesem
 * Zusammenhang nicht, deshalb hier die festen Werte des hellen Schemas.
 */
function favicon(): string {
  const strahlen = STRAHLEN.map((d) => `<path d="${d}"/>`).join("");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">` +
    `<rect width="128" height="128" rx="28" fill="#00768f"/>` +
    `<circle cx="64" cy="64" r="46" fill="none" stroke="#ffffff" stroke-opacity=".85" stroke-width="4.5"/>` +
    `<g fill="none" stroke="${ALTYN}" stroke-width="4.5" stroke-linecap="round">${strahlen}</g>` +
    `<circle cx="64" cy="68" r="15" fill="${HIMBEERE}"/>` +
    `<path d="M32 92H96" fill="none" stroke="#ffffff" stroke-opacity=".85" stroke-width="5.5" stroke-linecap="round"/>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function tabelle(kopf: string[], zeilen: string[][]): string {
  const kopfzeile = kopf.map((h) => `<th>${esc(h)}</th>`).join("");
  const koerper = zeilen
    .map((z) => `<tr>${z.map((c) => `<td>${c}</td>`).join("")}</tr>`)
    .join("\n            ");
  return `<div class="tabelle">
        <table>
          <thead><tr>${kopfzeile}</tr></thead>
          <tbody>
            ${koerper}
          </tbody>
        </table>
      </div>`;
}

function anleitung(a: Anleitung, nummer: string): string {
  const schritte = a.schritte.map((s) => `          <li>${esc(s)}</li>`).join("\n");
  const einleitung = a.einleitung ? `\n      <p>${esc(a.einleitung)}</p>` : "";
  return `      <h3 id="anleitung-${a.id}">${nummer} ${esc(a.titel)}</h3>${einleitung}
      <ol>
${schritte}
      </ol>`;
}

// ── Die einzelnen Kapitel ─────────────────────────────────────────────────

function kapitelUeberblick(sprache: Sprache, t: HandbuchTexte): string {
  const u = t.uebersicht;

  const zonenKarten = zones
    .map(
      (zone) => `        <div class="karte-klein">
          <div class="karte-klein-titel">${esc(ausKatalog(sprache, `zones.${zone.key}.name`))}</div>
          <div class="karte-klein-zeile">${esc(ausKatalog(sprache, `zones.${zone.key}.tagline`))}</div>
          <p>${esc(ausKatalog(sprache, `zones.${zone.key}.description`))}</p>
        </div>`,
    )
    .join("\n");

  const rollenZeilen = roles.map((rolle) => [
    `<strong>${esc(ausKatalog(sprache, `roles.${rolle}`))}</strong>`,
    esc(ausKatalog(sprache, `roles.descriptions.${rolle}`)),
  ]);

  return `    <section id="ueberblick">
      <h2><span class="nr">01</span> ${esc(t.kapitel.uebersicht)}</h2>
      <p>${esc(u.einleitung)}</p>

      <div class="kasten kasten-wichtig">
        <div class="kasten-titel">${esc(u.kernsatzTitel)}</div>
        <p>${esc(u.kernsatz)}</p>
      </div>

      <div class="kasten kasten-warnung">
        <div class="kasten-titel">${esc(u.hinweisTitel)}</div>
        <p>${esc(u.hinweis)}</p>
      </div>

      <h3 id="ueberblick-zonen">1.1 ${esc(u.zonenTitel)}</h3>
      <p>${esc(u.zonenEinleitung)}</p>
      <div class="karten-raster">
${zonenKarten}
      </div>

      <h3 id="ueberblick-rollen">1.2 ${esc(u.rollenTitel)}</h3>
      <p>${esc(u.rollenEinleitung)}</p>
      ${tabelle([u.spalteRolle, u.spalteBeschreibung], rollenZeilen)}

      <div class="kasten kasten-info">
        <div class="kasten-titel">${esc(u.bedienhinweisTitel)}</div>
        <p>${esc(u.bedienhinweisSuche)}</p>
        <p class="abstand-oben">${esc(u.bedienhinweisPdf)}</p>
      </div>
    </section>`;
}

function kapitelBedienung(t: HandbuchTexte): string {
  const b = t.bedienung;

  const teile = b.teile
    .map(
      (teil) => `        <div class="karte-klein">
          <div class="karte-klein-titel">${esc(teil.titel)}</div>
          <p>${esc(teil.text)}</p>
        </div>`,
    )
    .join("\n");

  const anmeldeschritte = b.anmeldung.schritte
    .map((s) => `          <li>${esc(s)}</li>`)
    .join("\n");

  return `    <section id="bedienung">
      <h2><span class="nr">02</span> ${esc(t.kapitel.bedienung)}</h2>
      <p>${esc(b.einleitung)}</p>

      <h3 id="bedienung-anmelden">2.1 ${esc(b.anmeldungTitel)}</h3>
      <ol>
${anmeldeschritte}
      </ol>
      <div class="kasten kasten-info">
        <div class="kasten-titel">${esc(b.zugaengeTitel)}</div>
        <p>${esc(b.zugaengeText)}</p>
        <p class="abstand-oben">${esc(b.zugaengePasswort)}</p>
      </div>

      <h3 id="bedienung-aufbau">2.2 ${esc(b.aufbauTitel)}</h3>
      <p>${esc(b.aufbauEinleitung)}</p>
      <div class="karten-raster">
${teile}
      </div>

      <h3 id="bedienung-sprache">2.3 ${esc(b.spracheTitel)}</h3>
      <p>${esc(b.spracheText)}</p>

      <h3 id="bedienung-thema">2.4 ${esc(b.themaTitel)}</h3>
      <p>${esc(b.themaText)}</p>

      <h3 id="bedienung-rolle">2.5 ${esc(b.rolleTitel)}</h3>
      <p>${esc(b.rolleText)}</p>

      <h3 id="bedienung-offline">2.6 ${esc(b.offlineTitel)}</h3>
      <p>${esc(b.offlineText)}</p>
    </section>`;
}

function kapitelBereiche(sprache: Sprache, t: HandbuchTexte): string {
  const b = t.bereiche;

  // Uebersichtstabelle ueber alle 26 Module, nach Zone gruppiert.
  const alleZeilen = zones.flatMap((zone) =>
    modules
      .filter((m) => m.zone === zone.key)
      .map((modul) => [
        `<strong>${esc(ausKatalog(sprache, `modules.${modul.key}.navTitle`))}</strong>`,
        modul.reifegrad === "angebunden"
          ? `<span class="pille pille-gut">${esc(b.standAngebunden)}</span>`
          : `<span class="pille pille-offen">${esc(b.standEntwicklung)}</span>`,
        esc(rollenNamen(sprache, sehendeRollen(modul))),
      ]),
  );

  // Je Zone ein Unterkapitel, darin je Modul ein Abschnitt.
  const zonenAbschnitte = zones
    .map((zone, zoneIndex) => {
      const zoneModule = modules.filter((m) => m.zone === zone.key);
      const nummer = `3.${zoneIndex + 1}`;

      const modulAbschnitte = zoneModule
        .map((modul, modulIndex) => {
          const titel = ausKatalog(sprache, `modules.${modul.key}.title`);
          const zweck = ausKatalog(sprache, `modules.${modul.key}.description`);
          const kurz = ausKatalog(sprache, `modules.${modul.key}.summary`);
          const offen = ausKatalog(sprache, `modules.${modul.key}.todo`);
          const sehen = sehendeRollen(modul);
          const schreiben = schreibendeRollen(modul);
          const pille =
            modul.reifegrad === "angebunden"
              ? `<span class="pille pille-gut">${esc(b.standAngebunden)}</span>`
              : `<span class="pille pille-offen">${esc(b.standEntwicklung)}</span>`;

          const offenZeile = offen
            ? `\n        <div class="merkmal"><span class="merkmal-name">${esc(b.modulOffen)}</span><span>${esc(offen)}</span></div>`
            : "";

          return `      <h4 id="modul-${modul.key}">${nummer}.${modulIndex + 1} ${esc(titel)} ${pille}</h4>
      <p>${esc(zweck)}</p>
      <div class="merkmale">
        <div class="merkmal"><span class="merkmal-name">${esc(b.modulKurz)}</span><span>${esc(kurz)}</span></div>
        <div class="merkmal"><span class="merkmal-name">${esc(b.modulPfad)}</span><span><code>/${sprache}/dashboard/${esc(modul.zone)}/${esc(modul.slug)}</code></span></div>
        <div class="merkmal"><span class="merkmal-name">${esc(b.modulRollen)}</span><span>${sehen.length ? esc(rollenNamen(sprache, sehen)) : esc(b.modulRollenLeer)}</span></div>
        <div class="merkmal"><span class="merkmal-name">${esc(b.modulSchreiben)}</span><span>${schreiben.length ? esc(rollenNamen(sprache, schreiben)) : esc(b.modulSchreibenLeer)}</span></div>${offenZeile}
      </div>`;
        })
        .join("\n\n");

      return `      <h3 id="bereich-${zone.key}">${nummer} ${esc(ausKatalog(sprache, `zones.${zone.key}.name`))}</h3>
      <p>${esc(ausKatalog(sprache, `zones.${zone.key}.description`))}</p>

${modulAbschnitte}`;
    })
    .join("\n\n");

  return `    <section id="bereiche">
      <h2><span class="nr">03</span> ${esc(t.kapitel.bereiche)}</h2>
      <p>${esc(b.einleitung)}</p>
      ${tabelle([b.spalteModul, b.spalteStand, b.spalteRollen], alleZeilen)}
      <div class="kasten kasten-info">
        <p><strong>${esc(b.standAngebunden)}</strong> — ${esc(b.standAngebundenErklaerung)}</p>
        <p class="abstand-oben"><strong>${esc(b.standEntwicklung)}</strong> — ${esc(b.standEntwicklungErklaerung)}</p>
      </div>

${zonenAbschnitte}
    </section>`;
}

function kapitelAnleitungen(t: HandbuchTexte): string {
  const a = t.anleitungen;
  const liste = a.liste
    .map((eintrag, index) => anleitung(eintrag, `4.${index + 1}`))
    .join("\n\n");

  return `    <section id="anleitungen">
      <h2><span class="nr">04</span> ${esc(t.kapitel.anleitungen)}</h2>
      <p>${esc(a.einleitung)}</p>

${liste}
    </section>`;
}

function kapitelReferenz(sprache: Sprache, t: HandbuchTexte): string {
  const r = t.referenz;

  const routenZeilen = r.routen.map((route) => [
    `<code>${esc(route.pfad)}</code>`,
    esc(route.beschreibung),
    esc(route.zugriff),
  ]);

  // Rechtematrix: je Modul eine Zeile, je Rolle eine Spalte. Aus rbac.ts
  // erzeugt, damit sie nicht veralten kann.
  const rechteKopf = [r.spalteRessource, ...roles.map((rolle) => ausKatalog(sprache, `roles.${rolle}`))];
  const rechteZeilen = modules.map((modul) => [
    `<strong>${esc(ausKatalog(sprache, `modules.${modul.key}.navTitle`))}</strong>`,
    ...roles.map((rolle) => {
      const sehen = hasPermission(rolle, modul.resource, "view");
      const schreiben = schreibAktionen.some((aktion) =>
        hasPermission(rolle, modul.resource, aktion),
      );
      if (schreiben) return `<span class="recht recht-schreiben" title="${esc(r.rechteTitel)}">●</span>`;
      if (sehen) return `<span class="recht recht-lesen">○</span>`;
      return `<span class="recht recht-keins">·</span>`;
    }),
  ]);

  const schnittZeilen = r.schnittstellen.map((s) => [
    `<code>${esc(s.pfad)}</code>`,
    esc(s.aufgabe),
    esc(s.zugriff),
  ]);

  return `    <section id="referenz">
      <h2><span class="nr">05</span> ${esc(t.kapitel.referenz)}</h2>

      <h3 id="referenz-seiten">5.1 ${esc(r.routenTitel)}</h3>
      <p>${esc(r.routenEinleitung)}</p>
      ${tabelle([r.spaltePfad, r.spalteBeschreibung, r.spalteZugriff], routenZeilen)}
      <p>${esc(r.routenNachsatz)}</p>

      <h3 id="referenz-rechte">5.2 ${esc(r.rechteTitel)}</h3>
      <p>${esc(r.rechteEinleitung)}</p>
      <p class="legende">
        <span class="recht recht-schreiben">●</span> ${esc(r.rechteTitel)} &nbsp;
        <span class="recht recht-lesen">○</span> ${esc(t.bereiche.modulRollen)} &nbsp;
        <span class="recht recht-keins">·</span> —
      </p>
      <div class="tabelle tabelle-matrix">
        <table>
          <thead><tr>${rechteKopf.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
          <tbody>
            ${rechteZeilen.map((z) => `<tr>${z.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("\n            ")}
          </tbody>
        </table>
      </div>
      <div class="kasten kasten-wichtig">
        <div class="kasten-titel">${esc(r.rechteHinweisTitel)}</div>
        <p>${esc(r.rechteHinweis)}</p>
      </div>

      <h3 id="referenz-schnittstellen">5.3 ${esc(r.schnittstellenTitel)}</h3>
      <p>${esc(r.schnittstellenEinleitung)}</p>
      ${tabelle([r.spaltePfad, r.spalteAufgabe, r.spalteZugriff], schnittZeilen)}
    </section>`;
}

function kapitelTechnik(t: HandbuchTexte): string {
  const tech = t.technik;

  const stackZeilen = tech.stack.map((s) => [
    `<strong>${esc(s.schicht)}</strong>`,
    `<code>${esc(s.technik)}</code>`,
    esc(s.aufgabe),
  ]);

  const meilensteinZeilen = tech.meilensteine.map((m) => [
    `<strong>${esc(m.name)}</strong> <span class="pille ${m.art === "erledigt" ? "pille-gut" : "pille-jetzt"}">${esc(m.stand)}</span>`,
    esc(m.termin),
    esc(m.inhalt),
  ]);

  return `    <section id="technik">
      <h2><span class="nr">06</span> ${esc(t.kapitel.technik)}</h2>

      <h3 id="technik-stack">6.1 ${esc(tech.stackTitel)}</h3>
      ${tabelle([tech.spalteSchicht, tech.spalteTechnik, tech.spalteAufgabe], stackZeilen)}

      <h3 id="technik-meilensteine">6.2 ${esc(tech.meilensteineTitel)}</h3>
      <p>${esc(tech.meilensteineEinleitung)}</p>
      ${tabelle([tech.spalteMeilenstein, tech.spalteTermin, tech.spalteInhalt], meilensteinZeilen)}
      <div class="kasten kasten-warnung">
        <div class="kasten-titel">${esc(tech.abgrenzungTitel)}</div>
        <p>${esc(tech.abgrenzung)}</p>
      </div>
    </section>`;
}

function kapitelRecht(t: HandbuchTexte): string {
  const r = t.recht;
  const zeilen = r.grundlagen.map((g) => [`<strong>${esc(g.begriff)}</strong>`, esc(g.text)]);

  return `    <section id="recht">
      <h2><span class="nr">07</span> ${esc(t.kapitel.recht)}</h2>
      <p>${esc(r.einleitung)}</p>
      ${tabelle([r.spalteGrundlage, r.spalteWirkung], zeilen)}
      <div class="kasten kasten-info">
        <div class="kasten-titel">${esc(r.prototypTitel)}</div>
        <p>${esc(r.prototyp)}</p>
      </div>
    </section>`;
}

function kapitelGlossar(t: HandbuchTexte): string {
  const g = t.glossar;
  const zeilen = g.eintraege.map((e) => [`<strong>${esc(e.begriff)}</strong>`, esc(e.text)]);

  return `    <section id="glossar">
      <h2><span class="nr">08</span> ${esc(t.kapitel.glossar)}</h2>
      <p>${esc(g.einleitung)}</p>
      ${tabelle([g.spalteBegriff, g.spalteErklaerung], zeilen)}
    </section>`;
}

// ── Inhaltsverzeichnis ────────────────────────────────────────────────────

function inhaltsverzeichnis(sprache: Sprache, t: HandbuchTexte): string {
  const zeilen: string[] = [];
  const l1 = (id: string, text: string) =>
    zeilen.push(`    <a class="toc-link toc-1" href="#${id}">${esc(text)}</a>`);
  const l2 = (id: string, text: string) =>
    zeilen.push(`    <a class="toc-link toc-2" href="#${id}">${esc(text)}</a>`);
  const l3 = (id: string, text: string) =>
    zeilen.push(`    <a class="toc-link toc-3" href="#${id}">${esc(text)}</a>`);

  l1("ueberblick", `01 ${t.kapitel.uebersicht}`);
  l2("ueberblick-zonen", `1.1 ${t.uebersicht.zonenTitel}`);
  l2("ueberblick-rollen", `1.2 ${t.uebersicht.rollenTitel}`);

  l1("bedienung", `02 ${t.kapitel.bedienung}`);
  l2("bedienung-anmelden", `2.1 ${t.bedienung.anmeldungTitel}`);
  l2("bedienung-aufbau", `2.2 ${t.bedienung.aufbauTitel}`);
  l2("bedienung-sprache", `2.3 ${t.bedienung.spracheTitel}`);
  l2("bedienung-thema", `2.4 ${t.bedienung.themaTitel}`);
  l2("bedienung-rolle", `2.5 ${t.bedienung.rolleTitel}`);
  l2("bedienung-offline", `2.6 ${t.bedienung.offlineTitel}`);

  l1("bereiche", `03 ${t.kapitel.bereiche}`);
  zones.forEach((zone, zoneIndex) => {
    l2(`bereich-${zone.key}`, `3.${zoneIndex + 1} ${ausKatalog(sprache, `zones.${zone.key}.name`)}`);
    modules
      .filter((m) => m.zone === zone.key)
      .forEach((modul, modulIndex) => {
        l3(
          `modul-${modul.key}`,
          `3.${zoneIndex + 1}.${modulIndex + 1} ${ausKatalog(sprache, `modules.${modul.key}.navTitle`)}`,
        );
      });
  });

  l1("anleitungen", `04 ${t.kapitel.anleitungen}`);
  t.anleitungen.liste.forEach((a, index) => {
    l2(`anleitung-${a.id}`, `4.${index + 1} ${a.titel}`);
  });

  l1("referenz", `05 ${t.kapitel.referenz}`);
  l2("referenz-seiten", `5.1 ${t.referenz.routenTitel}`);
  l2("referenz-rechte", `5.2 ${t.referenz.rechteTitel}`);
  l2("referenz-schnittstellen", `5.3 ${t.referenz.schnittstellenTitel}`);

  l1("technik", `06 ${t.kapitel.technik}`);
  l2("technik-stack", `6.1 ${t.technik.stackTitel}`);
  l2("technik-meilensteine", `6.2 ${t.technik.meilensteineTitel}`);

  l1("recht", `07 ${t.kapitel.recht}`);
  l1("glossar", `08 ${t.kapitel.glossar}`);

  return zeilen.join("\n");
}

// ── Seitengeruest ─────────────────────────────────────────────────────────

function sprachumschalter(aktuell: Sprache): string {
  return sprachen
    .map((code) => {
      const aktiv = code === aktuell ? " sprache-aktiv" : "";
      return `<button type="button" class="sprache${aktiv}" data-sprache="${code}" title="${esc(texte[code].sprachname)}">${code.toUpperCase()}</button>`;
    })
    .join("");
}

function seite(sprache: Sprache): string {
  const t = texte[sprache];
  const d = t.deckblatt;

  return `<!DOCTYPE html>
<html lang="${t.htmlLang}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<!--
  ERZEUGT - nicht von Hand bearbeiten.
  Quelle:  scripts/handbuch/texte-${sprache}.ts + src/lib/modules.ts + src/lib/rbac.ts
  Neu bauen: npm run handbuch
-->
<title>${esc(d.titel)} – ${esc(t.kopf.untertitel)} | WAMOCON</title>
<link rel="icon" href="${favicon()}" />
<script>
  // Farbschema vor dem ersten Bild setzen, sonst blitzt das helle Schema auf.
  // Derselbe Schluessel wie im Portal (src/components/theme-toggle.tsx): das
  // Handbuch laeuft unter derselben Adresse und uebernimmt damit die Wahl,
  // die der Nutzer im Portal getroffen hat.
  (function () {
    try {
      var gewaehlt = localStorage.getItem('damicon-theme');
      var dunkelBevorzugt = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (gewaehlt === 'dark' || (!gewaehlt && dunkelBevorzugt)) {
        document.documentElement.classList.add('dark');
      }
    } catch (e) {}
  })();
</script>
<style>
${stilblatt()}
</style>
</head>
<body>

<header class="kopf kein-druck">
  <a class="marke" href="#ueberblick">
    ${logo("marke-zeichen", d.titel)}
    <span class="marke-text">
      <span class="marke-name">${esc(d.titel)}</span>
      <span class="marke-unter">${esc(t.kopf.untertitel)}</span>
    </span>
  </a>

  <div class="kopf-werkzeuge">
    <div class="suche">
      <span class="suche-zeichen" aria-hidden="true">⌕</span>
      <input type="search" id="suchfeld" class="suche-feld"
        placeholder="${esc(t.kopf.suchePlatzhalter)}"
        aria-label="${esc(t.kopf.sucheBeschriftung)}"
        autocomplete="off" spellcheck="false" />
      <span class="suche-zaehler" id="such-zaehler" role="status" aria-live="polite"></span>
      <button type="button" class="suche-loeschen" id="such-loeschen"
        title="${esc(t.kopf.sucheZuruecksetzen)}"
        aria-label="${esc(t.kopf.sucheZuruecksetzen)}" hidden>×</button>
    </div>

    <div class="sprachen" role="group" aria-label="${esc(t.kopf.spracheBeschriftung)}">
      ${sprachumschalter(sprache)}
    </div>

    <button type="button" class="knopf knopf-rand" id="thema-knopf"
      title="${esc(t.kopf.themaKnopf)}" aria-label="${esc(t.kopf.themaKnopf)}">
      <span id="thema-zeichen" aria-hidden="true">◐</span>
    </button>

    <a class="knopf knopf-rand" id="portal-knopf" href="../"
      title="${esc(t.kopf.portalHinweis)}" hidden>← ${esc(t.kopf.portalKnopf)}</a>

    <button type="button" class="knopf knopf-voll" onclick="handbuchAlsPdf()"
      title="${esc(t.kopf.pdfHinweis)}">${esc(t.kopf.pdfKnopf)}</button>
  </div>
</header>

<div class="raster">
  <nav id="toc" class="kein-druck" aria-label="${esc(t.kopf.inhalt)}">
    <div class="toc-titel">${esc(t.kopf.inhalt)}</div>
${inhaltsverzeichnis(sprache, t)}
  </nav>

  <main>
    <div class="such-hinweis" id="such-hinweis" role="status" aria-live="polite"></div>

    <div class="deckblatt">
      ${logo("deckblatt-zeichen", d.titel)}
      <div class="deckblatt-art">${esc(d.dokumentart)}</div>
      <h1>${esc(d.titel)}</h1>
      <p class="deckblatt-unter">${esc(d.untertitel)}</p>
      <div class="deckblatt-daten">
        <div><span class="dt-name">${esc(d.version)}</span><span class="dt-wert">${esc(d.versionWert)}</span></div>
        <div><span class="dt-name">${esc(d.status)}</span><span class="dt-wert"><span class="pille pille-jetzt">${esc(d.statusWert)}</span></span></div>
        <div><span class="dt-name">${esc(d.sprachenLabel)}</span><span class="dt-wert">${esc(d.sprachenWert)}</span></div>
        <div><span class="dt-name">${esc(d.datum)}</span><span class="dt-wert">${esc(d.datumWert)}</span></div>
      </div>
    </div>

${kapitelUeberblick(sprache, t)}

${kapitelBedienung(t)}

${kapitelBereiche(sprache, t)}

${kapitelAnleitungen(t)}

${kapitelReferenz(sprache, t)}

${kapitelTechnik(t)}

${kapitelRecht(t)}

${kapitelGlossar(t)}
  </main>
</div>

<footer class="fuss">
  <div>${esc(t.fuss.rechte)}</div>
  <div>${esc(t.fuss.vermerk)}</div>
</footer>

<script>
${skript(t)}
</script>
</body>
</html>
`;
}

// ── Stilblatt: die Farben und Masse des Portals ───────────────────────────

function stilblatt(): string {
  return `/* Farben, Radien und Schriften sind die des Portals (src/app/globals.css).
   Sie stehen hier als eigene Werte, weil das Handbuch eine eigenstaendige
   Datei ist und ohne die Anwendung geoeffnet werden koennen muss - aendert
   sich die Palette dort, gehoert sie hier nachgezogen. */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  color-scheme: light;
  --hintergrund: #f6fafb;
  --vordergrund: #0b1e26;
  --karte: #ffffff;
  --primaer: #00768f;
  --primaer-auf: #ffffff;
  --zweit: #e3f2f6;
  --gedaempft: #eaf2f4;
  --gedaempft-text: #5a7078;
  --akzent: #8c6209;
  --gut: #297956;
  --warnung: #945d0c;
  --gefahr: #c23b4e;
  --rand: #dbe8ec;
  --ring: #0095ac;
  --leiste: #ffffff;
  --leiste-rand: #dceaee;
  --leiste-akzent: #eaf4f7;
  --radius: 0.625rem;
  --schrift: "Inter", "Segoe UI", system-ui, -apple-system, sans-serif;
  --schrift-titel: "Manrope", "Inter", "Segoe UI", system-ui, sans-serif;
  --markierung: rgba(0, 149, 172, 0.28);
}

.dark {
  color-scheme: dark;
  --hintergrund: #04161c;
  --vordergrund: #e6f4f8;
  --karte: #081e26;
  --primaer: #3fd0e6;
  --primaer-auf: #01222b;
  --zweit: #0d2f3a;
  --gedaempft: #0c2933;
  --gedaempft-text: #9ab8c1;
  --akzent: #f2c14b;
  --gut: #5ecfa0;
  --warnung: #e8b34a;
  --gefahr: #fb7185;
  --rand: rgba(255, 255, 255, 0.09);
  --ring: #5fdcef;
  --leiste: #051b22;
  --leiste-rand: rgba(255, 255, 255, 0.09);
  --leiste-akzent: #0c2b35;
  --markierung: rgba(63, 208, 230, 0.26);
}

html { scroll-behavior: smooth; }

/* Das hidden-Attribut wirkt ueber display: none aus dem Browser-Stylesheet -
   und verliert damit gegen jede eigene display-Regel. Der Weg zurueck ins
   Portal traegt .knopf mit display: inline-flex und stand deshalb sichtbar da,
   obwohl er ausserhalb des Portals ins Leere zeigt. */
[hidden] { display: none !important; }

body {
  font-family: var(--schrift);
  background: var(--hintergrund);
  color: var(--vordergrund);
  line-height: 1.7;
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
}

a { color: var(--primaer); text-decoration: none; }
a:hover { text-decoration: underline; }

:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; border-radius: 4px; }

/* ── Kopfzeile ─────────────────────────────────────────────────────────── */
/* 64 px hoch wie die Kopfzeile des Portals (md:h-16). */
.kopf {
  position: sticky; top: 0; z-index: 50;
  height: 64px;
  display: flex; align-items: center; justify-content: space-between;
  gap: 1rem; padding: 0 1.25rem;
  background: var(--leiste);
  border-bottom: 1px solid var(--leiste-rand);
}

.marke { display: flex; align-items: center; gap: 0.7rem; color: inherit; }
.marke:hover { text-decoration: none; }

.marke-zeichen { width: 36px; height: 36px; flex-shrink: 0; display: block; }

.marke-text { display: flex; flex-direction: column; line-height: 1.25; }
.marke-name { font-family: var(--schrift-titel); font-weight: 800; font-size: 1.05rem; }
.marke-unter { font-size: 0.7rem; font-weight: 600; color: var(--gedaempft-text); }

.kopf-werkzeuge { display: flex; align-items: center; gap: 0.6rem; }

.knopf {
  display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem;
  height: 36px; padding: 0 0.85rem;
  border-radius: calc(var(--radius) * 0.8);
  font-family: inherit; font-size: 0.82rem; font-weight: 700;
  cursor: pointer; border: 1px solid transparent; white-space: nowrap;
  transition: background-color 0.15s, color 0.15s, border-color 0.15s;
}
.knopf-voll { background: var(--primaer); color: var(--primaer-auf); }
.knopf-voll:hover { filter: brightness(1.08); text-decoration: none; }
.knopf-rand { background: transparent; color: var(--gedaempft-text); border-color: var(--rand); }
.knopf-rand:hover { color: var(--vordergrund); border-color: var(--primaer); text-decoration: none; }

/* ── Suche ─────────────────────────────────────────────────────────────── */
.suche {
  display: flex; align-items: center; gap: 0.5rem;
  height: 36px; padding: 0 0.7rem;
  background: var(--gedaempft);
  border: 1px solid var(--rand);
  border-radius: calc(var(--radius) * 0.8);
}
.suche:focus-within { border-color: var(--primaer); }
.suche-zeichen { color: var(--gedaempft-text); font-size: 1rem; line-height: 1; }

.suche-feld {
  background: none; border: none; outline: none;
  color: var(--vordergrund); font-family: inherit; font-size: 0.85rem;
  width: 200px; padding: 0;
}
.suche-feld::placeholder { color: var(--gedaempft-text); }
.suche-feld::-webkit-search-cancel-button { display: none; }

/* Haelt seine Breite auch leer, sonst wackelt die Kopfzeile bei jedem
   Tastendruck. */
.suche-zaehler {
  font-size: 0.72rem; color: var(--gedaempft-text);
  font-variant-numeric: tabular-nums; min-width: 4.5rem; text-align: right;
}
.suche-zaehler.leer { color: var(--warnung); font-weight: 700; }

.suche-loeschen {
  background: none; border: none; cursor: pointer; padding: 0 0 0 0.2rem;
  color: var(--gedaempft-text); font-size: 1.15rem; line-height: 1;
}
.suche-loeschen:hover { color: var(--vordergrund); }

/* ── Sprachumschalter ──────────────────────────────────────────────────── */
.sprachen {
  display: flex; align-items: center; gap: 2px;
  padding: 3px; background: var(--gedaempft);
  border: 1px solid var(--rand); border-radius: calc(var(--radius) * 0.8);
}
.sprache {
  border: none; background: none; cursor: pointer;
  font-family: inherit; font-size: 0.72rem; font-weight: 800;
  color: var(--gedaempft-text);
  padding: 0.25rem 0.45rem; border-radius: calc(var(--radius) * 0.5);
  transition: background-color 0.15s, color 0.15s;
}
.sprache:hover { color: var(--vordergrund); }
.sprache-aktiv { background: var(--primaer); color: var(--primaer-auf); }
.sprache-aktiv:hover { color: var(--primaer-auf); }

/* ── Raster ────────────────────────────────────────────────────────────── */
.raster {
  display: grid; grid-template-columns: 300px minmax(0, 1fr);
  max-width: 1500px; margin: 0 auto;
  min-height: calc(100vh - 64px);
}

#toc {
  position: sticky; top: 64px; align-self: start;
  height: calc(100vh - 64px); overflow-y: auto;
  padding: 1.75rem 1.25rem 3rem;
  border-right: 1px solid var(--rand);
}

.toc-titel {
  font-size: 0.68rem; font-weight: 800; text-transform: uppercase;
  letter-spacing: 0.14em; color: var(--gedaempft-text); margin-bottom: 0.9rem;
}

.toc-link {
  display: block; color: var(--gedaempft-text); font-size: 0.82rem;
  padding: 0.3rem 0.5rem; border-radius: calc(var(--radius) * 0.6);
  border-left: 2px solid transparent;
}
.toc-link:hover { background: var(--leiste-akzent); color: var(--vordergrund); text-decoration: none; }
.toc-link.aktiv { color: var(--primaer); border-left-color: var(--primaer); font-weight: 700; }

.toc-1 {
  font-weight: 700; color: var(--vordergrund); font-size: 0.85rem;
  margin-top: 0.9rem; padding-top: 0.6rem; border-top: 1px solid var(--rand);
}
.toc-1:first-of-type { margin-top: 0; border-top: none; }
.toc-2 { padding-left: 1rem; }
.toc-3 { padding-left: 1.9rem; font-size: 0.78rem; }

main { padding: 2.5rem 3rem 6rem; max-width: 62rem; min-width: 0; }

/* ── Deckblatt ─────────────────────────────────────────────────────────── */
.deckblatt {
  background: var(--karte);
  border: 1px solid var(--rand);
  border-radius: calc(var(--radius) * 2);
  padding: 3rem; margin-bottom: 3.5rem;
}
.deckblatt-zeichen { width: 64px; height: 64px; display: block; margin-bottom: 1.5rem; }
.deckblatt-art {
  font-size: 0.68rem; font-weight: 800; text-transform: uppercase;
  letter-spacing: 0.16em; color: var(--primaer); margin-bottom: 0.9rem;
}
.deckblatt h1 {
  font-family: var(--schrift-titel); font-size: 3rem; font-weight: 800;
  line-height: 1.1; letter-spacing: -0.02em; margin-bottom: 0.6rem;
}
.deckblatt-unter { color: var(--gedaempft-text); font-size: 1.05rem; max-width: 46rem; }
.deckblatt-daten {
  display: flex; flex-wrap: wrap; gap: 2.5rem;
  margin-top: 2.25rem; padding-top: 1.75rem; border-top: 1px solid var(--rand);
}
.dt-name {
  display: block; font-size: 0.66rem; font-weight: 800; text-transform: uppercase;
  letter-spacing: 0.1em; color: var(--gedaempft-text); margin-bottom: 0.3rem;
}
.dt-wert { font-weight: 700; font-size: 0.95rem; }

/* ── Ueberschriften ────────────────────────────────────────────────────── */
section { margin-bottom: 3.5rem; }

h2 {
  font-family: var(--schrift-titel); font-size: 1.85rem; font-weight: 800;
  letter-spacing: -0.015em; margin-bottom: 1.25rem;
  padding-bottom: 0.7rem; border-bottom: 2px solid var(--primaer);
  display: flex; align-items: baseline; gap: 0.7rem;
}
h2 .nr { color: var(--primaer); font-size: 1.1rem; font-weight: 800; }

h3 {
  font-family: var(--schrift-titel); font-size: 1.3rem; font-weight: 700;
  margin: 2.25rem 0 0.9rem;
}

h4 {
  font-family: var(--schrift-titel); font-size: 1.02rem; font-weight: 700;
  margin: 1.85rem 0 0.5rem;
  display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;
}

p { margin-bottom: 0.9rem; }
p:last-child { margin-bottom: 0; }
.abstand-oben { margin-top: 0.8rem; }

ol, ul { margin: 0 0 1rem 1.3rem; }
li { margin-bottom: 0.45rem; }

code {
  font-family: ui-monospace, "Cascadia Code", "Consolas", monospace;
  font-size: 0.86em; background: var(--gedaempft);
  padding: 0.1rem 0.35rem; border-radius: 4px;
  border: 1px solid var(--rand); white-space: nowrap;
}

/* ── Kaesten ───────────────────────────────────────────────────────────── */
.kasten {
  border: 1px solid var(--rand); border-left-width: 3px;
  border-radius: var(--radius); padding: 1.1rem 1.35rem;
  margin: 1.25rem 0; background: var(--karte);
}
.kasten-titel { font-weight: 800; margin-bottom: 0.5rem; font-size: 0.95rem; }
.kasten-info { border-left-color: var(--primaer); }
.kasten-info .kasten-titel { color: var(--primaer); }
.kasten-wichtig { border-left-color: var(--gut); }
.kasten-wichtig .kasten-titel { color: var(--gut); }
.kasten-warnung { border-left-color: var(--warnung); }
.kasten-warnung .kasten-titel { color: var(--warnung); }

/* ── Karten ────────────────────────────────────────────────────────────── */
.karten-raster {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  gap: 1rem; margin: 1.25rem 0;
}
.karte-klein {
  background: var(--karte); border: 1px solid var(--rand);
  border-radius: var(--radius); padding: 1.1rem 1.25rem;
}
.karte-klein-titel { font-family: var(--schrift-titel); font-weight: 700; margin-bottom: 0.2rem; }
.karte-klein-zeile {
  font-size: 0.72rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.07em; color: var(--primaer); margin-bottom: 0.6rem;
}
.karte-klein p { font-size: 0.89rem; color: var(--gedaempft-text); }

/* ── Merkmale eines Moduls ─────────────────────────────────────────────── */
.merkmale {
  border: 1px solid var(--rand); border-radius: var(--radius);
  background: var(--karte); margin: 0.9rem 0 1.5rem; overflow: hidden;
}
.merkmal {
  display: grid; grid-template-columns: 11rem minmax(0, 1fr);
  gap: 1rem; padding: 0.6rem 1.1rem;
  border-top: 1px solid var(--rand); font-size: 0.89rem;
}
.merkmal:first-child { border-top: none; }
.merkmal-name { font-weight: 700; color: var(--gedaempft-text); }

/* ── Tabellen ──────────────────────────────────────────────────────────── */
.tabelle {
  margin: 1.25rem 0; overflow-x: auto;
  border: 1px solid var(--rand); border-radius: var(--radius);
  background: var(--karte);
}
table { width: 100%; border-collapse: collapse; font-size: 0.89rem; }
th {
  text-align: left; font-weight: 800; font-size: 0.72rem;
  text-transform: uppercase; letter-spacing: 0.07em;
  color: var(--gedaempft-text); background: var(--gedaempft);
  padding: 0.7rem 1rem; border-bottom: 1px solid var(--rand);
  white-space: nowrap;
}
td { padding: 0.7rem 1rem; border-bottom: 1px solid var(--rand); vertical-align: top; }
tbody tr:last-child td { border-bottom: none; }

/* Die Rechtematrix ist breit: neun Spalten. Die erste bleibt stehen. */
.tabelle-matrix table { font-size: 0.82rem; }
.tabelle-matrix th:not(:first-child), .tabelle-matrix td:not(:first-child) {
  text-align: center; white-space: normal;
}
.tabelle-matrix th:first-child, .tabelle-matrix td:first-child {
  position: sticky; left: 0; background: var(--karte); z-index: 1;
}
.tabelle-matrix th:first-child { background: var(--gedaempft); }

.recht { font-size: 1rem; line-height: 1; }
.recht-schreiben { color: var(--primaer); }
.recht-lesen { color: var(--gedaempft-text); }
.recht-keins { color: var(--rand); }
.legende { font-size: 0.82rem; color: var(--gedaempft-text); }

/* ── Pillen ────────────────────────────────────────────────────────────── */
.pille {
  display: inline-block; padding: 0.15rem 0.6rem;
  border-radius: 999px; font-size: 0.68rem; font-weight: 800;
  text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap;
}
.pille-gut { background: color-mix(in srgb, var(--gut) 14%, transparent); color: var(--gut); }
.pille-offen { background: color-mix(in srgb, var(--warnung) 14%, transparent); color: var(--warnung); }
.pille-jetzt { background: color-mix(in srgb, var(--primaer) 14%, transparent); color: var(--primaer); }

/* ── Suche: Treffer und Filter ─────────────────────────────────────────── */
mark.treffer { background: var(--markierung); color: inherit; border-radius: 3px; padding: 0 2px; }
mark.treffer-aktiv {
  background: var(--akzent); color: var(--hintergrund);
  font-weight: 700; box-shadow: 0 0 0 3px color-mix(in srgb, var(--akzent) 30%, transparent);
}

.ausgeblendet { display: none; }

.such-hinweis {
  display: none; margin-bottom: 1.5rem;
  background: var(--karte); border: 1px solid var(--rand);
  border-left: 3px solid var(--warnung); border-radius: var(--radius);
  padding: 1.1rem 1.35rem; color: var(--gedaempft-text); font-size: 0.92rem;
}
.such-hinweis.sichtbar { display: block; }
.such-hinweis strong { color: var(--vordergrund); }

/* ── Fuss ──────────────────────────────────────────────────────────────── */
.fuss {
  border-top: 1px solid var(--rand); padding: 1.75rem 3rem;
  display: flex; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem;
  font-size: 0.8rem; color: var(--gedaempft-text);
}

/* ── Schmale Schirme ───────────────────────────────────────────────────── */
@media (max-width: 1180px) {
  .raster { grid-template-columns: 1fr; }
  #toc { display: none; }
  main { padding: 2rem 1.5rem 4rem; }
  .fuss { padding: 1.5rem; }
  .suche-feld { width: 130px; }
  .marke-unter { display: none; }
}

@media (max-width: 820px) {
  .kopf { height: auto; padding: 0.7rem 1rem; flex-wrap: wrap; position: static; }
  .kopf-werkzeuge { width: 100%; flex-wrap: wrap; }
  .suche { flex: 1 1 100%; }
  .suche-feld { width: 100%; flex: 1; }
  .deckblatt { padding: 1.75rem; }
  .deckblatt h1 { font-size: 2.1rem; }
  .deckblatt-daten { gap: 1.25rem; }
  .merkmal { grid-template-columns: 1fr; gap: 0.15rem; }
  h2 { font-size: 1.5rem; }
}

/* ── Druck ─────────────────────────────────────────────────────────────── */
@media print {
  .kein-druck, .kopf, #toc, .fuss { display: none !important; }
  .raster { display: block; max-width: none; }
  main { padding: 0; max-width: none; }

  /* Der PDF-Export ist immer das vollstaendige Handbuch, nie der gerade
     gefilterte Ausschnitt. Das Skript setzt die Suche vor dem Druck zurueck;
     diese Regeln sind das zweite Netz, falls JavaScript abgeschaltet ist oder
     der Druck ueber Strg+P am Skript vorbeilaeuft. Ohne sie druckte eine
     Suche nach "Kuehlkette" ein Handbuch aus drei Absaetzen - und niemand
     saehe dem PDF an, dass etwas fehlt. */
  .ausgeblendet { display: revert !important; }
  .such-hinweis { display: none !important; }
  mark.treffer, mark.treffer-aktiv {
    background: none !important; color: inherit !important;
    box-shadow: none !important; font-weight: inherit !important; padding: 0 !important;
  }

  body { background: #fff; color: #000; font-size: 10.5pt; }
  :root {
    --hintergrund: #fff; --vordergrund: #000; --karte: #fff;
    --gedaempft: #f4f4f4; --gedaempft-text: #444; --rand: #bbb;
    --primaer: #005f74; --gut: #1f5e43; --warnung: #7a4c09;
  }

  section { break-before: page; }
  section:first-of-type { break-before: auto; }
  .deckblatt { break-after: page; border: none; padding: 0; }
  h2, h3, h4 { break-after: avoid; }
  table, .kasten, .karte-klein, .merkmale { break-inside: avoid; }
  thead { display: table-header-group; }
  .tabelle, .tabelle-matrix { overflow: visible; }
  .tabelle-matrix th:first-child, .tabelle-matrix td:first-child { position: static; }
  a { color: #000; text-decoration: none; }
  @page { margin: 16mm 14mm; }
}`;
}

// ── Skript der Seite ──────────────────────────────────────────────────────

function skript(t: HandbuchTexte): string {
  // Die Beschriftungen wandern als JSON-Literal in die Seite, damit das
  // Skript in jeder Sprache dieselbe Form hat.
  const beschriftungen = JSON.stringify({
    keine: t.kopf.trefferKeine,
    abZwei: t.kopf.trefferAbZwei,
    treffer: t.kopf.treffer,
    ohneFundstelle: t.kopf.ohneFundstelle,
  });

  return `(function () {
  var TEXT = ${beschriftungen};
  var SPRACHEN = ['de', 'en', 'kk', 'ru'];

  var haupt = document.querySelector('main');
  var deckblatt = document.querySelector('.deckblatt');
  var suchfeld = document.getElementById('suchfeld');
  var zaehlerEl = document.getElementById('such-zaehler');
  var hinweisEl = document.getElementById('such-hinweis');
  var loeschenEl = document.getElementById('such-loeschen');
  var abschnitte = Array.prototype.slice.call(haupt.querySelectorAll('section[id]'));
  var tocLinks = Array.prototype.slice.call(document.querySelectorAll('.toc-link'));

  var treffer = [];
  var aktiver = -1;

  // ── Wo laeuft das Handbuch? ─────────────────────────────────────────
  // Im Portal unter /<sprache>/dashboard/handbuch, sonst als Datei neben
  // ihren Geschwistern. Der Sprachumschalter und der Weg zurueck ins Portal
  // muessen in beiden Faellen stimmen.
  var imPortal = /\\/(de|en|kk|ru)\\/dashboard\\/handbuch\\/?$/.test(location.pathname);

  function zielFuerSprache(code) {
    if (imPortal) return location.pathname.replace(/\\/(de|en|kk|ru)\\//, '/' + code + '/');
    return code === 'de' ? 'index.html' : 'index-' + code + '.html';
  }

  Array.prototype.forEach.call(document.querySelectorAll('.sprache'), function (knopf) {
    knopf.addEventListener('click', function () {
      var code = knopf.getAttribute('data-sprache');
      if (SPRACHEN.indexOf(code) !== -1) location.href = zielFuerSprache(code);
    });
  });

  // Der Weg zurueck ins Portal ergibt nur im Portal einen Sinn - als lose
  // Datei geoeffnet zeigt der Knopf ins Leere und bleibt deshalb verborgen.
  var portalKnopf = document.getElementById('portal-knopf');
  if (imPortal) {
    portalKnopf.setAttribute('href', location.pathname.replace(/\\/handbuch\\/?$/, ''));
    portalKnopf.hidden = false;
  }

  // ── Farbschema, geteilt mit dem Portal ──────────────────────────────
  var themaKnopf = document.getElementById('thema-knopf');
  var themaZeichen = document.getElementById('thema-zeichen');

  function themaZeigen() {
    themaZeichen.textContent = document.documentElement.classList.contains('dark') ? '☀' : '☾';
  }
  themaZeigen();

  themaKnopf.addEventListener('click', function () {
    var dunkelJetzt = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', dunkelJetzt);
    try { localStorage.setItem('damicon-theme', dunkelJetzt ? 'dark' : 'light'); } catch (e) {}
    themaZeigen();
  });

  // ── Normalisierung fuer die Suche ───────────────────────────────────
  // Umlaute zaehlen wie ihr Grundbuchstabe, damit "Kuhlkette" die
  // "Kuehlkette" findet. Entscheidend ist, dass die Abbildung die LAENGE
  // erhaelt: die Fundstelle wird ueber ihren Index im normalisierten Text in
  // den Originaltext zurueckgerechnet. Deshalb wird zeichenweise abgebildet
  // und ein toLowerCase(), das aus einem Zeichen zwei macht, verworfen.
  var ERSATZ = {
    '\\u00e4': 'a', '\\u00c4': 'a', '\\u00f6': 'o', '\\u00d6': 'o',
    '\\u00fc': 'u', '\\u00dc': 'u', '\\u00df': 's',
    '\\u0131': 'i', '\\u0130': 'i', '\\u00e7': 'c', '\\u00c7': 'c',
    '\\u0451': '\\u0435', '\\u0401': '\\u0435'
  };

  function normal(text) {
    var aus = '';
    for (var i = 0; i < text.length; i++) {
      var zeichen = text[i];
      var ersatz = ERSATZ[zeichen];
      if (ersatz !== undefined) { aus += ersatz; continue; }
      var klein = zeichen.toLowerCase();
      aus += klein.length === 1 ? klein : zeichen;
    }
    return aus;
  }

  // ── Markierungen ────────────────────────────────────────────────────
  function markierungenSetzen(begriff) {
    var gesucht = normal(begriff);
    var laeufer = document.createTreeWalker(haupt, NodeFilter.SHOW_TEXT, {
      acceptNode: function (knoten) {
        if (!knoten.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        var eltern = knoten.parentElement;
        if (!eltern || eltern.closest('.such-hinweis')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    // Erst einsammeln, dann ersetzen - der Laeufer darf nicht ueber einen
    // Baum laufen, den er gerade selbst umbaut.
    var knoten = [];
    while (laeufer.nextNode()) knoten.push(laeufer.currentNode);

    for (var i = 0; i < knoten.length; i++) {
      var textknoten = knoten[i];
      var text = textknoten.nodeValue;
      var flach = normal(text);
      var pos = flach.indexOf(gesucht);
      if (pos === -1) continue;

      var teile = document.createDocumentFragment();
      var gelesen = 0;
      while (pos !== -1) {
        if (pos > gelesen) teile.appendChild(document.createTextNode(text.slice(gelesen, pos)));
        var marke = document.createElement('mark');
        marke.className = 'treffer';
        marke.textContent = text.slice(pos, pos + gesucht.length);
        teile.appendChild(marke);
        gelesen = pos + gesucht.length;
        pos = flach.indexOf(gesucht, gelesen);
      }
      if (gelesen < text.length) teile.appendChild(document.createTextNode(text.slice(gelesen)));
      textknoten.parentNode.replaceChild(teile, textknoten);
    }
  }

  function markierungenEntfernen() {
    var marken = Array.prototype.slice.call(haupt.querySelectorAll('mark.treffer'));
    for (var i = 0; i < marken.length; i++) {
      var eltern = marken[i].parentNode;
      eltern.replaceChild(document.createTextNode(marken[i].textContent), marken[i]);
      eltern.normalize();
    }
  }

  // ── Filtern ─────────────────────────────────────────────────────────
  // Ein Unterabschnitt reicht von seiner Ueberschrift bis zur naechsten
  // gleicher oder hoeherer Ebene.
  function bereichHatTreffer(ueberschrift) {
    if (ueberschrift.querySelector('mark.treffer')) return true;
    var grenze = ueberschrift.tagName === 'H3' ? ['H3'] : ['H3', 'H4'];
    var element = ueberschrift.nextElementSibling;
    while (element && grenze.indexOf(element.tagName) === -1) {
      if (element.querySelector && element.querySelector('mark.treffer')) return true;
      element = element.nextElementSibling;
    }
    return false;
  }

  function filtern(aktiv) {
    for (var i = 0; i < abschnitte.length; i++) {
      abschnitte[i].classList.toggle('ausgeblendet', aktiv && !abschnitte[i].querySelector('mark.treffer'));
    }
    // Das Deckblatt traegt keinen durchsuchbaren Inhalt und stuende bei einer
    // Suche nur als ganzseitiger Block vor dem ersten Ergebnis.
    if (deckblatt) deckblatt.classList.toggle('ausgeblendet', aktiv);

    for (var j = 0; j < tocLinks.length; j++) {
      var link = tocLinks[j];
      if (!aktiv) { link.classList.remove('ausgeblendet'); continue; }
      var ziel = document.getElementById(link.getAttribute('href').slice(1));
      var hat = false;
      if (ziel) {
        hat = ziel.tagName === 'SECTION'
          ? !!ziel.querySelector('mark.treffer')
          : bereichHatTreffer(ziel);
      }
      link.classList.toggle('ausgeblendet', !hat);
    }
  }

  // ── Von Treffer zu Treffer ──────────────────────────────────────────
  function zaehlerSchreiben(begriff) {
    if (!begriff) { zaehlerEl.textContent = ''; zaehlerEl.classList.remove('leer'); return; }
    if (!treffer.length) {
      zaehlerEl.textContent = TEXT.keine;
      zaehlerEl.classList.add('leer');
      return;
    }
    zaehlerEl.classList.remove('leer');
    zaehlerEl.textContent = aktiver >= 0
      ? (aktiver + 1) + ' / ' + treffer.length
      : treffer.length + ' ' + TEXT.treffer;
  }

  function zuTreffer(index) {
    if (!treffer.length) return;
    if (aktiver >= 0 && treffer[aktiver]) treffer[aktiver].classList.remove('treffer-aktiv');
    aktiver = (index + treffer.length) % treffer.length;
    treffer[aktiver].classList.add('treffer-aktiv');
    treffer[aktiver].scrollIntoView({ behavior: 'smooth', block: 'center' });
    zaehlerSchreiben(suchfeld.value.trim());
  }

  // ── Suchen ──────────────────────────────────────────────────────────
  function suchen(roh) {
    var begriff = roh.trim();
    markierungenEntfernen();
    treffer = [];
    aktiver = -1;
    loeschenEl.hidden = begriff === '';

    // Ein einzelner Buchstabe traefe fast jedes Wort - das filtert nichts und
    // markiert nur das halbe Handbuch bunt.
    if (begriff.length < 2) {
      filtern(false);
      hinweisEl.classList.remove('sichtbar');
      zaehlerEl.classList.remove('leer');
      zaehlerEl.textContent = begriff ? TEXT.abZwei : '';
      return;
    }

    markierungenSetzen(begriff);
    treffer = Array.prototype.slice.call(haupt.querySelectorAll('mark.treffer'));
    filtern(true);
    zaehlerSchreiben(begriff);

    if (!treffer.length) {
      // Den Suchbegriff als Text einsetzen, nicht als HTML - er kommt aus der
      // Eingabe des Nutzers.
      var teile = TEXT.ohneFundstelle.split('{begriff}');
      hinweisEl.textContent = '';
      hinweisEl.appendChild(document.createTextNode(teile[0]));
      var stark = document.createElement('strong');
      stark.textContent = '\\u201e' + begriff + '\\u201c';
      hinweisEl.appendChild(stark);
      if (teile[1]) hinweisEl.appendChild(document.createTextNode(teile[1]));
      hinweisEl.classList.add('sichtbar');
    } else {
      hinweisEl.classList.remove('sichtbar');
    }
  }

  function zuruecksetzen() {
    suchfeld.value = '';
    suchen('');
  }

  // ── PDF ─────────────────────────────────────────────────────────────
  // "Nur ein vollstaendiger": vor dem Druck faellt der Suchfilter, sonst
  // landete der gerade gefilterte Ausschnitt im PDF und saehe darin aus wie
  // das ganze Handbuch. Der beforeprint-Haken deckt Strg+P und das Druckmenue
  // des Browsers mit ab; die Regeln in @media print sind das dritte Netz,
  // falls JavaScript gar nicht laeuft.
  function fuerDruckOeffnen() {
    if (suchfeld.value) zuruecksetzen();
  }
  window.addEventListener('beforeprint', fuerDruckOeffnen);
  window.handbuchAlsPdf = function () {
    fuerDruckOeffnen();
    window.print();
  };

  // ── Bedienung ───────────────────────────────────────────────────────
  var warteschlange;
  suchfeld.addEventListener('input', function () {
    clearTimeout(warteschlange);
    var wert = suchfeld.value;
    // Den Baum nicht bei jedem Anschlag umbauen.
    warteschlange = setTimeout(function () { suchen(wert); }, 140);
  });

  suchfeld.addEventListener('keydown', function (ereignis) {
    if (ereignis.key === 'Enter') {
      ereignis.preventDefault();
      // Die laufende Eingabe sofort auswerten, sonst springt die Eingabetaste
      // auf den Treffern des vorherigen Anschlags.
      clearTimeout(warteschlange);
      if (!treffer.length) suchen(suchfeld.value);
      zuTreffer(ereignis.shiftKey ? aktiver - 1 : aktiver + 1);
    }
    if (ereignis.key === 'Escape') { zuruecksetzen(); suchfeld.blur(); }
  });

  loeschenEl.addEventListener('click', function () {
    zuruecksetzen();
    suchfeld.focus();
  });

  document.addEventListener('keydown', function (ereignis) {
    var imFeld = document.activeElement === suchfeld;
    var kuerzel =
      (ereignis.key === '/' && !imFeld && !ereignis.ctrlKey && !ereignis.metaKey) ||
      ((ereignis.ctrlKey || ereignis.metaKey) && ereignis.key.toLowerCase() === 'k');
    if (kuerzel) {
      ereignis.preventDefault();
      suchfeld.focus();
      suchfeld.select();
      return;
    }
    if (ereignis.key === 'Escape' && !imFeld && suchfeld.value) zuruecksetzen();
  });

  // ── Inhaltsverzeichnis mitlaufen lassen ─────────────────────────────
  var beobachtbar = haupt.querySelectorAll('section[id], h3[id], h4[id]');
  var beobachter = new IntersectionObserver(function (eintraege) {
    for (var i = 0; i < eintraege.length; i++) {
      if (!eintraege[i].isIntersecting) continue;
      for (var j = 0; j < tocLinks.length; j++) tocLinks[j].classList.remove('aktiv');
      var aktivLink = document.querySelector('.toc-link[href="#' + eintraege[i].target.id + '"]');
      if (aktivLink) aktivLink.classList.add('aktiv');
    }
  }, { rootMargin: '-15% 0px -75% 0px' });
  Array.prototype.forEach.call(beobachtbar, function (element) { beobachter.observe(element); });
})();`;
}

// ── Schreiben ─────────────────────────────────────────────────────────────

const ziel = path.join(process.cwd(), "docs", "manual");

for (const sprache of sprachen) {
  const datei = sprache === "de" ? "index.html" : `index-${sprache}.html`;
  const pfad = path.join(ziel, datei);
  const inhalt = seite(sprache);
  writeFileSync(pfad, inhalt, "utf8");
  const kb = Math.round(Buffer.byteLength(inhalt, "utf8") / 1024);
  console.log(`  ${datei.padEnd(16)} ${String(kb).padStart(4)} KB`);
}

console.log(
  `\n${sprachen.length} Sprachen, ${modules.length} Module, ${roles.length} Rollen.`,
);
