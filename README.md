<div align="center">

# 🐘 NexQL

### _The PostgreSQL workbench for developers and AI agents_

[![Version](https://img.shields.io/visual-studio-marketplace/v/ric-v.postgres-explorer?style=for-the-badge&logo=visual-studio-code&logoColor=white&color=2563EB)](https://marketplace.visualstudio.com/items?itemName=ric-v.postgres-explorer)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/ric-v.postgres-explorer?style=for-the-badge&logo=visual-studio-code&logoColor=white&color=10B981)](https://marketplace.visualstudio.com/items?itemName=ric-v.postgres-explorer)
[![License](https://img.shields.io/badge/license-MIT-8B5CF6?style=for-the-badge&logo=opensourceinitiative&logoColor=white)](LICENSE)
[![Status](https://img.shields.io/badge/stable-v2.4.0-0EA5E9?style=for-the-badge&logo=git&logoColor=white)](CHANGELOG.md)

<br />

**NexQL brings connection management, schema exploration, SQL notebooks, query intelligence, safe database operations, and AI-native workflows into the editor where you already build software: VS Code.**

[📖 Documentation](https://nexql.astrx.dev/) · [🛒 Marketplace](https://marketplace.visualstudio.com/items?itemName=ric-v.postgres-explorer) · [🌐 NexQL OSS](https://github.com/NexQL-OSS) · [🤝 Contributing](#-contributing) · [📝 Changelog](CHANGELOG.md)

</div>

---

## One workbench. Every database moment.

NexQL is designed for the full PostgreSQL workflow—not just sending a query and staring at a result grid.

| Moment         | What NexQL gives you                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Connect**    | Secure connection storage, SSL, SSH tunnels, environment signals, and compatibility across PostgreSQL-wire databases      |
| **Explore**    | A fast database tree for schemas, tables, views, functions, types, roles, extensions, and foreign data wrappers           |
| **Query**      | Native <code>.pgsql</code> notebooks, completion, saved queries, result streaming, export, and keyboard-first execution   |
| **Understand** | EXPLAIN CodeLens, query history, table intelligence, index usage, activity monitoring, and visual result analysis         |
| **Operate**    | Guarded CRUD and DDL workflows, maintenance commands, transactions, object definition viewers, and migration-friendly SQL |
| **Extend**     | AI assistance and MCP tools that ground compatible agents in the live database while keeping execution human-approved     |

### Built for real database work

- **Schema and application development** — inspect objects, write repeatable notebook workflows, and move from a failing query to a tested fix.
- **Production investigation** — distinguish environments at a glance, inspect activity and locks, profile tables, and diagnose regressions without leaving VS Code.
- **Performance engineering** — run EXPLAIN workflows, review plan shape, inspect index usage, and keep query history close to the code that caused it.
- **Data exploration** — filter, transpose, inspect column statistics, stream large results, create charts, and export only what you need.
- **AI-assisted engineering** — generate, explain, optimize, and analyze SQL with schema-aware context; connect MCP-capable agents to safe live database tools.

NexQL is built around a simple principle: **make database work feel like software work—contextual, reviewable, repeatable, and close to the code.**

---

## 📺 See the workflow

The [NexQL website](https://nexql.astrx.dev/) includes an interactive VS Code workbench demo covering the complete product loop:

1. Connect to a database and orient yourself in its schema.
2. Write and execute SQL in a native notebook.
3. Ask AI for schema-grounded help when the problem is ambiguous.
4. Inspect plans, activity, results, and performance signals.
5. Make a controlled change with the right environment context.

---

## ✨ Capability map

### Connection and environment safety

- Credentials stored with VS Code SecretStorage encryption.
- Environment tagging for **PROD**, **STAGING**, and **DEV**.
- Read-only mode, risk scoring, confirmation prompts, and configurable Auto-LIMIT protection.
- SSL modes, CA certificates, SSH tunneling, and PostgreSQL-compatible cloud connection support.
- Pooler-aware guidance for services such as Neon and Supabase.

### A database explorer that stays close to your code

- Browse databases, schemas, tables, views, materialized views, functions, procedures, aggregates, types, roles, extensions, sequences, triggers, partitions, publications, event triggers, tablespaces, and FDWs.
- Open object definitions as readable SQL with copy, edit, and routine scaffolding workflows.
- Create and modify tables with a visual designer where available.
- Manage indexes and constraints without losing the underlying SQL.
- Drag tables, columns, functions, notebooks, and saved queries into the SQL Assistant as context.

### Notebooks, results, and reusable knowledge

- Native <code>.pgsql</code> notebooks with persistent cells, rich output, completions, and execution history.
- Saved query library with tags, connection context restoration, in-place editing, and optional AI-generated metadata.
- Result grids with filtering, column statistics, transpose view, structured in-grid editing, and explicit commit confirmation.
- Sliding-window streaming for large <code>SELECT</code> results.
- Configurable <code>bytea</code> rendering for hex, PostgreSQL, and JSON-debug workflows.
- Export results to CSV, JSON, or Excel.
- One-click charts for bar, line, area, pie, doughnut, and scatter exploration.

### Performance and operational intelligence

- EXPLAIN CodeLens directly from notebook cells.
- Historical query execution tracking with degradation signals.
- Table profiles covering size, statistics, activity, index usage, and bloat indicators.
- Live activity monitoring with lock/wait status and health-focused telemetry cards.
- Index and constraint management, plus schema search and migration-oriented workflows.

### AI and agent connectivity

- Natural language to SQL with live schema context.
- Query explanation, optimization guidance, error translation, and result-set analysis.
- Multiple SQL Assistant tabs for parallel investigations.
- Provider flexibility: NexQL Free AI, GitHub Models, GitHub Copilot/VS Code LM, OpenAI, Anthropic, Gemini, Ollama, LM Studio, and custom OpenAI-compatible endpoints.
- Built-in MCP integration for schema discovery, safe <code>SELECT</code>, EXPLAIN, join-path inference, table statistics, and index usage.
- The default AI workflow is notebook-first: AI proposes SQL, you review it, and you choose when to execute it.

---

## Core, Pro, and the product you install

NexQL uses an open-core architecture:

- **NexQL Core** is this MIT-licensed repository. It contains the open-source extension foundation, connection and explorer workflows, notebooks, database operations, safety primitives, testing infrastructure, and extension seams.
- **NexQL Pro** is the published Marketplace/Open VSX build. It layers premium product capabilities—including AI chat, MCP, dashboard, Plan Studio, backup and restore, visual schema design, and database indexing—on top of Core.
- Both distributions are built from the same product direction. Core is intentionally usable on its own and intentionally extensible.

This distinction matters when building locally: a Core checkout produces the free/OSS build unless a sibling <code>packages/pro</code> checkout is present.

## 📋 Capability and availability matrix

| Area                                                             |                                  Core / OSS | Marketplace / Pro |
| ---------------------------------------------------------------- | ------------------------------------------: | ----------------: |
| Secure connections, SSL, SSH, and environment signals            |                                          ✅ |                ✅ |
| Database explorer and PostgreSQL object operations               |                                          ✅ |                ✅ |
| SQL notebooks, completions, saved queries, and exports           |                                          ✅ |                ✅ |
| Query safety, read-only mode, Auto-LIMIT, and confirmation flows |                                          ✅ |                ✅ |
| EXPLAIN workflows, result tooling, and core performance services |                                          ✅ |                ✅ |
| AI chat and provider integrations                                |                              Extension seam |                ✅ |
| Live monitoring dashboard                                        |                              Extension seam |                ✅ |
| MCP server and agent tools                                       | Extension seam / bundled integration points |                ✅ |
| Backup and restore                                               |                                           — |                ✅ |
| Database indexing and semantic grounding                         |                                           — |                ✅ |
| Plan Studio and visual schema designer                           |                                           — |                ✅ |

The exact premium surface evolves with the published build. See [CHANGELOG.md](CHANGELOG.md) and the [NexQL website](https://nexql.astrx.dev/) for the current product surface.

---

## 🌐 PostgreSQL, wherever it runs

NexQL speaks the PostgreSQL wire protocol, so it works with self-hosted databases, local containers, managed services, and compatible distributed systems.

| Platform                                      | Status               | Connection note                                                                             |
| --------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------- |
| PostgreSQL 12–17                              | ✅ Supported         | Integration-tested across the supported release range                                       |
| **Neon**                                      | ✅ Works             | Prefer the direct, non-pooler endpoint with SSL <code>require</code>                        |
| **Supabase**                                  | ✅ Works             | Use direct or session pooler connections; avoid transaction pooler for interactive sessions |
| **TimescaleDB / Timescale Cloud**             | ✅ Compatible        | PostgreSQL extension compatibility                                                          |
| **YugabyteDB (YSQL)**                         | ✅ Mostly compatible | Use port 5433; capability-gated features fall back when needed                              |
| AWS RDS / Aurora                              | ✅ Works             | Use the provider’s SSL requirements                                                         |
| Google Cloud SQL / AlloyDB                    | ✅ Works             | Use the provider’s SSL requirements                                                         |
| Azure Database for PostgreSQL Flexible Server | ✅ Works             | Set SSL mode to <code>require</code> or stronger                                            |

See [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) for the detailed matrix, provider-specific settings, and caveats.

---

## 🚀 Quick start

### Install the published extension

```bash
# From VS Code
ext install ric-v.postgres-explorer

# Or from a terminal
code --install-extension ric-v.postgres-explorer
```

Then open the **PostgreSQL** activity-bar view, choose **Add Connection**, enter your details, and connect.

### Your first useful loop

1. Add a connection and label its environment.
2. Expand a schema and open a table or function.
3. Open a <code>.pgsql</code> notebook and write a query.
4. Use **Ctrl+Enter** to execute the current cell.
5. Save the query with its connection and schema context.
6. Use EXPLAIN, table intelligence, or result analysis when the question becomes a performance question.

### Keyboard shortcuts

| Shortcut                  | Action                            |
| ------------------------- | --------------------------------- |
| <code>Ctrl+Enter</code>   | Execute the current cell          |
| <code>Shift+Enter</code>  | Execute and move to the next cell |
| <code>F5</code>           | Refresh the current item          |
| <code>Ctrl+Shift+P</code> | Open the Command Palette          |

---

## 🤝 Share connections with nexql-mcp

Run **NexQL: Export Connections to .nexql/config.toml (nexql-mcp)** to write selected connections to `<workspace>/.nexql/config.toml` (merge or replace if it exists), and **Import Connections from .nexql/config.toml (nexql-mcp)** to load them on another machine. The file uses the same `[profiles.<name>]` format as the nexql-mcp server, so a team can commit one file for both tools. It never contains passwords, SSH keys or tokens; import prompts for each password and stores it in VS Code SecretStorage.

| Extension | nexql-mcp |
|---|---|
| host, port, database, username | `host`, `port`, `dbname`, `user` |
| sslmode, SSL cert/key/CA paths | `sslmode`, `sslcert`, `sslkey`, `sslrootcert` |
| read-only mode on / off | `access_mode = "read"` / `"write"` (never `"admin"`) |
| statement timeout | `statement_timeout_ms` |
| environment, group, SSH host/port/user, connect timeout, application name, options | `[profiles.<name>.vscode]` (ignored by nexql-mcp) |

## 💾 Saved queries: turn investigations into reusable knowledge

Saved Queries preserves the context that usually gets lost after a database investigation:

- **Tag-based organization** — group queries by topic such as analytics, maintenance, or daily reports.
- **Connection context** — remember the original connection, database, and schema.
- **One-click reopening** — restore the query in a notebook with its original context.
- **In-place editing** — update title, description, tags, and SQL without creating duplicates.
- **Optional AI metadata** — generate titles, descriptions, and tags when the published AI surface is enabled.

Typical workflow:

1. Use the **Save Query** CodeLens action on a notebook cell.
2. Add a title, description, and tags.
3. Reopen it from the Saved Queries tree when the investigation returns.
4. Edit it in place as the schema or operational question evolves.

## 🛠️ Database operations at a glance

NexQL keeps common administration actions discoverable while preserving the SQL underneath:

| Object                       | Operations                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------- |
| **Tables**                   | View, edit, insert, update, delete, truncate, drop, VACUUM, ANALYZE, REINDEX |
| **Views**                    | View definition, edit, query data, drop                                      |
| **Materialized views**       | Refresh, view data, edit, drop                                               |
| **Functions and procedures** | View, edit, call with parameters, drop                                       |
| **Types and domains**        | View properties, edit, drop                                                  |
| **Foreign data wrappers**    | Create/drop servers, user mappings, import schema                            |
| **Foreign tables**           | View, edit, drop                                                             |
| **Extensions**               | Enable, disable, drop                                                        |
| **Roles**                    | Grant/revoke permissions, edit, drop                                         |

The available operation set is capability-aware and may vary by PostgreSQL version, permissions, and compatible platform.

---

## 🤖 AI and MCP: capability without blind execution

NexQL treats AI as a database-aware collaborator, not an unattended production operator.

### NexQL Free AI

The published product offers a zero-configuration managed provider:

- **Smart** — everyday query generation, explanations, and schema help.
- **Engineer** — deeper optimization and migration support.
- **Architect** — advanced database engineering workflows.

Availability, quotas, and pricing can change; use [AI Settings](https://nexql.astrx.dev/#ai) and the current Marketplace listing for the latest details.

### Bring your own provider

Configure NexQL to use GitHub Models, GitHub Copilot/VS Code LM, OpenAI, Anthropic, Gemini, Ollama, LM Studio, or a custom OpenAI-compatible endpoint. Provider configuration is exposed through <code>postgresExplorer.ai.chat.provider</code> and **NexQL: Open AI Settings**.

### MCP for compatible agents

The published product can expose live, read-focused database tools to GitHub Copilot, Cursor, Claude Desktop, Codex, and other MCP-compatible clients:

- Discover schemas and objects.
- Describe objects and search schema metadata.
- Run safe <code>SELECT</code> statements.
- Explain queries.
- Infer join paths.
- Inspect table statistics and index usage.

By default, VS Code can spawn the bundled <code>nexql-mcp</code> binary through stdio. For external clients, NexQL also supports an optional fixed port and SecretStorage-backed bearer token. SSH-tunneled connections are intentionally excluded from ephemeral MCP profiles; managed TLS profiles carry the relevant certificate settings.

Configure MCP from **NexQL Settings → Preferences**. Use <code>postgresExplorer.mcp.binaryPath</code> to override binary resolution when debugging or packaging.

### Safe execution model

1. **Ask** — you describe the goal or trigger an analysis.
2. **Ground** — NexQL supplies selected live schema or result context.
3. **Propose** — AI produces SQL, an explanation, or an optimization path.
4. **Review** — you inspect the generated content in chat or a notebook.
5. **Execute** — you explicitly run the cell when you are ready.

No query is executed automatically by the notebook-first AI workflow.

---

## 🔒 Privacy and telemetry

NexQL ships a privacy-first telemetry client for anonymous product analytics:

- SQL text, schema and object names, hostnames, database names, usernames, and credentials are not collected.
- VS Code’s global telemetry setting is a hard gate; when disabled globally, NexQL telemetry is disabled.
- Event payloads are allowlisted and bucketed, including durations and result sizes, to avoid raw sensitive values.

### Configure telemetry

Set these in VS Code settings:

- <code>postgresExplorer.telemetry.mode</code>: <code>off | basic | detailed</code> — default: <code>basic</code>
- <code>postgresExplorer.telemetry.allowUsage</code>: anonymous usage counters — default: <code>true</code>
- <code>postgresExplorer.telemetry.allowPerformance</code>: anonymized performance buckets — default: <code>false</code>

### Optional PostHog sink

- <code>postgresExplorer.telemetry.posthogHost</code>: defaults to <code>https://us.i.posthog.com</code>
- <code>postgresExplorer.telemetry.posthogApiKey</code>: your PostHog project key

If <code>posthogApiKey</code> is empty, telemetry remains local through the debug sink.

Tracked event families include lifecycle, feature usage, connection outcomes, query success/failure with coarse buckets, and provider-level AI outcomes.

---

## 📚 Documentation map

- <code>README.md</code> — product overview, architecture, installation, development, and troubleshooting
- <code>MARKETPLACE.md</code> — concise Marketplace-facing product description
- <code>docs/COMPATIBILITY.md</code> — platform compatibility matrix and provider caveats
- <code>docs/ARCHITECTURE.md</code> — system architecture and component/data-flow details
- <code>docs/STYLING_GUIDE.md</code> — centralized styling and UI refactoring patterns
- <code>docs/TESTING.md</code> — test strategy and execution notes
- <code>SECURITY.md</code> — vulnerability reporting and security policy
- <code>CHANGELOG.md</code> — release history and migration-relevant changes
- <code>walkthroughs/</code> — guided onboarding steps for connections, explorer, notebooks, and sync

**Stable:** <code>v2.4.0</code> · **Nightly:** <code>v2.5.0</code>
See [CHANGELOG.md](CHANGELOG.md) for the current release notes and [the website](https://nexql.astrx.dev/) for product-level updates.

---

## 🏗️ Project structure

```text
NexQL-Core/
├── src/
│   ├── extension.ts                 # Extension entry point
│   ├── commands/                    # Database and notebook commands
│   │   ├── sql/                     # Reusable SQL template modules
│   │   └── ...
│   ├── providers/                   # Tree, notebook, completion, and chat seams
│   ├── services/                    # Connections, secrets, query history, telemetry
│   ├── renderer/                    # Notebook result rendering and interactions
│   ├── ui/                          # Shared UI and renderer components
│   ├── pro/                         # Core ↔ Pro integration seam and stubs
│   └── test/                        # Unit, integration, and renderer tests
├── resources/                       # Icons, styles, and bundled assets
├── docs/                            # Technical documentation
├── walkthroughs/                    # Guided in-product onboarding content
├── scripts/                         # Build, package, test, and release helpers
├── package.json                     # Extension manifest and scripts
└── tsconfig*.json                   # TypeScript configurations
```

---

## 🛠️ Local development

### Prerequisites

- **Node.js** ≥ 18.0.0
- **VS Code** ≥ 1.105.0
- **PostgreSQL** for local and integration testing
- **Docker** for the compatibility test matrix

### Setup

```bash
git clone https://github.com/NexQL-OSS/NexQL-Core.git
cd NexQL-Core
npm ci

# Compile the Core build
npm run compile
```

To work on the Pro build, clone the private Pro repository as <code>packages/pro</code> inside the Core checkout. The Core build scripts alias <code>@nexql/pro</code> to that path when present; see [NexQL Pro](https://github.com/NexQL-OSS) or the project maintainers for access and packaging instructions.

### Development commands

| Command                                | Description                                                      |
| -------------------------------------- | ---------------------------------------------------------------- |
| <code>npm run watch</code>             | Watch TypeScript and recompile                                   |
| <code>npm run compile</code>           | One-time TypeScript compilation                                  |
| <code>npm run esbuild</code>           | Build the free/OSS bundle with source maps                       |
| <code>npm run esbuild:pro</code>       | Build the Pro bundle when <code>packages/pro</code> is available |
| <code>npm run esbuild-watch</code>     | Watch extension and renderer bundles                             |
| <code>npm run lint</code>              | Run ESLint                                                       |
| <code>npm run format</code>            | Check Prettier formatting                                        |
| <code>npm run test</code>              | Compile and run unit tests                                       |
| <code>npm run test:all</code>          | Run the complete test suite                                      |
| <code>npm run coverage</code>          | Run unit tests with coverage                                     |
| <code>npm run vscode:prepublish</code> | Produce the free release build                                   |

### Run the extension

1. Open the Core project in VS Code.
2. Press <code>F5</code> to launch an Extension Development Host.
3. Or use **Run and Debug → Run Extension**.

Useful debugging surfaces:

- Output panel: <code>Ctrl+Shift+U</code> → select **NexQL**.
- Extension-host DevTools: <code>Ctrl+Shift+I</code>.
- Webview DevTools: right-click inside a webview → **Inspect**.

---

## 🧪 Testing

### Standard commands

```bash
npm ci
npm run test:all
npm run coverage

# Focused suites
npm run test:unit
npm run test:integration
npm run test:renderer
```

### Docker-based PostgreSQL matrix

```bash
make docker-up
npm run test:integration
make docker-down
```

The test infrastructure covers:

- Unit behavior with Mocha, Chai, and Sinon.
- Connection lifecycle, SSL, pool exhaustion, SSH, and version compatibility.
- Renderer components, tree views, forms, notebooks, and dashboards.
- PostgreSQL 12, 14, 15, 16, and 17 containers.
- CI matrix coverage across Node.js 18–22 and PostgreSQL 12–17.

The repository also provides focused Make targets:

```bash
make test-unit
make test-integration
make test-renderer
make test-all
make coverage
make test-full
```

For platform-specific helpers:

```bash
# Linux/macOS
./scripts/test.sh --unit
./scripts/test.sh --integration --pg 16
./scripts/test.sh --coverage

# Windows
scripts\test.bat --unit
scripts\test.bat --integration --pg 16
scripts\test.bat --coverage
```

---

## 🤝 Contributing

- 🐛 [Report a bug](https://github.com/NexQL-OSS/NexQL-Core/issues/new?template=bug_report.md)
- 💡 [Request a feature](https://github.com/NexQL-OSS/NexQL-Core/issues/new?template=feature_request.md)
- 🔧 Fork → branch → pull request
- 🧪 Run <code>npm run test:all && npm run coverage</code> before submitting

Use [Conventional Commits](https://www.conventionalcommits.org/):

```text
feat: add a feature
fix: resolve a defect
docs: improve documentation
refactor: restructure code
test: add or update tests
chore: maintain tooling
```

---

## 📦 Building and publishing

```bash
# Build a VSIX
npx vsce package

# Publish to VS Code Marketplace
npx vsce publish

# Publish to Open VSX
npx ovsx publish
```

### Stable and nightly channels

- Stable releases use version tags (<code>v\*</code>) in the Pro publishing repository.
- Nightly releases are published as pre-releases from the nightly workflow.
- Stable extension ID: <code>ric-v.postgres-explorer</code>.
- Open VSX nightly companion ID: <code>ric-v.postgres-explorer-nightly</code>.
- In VS Code, switch through **Switch to Pre-Release Version** or **Switch to Release Version**.
- On Open VSX-based editors, uninstall the nightly companion to return to stable.

The Core repository itself does not contain Marketplace secrets or the Pro publishing workflows. Publishing responsibilities live with the Pro distribution.

---

## 📝 License and open-core notice

This repository is available under the [MIT License](LICENSE).

The Core checkout builds a fully working free/OSS extension with <code>make package-free</code>. Anyone may fork, rebrand, and publish that build under their own extension ID. The <code>ric-v.postgres-explorer</code> Marketplace/Open VSX product is the Pro build: Core plus proprietary premium features maintained in the private Pro repository.

Repository history before the open-core split may contain formerly bundled premium sources under MIT. New premium development belongs in the Pro repository and should connect through the documented Core ↔ Pro seam.

---

## 🔧 Troubleshooting

### SSL connection failures

**Symptoms:** <code>SSL connection failed</code> or <code>certificate verify failed</code>.

- Use <code>disable</code> only for local development.
- Try <code>prefer</code> when the server supports both modes.
- For verified connections, use <code>verify-ca</code> and provide the CA certificate path.
- Check the provider’s required SSL mode and certificate chain.

### Connection timeouts

**Symptoms:** <code>Connection timeout</code> or <code>ETIMEDOUT</code>.

- Increase the connection timeout in settings.
- Check firewall and security-group rules.
- Verify <code>pg_hba.conf</code> allows the client.
- Confirm PostgreSQL is listening on the expected interface and port.

### SSH tunnel failures

- Verify the SSH host, user, key, and port.
- Test manually with <code>ssh user@host -p port</code>.
- Check private-key permissions with <code>chmod 600 ~/.ssh/id_rsa</code>.
- Confirm the SSH server allows port forwarding.

### Large result sets

NexQL bounds result rendering and supports configurable limits plus sliding-window streaming. Use an explicit <code>LIMIT</code> for targeted investigations and increase result settings only when you understand the memory and network cost.

### Slow tree view

- Filter the tree to narrow the object set.
- Collapse unused schemas.
- Disable object-count badges when working with very large catalogs.
- Prefer a targeted schema search for high-cardinality databases.

### Common errors

| Error                                       | Likely cause            | First check                                     |
| ------------------------------------------- | ----------------------- | ----------------------------------------------- |
| <code>password authentication failed</code> | Wrong credentials       | Verify the username, password, and auth method  |
| <code>database does not exist</code>        | Incorrect database name | Confirm the target database                     |
| <code>permission denied</code>              | Insufficient privileges | Grant the required object or schema permissions |
| <code>too many connections</code>           | Pool exhaustion         | Close unused sessions and review pool settings  |
| <code>no pg_hba.conf entry</code>           | Access-control mismatch | Add a matching <code>pg_hba.conf</code> rule    |

---

## How NexQL is different

NexQL is intentionally opinionated about the developer workflow:

| Capability                 | NexQL                                                                      |
| -------------------------- | -------------------------------------------------------------------------- |
| Native VS Code integration | Database work lives beside application code                                |
| SQL notebooks              | Queries, context, outputs, and reasoning stay together                     |
| Safety signals             | Environment tags, read-only mode, risk scoring, confirmation, Auto-LIMIT   |
| Performance workflow       | EXPLAIN, activity, table intelligence, index signals, and query history    |
| AI workflow                | Schema-aware assistance with explicit human approval before execution      |
| Agent workflow             | MCP tools grounded in the live database rather than copied schema snippets |
| Open core                  | A usable MIT Core with a clear extension seam for the Pro product          |

---

<div align="center">

**Made with ❤️ for the PostgreSQL community**

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-336791?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![VS Code](https://img.shields.io/badge/VS%20Code-007ACC?style=flat-square&logo=visual-studio-code&logoColor=white)](https://code.visualstudio.com/)

Also available on [Open VSX](https://open-vsx.org/extension/ric-v/postgres-explorer)

</div>
