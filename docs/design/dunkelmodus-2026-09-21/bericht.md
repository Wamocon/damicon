# Dunkelmodus nach dem Boxen-Umbau

Stand 21.09.2026. Geprüft mit Rolle Betriebsleitung, 1600 px, `damicon-theme=dark`, auf Startseite, Bereichsseite Büro, Modulseite Standorte und Modulseite Deckungsbeitrag. Keine Konsolenfehler.

## Was trägt

- Text ist durchgehend gut lesbar. Überschrift auf Kartengrund: **15,24:1**. Der gedämpfte Text (`--muted-foreground` #9ab8c1 auf #081e26) liegt bei rund **7,9:1** — auch für die 10-px-Zeilen in der Kennzahlbox deutlich über den 4,5:1, die WCAG AA verlangt.
- Statuspillen, Zielbänder, Trendpfeile und die Ampelfarben sind klar unterscheidbar: Rot (#fb7185), Grün (#5ecfa0) und Gelb (#e8b34a) heben sich alle vom Grund ab.
- Tabellen, Formulare und die Modulkacheln der Bereichsseite sind vollständig lesbar.
- Die Seitenleiste steht bündig zur Kopfzeile, wie im hellen Modus.

## Ein Befund

**Die drei Ebenen des Boxensystems sind im Dunkelmodus flächengleich.**

Gemessen (effektive Farbe nach Alpha-Überlagerung, nicht die deklarierte):

| Ebene | Farbe | Kontrast zur Ebene darüber |
|---|---|---|
| Seitengrund | `#04161c` | — |
| Abschnittsbox (`bg-card`) | `#081e26` | 1,08:1 |
| Inhaltskarte (`bg-muted/20`) | `#081e26` | **1,00:1** |
| Datenbox (`bg-card`) | `#081e26` | **1,00:1** |

Der Grund: `--muted` ist im Dunkelmodus selbst schon halbtransparent (`rgba(12,41,51,0.58)`). Mit den weiteren 20 Prozent aus `bg-muted/20` bleiben rund 12 Prozent Deckkraft einer Farbe, die dem Untergrund ohnehin gleicht. Im hellen Modus ist `--muted` deckend (`#eaf2f4`) und ergibt den sichtbaren Grauton.

Die Folge ist keine Unlesbarkeit: Die Struktur trägt der Rahmen (`rgba(255,255,255,0.09)`), und die Seiten sehen aufgeräumt aus. Aber die Regel, auf der das System steht — Grund und Schatten nehmen nach innen ab —, gilt im Dunkelmodus nicht. Dort liegen drei Ebenen auf derselben Fläche.

## Was die Behebung wäre

Im Dunkelmodus hebt man eine Fläche durch Aufhellen ab, nicht durch Abdunkeln. Ein eigenes Token statt `bg-muted/20`:

```css
/* :root */   --flaeche-innen: #f3f7f8;               /* etwas dunkler als --card */
/* .dark */   --flaeche-innen: rgba(255, 255, 255, 0.045);  /* etwas heller als --card */
```

registriert unter `@theme` als `--color-flaeche-innen`, dann in `kit.tsx` `kartenTon.innen` auf `bg-flaeche-innen` und in `zone-page-body.tsx` die Modulkachel entsprechend. Drei Dateien, und beide Modi tragen dieselbe Abstufung.

Nicht umgesetzt — der Auftrag war die Prüfung.

## Nicht geprüft

- Die öffentlichen Seiten (Landingpage, Herkunft) im Dunkelmodus.
- Das Verhalten bei `prefers-color-scheme: dark` ohne gesetzten Speicherwert; hier stand `damicon-theme` auf `dark`.
