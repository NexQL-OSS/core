import { expect } from 'chai';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { PostgresKernel } from '../../providers/NotebookKernel';
import { MessageHandlerRegistry } from '../../services/MessageHandler';

describe('Notebook renderer flow smoke test', () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    // Reset the static flag so every test gets a clean language-provider registration pass.
    (PostgresKernel as any)._languageProvidersRegistered = false;
  });

  afterEach(() => {
    sandbox.restore();
    (PostgresKernel as any)._languageProvidersRegistered = false;
  });

  it('routes notebook renderer messages through the handler registry', async () => {
    let onDidReceiveMessageCallback: ((event: any) => Promise<void>) | undefined;
    const controllerStub = {
      supportsExecutionOrder: false,
      executeHandler: undefined as any,
      dispose: sandbox.stub(),
      onDidReceiveMessage: (cb: (event: any) => Promise<void>) => {
        onDidReceiveMessageCallback = cb;
      }
    };

    sandbox.stub(vscode.notebooks, 'createNotebookController').returns(controllerStub as any);
    sandbox.stub(vscode.languages, 'registerCompletionItemProvider').returns({ dispose: sandbox.stub() } as any);

    const registerStub = sandbox.stub();
    const handleMessageStub = sandbox.stub().resolves();
    sandbox.stub(MessageHandlerRegistry, 'getInstance').returns({
      register: registerStub,
      handleMessage: handleMessageStub
    } as any);

    const contextStub = { subscriptions: [] } as any;
    const messagingStub = {
      postMessage: sandbox.stub().resolves(true)
    } as any;

    new PostgresKernel(contextStub, messagingStub, 'postgres-notebook');

    expect(onDidReceiveMessageCallback).to.not.equal(undefined);

    const editor = { notebook: { uri: { toString: () => 'notebook-uri' } } };
    await onDidReceiveMessageCallback!({
      message: { type: 'showErrorMessage', error: 'x' },
      editor
    });

    expect(handleMessageStub.calledOnce).to.be.true;
    expect(handleMessageStub.firstCall.args[0]).to.deep.equal({ type: 'showErrorMessage', error: 'x' });
    expect(handleMessageStub.firstCall.args[1]).to.have.property('postMessage');
    expect(typeof handleMessageStub.firstCall.args[1].postMessage).to.equal('function');
  });

  it('routes multiple message types through the handler registry', async () => {
    let onDidReceiveMessageCallback: ((event: any) => Promise<void>) | undefined;
    const controllerStub = {
      supportsExecutionOrder: false,
      executeHandler: undefined as any,
      dispose: sandbox.stub(),
      onDidReceiveMessage: (cb: (event: any) => Promise<void>) => {
        onDidReceiveMessageCallback = cb;
      }
    };

    sandbox.stub(vscode.notebooks, 'createNotebookController').returns(controllerStub as any);
    sandbox.stub(vscode.languages, 'registerCompletionItemProvider').returns({ dispose: sandbox.stub() } as any);

    const handleMessageStub = sandbox.stub().resolves();
    sandbox.stub(MessageHandlerRegistry, 'getInstance').returns({
      register: sandbox.stub(),
      handleMessage: handleMessageStub
    } as any);

    const contextStub = { subscriptions: [] } as any;
    const messagingStub = { postMessage: sandbox.stub().resolves(true) } as any;
    new PostgresKernel(contextStub, messagingStub, 'postgres-notebook');

    const editor = { notebook: { uri: { toString: () => 'nb-uri' } } };

    // Send several different message types in sequence.
    // Note: 'showConnectionInfo' is handled via an early-return command dispatch in the kernel
    // and does NOT reach registry.handleMessage — use registry-routed types only.
    const types = ['export_request', 'import_request', 'cancel_query'];
    for (const type of types) {
      await onDidReceiveMessageCallback!({ message: { type }, editor });
    }

    expect(handleMessageStub.callCount).to.equal(3);
    expect(handleMessageStub.getCall(0).args[0].type).to.equal('export_request');
    expect(handleMessageStub.getCall(1).args[0].type).to.equal('import_request');
    expect(handleMessageStub.getCall(2).args[0].type).to.equal('cancel_query');
  });

  it('provides the postMessage function in the handler context', async () => {
    let capturedContext: any;
    let onDidReceiveMessageCallback: ((event: any) => Promise<void>) | undefined;
    const controllerStub = {
      supportsExecutionOrder: false,
      executeHandler: undefined as any,
      dispose: sandbox.stub(),
      onDidReceiveMessage: (cb: (event: any) => Promise<void>) => {
        onDidReceiveMessageCallback = cb;
      }
    };

    sandbox.stub(vscode.notebooks, 'createNotebookController').returns(controllerStub as any);
    sandbox.stub(vscode.languages, 'registerCompletionItemProvider').returns({ dispose: sandbox.stub() } as any);

    sandbox.stub(MessageHandlerRegistry, 'getInstance').returns({
      register: sandbox.stub(),
      handleMessage: async (_msg: any, ctx: any) => { capturedContext = ctx; }
    } as any);

    const contextStub = { subscriptions: [] } as any;
    const postMessageStub = sandbox.stub().resolves(true);
    const messagingStub = { postMessage: postMessageStub } as any;
    new PostgresKernel(contextStub, messagingStub, 'postgres-notebook');

    const editor = { notebook: { uri: { toString: () => 'nb-uri' } } };
    await onDidReceiveMessageCallback!({ message: { type: 'ping' }, editor });

    expect(capturedContext).to.not.be.undefined;
    expect(typeof capturedContext.postMessage).to.equal('function');

    // Calling postMessage should delegate to the messaging stub
    await capturedContext.postMessage({ type: 'pong' });
    expect(postMessageStub.calledOnce).to.be.true;
  });

  it('registers handlers for all core message types during construction', async () => {
    const registerStub = sandbox.stub();
    const controllerStub = {
      supportsExecutionOrder: false,
      executeHandler: undefined as any,
      dispose: sandbox.stub(),
      onDidReceiveMessage: sandbox.stub()
    };

    sandbox.stub(vscode.notebooks, 'createNotebookController').returns(controllerStub as any);
    sandbox.stub(vscode.languages, 'registerCompletionItemProvider').returns({ dispose: sandbox.stub() } as any);
    sandbox.stub(MessageHandlerRegistry, 'getInstance').returns({
      register: registerStub,
      handleMessage: sandbox.stub().resolves()
    } as any);

    const contextStub = { subscriptions: [] } as any;
    const messagingStub = { postMessage: sandbox.stub().resolves(true) } as any;
    new PostgresKernel(contextStub, messagingStub, 'postgres-notebook');

    // Kernel should register handlers for at least these critical message types.
    // Keys must match the actual registered strings (snake_case constants from WEBVIEW_MESSAGE_TYPES).
    const registeredTypes = registerStub.args.map((args: any[]) => args[0]);
    const expectedTypes = ['export_request', 'import_pick_file', 'showErrorMessage'];
    for (const t of expectedTypes) {
      expect(registeredTypes, `handler for '${t}' should be registered`).to.include(t);
    }
  });
});
