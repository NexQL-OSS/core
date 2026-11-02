# Optional: connect an AI app via nexql-mcp

Stop 5 of 6

nexql-mcp is a separate server that lets AI apps such as Copilot, Claude and Cursor look at your database. It is read-only unless you change that.

NexQL registers it with VS Code for you (setting: `postgresExplorer.mcp.enabled`). It reads profiles from `~/.config/nexql-mcp/`.

To reuse your saved connections, run **Export Connections to .nexql/config.toml**. Passwords are never exported.

Other apps and setup steps: https://nexql-mcp.astrx.dev
