import * as vscode from 'vscode';
import { Debouncer } from '../lib/debounce';
import { analyzeDdlLockRisk, absoluteRange, DdlFinding, DdlSeverity } from '../services/ddlLockRisk';

export const DDL_SAFETY_SETTING = 'ddlSafety.enabled';
const DIAGNOSTIC_SOURCE = 'NexQL DDL safety';
const DEBOUNCE_MS = 400;

const SELECTOR: vscode.DocumentSelector = [
  { language: 'postgres', scheme: 'vscode-notebook-cell' },
  { language: 'sql', scheme: 'vscode-notebook-cell' },
];

export function isDdlSafetyEnabled(): boolean {
  return vscode.workspace.getConfiguration('postgresExplorer').get<boolean>(DDL_SAFETY_SETTING, true);
}

function toSeverity(s: DdlSeverity): vscode.DiagnosticSeverity {
  switch (s) {
    case 'danger': return vscode.DiagnosticSeverity.Error;
    case 'warning': return vscode.DiagnosticSeverity.Warning;
    default: return vscode.DiagnosticSeverity.Information;
  }
}

/** Diagnostic carrying the data the quick fix needs. */
interface DdlDiagnostic extends vscode.Diagnostic {
  ddlFix?: { saferSql: string; start: number; end: number };
}

function isSqlCell(doc: vscode.TextDocument): boolean {
  return doc.uri.scheme === 'vscode-notebook-cell' && (doc.languageId === 'postgres' || doc.languageId === 'sql');
}

export function buildDiagnostics(doc: vscode.TextDocument): vscode.Diagnostic[] {
  const text = doc.getText();
  return analyzeDdlLockRisk(text).map((f: DdlFinding) => {
    const abs = absoluteRange(f);
    const d: DdlDiagnostic = new vscode.Diagnostic(
      new vscode.Range(doc.positionAt(abs.start), doc.positionAt(abs.end)),
      f.message,
      toSeverity(f.severity),
    );
    d.source = DIAGNOSTIC_SOURCE;
    d.code = f.rule;
    if (f.saferSql !== undefined) {
      d.ddlFix = { saferSql: f.saferSql, start: f.statementRange.start, end: f.statementRange.end };
    }
    return d;
  });
}

export class DdlSafetyCodeActionProvider implements vscode.CodeActionProvider {
  static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  provideCodeActions(doc: vscode.TextDocument, _range: vscode.Range, context: vscode.CodeActionContext): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    for (const diag of context.diagnostics) {
      const fix = (diag as DdlDiagnostic).ddlFix;
      if (diag.source !== DIAGNOSTIC_SOURCE || !fix) { continue; }
      const title = diag.code === 'create-index-not-concurrent' || diag.code === 'reindex-not-concurrent'
        ? 'Use CONCURRENTLY'
        : 'Apply safer form (NOT VALID + VALIDATE)';
      const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
      action.diagnostics = [diag];
      action.isPreferred = true;
      const edit = new vscode.WorkspaceEdit();
      edit.replace(doc.uri, new vscode.Range(doc.positionAt(fix.start), doc.positionAt(fix.end)), fix.saferSql);
      action.edit = edit;
      actions.push(action);
    }
    return actions;
  }
}

/** Registers diagnostics + quick fixes for notebook SQL cells. */
export function registerDdlSafety(context: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection('nexql-ddl-safety');
  const debouncer = new Debouncer();

  const refresh = (doc: vscode.TextDocument) => {
    if (!isSqlCell(doc)) { return; }
    if (!isDdlSafetyEnabled()) {
      collection.delete(doc.uri);
      return;
    }
    try {
      collection.set(doc.uri, buildDiagnostics(doc));
    } catch {
      collection.delete(doc.uri);
    }
  };

  const schedule = (doc: vscode.TextDocument) => {
    if (!isSqlCell(doc)) { return; }
    debouncer.debounce(doc.uri.toString(), () => refresh(doc), DEBOUNCE_MS);
  };

  context.subscriptions.push(
    collection,
    { dispose: () => debouncer.clear() },
    vscode.workspace.onDidOpenTextDocument(refresh),
    vscode.workspace.onDidChangeTextDocument(e => schedule(e.document)),
    vscode.workspace.onDidCloseTextDocument(doc => {
      debouncer.cancel(doc.uri.toString());
      collection.delete(doc.uri);
    }),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (!e.affectsConfiguration(`postgresExplorer.${DDL_SAFETY_SETTING}`)) { return; }
      if (!isDdlSafetyEnabled()) {
        collection.clear();
      } else {
        vscode.workspace.textDocuments.forEach(refresh);
      }
    }),
    vscode.languages.registerCodeActionsProvider(SELECTOR, new DdlSafetyCodeActionProvider(), {
      providedCodeActionKinds: DdlSafetyCodeActionProvider.providedCodeActionKinds,
    }),
  );

  vscode.workspace.textDocuments.forEach(refresh);
}
