"""Phase 4: geprüfte Rohfunde zu den Ergebnisdateien zusammenführen.

Liest pruefung/*.geprueft.json (Fallback: rohfunde/*.json) und schreibt
  01-suchbegriffe.md, 02-quellenkarte.md, 03-belegregister.json,
  04-luecken-und-fragen.md, 05-fragen-pruefer.ru.md, pruefung/kennzahlen.json
"""
import glob, json, os
from collections import Counter, defaultdict

HIER = os.path.dirname(os.path.abspath(__file__))
BASIS = os.path.dirname(HIER)
FRAGEN = ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11"]

dateien = sorted(glob.glob(os.path.join(BASIS, "pruefung", "*.geprueft.json"))) or sorted(glob.glob(os.path.join(BASIS, "rohfunde", "*.json")))
daten = [json.load(open(f, encoding="utf-8")) for f in dateien]


def w(name, text):
    open(os.path.join(BASIS, name), "w", encoding="utf-8", newline="\n").write(text)


# Belegregister
belege = []
gesehen = set()
for d in daten:
    for x in d.get("belege", []):
        x = dict(x)
        x.setdefault("agent", d.get("agent"))
        if x["id"] in gesehen:
            x["id"] = x["id"] + "-" + d.get("agent", "x")[0]
        gesehen.add(x["id"])
        belege.append(x)
json.dump({"stand": "2026-09-18", "anzahl": len(belege), "belege": belege}, open(os.path.join(BASIS, "03-belegregister.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

# Suchbegriffe
t = ["# Suchbegriffe je Agent und Sprache\n", "Stand 18.09.2026. Erzeugt aus `rohfunde/`.\n"]
for d in daten:
    t.append(f"\n## {d.get('agent')} ({', '.join(d.get('fragen', []))})\n")
    for sp, name in [("ru", "Russisch"), ("kk", "Kasachisch"), ("en", "Englisch")]:
        liste = d.get("suchbegriffe", {}).get(sp, [])
        if liste:
            t.append(f"\n**{name}:** " + " · ".join(liste) + "\n")
    runden = d.get("suchrunden", [])
    t.append(f"\nSuchrunden: {len(runden)}, davon mit neuer Rang-1-Quelle: {sum(1 for r in runden if (r.get('neue_rang1') or 0) > 0)}\n")
w("01-suchbegriffe.md", "".join(t))

# Quellenkarte
quellen = {}
for d in daten:
    for q in d.get("quellen", []):
        k = q.get("url")
        if k and k not in quellen:
            quellen[k] = dict(q, agent=d.get("agent"))
t = ["# Quellenkarte\n", "\nStand 18.09.2026. Alle von den Agenten genutzten Quellen, nach Rang.\n"]
for rang in (1, 2, 3):
    qs = [q for q in quellen.values() if q.get("rang") == rang]
    t.append(f"\n## Rang {rang} ({len(qs)})\n\n| Titel | Kennung | Status | Fassung | Quelle |\n|---|---|---|---|---|\n")
    for q in sorted(qs, key=lambda q: q.get("titel", "")):
        t.append(f"| {q.get('titel','').replace('|','/')} | {q.get('adilet_id','')} | {q.get('status','')} | {q.get('fassung_stand','')} | {q.get('url')} |\n")
w("02-quellenkarte.md", "".join(t))

# Lücken und Fragen
t = ["# Lücken und offene Fragen\n", "\nStand 18.09.2026.\n\n## Lücken aus der Recherche\n\n| Frage | Grund |\n|---|---|\n"]
for d in daten:
    for l in d.get("luecken", []):
        t.append(f"| {l.get('frage')} | {l.get('grund','').replace('|','/')} |\n")
t.append("\n## Belege, die am amtlichen Text nicht bestätigt wurden\n\n| ID | Frage | Aussage | Vermerk |\n|---|---|---|---|\n")
for x in belege:
    if x.get("verifiziert") != "primaer":
        t.append(f"| {x['id']} | {x.get('frage')} | {x.get('aussage','').replace('|','/')} | {x.get('verifiziert')}: {x.get('pruefvermerk','')} |\n")
t.append("\n## Änderungen in Arbeit (F10)\n\n")
for d in daten:
    for a in d.get("aenderungen_in_arbeit", []):
        t.append(f"- {a.get('titel')} ({a.get('status','')}): {a.get('url','')}\n")
w("04-luecken-und-fragen.md", "".join(t))

# Fragen an den Prüfer, russisch
t = ["# Вопросы к аудитору / юристу в Республике Казахстан\n", "\nПодготовлено 18.09.2026 в рамках исследования «Аудит в Казахстане» (проект Damicon).\n"]
n = 0
for d in daten:
    for f in d.get("fragen_pruefer", []):
        n += 1
        t.append(f"\n**{n}.** {f.get('frage_ru')}\n\n*Основание:* {f.get('bezug','')}  \n*DE:* {f.get('frage_de','')}\n")
w("05-fragen-pruefer.ru.md", "".join(t))

# Kennzahlen
pro_frage = defaultdict(Counter)
for x in belege:
    for fr in str(x.get("frage", "")).replace(" ", "").split(","):
        pro_frage[fr][x.get("verifiziert")] += 1
rang1_quellen = Counter()
for d in daten:
    rang1_quellen[d.get("agent")] = sum(1 for q in d.get("quellen", []) if q.get("rang") == 1)
kz = {
    "belege": len(belege),
    "primaer": sum(1 for x in belege if x.get("verifiziert") == "primaer"),
    "anteil_primaer": round(sum(1 for x in belege if x.get("verifiziert") == "primaer") / max(1, len(belege)), 3),
    "fragen_mit_primaerbeleg": [f for f in FRAGEN if pro_frage[f]["primaer"] > 0],
    "pro_frage": {f: dict(pro_frage[f]) for f in FRAGEN},
    "rang1_quellen_je_agent": dict(rang1_quellen),
    "quellen_gesamt": len(quellen),
    "suchrunden": sum(len(d.get("suchrunden", [])) for d in daten),
}
json.dump(kz, open(os.path.join(BASIS, "pruefung", "kennzahlen.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(json.dumps(kz, ensure_ascii=False, indent=1))
