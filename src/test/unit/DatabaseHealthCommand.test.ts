import { expect } from 'chai';
import * as sinon from 'sinon';

import * as connectionModule from '../../commands/connection';
import { cmdDatabaseHealth } from '../../commands/health';
import * as helper from '../../commands/helper';
import { ConnectionManager } from '../../services/ConnectionManager';

describe('cmdDatabaseHealth', () => {
  let sandbox: sinon.SinonSandbox;
  let builder: any;
  let pooledClient: { query: sinon.SinonStub; release: sinon.SinonStub };
  let handleError: sinon.SinonStub;

  function stubServer(statementsInstalled: boolean) {
    pooledClient.query.callsFake(async (sql: string) => {
      if (/SHOW server_version_num/i.test(sql)) {
        return { rows: [{ server_version_num: '170012' }] };
      }
      if (/pg_extension/i.test(sql)) {
        return { rows: [{ installed: statementsInstalled }] };
      }
      return { rows: [] };
    });
  }

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    builder = {};
    builder.addMarkdown = sandbox.stub().returns(builder);
    builder.addSql = sandbox.stub().returns(builder);
    builder.show = sandbox.stub().resolves();
    builder.showTemp = sandbox.stub().resolves();
    sandbox.stub(helper as any, 'NotebookBuilder').callsFake(function () {
      return builder;
    });

    pooledClient = { query: sandbox.stub(), release: sandbox.stub() };
    sandbox.stub(connectionModule, 'getConnectionWithPassword').resolves({
      id: 'c1',
      name: 'Primary',
      host: 'localhost',
      port: 5432,
      username: 'postgres',
    } as any);
    sandbox.stub(connectionModule, 'createMetadata').callsFake((_config: any, databaseName: string) => ({
      connectionId: 'c1',
      databaseName,
    }) as any);
    sandbox.stub(ConnectionManager, 'getInstance').returns({
      getPooledClient: sandbox.stub().resolves(pooledClient),
    } as any);
    handleError = sandbox.stub(helper.ErrorHandlers, 'handleCommandError').resolves();
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('builds the report from a database tree node, which has no schema', async () => {
    stubServer(true);
    // Same shape ConnectionLoader gives a database node: databaseName set, schema undefined.
    const item = { label: 'appdb', type: 'database', connectionId: 'c1', databaseName: 'appdb' } as any;

    await cmdDatabaseHealth(item);

    expect(handleError.called, String(handleError.firstCall?.args[0])).to.equal(false);
    expect(builder.showTemp.calledOnce).to.equal(true);
    expect(builder.show.called).to.equal(false);
    const sql: string[] = builder.addSql.getCalls().map((c: any) => c.args[0]);
    expect(sql).to.have.length(6);
    expect(sql[5]).to.include('total_exec_time');
    expect(pooledClient.release.calledOnce).to.equal(true);
  });

  it('swaps the slow-statements cell for an install hint when pg_stat_statements is missing', async () => {
    stubServer(false);
    const item = { label: 'appdb', type: 'database', connectionId: 'c1', databaseName: 'appdb' } as any;

    await cmdDatabaseHealth(item);

    expect(handleError.called).to.equal(false);
    const sql: string[] = builder.addSql.getCalls().map((c: any) => c.args[0]);
    expect(sql.some((s) => s.includes('FROM pg_stat_statements'))).to.equal(false);
    expect(sql[5]).to.include("e.extname = 'pg_stat_statements'");
  });

  it('still rejects a selection with no connection', async () => {
    await cmdDatabaseHealth({ label: 'x' } as any);
    expect(handleError.calledOnce).to.equal(true);
    expect(builder.showTemp.called).to.equal(false);
  });
});
