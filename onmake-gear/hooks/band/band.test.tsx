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
  expect((svg?.props as { source?: string })?.source).toContain('MEDIUM')
  expect((svg?.props as { source?: string })?.source).toContain('40%')
  expect((svg?.props as { source?: string })?.source).not.toContain('Opus 5.5')
  expect(await ui.find({ key: 'onmake' })).toBeTruthy()
  expect(await ui.find({ key: 'tendina' })).toBeTruthy()
  expect(await ui.find({ key: 'pannello' })).toBeTruthy()
  expect(JSON.stringify(await ui.find({ type: 'Box' }))).toContain('job')
  await ui.unmount()
})

test('terminal: the bar is Text, no Svg', async ($, on) => {
  seed(on)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Svg' })).toBeFalsy()
  expect(await ui.find({ type: 'Text', text: /MEDIUM/ })).toBeTruthy()
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
  expect((svg?.props as { source?: string })?.source).toContain('index')
  expect((svg?.props as { source?: string })?.source).not.toContain('indice')
  await ui.unmount()
})
