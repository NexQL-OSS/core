/**
 * DDL lock-risk analyzer. Pure module: no `vscode` import.
 *
 * Works on a token stream so keywords inside comments, string literals,
 * quoted identifiers and dollar-quoted bodies are never matched.
 */

export type DdlSeverity = 'info' | 'warning' | 'danger';

export interface DdlRange {
  /** Inclusive start offset. */
  start: number;
  /** Exclusive end offset. */
  end: number;
}

export interface DdlFinding {
  rule: string;
  severity: DdlSeverity;
  message: string;
  /** Offsets relative to the start of the statement the finding belongs to. */
  range: DdlRange;
  /** Replacement text for the whole statement (see `statementRange`), when a mechanical fix exists. */
  saferSql?: string;
  /** Index of the statement within the analyzed text. */
  statementIndex: number;
  /** Bounds of the statement in the analyzed text (excludes the terminating semicolon). */
  statementRange: DdlRange;
}

type TokType = 'word' | 'ident' | 'string' | 'punct';

interface Token {
  type: TokType;
  /** Source text. */
  text: string;
  /** Upper-cased text for words, otherwise equal to `text`. */
  upper: string;
  start: number;
  end: number;
  depth: number;
}

const isWordStart = (c: string) => /[A-Za-z_\u0080-￿]/.test(c);
const isWordPart = (c: string) => /[A-Za-z0-9_$\u0080-￿]/.test(c);

/** Tokenize SQL, dropping comments and whitespace. Exported for tests. */
export function tokenizeSql(sql: string): Token[] {
  const tokens: Token[] = [];
  const n = sql.length;
  let i = 0;
  let depth = 0;
  const push = (type: TokType, start: number, end: number) => {
    const text = sql.slice(start, end);
    if (type === 'punct' && text === ')') {
      depth = Math.max(0, depth - 1);
    }
    tokens.push({ type, text, upper: type === 'word' ? text.toUpperCase() : text, start, end, depth });
    if (type === 'punct' && text === '(') {
      depth++;
    }
  };

  while (i < n) {
    const c = sql[i];
    if (/\s/.test(c)) {
      i++;
    } else if (c === '-' && sql[i + 1] === '-') {
      while (i < n && sql[i] !== '\n') { i++; }
    } else if (c === '/' && sql[i + 1] === '*') {
      let level = 1;
      i += 2;
      while (i < n && level > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') { level++; i += 2; }
        else if (sql[i] === '*' && sql[i + 1] === '/') { level--; i += 2; }
        else { i++; }
      }
    } else if (c === "'") {
      const start = i;
      // E'...' strings treat backslash as an escape character.
      const prev = tokens[tokens.length - 1];
      const escapeString = !!prev && prev.type === 'word' && prev.end === start && /^[eE]$/.test(prev.text);
      i++;
      while (i < n) {
        if (escapeString && sql[i] === '\\') { i += 2; continue; }
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") { i += 2; continue; }
          i++;
          break;
        }
        i++;
      }
      if (escapeString) { tokens.pop(); }
      push('string', escapeString ? prev.start : start, Math.min(i, n));
    } else if (c === '"') {
      const start = i;
      i++;
      while (i < n) {
        if (sql[i] === '"') {
          if (sql[i + 1] === '"') { i += 2; continue; }
          i++;
          break;
        }
        i++;
      }
      push('ident', start, Math.min(i, n));
    } else if (c === '$') {
      const m = /^\$([A-Za-z_\u0080-￿][A-Za-z0-9_\u0080-￿]*)?\$/.exec(sql.slice(i, i + 200));
      if (m) {
        const tag = m[0];
        const close = sql.indexOf(tag, i + tag.length);
        const end = close === -1 ? n : close + tag.length;
        push('string', i, end);
        i = end;
      } else {
        push('punct', i, i + 1);
        i++;
      }
    } else if (isWordStart(c) || /[0-9]/.test(c)) {
      const start = i;
      i++;
      while (i < n && isWordPart(sql[i])) { i++; }
      push('word', start, i);
    } else {
      push('punct', i, i + 1);
      i++;
    }
  }
  return tokens;
}

interface Stmt {
  tokens: Token[];
  start: number;
  end: number;
}

function splitStatements(tokens: Token[]): Stmt[] {
  const out: Stmt[] = [];
  let cur: Token[] = [];
  const flush = () => {
    if (cur.length) {
      out.push({ tokens: cur, start: cur[0].start, end: cur[cur.length - 1].end });
      cur = [];
    }
  };
  for (const t of tokens) {
    if (t.type === 'punct' && t.text === ';') { flush(); } else { cur.push(t); }
  }
  flush();
  return out;
}

const isKw = (t: Token | undefined, ...kws: string[]) => !!t && t.type === 'word' && kws.includes(t.upper);

const VOLATILE_FUNCS = new Set([
  'RANDOM', 'GEN_RANDOM_UUID', 'UUID_GENERATE_V1', 'UUID_GENERATE_V1MC', 'UUID_GENERATE_V4',
  'CLOCK_TIMESTAMP', 'STATEMENT_TIMESTAMP', 'TIMEOFDAY', 'NEXTVAL', 'SETSEED', 'GEN_RANDOM_BYTES',
]);
const STABLE_TIME_FUNCS = new Set(['NOW', 'TRANSACTION_TIMESTAMP']);

class Ctx {
  findings: DdlFinding[] = [];
  constructor(private text: string, private stmt: Stmt, private index: number) {}

  /** Text of the statement. */
  get body(): string { return this.text.slice(this.stmt.start, this.stmt.end); }

  add(rule: string, severity: DdlSeverity, message: string, from: Token, to: Token, saferSql?: string): void {
    const f: DdlFinding = {
      rule, severity, message,
      range: { start: from.start - this.stmt.start, end: to.end - this.stmt.start },
      statementIndex: this.index,
      statementRange: { start: this.stmt.start, end: this.stmt.end },
    };
    if (saferSql !== undefined) { f.saferSql = saferSql; }
    this.findings.push(f);
  }

  /** Statement body with `insert` placed at the given statement-relative offset. */
  inserted(offset: number, insert: string): string {
    const b = this.body;
    return b.slice(0, offset) + insert + b.slice(offset);
  }
}

function analyzeCreateIndex(ctx: Ctx, tk: Token[]): void {
  let i = 1;
  if (isKw(tk[i], 'UNIQUE')) { i++; }
  if (!isKw(tk[i], 'INDEX')) { return; }
  const idx = tk[i];
  if (isKw(tk[i + 1], 'CONCURRENTLY')) { return; }
  ctx.add(
    'create-index-not-concurrent', 'warning',
    'CREATE INDEX without CONCURRENTLY blocks writes to the table while the index builds (SHARE lock). ' +
    'Use CREATE INDEX CONCURRENTLY; note it cannot run inside a transaction block.',
    tk[0], idx,
    ctx.inserted(idx.end - tk[0].start, ' CONCURRENTLY'),
  );
}

function analyzeReindex(ctx: Ctx, tk: Token[]): void {
  let i = 1;
  if (tk[i] && tk[i].text === '(') {
    // Option list, e.g. REINDEX (VERBOSE) TABLE ...
    const d = tk[i].depth;
    i++;
    while (i < tk.length && !(tk[i].text === ')' && tk[i].depth === d)) { i++; }
    i++;
  }
  const kind = tk[i];
  if (!isKw(kind, 'INDEX', 'TABLE', 'SCHEMA', 'DATABASE', 'SYSTEM')) { return; }
  if (isKw(tk[i + 1], 'CONCURRENTLY')) { return; }
  ctx.add(
    'reindex-not-concurrent', 'warning',
    'REINDEX without CONCURRENTLY takes locks that block writes (and reads for INDEX targets) while rebuilding. ' +
    'Use REINDEX ... CONCURRENTLY (PostgreSQL 12+); it cannot run inside a transaction block.',
    tk[0], kind,
    ctx.inserted(kind.end - tk[0].start, ' CONCURRENTLY'),
  );
}

/** Split ALTER TABLE tail into comma-separated actions at paren depth of the statement. */
function alterTableActions(tk: Token[]): Token[][] {
  let i = 2;
  if (isKw(tk[i], 'IF') && isKw(tk[i + 1], 'EXISTS')) { i += 2; }
  if (isKw(tk[i], 'ONLY')) { i++; }
  // Skip (possibly qualified) table name.
  if (!tk[i]) { return []; }
  i++;
  while (tk[i] && tk[i].text === '.' && tk[i + 1]) { i += 2; }
  if (tk[i] && tk[i].text === '*') { i++; }
  const actions: Token[][] = [];
  let cur: Token[] = [];
  for (; i < tk.length; i++) {
    if (tk[i].text === ',' && tk[i].type === 'punct' && tk[i].depth === 0) {
      if (cur.length) { actions.push(cur); }
      cur = [];
    } else { cur.push(tk[i]); }
  }
  if (cur.length) { actions.push(cur); }
  return actions;
}

function tableNameText(ctx: Ctx, tk: Token[]): string {
  let i = 2;
  if (isKw(tk[i], 'IF') && isKw(tk[i + 1], 'EXISTS')) { i += 2; }
  if (isKw(tk[i], 'ONLY')) { i++; }
  const first = tk[i];
  if (!first) { return ''; }
  let last = first;
  let j = i + 1;
  while (tk[j] && tk[j].text === '.' && tk[j + 1]) { last = tk[j + 1]; j += 2; }
  const sOff = ctx.body;
  return sOff.slice(first.start - tk[0].start, last.end - tk[0].start);
}

function analyzeAlterTable(ctx: Ctx, tk: Token[]): void {
  if (!isKw(tk[1], 'TABLE')) { return; }
  const table = tableNameText(ctx, tk);
  const stmtStart = tk[0].start;
  for (const act of alterTableActions(tk)) {
    const a0 = act[0];
    if (isKw(a0, 'ADD')) {
      let j = 1;
      if (isKw(act[j], 'COLUMN')) {
        analyzeAddColumn(ctx, act);
        continue;
      }
      let conName: string | undefined;
      if (isKw(act[j], 'CONSTRAINT')) {
        const nameTok = act[j + 1];
        if (nameTok) { conName = ctx.body.slice(nameTok.start - stmtStart, nameTok.end - stmtStart); }
        j += 2;
      }
      const kindTok = act[j];
      if (isKw(kindTok, 'FOREIGN') || isKw(kindTok, 'CHECK')) {
        if (act.some(t => isKw(t, 'NOT') && isKw(act[act.indexOf(t) + 1], 'VALID'))) { continue; }
        const isFk = isKw(kindTok, 'FOREIGN');
        const last = act[act.length - 1];
        let safer: string | undefined;
        if (conName) {
          const inserted = ctx.inserted(last.end - stmtStart, ' NOT VALID');
          safer = `${inserted};\nALTER TABLE ${table} VALIDATE CONSTRAINT ${conName}`;
          if (alterTableActions(tk).length > 1) { safer = undefined; }
        }
        ctx.add(
          isFk ? 'add-fk-not-valid' : 'add-check-not-valid', 'warning',
          `ADD CONSTRAINT (${isFk ? 'FOREIGN KEY' : 'CHECK'}) without NOT VALID scans the whole table while holding ` +
          `${isFk ? 'SHARE ROW EXCLUSIVE (plus a lock on the referenced table)' : 'ACCESS EXCLUSIVE'}. ` +
          'Add it NOT VALID, then run ALTER TABLE ... VALIDATE CONSTRAINT separately' +
          (conName ? '.' : ' (name the constraint to enable the quick fix).'),
          a0, last, safer,
        );
      }
    } else if (isKw(a0, 'ALTER')) {
      let j = 1;
      if (isKw(act[j], 'COLUMN')) { j++; }
      const colTok = act[j];
      if (!colTok) { continue; }
      j++;
      if (isKw(act[j], 'SET') && isKw(act[j + 1], 'DATA') && isKw(act[j + 2], 'TYPE')) {
        ctx.add('alter-column-type', 'warning',
          'ALTER COLUMN ... TYPE can rewrite the whole table and indexes under an ACCESS EXCLUSIVE lock, ' +
          'blocking all reads and writes. Binary-coercible changes (e.g. widening varchar) skip the rewrite.',
          a0, act[j + 2]);
      } else if (isKw(act[j], 'TYPE')) {
        ctx.add('alter-column-type', 'warning',
          'ALTER COLUMN ... TYPE can rewrite the whole table and indexes under an ACCESS EXCLUSIVE lock, ' +
          'blocking all reads and writes. Binary-coercible changes (e.g. widening varchar) skip the rewrite.',
          a0, act[j]);
      } else if (isKw(act[j], 'SET') && isKw(act[j + 1], 'NOT') && isKw(act[j + 2], 'NULL')) {
        const col = ctx.body.slice(colTok.start - stmtStart, colTok.end - stmtStart);
        ctx.add('set-not-null', 'warning',
          'SET NOT NULL scans the whole table under an ACCESS EXCLUSIVE lock. On PostgreSQL 12+, first add ' +
          `CHECK (${col} IS NOT NULL) NOT VALID, VALIDATE it, then SET NOT NULL (the scan is skipped), then drop the check.`,
          a0, act[j + 2]);
      }
    }
  }
}

function analyzeAddColumn(ctx: Ctx, act: Token[]): void {
  for (let k = 0; k < act.length; k++) {
    if (!isKw(act[k], 'DEFAULT')) { continue; }
    // Default expression runs until a column-constraint keyword at depth 0.
    const baseDepth = act[k].depth;
    for (let m = k + 1; m < act.length; m++) {
      const t = act[m];
      if (t.depth < baseDepth) { break; }
      if (t.depth === baseDepth && isKw(t, 'NOT', 'NULL', 'CONSTRAINT', 'CHECK', 'REFERENCES', 'PRIMARY', 'UNIQUE', 'GENERATED', 'COLLATE')) { break; }
      if (t.type === 'word' && act[m + 1] && act[m + 1].text === '(') {
        if (VOLATILE_FUNCS.has(t.upper)) {
          ctx.add('add-column-volatile-default', 'warning',
            `ADD COLUMN with volatile DEFAULT ${t.text}() forces a full table rewrite under an ACCESS EXCLUSIVE lock. ` +
            'Add the column without a default, backfill in batches, then SET DEFAULT.',
            act[0], t);
          return;
        }
        if (STABLE_TIME_FUNCS.has(t.upper)) {
          ctx.add('add-column-time-default', 'info',
            `DEFAULT ${t.text}() is stable, so PostgreSQL 11+ evaluates it once and avoids a rewrite, ` +
            'but every existing row gets the same timestamp. Older servers rewrite the table.',
            act[0], t);
          return;
        }
      }
    }
  }
}

function analyzeVacuum(ctx: Ctx, tk: Token[]): void {
  let full: Token | undefined;
  if (tk[1] && tk[1].text === '(') {
    for (let i = 2; i < tk.length && tk[i].text !== ')'; i++) {
      if (isKw(tk[i], 'FULL') && !isKw(tk[i + 1], 'FALSE', 'OFF', '0')) { full = tk[i]; break; }
    }
  } else if (isKw(tk[1], 'FULL')) {
    full = tk[1];
  }
  if (full) {
    ctx.add('vacuum-full', 'warning',
      'VACUUM FULL rewrites the table under an ACCESS EXCLUSIVE lock, blocking all reads and writes, and needs extra disk space. ' +
      'Consider pg_repack or plain VACUUM.', tk[0], full);
  }
}

function analyzeDml(ctx: Ctx, tk: Token[]): void {
  let kw: Token | undefined;
  if (isKw(tk[0], 'DELETE', 'UPDATE')) {
    kw = tk[0];
  } else if (isKw(tk[0], 'WITH')) {
    kw = tk.find(t => t.depth === 0 && isKw(t, 'DELETE', 'UPDATE'));
  }
  if (!kw) { return; }
  const hasWhere = tk.some(t => t.depth === 0 && isKw(t, 'WHERE') && t.start > kw!.start);
  if (!hasWhere) {
    ctx.add('dml-without-where', 'danger',
      `${kw.upper} without a WHERE clause affects every row in the table.`, kw, tk[tk.length - 1]);
  }
}

function analyzeStatement(text: string, stmt: Stmt, index: number): DdlFinding[] {
  const tk = stmt.tokens;
  const ctx = new Ctx(text, stmt, index);
  const first = tk[0];
  if (first.type !== 'word') { return []; }
  switch (first.upper) {
    case 'CREATE': analyzeCreateIndex(ctx, tk); break;
    case 'REINDEX': analyzeReindex(ctx, tk); break;
    case 'ALTER': analyzeAlterTable(ctx, tk); break;
    case 'VACUUM': analyzeVacuum(ctx, tk); break;
    case 'CLUSTER':
      ctx.add('cluster', 'warning',
        'CLUSTER rewrites the table under an ACCESS EXCLUSIVE lock, blocking all reads and writes.', first, first);
      break;
    case 'DROP': {
      if (isKw(tk[1], 'TABLE')) {
        ctx.add('drop-table', 'danger', 'DROP TABLE permanently deletes the table and takes an ACCESS EXCLUSIVE lock.', first, tk[1]);
      } else if (isKw(tk[1], 'SCHEMA')) {
        const cascade = tk.find(t => isKw(t, 'CASCADE'));
        if (cascade) {
          ctx.add('drop-schema-cascade', 'danger', 'DROP SCHEMA ... CASCADE drops every object in the schema and everything depending on them.', first, cascade);
        }
      }
      break;
    }
    case 'TRUNCATE':
      ctx.add('truncate', 'danger', 'TRUNCATE removes all rows immediately under an ACCESS EXCLUSIVE lock and is not MVCC-safe for concurrent readers.', first, first);
      break;
    case 'LOCK': {
      ctx.add('lock-table', 'warning', 'LOCK TABLE holds an explicit lock until the transaction ends; the default mode is ACCESS EXCLUSIVE and blocks all other access.', first, tk[1] && isKw(tk[1], 'TABLE') ? tk[1] : first);
      break;
    }
    case 'DELETE':
    case 'UPDATE':
    case 'WITH':
      analyzeDml(ctx, tk);
      break;
    default: break;
  }
  return ctx.findings;
}

/**
 * Analyze SQL text (one or many statements) for DDL that takes heavy locks or rewrites tables.
 * Finding ranges are relative to their statement; use `statementRange.start + range.start` for absolute offsets.
 */
export function analyzeDdlLockRisk(sql: string): DdlFinding[] {
  const stmts = splitStatements(tokenizeSql(sql));
  const out: DdlFinding[] = [];
  stmts.forEach((s, i) => out.push(...analyzeStatement(sql, s, i)));
  return out;
}

/** Absolute offsets of a finding within the analyzed text. */
export function absoluteRange(f: DdlFinding): DdlRange {
  return { start: f.statementRange.start + f.range.start, end: f.statementRange.start + f.range.end };
}
