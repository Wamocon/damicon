# Vorführung mit Himbi: Drehbuch, Ablauf, Grenzen

Stand: 05.11.2026, Branch `feat/demo-drehbuch`.

Himbi führt in wenigen Minuten durch Damicon: Er öffnet Seite für Seite, hebt die Stelle hervor, auf die er zeigt, und spricht den Text des Drehbuchs. Die Untertitel stehen in seiner Sprechblase. Er zeigt nur: Der Ablauf klickt nichts, was etwas absendet oder ändert, und füllt kein Feld aus.

## Starten

1. KI-Panel öffnen (Knopf "KI fragen"), Reiter **Einstellungen**.
2. Unter "Vorführung mit Himbi" zwei Schalter und ein Knopf: **Mit Einleitung von Himbi** (aus: du leitest selbst ein und übergibst an Himbi, der mit den Beispielen beginnt, das ist die Voreinstellung), **Mit CEO-Teil** (aus) und **Vorführung starten**. Dauer im Regelfall (ohne Einleitung und CEO-Teil) etwa 2 Minuten (Vorgabe vom 06.11.2026): rund 1,3 Minuten Sprechzeit bei Tempo 0,92 und zehn Schritten, dazu die Pausen und das Laden der Seiten. Mit Einleitung von Himbi und CEO-Teil etwa 4 Minuten. Das Drehbuch sagt kurz, was es bringt, und kündigt jeden Seitenwechsel mit einem Übergang an ("Wenn wir jetzt ins Büro wechseln ..."): höchstens vier Sätze und 40 Wörter je Schritt, der Test hält das ein, meist sind es ein bis zwei Sätze. Himbis Einleitung nennt keine Probleme, die beiden Vortragenden sprechen sie selbst an.

   **Gewichtung nach Priorität:** Feld und Hof kommen zuerst und nehmen mit rund zwei Dritteln den größten Teil der Zeit ein, dann das Büro (rund ein Viertel), zuletzt der Markt in einem einzigen kurzen Schritt (rund 7 Prozent). Die Priorität zeigt sich an der Länge: Der Test misst die Wörter je Bereich (Zone des Moduls) und fällt, wenn Feld und Hof unter 60 Prozent rutschen oder der Markt über 10 Prozent wächst. Reihenfolge: Feld, Hof, Büro, Markt.
3. Bedienung in der Sprechblase: Zurück, Pause, Weiter, Sprache, Beenden. Ein Klick irgendwo auf der Seite pausiert, Escape beendet.

Wer darf: nur Geschäftsführung und Administration (echte Profilrolle, auch für die Stimme auf dem Server). Voraussetzungen: Himbi ist eingeschaltet und im Bild, kein Handy.

**Der Reiter Einstellungen** erscheint nur, wenn der aktive KI-Anbieter Anthropic ist (Agent fähig) oder die Person die KI verwaltet (Administration). Ohne Anthropic-Anbieter sieht ihn die Geschäftsführung nicht, dann startet die Administration die Vorführung.

## Das Drehbuch ändern

Alles steht in einer Datei: `src/lib/demo/drehbuch.ts`. Ein Schritt hat eine Kennung, ein Ziel (Modul aus `modules.ts` oder feste Seite), die Stellen, auf die Himbi zeigt, und den Text je Sprache.

- **Modulseiten:** `abschnitte: [1, 2]` heißt: erst auf den ersten, dann auf den zweiten Abschnitt mit Zwischenüberschrift zeigen. 0 ist der Seitenkopf. Gezählt wird nach Position auf der Seite, deshalb gilt dieselbe Angabe in jeder Sprache. Die Markierung wandert gleichmäßig über die Sprechzeit, denn der Text spricht meist über mehrere Stellen. Fehlt ein Abschnitt, entfällt er still, der Durchgang wartet bis zu vier Sekunden auf langsam ladende Seiten.
- **Feste Seiten (Startübersicht):** `zeigeAuf` nennt den Schlüssel einer Überschrift aus `src/messages`. Ohne Angabe zeigt Himbi dort nirgends hin.

- Der Text gilt für Untertitel UND Stimme. Die Route `/api/demo-sprachausgabe` nimmt nur Schrittkennung und Sprache und liest den Text aus dieser Datei. Freier Text ist nicht möglich.
- Kürzel, die die deutsche Stimme nicht lesen kann (ЕСУТД, ЭСФ), stehen in `SPRECHWEISE_DE` mit ihrer gesprochenen Form.
- Eine Sprache erscheint in der Auswahl erst, wenn **jeder** Schritt einen Text in ihr hat. Deutsch und Russisch liegen vor (`text.de`, `text.ru`). Die Sprache folgt der Oberfläche: steht sie auf Russisch, spricht Himbi Russisch. In der Blase wechselt der Knopf mit dem Sprachnamen mitten im Lauf. Die russische Stimme bekommt "Дамикон" statt "Damicon" (`SPRECHWEISE_RU`), die Untertitel behalten die Schreibweise.
- Ändert sich ein Text, entsteht neues Audio: der Zwischenspeicher trägt einen Abdruck des Textes im Pfad.
- Die genannte Amortisation (11 Monate) muss mit der Rechnung im System übereinstimmen, der Test prüft das.

`npm run test:demo-drehbuch` prüft: Ziele gibt es und sind für Geschäftsführung und Administration sichtbar, Überschriften in allen Oberflächensprachen, keine Gedankenstriche, keine Ersatzschreibung, Zeitbudget, Rechte und dass die Stimme nur Drehbuchtext liest.

## Stimme

Die vorhandene Sprachausgabe (`KI_SPRACHAUSGABE_ANBIETER`, Sokrates oder Soniox, mit Rückfall). Die Vorführung spricht ruhiger als der Chat: bei Soniox Tempo 0,92 statt 1,2 (`DEMO_TEMPO` in der Route) und ohne gekürzte Pausen. Nach dem letzten Wort wartet der Ablauf 0,8 s (`NACHLAUF_MS`), nach einem Seitenwechsel steht die neue Seite 1,2 s, bevor Himbi dazu spricht (`ANKOMMEN_MS`). Sokrates kennt kein Tempo, dort gelten nur die Pausen. Der Ton der nächsten drei Schritte wird schon geholt, während der aktuelle läuft, und als Datei im Speicher des Browsers gehalten (ein Abruf je Schritt). So bleibt die Pause zwischen den Schritten kurz und gleichmäßig, auch wenn die Stimme etwa in Echtzeit erzeugt. Gemessen mit einer Stimme, die 4 Sekunden je Schritt braucht: Lücken zwischen 0,8 und 1,9 Sekunden. Beim zweiten Lauf kommt jeder Schritt aus dem Zwischenspeicher. Der Zwischenspeicher ist der private Bucket `ki-sprachausgabe` unter `demo/<sprache>/`, der **nur MP3** annimmt (der Dienst liefert MP3).

Fällt die Stimme aus (Dienst nicht erreichbar, Berechtigung, Ratenlimit), laufen die Untertitel mit der Lesezeit weiter, in der Blase steht "Kein Ton". Ein Schritt bleibt nie hängen.

## Himbis Blase

Die Vorführung speist dieselben Felder wie die Compliance-Tour (Blase, Zustand, Blickziel, Hüpfer), siehe `useComplianceTourAnzeige` in `compliance-tour-kontext.tsx`. Sie hat Vorrang vor dem Live-Hinweis der Compliance-Prüfung (`vorrang`), damit eine Prüfung nach dem Login die ersten Sätze nicht verdeckt.

## Grenzen und offen

- Der russische Text ist eine Übersetzung der deutschen Fassung und noch nicht von einer Person gegengelesen, die Russisch spricht. Die Aussprache der Kürzel ЭСФ und ЕСУТД durch die russische Stimme ist nicht gehört. Kasachisch und Englisch sind nicht vorgesehen.
- Die Seiten zeigen die Daten des angemeldeten Kontos. Fehlen Beispieldaten (kein gesperrter Block, keine überfällige Rotation), spricht Himbi über eine leere Stelle. Vor einer Vorführung Daten prüfen.
- Nicht verifiziert ist der Ton mit den echten Stimmen (Sokrates, Soniox). Getestet wurde der Weg mit einer Attrappe, die MP3 liefert, einschließlich Zwischenspeicher und Vorab-Erzeugung.
- Auf dem Handy gibt es keine Figur und damit keine Vorführung.
