"""Bericht „Audit in Kasachstan“ als eigenständige HTML-Datei in WAMOCON-CI.

CI laut Dokumentbaukasten (wmc-dokument.mjs): Anthrazit #101010, Signalrot
#F40E0E (nur Flächen und Marken), Rot für Text #D40000 (5,5:1 auf Weiß),
Linie #545454, Zebrazeile #F4F4F4, Fließtext #3C3C3C, Schrift Segoe UI.

Liest 03-belegregister.json, pruefung/kennzahlen.json, bericht/inhalt.json
und schreibt bericht/audit-kasachstan-bericht.html.
"""
import html, json, os, re
from collections import defaultdict

HIER = os.path.dirname(os.path.abspath(__file__))
BASIS = os.path.dirname(HIER)
reg = json.load(open(os.path.join(BASIS, "03-belegregister.json"), encoding="utf-8"))["belege"]
kz = json.load(open(os.path.join(BASIS, "pruefung", "kennzahlen.json"), encoding="utf-8"))
inhalt = json.load(open(os.path.join(BASIS, "bericht", "inhalt.json"), encoding="utf-8"))
adilet = json.load(open(os.path.join(BASIS, "pruefung", "adilet-pruefung.json"), encoding="utf-8"))

e = lambda s: html.escape(str(s or ""))


def md(s):
    """Minimal: **fett**, `code`, Links."""
    s = e(s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"`(.+?)`", r"<code>\1</code>", s)
    return s


STATUS = {"primaer": ("am Primärtext bestätigt", "ok"), "nur_sekundaer": ("nur Sekundärquelle", "mittel"),
          "widerspruch": ("Widerspruch", "rot"), "offen": ("offen", "mittel"), "aufgehoben": ("Norm aufgehoben", "rot")}
EINST = {"pflicht": "Pflicht", "empfehlung": "Empfehlung", "unklar": "unklar"}

nach_frage = defaultdict(list)
for x in reg:
    for f in re.split(r"[,\s/]+", str(x.get("frage", ""))):
        if f:
            nach_frage[f].append(x)


def beleg_tabelle(liste):
    zeilen = []
    for x in liste:
        st, klasse = STATUS.get(x.get("verifiziert"), (x.get("verifiziert"), "mittel"))
        url = x.get("quelle_url") or ""
        quelle = f'<a href="{e(url)}">{e(x.get("dokument") or url)[:90]}</a>' if url.startswith("http") else e(x.get("dokument") or url)
        zeilen.append(
            f"<tr><td class='mono'>{e(x['id'])}</td><td>{md(x.get('aussage'))}"
            f"<details><summary>Wortlaut und Folge</summary><blockquote lang='ru'>{e(x.get('wortlaut_original'))}</blockquote>"
            f"<p><strong>Folge für Damicon:</strong> {md(x.get('damicon_folge'))}</p></details></td>"
            f"<td>{quelle}<br><span class='klein'>{e(x.get('fundstelle'))}</span></td>"
            f"<td><span class='marke {klasse}'>{st}</span><br><span class='klein'>{EINST.get(x.get('einstufung'), '')} · {e(x.get('rechtsform'))}</span></td></tr>")
    return ("<table class='belege'><thead><tr><th>ID</th><th>Aussage</th><th>Quelle</th><th>Stand</th></tr></thead><tbody>"
            + "".join(zeilen) + "</tbody></table>")


teile = []
# Auf einen Blick
teile.append("<section id='blick'><h2>1 Auf einen Blick</h2>" + "".join(f"<p>{md(p)}</p>" for p in inhalt["blick_text"]))
teile.append("<table class='blick'><thead><tr><th>Prüfung</th><th>Trifft den Betrieb?</th><th>Einstufung</th><th>Was zu tun ist</th></tr></thead><tbody>")
for z in inhalt["blick"]:
    klasse = {"Pflicht": "rot", "Empfehlung": "mittel", "unklar": "grau", "nein": "ok"}.get(z["einstufung"], "grau")
    teile.append(f"<tr><td><strong>{e(z['pruefung'])}</strong></td><td>{md(z['trifft'])}</td><td><span class='marke {klasse}'>{e(z['einstufung'])}</span></td><td>{md(z['tun'])}</td></tr>")
teile.append("</tbody></table></section>")

# Folgen für Damicon
teile.append("<section id='damicon'><h2>2 Folgen für Damicon</h2><p>" + md(inhalt["damicon_text"]) + "</p>")
for gruppe in inhalt["damicon"]:
    teile.append(f"<h3>{e(gruppe['titel'])}</h3><ul>" + "".join(f"<li>{md(p)}</li>" for p in gruppe["punkte"]) + "</ul>")
teile.append("</section>")

# Ergebnisse je Frage
teile.append("<section id='fragen'><h2>3 Ergebnisse je Forschungsfrage</h2>")
for f in inhalt["fragen"]:
    liste = nach_frage.get(f["id"], [])
    n_p = sum(1 for x in liste if x.get("verifiziert") == "primaer")
    teile.append(f"<article id='{f['id']}'><h3><span class='fid'>{f['id']}</span> {e(f['titel'])}</h3>"
                 f"<p class='antwort'>{md(f['antwort'])}</p><p class='klein'>{len(liste)} Belege, davon {n_p} am Primärtext bestätigt</p>"
                 + (beleg_tabelle(liste) if liste else "") + "</article>")
teile.append("</section>")

# Behörden
teile.append("<section id='behoerden'><h2>4 Wer prüft was</h2><table class='blick'><thead><tr><th>Behörde / Stelle</th><th>Prüfliste bzw. Grundlage</th><th>Prüfpunkte für den Betrieb</th><th>Bußgeldrahmen</th></tr></thead><tbody>")
for b in inhalt["behoerden"]:
    teile.append(f"<tr><td><strong>{e(b['stelle'])}</strong></td><td>{md(b['grundlage'])}</td><td>{md(b['punkte'])}</td><td>{md(b['bussgeld'])}</td></tr>")
teile.append("</tbody></table></section>")

# Aufgehobene Normen
aufgeh = [(k, v) for k, v in adilet.items() if v.get("status") == "aufgehoben"]
teile.append("<section id='aufgehoben'><h2>5 Aufgehobene Normen</h2><p>Diese Rechtsakte tauchen in Sekundärquellen oder früheren Unterlagen noch als geltend auf. Laut adilet sind sie aufgehoben und dürfen nicht mehr als Grundlage dienen.</p><table class='belege'><thead><tr><th>Kennung</th><th>Vermerk auf adilet</th></tr></thead><tbody>")
for k, v in sorted(aufgeh):
    teile.append(f"<tr><td class='mono'><a href='https://adilet.zan.kz/rus/docs/{e(k)}'>{e(k)}</a></td><td lang='ru'>{e(v.get('status_beleg'))}</td></tr>")
teile.append("</tbody></table></section>")

# Lücken
teile.append("<section id='luecken'><h2>6 Lücken und Fragen an den Prüfer vor Ort</h2>" + "".join(f"<p>{md(p)}</p>" for p in inhalt["luecken_text"]) + "<ul>" + "".join(f"<li>{md(p)}</li>" for p in inhalt["luecken"]) + "</ul><p>Die vollständige Fragenliste auf Russisch steht in <code>05-fragen-pruefer.ru.md</code>.</p></section>")

# Methode und Kennzahlen
ziel = inhalt["kennzahlen_ziel"]
teile.append("<section id='methode'><h2>7 Methode und Kennzahlen</h2>" + "".join(f"<p>{md(p)}</p>" for p in inhalt["methode"]))
teile.append("<table class='blick'><thead><tr><th>Kennzahl</th><th>Ziel</th><th>Erreicht</th></tr></thead><tbody>")
for z in ziel:
    teile.append(f"<tr><td>{e(z[0])}</td><td>{e(z[1])}</td><td><strong>{e(z[2])}</strong></td></tr>")
teile.append("</tbody></table></section>")

CSS = """
:root{--anthrazit:#101010;--rot:#F40E0E;--rottext:#D40000;--linie:#545454;--zeile:#F4F4F4;--text:#3C3C3C;--kopf:#6B6B6B;--hell:#C8C8C8;--rothell:#FBEAEA;--gitter:#D6D6D6;--mittel:#8D8D8D;--weiss:#fff}
*{box-sizing:border-box}
body{margin:0;background:var(--weiss);color:var(--text);font:15px/1.55 "Segoe UI",system-ui,-apple-system,sans-serif}
a{color:var(--rottext)} code,.mono{font-family:Consolas,ui-monospace,monospace;font-size:.92em}
.deckblatt{background:var(--anthrazit);color:var(--weiss);padding:56px 16px 40px}
.deckblatt .innen,.inhalt{max-width:1080px;margin:0 auto}
.deckblatt .marke-wmc{font-weight:700;letter-spacing:.14em;font-size:13px}
.deckblatt .marke-wmc span{color:var(--rot)}
.deckblatt h1{font-size:clamp(28px,5vw,44px);line-height:1.15;margin:28px 0 10px;font-weight:700}
.deckblatt .unter{font-size:18px;color:var(--hell);max-width:60ch}
.deckblatt .balken{height:6px;width:96px;background:var(--rot);margin:26px 0}
.deckblatt dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 18px;font-size:14px;color:var(--hell);margin:0}
.deckblatt dt{color:var(--weiss);font-weight:600}
nav.toc{border-bottom:1px solid var(--linie);padding:14px 16px;position:sticky;top:0;background:var(--weiss);z-index:2}
nav.toc .inhalt{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:13.5px;padding:0}
section,article{scroll-margin-top:72px}
td.mono{white-space:nowrap}
nav.toc a{color:var(--anthrazit);text-decoration:none;font-weight:600}
nav.toc a:hover{color:var(--rottext)}
.inhalt{padding:0 16px 64px}
h2{color:var(--anthrazit);font-size:26px;margin:48px 0 14px;padding-top:10px;border-top:3px solid var(--anthrazit)}
h2::before{content:"";display:inline-block;width:10px;height:10px;background:var(--rot);margin-right:10px;vertical-align:middle}
h3{color:var(--anthrazit);font-size:18px;margin:28px 0 8px}
.fid{display:inline-block;background:var(--rottext);color:#fff;font-size:13px;padding:1px 8px;margin-right:6px;border-radius:2px}
.antwort{background:var(--zeile);border-left:4px solid var(--anthrazit);padding:10px 14px;margin:8px 0}
table{width:100%;border-collapse:collapse;border-top:1.5px solid var(--linie);border-bottom:1.5px solid var(--linie);margin:10px 0 18px;font-size:14px}
th{background:var(--anthrazit);color:#fff;text-align:left;font-weight:600;padding:8px 10px}
td{padding:8px 10px;border-top:1px solid var(--gitter);vertical-align:top}
tbody tr:nth-child(even){background:var(--zeile)}
.klein{font-size:12.5px;color:var(--kopf)}
.marke{display:inline-block;font-size:12px;font-weight:700;padding:2px 8px;border-radius:2px;white-space:nowrap}
.marke.ok{background:#E8F3EC;color:#1E6B3A}.marke.rot{background:var(--rothell);color:var(--rottext)}.marke.mittel{background:#F1F1F1;color:#4A4A4A;border:1px solid var(--mittel)}.marke.grau{background:#fff;color:var(--kopf);border:1px solid var(--hell)}
details summary{cursor:pointer;color:var(--kopf);font-size:12.5px;margin-top:4px}
blockquote{margin:6px 0;padding:6px 10px;border-left:3px solid var(--hell);font-size:13px;color:#2a2a2a;background:#fff}
.scroll{overflow-x:auto}
footer{border-top:1px solid var(--linie);padding:16px;font-size:12.5px;color:var(--kopf)}
footer .inhalt{padding:0}
@media (max-width:700px){table,thead,tbody,tr,td,th{font-size:13px} th:nth-child(3),td:nth-child(3){min-width:120px}}
@media print{nav.toc{position:static}.deckblatt{-webkit-print-color-adjust:exact;print-color-adjust:exact}details{display:block}details>*{display:block}h2{break-before:page}}
"""

TOC = [("blick", "Auf einen Blick"), ("damicon", "Folgen für Damicon"), ("fragen", "Ergebnisse je Frage"), ("behoerden", "Wer prüft was"),
       ("aufgehoben", "Aufgehobene Normen"), ("luecken", "Lücken"), ("methode", "Methode")]
seite = f"""<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Audit in Kasachstan</title><style>{CSS}</style></head><body>
<header class="deckblatt"><div class="innen"><div class="marke-wmc">WAMOCON<span>.</span></div>
<h1>Audit in Kasachstan</h1><p class="unter">Research-Bericht: Welche Prüfungen einen Beerenbetrieb treffen, wer prüft, auf welcher Rechtsgrundlage, und was daraus für Damicon folgt.</p>
<div class="balken"></div><dl><dt>Projekt</dt><dd>Damicon · Drei-Tage-Board, Karten audit-01 bis audit-18</dd><dt>Stand</dt><dd>{e(inhalt['stand'])}</dd>
<dt>Version</dt><dd>{e(inhalt['version'])}</dd><dt>Grundlage</dt><dd>Research-Plan v0.3, {kz['belege']} Belege, {kz['quellen_gesamt']} Quellen</dd>
<dt>Hinweis</dt><dd>Keine Rechtsberatung. Freigabe durch einen in Kasachstan zugelassenen Prüfer oder Anwalt (audit-17) steht aus.</dd></dl></div></header>
<nav class="toc"><div class="inhalt">{''.join(f'<a href="#{i}">{t}</a>' for i, t in TOC)}</div></nav>
<main class="inhalt"><div class="scroll">{''.join(teile)}</div></main>
<footer><div class="inhalt">WAMOCON · Damicon · Research Audit Kasachstan · {e(inhalt['stand'])} · Daten: <code>docs/Research/audit-kasachstan/</code></div></footer>
</body></html>"""
os.makedirs(os.path.join(BASIS, "bericht"), exist_ok=True)
open(os.path.join(BASIS, "bericht", "audit-kasachstan-bericht.html"), "w", encoding="utf-8").write(seite)
print("ok", len(seite))
