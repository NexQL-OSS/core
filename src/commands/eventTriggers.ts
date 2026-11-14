import * as vscode from 'vscode';
import { DatabaseTreeItem } from '../providers/DatabaseTreeProvider';
import { getDatabaseConnection, NotebookBuilder, MarkdownUtils } from './helper';
import { EventTriggerSQL } from './sql/eventTriggers';

export async function cmdListEventTriggers(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  const { metadata, release } = await getDatabaseConnection(item);
  try {
    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header('Event Triggers') +
        MarkdownUtils.infoBox('Event triggers fire on DDL events (ddl_command_start, ddl_command_end, table_rewrite, sql_drop). Requires superuser to create.')
      )
      .addSql(EventTriggerSQL.list())
      .showTemp();
  } finally {
    release();
  }
}

export async function cmdCreateEventTrigger(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  const { metadata, release } = await getDatabaseConnection(item);
  try {
    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header('Create Event Trigger') +
        MarkdownUtils.warningBox('Creating event triggers requires superuser privileges. Event triggers fire on DDL operations.')
      )
      .addSql(EventTriggerSQL.create())
      .showTemp();
  } finally {
    release();
  }
}

export async function cmdDropEventTrigger(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  const triggerName = item.label;
  const confirm = await vscode.window.showWarningMessage(
    `Drop event trigger "${triggerName}"? This action cannot be undone.`,
    { modal: true },
    'Drop'
  );
  if (confirm !== 'Drop') { return; }
  const { metadata, release } = await getDatabaseConnection(item);
  try {
    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`Drop Event Trigger: ${triggerName}`) +
        MarkdownUtils.dangerBox(`Dropping event trigger "${triggerName}". This is permanent.`)
      )
      .addSql(EventTriggerSQL.drop(triggerName))
      .showTemp();
  } finally {
    release();
  }
}

export async function cmdEnableEventTrigger(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  const { metadata, release } = await getDatabaseConnection(item);
  try {
    const triggerName = item.label;
    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`Enable Event Trigger: ${triggerName}`) +
        MarkdownUtils.infoBox(`Enabling event trigger "${triggerName}".`)
      )
      .addSql(EventTriggerSQL.enable(triggerName))
      .showTemp();
  } finally {
    release();
  }
}

export async function cmdDisableEventTrigger(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  const { metadata, release } = await getDatabaseConnection(item);
  try {
    const triggerName = item.label;
    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`Disable Event Trigger: ${triggerName}`) +
        MarkdownUtils.warningBox(`Disabling event trigger "${triggerName}". DDL events will not fire this trigger until re-enabled.`)
      )
      .addSql(EventTriggerSQL.disable(triggerName))
      .showTemp();
  } finally {
    release();
  }
}

export async function cmdShowEventTriggerProperties(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  const { metadata, release } = await getDatabaseConnection(item);
  try {
    const triggerName = item.label;
    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`Event Trigger Properties: ${triggerName}`) +
        MarkdownUtils.infoBox('Shows event trigger details, function definition, and current status.')
      )
      .addSql(EventTriggerSQL.getDefinition(triggerName))
      .showTemp();
  } finally {
    release();
  }
}

export async function cmdEventTriggerOperations(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  const { metadata, release } = await getDatabaseConnection(item);
  try {
    const triggerName = item.label;
    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`Event Trigger Operations: ${triggerName}`) +
        MarkdownUtils.operationsTable([
          { operation: 'Properties', description: 'Show event trigger definition and status', riskLevel: 'Safe' },
          { operation: 'Enable', description: 'Enable the event trigger', riskLevel: 'Low' },
          { operation: 'Disable', description: 'Disable the event trigger', riskLevel: 'Low' },
          { operation: 'Drop', description: 'Permanently drop the event trigger', riskLevel: 'High' },
        ])
      )
      .addMarkdown('##### Event Trigger Definition')
      .addSql(EventTriggerSQL.getDefinition(triggerName))
      .addMarkdown('##### Enable')
      .addSql(EventTriggerSQL.enable(triggerName))
      .addMarkdown('##### Disable')
      .addSql(EventTriggerSQL.disable(triggerName))
      .addMarkdown('##### Drop — WARNING: permanently deletes the trigger')
      .addSql(EventTriggerSQL.drop(triggerName))
      .showTemp();
  } finally {
    release();
  }
}
