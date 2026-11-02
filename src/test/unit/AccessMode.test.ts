import { expect } from 'chai';
import * as vscode from 'vscode';
import {
  accessModeText,
  getAccessMode,
  isProductionWrite,
  requiresWriteConfirmation,
  toggleAccessMode,
  ACCESS_MODE_LABELS,
} from '../../common/accessMode';
import { toggleAccessModeFor, ToggleDeps } from '../../commands/accessMode';
import { formatConnectionEnvBadge } from '../../providers/tree/treeIconTheme';
import { DatabaseTreeItem } from '../../providers/DatabaseTreeProvider';

function makeDeps(connections: any[], confirm = true) {
  const calls = { saved: undefined as any[] | undefined, closed: [] as string[], refreshed: 0, confirmed: 0 };
  const deps: ToggleDeps = {
    getConnections: () => connections,
    saveConnections: async (c) => { calls.saved = c; },
    closeConnections: async (id) => { calls.closed.push(id); },
    refreshTree: () => { calls.refreshed++; },
    confirmWrite: async () => { calls.confirmed++; return confirm; },
    notify: () => undefined,
  };
  return { deps, calls };
}

describe('accessMode helper', () => {
  it('maps readOnlyMode to read/write', () => {
    expect(getAccessMode({ readOnlyMode: true })).to.equal('read');
    expect(getAccessMode({ readOnlyMode: false })).to.equal('write');
    expect(getAccessMode({})).to.equal('write');
    expect(getAccessMode(undefined)).to.equal('write');
  });

  it('uses MCP vocabulary and codicons', () => {
    expect(ACCESS_MODE_LABELS.read).to.equal('Read-only');
    expect(accessModeText('read')).to.equal('$(lock) Read-only');
    expect(accessModeText('write')).to.equal('$(edit) Read/write');
  });

  it('flags production writes and confirmation', () => {
    expect(isProductionWrite({ environment: 'production' })).to.equal(true);
    expect(isProductionWrite({ environment: 'production', readOnlyMode: true })).to.equal(false);
    expect(isProductionWrite({ environment: 'staging' })).to.equal(false);
    expect(requiresWriteConfirmation({ environment: 'production' }, 'write')).to.equal(true);
    expect(requiresWriteConfirmation({ environment: 'production' }, 'read')).to.equal(false);
    expect(requiresWriteConfirmation({ environment: 'development' }, 'write')).to.equal(false);
    expect(toggleAccessMode('read')).to.equal('write');
  });
});

describe('tree access mode display', () => {
  it('includes mode next to environment in badge', () => {
    expect(formatConnectionEnvBadge('production', true)).to.equal('🔴 PROD · Read-only');
    expect(formatConnectionEnvBadge('staging', false)).to.equal('🟡 STAGING · Read/write');
    expect(formatConnectionEnvBadge(undefined, undefined)).to.equal('Read/write');
  });

  it('tints production read/write connection icon', () => {
    const args: any[] = ['p', vscode.TreeItemCollapsibleState.None, 'connection', 'c1',
      ...Array(8).fill(undefined), false, ...Array(4).fill(undefined), 'production', false];
    const item = new (DatabaseTreeItem as any)(...args);
    const icon: any = item.iconPath;
    expect(icon.id).to.equal('edit');
    expect(icon.color.id).to.equal('nexql.mode.write');
    expect(String(item.tooltip)).to.contain('Access mode: Read/write');
    expect(item.description).to.equal('🔴 PROD · Read/write');
  });
});

describe('toggleAccessModeFor', () => {
  it('switches dev connection to read-only without confirmation, recycles pools, refreshes', async () => {
    const { deps, calls } = makeDeps([{ id: 'a', name: 'A', environment: 'development' }]);
    const r = await toggleAccessModeFor('a', deps);
    expect(r).to.deep.equal({ changed: true, mode: 'read' });
    expect(calls.saved![0].readOnlyMode).to.equal(true);
    expect(calls.closed).to.deep.equal(['a']);
    expect(calls.refreshed).to.equal(1);
    expect(calls.confirmed).to.equal(0);
  });

  it('asks confirmation for production to read/write and honors cancel', async () => {
    const conns = [{ id: 'p', environment: 'production', readOnlyMode: true }];
    const cancelled = makeDeps(conns, false);
    expect(await toggleAccessModeFor('p', cancelled.deps)).to.deep.equal({ changed: false, reason: 'cancelled' });
    expect(cancelled.calls.saved).to.equal(undefined);
    expect(cancelled.calls.closed).to.deep.equal([]);

    const ok = makeDeps(conns, true);
    expect(await toggleAccessModeFor('p', ok.deps)).to.deep.equal({ changed: true, mode: 'write' });
    expect(ok.calls.confirmed).to.equal(1);
    expect(ok.calls.saved![0].readOnlyMode).to.equal(undefined);
    expect(conns[0].readOnlyMode).to.equal(true); // input not mutated
  });

  it('does not confirm production to read-only', async () => {
    const { deps, calls } = makeDeps([{ id: 'p', environment: 'production' }]);
    expect((await toggleAccessModeFor('p', deps)).changed).to.equal(true);
    expect(calls.confirmed).to.equal(0);
  });

  it('reports unknown connection', async () => {
    const { deps } = makeDeps([]);
    expect(await toggleAccessModeFor('x', deps)).to.deep.equal({ changed: false, reason: 'not-found' });
  });
});
