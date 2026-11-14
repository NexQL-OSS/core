<div align="center">

# 🐘 NexQL

### _The PostgreSQL workbench inside VS Code_

**Explore your schema. Understand your queries. Act safely in production.**

[![Version](https://img.shields.io/visual-studio-marketplace/v/ric-v.postgres-explorer?style=for-the-badge&logo=visual-studio-code&logoColor=white&color=2563EB)](https://marketplace.visualstudio.com/items?itemName=ric-v.postgres-explorer)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/ric-v.postgres-explorer?style=for-the-badge&logo=visual-studio-code&logoColor=white&color=10B981)](https://marketplace.visualstudio.com/items?itemName=ric-v.postgres-explorer)
[![Stable](https://img.shields.io/badge/stable-v2.6.0-0EA5E9?style=for-the-badge&logo=visual-studio-code&logoColor=white)](https://github.com/NexQL-OSS/NexQL-Core/blob/main/CHANGELOG.md)

NexQL is a PostgreSQL-native database workbench for VS Code: secure connections, schema exploration, interactive SQL notebooks, performance intelligence, visual results, AI assistance, and agent-ready MCP tools in one focused workflow.

[Install NexQL](https://marketplace.visualstudio.com/items?itemName=ric-v.postgres-explorer) · [Open the docs](https://nexql.astrx.dev/) · [Explore the OSS core](https://github.com/NexQL-OSS)

</div>

---

## The database workflow, redesigned for developers

NexQL keeps the database beside the code, the notebook beside the investigation, and the dangerous action behind a confirmation.

### Explore with context

Navigate schemas, tables, views, materialized views, functions, procedures, aggregates, types, roles, extensions, sequences, triggers, partitions, publications, tablespaces, and foreign data wrappers from a native VS Code explorer.

Drag database objects, columns, notebooks, and saved queries into the SQL Assistant as context. Open definitions as readable SQL, copy them, edit them, or use them as scaffolding for the next change.

### Understand what the database is doing

Move from “this query is slow” to evidence:

- EXPLAIN CodeLens directly in notebook cells.
- Table profiles with size, statistics, activity, index usage, and bloat signals.
- Live activity monitoring with lock and wait indicators.
- Query execution history and degradation signals.
- Index and constraint workflows that keep the generated SQL visible.

### Act with guardrails

NexQL makes risky database work deliberate:

- Label connections as **PROD**, **STAGING**, or **DEV**.
- Enable read-only mode for investigation sessions.
- Review query risk scoring and confirmation prompts.
- Protect broad <code>SELECT</code> statements with configurable Auto-LIMIT.
- Keep AI-generated SQL in a notebook until a human reviews and runs it.

---

## What you can do with NexQL

| Workflow                | Capabilities                                                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Connect**             | SecretStorage-backed credentials, SSL modes, CA certificates, SSH tunnels, PostgreSQL-compatible cloud services      |
| **Explore**             | Database tree, schema search, object definitions, table designer, indexes, constraints, FDWs                         |
| **Query**               | Native <code>.pgsql</code> notebooks, completions, saved queries, parameters, transactions, keyboard-first execution |
| **Analyze**             | EXPLAIN, query history, table intelligence, live activity, result statistics, charts                                 |
| **Operate**             | CRUD and DDL workflows, VACUUM, ANALYZE, REINDEX, scripts, export, controlled in-grid editing                        |
| **Collaborate with AI** | Natural language to SQL, explain, optimize, fix errors, analyze results, multiple assistant tabs                     |
| **Connect agents**      | MCP schema discovery, safe reads, EXPLAIN, join paths, table statistics, and index usage                             |

---

## AI that knows the schema—and waits for you

NexQL’s AI workflow is designed for database engineering, not blind automation.

### NexQL Free AI

The published product includes a zero-configuration managed provider with three capability levels:

- **Smart** — everyday SQL generation, explanations, and schema help.
- **Engineer** — deeper optimization and migration support.
- **Architect** — advanced database engineering workflows.

No provider key is required for the managed experience. Availability, quotas, and pricing are subject to change; see [AI Settings](https://nexql.astrx.dev/#ai) for current details.

### Bring your own provider

Use GitHub Models, GitHub Copilot/VS Code LM, OpenAI, Anthropic, Gemini, Ollama, LM Studio, or a custom OpenAI-compatible endpoint.

### A reviewable execution loop

1. Describe the outcome you want.
2. NexQL grounds the request with selected live schema or result context.
3. AI proposes SQL or an explanation.
4. You review it in chat or a notebook cell.
5. You choose when to execute.

AI suggestions are not silently run against your database.

---

## MCP for the tools your agents can trust

NexQL can expose a connected PostgreSQL database to MCP-compatible clients such as GitHub Copilot, Cursor, Claude Desktop, Codex, and other agent runtimes.

Available read-focused tools include:

- <code>list_schemas</code>, <code>list_objects</code>, <code>describe_object</code>, and <code>search_schema</code>
- <code>run_select</code> and <code>explain_query</code>
- <code>get_join_path</code>
- <code>get_table_stats</code> and <code>get_index_usage</code>

Inside VS Code, NexQL registers the bundled <code>nexql-mcp</code> binary as a stdio server. External clients can use the optional fixed-port mode with a SecretStorage-backed bearer token. Configure the integration through **NexQL Settings → Preferences**; use <code>postgresExplorer.mcp.binaryPath</code> for a custom or debug binary.

SSH-tunneled connections are excluded from ephemeral MCP profiles. Managed TLS profiles carry their relevant certificate settings.

---

## Notebooks that preserve the investigation

Native <code>.pgsql</code> notebooks keep SQL, context, outputs, and reasoning together:

- Execute cells with <code>Ctrl+Enter</code>.
- Run and advance with <code>Shift+Enter</code>.
- Reopen saved queries with their connection and schema context.
- Attach schema objects, notebooks, and saved queries to AI prompts.
- Filter, transpose, and inspect result data without exporting first.
- Edit grid values through an explicit commit flow.
- Stream large result sets through a bounded sliding window.
- Export results to CSV, JSON, or Excel.

### Visualize results without leaving VS Code

Turn query results into bar, line, area, pie, doughnut, or scatter charts. Inspect wide value ranges with log scales, zoom into points, and use optional glow/blur styling for presentation-ready analysis.

---

## Database operations, without the context switch

| Object                           | Common actions                                                               |
| -------------------------------- | ---------------------------------------------------------------------------- |
| **Tables**                       | View, edit, insert, update, delete, truncate, drop, VACUUM, ANALYZE, REINDEX |
| **Views and materialized views** | Open definitions, query data, edit, refresh, drop                            |
| **Functions and procedures**     | Inspect, edit, call with parameters, drop                                    |
| **Types and domains**            | Inspect properties, edit, drop                                               |
| **FDWs and foreign tables**      | Manage servers, mappings, imported schemas, and tables                       |
| **Extensions and roles**         | Enable/disable extensions; manage grants and role properties                 |

NexQL keeps generated SQL visible and respects server capabilities, permissions, and PostgreSQL-compatible platform differences.

---

## PostgreSQL, wherever it runs

NexQL works with tested PostgreSQL and PostgreSQL-compatible platforms:

- **PostgreSQL 12–17** — self-hosted, Docker, and on-premises.
- **Neon** — prefer the direct, non-pooler endpoint with SSL <code>require</code>.
- **Supabase** — direct or session pooler connections; avoid transaction pooler for interactive sessions.
- **TimescaleDB and Timescale Cloud** — PostgreSQL extension compatibility.
- **YugabyteDB (YSQL)** — mostly compatible; use port 5433.
- **AWS RDS/Aurora**, **Google Cloud SQL/AlloyDB**, and **Azure Database for PostgreSQL Flexible Server**.

See the [compatibility guide](https://github.com/NexQL-OSS/NexQL-Core/blob/main/docs/COMPATIBILITY.md) for provider-specific settings and known caveats.

---

## Install in seconds

1. Open VS Code and press <code>Ctrl+Shift+X</code>.
2. Search for **NexQL**.
3. Select **Install**.
4. Open the PostgreSQL view in the Activity Bar.
5. Choose **Add Connection** and connect.

Or install from a terminal:

```bash
code --install-extension ric-v.postgres-explorer
```

---

## Secure by design

- Credentials are stored with VS Code SecretStorage encryption.
- Environment signals make production context visible before execution.
- Read-only mode supports safe investigation sessions.
- Risk scoring and confirmation prompts make destructive actions explicit.
- Auto-LIMIT protects broad reads; use an explicit <code>LIMIT</code> when you need a deliberate result size.
- Telemetry is allowlisted and bucketed. SQL text, object names, hostnames, database names, usernames, and credentials are not collected.
- VS Code’s global telemetry setting is a hard gate.

Configure telemetry with:

- <code>postgresExplorer.telemetry.mode</code>: <code>off</code>, <code>basic</code>, or <code>detailed</code>
- <code>postgresExplorer.telemetry.allowUsage</code>
- <code>postgresExplorer.telemetry.allowPerformance</code>

---

## Core and Pro

NexQL is open core:

- **NexQL Core** is MIT-licensed and available at [NexQL-OSS](https://github.com/NexQL-OSS).
- The Marketplace extension is the **Pro build**, combining Core with premium AI, MCP, dashboard, Plan Studio, backup/restore, schema design, and database-indexing capabilities.
- The Core repository can still build a complete free/OSS extension for users who want to fork, rebrand, or extend it.

---

## Feature status

| Area                                                       | Status       |
| ---------------------------------------------------------- | ------------ |
| PostgreSQL connections and explorer                        | ✅ Available |
| SQL notebooks and saved queries                            | ✅ Available |
| Production safety controls                                 | ✅ Available |
| EXPLAIN and performance intelligence                       | ✅ Available |
| AI assistance and provider integrations                    | ✅ Pro       |
| MCP agent tools                                            | ✅ Pro       |
| Real-time monitoring dashboard                             | ✅ Pro       |
| Backup and restore                                         | ✅ Pro       |
| Database indexing and semantic grounding                   | ✅ Pro       |
| Advanced visual schema design                              | ✅ Pro       |
| Full desktop-IDE parity for every in-grid editing workflow | 🚧 Expanding |

Product capabilities evolve continuously. Check the [current changelog](https://github.com/NexQL-OSS/NexQL-Core/blob/main/CHANGELOG.md) for release-level detail.

---

## Resources

- [NexQL website and interactive demo](https://nexql.astrx.dev/)
- [NexQL OSS organization](https://github.com/NexQL-OSS)
- [Compatibility guide](https://github.com/NexQL-OSS/NexQL-Core/blob/main/docs/COMPATIBILITY.md)
- [Security policy](https://github.com/NexQL-OSS/NexQL-Core/blob/main/SECURITY.md)
- [Changelog](https://github.com/NexQL-OSS/NexQL-Core/blob/main/CHANGELOG.md)
- [Open VSX](https://open-vsx.org/extension/ric-v/postgres-explorer)

---

<div align="center">

**NexQL — database work, without leaving the editor.**

Made with ❤️ for the PostgreSQL community.

</div>
