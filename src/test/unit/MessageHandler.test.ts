import { expect } from 'chai';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as logger from '../../common/logger';

import { MessageHandlerRegistry } from '../../services/MessageHandler';

describe('MessageHandlerRegistry', () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    (MessageHandlerRegistry as any).instance = undefined;
  });

  afterEach(() => {
    sandbox.restore();
    (MessageHandlerRegistry as any).instance = undefined;
  });

  it('registers handlers and dispatches messages', async () => {
    const registry = MessageHandlerRegistry.getInstance();
    const handleStub = sandbox.stub().resolves();
    registry.register('query.execute', { handle: handleStub } as any);

    await registry.handleMessage({ type: 'query.execute', payload: { sql: 'select 1' } }, { editor: undefined });

    expect(handleStub.calledOnce).to.be.true;
    expect(handleStub.firstCall.args[0]).to.deep.equal({ type: 'query.execute', payload: { sql: 'select 1' } });
  });

  it('warns when overwriting handlers and surfaces handler errors', async () => {
    const warnStub = sandbox.stub(logger, 'debugWarn');
    const errorStub = sandbox.stub(console, 'error');
    const showErrorMessageStub = sandbox.stub(vscode.window, 'showErrorMessage').resolves(undefined as any);

    const registry = MessageHandlerRegistry.getInstance();
    registry.register('showErrorMessage', { handle: sandbox.stub().resolves() } as any);
    registry.register('showErrorMessage', { handle: sandbox.stub().rejects(new Error('boom')) } as any);

    expect(warnStub.calledOnceWithMatch('Overwriting handler for message type: showErrorMessage')).to.be.true;

    await registry.handleMessage({ type: 'showErrorMessage' }, {});

    expect(errorStub.calledOnce).to.be.true;
    expect(String(errorStub.firstCall.args[0])).to.contain('Error handling message showErrorMessage:');
    expect(showErrorMessageStub.calledOnceWithMatch('Error processing showErrorMessage: boom')).to.be.true;
  });

  it('warns when no handler is registered', async () => {
    const warnStub = sandbox.stub(logger, 'debugWarn');
    const registry = MessageHandlerRegistry.getInstance();

    await registry.handleMessage({ type: 'missing-handler' }, {});

    expect(warnStub.calledOnceWithMatch('No handler registered for message type: missing-handler')).to.be.true;
  });
});
