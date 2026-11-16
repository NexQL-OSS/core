import * as vscode from 'vscode';
import { DatabaseTreeItem } from './DatabaseTreeProvider';
import { cmdDatabaseHealth } from '../commands/health';
import { getDatabaseConnection } from '../commands/helper';
import { validateCategoryItem } from '../commands/connection';
import { HealthSQL } from '../commands/sql/health';
import { queryServerVersionNum } from '../lib/postgresServerVersion';
import { getNonce } from '../lib/template-loader';
import { PANEL_BRAND_TOKENS_CSS } from '../common/htmlStyles';
import { disposePooledOwner, WebviewPool } from '../utils/WebviewPool';
import { buildHealthViewModel, HealthRaw, HealthSectionKey } from '../features/health/healthModel';
import { renderHealthHtml, renderHealthMessageHtml } from '../features/health/healthHtml';

type Queryable = { query: (sql: string) => Promise<{ rows: any[] }> };

/**
 * Database Health dashboard: status tiles, a short "what to do" list and one card per check.
 * Read-only. The same checks are available as a notebook through "Open as notebook".
 */
export class DatabaseHealthPanel {
  public static readonly viewType = 'pgStudio.databaseHealth';

  private static _panels = new Map<string, DatabaseHealthPanel>();

  public readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private _loading = false;

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly item: DatabaseTreeItem,
    private readonly context: vscode.ExtensionContext | undefined,
  ) {
    this._panel = panel;
    this._disposables.push(
      panel.webview.onDidReceiveMessage(msg => void this.onMessage(msg)),
    );
  }

  public dispose(isRecycling = false): void {
    const key = [...DatabaseHealthPanel._panels.entries()].find(([, v]) => v === this)?.[0];
    if (key) {
      DatabaseHealthPanel._panels.delete(key);
    }
    if (!isRecycling) {
      this._panel.dispose();
    }
    for (const d of this._disposables) {
      d.dispose();
    }
    this._disposables = [];
  }

  public static async open(item: DatabaseTreeItem, context?: vscode.ExtensionContext): Promise<void> {
    validateCategoryItem(item);
    const database = item.databaseName ?? String(item.label);
    const panelKey = `health:${item.connectionId}:${database}`;

    const existing = DatabaseHealthPanel._panels.get(panelKey);
    if (existing) {
      existing._panel.reveal(vscode.ViewColumn.Active);
      void existing.refresh();
      return;
    }

    const { panel, commit } = WebviewPool.getInstance().getOrCreate(
      DatabaseHealthPanel.viewType,
      panelKey,
      `Health: ${database}`,
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true },
      {
        onDispose: () => disposePooledOwner(DatabaseHealthPanel._panels, panel, false),
        onRecycle: recycled => disposePooledOwner(DatabaseHealthPanel._panels, recycled.panel, true),
      },
    );
    const owner = new DatabaseHealthPanel(panel, item, context);
    DatabaseHealthPanel._panels.set(panelKey, owner);
    commit?.();
    await owner.refresh();
  }

  private get database(): string {
    return this.item.databaseName ?? String(this.item.label);
  }

  private render(html: (nonce: string) => string): void {
    this._panel.webview.html = html(getNonce());
  }

  private async onMessage(msg: { type?: string; text?: string }): Promise<void> {
    switch (msg?.type) {
      case 'refresh':
        await this.refresh();
        break;
      case 'openNotebook':
        await cmdDatabaseHealth(this.item, this.context);
        break;
      case 'copy':
        if (typeof msg.text === 'string') {
          await vscode.env.clipboard.writeText(msg.text);
        }
        break;
    }
  }

  public async refresh(): Promise<void> {
    if (this._loading) {
      return;
    }
    this._loading = true;
    const opts = { cspSource: this._panel.webview.cspSource, brandCss: PANEL_BRAND_TOKENS_CSS };
    this.render(nonce => renderHealthMessageHtml(`Database Health: ${this.database}`, 'Running checks…', { ...opts, nonce }));

    let dbConn: Awaited<ReturnType<typeof getDatabaseConnection>> | undefined;
    try {
      dbConn = await getDatabaseConnection(this.item, validateCategoryItem);
      const raw = await collectHealth(dbConn.client as unknown as Queryable, this.database);
      const vm = buildHealthViewModel(raw);
      this.render(nonce => renderHealthHtml(vm, { ...opts, nonce }));
    } catch (err: any) {
      this.render(nonce =>
        renderHealthMessageHtml(`Database Health: ${this.database}`, `Could not run the checks: ${err?.message ?? err}`, {
          ...opts,
          nonce,
          retry: true,
        }),
      );
    } finally {
      dbConn?.release?.();
      this._loading = false;
    }
  }
}

/**
 * Run every check on one connection. A failing check is reported in `errors` and the others still run,
 * so one missing permission does not blank the whole dashboard.
 */
export async function collectHealth(client: Queryable, database: string): Promise<HealthRaw> {
  const raw: HealthRaw = { database, generatedAt: new Date(), errors: {} };
  const errors = raw.errors!;
  const attempt = async <T>(key: HealthSectionKey, fn: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await fn();
    } catch (err: any) {
      errors[key] = String(err?.message ?? err);
      return undefined;
    }
  };

  raw.summary = (await attempt('summary', async () => (await client.query(HealthSQL.summary())).rows[0])) ?? null;
  raw.bloat = await attempt('bloat', async () => (await client.query(HealthSQL.tableBloat())).rows);
  raw.unusedIndexes = await attempt('unusedIndexes', async () => (await client.query(HealthSQL.unusedIndexes())).rows);
  raw.fkNoIndex = await attempt('fkNoIndex', async () => (await client.query(HealthSQL.foreignKeysWithoutIndex())).rows);
  raw.locks = await attempt('locks', async () => (await client.query(HealthSQL.blockingLocks())).rows);
  raw.statements = await attempt('statements', async () => {
    const check = await client.query(HealthSQL.statementsExtensionCheck());
    if (check.rows?.[0]?.installed !== true) {
      return { installed: false, rows: [] };
    }
    const versionNum = await queryServerVersionNum(client as any);
    return { installed: true, rows: (await client.query(HealthSQL.slowStatements(versionNum))).rows };
  });
  return raw;
}
