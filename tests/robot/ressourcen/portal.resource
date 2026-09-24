*** Settings ***
Documentation     Gemeinsame Schluesselwoerter fuer die Portal-Tests.
...               Anmeldung, Geraeteprofile und das Festhalten eines Befundes
...               als Bildschirmfoto.
Library           Browser    timeout=20s
Library           OperatingSystem
Library           Collections


*** Variables ***
${BASIS}          http://localhost:3000
${SPRACHE}        de
${KONTO}          admin@damicon.demo
${PASSWORT}       DamiconDemo2026!
${BILDER}         ${CURDIR}/../ergebnisse/bilder
${KOPFBALKEN}     header.sticky

# Die vier Geraeteprofile. Breite und Hoehe sind CSS-Pixel, nicht Geraetepixel.
# 390x844 ist iPhone 14/15 hoch, 844x390 dasselbe Geraet gedreht. Dieselbe
# Breite trifft auch Tablet hoch und ein halbes Laptopfenster. 360 px ist die
# Breite kleiner Android-Telefone und der engste Fall der Kopfzeile: Rueckweg,
# Bildmarke in der Mitte, rechts Suche und Glocke.
&{SCHREIBTISCH}    name=schreibtisch    breite=${1600}    hoehe=${1000}
&{MOBIL_QUER}      name=mobil-quer      breite=${844}     hoehe=${390}
&{MOBIL_HOCH}      name=mobil-hoch      breite=${390}     hoehe=${844}
&{MOBIL_SCHMAL}    name=mobil-schmal    breite=${360}     hoehe=${780}

# Das Suchfenster ist der Dialog mit dem Suchfeld darin. aria-modal allein
# reicht nicht: im Entwicklungsmodus ist auch das Fehler-Overlay von Next.js
# ein modaler Dialog, und es steht auf der Uebersicht, solange dort eine
# Meldung in der Konsole landet.
${SUCHFENSTER}    [role="dialog"][aria-modal="true"]:has([role="combobox"][aria-controls])
${SUCHFELD}       [role="combobox"][aria-controls]


*** Keywords ***
Portal Oeffnen
    [Documentation]    Startet den Browser im angegebenen Geraeteprofil und
    ...    meldet sich an. Die Anmeldung laeuft ueber die echte Maske, damit
    ...    der Test denselben Weg nimmt wie ein Mensch.
    [Arguments]    ${profil}
    New Browser    chromium    headless=${True}
    New Context
    ...    viewport={'width': ${profil}[breite], 'height': ${profil}[hoehe]}
    ...    locale=de-DE
    New Page    ${BASIS}/${SPRACHE}/login
    Fill Text    input[type=email]       ${KONTO}
    Fill Text    input[type=password]    ${PASSWORT}
    Click        button[type=submit]
    Wait For Condition    url    contains    /dashboard    timeout=25s

Seite Ansteuern
    [Documentation]    Geht auf eine Portalseite und wartet, bis die Kopfzeile
    ...    steht. Ohne das Warten misst der naechste Schritt eine Seite, die
    ...    noch im Aufbau ist.
    [Arguments]    ${pfad}
    Go To    ${BASIS}/${SPRACHE}${pfad}
    Wait For Elements State    ${KOPFBALKEN}    visible    timeout=20s
    Wait For Load State    networkidle    timeout=20s

Befund Festhalten
    [Documentation]    Legt ein Bildschirmfoto unter einem sprechenden Namen
    ...    ab und haengt es an den Bericht. Jeder Fehlschlag bekommt so ein
    ...    Bild, das ohne den Test verstaendlich ist.
    [Arguments]    ${profil}    ${name}
    ${datei} =    Set Variable    ${BILDER}/${profil}[name]-${name}
    Take Screenshot    ${datei}    fullPage=${False}
    RETURN    ${datei}

Kein Waagerechtes Scrollen
    [Documentation]    Die Seite darf nicht breiter sein als das Fenster.
    ...    Geprueft wird die tatsaechliche Scrollbarkeit und nicht scrollWidth
    ...    allein: eine Kamerafahrt hinter overflow:hidden meldet dort mehr,
    ...    ohne dass sich etwas schieben laesst.
    [Arguments]    ${profil}    ${name}
    ${max} =    Evaluate JavaScript    ${None}
    ...    () => { const v = window.scrollX; window.scrollTo(9999, window.scrollY); const m = window.scrollX; window.scrollTo(v, window.scrollY); return m; }
    Run Keyword If    ${max} > 0    Befund Festhalten    ${profil}    ${name}-querscrollen
    Should Be Equal As Integers    ${max}    0
    ...    msg=Die Seite laesst sich um ${max} px zur Seite schieben.

Bedienelemente Der Kopfzeile Sind Erreichbar
    [Documentation]    Kein Bedienelement der Kopfzeile darf ueber den rechten
    ...    Fensterrand hinausragen. Abgeschnitten heisst hier unerreichbar:
    ...    die Kopfzeile hat keinen eigenen Scrollbereich.
    [Arguments]    ${profil}    ${name}
    ${abgeschnitten} =    Evaluate JavaScript    ${None}
    ...    () => { const h = document.querySelector('header.sticky'); if (!h) return ['keine Kopfzeile']; return [...h.querySelectorAll('button, label, a, div, span')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 20 && r.height > 0 && r.right > window.innerWidth + 1; }).map((e) => (e.getAttribute('aria-label') || e.getAttribute('title') || e.textContent || e.tagName).trim().slice(0, 30)).filter((v, i, a) => a.indexOf(v) === i); }
    ${anzahl} =    Get Length    ${abgeschnitten}
    Run Keyword If    ${anzahl} > 0    Befund Festhalten    ${profil}    ${name}-kopfzeile-abgeschnitten
    Should Be Empty    ${abgeschnitten}
    ...    msg=Abgeschnitten am rechten Rand: ${abgeschnitten}

Suche Per Tastatur Oeffnen
    [Documentation]    Oeffnet die globale Suche mit einem Tastenkuerzel und
    ...    wartet, bis das Fenster steht und das Feld den Fokus hat - getippt
    ...    wird danach, ohne erst hineinzuklicken.
    [Arguments]    ${kuerzel}
    Keyboard Key    press    ${kuerzel}
    Wait For Elements State    ${SUCHFENSTER}    visible    timeout=10s
    Wait For Elements State    ${SUCHFELD}    focused    timeout=10s

Suchknopf Steht Links Neben Der Glocke
    [Documentation]    Auf dem Handy ist die Suche ein Knopf direkt links
    ...    neben den Meldungen. Zwischen beiden liegen die 8 px Abstand der
    ...    Werkzeuggruppe. Der Knopf steht zweimal im Dokument, gemessen wird
    ...    der sichtbare.
    ${abstand} =    Evaluate JavaScript    ${None}
    ...    () => { const k = [...document.querySelectorAll('header.sticky [data-suche="knopf"]')].find((e) => e.getBoundingClientRect().width > 0); const g = document.querySelector('header.sticky button[aria-label="Benachrichtigungen"]'); if (!k || !g) return -1; return Math.round(g.getBoundingClientRect().left - k.getBoundingClientRect().right); }
    Should Be Equal As Integers    ${abstand}    8
    ...    msg=Der Suchknopf steht nicht direkt links neben der Glocke (Abstand ${abstand} px, -1 heisst: fehlt).

Suchknopf Steht Hinter Dem Pfad
    [Documentation]    Zwischen 768 und 1279 px steht die Suche als Knopf
    ...    direkt hinter dem Pfad - dort, wo ab 1280 px das Feld beginnt. Der
    ...    Abstand ist der der Kopfzeile, 12 px.
    ${abstand} =    Evaluate JavaScript    ${None}
    ...    () => { const k = [...document.querySelectorAll('header.sticky [data-suche="knopf"]')].find((e) => e.getBoundingClientRect().width > 0); const p = [...document.querySelectorAll('header.sticky nav[aria-label]')].find((e) => e.getBoundingClientRect().width > 0); if (!k || !p) return -1; return Math.round(k.getBoundingClientRect().left - p.getBoundingClientRect().right); }
    Should Be Equal As Integers    ${abstand}    12
    ...    msg=Der Suchknopf steht nicht direkt hinter dem Pfad (Abstand ${abstand} px, -1 heisst: fehlt).

Sichtbare Suchknoepfe Zaehlen
    [Documentation]    Wie viele Suchknoepfe gerade zu sehen sind. Im Dokument
    ...    stehen zwei, je Breite ist hoechstens einer sichtbar.
    ${anzahl} =    Evaluate JavaScript    ${None}
    ...    () => [...document.querySelectorAll('header.sticky [data-suche="knopf"]')].filter((e) => e.getBoundingClientRect().width > 0).length
    RETURN    ${anzahl}

Suchfenster Liegt Am Ausloeser
    [Documentation]    Das Fenster geht dort auf, wo sein Ausloeser sitzt:
    ...    es ueberdeckt ihn und beginnt nicht tiefer als er. Passt es rechts
    ...    nicht neben den Knopf, rueckt es nach links, deckt ihn aber weiter.
    [Arguments]    ${ausloeser}
    Wait For Elements State    ${SUCHFENSTER}    stable    timeout=10s
    ${lage} =    Evaluate JavaScript    ${None}
    ...    (sel) => { const a = [...document.querySelectorAll(sel)].find((e) => e.getBoundingClientRect().width > 0); const d = document.querySelector('[role="dialog"][aria-modal="true"]'); if (!a || !d) return 'fehlt'; const r = a.getBoundingClientRect(), f = d.getBoundingClientRect(); const z = (n) => String(Math.round(n)); return f.left <= r.left + 1 && f.right >= r.right - 1 && f.top <= r.top + 1 ? 'ok' : 'Ausloeser ' + z(r.left) + '-' + z(r.right) + '/' + z(r.top) + ', Fenster ' + z(f.left) + '-' + z(f.right) + '/' + z(f.top); }
    ...    arg=${ausloeser}
    Should Be Equal    ${lage}    ok
    ...    msg=Das Suchfenster liegt nicht am Ausloeser: ${lage}

Bildmarke Steht Mittig
    [Documentation]    Mit Rueckweg steht die Bildmarke in der Mitte der
    ...    Kopfzeile. Wird die rechte Gruppe zu breit, rueckt sie aus der
    ...    Mitte - genau das soll die Suche neben der Glocke nicht ausloesen.
    ${versatz} =    Evaluate JavaScript    ${None}
    ...    () => { const m = document.querySelector('header.sticky a[aria-label="Damicon"] > *'); if (!m) return 999; const r = m.getBoundingClientRect(); return Math.round(Math.abs(r.left + r.width / 2 - window.innerWidth / 2)); }
    Should Be True    ${versatz} <= 2
    ...    msg=Die Bildmarke steht ${versatz} px neben der Mitte.

Sichtbare Stationen Des Pfades
    [Documentation]    Der Pfad steht zweimal im Dokument: einmal vollstaendig
    ...    und einmal gekuerzt, umgeschaltet per CSS. Gezaehlt wird nur die
    ...    Fassung, die gerade zu sehen ist.
    ${texte} =    Evaluate JavaScript    ${None}
    ...    () => { const navs = [...document.querySelectorAll('header.sticky nav[aria-label]')].filter((n) => n.getBoundingClientRect().width > 0); if (navs.length === 0) return []; return [...navs[0].querySelectorAll('li')].map((e) => e.textContent.trim()); }
    RETURN    ${texte}

Untere Leiste Verdeckt Den Inhalt Nicht
    [Documentation]    Die schwebende untere Leiste darf den letzten Abschnitt
    ...    nicht ueberdecken. Gemessen wird am letzten Kind von main, nachdem
    ...    es ins Bild geholt wurde - nicht ueber die Dokumenthoehe: die
    ...    KI-Schublade liegt als festes Element unterhalb des Fensters und
    ...    blaeht sie auf, ohne dass dort Inhalt stuende.
    [Arguments]    ${profil}
    ${verdeckt} =    Evaluate JavaScript    ${None}
    ...    () => { const m = document.querySelector('main'); const letzte = m && m.lastElementChild; if (!letzte) return -1; letzte.scrollIntoView({ block: 'end', behavior: 'instant' }); const leiste = [...document.querySelectorAll('body > *, body div')].filter((e) => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return s.position === 'fixed' && s.display !== 'none' && r.height > 40 && r.width > window.innerWidth * 0.6 && r.top < window.innerHeight && r.bottom > window.innerHeight - 8; })[0]; if (!leiste) return 0; const u = letzte.getBoundingClientRect().bottom; const o = leiste.getBoundingClientRect().top; return u > o ? Math.round(u - o) : 0; }
    Run Keyword If    ${verdeckt} > 0    Befund Festhalten    ${profil}    inhalt-verdeckt
    Should Be True    ${verdeckt} <= 0
    ...    msg=Die untere Leiste verdeckt ${verdeckt} px des letzten Abschnitts.

Kein Text Ist Abgeschnitten
    [Documentation]    Sucht Elemente, deren Inhalt breiter ist als ihr Kasten.
    ...    Ein abgeschnittener Modulname ist schlechter als eine Zeile mehr.
    [Arguments]    ${profil}    ${name}    ${auswahl}
    ${treffer} =    Evaluate JavaScript    ${None}
    ...    (sel) => [...document.querySelectorAll(sel)].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent.trim().slice(0, 30))
    ...    arg=${auswahl}
    ${anzahl} =    Get Length    ${treffer}
    Run Keyword If    ${anzahl} > 0    Befund Festhalten    ${profil}    ${name}-text-abgeschnitten
    Should Be Empty    ${treffer}    msg=Abgeschnittener Text: ${treffer}
