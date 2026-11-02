import { expect } from 'chai';
import { JSDOM } from 'jsdom';
import * as vscode from 'vscode';
import { dryRunBannerMessage } from '../../renderer/components/DryRunBanner';
import { clearDryRunRequests, consumeDryRunRequest, requestDryRun } from '../../services/dryRun/DryRunRequests';
import { buildDryRunResultPayloads, DRY_RUN_QUERY_PLACEHOLDER } from '../../providers/kernel/DryRunCellRunner';
import { QueryCodeLensProvider } from '../../providers/QueryCodeLensProvider';
import type { DryRunInfo } from '../../common/types';
import type { DryRunResult } from '../../services/dryRun/DryRunService';
import { analyzeDryRun } from '../../services/dryRun/dryRunAnalyzer';

const info = (over: Partial<DryRunInfo> = {}): DryRunInfo => ({
  phase: 'after',
  verb: 'UPDATE',
  affectedCount: 12,
  shownRows: 12,
  capped: false,
  rowCap: 200,
  mode: 'transaction',
  rollbackConfirmed: true,
  notes: [],
  ...over,
});

describe('dry run UI + hand-off', () => {
  describe('banner message', () => {
    it('states nothing was saved and the true count', () => {
      expect(dryRunBannerMessage(info())).to.contain('Dry run: nothing was saved. 12 rows would change.');
      expect(dryRunBannerMessage(info({ affectedCount: 1, shownRows: 1 }))).to.contain('1 row would change.');
    });

    it('mentions the cap on after and before images', () => {
      expect(dryRunBannerMessage(info({ affectedCount: 5000, shownRows: 200, capped: true }))).to.contain('5,000 rows would change');
      expect(dryRunBannerMessage(info({ affectedCount: 5000, shownRows: 200, capped: true }))).to.contain('first 200 rows');
      expect(dryRunBannerMessage(info({ phase: 'before', shownRows: 200, capped: true }))).to.contain('first 200 rows (more match)');
    });

    it('handles DDL / unknown counts', () => {
      expect(dryRunBannerMessage(info({ verb: 'DDL', phase: 'summary', affectedCount: null }))).to.contain('ran and was rolled back');
    });

    it('warns loudly when rollback is unconfirmed', () => {
      expect(dryRunBannerMessage(info({ rollbackConfirmed: false }))).to.contain('WARNING: the rollback could not be confirmed');
    });
  });

  describe('banner DOM', () => {
    it('renders through the shared InlineBanner with accent and notes', () => {
      const dom = new JSDOM('<!DOCTYPE html><body></body>');
      (global as any).document = dom.window.document;
      (global as any).window = dom.window;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createDryRunBanner, DRY_RUN_ACCENT } = require('../../renderer/components/DryRunBanner');
      const el: HTMLElement = createDryRunBanner(info({ notes: ['Before-image skipped: join.'] }));
      expect(el.dataset.dryRunBanner).to.equal('true');
      expect(el.textContent).to.contain('Dry run: nothing was saved. 12 rows would change.');
      expect(el.textContent).to.contain('Before-image skipped: join.');
      expect(el.style.borderLeft).to.contain('4px solid');
      expect(DRY_RUN_ACCENT).to.contain('--vscode-nexql-mode-write');
      expect(DRY_RUN_ACCENT).to.contain('--vscode-editorWarning-foreground');
      expect(el.querySelector('button')).to.equal(null); // not dismissible
    });
  });

  describe('request hand-off', () => {
    afterEach(() => clearDryRunRequests());

    it('is consumed exactly once', () => {
      requestDryRun('cell:1', 1000);
      expect(consumeDryRunRequest('cell:1', 1500)).to.equal(true);
      expect(consumeDryRunRequest('cell:1', 1500)).to.equal(false);
    });

    it('expires', () => {
      requestDryRun('cell:2', 1000);
      expect(consumeDryRunRequest('cell:2', 1000 + 60_000)).to.equal(false);
      expect(consumeDryRunRequest('cell:never')).to.equal(false);
    });
  });

  describe('result payloads', () => {
    const result = (over: Partial<DryRunResult> = {}): DryRunResult => ({
      status: 'rolled-back',
      mode: 'transaction',
      plan: analyzeDryRun('UPDATE t SET a = 1 WHERE id < 3').ok ? (analyzeDryRun('UPDATE t SET a = 1 WHERE id < 3') as any).plan : undefined,
      affectedCount: 2,
      notes: [],
      rollbackConfirmed: true,
      elapsedMs: 40,
      before: { columns: ['id'], rows: [{ id: 1 }, { id: 2 }], columnTypes: { id: 'int4' }, shownRows: 2, totalRows: null, capped: false },
      after: { columns: ['id'], rows: [{ id: 1 }, { id: 2 }], columnTypes: { id: 'int4' }, shownRows: 2, totalRows: 2, capped: false },
      ...over,
    });
    const ctx = { rowCap: 200, executionTimeSec: 0.04, backendPid: 7 };

    it('emits before then after, flagged as dry run, never editable or re-runnable', () => {
      const out = buildDryRunResultPayloads(result(), ctx);
      expect(out.map((o) => o.dryRun?.phase)).to.deep.equal(['before', 'after']);
      for (const o of out) {
        expect(o.tableInfo).to.equal(undefined);
        expect(o.query).to.equal(DRY_RUN_QUERY_PLACEHOLDER);
        expect(o.exportQuery).to.equal(DRY_RUN_QUERY_PLACEHOLDER);
        expect(o.pendingCommit).to.equal(undefined);
        expect(o.transactionState).to.equal(undefined);
        expect(o.dryRun?.rollbackConfirmed).to.equal(true);
      }
      expect(out[1].rowCount).to.equal(2);
    });

    it('emits a single summary output when there are no snapshots (DDL)', () => {
      const out = buildDryRunResultPayloads(result({ before: undefined, after: undefined, affectedCount: null }), ctx);
      expect(out).to.have.length(1);
      expect(out[0].dryRun?.phase).to.equal('summary');
    });

    it('carries the notes', () => {
      const out = buildDryRunResultPayloads(result({ notes: ['Before-image skipped: join'] }), ctx);
      expect(out[0].dryRun?.notes).to.deep.equal(['Before-image skipped: join']);
    });
  });

  describe('CodeLens gating', () => {
    function lensTitles(text: string): string[] {
      const doc = new (vscode as any).TextDocument(text, vscode.Uri.parse('vscode-notebook-cell:/dry/c1'), 'sql');
      const nb = new (vscode as any).NotebookDocument(vscode.Uri.file('/w/n.pgsql'), { connectionId: 'c', databaseName: 'd' });
      const cell = new (vscode as any).NotebookCell(doc, 0, (vscode as any).NotebookCellKind.Code);
      nb.getCells = () => [cell];
      (vscode.workspace as any).notebookDocuments = [nb];
      const lenses = new QueryCodeLensProvider().provideCodeLenses(doc, {} as any);
      return lenses.map((l) => l.command?.command ?? '');
    }
    afterEach(() => {
      (vscode.workspace as any).notebookDocuments = [];
    });

    it('offers dry run for DML/DDL but not for SELECT, multi-statement or refused statements', () => {
      expect(lensTitles('UPDATE t SET a = 1 WHERE id = 2')).to.include('postgres-explorer.dryRunCell');
      expect(lensTitles('ALTER TABLE t ADD COLUMN c int')).to.include('postgres-explorer.dryRunCell');
      expect(lensTitles('SELECT 1')).to.not.include('postgres-explorer.dryRunCell');
      expect(lensTitles('UPDATE t SET a = 1; UPDATE t SET a = 2')).to.not.include('postgres-explorer.dryRunCell');
      expect(lensTitles('VACUUM t')).to.not.include('postgres-explorer.dryRunCell');
      expect(lensTitles('CREATE INDEX CONCURRENTLY i ON t(a)')).to.not.include('postgres-explorer.dryRunCell');
    });
  });
});
