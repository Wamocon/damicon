"""Phase 3: Belege aus den Rohfunden am amtlichen Text auf adilet.zan.kz gegenprüfen.

Für jede adilet-Kennung wird die Seite einmal im gstack-Browser geladen
(nacheinander, der Browser ist ein geteilter Dienst). Danach je Beleg:
  - Norm aufgehoben?          -> verifiziert = "aufgehoben"
  - Zitat wörtlich im Text?   -> verifiziert = "primaer", rang = 1
  - sonst                      -> bleibt "nur_sekundaer", Vermerk im Feld pruefvermerk

Aufruf: python adilet_pruefen.py
Liest rohfunde/*.json, schreibt pruefung/adilet-cache/<kennung>.txt und
pruefung/adilet-pruefung.json.
"""
import glob, json, os, re, subprocess, sys, unicodedata

HIER = os.path.dirname(os.path.abspath(__file__))
BASIS = os.path.dirname(HIER)
BROWSE = os.path.expanduser("~/.claude/skills/gstack/browse/dist/browse.exe")
CACHE = os.path.join(BASIS, "pruefung", "adilet-cache")
os.makedirs(CACHE, exist_ok=True)


def b(*args, timeout=120):
    r = subprocess.run([BROWSE, *args], capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout)
    return r.stdout


def lade(kennung):
    pfad = os.path.join(CACHE, kennung + ".txt")
    if os.path.exists(pfad) and os.path.getsize(pfad) > 2000:
        return open(pfad, encoding="utf-8").read()
    b("goto", f"https://adilet.zan.kz/rus/docs/{kennung}")
    b("wait", "--networkidle")
    text = b("js", "document.body.innerText")
    open(pfad, "w", encoding="utf-8").write(text)
    return text


def norm(s):
    s = unicodedata.normalize("NFKC", s or "").lower().replace("ё", "е")
    s = re.sub(r"[«»\"“”„'`]", "", s)
    return re.sub(r"\s+", " ", s).strip()


def zitat_gefunden(zitat, text):
    z, t = norm(zitat), norm(text)
    if not z:
        return False
    if z in t:
        return True
    # Auslassungen („…“) im Zitat: alle Teile ab 25 Zeichen müssen vorkommen
    teile = [x.strip() for x in re.split(r"\.\.\.|…|\[\.\.\.\]", z) if len(x.strip()) >= 25]
    return bool(teile) and all(x in t for x in teile)


def status(text):
    # Nur die Fußnote zum ganzen Dokument zählt („Сноска. Утратил силу …“),
    # nicht Fußnoten zu einzelnen Punkten („Пункт 3 утратил силу“).
    kopf = text[:6000]
    m = re.search(r"Сноска\.\s*Утратил[аио]? сил[уы][^\n]{0,200}", kopf)
    return ("aufgehoben", m.group(0)) if m else ("gilt", "")


def main():
    daten = {f: json.load(open(f, encoding="utf-8")) for f in sorted(glob.glob(os.path.join(BASIS, "rohfunde", "*.json")))}
    kennungen = sorted({(x.get("adilet_id") or "").strip() for d in daten.values() for x in d.get("belege", []) + d.get("quellen", []) if (x.get("adilet_id") or "").strip()})
    kennungen = [k for k in kennungen if re.fullmatch(r"[A-Z]\d{7,10}_?", k)]
    print(len(kennungen), "Kennungen")
    ergebnis = {}
    for k in kennungen:
        try:
            text = lade(k)
        except Exception as e:
            ergebnis[k] = {"geladen": False, "fehler": str(e)}
            continue
        st, beleg = status(text)
        titel = text.split("\n")[0:1]
        ergebnis[k] = {"geladen": len(text) > 2000, "laenge": len(text), "status": st, "status_beleg": beleg}
        print(k, len(text), st)
    for f, d in daten.items():
        for x in d.get("belege", []):
            k = (x.get("adilet_id") or "").strip()
            if k not in ergebnis or not ergebnis[k].get("geladen"):
                x["pruefvermerk"] = "adilet nicht geprüft (keine Kennung oder Seite nicht geladen)"
                continue
            if ergebnis[k]["status"] == "aufgehoben":
                x["verifiziert"] = "aufgehoben"
                x["pruefvermerk"] = "adilet: " + ergebnis[k]["status_beleg"]
            elif zitat_gefunden(x.get("wortlaut_original", ""), open(os.path.join(CACHE, k + ".txt"), encoding="utf-8").read()):
                if x.get("verifiziert") not in ("widerspruch",):
                    x["verifiziert"] = "primaer"
                x["rang"] = 1
                x["pruefvermerk"] = "Zitat wörtlich im amtlichen Text auf adilet gefunden (18.09.2026)"
            else:
                x["pruefvermerk"] = "Zitat nicht wörtlich im adilet-Text gefunden; von Hand prüfen"
        json.dump(d, open(f.replace(os.sep + "rohfunde" + os.sep, os.sep + "pruefung" + os.sep).replace(".json", ".geprueft.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump(ergebnis, open(os.path.join(BASIS, "pruefung", "adilet-pruefung.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
