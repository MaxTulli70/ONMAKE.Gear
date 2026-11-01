import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Dati, Sessione } from '../../types'

const COL: Record<string, string> = { light: '#7bb8e8', medium: '#6fc08a', high: '#e8b64a', opus: '#a78bd0', max: '#d9694f' }
const GRIGIO = '#9a9aa5'
const dati = atom({ plugin: 'onmake-gear', key: 'dati' } as const, null)
const aperta = atom({ plugin: 'onmake-gear', key: 'aperta' } as const, false)
const sessioni = atom({ plugin: 'onmake-gear', key: 'sessioni' } as const, [] as Sessione[])
const scelta = atom({ plugin: 'onmake-gear', key: 'scelta' } as const, '')
const comando = atom({ plugin: 'onmake-gear', key: 'comando' } as const, '')

const kt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : `${n}`)
const dur = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m` : `${s}s`)

async function home($: EngineInterface) {
  return (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
}

// Runs the script on this session's transcript; the answer is a few hundred bytes of JSON.
async function ricarica($: EngineInterface) {
  const script = `${$.plugin.root}/scripts/pannello.py`
  const r = await $.process.run(['python3', script, '--cartella', await $.session.cwd(), '--sessione', await $.session.id(), '--json'])
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
  const parts = [lev(d), `${kt(d.tok)} tok`]
  if (!compact) parts.push(ag(d), pct(d), dur(d.el) + (d.eta ? `/${dur(d.el + d.eta)}` : ''))
  return parts.filter(x => x !== '').join(' · ')
}

// Desktop: the bar is drawn as SVG, so the type is small and even, every cell is the same size and the level is a pill.
// shortcut: text widths are estimated (6.3 px per character at 11 px), so a very long label may sit a little loose.
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const largo = (t: string) => Math.ceil([...t].length * 6.3)
const STILE = '<style>text{font:500 11px -apple-system,system-ui,sans-serif;fill:#55554f}.mu{fill:#8a8a84}.v{fill:#d6d6cf}.pl{font-weight:650;fill:#1c1c1a}@media(prefers-color-scheme:dark){text{fill:#c9c9d1}.mu{fill:#8d8d97}.v{fill:#3a3a42}}</style>'

function svgRiga(d: Dati, tinta: boolean, compact: boolean) {
  const out: string[] = []
  let x = 0
  const H = 22, Y = 15
  const t = (s: string, cls = '', col?: string) => {
    out.push(`<text x="${x}" y="${Y}"${cls ? ` class="${cls}"` : ''}${col ? ` style="fill:${col}"` : ''}>${esc(s)}</text>`)
    x += largo(s)
  }
  const sp = (n = 8) => { x += n }
  const sep = () => { sp(6); out.push(`<circle cx="${x}" cy="11" r="1.3" class="v" style="fill:#b9b9b2"/>`); sp(8) }
  const celle = (f: number, col: string) => {
    const n = Math.max(0, Math.min(5, Math.round(f * 5)))
    for (let i = 0; i < 5; i++) out.push(`<rect x="${x + i * 9}" y="6.5" width="7" height="9" rx="1.6"${i < n ? ` style="fill:${tinta ? col : '#8a8a84'}"` : ' class="v"'}/>`)
    x += 45 + 4
  }
  const lv = d.livello ? d.livello.toUpperCase() : 'nessuna marcia'
  const pill = `⚙ ${lv}${d.dir === '▲' || d.dir === '▼' ? ' ' + d.dir : ''}`
  const pw = largo(pill) + 12
  out.push(`<rect x="0" y="2.5" width="${pw}" height="17" rx="8.5" style="fill:${d.livello && tinta ? COL[d.livello] : '#d6d6cf'}"/>`)
  out.push(`<text x="6" y="${Y}" class="pl">${esc(pill)}</text>`)
  x = pw
  sep(); t(`${kt(d.tok)} tok`, 'mu')
  if (!compact) {
    sep()
    t(`▶ ${d.lavorano}`, '', tinta ? COL.medium : undefined); sp(6)
    t(`⏸ ${d.fermi}`, '', tinta ? COL.high : undefined); sp(6)
    t(`✓ ${d.completi}`, 'mu')
    if (d.interrotti > 0) { sp(6); t(`✗ ${d.interrotti}`, 'mu') }
    sep()
    celle(d.perc ?? 0, COL.medium); t(d.perc !== null ? `${Math.round(d.perc * 100)}%` : '–%', d.perc !== null ? '' : 'mu')
    sep()
    if (d.eta !== null) { celle(d.el / (d.el + d.eta), COL.high); t(`${dur(d.el)} / ${dur(d.el + d.eta)}`) }
    else t(`⏱ ${dur(d.el)}`, 'mu')
  }
  const w = Math.ceil(x + 2)
  return { source: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${H}" viewBox="0 0 ${w} ${H}">${STILE}${out.join('')}</svg>`, width: w }
}

function svgTasto(s: string, col?: string) {
  const w = largo(s) + 4
  return { source: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="22" viewBox="0 0 ${w} 22">${STILE}<text x="2" y="15"${col ? ` style="fill:${col}"` : ' class="mu"'}>${esc(s)}</text></svg>`, width: w }
}

// ONMAKE hexagon logo (assets/onmake-logo.svg), vector so it stays sharp at 19 px; a press opens the site.
const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" width="19" height="22" viewBox="0 -9 100 122"><defs> <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"> <stop offset="0" stop-color="#8fbc7c"/><stop offset="0.45" stop-color="#6aa057"/><stop offset="1" stop-color="#5f9a4e"/> </linearGradient> <linearGradient id="f" x1="0" y1="0" x2="1" y2="1"> <stop offset="0" stop-color="#4a4a48"/><stop offset="1" stop-color="#2f2f2e"/> </linearGradient> </defs> <path d="M50 3 L92.4 27.5 Q94 28.4 94 30.3 L94 73.7 Q94 75.6 92.4 76.5 L50 101 L7.6 76.5 Q6 75.6 6 73.7 L6 30.3 Q6 28.4 7.6 27.5 Z" fill="url(#f)"/> <path d="M50 12.5 L85.5 33 L85.5 71 L50 91.5 L14.5 71 L14.5 33 Z" fill="url(#g)" stroke="#6b6b69" stroke-width="0.8"/> <path d="M14.5 33 L50 12.5 L85.5 33 L85.5 40 Q50 32 14.5 66 Z" fill="#ffffff" opacity="0.12"/> <text x="50" y="58" text-anchor="middle" font-family="Futura, 'Avenir Next', 'Century Gothic', system-ui, sans-serif" font-weight="600" font-size="15.5" textLength="66" lengthAdjust="spacingAndGlyphs" fill="#363634">ONMAKE</text></svg>`
const SITO = 'https://www.onmake.it'

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
    .map(x => ({ id: String(x.session_id ?? x.sessionId ?? x.id ?? ''), nome: String(x.title ?? x.name ?? x.session_id ?? x.id ?? '').slice(0, 40) }))
    .filter(x => x.id !== '')
}

async function caricaSessioni($: EngineInterface) {
  try {
    const r = await $.tool.call({ tool: 'mcp__ccd_session_mgmt__list_sessions' } as never)
    const l = elenco(r)
    await update($, sessioni, () => l)
    if (l.length > 0 && (await read($, scelta)) === '') await update($, scelta, () => l[0].id)
  } catch (err) {
    $.ui.toast(`Gear: sessioni non lette (${String(err).slice(0, 60)})`)
  }
}

async function azione($: EngineInterface, cosa: 'invia' | 'ferma' | 'riprendi') {
  const id = await read($, scelta)
  const msg = cosa === 'riprendi' ? 'continua da dove eri rimasto' : (await read($, comando)).trim()
  if (id === '') return $.ui.toast('Gear: scegli una sessione')
  if (cosa === 'invia' && msg === '') return $.ui.toast('Gear: scrivi un comando')
  try {
    const r = cosa === 'ferma'
      ? await $.tool.call({ tool: 'mcp__ccd_session_mgmt__stop_session', session_id: id } as never)
      : await $.tool.call({ tool: 'mcp__ccd_session_mgmt__send_message', session_id: id, message: msg } as never)
    const o = r as { isError?: boolean }
    const t = testo(r).slice(0, 80)
    $.ui.toast(o.isError ? `Gear: errore, ${t}` : `Gear: ${cosa === 'ferma' ? 'fermata' : 'inviato'}. ${t}`)
    if (cosa === 'invia' && !o.isError) await update($, comando, () => '')
  } catch (err) {
    $.ui.toast(`Gear: non riuscito (${String(err).slice(0, 80)})`)
  }
}

async function apriChiudi($: EngineInterface) {
  const ora = await update($, aperta, v => !v)
  if (ora) void caricaSessioni($)
}

let last = 0

// At most one run every 15 s: a long transcript takes a couple of seconds to read.
async function aggiorna($: EngineInterface, below: boolean, compact: boolean) {
  const now = await $.clock.now()
  if (now - last < 15000) return
  last = now
  const d = await ricarica($).catch(() => undefined)
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

  on('turn.complete', async ($, e, next) => {
    void aggiorna($, below, compact)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const sotto = await next(e).catch(() => undefined)
    const d = await read($, dati)
    if (below || e.props.hasSurvey || d === null) return sotto ?? next(e)

    const open = await read($, aperta)
    const { Box, Text, Button, Input, Select } = $.ui.resolve(e)
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
    const { Svg } = $.ui.resolve(e) as unknown as { Svg: (p: { source: string; alt: string; width?: number; height?: number }) => JSX.Element }
    const tasto = (k: string, s: string, fn: () => unknown, col?: string) => {
      if (!desk) return <Button key={k} plain onPress={fn}><Text color={col} dimColor={!col}>{s}</Text></Button>
      const g = svgTasto(s, col)
      return <Button key={k} plain onPress={fn}><Svg source={g.source} alt={s} width={g.width} height={22} /></Button>
    }
    const riga1 = svgRiga(d, tinta, compact)
    const testaDesk = (
      <Box flexDirection="row" alignItems="center" gap={2} width={e.props.bodyColumns}>
        <Box flexGrow={1} flexShrink={1} overflow="hidden">
          <Svg source={riga1.source} alt={riga(d, compact)} width={riga1.width} height={22} />
        </Box>
        <Box flexShrink={0} flexDirection="row" gap={1} alignItems="center">
          <Button key="onmake" plain onPress={() => apriSito($).catch(() => $.ui.toast('Gear: sito non aperto'))}>
            <Svg source={LOGO} alt="ONMAKE, apre onmake.it" width={19} height={22} />
          </Button>
          {tasto('tendina', open ? 'Chiudi ▴' : 'Dettagli ▾', () => apriChiudi($))}
          {tasto('pannello', 'Pannello ↗', () => apriPannello($).catch(() => $.ui.toast('Gear: pannello non aperto')))}
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
            {sep}<Text dimColor>{kt(d.tok)} tok</Text>
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

    const lista = await read($, sessioni)
    const sel = await read($, scelta)
    const cmd = await read($, comando)
    const icona: Record<string, string> = { lavora: '▶', fermo: '⏸', completato: '✓' }

    return stack(
      <Box flexDirection="column" width={e.props.bodyColumns}>
        {testa}
        {d.righe.length === 0 && d.interrotti === 0 && <Text dimColor>Nessun agente in questa sessione.</Text>}
        {d.righe.map((x, i) => (
          <Text key={String(i)} size="footnote" wrap="truncate-end" dimColor={x.stato === 'completato'}>
            <Text color={x.stato === 'fermo' ? c('high') : c(x.liv, tinta ? GRIGIO : undefined)}>{icona[x.stato] ?? '·'} {x.nome}{x.dir === '▲' || x.dir === '▼' ? ' ' + x.dir : ''}</Text>
            <Text dimColor>  {x.stato === 'fermo' ? `fermo da ${dur(x.ago)}  ` : ''}{x.model}  {kt(x.tok)} tok  {x.desc}</Text>
          </Text>
        ))}
        {d.interrotti > 0 && <Text size="footnote" dimColor>✗ {d.interrotti} interrotti (mai finiti, fermi da oltre 1h)</Text>}
        <Box flexDirection="row" gap={2} flexWrap="wrap" alignItems="center">
          {lista.length > 0
            ? <Select key="sessione" label="Sessione" options={lista.map(x => ({ value: x.id, label: x.nome || x.id.slice(0, 8) }))} value={sel || lista[0].id} onSelect={v => void update($, scelta, () => v)} />
            : tasto('ricarica', 'Carica sessioni ↻', () => caricaSessioni($))}
          {tasto('invia', 'Invia comando', () => azione($, 'invia'), c('light'))}
          {tasto('ferma', 'Ferma', () => azione($, 'ferma'), c('max'))}
          {tasto('riprendi', 'Riprendi', () => azione($, 'riprendi'), c('medium'))}
        </Box>
        <Box width={e.props.bodyColumns} flexDirection="column">
          <Input key="comando" rows={3} label="Comando" placeholder="Comando per la sessione scelta: scrivi e premi Invio" value={cmd} submitLabel="invia" onInput={v => void update($, comando, () => v)} onSubmit={v => void update($, comando, () => v).then(() => azione($, 'invia'))} />
        </Box>
      </Box>,
    )
  })
}
