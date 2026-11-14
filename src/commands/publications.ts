import * as vscode from 'vscode';
import { DatabaseTreeItem } from '../providers/DatabaseTreeProvider';
import { getDatabaseConnection, NotebookBuilder, MarkdownUtils } from './helper';
import { PublicationSQL } from './sql/publications';

export async function cmdListPublications(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  const { metadata, release } = await getDatabaseConnection(item);
  try {
    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header('Publications') +
        MarkdownUtils.infoBox('Publications define which tables are replicated to subscribers in logical replication. Requires PostgreSQL 10+.')
      )
      .addSql(PublicationSQL.list())
      .showTemp();
  } finally {
    release();
  }
}

export async function cmdCreatePublication(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  const { metadata, release } = await getDatabaseConnection(item);
  try {
    const name = await vscode.window.showInputBox({
      prompt: 'Enter publication name',
      placeHolder: 'my_publication',
      validateInput: v => v ? null : 'Name cannot be empty'
    });
    if (!name) { return; }
    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`Create Publication: ${name}`) +
        MarkdownUtils.infoBox('Choose to publish all tables or specific tables. Uncomment and adjust the appropriate statement.')
      )
      .addSql(PublicationSQL.create(name))
      .showTemp();
  } finally {
    release();
  }
}

export async function cmdDropPublication(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  const pubName = item.label;
  const confirm = await vscode.window.showWarningMessage(
    `Drop publication "${pubName}"? Subscriptions connected to this publication will break.`,
    { modal: true },
    'Drop'
  );
  if (confirm !== 'Drop') { return; }
  const { metadata, release } = await getDatabaseConnection(item);
  try {
    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`Drop Publication: ${pubName}`) +
        MarkdownUtils.dangerBox(`Dropping publication "${pubName}". Any subscriptions to this publication will fail.`)
      )
      .addSql(PublicationSQL.drop(pubName))
      .showTemp();
  } finally {
    release();
  }
}

export async function cmdShowPublicationProperties(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  const { metadata, release } = await getDatabaseConnection(item);
  try {
    const pubName = item.label;
    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`Publication Properties: ${pubName}`) +
        MarkdownUtils.infoBox('Shows published operations, tables, and replication settings.')
      )
      .addSql(PublicationSQL.getDefinition(pubName))
      .showTemp();
  } finally {
    release();
  }
}

export async function cmdListSubscriptions(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  const { metadata, release } = await getDatabaseConnection(item);
  try {
    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header('Subscriptions') +
        MarkdownUtils.infoBox('Subscriptions connect to a publisher and receive replicated data. Requires superuser or pg_create_subscription privilege.')
      )
      .addSql(PublicationSQL.listSubscriptions())
      .showTemp();
  } finally {
    release();
  }
}

export async function cmdDropSubscription(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  const subName = item.label;
  const confirm = await vscode.window.showWarningMessage(
    `Drop subscription "${subName}"? Replication will stop immediately.`,
    { modal: true },
    'Drop'
  );
  if (confirm !== 'Drop') { return; }
  const { metadata, release } = await getDatabaseConnection(item);
  try {
    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`Drop Subscription: ${subName}`) +
        MarkdownUtils.dangerBox(`Dropping subscription "${subName}". Replication from the publisher will stop.`)
      )
      .addSql(PublicationSQL.dropSubscription(subName))
      .showTemp();
  } finally {
    release();
  }
}

export async function cmdShowSubscriptionProperties(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  const { metadata, release } = await getDatabaseConnection(item);
  try {
    const subName = item.label;
    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`Subscription Properties: ${subName}`) +
        MarkdownUtils.infoBox('Shows connection info, publications, slot name, and sync status.')
      )
      .addSql(PublicationSQL.getSubscriptionDefinition(subName))
      .showTemp();
  } finally {
    release();
  }
}

export async function cmdPublicationOperations(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  const { metadata, release } = await getDatabaseConnection(item);
  try {
    const pubName = item.label;
    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`Publication Operations: ${pubName}`) +
        MarkdownUtils.operationsTable([
          { operation: 'Properties', description: 'View publication details and tables', riskLevel: 'Safe' },
          { operation: 'Drop', description: 'Drop the publication', riskLevel: 'High' },
        ])
      )
      .addMarkdown('##### Publication Details')
      .addSql(PublicationSQL.getDefinition(pubName))
      .addMarkdown('##### Drop Publication — WARNING: breaks connected subscriptions')
      .addSql(PublicationSQL.drop(pubName))
      .showTemp();
  } finally {
    release();
  }
}
