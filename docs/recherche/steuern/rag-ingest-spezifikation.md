# RAG-Ingest-Spezifikation

Vertrag fuer die Aufnahme des Steuer- und Handelskorpus in die Vektordatenbank.

Stand: 2026-09-18. Wer dieses Dokument aendert, aktualisiert auch `quellenregister-schema.yaml`.

## Warum dieses Dokument zuerst entsteht

Kasachstan hat sein Steuerrecht zum 1. Januar 2026 vollstaendig ersetzt, Kodex Nr. 214-VIII vom 18. Juli 2025. Nahezu jede Veroeffentlichung von vor 2026 ist damit inhaltlich ueberholt, und das gilt auch fuer das Trainingswissen jedes Sprachmodells, dessen Datenbasis aelter ist.

Daraus folgt das groesste Risiko dieses Vorhabens, und es ist kein Rechercherisiko, sondern ein Datenrisiko: gelangt Material von vor 2026 unmarkiert in denselben Index wie das geltende Recht, antwortet der Assistent mit Ueberzeugung "die Mehrwertsteuer betraegt 12 Prozent". Die Antwort waere gut belegt, fluessig formuliert und falsch.

Die zeitliche Kennzeichnung ist deshalb kein Metadatenkomfort. Sie ist die tragende Eigenschaft des Korpus.

## Zielsystem

Der Korpus laeuft in pgvector innerhalb der bestehenden Supabase-Instanz. Es kommt keine neue Infrastruktur hinzu. Abnehmer ist das vorhandene Modul `ki_assistent` ueber `src/lib/ai/anbieter-client.ts` und die Tabelle `ki_anbieter`.

## Schnitt der Abschnitte

Ein Abschnitt ist die kleinste Einheit, die fuer sich allein verstaendlich bleibt und eine eigene Fundstelle traegt.

| Quellenart | Schnitt | Begruendung |
|---|---|---|
| Kodex, Gesetz | ein Artikel, bei langen Artikeln ein Punkt | Die Fundstelle ist die Zitierweise, nach der auch Praktiker suchen |
| Untergesetzlicher Akt | ein Paragraph oder eine Regelziffer | dito |
| Amtliche Erlaeuterung | eine Frage mit ihrer Antwort | Die Frage ist bereits die Suchanfrage |
| Praktikerartikel | ein Abschnitt unter seiner Ueberschrift | Ueberschriften tragen hier die Struktur |
| Formular, Schema | ein Feld mit seiner Beschreibung | Feldweise Abfrage ist der spaetere Anwendungsfall |
| Forum, Telegram | ein Thread | Einzelbeitraege verlieren ohne Frage ihren Sinn |

Abschnitte werden nicht ueber Artikelgrenzen hinweg zusammengefasst, auch wenn sie kurz sind. Ein zu kurzer Abschnitt ist harmlos, ein Abschnitt mit zwei Fundstellen ist unbrauchbar.

## Pflichtfelder je Abschnitt

```json
{
  "chunk_id": "adilet-nk-214-viii-rus#st208-p3",
  "quelle_id": "adilet-nk-214-viii-rus",
  "norm_id": "nk-214-viii-st208-p3",
  "sprache": "ru",
  "autoritaetsstufe": 1,
  "rechtsstelle": "НК РК ст. 208 п. 3",
  "thema": ["esf", "mwst"],
  "gueltig_ab": "2026-01-01",
  "gueltig_bis": null,
  "ist_ueberholt": false,
  "ersetzt_durch": null,
  "abgerufen_am": "2026-09-18",
  "url": "https://adilet.zan.kz/rus/docs/K2500000214",
  "text_original": "...",
  "konfidenz": "bestaetigt"
}
```

`konfidenz` kennt drei Werte: `bestaetigt` wenn durch Primaerrecht gedeckt, `unbestaetigt` wenn nur eine Sekundaerquelle vorliegt, `strittig` wenn Quellen sich widersprechen. Ein `strittig` markierter Abschnitt hat immer einen Eintrag im Konfliktregister.

## Vier Regeln, die beim Ingest erzwungen werden

**1. Zeitliche Sperre.** `gueltig_ab` ist Pflicht. Abschnitte mit `ist_ueberholt = true` werden aus der Standardsuche ausgeschlossen und nur erreichbar, wenn ausdruecklich nach dem historischen Stand gefragt wird. Der Kodex von 2017 wird ausschliesslich fuer den Fassungsvergleich aufgenommen und ist immer als ueberholt markiert.

**2. Sprachverbund.** `norm_id` verbindet die russische und die kasachische Fassung derselben Norm. Beide Fassungen sind amtlich. Die Abfrage kann dadurch gegenpruefen statt zu raten, und ein Auseinanderfallen beider Fassungen wird sichtbar statt verborgen zu bleiben.

**3. Rangfolge vor Aehnlichkeit.** Bei inhaltlich konkurrierenden Treffern gewinnt die niedrigere `autoritaetsstufe`, nicht der hoehere Vektorabstand. Ein gut formulierter Blogbeitrag darf einen Gesetzesartikel nicht verdraengen.

**4. Kein Abschnitt ohne Fundstelle.** Bei Stufe 1 und 2 ist `rechtsstelle` Pflicht. Ohne sie kann die Antwort nicht belegt werden, und eine unbelegbare Steuerauskunft ist schlechter als keine.

## Abnahme

Der Korpus gilt als aufnahmefaehig, wenn die Probeabfrage "Wie hoch ist die Mehrwertsteuer?" in allen vier Sprachen 16 Prozent beantwortet und dabei eine Quelle mit `gueltig_ab` ab 2026-01-01 zitiert. Antwortet das System mit 12 Prozent, hat die zeitliche Sperre versagt, und der Fehler liegt nicht im Modell, sondern in diesem Vertrag.

## Was diese Spezifikation nicht regelt

Sie legt weder Einbettungsmodell noch Abstandsmass noch Abschnittsgroesse in Token fest. Diese Entscheidungen haengen am spaeteren Betrieb und werden getroffen, wenn der Korpus steht. Sie regelt auch keine Zugriffsrechte: welche Rolle welchen Teil des Korpus sehen darf, gehoert zu `src/lib/rbac.ts` und ist hier bewusst offen gelassen.
