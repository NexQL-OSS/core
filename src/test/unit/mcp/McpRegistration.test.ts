import { expect } from 'chai';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as path from 'path';
import {
  NEXQL_MCP_NPX_ARGS,
  resolveDefaultMcpLaunch,
  vendoredBinaryPath,
  type DefaultLaunchEnv,
} from '../../../features/mcp/defaultLaunch';
import {
  MCP_ENABLED_SETTING,
  MCP_SERVER_PROVIDER_ID,
  McpDefinitionProvider,
} from '../../../features/mcp/McpDefinitionProvider';
import { _resetMcpRegistrationForTests, registerMcpServerProvider } from '../../../features/mcp/registerMcp';

const EXT = path.join('/ext', 'root');

function env(existing: string[], platform: NodeJS.Platform = 'linux', arch = 'x64'): DefaultLaunchEnv {
  return { platform, arch, isExecutableFile: (p) => existing.includes(p) };
}

describe('MCP default launch resolution', () => {
  it('prefers the vendored binary for the current platform', () => {
    const bin = path.join(EXT, 'bin', 'nexql-mcp', 'linux-x64', 'nexql-mcp');
    const launch = resolveDefaultMcpLaunch(EXT, env([bin]));
    expect(launch.source).to.equal('vendored');
    expect(launch.command).to.equal(bin);
    expect(launch.args).to.deep.equal(['--stdio']);
    expect(launch.env).to.deep.equal({});
  });

  it('uses the .exe name on win32 and the matching platform dir', () => {
    expect(vendoredBinaryPath(EXT, 'win32', 'x64')).to.equal(
      path.join(EXT, 'bin', 'nexql-mcp', 'win32-x64', 'nexql-mcp.exe'),
    );
  });

  it('falls back to npx when no vendored binary exists', () => {
    const launch = resolveDefaultMcpLaunch(EXT, env([]));
    expect(launch.source).to.equal('npx');
    expect(launch.command).to.equal('npx');
    expect(launch.args).to.deep.equal([...NEXQL_MCP_NPX_ARGS]);
    expect(launch.args).to.deep.equal(['-y', 'nexql-mcp@latest', '--stdio']);
  });

  it('ignores a vendored binary built for another platform', () => {
    const other = path.join(EXT, 'bin', 'nexql-mcp', 'darwin-arm64', 'nexql-mcp');
    expect(resolveDefaultMcpLaunch(EXT, env([other])).source).to.equal('npx');
  });
});

describe('McpDefinitionProvider (core)', () => {
  let enabled: boolean;
  function make(whenReady?: Promise<void>) {
    return new McpDefinitionProvider({ extensionPath: '/nonexistent-ext', isEnabled: () => enabled, whenReady });
  }
  beforeEach(() => {
    enabled = true;
  });

  it('returns no definitions when the setting is off', () => {
    enabled = false;
    expect(make().provideMcpServerDefinitions()).to.deep.equal([]);
  });

  it('returns a single NexQL stdio definition when enabled', () => {
    const defs = make().provideMcpServerDefinitions();
    expect(defs).to.have.length(1);
    expect(defs[0]).to.be.instanceOf(vscode.McpStdioServerDefinition);
    expect(defs[0].label).to.equal('NexQL');
  });

  it('resolves to the default launch without a pro resolver', async () => {
    const provider = make();
    const [def] = provider.provideMcpServerDefinitions();
    const resolved = await provider.resolveMcpServerDefinition(def);
    expect(resolved.command).to.equal('npx');
    expect(resolved.args).to.deep.equal(['-y', 'nexql-mcp@latest', '--stdio']);
  });

  it('uses the pro resolver when set, and refreshes', async () => {
    const provider = make();
    const fired = sinon.spy();
    provider.onDidChangeMcpServerDefinitions(fired);
    provider.setLaunchResolver(async () => ({ command: 'managed', args: ['--config', '/x'], env: { A: '1' } }));
    expect(fired.calledOnce).to.equal(true);
    const [def] = provider.provideMcpServerDefinitions();
    const resolved = await provider.resolveMcpServerDefinition(def);
    expect(resolved.command).to.equal('managed');
    expect(resolved.args).to.deep.equal(['--config', '/x']);
    expect(resolved.env).to.deep.equal({ A: '1' });
  });

  it('restores the default when the resolver registration is disposed', async () => {
    const provider = make();
    const sub = provider.setLaunchResolver(() => ({ command: 'managed', args: [], env: {} }));
    sub.dispose();
    const [def] = provider.provideMcpServerDefinitions();
    expect((await provider.resolveMcpServerDefinition(def)).command).to.equal('npx');
  });

  it('propagates resolver errors instead of silently using the default', async () => {
    const provider = make();
    provider.setLaunchResolver(() => {
      throw new Error('no npx');
    });
    const [def] = provider.provideMcpServerDefinitions();
    let err: Error | undefined;
    try {
      await provider.resolveMcpServerDefinition(def);
    } catch (e) {
      err = e as Error;
    }
    expect(err?.message).to.equal('no npx');
  });

  it('waits for pro readiness, then uses the resolver installed meanwhile', async () => {
    let ready!: () => void;
    const provider = make(new Promise<void>((r) => (ready = r)));
    const [def] = provider.provideMcpServerDefinitions();
    const pending = provider.resolveMcpServerDefinition(def);
    provider.setLaunchResolver(() => ({ command: 'managed', args: [], env: {} }));
    expect((await pending).command).to.equal('managed');
    ready();
  });

  it('falls back to the default if pro settles without installing a resolver', async () => {
    const provider = make(Promise.resolve());
    const [def] = provider.provideMcpServerDefinitions();
    expect((await provider.resolveMcpServerDefinition(def)).command).to.equal('npx');
  });
});

describe('registerMcpServerProvider', () => {
  let sandbox: sinon.SinonSandbox;
  let context: any;
  const lm = (vscode as any).lm;
  let originalRegister: any;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    originalRegister = lm.registerMcpServerDefinitionProvider;
    _resetMcpRegistrationForTests();
    context = { extensionPath: '/ext', subscriptions: [] };
  });
  afterEach(() => {
    lm.registerMcpServerDefinitionProvider = originalRegister;
    _resetMcpRegistrationForTests();
    sandbox.restore();
  });

  it('registers exactly one provider under the contributed id', () => {
    const reg = sandbox.stub().returns({ dispose() {} });
    lm.registerMcpServerDefinitionProvider = reg;
    const api1 = registerMcpServerProvider(context);
    const api2 = registerMcpServerProvider(context);
    expect(api1).to.not.equal(undefined);
    expect(api2).to.equal(api1);
    expect(reg.calledOnce).to.equal(true);
    expect(reg.firstCall.args[0]).to.equal(MCP_SERVER_PROVIDER_ID);
    expect(MCP_SERVER_PROVIDER_ID).to.equal(
      require('../../../../package.json').contributes.mcpServerDefinitionProviders[0].id,
    );
  });

  it('is a no-op when the host lacks registerMcpServerDefinitionProvider', () => {
    lm.registerMcpServerDefinitionProvider = undefined;
    expect(registerMcpServerProvider(context)).to.equal(undefined);
    expect(context.subscriptions).to.have.length(0);
  });

  it('is a no-op when vscode.lm itself is missing', () => {
    const vs = vscode as any;
    const saved = vs.lm;
    vs.lm = undefined;
    try {
      expect(registerMcpServerProvider(context)).to.equal(undefined);
    } finally {
      vs.lm = saved;
    }
  });

  it('returns undefined if the host rejects the registration', () => {
    lm.registerMcpServerDefinitionProvider = () => {
      throw new Error('no contribution');
    };
    expect(registerMcpServerProvider(context)).to.equal(undefined);
  });

  it('exposes setLaunchResolver that reaches the registered provider', async () => {
    let provider: any;
    lm.registerMcpServerDefinitionProvider = (_id: string, p: any) => {
      provider = p;
      return { dispose() {} };
    };
    const api = registerMcpServerProvider(context)!;
    api.setLaunchResolver(() => ({ command: 'managed', args: [], env: {} }));
    const [def] = provider.provideMcpServerDefinitions();
    expect((await provider.resolveMcpServerDefinition(def)).command).to.equal('managed');
  });

  it('honours the setting gate through the registered provider', () => {
    let provider: any;
    lm.registerMcpServerDefinitionProvider = (_id: string, p: any) => {
      provider = p;
      return { dispose() {} };
    };
    const cfg = sandbox.stub(vscode.workspace, 'getConfiguration');
    registerMcpServerProvider(context);
    cfg.returns({ get: (k: string, d: any) => (k === MCP_ENABLED_SETTING ? false : d) } as any);
    expect(provider.provideMcpServerDefinitions()).to.deep.equal([]);
    cfg.returns({ get: (_k: string, d: any) => d } as any);
    expect(provider.provideMcpServerDefinitions()).to.have.length(1);
  });
});

describe('McpDefinitionProvider pro-ready timeout', () => {
  it('falls back to the default launch when pro never settles', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { McpDefinitionProvider } = require('../../../features/mcp/McpDefinitionProvider');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const vscode = require('vscode');
    const provider = new McpDefinitionProvider({
      extensionPath: '/nonexistent',
      isEnabled: () => true,
      whenReady: new Promise<void>(() => undefined),
      readyTimeoutMs: 20,
    });
    const def = new vscode.McpStdioServerDefinition('NexQL', 'placeholder', []);
    const resolved = await provider.resolveMcpServerDefinition(def);
    if (resolved.command === 'placeholder') {
      throw new Error('resolve did not apply a launch');
    }
    provider.dispose();
  });
});
