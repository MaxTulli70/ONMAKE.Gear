#!/usr/bin/env python3
"""ONMAKE Gear CONTATORE: token per modello e per livello gear da una trascrizione Claude Code.
Uso: contatore.py [file.jsonl]   (default: la più recente del progetto corrente)"""
import json, glob, os, re, sys
from collections import defaultdict

def trascrizione():
    if len(sys.argv) > 1:
        return sys.argv[1]
    d = os.path.expanduser("~/.claude/projects/" + re.sub(r"[^A-Za-z0-9]", "-", os.getcwd()))
    f = glob.glob(d + "/*.jsonl")
    if not f:
        sys.exit("Nessuna trascrizione in " + d)
    return max(f, key=os.path.getmtime)

def uso(path):
    # Lo stesso messaggio compare piu' volte (streaming): conta una volta per id, tenendo il massimo.
    m = {}
    for riga in open(path, errors="replace"):
        if '"usage"' not in riga:
            continue
        try:
            d = json.loads(riga)
        except ValueError:
            continue
        msg = d.get("message")
        if d.get("type") != "assistant" or not isinstance(msg, dict) or not msg.get("usage"):
            continue
        u = msg["usage"]
        v = [u.get(k) or 0 for k in ("input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens")]
        i = msg.get("id") or d.get("uuid")
        m[i] = (msg.get("model") or "?", [max(a, b) for a, b in zip(v, m[i][1])] if i in m else v)
    return m.values()

f = trascrizione()
mod, liv = defaultdict(lambda: [0] * 4), defaultdict(lambda: [0] * 4)
def somma(t, k, v):
    t[k] = [a + b for a, b in zip(t[k], v)]
for model, v in uso(f):
    if model == "<synthetic>":
        continue
    somma(mod, model, v); somma(liv, "chat principale (tutti i modelli)", v)
for sa in glob.glob(f[:-6] + "/subagents/agent-*.jsonl"):
    try:
        tipo = json.load(open(sa[:-6] + ".meta.json")).get("agentType", "?")
    except (OSError, ValueError):
        tipo = "?"
    nome = tipo.split(":")[-1] if tipo.startswith("onmake-gear:") else "altri (" + tipo + ")"
    for model, v in uso(sa):
        if model == "<synthetic>":
            continue
        somma(mod, model, v); somma(liv, (nome, model), v)

def tab(titolo, d):
    print(f"{titolo:<38}{'input':>10}{'output':>10}{'cache-scr':>12}{'cache-let':>13}{'totale':>13}")
    for k, v in sorted(d.items(), key=lambda x: -sum(x[1])):
        k = k if isinstance(k, str) else f"{k[0]} / {k[1]}"
        print(f"{k[:37]:<38}" + "".join(f"{x:>{w}}" for x, w in zip(v + [sum(v)], (10, 10, 12, 13, 13))))
tab("PER MODELLO", mod)
tab("PER LIVELLO / MODELLO", liv)
print("Totale = input+output+cache. Sessione:", os.path.basename(f)[:8], "- sotto-agenti letti dai loro file.")
