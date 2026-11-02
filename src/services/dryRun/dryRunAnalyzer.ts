import { SqlParser } from '../../providers/kernel/SqlParser';

/**
 * Pure (no VS Code, no database) analysis of a SQL cell for "dry run" eligibility.
 *
 * A dry run executes one statement inside a transaction (or savepoint) and always
 * rolls it back. This module decides whether a statement may be dry-run, and how
 * before/after snapshots can be captured.
 */

export type DryRunVerb = 'INSERT' | 'UPDATE' | 'DELETE' | 'MERGE' | 'DDL';

export type DryRunRefusalCode =
  | 'empty'
  | 'multi-statement'
  | 'transaction-control'
  | 'non-transactional'
  | 'parameterized'
  | 'unsupported';

/** How after-images are obtained. */
export type DryRunAfterStrategy =
  /** User wrote RETURNING; statement is wrapped so row output can be capped server side. */
  | 'user-returning-wrapped'
  /** No RETURNING; we append `RETURNING *` inside a capping wrapper. */
  | 'append-returning-wrapped'
  /** User wrote RETURNING but the statement shape cannot be wrapped (WITH / MERGE); run as-is. */
  | 'user-returning-direct'
  /** No after-image available (DDL, MERGE, WITH ...). Only the affected count is reported. */
  | 'none';

export interface DryRunBeforeCapture {
  /** Target as written (may be schema-qualified / quoted), including a leading ONLY if present. */
  target: string;
  alias?: string;
  /** Raw WHERE predicate text (without the WHERE keyword), if any. */
  where?: string;
}

export interface DryRunPlan {
  /** Original statement, trimmed and without a trailing semicolon. */
  sql: string;
  verb: DryRunVerb;
  /** First keyword of DDL statements (CREATE, ALTER, DROP, ...). */
  ddlKeyword?: string;
  after: DryRunAfterStrategy;
  /** Present when before-images can be captured safely. */
  before?: DryRunBeforeCapture;
  /** Why before-images are not captured (UPDATE/DELETE only). */
  beforeSkippedReason?: string;
  /** Human-readable notes explaining reduced fidelity. */
  notes: string[];
}

export type DryRunAnalysis =
  | { ok: true; plan: DryRunPlan }
  | { ok: false; code: DryRunRefusalCode; reason: string };

interface Tok {
  text: string;
  upper: string;
  start: number;
  end: number;
  depth: number;
  kind: 'word' | 'quoted' | 'param' | 'punct';
}

const TXN_CONTROL = new Set([
  'BEGIN',
  'START',
  'COMMIT',
  'END',
  'ROLLBACK',
  'ABORT',
  'SAVEPOINT',
  'RELEASE',
  'PREPARE',
]);

const DDL_KEYWORDS = new Set([
  'CREATE',
  'ALTER',
  'DROP',
  'TRUNCATE',
  'COMMENT',
  'GRANT',
  'REVOKE',
  'REINDEX',
  'REFRESH',
  'SECURITY',
]);

const DML_VERBS = new Set(['INSERT', 'UPDATE', 'DELETE', 'MERGE']);

export const DRY_RUN_SCOPE_MESSAGE =
  'Dry run supports a single INSERT, UPDATE, DELETE, MERGE (PostgreSQL 15+) or transactional DDL statement.';

function tokenize(stripped: string): Tok[] {
  const toks: Tok[] = [];
  const re = /"(?:[^"]|"")*"|\$\d+|[A-Za-z_\u0080-￿][A-Za-z0-9_$\u0080-￿]*|\d[\w.]*|::|[^\s]/gy;
  let depth = 0;
  let m: RegExpExecArray | null;
  re.lastIndex = 0;
  while (re.lastIndex < stripped.length) {
    // skip whitespace manually (sticky regex)
    if (/\s/.test(stripped[re.lastIndex])) {
      re.lastIndex++;
      continue;
    }
    const start = re.lastIndex;
    m = re.exec(stripped);
    if (!m) {
      re.lastIndex = start + 1;
      continue;
    }
    const text = m[0];
    let kind: Tok['kind'] = 'punct';
    if (text.startsWith('"')) kind = 'quoted';
    else if (/^\$\d+$/.test(text)) kind = 'param';
    else if (/^[A-Za-z_\u0080-￿]/.test(text)) kind = 'word';
    if (text === ')') depth = Math.max(0, depth - 1);
    toks.push({
      text,
      upper: kind === 'word' ? text.toUpperCase() : text,
      start,
      end: start + text.length,
      depth,
      kind,
    });
    if (text === '(') depth++;
  }
  return toks;
}

function refuse(code: DryRunRefusalCode, reason: string): DryRunAnalysis {
  return { ok: false, code, reason };
}

/** Is `t` the unquoted keyword `kw`? */
function isKw(t: Tok | undefined, kw: string): boolean {
  return !!t && t.kind === 'word' && t.upper === kw;
}

/**
 * Quick content check used by CodeLens / toolbar gating: does the cell look like
 * a (potentially) dry-runnable write? Never throws.
 */
export function cellHasDryRunnableWrite(sql: string): boolean {
  try {
    return analyzeDryRun(sql).ok;
  } catch {
    return false;
  }
}

/**
 * Whether the text looks like a write at all (used to decide whether to *offer* the
 * action; refusal reasons for unsupported writes are shown when it is invoked).
 */
export function looksLikeWrite(sql: string): boolean {
  try {
    const stripped = SqlParser.stripCommentsAndStrings(sql);
    const toks = tokenize(stripped);
    const first = toks.find((t) => t.kind === 'word');
    if (!first) return false;
    if (DML_VERBS.has(first.upper) || DDL_KEYWORDS.has(first.upper)) return true;
    if (first.upper === 'WITH') {
      return toks.some((t) => t.depth === 0 && t.kind === 'word' && DML_VERBS.has(t.upper));
    }
    return false;
  } catch {
    return false;
  }
}

export function analyzeDryRun(rawSql: string): DryRunAnalysis {
  const trimmed = (rawSql ?? '').trim();
  if (!trimmed) {
    return refuse('empty', 'The cell is empty. Nothing to dry run.');
  }

  // --- single statement check (two independent mechanisms must agree) ---
  const split = SqlParser.splitSqlStatements(trimmed).filter((s) => SqlParser.stripCommentsAndStrings(s).trim().length > 0);
  const stripped = SqlParser.stripCommentsAndStrings(trimmed);
  const toks = tokenize(stripped);

  const semis = toks.filter((t) => t.text === ';');
  const lastTok = toks[toks.length - 1];
  const multiBySemicolon = semis.length > 1 || (semis.length === 1 && lastTok?.text !== ';');
  if (split.length > 1 || multiBySemicolon) {
    return refuse(
      'multi-statement',
      'Dry run only supports a single statement per cell. Split the cell so it contains one statement, then try again.',
    );
  }
  if (split.length === 0) {
    return refuse('empty', 'The cell contains only comments. Nothing to dry run.');
  }

  // Remove trailing semicolon from both tokens and the SQL we will execute.
  let body = trimmed;
  const bodyToks = toks.filter((t, i) => !(t.text === ';' && i === toks.length - 1));
  if (semis.length === 1) {
    body = body.slice(0, semis[0].start).trimEnd();
  }

  const first = bodyToks[0];
  if (!first || first.kind !== 'word') {
    return refuse('unsupported', DRY_RUN_SCOPE_MESSAGE);
  }

  const detected = SqlParser.detectParameters(trimmed);
  if (
    detected.positional.length > 0 ||
    detected.named.length > 0 ||
    detected.quoted.length > 0 ||
    bodyToks.some((t) => t.kind === 'param')
  ) {
    return refuse(
      'parameterized',
      'Dry run does not support parameterized statements ($1, :name). Replace the parameters with literal values and try again.',
    );
  }

  if (TXN_CONTROL.has(first.upper)) {
    return refuse(
      'transaction-control',
      `Dry run manages its own transaction, so a ${first.upper} statement cannot be dry-run. Remove explicit BEGIN/COMMIT/ROLLBACK/SAVEPOINT statements.`,
    );
  }

  if (first.upper === 'VACUUM') {
    return refuse('non-transactional', 'VACUUM cannot run inside a transaction, so it cannot be dry-run.');
  }
  if (first.upper === 'CLUSTER') {
    return refuse('non-transactional', 'CLUSTER cannot be dry-run because it cannot run reliably inside a transaction block.');
  }

  const second = bodyToks[1];

  if (first.upper === 'ALTER' && isKw(second, 'SYSTEM')) {
    return refuse('non-transactional', 'ALTER SYSTEM cannot run inside a transaction, so it cannot be dry-run.');
  }
  if (['CREATE', 'DROP', 'ALTER'].includes(first.upper) && second && second.kind === 'word') {
    if (second.upper === 'DATABASE') {
      return refuse('non-transactional', `${first.upper} DATABASE cannot run inside a transaction, so it cannot be dry-run.`);
    }
    if (second.upper === 'TABLESPACE') {
      return refuse('non-transactional', `${first.upper} TABLESPACE cannot run inside a transaction, so it cannot be dry-run.`);
    }
    if (second.upper === 'SUBSCRIPTION') {
      return refuse('non-transactional', `${first.upper} SUBSCRIPTION can have effects outside the transaction, so it cannot be dry-run.`);
    }
  }
  if (['CREATE', 'DROP', 'ALTER', 'REINDEX'].includes(first.upper)) {
    const conc = bodyToks.find((t) => t.depth === 0 && isKw(t, 'CONCURRENTLY'));
    if (conc) {
      return refuse(
        'non-transactional',
        `${first.upper} ... CONCURRENTLY cannot run inside a transaction block, so it cannot be dry-run.`,
      );
    }
  }
  if (first.upper === 'REINDEX' && second && ['DATABASE', 'SYSTEM', 'SCHEMA'].includes(second.upper)) {
    return refuse('non-transactional', `REINDEX ${second.upper} cannot run inside a transaction block, so it cannot be dry-run.`);
  }

  const notes: string[] = [];

  // --- DDL ---
  if (DDL_KEYWORDS.has(first.upper)) {
    return {
      ok: true,
      plan: {
        sql: body,
        verb: 'DDL',
        ddlKeyword: first.upper,
        after: 'none',
        notes: ['DDL has no row snapshots; the statement was executed and rolled back to check it would succeed.'],
      },
    };
  }

  // --- DML (possibly behind a WITH) ---
  let verbTok: Tok | undefined;
  let withLeading = false;
  if (first.upper === 'WITH') {
    withLeading = true;
    for (let i = 1; i < bodyToks.length; i++) {
      const t = bodyToks[i];
      if (t.text === ')' && t.depth === 0) {
        const next = bodyToks[i + 1];
        if (next && (next.text === ',' || isKw(next, 'AS'))) continue;
        verbTok = next;
        break;
      }
    }
    if (!verbTok || verbTok.kind !== 'word' || !DML_VERBS.has(verbTok.upper)) {
      return refuse(
        'unsupported',
        'This WITH statement does not end in INSERT, UPDATE, DELETE or MERGE, so there is nothing to dry run. ' + DRY_RUN_SCOPE_MESSAGE,
      );
    }
  } else if (DML_VERBS.has(first.upper)) {
    verbTok = first;
  } else {
    return refuse('unsupported', `${first.upper} statements cannot be dry-run. ${DRY_RUN_SCOPE_MESSAGE}`);
  }

  const verb = verbTok.upper as 'INSERT' | 'UPDATE' | 'DELETE' | 'MERGE';
  const returningTok = bodyToks.find((t) => t.depth === 0 && isKw(t, 'RETURNING') && t.start > verbTok!.start);
  const hasReturning = !!returningTok;

  let after: DryRunAfterStrategy;
  if (verb === 'MERGE' || withLeading) {
    after = hasReturning ? 'user-returning-direct' : 'none';
    if (!hasReturning) {
      notes.push(
        verb === 'MERGE'
          ? 'MERGE has no RETURNING clause before PostgreSQL 17, so only the affected row count is reported. Add RETURNING (PostgreSQL 17+) to see rows.'
          : 'Statements that start with WITH are executed as written; add a RETURNING clause to see the changed rows.',
      );
    }
  } else {
    after = hasReturning ? 'user-returning-wrapped' : 'append-returning-wrapped';
  }

  const plan: DryRunPlan = { sql: body, verb, after, notes };

  if (verb === 'UPDATE' || verb === 'DELETE') {
    const cap = planBeforeCapture(body, bodyToks, verb, withLeading, returningTok);
    if (cap.capture) {
      plan.before = cap.capture;
    } else {
      plan.beforeSkippedReason = cap.reason;
      notes.push(`Before-image skipped: ${cap.reason}`);
    }
  }

  return { ok: true, plan };
}

function readQualifiedName(toks: Tok[], i: number): { endIdx: number } | undefined {
  const isName = (t?: Tok) => !!t && (t.kind === 'word' || t.kind === 'quoted');
  if (!isName(toks[i])) return undefined;
  let j = i;
  while (toks[j + 1]?.text === '.' && isName(toks[j + 2])) {
    j += 2;
  }
  return { endIdx: j };
}

function planBeforeCapture(
  sql: string,
  toks: Tok[],
  verb: 'UPDATE' | 'DELETE',
  withLeading: boolean,
  returningTok: Tok | undefined,
): { capture: DryRunBeforeCapture; reason?: undefined } | { capture?: undefined; reason: string } {
  if (withLeading) {
    return { reason: 'the statement starts with a WITH clause (CTE).' };
  }
  let i = 1; // after UPDATE / DELETE
  if (verb === 'DELETE') {
    if (!isKw(toks[i], 'FROM')) return { reason: 'could not parse the DELETE target.' };
    i++;
  }
  let only = '';
  if (isKw(toks[i], 'ONLY')) {
    only = 'ONLY ';
    i++;
  }
  if (toks[i]?.text === '(') {
    return { reason: 'the target is parenthesised or a subquery.' };
  }
  const name = readQualifiedName(toks, i);
  if (!name) return { reason: 'could not parse the target table.' };
  const targetText = sql.slice(toks[i].start, toks[name.endIdx].end);
  i = name.endIdx + 1;
  if (toks[i]?.text === '*' || toks[i]?.text === '(') {
    return { reason: 'the target uses an unsupported form (inheritance star or call syntax).' };
  }

  let alias: string | undefined;
  const stopWords = verb === 'UPDATE' ? ['SET'] : ['USING', 'WHERE', 'RETURNING'];
  if (isKw(toks[i], 'AS')) {
    const a = toks[i + 1];
    if (!a || (a.kind !== 'word' && a.kind !== 'quoted')) return { reason: 'could not parse the table alias.' };
    alias = sql.slice(a.start, a.end);
    i += 2;
  } else if (toks[i] && (toks[i].kind === 'word' || toks[i].kind === 'quoted') && !stopWords.includes(toks[i].upper)) {
    alias = sql.slice(toks[i].start, toks[i].end);
    i++;
  }

  const depth0 = toks.filter((t) => t.depth === 0);
  if (verb === 'DELETE' && depth0.some((t) => isKw(t, 'USING'))) {
    return { reason: 'the DELETE uses USING (a join), so the affected rows are ambiguous.' };
  }
  if (verb === 'UPDATE') {
    if (!isKw(toks[i], 'SET')) return { reason: 'could not parse the UPDATE statement.' };
    if (depth0.some((t) => isKw(t, 'FROM'))) {
      return { reason: 'the UPDATE uses FROM (a join), so the affected rows are ambiguous.' };
    }
  }

  const whereTok = depth0.find((t) => isKw(t, 'WHERE') && t.start > toks[name.endIdx].end);
  let where: string | undefined;
  if (whereTok) {
    const afterWhere = toks.slice(toks.indexOf(whereTok) + 1);
    if (afterWhere.length >= 2 && isKw(afterWhere[0], 'CURRENT') && isKw(afterWhere[1], 'OF')) {
      return { reason: 'WHERE CURRENT OF refers to a cursor.' };
    }
    const endPos = returningTok ? returningTok.start : sql.length;
    where = sql.slice(whereTok.end, endPos).trim();
    if (!where) return { reason: 'could not parse the WHERE clause.' };
  }

  return { capture: { target: only + targetText, alias, where } };
}
