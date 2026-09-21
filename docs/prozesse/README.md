# Damicon — Prozessdokumentation

Klickanleitungen und Ablaufdiagramme für die drei Kernprozesse von Damicon, mit Screenshots aus der laufenden deutschen Oberfläche (`docs/prozesse/bilder/`).

## Die drei Prozesse

| Prozess | Datei | Schritte | Rollen |
|---|---|---|---|
| Von der Ernte bis zum Kunden | [01-ernte-bis-kunde.md](01-ernte-bis-kunde.md) | 16 | Brigade, Betriebsleitung, öffentlich (ohne Anmeldung) |
| Von der Bestellung bis zur Gutschrift | [02-bestellung-bis-gutschrift.md](02-bestellung-bis-gutschrift.md) | 12 | Kunde, Betriebsleitung |
| Von der Arbeitszeit bis zum Lohn | [03-arbeitszeit-bis-lohn.md](03-arbeitszeit-bis-lohn.md) | 8 | Brigade, Buchhaltung, Pflücker |

Jede Anleitung folgt demselben Muster: Rolle, Seite (URL), Klick/Eingabe, Ergebnis auf dem Bildschirm — mit dem passenden Screenshot direkt darunter.

## Lücken

Diese Screenshots zeigen eine Anwendungsfunktion, für die zum Zeitpunkt der Aufnahme **keine passenden Bestandsdaten** existierten. Um sie trotzdem zu zeigen, wurden gezielt neue, reale Datensätze angelegt (siehe „Sechs neu angelegte Datensätze" unten) statt die Lücke offen zu lassen oder Daten vorzutäuschen.

Zwei kleinere Lücken bleiben:

- **P1-10 (Kühlketten-Alarm):** Die „Kühlketten-Uhr" selbst hatte zum Aufnahmezeitpunkt keine Charge mit laufendem Countdown („Aktuell wartet keine Charge auf die Vorkühlung."). Der Screenshot zeigt stattdessen die Liste „Zuletzt gemessen" mit einer Charge im Status „Verstoß" — inhaltlich dieselbe Aussage (Kühlkette verletzt), aber nicht die live tickende Uhr.
- Alle 36 im Auftrag genannten Screenshots wurden angefertigt. Für die zwei optional markierten (P1-07b Offline-Warteschlange, P1-10 Alarm) gab es ebenfalls passende, echte Zustände.

## Sechs neu angelegte Datensätze

Für sechs der 36 Screenshots gab es in der (mit dem Team geteilten, gehosteten) Datenbank noch keinen passenden Bestand. Nach Rücksprache wurden sechs reale Datensätze über die Anwendung selbst angelegt — keine Rohdaten direkt in die Datenbank geschrieben:

1. **Lieferung + Abholrunde** (Betriebsleitung): Lieferung „Handelskette A", 60 kg, Adresse „Prospekt Abaja 45, Almaty", Tour für Dienstag 22.09.2026 erstellt → für P1-11.
2. **Übergabe bestätigt** (Brigade): Lieferung „Almaty Fresh Market", 45 kg, Empfänger „M. Zhaksybekov", Status auf „zugestellt" gesetzt → für P1-12a/P1-12b.
3. **Vorbestellung** (Kunde „Almaty Fresh Market"): Sorte Kweli, 60 kg, Status „angefragt" → für P2-04.
4. **Reklamation** (Kunde „Almaty Fresh Market"): „Ware bei Anlieferung zu warm", Grund „Menge", Status „offen" (Code `REK-20260921-F402970C`) → für P2-09.
5. **Lohnlauf-Freigabe** (Buchhaltung): Abrechnung von A. Tulegenowa (MAL-0418), Periode 25.08.–31.08.2026, auf „Freigegeben" gesetzt. Die Abrechnung von D. Sarsenbaj (MAL-0417) blieb bewusst im Status „Entwurf", damit der Screenshot der Pflücker-Eigenansicht (P3-08) weiterhin zu seinem echten Kontostand passt → für P3-06.
6. Kein `npm run db:reset` verwendet — dieses Skript existiert nicht im Projekt; das Dashboard läuft entwicklungsseitig gegen das gehostete Supabase-Projekt, nicht gegen eine lokale Instanz (siehe Haupt-`README.md`). Alle Screenshots zeigen daher den echten, aktuellen Datenbestand.

## Ablaufdiagramme

Erzeugt aus den Mermaid-Quellen `bilder/P1_ablauf.mmd`, `bilder/P2_ablauf.mmd`, `bilder/P3_ablauf.mmd` (je eine Schwimmbahn pro Rolle) mit `@mermaid-js/mermaid-cli`, exportiert als `bilder/P1_ablauf.png`, `P2_ablauf.png`, `P3_ablauf.png`.

## Videos

Die Video-Walkthroughs (`docs/prozesse/video/`) sind nicht Teil dieser Dokumentation und nicht Teil dieses Pull Requests — Videodateien werden nicht in Git eingecheckt.
