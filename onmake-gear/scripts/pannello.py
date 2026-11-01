#!/usr/bin/env python3
"""ONMAKE Gear PANNELLO: dati e pagina grafica locale di una sessione (agenti, avanzamento, token, risparmio stimato).
Uso: pannello.py --cartella DIR [--sessione ID] [--json | --html FILE]
I dati vengono solo dalle trascrizioni locali di Claude Code: niente rete. Prezzi di riferimento per milione di token,
modificabili in ~/.config/onmake-gear/prezzi.json  {"opus":[in,out,cache_scr,cache_let], ...}"""
import argparse, glob, html, json, os, re, sys, time
from datetime import datetime, timezone

LIV = ["light", "medium", "high", "opus", "max"]
COL = {"light": "#7bb8e8", "medium": "#6fc08a", "high": "#e8b64a", "opus": "#a78bd0", "max": "#d9694f", "altro": "#a7a7b0", "chat": "#8a9bb0"}
ABBANDONO = 3600  # un agente mai finito e senza attivita' da oltre 1 ora e' interrotto, non fermo
# $ per milione di token: input, output, cache scritta, cache letta (riferimento, da verificare sul listino)
FERMO = 90  # secondi senza attivita dopo i quali un agente non finito conta come fermo
PREZZI = {"opus": [5, 25, 6.25, 0.5], "sonnet": [3, 15, 3.75, 0.3], "haiku": [1, 5, 1.25, 0.1]}

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

def prezzi():
    p = dict(PREZZI)
    try:
        p.update(json.load(open(os.path.expanduser("~/.config/onmake-gear/prezzi.json"))))
    except (OSError, ValueError):
        pass
    return p

def tempo(s):
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except (AttributeError, ValueError):
        return None

def famiglia(model):
    for f in ("opus", "sonnet", "haiku"):
        if f in model:
            return f
    return None

def costo(model, v, P):
    f = famiglia(model)
    return None if f not in P else sum(a * b for a, b in zip(v, P[f])) / 1e6

def leggi(path):
    """-> dict(model, v=[in,out,cw,cr], a, b, tools, todos)"""
    msgs, ts, model, tools, todos = {}, [], "?", 0, None
    ora_mod = None  # modello dell'ultimo messaggio: quello che la chat usa adesso
    quando, ultimo, todo_t = {}, None, None  # ora di ogni messaggio, ultimo messaggio dell'utente, ora dell'ultimo elenco passi
    for riga in open(path, errors="replace"):
        try:
            d = json.loads(riga)
        except ValueError:
            continue
        t = tempo(d.get("timestamp"))
        if t:
            ts.append(t)
        m = d.get("message")
        # un messaggio vero dell'utente (testo, non il risultato di uno strumento) apre il lavoro attuale
        if d.get("type") == "user" and isinstance(m, dict) and not d.get("isMeta") and not d.get("isSidechain") and t:
            c = m.get("content")
            if (isinstance(c, str) and not c.startswith("<")) or (isinstance(c, list) and any(isinstance(x, dict) and x.get("type") == "text" for x in c) and not any(isinstance(x, dict) and x.get("type") == "tool_result" for x in c)):
                ultimo = t
        if d.get("type") != "assistant" or not isinstance(m, dict):
            continue
        if isinstance(m.get("content"), list):
            for c in m["content"]:
                if isinstance(c, dict) and c.get("type") == "tool_use":
                    tools += 1
                    if c.get("name") == "TodoWrite" and isinstance(c.get("input", {}).get("todos"), list):
                        todos, todo_t = c["input"]["todos"], t
        if not m.get("usage"):
            continue
        mod = m.get("model") if m.get("model") and m["model"] != "<synthetic>" else None
        if mod:
            ora_mod = mod
        u = m["usage"]
        v = [u.get(k) or 0 for k in ("input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens")]
        i = m.get("id") or d.get("uuid")
        quando.setdefault(i, t)
        msgs[i] = (mod or (msgs[i][0] if i in msgs else None), [max(a, b) for a, b in zip(v, msgs[i][1])] if i in msgs else v)
    # ogni messaggio conta col modello che l'ha scritto: una chat che cambia modello non va prezzata tutta con l'ultimo
    pm = {}
    for mod, x in msgs.values():
        k = (mod or "?").replace("claude-", "")
        pm[k] = [a + b for a, b in zip(pm.get(k, [0] * 4), x)]
    v = [sum(x[1][k] for x in msgs.values()) for k in range(4)]
    model = max(pm, key=lambda k: sum(pm[k][:3])) if pm else "?"
    ts.sort()  # tempo attivo: gli intervalli fra due eventi sotto i 5 minuti (le pause lunghe non contano)
    att = sum(g for g in ((y - x).total_seconds() for x, y in zip(ts, ts[1:])) if g <= 300)
    # lavoro attuale: dal tuo ultimo messaggio
    vt = [sum(x[1][k] for i, x in msgs.items() if ultimo and quando.get(i) and quando[i] >= ultimo) for k in range(4)]
    tt = [x for x in ts if ultimo and x >= ultimo]
    att_t = sum(g for g in ((y - x).total_seconds() for x, y in zip(tt, tt[1:])) if g <= 300)
    return dict(model=model, pm=pm, v=v, a=ts[0] if ts else None, b=ts[-1] if ts else None, tools=tools, todos=todos, att=att,
                ultimo=ultimo, vt=vt, att_t=att_t, todo_t=todo_t, ora_mod=(ora_mod or "").replace("claude-", ""))

def sessione(cartella, sid):
    d = os.path.expanduser("~/.claude/projects/" + re.sub(r"[^A-Za-z0-9]", "-", cartella))
    if sid:
        return d + "/" + sid.replace(".jsonl", "") + ".jsonl"
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
            meta = {}
        tipo = meta.get("agentType", "?")
        liv = (livello(tipo) if tipo.startswith("onmake-gear:gear-") else None) or "altro"
        x = leggi(sa)
        ago = (datetime.now(timezone.utc) - x["b"]).total_seconds() if x["b"] else None
        fine = bool(meta.get("finished"))
        # lavora < 90 s; fermo fra 90 s e 1 h; interrotto oltre 1 h senza fine (abbandonato)
        a = ago if ago is not None else 0
        stato = "completato" if fine else ("interrotto" if a > ABBANDONO else ("fermo" if a >= FERMO else "lavora"))
        liv = liv if liv in LIV else "altro"
        nome = tipo.split(":")[-1] if liv == "altro" else liv
        x.update(tipo=tipo.split(":")[-1], liv=liv, nome=nome, desc=meta.get("description", ""), fine=fine, ago=ago, stato=stato)
        out.append(x)
    out.sort(key=lambda x: (x["a"] is None, x["a"] or datetime.min.replace(tzinfo=timezone.utc)))
    prec = None
    for x in out:
        if x["liv"] in LIV:
            d = 0 if prec is None else LIV.index(x["liv"]) - LIV.index(prec)
            x["dir"] = "" if d == 0 else ("▲" if d > 0 else "▼")
            prec = x["liv"]
        else:
            x["dir"] = ""
    return out

def riepilogo(sess):
    P, main, ag = prezzi(), leggi(sess), agenti(sess)
    tutti = [dict(model=k, v=x, liv="chat", nome="chat") for k, x in main["pm"].items()] + ag
    reale = opus = 0.0
    noprezzo = set()
    for x in tutti:
        c = costo(x["model"], x["v"], P)
        if c is None:
            noprezzo.add(x["model"])
            continue
        reale += c
        opus += costo("opus", x["v"], P) or 0
    tok = sum(x["v"][0] + x["v"][1] + x["v"][2] for x in tutti)
    cr = sum(x["v"][3] for x in tutti)
    todos = main["todos"]
    tot = len(todos) if todos else 0
    fatti = sum(1 for t in (todos or []) if t.get("status") == "completed")
    perc = fatti / tot if tot else None
    ora = datetime.now(timezone.utc)
    el = main["att"]
    eta = el * (1 - perc) / perc if perc and perc >= 0.05 and perc < 1 else None
    gear = [x for x in ag if x["liv"] in LIV]
    attivi = [x for x in ag if x["stato"] == "lavora"]
    fermi = [x for x in ag if x["stato"] == "fermo"]
    return dict(main=main, ag=ag, tutti=tutti, reale=reale, opus=opus, noprezzo=sorted(noprezzo),
                risp=(1 - reale / opus) if opus > 0 else None, tok=tok, cr=cr, todos=todos or [], tot=tot, fatti=fatti,
                perc=perc, el=el, eta=eta, livello=(gear[-1]["liv"] if gear else None), dir=(gear[-1]["dir"] if gear else ""),
                attivi=attivi, fermi=fermi, ora=ora)

def breve(r):
    """Per la barra: solo il lavoro attuale, cioe' dal tuo ultimo messaggio (la sessione intera resta nel pannello)."""
    m, u = r["main"], r["main"]["ultimo"]
    ag = [x for x in r["ag"] if u is None or (x["b"] and x["b"] >= u)]
    todos = m["todos"] if m["todos"] and m["todo_t"] and u and m["todo_t"] >= u else None
    tot = len(todos) if todos else 0
    fatti = sum(1 for t in (todos or []) if t.get("status") == "completed")
    perc = fatti / tot if tot else None
    el = m["att_t"]
    eta = el * (1 - perc) / perc if perc and 0.05 <= perc < 1 else None
    tok = sum(m["vt"][:3]) + sum(sum(x["v"][:3]) for x in ag)
    lav = [x for x in ag if x["stato"] == "lavora"]
    vis = [x for x in ag if x["stato"] in ("lavora", "fermo")] + [x for x in ag if x["stato"] == "completato"][-5:]
    return dict(chat=m["ora_mod"], livello=r["livello"], dir=r["dir"], agenti=len(ag), fini=sum(1 for x in ag if x["fine"]), lavorano=len(lav),
                fermi=sum(1 for x in ag if x["stato"] == "fermo"), completi=sum(1 for x in ag if x["fine"]),
                interrotti=sum(1 for x in ag if x["stato"] == "interrotto"),
                attivi=[dict(liv=x["liv"], tipo=x["tipo"], nome=x["nome"], desc=x["desc"][:40], model=x["model"]) for x in lav],
                tok=tok, cr=r["cr"], reale=round(r["reale"], 2), opus=round(r["opus"], 2), risp=r["risp"], perc=perc,
                fatti=fatti, tot=tot, el=int(el), eta=(int(eta) if eta else None),
                righe=[dict(liv=x["liv"], nome=x["nome"], tipo=x["tipo"], dir=x["dir"], model=x["model"], tok=x["v"][0] + x["v"][1] + x["v"][2], fine=x["fine"],
                            stato=x["stato"], ago=int(x["ago"] or 0), desc=x["desc"][:36]) for x in vis])

STATI = [("lavora", "Lavorano", "▶"), ("fermo", "Fermi", "⏸"), ("completato", "Completati", "✓"), ("interrotto", "Interrotti", "✗")]

def ETI(x):
    return {"completato": "completato", "lavora": "in corso", "interrotto": "interrotto"}.get(x["stato"]) or f"fermo da {dur(x['ago'])}"

def kt(n):
    return f"{n/1e9:.1f}G" if n >= 1e9 else (f"{n/1e6:.1f}M" if n >= 1e6 else (f"{n/1e3:.0f}K" if n >= 1e3 else str(n)))

def dur(s):
    s = int(s)
    return f"{s//3600}h {s%3600//60}m" if s >= 3600 else (f"{s//60}m {s%60}s" if s >= 60 else f"{s}s")

def barre(voci, unita=kt):
    """voci: [(etichetta, colore, valore)] -> righe orizzontali nella stessa scala"""
    mx = max([v for _, _, v in voci] + [1])
    return "".join(f'<div class="rw"><span class="rl">{html.escape(e)}</span><span class="tr"><i style="width:{v/mx*100:.1f}%;background:{c}"></i></span><span class="rv">{unita(v)}</span></div>'
                   for e, c, v in voci)

def pagina(r, sess):
    ag, esc = r["ag"], html.escape
    pc = lambda x: "n/d" if x is None else f"{x*100:.0f}%"
    tk = lambda x: sum(x["v"][:3])
    liv = r["livello"]
    n = {k: sum(1 for x in ag if x["stato"] == k) for k, _, _ in STATI}
    # KPI
    marcia = (f'<b><i class="dot" style="background:{COL[liv]}"></i>{liv.upper()} {r["dir"]}</b>' if liv else '<b>nessuna</b>')
    conti = " ".join(f'<span class="s-{k}">{ic} {n[k]}</span>' for k, _, ic in STATI if n[k] or k != "interrotto")
    tempo = dur(r["el"]) + (f' <small>/ ~{dur(r["el"] + r["eta"])}</small>' if r["eta"] else "")
    rb = max(0.0, min(1.0, r["risp"] or 0))
    risp = (f'<b>{"" if round(r["risp"]*100) == 0 else ("−" if r["risp"] > 0 else "+")}{abs(r["risp"])*100:.0f}%</b><div class="mini"><i style="width:{rb*100:.0f}%"></i></div>' if r["risp"] is not None else "<b>n/d</b>")
    kpi = (f'<div class="k"><div>{marcia}<span>marcia</span></div><div><b class="cn">{conti}</b><span>agenti</span></div>'
           f'<div><b>{tempo}</b><span>tempo attivo{" / stimato" if r["eta"] else ""}</span></div><div><b>{kt(r["tok"])}</b><span>token usati</span></div>'
           f'<div><b>${r["reale"]:.2f}</b><span>costo stimato</span></div><div>{risp}<span>risparmio vs Opus</span></div></div>')
    # avanzamento
    todo = "".join(f'<li class="{esc(t.get("status","pending"))}">{"✓" if t.get("status")=="completed" else ("◔" if t.get("status")=="in_progress" else "○")} {esc(str(t.get("content","")))}</li>' for t in r["todos"])
    avanz = (f'<div class="pr"><b>{pc(r["perc"])}</b><span>{r["fatti"]} di {r["tot"]} passi</span></div><div class="pb"><i style="width:{r["perc"]*100:.0f}%"></i></div><ul class="td">{todo}</ul>'
             if r["tot"] else '<p class="mu">Nessun elenco di passi in questa sessione: avanzamento non misurabile.</p>')
    # workflow a nodi, raggruppato per stato
    def nodo(x):
        return (f'<div class="nd {x["stato"]}" style="--c:{COL[x["liv"]]}" title="{esc(x["desc"])}"><div class="nh"><i class="dot"></i>{esc(x["nome"])} {x["dir"]}<em>{esc(x["model"])}</em></div>'
                f'<div class="nx">{esc(x["desc"]) or "&nbsp;"}</div><div class="nf">{kt(tk(x))} tok · {ETI(x)}</div></div>')
    altri = lambda m: f'<p class="mu sm">+ {m-6} precedenti</p>' if m > 6 else ""
    corsie = "".join(f'<div class="ln"><h3>{ic} {t} <span>{n[k]}</span></h3>{"<i class=ar>↓</i>".join(nodo(x) for x in [y for y in ag if y["stato"] == k][-6:])}{altri(n[k])}</div>'
                     for k, t, ic in STATI if n[k])
    flusso = (f'<div class="wf"><div class="nd root"><div class="nh">Chat principale<em>{esc(r["main"]["model"])}</em></div><div class="nf">{kt(sum(r["main"]["v"][:3]))} tok</div></div>'
              f'<i class="ar big">↓</i><div class="lns">{corsie or "<p class=mu>Nessun agente.</p>"}</div></div>')
    # linea del tempo: etichetta, traccia, durata in tre colonne
    ok = [x for x in ag if x["a"] and x["b"]]
    gant = ""
    if ok:
        t0, t1 = min(x["a"] for x in ok), max(x["b"] for x in ok)
        # le pause oltre 10 minuti fra agenti si accorciano a 10 minuti, cosi' le barre restano leggibili
        iv = sorted((x["a"].timestamp(), x["b"].timestamp()) for x in ok)
        tagli, fine = [], iv[0][0]
        for a, b in iv:
            if a - fine > 600:
                tagli.append((fine, a - fine - 600))
            fine = max(fine, b)
        pos = lambda t: t - t0.timestamp() - sum(g for f, g in tagli if f < t)
        sp = max(pos(t1.timestamp()), 1)
        for x in ok:
            s0 = pos(x["a"].timestamp()) / sp * 100
            w = max((pos(x["b"].timestamp()) - pos(x["a"].timestamp())) / sp * 100, 0.8)
            gant += (f'<div class="rw"><span class="rl" title="{esc(x["desc"])}"><i class="dot" style="background:{COL[x["liv"]]}"></i>{esc(x["nome"])}</span>'
                     f'<span class="tr gt"><i class="{x["stato"]}" style="left:{s0:.1f}%;width:{min(w, 100 - s0):.1f}%;background:{COL[x["liv"]]}"></i></span><span class="rv">{dur((x["b"]-x["a"]).total_seconds())}</span></div>')
        gant = f'<section><h2>Linea del tempo</h2>{gant}<p class="mu sm">da {t0.astimezone().strftime("%d/%m %H:%M")} a {t1.astimezone().strftime("%d/%m %H:%M")}{f" · {len(tagli)} pause lunghe accorciate" if tagli else ""}</p></section>'
    # token per modello (veri e cache in scale separate) e per marcia
    pm, pl = {}, {}
    for x in r["tutti"]:
        a = pm.setdefault(x["model"], [0, 0]); a[0] += sum(x["v"][:3]); a[1] += x["v"][3]
        k = x.get("nome") if x["liv"] == "altro" else x["liv"]
        b = pl.setdefault(k, [x["liv"], 0, 0.0]); b[1] += sum(x["v"][:3]); b[2] += costo(x["model"], x["v"], prezzi()) or 0
    mod = sorted(pm.items(), key=lambda k: -k[1][0])
    ordine = lambda k: (["chat"] + LIV).index(pl[k][0]) if pl[k][0] in ["chat"] + LIV else 99
    marce = sorted(pl, key=ordine)
    graf = (f'<div class="g2"><section><h2>Token per modello</h2><h4>Token veri</h4>{barre([(m, "var(--ac)", v[0]) for m, v in mod])}'
            f'<h4>Cache letta</h4>{barre([(m, "var(--mu2)", v[1]) for m, v in mod])}</section>'
            f'<section><h2>Per marcia</h2><h4>Token</h4>{barre([(k, COL[pl[k][0]], pl[k][1]) for k in marce])}'
            f'<h4>Costo stimato</h4>{barre([(k, COL[pl[k][0]], pl[k][2]) for k in marce], lambda v: f"${v:.2f}")}</section></div>')
    tab = "".join(f'<tr><td><i class="dot" style="background:{COL[x["liv"]]}"></i>{esc(x["nome"])} {x["dir"]}</td><td>{esc(x["model"])}</td><td class="s-{x["stato"]}">{ETI(x)}</td>'
                  f'<td>{x["tools"]}</td><td>{kt(tk(x))}</td><td>{dur((x["b"]-x["a"]).total_seconds()) if x["a"] and x["b"] else "?"}</td><td class="ds">{esc(x["desc"])}</td></tr>' for x in ag)
    nota = (f' Senza prezzo noto, esclusi: {esc(", ".join(r["noprezzo"]))}.' if r["noprezzo"] else "")
    return f"""<!doctype html><html lang="it"><head><meta charset="utf-8"><meta http-equiv="refresh" content="5"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gear Pannello</title><style>
:root{{--bg:#f6f6f3;--fg:#24242a;--mu:#7a7a80;--mu2:#c4c4cc;--cd:#fff;--ln:#e8e8e2;--ac:#7b9cc4;--ok:#5f9f78;--wa:#c9a04a;--ko:#b97a6e}}
@media(prefers-color-scheme:dark){{:root{{--bg:#17171b;--fg:#e6e6ec;--mu:#8e8e99;--mu2:#4a4a55;--cd:#202026;--ln:#2d2d35;--ac:#86a6cc;--ok:#7cbf95;--wa:#d9b464;--ko:#c99085}}}}
*{{box-sizing:border-box}} body{{margin:0 auto;max-width:1080px;padding:16px;background:var(--bg);color:var(--fg);font:13px/1.4 system-ui,-apple-system,sans-serif}}
h1{{font-size:17px;margin:0;font-weight:650}} h2{{font-size:11px;color:var(--mu);text-transform:uppercase;letter-spacing:.06em;margin:0 0 10px;font-weight:600}}
h4{{font-size:11px;color:var(--mu);margin:10px 0 2px;font-weight:500}} .mu{{color:var(--mu)}} .sm{{font-size:11px;margin:6px 0 0}}
.dot{{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:middle;background:var(--c,var(--mu))}}
.k{{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin:12px 0}} .k>div{{background:var(--cd);border:1px solid var(--ln);border-radius:10px;padding:8px 11px}}
.k b{{font-size:16px;display:block;font-weight:600;white-space:nowrap}} .k small{{color:var(--mu);font-weight:400;font-size:12px}} .k span{{color:var(--mu);font-size:11px}} .cn span{{font-size:15px;color:inherit;margin-right:6px}}
.mini{{height:4px;background:var(--ln);border-radius:3px;margin:4px 0 3px;overflow:hidden}} .mini i{{display:block;height:100%;background:var(--ok)}}
section{{background:var(--cd);border:1px solid var(--ln);border-radius:10px;padding:12px 14px;margin:10px 0;min-width:0}}
.pr{{display:flex;align-items:baseline;gap:10px}} .pr b{{font-size:26px;font-weight:600}} .pr span{{color:var(--mu)}}
.pb{{height:12px;background:var(--ln);border-radius:7px;overflow:hidden;margin:6px 0}} .pb i{{display:block;height:100%;background:linear-gradient(90deg,var(--ac),var(--ok))}}
.td{{list-style:none;padding:0;margin:8px 0 0;font-size:12px;columns:2 260px}} .td li{{margin:2px 0}} .td .completed{{color:var(--mu)}} .td .in_progress{{font-weight:600}}
.wf{{display:flex;flex-direction:column;align-items:center}} .ar{{color:var(--mu);font-style:normal;display:block;text-align:center;line-height:16px;font-size:12px}} .ar.big{{font-size:16px;margin:4px 0}}
.lns{{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;width:100%}} .ln{{background:var(--bg);border-radius:9px;padding:8px}}
.ln h3{{font-size:11px;font-weight:600;color:var(--mu);margin:0 0 6px}} .ln h3 span{{background:var(--ln);border-radius:8px;padding:0 6px;margin-left:4px}}
.nd{{background:var(--cd);border:1px solid var(--ln);border-left:4px solid var(--c);border-radius:8px;padding:6px 9px;min-width:0}} .nd.root{{--c:var(--ac);min-width:220px;text-align:center;border-left-width:1px;border-top:3px solid var(--ac)}}
.nh{{font-weight:600;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}} .nh em{{font-style:normal;font-weight:400;color:var(--mu);margin-left:6px;font-size:11px}}
.nx{{font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}} .nf{{font-size:11px;color:var(--mu)}}
.nd.lavora{{box-shadow:0 0 0 2px color-mix(in srgb,var(--c) 35%,transparent)}} .nd.interrotto,.nd.completato{{opacity:.7}}
.rw{{display:grid;grid-template-columns:minmax(80px,150px) 1fr 70px;align-items:center;gap:10px;margin:4px 0;font-size:12px}}
.rl{{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}} .rv{{text-align:right;color:var(--mu);white-space:nowrap}}
.tr{{height:9px;background:var(--ln);border-radius:5px;overflow:hidden;position:relative;display:block}} .tr i{{display:block;height:100%;border-radius:5px}} .tr i[style*=background]{{opacity:.85}}
.gt i{{position:absolute;top:0;min-width:3px}} .gt i.interrotto{{opacity:.4}}
.g2{{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:10px}} .g2 section{{margin:0}}
.s-lavora{{color:var(--ok)}} .s-fermo{{color:var(--wa)}} .s-completato{{color:var(--mu)}} .s-interrotto{{color:var(--ko)}}
table{{border-collapse:collapse;width:100%;font-size:12px}} td,th{{padding:5px 6px;border-bottom:1px solid var(--ln);text-align:left;white-space:nowrap}} th{{color:var(--mu);font-weight:500}} td.ds{{white-space:normal;min-width:160px}} .w{{overflow-x:auto}}
@media(max-width:520px){{body{{padding:10px}} .rw{{grid-template-columns:90px 1fr 56px;gap:6px}} .k{{grid-template-columns:1fr 1fr}}}}
</style></head><body><h1 style="display:flex;align-items:center;gap:8px"><a href="https://www.onmake.it" target="_blank" rel="noopener" title="onmake.it" style="display:inline-flex"><svg width="26" height="27" viewBox="0 0 100 104" role="img" aria-label="ONMAKE"><defs> <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"> <stop offset="0" stop-color="#8fbc7c"/><stop offset="0.45" stop-color="#6aa057"/><stop offset="1" stop-color="#5f9a4e"/> </linearGradient> <linearGradient id="f" x1="0" y1="0" x2="1" y2="1"> <stop offset="0" stop-color="#4a4a48"/><stop offset="1" stop-color="#2f2f2e"/> </linearGradient> </defs> <path d="M50 3 L92.4 27.5 Q94 28.4 94 30.3 L94 73.7 Q94 75.6 92.4 76.5 L50 101 L7.6 76.5 Q6 75.6 6 73.7 L6 30.3 Q6 28.4 7.6 27.5 Z" fill="url(#f)"/> <path d="M50 12.5 L85.5 33 L85.5 71 L50 91.5 L14.5 71 L14.5 33 Z" fill="url(#g)" stroke="#6b6b69" stroke-width="0.8"/> <path d="M14.5 33 L50 12.5 L85.5 33 L85.5 40 Q50 32 14.5 66 Z" fill="#ffffff" opacity="0.12"/> <text x="50" y="58" text-anchor="middle" font-family="Futura, 'Avenir Next', 'Century Gothic', system-ui, sans-serif" font-weight="600" font-size="15.5" textLength="66" lengthAdjust="spacingAndGlyphs" fill="#363634">ONMAKE</text></svg></a>Gear Pannello</h1><span class="mu sm">sessione {esc(os.path.basename(sess)[:8])} · {datetime.now().strftime('%H:%M:%S')} · si aggiorna ogni 5 s · dati locali</span>
{kpi}<section><h2>Avanzamento</h2>{avanz}</section><section><h2>Workflow</h2>{flusso}</section>{gant}{graf}
<section><h2>Agenti</h2><div class="w"><table><tr><th>Agente</th><th>Modello</th><th>Stato</th><th>Strumenti</th><th>Token</th><th>Durata</th><th>Compito</th></tr>{tab}</table></div>
<p class="mu sm">Costo e risparmio sono stime: stessi token tutti in Opus (${r['opus']:.2f}) contro il costo reale. Cache letta {kt(r['cr'])} token. Prezzi in ~/.config/onmake-gear/prezzi.json.{nota}</p></section>
</body></html>"""

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--cartella", default=os.getcwd())
    p.add_argument("--sessione")
    p.add_argument("--json", action="store_true")
    p.add_argument("--html")
    a = p.parse_args()
    sess = sessione(a.cartella, a.sessione)
    r = riepilogo(sess)
    if a.html:
        os.makedirs(os.path.dirname(a.html), exist_ok=True)
        open(a.html, "w").write(pagina(r, sess))
        print("Scritto", a.html)
    else:
        print(json.dumps(breve(r), ensure_ascii=False))
