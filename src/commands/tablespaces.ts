import * as vscode from 'vscode';
import { DatabaseTreeItem } from '../providers/DatabaseTreeProvider';
import { getDatabaseConnection, NotebookBuilder, MarkdownUtils } from './helper';
import { TablespaceSQL } from './sql/tablespaces';

export async function cmdListTablespaces(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  const { metadata, release } = await getDatabaseConnection(item);
  try {
    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header('Tablespaces') +
        MarkdownUtils.infoBox('Tablespaces define locations on disk where PostgreSQL stores database files. Requires superuser to create.')
      )
      .addSql(TablespaceSQL.list())
      .showTemp();
  } finally {
    release();
  }
}

export async function cmdShowTablespaceProperties(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  const { metadata, release } = await getDatabaseConnection(item);
  try {
    const tablespaceName = item.label;
    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`Tablespace Properties: ${tablespaceName}`) +
        MarkdownUtils.infoBox('Shows location, owner, size, and objects stored in this tablespace.')
      )
      .addSql(TablespaceSQL.getDefinition(tablespaceName))
      .addMarkdown('##### Objects in Tablespace')
      .addSql(TablespaceSQL.listObjects(tablespaceName))
      .showTemp();
  } finally {
    release();
  }
}

export async function cmdTablespaceOperations(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  const { metadata, release } = await getDatabaseConnection(item);
  try {
    const tablespaceName = item.label;
    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`Tablespace Operations: ${tablespaceName}`) +
        MarkdownUtils.operationsTable([
          { operation: 'Properties', description: 'View tablespace details and size', riskLevel: 'Safe' },
          { operation: 'Objects', description: 'List objects stored in this tablespace', riskLevel: 'Safe' },
          { operation: 'Drop', description: 'Drop the tablespace (must be empty)', riskLevel: 'High' },
        ])
      )
      .addMarkdown('##### Tablespace Details')
      .addSql(TablespaceSQL.getDefinition(tablespaceName))
      .addMarkdown('##### Objects in Tablespace')
      .addSql(TablespaceSQL.listObjects(tablespaceName))
      .addMarkdown('##### Drop Tablespace — WARNING: tablespace must be empty first')
      .addSql(TablespaceSQL.drop(tablespaceName))
      .showTemp();
  } finally {
    release();
  }
}
