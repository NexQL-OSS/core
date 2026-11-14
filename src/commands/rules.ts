import * as vscode from 'vscode';
import { DatabaseTreeItem } from '../providers/DatabaseTreeProvider';
import { getDatabaseConnection, NotebookBuilder, MarkdownUtils } from './helper';
import { RuleSQL } from './sql/rules';

export async function cmdListRules(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  const { metadata, release } = await getDatabaseConnection(item);
  try {
    const schema = item.schema!;
    const table = item.tableName || item.label;
    await new NotebookBuilder(metadata)
      .addMarkdown(MarkdownUtils.header(`⚙️ Rules on \`${schema}.${table}\``, 'Rules redirect or suppress SQL commands on a table or view.'))
      .addSql(RuleSQL.list(schema, table))
      .showTemp();
  } finally {
    release();
  }
}

export async function cmdDropRule(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  const ruleName = item.label;
  const confirm = await vscode.window.showWarningMessage(
    `Drop rule "${ruleName}"? This action cannot be undone.`,
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
        MarkdownUtils.header(`Drop Rule: ${ruleName}`) +
        MarkdownUtils.dangerBox(`Dropping rule "${ruleName}" from "${schema}"."${table}". This is permanent.`)
      )
      .addSql(RuleSQL.drop(schema, table, ruleName))
      .showTemp();
  } finally {
    release();
  }
}

export async function cmdShowRuleProperties(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  const { metadata, release } = await getDatabaseConnection(item);
  try {
    const schema = item.schema!;
    const table = item.tableName!;
    const ruleName = item.label;
    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`Rule Properties: ${ruleName}`) +
        MarkdownUtils.infoBox(`Rule definition on "${schema}"."${table}". Shows the command it handles and the INSTEAD or ALSO qualifier.`)
      )
      .addSql(RuleSQL.getDefinition(schema, table, ruleName))
      .showTemp();
  } finally {
    release();
  }
}

export async function cmdRuleOperations(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  const { metadata, release } = await getDatabaseConnection(item);
  try {
    const schema = item.schema!;
    const table = item.tableName!;
    const ruleName = item.label;
    await new NotebookBuilder(metadata)
      .addMarkdown(MarkdownUtils.header(`⚙️ Rule Operations: \`${ruleName}\``, 'Common rule actions are rendered below as notebook cells.'))
      .addMarkdown('##### Rule Definition')
      .addSql(RuleSQL.getDefinition(schema, table, ruleName))
      .addMarkdown('##### 🗑️ Drop Rule')
      .addSql(RuleSQL.drop(schema, table, ruleName))
      .addMarkdown('##### 🗑️ Drop Rule CASCADE')
      .addSql(RuleSQL.dropCascade(schema, table, ruleName))
      .showTemp();
  } finally {
    release();
  }
}
