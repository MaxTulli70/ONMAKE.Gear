import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Dati, Passo, Sessione } from '../../types'

// Model colours from the gear schema, darkened to read as text.
const colMod = (m: string, eff = '') => /haiku/i.test(m) ? '#5f9a6c' : /sonnet/i.test(m) ? (/high|max/.test(eff) ? '#8a78b0' : '#5c82a8') : /opus/i.test(m) ? '#c0714f' : undefined
const COL: Record<string, string> = { light: '#7bb8e8', medium: '#6fc08a', high: '#e8b64a', opus: '#a78bd0', max: '#d9694f' }
// Same as plugin.json: the engine does not hand the version to the module.
const VERSIONE = '0.6.48'
const GRIGIO = '#9a9aa5'
const dati = atom({ plugin: 'onmake-gear', key: 'dati' } as const, null)
// Model and effort of the main chat's last model request, as the engine sends it.
const passo = atom({ plugin: 'onmake-gear', key: 'passo' } as const, null as Passo | null)
const aperta = atom({ plugin: 'onmake-gear', key: 'aperta' } as const, false)
const sessioni = atom({ plugin: 'onmake-gear', key: 'sessioni' } as const, [] as Sessione[])
const scelta = atom({ plugin: 'onmake-gear', key: 'scelta' } as const, '')
const vista = atom({ plugin: 'onmake-gear', key: 'vista' } as const, 'tot')
const reset = atom({ plugin: 'onmake-gear', key: 'reset' } as const, '')
const comando = atom({ plugin: 'onmake-gear', key: 'comando' } as const, '')

// 'claude-opus-5-5' or 'opus-5-5' -> 'Opus 5.5'
const nomeModello = (m: string) => { const [f, ...v] = m.replace(/^claude-/, '').split('-'); return f ? `${f.charAt(0).toUpperCase()}${f.slice(1)} ${v.join('.')}`.trim() : m }
const kt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")
const dur = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m` : `${s}s`)

async function home($: EngineInterface) {
  return (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
}

// Runs the script on this session's transcript; the answer is a few hundred bytes of JSON.
async function ricarica($: EngineInterface) {
  const script = `${$.plugin.root}/scripts/pannello.py`
  // Workflow view: only what came after the partial reset (or after the start, if never reset).
  const vv = await read($, vista).catch(() => 'tot')
  const da = vv === 'wf' ? await read($, reset).catch(() => '') : vv === 'live' ? inizioTurno : ''
  const r = await $.process.run(['python3', script, '--cartella', await $.session.cwd(), '--sessione', await $.session.id(), '--json', ...(da ? ['--da', da] : [])])
  if (r.exitCode !== 0) return undefined
  const d = JSON.parse(r.stdout) as Dati
  await update($, dati, () => d)
  return d
}

// Small bar of 5 cells, 20% each; the share is a real ratio, never a made-up one.
const bar = (f: number) => '▰'.repeat(Math.round(f * 5)) + '▱'.repeat(5 - Math.round(f * 5))
const pct = (d: Dati) => (d.perc === null ? '' : `${Math.round(d.perc * 100)}% ${d.fatti}/${d.tot}`)
const ag = (d: Dati) => `▶${d.lavorano} ⏸${d.fermi} ✓${d.completi}${d.interrotti > 0 ? ` ✗${d.interrotti}` : ''}`
const lev = (d: Dati) => `⚙ ${d.livello ? d.livello.toUpperCase() : '-'}${d.dir === '▲' || d.dir === '▼' ? ' ' + d.dir : ''}`

// Plain text for the status line (position below); the bar above draws the same parts in color.
function riga(d: Dati, compact: boolean) {
  const parts = [lev(d), `${kt(d.tok)} token`]
  if (!compact) parts.push(ag(d), pct(d), dur(d.el) + (d.eta ? `/${dur(d.el + d.eta)}` : ''))
  return parts.filter(x => x !== '').join(' · ')
}

// Desktop: the bar is drawn as SVG, so the type is small and even, every cell is the same size and the level is a pill.
// shortcut: text widths are estimated (7.4 px per character at 13 px), so a very long label may sit a little loose.
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
// Width per character at 14 px: capitals and digits are wider than lower case, spaces narrower.
const largo = (t: string) => Math.ceil([...t].reduce((w, ch) => w + (ch === ' ' ? 3.5 : /[A-Z0-9%]/.test(ch) ? 8.2 : /[▶⏸✓✗↓↑]/.test(ch) ? 10.3 : 6.7), 0))
const STILE = '<style>text{font:400 12px -apple-system,system-ui,sans-serif;fill:#55554f}.sm{font-size:10px;letter-spacing:.3px}.mu{fill:#8a8a84}.v{fill:#d6d6cf}@media(prefers-color-scheme:dark){text{fill:#c9c9d1}.mu{fill:#8d8d97}.v{fill:#3a3a42}}</style>'

function svgRiga(d: Dati, tinta: boolean, compact: boolean, p: Passo | null) {
  const out: string[] = []
  let x = 0
  const H = 26, Y = 18
  const t = (s: string, cls = '', col?: string) => {
    out.push(`<text x="${x}" y="${Y}"${cls ? ` class="${cls}"` : ''}${col ? ` style="fill:${col}"` : ''}>${esc(s)}</text>`)
    x += largo(s)
  }
  const sp = (n = 8) => { x += n }
  const sep = () => { sp(6); out.push(`<circle cx="${x}" cy="12" r="1.3" class="v" style="fill:#b9b9b2"/>`); sp(8) }
  const celle = (f: number, col: string) => {
    const n = Math.max(0, Math.min(5, Math.round(f * 5)))
    for (let i = 0; i < 5; i++) out.push(`<rect x="${x + i * 10}" y="6.5" width="8" height="11" rx="1.8"${i < n ? ` style="fill:${tinta ? col : '#8a8a84'}"` : ' class="v"'}/>`)
    x += 50 + 4
  }
  // Gear ladder: five steps rising from LIGHT to MAX, filled up to the current gear, each in its own color; then the name and the step.
  const MARCE = ['light', 'medium', 'high', 'opus', 'max']
  const k = d.livello ? MARCE.indexOf(d.livello) : -1
  MARCE.forEach((m, i) => {
    const h = 4 + i * 2.6
    out.push(`<rect x="${i * 5.5}" y="${20 - h}" width="4" height="${h}" rx="1"${i <= k ? ` style="fill:${tinta ? COL[m] : '#55554f'}"` : ' class="v"'}/>`)
  })
  x = 5 * 5.5 + 6
  if (k >= 0) {
    // The gear name a little smaller than the rest (11 px).
    const nome = d.livello!.toUpperCase()
    out.push(`<text x="${x}" y="${Y}" class="sm"${tinta ? ` style="fill:${COL[d.livello!]}"` : ''}>${esc(nome)}</text>`)
    x += Math.ceil(largo(nome) * 0.85); sp(4)
    if (d.dir === '▲' || d.dir === '▼') { t(d.dir, 'mu'); sp(2) }
  } else t('nessuna marcia', 'mu')
  // The model the chat is using now, e.g. 'opus-5-5' -> 'Opus 5.5'.
  // Model and effort the chat is using now, then the tokens of the current job per model.
  const mod = p?.model || d.chat
  if (mod) { sep(); t('chat', 'mu'); sp(5); t(nomeModello(mod), '', tinta ? colMod(mod, p?.effort) : undefined); if (p?.effort) { sp(5); t(p.effort, 'mu') } }
  // Tokens of the current job per model; nothing while the job has used none yet.
  if (d.tokmod && d.tokmod.length > 0) { sep(); d.tokmod.slice(0, 3).forEach(([m, n], i) => { if (i) sp(8); t(nomeModello(m).split(' ')[0], '', tinta ? colMod(m) : undefined); sp(4); t(`${kt(n)} token`) }) }
  else if (d.tok > 0) { sep(); t(`${kt(d.tok)} token`, 'mu') }
  // Whole session: all tokens so far and how many agents it has used.
  if (d.stok) { sep(); t('questa chat', 'mu'); sp(4); t(`${kt(d.stok)} token`); if (d.sag) { sp(6); t(`${d.sag} agenti`, 'mu') } }
  if (!compact) {
    // Only what is useful now: the current job (since your last message); counts at zero and a missing task list are left out.
    const n: [number, string, string | undefined][] = [[d.lavorano, '▶', COL.medium], [d.fermi, '⏸', COL.high], [d.completi, '✓', undefined], [d.interrotti, '✗', undefined]]
    const vivi = n.filter(([k]) => k > 0)
    const tokAg = d.righe.reduce((a, r) => a + (r.tok || 0), 0)
    if (vivi.length > 0 || tokAg > 0) {
      sep(); t('agenti', 'mu'); sp(5)
      vivi.forEach(([k, g, col], i) => { if (i) sp(6); t(`${g} ${k}`, col ? '' : 'mu', tinta ? col : undefined) })
      if (tokAg > 0) { sp(8); t(`${kt(tokAg)} token`) }
    }
    // Who is working now and on what: the working agent and its task, else the main chat and the current step or your last request.
    const a0 = d.attivi[0]
    if (a0 || d.compito) sep()
    if (a0) t(`▶ ${a0.nome}: ${a0.desc.slice(0, 40)}`, '', tinta ? COL[a0.liv] ?? GRIGIO : undefined)
    else if (d.compito) t(`chat: ${d.compito.slice(0, 48)}`)
    if (d.perc !== null) { sep(); celle(d.perc, COL.medium); t(`${Math.round(d.perc * 100)}% (${d.fatti}/${d.tot} passi)`) }
    // Time only as an estimate of what is left, when a task list allows one; a bare timer told nothing.
    if (d.eta !== null) { sep(); t(`restano ~${dur(d.eta)}`, '', tinta ? COL.high : undefined) }
  }
  const w = Math.ceil(x + 2)
  return { source: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${H}" viewBox="0 0 ${w} ${H}">${STILE}${out.join('')}</svg>`, width: w }
}

// ONMAKE logo (assets/onmake-logo.svg) with its link to the site inside the SVG.
const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="32" height="34" viewBox="0 -5 100 114"><a href="https://www.onmake.it" xlink:href="https://www.onmake.it" target="_blank" rel="noopener"><title>onmake.it</title><defs> <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"> <stop offset="0" stop-color="#8fbc7c"/><stop offset="0.45" stop-color="#6aa057"/><stop offset="1" stop-color="#5f9a4e"/> </linearGradient> <linearGradient id="f" x1="0" y1="0" x2="1" y2="1"> <stop offset="0" stop-color="#4a4a48"/><stop offset="1" stop-color="#2f2f2e"/> </linearGradient> </defs> <path d="M50 3 L92.4 27.5 Q94 28.4 94 30.3 L94 73.7 Q94 75.6 92.4 76.5 L50 101 L7.6 76.5 Q6 75.6 6 73.7 L6 30.3 Q6 28.4 7.6 27.5 Z" fill="url(#f)"/> <path d="M50 12.5 L85.5 33 L85.5 71 L50 91.5 L14.5 71 L14.5 33 Z" fill="url(#g)" stroke="#6b6b69" stroke-width="0.8"/> <path d="M14.5 33 L50 12.5 L85.5 33 L85.5 40 Q50 32 14.5 66 Z" fill="#ffffff" opacity="0.12"/> <text x="50" y="58" text-anchor="middle" font-family="Futura, 'Avenir Next', 'Century Gothic', system-ui, sans-serif" font-weight="600" font-size="15.5" textLength="66" lengthAdjust="spacingAndGlyphs" fill="#363634">ONMAKE</text></a></svg>`
const SITO = 'https://www.onmake.it'

// One agent row of the dropdown, drawn like the bar so both share size and weight.
function svgAgente(x: { stato: string; liv: string; nome: string; dir: string; model: string; tok: number; ago: number; desc: string }, tinta: boolean) {
  const out: string[] = []
  let px = 0
  const t = (s: string, cls = '', col?: string) => {
    out.push(`<text x="${px}" y="17"${cls ? ` class="${cls}"` : ''}${col ? ` style="fill:${col}"` : ''}>${esc(s)}</text>`)
    px += largo(s)
  }
  const ic = x.stato === 'lavora' ? '▶' : x.stato === 'fermo' ? '⏸' : '✓'
  const col = x.stato === 'fermo' ? COL.high : COL[x.liv] ?? GRIGIO
  t(`${ic} ${x.nome}${x.dir === '▲' || x.dir === '▼' ? ' ' + x.dir : ''}`, x.stato === 'completato' ? 'mu' : '', tinta && x.stato !== 'completato' ? col : undefined)
  px += 10
  if (x.stato === 'fermo') { t(`fermo da ${dur(x.ago)}`, '', tinta ? COL.high : undefined); px += 10 }
  t(nomeModello(x.model), 'mu'); px += 10
  t(`${kt(x.tok)} token`, 'mu'); px += 10
  t(x.desc, x.stato === 'completato' ? 'mu' : '')
  const w = Math.ceil(px + 2)
  return { source: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="24" viewBox="0 0 ${w} 24">${STILE}${out.join('')}</svg>`, width: w }
}

// A plain label drawn like the bar, so it has the bar's text size.
function svgPillola(s: string, on: boolean) {
  const w = Math.ceil(largo(s) * 1.08 + 20)
  return { source: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="22" viewBox="0 0 ${w} 22">${STILE}<rect x="0.5" y="0.5" width="${w - 1}" height="21" rx="10.5" style="fill:${on ? '#55554f' : 'none'};stroke:${on ? '#55554f' : '#c9c9c2'}"/><text x="${w / 2}" y="15" text-anchor="middle"${on ? ' style="fill:#ffffff"' : ' class="mu"'}>${esc(s)}</text></svg>`, width: w }
}

function svgScritta(s: string, col?: string) {
  const w = Math.ceil(largo(s) * 1.08 + 8)
  return { source: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="18" viewBox="0 0 ${w} 18">${STILE}<text x="0" y="13"${col ? ` style="fill:${col}"` : ' class="mu"'}>${esc(s)}</text></svg>`, width: w }
}

// Bar of where the session tokens went: main chat and each gear's agents, with the share of each.
function svgBarra(pl: Record<string, [number, number]>, tot: number, tinta: boolean) {
  const W = 380
  const liv = ['light', 'medium', 'high', 'opus']
  const ag = liv.reduce((a, k) => a + (pl[k]?.[1] ?? 0), 0)
  const parti: [string, number, string][] = [['chat', Math.max(0, tot - ag), '#c0714f'], ...liv.map(k => [k.toUpperCase(), pl[k]?.[1] ?? 0, COL[k]] as [string, number, string])]
  let x = 0, lx = 0
  const out: string[] = [`<text x="0" y="10" class="mu sm">chi ha usato i token</text>`, `<rect x="0" y="16" width="${W}" height="10" rx="3" class="v"/>`]
  for (const [nome, n, col] of parti) {
    if (!tot || !n) continue
    const w = Math.max(2, n / tot * W)
    out.push(`<rect x="${x.toFixed(1)}" y="16" width="${w.toFixed(1)}" height="10" style="fill:${tinta ? col : GRIGIO}"/>`)
    x += w
    const s = `${nome} ${(n / tot * 100).toFixed(1).replace('.', ',')}%`
    out.push(`<rect x="${lx}" y="33" width="8" height="8" rx="2" style="fill:${tinta ? col : GRIGIO}"/><text x="${lx + 12}" y="41" class="sm mu">${s}</text>`)
    lx += 12 + largo(s) * 0.9 + 14
  }
  return { source: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="46" viewBox="0 0 ${W} 46">${STILE}${out.join('')}</svg>`, width: W }
}

// Grid of the 4 gears: colour, name, agents used and their tokens in this session.
function svgGriglia(pl: Record<string, [number, number]>, tinta: boolean, attuale: string | null) {
  const liv = ['light', 'medium', 'high', 'opus']
  const mod: Record<string, string> = { light: 'Haiku', medium: 'Sonnet', high: 'Sonnet', opus: 'Opus' }
  const righe = liv.map((k, i) => {
    const [n, tk] = pl[k] ?? [0, 0]
    const y = 28 + i * 16
    const on = attuale === k || (attuale === 'max' && k === 'opus')
    return `<rect x="0" y="${y - 9}" width="8" height="8" rx="2" style="fill:${tinta ? COL[k] : GRIGIO}"/>`
      + `<text x="14" y="${y}" class="sm"${on ? ` style="fill:${tinta ? COL[k] : GRIGIO}"` : ''}>${k.toUpperCase()}</text>`
      + `<text x="86" y="${y}" class="mu">${mod[k]}</text>`
      + `<text x="170" y="${y}" class="mu" text-anchor="end">${n}</text>`
      + `<text x="254" y="${y}"${n ? '' : ' class="mu"'} text-anchor="end">${kt(tk)}</text>`
  })
  const testa = `<text x="86" y="10" class="mu sm">modello</text><text x="170" y="10" class="mu sm" text-anchor="end">agenti</text><text x="254" y="10" class="mu sm" text-anchor="end">token</text>`
  return { source: `<svg xmlns="http://www.w3.org/2000/svg" width="258" height="84" viewBox="0 0 258 84">${STILE}${testa}${righe.join('')}</svg>`, width: 258 }
}

async function apriSito($: EngineInterface) {
  const windows = (await $.env.get('OS')) === 'Windows_NT'
  const mac = !windows && (await $.process.run(['uname'])).stdout.trim() === 'Darwin'
  await $.process.run(windows ? ['cmd', '/c', 'start', '', SITO] : [mac ? 'open' : 'xdg-open', SITO])
}

async function apriPannello($: EngineInterface) {
  const file = `${await home($)}/.config/onmake-gear/pannello.html`
  const script = `${$.plugin.root}/scripts/pannello.py`
  const r = await $.process.run(['python3', script, '--cartella', await $.session.cwd(), '--sessione', await $.session.id(), '--html', file])
  if (r.exitCode !== 0) return false
  const windows = (await $.env.get('OS')) === 'Windows_NT'
  const mac = !windows && (await $.process.run(['uname'])).stdout.trim() === 'Darwin'
  await $.process.run(windows ? ['cmd', '/c', 'start', '', file] : [mac ? 'open' : 'xdg-open', file])
  return true
}

// Session control: tools of the desktop app; their answer may be text or an object, so read it defensively.
function testo(r: unknown): string {
  if (typeof r === 'string') return r
  if (r && typeof r === 'object') {
    const o = r as { text?: unknown; result?: unknown; deny?: unknown }
    if (typeof o.deny === 'string') throw new Error(o.deny)
    if (typeof o.text === 'string') return o.text
    if (o.result !== undefined) return typeof o.result === 'string' ? o.result : JSON.stringify(o.result)
  }
  return JSON.stringify(r ?? '')
}

function elenco(r: unknown): Sessione[] {
  const t = testo(r)
  let v: unknown
  try {
    v = JSON.parse(t)
  } catch {
    const i = t.indexOf('['), j = t.lastIndexOf(']')
    v = i >= 0 && j > i ? JSON.parse(t.slice(i, j + 1)) : []
  }
  if (v && !Array.isArray(v) && typeof v === 'object') v = Object.values(v as object).find(Array.isArray) ?? []
  return (v as Record<string, unknown>[])
    .map(x => ({ id: String(x.session_id ?? x.sessionId ?? x.id ?? ''), nome: String(x.title ?? x.name ?? x.session_id ?? x.id ?? '').slice(0, 40), padre: String(x.startedBy ?? ''), fissata: x.pinned === true }))
    .filter(x => x.id !== '')
}

// Like the sidebar: pinned first, then by name; a session started by another sits under it with └.
function albero(l: (Sessione & { padre: string; fissata: boolean })[]): Sessione[] {
  const ids = new Set(l.map(x => x.id))
  const ord = (a: { nome: string; fissata: boolean }, b: { nome: string; fissata: boolean }) => Number(b.fissata) - Number(a.fissata) || a.nome.localeCompare(b.nome, 'it', { sensitivity: 'base' })
  const out: Sessione[] = []
  const giu = (padre: string, liv: number) => l.filter(x => (liv === 0 ? !ids.has(x.padre) : x.padre === padre)).sort(ord).forEach(x => {
    out.push({ id: x.id, nome: (liv ? '\u2003'.repeat(liv - 1) + '└ ' : '') + x.nome })
    if (liv < 4) giu(x.id, liv + 1)
  })
  giu('', 0)
  return out
}

async function caricaSessioni($: EngineInterface) {
  try {
    const r = await $.tool.call({ tool: 'mcp__ccd_session_mgmt__list_sessions', limit: 100 } as never)
    const l = albero(elenco(r))
    await update($, sessioni, () => l)
    if (l.length > 0 && (await read($, scelta)) === '') await update($, scelta, () => l[0].id)
  } catch (err) {
    $.ui.toast(`Gear: sessioni non lette (${String(err).slice(0, 60)})`)
  }
}

// The controls act on the chat this bar sits in: stop the running turn, resume, cancel, or send a command.
let turnoId: string | undefined
async function azione($: EngineInterface, cosa: 'invia' | 'ferma' | 'riprendi' | 'annulla', scritto?: string) {
  const msg = cosa === 'riprendi' ? 'continua da dove eri rimasto'
    : cosa === 'annulla' ? 'Lavoro annullato: non continuare il compito di prima, aspetta le mie istruzioni.'
    : (scritto ?? (await read($, comando))).trim()
  if (cosa === 'invia' && msg === '') return $.ui.toast('Gear: scrivi un comando')
  try {
    if (cosa === 'ferma' || cosa === 'annulla') {
      if (turnoId) await $.turn.abort({ turnId: turnoId }).catch(() => undefined)
      turnoId = undefined
      if (cosa === 'ferma') return $.ui.toast('Gear: fermata')
    }
    await $.prompt.submit({ text: msg })
    $.ui.toast(`Gear: ${cosa === 'annulla' ? 'annullato' : 'inviato'}`)
    if (cosa === 'invia') await update($, comando, () => '')
  } catch (err) {
    $.ui.toast(`Gear: non riuscito (${String(err).slice(0, 80)})`)
  }
}

async function apriChiudi($: EngineInterface) {
  await update($, aperta, v => !v)
}

let last = 0
let inizioTurno = '' // start of the current turn, for the live view

// At most one run every 15 s: a long transcript takes a couple of seconds to read.
async function aggiorna($: EngineInterface, below: boolean, compact: boolean) {
  const now = await $.clock.now()
  if (now - last < 15000) return
  last = now
  const d = await ricarica($).catch(() => undefined)
  if (!d) last = 0 // a failed read retries at the next turn instead of keeping old numbers
  if (below && d) $.ui.status(riga(d, compact))
}

export const register: Register = (on, options) => {
  const below = options.position === 'below'
  const compact = options.compact === true

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'gear-pannello', description: 'Open the Gear panel: agents, progress, tokens, saving' })
    void aggiorna($, below, compact)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'gear-pannello' }, async $ => {
    const ok = await apriPannello($).catch(() => false)
    return { text: ok ? 'Gear panel opened in the browser.' : 'Gear panel: could not build the page.' }
  })

  // turn.step streams, so the hook is a generator that passes every chunk through untouched.
  on('turn.start', ($, e, next) => {
    if (e.agentId === undefined) { turnoId = e.turnId; void $.clock.now().then(t => { inizioTurno = new Date(t).toISOString() }) }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      const v = { model: e.model, effort: e.effort === undefined ? '' : String(e.effort) }
      const was = await read($, passo).catch(() => null)
      if (!was || was.model !== v.model || was.effort !== v.effort) await update($, passo, () => v).catch(() => undefined)
      // live view: refresh while the turn runs too (still at most every 15 s)
      if ((await read($, vista).catch(() => 'tot')) === 'live') void aggiorna($, below, compact)
    }
    return yield* next(e)
  })

  on('turn.complete', async ($, e, next) => {
    void aggiorna($, below, compact)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const sotto = await next(e).catch(() => undefined)
    const d = await read($, dati)
    if (below || e.props.hasSurvey || d === null) return sotto ?? next(e)

    const open = await read($, aperta)
    const { Box, Text, Button } = $.ui.resolve(e)
    const tinta = options.colors !== false
    const c = (k: string | null | undefined, alt?: string) => (tinta ? (k && COL[k]) || alt : undefined)
    const stack = (mine: JSX.Element) => (sotto ? <Box flexDirection="column">{mine}{sotto}</Box> : mine)
    const sep = <Text dimColor>  ·  </Text>
    // Same glyph for full and empty cells, so every cell has the same size; only the color changes.
    const barra = (f: number, col: string | undefined) => {
      const n = Math.max(0, Math.min(5, Math.round(f * 5)))
      return (
        <Text>
          <Text color={col}>{'▰'.repeat(n)}</Text>
          <Text color={tinta ? '#d4d4cc' : undefined} dimColor={!tinta}>{'▰'.repeat(5 - n)}</Text>
        </Text>
      )
    }

    const desk = e.surface === 'desktop'
    const { Svg } = $.ui.resolve(e) as unknown as { Svg: (p: { source: string; alt: string; width?: number; height?: number; isInteractive?: boolean }) => JSX.Element }
    // Small button on desktop: the word drawn like the bar, a transparent button laid over it (as on the logo).
    const tastino = (k: string, s: string, fn: () => unknown, col?: string) => {
      if (!desk) return tasto(k, s, fn, col)
      const g = svgScritta(s, col)
      return (
        <Box key={k} position="relative">
          <Svg source={g.source} alt={s} width={g.width} height={24} />
          <Box position="absolute" top={0} left={0} right={0} bottom={0} justifyContent="center" alignItems="center" overflow="hidden">
            <Button key={k} plain onPress={fn}><Text>{'\u2002'}</Text></Button>
          </Box>
        </Box>
      )
    }
    const tasto = (k: string, s: string, fn: () => unknown, col?: string) => {
      // A Button holds only strings and Text (an Svg inside is refused), so its label is Text on every surface.
      return <Button key={k} plain onPress={fn}><Text color={col} dimColor={!col}>{s}</Text></Button>
    }
    const riga1 = svgRiga(d, tinta, compact, await read($, passo))
    const testaDesk = (
      <Box flexDirection="row" alignItems="center" gap={1} width={e.props.bodyColumns}>
        <Box flexGrow={1} flexShrink={1} overflow="hidden">
          <Svg source={riga1.source} alt={riga(d, compact)} width={riga1.width} height={26} />
        </Box>
        <Box flexShrink={0} flexDirection="row" gap={0} alignItems="center">
          {/* A button takes only text and the app does not follow a link inside an SVG, so a transparent button lies over the logo and opens the site. */}
          <Box position="relative">
            <Svg source={LOGO} alt="ONMAKE" width={32} height={34} />
            <Box position="absolute" top={0} left={0} right={0} bottom={0} justifyContent="center" alignItems="center">
              <Button key="onmake" plain onPress={() => apriSito($).catch(() => $.ui.toast('Gear: sito non aperto'))}>
                <Text>{'\u2003\u2003'}</Text>
              </Button>
            </Box>
          </Box>
          {tasto('tendina', open ? '↓' : '↑', () => apriChiudi($))}
          {tasto('pannello', '↗', () => apriPannello($).catch(() => $.ui.toast('Gear: pannello non aperto')))}
        </Box>
      </Box>
    )
    // One line that never wraps: the text part shrinks and is cut at the end, the two buttons keep their width.
    const testaTesto = (
      <Box flexDirection="row" alignItems="center" gap={2} width={e.props.bodyColumns}>
        <Box flexGrow={1} flexShrink={1} overflow="hidden">
          <Text wrap="truncate-end">
            {d.livello && tinta
              ? <Text backgroundColor={COL[d.livello]} color="#1c1c1a" bold> {lev(d)} </Text>
              : <Text dimColor bold>{lev(d)}</Text>}
            {sep}<Text dimColor>{kt(d.tok)} token</Text>
            {!compact && (
              <Text>
                {sep}
                <Text color={c('medium')}>▶{d.lavorano}</Text>
                <Text color={c('high')}> ⏸{d.fermi}</Text>
                <Text dimColor> ✓{d.completi}</Text>
                {d.interrotti > 0 && <Text color={tinta ? GRIGIO : undefined}> ✗{d.interrotti}</Text>}
                {d.perc !== null && <Text>{sep}{barra(d.perc, c('medium'))}<Text dimColor> {pct(d)}</Text></Text>}
                {sep}
                {d.eta !== null ? <Text>{barra(d.el / (d.el + d.eta), c('high'))}<Text dimColor> {dur(d.el)}/{dur(d.el + d.eta)}</Text></Text> : <Text dimColor>⏱ {dur(d.el)}</Text>}
              </Text>
            )}
          </Text>
        </Box>
        <Box flexShrink={0} flexDirection="row" gap={2}>
          <Button key="tendina" plain onPress={() => apriChiudi($)}>
            <Text dimColor>{open ? 'Chiudi ▴' : 'Dettagli ▾'}</Text>
          </Button>
          <Button key="pannello" plain onPress={() => apriPannello($).catch(() => $.ui.toast('Gear: pannello non aperto'))}>
            <Text dimColor>Pannello ↗</Text>
          </Button>
        </Box>
      </Box>
    )
    const testa = desk ? testaDesk : testaTesto
    if (!open) return stack(testa)

    const v = await read($, vista).catch(() => 'tot')
    const rs = await read($, reset).catch(() => '')
    const scritta = (s: string) => { const g = svgScritta(s); return <Svg source={g.source} alt={s} width={g.width} height={18} /> }
    // Facts of the current job (since your last message): time active, tokens split chat/agents, steps.
    const tokAg = d.righe.reduce((a, r) => a + (r.tok || 0), 0)
    const parti = [`lavoro attivo da ${dur(d.el)}`, `${kt(d.tok)} token`, `chat ${kt(Math.max(0, d.tok - tokAg))}`, `agenti ${kt(tokAg)}`]
    if (d.tot > 0) parti.push(`passi ${d.fatti} di ${d.tot}`)
    const r1 = parti.join(' · ')
    // Whole session, and the cost estimate (same tokens all in Opus as the reference).
    const r3 = [`${v === 'wf' ? 'workflow' : v === 'live' ? 'live' : 'chat'}${d.sel ? ' attiva ' + dur(d.sel) : ''}`, d.stok ? `${kt(d.stok)} token` : '', d.sag ? `${d.sag} agenti` : '', d.cr ? `cache ${kt(d.cr)}` : ''].filter(Boolean).join(' · ')
    // Saving in tokens, not money: tokens the agents did on models lower than Opus, and their share of the session.
    const bassi = ['light', 'medium', 'high'].reduce((a, k) => a + (d.perliv?.[k]?.[1] ?? 0), 0)
    const r4 = bassi > 0 ? `risparmio: ${kt(bassi)} token fatti da modelli più bassi di Opus${d.stok ? ` (${bassi / d.stok < 0.001 ? 'meno dello 0,1' : (bassi / d.stok * 100).toFixed(1).replace('.', ',')}% ${v === 'wf' ? 'del workflow' : v === 'live' ? 'del turno' : 'della chat'})` : ''}` : ''
    // Optimization index 0-100: how low the work ran. Weight per token: Haiku 1, Sonnet 2 (high 3), Opus 5; 0 = all Opus, 100 = all Haiku.
    const W: Record<string, number> = { light: 1, medium: 2, high: 3, opus: 5 }
    const pesoChat = /haiku/.test(d.chat) ? 1 : /sonnet/.test(d.chat) ? 2 : 5
    const totI = d.stok || d.tok
    const agI = ['light', 'medium', 'high', 'opus'].reduce((a, k) => a + (d.perliv?.[k]?.[1] ?? 0), 0)
    const pesato = ['light', 'medium', 'high', 'opus'].reduce((a, k) => a + (d.perliv?.[k]?.[1] ?? 0) * W[k], 0) + Math.max(0, totI - agI) * pesoChat
    const indice = totI ? Math.round((1 - pesato / (totI * 5)) / 0.8 * 100) : null
    const r5 = indice === null ? '' : `indice di ottimizzazione ${Math.max(0, Math.min(100, indice))}/100 (0 = tutto in Opus, 100 = tutto in Haiku)`
    const r2 = d.righe.length === 0 && d.interrotti === 0 ? 'Nessun agente: lavora solo la chat.' : ''
    const icona: Record<string, string> = { lavora: '▶', fermo: '⏸', completato: '✓' }

    const scegli = async (x: string) => { await update($, vista, () => x); last = 0; await ricarica($).catch(() => undefined) }
    const azzera = async () => { const ora = new Date(await $.clock.now()).toISOString(); await update($, reset, () => ora); await scegli('wf'); $.ui.toast('Gear: workflow azzerato da adesso') }
    const pill = (k: string, s: string) => {
      if (!desk) return tasto(k, v === k ? `[${s}]` : s, () => scegli(k))
      const g = svgPillola(s, v === k)
      return (
        <Box key={k} position="relative">
          <Svg source={g.source} alt={s} width={g.width} height={22} />
          <Box position="absolute" top={0} left={0} right={0} bottom={0} justifyContent="center" alignItems="center" overflow="hidden">
            <Button key={k} plain onPress={() => scegli(k)}><Text>{'\u2002'}</Text></Button>
          </Box>
        </Box>
      )
    }
    const sel = (
      <Box flexDirection="row" gap={1} alignItems="center">
        {pill('live', '● live')}
        {pill('wf', rs ? `workflow da ${new Date(rs).toTimeString().slice(0, 5)}` : 'workflow')}
        {pill('tot', 'totale chat')}
        {tastino('reset', '↺ nuovo workflow', azzera)}
      </Box>
    )

    return stack(
      <Box flexDirection="column" width={e.props.bodyColumns}>
        {testa}
        {sel}
        {r2 ? (desk ? scritta(r2) : <Text dimColor>{r2}</Text>) : null}
        {d.righe.map((x, i) => {
          if (!desk) return (
            <Text key={String(i)} wrap="truncate-end" dimColor={x.stato === 'completato'}>
              <Text color={x.stato === 'fermo' ? c('high') : c(x.liv, tinta ? GRIGIO : undefined)}>{icona[x.stato] ?? '·'} {x.nome}{x.dir === '▲' || x.dir === '▼' ? ' ' + x.dir : ''}</Text>
              <Text dimColor>  {x.stato === 'fermo' ? `fermo da ${dur(x.ago)}  ` : ''}{x.model}  {kt(x.tok)} token  {x.desc}</Text>
            </Text>
          )
          const g = svgAgente(x, tinta)
          return <Box key={String(i)} overflow="hidden"><Svg source={g.source} alt={`${x.nome} ${x.stato} ${x.desc}`} width={g.width} height={24} /></Box>
        })}
        {d.interrotti > 0 && <Text size="footnote" dimColor>✗ {d.interrotti} interrotti (mai finiti, fermi da oltre 1h)</Text>}
        <Box width={e.props.bodyColumns} flexDirection="row" justifyContent="flex-start" alignItems="flex-start" gap={4}>
        <Box flexDirection="column" flexShrink={1} gap={0}>
          {desk ? scritta(r1) : <Text dimColor>{r1}</Text>}
          {desk ? scritta(r3) : <Text dimColor>{r3}</Text>}
          {r4 ? (desk ? scritta(r4) : <Text dimColor>{r4}</Text>) : null}
          {r5 ? (desk ? scritta(r5) : <Text dimColor>{r5}</Text>) : null}
          {desk && (d.stok || d.tok) ? (() => { const g = svgBarra(d.perliv ?? {}, d.stok || d.tok, tinta); return <Svg source={g.source} alt="chi ha usato i token" width={g.width} height={46} /> })() : null}
        </Box>
        {desk ? (() => { const g = svgGriglia(d.perliv ?? {}, tinta, d.livello); return <Box flexShrink={0}><Svg source={g.source} alt="marce: agenti e token" width={g.width} height={84} /></Box> })() : null}
        </Box>
        {desk ? <Box flexDirection="row" justifyContent="flex-end"><Svg source={`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="16" viewBox="0 0 80 16">${STILE}<text x="80" y="12" class="sm mu" text-anchor="end">Gear ${VERSIONE}</text></svg>`} alt={`Gear ${VERSIONE}`} width={80} height={16} /></Box> : <Text dimColor>Gear {VERSIONE}</Text>}
      </Box>,
    )
  })
}
