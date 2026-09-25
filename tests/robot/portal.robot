*** Settings ***
Documentation     Portal-Tests in vier Geraeteprofilen: Schreibtisch,
...               Handy quer, Handy hoch und schmales Handy. Geprueft wird,
...               was die Fenstergroesse entscheidet - Erreichbarkeit der
...               Bedienung, Lesbarkeit der Texte, der Weg durch die Ebenen
...               und die globale Suche.
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

Schreibtisch Zeigt Die Suche Als Knopf Neben Der Glocke
    [Documentation]    Auch am Schreibtisch ist die Suche nur ein Knopf mit
    ...    Lupe, links neben der Glocke wie auf dem Handy - kein Eingabefeld
    ...    und keine Leiste im Look eines Suchfelds. Getippt wird erst im
    ...    Suchfenster.
    [Tags]    schreibtisch
    Portal Oeffnen    ${SCHREIBTISCH}
    Seite Ansteuern    /dashboard/buero/rollen
    Suche Ist Nur Ein Knopf
    Suchknopf Steht Links Neben Der Glocke

Schreibtisch Oeffnet Das Suchfenster Mittig Oben
    [Documentation]    Der Knopf mit der Lupe oeffnet das Suchfenster oben in
    ...    der Mitte des Bildschirms, nicht an seiner eigenen Stelle. Getippt
    ...    wird erst im Fenster.
    [Tags]    schreibtisch
    Portal Oeffnen    ${SCHREIBTISCH}
    Seite Ansteuern    /dashboard/hof/kuehlkette
    Click    ${KOPFBALKEN} [data-suche="knopf"]
    Wait For Elements State    ${SUCHFELD}    focused    timeout=10s
    Suchfenster Steht Mittig Oben
    Befund Festhalten    ${SCHREIBTISCH}    suche-mittig-oben

Suche Findet Seitentexte Unter Erwaehnt In
    [Documentation]    Unter den Namenstreffern stehen Seiten, deren Text den
    ...    Begriff nennt, mit der Stelle als Beleg. "Wartezeit" steht im Namen
    ...    von Pflanzenschutz und im Text der Reihenbloecke.
    [Tags]    schreibtisch
    Portal Oeffnen    ${SCHREIBTISCH}
    Seite Ansteuern    /dashboard
    Suche Per Tastatur Oeffnen    Control+k
    Keyboard Input    type    Wartezeit
    Wait For Elements State    [role="option"] >> text=Reihenblöcke    visible
    ${gruppen} =    Evaluate JavaScript    ${None}
    ...    () => [...document.querySelectorAll('[role="listbox"] [role="group"]')].map((g) => document.getElementById(g.getAttribute('aria-labelledby')).textContent + ': ' + [...g.querySelectorAll('[role="option"]')].map((o) => o.innerText.split('\\n')[0]).join(', '))
    Should Contain    ${gruppen}    Seiten und Module: Pflanzenschutz
    ...    msg=Pflanzenschutz fehlt unter den Namenstreffern: ${gruppen}
    Should Contain    ${gruppen}    Erwähnt in: Reihenblöcke
    ...    msg=Die Reihenbloecke fehlen unter "Erwaehnt in": ${gruppen}

Strg K Oeffnet Die Suche Und Enter Fuehrt Zum Treffer
    [Documentation]    Dasselbe Kuerzel wie im Handbuch. Der erste Treffer ist
    ...    markiert, Enter oeffnet ihn, und das Fenster ist danach zu.
    [Tags]    schreibtisch
    Portal Oeffnen    ${SCHREIBTISCH}
    Seite Ansteuern    /dashboard
    Suche Per Tastatur Oeffnen    Control+k
    Keyboard Input    type    Rollen
    Wait For Elements State    [role="option"][aria-selected="true"] >> text=Rollen    visible
    Keyboard Key    press    Enter
    Wait For Condition    url    contains    /dashboard/buero/rollen    timeout=20s
    Wait For Elements State    ${SUCHFENSTER}    detached    timeout=10s

Schraegstrich Oeffnet Die Suche Und Esc Schliesst Sie
    [Documentation]    "/" ausserhalb eines Eingabefeldes oeffnet, Esc schliesst
    ...    ohne Sprung - die Seite bleibt dieselbe.
    [Tags]    schreibtisch
    Portal Oeffnen    ${SCHREIBTISCH}
    Seite Ansteuern    /dashboard/feld/reihenbloecke
    Suche Per Tastatur Oeffnen    /
    Keyboard Key    press    Escape
    Wait For Elements State    ${SUCHFENSTER}    detached    timeout=10s
    ${adresse} =    Get Url
    Should End With    ${adresse}    /dashboard/feld/reihenbloecke

Zuletzt Geoeffnet Nennt Die Zuvor Besuchte Seite
    [Documentation]    Bei leerem Feld zeigt die Suche die zuletzt selbst
    ...    geoeffneten Seiten. Die gerade offene Seite steht nicht darin.
    [Tags]    schreibtisch
    Portal Oeffnen    ${SCHREIBTISCH}
    Seite Ansteuern    /dashboard/feld/reihenbloecke
    Seite Ansteuern    /dashboard
    Suche Per Tastatur Oeffnen    Control+k
    ${eintraege} =    Evaluate JavaScript    ${None}
    ...    () => [...document.querySelectorAll('[role="option"]')].map((o) => o.innerText.split('\\n')[0])
    Should Contain    ${eintraege}    Reihenblöcke
    ...    msg=Die zuvor besuchte Seite fehlt unter "Zuletzt geoeffnet": ${eintraege}
    Should Not Contain    ${eintraege}    Übersicht
    ...    msg=Die gerade offene Seite steht unter "Zuletzt geoeffnet".

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
    [Documentation]    Im Querformat steht die Suche wie am Schreibtisch als
    ...    Knopf links neben der Glocke. Das Fenster geht oben in der Mitte
    ...    auf.
    [Tags]    mobil-quer
    Portal Oeffnen    ${MOBIL_QUER}
    Seite Ansteuern    /dashboard/buero/rollen
    Suche Ist Nur Ein Knopf
    Suchknopf Steht Links Neben Der Glocke
    Click    ${KOPFBALKEN} [data-suche="knopf"]
    Wait For Elements State    ${SUCHFELD}    focused    timeout=10s
    Suchfenster Steht Mittig Oben

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

Handy Hoch Traegt Die Suche Neben Der Glocke
    [Documentation]    Auf dem Handy sitzt die Suche in der Kopfzeile links
    ...    neben der Glocke. Ein Tipp oeffnet das Fenster von oben mit dem
    ...    Fokus im Feld, ein Treffer fuehrt auf seine Seite.
    [Tags]    mobil-hoch
    Portal Oeffnen    ${MOBIL_HOCH}
    Seite Ansteuern    /dashboard/buero/rollen
    Suchknopf Steht Links Neben Der Glocke
    Bildmarke Steht Mittig
    Kein Waagerechtes Scrollen    ${MOBIL_HOCH}    suche
    Click    ${KOPFBALKEN} [data-suche="knopf"]
    Wait For Elements State    ${SUCHFELD}    focused    timeout=10s
    ${oben} =    Evaluate JavaScript    ${None}
    ...    () => Math.round(document.querySelector('[role="dialog"][aria-modal="true"]').getBoundingClientRect().top)
    Should Be True    ${oben} <= 16
    ...    msg=Das Suchfenster haengt nicht oben, sondern ${oben} px darunter.
    Fill Text    ${SUCHFELD}    Kühlkette
    Befund Festhalten    ${MOBIL_HOCH}    suche-offen
    Click    [role="option"] >> nth=0
    Wait For Condition    url    contains    /dashboard/hof/kuehlkette    timeout=20s

Handy Schmal Traegt Suche Und Glocke Ohne Querscrollen
    [Documentation]    Bei 360 px ist die Kopfzeile am engsten: Rueckweg,
    ...    Bildmarke in der Mitte und rechts Suche und Glocke. Nichts darf
    ...    abgeschnitten sein, und die Marke bleibt mittig.
    [Tags]    mobil-schmal
    Portal Oeffnen    ${MOBIL_SCHMAL}
    Seite Ansteuern    /dashboard/buero/rollen
    Bedienelemente Der Kopfzeile Sind Erreichbar    ${MOBIL_SCHMAL}    modulseite
    Kein Waagerechtes Scrollen    ${MOBIL_SCHMAL}    modulseite
    Suchknopf Steht Links Neben Der Glocke
    Bildmarke Steht Mittig
    Befund Festhalten    ${MOBIL_SCHMAL}    modulseite

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

Schreibtisch Glocke Oeffnet Die Schublade Von Rechts
    [Documentation]    Die Glocke oeffnet am Schreibtisch eine Schublade in
    ...    voller Hoehe am rechten Rand, die sagt, dass nichts vorliegt. Esc
    ...    schliesst sie und gibt den Fokus an die Glocke zurueck, sonst
    ...    stuende man mit der Tastatur irgendwo im Dokument.
    [Tags]    schreibtisch
    Portal Oeffnen    ${SCHREIBTISCH}
    Seite Ansteuern    /dashboard
    Glocke Oeffnen
    Get Text    ${GLOCKEN_PANEL}    contains    Keine neuen Benachrichtigungen
    Get Attribute    ${GLOCKE}    aria-expanded    ==    true
    Glocken Fenster Liegt    ${SCHREIBTISCH}    rechts
    Befund Festhalten    ${SCHREIBTISCH}    glocke-offen
    Keyboard Key    press    Escape
    Get Element Count    ${GLOCKEN_PANEL}    ==    0
    ${fokus} =    Evaluate JavaScript    ${None}
    ...    () => document.activeElement && document.activeElement.getAttribute('aria-label')
    Should Be Equal    ${fokus}    Benachrichtigungen
    ...    msg=Nach Esc steht der Fokus nicht auf der Glocke, sondern auf ${fokus}.

Handy Hoch Glocke Oeffnet Ein Blatt Von Unten
    [Documentation]    Auf dem Handy kommt das Fenster als Blatt von unten, wie
    ...    Menue und Konto. Ein Tipp auf die Blende darueber schliesst es.
    [Tags]    mobil-hoch
    Portal Oeffnen    ${MOBIL_HOCH}
    Seite Ansteuern    /dashboard
    Glocke Oeffnen
    Get Text    ${GLOCKEN_PANEL}    contains    Keine neuen Benachrichtigungen
    Glocken Fenster Liegt    ${MOBIL_HOCH}    unten
    Befund Festhalten    ${MOBIL_HOCH}    glocke-offen
    # Rohe Mauskoordinaten statt Click: oben liegt die Blende ueber der
    # Seite, und genau sie soll den Tipp bekommen. Click auf ein Element
    # darunter wuerde an der Blende als Verdeckung scheitern.
    Mouse Button    click    195    60
    Get Element Count    ${GLOCKEN_PANEL}    ==    0

Punkt An Der Glocke Verschwindet Nach Dem Ersten Oeffnen
    [Documentation]    Der Punkt heisst "noch nie hineingeschaut". Ein frischer
    ...    Browser zeigt ihn, nach dem ersten Oeffnen bleibt er weg, auch
    ...    nach dem Neuladen.
    [Tags]    schreibtisch
    Portal Oeffnen    ${SCHREIBTISCH}
    Seite Ansteuern    /dashboard
    Wait For Elements State    ${GLOCKEN_PUNKT}    attached    timeout=10s
    Glocke Oeffnen
    Get Element Count    ${GLOCKEN_PUNKT}    ==    0
    Reload
    Wait For Elements State    ${GLOCKE}    visible    timeout=20s
    Get Element Count    ${GLOCKEN_PUNKT}    ==    0

Glocke Fehlt In Der Ansicht Als Kunde
    [Documentation]    Fuer Kunde und Picker gibt es vorerst nichts, was die
    ...    Glocke melden koennte. Die Regel gilt fuer die angezeigte Rolle,
    ...    also auch, wenn die Administration "Ansicht als" nutzt.
    [Tags]    schreibtisch
    Portal Oeffnen    ${SCHREIBTISCH}
    Seite Ansteuern    /dashboard
    Wait For Elements State    ${GLOCKE}    visible    timeout=20s
    LocalStorage Set Item    damicon-persona    kunde
    Reload
    Wait For Elements State    ${KOPFBALKEN}    visible    timeout=20s
    Get Element Count    ${GLOCKE}    ==    0
    LocalStorage Set Item    damicon-persona    admin
    Reload
    Wait For Elements State    ${GLOCKE}    visible    timeout=20s

Schreibtisch Dockt Die Detailansicht Neben Der Liste An
    [Documentation]    Liste mit Detailansicht (DESIGN.md Abschnitt 14): bei
    ...    1600 px ist genug Platz, die Detailansicht steht rechts neben der
    ...    Liste, ueberdeckt sie nicht und ist breiter als ihre 26rem Minimum.
    [Tags]    schreibtisch
    Portal Oeffnen    ${SCHREIBTISCH}
    Seite Ansteuern    /dashboard/feld/pflueckaufgaben
    Detailansicht Oeffnen
    Anordnung Der Detailansicht Ist    ${SCHREIBTISCH}    angedockt
    Detailansicht Steht Neben Der Liste    ${SCHREIBTISCH}
    Detailansicht Nutzt Den Platz    ${SCHREIBTISCH}
    Kein Waagerechtes Scrollen    ${SCHREIBTISCH}    detailansicht
    Befund Festhalten    ${SCHREIBTISCH}    detailansicht

Handy Quer Ersetzt Die Liste Durch Die Detailansicht
    [Documentation]    Bei 844 px bleiben neben der Seitenleiste keine 36rem
    ...    fuer die Liste. Eine Schublade liesse nur einen Streifen stehen,
    ...    deshalb tritt die Detailansicht an ihre Stelle.
    [Tags]    mobil-quer
    Portal Oeffnen    ${MOBIL_QUER}
    Seite Ansteuern    /dashboard/feld/pflueckaufgaben
    Detailansicht Oeffnen
    Anordnung Der Detailansicht Ist    ${MOBIL_QUER}    ersetzt
    Kein Waagerechtes Scrollen    ${MOBIL_QUER}    detailansicht

Handy Hoch Fuehrt Aus Der Detailansicht Zur Liste Zurueck
    [Documentation]    Auf dem Handy ersetzt die Detailansicht die Liste,
    ...    "Zur Liste" fuehrt zurueck, und die untere Leiste verdeckt nichts.
    [Tags]    mobil-hoch
    Portal Oeffnen    ${MOBIL_HOCH}
    Seite Ansteuern    /dashboard/feld/pflueckaufgaben
    Detailansicht Oeffnen
    Anordnung Der Detailansicht Ist    ${MOBIL_HOCH}    ersetzt
    Untere Leiste Verdeckt Den Inhalt Nicht    ${MOBIL_HOCH}
    Click    css=#detailpanel >> text=Zur Liste
    Wait For Condition    url    not contains    aufgabe=    timeout=20s
    Wait For Elements State    css=[data-eintrag] >> nth=0    visible    timeout=20s

Handy Schmal Zeigt Pillen Und Filterblatt Ohne Querscrollen
    [Documentation]    Bei 360 px wischen die Status-Pillen in einer Reihe,
    ...    statt die Seite zu verbreitern. Suche, Brigade und Zeitraum liegen
    ...    hinter "Filter" in einem Blatt von unten.
    [Tags]    mobil-schmal
    Portal Oeffnen    ${MOBIL_SCHMAL}
    Seite Ansteuern    /dashboard/feld/pflueckaufgaben
    Kein Waagerechtes Scrollen    ${MOBIL_SCHMAL}    pflueckaufgaben
    Click    css=button[aria-haspopup="dialog"] >> text=Filter
    Wait For Elements State    role=dialog[name="Filter"]    visible    timeout=10s
    Befund Festhalten    ${MOBIL_SCHMAL}    filterblatt
