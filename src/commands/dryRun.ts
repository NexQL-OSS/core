import * as vscode from 'vscode';
import { analyzeDryRun, cellHasDryRunnableWrite } from '../services/dryRun/dryRunAnalyzer';
import { requestDryRun } from '../services/dryRun/DryRunRequests';

function findCellByUri(uri: vscode.Uri): vscode.NotebookCell | undefined {
  const key = uri.toString();
  for (const nb of vscode.workspace.notebookDocuments ?? []) {
    const cell = nb.getCells().find((c) => c.document.uri.toString() === key);
    if (cell) {
      return cell;
    }
  }
  return undefined;
}

function resolveCell(target?: unknown): vscode.NotebookCell | undefined {
  const t = target as { document?: { uri?: vscode.Uri }; notebook?: unknown; scheme?: string } | undefined;
  if (t && t.notebook && t.document) {
    return target as vscode.NotebookCell;
  }
  if (t && typeof t.scheme === 'string') {
    return findCellByUri(target as vscode.Uri);
  }
  const editor = vscode.window.activeNotebookEditor;
  if (editor && editor.selection && editor.selection.start < editor.notebook.cellCount) {
    return editor.notebook.cellAt(editor.selection.start);
  }
  return undefined;
}

/**
 * `postgres-explorer.dryRunCell`: run the cell as a dry run (execute, show what would change,
 * always roll back). Accepts a NotebookCell (cell toolbar), a cell document Uri (CodeLens) or
 * nothing (active cell).
 */
export async function cmdDryRunCell(target?: unknown): Promise<void> {
  const cell = resolveCell(target);
  if (!cell) {
    vscode.window.showWarningMessage('Select a SQL notebook cell to dry run.');
    return;
  }
  const analysis = analyzeDryRun(cell.document.getText());
  if (!analysis.ok) {
    vscode.window.showWarningMessage(`Dry run not possible: ${analysis.reason}`);
    return;
  }
  requestDryRun(cell.document.uri.toString());
  await vscode.commands.executeCommand('notebook.cell.execute', {
    ranges: [new vscode.NotebookRange(cell.index, cell.index + 1)],
    document: cell.notebook.uri,
  });
}

export const DRY_RUN_CONTEXT_KEY = 'postgresExplorer.cellHasDryRunnableWrite';

/**
 * Keeps a context key in sync with the selected notebook cell so the cell toolbar entry is
 * only offered when the cell holds a dry-runnable DML/DDL statement.
 */
export function registerDryRunContext(context: vscode.ExtensionContext): void {
  let last: boolean | undefined;
  const update = () => {
    let value = false;
    try {
      const editor = vscode.window.activeNotebookEditor;
      if (editor && editor.selection && editor.selection.start < editor.notebook.cellCount) {
        const cell = editor.notebook.cellAt(editor.selection.start);
        value = cell.kind === vscode.NotebookCellKind.Code && cellHasDryRunnableWrite(cell.document.getText());
      }
    } catch {
      value = false;
    }
    if (value !== last) {
      last = value;
      void vscode.commands.executeCommand('setContext', DRY_RUN_CONTEXT_KEY, value);
    }
  };
  context.subscriptions.push(
    vscode.window.onDidChangeActiveNotebookEditor(update),
    vscode.window.onDidChangeNotebookEditorSelection(update),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.scheme === 'vscode-notebook-cell') {
        update();
      }
    }),
  );
  update();
}
