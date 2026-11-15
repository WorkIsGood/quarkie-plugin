// «O meu dia» — a pane beside the chat with the person's Quarkie day: late tasks, tasks due today and in the
// next days, and the validation requests waiting for them. Read through the Quarkie MCP server (my_work; plan B
// list_tasks while production's /mcp has no my_work). A press on a task opens a confirmation in the pane: a field for
// the person's indication, «Começar» (runs /quarkie:task <ref> <indication>), «Ver primeiro» (asks for the task's
// context only) and «Cancelar». Nothing is written in Quarkie from the pane itself. UI texts in pt-PT, as the app's.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, McpToolResult, Register, RenderChildren } from 'claude-code'

import type { Pending, Work, WorkTask, WorkValidation } from '../types'

const PANE = 'quarkie-day'
const TITLE = 'O meu dia'
const COMMAND = 'day'
/** The server's key in the quarkie plugin's own manifest, and the name /mcp lists it under when another mod calls it. */
const SERVER_KEY = 'quarkie'
const SERVER_LISTED = 'plugin:quarkie:quarkie'
const TOOL_PREFIX = `mcp__${SERVER_LISTED.replace(/:/g, '_')}__`
/** Writes in Quarkie after which the day may have changed. */
const WRITES = new Set(['create_task', 'update_task', 'submit_work', 'start_work', 'stop_work', 'add_comment', 'answer_validation'])
const REFRESH_MS = 5 * 60 * 1000
const WINDOW_DAYS = 7
const MAX_ROWS = 12

const EMPTY: Work = {
  state: 'idle', isRefreshing: false, fetchedAt: null, today: null, source: null,
  tasks: [], tasksTotal: 0, validations: [], validationsTotal: 0, error: null,
}

// Bump the tag when Work's fields change: an earlier version's value is then declined.
const work = atom({ plugin: 'quarkie', key: 'work' } as const, EMPTY, { shape: 'work-1' })
// The task the person pressed, until they choose what to do with it.
const pending = atom({ plugin: 'quarkie', key: 'pending' } as const, null as Pending | null, { shape: 'pending-1' })
/** What the person typed in the confirmation's field (the drawing holds it; this is the copy a Button reads). */
let note = ''

let inFlight: Promise<void> | null = null

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: COMMAND, description: 'Abre o painel «O meu dia» do Quarkie (tarefas e validações)' })
    void $.ui.open({ id: PANE, title: TITLE })
    // The first reading and the periodic ones outlive this dispatch: timers, not awaits.
    $.clock.after(1, () => void refresh($))
    $.clock.every(REFRESH_MS, () => void refresh($))

    return next(e)
  })

  on('command.run', { command: COMMAND }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE, focus: true })
    void refresh($)

    return { text: 'Painel «O meu dia» aberto.' }
  })

  // After the model writes in Quarkie (a task created, moved, delivered…) the day is read again.
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (e.tool.startsWith(TOOL_PREFIX) && WRITES.has(e.tool.slice(TOOL_PREFIX.length))) void refresh($)

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const Input = 'Input' in els ? els.Input : null
    const w = await read($, work)
    const chosen = await read($, pending)
    const columns = Math.max(20, e.props.bodyColumns)
    const now = await $.clock.now()

    const late = w.tasks.filter(t => t.late)
    const today = w.tasks.filter(t => !t.late && t.days === 0)
    const soon = w.tasks.filter(t => !t.late && t.days !== null && t.days > 0)
    const undated = w.tasks.filter(t => !t.late && t.days === null)

    // A press on a task only asks: the confirmation at the top takes the person's indication and their choice.
    const choose = async (t: WorkTask) => {
      note = ''
      await update($, pending, () => ({ ref: t.ref, title: t.title }))
      void $.ui.open({ id: PANE, title: TITLE, focus: true })
    }
    const settle = () => update($, pending, () => null)
    // What the person chose goes in as their own words and starts a turn as soon as the session is idle.
    const say = (text: string, toast: string) => {
      $.ui.toast(toast)
      void $.prompt.submit({ text, asUser: true })
    }
    const start = (p: Pending, text: string) => {
      const extra = text.replace(/\s+/g, ' ').trim()
      $.ui.toast(`A começar ${p.ref}…`)
      void $.command.run({ command: 'quarkie:task', args: extra ? `${p.ref} ${extra}` : p.ref })
      void settle()
    }
    const look = (p: Pending) => {
      say(`Mostra-me o contexto da tarefa ${p.ref} (get_task_context): o que é, as lacunas, as decisões e os últimos comentários. Não comeces a trabalhar nela.`, `A ler ${p.ref}…`)
      void settle()
    }
    const review = (v: WorkValidation) =>
      say(`Resume-me o pedido de validação de ${v.requester} na tarefa ${v.ref} (get_task_context), para eu decidir no Quarkie.`, `A ler o pedido de ${v.requester}…`)

    const confirmation = chosen && (
      <Box key="confirm" flexDirection="column" gap={0}>
        <Text weight="semibold" wrap="wrap">Começar «{fit(chosen.title, columns - 12)}»?</Text>
        {Input && (
          <Input key="note" placeholder="Alguma indicação? (opcional)" submitLabel="começar" value={note} autoFocus
            onInput={v => { note = v }} onSubmit={v => start(chosen, v)} />
        )}
        <Box flexDirection="row" gap={1}>
          <Button key="start" variant="primary" onPress={() => start(chosen, note)}>Começar</Button>
          <Button key="look" onPress={() => look(chosen)}>Ver primeiro</Button>
          <Button key="cancel" role="dismiss" dimColor onPress={() => void settle()}>Cancelar</Button>
        </Box>
      </Box>
    )

    const taskRow = (t: WorkTask) => (
      <Box key={`row-${t.ref}`} flexDirection="column">
        <Button key={t.ref} plain onPress={() => void choose(t)}>{fit(t.title, columns - 2)}</Button>
        <Text dimColor wrap="truncate">  {t.project}{t.project && ' · '}{dueWords(t)}</Text>
      </Box>
    )
    const validationRow = (v: WorkValidation) => (
      <Box key={`row-${v.id}`} flexDirection="column">
        <Button key={v.id} plain onPress={() => review(v)}>{fit(v.title, columns - 2)}</Button>
        <Text dimColor wrap="truncate">  {v.requester} pediu {sinceWords(v.since, now)}{v.project && ` · ${v.project}`}</Text>
      </Box>
    )
    const group = (label: string, rows: readonly (WorkTask | WorkValidation)[], row: (x: any) => RenderChildren, total?: number) => {
      if (rows.length === 0) return null
      const shown = rows.slice(0, MAX_ROWS)
      const more = (total ?? rows.length) - shown.length

      return (
        <Box flexDirection="column" gap={0}>
          <Text weight="semibold">{label} <Text dimColor weight="regular">{String(total ?? rows.length)}</Text></Text>
          {shown.map(row)}
          {more > 0 && <Text dimColor>  … e mais {String(more)}</Text>}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={1}>
        {confirmation}
        {w.state === 'loading' && <Text dimColor>A ler o teu dia no Quarkie…</Text>}
        {w.state === 'error' && (
          <Box flexDirection="column">
            <Text color="error">Sem ligação ao Quarkie.</Text>
            {w.error && <Text dimColor wrap="wrap">{w.error}</Text>}
          </Box>
        )}
        {w.state === 'ready' && w.tasks.length === 0 && w.validations.length === 0 && (
          <Text>Dia livre: nada atrasado, nada a vencer nos próximos {String(WINDOW_DAYS)} dias{w.source === 'my_work' ? ' e nenhuma validação à tua espera' : ''}.</Text>
        )}
        {group('Atrasadas', late, taskRow)}
        {group('Para hoje', today, taskRow)}
        {group('Próximos dias', soon, taskRow)}
        {group('Sem prazo', undated, taskRow)}
        {group('À tua espera', w.validations, validationRow, w.validationsTotal || undefined)}
        {w.state === 'ready' && w.source === 'list_tasks' && (
          <Text dimColor wrap="wrap">As validações à tua espera vês no Quarkie, em «Precisa de mim».</Text>
        )}
        <Box flexDirection="row" gap={1}>
          <Button key="refresh" dimColor onPress={() => void refresh($)}>{w.isRefreshing ? 'A atualizar…' : 'Atualizar'}</Button>
          {w.fetchedAt !== null && <Text dimColor>{atWords(w.fetchedAt)}</Text>}
        </Box>
      </Box>
    )
  })
}

// ------------------------------------------------------------------------------------------ reading the day

async function refresh($: EngineInterface): Promise<void> {
  if (inFlight) return inFlight
  inFlight = (async () => {
    try {
      await update($, work, (w): Work => ({ ...w, state: w.state === 'ready' ? 'ready' : 'loading', isRefreshing: true }))
      const next = await readDay($)
      await update($, work, () => next)
      status($, next)
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error)
      await update($, work, (w): Work => ({ ...w, state: w.fetchedAt === null ? 'error' : 'ready', isRefreshing: false, error: text }))
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

function status($: EngineInterface, w: Work) {
  const late = w.tasks.filter(t => t.late).length
  const parts: string[] = []
  if (late > 0) parts.push(`${late} ${late === 1 ? 'atrasada' : 'atrasadas'}`)
  if (w.validationsTotal > 0) parts.push(`${w.validationsTotal} ${w.validationsTotal === 1 ? 'validação' : 'validações'} à tua espera`)
  $.ui.status(parts.length > 0 ? `Quarkie: ${parts.join(' · ')}` : undefined)
}

/** The name `$.mcp.call` takes: the quarkie plugin's own server when this module ships in it, else as /mcp lists it. */
async function serverName($: EngineInterface): Promise<string> {
  const c = await $.mcp.connect(SERVER_KEY)
  if (c.isConnected) return c.server
  if (c.reason === 'unlisted') return SERVER_LISTED
  throw new Error(c.message)
}

async function readDay($: EngineInterface): Promise<Work> {
  const server = await serverName($)
  const fetchedAt = await $.clock.now()
  const mine = await call($, server, 'my_work')
  if (mine.ok) return fromMyWork(mine.value, fetchedAt)
  // An older server without my_work: the open tasks instead.
  const listed = await call($, server, 'list_tasks', { assignee: 'me', status: 'open', limit: 200 })
  if (listed.ok) return fromListTasks(listed.value, fetchedAt)
  throw new Error(listed.error)
}

type Called = { ok: true; value: any } | { ok: false; error: string }

async function call($: EngineInterface, server: string, tool: string, args?: Record<string, unknown>): Promise<Called> {
  let r: McpToolResult
  try {
    r = await $.mcp.call(server, tool, args)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
  const text = r.content.find(b => b.type === 'text')?.text ?? ''
  if (r.isError) return { ok: false, error: text || `${tool}: erro do servidor` }
  if (r.structuredContent !== undefined) return { ok: true, value: r.structuredContent }
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false, error: `${tool}: resposta ilegível` }
  }
}

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const kindOf = (v: unknown, ref: string): 'card' | 'todo' => (v === 'card' || ref.startsWith('card:') ? 'card' : 'todo')

function fromMyWork(v: any, fetchedAt: number): Work {
  const tasks: WorkTask[] = (Array.isArray(v?.tasks) ? v.tasks : []).map((t: any): WorkTask => {
    const ref = str(t?.ref)
    const days = num(t?.days)

    return {
      ref, kind: kindOf(t?.kind, ref), title: str(t?.title, '(sem título)'), project: str(t?.project?.name),
      due: str(t?.due) || null, days, late: t?.late === true || (days !== null && days < 0), status: str(t?.status),
    }
  }).filter((t: WorkTask) => t.ref.length > 0)
  const validations: WorkValidation[] = (Array.isArray(v?.validations) ? v.validations : []).map((x: any): WorkValidation => ({
    id: str(x?.validation) || `validation:${str(x?.task?.ref)}`, ref: str(x?.task?.ref), title: str(x?.task?.title, '(sem título)'),
    project: str(x?.project?.name), requester: str(x?.requesterName, 'Alguém'), since: str(x?.since), message: str(x?.message),
  })).filter((x: WorkValidation) => x.ref.length > 0)

  return {
    state: 'ready', isRefreshing: false, fetchedAt, today: str(v?.today) || null, source: 'my_work',
    tasks, tasksTotal: num(v?.tasksTotal) ?? tasks.length, validations, validationsTotal: num(v?.validationsTotal) ?? validations.length, error: null,
  }
}

function fromListTasks(v: any, fetchedAt: number): Work {
  const today = dayOf(fetchedAt)
  const tasks: WorkTask[] = (Array.isArray(v?.tasks) ? v.tasks : []).map((t: any): WorkTask => {
    const ref = str(t?.ref)
    const due = str(t?.due).slice(0, 10) || null
    const days = due ? daysBetween(today, due) : null

    return {
      ref, kind: kindOf(t?.kind, ref), title: str(t?.title, '(sem título)'), project: str(t?.project?.name),
      due, days, late: days !== null && days < 0, status: str(t?.status),
    }
  }).filter((t: WorkTask) => t.ref.length > 0 && t.days !== null && (t.days as number) <= WINDOW_DAYS)
    .sort((a: WorkTask, b: WorkTask) => (a.days as number) - (b.days as number) || a.title.localeCompare(b.title, 'pt'))

  return {
    state: 'ready', isRefreshing: false, fetchedAt, today, source: 'list_tasks',
    tasks, tasksTotal: tasks.length, validations: [], validationsTotal: 0, error: null,
  }
}

// ------------------------------------------------------------------------------------------ dates and words (pt-PT)

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/** The local calendar day of an epoch, «YYYY-MM-DD». */
function dayOf(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')

  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Whole days from one «YYYY-MM-DD» to another, or null when either does not parse. */
function daysBetween(from: string, to: string): number | null {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return null

  return Math.round((b - a) / 86_400_000)
}

function dueWords(t: WorkTask): string {
  if (t.days === null) return t.due ? `prazo ${t.due}` : 'sem prazo'
  if (t.days < 0) return t.days === -1 ? 'venceu ontem' : `venceu há ${-t.days} dias`
  if (t.days === 0) return 'hoje'
  if (t.days === 1) return 'amanhã'
  const d = t.due ? new Date(`${t.due}T00:00:00Z`) : null
  const when = d && !Number.isNaN(d.getTime()) ? `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}` : `em ${t.days} dias`

  return `${when} · ${t.days} dias`
}

function sinceWords(iso: string, now: number): string {
  const at = Date.parse(iso)
  if (Number.isNaN(at)) return ''
  const minutes = Math.max(0, Math.round((now - at) / 60_000))
  if (minutes < 60) return minutes < 2 ? 'agora mesmo' : `há ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `há ${hours} h`
  const days = Math.round(hours / 24)

  return days === 1 ? 'ontem' : `há ${days} dias`
}

function atWords(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')

  return `às ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** A one-line title that fits the row, with an ellipsis. */
function fit(text: string, width: number): string {
  const one = text.replace(/\s+/g, ' ').trim()

  return one.length <= width ? one : `${one.slice(0, Math.max(1, width - 1)).trimEnd()}…`
}
