# Konfliktregister Steuern und Handel

Jeder Widerspruch zwischen Quellen wird hier festgehalten, nicht gemittelt und nicht stillschweigend aufgeloest.

**Aufloesungsregel:** Ein Konflikt gilt nur dann als geklaert, wenn ein Artikel des Steuerkodex 214-VIII auf adilet.zan.kz oder eine amtliche Veroeffentlichung des KGD ihn entscheidet. Zwei uebereinstimmende Sekundaerquellen klaeren nichts, sie wiederholen einander oft nur.

**Status:** OFFEN, GEKLAERT, oder BERATERFRAGE (ungeklaert und an einen bezahlten Berater zu geben).

Stand: 2026-09-18

---

## K-01 Welches Regime ersetzt den einheitlichen Bodensteuer fuer КХ/ФХ

**Status:** OFFEN
**Blockiert:** die gesamte Einkommensbesteuerung des Betriebs, fuer den dieses System gebaut wird. Ueber die Definition der Bemessungsgrundlage haengt zusaetzlich daran, ob das Hauptbuch ueberhaupt eine Aufwandsklassifikation braucht.

Der einheitliche Bodensteuer (единый земельный налог) ist zum 2026-01-01 abgeschafft. Was an seine Stelle tritt, geben zwei Quellen unterschiedlich an:

| Fassung | Angabe | Quelle | Sprache |
|---|---|---|---|
| A | ИПН 0,5 Prozent vom Einkommen fuer Bauern- und Farmbetriebe | mybuh.kz, cdb.kz | ru |
| B | 10 Prozent bis 230.000 МРП, darueber 15 Prozent | b2b.telecom.kz, weitere kasachischsprachige Quellen | kk |

Beide koennen nicht gleichzeitig fuer denselben Sachverhalt gelten. Moegliche Aufloesungen, die zu pruefen sind: die Angaben betreffen verschiedene Steuerpflichtige (ИП gegenueber КХ/ФХ), verschiedene Regime, oder verschiedene Bemessungsgrundlagen.

**Was eine hinreichende Antwort leistet:** Artikelnummer im Kodex 214-VIII, der Satz, und die genaue Bemessungsgrundlage. Bruttoertrag, Ertrag abzueglich Aufwand, oder eine flaechenbezogene Groesse.

---

## K-02 Welche Sprachfassung des Kodex hat Vorrang

**Status:** OFFEN
**Blockiert:** welche Fassung im Vektorkorpus als kanonisch gilt, und wie der Assistent antwortet, wenn beide Fassungen auseinanderfallen.

`adilet.zan.kz` veroeffentlicht den Steuerkodex in russischer und in kasachischer Fassung. Beide sind amtlich. In der kasachischen Rechtspraxis ist das Auseinanderfallen beider Fassungen ein bekanntes Problem.

Die Frage ist nicht akademisch. Die erste Recherche hat gezeigt, dass russische und kasachische Quellen zu demselben Thema **unterschiedliche Angaben** liefern, siehe K-01.

**Was eine hinreichende Antwort leistet:** eine Regel aus dem Sprachengesetz oder dem Gesetz ueber Rechtsakte, mit Zitat.

---

## K-03 Einkommensteuerstufen, zwei verschiedene Schwellen

**Status:** OFFEN
**Blockiert:** die Lohnabrechnung, und zwar fuer jeden Beschaeftigten.

| Fassung | Angabe | Quelle |
|---|---|---|
| A | Arbeitslohn bis 8.500 МРП zu 10 Prozent, darueber 15 Prozent | PwC, EY |
| B | Einkommen bis 230.000 МРП zu 10 Prozent, darueber 15 Prozent | kasachischsprachige Quellen |
| C | ИПН schlicht 10 Prozent nach Abzug von ОПВ, ВОСМС und 30 МРП | mybuh.kz |

Vermutung, die zu pruefen ist: A betrifft Arbeitseinkommen, B unternehmerisches Einkommen, C beschreibt den Normalfall unterhalb der Schwelle. Wenn das zutrifft, widersprechen sich die Quellen nicht, sondern beschreiben verschiedene Sachverhalte. Das ist eine Vermutung und kein Befund.

**Was eine hinreichende Antwort leistet:** die Artikel, die den Tarif fuer Arbeitseinkommen und fuer unternehmerisches Einkommen getrennt regeln, mit Schwellen und Saetzen.

---

## K-04 Englischsprachige Aggregatoren sind teilweise veraltet

**Status:** GEKLAERT, als Quellenbefund festgehalten
**Folge:** keine englischsprachige Aggregatorseite wird als alleiniger Beleg fuer eine Regel verwendet.

Bei der ersten Recherche fuehrte eine englischsprachige Uebersichtsseite die Mehrwertsteuer fuer 2026 weiterhin mit 12 Prozent, also mit dem bis 2025 geltenden Satz. Der Befund ist kein Einzelfall, sondern ein Muster: englischsprachige Zusammenfassungen laufen der kasachischen Rechtslage hinterher.

Englisch bleibt nuetzlich fuer die Einordnung durch Beratungshaeuser und fuer investorentaugliche Darstellung. Als Rechtsquelle ist es nicht geeignet.

---

## K-05 Kommission oder Eigenhandel im Zukaufmodell

**Status:** OFFEN
**Blockiert:** die Bemessungsgrundlage der Mehrwertsteuer im Zukaufmodul, und damit auch, wann die Registrierungsschwelle von 43.250.000 Tenge ueberschritten wird. Der Unterschied kann Jahre betragen.

Die Abrechnung gegenueber Nachbarbetrieben zahlt dem Lieferanten seinen Wert abzueglich einer einbehaltenen Spanne aus. Das liest sich wie eine Kommission und nicht wie Kauf und Weiterverkauf.

- Als Eigenhaendler ist die Bemessungsgrundlage der **volle Weiterverkaufsumsatz**.
- Als Kommissionaer ist sie **nur die einbehaltene Spanne**.

**Was eine hinreichende Antwort leistet:** die Abgrenzungskriterien aus dem Kodex mit Artikelnummer, die Umsatzbestimmung je Fall, und die Anforderungen an die Rechnungsstellung im Kommissionsfall.

---

## Vorlage fuer neue Eintraege

```
## K-NN Kurzbezeichnung

**Status:** OFFEN | GEKLAERT | BERATERFRAGE
**Blockiert:** welche Entscheidung ohne diese Antwort nicht getroffen werden kann

| Fassung | Angabe | Quelle | Sprache |
|---|---|---|---|

**Was eine hinreichende Antwort leistet:** ...
**Aufloesung:** Artikel, Datum, Fundstelle. Nur ausfuellen, wenn Primaerrecht oder KGD entscheidet.
```
