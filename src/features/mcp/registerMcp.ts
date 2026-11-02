import * as vscode from 'vscode';
import type { IMcpRegistration } from '../../pro/api';
import {
  MCP_ENABLED_SETTING,
  MCP_SERVER_PROVIDER_ID,
  McpDefinitionProvider,
} from './McpDefinitionProvider';

export interface RegisterMcpOptions {
  /** See {@link McpDefinitionProvider} `whenReady`. Pro builds only. */
  whenReady?: Promise<void>;
}

let registered: { provider: McpDefinitionProvider; api: IMcpRegistration } | undefined;

/**
 * Registers the one NexQL MCP server provider with VS Code. Safe to call more
 * than once (returns the existing registration) and a no-op on hosts without
 * `vscode.lm.registerMcpServerDefinitionProvider` (older VS Code, Cursor, ...).
 */
export function registerMcpServerProvider(
  context: vscode.ExtensionContext,
  options: RegisterMcpOptions = {},
): IMcpRegistration | undefined {
  if (registered) {
    return registered.api;
  }

  const lm = (vscode as unknown as { lm?: { registerMcpServerDefinitionProvider?: unknown } }).lm;
  if (!lm || typeof lm.registerMcpServerDefinitionProvider !== 'function') {
    return undefined;
  }

  const provider = new McpDefinitionProvider({
    extensionPath: context.extensionPath,
    isEnabled: () => vscode.workspace.getConfiguration().get<boolean>(MCP_ENABLED_SETTING, true),
    whenReady: options.whenReady,
  });

  let registration: vscode.Disposable;
  try {
    registration = vscode.lm.registerMcpServerDefinitionProvider(MCP_SERVER_PROVIDER_ID, provider);
  } catch {
    // Host exposes the API but rejects the registration (e.g. missing manifest contribution).
    provider.dispose();
    return undefined;
  }

  const api: IMcpRegistration = {
    setLaunchResolver: (resolver) => provider.setLaunchResolver(resolver),
    refresh: () => provider.refresh(),
  };
  registered = { provider, api };

  context.subscriptions.push(
    provider,
    registration,
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(MCP_ENABLED_SETTING)) {
        provider.refresh();
      }
    }),
    {
      dispose: () => {
        registered = undefined;
      },
    },
  );
  return api;
}

/** @internal tests only */
export function _resetMcpRegistrationForTests(): void {
  registered = undefined;
}
