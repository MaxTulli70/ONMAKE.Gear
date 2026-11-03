import { expect, test } from 'claude-code/testing'

const DATI = {
  tokmod: [['opus-5-5', 12000], ['haiku-5-5', 3000]], compito: 'prova', chat: 'opus-5-5', livello: 'medium', dir: '▲', agenti: 3, fini: 1, lavorano: 1, fermi: 1, interrotti: 0, completi: 1,
  attivi: [{ liv: 'high', tipo: 'gear-high', nome: 'high', desc: 'x', model: 'sonnet-5-5' }],
  tok: 1500000, cr: 0, reale: 1, opus: 2, risp: 0.5, perc: 0.4, fatti: 2, tot: 5, el: 600, eta: 900,
  righe: [{ liv: 'high', dir: '▲', model: 'sonnet-5-5', tok: 1000, fine: false, stato: 'lavora', ago: 5, tipo: 'gear-high', nome: 'high', desc: 'job' }],
}
const SEED: Record<string, unknown> = {
  dati: DATI, aperta: true, sessioni: [{ id: 'local_abc', nome: 'Coder' }], scelta: 'local_abc', comando: 'fai la prova',
}
const BAND = {
  plugin: 'onmake-gear',
  component: 'AbovePrompt',
  requestId: 'band',
  props: { bodyColumns: 100, hasSurvey: false, isWorking: false, maxRows: 20, scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

function seed(on: any) {
  // The engine's own band beneath the plugin.
  on('ui.render', ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  on('state.get', (_: unknown, e: { plugin: string; key: string }) => ({
    value: { value: e.plugin === 'onmake-gear' ? SEED[e.key] : undefined, version: 1 },
  }))
}

test('desktop: the bar is an Svg with the level and the share', async ($, on) => {
  seed(on)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const svg = await ui.find({ type: 'Svg' })
  expect((svg?.props as { source?: string })?.source).toContain('SONNET') // the MEDIUM gear is shown as SONNET
  expect((svg?.props as { source?: string })?.source).toContain('lavoro 10m') // work and time sit in the left block; steps (2/5) and shares are in the right block
  expect((svg?.props as { source?: string })?.source).not.toContain('Opus 5.5')
  expect(await ui.find({ key: 'onmake' })).toBeTruthy()
  expect(await ui.find({ key: 'tendina' })).toBeTruthy()
  expect(await ui.find({ key: 'pannello' })).toBeTruthy()
  expect(JSON.stringify(await ui.find({ type: 'Box' }))).not.toContain('job') // on desktop the single agent lines are no longer drawn: they are in the browser page
  await ui.unmount()
})

test('terminal: the bar is Text, no Svg', async ($, on) => {
  seed(on)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Svg' })).toBeFalsy()
  expect(await ui.find({ type: 'Text', text: /SONNET/ })).toBeTruthy()
  await ui.unmount()
})

test('desktop: the logo button opens the site', async ($, on) => {
  seed(on)
  const runs: string[][] = []
  on('process.run', (_: unknown, e: { argv?: string[]; args?: string[] }) => {
    runs.push((e.argv ?? e.args ?? []) as string[])
    return { value: { exitCode: 0, stdout: 'Darwin', stderr: '' } }
  })
  on('env.get', () => ({ value: undefined }))
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'onmake' })
  expect(JSON.stringify(runs)).toContain('https://www.onmake.it')
  await ui.unmount()
})

test('desktop: the language chosen in the guide changes the whole bar', async ($, on) => {
  on('ui.render', ($: any, e: any) => { const { Text } = $.ui.resolve(e); return <Text>engine</Text> })
  on('state.get', (_: unknown, e: { plugin: string; key: string }) => ({
    value: { value: e.plugin === 'onmake-gear' ? (e.key === 'lingua' ? 'en' : SEED[e.key]) : undefined, version: 1 },
  }))
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const svg = await ui.find({ type: 'Svg' })
  expect((svg?.props as { source?: string })?.source).toContain('work') // the labels follow the chosen language
  expect((svg?.props as { source?: string })?.source).not.toContain('lavoro')
  await ui.unmount()
})

const VERO = {"perliv": {"light": [0, 0], "medium": [0, 0], "high": [0, 0], "opus": [0, 0]}, "tokmod": [["opus-5-5", 1617]], "compito": "", "chat": "opus-5-5", "livello": null, "dir": "", "agenti": 0, "fini": 0, "lavorano": 0, "fermi": 0, "completi": 0, "interrotti": 0, "attivi": [], "tok": 1617, "stok": 426855, "sel": 711, "sag": 0, "cr": 8996378, "reale": 6.28, "opus": 7.68, "risp": 0.18235613632762637, "perc": null, "fatti": 0, "tot": 0, "el": 8, "eta": null, "righe": []}
for (const [nome, lav] of [['vero', false], ['lavora', true]] as const) test('dump ' + nome, async ($, on) => {
  on('ui.render', ($: any, e: any) => { const { Text } = $.ui.resolve(e); return <Text>engine</Text> })
  on('state.get', (_: unknown, e: { plugin: string; key: string }) => ({ value: { value: e.key === 'dati' ? VERO : e.key === 'attivo' && lav ? { tool: 'Bash', cosa: 'cd x && ls', t0: 1 } : e.key === 'aperta' ? false : undefined, version: 1 } }))
  const u = await $.ui.mount({ ...BAND, surface: 'desktop', props: { ...BAND.props, isWorking: lav } })
  const all = JSON.stringify(await u.find({ type: 'Box' }))
  for (const m of all.matchAll(/"source":"(<svg.*?<\/svg>)"/g)) console.log('SVG' + nome + ':' + JSON.parse('"' + m[1] + '"'))
  await u.unmount()
})
