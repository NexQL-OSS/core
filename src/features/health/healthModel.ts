/**
 * Database Health dashboard view model.
 *
 * Pure functions (no VS Code or pg dependencies): raw rows from the HealthSQL templates go in,
 * a status-coded view model comes out. The webview HTML is rendered from this model, so every
 * threshold and sentence the dashboard shows is testable here.
 */

export type HealthLevel = 'ok' | 'watch' | 'act' | 'unknown';

export type HealthSectionKey = 'summary' | 'bloat' | 'unusedIndexes' | 'fkNoIndex' | 'locks' | 'statements';

type Row = Record<string, unknown>;

/** Raw query results. A section that failed to load carries its message in `errors` instead of rows. */
export interface HealthRaw {
  database: string;
  generatedAt: Date;
  summary?: Row | null;
  bloat?: Row[];
  unusedIndexes?: Row[];
  fkNoIndex?: Row[];
  locks?: Row[];
  statements?: { installed: boolean; rows: Row[] };
  errors?: Partial<Record<HealthSectionKey, string>>;
}

export interface HealthTile {
  key: string;
  label: string;
  /** Headline value, already formatted. */
  value: string;
  /** One short line under the value. */
  sub: string;
  level: HealthLevel;
  /** 0-100 fill for the gauge bar; undefined for tiles without one. */
  gauge?: number;
}

export interface HealthFinding {
  level: Exclude<HealthLevel, 'ok' | 'unknown'>;
  title: string;
  /** What to do, one sentence. */
  action: string;
  section: HealthSectionKey;
}

export interface BarItem {
  label: string;
  sublabel?: string;
  /** Bar fill, 0-100. */
  pct: number;
  /** Text shown at the end of the row. */
  value: string;
  level: HealthLevel;
  /** Text offered by the row's copy button. */
  copy?: string;
}

export interface HealthSection {
  key: HealthSectionKey;
  title: string;
  level: HealthLevel;
  /** Short status line shown in the header, for example "3 tables over 20% dead". */
  headline: string;
  items: BarItem[];
  /** Rows beyond the ones shown. */
  more: number;
  /** Set when the section could not be loaded. */
  error?: string;
  /** Shown when there is nothing to list. */
  empty: string;
  /** Short guidance, rendered inside a collapsed fold. */
  guidance: string[];
}

export interface BlockedSession {
  blockedPid: string;
  blockedFor: string;
  waitingOn: string;
  blockedQuery: string;
  blockingPid: string;
  blockingState: string;
  blockingAge: string;
  blockingQuery: string;
}

export interface HealthViewModel {
  database: string;
  generatedAt: Date;
  overall: HealthLevel;
  tiles: HealthTile[];
  findings: HealthFinding[];
  sections: HealthSection[];
  blocked: BlockedSession[];
}

const SHOWN = 8;

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

export function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined) {
    return 'n/a';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let v = Math.max(0, bytes);
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const digits = i === 0 || v >= 100 ? 0 : v >= 10 ? 1 : 2;
  return `${v.toFixed(digits)} ${units[i]}`;
}

export function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined) {
    return 'none';
  }
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) {
    return `${s}s`;
  }
  if (s < 3600) {
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  }
  if (s < 86400) {
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  }
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
}

export function formatCount(n: number | undefined): string {
  return n === undefined ? 'n/a' : n.toLocaleString('en-US');
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * node-pg parses `interval` columns into an object (years, months, days, hours, minutes, seconds,
 * milliseconds) and the text protocol gives a string. Accept both and show a short duration.
 */
export function formatInterval(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>;
    const n = (k: string) => toNumber(v[k]) ?? 0;
    const seconds = n('years') * 31536000 + n('months') * 2592000 + n('days') * 86400 + n('hours') * 3600 + n('minutes') * 60 + n('seconds') + n('milliseconds') / 1000;
    return formatDuration(seconds);
  }
  return String(value).replace(/\.\d+$/, '');
}

function str(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, n));
}

const SEVERITY: Record<HealthLevel, number> = { unknown: 0, ok: 1, watch: 2, act: 3 };

export function worstLevel(levels: HealthLevel[]): HealthLevel {
  let worst: HealthLevel = 'unknown';
  for (const l of levels) {
    if (SEVERITY[l] > SEVERITY[worst]) {
      worst = l;
    }
  }
  return worst;
}

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/** Cache hit ratio, percent. Higher is better. */
export function levelForCacheHit(pct: number | undefined): HealthLevel {
  if (pct === undefined) {
    return 'unknown';
  }
  return pct >= 99 ? 'ok' : pct >= 95 ? 'watch' : 'act';
}

/** Transaction ID age as a percent of the 2.1 billion wraparound limit. */
export function levelForXidAge(pct: number | undefined): HealthLevel {
  if (pct === undefined) {
    return 'unknown';
  }
  return pct < 50 ? 'ok' : pct < 75 ? 'watch' : 'act';
}

/** Connections in use as a percent of max_connections. */
export function levelForConnections(pct: number | undefined): HealthLevel {
  if (pct === undefined) {
    return 'unknown';
  }
  return pct < 70 ? 'ok' : pct < 90 ? 'watch' : 'act';
}

/** Age of the longest open transaction, in seconds. Undefined means none is open. */
export function levelForLongestTxn(seconds: number | undefined): HealthLevel {
  if (seconds === undefined) {
    return 'ok';
  }
  return seconds < 300 ? 'ok' : seconds < 3600 ? 'watch' : 'act';
}

export function levelForIdleInTxn(count: number | undefined): HealthLevel {
  if (count === undefined) {
    return 'unknown';
  }
  return count === 0 ? 'ok' : count <= 5 ? 'watch' : 'act';
}

/** Dead tuples as a percent of all tuples. */
export function levelForDeadPct(pct: number): HealthLevel {
  return pct < 20 ? 'ok' : pct < 50 ? 'watch' : 'act';
}

/** Tables with fewer dead rows than this are ignored: a high percentage on a tiny table is noise. */
export const BLOAT_MIN_DEAD_ROWS = 1000;

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function buildTiles(summary: Row | null | undefined, error: string | undefined): HealthTile[] {
  if (!summary) {
    const reason = error ?? 'No data returned';
    return [
      { key: 'cache', label: 'Cache hit ratio', value: 'n/a', sub: reason, level: 'unknown' },
      { key: 'xid', label: 'Transaction ID age', value: 'n/a', sub: reason, level: 'unknown' },
      { key: 'connections', label: 'Connections', value: 'n/a', sub: reason, level: 'unknown' },
      { key: 'txn', label: 'Longest open transaction', value: 'n/a', sub: reason, level: 'unknown' },
      { key: 'size', label: 'Database size', value: 'n/a', sub: reason, level: 'unknown' },
    ];
  }

  const cache = toNumber(summary.cache_hit_pct);
  const xidPct = toNumber(summary.xid_pct);
  const xidAge = toNumber(summary.xid_age);
  const total = toNumber(summary.connections_total);
  const max = toNumber(summary.max_connections);
  const active = toNumber(summary.connections_active);
  const idleTxn = toNumber(summary.idle_in_transaction);
  const longest = toNumber(summary.longest_xact_seconds);
  const size = toNumber(summary.db_size_bytes);

  const connPct = total !== undefined && max !== undefined && max > 0 ? (total / max) * 100 : undefined;
  const connLevel = worstLevel([levelForConnections(connPct), levelForIdleInTxn(idleTxn)]);
  const idleNote = idleTxn ? `, ${idleTxn} idle in transaction` : '';

  return [
    {
      key: 'cache',
      label: 'Cache hit ratio',
      value: cache === undefined ? 'n/a' : `${cache.toFixed(1)}%`,
      sub: cache === undefined ? 'No reads recorded yet' : 'Aim for 99% or more',
      level: levelForCacheHit(cache),
      gauge: cache === undefined ? undefined : clampPct(cache),
    },
    {
      key: 'xid',
      label: 'Transaction ID age',
      value: xidPct === undefined ? 'n/a' : `${xidPct.toFixed(1)}%`,
      sub: xidAge === undefined ? 'of the wraparound limit' : `${formatCount(xidAge)} of 2.1 billion`,
      level: levelForXidAge(xidPct),
      gauge: xidPct === undefined ? undefined : clampPct(xidPct),
    },
    {
      key: 'connections',
      label: 'Connections',
      value: total === undefined || max === undefined ? 'n/a' : `${total} / ${max}`,
      sub: `${active ?? 0} active${idleNote}`,
      level: connLevel,
      gauge: connPct === undefined ? undefined : clampPct(connPct),
    },
    {
      key: 'txn',
      label: 'Longest open transaction',
      value: formatDuration(longest),
      sub: longest === undefined ? 'No open transactions' : str(summary.longest_pid) ? `pid ${str(summary.longest_pid)}` : 'Oldest open session',
      level: levelForLongestTxn(longest),
    },
    {
      key: 'size',
      label: 'Database size',
      value: formatBytes(size),
      sub: str(summary.db_name),
      level: 'unknown',
    },
  ];
}

const GUIDANCE: Record<Exclude<HealthSectionKey, 'summary'>, string[]> = {
  bloat: [
    'dead_pct above about 20% on a large table means autovacuum is falling behind. Run VACUUM (ANALYZE) on it and consider a lower autovacuum_vacuum_scale_factor for that table.',
    'Plain VACUUM makes space reusable but rarely shrinks the file. Only VACUUM FULL or pg_repack return space to the OS, and VACUUM FULL takes an exclusive lock.',
  ],
  unusedIndexes: [
    'Unused indexes slow every INSERT, UPDATE and DELETE and use disk space.',
    'Before dropping one, confirm statistics cover a full business cycle (month-end jobs, reports) and check replicas, since scans there are counted separately.',
    'Drop safely with DROP INDEX CONCURRENTLY schema.index_name;',
  ],
  fkNoIndex: [
    'Deleting or updating a parent row scans the whole child table when no index starts with the referencing columns, and joins on the key are slow.',
    'Prioritise large tables. A missing index on a tiny lookup table rarely matters. Create the index with CREATE INDEX CONCURRENTLY to avoid blocking writes.',
  ],
  locks: [
    'Look at the blocking query first. It is often an idle-in-transaction session or a long migration.',
    'To stop a blocker, try pg_cancel_backend(pid) before pg_terminate_backend(pid). Long term, keep transactions short and set lock_timeout and idle_in_transaction_session_timeout.',
  ],
  statements: [
    'A high total with a low mean is a cheap query called very often. Cache it or batch it.',
    'A high mean is a slow individual query. Run EXPLAIN (ANALYZE, BUFFERS) on it.',
    'A low cache hit means the query reads from disk a lot.',
  ],
};

function sectionBase(key: Exclude<HealthSectionKey, 'summary'>, title: string, empty: string, error?: string): HealthSection {
  return {
    key,
    title,
    level: error ? 'unknown' : 'ok',
    headline: error ? 'Could not load' : '',
    items: [],
    more: 0,
    error,
    empty,
    guidance: GUIDANCE[key],
  };
}

function buildBloat(rows: Row[] | undefined, error: string | undefined, findings: HealthFinding[]): HealthSection {
  const sec = sectionBase('bloat', 'Table bloat', 'No tables have dead rows.', error);
  if (error || !rows) {
    return sec;
  }
  const significant = rows.filter(r => (toNumber(r.dead_rows) ?? 0) >= BLOAT_MIN_DEAD_ROWS);
  const levels = significant.map(r => levelForDeadPct(toNumber(r.dead_pct) ?? 0));
  const flagged = significant.filter(r => levelForDeadPct(toNumber(r.dead_pct) ?? 0) !== 'ok');
  sec.level = worstLevel(levels.length ? levels : ['ok']);
  sec.headline = flagged.length
    ? `${plural(flagged.length, 'table')} over 20% dead rows`
    : significant.length
      ? 'Dead rows are under control'
      : 'No meaningful bloat';
  const shown = (significant.length ? significant : rows).slice(0, SHOWN);
  sec.items = shown.map(r => {
    const pct = toNumber(r.dead_pct) ?? 0;
    return {
      label: `${str(r.schema)}.${str(r.table_name)}`,
      sublabel: `${formatCount(toNumber(r.dead_rows))} dead of ${formatCount((toNumber(r.live_rows) ?? 0) + (toNumber(r.dead_rows) ?? 0))} rows, ${str(r.total_size)}`,
      pct: clampPct(pct),
      value: `${pct.toFixed(1)}%`,
      level: (toNumber(r.dead_rows) ?? 0) >= BLOAT_MIN_DEAD_ROWS ? levelForDeadPct(pct) : 'ok',
      copy: `VACUUM (ANALYZE) ${str(r.schema)}.${str(r.table_name)};`,
    } satisfies BarItem;
  });
  sec.more = Math.max(0, (significant.length ? significant : rows).length - shown.length);
  if (flagged.length) {
    const top = flagged[0];
    findings.push({
      level: sec.level === 'act' ? 'act' : 'watch',
      title: `${plural(flagged.length, 'table')} with more than 20% dead rows`,
      action: `Start with ${str(top.schema)}.${str(top.table_name)}: run VACUUM (ANALYZE) and check that autovacuum keeps up.`,
      section: 'bloat',
    });
  }
  return sec;
}

function buildUnusedIndexes(rows: Row[] | undefined, error: string | undefined, findings: HealthFinding[]): HealthSection {
  const sec = sectionBase('unusedIndexes', 'Unused indexes', 'Every secondary index has been scanned.', error);
  if (error || !rows) {
    return sec;
  }
  const totalBytes = rows.reduce((sum, r) => sum + (toNumber(r.index_bytes) ?? 0), 0);
  const maxBytes = Math.max(1, ...rows.map(r => toNumber(r.index_bytes) ?? 0));
  sec.level = rows.length === 0 ? 'ok' : 'watch';
  sec.headline = rows.length === 0 ? 'No unused indexes' : `${plural(rows.length, 'index', 'indexes')}, ${formatBytes(totalBytes)} reclaimable`;
  const shown = rows.slice(0, SHOWN);
  sec.items = shown.map(r => {
    const bytes = toNumber(r.index_bytes) ?? 0;
    return {
      label: str(r.index_name),
      sublabel: `on ${str(r.schema)}.${str(r.table_name)}`,
      pct: clampPct((bytes / maxBytes) * 100),
      value: str(r.index_size) || formatBytes(bytes),
      level: 'watch',
      copy: `DROP INDEX CONCURRENTLY ${str(r.schema)}.${str(r.index_name)};`,
    } satisfies BarItem;
  });
  sec.more = Math.max(0, rows.length - shown.length);
  if (rows.length > 0) {
    findings.push({
      level: 'watch',
      title: `${plural(rows.length, 'unused index', 'unused indexes')} (${formatBytes(totalBytes)})`,
      action: 'Confirm statistics cover a full business cycle and check replicas, then drop with DROP INDEX CONCURRENTLY.',
      section: 'unusedIndexes',
    });
  }
  return sec;
}

function buildFkNoIndex(rows: Row[] | undefined, error: string | undefined, findings: HealthFinding[]): HealthSection {
  const sec = sectionBase('fkNoIndex', 'Foreign keys without an index', 'Every foreign key has a supporting index.', error);
  if (error || !rows) {
    return sec;
  }
  sec.level = rows.length === 0 ? 'ok' : 'watch';
  sec.headline = rows.length === 0 ? 'All foreign keys are indexed' : `${plural(rows.length, 'foreign key')} missing an index`;
  const shown = rows.slice(0, SHOWN);
  sec.items = shown.map(r => ({
    label: `${str(r.table_name)} (${str(r.columns)})`,
    sublabel: `${str(r.constraint_name)} references ${str(r.references_table)}`,
    pct: 100,
    value: str(r.table_size),
    level: 'watch' as HealthLevel,
    copy: str(r.suggested_index) ? `${str(r.suggested_index)};` : undefined,
  }));
  sec.more = Math.max(0, rows.length - shown.length);
  if (rows.length > 0) {
    findings.push({
      level: 'watch',
      title: `${plural(rows.length, 'foreign key')} without a supporting index`,
      action: 'Create the suggested index on the largest tables first, using CREATE INDEX CONCURRENTLY.',
      section: 'fkNoIndex',
    });
  }
  return sec;
}

function buildLocks(rows: Row[] | undefined, error: string | undefined, findings: HealthFinding[]): { section: HealthSection; blocked: BlockedSession[] } {
  const sec = sectionBase('locks', 'Blocking locks', 'Nothing is blocked right now.', error);
  if (error || !rows) {
    return { section: sec, blocked: [] };
  }
  sec.level = rows.length === 0 ? 'ok' : 'act';
  sec.headline = rows.length === 0 ? 'Nothing is blocked' : `${plural(rows.length, 'session')} waiting on a lock`;
  const blocked = rows.slice(0, SHOWN).map(r => ({
    blockedPid: str(r.blocked_pid),
    blockedFor: formatInterval(r.blocked_for),
    waitingOn: str(r.waiting_on),
    blockedQuery: str(r.blocked_query),
    blockingPid: str(r.blocking_pid),
    blockingState: str(r.blocking_state),
    blockingAge: formatInterval(r.blocking_txn_age),
    blockingQuery: str(r.blocking_query),
  }));
  sec.more = Math.max(0, rows.length - blocked.length);
  if (rows.length > 0) {
    findings.push({
      level: 'act',
      title: `${plural(rows.length, 'session')} blocked by a lock`,
      action: `Look at the blocking query on pid ${str(rows[0].blocking_pid)}. Cancel it with pg_cancel_backend if it is safe to.`,
      section: 'locks',
    });
  }
  return { section: sec, blocked };
}

function buildStatements(
  data: { installed: boolean; rows: Row[] } | undefined,
  error: string | undefined,
): HealthSection {
  const sec = sectionBase('statements', 'Slowest statements', 'No statements recorded yet.', error);
  if (error || !data) {
    return sec;
  }
  if (!data.installed) {
    sec.level = 'unknown';
    sec.headline = 'pg_stat_statements is not installed';
    sec.empty =
      'Add pg_stat_statements to shared_preload_libraries, restart PostgreSQL, then run CREATE EXTENSION pg_stat_statements; to enable this check.';
    return sec;
  }
  const rows = data.rows;
  const maxTotal = Math.max(1, ...rows.map(r => toNumber(r.total_ms) ?? 0));
  sec.level = 'ok';
  sec.headline = rows.length ? `Top ${Math.min(rows.length, SHOWN)} by total time` : 'No statements recorded yet';
  const shown = rows.slice(0, SHOWN);
  sec.items = shown.map(r => {
    const total = toNumber(r.total_ms) ?? 0;
    const mean = toNumber(r.mean_ms);
    return {
      label: str(r.query),
      sublabel: `${formatCount(toNumber(r.calls))} calls, mean ${mean === undefined ? 'n/a' : `${mean.toFixed(1)} ms`}`,
      pct: clampPct((total / maxTotal) * 100),
      value: formatDuration(total / 1000),
      level: 'ok',
      copy: str(r.query),
    } satisfies BarItem;
  });
  sec.more = Math.max(0, rows.length - shown.length);
  return sec;
}

/** Turn raw query results into the dashboard view model. */
export function buildHealthViewModel(raw: HealthRaw): HealthViewModel {
  const errors = raw.errors ?? {};
  const findings: HealthFinding[] = [];

  const tiles = buildTiles(raw.summary, errors.summary);

  // Tile findings, in the order the tiles appear.
  for (const t of tiles) {
    if (t.level !== 'watch' && t.level !== 'act') {
      continue;
    }
    const level = t.level;
    switch (t.key) {
      case 'cache':
        findings.push({
          level,
          title: `Cache hit ratio is ${t.value}`,
          action: 'Too little memory (shared_buffers) or heavy sequential scans. Check the biggest tables and missing indexes.',
          section: 'summary',
        });
        break;
      case 'xid':
        findings.push({
          level,
          title: `Transaction ID age is ${t.value} of the wraparound limit`,
          action: 'Check that autovacuum is running and not blocked. Near 100% PostgreSQL forces a shutdown.',
          section: 'summary',
        });
        break;
      case 'connections':
      {
        const total = toNumber(raw.summary?.connections_total);
        const max = toNumber(raw.summary?.max_connections);
        const idle = toNumber(raw.summary?.idle_in_transaction) ?? 0;
        const pct = total !== undefined && max ? (total / max) * 100 : undefined;
        const crowded = levelForConnections(pct) !== 'ok';
        findings.push({
          level,
          title: crowded
            ? `${t.value} connections in use (${pct!.toFixed(0)}% of the limit)`
            : `${plural(idle, 'session')} idle in transaction`,
          action: crowded
            ? 'Use a connection pooler, and look for applications that leave transactions open.'
            : 'Idle-in-transaction sessions hold locks and block vacuum. Find the application that forgets to commit, and set idle_in_transaction_session_timeout.',
          section: 'summary',
        });
      }
        break;
      case 'txn':
        findings.push({
          level,
          title: `A transaction has been open for ${t.value}`,
          action: 'It holds back vacuum and can bloat tables. Find out why it is open, then commit, roll back or terminate it.',
          section: 'summary',
        });
        break;
      default:
        break;
    }
  }

  const bloat = buildBloat(raw.bloat, errors.bloat, findings);
  const unused = buildUnusedIndexes(raw.unusedIndexes, errors.unusedIndexes, findings);
  const fk = buildFkNoIndex(raw.fkNoIndex, errors.fkNoIndex, findings);
  const { section: locks, blocked } = buildLocks(raw.locks, errors.locks, findings);
  const statements = buildStatements(raw.statements, errors.statements);

  findings.sort((a, b) => SEVERITY[b.level] - SEVERITY[a.level]);

  const sections = [bloat, unused, fk, locks, statements];
  const overall = worstLevel([...tiles.map(t => t.level), ...sections.map(s => s.level)].filter(l => l !== 'unknown'));

  return {
    database: raw.database,
    generatedAt: raw.generatedAt,
    overall: overall === 'unknown' ? 'unknown' : overall,
    tiles,
    findings,
    sections,
    blocked,
  };
}
