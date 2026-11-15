# Quarkie for Claude Code

The `quarkie` plugin connects [Claude Code](https://claude.com/claude-code) to [Quarkie](https://app.quarkie.ai): work on
a Quarkie task end to end from your terminal, see your day beside the chat, and turn what you find into tasks.

```
/plugin marketplace add WorkIsGood/quarkie-plugin
/plugin install quarkie@wig
```

Claude Code then asks for your agent token: create it in Quarkie under **Empresa › Agentes e tokens**. It is kept in
your system's credential store, never in a file. Everything else is in [`quarkie/README.md`](quarkie/README.md).
