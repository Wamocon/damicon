# Portal-Tests mit Robot Framework

Vierzehn Tests des Portals in drei Geraeteprofilen. Geprueft wird, was die
Fenstergroesse entscheidet: ob die Bedienung erreichbar bleibt, ob Text
lesbar bleibt und ob der Weg durch die Ebenen funktioniert.

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

## Die drei Profile

| Profil | Fenster | Wofuer es steht |
|---|---|---|
| `schreibtisch` | 1600 x 1000 | Laptop und Arbeitsplatzbildschirm |
| `mobil-quer` | 844 x 390 | Telefon gedreht, zugleich Tablet hoch und halbes Laptopfenster |
| `mobil-hoch` | 390 x 844 | iPhone 14/15, Android-Mittelklasse |

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
| Suchfeld und Suchknopf | Feld ab 1280 px, darunter ein Knopf? |
| Zonenkarten | Nennen die Karten die Module, ohne Namen abzuschneiden? |
| Rueckweg | Traegt die Kopfzeile auf dem Handy eine Station zurueck? |
| Untere Leiste | Verdeckt sie den letzten Abschnitt? |
| Weg durch die Ebenen | Uebersicht, Bereich und ueber den Pfad zurueck |
| Glocke | Oeffnet sie den leeren Stand, im Fenster, und schliessen Esc und ein Tipp daneben? |
| Punkt an der Glocke | Ist er nach dem ersten Oeffnen weg, auch nach dem Neuladen? |
| Glocke als Kunde | Fehlt sie in der Ansicht als Kunde? |

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

## Grenzen

Die Tests laufen gegen Chromium und den Entwicklungsserver, nicht gegen einen
Produktionsbau und nicht auf einem echten Geraet. Sie pruefen Erreichbarkeit
und Lesbarkeit, nicht Gestaltung. Rollenrechte prueft die Datenbank, nicht
diese Tests; dafuer gibt es `npm run db:test`.
