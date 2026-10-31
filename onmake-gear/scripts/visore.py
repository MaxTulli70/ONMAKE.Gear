#!/usr/bin/env python3
"""ONMAKE Gear VISORE: linea del tempo della marcia (light/medium/high/max) dai sotto-agenti di una sessione.
Uso: visore.py [--sessione ID|file.jsonl] [--terminale] [file.html]
Default: sessione piu' recente del progetto corrente; HTML in .../Claude Code files/gear-visore.html (si ricarica ogni 3 s)."""
import argparse, glob, html, json, os, re, sys
from datetime import datetime

OUT = "/Volumes/M2/Archivio-APP/APP-Max/Claude Code files/gear-visore.html"
LIV = ["light", "medium", "high", "max"]
EFFORT = {"light": "low", "medium": "medium", "high": "high", "max": "max"}  # = agents/gear-*.md

def tempo(s):
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except (AttributeError, ValueError):
        return None

def letto(path):
    """-> (modello, token, inizio, fine); orari None se mancano."""
    msgs, ts, model = {}, [], "?"
    for riga in open(path, errors="replace"):
        try:
            d = json.loads(riga)
        except ValueError:
            continue
        t = tempo(d.get("timestamp"))
        if t:
            ts.append(t)
        m = d.get("message")
        if d.get("type") != "assistant" or not isinstance(m, dict) or not m.get("usage"):
            continue
        if m.get("model") and m["model"] != "<synthetic>":
            model = m["model"]
        u = m["usage"]
        v = [u.get(k) or 0 for k in ("input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens")]
        i = m.get("id") or d.get("uuid")
        msgs[i] = [max(a, b) for a, b in zip(v, msgs[i])] if i in msgs else v  # stesso id in streaming: massimo
    return model, sum(sum(v) for v in msgs.values()), (min(ts) if ts else None), (max(ts) if ts else None)

def sessione(arg):
    if arg and os.path.isfile(arg):
        return arg
    d = os.path.expanduser("~/.claude/projects/" + re.sub(r"[^A-Za-z0-9]", "-", os.getcwd()))
    if arg:
        return d + "/" + arg.replace(".jsonl", "") + ".jsonl"
    f = glob.glob(d + "/*.jsonl")
    if not f:
        sys.exit("Nessuna trascrizione in " + d)
    return max(f, key=os.path.getmtime)

def agenti(sess):
    out = []
    for sa in glob.glob(sess[:-6] + "/subagents/agent-*.jsonl"):
        try:
            meta = json.load(open(sa[:-6] + ".meta.json"))
        except (OSError, ValueError):
            continue
        tipo = meta.get("agentType", "")
        if not tipo.startswith("onmake-gear:gear-"):
            continue
        liv = tipo.split("gear-")[-1]
        if liv not in LIV:
            continue
        model, tok, a, b = letto(sa)
        out.append(dict(liv=liv, model=model.replace("claude-", ""), tok=tok, a=a, b=b, desc=meta.get("description", "")))
    out.sort(key=lambda x: (x["a"] is None, x["a"] or 0))
    prec = None
    for x in out:
        d = 0 if prec is None else LIV.index(x["liv"]) - LIV.index(prec)
        x["dir"] = "●" if d == 0 else ("▲" if d > 0 else "▼")
        prec = x["liv"]
    return out

def dur(x):
    return (x["b"] - x["a"]).total_seconds() if x["a"] and x["b"] else None

def hms(t):
    return t.astimezone().strftime("%H:%M:%S") if t else "?"

def terminale(ag):
    for x in ag:
        s = dur(x)
        print(f"{x['dir']} {hms(x['a'])} {x['liv'].upper():<6} {x['model']:<12} effort {EFFORT[x['liv']]:<6} "
              f"{('%.0fs' % s) if s is not None else 'durata ?':>8} {x['tok']:>9} tok  {x['desc']}"
              + ("" if x["a"] else "  [orario mancante]"))
    print(f"salite {sum(x['dir']=='▲' for x in ag)}  discese {sum(x['dir']=='▼' for x in ag)}  sotto-agenti gear {len(ag)}")

def pagina(ag, sess):
    ok = [x for x in ag if x["a"] and x["b"]]
    su, giu = sum(x["dir"] == "▲" for x in ag), sum(x["dir"] == "▼" for x in ag)
    att = ag[-1]["liv"].upper() if ag else "-"
    W, H, L = 1000, 320, 80  # lane alta 80, ordine dall'alto MAX..LIGHT
    svg, righe = [], []
    if ok:
        t0, t1 = min(x["a"] for x in ok), max(x["b"] for x in ok)
        span = max((t1 - t0).total_seconds(), 1)
        pos = {}
        for n, x in enumerate(ag):
            if x not in ok:
                continue
            xs = (x["a"] - t0).total_seconds() / span * (W - 40) + 20
            w = max((x["b"] - x["a"]).total_seconds() / span * (W - 40), 14)
            y = (3 - LIV.index(x["liv"])) * L + 20
            pos[n] = (xs, w, y)
        for i, nome in enumerate(reversed(LIV)):
            svg.append(f'<rect x="0" y="{i*L}" width="{W}" height="{L}" class="lane l{i%2}"/><text x="6" y="{i*L+14}" class="lab">{nome.upper()}</text>')
        prec = None
        for n, x in enumerate(ag):
            if n not in pos:
                continue
            xs, w, y = pos[n]
            if prec is not None:
                px, pw, py = pos[prec]
                c = "up" if y < py else ("dn" if y > py else "eq")
                svg.append(f'<line x1="{px+pw}" y1="{py+20}" x2="{xs}" y2="{y+20}" class="ar {c}" marker-end="url(#h{c})"/>')
            svg.append(f'<rect x="{xs:.1f}" y="{y}" width="{w:.1f}" height="40" rx="4" class="b {x["liv"]}"><title>#{n+1} {x["liv"]} {html.escape(x["model"])} {x["tok"]} tok</title></rect>'
                       f'<text x="{xs+3:.1f}" y="{y+25}" class="n">{n+1}</text>')
            prec = n
    for n, x in enumerate(ag):
        s = dur(x)
        righe.append(f'<tr class="{x["liv"]}"><td>{n+1}</td><td class="{ {"▲":"up","▼":"dn","●":"eq"}[x["dir"]] }">{x["dir"]}</td><td>{x["liv"].upper()}</td>'
                     f'<td>{html.escape(x["model"])}</td><td>{EFFORT[x["liv"]]}</td><td>{hms(x["a"])}</td>'
                     f'<td>{("%.0f s" % s) if s is not None else "orario mancante"}</td><td>{x["tok"]:,}</td><td>{html.escape(x["desc"])}</td></tr>')
    senza = [i + 1 for i, x in enumerate(ag) if not (x["a"] and x["b"])]
    nota = f'<p class="nota">Senza orario (non nella linea del tempo): #{", #".join(map(str, senza))}</p>' if senza else ""
    vuoto = "" if ag else "<p>Nessun sotto-agente gear in questa sessione.</p>"
    return f"""<!doctype html><html lang="it"><head><meta charset="utf-8"><meta http-equiv="refresh" content="3">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Gear Visore</title><style>
:root{{--bg:#fafaf7;--fg:#1c1c1a;--mu:#6b6b66;--l0:#eeeee8;--l1:#e4e4dc;--light:#7bb8e8;--medium:#6fc08a;--high:#e8b64a;--max:#d9694f;--up:#c2410c;--dn:#15803d;--eq:#888}}
@media(prefers-color-scheme:dark){{:root{{--bg:#16161a;--fg:#ececf0;--mu:#9a9aa5;--l0:#1d1d22;--l1:#25252b;--light:#3b7fb8;--medium:#3f9a62;--high:#b88a24;--max:#b0452d;--up:#fb923c;--dn:#4ade80}}}}
body{{margin:0 auto;max-width:1040px;padding:16px;background:var(--bg);color:var(--fg);font:14px system-ui,sans-serif}}
h1{{font-size:20px;margin:0 0 4px}} .top{{display:flex;gap:24px;flex-wrap:wrap;margin:12px 0}} .top b{{font-size:22px;display:block}}
.top span{{color:var(--mu);font-size:12px}} svg{{width:100%;height:auto;display:block}} .lane.l0{{fill:var(--l0)}} .lane.l1{{fill:var(--l1)}}
.lab{{fill:var(--mu);font-size:11px}} .n{{fill:#111;font-size:12px;font-weight:600}} .b.light{{fill:var(--light)}} .b.medium{{fill:var(--medium)}} .b.high{{fill:var(--high)}} .b.max{{fill:var(--max)}}
.ar{{stroke-width:2;fill:none}} .ar.up{{stroke:var(--up)}} .ar.dn{{stroke:var(--dn)}} .ar.eq{{stroke:var(--eq)}}
table{{border-collapse:collapse;width:100%;margin-top:12px;font-size:13px}} td,th{{padding:4px 6px;border-bottom:1px solid var(--l1);text-align:left}}
td.up{{color:var(--up)}} td.dn{{color:var(--dn)}} td.eq{{color:var(--eq)}} .nota,small{{color:var(--mu)}} .wrap{{overflow-x:auto}}
</style></head><body><h1>Gear Visore</h1><small>sessione {html.escape(os.path.basename(sess)[:8])} - aggiornato {datetime.now().strftime('%H:%M:%S')} - ricarica ogni 3 s</small>
<div class="top"><div><span>MARCIA ATTUALE</span><b>{att}</b></div><div><span>SALITE ▲</span><b>{su}</b></div><div><span>DISCESE ▼</span><b>{giu}</b></div><div><span>SOTTO-AGENTI</span><b>{len(ag)}</b></div></div>
{vuoto}<svg viewBox="0 0 {W} {H}" role="img" aria-label="linea del tempo delle marce"><defs>
<marker id="hup" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0L8,4L0,8z" fill="var(--up)"/></marker>
<marker id="hdn" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0L8,4L0,8z" fill="var(--dn)"/></marker>
<marker id="heq" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0L8,4L0,8z" fill="var(--eq)"/></marker></defs>{''.join(svg)}</svg>{nota}
<div class="wrap"><table><tr><th>#</th><th></th><th>Livello</th><th>Modello</th><th>Effort</th><th>Inizio</th><th>Durata</th><th>Token</th><th>Compito</th></tr>{''.join(righe)}</table></div>
</body></html>"""

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("out", nargs="?", default=OUT)
    p.add_argument("--sessione")
    p.add_argument("--terminale", action="store_true")
    a = p.parse_args()
    sess = sessione(a.sessione)
    ag = agenti(sess)
    if a.terminale:
        terminale(ag)
    else:
        open(a.out, "w").write(pagina(ag, sess))
        print("Scritto", a.out, "-", len(ag), "sotto-agenti gear")
