*** Settings ***
Documentation     Portal-Tests in drei Geraeteprofilen: Schreibtisch,
...               Handy quer und Handy hoch. Geprueft wird, was die
...               Fenstergroesse entscheidet - Erreichbarkeit der Bedienung,
...               Lesbarkeit der Texte und der Weg durch die Ebenen.
...
...               Voraussetzung: der Entwicklungsserver laeuft unter ${BASIS}
...               und die Demo-Konten sind angelegt (npm run db:seed-auth).
...
...               Ausfuehren: tests/robot/ausfuehren.ps1
Resource          ressourcen/portal.resource
Test Teardown     Close Browser    ALL
Force Tags        portal


*** Test Cases ***
Schreibtisch Traegt Alle Bedienelemente Und Den Vollen Pfad
    [Documentation]    Bei 1600 px passt alles in die Kopfzeile, und der Pfad
    ...    zeigt alle drei Stationen.
    [Tags]    schreibtisch
    Portal Oeffnen    ${SCHREIBTISCH}
    Seite Ansteuern    /dashboard/buero/rollen
    Bedienelemente Der Kopfzeile Sind Erreichbar    ${SCHREIBTISCH}    modulseite
    Kein Waagerechtes Scrollen    ${SCHREIBTISCH}    modulseite
    ${stationen} =    Sichtbare Stationen Des Pfades
    Length Should Be    ${stationen}    3
    ...    msg=Der Pfad sollte Haus, Bereich und Seite zeigen, zeigt aber ${stationen}.
    Should Be Equal    ${stationen}[2]    Rollen und Rechte
    Befund Festhalten    ${SCHREIBTISCH}    modulseite

Schreibtisch Zeigt Das Suchfeld Statt Eines Knopfes
    [Documentation]    Ab 1280 px ist Platz fuer das Feld. Darunter wird es
    ...    zum Knopf, siehe den Test im Querformat.
    [Tags]    schreibtisch
    Portal Oeffnen    ${SCHREIBTISCH}
    Seite Ansteuern    /dashboard
    ${breite} =    Evaluate JavaScript    ${None}
    ...    () => { const f = [...document.querySelectorAll('header.sticky div')].find((e) => /suchen/i.test(e.textContent) && e.children.length <= 2); return f ? Math.round(f.getBoundingClientRect().width) : 0; }
    Should Be True    ${breite} > 200
    ...    msg=Das Suchfeld ist nur ${breite} px breit statt eines lesbaren Feldes.

Zonenkarten Nennen Die Module Der Zone
    [Documentation]    Die Uebersichtskarten tragen die Modulnamen. Kein Name
    ...    darf dabei abgeschnitten sein, sonst ist die Karte wertlos.
    [Tags]    schreibtisch
    Portal Oeffnen    ${SCHREIBTISCH}
    Seite Ansteuern    /dashboard
    ${karten} =    Get Element Count    [data-zone="buero"] a[href*="/dashboard/buero/"]
    Should Be True    ${karten} > 0    msg=Die Buero-Karte nennt kein einziges Modul.
    Kein Text Ist Abgeschnitten    ${SCHREIBTISCH}    zonenkarten
    ...    [data-zone] a, [data-zone] h3, [data-zone] .truncate
    Befund Festhalten    ${SCHREIBTISCH}    zonenkarten

Handy Quer Schneidet Keine Bedienelemente Ab
    [Documentation]    Der Bereich um 844 px war der schwerste Befund des
    ...    UI-Berichts: Sprachwahl, Farbschema und Meldungen standen dort
    ...    ausserhalb des Fensters und waren nicht erreichbar.
    [Tags]    mobil-quer
    Portal Oeffnen    ${MOBIL_QUER}
    Seite Ansteuern    /dashboard/buero/rollen
    Bedienelemente Der Kopfzeile Sind Erreichbar    ${MOBIL_QUER}    modulseite
    Kein Waagerechtes Scrollen    ${MOBIL_QUER}    modulseite
    Befund Festhalten    ${MOBIL_QUER}    modulseite

Handy Quer Zeigt Die Suche Als Knopf
    [Documentation]    Unter 1280 px weicht das Feld einem Knopf, sonst
    ...    schrumpft es zu einer leeren Pille.
    [Tags]    mobil-quer
    Portal Oeffnen    ${MOBIL_QUER}
    Seite Ansteuern    /dashboard
    ${knopf} =    Get Element Count    ${KOPFBALKEN} span[title*="suchen"]
    Should Be Equal As Integers    ${knopf}    1
    ...    msg=Der Suchknopf fehlt oder steht doppelt.
    ${feld} =    Evaluate JavaScript    ${None}
    ...    () => [...document.querySelectorAll('header.sticky div')].filter((e) => /suchen/i.test(e.textContent) && e.getBoundingClientRect().width > 0 && e.children.length <= 2).length
    Should Be Equal As Integers    ${feld}    0
    ...    msg=Im Querformat steht noch ein Suchfeld statt des Knopfes.

Handy Quer Kuerzt Den Pfad Auf Die Offene Seite
    [Documentation]    Wird es eng, faellt die mittlere Station weg. Die
    ...    Seite, auf der man steht, muss bleiben.
    [Tags]    mobil-quer
    Portal Oeffnen    ${MOBIL_QUER}
    Seite Ansteuern    /dashboard/buero/rollen
    ${stationen} =    Sichtbare Stationen Des Pfades
    Length Should Be    ${stationen}    2
    ...    msg=Im Querformat sollten nur Haus und offene Seite stehen, es sind ${stationen}.
    Should Be Equal    ${stationen}[1]    Rollen und Rechte
    Befund Festhalten    ${MOBIL_QUER}    pfad-gekuerzt

Handy Hoch Traegt Den Rueckweg Statt Des Pfades
    [Documentation]    Unter 768 px ist kein Platz fuer drei Stationen. Die
    ...    Kopfzeile zeigt stattdessen eine Station zurueck.
    [Tags]    mobil-hoch
    Portal Oeffnen    ${MOBIL_HOCH}
    Seite Ansteuern    /dashboard/buero/rollen
    ${pfad} =    Evaluate JavaScript    ${None}
    ...    () => { const n = document.querySelector('header.sticky nav[aria-label]'); return n ? getComputedStyle(n).display : 'keiner'; }
    Should Be True    '${pfad}' == 'none' or '${pfad}' == 'keiner'
    ...    msg=Der volle Pfad steht auf dem Handy sichtbar in der Kopfzeile.
    # Direktes Kind der Kopfzeile: der Rueckweg. Die Stationen des Pfades
    # liegen in nav > ol > li und verweisen auf dasselbe Ziel.
    #
    # textContent und nicht Get Text: der Rueckweg steht per CSS in Versalien,
    # und Get Text liefert den umgewandelten Text. Der Test soll die
    # Beschriftung pruefen und nicht die Schreibweise.
    ${rueckweg} =    Get Property
    ...    ${KOPFBALKEN} > a[href$="/dashboard/buero"]    textContent
    Should Contain    ${rueckweg}    Büro
    Kein Waagerechtes Scrollen    ${MOBIL_HOCH}    modulseite
    Befund Festhalten    ${MOBIL_HOCH}    modulseite

Handy Hoch Zeigt Die Zonenkarten Ohne Abgeschnittene Namen
    [Documentation]    Bei 390 px stehen die Modulnamen zweispaltig. Passt ein
    ...    Name nicht, muss die Liste einspaltig werden statt zu kuerzen.
    [Tags]    mobil-hoch
    Portal Oeffnen    ${MOBIL_HOCH}
    Seite Ansteuern    /dashboard
    Kein Text Ist Abgeschnitten    ${MOBIL_HOCH}    zonenkarten
    ...    [data-zone] a, [data-zone] h3, [data-zone] .truncate
    Kein Waagerechtes Scrollen    ${MOBIL_HOCH}    uebersicht
    Befund Festhalten    ${MOBIL_HOCH}    zonenkarten

Handy Hoch Erreicht Den Letzten Absatz Einer Modulseite
    [Documentation]    Die untere Leiste schwebt ueber dem Inhalt. Ohne
    ...    Abstand darunter verdeckt sie den letzten Knopf jeder Seite.
    [Tags]    mobil-hoch
    Portal Oeffnen    ${MOBIL_HOCH}
    Seite Ansteuern    /dashboard/feld/reihenbloecke
    Untere Leiste Verdeckt Den Inhalt Nicht    ${MOBIL_HOCH}

Der Weg Durch Die Ebenen Funktioniert In Jedem Profil
    [Documentation]    Uebersicht, Bereich, Modul und zurueck. Der Test nimmt
    ...    den Weg, den ein Mensch nimmt, und nicht die Adresszeile.
    [Tags]    schreibtisch
    Portal Oeffnen    ${SCHREIBTISCH}
    Seite Ansteuern    /dashboard
    Click    main a[href$="/dashboard/buero"]
    Wait For Condition    url    contains    /dashboard/buero    timeout=20s
    Wait For Elements State    ${KOPFBALKEN} nav[aria-label]    visible    timeout=20s
    Click    ${KOPFBALKEN} nav[aria-label] a[href$="/dashboard"]
    Wait For Condition    url    ends    /dashboard    timeout=20s
    Befund Festhalten    ${SCHREIBTISCH}    weg-zurueck
