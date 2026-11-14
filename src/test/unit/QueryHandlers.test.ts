import { expect } from 'chai';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { ConnectionManager } from '../../services/ConnectionManager';
import { ConnectionUtils } from '../../utils/connectionUtils';
import { DeleteRowsHandler, SaveChangesHandler } from '../../services/handlers/QueryHandlers';

describe('QueryHandlers', () => {
  let sandbox: sinon.SinonSandbox;
  let queryStub: sinon.SinonStub;
  let getPooledClientStub: sinon.SinonStub;
  let getSessionClientStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    queryStub = sandbox.stub().resolves({ rowCount: 1 });

    getPooledClientStub = sandbox.stub().resolves({
      query: queryStub,
      release: sandbox.stub()
    });
    getSessionClientStub = sandbox.stub().resolves({
      query: queryStub
    });

    sandbox.stub(ConnectionManager, 'getInstance').returns({
      getPooledClient: getPooledClientStub,
      getSessionClient: getSessionClientStub
    } as any);
    sandbox.stub(ConnectionUtils, 'findConnection').returns({
      id: 'conn-1',
      host: 'localhost',
      port: 5432,
      username: 'postgres',
      database: 'postgres'
    } as any);

    sandbox.stub(vscode.window, 'showErrorMessage').resolves(undefined);
    sandbox.stub(vscode.window, 'showInformationMessage').resolves(undefined);
    sandbox.stub(vscode.commands, 'executeCommand').resolves(undefined);
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('SaveChangesHandler uses parameterized SQL and transaction', async () => {
    const handler = new SaveChangesHandler();
    const postMessage = sandbox.stub().resolves(true);

    await handler.handle(
      {
        tableInfo: { schema: 'public', table: 'users' },
        updates: [
          {
            keys: { id: 42, tenant_id: null },
            column: 'name',
            value: "O'Reilly"
          }
        ],
        deletions: [{ keys: { id: 99 } }]
      },
      {
        editor: {
          notebook: {
            uri: { toString: () => 'notebook-uri' },
            metadata: {
              connectionId: 'conn-1',
              host: 'localhost',
              port: 5432,
              username: 'postgres',
              databaseName: 'postgres'
            }
          }
        } as any,
        postMessage
      }
    );

    expect(queryStub.firstCall.args[0]).to.equal('BEGIN');
    expect(queryStub.lastCall.args[0]).to.equal('COMMIT');

    const updateCall = queryStub.getCall(1);
    expect(updateCall.args[0]).to.contain('UPDATE "public"."users" SET "name" = $1 WHERE "id" = $2 AND "tenant_id" IS NULL');
    expect(updateCall.args[1]).to.deep.equal(["O'Reilly", 42]);
    expect(updateCall.args[0]).to.not.contain("O'Reilly");

    const deleteCall = queryStub.getCall(2);
    expect(deleteCall.args[0]).to.equal('DELETE FROM "public"."users" WHERE "id" = $1');
    expect(deleteCall.args[1]).to.deep.equal([99]);

    expect(postMessage.calledOnce).to.be.true;
  });

  it('SaveChangesHandler rolls back transaction on failure', async () => {
    const handler = new SaveChangesHandler();
    queryStub.onCall(0).resolves({}); // BEGIN
    queryStub.onCall(1).rejects(new Error('boom')); // UPDATE
    queryStub.onCall(2).resolves({}); // ROLLBACK

    await handler.handle(
      {
        tableInfo: { schema: 'public', table: 'users' },
        updates: [{ keys: { id: 1 }, column: 'name', value: 'x' }],
        deletions: []
      },
      {
        editor: {
          notebook: {
            uri: { toString: () => 'notebook-uri' },
            metadata: {
              connectionId: 'conn-1',
              host: 'localhost',
              port: 5432,
              username: 'postgres',
              databaseName: 'postgres'
            }
          }
        } as any
      }
    );

    expect(queryStub.calledWith('ROLLBACK')).to.be.true;
  });

  it('DeleteRowsHandler wraps multi-row deletion in transaction', async () => {
    const handler = new DeleteRowsHandler();

    await handler.handle(
      {
        tableInfo: { schema: 'public', table: 'users', primaryKeys: ['id'] },
        rows: [{ id: 1 }, { id: 2 }]
      },
      {
        editor: {
          notebook: {
            uri: { toString: () => 'notebook-uri' },
            metadata: { connectionId: 'conn-1', databaseName: 'postgres' }
          },
          selection: { start: 0, end: 1 }
        } as any
      }
    );

    expect(getSessionClientStub.calledOnce).to.be.true;
    expect(queryStub.firstCall.args[0]).to.equal('BEGIN');
    expect(queryStub.getCall(1).args[0]).to.equal('DELETE FROM "public"."users" WHERE "id" = $1');
    expect(queryStub.getCall(1).args[1]).to.deep.equal([1]);
    expect(queryStub.getCall(2).args[0]).to.equal('DELETE FROM "public"."users" WHERE "id" = $1');
    expect(queryStub.getCall(2).args[1]).to.deep.equal([2]);
    expect(queryStub.lastCall.args[0]).to.equal('COMMIT');
  });
});
