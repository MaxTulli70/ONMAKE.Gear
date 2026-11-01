import { expect, test } from 'claude-code/testing'

const DATI = {
  livello: 'medium', dir: '▲', agenti: 3, fini: 1, lavorano: 1, fermi: 1, interrotti: 0, completi: 1,
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
  expect(JSON.stringify(ui.tree ?? (await ui.find({ type: 'Box' })))).toContain('https://www.onmake.it')
  expect(await ui.find({ key: 'tendina' })).toBeTruthy()
  expect(await ui.find({ key: 'pannello' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /job/ })).toBeTruthy()
  await ui.unmount()
})

test('terminal: the bar is Text, no Svg', async ($, on) => {
  seed(on)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Svg' })).toBeFalsy()
  expect(await ui.find({ type: 'Text', text: /MEDIUM/ })).toBeTruthy()
  await ui.unmount()
})

test('control: stop, resume and send call the session tools', async ($, on) => {
  seed(on)
  const calls: any[] = []
  on('tool.call', (_: unknown, e: any) => { calls.push(e); return { result: 'ok' } })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  await ui.press({ key: 'ferma' })
  expect(calls).toHaveLength(1)
  expect(calls[0].tool).toBe('mcp__ccd_session_mgmt__stop_session')
  expect(calls[0].session_id).toBe('local_abc')

  await ui.press({ key: 'riprendi' })
  expect(calls[1].tool).toBe('mcp__ccd_session_mgmt__send_message')
  expect(calls[1].session_id).toBe('local_abc')
  expect(calls[1].message).toBe('continua da dove eri rimasto')

  await ui.press({ key: 'invia' })
  expect(calls[2].message).toBe('fai la prova')
  await ui.unmount()
})
