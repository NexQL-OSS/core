import * as vscode from 'vscode';
import { appendWorkspaceConnection, getStoredConnections, ConnectionInfo } from '../features/connections/connectionStore';
import {
  exportToToml,
  importProfiles,
  NEXQL_CONFIG_RELATIVE_PATH,
} from '../features/connections/nexqlConfig';
import { SecretStorageService } from '../services/SecretStorageService';
import { DatabaseTreeProvider } from '../providers/DatabaseTreeProvider';
import { ErrorHandlers } from './helper';

function workspaceConfigUri(): vscode.Uri | undefined {
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder ? vscode.Uri.joinPath(folder.uri, NEXQL_CONFIG_RELATIVE_PATH) : undefined;
}

async function readText(uri: vscode.Uri): Promise<string | undefined> {
  try {
    return Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
  } catch {
    return undefined;
  }
}

export async function cmdExportConnectionsToNexqlConfig(): Promise<void> {
  try {
    const target = workspaceConfigUri();
    if (!target) {
      vscode.window.showWarningMessage('Open a workspace folder to write .nexql/config.toml.');
      return;
    }
    const conns = getStoredConnections();
    if (!conns.length) {
      vscode.window.showInformationMessage('No saved connections to export.');
      return;
    }
    const picks = await vscode.window.showQuickPick(
      conns.map((c) => ({
        label: c.name || `${c.host}:${c.port}`,
        description: `${c.host}:${c.port}/${c.database ?? ''}`,
        picked: true,
        conn: c,
      })),
      { canPickMany: true, title: 'Export connections to .nexql/config.toml', placeHolder: 'Passwords and SSH keys are never exported' },
    );
    if (!picks?.length) {
      return;
    }

    const existingText = await readText(target);
    let mode: 'merge' | 'replace' = 'replace';
    if (existingText !== undefined) {
      const choice = await vscode.window.showQuickPick(
        [
          { label: 'Merge', description: 'Keep existing profiles; overwrite same-named ones', mode: 'merge' as const },
          { label: 'Replace', description: 'Replace all existing profiles', mode: 'replace' as const },
        ],
        { title: '.nexql/config.toml already exists' },
      );
      if (!choice) {
        return;
      }
      mode = choice.mode;
    }

    const text = exportToToml(picks.map((p) => p.conn), { existingText, mode });
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(target, '..'));
    await vscode.workspace.fs.writeFile(target, Buffer.from(text, 'utf8'));
    const open = await vscode.window.showInformationMessage(
      `Exported ${picks.length} connection(s) to ${NEXQL_CONFIG_RELATIVE_PATH} (no secrets).`,
      'Open',
    );
    if (open) {
      await vscode.window.showTextDocument(target);
    }
  } catch (err: unknown) {
    await ErrorHandlers.handleCommandError(err, 'export connections to .nexql/config.toml');
  }
}

export async function cmdImportConnectionsFromNexqlConfig(
  context: vscode.ExtensionContext,
  databaseTreeProvider: DatabaseTreeProvider,
): Promise<void> {
  try {
    let source = workspaceConfigUri();
    let text = source ? await readText(source) : undefined;
    if (text === undefined) {
      const picked = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { TOML: ['toml'] },
        title: 'Select a nexql-mcp config.toml',
      });
      if (!picked?.[0]) {
        return;
      }
      source = picked[0];
      text = await readText(source);
      if (text === undefined) {
        vscode.window.showErrorMessage('Could not read the selected file.');
        return;
      }
    }

    let profiles;
    try {
      profiles = importProfiles(text);
    } catch (e: unknown) {
      vscode.window.showErrorMessage(`Invalid TOML: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    if (!profiles.length) {
      vscode.window.showInformationMessage('No [profiles] found in the config file.');
      return;
    }

    const existingNames = new Set(getStoredConnections().map((c) => c.name));
    const picks = await vscode.window.showQuickPick(
      profiles.map((p) => ({
        label: p.name,
        description: `${p.connection.host}:${p.connection.port}/${p.connection.database ?? ''}`,
        detail: [
          existingNames.has(p.name) ? 'duplicate name (will ask to rename)' : '',
          ...p.warnings,
        ].filter(Boolean).join(' | ') || undefined,
        picked: !existingNames.has(p.name),
        profile: p,
      })),
      { canPickMany: true, title: 'Import connections from nexql config' },
    );
    if (!picks?.length) {
      return;
    }

    let imported = 0;
    for (const pick of picks) {
      let name = pick.profile.name;
      while (existingNames.has(name)) {
        const renamed = await vscode.window.showInputBox({
          title: `"${name}" already exists`,
          prompt: 'Enter a new name, or leave empty to skip this connection',
          value: `${name} (imported)`,
          ignoreFocusOut: true,
        });
        if (!renamed?.trim()) {
          name = '';
          break;
        }
        name = renamed.trim();
      }
      if (!name) {
        continue;
      }
      const id = `nexql-${Date.now()}-${imported}`;
      const info: ConnectionInfo = { ...pick.profile.connection, id, name };
      const password = await vscode.window.showInputBox({
        title: `Password for "${name}"`,
        prompt: `${info.username ?? ''}@${info.host}:${info.port} - leave empty to set it later`,
        password: true,
        ignoreFocusOut: true,
      });
      await appendWorkspaceConnection(context, info);
      if (password) {
        await SecretStorageService.getInstance().setPassword(id, password);
      }
      existingNames.add(name);
      imported++;
    }
    databaseTreeProvider.refresh();
    vscode.window.showInformationMessage(`Imported ${imported} connection(s).`);
  } catch (err: unknown) {
    await ErrorHandlers.handleCommandError(err, 'import connections from .nexql/config.toml');
  }
}
