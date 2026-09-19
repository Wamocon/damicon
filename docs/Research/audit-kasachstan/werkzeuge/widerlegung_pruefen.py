"""Widerlegungsrunde: Zitate der Gegenprüfer am amtlichen Text auf adilet prüfen.

Liest widerlegung/W*.json, lädt jede genannte adilet-Kennung (Cache aus
Runde 1 wird mitgenutzt) und vermerkt je Beleg bzw. neuem Fakt:
  adilet_status   gilt | aufgehoben | nicht_geladen
  zitat_amtlich   true, wenn das Zitat wörtlich im amtlichen Text steht
Schreibt widerlegung/geprueft/W*.json und widerlegung/geprueft/uebersicht.json.
"""
import glob, json, os, re
from collections import Counter

import adilet_pruefen as a

HIER = os.path.dirname(os.path.abspath(__file__))
BASIS = os.path.dirname(HIER)
ZIEL = os.path.join(BASIS, "widerlegung", "geprueft")
os.makedirs(ZIEL, exist_ok=True)


def gefunden(zitat, text):
    teile = [x.strip() for x in re.split(r"\[…\]|\[\.\.\.\]|\.\.\.|…", a.norm(zitat)) if len(x.strip()) >= 15]
    t = a.norm(text)
    return bool(teile) and all(x in t for x in teile)


def pruefe(eintrag, cache):
    k = (eintrag.get("adilet_id") or "").strip()
    if not re.fullmatch(r"[A-Z]\d{7,10}_?", k):
        return
    if k not in cache:
        try:
            text = a.lade(k)
        except Exception:
            text = ""
        cache[k] = (text, a.status(text)[0] if len(text) > 2000 else "nicht_geladen")
    text, st = cache[k]
    eintrag["adilet_status"] = st
    eintrag["zitat_amtlich"] = bool(text) and gefunden(eintrag.get("zitat", ""), text)


cache, urteile, neu = {}, Counter(), Counter()
for f in sorted(glob.glob(os.path.join(BASIS, "widerlegung", "W*.json"))):
    d = json.load(open(f, encoding="utf-8"))
    for p in d.get("pruefungen", []):
        urteile[p.get("urteil")] += 1
        for b in p.get("belege", []):
            pruefe(b, cache)
    for n in d.get("neue_fakten", []):
        pruefe(n, cache)
        neu["amtlich" if n.get("zitat_amtlich") else "nicht_amtlich"] += 1
    json.dump(d, open(os.path.join(ZIEL, os.path.basename(f)), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

uebersicht = {"urteile": dict(urteile), "neue_fakten": dict(neu),
              "kennungen": {k: v[1] for k, v in sorted(cache.items())}}
json.dump(uebersicht, open(os.path.join(ZIEL, "uebersicht.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(json.dumps(uebersicht, ensure_ascii=False, indent=1))
