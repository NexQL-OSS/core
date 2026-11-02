import * as vscode from 'vscode';
import { DatabaseTreeProvider, DatabaseDragAndDropController } from '../providers/DatabaseTreeProvider';
import { DatabaseTreeDocumentDropProvider } from '../providers/DatabaseTreeDocumentDropProvider';
import { PostgresNotebookProvider } from '../features/notebook/notebookProvider';
import { PostgresNotebookSerializer } from '../features/notebook/postgresNotebook';

import { ProfilesTreeProvider, SavedQueriesTreeProvider, SavedQueriesDragAndDropController } from '../providers/Phase7TreeProviders';
import { NotebooksTreeProvider, NotebooksDragAndDropController } from '../providers/NotebooksTreeProvider';
import { AutoRefreshService } from '../services/AutoRefreshService';
import { DdlViewerService } from '../services/DdlViewerService';
import { LicenseService } from '../services/LicenseService';
import { NotebookIndexService } from '../services/NotebookIndexService';
import { NEXQL_STUDIO_SQL_LANGUAGE_SELECTOR } from '../lib/nexqlSqlDocument';

function runDeferredProviderTask(outputChannel: vscode.OutputChannel, taskName: string, task: () => Promise<void>) {
  setTimeout(() => {
    void (async () => {
      const start = Date.now();
      try {
        await task();
        outputChannel.appendLine(`[startup/deferred-provider] ${taskName} completed in ${Date.now() - start}ms`);
      } catch (error) {
        outputChannel.appendLine(`[startup/deferred-provider] ${taskName} failed: ${error}`);
      }
    })();
  }, 0);
}

/** Query Studio uses a dedicated language id so built-in SQL LS does not swallow completions. */
function registerQueryStudioSqlProviders(
  context: vscode.ExtensionContext,
  outputChannel: vscode.OutputChannel,
): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sqlCompletionModule = require('../providers/SqlCompletionProvider') as typeof import('../providers/SqlCompletionProvider');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sqlSigModule = require('../providers/SqlSignatureHelpProvider') as typeof import('../providers/SqlSignatureHelpProvider');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nexqlSqlDocModule = require('../lib/nexqlSqlDocument') as typeof import('../lib/nexqlSqlDocument');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const kernelCompletionModule = require('../providers/kernel/CompletionProvider') as typeof import('../providers/kernel/CompletionProvider');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const paramActionModule = require('../providers/kernel/ParamCommentCodeActionProvider') as typeof import('../providers/kernel/ParamCommentCodeActionProvider');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const queryCodeLensModule = require('../providers/QueryCodeLensProvider') as typeof import('../providers/QueryCodeLensProvider');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dropProviderModule = require('../providers/DatabaseTreeDocumentDropProvider') as typeof import('../providers/DatabaseTreeDocumentDropProvider');

  const sqlCompletionProvider = new sqlCompletionModule.SqlCompletionProvider();
  sqlCompletionModule.SqlCompletionProvider.setInstance(sqlCompletionProvider);

  const sqlSignatureHelpProvider = new sqlSigModule.SqlSignatureHelpProvider();
  const kernelCompletionProvider = new kernelCompletionModule.CompletionProvider();
  const paramCommentActions = new paramActionModule.ParamCommentCodeActionProvider();
  const queryCodeLensProvider = new queryCodeLensModule.QueryCodeLensProvider();
  queryCodeLensModule.QueryCodeLensProvider.setInstance(queryCodeLensProvider);
  const dropProvider = new dropProviderModule.DatabaseTreeDocumentDropProvider();

  const isStudioSql = nexqlSqlDocModule.isQueryStudioSqlDocument;
  const completionTriggers = ['.', ' ', '"', '-'] as const;

  const bootstrapStudio = (doc: vscode.TextDocument) => {
    if (!sqlCompletionModule.SqlCompletionProvider.isQueryStudioSqlDocument(doc)) {
      return;
    }
    void import('../lib/queryStudioBootstrap').then((m) => m.bootstrapQueryStudioDocument(doc));
  };

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      NEXQL_STUDIO_SQL_LANGUAGE_SELECTOR,
      sqlCompletionProvider,
      ...completionTriggers,
    ),
    // Fallback while bootstrap has not yet switched language from built-in `sql`.
    vscode.languages.registerCompletionItemProvider(
      { scheme: 'file', language: 'sql' },
      nexqlSqlDocModule.gateCompletionProvider(sqlCompletionProvider, isStudioSql),
      ...completionTriggers,
    ),
    vscode.languages.registerCompletionItemProvider(
      NEXQL_STUDIO_SQL_LANGUAGE_SELECTOR,
      nexqlSqlDocModule.gateCompletionProvider(kernelCompletionProvider, isStudioSql),
      ...completionTriggers,
    ),
    vscode.languages.registerSignatureHelpProvider(
      NEXQL_STUDIO_SQL_LANGUAGE_SELECTOR,
      sqlSignatureHelpProvider,
      '(',
      ',',
    ),
    vscode.languages.registerCodeActionsProvider(
      NEXQL_STUDIO_SQL_LANGUAGE_SELECTOR,
      nexqlSqlDocModule.gateCodeActionsProvider(paramCommentActions, isStudioSql),
      { providedCodeActionKinds: paramActionModule.ParamCommentCodeActionProvider.providedKinds },
    ),
    vscode.languages.registerCodeLensProvider(
      NEXQL_STUDIO_SQL_LANGUAGE_SELECTOR,
      nexqlSqlDocModule.gateCodeLensProvider(queryCodeLensProvider, isStudioSql),
    ),
    vscode.languages.registerDocumentDropEditProvider(
      NEXQL_STUDIO_SQL_LANGUAGE_SELECTOR,
      nexqlSqlDocModule.gateDocumentDropProvider(dropProvider, isStudioSql),
    ),
    vscode.workspace.onDidOpenTextDocument(bootstrapStudio),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        bootstrapStudio(editor.document);
      }
    }),
  );

  for (const doc of vscode.workspace.textDocuments) {
    bootstrapStudio(doc);
  }

  outputChannel.appendLine('[startup] Query Studio SQL providers registered (nexql-studio-sql).');
}

export function registerProviders(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel) {
  // Create database tree provider instance
  const databaseTreeProvider = new DatabaseTreeProvider(context);

  // Refresh tree when license changes
  context.subscriptions.push(
    LicenseService.getInstance().onDidChangeLicense(() => {
      databaseTreeProvider.refresh();
    })
  );

  // Refresh tree when active color theme changes
  context.subscriptions.push(
    vscode.window.onDidChangeActiveColorTheme(() => {
      try {
        const { clearIconCache } = require('../providers/tree/treeIconTheme');
        clearIconCache();
      } catch (err) {
        outputChannel.appendLine(`Failed to clear icon cache on theme change: ${err}`);
      }
      databaseTreeProvider.refresh();
    })
  );

  // Register tree data provider and create tree view
  const databaseDragAndDropController = new DatabaseDragAndDropController(databaseTreeProvider, context);
  const treeView = vscode.window.createTreeView('postgresExplorer', {
    treeDataProvider: databaseTreeProvider,
    showCollapseAll: true,
    dragAndDropController: databaseDragAndDropController
  });
  context.subscriptions.push(treeView);
  const ddlViewerService = new DdlViewerService(context, treeView);
  context.subscriptions.push(ddlViewerService);

  // Update context key when selection changes to enable Add/Remove favorites menu switching
  treeView.onDidChangeSelection(e => {
    if (e.selection.length > 0) {
      const item = e.selection[0];
      vscode.commands.executeCommand('setContext', 'postgresExplorer.isFavorite', item.isFavorite === true);
    } else {
      vscode.commands.executeCommand('setContext', 'postgresExplorer.isFavorite', false);
    }
  });

  // ChatViewProvider and MCP registrations have been moved to the pro index seam.

  // Register notebook providers
  const notebookProvider = new PostgresNotebookProvider();
  context.subscriptions.push(
    vscode.workspace.registerNotebookSerializer('postgres-notebook', notebookProvider),
    vscode.workspace.registerNotebookSerializer('postgres-query', new PostgresNotebookSerializer())
  );

  // Intercept drops from the DB explorer tree into notebook cell editors.
  const documentDropProvider = new DatabaseTreeDocumentDropProvider();
  context.subscriptions.push(
    vscode.languages.registerDocumentDropEditProvider(
      { scheme: 'vscode-notebook-cell', language: 'sql' },
      documentDropProvider
    ),
    vscode.languages.registerDocumentDropEditProvider(
      { scheme: 'vscode-notebook-cell', language: 'postgres' },
      documentDropProvider
    ),
  );

  // Query Studio SQL — register synchronously (dedicated language; must not wait for deferred startup).
  registerQueryStudioSqlProviders(context, outputChannel);

  // Register SQL completion provider, CodeLens, and query history lazily (notebook cells).
  runDeferredProviderTask(outputChannel, 'registerSqlCompletionProvider', async () => {
    const sqlCompletionModule = await import('../providers/SqlCompletionProvider');
    const sqlSigModule = await import('../providers/SqlSignatureHelpProvider');

    let sqlCompletionProvider = sqlCompletionModule.SqlCompletionProvider.getInstance();
    if (!sqlCompletionProvider) {
      sqlCompletionProvider = new sqlCompletionModule.SqlCompletionProvider();
      sqlCompletionModule.SqlCompletionProvider.setInstance(sqlCompletionProvider);
    }
    const sqlSignatureHelpProvider = new sqlSigModule.SqlSignatureHelpProvider();

    const warmSqlCompletionCache = (notebook: vscode.NotebookDocument) => {
      const meta = notebook.metadata as { connectionId?: string; databaseName?: string } | undefined;
      if (!meta?.connectionId) {
        return;
      }
      const nbType = notebook.notebookType;
      if (nbType !== 'postgres-notebook' && nbType !== 'postgres-query') {
        return;
      }
      const database = meta.databaseName || 'postgres';
      void sqlCompletionProvider.warmCache(meta.connectionId, database);
    };

    context.subscriptions.push(
      vscode.languages.registerCompletionItemProvider(
        { scheme: 'vscode-notebook-cell', language: 'sql' },
        sqlCompletionProvider,
        '.', ' ', '"', '-',
      ),
      vscode.languages.registerCompletionItemProvider(
        { scheme: 'vscode-notebook-cell', language: 'postgres' },
        sqlCompletionProvider,
        '.', ' ', '"', '-',
      ),
      vscode.languages.registerSignatureHelpProvider(
        { scheme: 'vscode-notebook-cell', language: 'sql' },
        sqlSignatureHelpProvider,
        '(', ',',
      ),
      vscode.languages.registerSignatureHelpProvider(
        { scheme: 'vscode-notebook-cell', language: 'postgres' },
        sqlSignatureHelpProvider,
        '(', ',',
      ),
      vscode.workspace.onDidOpenNotebookDocument(doc => {
        warmSqlCompletionCache(doc);
      }),
    );

    for (const nb of vscode.workspace.notebookDocuments) {
      warmSqlCompletionCache(nb);
    }
  });

  runDeferredProviderTask(outputChannel, 'registerQueryCodeLensProvider', async () => {
    const queryCodeLensModule = await import('../providers/QueryCodeLensProvider');
    let queryCodeLensProvider = queryCodeLensModule.QueryCodeLensProvider.getInstance();
    if (!queryCodeLensProvider) {
      queryCodeLensProvider = new queryCodeLensModule.QueryCodeLensProvider();
      queryCodeLensModule.QueryCodeLensProvider.setInstance(queryCodeLensProvider);
    }

    context.subscriptions.push(
      vscode.languages.registerCodeLensProvider(
        { language: 'postgres', scheme: 'vscode-notebook-cell' },
        queryCodeLensProvider
      ),
      vscode.languages.registerCodeLensProvider(
        { language: 'sql', scheme: 'vscode-notebook-cell' },
        queryCodeLensProvider
      ),
    );
    outputChannel.appendLine('QueryCodeLensProvider registered for EXPLAIN actions.');
  });

  runDeferredProviderTask(outputChannel, 'registerDdlSafety', async () => {
    const { registerDdlSafety } = await import('../providers/DdlSafetyProvider');
    registerDdlSafety(context);
    outputChannel.appendLine('DDL lock-safety diagnostics registered.');
  });

  runDeferredProviderTask(outputChannel, 'registerDryRunContext', async () => {
    const dryRunModule = await import('../commands/dryRun');
    dryRunModule.registerDryRunContext(context);
  });

  runDeferredProviderTask(outputChannel, 'registerQueryHistoryProvider', async () => {
    const queryHistoryModule = await import('../providers/QueryHistoryProvider');
    const queryHistoryProvider = new queryHistoryModule.QueryHistoryProvider();

    context.subscriptions.push(
      vscode.window.registerTreeDataProvider('postgresExplorer.history', queryHistoryProvider)
    );

    // Store query history provider instance for command access
    await context.workspaceState.update('queryHistoryProviderInstance', queryHistoryProvider);
  });

  // Phase 7: Register Saved Queries Tree Provider
  const savedQueriesTreeProvider = new SavedQueriesTreeProvider();
  const savedQueriesDragAndDropController = new SavedQueriesDragAndDropController();
  const savedQueriesTreeView = vscode.window.createTreeView('postgresExplorer.savedQueries', {
    treeDataProvider: savedQueriesTreeProvider,
    dragAndDropController: savedQueriesDragAndDropController
  });
  context.subscriptions.push(savedQueriesTreeView);

  // Notebooks panel — browse all notebooks in globalStorage
  const notebooksTreeProvider = new NotebooksTreeProvider(context.globalStorageUri, context);
  const notebooksDragAndDropController = new NotebooksDragAndDropController();
  const notebooksTreeView = vscode.window.createTreeView('postgresExplorer.notebooks', {
    treeDataProvider: notebooksTreeProvider,
    showCollapseAll: true,
    dragAndDropController: notebooksDragAndDropController
  });
  context.subscriptions.push(notebooksTreeView);

  // Initialize NotebookIndexService on startup
  const notebookIndexService = NotebookIndexService.initialize(context.globalStorageUri);
  notebookIndexService.ensureInitialized().then(() => {
    databaseTreeProvider.refresh();
    notebooksTreeProvider.refresh();
  });

  // Track MRU notebooks when notebook documents are opened
  context.subscriptions.push(
    vscode.workspace.onDidOpenNotebookDocument(async doc => {
      const nbType = doc.notebookType;
      if (nbType === 'postgres-notebook' || nbType === 'postgres-query') {
        const uri = doc.uri;
        if (uri.scheme === 'file') {
          const mru = context.globalState.get<string[]>('postgresExplorer.mruNotebooks', []) || [];
          const updatedMru = [uri.fsPath, ...mru.filter(p => p !== uri.fsPath)].slice(0, 50);
          await context.globalState.update('postgresExplorer.mruNotebooks', updatedMru);
        }
      }
    })
  );

  // Auto-refresh service — keeps the explorer and notebooks panel in sync
  const autoRefreshService = new AutoRefreshService(
    databaseTreeProvider,
    notebooksTreeProvider,
    context.globalStorageUri,
    outputChannel
  );
  autoRefreshService.start();
  databaseTreeProvider.setAutoRefreshService(autoRefreshService);

  return {
    databaseTreeProvider,
    treeView,
    ddlViewerService,
    chatViewProviderInstance: undefined,
    queryHistoryProvider: undefined,
    savedQueriesTreeProvider,
    notebooksTreeProvider,
    autoRefreshService
  };
}
