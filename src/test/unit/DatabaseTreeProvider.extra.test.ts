import { expect } from 'chai';
import * as sinon from 'sinon';
import * as vscode from 'vscode';

import { DatabaseTreeItem, DatabaseTreeProvider } from '../../providers/DatabaseTreeProvider';
import { ConnectionManager } from '../../services/ConnectionManager';
import { PlatformConnectionService } from '../../services/PlatformConnectionService';
import * as logger from '../../common/logger';
import { NotebookIndexService } from '../../services/NotebookIndexService';
import { QueryHistoryService } from '../../services/QueryHistoryService';
import { SavedQueriesService } from '../../features/savedQueries/SavedQueriesService';

/**
 * The provider probes the server version and platform on every expand.
 * Answer `SHOW server_version_num` here so each test's onCall(n) stubs stay
 * aligned with the catalog queries it is actually asserting on.
 */
function answerVersionProbe(client: { query: sinon.SinonStub }): void {
  const catalog = client.query;
  (client as any).query = (sql: string, ...rest: unknown[]) =>
    /SHOW\s+server_version_num/i.test(String(sql))
      ? Promise.resolve({ rows: [{ server_version_num: '160000' }] })
      : catalog(sql, ...rest);
}

describe('DatabaseTreeProvider additional coverage', () => {
  let sandbox: sinon.SinonSandbox;
  let contextStub: any;
  let configGetStub: sinon.SinonStub;
  let connectionManagerStub: any;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    contextStub = {
      subscriptions: [],
      extensionUri: { fsPath: '/test/path' },
      globalState: {
        get: sandbox.stub().callsFake((_key: string, defaultValue: any) => defaultValue),
        update: sandbox.stub().resolves(),
      },
    };

    configGetStub = sandbox.stub().returns([]);
    sandbox.stub(vscode.workspace, 'getConfiguration').returns({
      get: configGetStub,
    } as any);

    connectionManagerStub = {
      getPooledClient: sandbox.stub(),
    };
    connectionManagerStub.getPooledClient.callsFake(async () => undefined);
    sandbox.stub(PlatformConnectionService.prototype, 'probeIfNeeded').resolves({} as any);
    sandbox.stub(PlatformConnectionService.prototype, 'getProfile').returns(undefined);
    sandbox.stub(ConnectionManager, 'getInstance').returns(connectionManagerStub);

    sandbox.stub(vscode.window, 'showInformationMessage').resolves(undefined);
    sandbox.stub(vscode.window, 'showWarningMessage').resolves(undefined);
    sandbox.stub(vscode.window, 'showErrorMessage').resolves(undefined);
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('groups connections at the root and expands grouped connections', async () => {
    configGetStub.returns([
      { id: 'c1', name: 'Primary', host: 'localhost', port: 5432, username: 'postgres' },
      { id: 'c2', name: 'Analytics', host: 'localhost', port: 5433, username: 'postgres', group: 'TeamA' },
      { id: 'c3', name: 'Reporting', host: 'localhost', port: 5434, username: 'postgres', group: 'TeamA' },
    ]);

    const provider = new DatabaseTreeProvider(contextStub);
    const rootChildren = await provider.getChildren();

    expect(rootChildren[0].type).to.equal('connection-group');
    expect(rootChildren[0].label).to.equal('TeamA');
    expect(rootChildren[1].type).to.equal('connection');
    expect(rootChildren[1].label).to.equal('Primary');

    const groupedChildren = await provider.getChildren(rootChildren[0]);
    expect(groupedChildren).to.have.lengthOf(2);
    expect(groupedChildren.map(child => child.label)).to.deep.equal(['Analytics', 'Reporting']);
  });

  it('includes favorites and recent groups for a connection', async () => {
    const clock = sandbox.useFakeTimers();
    configGetStub.returns([
      { id: 'c1', name: 'Primary', host: 'localhost', port: 5432, username: 'postgres' },
    ]);
    const provider = new DatabaseTreeProvider(contextStub);
    const item = new DatabaseTreeItem('users', vscode.TreeItemCollapsibleState.None, 'table', 'c1', 'db1', 'public');

    await provider.addToFavorites(item);
    await provider.addToRecent(item);

    const client = {
      query: sandbox.stub(),
      release: sandbox.stub(),
    };
    client.query.onCall(0).resolves({ rows: [{ db_count: '3', roles_count: '1', tablespace_count: '1' }] });
    sandbox.stub(NotebookIndexService, 'getInstance').returns({ getNotebooksForConnection: () => [] } as any);
    sandbox.stub(SavedQueriesService, 'getInstance').returns({ getByConnection: () => [] } as any);
    sandbox.stub(QueryHistoryService, 'getInstance').returns({ getByConnection: () => [] } as any);
    answerVersionProbe(client);
    connectionManagerStub.getPooledClient.resolves(client);

    const connectionItem = new DatabaseTreeItem('Primary', vscode.TreeItemCollapsibleState.Collapsed, 'connection', 'c1');
    const children = await provider.getChildren(connectionItem);
    clock.tick(350);

    expect(children.map(child => child.type)).to.include.members(['favorites-group', 'recent-group', 'databases-group', 'category']);
    expect(provider.isFavorite(item)).to.be.true;
    expect(provider.getFavoriteKeys()).to.have.lengthOf(1);
    expect(provider.getRecentKeys()[0]).to.contain('table:c1:db1:public:users');
    expect((contextStub.globalState.update as sinon.SinonStub).calledTwice).to.be.true;
    clock.restore();
  });

  it('materializes favorite and recent items from their dedicated groups', async () => {
    const clock = sandbox.useFakeTimers();
    configGetStub.returns([
      { id: 'c1', name: 'Primary', host: 'localhost', port: 5432, username: 'postgres' },
    ]);
    const provider = new DatabaseTreeProvider(contextStub);
    const item = new DatabaseTreeItem('users', vscode.TreeItemCollapsibleState.None, 'table', 'c1', 'db1', 'public');

    await provider.addToFavorites(item);
    await provider.addToRecent(item);
    clock.tick(350);

    const favorites = await provider.getChildren(new DatabaseTreeItem('Favorites', vscode.TreeItemCollapsibleState.Collapsed, 'favorites-group', 'c1'));
    const recent = await provider.getChildren(new DatabaseTreeItem('Recent', vscode.TreeItemCollapsibleState.Collapsed, 'recent-group', 'c1'));

    expect(favorites).to.have.lengthOf(1);
    expect(favorites[0].label).to.equal('users');
    expect(favorites[0].isFavorite).to.equal(true);
    expect(recent).to.have.lengthOf(1);
    expect(recent[0].label).to.equal('users');
    clock.restore();
  });

  it('refreshes cache by database and connection scope', () => {
    const clock = sandbox.useFakeTimers();
    const provider = new DatabaseTreeProvider(contextStub);
    const cacheStub = {
      clear: sandbox.stub(),
      invalidateDatabase: sandbox.stub(),
      invalidateConnection: sandbox.stub(),
    };
    (provider as any)._cache = cacheStub;

    provider.refresh(new DatabaseTreeItem('db1', vscode.TreeItemCollapsibleState.Collapsed, 'database', 'c1', 'db1'));
    clock.tick(350);
    expect(cacheStub.invalidateDatabase.calledOnceWithExactly('c1', 'db1')).to.be.true;

    provider.refresh(new DatabaseTreeItem('Primary', vscode.TreeItemCollapsibleState.Collapsed, 'connection', 'c1'));
    clock.tick(350);
    expect(cacheStub.invalidateConnection.calledOnceWithExactly('c1')).to.be.true;
    clock.restore();
  });

  it('marks connections connected and disconnected', () => {
    const provider = new DatabaseTreeProvider(contextStub);
    const autoRefreshService = {
      onConnectionDisconnected: sandbox.stub(),
      onConnectionConnected: sandbox.stub(),
    };
    provider.setAutoRefreshService(autoRefreshService as any);
    const emitter = (provider as any)._onDidChangeTreeData;
    const fireSpy = sandbox.spy(emitter, 'fire');

    provider.markConnectionDisconnected('c1');
    provider.markConnectionConnected('c1');

    expect(autoRefreshService.onConnectionDisconnected.calledOnceWithExactly('c1')).to.be.true;
    expect(autoRefreshService.onConnectionConnected.calledOnceWithExactly('c1')).to.be.true;
    expect(fireSpy.callCount).to.be.at.least(2);
  });

  it('reveals a connection when the tree view is ready', async () => {
    configGetStub.returns([
      { id: 'c1', name: 'Primary', host: 'localhost', port: 5432, username: 'postgres' },
    ]);
    const provider = new DatabaseTreeProvider(contextStub);
    const treeView = {
      reveal: sandbox.stub().resolves(),
    };
    provider.setTreeView(treeView as any);
    const focus = sandbox.stub(vscode.commands, 'executeCommand').resolves(undefined);

    await provider.revealItem('c1', 'db1');

    expect(focus.calledOnceWithExactly('postgresExplorer.focus')).to.be.true;
    expect((treeView.reveal as sinon.SinonStub).calledOnce).to.be.true;
  });

  it('warns when a reveal target cannot be found', async () => {
    configGetStub.returns([]);
    const provider = new DatabaseTreeProvider(contextStub);
    const treeView = {
      reveal: sandbox.stub().resolves(),
    };
    provider.setTreeView(treeView as any);

    await provider.revealItem('missing');

    expect((vscode.window.showWarningMessage as sinon.SinonStub).calledWith('Connection not found')).to.be.true;
  });

  it('returns early when no tree view is configured for reveal', async () => {
    const warn = sandbox.stub(logger, 'debugWarn');
    const provider = new DatabaseTreeProvider(contextStub);

    await provider.revealItem('c1');

    expect(warn.calledOnce).to.be.true;
  });

  it('enumerates database objects using the pooled client', async () => {
    configGetStub.returns([
      { id: 'c1', name: 'Primary', host: 'localhost', port: 5432, username: 'postgres', database: 'appdb' },
    ]);
    const provider = new DatabaseTreeProvider(contextStub);
    const client = {
      query: sandbox.stub(),
      release: sandbox.stub(),
    };
    client.query.onCall(0).resolves({ rows: [{ table_schema: 'public', table_name: 'users', columns: ['id', 'name'] }] });
    client.query.onCall(1).resolves({ rows: [{ table_schema: 'public', table_name: 'user_view', columns: ['id'] }] });
    client.query.onCall(2).resolves({ rows: [{ schema_name: 'public', function_name: 'calc_total' }] });
    client.query.onCall(3).resolves({ rows: [] }); // procedures (PG 11+)
    answerVersionProbe(client);
    connectionManagerStub.getPooledClient.resolves(client);

    const objects = await provider.getDbObjectsForConnection({ id: 'c1', host: 'localhost', port: 5432, username: 'postgres', database: 'appdb', name: 'Primary' });

    expect(objects).to.deep.equal([
      { type: 'table', schema: 'public', name: 'users', columns: ['id', 'name'] },
      { type: 'view', schema: 'public', name: 'user_view', columns: ['id'] },
      { type: 'function', schema: 'public', name: 'calc_total' },
    ]);
    expect((client.release as sinon.SinonStub).calledOnce).to.be.true;
  });

  it('expands foreign data wrapper and server nodes', async () => {
    configGetStub.returns([
      { id: 'c1', name: 'Primary', host: 'localhost', port: 5432, username: 'postgres', database: 'appdb' },
    ]);
    const provider = new DatabaseTreeProvider(contextStub);
    const client = {
      query: sandbox.stub(),
      release: sandbox.stub(),
    };
    client.query.onCall(0).resolves({ rows: [{ name: 'remote_server' }] });
    client.query.onCall(1).resolves({ rows: [{ name: 'mapping_user' }] });
    answerVersionProbe(client);
    connectionManagerStub.getPooledClient.resolves(client);

    const fdwChildren = await provider.getChildren(new DatabaseTreeItem('postgres_fdw', vscode.TreeItemCollapsibleState.Collapsed, 'foreign-data-wrapper', 'c1', 'appdb'));
    const serverChildren = await provider.getChildren(new DatabaseTreeItem('remote_server', vscode.TreeItemCollapsibleState.Collapsed, 'foreign-server', 'c1', 'appdb', 'postgres_fdw'));

    expect(fdwChildren[0].type).to.equal('foreign-server');
    expect(fdwChildren[0].label).to.equal('remote_server');
    expect(serverChildren[0].type).to.equal('user-mapping');
    expect(serverChildren[0].label).to.equal('mapping_user');
    expect((client.release as sinon.SinonStub).callCount).to.equal(2);
  });
});