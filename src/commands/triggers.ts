import * as vscode from 'vscode';
import { DatabaseTreeItem } from '../providers/DatabaseTreeProvider';
import { getDatabaseConnection, NotebookBuilder, MarkdownUtils } from './helper';
import { TriggerSQL } from './sql/triggers';

export async function cmdListTriggers(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  const { client, metadata, release } = await getDatabaseConnection(item);
  try {
    const schema = item.schema!;
    const table = item.tableName || item.label;
    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`Triggers on ${schema}.${table}`) +
        MarkdownUtils.infoBox('Lists all triggers defined on this table. Triggers fire automatically on INSERT, UPDATE, or DELETE.')
      )
      .addSql(TriggerSQL.list(schema, table))
      .showTemp();
  } finally {
    release();
  }
}

export async function cmdCreateTrigger(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  const { metadata, release } = await getDatabaseConnection(item);
  try {
    const schema = item.schema!;
    const table = item.tableName || item.label;
    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`Create Trigger on ${schema}.${table}`) +
        MarkdownUtils.infoBox('Fill in the trigger name, timing (BEFORE/AFTER/INSTEAD OF), event, and function body.')
      )
      .addSql(TriggerSQL.create(schema, table))
      .showTemp();
  } finally {
    release();
  }
}

export async function cmdDropTrigger(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  const triggerName = item.label;
  const confirm = await vscode.window.showWarningMessage(
    `Drop trigger "${triggerName}"? This action cannot be undone.`,
    { modal: true },
    'Drop'
  );
  if (confirm !== 'Drop') { return; }
  const { metadata, release } = await getDatabaseConnection(item);
  try {
    const schema = item.schema!;
    const table = item.tableName!;
    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`Drop Trigger: ${triggerName}`) +
        MarkdownUtils.dangerBox(`Dropping trigger "${triggerName}" from "${schema}"."${table}". This is permanent.`)
      )
      .addSql(TriggerSQL.drop(schema, table, triggerName))
      .showTemp();
  } finally {
    release();
  }
}

export async function cmdEnableTrigger(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  const { metadata, release } = await getDatabaseConnection(item);
  try {
    const schema = item.schema!;
    const table = item.tableName!;
    const triggerName = item.label;
    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`Enable Trigger: ${triggerName}`) +
        MarkdownUtils.infoBox(`Enabling trigger "${triggerName}" on "${schema}"."${table}".`)
      )
      .addSql(TriggerSQL.enable(schema, table, triggerName))
      .showTemp();
  } finally {
    release();
  }
}

export async function cmdDisableTrigger(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  const { metadata, release } = await getDatabaseConnection(item);
  try {
    const schema = item.schema!;
    const table = item.tableName!;
    const triggerName = item.label;
    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`Disable Trigger: ${triggerName}`) +
        MarkdownUtils.warningBox(`Disabling trigger "${triggerName}" on "${schema}"."${table}". The trigger will not fire until re-enabled.`)
      )
      .addSql(TriggerSQL.disable(schema, table, triggerName))
      .showTemp();
  } finally {
    release();
  }
}

export async function cmdShowTriggerProperties(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  const { metadata, release } = await getDatabaseConnection(item);
  try {
    const schema = item.schema!;
    const table = item.tableName!;
    const triggerName = item.label;
    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`Trigger Properties: ${schema}.${table} → ${triggerName}`) +
        MarkdownUtils.infoBox('Detailed trigger definition and status.')
      )
      .addSql(TriggerSQL.getDefinition(schema, table, triggerName))
      .showTemp();
  } finally {
    release();
  }
}

export async function cmdTriggerOperations(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  const { metadata, release } = await getDatabaseConnection(item);
  try {
    const schema = item.schema!;
    const table = item.tableName!;
    const triggerName = item.label;
    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`Trigger Operations: ${triggerName}`) +
        MarkdownUtils.infoBox(`Common operations for trigger "${triggerName}" on "${schema}"."${table}".`) +
        MarkdownUtils.operationsTable([
          { operation: 'Definition', description: 'Show trigger definition', riskLevel: 'Safe' },
          { operation: 'Enable', description: 'Enable the trigger', riskLevel: 'Low' },
          { operation: 'Disable', description: 'Disable the trigger', riskLevel: 'Low' },
          { operation: 'Drop', description: 'Permanently drop the trigger', riskLevel: 'High' },
        ])
      )
      .addMarkdown('##### Trigger Definition')
      .addSql(TriggerSQL.getDefinition(schema, table, triggerName))
      .addMarkdown('##### Enable Trigger')
      .addSql(TriggerSQL.enable(schema, table, triggerName))
      .addMarkdown('##### Disable Trigger')
      .addSql(TriggerSQL.disable(schema, table, triggerName))
      .addMarkdown('##### Drop Trigger — WARNING: permanently deletes the trigger')
      .addSql(TriggerSQL.drop(schema, table, triggerName))
      .showTemp();
  } finally {
    release();
  }
}
