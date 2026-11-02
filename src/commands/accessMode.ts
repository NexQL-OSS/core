import * as vscode from 'vscode';
import {
  AccessMode,
  accessModeLabel,
  getAccessMode,
  requiresWriteConfirmation,
  toggleAccessMode,
} from '../common/accessMode';
import { ConnectionManager } from '../services/ConnectionManager';
import { ConnectionUtils } from '../utils/connectionUtils';
import { ErrorHandlers } from './helper';

export const TOGGLE_READ_ONLY_COMMAND = 'postgres-explorer.toggleReadOnlyMode';
const CONNECTIONS_KEY = 'postgresExplorer.connections';
const SWITCH_BUTTON = 'Switch to Read/write';

export interface ToggleDeps {
  getConnections(): any[];
  saveConnections(connections: any[]): Promise<void>;
  closeConnections(connectionId: string): Promise<void>;
  refreshTree(): void;
  confirmWrite(connectionName: string): Promise<boolean>;
  notify(message: string): void;
}

export type ToggleResult =
  | { changed: false; reason: 'not-found' | 'cancelled' }
  | { changed: true; mode: AccessMode };

/** Core toggle logic with injected side effects (unit-testable). */
export async function toggleAccessModeFor(connectionId: string, deps: ToggleDeps): Promise<ToggleResult> {
  const connections = deps.getConnections().map((c) => ({ ...c }));
  const index = connections.findIndex((c) => String(c.id) === String(connectionId));
  if (index === -1) {
    return { changed: false, reason: 'not-found' };
  }
  const conn = connections[index];
  const next = toggleAccessMode(getAccessMode(conn));
  const name = conn.name || conn.host || String(connectionId);

  if (requiresWriteConfirmation(conn, next) && !(await deps.confirmWrite(name))) {
    return { changed: false, reason: 'cancelled' };
  }

  if (next === 'read') {
    conn.readOnlyMode = true;
  } else {
    delete conn.readOnlyMode;
  }
  await deps.saveConnections(connections);
  // Pools set default_transaction_read_only at connect time, so existing pools/sessions must be recycled.
  await deps.closeConnections(String(connectionId));
  deps.refreshTree();
  deps.notify(`${name}: ${accessModeLabel(next)}`);
  return { changed: true, mode: next };
}

function defaultDeps(): ToggleDeps {
  return {
    getConnections: () => vscode.workspace.getConfiguration().get<any[]>(CONNECTIONS_KEY) || [],
    saveConnections: async (connections) => {
      await vscode.workspace
        .getConfiguration()
        .update(CONNECTIONS_KEY, connections, vscode.ConfigurationTarget.Global);
    },
    closeConnections: (id) => ConnectionManager.getInstance().closeAllConnectionsById(id),
    refreshTree: () => {
      void vscode.commands.executeCommand('postgres-explorer.refreshConnections');
    },
    confirmWrite: async (name) => {
      const pick = await vscode.window.showWarningMessage(
        `Allow writes on production connection "${name}"?`,
        {
          modal: true,
          detail:
            'This switches the connection to Read/write. Open connections and transactions for it will be closed and reconnected so the change takes effect.',
        },
        SWITCH_BUTTON,
      );
      return pick === SWITCH_BUTTON;
    },
    notify: (message) => {
      void vscode.window.showInformationMessage(message);
    },
  };
}

/** Resolve a connection id from a tree item, a raw id, or the active notebook. */
export function resolveConnectionId(arg?: unknown): string | undefined {
  if (typeof arg === 'string') return arg;
  const fromItem = (arg as { connectionId?: string } | undefined)?.connectionId;
  if (fromItem) return fromItem;
  const editor = vscode.window.activeNotebookEditor;
  if (editor) {
    const meta = ConnectionUtils.getEffectiveMetadata(editor.notebook.metadata);
    return meta?.connectionId;
  }
  return undefined;
}

export async function cmdToggleReadOnlyMode(arg?: unknown, deps: ToggleDeps = defaultDeps()): Promise<void> {
  try {
    const id = resolveConnectionId(arg);
    if (!id) {
      vscode.window.showInformationMessage('No connection selected');
      return;
    }
    const result = await toggleAccessModeFor(id, deps);
    if (!result.changed && result.reason === 'not-found') {
      vscode.window.showErrorMessage('Connection not found');
    }
  } catch (err: unknown) {
    await ErrorHandlers.handleCommandError(err, 'toggle read-only mode');
  }
}
