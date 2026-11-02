import * as vscode from 'vscode';
import { SqlSafetyAnalyzer } from '../services/sqlSafety';
import { FullDatasetPreferenceService } from '../services/FullDatasetPreferenceService';
import { SqlParser } from './kernel/SqlParser';
import { isNexqlManagedSqlDocument, isQueryStudioSqlDocument } from '../lib/nexqlSqlDocument';
import { isNexqlStudioSqlLanguage } from '../lib/nexqlStudioSqlLanguage';
import { resolveRunnableSqlFromDocument } from '../lib/resolveRunnableSql';
import { cellHasDryRunnableWrite } from '../services/dryRun/dryRunAnalyzer';

export interface PillData {
  success: boolean;
  elapsedSeconds?: number;
  rowCount?: number;
}

/** Non-interactive dot between CodeLens action groups (VS Code has no chip styling). */
function pushCodeLensSeparator(lenses: vscode.CodeLens[], range: vscode.Range): void {
  lenses.push(
    new vscode.CodeLens(range, {
      title: '$(circle-small-filled)',
      command: '',
    }),
  );
}

/**
 * Provides CodeLens actions for SQL queries in notebook cells
 * Detects SELECT queries and offers EXPLAIN and EXPLAIN ANALYZE options
 */
export class QueryCodeLensProvider implements vscode.CodeLensProvider {
  private static _instance: QueryCodeLensProvider | undefined;

  public static getInstance(): QueryCodeLensProvider | undefined {
    return QueryCodeLensProvider._instance;
  }

  public static setInstance(instance: QueryCodeLensProvider): void {
    QueryCodeLensProvider._instance = instance;
  }

  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;
  private pillData: Map<string, PillData> = new Map();
  private aiWorkingCells: Set<string> = new Set();

  public setAiWorking(cellUri: string, working: boolean): void {
    if (working) {
      this.aiWorkingCells.add(cellUri);
    } else {
      this.aiWorkingCells.delete(cellUri);
    }
    this._onDidChangeCodeLenses.fire();
  }

  public isAiWorking(cellUri: string): boolean {
    return this.aiWorkingCells.has(cellUri);
  }

  public refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  public updatePill(cellUri: string, data: PillData): void {
    this.pillData.set(cellUri, data);
    this._onDidChangeCodeLenses.fire();
  }

  provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] {
    if (!isNexqlManagedSqlDocument(document)) {
      return [];
    }

    if (
      document.languageId !== 'postgres' &&
      document.languageId !== 'sql' &&
      !isNexqlStudioSqlLanguage(document.languageId)
    ) {
      return [];
    }

    const text = isQueryStudioSqlDocument(document)
      ? resolveRunnableSqlFromDocument(document).trim()
      : document.getText().trim();

    // Don't show CodeLens for empty cells
    if (!text) {
      return [];
    }

    // Check if it's already an EXPLAIN query
    const isExplainQuery = /^\s*EXPLAIN/i.test(text);

    const codeLenses: vscode.CodeLens[] = [];
    const range = new vscode.Range(0, 0, 0, 0);
    const isAiWorking = this.aiWorkingCells.has(document.uri.toString());

    // Group: AI
    codeLenses.push(
      new vscode.CodeLens(range, {
        title: isAiWorking ? '$(loading~spin) Working...' : '$(sparkle) Ask AI',
        tooltip: isAiWorking ? 'AI is analyzing your query...' : 'Ask AI to modify this query',
        command: isAiWorking ? '' : 'postgres-explorer.aiAssist',
        arguments: [],
      }),
    );
    codeLenses.push(
      new vscode.CodeLens(range, {
        title: '$(comment) Chat',
        tooltip: 'Open NexQL Bot chat with this query',
        command: 'postgres-explorer.chatWithQuery',
        arguments: [],
      }),
    );

    pushCodeLensSeparator(codeLenses, range);

    // Group: library
    codeLenses.push(
      new vscode.CodeLens(range, {
        title: '$(bookmark) Save Query',
        tooltip: 'Save this query to the library for easy reuse',
        command: 'postgres-explorer.saveQueryToLibraryUI',
      }),
    );

    const params = SqlParser.detectParameters(text);
    const hasParams =
      params.positional.length > 0 || params.named.length > 0 || params.quoted.length > 0;
    const showFullDatasetToggle =
      !isExplainQuery && SqlSafetyAnalyzer.getInstance().isReadOnlyQuery(text) && !hasParams;

    const runGroupLenses: vscode.CodeLens[] = [];

    if (showFullDatasetToggle) {
      const fullDatasetEnabled = FullDatasetPreferenceService.isEnabled(document.uri.toString(), text);
      runGroupLenses.push(
        new vscode.CodeLens(range, {
          title: fullDatasetEnabled ? '$(check-all) Full dataset' : '$(table) Full dataset',
          tooltip: fullDatasetEnabled
            ? 'Full dataset enabled — next run loads all rows (click to disable)'
            : 'Next run loads all rows (disables streaming window + auto-LIMIT). May be slow on large results.',
          command: 'postgres-explorer.toggleFullDatasetForCell',
          arguments: [document.uri],
        }),
      );
    }

    if (!isExplainQuery) {
      runGroupLenses.push(
        new vscode.CodeLens(range, {
          title: '$(type-hierarchy-sub) Explain Analyze',
          tooltip: 'Show query execution plan with actual runtime statistics',
          command: isQueryStudioSqlDocument(document)
            ? 'postgres-explorer.queryStudio.explainAnalyze'
            : 'postgres-explorer.explainQuery',
          arguments: isQueryStudioSqlDocument(document) ? [] : [document.uri, true],
        }),
      );
    }

    // Dry run: only for notebook cells whose content is a single supported DML/DDL statement.
    if (
      !isExplainQuery &&
      document.uri.scheme === 'vscode-notebook-cell' &&
      cellHasDryRunnableWrite(text)
    ) {
      runGroupLenses.push(
        new vscode.CodeLens(range, {
          title: '$(debug-reverse-continue) Dry run',
          tooltip: 'Run this statement, show what it would change, then always roll back. Nothing is saved.',
          command: 'postgres-explorer.dryRunCell',
          arguments: [document.uri],
        }),
      );
    }

    if (runGroupLenses.length > 0) {
      pushCodeLensSeparator(codeLenses, range);
      codeLenses.push(...runGroupLenses);
    }

    const pill = this.pillData.get(document.uri.toString());
    if (pill) {
      pushCodeLensSeparator(codeLenses, range);
      const pillTitle = pill.success
        ? `$(verified-filled) ${pill.elapsedSeconds}s · ${pill.rowCount} rows`
        : '$(error) Failed';
      codeLenses.push(
        new vscode.CodeLens(range, {
          title: pillTitle,
          tooltip: pill.success ? 'Last execution result' : 'Last execution failed',
          command: '',
        }),
      );
    }

    return codeLenses;
  }
}
