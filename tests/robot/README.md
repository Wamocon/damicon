# Portal-Tests mit Robot Framework

Siebzehn Tests des Portals in vier Geraeteprofilen. Geprueft wird, was die
Fenstergroesse entscheidet: ob die Bedienung erreichbar bleibt, ob Text
lesbar bleibt, ob der Weg durch die Ebenen funktioniert und ob die globale
Suche auf jeder Breite erreichbar ist.

Jeder Fehlschlag legt ein Bildschirmfoto unter `ergebnisse/bilder/` ab. Der
Name nennt Profil und Befund, etwa `mobil-quer-modulseite-kopfzeile-abgeschnitten.png`.

## Voraussetzungen

Ein laufender Entwicklungsserver und die Demo-Konten in Supabase.

```powershell
npm run dev            # in einem eigenen Fenster
npm run db:seed-auth   # einmalig, legt admin@damicon.demo an
```

## Ausfuehren

```powershell
./tests/robot/ausfuehren.ps1
./tests/robot/ausfuehren.ps1 -Profil mobil-quer
```

Beim ersten Lauf legt das Skript die Python-Umgebung unter `.venv-robot` an
und installiert Robot Framework samt Chromium. Das dauert einige Minuten und
passiert genau einmal. Die Umgebung und der Ergebnisordner stehen in
`.gitignore`, ESLint laesst `.venv-robot` aus.

## Die vier Profile

| Profil | Fenster | Wofuer es steht |
|---|---|---|
| `schreibtisch` | 1600 x 1000 | Laptop und Arbeitsplatzbildschirm |
| `mobil-quer` | 844 x 390 | Telefon gedreht, zugleich Tablet hoch und halbes Laptopfenster |
| `mobil-hoch` | 390 x 844 | iPhone 14/15, Android-Mittelklasse |
| `mobil-schmal` | 360 x 780 | kleine Android-Telefone, der engste Fall der Kopfzeile |

Das mittlere Profil ist das wichtigste. Dort lag der schwerste Befund des
UI-Berichts vom 21.09.2026: zwischen 768 und 899 px schnitt die Kopfzeile
Sprachwahl, Farbschema und Meldungen ab, und erreichbar waren sie nicht, weil
die Kopfzeile keinen eigenen Scrollbereich hat.

## Was die Tests pruefen

| Test | Frage |
|---|---|
| Kopfzeile erreichbar | Ragt ein Bedienelement ueber den rechten Rand hinaus? |
| Kein Querscrollen | Laesst sich die Seite zur Seite schieben? |
| Pfad vollstaendig | Zeigt die Kopfzeile Haus, Bereich und Seite? |
| Pfad gekuerzt | Faellt im Querformat die mittlere Station weg, nicht die offene Seite? |
| Suchfeld und Suchknopf | Ab 1280 px ein echtes Eingabefeld, darunter ein Knopf direkt hinter dem Pfad, auf dem Handy links neben der Glocke? |
| Treffer am Ausloeser | Haengen die Treffer ab 1280 px direkt unter dem Feld der Kopfzeile, ohne Fenster? Geht das Suchfenster darunter am Knopf auf statt irgendwo in der Mitte? |
| Erwaehnt in | Stehen unter den Namenstreffern die Seiten, deren Text den Begriff nennt? |
| Suche per Tastatur | Springen Strg+K und "/" ins Suchfeld, fuehrt Enter zum Treffer, klappt Esc die Liste zu und leert ein zweites Esc das Feld, ohne Sprung? |
| Suche auf dem Handy | Oeffnet ein Tipp das Fenster oben, fuehrt ein Treffer auf seine Seite, bleibt die Bildmarke mittig, auch bei 360 px? |
| Zuletzt geoeffnet | Nennt die Suche bei leerem Feld die zuvor besuchte Seite, aber nicht die offene? |
| Zonenkarten | Nennen die Karten die Module, ohne Namen abzuschneiden? |
| Rueckweg | Traegt die Kopfzeile auf dem Handy eine Station zurueck? |
| Untere Leiste | Verdeckt sie den letzten Abschnitt? |
| Weg durch die Ebenen | Uebersicht, Bereich und ueber den Pfad zurueck |

## Beweisen die Tests etwas

Ja, nachgewiesen am 21.09.2026. Der behobene Fehler in `persona.tsx` wurde
versuchsweise wieder eingebaut, und `Handy Quer Schneidet Keine Bedienelemente
Ab` schlug fehl mit der Meldung

```
Abgeschnitten am rechten Rand: ['KI fragenAdministrationBetrieb',
                                'Dunkles Design', 'Benachrichtigungen']
```

samt Bildschirmfoto. Wer die Tests aendert, sollte diese Probe wiederholen:
ein Test, der nicht fehlschlagen kann, sichert nichts ab.

Fuer die Suchtests wiederholt am 24.09.2026: mit dem Suchknopf wieder hinter
`hidden md:inline-flex` schlugen `Handy Hoch Traegt Die Suche Neben Der Glocke`
und `Handy Schmal Traegt Suche Und Glocke Ohne Querscrollen` fehl, beide mit
"Der Suchknopf steht nicht direkt links neben der Glocke (Abstand -1 px, -1
heisst: fehlt)". Ebenso fuer die Treffer am Feld: mit der Liste oben in der
Mitte des Bildschirms statt unter dem Feld schlug `Suchfeld Klappt Die Treffer
Darunter Auf` fehl mit "Feld 566+527/50, Liste 304+1296/96".

## Grenzen

Die Tests laufen gegen Chromium und den Entwicklungsserver, nicht gegen einen
Produktionsbau und nicht auf einem echten Geraet. Sie pruefen Erreichbarkeit
und Lesbarkeit, nicht Gestaltung. Rollenrechte prueft die Datenbank, nicht
diese Tests; dafuer gibt es `npm run db:test`.
