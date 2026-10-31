#!/usr/bin/env python3
"""Riga di stato Gear: marcia dell'ultimo sotto-agente gear della sessione, es. «⚙ LIGHT ▼»."""
import glob, json, os, sys

def main():
    tp = json.load(sys.stdin)["transcript_path"]
    d = os.path.join(tp[:-6] if tp.endswith(".jsonl") else tp, "subagents")
    runs = []
    for m in glob.glob(os.path.join(d, "agent-*.meta.json")):
        with open(m) as f:  # solo meta.json, piccolo
            t = json.load(f).get("agentType", "")
        if t.startswith("onmake-gear:gear-") or t.startswith("gear-"):
            s = os.stat(m[:-10] + ".jsonl")
            runs.append((getattr(s, "st_birthtime", s.st_ctime), t.split("gear-")[-1].upper()))
    runs.sort()
    if not runs:
        return "⚙ –"
    cur = runs[-1][1]
    if len(runs) > 1:
        r = ["LIGHT", "MEDIUM", "HIGH", "MAX"]
        a, b = r.index(runs[-2][1]), r.index(cur)
        return "⚙ " + cur + (" ▲" if b > a else " ▼" if b < a else "")
    return "⚙ " + cur

try:
    print(main())
except Exception:
    print("⚙ –")
