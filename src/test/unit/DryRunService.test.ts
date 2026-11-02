import { expect } from 'chai';
import { DryRunService } from '../../services/dryRun/DryRunService';
import { TransactionManager } from '../../services/TransactionManager';

type Handler = (text: string) => any;

class MockClient {
  public log: string[] = [];
  private listeners = new Map<string, Array<(n: any) => void>>();
  constructor(private handler: Handler = () => ({ rows: [], fields: [], rowCount: 0, command: 'OK' })) {}

  on(evt: string, cb: (n: any) => void) {
    this.listeners.set(evt, [...(this.listeners.get(evt) ?? []), cb]);
    return this;
  }
  removeListener(evt: string, cb: (n: any) => void) {
    this.listeners.set(evt, (this.listeners.get(evt) ?? []).filter((l) => l !== cb));
    return this;
  }
  emit(evt: string, payload: any) {
    (this.listeners.get(evt) ?? []).forEach((l) => l(payload));
  }
  async query(arg: string | { text: string }): Promise<any> {
    const text = typeof arg === 'string' ? arg : arg.text;
    this.log.push(text);
    return this.handler(text);
  }
}

const f = (name: string, dataTypeID = 25) => ({ name, dataTypeID });
const okEmpty = { rows: [], fields: [], rowCount: 0, command: 'OK' };

/** Handler that returns an UPDATE result of N rows (wrapped query) and an N-row before-image. */
function dmlHandler(n: number, opts: { failOn?: RegExp; failWith?: any; hang?: Promise<void> } = {}): Handler {
  return (text: string) => {
    if (opts.failOn && opts.failOn.test(text)) {
      throw opts.failWith ?? Object.assign(new Error('boom'), { code: '23505' });
    }
    if (/FOR UPDATE/.test(text)) {
      return {
        rows: Array.from({ length: Math.min(n, 200) }, (_, i) => [i + 1, 'old']),
        fields: [f('id', 23), f('name')],
        rowCount: Math.min(n, 200),
        command: 'SELECT',
      };
    }
    if (/count\(\*\) OVER/.test(text)) {
      return {
        rows: Array.from({ length: Math.min(n, 200) }, (_, i) => [String(n), i + 1, 'new']),
        fields: [f('__nexql_dry_total', 20), f('id', 23), f('name')],
        rowCount: Math.min(n, 200),
        command: 'SELECT',
      };
    }
    return okEmpty;
  };
}

function assertNeverCommits(log: string[]) {
  for (const q of log) {
    expect(q, q).to.not.match(/^\s*(COMMIT|END)\b/i);
    expect(q, q).to.not.match(/PREPARE\s+TRANSACTION/i);
  }
}

describe('DryRunService', () => {
  let svc: DryRunService;
  let tm: TransactionManager;
  const SESSION = 'nb://1';

  beforeEach(() => {
    svc = new DryRunService();
    tm = new TransactionManager();
    tm.initializeSession(SESSION);
  });

  describe('dedicated transaction', () => {
    it('BEGIN, SET LOCAL timeout, before, main, ROLLBACK; reports counts and snapshots', async () => {
      const c = new MockClient(dmlHandler(3));
      const r = await svc.run(c as any, "UPDATE users SET name = 'x' WHERE id < 4", { sessionId: SESSION, txManager: tm, timeoutMs: 5000 });

      expect(r.status).to.equal('rolled-back');
      expect(r.mode).to.equal('transaction');
      expect(r.rollbackConfirmed).to.equal(true);
      expect(r.affectedCount).to.equal(3);
      expect(r.before?.rows).to.have.length(3);
      expect(r.before?.columns).to.deep.equal(['id', 'name']);
      expect(r.after?.rows).to.have.length(3);
      expect(r.after?.columns).to.deep.equal(['id', 'name']);
      expect(r.after?.totalRows).to.equal(3);
      expect(r.after?.capped).to.equal(false);

      expect(c.log[0]).to.equal('BEGIN');
      expect(c.log[1]).to.equal('SET LOCAL statement_timeout = 5000');
      expect(c.log[c.log.length - 1]).to.equal('ROLLBACK');
      const beforeSql = c.log.find((q) => /FOR UPDATE/.test(q))!;
      expect(beforeSql).to.match(/SELECT \* FROM users\nWHERE id < 4\nLIMIT 200\nFOR UPDATE/);
      const mainSql = c.log.find((q) => /count\(\*\) OVER/.test(q))!;
      expect(mainSql).to.contain("UPDATE users SET name = 'x' WHERE id < 4\nRETURNING *");
      assertNeverCommits(c.log);
    });

    it('caps rows but reports the true affected count', async () => {
      const c = new MockClient(dmlHandler(5000));
      const r = await svc.run(c as any, 'UPDATE users SET name = 1', { sessionId: SESSION, txManager: tm, maxRows: 200 });
      expect(r.affectedCount).to.equal(5000);
      expect(r.after?.shownRows).to.equal(200);
      expect(r.after?.capped).to.equal(true);
      expect(r.after?.totalRows).to.equal(5000);
      expect(r.before?.capped).to.equal(true);
      expect(c.log.find((q) => /count\(\*\) OVER/.test(q))).to.match(/LIMIT 200$/);
    });

    it('uses the user RETURNING instead of appending one', async () => {
      const c = new MockClient(dmlHandler(1));
      await svc.run(c as any, 'DELETE FROM t WHERE id = 1 RETURNING id', { sessionId: SESSION, txManager: tm });
      const main = c.log.find((q) => /count\(\*\) OVER/.test(q))!;
      expect(main).to.contain('DELETE FROM t WHERE id = 1 RETURNING id\n\n)');
      expect(main).to.not.contain('RETURNING *');
    });

    it('INSERT has no before-image and no extra statements', async () => {
      const c = new MockClient(dmlHandler(2));
      const r = await svc.run(c as any, 'INSERT INTO t(a) VALUES (1),(2)', { sessionId: SESSION, txManager: tm });
      expect(r.before).to.equal(undefined);
      expect(c.log.some((q) => /FOR UPDATE/.test(q))).to.equal(false);
      expect(c.log[c.log.length - 1]).to.equal('ROLLBACK');
    });

    it('skips the before-image for ambiguous UPDATE ... FROM and says so', async () => {
      const c = new MockClient(dmlHandler(2));
      const r = await svc.run(c as any, 'UPDATE t SET a = s.a FROM s WHERE t.id = s.id', { sessionId: SESSION, txManager: tm });
      expect(r.before).to.equal(undefined);
      expect(c.log.some((q) => /FOR UPDATE/.test(q))).to.equal(false);
      expect(r.notes.join(' ')).to.match(/Before-image skipped/);
      expect(r.status).to.equal('rolled-back');
    });

    it('DDL runs as written, then ROLLBACK', async () => {
      const c = new MockClient(() => ({ rows: [], fields: [], rowCount: null, command: 'ALTER' }));
      const r = await svc.run(c as any, 'ALTER TABLE t ADD COLUMN c int;', { sessionId: SESSION, txManager: tm });
      expect(c.log).to.deep.equal(['BEGIN', 'SET LOCAL statement_timeout = 30000', 'ALTER TABLE t ADD COLUMN c int', 'ROLLBACK']);
      expect(r.status).to.equal('rolled-back');
      expect(r.command).to.equal('ALTER');
      expect(r.after).to.equal(undefined);
    });

    it('a failing before-image is skipped via its own savepoint and the dry run continues', async () => {
      const c = new MockClient(dmlHandler(2, { failOn: /FOR UPDATE/, failWith: Object.assign(new Error('no FOR UPDATE on this relation'), { code: '0A000' }) }));
      const r = await svc.run(c as any, 'DELETE FROM v WHERE id = 1', { sessionId: SESSION, txManager: tm });
      expect(r.status).to.equal('rolled-back');
      expect(r.before).to.equal(undefined);
      expect(r.after?.rows).to.have.length(2);
      expect(r.notes.join(' ')).to.match(/Before-image skipped: no FOR UPDATE/);
      expect(c.log.some((q) => /^ROLLBACK TO SAVEPOINT "nexql_dryrun_before_/.test(q))).to.equal(true);
      expect(c.log[c.log.length - 1]).to.equal('ROLLBACK');
    });

    it('SQL error: reports the error and still ends with ROLLBACK', async () => {
      const c = new MockClient(dmlHandler(1, { failOn: /count\(\*\) OVER/ }));
      const r = await svc.run(c as any, 'UPDATE t SET a = 1 WHERE id = 1', { sessionId: SESSION, txManager: tm });
      expect(r.status).to.equal('error');
      expect(r.error?.message).to.equal('boom');
      expect(r.error?.code).to.equal('23505');
      expect(r.before).to.equal(undefined);
      expect(r.after).to.equal(undefined);
      expect(c.log[c.log.length - 1]).to.equal('ROLLBACK');
      expect(r.rollbackConfirmed).to.equal(true);
      assertNeverCommits(c.log);
    });

    it('statement timeout is reported as a timeout, not a cancellation, and rolls back', async () => {
      const err = Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' });
      const c = new MockClient(dmlHandler(1, { failOn: /count\(\*\) OVER/, failWith: err }));
      const r = await svc.run(c as any, 'UPDATE t SET a = 1', { sessionId: SESSION, txManager: tm, timeoutMs: 1234 });
      expect(r.status).to.equal('error');
      expect(r.error?.timedOut).to.equal(true);
      expect(r.error?.message).to.match(/1234 ms/);
      expect(c.log[c.log.length - 1]).to.equal('ROLLBACK');
    });

    it('cancellation during the statement: status cancelled, ROLLBACK issued', async () => {
      let cancelled = false;
      const err = Object.assign(new Error('canceling statement due to user request'), { code: '57014' });
      const c = new MockClient((text) => {
        if (/count\(\*\) OVER/.test(text)) {
          cancelled = true;
          throw err;
        }
        return dmlHandler(1)(text);
      });
      const r = await svc.run(c as any, 'UPDATE t SET a = 1', { sessionId: SESSION, txManager: tm, isCancelled: () => cancelled });
      expect(r.status).to.equal('cancelled');
      expect(r.after).to.equal(undefined);
      expect(c.log[c.log.length - 1]).to.equal('ROLLBACK');
      assertNeverCommits(c.log);
    });

    it('cancellation requested before the statement runs: statement is never sent, ROLLBACK issued', async () => {
      let polls = 0;
      const c = new MockClient(dmlHandler(1));
      const r = await svc.run(c as any, 'UPDATE t SET a = 1', {
        sessionId: SESSION,
        txManager: tm,
        isCancelled: () => ++polls >= 1,
      });
      expect(r.status).to.equal('cancelled');
      expect(c.log.some((q) => /UPDATE t/.test(q))).to.equal(false);
      expect(c.log[c.log.length - 1]).to.equal('ROLLBACK');
    });

    it('cancellation requested after the statement finished discards results and rolls back', async () => {
      let done = false;
      const c = new MockClient((text) => {
        const r = dmlHandler(1)(text);
        if (/count\(\*\) OVER/.test(text)) done = true;
        return r;
      });
      const r = await svc.run(c as any, 'UPDATE t SET a = 1', { sessionId: SESSION, txManager: tm, isCancelled: () => done });
      expect(r.status).to.equal('cancelled');
      expect(r.after).to.equal(undefined);
      expect(c.log[c.log.length - 1]).to.equal('ROLLBACK');
    });

    it('rolls back even for an unexpected non-pg throw inside the transaction', async () => {
      const c = new MockClient((text) => {
        if (/count\(\*\) OVER/.test(text)) throw new TypeError('renderer-ish failure');
        return dmlHandler(1)(text);
      });
      const r = await svc.run(c as any, 'UPDATE t SET a = 1', { sessionId: SESSION, txManager: tm });
      expect(r.status).to.equal('error');
      expect(c.log[c.log.length - 1]).to.equal('ROLLBACK');
    });

    it('retries ROLLBACK once, and reports an unconfirmed rollback loudly if it keeps failing', async () => {
      let rollbackCalls = 0;
      const c = new MockClient((text) => {
        if (text === 'ROLLBACK') {
          rollbackCalls++;
          throw new Error('connection lost');
        }
        return dmlHandler(1)(text);
      });
      const r = await svc.run(c as any, 'UPDATE t SET a = 1', { sessionId: SESSION, txManager: tm });
      expect(rollbackCalls).to.equal(2);
      expect(r.rollbackConfirmed).to.equal(false);
      expect(r.rollbackError).to.equal('connection lost');
      assertNeverCommits(c.log);
    });

    it('does not ROLLBACK when BEGIN itself failed (nothing of ours is open)', async () => {
      const c = new MockClient((text) => {
        if (text === 'BEGIN') throw new Error('connection refused');
        return okEmpty;
      });
      const r = await svc.run(c as any, 'UPDATE t SET a = 1', { sessionId: SESSION, txManager: tm });
      expect(r.status).to.equal('error');
      expect(c.log).to.deep.equal(['BEGIN']);
    });
  });

  describe('inside an open user transaction (tracked by TransactionManager)', () => {
    beforeEach(async () => {
      await tm.beginTransaction(new MockClient() as any, SESSION);
    });

    it('success: SAVEPOINT ... ROLLBACK TO SAVEPOINT + RELEASE, never ROLLBACK/BEGIN/COMMIT', async () => {
      const c = new MockClient(dmlHandler(2));
      const r = await svc.run(c as any, 'UPDATE t SET a = 1 WHERE id < 3', { sessionId: SESSION, txManager: tm });
      expect(r.status).to.equal('rolled-back');
      expect(r.mode).to.equal('savepoint');
      expect(c.log[0]).to.match(/^SAVEPOINT "nexql_dryrun_/);
      const n = c.log.length;
      expect(c.log[n - 2]).to.match(/^ROLLBACK TO SAVEPOINT "nexql_dryrun_/);
      expect(c.log[n - 1]).to.match(/^RELEASE SAVEPOINT "nexql_dryrun_/);
      expect(c.log).to.not.include('BEGIN');
      expect(c.log).to.not.include('ROLLBACK');
      assertNeverCommits(c.log);
      // user transaction untouched and savepoint stack restored
      expect(tm.getTransactionInfo(SESSION)?.isActive).to.equal(true);
      expect(tm.getTransactionInfo(SESSION)?.savepointStack).to.deep.equal([]);
    });

    it('SQL error: still ROLLBACK TO SAVEPOINT + RELEASE so the user transaction stays usable', async () => {
      const c = new MockClient(dmlHandler(1, { failOn: /count\(\*\) OVER/ }));
      const r = await svc.run(c as any, 'UPDATE t SET a = 1', { sessionId: SESSION, txManager: tm });
      expect(r.status).to.equal('error');
      const n = c.log.length;
      expect(c.log[n - 2]).to.match(/^ROLLBACK TO SAVEPOINT/);
      expect(c.log[n - 1]).to.match(/^RELEASE SAVEPOINT/);
      expect(tm.getTransactionInfo(SESSION)?.isActive).to.equal(true);
      expect(tm.isTransactionFailed(SESSION)).to.equal(false);
    });

    it('cancellation: ROLLBACK TO SAVEPOINT + RELEASE', async () => {
      let cancelled = false;
      const c = new MockClient((text) => {
        if (/count\(\*\) OVER/.test(text)) {
          cancelled = true;
          throw Object.assign(new Error('canceling statement due to user request'), { code: '57014' });
        }
        return dmlHandler(1)(text);
      });
      const r = await svc.run(c as any, 'UPDATE t SET a = 1', { sessionId: SESSION, txManager: tm, isCancelled: () => cancelled });
      expect(r.status).to.equal('cancelled');
      const n = c.log.length;
      expect(c.log[n - 2]).to.match(/^ROLLBACK TO SAVEPOINT/);
      expect(c.log[n - 1]).to.match(/^RELEASE SAVEPOINT/);
    });

    it('refuses when the open transaction is READ ONLY or failed, without sending anything', async () => {
      const ro = new TransactionManager();
      ro.initializeSession(SESSION);
      await ro.beginTransaction(new MockClient() as any, SESSION, 'READ COMMITTED', true);
      const c1 = new MockClient();
      const r1 = await svc.run(c1 as any, 'UPDATE t SET a = 1', { sessionId: SESSION, txManager: ro });
      expect(r1.status).to.equal('refused');
      expect(c1.log).to.deep.equal([]);

      tm.getTransactionInfo(SESSION)!.state = 'failed';
      const c2 = new MockClient();
      const r2 = await svc.run(c2 as any, 'UPDATE t SET a = 1', { sessionId: SESSION, txManager: tm });
      expect(r2.status).to.equal('refused');
      expect(r2.refusal?.reason).to.match(/failed state/);
      expect(c2.log).to.deep.equal([]);
    });
  });

  describe('transaction opened outside TransactionManager (typed BEGIN)', () => {
    it('detects the no-op BEGIN warning and uses a savepoint instead of ROLLBACK', async () => {
      const c = new MockClient((text) => {
        if (text === 'BEGIN') {
          c.emit('notice', { code: '25001', message: 'there is already a transaction in progress' });
          return okEmpty;
        }
        return dmlHandler(1)(text);
      });
      const r = await svc.run(c as any, 'UPDATE t SET a = 1 WHERE id = 1', { sessionId: SESSION, txManager: tm });
      expect(r.status).to.equal('rolled-back');
      expect(r.mode).to.equal('savepoint');
      expect(c.log).to.not.include('ROLLBACK');
      const n = c.log.length;
      expect(c.log[n - 2]).to.match(/^ROLLBACK TO SAVEPOINT/);
      expect(c.log[n - 1]).to.match(/^RELEASE SAVEPOINT/);
      assertNeverCommits(c.log);
    });
  });

  describe('refusals never touch the database', () => {
    for (const sql of ['COMMIT', 'BEGIN', 'UPDATE t SET a = 1; COMMIT', 'VACUUM t', 'CREATE INDEX CONCURRENTLY i ON t(a)', 'SELECT 1', 'UPDATE t SET a = $1']) {
      it(`refuses ${sql}`, async () => {
        const c = new MockClient();
        const r = await svc.run(c as any, sql, { sessionId: SESSION, txManager: tm });
        expect(r.status).to.equal('refused');
        expect(r.refusal?.reason).to.be.a('string').and.not.equal('');
        expect(c.log).to.deep.equal([]);
      });
    }
  });

  describe('commit tripwire', () => {
    it('exec refuses COMMIT/END/PREPARE even if reached', async () => {
      const c = new MockClient();
      for (const q of ['COMMIT', 'commit;', '  END', 'PREPARE TRANSACTION \'x\'']) {
        let threw = false;
        try {
          await (svc as any).exec(c, q);
        } catch (e: any) {
          threw = /invariant/.test(e.message);
        }
        expect(threw, q).to.equal(true);
      }
      expect(c.log).to.deep.equal([]);
    });
  });
});
