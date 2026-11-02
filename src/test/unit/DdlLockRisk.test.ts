import { expect } from 'chai';
import { analyzeDdlLockRisk, absoluteRange } from '../../services/ddlLockRisk';

const rules = (sql: string) => analyzeDdlLockRisk(sql).map(f => f.rule);

describe('ddlLockRisk', () => {
  describe('CREATE INDEX', () => {
    it('warns and suggests CONCURRENTLY', () => {
      const [f] = analyzeDdlLockRisk('CREATE INDEX idx ON t (a)');
      expect(f.rule).to.equal('create-index-not-concurrent');
      expect(f.saferSql).to.equal('CREATE INDEX CONCURRENTLY idx ON t (a)');
      expect(f.message).to.match(/transaction block/);
    });
    it('handles UNIQUE', () => {
      const [f] = analyzeDdlLockRisk('create unique index i on t(a);');
      expect(f.saferSql).to.equal('create unique index CONCURRENTLY i on t(a)');
    });
    it('does not warn when CONCURRENTLY present', () => {
      expect(rules('CREATE INDEX CONCURRENTLY i ON t (a)')).to.deep.equal([]);
      expect(rules('create unique index concurrently i on t (a)')).to.deep.equal([]);
    });
  });

  describe('REINDEX', () => {
    it('warns without CONCURRENTLY', () => {
      const [f] = analyzeDdlLockRisk('REINDEX TABLE t');
      expect(f.rule).to.equal('reindex-not-concurrent');
      expect(f.saferSql).to.equal('REINDEX TABLE CONCURRENTLY t');
    });
    it('handles option list', () => {
      const [f] = analyzeDdlLockRisk('REINDEX (VERBOSE) INDEX i');
      expect(f.saferSql).to.equal('REINDEX (VERBOSE) INDEX CONCURRENTLY i');
    });
    it('does not warn with CONCURRENTLY', () => {
      expect(rules('REINDEX INDEX CONCURRENTLY i')).to.deep.equal([]);
    });
  });

  describe('ADD CONSTRAINT', () => {
    it('flags FOREIGN KEY and offers NOT VALID + VALIDATE', () => {
      const [f] = analyzeDdlLockRisk('ALTER TABLE s.orders ADD CONSTRAINT fk FOREIGN KEY (cid) REFERENCES c (id);');
      expect(f.rule).to.equal('add-fk-not-valid');
      expect(f.saferSql).to.equal(
        'ALTER TABLE s.orders ADD CONSTRAINT fk FOREIGN KEY (cid) REFERENCES c (id) NOT VALID;\n' +
        'ALTER TABLE s.orders VALIDATE CONSTRAINT fk');
    });
    it('flags CHECK', () => {
      const [f] = analyzeDdlLockRisk('ALTER TABLE t ADD CONSTRAINT ck CHECK (a > 0)');
      expect(f.rule).to.equal('add-check-not-valid');
      expect(f.saferSql).to.contain('CHECK (a > 0) NOT VALID');
    });
    it('does not warn with NOT VALID', () => {
      expect(rules('ALTER TABLE t ADD CONSTRAINT ck CHECK (a > 0) NOT VALID')).to.deep.equal([]);
    });
    it('does not treat IS NOT NULL inside CHECK as NOT VALID', () => {
      expect(rules('ALTER TABLE t ADD CONSTRAINT ck CHECK (a IS NOT NULL)')).to.deep.equal(['add-check-not-valid']);
    });
    it('does not warn for UNIQUE/PRIMARY KEY', () => {
      expect(rules('ALTER TABLE t ADD CONSTRAINT u UNIQUE (a)')).to.deep.equal([]);
    });
    it('omits quick fix for unnamed constraints', () => {
      const [f] = analyzeDdlLockRisk('ALTER TABLE t ADD CHECK (a > 0)');
      expect(f.rule).to.equal('add-check-not-valid');
      expect(f.saferSql).to.equal(undefined);
    });
  });

  describe('ALTER COLUMN', () => {
    it('flags TYPE and SET DATA TYPE', () => {
      expect(rules('ALTER TABLE t ALTER COLUMN a TYPE bigint')).to.deep.equal(['alter-column-type']);
      expect(rules('ALTER TABLE t ALTER a SET DATA TYPE text')).to.deep.equal(['alter-column-type']);
    });
    it('flags SET NOT NULL with CHECK suggestion', () => {
      const [f] = analyzeDdlLockRisk('ALTER TABLE t ALTER COLUMN a SET NOT NULL');
      expect(f.rule).to.equal('set-not-null');
      expect(f.message).to.contain('CHECK (a IS NOT NULL) NOT VALID');
    });
    it('ignores SET DEFAULT and DROP NOT NULL', () => {
      expect(rules('ALTER TABLE t ALTER COLUMN a SET DEFAULT 1')).to.deep.equal([]);
      expect(rules('ALTER TABLE t ALTER COLUMN a DROP NOT NULL')).to.deep.equal([]);
    });
    it('handles multiple comma-separated actions', () => {
      expect(rules('ALTER TABLE t ALTER a TYPE int, ALTER b SET NOT NULL')).to.deep.equal(['alter-column-type', 'set-not-null']);
    });
  });

  describe('ADD COLUMN DEFAULT', () => {
    it('flags volatile defaults', () => {
      expect(rules('ALTER TABLE t ADD COLUMN id uuid DEFAULT gen_random_uuid()')).to.deep.equal(['add-column-volatile-default']);
      expect(rules('ALTER TABLE t ADD COLUMN r float DEFAULT random() NOT NULL')).to.deep.equal(['add-column-volatile-default']);
      expect(rules('ALTER TABLE t ADD COLUMN r float DEFAULT (random() * 10)')).to.deep.equal(['add-column-volatile-default']);
    });
    it('reports now() as info only', () => {
      const [f] = analyzeDdlLockRisk('ALTER TABLE t ADD COLUMN c timestamptz DEFAULT now()');
      expect(f.severity).to.equal('info');
    });
    it('ignores constant defaults', () => {
      expect(rules("ALTER TABLE t ADD COLUMN c int DEFAULT 0 NOT NULL")).to.deep.equal([]);
      expect(rules("ALTER TABLE t ADD COLUMN c text DEFAULT 'random()'")).to.deep.equal([]);
    });
    it('does not read a function from a later constraint', () => {
      expect(rules('ALTER TABLE t ADD COLUMN c int DEFAULT 0 CHECK (c < random())')).to.deep.equal([]);
    });
  });

  describe('misc heavy statements', () => {
    it('VACUUM FULL, both syntaxes', () => {
      expect(rules('VACUUM FULL t')).to.deep.equal(['vacuum-full']);
      expect(rules('VACUUM (FULL, ANALYZE) t')).to.deep.equal(['vacuum-full']);
      expect(rules('VACUUM ANALYZE t')).to.deep.equal([]);
      expect(rules('VACUUM (FULL false) t')).to.deep.equal([]);
    });
    it('CLUSTER', () => {
      expect(rules('CLUSTER t USING i')).to.deep.equal(['cluster']);
      expect(rules('ALTER TABLE t CLUSTER ON i')).to.deep.equal([]);
    });
    it('LOCK TABLE', () => {
      expect(rules('LOCK TABLE t IN ACCESS EXCLUSIVE MODE')).to.deep.equal(['lock-table']);
    });
    it('danger rules', () => {
      expect(analyzeDdlLockRisk('DROP TABLE t')[0]).to.include({ rule: 'drop-table', severity: 'danger' });
      expect(analyzeDdlLockRisk('TRUNCATE t')[0]).to.include({ rule: 'truncate', severity: 'danger' });
      expect(analyzeDdlLockRisk('DROP SCHEMA s CASCADE')[0]).to.include({ rule: 'drop-schema-cascade', severity: 'danger' });
      expect(rules('DROP SCHEMA s')).to.deep.equal([]);
      expect(rules('DROP INDEX i')).to.deep.equal([]);
    });
    it('DELETE/UPDATE without WHERE', () => {
      expect(rules('DELETE FROM t')).to.deep.equal(['dml-without-where']);
      expect(rules('UPDATE t SET a = 1')).to.deep.equal(['dml-without-where']);
      expect(rules('DELETE FROM t WHERE a = 1')).to.deep.equal([]);
      expect(rules('UPDATE t SET a = (SELECT 1 WHERE true)')).to.deep.equal(['dml-without-where']);
      expect(rules('WITH x AS (SELECT 1) DELETE FROM t')).to.deep.equal(['dml-without-where']);
    });
  });

  describe('false-positive guards', () => {
    it('ignores comments', () => {
      expect(rules('-- DROP TABLE t\nSELECT 1')).to.deep.equal([]);
      expect(rules('/* TRUNCATE t; */ SELECT 1')).to.deep.equal([]);
      expect(rules('/* a /* nested */ DROP TABLE t */ SELECT 1')).to.deep.equal([]);
    });
    it('ignores string literals and quoted identifiers', () => {
      expect(rules("SELECT 'DROP TABLE t; TRUNCATE x'")).to.deep.equal([]);
      expect(rules("SELECT E'it\\'s; DROP TABLE t'")).to.deep.equal([]);
      expect(rules('SELECT "DELETE FROM" FROM t')).to.deep.equal([]);
      expect(rules("INSERT INTO t VALUES ('it''s; DROP TABLE x')")).to.deep.equal([]);
    });
    it('ignores dollar-quoted bodies', () => {
      expect(rules('SELECT $$ DROP TABLE t; $$')).to.deep.equal([]);
      expect(rules('SELECT $fn$ TRUNCATE t; $$ still inside $fn$')).to.deep.equal([]);
      expect(rules('DO $$ BEGIN DELETE FROM t; END $$')).to.deep.equal([]);
    });
    it('does not match keywords as substrings of identifiers', () => {
      expect(rules('SELECT * FROM drop_table_log')).to.deep.equal([]);
      expect(rules('SELECT truncate_me FROM t')).to.deep.equal([]);
      expect(rules('SELECT lock_id FROM t')).to.deep.equal([]);
    });
    it('does not treat $1 as dollar quoting', () => {
      expect(rules('SELECT $1; DROP TABLE t')).to.deep.equal(['drop-table']);
    });
    it('handles leading comments before a statement', () => {
      expect(rules('-- note\n  /* x */ DROP TABLE t')).to.deep.equal(['drop-table']);
    });
  });

  describe('multi-statement offsets', () => {
    const sql = "SELECT 1;\n-- c\nCREATE INDEX i ON t (a);\nSELECT ';';\nTRUNCATE t;";
    it('reports statement-relative and absolute ranges', () => {
      const fs = analyzeDdlLockRisk(sql);
      expect(fs.map(f => f.rule)).to.deep.equal(['create-index-not-concurrent', 'truncate']);
      const [idx, trunc] = fs;
      expect(idx.statementIndex).to.equal(1);
      expect(idx.range).to.deep.equal({ start: 0, end: 'CREATE INDEX'.length });
      expect(sql.slice(absoluteRange(idx).start, absoluteRange(idx).end)).to.equal('CREATE INDEX');
      expect(trunc.statementIndex).to.equal(3);
      expect(sql.slice(absoluteRange(trunc).start, absoluteRange(trunc).end)).to.equal('TRUNCATE');
      expect(sql.slice(idx.statementRange.start, idx.statementRange.end)).to.equal('CREATE INDEX i ON t (a)');
    });
    it('applies saferSql over statementRange', () => {
      const [idx] = analyzeDdlLockRisk(sql);
      const fixed = sql.slice(0, idx.statementRange.start) + idx.saferSql + sql.slice(idx.statementRange.end);
      expect(fixed).to.contain('CREATE INDEX CONCURRENTLY i ON t (a);');
      expect(analyzeDdlLockRisk(fixed).map(f => f.rule)).to.deep.equal(['truncate']);
    });
    it('fix output for FK passes re-analysis cleanly', () => {
      const s = 'ALTER TABLE t ADD CONSTRAINT fk FOREIGN KEY (a) REFERENCES u (id);';
      const [f] = analyzeDdlLockRisk(s);
      const fixed = s.slice(0, f.statementRange.start) + f.saferSql + s.slice(f.statementRange.end);
      expect(analyzeDdlLockRisk(fixed)).to.deep.equal([]);
    });
    it('returns nothing for empty input', () => {
      expect(analyzeDdlLockRisk('')).to.deep.equal([]);
      expect(analyzeDdlLockRisk(' ; ; ')).to.deep.equal([]);
    });
  });
});
