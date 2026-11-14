import * as vscode from 'vscode';
import { DatabaseTreeItem } from '../providers/DatabaseTreeProvider';
import { getDatabaseConnection, NotebookBuilder, MarkdownUtils } from './helper';
import { DomainSQL } from './sql/domains';

export async function cmdListDomains(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  const { metadata, release } = await getDatabaseConnection(item);
  try {
    const schema = item.schema!;
    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`Domains in Schema: ${schema}`) +
        MarkdownUtils.infoBox('Domains are user-defined data types with optional constraints. They are based on existing types.')
      )
      .addSql(DomainSQL.list(schema))
      .showTemp();
  } finally {
    release();
  }
}

export async function cmdCreateDomain(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  const { metadata, release } = await getDatabaseConnection(item);
  try {
    const schema = item.schema!;
    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`Create Domain in Schema: ${schema}`) +
        MarkdownUtils.infoBox('Domains constrain an existing base type with optional NOT NULL, DEFAULT, and CHECK constraints.')
      )
      .addSql(DomainSQL.create(schema))
      .showTemp();
  } finally {
    release();
  }
}

export async function cmdDropDomain(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  const domainName = item.label;
  const confirm = await vscode.window.showWarningMessage(
    `Drop domain "${domainName}"? This action cannot be undone.`,
    { modal: true },
    'Drop'
  );
  if (confirm !== 'Drop') { return; }
  const { metadata, release } = await getDatabaseConnection(item);
  try {
    const schema = item.schema!;
    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`Drop Domain: ${schema}.${domainName}`) +
        MarkdownUtils.dangerBox(`Dropping domain "${schema}"."${domainName}". Columns using this domain must be altered first, or use CASCADE.`)
      )
      .addSql(DomainSQL.drop(schema, domainName))
      .addMarkdown('##### Drop with CASCADE (also drops dependent objects)')
      .addSql(DomainSQL.dropCascade(schema, domainName))
      .showTemp();
  } finally {
    release();
  }
}

export async function cmdShowDomainProperties(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  const { metadata, release } = await getDatabaseConnection(item);
  try {
    const schema = item.schema!;
    const domainName = item.label;
    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`Domain Properties: ${schema}.${domainName}`) +
        MarkdownUtils.infoBox('Shows base type, constraints, default value, and NOT NULL setting.')
      )
      .addSql(DomainSQL.getDefinition(schema, domainName))
      .showTemp();
  } finally {
    release();
  }
}
