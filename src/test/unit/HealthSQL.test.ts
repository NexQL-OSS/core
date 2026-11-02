import { expect } from 'chai';
import { HealthSQL, quoteLiteral, PG_VERSION_13 } from '../../commands/sql/health';

const allTemplates: Array<[string, string]> = [
  ['overview', HealthSQL.overview()],
  ['tableBloat', HealthSQL.tableBloat()],
  ['unusedIndexes', HealthSQL.unusedIndexes()],
  ['foreignKeysWithoutIndex', HealthSQL.foreignKeysWithoutIndex()],
  ['blockingLocks', HealthSQL.blockingLocks()],
  ['statementsExtensionCheck', HealthSQL.statementsExtensionCheck()],
  ['slowStatements (PG12)', HealthSQL.slowStatements(120_000)],
  ['slowStatements (PG16)', HealthSQL.slowStatements(160_000)],
  ['tableBloat (schema)', HealthSQL.tableBloat({ schema: "we'ird" })],
];

describe('HealthSQL templates', () => {
  describe('every template', () => {
    for (const [name, sql] of allTemplates) {
      it(`${name} is a single read-only statement`, () => {
        const trimmed = sql.trim();
        expect(trimmed).to.match(/^(SELECT|WITH)\b/i);
        // Single statement: only an optional trailing semicolon, ignoring string literals.
        const withoutStrings = trimmed.replace(/'(?:[^']|'')*'/g, "''");
        const body = withoutStrings.replace(/;\s*$/, '');
        expect(body).to.not.include(';');
        expect(withoutStrings).to.not.match(
          /\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|DROP\s|ALTER\s|TRUNCATE\s|GRANT\s|REVOKE\s|VACUUM\s|REINDEX\s)/i
        );
        expect(withoutStrings).to.not.match(/\bFOR\s+(UPDATE|SHARE)\b/i);
      });
    }
  });

  describe('slowStatements version branching', () => {
    it('uses *_exec_time columns on PG 13+', () => {
      for (const v of [PG_VERSION_13, 140_000, 170_000]) {
        const sql = HealthSQL.slowStatements(v);
        expect(sql).to.include('total_exec_time');
        expect(sql).to.include('mean_exec_time');
        expect(sql).to.not.match(/\btotal_time\b/);
        expect(sql).to.not.match(/\bmean_time\b/);
      }
    });

    it('uses total_time/mean_time on PG 12 and older', () => {
      for (const v of [120_000, 129_999]) {
        const sql = HealthSQL.slowStatements(v);
        expect(sql).to.match(/\btotal_time\b/);
        expect(sql).to.match(/\bmean_time\b/);
        expect(sql).to.not.include('_exec_time');
      }
    });

    it('falls back to the legacy columns when the version is unknown (0)', () => {
      expect(HealthSQL.slowStatements(0)).to.match(/\btotal_time\b/);
    });
  });

  describe('identifier and literal quoting', () => {
    it('quoteLiteral doubles single quotes', () => {
      expect(quoteLiteral("o'brien")).to.equal("'o''brien'");
      expect(quoteLiteral('plain')).to.equal("'plain'");
    });

    it('scopes to an escaped schema literal instead of the system-schema filter', () => {
      const sql = HealthSQL.unusedIndexes({ schema: "we'ird" });
      expect(sql).to.include("s.schemaname = 'we''ird'");
      expect(sql).to.not.include('pg_toast');
    });

    it('excludes system schemas by default', () => {
      expect(HealthSQL.tableBloat()).to.include("NOT IN ('pg_catalog', 'information_schema', 'pg_toast')");
    });

    it('quotes column names in the suggested index DDL', () => {
      const sql = HealthSQL.foreignKeysWithoutIndex();
      expect(sql).to.include('quote_ident(a.attname)');
      expect(sql).to.include("'CREATE INDEX ON ' || c.conrelid::regclass");
    });
  });

  describe('check semantics', () => {
    it('unused indexes excludes primary, unique, and constraint-backing indexes', () => {
      const sql = HealthSQL.unusedIndexes();
      expect(sql).to.include('idx_scan = 0');
      expect(sql).to.include('NOT i.indisunique');
      expect(sql).to.include('NOT i.indisprimary');
      expect(sql).to.include('c.conindid = s.indexrelid');
    });

    it('blocking locks uses pg_blocking_pids', () => {
      expect(HealthSQL.blockingLocks()).to.include('pg_blocking_pids(');
    });

    it('statements extension check reports a friendly message when missing', () => {
      const sql = HealthSQL.statementsExtensionCheck();
      expect(sql).to.include("pg_extension");
      expect(sql).to.include('CREATE EXTENSION pg_stat_statements');
    });
  });
});
