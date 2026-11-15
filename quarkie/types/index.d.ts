/** One of the person's tasks in the pane: a card or a to-do, late or due within the window. */
export type WorkTask = {
  /** `card:<id>` or `todo:<id>`, what `/quarkie:task` takes. */
  ref: string
  kind: 'card' | 'todo'
  title: string
  project: string
  /** The due day, «YYYY-MM-DD», or null when the task has none. */
  due: string | null
  /** Days until the due day: negative when late, 0 today; null without a due day. */
  days: number | null
  late: boolean
  status: string
}

/** A validation request waiting for the person's decision. */
export type WorkValidation = {
  /** `validation:<key>`. */
  id: string
  /** The task's `card:<id>` / `todo:<id>`. */
  ref: string
  title: string
  project: string
  requester: string
  /** ISO date-time of the current round's request. */
  since: string
  message: string
}

/** What the pane shows: the last reading of the person's day. */
export type Work = {
  state: 'idle' | 'loading' | 'ready' | 'error'
  /** True while a reading is in flight over data already shown. */
  isRefreshing: boolean
  /** Epoch ms of the last successful reading, null before the first. */
  fetchedAt: number | null
  /** The server's (or, in plan B, the local) «today», «YYYY-MM-DD». */
  today: string | null
  /** `my_work` when the server offers it, else `list_tasks` (plan B, no validations). */
  source: 'my_work' | 'list_tasks' | null
  tasks: WorkTask[]
  tasksTotal: number
  validations: WorkValidation[]
  validationsTotal: number
  error: string | null
}

/** The task the person pressed in the pane, waiting for «Começar», «Ver primeiro» or «Cancelar». */
export type Pending = { ref: string; title: string }

declare module 'claude-code' {
  interface PluginState {
    quarkie: { work: Shaped<Work>; pending: Shaped<Pending | null> }
  }
}
