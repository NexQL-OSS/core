import type { Client, PoolClient } from 'pg';
import { getPgDataTypeName, deduplicateColumns } from '../../common/pgDataTypeNames';
import { SqlParser } from '../../providers/kernel/SqlParser';
import { TransactionManager, getTransactionManager } from '../TransactionManager';
import { analyzeDryRun, type DryRunPlan, type DryRunRefusalCode } from './dryRunAnalyzer';

/**
 * Executes a single write statement as a "dry run": run it, capture before/after row
 * images, then ALWAYS roll back.
 *
 * Safety invariants (enforced here and covered by unit tests):
 *  1. This module never issues COMMIT/END/PREPARE. {@link DryRunService.exec} throws if a
 *     statement starting with one of those is ever passed to it.
 *  2. Everything that can fail between "entered" and "left" sits inside try/finally; the
 *     finally block always rolls back (ROLLBACK, or ROLLBACK TO SAVEPOINT + RELEASE when
 *     the session already had an open user transaction).
 *  3. The only user-supplied SQL is the single statement validated by {@link analyzeDryRun}
 *     (no transaction control, no multi-statement text). INSERT/UPDATE/DELETE are embedded
 *     inside a CTE so a smuggled statement separator would be a syntax error.
 *  4. Row data is fully materialised before the rollback; nothing downstream (rendering,
 *     output writes) runs inside the transaction.
 */

export const DEFAULT_DRY_RUN_TIMEOUT_MS = 30_000;
export const DEFAULT_DRY_RUN_MAX_ROWS = 200;

const TOTAL_COLUMN = '__nexql_dry_total';
const CTE_NAME = 'nexql_dry_run';

type PgClient = Client | PoolClient;

export interface DryRunOptions {
  /** Key used by TransactionManager (notebook URI). */
  sessionId: string;
  /** `SET LOCAL statement_timeout` in ms. */
  timeoutMs?: number;
  /** Max rows kept per snapshot. */
  maxRows?: number;
  /** Polled between steps; also used to classify a 57014 error as user cancellation. */
  isCancelled?: () => boolean;
  txManager?: TransactionManager;
}

export interface DryRunSnapshot {
  columns: string[];
  rows: Record<string, unknown>[];
  columnTypes: Record<string, string>;
  shownRows: number;
  /** True number of rows when known (after-image: always; before-image: not known beyond the cap). */
  totalRows: number | null;
  capped: boolean;
}

export type DryRunStatus = 'rolled-back' | 'error' | 'cancelled' | 'refused';

export interface DryRunResult {
  status: DryRunStatus;
  mode?: 'transaction' | 'savepoint';
  plan?: DryRunPlan;
  refusal?: { code: DryRunRefusalCode; reason: string };
  affectedCount: number | null;
  command?: string;
  before?: DryRunSnapshot;
  after?: DryRunSnapshot;
  notes: string[];
  error?: { message: string; code?: string; timedOut?: boolean };
  /** True when the ROLLBACK (or ROLLBACK TO SAVEPOINT) was issued and succeeded, or nothing was started. */
  rollbackConfirmed: boolean;
  rollbackError?: string;
  elapsedMs: number;
}

interface Ctx {
  mode?: 'transaction' | 'savepoint';
  savepoint?: string;
  viaManager?: boolean;
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function errCode(err: unknown): string | undefined {
  return (err as { code?: string } | undefined)?.code;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err);
}

export class DryRunService {
  private static counter = 0;

  async run(client: PgClient, sql: string, options: DryRunOptions): Promise<DryRunResult> {
    const started = Date.now();
    const notes: string[] = [];
    const finish = (r: Omit<DryRunResult, 'elapsedMs' | 'notes'> & { notes?: string[] }): DryRunResult => ({
      ...r,
      notes: [...notes, ...(r.notes ?? [])],
      elapsedMs: Date.now() - started,
    });

    const analysis = analyzeDryRun(sql);
    if (!analysis.ok) {
      return finish({
        status: 'refused',
        refusal: { code: analysis.code, reason: analysis.reason },
        affectedCount: null,
        rollbackConfirmed: true,
      });
    }
    const plan = analysis.plan;
    notes.push(...plan.notes);

    const txManager = options.txManager ?? getTransactionManager();
    const sessionId = options.sessionId;
    const info = txManager.getTransactionInfo(sessionId);
    if (info?.isActive && info.state === 'failed') {
      return finish({
        status: 'refused',
        plan,
        refusal: {
          code: 'unsupported',
          reason: 'The open transaction is in a failed state. Roll it back before running a dry run.',
        },
        affectedCount: null,
        rollbackConfirmed: true,
      });
    }
    if (info?.isActive && info.readOnly) {
      return finish({
        status: 'refused',
        plan,
        refusal: {
          code: 'unsupported',
          reason: 'The open transaction is READ ONLY, so a write cannot be dry-run inside it.',
        },
        affectedCount: null,
        rollbackConfirmed: true,
      });
    }

    const timeoutMs = Math.max(1, Math.floor(options.timeoutMs ?? DEFAULT_DRY_RUN_TIMEOUT_MS));
    const maxRows = Math.max(1, Math.floor(options.maxRows ?? DEFAULT_DRY_RUN_MAX_ROWS));
    const isCancelled = options.isCancelled ?? (() => false);

    const ctx: Ctx = {};
    let before: DryRunSnapshot | undefined;
    let after: DryRunSnapshot | undefined;
    let affectedCount: number | null = null;
    let command: string | undefined;
    let status: DryRunStatus = 'rolled-back';
    let error: DryRunResult['error'];
    let rollbackConfirmed = false;
    let rollbackError: string | undefined;

    try {
      await this.enter(client, ctx, txManager, sessionId);
      await this.exec(client, `SET LOCAL statement_timeout = ${timeoutMs}`);

      if (isCancelled()) {
        throw Object.assign(new Error('Dry run cancelled'), { code: '57014' });
      }

      if (plan.before) {
        before = await this.captureBefore(client, plan, maxRows, notes, isCancelled);
      }

      if (isCancelled()) {
        throw Object.assign(new Error('Dry run cancelled'), { code: '57014' });
      }

      const main = await this.runMain(client, plan, maxRows);
      after = main.after;
      affectedCount = main.affectedCount;
      command = main.command;

      if (isCancelled()) {
        status = 'cancelled';
        before = undefined;
        after = undefined;
        affectedCount = null;
      }
    } catch (err) {
      before = undefined;
      after = undefined;
      affectedCount = null;
      const message = errMessage(err);
      if (isCancelled() || (errCode(err) === '57014' && /user request|cancelled/i.test(message))) {
        status = 'cancelled';
      } else if (errCode(err) === '57014') {
        status = 'error';
        error = {
          message: `Statement exceeded the dry-run timeout of ${timeoutMs} ms and was stopped.`,
          code: '57014',
          timedOut: true,
        };
      } else {
        status = 'error';
        error = { message, code: errCode(err) };
      }
    } finally {
      // Runs for success, SQL errors, cancellation and any unexpected throw.
      const rb = await this.leave(client, ctx, txManager, sessionId);
      rollbackConfirmed = rb.confirmed;
      rollbackError = rb.error;
    }

    return finish({
      status,
      mode: ctx.mode,
      plan,
      affectedCount,
      command,
      before,
      after,
      error,
      rollbackConfirmed,
      rollbackError,
    });
  }

  // --- transaction scoping -------------------------------------------------

  private async enter(client: PgClient, ctx: Ctx, tm: TransactionManager, sessionId: string): Promise<void> {
    const name = `nexql_dryrun_${Date.now().toString(36)}_${++DryRunService.counter}`;
    const info = tm.getTransactionInfo(sessionId);

    if (info?.isActive) {
      await tm.createSavepoint(client, sessionId, name);
      ctx.mode = 'savepoint';
      ctx.savepoint = name;
      ctx.viaManager = true;
      return;
    }

    // Not known to be in a transaction. BEGIN inside an unknown outer transaction only
    // raises WARNING 25001 and is otherwise a no-op, so we must not ROLLBACK in that case.
    let outerTransaction = false;
    const onNotice = (n: { code?: string }) => {
      if (n?.code === '25001') {
        outerTransaction = true;
      }
    };
    const emitter = client as unknown as {
      on?: (e: string, l: (n: { code?: string }) => void) => unknown;
      removeListener?: (e: string, l: (n: { code?: string }) => void) => unknown;
    };
    emitter.on?.('notice', onNotice);
    try {
      await this.exec(client, 'BEGIN');
    } finally {
      emitter.removeListener?.('notice', onNotice);
    }

    if (outerTransaction) {
      await this.exec(client, `SAVEPOINT ${quoteIdent(name)}`);
      ctx.mode = 'savepoint';
      ctx.savepoint = name;
      ctx.viaManager = false;
      return;
    }
    ctx.mode = 'transaction';
  }

  private async leave(
    client: PgClient,
    ctx: Ctx,
    tm: TransactionManager,
    sessionId: string,
  ): Promise<{ confirmed: boolean; error?: string }> {
    if (!ctx.mode) {
      // Never entered (BEGIN/SAVEPOINT failed): nothing of ours to undo.
      return { confirmed: true };
    }
    if (ctx.mode === 'transaction') {
      let lastErr: unknown;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await this.exec(client, 'ROLLBACK');
          return { confirmed: true };
        } catch (e) {
          lastErr = e;
        }
      }
      return { confirmed: false, error: errMessage(lastErr) };
    }

    const sp = ctx.savepoint!;
    try {
      if (ctx.viaManager) {
        await tm.rollbackToSavepoint(client, sessionId, sp);
      } else {
        await this.exec(client, `ROLLBACK TO SAVEPOINT ${quoteIdent(sp)}`);
      }
    } catch (e) {
      return { confirmed: false, error: errMessage(e) };
    }
    try {
      if (ctx.viaManager) {
        await tm.releaseSavepoint(client, sessionId, sp);
      } else {
        await this.exec(client, `RELEASE SAVEPOINT ${quoteIdent(sp)}`);
      }
    } catch (e) {
      // Data is already rolled back; a lingering savepoint is harmless.
      return { confirmed: true, error: `ROLLBACK TO SAVEPOINT succeeded but RELEASE failed: ${errMessage(e)}` };
    }
    return { confirmed: true };
  }

  // --- statements ----------------------------------------------------------

  private async captureBefore(
    client: PgClient,
    plan: DryRunPlan,
    maxRows: number,
    notes: string[],
    isCancelled: () => boolean,
  ): Promise<DryRunSnapshot | undefined> {
    const b = plan.before!;
    const text =
      `SELECT * FROM ${b.target}${b.alias ? ` AS ${b.alias}` : ''}` +
      (b.where ? `\nWHERE ${b.where}` : '') +
      `\nLIMIT ${maxRows}\nFOR UPDATE`;
    const sp = `nexql_dryrun_before_${++DryRunService.counter}`;
    await this.exec(client, `SAVEPOINT ${quoteIdent(sp)}`);
    try {
      const res = await this.exec(client, text, true);
      await this.exec(client, `RELEASE SAVEPOINT ${quoteIdent(sp)}`);
      const snap = toSnapshot(res, maxRows, null);
      // The true number of matching rows is only known from the statement itself; we only
      // know here whether at least `maxRows` rows matched.
      snap.capped = snap.shownRows >= maxRows;
      return snap;
    } catch (err) {
      if (isCancelled()) {
        throw err;
      }
      try {
        await this.exec(client, `ROLLBACK TO SAVEPOINT ${quoteIdent(sp)}`);
        await this.exec(client, `RELEASE SAVEPOINT ${quoteIdent(sp)}`);
      } catch {
        throw err;
      }
      notes.push(`Before-image skipped: ${errMessage(err)}`);
      return undefined;
    }
  }

  private async runMain(
    client: PgClient,
    plan: DryRunPlan,
    maxRows: number,
  ): Promise<{ after?: DryRunSnapshot; affectedCount: number | null; command?: string }> {
    if (plan.after === 'user-returning-wrapped' || plan.after === 'append-returning-wrapped') {
      const append = plan.after === 'append-returning-wrapped';
      const text =
        `WITH ${quoteIdent(CTE_NAME)} AS (\n${plan.sql}\n${append ? 'RETURNING *' : ''}\n)\n` +
        `SELECT count(*) OVER () AS ${quoteIdent(TOTAL_COLUMN)}, ${quoteIdent(CTE_NAME)}.* ` +
        `FROM ${quoteIdent(CTE_NAME)}\nLIMIT ${maxRows}`;
      const res = await this.exec(client, text, true);
      const rawRows: unknown[][] = res.rows ?? [];
      const total = rawRows.length > 0 ? Number(rawRows[0][0]) : 0;
      const stripped = {
        ...res,
        fields: (res.fields ?? []).slice(1),
        rows: rawRows.map((r) => r.slice(1)),
      };
      const snap = toSnapshot(stripped, maxRows, total);
      return { after: snap, affectedCount: total, command: plan.verb };
    }

    const res = await this.exec(client, plan.sql, true);
    const affected = typeof res.rowCount === 'number' ? res.rowCount : null;
    let after: DryRunSnapshot | undefined;
    if (plan.after === 'user-returning-direct' && (res.fields?.length ?? 0) > 0) {
      after = toSnapshot(res, maxRows, (res.rows ?? []).length);
    }
    return { after, affectedCount: affected, command: res.command ?? plan.verb };
  }

  /**
   * Single choke point for every statement this service sends. Guarantees that no COMMIT
   * (or equivalent) can be issued through it.
   */
  private async exec(client: PgClient, text: string, arrayMode = false): Promise<any> {
    const head = SqlParser.stripCommentsAndStrings(text).trimStart().split(/[\s;(]/)[0]?.toUpperCase();
    if (head === 'COMMIT' || head === 'END' || head === 'PREPARE') {
      throw new Error(`Dry run invariant violated: refusing to send ${head}.`);
    }
    return arrayMode ? client.query({ text, rowMode: 'array' }) : client.query(text);
  }
}

function toSnapshot(
  res: { rows?: unknown[][]; fields?: Array<{ name: string; dataTypeID: number }> },
  maxRows: number,
  totalRows: number | null,
): DryRunSnapshot {
  const fields = res.fields ?? [];
  const columns = deduplicateColumns(fields.map((f) => f.name));
  const allRows = res.rows ?? [];
  const shown = allRows.slice(0, maxRows);
  const rows = shown.map((arr) => {
    const o: Record<string, unknown> = {};
    columns.forEach((c, i) => {
      o[c] = Array.isArray(arr) ? arr[i] : (arr as Record<string, unknown>)[c];
    });
    return o;
  });
  const columnTypes: Record<string, string> = {};
  columns.forEach((c, i) => {
    columnTypes[c] = fields[i] ? getPgDataTypeName(fields[i].dataTypeID) : 'text';
  });
  const total = totalRows ?? allRows.length;
  return {
    columns,
    rows,
    columnTypes,
    shownRows: rows.length,
    totalRows: totalRows,
    capped: total > rows.length,
  };
}
