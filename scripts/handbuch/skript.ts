import type { HandbuchTexte } from "./typen";

// Das Skript, das im Handbuch selbst laeuft: Volltextsuche, PDF-Export,
// Sprachumschalter, Farbschema und das mitlaufende Inhaltsverzeichnis.
//
// Getrennt von erzeugen.ts aus demselben Grund wie stil.ts: es ist JavaScript
// fuer den Browser, kein Teil des Generators. Bewusst in ES5-naher Form und
// ohne Abhaengigkeiten - das Handbuch soll auch als lose Datei ohne Netz
// funktionieren.

export function skript(t: HandbuchTexte): string {
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
