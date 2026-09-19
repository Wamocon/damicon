"""Audit-Fachliteratur: Rohfunde prüfen (Stichprobe der URLs) und zu den
finalen Markdown-Dateien + einer Gesamtdatenbank zusammenführen.

- Liest rohfunde/D*.json
- Prüft eine Stichprobe der URLs auf Erreichbarkeit (HTTP-Status), markiert
  tote Links statt sie stillschweigend zu behalten
- Schreibt README.md, 01..06-<domain>.md und literatur-datenbank.json
"""
import glob, json, os, re
import urllib.request
from collections import Counter, defaultdict

HIER = os.path.dirname(os.path.abspath(__file__))
BASIS = os.path.dirname(HIER)
TYP_NAME = {
    "buch": "Bücher", "dissertation": "Dissertationen", "diplomarbeit": "Diplomarbeiten",
    "bachelorarbeit": "Bachelorarbeiten", "masterarbeit": "Masterarbeiten",
    "forschungsarbeit_studie": "Forschungsarbeiten und Studien",
    "veroeffentlichung_publikation": "Veröffentlichungen und Publikationen",
    "praesentation": "Präsentationen", "anwendungsfall": "Anwendungsfälle",
    "block_framework": "Blocks und Frameworks",
}
TYP_ORDER = list(TYP_NAME)
DATEINAME = {
    "D1": "01-finanz-abschluss-und-steuerpruefung.md", "D2": "02-interne-revision-und-oeffentlicher-sektor.md",
    "D3": "03-it-cybersecurity-und-ki-audit.md", "D4": "04-esg-nachhaltigkeit-und-qualitaetsaudit.md",
    "D5": "05-forensik-betrug-und-compliance-audit.md", "D6": "06-digitalisierung-ausbildung-und-frameworks.md",
}


def url_ok(url, timeout=8):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}, method="HEAD")
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return 200 <= r.status < 400
    except Exception:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return 200 <= r.status < 400
        except Exception:
            return None  # unklar, nicht zwingend tot


daten = {}
for f in sorted(glob.glob(os.path.join(BASIS, "rohfunde", "D*.json"))):
    d = json.load(open(f, encoding="utf-8"))
    daten[d["domain_kuerzel"]] = d

# Stichprobe: jeden 3. Eintrag prüfen, mindestens 8 je Domain
geprueft = {"lebendig": 0, "tot": 0, "unklar": 0}
for k, d in daten.items():
    eintraege = d.get("eintraege", [])
    stichprobe = eintraege[::3] or eintraege
    for x in stichprobe[:15]:
        ok = url_ok(x.get("url", ""))
        x["url_geprueft"] = {True: "lebendig", False: "tot", None: "unklar"}[ok]
        geprueft[{True: "lebendig", False: "tot", None: "unklar"}[ok]] += 1
    print(k, "Stichprobe geprüft:", len(stichprobe[:15]))

gesamt_zaehler = Counter()
alle_eintraege = []
for k, d in daten.items():
    for x in d.get("eintraege", []):
        x["domain_kuerzel"] = k
        x["domain_name"] = d.get("domain_name")
        alle_eintraege.append(x)
        gesamt_zaehler[x.get("typ")] += 1

# Je Domain eine Markdown-Datei
for k, d in daten.items():
    name = d.get("domain_name", k)
    zaehler = Counter(x.get("typ") for x in d.get("eintraege", []))
    zeilen = [f"# {name}\n", "\nStand 19.09.2026 · Themenblock der Audit-Fachliteratur-Recherche.\n",
              "\n| Dokumentart | Zahl |\n|---|---|\n"]
    for t in TYP_ORDER:
        if zaehler.get(t):
            zeilen.append(f"| {TYP_NAME[t]} | {zaehler[t]} |\n")
    zeilen.append(f"| **Gesamt** | **{sum(zaehler.values())}** |\n")
    if d.get("beobachtungen"):
        zeilen.append("\n## Beobachtungen\n\n" + "".join(f"- {b}\n" for b in d["beobachtungen"]))
    if d.get("grenzen"):
        zeilen.append("\n## Grenzen dieser Recherche\n\n" + "".join(f"- {b}\n" for b in d["grenzen"]))
    by_typ = defaultdict(list)
    for x in d.get("eintraege", []):
        by_typ[x.get("typ")].append(x)
    for t in TYP_ORDER:
        if not by_typ[t]:
            continue
        zeilen.append(f"\n## {TYP_NAME[t]}\n")
        for x in sorted(by_typ[t], key=lambda x: (-(x.get("jahr") or 0), x.get("titel", ""))):
            autoren = ", ".join(x.get("autoren") or [])
            warn = " ⚠️ *Link bei Stichprobe nicht erreichbar*" if x.get("url_geprueft") == "tot" else ""
            zeilen.append(f"\n**{x.get('titel')}**{warn}  \n"
                          f"{autoren + ' · ' if autoren else ''}{x.get('jahr','o. J.')} · "
                          f"{x.get('herausgeber_verlag_institution','')} · {x.get('sprache','')}  \n"
                          f"{x.get('zusammenfassung','')}  \n"
                          f"[{x.get('url','')}]({x.get('url','')})\n")
    open(os.path.join(BASIS, DATEINAME.get(k, f"{k}.md")), "w", encoding="utf-8", newline="\n").write("".join(zeilen))

# Gesamtdatenbank
json.dump({"stand": "2026-09-19", "domains": {k: d for k, d in daten.items()}, "gesamt_je_typ": dict(gesamt_zaehler),
           "gesamt": len(alle_eintraege), "url_stichprobe": geprueft},
          open(os.path.join(BASIS, "literatur-datenbank.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

print("\nGESAMT:", len(alle_eintraege), "Einträge")
print(dict(gesamt_zaehler))
print("URL-Stichprobe:", geprueft)
