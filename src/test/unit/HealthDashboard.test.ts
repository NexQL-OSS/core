import { expect } from 'chai';
import {
  buildHealthViewModel,
  formatBytes,
  formatDuration,
  formatInterval,
  levelForCacheHit,
  levelForConnections,
  levelForDeadPct,
  levelForLongestTxn,
  levelForXidAge,
  HealthRaw,
} from '../../features/health/healthModel';
import { escapeHtml, renderHealthHtml, renderHealthMessageHtml } from '../../features/health/healthHtml';
import { collectHealth } from '../../providers/DatabaseHealthPanel';

const healthySummary = {
  db_name: 'shop',
  db_size_bytes: '5368709120',
  connections_total: 12,
  connections_active: 2,
  idle_in_transaction: 0,
  max_connections: 100,
  cache_hit_pct: '99.62',
  xid_age: '12000000',
  xid_pct: '0.56',
  longest_xact_seconds: null,
  longest_pid: null,
};

function raw(over: Partial<HealthRaw> = {}): HealthRaw {
  return {
    database: 'shop',
    generatedAt: new Date('2026-01-01T00:00:00Z'),
    summary: healthySummary,
    bloat: [],
    unusedIndexes: [],
    fkNoIndex: [],
    locks: [],
    statements: { installed: true, rows: [] },
    errors: {},
    ...over,
  };
}

describe('Health dashboard model', () => {
  describe('formatters', () => {
    it('formats bytes', () => {
      expect(formatBytes(undefined)).to.equal('n/a');
      expect(formatBytes(512)).to.equal('512 B');
      expect(formatBytes(5368709120)).to.equal('5.00 GB');
    });
    it('formats durations', () => {
      expect(formatDuration(undefined)).to.equal('none');
      expect(formatDuration(42)).to.equal('42s');
      expect(formatDuration(125)).to.equal('2m 5s');
      expect(formatDuration(7500)).to.equal('2h 5m');
      expect(formatDuration(200000)).to.equal('2d 7h');
    });
    it('formats intervals from node-pg objects and strings', () => {
      expect(formatInterval({ hours: 1, minutes: 5 })).to.equal('1h 5m');
      expect(formatInterval({ seconds: 3 })).to.equal('3s');
      expect(formatInterval('00:00:03.123456')).to.equal('00:00:03');
      expect(formatInterval(null)).to.equal('');
    });
  });

  describe('thresholds', () => {
    it('cache hit', () => {
      expect(levelForCacheHit(99.5)).to.equal('ok');
      expect(levelForCacheHit(97)).to.equal('watch');
      expect(levelForCacheHit(90)).to.equal('act');
      expect(levelForCacheHit(undefined)).to.equal('unknown');
    });
    it('xid age', () => {
      expect(levelForXidAge(10)).to.equal('ok');
      expect(levelForXidAge(60)).to.equal('watch');
      expect(levelForXidAge(80)).to.equal('act');
    });
    it('connections', () => {
      expect(levelForConnections(50)).to.equal('ok');
      expect(levelForConnections(80)).to.equal('watch');
      expect(levelForConnections(95)).to.equal('act');
    });
    it('longest transaction', () => {
      expect(levelForLongestTxn(undefined)).to.equal('ok');
      expect(levelForLongestTxn(60)).to.equal('ok');
      expect(levelForLongestTxn(600)).to.equal('watch');
      expect(levelForLongestTxn(7200)).to.equal('act');
    });
    it('dead rows', () => {
      expect(levelForDeadPct(5)).to.equal('ok');
      expect(levelForDeadPct(30)).to.equal('watch');
      expect(levelForDeadPct(60)).to.equal('act');
    });
  });

  describe('buildHealthViewModel', () => {
    it('reports a clean database as healthy with no findings', () => {
      const vm = buildHealthViewModel(raw());
      expect(vm.overall).to.equal('ok');
      expect(vm.findings).to.have.length(0);
      expect(vm.tiles.map(t => t.key)).to.deep.equal(['cache', 'xid', 'connections', 'txn', 'size']);
      expect(vm.tiles[0].value).to.equal('99.6%');
      expect(vm.tiles[2].value).to.equal('12 / 100');
      expect(vm.tiles[3].sub).to.equal('No open transactions');
    });

    it('flags a low cache hit ratio and a stale transaction', () => {
      const vm = buildHealthViewModel(
        raw({ summary: { ...healthySummary, cache_hit_pct: '92.1', longest_xact_seconds: 7300, longest_pid: 4242 } }),
      );
      expect(vm.overall).to.equal('act');
      expect(vm.findings.map(f => f.section)).to.deep.equal(['summary', 'summary']);
      expect(vm.tiles[3].sub).to.equal('pid 4242');
      expect(vm.findings.every(f => f.level === 'act')).to.equal(true);
    });

    it('ignores high dead percentages on tiny tables', () => {
      const vm = buildHealthViewModel(
        raw({ bloat: [{ schema: 'public', table_name: 'tiny', live_rows: 1, dead_rows: 5, dead_pct: '83.3', total_size: '8 kB' }] }),
      );
      const bloat = vm.sections.find(s => s.key === 'bloat')!;
      expect(bloat.level).to.equal('ok');
      expect(vm.findings).to.have.length(0);
    });

    it('turns a bloated table into a finding with a vacuum command', () => {
      const vm = buildHealthViewModel(
        raw({ bloat: [{ schema: 'public', table_name: 'orders', live_rows: 40000, dead_rows: 60000, dead_pct: '60.0', total_size: '1 GB' }] }),
      );
      const bloat = vm.sections.find(s => s.key === 'bloat')!;
      expect(bloat.level).to.equal('act');
      expect(bloat.items[0].copy).to.equal('VACUUM (ANALYZE) public.orders;');
      expect(vm.findings[0].section).to.equal('bloat');
      expect(vm.findings[0].action).to.contain('public.orders');
    });

    it('sums unused index sizes and offers a drop command', () => {
      const vm = buildHealthViewModel(
        raw({
          unusedIndexes: [
            { schema: 'public', table_name: 'a', index_name: 'a_idx', index_size: '2 MB', index_bytes: '2097152' },
            { schema: 'public', table_name: 'b', index_name: 'b_idx', index_size: '1 MB', index_bytes: '1048576' },
          ],
        }),
      );
      const sec = vm.sections.find(s => s.key === 'unusedIndexes')!;
      expect(sec.headline).to.equal('2 indexes, 3.00 MB reclaimable');
      expect(sec.items[0].pct).to.equal(100);
      expect(sec.items[0].copy).to.equal('DROP INDEX CONCURRENTLY public.a_idx;');
    });

    it('caps shown rows and reports how many more exist', () => {
      const rows = Array.from({ length: 12 }, (_, i) => ({
        constraint_name: `fk${i}`, table_name: `t${i}`, columns: 'x', references_table: 'p', table_size: '1 MB', suggested_index: `CREATE INDEX ON t${i} (x)`,
      }));
      const sec = buildHealthViewModel(raw({ fkNoIndex: rows })).sections.find(s => s.key === 'fkNoIndex')!;
      expect(sec.items).to.have.length(8);
      expect(sec.more).to.equal(4);
      expect(sec.items[0].copy).to.equal('CREATE INDEX ON t0 (x);');
    });

    it('treats blocking locks as act-now and keeps both sides', () => {
      const vm = buildHealthViewModel(
        raw({
          locks: [{ blocked_pid: 1, blocked_for: { seconds: 30 }, waiting_on: 'Lock:relation', blocked_query: 'UPDATE t', blocking_pid: 2, blocking_state: 'idle in transaction', blocking_txn_age: { minutes: 10 }, blocking_query: 'SELECT 1' }],
        }),
      );
      expect(vm.overall).to.equal('act');
      expect(vm.blocked[0].blockedFor).to.equal('30s');
      expect(vm.blocked[0].blockingAge).to.equal('10m 0s');
      expect(vm.findings[0].title).to.equal('1 session blocked by a lock');
    });

    it('explains a missing pg_stat_statements instead of failing', () => {
      const sec = buildHealthViewModel(raw({ statements: { installed: false, rows: [] } })).sections.find(s => s.key === 'statements')!;
      expect(sec.level).to.equal('unknown');
      expect(sec.empty).to.contain('shared_preload_libraries');
    });

    it('marks a failed section unknown without hiding the others', () => {
      const vm = buildHealthViewModel(raw({ bloat: undefined, errors: { bloat: 'permission denied' } }));
      const bloat = vm.sections.find(s => s.key === 'bloat')!;
      expect(bloat.error).to.equal('permission denied');
      expect(bloat.level).to.equal('unknown');
      expect(vm.overall).to.equal('ok');
    });

    it('shows n/a tiles when the summary query failed', () => {
      const vm = buildHealthViewModel(raw({ summary: null, errors: { summary: 'boom' } }));
      expect(vm.tiles.every(t => t.level === 'unknown' && t.value === 'n/a')).to.equal(true);
    });

    it('orders findings most severe first', () => {
      const vm = buildHealthViewModel(
        raw({
          fkNoIndex: [{ constraint_name: 'fk', table_name: 't', columns: 'x', references_table: 'p', table_size: '1 MB' }],
          locks: [{ blocked_pid: 1, blocking_pid: 2 }],
        }),
      );
      expect(vm.findings.map(f => f.level)).to.deep.equal(['act', 'watch']);
    });
  });
});

describe('Health dashboard HTML', () => {
  const opts = { nonce: 'n0nce', cspSource: 'vscode-resource:' };

  it('escapes HTML special characters', () => {
    expect(escapeHtml(`<a href="x">&'`)).to.equal('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  });

  it('never emits raw query text from the database', () => {
    const vm = buildHealthViewModel(
      raw({ statements: { installed: true, rows: [{ query: '<script>alert(1)</script>', calls: 1, total_ms: 5, mean_ms: 5 }] } }),
    );
    const html = renderHealthHtml(vm, opts);
    expect(html).to.not.contain('<script>alert(1)</script>');
    expect(html).to.contain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('sets a nonce-based CSP and includes the actions', () => {
    const html = renderHealthHtml(buildHealthViewModel(raw()), opts);
    expect(html).to.contain("script-src 'nonce-n0nce'");
    expect(html).to.contain('data-action="refresh"');
    expect(html).to.contain('data-action="openNotebook"');
  });

  it('uses words and glyphs, not colour alone, for status', () => {
    const html = renderHealthHtml(buildHealthViewModel(raw({ locks: [{ blocked_pid: 1, blocking_pid: 2 }] })), opts);
    expect(html).to.contain('Act now');
    expect(html).to.contain('✕');
    expect(html).to.contain('Needs attention now');
  });

  it('says so when there is nothing to fix', () => {
    const html = renderHealthHtml(buildHealthViewModel(raw()), opts);
    expect(html).to.contain('No issues found');
  });

  it('opens sections that need action and collapses healthy ones', () => {
    const html = renderHealthHtml(buildHealthViewModel(raw({ locks: [{ blocked_pid: 1, blocking_pid: 2 }] })), opts);
    expect(html).to.match(/<details class="card" id="sec-locks" open>/);
    expect(html).to.match(/<details class="card" id="sec-bloat">/);
  });

  it('renders the message page with a retry button', () => {
    const html = renderHealthMessageHtml('Health', 'oops <b>', { ...opts, retry: true });
    expect(html).to.contain('oops &lt;b&gt;');
    expect(html).to.contain('Try again');
  });
});

describe('collectHealth', () => {
  it('keeps going when one check fails and records the error', async () => {
    const client = {
      query: async (sql: string) => {
        if (sql.includes('pg_stat_user_tables')) {
          throw new Error('permission denied for view pg_stat_user_tables');
        }
        if (sql.includes('pg_extension')) {
          return { rows: [{ installed: false }] };
        }
        if (sql.includes('db_size_bytes')) {
          return { rows: [healthySummary] };
        }
        return { rows: [] };
      },
    };
    const r = await collectHealth(client as any, 'shop');
    expect(r.errors!.bloat).to.contain('permission denied');
    expect(r.summary).to.deep.equal(healthySummary);
    expect(r.statements).to.deep.equal({ installed: false, rows: [] });
    expect(r.locks).to.deep.equal([]);
  });
});
