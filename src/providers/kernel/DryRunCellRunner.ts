import * as vscode from 'vscode';
import { NotebookCellOutput, NotebookCellOutputItem } from 'vscode';
import { debugWarn } from '../../common/logger';
import { ConnectionManager } from '../../services/ConnectionManager';
import { extensionContext } from '../../extension';
import { ConnectionUtils } from '../../utils/connectionUtils';
import { QueryExecutionService } from '../../services/QueryExecutionService';
import { cancelInFlightQuery } from './executeQueryImpl';
import { QueryCodeLensProvider } from '../QueryCodeLensProvider';
import { analyzeDryRun } from '../../services/dryRun/dryRunAnalyzer';
import {
  DEFAULT_DRY_RUN_MAX_ROWS,
  DEFAULT_DRY_RUN_TIMEOUT_MS,
  DryRunService,
  type DryRunResult,
  type DryRunSnapshot,
} from '../../services/dryRun/DryRunService';
import { BYTEA_DISPLAY_DEFAULT, type DryRunInfo, type NoticeLogEntry, type PostgresMetadata, type QueryResults } from '../../common/types';

const RESULT_MIME = 'application/vnd.postgres-notebook.result';
const ERROR_MIME = 'application/vnd.postgres-notebook.error';

/**
 * Placeholder shown/exported instead of the real statement. Dry-run outputs must never carry
 * re-runnable SQL: export, "run on full dataset" and derived-query actions in the renderer
 * would otherwise re-execute the write for real.
 */
export const DRY_RUN_QUERY_PLACEHOLDER = '-- Dry run result (rolled back). This output is not re-runnable.';

function jsonOutput(mime: string, payload: unknown): NotebookCellOutput {
  return new NotebookCellOutput([new NotebookCellOutputItem(Buffer.from(JSON.stringify(payload), 'utf8'), mime)]);
}

/** Pure: turn a service result into notebook result payloads (before first, then after/summary). */
export function buildDryRunResultPayloads(
  result: DryRunResult,
  context: { rowCap: number; executionTimeSec: number; backendPid: number | null; breadcrumb?: QueryResults['breadcrumb']; sourceCellIndex?: number; notices?: NoticeLogEntry[] },
): QueryResults[] {
  const verb = result.plan?.verb ?? 'DDL';
  const mode = result.mode ?? 'transaction';
  const baseInfo = {
    verb,
    affectedCount: result.affectedCount,
    rowCap: context.rowCap,
    mode,
    rollbackConfirmed: result.rollbackConfirmed,
    notes: result.notes,
  };

  const make = (phase: DryRunInfo['phase'], snap?: DryRunSnapshot, extra?: Partial<QueryResults>): QueryResults => {
    const info: DryRunInfo = {
      ...baseInfo,
      phase,
      shownRows: snap?.shownRows ?? 0,
      capped: snap?.capped ?? false,
    };
    return {
      success: true,
      rows: snap?.rows ?? [],
      columns: snap?.columns ?? [],
      columnTypes: snap?.columnTypes ?? {},
      rowCount: phase === 'before' ? (snap?.shownRows ?? 0) : (result.affectedCount ?? snap?.totalRows ?? 0),
      command: phase === 'before' ? 'BEFORE' : verb === 'DDL' ? 'DDL' : 'AFTER',
      query: DRY_RUN_QUERY_PLACEHOLDER,
      exportQuery: DRY_RUN_QUERY_PLACEHOLDER,
      byteaDisplayFormat: BYTEA_DISPLAY_DEFAULT,
      notices: [],
      executionTime: context.executionTimeSec,
      backendPid: context.backendPid,
      breadcrumb: context.breadcrumb,
      sourceCellIndex: context.sourceCellIndex,
      dryRun: info,
      ...extra,
    };
  };

  const out: QueryResults[] = [];
  if (result.before) {
    out.push(make('before', result.before));
  }
  if (result.after) {
    out.push(make('after', result.after, { notices: context.notices ?? [] }));
  } else {
    out.push(make('summary', undefined, { notices: context.notices ?? [] }));
  }
  return out;
}

/**
 * Runs a notebook cell as a dry run: single write statement executed in a transaction (or
 * savepoint) that is always rolled back. See {@link DryRunService} for the safety argument.
 */
export class DryRunCellRunner {
  constructor(
    private readonly controller: vscode.NotebookController,
    private readonly messaging?: vscode.NotebookRendererMessaging,
    private readonly service: DryRunService = new DryRunService(),
  ) {}

  async execute(cell: vscode.NotebookCell): Promise<void> {
    const execution = this.controller.createNotebookCellExecution(cell);
    execution.start(Date.now());
    await execution.clearOutput();

    const cellUri = cell.document.uri.toString();
    const sessionKey = cell.notebook.uri.toString();
    const inFlightMap = QueryExecutionService.getInFlightMap();
    const executingMap = QueryExecutionService.getExecutingBySession();
    let client: import('pg').Client | undefined;
    let noticeListener: ((msg: { message?: string }) => void) | undefined;
    let cancelSub: vscode.Disposable | undefined;
    let entry: { backendPid: number | null; connectionId: string; databaseName: string; cancelled: boolean; client?: import('pg').Client } | undefined;

    try {
      const sql = cell.document.getText();
      const analysis = analyzeDryRun(sql);
      if (!analysis.ok) {
        await execution.replaceOutput(jsonOutput(ERROR_MIME, this.errorPayload(cell, sql, `Dry run not possible: ${analysis.reason}`)));
        execution.end(false, Date.now());
        return;
      }

      const metadata = ConnectionUtils.getEffectiveMetadata(cell.notebook.metadata) as PostgresMetadata;
      if (!metadata) {
        throw new Error('No connection metadata found');
      }
      const connection = ConnectionUtils.findConnectionWithFallback(metadata.connectionId, cell.notebook.metadata);
      if (!connection) {
        throw new Error('Connection not found');
      }

      const profile = extensionContext?.globalState.get<{ readOnlyMode?: boolean }>(`activeProfile-${sessionKey}`);
      const readOnly = connection.readOnlyMode === true || metadata.readOnlyMode === true || profile?.readOnlyMode === true;
      if (readOnly) {
        await execution.replaceOutput(
          jsonOutput(ERROR_MIME, this.errorPayload(cell, sql, 'Dry run not possible: this connection is in read-only mode, so writes are not allowed.')),
        );
        execution.end(false, Date.now());
        return;
      }

      const databaseName = metadata.databaseName || connection.database;
      client = await ConnectionManager.getInstance().getSessionClient(
        {
          id: connection.id,
          host: connection.host,
          port: connection.port,
          username: connection.username,
          database: databaseName,
          name: connection.name,
        },
        sessionKey,
      );

      const backendPid = (client as unknown as { processID?: number }).processID ?? null;
      const secretKey = (client as unknown as { secretKey?: number }).secretKey;
      entry = { backendPid, connectionId: connection.id, databaseName, cancelled: false, client };
      inFlightMap.set(cellUri, entry);
      executingMap.set(sessionKey, cellUri);

      cancelSub = execution.token.onCancellationRequested(() => {
        if (entry) {
          entry.cancelled = true;
        }
        void (async () => {
          try {
            if (backendPid && secretKey !== undefined && secretKey !== null) {
              await ConnectionManager.getInstance().sendCancelRequest(connection, backendPid, secretKey);
              return;
            }
          } catch (e) {
            debugWarn('[DryRun] wire cancel failed', e);
          }
          await cancelInFlightQuery(cellUri);
        })();
      });

      const notices: NoticeLogEntry[] = [];
      noticeListener = (msg) => {
        notices.push({ message: msg.message ?? String(msg), receivedAt: new Date().toISOString() });
      };
      client.on('notice', noticeListener);

      const cfg = vscode.workspace.getConfiguration('postgresExplorer');
      const timeoutMs = cfg.get<number>('dryRun.statementTimeoutMs', DEFAULT_DRY_RUN_TIMEOUT_MS);
      const maxRows = cfg.get<number>('dryRun.maxRows', DEFAULT_DRY_RUN_MAX_ROWS);

      const result = await this.service.run(client, sql, {
        sessionId: sessionKey,
        timeoutMs,
        maxRows,
        isCancelled: () => entry?.cancelled === true || execution.token.isCancellationRequested,
      });

      // The transaction is already closed here; everything below is output only.
      await this.render(execution, cell, sql, result, {
        rowCap: maxRows,
        backendPid,
        breadcrumb: {
          connectionId: connection.id,
          connectionName: connection.name || connection.host,
          database: databaseName,
        },
        notices,
      });
      execution.end(result.status === 'rolled-back', Date.now());
    } catch (err) {
      // Reaching here means the service itself threw (it handles SQL errors internally).
      // The service has already rolled back in its own finally; rendering failures end up here too.
      const message = err instanceof Error ? err.message : String(err);
      try {
        await execution.replaceOutput(jsonOutput(ERROR_MIME, this.errorPayload(cell, cell.document.getText(), `Dry run failed: ${message}`)));
      } catch {
        // ignore output failures
      }
      execution.end(false, Date.now());
    } finally {
      cancelSub?.dispose();
      if (client && noticeListener) {
        client.removeListener('notice', noticeListener);
      }
      inFlightMap.delete(cellUri);
      executingMap.delete(sessionKey);
      if (entry && this.messaging) {
        const editor = vscode.window.visibleNotebookEditors.find((e) => e.notebook === cell.notebook);
        if (editor) {
          void this.messaging.postMessage(
            { type: 'executionState', isExecuting: false, backendPid: entry.backendPid, connectionId: entry.connectionId, databaseName: entry.databaseName, cellUri },
            editor,
          );
        }
      }
    }
  }

  private errorPayload(cell: vscode.NotebookCell, query: string, message: string): Record<string, unknown> {
    return {
      success: false,
      error: message,
      query,
      executionTime: 0,
      slowQuery: false,
      canExplain: false,
      sourceCellIndex: cell.index,
    };
  }

  private async render(
    execution: vscode.NotebookCellExecution,
    cell: vscode.NotebookCell,
    sql: string,
    result: DryRunResult,
    ctx: { rowCap: number; backendPid: number | null; breadcrumb: QueryResults['breadcrumb']; notices: NoticeLogEntry[] },
  ): Promise<void> {
    const rollbackWarning = result.rollbackConfirmed
      ? ''
      : ` WARNING: the rollback could not be confirmed (${result.rollbackError ?? 'unknown error'}). Check the session state before continuing.`;

    if (result.status === 'cancelled') {
      await execution.replaceOutput(
        new NotebookCellOutput([
          new NotebookCellOutputItem(
            Buffer.from(`Dry run cancelled. Nothing was saved.${rollbackWarning}`, 'utf8'),
            'text/markdown',
          ),
        ]),
      );
      QueryCodeLensProvider.getInstance()?.updatePill(cell.document.uri.toString(), { success: false });
      return;
    }

    if (result.status === 'refused') {
      await execution.replaceOutput(
        jsonOutput(ERROR_MIME, this.errorPayload(cell, sql, `Dry run not possible: ${result.refusal?.reason ?? 'unsupported statement'}`)),
      );
      return;
    }

    if (result.status === 'error') {
      const payload = {
        ...this.errorPayload(cell, sql, `Dry run failed (rolled back, nothing was saved): ${result.error?.message ?? 'unknown error'}${rollbackWarning}`),
        executionTime: result.elapsedMs / 1000,
        errorCode: result.error?.code,
        breadcrumb: ctx.breadcrumb,
      };
      await execution.replaceOutput(jsonOutput(ERROR_MIME, payload));
      QueryCodeLensProvider.getInstance()?.updatePill(cell.document.uri.toString(), { success: false });
      return;
    }

    const payloads = buildDryRunResultPayloads(result, {
      rowCap: ctx.rowCap,
      executionTimeSec: result.elapsedMs / 1000,
      backendPid: ctx.backendPid,
      breadcrumb: ctx.breadcrumb,
      sourceCellIndex: cell.index,
      notices: ctx.notices,
    });
    await execution.replaceOutput(payloads.map((p) => jsonOutput(RESULT_MIME, p)));
    QueryCodeLensProvider.getInstance()?.updatePill(cell.document.uri.toString(), {
      success: true,
      elapsedSeconds: result.elapsedMs / 1000,
      rowCount: result.affectedCount ?? 0,
    });
  }
}
