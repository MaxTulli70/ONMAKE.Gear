#!/usr/bin/env python3
"""Riga di stato Gear: marcia dell'ultimo sotto-agente gear della sessione, es. «⚙ LIGHT ▼»."""
import glob, json, os, re, sys

AG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "agents")

def livello(tipo):
    """'onmake-gear:gear-editor' -> 'medium': la marcia viene da modello ed effort scritti nel file dell'agente."""
    try:
        t = open(os.path.join(AG, tipo.split(":")[-1] + ".md")).read(800)
    except OSError:
        return None
    m = re.search(r"^model: *(\w+)", t, re.M)
    e = re.search(r"^effort: *(\w+)", t, re.M)
    m, e = (m.group(1) if m else ""), (e.group(1) if e else "")
    if m == "haiku":
        return "light"
    if m == "sonnet":
        return "high" if e in ("high", "max") else "medium"
    if m == "opus":
        return "max" if e == "max" else "opus"
    return None

def main():
    tp = json.load(sys.stdin)["transcript_path"]
    d = os.path.join(tp[:-6] if tp.endswith(".jsonl") else tp, "subagents")
    runs = []
    for m in glob.glob(os.path.join(d, "agent-*.meta.json")):
        with open(m) as f:  # solo meta.json, piccolo
            t = json.load(f).get("agentType", "")
        liv = livello(t) if t.startswith("onmake-gear:gear-") or t.startswith("gear-") else None
        if liv:
            s = os.stat(m[:-10] + ".jsonl")
            runs.append((getattr(s, "st_birthtime", s.st_ctime), liv.upper()))
    runs.sort()
    if not runs:
        return "⚙ –"
    cur = runs[-1][1]
    if len(runs) > 1:
        r = ["LIGHT", "MEDIUM", "HIGH", "OPUS", "MAX"]
        a, b = r.index(runs[-2][1]), r.index(cur)
        return "⚙ " + cur + (" ▲" if b > a else " ▼" if b < a else "")
    return "⚙ " + cur

try:
    print(main())
except Exception:
    print("⚙ –")
