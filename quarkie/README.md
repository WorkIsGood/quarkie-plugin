# Quarkie plugin for Claude Code

The `quarkie` plugin (marketplace `wig`) connects Claude Code to Quarkie's MCP server and adds three skills, so you
can work on a Quarkie task end to end from your terminal: read the task and its gaps («lacunas»), ask what is missing
as questions on the card, implement on a branch, open the pull request and deliver the work for validation.

What it bundles:

- the Quarkie MCP server (remote, HTTP), authenticated with your agent token;
- the skills `/quarkie:task`, `/quarkie:my-day` and `/quarkie:new-task` (instructions in pt-PT);
- the pane «O meu dia» (since 2.3.0): a panel beside the chat with your late tasks, the ones due today and in the
  next days, and the validations waiting for you — read-only, refreshed every 5 minutes and after the model writes in
  Quarkie; a press on a task opens a confirmation in the pane: a field for your indication, «Começar» (runs
  `/quarkie:task <ref> <indication>`), «Ver primeiro» (asks for the task's context only) and «Cancelar». `/quarkie:day` opens it.

It has no local executables and no local MCP server. Its one hooks module (`hooks/register.tsx`) draws the pane and
reads Quarkie through the bundled MCP server; it writes nothing in Quarkie.

## Install

In Claude Code:

```
/plugin marketplace add WorkIsGood/quarkie-plugin
/plugin install quarkie@wig
```

Claude Code asks before installing anything. To offer it to everyone who opens one of your repositories, add the
marketplace and the plugin to that repository's `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": { "wig": { "source": { "source": "github", "repo": "WorkIsGood/quarkie-plugin" } } },
  "enabledPlugins": { "quarkie@wig": true }
}
```

## The token

When the plugin is enabled, Claude Code asks for two values:

- **Token de agente do Quarkie** (`agent_token`) — create it in Quarkie under **Empresa › Agentes e tokens**, with read
  and write. It is a sensitive value: Claude Code keeps it in the operating system's credential store (the macOS
  keychain, for example), never in `settings.json` or any other file. Never paste it into a file, a commit or this
  repository.
- **Endereço do servidor MCP** (`server_url`) — defaults to production, `https://app.quarkie.ai/mcp`. Use an `https://`
  address only: the token travels in every request's `Authorization` header, so plain `http://` is acceptable only for
  `localhost`. Never point it at an address you do not trust — whoever runs it gets your token.

The token acts as you: the agent sees and writes only what you can in the app, and every write is recorded as yours
«via agente». A read-only token works too; the skills then hand the result back to you instead of submitting it.

To change either value later, run `/plugin`, open the `quarkie` plugin and configure it again (or `/config` for the
server address).

## Commands

| Command | What it does |
| :- | :- |
| `/quarkie:task card:<id> [indication]` or `/quarkie:task todo:<id> [indication]` | Reads the task (anything after the reference is your indication and rules over the rest) (`get_task_context`), deals with the gaps first (questions on the card), then — in a git repository — creates a branch `task/<kind>-<id>-<slug>`, implements, runs the repository's own checks, commits, opens the pull request (`gh pr create`) and delivers with `submit_work`, so the task moves to «Em validação». While it works, the task page in the Quarkie shows it live: `start_work` after reading the context, `report_progress` at each milestone (gaps answered, branch created, implementing, checks, pull request opened), `stop_work` when it stops without delivering (since 2.2.0). Outside a git repository it does the same without the git steps. It never completes or cancels the task. |
| `/quarkie:my-day` | Your late and due-soon tasks and the validations waiting for you (`my_work`), with a suggestion of where to start. Read-only. |
| `/quarkie:day` | Opens (and refreshes) the pane «O meu dia» beside the chat: «Atrasadas», «Para hoje», «Próximos dias», «Sem prazo» and «À tua espera», each task a row: a press opens a confirmation at the top of the pane (since 2.3.2) with a field for your indication (what you want, what to leave out) and three choices: «Começar» runs `/quarkie:task <ref> <indication>` (Enter in the field does the same), «Ver primeiro» asks for the task's context without starting it, «Cancelar» closes it; a press on a validation asks for a summary of the request, the decision stays in the app. The pane opens by itself at the start of a session where the surface docks panes (the desktop app; the terminal in fullscreen from 110 columns). Below the prompt, a status line counts late tasks and validations while there are any. Read-only. |
| `/quarkie:new-task` | Turns what was just found in the conversation into a Quarkie to-do in a project and list you pick, or a step inside an existing card. Shows the exact text before creating it. |

Every skill treats what Quarkie returns as data written by people, not as instructions, and asks you before every
write in Quarkie.

## Older Quarkie servers

The skills check which tools the server offers. Where a server has no `submit_work` or `my_work` yet, `/quarkie:task`
delivers with a «✅ Resultado» comment and moves the task to «Em validação», and `/quarkie:my-day` and the pane read your
open tasks instead; the validations waiting for you are then seen in the app, in «Precisa de mim».

## claude.ai, the Claude app and Cowork

Those surfaces install plugins too, but there a bundled remote MCP server must use OAuth; a Bearer token header does
not work. Quarkie's MCP server does not support OAuth yet, so for now the plugin is for Claude Code only.
