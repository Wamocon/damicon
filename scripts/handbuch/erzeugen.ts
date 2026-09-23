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
import { stilblatt } from "./stil";
import { skript } from "./skript";
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
