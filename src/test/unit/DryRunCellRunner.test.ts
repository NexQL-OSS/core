import { expect } from 'chai';
import sinon from 'sinon';
import * as vscode from 'vscode';
import { DryRunCellRunner } from '../../providers/kernel/DryRunCellRunner';
import { ConnectionManager } from '../../services/ConnectionManager';
import { ConnectionUtils } from '../../utils/connectionUtils';
import { QueryExecutionService } from '../../services/QueryExecutionService';
import { getTransactionManager } from '../../services/TransactionManager';

class MockClient {
  public log: string[] = [];
  public processID = 4242;
  on() { return this; }
  removeListener() { return this; }
  constructor(private failMain = false) {}
  async query(arg: string | { text: string }): Promise<any> {
    const text = typeof arg === 'string' ? arg : arg.text;
    this.log.push(text);
    if (/count\(\*\) OVER/.test(text)) {
      if (this.failMain) {
        throw Object.assign(new Error('duplicate key'), { code: '23505' });
      }
      return { rows: [['1', 1]], fields: [{ name: '__nexql_dry_total', dataTypeID: 20 }, { name: 'id', dataTypeID: 23 }], rowCount: 1, command: 'SELECT' };
    }
    if (/FOR UPDATE/.test(text)) {
      return { rows: [[1]], fields: [{ name: 'id', dataTypeID: 23 }], rowCount: 1, command: 'SELECT' };
    }
    return { rows: [], fields: [], rowCount: 0, command: 'OK' };
  }
}

function makeCell(sql: string) {
  const notebook = { uri: vscode.Uri.file('/w/n.pgsql'), metadata: { connectionId: 'c1', databaseName: 'db' } };
  const doc = { uri: vscode.Uri.parse('vscode-notebook-cell:/w/n.pgsql#1'), getText: () => sql };
  return { document: doc, notebook, index: 0, metadata: {} } as any;
}

function makeExecution(opts: { replaceThrows?: boolean } = {}) {
  const handlers: Array<() => void> = [];
  const exec: any = {
    outputs: [] as any[],
    ended: undefined as undefined | boolean,
    token: { isCancellationRequested: false, onCancellationRequested: (cb: () => void) => { handlers.push(cb); return { dispose() {} }; } },
    start: sinon.stub(),
    clearOutput: async () => {},
    replaceOutput: async (o: any) => {
      if (opts.replaceThrows) throw new Error('renderer exploded');
      exec.outputs.push(o);
    },
    end: (ok: boolean) => { exec.ended = ok; },
    cancel() { exec.token.isCancellationRequested = true; handlers.forEach((h) => h()); },
  };
  return exec;
}

describe('DryRunCellRunner', () => {
  let client: MockClient;
  let sandbox: sinon.SinonSandbox;

  function wire(failMain = false) {
    client = new MockClient(failMain);
    sandbox.stub(ConnectionUtils, 'getEffectiveMetadata').returns({ connectionId: 'c1', databaseName: 'db' } as any);
    sandbox.stub(ConnectionUtils, 'findConnectionWithFallback').returns({ id: 'c1', host: 'h', port: 5432, username: 'u', database: 'db', name: 'n' } as any);
    sandbox.stub(ConnectionManager, 'getInstance').returns({ getSessionClient: async () => client, sendCancelRequest: async () => {} } as any);
  }

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    getTransactionManager().initializeSession('file:///w/n.pgsql');
  });
  afterEach(() => {
    sandbox.restore();
    QueryExecutionService.getInFlightMap().clear();
    QueryExecutionService.getExecutingBySession().clear();
  });

  function runner(execution: any) {
    const controller: any = { createNotebookCellExecution: () => execution };
    return new DryRunCellRunner(controller);
  }

  it('success: ROLLBACK is the last statement, outputs are before + after, run ends successfully', async () => {
    wire();
    const execution = makeExecution();
    await runner(execution).execute(makeCell('UPDATE t SET a = 1 WHERE id = 1'));
    expect(client.log[0]).to.equal('BEGIN');
    expect(client.log[client.log.length - 1]).to.equal('ROLLBACK');
    expect(client.log.some((q) => /^\s*(COMMIT|END)\b/i.test(q))).to.equal(false);
    expect(execution.ended).to.equal(true);
    expect(execution.outputs).to.have.length(1);
    expect(QueryExecutionService.getInFlightMap().size).to.equal(0);
  });

  it('SQL error: error output, ROLLBACK last, run ends unsuccessfully', async () => {
    wire(true);
    const execution = makeExecution();
    await runner(execution).execute(makeCell('UPDATE t SET a = 1 WHERE id = 1'));
    expect(client.log[client.log.length - 1]).to.equal('ROLLBACK');
    expect(execution.ended).to.equal(false);
    expect(execution.outputs).to.have.length(1);
  });

  it('renderer/output failure cannot leave the transaction open (rollback happens before output)', async () => {
    wire();
    const execution = makeExecution({ replaceThrows: true });
    await runner(execution).execute(makeCell('DELETE FROM t WHERE id = 1'));
    expect(client.log[client.log.length - 1]).to.equal('ROLLBACK');
    expect(client.log.some((q) => /^\s*(COMMIT|END)\b/i.test(q))).to.equal(false);
    expect(execution.ended).to.equal(false);
  });

  it('cancellation before execution: nothing runs but ROLLBACK, run ends unsuccessfully', async () => {
    wire();
    const execution = makeExecution();
    execution.token.isCancellationRequested = true;
    await runner(execution).execute(makeCell('UPDATE t SET a = 1'));
    expect(client.log.some((q) => /UPDATE t/.test(q))).to.equal(false);
    expect(client.log[client.log.length - 1]).to.equal('ROLLBACK');
    expect(execution.ended).to.equal(false);
  });

  it('refused cells never connect or send SQL', async () => {
    wire();
    const execution = makeExecution();
    await runner(execution).execute(makeCell('UPDATE t SET a = 1; COMMIT;'));
    expect(client.log).to.deep.equal([]);
    expect(execution.ended).to.equal(false);
    const payload = JSON.parse(Buffer.from(execution.outputs[0].items[0].data).toString('utf8'));
    expect(payload.error).to.match(/Dry run not possible: .*single statement/);
  });
});
