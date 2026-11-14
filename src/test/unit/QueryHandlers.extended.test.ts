import { expect } from 'chai';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { ErrorHandlers } from '../../commands/helper';
import { ConnectionManager } from '../../services/ConnectionManager';
import { ConnectionUtils } from '../../utils/connectionUtils';
import * as logger from '../../common/logger';
import {
  CancelQueryHandler,
  ExecuteUpdateBackgroundHandler,
  ExecuteUpdateHandler,
  ScriptDeleteHandler
} from '../../services/handlers/QueryHandlers';
import type { SqlExecutor } from '../../providers/kernel/SqlExecutor';

describe('QueryHandlers (extended)', () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(vscode.window, 'showErrorMessage').resolves(undefined);
    sandbox.stub(vscode.window, 'showInformationMessage').resolves(undefined);
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('CancelQueryHandler calls executor.cancelQuery', async () => {
    const cancelQuery = sandbox.stub().resolves();
    const executor = { cancelQuery } as unknown as SqlExecutor;
    const handler = new CancelQueryHandler();
    await handler.handle({ cellId: 'c1' }, { executor });
    expect(cancelQuery.calledWith({ cellId: 'c1' })).to.be.true;
  });

  it('CancelQueryHandler warns when no executor', async () => {
    const warn = sandbox.stub(logger, 'debugWarn');
    const handler = new CancelQueryHandler();
    await handler.handle({ cellId: 'c1' }, {});
    expect(warn.called).to.be.true;
  });

  it('ExecuteUpdateBackgroundHandler runs statements', async () => {
    const query = sandbox.stub().resolves({ rowCount: 1 });
    const release = sandbox.stub();
    sandbox.stub(ConnectionUtils, 'findConnection').returns({
      id: 'c1', host: 'h', port: 5432, username: 'u', database: 'postgres',
    } as any);
    sandbox.stub(ConnectionManager, 'getInstance').returns({
      getPooledClient: sandbox.stub().resolves({ query, release })
    } as unknown as ConnectionManager);

    const handler = new ExecuteUpdateBackgroundHandler();
    await handler.handle(
      { statements: ['UPDATE t SET a = 1'] },
      {
        editor: {
          notebook: {
            uri: { toString: () => 'notebook-uri' },
            metadata: {
              connectionId: 'c1',
              host: 'h',
              port: 5432,
              username: 'u',
              databaseName: 'postgres'
            }
          }
        } as unknown as vscode.NotebookEditor
      }
    );

    expect(query.calledWith('UPDATE t SET a = 1')).to.be.true;
    expect(release.calledOnce).to.be.true;
  });

  it('ExecuteUpdateBackgroundHandler handles pooled client errors', async () => {
    const query = sandbox.stub().resolves({ rowCount: 1 });
    const release = sandbox.stub();
    sandbox.stub(ConnectionManager, 'getInstance').returns({
      getPooledClient: sandbox.stub().rejects(new Error('fail'))
    } as unknown as ConnectionManager);
    const err = sandbox.stub(ErrorHandlers, 'handleCommandError').resolves();

    const handler = new ExecuteUpdateBackgroundHandler();
    await handler.handle({ statements: ['SELECT 1'] }, {
      editor: {
        notebook: {
          metadata: {
            connectionId: 'c1',
            host: 'h',
            port: 5432,
            username: 'u',
            databaseName: 'postgres'
          }
        }
      } as unknown as vscode.NotebookEditor
    });

    expect(err.called).to.be.true;
  });

  it('ExecuteUpdateHandler inserts generated cell', async () => {
    const applyEdit = sandbox.stub().resolves(true);
    const prev = vscode.workspace.applyEdit;
    (vscode.workspace as any).applyEdit = applyEdit;
    const handler = new ExecuteUpdateHandler();
    try {
      await handler.handle(
        { statements: ['UPDATE t SET a = 1'], cellIndex: 0 },
        {
          editor: {
            notebook: {
              uri: vscode.Uri.parse('untitled:nb'),
              metadata: {}
            }
          } as unknown as vscode.NotebookEditor
        }
      );
      expect(applyEdit.calledOnce).to.be.true;
    } finally {
      (vscode.workspace as any).applyEdit = prev;
    }
  });

  it('ScriptDeleteHandler inserts delete script cell', async () => {
    const applyEdit = sandbox.stub().resolves(true);
    const prev = vscode.workspace.applyEdit;
    (vscode.workspace as any).applyEdit = applyEdit;
    const handler = new ScriptDeleteHandler();
    try {
      await handler.handle(
        {
          schema: 'public',
          table: 'users',
          primaryKeys: ['id'],
          rows: [{ id: 1 }],
          cellIndex: 0
        },
        {
          editor: {
            notebook: {
              uri: vscode.Uri.parse('untitled:nb'),
              metadata: {}
            }
          } as unknown as vscode.NotebookEditor
        }
      );
      expect(applyEdit.calledOnce).to.be.true;
    } finally {
      (vscode.workspace as any).applyEdit = prev;
    }
  });
});
