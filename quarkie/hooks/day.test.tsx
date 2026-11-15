import { expect, mock, test } from 'claude-code/testing'

// The plugin's manifest requires the agent token: a test value for the kit, never a real one.
const OPTIONS = { options: { agent_token: 'test-token', server_url: 'http://localhost:5281/mcp' } }

const PANE = {
  plugin: 'quarkie',
  component: 'Pane',
  requestId: 'quarkie-day',
  props: { title: 'O meu dia', isFocused: false, bodyColumns: 48, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

const NOW = Date.parse('2026-11-13T09:00:00Z')

const text = (value: unknown) => ({ value: { content: [{ type: 'text', text: JSON.stringify(value) }], isError: false } })
const failure = (why: string) => ({ value: { content: [{ type: 'text', text: why }], isError: true } })

const MY_WORK = {
  today: '2026-11-13', days: 7,
  tasks: [
    { ref: 'card:abc1', kind: 'card', title: 'Fechar a proposta da Padaria Estrela', status: 'em_curso', due: '2026-11-10', late: true, days: -3, project: { id: 'p1', name: 'Padaria Estrela' } },
    { ref: 'todo:def2', kind: 'todo', title: 'Rever o contrato', status: 'por_fazer', due: '2026-11-13', late: false, days: 0, project: { id: 'p2', name: 'WIG' } },
    { ref: 'todo:ghi3', kind: 'todo', title: 'Preparar a demo', status: 'por_fazer', due: '2026-11-17', late: false, days: 4, project: { id: 'p2', name: 'WIG' } },
  ],
  tasksTotal: 3,
  validations: [
    { validation: 'validation:v1', round: 1, since: '2026-11-11T10:00:00Z', requesterName: 'Ana', message: 'Pronto para rever', task: { ref: 'card:jkl4', title: 'Ecrã de despesas' }, project: { id: 'p2', name: 'WIG' } },
  ],
  validationsTotal: 1,
}

function world(on: Parameters<Parameters<typeof test>[1]>[1], answers: { my_work: unknown; list_tasks?: unknown }) {
  const filled: string[] = []
  const calls: string[] = []
  const clock = mock.clock(on, { now: NOW })
  on('command.register', () => ({ value: { command: 'day' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('mcp.connect', () => ({ value: { isConnected: false, reason: 'unlisted', message: 'not in the manifest' } }))
  on('mcp.call', (_, e) => {
    calls.push(e.tool)
    return e.tool === 'my_work' ? answers.my_work : answers.list_tasks ?? failure('no list_tasks')
  })
  on('prompt.submit', (_, e) => {
    filled.push(e.text)
    return { text: e.text }
  })
  on('command.run', (_, e) => {
    filled.push(`/${e.command} ${e.args}`)
    return { text: '' }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))

  return { filled, calls, clock }
}

test('the pane groups the day; a press asks, «Começar» runs /quarkie:task with the indication, on every surface', OPTIONS, async ($, on) => {
  const { filled, calls, clock } = world(on, { my_work: text(MY_WORK) })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(5)
  expect(calls).toEqual(['my_work'])

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })

    expect(await ui.find({ type: 'Text', text: /Atrasadas/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Para hoje/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Próximos dias/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /À tua espera/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /venceu há 3 dias/ }))?.text).toContain('Padaria Estrela')
    expect((await ui.find({ type: 'Text', text: /Ana pediu/ }))?.text).toContain('há 2 dias')

    // a press only asks; the indication and the choice start it
    await ui.press({ key: 'card:abc1' })
    expect(await ui.find({ type: 'Text', text: /Começar «Fechar a proposta/ })).toBeDefined()
    await ui.input({ key: 'note', text: 'Só o guião, sem tocar no código', kind: 'change' })
    await ui.press({ key: 'start' })
    expect(filled.at(-1)).toBe('/quarkie:task card:abc1 Só o guião, sem tocar no código')
    expect(await ui.find({ type: 'Text', text: /Começar «/ })).toBeUndefined()
    // Enter in the field starts with what was typed
    await ui.press({ key: 'todo:def2' })
    await ui.input({ key: 'note', text: 'até sexta' })
    expect(filled.at(-1)).toBe('/quarkie:task todo:def2 até sexta')
    // «Ver primeiro» only reads; «Cancelar» does nothing
    const before = filled.length
    await ui.press({ key: 'card:abc1' })
    await ui.press({ key: 'look' })
    expect(filled.at(-1)).toContain('Não comeces')
    await ui.press({ key: 'card:abc1' })
    await ui.press({ key: 'cancel' })
    expect(filled.length).toBe(before + 1)
    expect(await ui.find({ type: 'Text', text: /Começar «/ })).toBeUndefined()
    await ui.press({ key: 'validation:v1' })
    expect(filled.at(-1)).toContain('Ana')
    await ui.unmount()
  }
})

test('on mobile, with no Input, the confirmation still offers the three choices', OPTIONS, async ($, on) => {
  const { filled, clock } = world(on, { my_work: text(MY_WORK) })
  await $.session.start({ cwd: '/', surface: 'mobile', isInteractive: true })
  await clock.advance(5)
  const ui = await $.ui.mount({ ...PANE, surface: 'mobile' })
  await ui.press({ key: 'card:abc1' })
  expect(await ui.find({ type: 'Button', key: 'start' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'cancel' })).toBeDefined()
  await ui.press({ key: 'start' })
  expect(filled.at(-1)).toBe('/quarkie:task card:abc1')
  await ui.unmount()
})

test('without my_work the pane falls back to list_tasks and keeps only what is due within 7 days', OPTIONS, async ($, on) => {
  const { calls, clock } = world(on, {
    my_work: failure('Ferramenta desconhecida: my_work'),
    list_tasks: text({
      tasks: [
        { ref: 'todo:a', kind: 'todo', title: 'Ontem', status: 'por_fazer', due: '2026-11-12', project: { id: 'p', name: 'P' } },
        { ref: 'todo:b', kind: 'todo', title: 'Daqui a um mês', status: 'por_fazer', due: '2026-12-13', project: { id: 'p', name: 'P' } },
        { ref: 'todo:c', kind: 'todo', title: 'Sem prazo', status: 'por_fazer', due: null, project: { id: 'p', name: 'P' } },
      ],
      count: 3,
    }),
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(5)
  expect(calls).toEqual(['my_work', 'list_tasks'])

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Button', key: 'todo:a' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'todo:b' })).toBeUndefined()
  expect(await ui.find({ type: 'Button', key: 'todo:c' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Precisa de mim/ })).toBeDefined()
  await ui.unmount()
})

test('with no server the pane says so and offers to try again', OPTIONS, async ($, on) => {
  const { clock } = world(on, { my_work: failure('ECONNREFUSED'), list_tasks: failure('ECONNREFUSED') })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(5)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Sem ligação ao Quarkie/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'refresh' })).toBeDefined()
  await ui.unmount()
})
