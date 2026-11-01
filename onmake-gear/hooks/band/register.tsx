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
// shortcut: text widths are estimated (7.4 px per character at 13 px), so a very long label may sit a little loose.
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const largo = (t: string) => Math.ceil([...t].length * 7.4)
const STILE = '<style>text{font:400 13px -apple-system,system-ui,sans-serif;fill:#55554f}.mu{fill:#8a8a84}.v{fill:#d6d6cf}@media(prefers-color-scheme:dark){text{fill:#c9c9d1}.mu{fill:#8d8d97}.v{fill:#3a3a42}}</style>'

function svgRiga(d: Dati, tinta: boolean, compact: boolean) {
  const out: string[] = []
  let x = 0
  const H = 24, Y = 16.5
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
    const h = 5 + i * 3.5
    out.push(`<rect x="${i * 7}" y="${20 - h}" width="5" height="${h}" rx="1.2"${i <= k ? ` style="fill:${tinta ? COL[m] : '#55554f'}"` : ' class="v"'}/>`)
  })
  x = 5 * 7 + 6
  if (k >= 0) {
    t(d.livello!.toUpperCase(), '', tinta ? COL[d.livello!] : undefined); sp(4)
    t(`${k + 1}/5${d.dir === '▲' ? ' ▲' : d.dir === '▼' ? ' ▼' : ''}`, 'mu')
  } else t('nessuna marcia', 'mu')
  // The model the chat is using now, e.g. 'opus-5-5' -> 'Opus 5.5'.
  if (d.chat) { const [f, ...v] = d.chat.split('-'); sp(8); t(`${f.charAt(0).toUpperCase()}${f.slice(1)} ${v.join('.')}`, 'mu') }
  sep(); t(`${kt(d.tok)} tok`, 'mu')
  if (!compact) {
    // Only what is useful now: the current job (since your last message); counts at zero and a missing task list are left out.
    const n: [number, string, string | undefined][] = [[d.lavorano, '▶', COL.medium], [d.fermi, '⏸', COL.high], [d.completi, '✓', undefined], [d.interrotti, '✗', undefined]]
    const vivi = n.filter(([k]) => k > 0)
    if (vivi.length > 0) {
      sep(); t('agenti', 'mu'); sp(5)
      vivi.forEach(([k, g, col], i) => { if (i) sp(6); t(`${g} ${k}`, col ? '' : 'mu', tinta ? col : undefined) })
    }
    // Who is working now and on what: the working agent and its task, else the main chat and the current step or your last request.
    const a0 = d.attivi[0]
    sep()
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
    const { Svg } = $.ui.resolve(e) as unknown as { Svg: (p: { source: string; alt: string; width?: number; height?: number; isInteractive?: boolean }) => JSX.Element }
    const tasto = (k: string, s: string, fn: () => unknown, col?: string) => {
      // A Button holds only strings and Text (an Svg inside is refused), so its label is Text on every surface.
      return <Button key={k} plain onPress={fn}><Text color={col} dimColor={!col}>{s}</Text></Button>
    }
    const riga1 = svgRiga(d, tinta, compact)
    const testaDesk = (
      <Box flexDirection="row" alignItems="center" gap={1} width={e.props.bodyColumns}>
        <Box flexGrow={1} flexShrink={1} overflow="hidden">
          <Svg source={riga1.source} alt={riga(d, compact)} width={riga1.width} height={24} />
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
          {tasto('tendina', open ? '⬆' : '⬇', () => apriChiudi($))}
          {tasto('pannello', '⬈', () => apriPannello($).catch(() => $.ui.toast('Gear: pannello non aperto')))}
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
