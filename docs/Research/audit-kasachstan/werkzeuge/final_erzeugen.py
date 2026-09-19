"""Finales Dokument „Audit in Kasachstan“ (Runde 1 + Widerlegungsrunde) in WAMOCON-CI.

Schreibt
  final/audit-kasachstan-final.html   Dokument
  final/audit-kasachstan-daten.json   alle Daten in einer Datei
Die PDF-Fassung erzeugt der gstack-Browser (siehe README).
"""
import glob, html, json, os, re
from collections import Counter

HIER = os.path.dirname(os.path.abspath(__file__))
BASIS = os.path.dirname(HIER)
FINAL = os.path.join(BASIS, "final")
e = lambda s: html.escape(str(s or ""))


def md(s):
    s = e(s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    return re.sub(r"`(.+?)`", r"<code>\1</code>", s)


inhalt = json.load(open(os.path.join(FINAL, "inhalt-final.json"), encoding="utf-8"))
runde1 = json.load(open(os.path.join(BASIS, "03-belegregister.json"), encoding="utf-8"))["belege"]
kz1 = json.load(open(os.path.join(BASIS, "pruefung", "kennzahlen.json"), encoding="utf-8"))
w = [json.load(open(f, encoding="utf-8")) for f in sorted(glob.glob(os.path.join(BASIS, "widerlegung", "geprueft", "W*.json")))]
pruef = [dict(p, agent=d["agent"]) for d in w for p in d.get("pruefungen", [])]
neu = [dict(n, agent=d["agent"]) for d in w for n in d.get("neue_fakten", [])]
familien = Counter()
for d in w:
    familien.update(d.get("quellenfamilien_genutzt", {}))
urteile = Counter(p["urteil"] for p in pruef)
neu_amtlich = sum(1 for n in neu if n.get("zitat_amtlich"))

# CSS aus dem Bericht von Runde 1 übernehmen, damit beide Dokumente gleich aussehen
css = re.search(r'CSS = """(.*?)"""', open(os.path.join(HIER, "bericht_erzeugen.py"), encoding="utf-8").read(), re.S).group(1)
css += """
.kacheln{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:14px 0 22px}
.kachel{border-top:4px solid var(--anthrazit);background:var(--zeile);padding:12px 14px}
.kachel b{display:block;font-size:30px;line-height:1.1;color:var(--anthrazit)}
.kachel.rot{border-top-color:var(--rot)} .kachel.rot b{color:var(--rottext)}
.kachel span{font-size:13px;color:var(--kopf)}
.prio{display:inline-block;width:26px;height:26px;line-height:26px;text-align:center;background:var(--anthrazit);color:#fff;font-weight:700;border-radius:2px}
.marke.neu{background:var(--anthrazit);color:#fff}
.tabelle{overflow-x:auto;-webkit-overflow-scrolling:touch}
.hinweis{background:var(--rothell);border-left:4px solid var(--rot);padding:10px 14px}
"""
STATUS = {"bestätigt": "ok", "bestaetigt": "ok", "eingeschränkt": "mittel", "eingeschraenkt": "mittel", "widerlegt": "rot", "unentschieden": "grau", "neu": "neu"}
LABEL = {"bestaetigt": "bestätigt", "eingeschraenkt": "eingeschränkt", "widerlegt": "widerlegt", "unentschieden": "unentschieden"}
AGENT = {"W1": "Rechnungslegung, Belege", "W2": "Steuer, Zoll", "W3": "Behörden", "W4": "Förderung, Zertifizierung", "W5": "Blinde Flecken"}

t = []
# 1 Fazit
kacheln = [(str(len(pruef)), "Aussagen angegriffen", ""), (str(urteile.get("widerlegt", 0)), "widerlegt", "rot"),
           (str(urteile.get("eingeschraenkt", 0)), "eingeschränkt", ""), (str(urteile.get("bestaetigt", 0)), "bestätigt", ""),
           (str(len(neu)), "neue Fakten", ""), (str(neu_amtlich), "davon im amtlichen Text", ""),
           (f"{kz1['primaer'] + neu_amtlich}", "Belege am Gesetzestext", ""), ("21.09.", "Frist Datenschutz", "rot")]
t.append("<section id='fazit'><h2>1 Ergebnis</h2><div class='kacheln'>" + "".join(
    f"<div class='kachel {k}'><b>{e(z)}</b><span>{e(l)}</span></div>" for z, l, k in kacheln) + "</div>")
t.append("".join(f"<p>{md(p)}</p>" for p in inhalt["fazit"][:2]) + f"<p class='hinweis'>{md(inhalt['fazit'][2])}</p></section>")

# 2 Übersicht
t.append("<section id='uebersicht'><h2>2 Finale Übersicht je Prüfbereich</h2><p class='klein'>Bußgelder für Kleinunternehmen in MRP; 1 MRP = 4 325 KZT (2026). Status: Ergebnis der Gegenprobe, „neu“ = erst in Runde 2 gefunden.</p>"
         "<table><thead><tr><th>Bereich</th><th>Trifft?</th><th>Kern</th><th>Bußgeld</th><th>Status</th></tr></thead><tbody>")
for z in inhalt["uebersicht"]:
    t.append(f"<tr><td><strong>{e(z['bereich'])}</strong></td><td>{e(z['trifft'])}</td><td>{md(z['kern'])}</td><td>{e(z['bussgeld'])}</td>"
             f"<td><span class='marke {STATUS.get(z['status'], 'grau')}'>{e(z['status'])}</span></td></tr>")
t.append("</tbody></table></section>")

# 3 Damicon
t.append("<section id='damicon'><h2>3 Was Damicon bauen muss, nach Priorität</h2><table><thead><tr><th>#</th><th>Baustein</th><th>Was</th><th>Grund</th></tr></thead><tbody>")
for z in inhalt["damicon"]:
    t.append(f"<tr><td><span class='prio'>{z['prio']}</span></td><td><strong>{e(z['titel'])}</strong></td><td>{md(z['was'])}</td><td>{md(z['warum'])}</td></tr>")
t.append("</tbody></table></section>")

# 4 Gegenprobe
t.append("<section id='gegenprobe'><h2>4 Gegenprobe: jede angegriffene Aussage</h2><table class='belege'><thead><tr><th>Block</th><th>Aussage aus Runde 1</th><th>Urteil</th><th>Korrektur bzw. Begründung</th></tr></thead><tbody>")
for p in pruef:
    amt = sum(1 for b in p.get("belege", []) if b.get("zitat_amtlich"))
    quellen = "".join(f"<li><a href='{e(b.get('url'))}'>{e((b.get('titel') or b.get('url'))[:80])}</a> <span class='klein'>({e(b.get('familie'))}{', amtlich bestätigt' if b.get('zitat_amtlich') else ''})</span></li>" for b in p.get("belege", []))
    t.append(f"<tr><td class='klein'>{e(AGENT.get(p['agent']))}</td><td>{md(p['aussage'])}</td>"
             f"<td><span class='marke {STATUS.get(p['urteil'], 'grau')}'>{e(LABEL.get(p['urteil'], p['urteil']))}</span><br><span class='klein'>{amt} Zitat(e) amtlich</span></td>"
             f"<td>{md(p.get('korrektur') or p.get('begruendung'))}<details><summary>Belege ({len(p.get('belege', []))})</summary><ul>{quellen}</ul></details></td></tr>")
t.append("</tbody></table></section>")

# 5 Neue Fakten
t.append("<section id='neu'><h2>5 Neue Fakten aus Runde 2</h2><table class='belege'><thead><tr><th>ID</th><th>Thema</th><th>Aussage</th><th>Einstufung</th></tr></thead><tbody>")
for n in neu:
    amt = "<span class='marke ok'>amtlich</span>" if n.get("zitat_amtlich") else "<span class='marke mittel'>sekundär</span>"
    t.append(f"<tr><td class='mono'>{e(n['id'])}</td><td><strong>{e(n.get('thema'))}</strong></td><td>{md(n['aussage'])}"
             f"<details><summary>Rechtsgrundlage und Folge</summary><p><strong>Grundlage:</strong> {e(n.get('rechtsgrundlage'))}</p>"
             f"<blockquote lang='ru'>{e(n.get('zitat'))}</blockquote><p><strong>Folge für Damicon:</strong> {md(n.get('damicon_folge'))}</p>"
             f"<p class='klein'><a href='{e(n.get('url'))}'>{e((n.get('url') or '')[:90])}</a></p></details></td>"
             f"<td>{e(n.get('einstufung'))}<br>{amt}</td></tr>")
t.append("</tbody></table></section>")

# 6 Offen
t.append("<section id='offen'><h2>6 Offene Fragen an den Prüfer vor Ort</h2><ol>" + "".join(f"<li>{md(x)}</li>" for x in inhalt["offen"]) +
         "</ol><p>Dazu kommen die Fragen aus Runde 1 in <code>05-fragen-pruefer.ru.md</code>.</p></section>")

# 7 Methode
t.append("<section id='methode'><h2>7 Methode und Quellen</h2>"
         f"<p><strong>Runde 1 (18.09.2026):</strong> Research-Plan v0.3, vier Agenten in acht Clustern, {kz1['belege']} Belege, davon {kz1['primaer']} Zeichen für Zeichen im amtlichen Text auf adilet bestätigt, zweiter Prüfagent, maschinelle Schlussprüfung. Bericht: <code>bericht/audit-kasachstan-bericht.html</code>.</p>"
         f"<p><strong>Runde 2 (19.09.2026):</strong> Fünf Gegenprüfer sollten die Ergebnisse widerlegen und blinde Flecken suchen, bewusst mit anderen Quellenfamilien. Jedes Zitat mit adilet-Kennung wurde anschließend wieder am amtlichen Text geprüft; alle {len(json.load(open(os.path.join(BASIS, 'widerlegung', 'geprueft', 'uebersicht.json'), encoding='utf-8'))['kennungen'])} zitierten Rechtsakte gelten.</p>"
         "<table><thead><tr><th>Quellenfamilie (Runde 2)</th><th>Treffer</th></tr></thead><tbody>" +
         "".join(f"<tr><td>{e(k)}</td><td>{v}</td></tr>" for k, v in [("Fachpresse (uchet, mybuh, buh.kz, pro1c, zakon.kz …)", familien['fachpresse']), ("Behörden und FAQ (kgd, gov.kz, egov)", familien['behoerde_faq']), ("Kasachisch und Englisch (Weltbank, USDA, OECD …)", familien['kk_en']), ("Kanzleien", familien['kanzlei']), ("Big Four", familien['big4']), ("Atameken", familien['atameken'])]) +
         "</tbody></table><p class='klein'>Grenzen: adilet ist nur im Browser lesbar, Atameken war zeitweise nicht erreichbar, Big Four und Kanzleien lieferten zu Agrarthemen wenig. Keine Rechtsberatung; Freigabe durch einen in Kasachstan zugelassenen Prüfer steht aus.</p></section>")

TOC = [("fazit", "Ergebnis"), ("uebersicht", "Übersicht"), ("damicon", "Damicon"), ("gegenprobe", "Gegenprobe"), ("neu", "Neue Fakten"), ("offen", "Offene Fragen"), ("methode", "Methode")]
seite = f"""<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Audit in Kasachstan – Final</title><style>{css}</style></head><body>
<header class="deckblatt"><div class="innen"><div class="marke-wmc">WAMOCON<span>.</span></div>
<h1>Audit in Kasachstan</h1><p class="unter">Finales Dokument: Ergebnis der Research, Gegenprobe und neue Befunde für einen Beerenbetrieb und die Software Damicon.</p>
<div class="balken"></div><dl><dt>Projekt</dt><dd>Damicon · Drei-Tage-Board, Karten audit-01 bis audit-18</dd><dt>Stand</dt><dd>{e(inhalt['stand'])}</dd>
<dt>Version</dt><dd>{e(inhalt['version'])}</dd><dt>Umfang</dt><dd>{kz1['belege']} Belege Runde 1 · {len(pruef)} Gegenproben · {len(neu)} neue Fakten</dd>
<dt>Hinweis</dt><dd>Keine Rechtsberatung. Freigabe durch einen in Kasachstan zugelassenen Prüfer oder Anwalt (audit-17) steht aus.</dd></dl></div></header>
<nav class="toc"><div class="inhalt">{''.join(f'<a href="#{i}">{x}</a>' for i, x in TOC)}</div></nav>
<main class="inhalt">{''.join(t)}</main>
<footer><div class="inhalt">WAMOCON · Damicon · Audit Kasachstan · Final {e(inhalt['stand'])} · Daten: <code>docs/Research/audit-kasachstan/</code></div></footer>
</body></html>"""
seite = re.sub(r"<table", "<div class='tabelle'><table", seite).replace("</table>", "</table></div>")
open(os.path.join(FINAL, "audit-kasachstan-final.html"), "w", encoding="utf-8").write(seite)

daten = {"stand": inhalt["stand"], "version": inhalt["version"],
         "kennzahlen": {"runde1_belege": kz1["belege"], "runde1_primaer": kz1["primaer"], "gegenproben": dict(urteile),
                        "neue_fakten": len(neu), "neue_fakten_amtlich": neu_amtlich, "quellenfamilien_runde2": dict(familien)},
         "uebersicht": inhalt["uebersicht"], "damicon_prioritaeten": inhalt["damicon"], "offene_fragen": inhalt["offen"],
         "gegenprobe": pruef, "neue_fakten": neu, "belegregister_runde1": runde1}
json.dump(daten, open(os.path.join(FINAL, "audit-kasachstan-daten.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("ok", len(seite), dict(urteile), len(neu), neu_amtlich)
