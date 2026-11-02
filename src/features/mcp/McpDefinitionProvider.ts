import * as vscode from 'vscode';
import type { McpLaunchDescriptor, McpLaunchResolver } from '../../pro/api';
import { resolveDefaultMcpLaunch } from './defaultLaunch';

/** Must match `contributes.mcpServerDefinitionProviders[0].id` in package.json. */
export const MCP_SERVER_PROVIDER_ID = 'postgresExplorer.mcpServerProvider';
export const MCP_ENABLED_SETTING = 'postgresExplorer.mcp.enabled';
export const MCP_SERVER_LABEL = 'NexQL';

export interface McpDefinitionProviderOptions {
  extensionPath: string;
  isEnabled: () => boolean;
  /**
   * Pro builds: settles once the pro package has finished (or failed) activating
   * and so has had its chance to call `setLaunchResolver`. A resolve waits for
   * this or for a resolver to be installed, whichever comes first, so a client
   * that starts early never gets the free default in a pro build.
   */
  whenReady?: Promise<void>;
  /** Upper bound on the `whenReady` wait. Defaults to {@link PRO_READY_TIMEOUT_MS}. */
  readyTimeoutMs?: number;
}

/** How long a resolve waits for pro activation before using the free launch. */
export const PRO_READY_TIMEOUT_MS = 15_000;

/**
 * The single `NexQL` MCP server provider registered with VS Code, in both free
 * and pro builds. Pro customises the launch via `setLaunchResolver`.
 */
export class McpDefinitionProvider
  implements vscode.McpServerDefinitionProvider<vscode.McpStdioServerDefinition>, vscode.Disposable
{
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeMcpServerDefinitions = this._onDidChange.event;
  private _resolver: McpLaunchResolver | undefined;
  private _markResolverSet: () => void = () => undefined;
  private readonly _resolverSet = new Promise<void>((resolve) => {
    this._markResolverSet = resolve;
  });

  constructor(private readonly options: McpDefinitionProviderOptions) {}

  /** Install (or clear) the pro launch resolver. Returned disposable clears it if still current. */
  setLaunchResolver(resolver: McpLaunchResolver | undefined): vscode.Disposable {
    this._resolver = resolver;
    if (resolver) {
      this._markResolverSet();
    }
    this.refresh();
    return {
      dispose: () => {
        if (this._resolver === resolver) {
          this._resolver = undefined;
        }
      },
    };
  }

  get hasLaunchResolver(): boolean {
    return this._resolver !== undefined;
  }

  provideMcpServerDefinitions(): vscode.McpStdioServerDefinition[] {
    if (!this.options.isEnabled()) {
      return [];
    }
    // Placeholder (or the real default); resolveMcpServerDefinition finalises it lazily.
    const launch = resolveDefaultMcpLaunch(this.options.extensionPath);
    return [new vscode.McpStdioServerDefinition(MCP_SERVER_LABEL, launch.command, launch.args, launch.env)];
  }

  async resolveMcpServerDefinition(
    definition: vscode.McpStdioServerDefinition,
  ): Promise<vscode.McpStdioServerDefinition> {
    if (this.options.whenReady) {
      // Bounded: if pro activation never settles, fall back rather than hang the client.
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, this.options.readyTimeoutMs ?? PRO_READY_TIMEOUT_MS);
      });
      try {
        await Promise.race([this.options.whenReady, this._resolverSet, timeout]);
      } finally {
        clearTimeout(timer);
      }
    }
    const launch: McpLaunchDescriptor = this._resolver
      ? await this._resolver()
      : resolveDefaultMcpLaunch(this.options.extensionPath);
    definition.command = launch.command;
    definition.args = launch.args;
    definition.env = launch.env;
    return definition;
  }

  /** Ask VS Code to re-query definitions (setting toggled, pro profile regenerated, ...). */
  refresh(): void {
    this._onDidChange.fire();
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}
