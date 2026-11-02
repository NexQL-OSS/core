/**
 * Database Health SQL templates.
 *
 * Pure functions (no VS Code dependencies). Every template is a single,
 * read-only statement that can be run in a notebook cell on PostgreSQL 12-17.
 */

/** PostgreSQL 13 renamed pg_stat_statements total_time/mean_time to total_exec_time/mean_exec_time. */
export const PG_VERSION_13 = 130_000;

/** Escape a value as a single-quoted SQL string literal. */
export function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export interface HealthScopeOptions {
  /** Restrict a check to one schema (matched by exact name). Defaults to all user schemas. */
  schema?: string;
}

/** Predicate that skips system schemas, optionally narrowed to one schema. */
function schemaPredicate(column: string, schema?: string): string {
  if (schema) {
    return `${column} = ${quoteLiteral(schema)}`;
  }
  return `${column} NOT IN ('pg_catalog', 'information_schema', 'pg_toast')`;
}

export const HealthSQL = {
  /** One row per metric: database size, connections by state, cache hit ratio, XID age, longest transaction. */
  overview(): string {
    return `SELECT metric, value, detail
FROM (
  SELECT 1 AS ord, 'Database size' AS metric,
         pg_size_pretty(pg_database_size(current_database())) AS value,
         current_database()::text AS detail
  UNION ALL
  SELECT 2, 'Connections: ' || coalesce(state, 'no state (background)'),
         count(*)::text,
         'of max_connections = ' || current_setting('max_connections')
  FROM pg_stat_activity
  WHERE datname = current_database()
  GROUP BY state
  UNION ALL
  SELECT 3, 'Cache hit ratio',
         coalesce(round(100.0 * blks_hit / nullif(blks_hit + blks_read, 0), 2)::text || '%', 'n/a'),
         'Aim for 99% or more on busy OLTP databases'
  FROM pg_stat_database
  WHERE datname = current_database()
  UNION ALL
  SELECT 4, 'Transaction ID age',
         age(datfrozenxid)::text,
         round(100.0 * age(datfrozenxid) / 2147483647, 2)::text || '% of the 2.1 billion wraparound limit (autovacuum_freeze_max_age = '
           || current_setting('autovacuum_freeze_max_age') || ')'
  FROM pg_database
  WHERE datname = current_database()
  UNION ALL
  SELECT 5, 'Longest open transaction',
         coalesce((now() - min(xact_start))::text, 'none'),
         coalesce('pid ' || (array_agg(pid ORDER BY xact_start))[1]::text, '')
  FROM pg_stat_activity
  WHERE datname = current_database()
    AND xact_start IS NOT NULL
    AND pid <> pg_backend_pid()
) AS m
ORDER BY ord, metric;`;
  },

  /** Dead-tuple ratio and last (auto)vacuum / analyze per table. */
  tableBloat(options: HealthScopeOptions = {}): string {
    return `SELECT schemaname AS schema,
       relname AS table_name,
       n_live_tup AS live_rows,
       n_dead_tup AS dead_rows,
       round(100.0 * n_dead_tup / nullif(n_live_tup + n_dead_tup, 0), 2) AS dead_pct,
       pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
       last_vacuum,
       last_autovacuum,
       last_analyze,
       last_autoanalyze
FROM pg_stat_user_tables
WHERE n_dead_tup > 0
  AND ${schemaPredicate('schemaname', options.schema)}
ORDER BY n_dead_tup DESC
LIMIT 25;`;
  },

  /** Indexes never scanned since the last stats reset, excluding indexes that enforce constraints. */
  unusedIndexes(options: HealthScopeOptions = {}): string {
    return `SELECT s.schemaname AS schema,
       s.relname AS table_name,
       s.indexrelname AS index_name,
       s.idx_scan AS scans,
       pg_size_pretty(pg_relation_size(s.indexrelid)) AS index_size,
       pg_get_indexdef(s.indexrelid) AS definition
FROM pg_stat_user_indexes s
JOIN pg_index i ON i.indexrelid = s.indexrelid
WHERE s.idx_scan = 0
  AND NOT i.indisunique
  AND NOT i.indisprimary
  AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = s.indexrelid)
  AND ${schemaPredicate('s.schemaname', options.schema)}
ORDER BY pg_relation_size(s.indexrelid) DESC
LIMIT 50;`;
  },

  /** Foreign keys whose referencing columns are not the leading columns of any valid, non-partial index. */
  foreignKeysWithoutIndex(options: HealthScopeOptions = {}): string {
    return `SELECT n.nspname AS schema,
       c.conrelid::regclass AS table_name,
       c.conname AS constraint_name,
       (SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY k.ord)
          FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS columns,
       c.confrelid::regclass AS references_table,
       pg_size_pretty(pg_relation_size(c.conrelid)) AS table_size,
       'CREATE INDEX ON ' || c.conrelid::regclass || ' ('
         || (SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY k.ord)
               FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
               JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum)
         || ')' AS suggested_index
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE c.contype = 'f'
  AND ${schemaPredicate('n.nspname', options.schema)}
  AND NOT EXISTS (
    SELECT 1
    FROM pg_index i
    WHERE i.indrelid = c.conrelid
      AND i.indisvalid
      AND i.indpred IS NULL
      AND (string_to_array(i.indkey::text, ' ')::int2[])[1:cardinality(c.conkey)] @> c.conkey
  )
ORDER BY pg_relation_size(c.conrelid) DESC, 2, 3
LIMIT 50;`;
  },

  /** Sessions waiting on a lock, paired with the session(s) blocking them. */
  blockingLocks(): string {
    return `SELECT blocked.pid AS blocked_pid,
       blocked.usename AS blocked_user,
       now() - blocked.query_start AS blocked_for,
       blocked.wait_event_type || ':' || blocked.wait_event AS waiting_on,
       left(blocked.query, 200) AS blocked_query,
       blocker.pid AS blocking_pid,
       blocker.usename AS blocking_user,
       blocker.state AS blocking_state,
       now() - blocker.xact_start AS blocking_txn_age,
       left(blocker.query, 200) AS blocking_query
FROM pg_stat_activity blocked
CROSS JOIN LATERAL unnest(pg_blocking_pids(blocked.pid)) AS b(pid)
JOIN pg_stat_activity blocker ON blocker.pid = b.pid
WHERE blocked.datname = current_database()
ORDER BY blocked_for DESC;`;
  },

  /** Whether pg_stat_statements is installed in the current database, with a friendly hint when it is not. */
  statementsExtensionCheck(): string {
    return `SELECT e.extname IS NOT NULL AS installed,
       CASE WHEN e.extname IS NOT NULL
            THEN 'pg_stat_statements ' || e.extversion || ' is installed. Run the next cell.'
            ELSE 'pg_stat_statements is not installed in this database. Add it to shared_preload_libraries, restart PostgreSQL, then run CREATE EXTENSION pg_stat_statements; to enable this check.'
       END AS message
FROM (SELECT 1) AS one
LEFT JOIN pg_extension e ON e.extname = 'pg_stat_statements';`;
  },

  /**
   * Top 20 statements by total execution time in the current database.
   * PostgreSQL 13+ exposes total_exec_time/mean_exec_time; 12 and older use total_time/mean_time.
   */
  slowStatements(serverVersionNum: number): string {
    const suffix = serverVersionNum >= PG_VERSION_13 ? '_exec_time' : '_time';
    const total = `total${suffix}`;
    const mean = `mean${suffix}`;
    return `SELECT calls,
       round(${total}::numeric, 2) AS total_ms,
       round(${mean}::numeric, 2) AS mean_ms,
       rows,
       round(100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0), 2) AS cache_hit_pct,
       left(regexp_replace(query, '\\s+', ' ', 'g'), 300) AS query
FROM pg_stat_statements
WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
ORDER BY ${total} DESC
LIMIT 20;`;
  },
};
