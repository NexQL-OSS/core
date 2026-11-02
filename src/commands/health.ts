import * as vscode from 'vscode';
import { DatabaseTreeItem } from '../providers/DatabaseTreeProvider';
import { ErrorHandlers, getDatabaseConnection, MarkdownUtils, NotebookBuilder } from './helper';
import { HealthSQL } from './sql/health';
import { queryServerVersionNum } from '../lib/postgresServerVersion';

/**
 * Database Health Report: one notebook with an overview plus targeted checks.
 * All cells are read-only SELECTs.
 */
export async function cmdDatabaseHealth(item: DatabaseTreeItem, _context?: vscode.ExtensionContext): Promise<void> {
  let dbConn: Awaited<ReturnType<typeof getDatabaseConnection>> | undefined;
  try {
    dbConn = await getDatabaseConnection(item);
    const { client, metadata } = dbConn;

    const versionNum = await queryServerVersionNum(client);
    let statementsInstalled = false;
    try {
      const r = await client.query<{ installed: boolean }>(HealthSQL.statementsExtensionCheck());
      statementsInstalled = r.rows?.[0]?.installed === true;
    } catch {
      statementsInstalled = false;
    }

    const nb = new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(
          `Database Health Report: \`${item.databaseName ?? item.label}\``,
          'A read-only checkup. Run each cell and read the guidance above it. Nothing here changes your data.'
        ) +
        MarkdownUtils.infoBox(
          'Statistics reset on restart or crash recovery, so "unused" and "dead tuple" results are most meaningful on a server that has been running under normal load for a while. For deeper query tuning, see the Index Advisor and the Activity Monitor.'
        )
      )
      .addMarkdown(
        `#### 1. Overview\n\n` +
        `Size, connections by state, cache hit ratio, transaction ID age, and the longest open transaction.\n\n` +
        `- **Cache hit ratio** below about 99% on a busy database often means too little memory (\`shared_buffers\`) or heavy sequential scans.\n` +
        `- **Transaction ID age** nearing 100% risks a forced shutdown to prevent wraparound. If it is above 50%, check that autovacuum is running and not blocked.\n` +
        `- **Longest open transaction** that is hours old holds back vacuum and can bloat tables. Find out why it is open, then commit, roll back, or terminate it.\n` +
        `- Many \`idle in transaction\` connections usually point to an application that forgets to commit.`
      )
      .addSql(HealthSQL.overview())
      .addMarkdown(
        `#### 2. Table bloat estimate\n\n` +
        `Tables with the most dead tuples (rows deleted or updated but not yet reclaimed), from the statistics collector. This is an estimate, not a physical measurement.\n\n` +
        `- **dead_pct above about 20%** on a large table means autovacuum is falling behind. Run \`VACUUM (ANALYZE) schema.table;\` and consider lowering \`autovacuum_vacuum_scale_factor\` for that table.\n` +
        `- A **NULL** \`last_autovacuum\` on a busy table means autovacuum has not touched it since stats were reset.\n` +
        `- Plain VACUUM makes space reusable but rarely shrinks the file. Only \`VACUUM FULL\` or \`pg_repack\` return space to the OS, and \`VACUUM FULL\` takes an exclusive lock.`
      )
      .addSql(HealthSQL.tableBloat())
      .addMarkdown(
        `#### 3. Unused indexes\n\n` +
        `Indexes that have never been scanned since statistics were last reset. Primary key, unique, and constraint-backing indexes are excluded. Sorted by size, biggest savings first.\n\n` +
        `- Unused indexes slow down every INSERT, UPDATE, and DELETE and use disk space.\n` +
        `- Before dropping one, confirm statistics cover a full business cycle (month-end jobs, reports) and check replicas, since scans there are counted separately.\n` +
        `- Drop safely with \`DROP INDEX CONCURRENTLY schema.index_name;\`.`
      )
      .addSql(HealthSQL.unusedIndexes())
      .addMarkdown(
        `#### 4. Foreign keys without a supporting index\n\n` +
        `Foreign keys where no index starts with the referencing columns. Deleting or updating a parent row then scans the whole child table, and joins on the key are slow.\n\n` +
        `- Prioritise large tables. A missing index on a tiny lookup table rarely matters.\n` +
        `- Create the suggested index with \`CREATE INDEX CONCURRENTLY\` to avoid blocking writes. The \`suggested_index\` column is a starting point; adjust it to your query patterns.`
      )
      .addSql(HealthSQL.foreignKeysWithoutIndex())
      .addMarkdown(
        `#### 5. Blocking locks\n\n` +
        `Sessions currently waiting on a lock, and the session blocking each one. An empty result means nothing is blocked right now. Re-run it while a problem is happening.\n\n` +
        `- Look at the **blocking** query first. It is often an idle-in-transaction session or a long migration.\n` +
        `- To stop a blocker, try \`SELECT pg_cancel_backend(pid);\` (cancels the current query) before \`SELECT pg_terminate_backend(pid);\` (ends the connection).\n` +
        `- Long term, keep transactions short and set \`lock_timeout\` and \`idle_in_transaction_session_timeout\`.`
      )
      .addSql(HealthSQL.blockingLocks())
      .addMarkdown(
        `#### 6. Slowest statements\n\n` +
        `Top statements by total execution time from \`pg_stat_statements\`. ` +
        `Column names differ by version (PostgreSQL 13 renamed \`total_time\` to \`total_exec_time\`); this report picked the right ones for your server` +
        (versionNum > 0 ? ` (server_version_num ${versionNum}).` : '.')
      );

    if (statementsInstalled) {
      nb.addMarkdown(
        `- A high **total_ms** with a low **mean_ms** is a cheap query called very often. Cache it or batch it.\n` +
        `- A high **mean_ms** is a slow individual query. Run \`EXPLAIN (ANALYZE, BUFFERS)\` on it.\n` +
        `- A low **cache_hit_pct** means the query reads from disk a lot.`
      ).addSql(HealthSQL.slowStatements(versionNum));
    } else {
      nb.addMarkdown(
        MarkdownUtils.warningBox(
          'The pg_stat_statements extension is not installed in this database, so this check is skipped. ' +
          'Add it to `shared_preload_libraries`, restart PostgreSQL, then run `CREATE EXTENSION pg_stat_statements;`. ' +
          'Re-run the cell below to re-check, then re-open this report.',
          'Extension missing'
        )
      ).addSql(HealthSQL.statementsExtensionCheck());
    }

    await nb.show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'create database health report');
  } finally {
    dbConn?.release?.();
  }
}
