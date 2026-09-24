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
${GLOCKE}         ${KOPFBALKEN} button[aria-label="Benachrichtigungen"]
${GLOCKEN_PANEL}    ${KOPFBALKEN} [role="dialog"]
${GLOCKEN_PUNKT}    ${GLOCKE} [data-glocke-punkt]

# Die drei Geraeteprofile. Breite und Hoehe sind CSS-Pixel, nicht Geraetepixel.
# 390x844 ist iPhone 14/15 hoch, 844x390 dasselbe Geraet gedreht. Dieselbe
# Breite trifft auch Tablet hoch und ein halbes Laptopfenster.
&{SCHREIBTISCH}    name=schreibtisch    breite=${1600}    hoehe=${1000}
&{MOBIL_QUER}      name=mobil-quer      breite=${844}     hoehe=${390}
&{MOBIL_HOCH}      name=mobil-hoch      breite=${390}     hoehe=${844}


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

Glocke Oeffnen
    [Documentation]    Klickt die Glocke und wartet, bis ihr Panel steht.
    Click    ${GLOCKE}
    Wait For Elements State    ${GLOCKEN_PANEL}    visible    timeout=10s

Glocken Panel Nutzt Die Volle Breite
    [Documentation]    Auf dem Handy laeuft das Panel ueber die ganze Breite,
    ...    mit 16 px Rand wie die Karten darunter. Ein schmales Panel an der
    ...    Glocke liess links ungenutzten Platz und brach den Text unnoetig um.
    [Arguments]    ${profil}
    ${lage} =    Evaluate JavaScript    ${None}
    ...    () => { const p = document.querySelector('header.sticky [role="dialog"]'); if (!p) return 'kein Panel'; const r = p.getBoundingClientRect(); const rechts = window.innerWidth - r.right; return Math.abs(r.left - 16) <= 1 && Math.abs(rechts - 16) <= 1 ? 'ok' : 'links ' + Math.round(r.left) + ' px, rechts ' + Math.round(rechts) + ' px Rand bei ' + window.innerWidth + ' px'; }
    Run Keyword If    '${lage}' != 'ok'    Befund Festhalten    ${profil}    glocke-schmal
    Should Be Equal    ${lage}    ok    msg=Das Panel der Glocke nutzt nicht die volle Breite: ${lage}

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
