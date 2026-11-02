import { expect } from 'chai';
import { analyzeDryRun, cellHasDryRunnableWrite, looksLikeWrite } from '../../services/dryRun/dryRunAnalyzer';

function plan(sql: string) {
  const r = analyzeDryRun(sql);
  if (!r.ok) {
    throw new Error(`expected ok, got refusal: ${r.reason}`);
  }
  return r.plan;
}

function refusal(sql: string) {
  const r = analyzeDryRun(sql);
  if (r.ok) {
    throw new Error('expected refusal');
  }
  return r;
}

describe('dry run analyzer', () => {
  describe('refusals', () => {
    it('refuses empty and comment-only cells', () => {
      expect(refusal('   ').code).to.equal('empty');
      expect(refusal('-- nothing here').code).to.equal('empty');
    });

    it('refuses multi-statement cells', () => {
      const r = refusal('UPDATE t SET a = 1; DELETE FROM t');
      expect(r.code).to.equal('multi-statement');
      expect(r.reason).to.match(/single statement/i);
      expect(refusal("INSERT INTO t VALUES (1); -- c\nINSERT INTO t VALUES (2);").code).to.equal('multi-statement');
    });

    it('does not count semicolons inside strings, comments or dollar quotes', () => {
      expect(analyzeDryRun("INSERT INTO t(a) VALUES ('x;y') -- ; more").ok).to.equal(true);
      expect(analyzeDryRun('CREATE FUNCTION f() RETURNS int AS $$ BEGIN RETURN 1; END; $$ LANGUAGE plpgsql;').ok).to.equal(true);
    });

    for (const sql of [
      'BEGIN',
      'COMMIT',
      'ROLLBACK',
      'START TRANSACTION',
      'END',
      'SAVEPOINT a',
      'ROLLBACK TO SAVEPOINT a',
      'RELEASE SAVEPOINT a',
      'ABORT',
      'PREPARE TRANSACTION \'x\'',
      'COMMIT PREPARED \'x\'',
    ]) {
      it(`refuses explicit transaction control: ${sql}`, () => {
        const r = refusal(sql);
        expect(r.code).to.equal('transaction-control');
        expect(r.reason).to.match(/BEGIN\/COMMIT\/ROLLBACK/);
      });
    }

    for (const sql of [
      'CREATE INDEX CONCURRENTLY i ON t(a)',
      'CREATE UNIQUE INDEX CONCURRENTLY i ON t(a)',
      'DROP INDEX CONCURRENTLY i',
      'REINDEX INDEX CONCURRENTLY i',
      'REINDEX TABLE CONCURRENTLY t',
      'VACUUM t',
      'VACUUM (ANALYZE) t',
      'CREATE DATABASE d',
      'DROP DATABASE d',
      'DROP DATABASE IF EXISTS d',
      'ALTER SYSTEM SET work_mem = \'1MB\'',
      'ALTER DATABASE d SET TABLESPACE x',
      'CREATE TABLESPACE ts LOCATION \'/x\'',
      'REINDEX DATABASE d',
      'CLUSTER t',
      'ALTER TABLE t DETACH PARTITION p CONCURRENTLY',
    ]) {
      it(`refuses non-transactional statement: ${sql}`, () => {
        const r = refusal(sql);
        expect(r.code).to.equal('non-transactional');
        expect(r.reason).to.match(/cannot/i);
      });
    }

    it('refuses read-only and unsupported statements with the scope message', () => {
      expect(refusal('SELECT 1').reason).to.match(/INSERT, UPDATE, DELETE, MERGE/);
      expect(refusal('EXPLAIN ANALYZE UPDATE t SET a = 1').code).to.equal('unsupported');
      expect(refusal('DO $$ BEGIN PERFORM 1; END $$').code).to.equal('unsupported');
      expect(refusal('COPY t FROM STDIN').code).to.equal('unsupported');
      expect(refusal('WITH x AS (SELECT 1) SELECT * FROM x').code).to.equal('unsupported');
    });

    it('refuses parameterized statements', () => {
      expect(refusal('UPDATE t SET a = $1 WHERE id = $2').code).to.equal('parameterized');
      expect(refusal('DELETE FROM t WHERE id = :id').code).to.equal('parameterized');
    });

    it('allows :: casts', () => {
      expect(analyzeDryRun("UPDATE t SET a = '1'::int WHERE id = 3").ok).to.equal(true);
    });
  });

  describe('allowed statements', () => {
    it('accepts DDL', () => {
      const p = plan('ALTER TABLE t ADD COLUMN c int;');
      expect(p.verb).to.equal('DDL');
      expect(p.ddlKeyword).to.equal('ALTER');
      expect(p.after).to.equal('none');
      expect(p.sql).to.equal('ALTER TABLE t ADD COLUMN c int');
      for (const s of ['CREATE TABLE x (a int)', 'DROP TABLE x', 'TRUNCATE t', 'CREATE INDEX i ON t(a)', 'COMMENT ON TABLE t IS \'x\'', 'GRANT SELECT ON t TO r']) {
        expect(analyzeDryRun(s).ok, s).to.equal(true);
      }
    });

    it('strips the trailing semicolon but keeps trailing comments out of the body', () => {
      expect(plan('INSERT INTO t(a) VALUES (1); -- note; with semicolon').sql).to.equal('INSERT INTO t(a) VALUES (1)');
    });

    it('INSERT without RETURNING gets an appended RETURNING', () => {
      const p = plan('INSERT INTO t(a) VALUES (1)');
      expect(p.verb).to.equal('INSERT');
      expect(p.after).to.equal('append-returning-wrapped');
      expect(p.before).to.equal(undefined);
    });

    it('uses the user RETURNING when present', () => {
      expect(plan('INSERT INTO t(a) VALUES (1) RETURNING id').after).to.equal('user-returning-wrapped');
      expect(plan('UPDATE t SET a = 1 WHERE id = 1 RETURNING *').after).to.equal('user-returning-wrapped');
    });

    it('ignores RETURNING inside a CTE body or string when deciding', () => {
      expect(plan("UPDATE t SET a = 'RETURNING' WHERE id = 1").after).to.equal('append-returning-wrapped');
    });

    it('MERGE gets no appended RETURNING', () => {
      const p = plan('MERGE INTO t USING s ON t.id = s.id WHEN MATCHED THEN UPDATE SET a = s.a');
      expect(p.verb).to.equal('MERGE');
      expect(p.after).to.equal('none');
      expect(p.notes.join(' ')).to.match(/MERGE/);
      expect(plan('MERGE INTO t USING s ON t.id = s.id WHEN MATCHED THEN DELETE RETURNING *').after).to.equal('user-returning-direct');
    });

    it('accepts WITH ... DML, executed as written', () => {
      const p = plan('WITH d AS (SELECT id FROM s) DELETE FROM t USING d WHERE t.id = d.id');
      expect(p.verb).to.equal('DELETE');
      expect(p.after).to.equal('none');
      expect(p.before).to.equal(undefined);
      expect(p.beforeSkippedReason).to.match(/WITH/);
      const q = plan('WITH a(x) AS (SELECT 1), b AS (SELECT 2) UPDATE t SET c = 1');
      expect(q.verb).to.equal('UPDATE');
    });
  });

  describe('before-image planning', () => {
    it('captures target, alias and WHERE for UPDATE', () => {
      const p = plan("UPDATE public.users u SET active = false WHERE u.last_login < now() - interval '1 year' RETURNING id");
      expect(p.before).to.deep.equal({
        target: 'public.users',
        alias: 'u',
        where: "u.last_login < now() - interval '1 year'",
      });
    });

    it('captures target and WHERE for DELETE, quoted names and ONLY', () => {
      const p = plan('DELETE FROM ONLY "My Schema"."T 1" AS x WHERE x.id = 3');
      expect(p.before).to.deep.equal({ target: 'ONLY "My Schema"."T 1"', alias: 'x', where: 'x.id = 3' });
    });

    it('captures a WHERE-less DELETE as a whole-table capture', () => {
      const p = plan('DELETE FROM t');
      expect(p.before).to.deep.equal({ target: 't', alias: undefined, where: undefined });
    });

    it('allows a subquery inside WHERE', () => {
      const p = plan('DELETE FROM t WHERE id IN (SELECT id FROM s WHERE x = 1)');
      expect(p.before?.where).to.equal('id IN (SELECT id FROM s WHERE x = 1)');
    });

    it('does not mistake SET/WHERE for an alias', () => {
      expect(plan('UPDATE t SET a = 1').before?.alias).to.equal(undefined);
      expect(plan('DELETE FROM t WHERE a = 1').before?.alias).to.equal(undefined);
    });

    it('skips (and says so) for UPDATE ... FROM', () => {
      const p = plan('UPDATE t SET a = s.a FROM s WHERE t.id = s.id');
      expect(p.before).to.equal(undefined);
      expect(p.beforeSkippedReason).to.match(/FROM/);
      expect(p.notes.join(' ')).to.match(/Before-image skipped/);
    });

    it('skips for DELETE ... USING', () => {
      const p = plan('DELETE FROM t USING s WHERE t.id = s.id');
      expect(p.before).to.equal(undefined);
      expect(p.beforeSkippedReason).to.match(/USING/);
    });

    it('does not treat a FROM inside a scalar subquery in SET as a join', () => {
      const p = plan('UPDATE t SET a = (SELECT max(x) FROM s) WHERE id = 1');
      expect(p.before?.where).to.equal('id = 1');
    });

    it('skips for WHERE CURRENT OF', () => {
      expect(plan('DELETE FROM t WHERE CURRENT OF c').beforeSkippedReason).to.match(/cursor/);
    });

    it('skips for a parenthesised target', () => {
      expect(plan('UPDATE (t) SET a = 1').before).to.equal(undefined);
    });
  });

  describe('gating helpers', () => {
    it('cellHasDryRunnableWrite only for single supported writes', () => {
      expect(cellHasDryRunnableWrite('UPDATE t SET a = 1')).to.equal(true);
      expect(cellHasDryRunnableWrite('SELECT 1')).to.equal(false);
      expect(cellHasDryRunnableWrite('UPDATE t SET a = 1; UPDATE t SET a = 2')).to.equal(false);
      expect(cellHasDryRunnableWrite('VACUUM')).to.equal(false);
      expect(cellHasDryRunnableWrite('')).to.equal(false);
    });

    it('looksLikeWrite', () => {
      expect(looksLikeWrite('DELETE FROM t')).to.equal(true);
      expect(looksLikeWrite('WITH d AS (SELECT 1) UPDATE t SET a = 1')).to.equal(true);
      expect(looksLikeWrite('SELECT * FROM t')).to.equal(false);
    });
  });
});
