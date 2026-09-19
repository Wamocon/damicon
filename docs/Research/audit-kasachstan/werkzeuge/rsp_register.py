"""Pflichtenverzeichnis rsp.gov.kz für OKED 01250 (Beeren) vollständig sichern.

Das „Реестр обязательных требований в сфере предпринимательства“ des
Wirtschaftsministeriums listet je Wirtschaftszweig die geltenden Rechtsakte.
Filter ra_view=34 entspricht OKED 01250 „Выращивание прочих плодов, ягод и
орехов“ (am 18.09.2026 aus dem Auswahlfeld ermittelt).

Schreibt pruefung/rsp-register-01250.json.
"""
import json, os, subprocess

HIER = os.path.dirname(os.path.abspath(__file__))
BASIS = os.path.dirname(HIER)
BROWSE = os.path.expanduser("~/.claude/skills/gstack/browse/dist/browse.exe")
JS = r"""JSON.stringify([...document.querySelectorAll("tr")].filter(tr=>tr.querySelectorAll("td").length>=6).map(tr=>{
  const td=[...tr.querySelectorAll("td")];
  const dossier=(td[2].querySelector("a")||{}).href||"";
  const m=dossier.match(/docs\/([A-Z0-9_]+)/);
  return {titel:td[0].innerText.trim(), oked:td[1].innerText.trim().split(/,\s*/), adilet_id:m?m[1]:"", behoerde:td[3].innerText.trim(), status:td[4].innerText.trim(), analyse_bis:td[5].innerText.trim()};
}))"""


def b(*args):
    return subprocess.run([BROWSE, *args], capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120).stdout


alle = []
for seite in range(1, 57):
    b("goto", f"https://rsp.gov.kz/ru/search?ra_view=34&page={seite}")
    b("wait", "--networkidle")
    roh = b("js", JS).strip().splitlines()[-1]
    try:
        eintraege = json.loads(roh)
    except json.JSONDecodeError:
        eintraege = []
    for e in eintraege:
        e["seite"] = seite
    alle.extend(eintraege)
    print(seite, len(eintraege), flush=True)

json.dump({"quelle": "https://rsp.gov.kz/ru/search?ra_view=34", "oked": "01250", "abgerufen_am": "2026-09-18",
           "gemeldet_gesamt": 555, "gelesen": len(alle), "akte": alle},
          open(os.path.join(BASIS, "pruefung", "rsp-register-01250.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("gesamt", len(alle))
